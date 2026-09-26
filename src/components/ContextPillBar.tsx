import React from 'react';
import { Paperclip, X, Eye, RefreshCw, Pin, PinOff, Camera, AlertTriangle, Bot } from 'lucide-react';
import { ContextAttachment, ExtractionMode } from '../features/ai/aiRemoteTypes';

interface Props {
  attachment: ContextAttachment | null;
  isPinned: boolean;
  isLoading: boolean;
  onRemove: () => void;
  onRefresh: () => void;
  onCaptureScreenshot?: () => void;
  onScanElements?: () => void;
  isAutomationEnabled?: boolean;
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
  onCaptureScreenshot,
  onScanElements,
  isAutomationEnabled,
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
        <div className="flex items-center gap-1.5">
          {isAutomationEnabled && onScanElements && (
            <button
              onClick={onScanElements}
              disabled={isLoading}
              className="flex items-center gap-1 text-amber-300 hover:text-white font-medium px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 border border-amber-800/80 transition-colors disabled:opacity-50"
              title="画面のボタン・入力要素をスキャンし、番号タグを表示して添付"
            >
              <Bot className="w-3 h-3 text-amber-400" />
              操作スキャン
            </button>
          )}
          {onCaptureScreenshot && (
            <button
              onClick={onCaptureScreenshot}
              disabled={isLoading}
              className="flex items-center gap-1 text-slate-300 hover:text-white font-medium px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700/80 transition-colors disabled:opacity-50"
              title="閲覧中のタブの画面スクリーンショットを撮影・添付"
            >
              <Camera className="w-3 h-3 text-indigo-400" />
              スクショ撮影
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium px-2 py-0.5 rounded hover:bg-slate-800/80 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            本文を添付
          </button>
        </div>
      </div>
    );
  }

  const isScreenshot = attachment.mode === 'screenshot' || attachment.type === 'screenshot';
  const hasWarning = attachment.warningLevel && attachment.warningLevel !== 'none';

  return (
    <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-800/90 flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        {/* Context Pill Chip */}
        <div
          className={`flex items-center gap-1.5 border rounded-lg px-2 py-1 max-w-[calc(100%-110px)] transition-colors ${
            hasWarning
              ? 'bg-amber-950/60 border-amber-600/70 text-amber-200'
              : 'bg-indigo-950/70 border-indigo-700/60 text-indigo-200'
          }`}
        >
          {isScreenshot ? (
            attachment.imageDataUrl ? (
              <img
                src={attachment.imageDataUrl}
                alt="thumb"
                className="w-4 h-4 object-cover rounded shrink-0 border border-indigo-400/40"
              />
            ) : (
              <Camera className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            )
          ) : (
            <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          )}

          <span
            className="font-medium truncate cursor-pointer hover:underline text-[11px]"
            onClick={onOpenPreview}
            title={attachment.title}
          >
            {attachment.title}
          </span>

          {attachment.badge && (
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono shrink-0 ${
                hasWarning
                  ? 'bg-amber-900/80 text-amber-300 font-semibold'
                  : 'bg-indigo-900/80 text-indigo-300'
              }`}
            >
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

        {/* Pill Actions: Mode switcher, Screenshot button, Pin, Refresh */}
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
            <option value="screenshot">📸 画面スクショ</option>
          </select>

          {/* Quick Screenshot button */}
          {onCaptureScreenshot && (
            <button
              onClick={onCaptureScreenshot}
              disabled={isLoading}
              className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
              title="現在のタブのスクリーンショットを撮って添付"
            >
              <Camera className="w-3 h-3" />
            </button>
          )}

          {/* Quick Automation Scan button */}
          {isAutomationEnabled && onScanElements && (
            <button
              onClick={onScanElements}
              disabled={isLoading}
              className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors disabled:opacity-50"
              title="画面の要素をスキャンして操作指示用に添付"
            >
              <Bot className="w-3 h-3" />
            </button>
          )}

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

      {/* Large text / Raw HTML Warning Banner */}
      {hasWarning && (
        <div className="w-full px-2 py-1 bg-amber-950/80 border border-amber-700/80 rounded-md text-[10px] text-amber-200 flex items-start gap-1.5 animate-in fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-tight flex-1">
            <span className="font-semibold text-amber-300">
              ⚠️ 文字数が非常に多いです（{attachment.badge}）
            </span>
            <p className="text-amber-200/90 text-[10px] mt-0.5">
              {attachment.mode === 'raw_html'
                ? '生HTMLは文字数が膨大になりトークン上限消費や応答遅延の原因になります。スクレイピングやDOM解析以外の用途では「Markdown本文」の利用をおすすめします。'
                : 'AIのトークン上限や処理速度にご注意ください。必要な部分のみ「選択範囲」にするか要約プロンプトの指定を推奨します。'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
