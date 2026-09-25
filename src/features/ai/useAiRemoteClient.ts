/**
 * AI Remote Client Hook for chrome-ext-ai-sidepanel
 * 
 * Connects to webapp-ai-remote Relay Hub (WSS or SSE+POST fallback)
 * to converse with the PC-resident Bridge Agent (Claude Code / Copilot CLI).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  AiRemoteSettings,
  ActiveTransport,
  ContextAttachment,
  ProjectInfo,
  SessionInfo,
  InboundHubMessage,
} from './aiRemoteTypes';
import { composeFullPrompt } from './promptComposer';

export function deriveHttpUrls(hubWsUrl: string, authToken: string) {
  try {
    let rawUrl = hubWsUrl.trim();
    if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('ws://') && !rawUrl.startsWith('wss://')) {
      rawUrl = `http://${rawUrl}`;
    }

    const parsed = new URL(rawUrl);
    parsed.protocol = (parsed.protocol === 'wss:' || parsed.protocol === 'https:') ? 'https:' : 'http:';

    let basePath = parsed.pathname;
    if (basePath.endsWith('/ws/client')) {
      basePath = basePath.substring(0, basePath.length - '/ws/client'.length);
    }
    if (basePath.endsWith('/')) {
      basePath = basePath.substring(0, basePath.length - 1);
    }

    const eventsUrl = new URL(parsed.toString());
    eventsUrl.pathname = `${basePath}/events`;
    if (authToken) eventsUrl.searchParams.set('token', authToken);

    const messageUrl = new URL(parsed.toString());
    messageUrl.pathname = `${basePath}/message`;
    if (authToken) messageUrl.searchParams.set('token', authToken);

    return {
      eventsUrl: eventsUrl.toString(),
      messageUrl: messageUrl.toString(),
    };
  } catch {
    const base = 'http://localhost:8090';
    const tokenQuery = authToken ? `?token=${encodeURIComponent(authToken)}` : '';
    return {
      eventsUrl: `${base}/events${tokenQuery}`,
      messageUrl: `${base}/message${tokenQuery}`,
    };
  }
}

export function deriveWsUrl(hubUrl: string, authToken: string): string {
  try {
    let wsUrlStr = hubUrl.trim();
    if (wsUrlStr.startsWith('http://')) {
      wsUrlStr = 'ws://' + wsUrlStr.slice('http://'.length);
    } else if (wsUrlStr.startsWith('https://')) {
      wsUrlStr = 'wss://' + wsUrlStr.slice('https://'.length);
    } else if (!wsUrlStr.startsWith('ws://') && !wsUrlStr.startsWith('wss://')) {
      wsUrlStr = `ws://${wsUrlStr}`;
    }

    const parsed = new URL(wsUrlStr);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/ws/client';
    }
    if (authToken) {
      parsed.searchParams.set('token', authToken);
    }
    return parsed.toString();
  } catch {
    return hubUrl;
  }
}

// Exponential backoff configuration
const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_BACKOFF_FACTOR = 1.5;
const RECONNECT_JITTER_RATIO = 0.2;

function calculateBackoffDelay(retryCount: number): number {
  const exponential = RECONNECT_BASE_DELAY_MS * Math.pow(RECONNECT_BACKOFF_FACTOR, retryCount);
  const capped = Math.min(exponential, RECONNECT_MAX_DELAY_MS);
  const jitter = capped * RECONNECT_JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(RECONNECT_BASE_DELAY_MS, Math.round(capped + jitter));
}

export interface UseAiRemoteClientOptions {
  settings: AiRemoteSettings;
  onDelta?: (text: string) => void;
  onStatusMessage?: (message: string) => void;
  onTurnStart?: () => void;
  onTurnEnd?: () => void;
  onError?: (error: string) => void;
  onSessionsList?: (sessions: SessionInfo[]) => void;
  onSessionMessages?: (sessionId: string, messages: any[]) => void;
  onProjectsList?: (projects: ProjectInfo[], baseDir: string) => void;
}

export function useAiRemoteClient(options: UseAiRemoteClientOptions) {
  const {
    settings,
    onDelta,
    onStatusMessage,
    onTurnStart,
    onTurnEnd,
    onError,
    onSessionsList,
    onSessionMessages,
    onProjectsList,
  } = options;

  const [isHubConnected, setIsHubConnected] = useState(false);
  const [isAgentConnected, setIsAgentConnected] = useState(false);
  const [agentHostname, setAgentHostname] = useState('');
  const [agentCwd, setAgentCwd] = useState('');
  const [availableProjects, setAvailableProjects] = useState<ProjectInfo[]>([]);
  const [projectsBaseDir, setProjectsBaseDir] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeTransport, setActiveTransport] = useState<ActiveTransport>('none');

  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Process messages coming from Hub/Agent
  const handleInboundMessage = useCallback((msg: InboundHubMessage) => {
    switch (msg.type) {
      case 'status': {
        const connected = Boolean(msg.agentConnected);
        setIsAgentConnected(connected);
        if (msg.hostname) setAgentHostname(msg.hostname);
        if (msg.cwd) setAgentCwd(msg.cwd);
        break;
      }

      case 'projects_list': {
        if (Array.isArray(msg.projects)) {
          setAvailableProjects(msg.projects);
          if (msg.baseDir) setProjectsBaseDir(msg.baseDir);
          onProjectsList?.(msg.projects, msg.baseDir || '');
        }
        break;
      }

      case 'sessions_list': {
        if (Array.isArray(msg.sessions)) {
          onSessionsList?.(msg.sessions);
        }
        break;
      }

      case 'session_messages': {
        if (msg.sessionId && Array.isArray(msg.messages)) {
          onSessionMessages?.(msg.sessionId, msg.messages);
        }
        break;
      }

      case 'turn_start': {
        setIsExecuting(true);
        onTurnStart?.();
        break;
      }

      case 'turn_end': {
        setIsExecuting(false);
        onTurnEnd?.();
        break;
      }

      case 'claude_event': {
        const ev = msg.event;
        if (!ev) break;

        // Claude Code streaming delta
        if (ev.type === 'content_block_delta' && ev.delta?.text) {
          onDelta?.(ev.delta.text);
        } else if (ev.type === 'text_delta' && ev.text) {
          onDelta?.(ev.text);
        } else if (ev.type === 'message' && typeof ev.content === 'string') {
          onDelta?.(ev.content);
        } else if (ev.type === 'user_feedback_request') {
          onStatusMessage?.(`確認要求: ${ev.message || '承認してください'}`);
        }
        break;
      }

      case 'agent_event': {
        if (msg.event?.type === 'output' && typeof msg.event.text === 'string') {
          onDelta?.(msg.event.text);
        }
        break;
      }

      case 'error': {
        setIsExecuting(false);
        const errText = msg.message || '不明なエラーが発生しました';
        onError?.(errText);
        break;
      }

      default:
        break;
    }
  }, [onDelta, onStatusMessage, onTurnStart, onTurnEnd, onError, onProjectsList, onSessionsList, onSessionMessages]);

  // Connect via WebSocket
  const connectWs = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }

    const wsUrl = deriveWsUrl(settingsRef.current.hubUrl, settingsRef.current.authToken);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
    } catch (e) {
      console.error('[AI Remote] WebSocket construct error:', e);
      return;
    }

    ws.onopen = () => {
      retryCountRef.current = 0;
      setIsHubConnected(true);
      setActiveTransport('ws');

      // Request initial status and projects
      try {
        ws.send(JSON.stringify({ type: 'get_status' }));
        ws.send(JSON.stringify({ type: 'get_projects' }));
        ws.send(JSON.stringify({ type: 'get_sessions' }));
      } catch {}
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleInboundMessage(msg);
      } catch (err) {
        console.error('[AI Remote] Failed to parse WS message:', err);
      }
    };

    ws.onerror = (e) => {
      console.warn('[AI Remote] WebSocket error:', e);
    };

    ws.onclose = () => {
      setIsHubConnected(false);
      setIsAgentConnected(false);
      setActiveTransport('none');
      wsRef.current = null;

      // Schedule reconnect
      const delay = calculateBackoffDelay(retryCountRef.current++);
      reconnectTimerRef.current = setTimeout(() => {
        connectWs();
      }, delay);
    };
  }, [handleInboundMessage]);

  // Connect via HTTP SSE + POST fallback
  const connectHttp = useCallback(() => {
    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch {}
      eventSourceRef.current = null;
    }

    const { eventsUrl } = deriveHttpUrls(settingsRef.current.hubUrl, settingsRef.current.authToken);
    const es = new EventSource(eventsUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsHubConnected(true);
      setActiveTransport('http');
      retryCountRef.current = 0;
    };

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleInboundMessage(msg);
      } catch (err) {
        console.error('[AI Remote] Failed to parse SSE message:', err);
      }
    };

    es.onerror = () => {
      setIsHubConnected(false);
      setIsAgentConnected(false);
      setActiveTransport('none');
      es.close();
      eventSourceRef.current = null;

      const delay = calculateBackoffDelay(retryCountRef.current++);
      reconnectTimerRef.current = setTimeout(() => {
        connectHttp();
      }, delay);
    };
  }, [handleInboundMessage]);

  // Connection manager based on transport mode
  const connect = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    const mode = settingsRef.current.transportMode;
    if (mode === 'http') {
      connectHttp();
    } else {
      connectWs();
    }
  }, [connectWs, connectHttp]);

  // Connect on mount or when settings change
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch {}
        wsRef.current = null;
      }
      if (eventSourceRef.current) {
        try { eventSourceRef.current.close(); } catch {}
        eventSourceRef.current = null;
      }
    };
  }, [settings.hubUrl, settings.authToken, settings.transportMode, connect]);

  // Send prompt to Agent
  const sendPrompt = useCallback(async (params: {
    text: string;
    attachments?: ContextAttachment[];
    sessionId?: string;
    projectId?: string;
    cwd?: string;
  }) => {
    const { text, attachments, sessionId, projectId, cwd } = params;
    const fullText = composeFullPrompt(text, attachments);

    const payload = {
      type: 'prompt',
      text: fullText,
      sessionId,
      projectId,
      cwd,
      model: settingsRef.current.model,
      engine: settingsRef.current.engine,
    };

    if (activeTransport === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }

    // HTTP POST fallback
    const { messageUrl } = deriveHttpUrls(settingsRef.current.hubUrl, settingsRef.current.authToken);
    try {
      const res = await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch (err) {
      console.error('[AI Remote] Failed to send prompt via HTTP:', err);
      onError?.(`送信エラー: ${(err as Error).message}`);
      return false;
    }
  }, [activeTransport, onError]);

  // Abort execution
  const abortTurn = useCallback(async (sessionId?: string) => {
    const payload = { type: 'abort', sessionId };
    if (activeTransport === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return;
    }

    const { messageUrl } = deriveHttpUrls(settingsRef.current.hubUrl, settingsRef.current.authToken);
    try {
      await fetch(messageUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.error('[AI Remote] Failed to abort:', err);
    }
  }, [activeTransport]);

  // Refresh status, projects, sessions
  const refreshStatus = useCallback(() => {
    if (activeTransport === 'ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'get_status' }));
        wsRef.current.send(JSON.stringify({ type: 'get_projects' }));
        wsRef.current.send(JSON.stringify({ type: 'get_sessions' }));
      } catch {}
    }
  }, [activeTransport]);

  return {
    isHubConnected,
    isAgentConnected,
    agentHostname,
    agentCwd,
    availableProjects,
    projectsBaseDir,
    isExecuting,
    activeTransport,
    sendPrompt,
    abortTurn,
    refreshStatus,
  };
}
