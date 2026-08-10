#!/usr/bin/env bash
# build.sh — Build Asymptote to WebAssembly using Docker + Emscripten.
#
# Prerequisites:
#   - Docker installed and running
#
# Usage:
#   ./wasm/build.sh
#
# Output: dist/asymptote.js and dist/asymptote.wasm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"

echo "==> Building Asymptote WASM build image…"
docker build -t asymptote-wasm-builder "${SCRIPT_DIR}"

mkdir -p "${DIST_DIR}"

echo "==> Running build, output → ${DIST_DIR}"
docker run --rm \
  -v "${DIST_DIR}:/out" \
  asymptote-wasm-builder

echo "==> Build complete."
echo "    dist/asymptote.js"
echo "    dist/asymptote.wasm"
