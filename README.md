# Chrome/Edge AI Sidepanel

> **ブラウザで開いている社内Wiki・ポータル等のHTML/本文をワンタップ添付し、社内PCローカルAI（Claude Code / Copilot CLI）と対話＆ローカルObsidianを直接更新するブラウザ拡張機能**

---

## 🎯 概要
Chrome / Edge の **Side Panel API** を利用し、ブラウザのサイドバーに常駐するAIアシスタントです。
認証が必要な社内ポータルや外部SaaSのページを開いたまま、アクティブタブの内容（HTML/本文テキスト/Markdown）をチャット入力欄の上に添付（Context Pills）し、社内PC上のAIエージェントに指示を送ることができます。

## 🚀 主な想定機能
1. **アクティブタブの自動・手動コンテキスト添付**:
   - `[📎 社内ポータル「セキュリティ方針」 (1.2万字) ✕]` のようなチップUI
   - 本文（Readability/Markdown）抽出モード ＆ 生HTMLモード
2. **社内PC Bridge Agent 直結**:
   - `webapp-ai-remote` / `webapp-mattermost-log` と同等の通信プロトコル（SSE / HTTP POST / WebSocket）
   - 社内PC上の Claude Code / Copilot CLI を制御
3. **ローカルVault（Obsidian）自動更新**:
   - 抽出したタスクや要約をローカルの `personal-vault/00_Dashboard.md` やデイリーノートへ直接追記

## 📚 関連ドキュメント
- [AGENTS.md](./AGENTS.md)
- 作戦ノート: `personal-vault/10_職人・発明家/chrome-ext-ai-sidepanel.md`
