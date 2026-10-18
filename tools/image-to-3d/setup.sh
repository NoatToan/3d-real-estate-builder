#!/usr/bin/env bash
# Installs TripoSR (stabilityai/TripoSR, MIT) for local image → 3D on Apple Silicon or CPU.
# Everything (code, venv, weights) lives in ./.work — delete that folder to uninstall.
# Needs ~3 GB free disk: PyTorch ~1.1 GB, model ~1.6 GB, background-removal model ~5 MB.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .work && cd .work
[[ -d TripoSR ]] || git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git
[[ -d venv ]] || uv venv -p 3.12 venv
# shellcheck disable=SC1091
. venv/bin/activate
uv pip install torch torchvision "omegaconf==2.3.0" "einops==0.7.0" "transformers==4.35.0" trimesh \
  rembg onnxruntime huggingface-hub pillow xatlas scikit-build-core pybind11 cmake ninja setuptools wheel
# Marching cubes extension (compiled; CPU build on macOS).
uv pip install --no-build-isolation git+https://github.com/tatsy/torchmcubes.git
echo "Done. Start the server with: tools/image-to-3d/run.sh"
