import { AutomationAction, BrowserActionResult } from './automationTypes';

/**
 * Execute a specific browser action on the active tab.
 */
export async function executeBrowserAction(
  tabId?: number,
  action?: AutomationAction
): Promise<BrowserActionResult> {
  const actionId = action?.id || `act-${Date.now()}`;
  const now = Date.now();

  if (!action) {
    return {
      success: false,
      actionId,
      error: 'アクションが指定されていません',
      executedAt: now,
    };
  }

  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
    return {
      success: false,
      actionId,
      error: 'chrome.tabs または chrome.scripting が利用できません',
      executedAt: now,
    };
  }

  let targetTabId = tabId;
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      return {
        success: false,
        actionId,
        error: 'アクティブなタブが見つかりません',
        executedAt: now,
      };
    }
    targetTabId = tab.id;
  }

  // Handle navigate action at the Chrome API level if needed
  if (action.type === 'navigate' && action.url) {
    try {
      await chrome.tabs.update(targetTabId, { url: action.url });
      return {
        success: true,
        actionId,
        message: `ページ遷移を実行しました: ${action.url}`,
        newPageUrl: action.url,
        executedAt: Date.now(),
      };
    } catch (err: any) {
      return {
        success: false,
        actionId,
        error: `URL遷移に失敗しました: ${err.message}`,
        executedAt: Date.now(),
      };
    }
  }

  // Handle wait action
  if (action.type === 'wait') {
    const waitMs = action.amount || 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    return {
      success: true,
      actionId,
      message: `${waitMs}ms 待機しました`,
      executedAt: Date.now(),
    };
  }

  // Execute DOM-level actions (click, type, scroll) inside target tab
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (act: AutomationAction) => {
        // Helper to highlight clicked/interacted element visually
        function highlightTarget(el: HTMLElement, color = '#3b82f6') {
          const originalOutline = el.style.outline;
          const originalBoxShadow = el.style.boxShadow;
          el.style.outline = `3px solid ${color}`;
          el.style.boxShadow = `0 0 12px ${color}`;
          el.style.transition = 'all 0.3s ease';
          setTimeout(() => {
            el.style.outline = originalOutline;
            el.style.boxShadow = originalBoxShadow;
          }, 1200);
        }

        // Locate element by stamped ID or description
        function findTargetElement(): HTMLElement | null {
          if (act.targetId !== undefined) {
            const byId = document.querySelector<HTMLElement>(
              `[data-sidepanel-element-id="${act.targetId}"]`
            );
            if (byId) return byId;
          }
          return null;
        }

        // 1. Scroll action
        if (act.type === 'scroll') {
          const amount = act.amount || 500;
          const top = act.direction === 'up' ? -amount : amount;
          window.scrollBy({ top, behavior: 'smooth' });
          return {
            success: true,
            message: `画面を ${act.direction === 'up' ? '上' : '下'} に ${amount}px スクロールしました`,
          };
        }

        const target = findTargetElement();
        if (!target) {
          return {
            success: false,
            error: `対象要素 [${act.targetId ?? '?'}] が見つかりませんでした。画面が再読み込みされたか要素が消失した可能性があります。`,
          };
        }

        // Ensure visible
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 2. Click action
        if (act.type === 'click') {
          highlightTarget(target, '#10b981'); // emerald
          
          const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
          for (const evName of events) {
            target.dispatchEvent(
              new MouseEvent(evName, {
                bubbles: true,
                cancelable: true,
                view: window,
              })
            );
          }
          if (typeof (target as any).click === 'function') {
            (target as any).click();
          }

          const label = target.innerText?.trim().slice(0, 30) || target.getAttribute('aria-label') || '';
          return {
            success: true,
            message: `[${act.targetId}]「${label || act.targetDescription || target.tagName}」をクリックしました`,
          };
        }

        // 3. Type action
        if (act.type === 'type') {
          highlightTarget(target, '#6366f1'); // indigo
          target.focus();

          const textToType = act.value || '';
          const isInput = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

          if (isInput) {
            // React & standard controlled inputs support via prototype descriptor setter
            const prototype =
              target instanceof HTMLTextAreaElement
                ? window.HTMLTextAreaElement.prototype
                : window.HTMLInputElement.prototype;
            const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

            if (nativeSetter) {
              nativeSetter.call(target, textToType);
            } else {
              target.value = textToType;
            }

            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (target.isContentEditable) {
            target.innerText = textToType;
            target.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            return {
              success: false,
              error: `対象要素 [${act.targetId}] (${target.tagName}) はテキスト入力可能なフィールドではありません`,
            };
          }

          return {
            success: true,
            message: `[${act.targetId}] に「${textToType}」を入力しました`,
          };
        }

        return {
          success: false,
          error: `未知のアクション種別です: ${act.type}`,
        };
      },
      args: [action],
    });

    if (results && results[0] && results[0].result) {
      const res = results[0].result as { success: boolean; message?: string; error?: string };
      return {
        success: res.success,
        actionId,
        message: res.message,
        error: res.error,
        targetId: action.targetId,
        executedAt: Date.now(),
      };
    }

    return {
      success: false,
      actionId,
      error: 'スクリプト実行結果を取得できませんでした',
      executedAt: Date.now(),
    };
  } catch (err: any) {
    console.error('[browserActions] Action execution failed:', err);
    return {
      success: false,
      actionId,
      error: `アクション実行エラー: ${err.message}`,
      executedAt: Date.now(),
    };
  }
}
