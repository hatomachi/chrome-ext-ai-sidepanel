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
  RemoteAttachmentItem,
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
  currentSessionId?: string;
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
    currentSessionId,
    onDelta,
    onStatusMessage,
    onTurnStart,
    onTurnEnd,
    onError,
    onSessionsList,
    onSessionMessages,
    onProjectsList,
  } = options;

  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;

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
  const retryCountRef = useRef(0);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const prevConfigRef = useRef({
    hubUrl: settings.hubUrl,
    authToken: settings.authToken,
    transportMode: settings.transportMode,
  });

  const callbacksRef = useRef({
    onDelta,
    onStatusMessage,
    onTurnStart,
    onTurnEnd,
    onError,
    onSessionsList,
    onSessionMessages,
    onProjectsList,
  });
  callbacksRef.current = {
    onDelta,
    onStatusMessage,
    onTurnStart,
    onTurnEnd,
    onError,
    onSessionsList,
    onSessionMessages,
    onProjectsList,
  };

  // Helper to send message to Agent via WebSocket or HTTP POST
  const sendMessage = useCallback((payload: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(payload));
        return true;
      } catch {}
    }
    return false;
  }, []);

  // Process messages coming from Hub/Agent
  const handleInboundMessage = useCallback((msg: InboundHubMessage) => {
    const cb = callbacksRef.current;
    switch (msg.type) {
      // Hub status broadcast
      case 'status': {
        const connected = Boolean(msg.agentConnected);
        setIsAgentConnected(connected);
        if (msg.hostname) setAgentHostname(msg.hostname);
        if (msg.cwd) setAgentCwd(msg.cwd);
        if (connected) {
          sendMessage({ type: 'get_status' });
          sendMessage({ type: 'list_projects' });
          sendMessage({ type: 'list_sessions' });
        }
        break;
      }

      // Agent direct status response
      case 'agent_status': {
        setIsAgentConnected(true);
        if (msg.hostname) setAgentHostname(msg.hostname);
        if (msg.cwd) setAgentCwd(msg.cwd);
        setIsExecuting(Boolean(msg.isBusy));
        sendMessage({ type: 'list_projects' });
        sendMessage({ type: 'list_sessions' });
        break;
      }

      case 'projects_list': {
        if (Array.isArray(msg.projects)) {
          setAvailableProjects(msg.projects);
          if (msg.baseDir) setProjectsBaseDir(msg.baseDir);
          cb.onProjectsList?.(msg.projects, msg.baseDir || '');
        }
        break;
      }

      case 'sessions_list': {
        if (Array.isArray(msg.sessions)) {
          cb.onSessionsList?.(msg.sessions);
        }
        break;
      }

      case 'session_messages': {
        if (msg.sessionId && Array.isArray(msg.messages)) {
          cb.onSessionMessages?.(msg.sessionId, msg.messages);
        }
        break;
      }

      case 'turn_start': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        setIsExecuting(true);
        if (isTargetSession) {
          cb.onTurnStart?.();
        } else {
          cb.onStatusMessage?.('（他セッションの処理を実行中...）');
        }
        break;
      }

      case 'turn_end':
      case 'execution_aborted': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        setIsExecuting(false);
        if (isTargetSession) {
          cb.onTurnEnd?.();
        }
        break;
      }

      case 'claude_event': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        if (!isTargetSession) {
          // 他セッションのストリーミングは現在のチャット画面に混入させない
          break;
        }

        const ev = msg.event;
        if (!ev) break;

        // 1) stream-json content_block_delta
        if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta') {
          const deltaText = ev.event.delta?.text || '';
          if (deltaText) {
            cb.onDelta?.(deltaText);
          }
        }
        // 2) Direct text_delta or message
        else if (ev.type === 'text_delta' && ev.text) {
          cb.onDelta?.(ev.text);
        } else if (ev.type === 'message' && typeof ev.content === 'string') {
          cb.onDelta?.(ev.content);
        }
        // 3) Assistant message blocks fallback
        else if (ev.type === 'assistant' && ev.message?.content) {
          const blocks = Array.isArray(ev.message.content) ? ev.message.content : [];
          for (const b of blocks) {
            if (b.type === 'tool_use') {
              cb.onStatusMessage?.(`ツール実行中: ${b.name}...`);
            }
          }
        }
        break;
      }

      case 'agent_event': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        if (!isTargetSession) break;

        if (msg.event?.type === 'output' && typeof msg.event.text === 'string') {
          cb.onDelta?.(msg.event.text);
        }
        break;
      }

      case 'tool_approval_request': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        if (!isTargetSession) break;
        cb.onStatusMessage?.(`承認要求: ${msg.toolName} (${msg.description || '許可が必要です'})`);
        break;
      }

      case 'turn_error':
      case 'error': {
        const isTargetSession = !msg.sessionId || !currentSessionIdRef.current || msg.sessionId === currentSessionIdRef.current;
        setIsExecuting(false);
        if (isTargetSession) {
          const errText = msg.error || msg.message || '不明なエラーが発生しました';
          cb.onError?.(errText);
        }
        break;
      }

      default:
        break;
    }
  }, [sendMessage]);

  // Cleanup active connections
  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch {}
      wsRef.current = null;
    }
    if (eventSourceRef.current) {
      try {
        eventSourceRef.current.onopen = null;
        eventSourceRef.current.onmessage = null;
        eventSourceRef.current.onerror = null;
        eventSourceRef.current.close();
      } catch {}
      eventSourceRef.current = null;
    }
    setIsHubConnected(false);
    setIsAgentConnected(false);
    setActiveTransport('none');
  }, []);

  // Connect via WebSocket
  const connectWs = useCallback(() => {
    cleanup();

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

      try {
        ws.send(JSON.stringify({ type: 'get_status' }));
        ws.send(JSON.stringify({ type: 'list_projects' }));
        ws.send(JSON.stringify({ type: 'list_sessions' }));
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

      const delay = calculateBackoffDelay(retryCountRef.current++);
      reconnectTimerRef.current = setTimeout(() => {
        connectWs();
      }, delay);
    };
  }, [cleanup, handleInboundMessage]);

  // Connect via HTTP SSE
  const connectHttp = useCallback(() => {
    cleanup();

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
  }, [cleanup, handleInboundMessage]);

  // Connect manager
  const connect = useCallback(() => {
    const mode = settingsRef.current.transportMode;
    if (mode === 'http') {
      connectHttp();
    } else {
      connectWs();
    }
  }, [connectWs, connectHttp]);

  // Initial connect on mount
  useEffect(() => {
    connect();
    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  // Re-connect only when relevant settings actually changed
  useEffect(() => {
    const prev = prevConfigRef.current;
    const curr = {
      hubUrl: settings.hubUrl,
      authToken: settings.authToken,
      transportMode: settings.transportMode,
    };

    const isChanged =
      prev.hubUrl !== curr.hubUrl ||
      prev.authToken !== curr.authToken ||
      prev.transportMode !== curr.transportMode;

    if (isChanged) {
      prevConfigRef.current = curr;
      retryCountRef.current = 0;
      connect();
    }
  }, [settings.hubUrl, settings.authToken, settings.transportMode, connect]);

  // Send prompt to Agent
  const sendPrompt = useCallback(async (params: {
    text: string;
    attachments?: ContextAttachment[];
    sessionId: string;
    isResume?: boolean;
    projectId?: string;
    cwd?: string;
  }) => {
    const { text, attachments, sessionId, isResume, projectId, cwd } = params;
    const fullText = composeFullPrompt(text, attachments);

    const currentEngine = settingsRef.current.engine;
    let effectiveModel: string | undefined = settingsRef.current.model;

    // Copilot CLI does not accept external model names (e.g. claude-*, gemini-*)
    // Omit model to let Copilot CLI pick its default optimal model
    if (currentEngine === 'copilot') {
      const trimmed = (effectiveModel || '').trim();
      const isExplicitCopilotModel = /^gpt-5/i.test(trimmed);
      if (!isExplicitCopilotModel) {
        effectiveModel = undefined;
      }
    }

    // Convert image attachments to RemoteAttachmentItem for Bridge Agent
    const remoteAttachments: RemoteAttachmentItem[] = [];
    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.imageDataUrl) {
          const isJpeg = att.imageDataUrl.startsWith('data:image/jpeg') || att.imageDataUrl.startsWith('data:image/jpg');
          const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
          const ext = isJpeg ? '.jpg' : '.png';
          const safeTitle = (att.title || 'screenshot')
            .replace(/[^\w\.\-\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/g, '_')
            .slice(0, 30);
          remoteAttachments.push({
            id: att.id,
            name: `${safeTitle}${ext}`,
            type: mimeType,
            data: att.imageDataUrl,
            size: Math.round((att.imageDataUrl.length * 3) / 4),
          });
        }
      }
    }

    const payload = {
      type: 'prompt',
      text: fullText,
      sessionId,
      isResume,
      projectId,
      cwd,
      model: effectiveModel,
      engine: currentEngine,
      attachments: remoteAttachments.length > 0 ? remoteAttachments : undefined,
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
      callbacksRef.current.onError?.(`送信エラー: ${(err as Error).message}`);
      return false;
    }
  }, [activeTransport]);

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
        wsRef.current.send(JSON.stringify({ type: 'list_projects' }));
        wsRef.current.send(JSON.stringify({ type: 'list_sessions' }));
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
