import React, { useState } from 'react';
import { X, Server, Key, Cpu, Zap, Save, Check } from 'lucide-react';
import { AiRemoteSettings, AIEngine, TransportMode, ExtractionMode } from '../features/ai/aiRemoteTypes';

interface Props {
  isOpen: boolean;
  settings: AiRemoteSettings;
  onSave: (newSettings: AiRemoteSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({
  isOpen,
  settings,
  onSave,
  onClose,
}) => {
  const [formData, setFormData] = useState<AiRemoteSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              AI Remote & 接続設定
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4 text-xs">
          {/* Hub URL */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              中継 Hub URL (webapp-ai-remote)
            </label>
            <input
              type="text"
              value={formData.hubUrl}
              onChange={(e) => setFormData({ ...formData, hubUrl: e.target.value })}
              placeholder="ws://localhost:8090/ws/client"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              required
            />
            <p className="text-[10px] text-slate-500 mt-1">
              社内PC上の Bridge Agent または EC2 Relay Hub の URL（WS または HTTP）
            </p>
          </div>

          {/* Auth Token */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              認証トークン (Room Token)
            </label>
            <div className="relative">
              <input
                type="password"
                value={formData.authToken}
                onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                placeholder="任意（未設定時はデフォルトルーム）"
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              />
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              webapp-ai-remote の動的ルーム分離用トークン
            </p>
          </div>

          {/* AI Engine & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                AI エンジン
              </label>
              <select
                value={formData.engine}
                onChange={(e) => setFormData({ ...formData, engine: e.target.value as AIEngine })}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
              >
                <option value="claude">Claude Code</option>
                <option value="copilot">Copilot CLI</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                モデル
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="claude-opus-4-7"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-[11px]"
              />
            </div>
          </div>

          {/* Default Extraction Mode */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              既定の本文抽出モード
            </label>
            <select
              value={formData.defaultExtractionMode}
              onChange={(e) => setFormData({ ...formData, defaultExtractionMode: e.target.value as ExtractionMode })}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:outline-none focus:border-indigo-500 text-xs"
            >
              <option value="readability">Markdown本文抽出 (Readability / トークン節約・推奨)</option>
              <option value="selection">選択範囲テキスト優先</option>
              <option value="raw_html">生HTML (DOM構造保持)</option>
            </select>
          </div>

          {/* Auto attach toggle */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoAttachTab"
              checked={formData.autoAttachTab}
              onChange={(e) => setFormData({ ...formData, autoAttachTab: e.target.checked })}
              className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <label htmlFor="autoAttachTab" className="text-slate-300 text-xs cursor-pointer select-none">
              サイドパネル起動時に現在のアクティブタブを自動添付
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded text-white transition-colors ${
                savedSuccess ? 'bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {savedSuccess ? '保存完了' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
