import { WorkflowRecipe, WorkflowStep, WorkflowParameter } from './workflowTypes';

/**
 * Default sample recipe for Holiday Work Request (休日出勤申請)
 */
export const DEFAULT_HOLIDAY_WORK_RECIPE: WorkflowRecipe = {
  id: 'recipe-holiday-work-request',
  title: '休日出勤申請',
  description: '社内ポータルの休日出勤申請フォームを自動入力し、確認画面まで進めます',
  targetUrl: 'mock/portal.html',
  parameters: [
    {
      key: 'approver',
      label: '承認者（所属長）',
      type: 'select',
      options: ['山田 部長', '佐藤 課長', '鈴木 リーダー'],
      default: '山田 部長',
      required: true,
    },
    {
      key: 'workDate',
      label: '出勤予定日',
      type: 'date',
      default: 'tomorrow',
      required: true,
    },
    {
      key: 'startTime',
      label: '勤務開始時刻',
      type: 'time',
      default: '09:00',
      required: true,
    },
    {
      key: 'endTime',
      label: '勤務終了時刻',
      type: 'time',
      default: '18:00',
      required: true,
    },
    {
      key: 'reason',
      label: '勤務事由・業務内容',
      type: 'string',
      default: 'システム緊急リリースおよびデータベース移行作業の立ち会いのため',
      required: true,
    },
  ],
  steps: [
    {
      id: 'step-1',
      order: 1,
      action: 'select',
      selector: '#approver',
      targetDescription: '承認者を選択',
      valueTemplate: '{{approver}}',
      status: 'pending',
    },
    {
      id: 'step-2',
      order: 2,
      action: 'type',
      selector: '#workDate',
      targetDescription: '出勤予定日を入力',
      valueTemplate: '{{workDate}}',
      status: 'pending',
    },
    {
      id: 'step-3',
      order: 3,
      action: 'type',
      selector: '#startTime',
      targetDescription: '勤務開始時刻を入力',
      valueTemplate: '{{startTime}}',
      status: 'pending',
    },
    {
      id: 'step-4',
      order: 4,
      action: 'type',
      selector: '#endTime',
      targetDescription: '勤務終了時刻を入力',
      valueTemplate: '{{endTime}}',
      status: 'pending',
    },
    {
      id: 'step-5',
      order: 5,
      action: 'type',
      selector: '#reason',
      targetDescription: '勤務事由を入力',
      valueTemplate: '{{reason}}',
      status: 'pending',
    },
    {
      id: 'step-6',
      order: 6,
      action: 'click',
      selector: '#submitBtn',
      targetDescription: '「申請する」ボタンをクリックして確認モーダルを表示',
      status: 'pending',
    },
    {
      id: 'step-7',
      order: 7,
      action: 'click',
      selector: '#confirmYesBtn',
      targetDescription: '確認ダイアログで「YES (承認して送信)」をクリック',
      dangerous: true,
      status: 'pending',
    },
  ],
};

/**
 * Serialize a WorkflowRecipe into human-readable Obsidian-compatible Markdown
 */
export function serializeRecipeToMarkdown(recipe: WorkflowRecipe): string {
  let md = '---\n';
  md += `id: ${recipe.id}\n`;
  md += `title: "${recipe.title}"\n`;
  if (recipe.description) {
    md += `description: "${recipe.description}"\n`;
  }
  if (recipe.targetUrl) {
    md += `targetUrl: "${recipe.targetUrl}"\n`;
  }
  md += `parameters:\n`;
  for (const p of recipe.parameters) {
    md += `  - key: ${p.key}\n`;
    md += `    label: "${p.label}"\n`;
    md += `    type: ${p.type}\n`;
    if (p.default) md += `    default: "${p.default}"\n`;
    if (p.required) md += `    required: true\n`;
    if (p.options && p.options.length > 0) {
      md += `    options: [${p.options.map(o => `"${o}"`).join(', ')}]\n`;
    }
  }
  md += '---\n\n';

  md += `# ${recipe.title}\n\n`;
  if (recipe.description) {
    md += `> ${recipe.description}\n\n`;
  }

  md += `## 自動化手順\n\n`;
  for (const step of recipe.steps) {
    let line = `${step.order}. `;
    if (step.action === 'click') {
      line += `クリック: \`${step.selector}\` (${step.targetDescription})`;
    } else if (step.action === 'type') {
      line += `入力: \`${step.selector}\` に \`${step.valueTemplate || ''}\` (${step.targetDescription})`;
    } else if (step.action === 'select') {
      line += `選択: \`${step.selector}\` で \`${step.valueTemplate || ''}\` (${step.targetDescription})`;
    } else if (step.action === 'wait') {
      line += `待機: \`${step.valueTemplate || '1000'}ms\` (${step.targetDescription})`;
    } else {
      line += `操作 (${step.action}): \`${step.selector}\` (${step.targetDescription})`;
    }

    if (step.dangerous) {
      line += ` [⚠️要承認]`;
    }
    md += `${line}\n`;
  }

  return md;
}

