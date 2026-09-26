import { ContextAttachment } from './aiRemoteTypes';

export interface QuickPrompt {
  id: string;
  label: string;
  icon: string;
  description: string;
  prompt: string;
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  {
    id: 'dashboard-task',
    label: 'Dashboardに追記',
    icon: '📝',
    description: 'タスク・要点を抽出し personal-vault/00_Dashboard.md に追記',
    prompt: `添付されたページの内容を確認し、重要なポイントと来週までに対応すべきタスク・アクションアイテムを抽出してください。\nその後、ローカルの \`personal-vault/00_Dashboard.md\` の「未分類タスク」または適切なセクションに追記・更新してください。`,
  },
  {
    id: 'summarize',
    label: '3行要約',
    icon: '⚡',
    description: 'ページの要点・論点を端的に要約',
    prompt: `添付されたWebページの内容を読み込み、要点を3〜5行で端的にまとめてください。\n決定事項、背景、重要なキーワードがあれば箇条書きで分かりやすく整理してください。`,
  },
  {
    id: 'extract-todos',
    label: 'TODO・課題抽出',
    icon: '✅',
    description: '未解決の課題やアクションアイテムをリスト化',
    prompt: `添付された内容から、対応が必要なTODO、宿題事項、懸念・確認事項を漏れなく抽出してリストアップしてください。担当者や期限が記載されていればそれも付記してください。`,
  },
  {
    id: 'obsidian-note',
    label: 'Vaultノート化',
    icon: '📚',
    description: 'Obsidian保管用に綺麗に構造化されたMarkdownを生成',
    prompt: `このページの内容をローカルの Obsidian Vault で恒久保存できるように、見出し・表・要約・詳細を含む綺麗なMarkdownドキュメントとして構造化して出力してください。`,
  },
  {
    id: 'create-procedure',
    label: '画面手順書を作成',
    icon: '📸',
    description: '添付の画面スクショ・ページから初心者向け操作手順書（Markdown）を作成',
    prompt: `添付された画面（スクリーンショットまたはページ内容）を確認し、この画面を操作するユーザー向けの詳細な操作手順書（マニュアル）をMarkdown形式で作成してください。\n- 目的と概要\n- 前提条件\n- ステップバイステップの手順（UI上のボタン名、入力欄、配置場所を具体的に明記）\n- 注意事項やよくあるエラーへの対処`,
  },
  {
    id: 'suggest-action',
    label: '操作を提案 (Beta)',
    icon: '🤖',
    description: 'スキャン結果から目的達成のためのブラウザ操作（クリック・入力）を提案',
    prompt: `添付されたブラウザ画面の要素一覧（または画面情報）を分析し、ユーザーの目的に応じた次のアクション（クリック、フォーム入力、スクロールなど）を \`\`\`browser_action\`\`\` 形式で提案してください。`,
  },
];

/**
 * Compose full prompt with attached context attachments injected at the top
 */
export function composeFullPrompt(userPrompt: string, attachments?: ContextAttachment[]): string {
  if (!attachments || attachments.length === 0) {
    return userPrompt;
  }

  let prompt = `以下のブラウザ閲覧コンテキスト（開いているタブまたは選択テキスト）を読み込んで、ユーザーの質問や指示に答えてください。\n\n`;

  for (const att of attachments) {
    prompt += `========================================================\n`;
    prompt += `📎 添付コンテキスト: ${att.title}${att.badge ? ` [${att.badge}]` : ''}\n`;
    if (att.url) {
      prompt += `🌐 URL: ${att.url}\n`;
    }
    prompt += `========================================================\n`;
    prompt += att.contentMarkdown.trim() + '\n\n';
  }

  prompt += `========================================================\n`;
  prompt += `【ユーザーの指示・質問】\n`;
  prompt += `========================================================\n`;
  prompt += userPrompt;

  return prompt;
}
