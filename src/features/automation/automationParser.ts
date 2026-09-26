import { AutomationScanResult, BrowserActionProposal, AutomationActionType } from './automationTypes';

/**
 * Format scanned elements into a structured prompt text for AI agents.
 */
export function formatScanResultForPrompt(scanResult: AutomationScanResult): string {
  if (!scanResult || scanResult.elements.length === 0) {
    return '【ブラウザ画面操作スキャン】\nインタラクティブな要素は見つかりませんでした。';
  }

  let text = `【ブラウザ画面インタラクティブ要素一覧 (${scanResult.elements.length}件)】\n`;
  text += `- ページタイトル: ${scanResult.pageTitle}\n`;
  text += `- URL: ${scanResult.pageUrl}\n`;
  text += `- 画面上に [番号] の黄色タグで各要素がハイライトされています。\n\n`;
  text += `以下の要素番号 [ID] を指定してブラウザ操作（クリック、テキスト入力等）を提案できます。\n\n`;

  for (const el of scanResult.elements) {
    let desc = `[${el.id}] <${el.tagName}`;
    if (el.type) desc += ` type="${el.type}"`;
    desc += `>`;

    if (el.text) {
      desc += ` 「${el.text}」`;
    }
    if (el.placeholder) {
      desc += ` placeholder: "${el.placeholder}"`;
    }
    if (el.role) {
      desc += ` role="${el.role}"`;
    }

    text += `${desc}\n`;
  }

  text += `\nもし次の操作（クリックや入力）を提案する場合は、以下の \`\`\`browser_action\`\`\` JSONブロックで出力してください：\n`;
  text += `\`\`\`browser_action\n{\n  "type": "click" | "type" | "scroll" | "wait" | "navigate",\n  "targetId": 1,\n  "targetDescription": "対象要素の説明",\n  "value": "入力する文字列（typeの場合）",\n  "direction": "down" | "up",\n  "amount": 500,\n  "url": "遷移先URL（navigateの場合）",\n  "reason": "操作の目的・理由"\n}\n\`\`\`\n`;

  return text;
}

/**
 * Parse a ```browser_action JSON block from AI output text
 */
export function parseActionProposal(text: string): BrowserActionProposal | null {
  if (!text) return null;

  const regex = /```(?:browser_action|action)\s*([\s\S]*?)\s*```/i;
  const match = text.match(regex);
  if (!match || !match[1]) return null;

  try {
    const rawJson = JSON.parse(match[1]);
    const validTypes: AutomationActionType[] = ['click', 'type', 'scroll', 'wait', 'navigate'];
    if (!validTypes.includes(rawJson.type)) {
      return null;
    }

    return {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: rawJson.type,
      targetId: typeof rawJson.targetId === 'number' ? rawJson.targetId : undefined,
      targetDescription: rawJson.targetDescription || (rawJson.targetId ? `要素 [${rawJson.targetId}]` : undefined),
      value: rawJson.value,
      direction: rawJson.direction === 'up' ? 'up' : 'down',
      amount: typeof rawJson.amount === 'number' ? rawJson.amount : undefined,
      url: rawJson.url,
      reason: rawJson.reason,
      status: 'pending',
      createdAt: Date.now(),
    };
  } catch (err) {
    console.warn('[automationParser] Failed to parse browser_action JSON:', err);
    return null;
  }
}

/**
 * Clean up or format display text by hiding or softening raw browser_action blocks in chat
 */
export function cleanActionBlockFromText(text: string): string {
  if (!text) return text;
  return text.replace(/```(?:browser_action|action)\s*[\s\S]*?\s*```/gi, '').trim();
}
