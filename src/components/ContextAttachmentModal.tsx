import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Copy,
  Check,
  Search,
  FileText,
  Globe,
  Layers,
  Camera,
  AlertTriangle,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
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
  const [isZoomed, setIsZoomed] = useState(false);
  const [activeTab, setActiveTab] = useState<'image' | 'text'>('image');
  const contentRef = useRef<HTMLDivElement>(null);

  const isScreenshot = attachment?.mode === 'screenshot' || Boolean(attachment?.imageDataUrl);
  const hasWarning = attachment?.warningLevel && attachment.warningLevel !== 'none';

  // Reset states on open/attachment change
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setSearchQuery('');
      setIsZoomed(false);
      setActiveTab(isScreenshot ? 'image' : 'text');
    }
  }, [isOpen, attachment?.id, isScreenshot]);

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

  const handleOpenImageNewTab = () => {
    if (!attachment?.imageDataUrl) return;
    const w = window.open('');
    if (w) {
      w.document.write(`<title>${attachment.title}</title><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;height:100vh;"><img src="${attachment.imageDataUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" /></body>`);
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
            {isScreenshot ? (
              <Camera className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
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

        {/* Warning Alert Banner (if large or raw HTML) */}
        {hasWarning && (
          <div className="px-4 py-2 bg-amber-950/90 border-b border-amber-800/80 text-amber-200 flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex-1 leading-tight text-[11px]">
              <span className="font-semibold text-amber-300">
                文字数警告: {stats.chars.toLocaleString()} 文字 (約 {stats.estimatedTokens.toLocaleString()} tokens)
              </span>
              <span className="ml-1 text-amber-200/80">
                {attachment.mode === 'raw_html'
                  ? '生HTMLはサイズが非常に大きくなりやすいため、スクレイピング以外の用途では「Markdown本文」の利用を強く推奨します。'
                  : 'AIモデルのコンテキスト制限やレスポンス遅延にご注意ください。'}
              </span>
            </div>
          </div>
        )}

        {/* Screenshot View Tabs (If image attachment) */}
        {isScreenshot && (
          <div className="flex items-center px-4 py-1.5 bg-slate-950/80 border-b border-slate-800 gap-2 text-xs">
            <button
              onClick={() => setActiveTab('image')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'image'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              スクショ画像
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`px-2.5 py-1 rounded font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'text'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              プロンプト指示テキスト
            </button>
          </div>
        )}

        {/* Toolbar: Stats & Search & Actions */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/90 text-xs text-slate-400 gap-2">
          {/* Stats Badges */}
          <div className="flex items-center gap-2 text-[11px]">
            {isScreenshot && attachment.imageDimensions ? (
              <span className="bg-indigo-950 border border-indigo-700/60 px-2 py-0.5 rounded text-indigo-300 font-mono font-medium">
                {attachment.imageDimensions.width} × {attachment.imageDimensions.height} px
              </span>
            ) : (
              <>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono">
                  {stats.chars.toLocaleString()} 文字
                </span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300 font-mono">
                  約 {stats.estimatedTokens.toLocaleString()} tokens
                </span>
                <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-mono hidden sm:inline">
                  {stats.lines} 行
                </span>
              </>
            )}
            <span className="bg-slate-800 border border-slate-700/50 px-2 py-0.5 rounded text-slate-300 text-[10px] flex items-center gap-1">
              <Layers className="w-2.5 h-2.5" />
              {attachment.mode === 'readability'
                ? '本文抽出'
                : attachment.mode === 'selection'
                ? '選択範囲'
                : attachment.mode === 'raw_html'
                ? '生HTML'
                : '画面スクショ'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search input (when in text view) */}
            {(!isScreenshot || activeTab === 'text') && (
              <div className="relative flex items-center">
                <Search className="w-3 h-3 absolute left-2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="検索..."
                  className="pl-7 pr-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-28 focus:w-40 transition-all"
                />
                {searchQuery && (
                  <span className="text-[10px] ml-1 text-slate-400 font-mono shrink-0">
                    {matchCount}件
                  </span>
                )}
              </div>
            )}

            {/* Image zoom & open actions */}
            {isScreenshot && activeTab === 'image' && (
              <>
                <button
                  onClick={() => setIsZoomed(!isZoomed)}
                  className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs transition-colors"
                  title={isZoomed ? 'ウィンドウにフィット' : '原寸大で表示'}
                >
                  {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                  <span>{isZoomed ? 'フィット' : '原寸大'}</span>
                </button>
                <button
                  onClick={handleOpenImageNewTab}
                  className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                  title="画像を別タブで全画面表示"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </>
            )}

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
          {isScreenshot && activeTab === 'image' && attachment.imageDataUrl ? (
            <div className="flex flex-col items-center justify-center min-h-full">
              <div
                className={`overflow-auto transition-all ${
                  isZoomed ? 'w-full' : 'max-h-[65vh] flex items-center justify-center'
                }`}
              >
                <img
                  src={attachment.imageDataUrl}
                  alt={attachment.title}
                  onClick={() => setIsZoomed(!isZoomed)}
                  className={`rounded-lg border border-slate-800 shadow-md cursor-zoom-in transition-all ${
                    isZoomed ? 'max-w-none' : 'max-h-[65vh] max-w-full object-contain'
                  }`}
                  title="クリックで拡大/フィット切り替え"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-2 text-center">
                ※ 画像をクリックすると原寸大/フィット表示を切り替えられます
              </p>
            </div>
          ) : (
            renderHighlightedContent()
          )}
        </div>
      </div>
    </div>
  );
};
