import { createWorker, OEM, PSM, type Worker } from "tesseract.js";
import { extractNumbers, parseCertifiedArea, parseParcelInfo, type OcrNumber, type OcrWord } from "./parse";
import { preprocessForOcr } from "./image";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface OcrProgress {
  status: string;
  progress: number;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  numbers: OcrNumber[];
  certifiedArea: number | null;
  parcelNo: string;
  mapSheetNo: string;
}

let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: OcrProgress) => void) | null = null;

const STATUS_VI: Record<string, string> = {
  "loading tesseract core": "Đang tải bộ nhận dạng…",
  "initializing tesseract": "Đang khởi tạo…",
  "loading language traineddata": "Đang tải dữ liệu ngôn ngữ…",
  "initializing api": "Đang khởi tạo…",
  "recognizing text": "Đang đọc chữ…",
};

function getWorker(): Promise<Worker> {
  workerPromise ??= createWorker(["vie", "eng"], OEM.LSTM_ONLY, {
    workerPath: `${BASE}/tesseract/worker.min.js`,
    corePath: `${BASE}/tesseract/core`,
    langPath: `${BASE}/tesseract/lang`,
    gzip: true,
    logger: (m) => progressListener?.({ status: STATUS_VI[m.status] ?? m.status, progress: m.progress ?? 0 }),
    errorHandler: (e) => console.error("OCR worker error", e),
  }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

export interface OcrRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Runs OCR on (a region of) the rotated certificate canvas. Word boxes are returned in
 * the coordinates of the source canvas.
 */
export async function recognizeCertificate(
  source: HTMLCanvasElement,
  { region, binarize = true, onProgress }: { region?: OcrRegion; binarize?: boolean; onProgress?: (p: OcrProgress) => void } = {},
): Promise<OcrResult> {
  progressListener = onProgress ?? null;
  try {
    let input = source;
    let ox = 0;
    let oy = 0;
    if (region && region.width > 4 && region.height > 4) {
      const crop = document.createElement("canvas");
      crop.width = Math.round(region.width);
      crop.height = Math.round(region.height);
      crop.getContext("2d")!.drawImage(source, region.left, region.top, region.width, region.height, 0, 0, crop.width, crop.height);
      input = crop;
      ox = region.left;
      oy = region.top;
    }
    const prepared = preprocessForOcr(input, { binarize });
    const k = (prepared as HTMLCanvasElement & { scaleFactor?: number }).scaleFactor ?? 1;

    const worker = await getWorker();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const { data } = await worker.recognize(prepared, {}, { text: true, blocks: true });

    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          for (const w of line.words) {
            words.push({
              text: w.text,
              confidence: w.confidence,
              bbox: { x0: w.bbox.x0 / k + ox, y0: w.bbox.y0 / k + oy, x1: w.bbox.x1 / k + ox, y1: w.bbox.y1 / k + oy },
            });
          }
        }
      }
    }
    const text = data.text ?? "";
    return { text, words, numbers: extractNumbers(words), certifiedArea: parseCertifiedArea(text), ...parseParcelInfo(text) };
  } finally {
    progressListener = null;
  }
}

/** Frees the OCR worker (≈ tens of MB of WASM memory). */
export async function disposeOcr(): Promise<void> {
  const w = workerPromise;
  workerPromise = null;
  if (w) await (await w).terminate();
}
