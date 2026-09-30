import { WorkflowStep } from './workflowTypes';
import { AutomationAction } from '../automation/automationTypes';
import { executeBrowserAction } from '../automation/browserActions';
import { scanPageInteractiveElements } from '../automation/elementScanner';

/**
 * Resolve dynamic template variables like {{key}}, {{today}}, {{tomorrow}}
 */
export function resolveTemplateValue(
  template?: string,
  params: Record<string, string> = {}
): string {
  if (!template) return '';

  let resolved = template;

  // 1. Replace user parameters {{paramName}}
  for (const [k, v] of Object.entries(params)) {
    const regex = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
    resolved = resolved.replace(regex, v);
  }

  // 2. Built-in dynamic date helpers
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  resolved = resolved.replace(/\{\{\s*today\s*\}\}/gi, todayStr);
  resolved = resolved.replace(/\{\{\s*tomorrow\s*\}\}/gi, tomorrowStr);

  return resolved;
}

/**
 * Execute a single workflow step on the active tab
 */
export async function executeSingleWorkflowStep(
  step: WorkflowStep,
  params: Record<string, string>
): Promise<{ success: boolean; error?: string; message?: string; healedSelector?: string }> {
  const actualValue = resolveTemplateValue(step.valueTemplate, params);

  const action: AutomationAction = {
    id: `act-${step.id}-${Date.now()}`,
    type: step.action,
    selector: step.selector,
    targetDescription: step.targetDescription,
    value: actualValue,
    status: 'pending',
    createdAt: Date.now(),
  };

  // Primary attempt using direct selector
  let result = await executeBrowserAction(undefined, action);

  // If failed and element was not found, attempt self-healing scan
  if (!result.success && result.error && result.error.includes('見つかりませんでした')) {
    console.warn(`[workflowRunner] Step "${step.targetDescription}" failed with selector ${step.selector}. Attempting self-healing...`);
    
    try {
      const scanResult = await scanPageInteractiveElements(undefined, { showOverlay: false });
      if (scanResult && scanResult.elements.length > 0) {
        // Try finding a matching element by text or description similarity
        const searchKeywords = [step.targetDescription, actualValue]
          .filter(Boolean)
          .map(k => k.toLowerCase());

        const candidate = scanResult.elements.find(el => {
          const elText = (el.text || el.ariaLabel || el.placeholder || '').toLowerCase();
          return searchKeywords.some(kw => elText.includes(kw) || kw.includes(elText));
        });

        if (candidate) {
          console.log(`[workflowRunner] Self-healing found candidate element [${candidate.id}] (${candidate.selector})`);
          
          const healedAction: AutomationAction = {
            ...action,
            targetId: candidate.id,
            selector: candidate.selector,
          };
          const healedRes = await executeBrowserAction(undefined, healedAction);
          if (healedRes.success) {
            return {
              success: true,
              message: `(自己修復) ${healedRes.message}`,
              healedSelector: candidate.selector,
            };
          }
        }
      }
    } catch (healErr) {
      console.warn('[workflowRunner] Self-healing attempt failed:', healErr);
    }
  }

  return {
    success: result.success,
    error: result.error,
    message: result.message,
  };
}
