import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import {
  ContextAttachment,
  ExtractionMode,
  WARNING_CHAR_THRESHOLD,
  DANGER_CHAR_THRESHOLD,
} from '../ai/aiRemoteTypes';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  hr: '---',
});

// Remove unnecessary tags from turndown
turndownService.remove(['script', 'style', 'noscript', 'iframe', 'svg' as any]);

export interface ExtractedPageData {
  title: string;
  url: string;
  selection: string;
  html: string;
  innerText: string;
}

/**
 * Format character count into human readable string (e.g. 1.2万字, 850字)
 */
export function formatCharCount(chars: number): string {
  if (chars >= 10000) {
    return `${(chars / 10000).toFixed(1)}万字`;
  }
  return `${chars.toLocaleString()}字`;
}

/**
 * Estimate tokens based on Japanese / mixed text (~3 chars per token)
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3);
}

/**
 * Determine warning level based on character count and mode
 */
export function getWarningLevel(chars: number, mode: ExtractionMode): 'none' | 'warning' | 'danger' {
  if (mode === 'screenshot') return 'none';
  if (chars >= DANGER_CHAR_THRESHOLD) return 'danger';
  if (chars >= WARNING_CHAR_THRESHOLD || mode === 'raw_html') return 'warning';
  return 'none';
}

/**
 * Capture visible tab screenshot via chrome.tabs.captureVisibleTab
 */
export async function captureActiveTabScreenshot(): Promise<{
  dataUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  title: string;
  url: string;
} | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    console.warn('[contentExtractor] chrome.tabs not available');
    return null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return null;
  }

  const title = tab.title || 'Untitled Page';
  const url = tab.url || '';

  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(
      tab.windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          console.error('[contentExtractor] captureVisibleTab failed:', chrome.runtime.lastError);
          resolve(null);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;

          // Generate lightweight thumbnail (~10-20KB JPEG) for timeline and storage
          let thumbUrl = '';
          try {
            const maxDim = 320;
            let tw = width;
            let th = height;
            if (tw > maxDim || th > maxDim) {
              if (tw > th) {
                th = Math.round((th * maxDim) / tw);
                tw = maxDim;
              } else {
                tw = Math.round((tw * maxDim) / th);
                th = maxDim;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, tw, th);
              thumbUrl = canvas.toDataURL('image/jpeg', 0.65);
            }
          } catch {}

          resolve({
            dataUrl,
            thumbnailUrl: thumbUrl || dataUrl,
            width,
            height,
            title,
            url,
          });
        };
        img.onerror = () => {
          // If image dimension fails, still return with fallback 1920x1080
          resolve({
            dataUrl,
            thumbnailUrl: dataUrl,
            width: 1920,
            height: 1080,
            title,
            url,
          });
        };
        img.src = dataUrl;
      }
    );
  });
}

/**
 * Build a ContextAttachment for a screenshot
 */
export function buildScreenshotAttachment(
  dataUrl: string,
  width: number,
  height: number,
  title: string = 'タブ画面スクショ',
  url: string = '',
  thumbnailUrl?: string
): ContextAttachment {
  const contentMarkdown = `# 📸 画面スクリーンショット: ${title}\n- URL: ${url}\n- 撮影日時: ${new Date().toLocaleString('ja-JP')}\n- 解像度: ${width}x${height} px\n\n> 添付された画面スクリーンショット画像（${width}x${height}）を参照し、画面内のUI、レイアウト、文言、要素の配置を視覚的に読み取って回答または手順書作成を行ってください。`;

  return {
    id: `screenshot_${Date.now()}`,
    type: 'screenshot',
    title: `📸 スクショ: ${title}`,
    url,
    badge: `📸 ${width}x${height}`,
    subtitle: url || `${width}x${height} px`,
    contentMarkdown,
    imageDataUrl: dataUrl,
    thumbnailUrl: thumbnailUrl || dataUrl,
    imageDimensions: { width, height },
    extractedAt: Date.now(),
    mode: 'screenshot',
    charCount: contentMarkdown.length,
    warningLevel: 'none',
  };
}

/**
 * Query active tab and extract DOM/selection via chrome.scripting
 */
