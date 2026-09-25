import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Square,
  Sparkles,
  Settings,
  Plus,
  RefreshCw,
  Copy,
  Check,
  FolderGit2,
  Wifi,
  WifiOff,
  AlertCircle,
  HelpCircle,
  MessageSquare,
  Bot,
  User,
} from 'lucide-react';
import {
  AiRemoteSettings,
  DEFAULT_AI_REMOTE_SETTINGS,
  ContextAttachment,
  AiChatMessage,
  ProjectInfo,
  SessionInfo,
  AI_REMOTE_STORAGE_KEYS,
  ExtractionMode,
} from '../features/ai/aiRemoteTypes';
import { QUICK_PROMPTS, QuickPrompt } from '../features/ai/promptComposer';
import { useAiRemoteClient } from '../features/ai/useAiRemoteClient';
import {
  extractActiveTabRawData,
  buildContextAttachment,
  captureActiveTabScreenshot,
  buildScreenshotAttachment,
} from '../features/extractor/contentExtractor';
import { ContextPillBar } from '../components/ContextPillBar';
import { ContextAttachmentModal } from '../components/ContextAttachmentModal';
import { SettingsModal } from '../components/SettingsModal';

/**
 * RFC 4122 compliant UUID v4 generator
 * Claude Code CLI requires a valid UUID for --session-id
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function generateMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Sanitize chat messages for persistent storage:
 * - Strip huge rawHtml completely
 * - Discard multi-megabyte full-res imageDataUrl and keep lightweight compressed thumbnailUrl (~15KB)
 * - Truncate huge contentMarkdown to protect localStorage quota
 */
function sanitizeMessagesForStorage(msgs: AiChatMessage[]): AiChatMessage[] {
  return msgs.map((m) => {
    if (!m.attachments || m.attachments.length === 0) return m;

    const sanitizedAttachments: ContextAttachment[] = m.attachments.map((att) => {
      // 1. Remove rawHtml completely
      const { rawHtml, ...rest } = att;

      // 2. Keep lightweight thumbnailUrl, strip massive imageDataUrl from storage
      let finalThumb = rest.thumbnailUrl;
      if (!finalThumb && rest.imageDataUrl && rest.imageDataUrl.length < 50000) {
        finalThumb = rest.imageDataUrl;
      }

      // 3. Truncate super long markdown (> 12,000 chars) for storage efficiency
      let finalMd = rest.contentMarkdown;
      if (finalMd && finalMd.length > 12000) {
        finalMd = finalMd.slice(0, 8000) + '\n\n...[保存容量節約のため一部省略]';
      }

      return {
        ...rest,
        imageDataUrl: undefined, // Strip from storage
        thumbnailUrl: finalThumb,
        contentMarkdown: finalMd,
      };
    });

    return {
      ...m,
      attachments: sanitizedAttachments,
    };
  });
}

/**
 * Safely persist messages to localStorage & chrome.storage.local with QuotaExceededError protection and auto-cleanup
 */
function saveMessagesSafely(sessionId: string, msgs: AiChatMessage[]) {
  if (!sessionId) return;
  const key = `${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${sessionId}`;
  const sanitized = sanitizeMessagesForStorage(msgs);

  // Sync to chrome.storage.local (backed by unlimitedStorage permission)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [key]: sanitized }).catch(() => {});
  }

  // 1. First attempt: normal localStorage save
  try {
    localStorage.setItem(key, JSON.stringify(sanitized));
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, sessionId);
    return;
  } catch (err: any) {
    console.warn('[Storage] Quota exceeded on first attempt, attempting LRU cleanup:', err);
  }

  // 2. Second attempt: clean up older session messages from localStorage
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX) && k !== key) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
    console.log(`[Storage] Cleaned up ${keysToRemove.length} older sessions to free quota.`);

    localStorage.setItem(key, JSON.stringify(sanitized));
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, sessionId);
    return;
  } catch (err: any) {
    console.warn('[Storage] Quota still exceeded after cleanup, falling back to minimal metadata:', err);
  }

  // 3. Final fallback: strip all attachment contents, keep only lightweight metadata
  try {
    const minimal = sanitized.map((m) => ({
      ...m,
      attachments: m.attachments?.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        badge: a.badge,
        url: a.url,
        mode: a.mode,
        extractedAt: a.extractedAt,
        contentMarkdown: '',
      })),
    }));
    localStorage.setItem(key, JSON.stringify(minimal));
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, sessionId);
  } catch (finalErr) {
    console.error('[Storage] Critical: could not persist messages to localStorage:', finalErr);
  }
}

