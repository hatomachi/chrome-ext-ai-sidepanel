import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Copy, Check, Search, FileText, Globe, Layers } from 'lucide-react';
import { ContextAttachment } from '../features/ai/aiRemoteTypes';

interface Props {
  isOpen: boolean;
  attachment: ContextAttachment | null;
  onClose: () => void;
}

export const ContextAttachmentModal: React.FC<Props> = ({
  isOpen,
  attachment,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset states on open/attachment change
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setSearchQuery('');
    }
  }, [isOpen, attachment?.id]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const rawContent = attachment?.contentMarkdown || '';

  // Stats
  const stats = useMemo(() => {
    const chars = rawContent.length;
    const lines = rawContent ? rawContent.split('\n').length : 0;
    const estimatedTokens = Math.ceil(chars / 3);
    return { chars, lines, estimatedTokens };
  }, [rawContent]);

  // Search match count
  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || !rawContent) return 0;
    const q = searchQuery.toLowerCase();
    let count = 0;
    let pos = 0;
    const lower = rawContent.toLowerCase();
    while ((pos = lower.indexOf(q, pos)) !== -1) {
      count++;
      pos += q.length;
    }
    return count;
  }, [rawContent, searchQuery]);

  const handleCopy = async () => {
    if (!rawContent) return;
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  if (!isOpen || !attachment) return null;

  // Render content with search highlight
  const renderHighlightedContent = () => {
    if (!searchQuery.trim()) {
      return (
        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-slate-200 select-text">
          {rawContent}
        </pre>
      );
    }

    const q = searchQuery.toLowerCase();
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const lower = rawContent.toLowerCase();
    let idx = lower.indexOf(q, lastIndex);
    let key = 0;

    while (idx !== -1) {
      if (idx > lastIndex) {
        parts.push(rawContent.slice(lastIndex, idx));
      }
      parts.push(
        <mark
          key={key++}
          className="bg-amber-400 text-slate-950 font-bold rounded-sm px-0.5"
        >
          {rawContent.slice(idx, idx + q.length)}
        </mark>
      );
      lastIndex = idx + q.length;
      idx = lower.indexOf(q, lastIndex);
    }

    if (lastIndex < rawContent.length) {
      parts.push(rawContent.slice(lastIndex));
    }

    return (
      <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-slate-200 select-text">
        {parts}
      </pre>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-3">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col w-full h-[90vh] max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-100 truncate">
                {attachment.title}
              </h3>
              {attachment.url && (
                <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                  <Globe className="w-3 h-3 shrink-0" />
                  {attachment.url}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors ml-2 shrink-0"
            title="閉じる (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toolbar: Stats & Search & Copy */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/90 text-xs text-slate-400 gap-2">
          {/* Stats Badges */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
              {stats.chars.toLocaleString()} 文字
            </span>
            <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300 font-mono">
              約 {stats.estimatedTokens.toLocaleString()} tokens
            </span>
            <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono hidden sm:inline">
              {stats.lines} 行
            </span>
            <span className="bg-indigo-950 border border-indigo-700/50 px-2 py-0.5 rounded text-indigo-300 text-[10px] flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" />
              {attachment.mode === 'readability' ? '本文抽出' : attachment.mode === 'selection' ? '選択範囲' : '生HTML'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search input */}
            <div className="relative flex items-center">
              <Search className="w-3 h-3 absolute left-2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="本文内検索..."
                className="pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-32 focus:w-44 transition-all"
              />
              {searchQuery && (
                <span className="text-[10px] ml-1 text-slate-400 font-mono shrink-0">
                  {matchCount}件
                </span>
              )}
            </div>

            {/* Copy button */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors shrink-0 ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Markdownテキストをコピー"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'コピー完了' : 'コピー'}
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto p-4 bg-slate-950 select-text"
        >
          {renderHighlightedContent()}
        </div>
      </div>
    </div>
  );
};
