/**
 * HTML5 Canvas を使用した画像圧縮・リサイズ・サムネイル生成ユーティリティ
 * webapp-ai-remote (PWA) の実装パターンに準拠し、Claude Vision 推奨の最大長辺1568px・JPEG圧縮を実施
 */

export interface CompressImageOptions {
  /** 最大長辺ピクセル数（デフォルト: 1568px = Claude Vision推奨） */
  maxDim?: number;
  /** JPEG品質（0.0 〜 1.0, デフォルト: 0.82） */
  quality?: number;
  /** サムネイルの最大長辺ピクセル数（デフォルト: 240px） */
  thumbMax?: number;
  /** サムネイルのJPEG品質（デフォルト: 0.65） */
  thumbQuality?: number;
}

export interface CompressedImageResult {
  dataUrl: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

/**
 * 画像（DataURL / Blob / File）をリサイズ・JPEG圧縮し、サムネイルと共に返却する
 */
export async function compressImage(
  source: string | Blob | File,
  options?: CompressImageOptions
): Promise<CompressedImageResult> {
  const maxDim = options?.maxDim ?? 1568;
  const quality = options?.quality ?? 0.82;
  const thumbMax = options?.thumbMax ?? 240;
  const thumbQuality = options?.thumbQuality ?? 0.65;

  return new Promise((resolve, reject) => {
    let srcUrl: string = '';
    let shouldRevoke = false;

    if (typeof source === 'string') {
      srcUrl = source;
    } else {
      srcUrl = URL.createObjectURL(source);
      shouldRevoke = true;
    }

    const img = new Image();

    const cleanup = () => {
      if (shouldRevoke && srcUrl) {
        URL.revokeObjectURL(srcUrl);
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('画像の読み込み・デコードに失敗しました'));
    };

    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;

        if (naturalW === 0 || naturalH === 0) {
          throw new Error('画像の寸法が不正です (0x0)');
        }

        // 1. メイン画像のリサイズ計算（アスペクト比維持）
        let targetW = naturalW;
        let targetH = naturalH;

        if (targetW > maxDim || targetH > maxDim) {
          if (targetW > targetH) {
            targetH = Math.round((targetH * maxDim) / targetW);
            targetW = maxDim;
          } else {
            targetW = Math.round((targetW * maxDim) / targetH);
            targetH = maxDim;
          }
        }

        // メイン Canvas
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2Dコンテキストを取得できませんでした');
        }

        // 透過PNGがJPEG変換で黒背景になるのを防止するため白背景を敷く
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const mimeType = 'image/jpeg';
        const compressedDataUrl = canvas.toDataURL(mimeType, quality);

        // 2. サムネイル Canvas（長辺 240px、タイムライン＆保管用）
        let thumbW = naturalW;
        let thumbH = naturalH;
        if (thumbW > thumbMax || thumbH > thumbMax) {
          if (thumbW > thumbH) {
            thumbH = Math.round((thumbH * thumbMax) / thumbW);
            thumbW = thumbMax;
          } else {
            thumbW = Math.round((thumbW * thumbMax) / thumbH);
            thumbH = thumbMax;
          }
        }

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = thumbW;
        thumbCanvas.height = thumbH;
        const thumbCtx = thumbCanvas.getContext('2d');
        if (thumbCtx) {
          thumbCtx.fillStyle = '#ffffff';
          thumbCtx.fillRect(0, 0, thumbW, thumbH);
          thumbCtx.drawImage(img, 0, 0, thumbW, thumbH);
        }
        const thumbDataUrl = thumbCanvas.toDataURL(mimeType, thumbQuality);

        // おおよそのバイトサイズ
        const base64Len = compressedDataUrl.length - (compressedDataUrl.indexOf(',') + 1);
        const sizeBytes = Math.round((base64Len * 3) / 4);

        cleanup();
        resolve({
          dataUrl: compressedDataUrl,
          thumbnailUrl: thumbDataUrl,
          width: targetW,
          height: targetH,
          sizeBytes,
          mimeType,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    img.src = srcUrl;
  });
}
