# AGENTS.md - Chrome/Edge AI Sidepanel

## 概要
Chrome / Edge ブラウザの **Side Panel API（サイドパネル）** を活用し、現在閲覧中のタブ（社内Wiki・ポータル・SaaSなど）のHTML/本文をワンタップで添付して、社内PCのローカルAI（Claude Code / GitHub Copilot CLI）と対話・ローカルVault（Obsidian）更新ができるブラウザ拡張機能です。

## 作戦ノートへの参照リンク
このプロジェクトのビジョン、現在地、Next Actions、フィードバックログは以下の作戦ノートで一元管理されています。
- **作戦ノート**: [/Users/s-ikari/work/personal-vault/10_職人・発明家/chrome-ext-ai-sidepanel.md](/Users/s-ikari/work/personal-vault/10_職人・発明家/chrome-ext-ai-sidepanel.md)
- **全体ダッシュボード**: [/Users/s-ikari/work/personal-vault/00_Dashboard.md](/Users/s-ikari/work/personal-vault/00_Dashboard.md)

作業時は常に上記作戦ノートと同期し、完了したタスクのチェックや現在地の更新を行ってください。

## 作業完了時のルール
- タスク完了時は、動作確認およびコミット後、**必ず本リポジトリで `git push`（リモートpush）を実行すること**。
- `personal-vault` 側の作戦ノート・Dashboard更新時も同様に `git push` まで確実に実施すること。

---

## 💡 プロジェクト誕生の経緯・背景

### なぜこの拡張機能を作るのか？
1. **背景**:
   - `webapp-mattermost-log` や `webapp-ai-remote` で実現した「画面ログ・コンテキストをチャット入力欄の上にチップ（Context Pills）として添付し、社内PCのClaude/Copilotに投げて爆速で処理させる」ワークフローが非常に強力で快適だった。
   - ユーザーから「任意のWebページや社内情報サイトを見ながら、そのHTMLをAIに渡して、ローカルPCのObsidian等のToDoを更新させるようなPWAを作れないか？」という発想が生まれた。
2. **Web（PWA / iframe）の壁**:
   - 社内サイトは二重認証（SSO/Cookie）や複雑なパスルーティングが多く、外部サーバーからのURLフェッチが困難。
   - 通常のPWAで `<iframe>` を使おうとしても、`X-Frame-Options` や同一生成元ポリシー（Same-Origin Policy）に阻まれ、画面表示やDOM/HTMLの取得がブラウザ仕様上不可能。
3. **ブレイクスルー（Side Panel 拡張機能）**:
   - モバイルではなく「PCブラウザ」にフォーカス。
   - Chrome / Edge の **Side Panel API** を使えば、ブラウザ右側の常駐パネルに自作Reactアプリをそのまま埋め込める。
   - 拡張機能の特権（`activeTab` / `chrome.scripting`）を使えば、**ユーザーが認証済みのタブの生のHTMLや本文テキストをCORS制限なしで100%安全・確実に取得可能**。

---

## 🎯 目指すユーザー体験（UX）

1. **社内ポータルやWikiを開く**:
   - 普段通りChrome/Edgeで社内サイト（認証済み）を開く。
2. **サイドパネルを開く**:
   - ブラウザ右側に、マタモPWA風のチャットUIが常駐。
   - 開いたタブのタイトル・URL・本文が自動的（またはボタン一つ）で入力欄の上に `[📎 社内ポータル「セキュリティ方針」 (1.2万字) ✕]` と添付される。
3. **AIに指示を送信**:
   - 例: `「このページから来週までのTODOを抽出して、ローカルVaultの 00_Dashboard.md に追記して」`
4. **社内PCのローカルファイルが自動更新**:
   - サイドパネルから社内PCの Bridge Agent（`http://localhost:XXXX` または Relay Hub）へ指示と本文が飛ぶ。
   - 社内PC上の Claude Code / Copilot CLI が、ローカルの Obsidian Vault（`/Users/s-ikari/work/personal-vault` 等）のMarkdownファイルを直接編集！

---

## 📚 参考にすべき既存リポジトリ・実装資産

本リポジトリの実装時は、以下の既存コードを大いに参考にし、設計パターンやコンポーネントを流用してください。

### 1. `webapp-mattermost-log` (`/Users/s-ikari/work/webapp-mattermost-log`)
- **Context Pills & チャットUI**:
  - `src/components/ai/AiRemoteChatDrawer.tsx`: 入力欄の上の添付チップ（Context Pills）、チャットメッセージ履歴、ストリーミング描画、IME安全送信、モデル選択。
  - `src/components/ai/ContextAttachmentModal.tsx`: 添付したコンテキストの閲覧・検索・コピーモーダル。
  - `src/components/common/ErrorBoundary.tsx`: Reactレンダリングエラー防止。
- **AI Remote 接続クライアント**:
  - `src/features/ai/useAiRemoteClient.ts`: Relay Hub / Bridge Agent との通信管理（WebSocket / HTTP SSE+POST、指数バックオフ、切断防止、セッション管理）。
  - `src/features/ai/aiRemoteTypes.ts`: 通信メッセージ定義（`ChatMessage`, `ProjectInfo`, `AiRemoteSettings` 等）。

### 2. `webapp-ai-remote` (`/Users/s-ikari/work/webapp-ai-remote`)
- EC2 Relay Hub ⇄ 社内PC Bridge Agent の通信プロトコル仕様およびセッション管理ロジック。

---

## 🛠️ 推奨技術スタック・アーキテクチャ案

- **Manifest**: Chrome Extension Manifest V3
  - 権限: `sidePanel`, `activeTab`, `scripting`, `storage`
  - ホスト権限: `http://localhost:*/*` (社内PC Bridge Agent への直通通信用)
- **ビルドツール**: Vite + `@crxjs/vite-plugin`（または標準Viteのマルチページビルド）
- **フロントエンド**: React 18/19 + TypeScript + Tailwind CSS + Lucide Icons
- **本文抽出・軽量化ライブラリ**:
  - `@mozilla/readability` または Turndown（生HTMLから不要なナビゲーション・CSSタグを除去し、クリーンなMarkdownやテキストに圧縮してAIのトークン節約＆回答精度向上）
  - 生HTML送信モード / 本文Markdown抽出モードの切り替えトグル

---

## 📋 実装を進めるAIエージェントへの指示

1. 作業を開始する前に、作戦ノート（`personal-vault/10_職人・発明家/chrome-ext-ai-sidepanel.md`）を確認してください。
2. まず **Implementation Plan（実装計画）** を作成し、プロジェクト構成やステップをユーザーに提示して承認を得てください。
3. 実装完了・動作確認後は、必ず本リポジトリおよび `personal-vault` 双方で `git commit` & `git push` を実施してください。
