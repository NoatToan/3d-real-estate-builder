#!/usr/bin/env bash
# Starts the local image → 3D server on http://127.0.0.1:7860 (first start downloads the model).
set -euo pipefail
cd "$(dirname "$0")/.work"
# shellcheck disable=SC1091
. venv/bin/activate
export HF_HOME="$PWD/hf" U2NET_HOME="$PWD/u2net" PYTORCH_ENABLE_MPS_FALLBACK=1
exec python ../server.py "$@"