/**
 * Parse Markdown with Frontmatter back into a WorkflowRecipe
 */
export function parseMarkdownToRecipe(content: string, fallbackId?: string): WorkflowRecipe | null {
  try {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) {
      return null;
    }

    const frontmatterStr = frontmatterMatch[1];
    const bodyStr = content.slice(frontmatterMatch[0].length).trim();

    // Extract title
    const titleMatch = frontmatterStr.match(/title:\s*["']?([^"'\n]+)["']?/);
    const idMatch = frontmatterStr.match(/id:\s*["']?([^"'\n]+)["']?/);
    const descMatch = frontmatterStr.match(/description:\s*["']?([^"'\n]+)["']?/);
    const targetUrlMatch = frontmatterStr.match(/targetUrl:\s*["']?([^"'\n]+)["']?/);

    const title = titleMatch ? titleMatch[1].trim() : '名称未設定ワークフロー';
    const id = idMatch ? idMatch[1].trim() : fallbackId || `recipe-${Date.now()}`;
    const description = descMatch ? descMatch[1].trim() : undefined;
    const targetUrl = targetUrlMatch ? targetUrlMatch[1].trim() : undefined;

    // Parse parameters
    const parameters: WorkflowParameter[] = [];
    const paramBlocks = frontmatterStr.split(/- key:/g).slice(1);
    for (const pb of paramBlocks) {
      const key = pb.split('\n')[0].trim();
      const labelMatch = pb.match(/label:\s*["']?([^"'\n]+)["']?/);
      const typeMatch = pb.match(/type:\s*["']?([^"'\n]+)["']?/);
      const defMatch = pb.match(/default:\s*["']?([^"'\n]+)["']?/);
      const reqMatch = pb.match(/required:\s*(true|false)/i);
      const optMatch = pb.match(/options:\s*\[(.*?)\]/);

      let options: string[] | undefined;
      if (optMatch && optMatch[1]) {
        options = optMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }

      parameters.push({
        key,
        label: labelMatch ? labelMatch[1].trim() : key,
        type: (typeMatch ? typeMatch[1].trim() : 'string') as any,
        default: defMatch ? defMatch[1].trim() : undefined,
        required: reqMatch ? reqMatch[1].toLowerCase() === 'true' : false,
        options,
      });
    }

    // Parse steps from markdown body
    const steps: WorkflowStep[] = [];
    const stepLines = bodyStr.split('\n').filter(l => /^\d+\.\s+/.test(l.trim()));

    let order = 1;
    for (const sl of stepLines) {
      const trimmed = sl.trim().replace(/^\d+\.\s+/, '');
      const dangerous = trimmed.includes('[⚠️要承認]');
      const cleanLine = trimmed.replace('[⚠️要承認]', '').trim();

      let action: any = 'click';
      let selector = '';
      let targetDesc = '';
      let valTemplate: string | undefined;

      const selMatch = cleanLine.match(/`([^`]+)`/);
      if (selMatch) {
        selector = selMatch[1];
      }

      const descMatchInLine = cleanLine.match(/\(([^)]+)\)$/);
      if (descMatchInLine) {
        targetDesc = descMatchInLine[1];
      }

      if (cleanLine.startsWith('クリック:')) {
        action = 'click';
      } else if (cleanLine.startsWith('入力:')) {
        action = 'type';
        const valMatch = cleanLine.match(/に\s*`([^`]+)`/);
        if (valMatch) valTemplate = valMatch[1];
      } else if (cleanLine.startsWith('選択:')) {
        action = 'select';
        const valMatch = cleanLine.match(/で\s*`([^`]+)`/);
        if (valMatch) valTemplate = valMatch[1];
      } else if (cleanLine.startsWith('待機:')) {
        action = 'wait';
      }

      steps.push({
        id: `step-${order}`,
        order,
        action,
        selector: selector || 'body',
        targetDescription: targetDesc || cleanLine,
        valueTemplate: valTemplate,
        dangerous,
        status: 'pending',
      });
      order++;
    }

    return {
      id,
      title,
      description,
      targetUrl,
      parameters,
      steps,
      markdownContent: content,
    };
  } catch (err) {
    console.error('[workflowParser] Failed to parse markdown recipe:', err);
    return null;
  }
}
