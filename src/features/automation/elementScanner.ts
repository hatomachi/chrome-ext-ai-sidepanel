import { InteractiveElement, AutomationScanResult, ScanOptions } from './automationTypes';

/**
 * Scan interactive elements on the target tab and display temporary number badges.
 */
export async function scanPageInteractiveElements(
  tabId?: number,
  options: ScanOptions = {}
): Promise<AutomationScanResult | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
    console.warn('[elementScanner] chrome.tabs or chrome.scripting not available');
    return null;
  }

  let targetTabId = tabId;
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return null;
    targetTabId = tab.id;
  }

  const {
    showOverlay = true,
    highlightDurationMs = 5000,
    maxElements = 80,
  } = options;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (showOverlayArg: boolean, durationMs: number, maxCount: number) => {
        // 1. Remove any existing overlay
        const existingOverlay = document.getElementById('__sidepanel_automation_overlay__');
        if (existingOverlay) {
          existingOverlay.remove();
        }

        // 2. Select interactive elements
        const selectorList = [
          'button',
          'a[href]',
          'input:not([type="hidden"])',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="checkbox"]',
          '[role="tab"]',
          '[role="menuitem"]',
          '[role="switch"]',
          'summary',
          '[onclick]',
        ];

        const rawElements = Array.from(
          document.querySelectorAll<HTMLElement>(selectorList.join(', '))
        );

        const items: {
          id: number;
          tagName: string;
          type?: string;
          text: string;
          selector: string;
          role?: string;
          ariaLabel?: string;
          placeholder?: string;
          href?: string;
          rect: { top: number; left: number; width: number; height: number };
          isVisible: boolean;
        }[] = [];

        let currentId = 1;

        // Overlay container setup
        let overlayContainer: HTMLElement | null = null;
        if (showOverlayArg) {
          overlayContainer = document.createElement('div');
          overlayContainer.id = '__sidepanel_automation_overlay__';
          overlayContainer.style.position = 'absolute';
          overlayContainer.style.top = '0';
          overlayContainer.style.left = '0';
          overlayContainer.style.width = '100%';
          overlayContainer.style.height = `${document.documentElement.scrollHeight}px`;
          overlayContainer.style.pointerEvents = 'none';
          overlayContainer.style.zIndex = '2147483640';
          overlayContainer.style.transition = 'opacity 0.4s ease';
        }

        // Helper to generate a relatively stable selector
        function getCssSelector(el: HTMLElement): string {
          if (el.id) return `#${el.id}`;
          const testId = el.getAttribute('data-testid');
          if (testId) return `[data-testid="${testId}"]`;
          const name = el.getAttribute('name');
          if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
          
          let path = el.tagName.toLowerCase();
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(/\s+/).filter(c => c && !c.includes(':') && !c.includes('/'));
            if (classes.length > 0) {
              path += `.${classes.slice(0, 2).join('.')}`;
            }
          }
          return path;
        }

        for (const el of rawElements) {
          if (items.length >= maxCount) break;

          // Check visibility
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const style = window.getComputedStyle(el);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0'
          ) {
            continue;
          }

          // Extract text label
          let text = '';
          const tagName = el.tagName.toLowerCase();
          const type = (el as HTMLInputElement).type;
          const ariaLabel = el.getAttribute('aria-label') || undefined;
          const placeholder = (el as HTMLInputElement).placeholder || undefined;
          const href = (el as HTMLAnchorElement).href || undefined;
          const role = el.getAttribute('role') || undefined;

          if (tagName === 'input' || tagName === 'textarea') {
            const inputEl = el as HTMLInputElement;
            text = ariaLabel || placeholder || inputEl.name || inputEl.value || inputEl.title || '';
          } else {
            text = ariaLabel || el.innerText || el.getAttribute('title') || '';
          }

          // Clean text
          text = text.replace(/\s+/g, ' ').trim().slice(0, 80);

          // Skip completely empty links/buttons without meaningful labels or children
          if (!text && !ariaLabel && !placeholder && !type) {
            continue;
          }

          const elemId = currentId++;

          // Stamp custom data attribute on DOM element for guaranteed lookup during action execution
          el.setAttribute('data-sidepanel-element-id', String(elemId));

          const absTop = rect.top + window.scrollY;
          const absLeft = rect.left + window.scrollX;

          items.push({
            id: elemId,
            tagName,
            type,
            text,
            selector: getCssSelector(el),
            role,
            ariaLabel,
            placeholder,
            href,
            rect: {
              top: Math.round(absTop),
              left: Math.round(absLeft),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            isVisible: true,
          });

          // Draw visual badge if overlay is enabled
          if (overlayContainer) {
            const badge = document.createElement('div');
            badge.innerText = `[${elemId}]`;
            badge.style.position = 'absolute';
            badge.style.top = `${Math.max(0, absTop - 2)}px`;
            badge.style.left = `${Math.max(0, absLeft - 2)}px`;
            badge.style.backgroundColor = '#f59e0b';
            badge.style.color = '#000000';
            badge.style.fontFamily = 'monospace, sans-serif';
            badge.style.fontSize = '11px';
            badge.style.fontWeight = '700';
            badge.style.padding = '1px 4px';
            badge.style.borderRadius = '3px';
            badge.style.border = '1px solid #78350f';
            badge.style.boxShadow = '0 1px 4px rgba(0,0,0,0.3)';
            badge.style.pointerEvents = 'none';
            badge.style.lineHeight = '1.2';
            badge.style.zIndex = '2147483647';
            overlayContainer.appendChild(badge);
          }
        }

        if (overlayContainer && document.body) {
          document.body.appendChild(overlayContainer);

          // Auto remove overlay after duration
          if (durationMs > 0) {
            setTimeout(() => {
              const current = document.getElementById('__sidepanel_automation_overlay__');
              if (current) {
                current.style.opacity = '0';
                setTimeout(() => current.remove(), 400);
              }
            }, durationMs);
          }
        }

        return {
          elements: items,
          pageTitle: document.title || '',
          pageUrl: window.location.href,
          scannedAt: Date.now(),
        };
      },
      args: [showOverlay, highlightDurationMs, maxElements],
    });

    if (results && results[0] && results[0].result) {
      return results[0].result as AutomationScanResult;
    }
  } catch (err) {
    console.error('[elementScanner] Failed to scan interactive elements:', err);
  }

  return null;
}

/**
 * Remove visual overlay badges from the page immediately.
 */
export async function clearElementBadges(tabId?: number): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
    return;
  }

  let targetTabId = tabId;
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    targetTabId = tab.id;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: () => {
        const overlay = document.getElementById('__sidepanel_automation_overlay__');
        if (overlay) {
          overlay.remove();
        }
      },
    });
  } catch (err) {
    console.warn('[elementScanner] Failed to clear overlay badges:', err);
  }
}
