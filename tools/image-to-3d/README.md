# Local image → 3D (TripoSR)

Turns a photo of a piece of furniture into a 3D model (GLB) on this machine, so the app can add
it to the furniture library. Runs [stabilityai/TripoSR](https://huggingface.co/stabilityai/TripoSR)
(MIT licence) on the Apple Silicon GPU (MPS) or the CPU; no NVIDIA GPU or cloud API needed.

```bash
tools/image-to-3d/setup.sh   # once: clones TripoSR + Python 3.12 venv into .work/ (~3 GB with the model)
tools/image-to-3d/run.sh     # starts http://127.0.0.1:7860 (first start downloads the model, ~1.6 GB)

curl --data-binary @chair.png "http://127.0.0.1:7860/generate?resolution=192" -o chair.glb
```

- `POST /generate` — body is the image (PNG/JPEG/WebP, ≤ 15 MB). Background is removed with rembg
  (`u2netp`, 5 MB). Query: `resolution` 128–320 (detail vs. time, default 256), `removebg=0` to skip.
  Returns a Y-up GLB with vertex colours, centred, standing on y = 0, largest side = 1.
- `GET /health` — `{"ok": true, "device": "mps"}`.
- Listens on 127.0.0.1 only; CORS allows the local dev app and the production site.

Measured on an Apple M4 / 16 GB: model load 4 s (after the first download), **3–5 s per image** at
resolution 192, ~5 GB peak RAM. Uninstall by deleting `tools/image-to-3d/.work/`.

Models that were checked but do not fit this machine: TRELLIS / TRELLIS.2 and Hunyuan3D-2.1 (need an
NVIDIA GPU with CUDA), Stable Fast 3D (gated, non-commercial-above-threshold licence).
