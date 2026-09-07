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
# Use the proven browser-optimized build by default. Pass "candidate" as the
# first argument, or set WASM_PRUNE=candidate, to include experimental patches.
WASM_PRUNE="${1:-${WASM_PRUNE:-baseline}}"
# Candidate patch basenames to apply. Use "all" (the default) or a
# comma-separated list such as "remove-lsp-objects.py".
WASM_CANDIDATES="${2:-${WASM_CANDIDATES:-all}}"
# Docker Buildx cache backend to use for the image build (e.g. "gha" for
# GitHub Actions' cache). Defaults to "gha" when running in GitHub Actions
# with the documented runtime variables present, and to no remote cache
# otherwise. Preserve an explicitly supplied value, including an empty value.
if [ -z "${WASM_CACHE+x}" ]; then
  if [ "${GITHUB_ACTIONS:-false}" = "true" ] && [ -n "${ACTIONS_RUNTIME_TOKEN:-}" ] && [ -n "${ACTIONS_RESULTS_URL:-}" ]; then
    WASM_CACHE="gha"
  else
    WASM_CACHE=""
  fi
fi

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
# also avoids modifying the user's normal Docker configuration. Keep the
# Buildx metadata in a separate location so the action-created builder is still
# visible to `docker buildx`.
DOCKER_CONFIG_DIR="$(mktemp -d)"
BUILDX_CONFIG="${BUILDX_CONFIG:-${DOCKER_CONFIG_DIR}/buildx}"
mkdir -p "${BUILDX_CONFIG}"
trap 'rm -rf "${DOCKER_CONFIG_DIR}"' EXIT
cat > "${DOCKER_CONFIG_DIR}/config.json" <<EOF
{
  "auths": {}
}
EOF

docker_cmd() {
  DOCKER_CONFIG="${DOCKER_CONFIG_DIR}" BUILDX_CONFIG="${BUILDX_CONFIG}" docker "$@"
}

docker_build() {
  if docker_cmd buildx version >/dev/null 2>&1; then
    local cache_args=()
    if [ -n "${WASM_CACHE}" ]; then
      # Scope the cache by WASM_PRUNE so baseline and candidate builds don't
      # evict each other's cached layers.
      cache_args=(
        "--cache-from" "type=${WASM_CACHE},scope=wasm-${WASM_PRUNE}"
        "--cache-to" "type=${WASM_CACHE},mode=max,scope=wasm-${WASM_PRUNE}"
      )
    fi
    docker_cmd buildx build --load "${cache_args[@]}" "$@"
  else
    echo "WARNING: Docker Buildx is unavailable; using the legacy builder." >&2
    echo "Install Docker Buildx to keep using the modern BuildKit builder." >&2
    DOCKER_BUILDKIT=0 docker_cmd build "$@"
  fi
}

echo "==> Building ${WASM_PRUNE} Asymptote WASM build image…"
docker_build \
  --build-arg "WASM_PRUNE=${WASM_PRUNE}" \
  --build-arg "WASM_CANDIDATES=${WASM_CANDIDATES}" \
  -t "asymptote-wasm-builder:${WASM_PRUNE}" \
  "${SCRIPT_DIR}"

mkdir -p "${DIST_DIR}"

echo "==> Running build, output → ${DIST_DIR}"
docker_cmd run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${DIST_DIR}:/out" \
  "asymptote-wasm-builder:${WASM_PRUNE}"

echo "==> Build complete."
echo "    dist/asymptote.js"
echo "    dist/asymptote.wasm"
echo "    dist/asy.data"
echo "    dist/asygl.js"
