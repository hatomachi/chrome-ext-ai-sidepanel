import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  Check,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Zap,
  Shield,
  FileCode,
  Copy,
  ChevronRight,
} from 'lucide-react';
import {
  WorkflowRecipe,
  WorkflowExecutionMode,
  WorkflowStep,
} from '../../features/workflow/workflowTypes';
import {
  DEFAULT_HOLIDAY_WORK_RECIPE,
  serializeRecipeToMarkdown,
} from '../../features/workflow/workflowParser';
import {
  executeSingleWorkflowStep,
  resolveTemplateValue,
} from '../../features/workflow/workflowRunner';

interface WorkflowRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusMessage?: (msg: string) => void;
}

export const WorkflowRunnerModal: React.FC<WorkflowRunnerModalProps> = ({
  isOpen,
  onClose,
  onStatusMessage,
}) => {
  const [recipe, setRecipe] = useState<WorkflowRecipe>(DEFAULT_HOLIDAY_WORK_RECIPE);
  const [params, setParams] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<WorkflowExecutionMode>('auto-pilot');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPausedForApproval, setIsPausedForApproval] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(-1);
  const [steps, setSteps] = useState<WorkflowStep[]>(DEFAULT_HOLIDAY_WORK_RECIPE.steps);
  const [showMarkdown, setShowMarkdown] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Initialize parameter defaults
  useEffect(() => {
    const initialParams: Record<string, string> = {};
    for (const p of recipe.parameters) {
      if (p.default === 'today') {
        initialParams[p.key] = new Date().toISOString().split('T')[0];
      } else if (p.default === 'tomorrow') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        initialParams[p.key] = tomorrow.toISOString().split('T')[0];
      } else {
        initialParams[p.key] = p.default || '';
      }
    }
    setParams(initialParams);
    setSteps(recipe.steps.map(s => ({ ...s, status: 'pending', error: undefined })));
  }, [recipe]);

  if (!isOpen) return null;

  const handleOpenMockPage = () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.runtime) {
      const url = chrome.runtime.getURL('mock/portal.html');
      chrome.tabs.create({ url });
      if (onStatusMessage) onStatusMessage('社内申請モック画面を開きました');
    } else {
      window.open('/mock/portal.html', '_blank');
    }
  };

  const handleParamChange = (key: string, value: string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const handleCopyMarkdown = () => {
    const md = serializeRecipeToMarkdown(recipe);
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetExecution = () => {
    setIsRunning(false);
    setIsPausedForApproval(false);
    setCurrentStepIndex(-1);
    setSteps(recipe.steps.map(s => ({ ...s, status: 'pending', error: undefined })));
    setLogs([]);
  };

  // Run execution loop
  const handleStartWorkflow = async () => {
    resetExecution();
    setIsRunning(true);
    setLogs(['▶️ ワークフロー実行を開始しました']);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      setCurrentStepIndex(i);

      // Check if step requires approval (dangerous) or step-by-step mode
      if (mode === 'step-by-step' || step.dangerous) {
        setIsPausedForApproval(true);
        setLogs(prev => [...prev, `⏸️ ステップ ${i + 1} (${step.targetDescription}) の実行承認を待機中...`]);
        return; // Pause here until user clicks "Approve / Continue"
      }

      // Execute step in auto-pilot
      await executeStepAtIndex(i);
      // Brief delay for smooth visual feedback
      await new Promise(r => setTimeout(r, 300));
    }

    setIsRunning(false);
    setLogs(prev => [...prev, '🎉 全てのステップが完了しました！']);
    if (onStatusMessage) onStatusMessage('ワークフローが完了しました！');
  };

  const executeStepAtIndex = async (index: number) => {
    const step = steps[index];
    setSteps(prev => prev.map((s, idx) => idx === index ? { ...s, status: 'executing' } : s));

    const result = await executeSingleWorkflowStep(step, params);

    if (result.success) {
      setSteps(prev => prev.map((s, idx) => idx === index ? { ...s, status: 'completed' } : s));
      setLogs(prev => [...prev, `✓ [ステップ ${index + 1}] ${result.message || step.targetDescription}`]);
    } else {
      setSteps(prev => prev.map((s, idx) => idx === index ? { ...s, status: 'failed', error: result.error } : s));
      setLogs(prev => [...prev, `❌ [ステップ ${index + 1} 失敗] ${result.error}`]);
      setIsRunning(false);
      setIsPausedForApproval(false);
      throw new Error(result.error);
    }
  };

  // User approved the paused step
  const handleApprovePausedStep = async () => {
    if (currentStepIndex < 0 || currentStepIndex >= steps.length) return;

    setIsPausedForApproval(false);
    try {
      await executeStepAtIndex(currentStepIndex);

      const nextIndex = currentStepIndex + 1;
      if (nextIndex < steps.length) {
        setCurrentStepIndex(nextIndex);
        if (mode === 'step-by-step' || steps[nextIndex].dangerous) {
          setIsPausedForApproval(true);
          setLogs(prev => [...prev, `⏸️ ステップ ${nextIndex + 1} (${steps[nextIndex].targetDescription}) の実行承認を待機中...`]);
        } else {
          // Resume auto-pilot
          for (let i = nextIndex; i < steps.length; i++) {
            setCurrentStepIndex(i);
            if (steps[i].dangerous) {
              setIsPausedForApproval(true);
              setLogs(prev => [...prev, `⏸️ ステップ ${i + 1} (${steps[i].targetDescription}) の実行承認を待機中...`]);
              return;
            }
            await executeStepAtIndex(i);
            await new Promise(r => setTimeout(r, 300));
          }
          setIsRunning(false);
          setLogs(prev => [...prev, '🎉 全てのステップが完了しました！']);
          if (onStatusMessage) onStatusMessage('ワークフローが完了しました！');
        }
      } else {
        setIsRunning(false);
        setLogs(prev => [...prev, '🎉 全てのステップが完了しました！']);
        if (onStatusMessage) onStatusMessage('ワークフローが完了しました！');
      }
    } catch (err) {
      // Error logged in executeStepAtIndex
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden text-zinc-900 dark:text-zinc-100">
        
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-1.5">
                {recipe.title}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-medium">
                  Obsidian連携
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {recipe.description}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs sm:text-sm">
          
          {/* Quick Mock Page Launcher Banner */}
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
              <span>📄 検証用モック画面（社内ポータル）</span>
            </div>
            <button
              onClick={handleOpenMockPage}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
            >
              開く <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              実行モード:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode('auto-pilot')}
                disabled={isRunning}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                  mode === 'auto-pilot'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> 一括実行 (Auto)
              </button>
              <button
                type="button"
                onClick={() => setMode('step-by-step')}
                disabled={isRunning}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                  mode === 'step-by-step'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> 都度承認 (Safe)
              </button>
            </div>
          </div>

          {/* Dynamic Parameters Form */}
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30 space-y-2.5">
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span>📝 入力パラメータ設定（Vaultレシピ変数）</span>
              <button
                type="button"
                onClick={() => setShowMarkdown(!showMarkdown)}
                className="text-[11px] font-normal text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                <FileCode className="w-3 h-3" />
                {showMarkdown ? 'フォームに戻す' : 'Obsidian Markdownを表示'}
              </button>
            </div>

            {showMarkdown ? (
              <div className="relative">
                <pre className="text-[11px] p-2.5 bg-zinc-900 text-zinc-100 rounded-md overflow-x-auto max-h-48 font-mono">
                  {serializeRecipeToMarkdown(recipe)}
                </pre>
                <button
                  type="button"
                  onClick={handleCopyMarkdown}
                  className="absolute top-2 right-2 p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded shadow-xs transition flex items-center gap-1 text-[11px]"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'コピー完了' : 'コピー'}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {recipe.parameters.map(param => (
                  <div key={param.key} className="space-y-1">
                    <label className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
                      <span>{param.label}</span>
                      {param.required && <span className="text-red-500 text-[10px]">必須</span>}
                    </label>

                    {param.type === 'select' && param.options ? (
                      <select
                        value={params[param.key] || ''}
                        onChange={(e) => handleParamChange(param.key, e.target.value)}
                        disabled={isRunning}
                        className="w-full text-xs p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                      >
                        {param.options.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : param.type === 'string' && param.key.includes('reason') ? (
                      <textarea
                        rows={2}
                        value={params[param.key] || ''}
                        onChange={(e) => handleParamChange(param.key, e.target.value)}
                        disabled={isRunning}
                        className="w-full text-xs p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-1 focus:ring-indigo-500 outline-none resize-none"
                      />
                    ) : (
                      <input
                        type={param.type === 'date' ? 'date' : param.type === 'time' ? 'time' : 'text'}
                        value={params[param.key] || ''}
                        onChange={(e) => handleParamChange(param.key, e.target.value)}
                        disabled={isRunning}
                        className="w-full text-xs p-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step Progress List */}
          <div className="space-y-1.5 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 bg-zinc-50/50 dark:bg-zinc-800/30">
            <div className="text-xs font-bold text-zinc-700 dark:text-zinc-300 mb-1">
              📋 実行ステップ一覧 ({steps.length}件)
            </div>
            <div className="space-y-1">
              {steps.map((st, idx) => {
                const isCurrent = idx === currentStepIndex;
                const isCompleted = st.status === 'completed';
                const isFailed = st.status === 'failed';
                const isExecuting = st.status === 'executing';

                return (
                  <div
                    key={st.id}
                    className={`flex items-center justify-between p-1.5 rounded text-xs transition ${
                      isCurrent
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800'
                        : isCompleted
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 text-zinc-600 dark:text-zinc-400'
                        : 'bg-white dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border border-zinc-100 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0">
                        {isExecuting ? (
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                        ) : isCompleted ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : isFailed ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        ) : (
                          <span className="text-[10px] text-zinc-400 font-mono">{idx + 1}</span>
                        )}
                      </div>
                      <span className="truncate font-medium text-[11px]">
                        {st.targetDescription}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-[10px] shrink-0">
                      {st.dangerous && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-bold flex items-center gap-0.5">
                          ⚠️ 要確認
                        </span>
                      )}
                      <span className="font-mono text-zinc-400 text-[10px]">
                        {st.action}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dangerous / Paused Approval Banner */}
          {isPausedForApproval && currentStepIndex >= 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>最終確認: 次の重要アクションを実行しますか？</span>
              </div>
              <div className="text-xs bg-white/80 dark:bg-black/40 p-2 rounded border border-amber-200 dark:border-amber-900">
                <strong>ステップ {currentStepIndex + 1}:</strong> {steps[currentStepIndex].targetDescription}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={resetExecution}
                  className="px-2.5 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-medium"
                >
                  中止
                </button>
                <button
                  type="button"
                  onClick={handleApprovePausedStep}
                  className="px-3 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" /> 承認して実行する
                </button>
              </div>
            </div>
          )}

          {/* Execution Logs */}
          {logs.length > 0 && (
            <div className="p-2.5 bg-zinc-100 dark:bg-zinc-950 rounded-lg border border-zinc-200 dark:border-zinc-800 max-h-28 overflow-y-auto font-mono text-[10px] space-y-0.5 text-zinc-600 dark:text-zinc-400">
              {logs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-between">
          <button
            type="button"
            onClick={resetExecution}
            disabled={!isRunning && currentStepIndex === -1}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-medium disabled:opacity-40"
          >
            リセット
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium transition"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleStartWorkflow}
              disabled={isRunning || isPausedForApproval}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-sm transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {mode === 'auto-pilot' ? 'オートメーション開始 (⚡一括)' : 'ワークフロー開始 (🛡️都度)'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
