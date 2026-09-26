# 🤖 Browser Automation Engine (Experimental)

## 概要
AIエージェント（Claude Code / Copilot CLI / LLM）にブラウザ画面の要素を安全に操作させるための実験的モジュール。
既存のDOM抽出・チャット機能とは完全に独立した設計となっており、Feature Flagによって無効化/有効化を切り替え可能。

## 実装ステップ予定（次セッション〜）
1. **要素スキャン & ラベリング (`elementScanner.ts`)**:
   - `chrome.scripting.executeScript` を用いて、アクティブタブ内のインタラクティブ要素（button, a, input, textarea, select 等）を走査。
   - 画面上に視覚的なバッジ（`[1]`, `[2]`, `[3]`）を一瞬オーバーレイ表示。
2. **要素アクション実行 (`browserActions.ts`)**:
   - 指定IDの要素に対する `click`, `type`（React対応のinputイベント発火）, `scroll` を実装。
3. **安全確認UI（Human-in-the-Loop）**:
   - AIから提案されたアクションを実行する前に、サイドパネル上でユーザーに承認（実行/スキップ）を求めるUI。
4. **Claude Code ツール連携**:
   - 実験モード有効時のみ、AIのシステムプロンプトに操作ツール定義（JSON）を付与し、Toolレスポンスを解釈。
