/** Browser-only image helpers for the certificate import. */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif"];

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/** Draws the image rotated clockwise by 0/90/180/270° onto a new canvas. */
export function rotatedCanvas(src: CanvasImageSource & { width: number; height: number }, rotation: 0 | 90 | 180 | 270): HTMLCanvasElement {
  const swap = rotation === 90 || rotation === 270;
  const c = document.createElement("canvas");
  c.width = swap ? src.height : src.width;
  c.height = swap ? src.width : src.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

export interface PreprocessOptions {
  /** Upscale small images so digits are at least ~20px tall. */
  minWidth?: number;
  binarize?: boolean;
}

/** Otsu threshold on a grayscale histogram. */
export function otsuThreshold(hist: ArrayLike<number>, total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Grayscale + contrast stretch (+ optional Otsu binarisation) to help Tesseract. */
export function preprocessForOcr(src: HTMLCanvasElement, { minWidth = 1800, binarize = true }: PreprocessOptions = {}): HTMLCanvasElement {
  const factor = src.width < minWidth ? Math.min(3, minWidth / src.width) : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * factor);
  c.height = Math.round(src.height * factor);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(((d[i] - lo) * 255) / range);
    d[i] = g;
    hist[g]++;
  }
  const t = binarize ? otsuThreshold(hist, d.length / 4) : -1;
  for (let i = 0; i < d.length; i += 4) {
    const g = binarize ? (d[i] > t ? 255 : 0) : d[i];
    d[i] = d[i + 1] = d[i + 2] = g;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  (c as HTMLCanvasElement & { scaleFactor?: number }).scaleFactor = factor;
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), type, quality));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Safe file name from a project name. */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "du-an"
  );
}
