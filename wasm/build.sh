#!/usr/bin/env bash
# build.sh — Build Asymptote to WebAssembly using Docker + Emscripten.
#
# Prerequisites:
#   - Docker installed and running
#
# Usage:
#   ./wasm/build.sh
#
# Output: dist/asymptote.js, dist/asymptote.wasm, dist/asy.data, and dist/asygl.js

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${REPO_ROOT}/dist"
# Use the verified browser-optimized build by default. Set WASM_PRUNE=baseline
# explicitly to reproduce the unpruned artifact for comparison.
WASM_PRUNE="${WASM_PRUNE:-candidate}"

case "${WASM_PRUNE}" in
  baseline|candidate) ;;
  *)
    echo "WASM_PRUNE must be 'baseline' or 'candidate', got: ${WASM_PRUNE}" >&2
    exit 2
    ;;
esac

# Git Bash can resolve Docker Desktop's Windows credential helper as a Linux
# executable (`/usr/bin/docker-credential-desktop.exe`). The build only pulls
# public images, so use an isolated config without a credential helper. This
# also avoids modifying the user's normal Docker configuration.
DOCKER_CONFIG_DIR="$(mktemp -d)"
trap 'rm -rf "${DOCKER_CONFIG_DIR}"' EXIT
cat > "${DOCKER_CONFIG_DIR}/config.json" <<EOF
{
  "auths": {}
}
EOF

docker_cmd() {
  DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" docker "$@"
}

docker_build() {
  if docker_cmd buildx version >/dev/null 2>&1; then
    docker_cmd buildx build --load "$@"
  else
    echo "WARNING: Docker Buildx is unavailable; using the legacy builder." >&2
    echo "Install Docker Buildx to keep using the modern BuildKit builder." >&2
    DOCKER_BUILDKIT=0 docker_cmd build "$@"
  fi
}

echo "==> Building ${WASM_PRUNE} Asymptote WASM build image…"
docker_build \
  --build-arg "WASM_PRUNE=${WASM_PRUNE}" \
  -t "asymptote-wasm-builder:${WASM_PRUNE}" \
  "${SCRIPT_DIR}"

mkdir -p "${DIST_DIR}"

echo "==> Running build, output → ${DIST_DIR}"
docker_cmd run --rm \
  -v "${DIST_DIR}:/out" \
  "asymptote-wasm-builder:${WASM_PRUNE}"

echo "==> Build complete."
echo "    dist/asymptote.js"
echo "    dist/asymptote.wasm"
echo "    dist/asy.data"
echo "    dist/asygl.js"
