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

echo "==> Building Asymptote WASM build image…"
docker_cmd build -t asymptote-wasm-builder "${SCRIPT_DIR}"

mkdir -p "${DIST_DIR}"

echo "==> Running build, output → ${DIST_DIR}"
docker_cmd run --rm \
  -v "${DIST_DIR}:/out" \
  asymptote-wasm-builder

echo "==> Build complete."
echo "    dist/asymptote.js"
echo "    dist/asymptote.wasm"
echo "    dist/asy.data"
echo "    dist/asygl.js"
