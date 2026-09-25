import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AI Sidepanel] Uncaught render error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-4 bg-slate-900 text-slate-100 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mb-3" />
          <h2 className="text-base font-semibold mb-1">表示エラーが発生しました</h2>
          <p className="text-xs text-slate-400 mb-4 max-w-xs break-words">
            {this.state.error?.message || '予期しないエラーが発生しました'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 rounded font-medium text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            再読み込み
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
