// Turns the Playwright recording of the demo tour (docs/demo/tour.webm) into docs/demo/tour.gif
// for the README (GitHub plays GIFs inline, not repo-hosted videos). Needs ffmpeg on PATH.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";

const src = "docs/demo/tour.webm";
const out = "docs/demo/tour.gif";
if (!existsSync(src)) {
  console.error(`${src} not found — run \`pnpm demo\` first.`);
  process.exit(1);
}
const ff = (args) => {
  const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (r.error || r.status !== 0) {
    console.error("ffmpeg failed (is it installed? brew install ffmpeg)");
    process.exit(1);
  }
};
const filters = "fps=5,scale=960:-1:flags=lanczos";
const palette = "docs/demo/.palette.png";
ff(["-i", src, "-vf", `${filters},palettegen=max_colors=128:stats_mode=diff`, palette]);
ff(["-i", src, "-i", palette, "-lavfi", `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out]);
rmSync(palette);
console.log(`${out}: ${(statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
