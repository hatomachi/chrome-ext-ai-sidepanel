import React from 'react';
import {
  MousePointerClick,
  Keyboard,
  ArrowDownUp,
  Clock,
  Compass,
  Play,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { BrowserActionProposal } from '../features/automation/automationTypes';

interface Props {
  action: BrowserActionProposal;
  onApprove: (action: BrowserActionProposal) => void;
  onReject: (action: BrowserActionProposal) => void;
}

export const ActionProposalCard: React.FC<Props> = ({
  action,
  onApprove,
  onReject,
}) => {
  const getActionIcon = () => {
    switch (action.type) {
      case 'click':
        return <MousePointerClick className="w-4 h-4 text-emerald-400" />;
      case 'type':
        return <Keyboard className="w-4 h-4 text-indigo-400" />;
      case 'scroll':
        return <ArrowDownUp className="w-4 h-4 text-amber-400" />;
      case 'wait':
        return <Clock className="w-4 h-4 text-blue-400" />;
      case 'navigate':
        return <Compass className="w-4 h-4 text-purple-400" />;
      default:
        return <MousePointerClick className="w-4 h-4 text-slate-400" />;
    }
  };

  const getActionTitle = () => {
    switch (action.type) {
      case 'click':
        return `クリック: ${action.targetDescription || `要素 [${action.targetId ?? '?'}]`}`;
      case 'type':
        return `入力: ${action.targetDescription || `要素 [${action.targetId ?? '?'}]`}`;
      case 'scroll':
        return `スクロール: ${action.direction === 'up' ? '上' : '下'}へ ${action.amount || 500}px`;
      case 'wait':
        return `待機: ${action.amount || 1000}ms`;
      case 'navigate':
        return `ページ遷移: ${action.url}`;
      default:
        return action.type;
    }
  };

  return (
    <div className="my-2 p-3 bg-slate-950/80 border border-indigo-500/30 rounded-lg shadow-md animate-in fade-in zoom-in-95 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-slate-900 border border-slate-700/50">
            {getActionIcon()}
          </div>
          <span className="text-xs font-semibold text-slate-200 truncate">
            {getActionTitle()}
          </span>
        </div>
        <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/60 shrink-0">
          提案
        </span>
      </div>

      {/* Details */}
      <div className="space-y-1.5 text-xs text-slate-300 mb-3">
        {action.targetId !== undefined && (
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 text-[11px]">対象ID:</span>
            <span className="font-mono text-amber-300 bg-amber-950/40 px-1 py-0.2 rounded border border-amber-800/50 text-[11px]">
              [{action.targetId}]
            </span>
            {action.targetDescription && (
              <span className="text-slate-300 truncate text-[11px]">
                {action.targetDescription}
              </span>
            )}
          </div>
        )}

        {action.type === 'type' && action.value !== undefined && (
          <div className="flex items-start gap-1.5">
            <span className="text-slate-500 text-[11px] shrink-0">入力値:</span>
            <span className="font-mono text-indigo-300 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-800/50 text-[11px] break-all">
              "{action.value}"
            </span>
          </div>
        )}

        {action.reason && (
          <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60">
            💡 {action.reason}
          </div>
        )}
      </div>

      {/* Action / Status Footer */}
      {action.status === 'pending' && (
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => onReject(action)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            スキップ
          </button>
          <button
            onClick={() => onApprove(action)}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded shadow transition-colors"
          >
            <Play className="w-3 h-3 fill-current" />
            実行する (Enter)
          </button>
        </div>
      )}

      {action.status === 'executing' && (
        <div className="flex items-center gap-2 text-xs text-amber-400 py-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>画面アクションを実行中...</span>
        </div>
      )}

      {action.status === 'completed' && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 py-1 font-medium">
          <CheckCircle2 className="w-4 h-4" />
          <span>実行完了</span>
        </div>
      )}

      {action.status === 'failed' && (
        <div className="flex items-start gap-1.5 text-xs text-rose-400 py-1">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>実行失敗: {action.error || '不明なエラー'}</span>
        </div>
      )}

      {action.status === 'rejected' && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 py-1">
          <X className="w-4 h-4" />
          <span>スキップされました</span>
        </div>
      )}
    </div>
  );
};