export async function extractActiveTabRawData(): Promise<ExtractedPageData | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    console.warn('[contentExtractor] chrome.tabs not available');
    return null;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id || !tab.url) {
    return null;
  }

  // Skip browser internal pages where content scripts are restricted
  if (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('edge://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('devtools://')
  ) {
    return {
      title: tab.title || 'ブラウザ内部ページ',
      url: tab.url,
      selection: '',
      html: '',
      innerText: '※ ブラウザ内部ページ（設定・拡張一覧など）の内容はセキュリティ保護のため取得できません。',
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selection = window.getSelection()?.toString().trim() || '';
        const title = document.title || '';
        const url = window.location.href;
        // Limit HTML size to ~5MB to avoid memory overflow on gigantic pages
        const rawHtml = document.documentElement ? document.documentElement.outerHTML.slice(0, 5000000) : '';
        const innerText = document.body ? document.body.innerText.slice(0, 200000) : '';
        return { selection, title, url, html: rawHtml, innerText };
      },
    });

    if (results && results[0] && results[0].result) {
      return results[0].result as ExtractedPageData;
    }
  } catch (err) {
    console.error('[contentExtractor] Failed to executeScript on tab:', err);
    return {
      title: tab.title || '取得エラー',
      url: tab.url,
      selection: '',
      html: '',
      innerText: `タブのDOM取得に失敗しました: ${(err as Error).message}`,
    };
  }

  return null;
}

/**
 * Convert extracted page data to a ContextAttachment based on extraction mode
 */
export function buildContextAttachment(
  data: ExtractedPageData,
  mode: ExtractionMode = 'readability'
): ContextAttachment {
  const title = data.title || 'Untitled Page';
  const url = data.url || '';
  let contentMarkdown = '';
  let actualMode = mode;

  // 1. Selection mode
  if (mode === 'selection' || (data.selection && data.selection.length > 0 && mode !== 'raw_html' && mode !== 'readability')) {
    if (data.selection && data.selection.length > 0) {
      actualMode = 'selection';
      contentMarkdown = `# 選択テキスト: ${title}\n- URL: ${url}\n\n${data.selection}`;
    }
  }

  // 2. Readability mode
  if (!contentMarkdown && mode === 'readability') {
    try {
      if (data.html && typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.html, 'text/html');

        const reader = new Readability(doc);
        const article = reader.parse();

        if (article && article.content) {
          const articleMd = turndownService.turndown(article.content);
          contentMarkdown = `# ${article.title || title}\n- URL: ${url}\n${article.byline ? `- 著者: ${article.byline}\n` : ''}\n---\n\n${articleMd}`;
        }
      }
    } catch (e) {
      console.warn('[contentExtractor] Readability parse failed, falling back to innerText', e);
    }

    // Fallback if readability produced empty content
    if (!contentMarkdown) {
      contentMarkdown = `# ${title}\n- URL: ${url}\n\n${data.innerText || '本文が見つかりませんでした。'}`;
    }
  }

  // 3. Raw HTML mode
  if (!contentMarkdown && mode === 'raw_html') {
    actualMode = 'raw_html';
    contentMarkdown = `<!-- Raw HTML for: ${title} (${url}) -->\n${data.html}`;
  }

  const charCount = contentMarkdown.length;
  const warningLevel = getWarningLevel(charCount, actualMode);
  const warnIcon = warningLevel === 'danger' ? '⛔ ' : warningLevel === 'warning' ? '⚠️ ' : '';
  const badge = `${warnIcon}${formatCharCount(charCount)} (${actualMode === 'readability' ? '本文抽出' : actualMode === 'selection' ? '選択範囲' : '生HTML'})`;

  return {
    id: `tab_${Date.now()}`,
    type: actualMode === 'selection' ? 'selection' : (actualMode === 'raw_html' ? 'raw_html' : 'tab_page'),
    title: actualMode === 'selection' ? `選択部分:「${data.selection.slice(0, 20)}...」` : title,
    url,
    badge,
    subtitle: url,
    contentMarkdown,
    rawHtml: data.html,
    extractedAt: Date.now(),
    mode: actualMode,
    charCount,
    warningLevel,
  };
}
