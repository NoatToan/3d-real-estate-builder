// Copies the tesseract.js worker, WASM core and language data into public/
// so OCR works offline and without third-party CDNs.
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const out = join(root, "public", "tesseract");

function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`[copy-assets] missing ${from}`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}

copy(join(nm, "tesseract.js/dist/worker.min.js"), join(out, "worker.min.js"));

const coreDir = join(nm, "tesseract.js-core");
if (existsSync(coreDir)) {
  for (const file of readdirSync(coreDir)) {
    // The worker runs with OEM LSTM_ONLY, which only loads the *-lstm.wasm.js builds
    // (the WASM binary is embedded in the .js file).
    if (file.startsWith("tesseract-core") && file.endsWith("-lstm.wasm.js")) {
      copy(join(coreDir, file), join(out, "core", file));
    }
  }
}

for (const lang of ["vie", "eng"]) {
  copy(
    join(nm, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`),
    join(out, "lang", `${lang}.traineddata.gz`),
  );
}

console.log("[copy-assets] tesseract assets ready in public/tesseract");