export const App: React.FC = () => {
  // --- 1. Settings State ---
  const [settings, setSettings] = useState<AiRemoteSettings>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.SETTINGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_AI_REMOTE_SETTINGS,
          ...parsed,
          authToken: parsed.authToken && parsed.authToken.trim() !== '' ? parsed.authToken : DEFAULT_AI_REMOTE_SETTINGS.authToken,
        };
      }
    } catch {}
    return DEFAULT_AI_REMOTE_SETTINGS;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- 2. Context Attachment State ---
  const [currentAttachment, setCurrentAttachment] = useState<ContextAttachment | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<ContextAttachment | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // --- 3. Chat & Session State ---
  // Ensure valid UUID for Claude Code CLI
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION);
      if (saved && isValidUUID(saved)) return saved;
    } catch {}
    const newUuid = generateUUID();
    try {
      localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, newUuid);
    } catch {}
    return newUuid;
  });

  const [sessions, setSessions] = useState<SessionInfo[]>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.SESSIONS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [projects, setProjects] = useState<ProjectInfo[]>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.PROJECTS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [currentProject, setCurrentProject] = useState<ProjectInfo | null>(() => {
    try {
      const saved = localStorage.getItem(AI_REMOTE_STORAGE_KEYS.LAST_PROJECT);
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(`${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${currentSessionId}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });

  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // Save settings when changed
  const handleSaveSettings = (newSettings: AiRemoteSettings) => {
    setSettings(newSettings);
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
  };

  // Save messages per session safely
  useEffect(() => {
    if (currentSessionId) {
      saveMessagesSafely(currentSessionId, messages);
    }
  }, [messages, currentSessionId]);

  // Clean up older session garbage on mount to prevent quota overflow
  useEffect(() => {
    try {
      const sessionKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX)) {
          sessionKeys.push(k);
        }
      }
      if (sessionKeys.length > 5) {
        const currentKey = `${AI_REMOTE_STORAGE_KEYS.MESSAGES_PREFIX}${currentSessionId}`;
        const toDelete = sessionKeys.filter((k) => k !== currentKey).slice(0, sessionKeys.length - 5);
        for (const k of toDelete) {
          localStorage.removeItem(k);
        }
      }
    } catch {}
  }, [currentSessionId]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, statusMessage]);

  // --- 4. Tab Context Extraction ---
  const fetchActiveTabContext = useCallback(async (mode?: ExtractionMode) => {
    setIsExtracting(true);
    try {
      const data = await extractActiveTabRawData();
      if (data) {
        const extractionMode = mode || settings.defaultExtractionMode;
        const attachment = buildContextAttachment(data, extractionMode);
        setCurrentAttachment(attachment);
      }
    } catch (err) {
      console.error('[App] Failed to extract tab context:', err);
    } finally {
      setIsExtracting(false);
    }
  }, [settings.defaultExtractionMode]);

  // Capture Screenshot of active tab
  const handleCaptureScreenshot = useCallback(async () => {
    setIsExtracting(true);
    setStatusMessage('スクリーンショット撮影中...');
    try {
      const res = await captureActiveTabScreenshot();
      if (res) {
        const attachment = buildScreenshotAttachment(
          res.dataUrl,
          res.width,
          res.height,
          res.title,
          res.url,
          res.thumbnailUrl
        );
        setCurrentAttachment(attachment);
        setStatusMessage(`📸 スクリーンショットを添付しました (${res.width}x${res.height})`);
        setTimeout(() => setStatusMessage(null), 2500);
      } else {
        setStatusMessage('⚠️ スクリーンショットの撮影に失敗しました');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } catch (err) {
      console.error('[App] Failed to capture screenshot:', err);
      setStatusMessage('⚠️ スクリーンショットの撮影エラー');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  // Initial tab fetch on mount if autoAttachTab is enabled
  useEffect(() => {
    if (settings.autoAttachTab && !currentAttachment) {
      fetchActiveTabContext();
    }
  }, [settings.autoAttachTab, fetchActiveTabContext]);

  // Tab switch listener (from background script)
  useEffect(() => {
    const handleRuntimeMessage = (msg: any) => {
      if ((msg.type === 'TAB_ACTIVATED' || msg.type === 'TAB_UPDATED') && !isPinned) {
        fetchActiveTabContext();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(handleRuntimeMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
      };
    }
  }, [isPinned, fetchActiveTabContext]);

  // --- 5. AI Remote Client Hook ---
  const {
    isHubConnected,
    isAgentConnected,
    agentHostname,
    agentCwd,
    availableProjects,
    isExecuting,
    activeTransport,
    sendPrompt,
    abortTurn,
    refreshStatus,
  } = useAiRemoteClient({
    settings,
    onDelta: (delta) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'assistant') {
          const updated = {
            ...last,
            isStreaming: true,
            text: (last.text || '') + delta,
            content: (last.content || '') + delta,
          };
          return [...prev.slice(0, -1), updated];
        }
        return prev;
      });
    },
    onStatusMessage: (msg) => {
      setStatusMessage(msg);
    },
    onTurnStart: () => {
      setStatusMessage('AI思考中...');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming) return prev;
        return [
          ...prev,
          {
            id: generateMsgId(),
            role: 'assistant',
            text: '',
            content: '',
            isStreaming: true,
            timestamp: Date.now(),
            sessionId: currentSessionId,
            engine: settings.engine,
          },
        ];
      });
    },
    onTurnEnd: () => {
      setStatusMessage(null);
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, isStreaming: false }];
        }
        return prev;
      });
    },
    onError: (err) => {
      setStatusMessage(null);
      setMessages((prev) => [
        ...prev,
        {
          id: generateMsgId(),
          role: 'assistant',
          text: `⚠️ エラー: ${err}`,
          content: err,
          isError: true,
          timestamp: Date.now(),
          sessionId: currentSessionId,
        },
      ]);
    },
    onProjectsList: (projs) => {
      setProjects(projs);
      localStorage.setItem(AI_REMOTE_STORAGE_KEYS.PROJECTS, JSON.stringify(projs));
      if (!currentProject && projs.length > 0) {
        const pv = projs.find((p) => p.name.includes('personal-vault') || p.path.includes('personal-vault'));
        setCurrentProject(pv || projs[0]);
      }
    },
    onSessionsList: (sess) => {
      setSessions(sess);
      localStorage.setItem(AI_REMOTE_STORAGE_KEYS.SESSIONS, JSON.stringify(sess));
    },
  });

  // Switch mode
  const handleChangeMode = (mode: ExtractionMode) => {
    if (mode === 'screenshot') {
      handleCaptureScreenshot();
    } else {
      fetchActiveTabContext(mode);
    }
  };

  // Submit prompt
  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputText;
    if (!textToSend.trim() || isExecuting) return;

    const userMsg: AiChatMessage = {
      id: generateMsgId(),
      role: 'user',
      text: textToSend,
      content: textToSend,
      attachments: currentAttachment ? [currentAttachment] : undefined,
      timestamp: Date.now(),
      sessionId: currentSessionId,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');

    const isResume = messages.length > 0;

    await sendPrompt({
      text: textToSend,
      attachments: currentAttachment ? [currentAttachment] : undefined,
      sessionId: currentSessionId,
      isResume,
      projectId: currentProject?.id,
      cwd: currentProject?.path || agentCwd,
    });
  };

  // Quick prompt handler
  const handleQuickPrompt = (qp: QuickPrompt) => {
    handleSend(qp.prompt);
  };

  // New session
  const handleNewSession = () => {
    const newUuid = generateUUID();
    setCurrentSessionId(newUuid);
    setMessages([]);
    localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_SESSION, newUuid);
  };

  // Copy message text
  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 select-none font-sans">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow">
            AI
          </div>
          <div>
            <h1 className="text-xs font-semibold tracking-wide text-slate-200">
              AI Sidepanel
            </h1>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  isAgentConnected ? 'bg-emerald-400' : isHubConnected ? 'bg-amber-400' : 'bg-red-500'
                }`}
              />
              <span className="text-slate-400 font-mono">
                {isAgentConnected ? 'Agent接続中' : isHubConnected ? 'Hub接続中' : '未接続'}
              </span>
              {agentHostname && (
                <span className="text-slate-500 truncate max-w-[80px]">
                  ({agentHostname})
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* New chat */}
          <button
            onClick={handleNewSession}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="新規チャット開始 (UUID再発行)"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Refresh connection */}
          <button
            onClick={refreshStatus}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="接続状態の再確認"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {/* Settings */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            title="設定"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Project / Directory Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900/60 border-b border-slate-800 text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderGit2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-slate-400 shrink-0">Vault/Dir:</span>
          {projects.length > 0 ? (
            <select
              value={currentProject?.id || ''}
              onChange={(e) => {
                const found = projects.find((p) => p.id === e.target.value);
                if (found) {
                  setCurrentProject(found);
                  localStorage.setItem(AI_REMOTE_STORAGE_KEYS.LAST_PROJECT, JSON.stringify(found));
                }
              }}
              className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[11px] truncate max-w-[150px] focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-slate-400 font-mono text-[10px] truncate max-w-[150px]">
              {agentCwd || '未指定'}
            </span>
          )}
        </div>

        {/* Engine switcher toggle */}
        <div className="flex items-center gap-1">
          <select
            value={settings.engine}
            onChange={(e) => {
              const newEngine = e.target.value as 'claude' | 'copilot';
              const newModel = newEngine === 'copilot' ? 'auto' : 'claude-sonnet-4-6';
              const newSettings = { ...settings, engine: newEngine, model: newModel };
              handleSaveSettings(newSettings);
            }}
            className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-slate-200 text-[10px] focus:outline-none focus:border-indigo-500 cursor-pointer font-mono"
            title="AIエンジンの切り替え"
          >
            <option value="claude">Claude</option>
            <option value="copilot">Copilot</option>
          </select>
        </div>
      </div>

      {/* Status banner */}
      {statusMessage && (
        <div className="bg-indigo-950/80 border-b border-indigo-800 px-3 py-1 text-[11px] text-indigo-200 flex items-center gap-1.5 animate-in fade-in">
          <Sparkles className="w-3 h-3 text-indigo-400 animate-spin" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 3. Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 select-text text-xs leading-relaxed">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-400 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                ブラウザ連携 AI アシスタント
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                閲覧中のタブの本文や選択テキストをワンタップで添付し、社内PCのClaude Code/Copilotと対話できます。
              </p>
            </div>

            {/* Quick action buttons on empty state */}
            <div className="w-full max-w-xs pt-2 space-y-1.5 text-left">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                クイックアクション
              </div>
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.id}
                  onClick={() => handleQuickPrompt(qp)}
                  className="w-full flex items-center gap-2 p-2 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 rounded-lg text-slate-200 text-left transition-colors group"
                >
                  <span className="text-sm">{qp.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[11px] text-slate-200 group-hover:text-indigo-300">
                      {qp.label}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {qp.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${
                m.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[92%] rounded-xl p-3 select-text ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : m.isError
                    ? 'bg-red-950/70 border border-red-800/80 text-red-200'
                    : 'bg-slate-900 border border-slate-800 text-slate-200'
                }`}
              >
                {/* Header for role */}
                <div className="flex items-center justify-between gap-2 mb-1 opacity-70 text-[10px]">
                  <span className="flex items-center gap-1 font-semibold">
                    {m.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    {m.role === 'user' ? 'あなた' : 'AI'}
                  </span>
                  <button
                    onClick={() => handleCopyMessage(m.id, m.text)}
                    className="hover:opacity-100 p-0.5 rounded transition-opacity"
                    title="本文をコピー"
                  >
                    {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>

                {/* Attached chip preview in user message */}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 pb-2 border-b border-indigo-400/30 flex flex-wrap gap-1.5">
                    {m.attachments.map((att) => {
                      const isImg = att.type === 'screenshot' || Boolean(att.imageDataUrl);
                      return (
                        <span
                          key={att.id}
                          onClick={() => {
                            setPreviewAttachment(att);
                            setIsPreviewOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-700/70 hover:bg-indigo-600/80 rounded-md text-[10px] font-mono text-indigo-100 cursor-pointer transition-colors shadow-sm"
                          title="クリックして添付内容を拡大プレビュー"
                        >
                          {isImg && (att.thumbnailUrl || att.imageDataUrl) ? (
                            <img
                              src={att.thumbnailUrl || att.imageDataUrl}
                              alt="thumb"
                              className="w-3.5 h-3.5 object-cover rounded border border-indigo-300/40 shrink-0"
                            />
                          ) : (
                            <span className="shrink-0">{isImg ? '📸' : '📎'}</span>
                          )}
                          <span className="truncate max-w-[120px]">{att.title}</span>
                          {att.badge && (
                            <span className="text-[9px] opacity-75 shrink-0">
                              ({att.badge})
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Message body */}
                <div className="whitespace-pre-wrap break-words leading-relaxed text-[12px] font-normal">
                  {m.text}
                  {m.isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse align-middle" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Quick Prompts Mini Bar (When messages exist) */}
      {messages.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 bg-slate-900/40 border-t border-slate-800/60 overflow-x-auto no-scrollbar text-[10px]">
          {QUICK_PROMPTS.map((qp) => (
            <button
              key={qp.id}
              onClick={() => handleQuickPrompt(qp)}
              disabled={isExecuting}
              className="flex items-center gap-1 px-2 py-0.5 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded text-slate-300 shrink-0 transition-colors disabled:opacity-50"
            >
              <span>{qp.icon}</span>
              <span>{qp.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 5. Context Pill Bar */}
      <ContextPillBar
        attachment={currentAttachment}
        isPinned={isPinned}
        isLoading={isExtracting}
        onRemove={() => setCurrentAttachment(null)}
        onRefresh={() => fetchActiveTabContext()}
        onCaptureScreenshot={handleCaptureScreenshot}
        onTogglePin={() => setIsPinned(!isPinned)}
        onOpenPreview={() => {
          setPreviewAttachment(null);
          setIsPreviewOpen(true);
        }}
        onChangeMode={handleChangeMode}
      />

      {/* 6. Input Area */}
      <div className="p-2.5 bg-slate-900 border-t border-slate-800">
        <div className="relative flex items-end gap-1.5 bg-slate-950 border border-slate-800 rounded-xl p-1.5 focus-within:border-indigo-500 transition-colors">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onCompositionStart={() => { isComposingRef.current = true; }}
            onCompositionEnd={() => { isComposingRef.current = false; }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isComposingRef.current) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="AIに指示を送信... (Shift+Enterで改行)"
            rows={2}
            className="flex-1 bg-transparent text-xs text-slate-100 placeholder-slate-500 p-1 resize-none focus:outline-none leading-relaxed select-text"
          />

          {isExecuting ? (
            <button
              onClick={() => abortTurn(currentSessionId)}
              className="p-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shrink-0"
              title="生成を中断"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!inputText.trim()}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 text-white rounded-lg transition-colors shrink-0"
              title="送信 (Enter)"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 7. Modals */}
      <ContextAttachmentModal
        isOpen={isPreviewOpen}
        attachment={previewAttachment || currentAttachment}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewAttachment(null);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};
