# 🧩 Chrome/Edge AI Sidepanel

> **ブラウザで開いている社内Wiki・ポータル・SaaS等の本文をワンタップ添付し、社内PCのローカルAI（Claude Code / GitHub Copilot CLI）と対話＆ローカルObsidianを直接更新するブラウザ拡張機能**

---

## 🚀 最速インストール（ビルド不要・1分で導入）

Node.js やビルドツールのインストールは不要です。すぐにブラウザで使えます。

### 方法 1: リポジトリをダウンロード / clone する場合（推奨）
1. 本リポジトリを `git clone` または GitHub 画面の **「Code」→「Download ZIP」** でダウンロードして解凍します。
2. Chrome または Edge を開き、拡張機能管理ページに移動します：
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. 画面右上の **「デベロッパーモード」** を ON にします。
4. 画面左上の **「パッケージ化されていない拡張機能を読み込む」** をクリックし、本リポジトリ内の `releases/unpacked` フォルダを選択します。
5. ブラウザツールバーに拡張機能アイコンが表示されます！🎉

### 方法 2: 配布用 ZIP をダウンロードする場合
1. 本リポジトリの [`releases/chrome-ext-ai-sidepanel.zip`](releases/chrome-ext-ai-sidepanel.zip) をダウンロードして任意の場所に解凍します。
2. 上記と同様に `chrome://extensions/` から **「パッケージ化されていない拡張機能を読み込む」** で解凍したフォルダを選択します。

---

## 🎯 使い方

1. **サイドパネルを開く**:
   - ブラウザ右上ツールバーの拡張機能アイコンをクリックすると、ブラウザ右側にチャットパネルが開きます。
2. **社内サイトや調べたいページを開く**:
   - 現在のタブのタイトル・文字数が自動的に入力欄の上に `[📎 ページタイトル (文字数) ✕]` として添付されます。
3. **AIに指示を送信**:
   - 例: `「このページから来週までのTODOを抽出して、00_Dashboard.md に追記して」`
   - 社内PC上の Bridge Agent（Claude Code / Copilot CLI）がローカルの Obsidian Vault 等の Markdown ファイルを直接更新します！

---

## ⚙️ 接続設定（社内PC Bridge Agent）

本拡張機能は、社内PC上の Bridge Agent（[`webapp-ai-remote`](https://github.com/hatomachi/webapp-ai-remote)）と通信します。

- **中継 Hub URL**: `ws://localhost:8090/ws/client`（デフォルト）
- **認証トークン**: `dev-secret-token`（Agent 起動時に指定したトークン）
- **AI エンジン**:
  - **Claude Code**: 高度なタスク自動化・推論・ローカルファイル直接編集
  - **Copilot CLI**: 高速レスポンス・GitHub連携・自動最適モデル

---

## 🛠️ 開発者向けコマンド

```bash
# 依存関係インストール
npm install

# 開発用 Vite サーバー（ホットリロード）
npm run dev

# プロダクションビルド（dist/ 出力）
npm run build

# 配布用パッケージ生成（releases/unpacked と releases/*.zip を自動生成）
npm run release
```

---

## 📂 リポジトリ構成

```
├── dist/                # ビルド生成物（.gitignore）
├── releases/            # 配布用ディレクトリ（Git同梱）
│   ├── unpacked/        # ビルド済み解凍フォルダ（そのままブラウザに読み込み可）
│   └── chrome-ext-ai-sidepanel.zip # 配布用最新ZIPアーカイブ
├── src/
│   ├── background/      # Service Worker (Side Panel 起動・タブ監視)
│   ├── sidepanel/       # React サイドパネル本体 (App.tsx)
│   ├── features/
│   │   ├── ai/          # AI Remote クライアント (WebSocket/HTTP, プロトコル)
│   │   └── extractor/   # Readability + Turndown (本文Markdown抽出・軽量化)
│   └── components/      # UI コンポーネント (ContextPills, Modals)
├── scripts/
│   └── package.js       # 配布パッケージ自動生成スクリプト
└── manifest.json        # Chrome Extension Manifest V3
```

---

## 📄 License
MIT
