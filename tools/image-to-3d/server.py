"""Local image → 3D server for the furniture library (TripoSR, runs on Apple Silicon / CPU).

POST /generate   body = image bytes (PNG/JPEG/WebP) → model/gltf-binary (GLB, Y-up, metres-agnostic:
                 centred on x/z, standing on y = 0, largest side = 1; the app scales it to the
                 furniture's width × depth × height).
                 Query: resolution=128..320 (marching cubes, default 256), removebg=0|1 (default 1).
GET  /health     → {"ok": true, "device": "mps"}

Only listens on 127.0.0.1. Started by tools/image-to-3d/run.sh.
"""

import io
import json
import logging
import os
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import numpy as np
import rembg
import torch
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".work", "TripoSR"))
from tsr.models import isosurface  # noqa: E402
from tsr.system import TSR  # noqa: E402
from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation  # noqa: E402

PORT = int(os.environ.get("IMAGE3D_PORT", "7860"))
MAX_BYTES = 15 * 1024 * 1024
# Browsers that may call this server (the dev app and the production site).
ALLOWED_ORIGINS = {"http://localhost:3000", "http://127.0.0.1:3000", "https://3d-real-estate-builder-rho.vercel.app"}


def _cpu_marching_cubes(self, level):
    # torchmcubes is built for CPU on macOS and raises RuntimeError (not the AttributeError
    # TripoSR expects) for GPU tensors, so always extract the surface on the CPU.
    level = -level.view(self.resolution, self.resolution, self.resolution)
    v_pos, t_pos_idx = self.mc_func(level.detach().cpu(), 0.0)
    v_pos = v_pos[..., [2, 1, 0]] / (self.resolution - 1.0)
    return v_pos.to(level.device), t_pos_idx.to(level.device)


isosurface.MarchingCubeHelper.forward = _cpu_marching_cubes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"

logging.info("Loading TripoSR on %s …", DEVICE)
t0 = time.time()
MODEL = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
MODEL.renderer.set_chunk_size(8192)
MODEL.to(DEVICE)
# u2netp is a ~5 MB background remover (rembg's default model is ~1 GB).
REMBG = rembg.new_session("u2netp")
LOCK = threading.Lock()  # one generation at a time: the model is not re-entrant and RAM is tight
logging.info("Ready in %.1fs on http://127.0.0.1:%d", time.time() - t0, PORT)


def generate(data: bytes, resolution: int, remove_bg: bool) -> bytes:
    image = Image.open(io.BytesIO(data))
    image.load()
    if remove_bg:
        image = resize_foreground(remove_background(image, REMBG), 0.85)
        arr = np.array(image).astype(np.float32) / 255.0
        arr = arr[:, :, :3] * arr[:, :, 3:4] + (1 - arr[:, :, 3:4]) * 0.5
        image = Image.fromarray((arr * 255.0).astype(np.uint8))
    else:
        image = image.convert("RGB")
    with LOCK, torch.no_grad():
        codes = MODEL([image], device=DEVICE)
        mesh = MODEL.extract_mesh(codes, True, resolution=resolution)[0]
    mesh = to_gradio_3d_orientation(mesh)
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2])
    mesh.apply_scale(1.0 / max(float((hi - lo).max()), 1e-6))
    return mesh.export(file_type="glb")


class Handler(BaseHTTPRequestHandler):
    def _cors(self) -> None:
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        # Lets an HTTPS page reach this loopback server in Chrome (Private Network Access).
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/health":
            return self._json(200, {"ok": True, "device": DEVICE, "model": "stabilityai/TripoSR"})
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        url = urlparse(self.path)
        if url.path != "/generate":
            return self._json(404, {"error": "not found"})
        size = int(self.headers.get("Content-Length") or 0)
        if not 0 < size <= MAX_BYTES:
            return self._json(413, {"error": "Ảnh trống hoặc lớn hơn 15 MB."})
        q = parse_qs(url.query)
        resolution = min(320, max(128, int((q.get("resolution") or ["256"])[0])))
        remove_bg = (q.get("removebg") or ["1"])[0] != "0"
        started = time.time()
        try:
            glb = generate(self.rfile.read(size), resolution, remove_bg)
        except Exception as err:  # bad image, out of memory…
            logging.exception("generation failed")
            return self._json(500, {"error": f"Không tạo được mô hình: {err}"})
        logging.info("Generated %d KB in %.1fs", len(glb) // 1024, time.time() - started)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "model/gltf-binary")
        self.send_header("Content-Length", str(len(glb)))
        self.end_headers()
        self.wfile.write(glb)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
