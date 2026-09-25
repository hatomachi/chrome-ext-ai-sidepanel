/**
 * AI Remote Protocol & Context Attachment Types
 * Compatible with webapp-ai-remote Hub & Agent specifications.
 */

export type AIEngine = 'claude' | 'copilot';
export type TransportMode = 'auto' | 'ws' | 'http';
export type ActiveTransport = 'none' | 'ws' | 'http';
export type ExtractionMode = 'readability' | 'selection' | 'raw_html';

export interface AiRemoteSettings {
  hubUrl: string;
  authToken: string;
  engine: AIEngine;
  model: string;
  transportMode: TransportMode;
  autoAttachTab: boolean;
  defaultExtractionMode: ExtractionMode;
}

export const DEFAULT_AI_REMOTE_SETTINGS: AiRemoteSettings = {
  hubUrl: 'ws://localhost:8090/ws/client',
  authToken: 'dev-secret-token',
  engine: 'claude',
  model: 'claude-opus-4-7',
  transportMode: 'auto',
  autoAttachTab: true,
  defaultExtractionMode: 'readability',
};

/**
 * Context Attachment representing the browser tab or selection attached to a prompt
 */
export interface ContextAttachment {
  id: string;
  type: 'tab_page' | 'selection' | 'raw_html' | 'custom';
  title: string;          // e.g. "社内Wiki: 開発ガイドライン"
  url?: string;
  badge?: string;          // e.g. "1.2万字" or "Readability"
  subtitle?: string;       // e.g. "https://internal.wiki/doc/123"
  contentMarkdown: string; // The formatted Markdown or text injected to prompt
  rawHtml?: string;
  extractedAt: number;
  mode: ExtractionMode;
}

/**
 * Project Info compatible with webapp-ai-remote
 */
export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  isGit?: boolean;
}

/**
 * Session Info compatible with webapp-ai-remote
 */
export interface SessionInfo {
  id: string;
  title: string;
  cwd: string;
  projectId?: string;
  engine?: AIEngine;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * Storage Keys for settings, projects, sessions, messages
 */
export const AI_REMOTE_STORAGE_KEYS = {
  SETTINGS: 'ai_sidepanel_settings_v1',
  SESSIONS: 'ai_sidepanel_sessions_v1',
  PROJECTS: 'ai_sidepanel_projects_v1',
  MESSAGES_PREFIX: 'ai_sidepanel_msgs_',
  LAST_PROJECT: 'ai_sidepanel_last_project_v1',
  LAST_SESSION: 'ai_sidepanel_last_session_v1',
} as const;

/**
 * Chat message within the Sidepanel
 */
export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  content?: string;
  attachments?: ContextAttachment[];
  isStreaming?: boolean;
  isError?: boolean;
  timestamp: number | string;
  sessionId?: string;
  engine?: AIEngine;
}

/**
 * Messages exchanged with webapp-ai-remote Hub
 */
export interface InboundHubMessage {
  type: string;
  [key: string]: any;
}
