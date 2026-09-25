import React from 'react';
import { Paperclip, X, Eye, RefreshCw, Pin, PinOff, Sparkles, Code, MousePointerClick } from 'lucide-react';
import { ContextAttachment, ExtractionMode } from '../features/ai/aiRemoteTypes';

interface Props {
  attachment: ContextAttachment | null;
  isPinned: boolean;
  isLoading: boolean;
  onRemove: () => void;
  onRefresh: () => void;
  onTogglePin: () => void;
  onOpenPreview: () => void;
  onChangeMode: (mode: ExtractionMode) => void;
}

export const ContextPillBar: React.FC<Props> = ({
  attachment,
  isPinned,
  isLoading,
  onRemove,
  onRefresh,
  onTogglePin,
  onOpenPreview,
  onChangeMode,
}) => {
  if (!attachment) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/60 border-t border-slate-800 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <Paperclip className="w-3 h-3 text-slate-500" />
          タブコンテキストなし
        </span>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium px-2 py-0.5 rounded hover:bg-slate-800/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          現在のタブを添付
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-1.5 text-xs">
      {/* Context Pill Chip */}
      <div className="flex items-center gap-1.5 bg-indigo-950/70 border border-indigo-700/60 rounded-lg px-2 py-1 max-w-[calc(100%-80px)]">
        <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span
          className="text-indigo-200 font-medium truncate cursor-pointer hover:underline text-[11px]"
          onClick={onOpenPreview}
          title={attachment.title}
        >
          {attachment.title}
        </span>
        {attachment.badge && (
          <span className="bg-indigo-900/80 text-indigo-300 text-[10px] px-1.5 py-0.2 rounded font-mono shrink-0">
            {attachment.badge}
          </span>
        )}

        {/* Preview button */}
        <button
          onClick={onOpenPreview}
          className="p-0.5 text-indigo-400 hover:text-indigo-200 hover:bg-indigo-800/50 rounded transition-colors shrink-0"
          title="添付コンテキストをプレビュー"
        >
          <Eye className="w-3 h-3" />
        </button>

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="p-0.5 text-indigo-400 hover:text-red-300 hover:bg-red-950/50 rounded transition-colors shrink-0"
          title="添付を解除"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Pill Actions: Mode switcher, Pin, Refresh */}
      <div className="flex items-center gap-1 text-[11px]">
        {/* Mode selector */}
        <select
          value={attachment.mode}
          onChange={(e) => onChangeMode(e.target.value as ExtractionMode)}
          className="bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          title="抽出モード切替"
        >
          <option value="readability">Markdown本文</option>
          <option value="selection">選択範囲</option>
          <option value="raw_html">生HTML</option>
        </select>

        {/* Pin toggle */}
        <button
          onClick={onTogglePin}
          className={`p-1 rounded transition-colors ${
            isPinned
              ? 'bg-amber-950/80 text-amber-400 border border-amber-700/60'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title={isPinned ? 'ピン留め中（別タブ移動時も保持）' : 'ピン留めして現在のタブコンテキストを固定'}
        >
          {isPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
        </button>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
          title="現在アクティブなタブから再取得"
        >
          <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
