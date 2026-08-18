# Build environment for compiling Asymptote to WebAssembly via Emscripten.
#
# Usage:
#   docker build -t asymptote-wasm-builder ./wasm
#   docker run --rm -v $(pwd)/dist:/out asymptote-wasm-builder
#
# The build outputs asymptote.js, asymptote.wasm, and asy.data into /out.

FROM emscripten/emsdk:6.0.7

# ---------------------------------------------------------------------------
# System dependencies needed to build Asymptote
# ---------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    bison \
    flex \
    git \
    libgc-dev \
    libfftw3-dev \
    libglm-dev \
    libgsl-dev \
    libreadline-dev \
    libtool \
    pkg-config \
    python3 \
    wget \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Download Asymptote source
# ---------------------------------------------------------------------------
ARG ASY_VERSION=3.13
RUN wget -q "https://sourceforge.net/projects/asymptote/files/${ASY_VERSION}/asymptote-${ASY_VERSION}.src.tgz" \
    -O /tmp/asymptote.tar.gz \
    && tar -xzf /tmp/asymptote.tar.gz -C /tmp \
    && mv /tmp/asymptote-${ASY_VERSION} /src/asymptote \
    && rm /tmp/asymptote.tar.gz

WORKDIR /src/asymptote

# This argument is deliberately consumed by a build step below. It separates
# Docker cache keys for an unmodified baseline and a source-pruned candidate.
# Valid values are "baseline" and "candidate". The candidate is the
# browser-optimized default; baseline remains available for size comparisons.
ARG WASM_PRUNE=candidate

# glm is header-only; vendor just the glm/ subtree (not all of /usr/include,
# which would shadow emscripten's own libc headers with the host's glibc).
RUN mkdir -p backports/glm-headers && cp -r /usr/include/glm backports/glm-headers/

# ---------------------------------------------------------------------------
# Copy patches and apply them
# ---------------------------------------------------------------------------
COPY patches/ /patches/
RUN set -eux; \
        for p in /patches/*.patch; do \
            [ -e "$p" ] || continue; \
            patch --batch --forward -p1 < "$p"; \
    done
# Python-based patches: targeted source replacements too awkward to express
# as clean unified diffs (e.g. swapping out a whole function body).
RUN set -eux; \
        for p in /patches/*.py; do \
            [ -e "$p" ] || continue; \
            python3 "$p"; \
    done
# Candidate-only source changes are never applied to the baseline. Consuming
# WASM_PRUNE here prevents Docker from reusing a baseline configuration/build
# layer for a candidate artifact.
RUN set -eux; \
        test "$WASM_PRUNE" = baseline || test "$WASM_PRUNE" = candidate; \
        if [ "$WASM_PRUNE" = candidate ]; then \
            for p in /patches/candidate/*.patch; do \
                [ -e "$p" ] || continue; \
                patch --batch --forward -p1 < "$p"; \
            done; \
            for p in /patches/candidate/*.py; do \
                [ -e "$p" ] || continue; \
                python3 "$p"; \
            done; \
        fi

# ---------------------------------------------------------------------------
# Configure & build Asymptote with Emscripten
# ---------------------------------------------------------------------------
RUN emconfigure ./configure \
    --disable-gl \
    --disable-vulkan \
    --disable-offscreen \
    --disable-gc \
    --disable-lsp \
    --without-readline \
    --without-fftw \
    --without-gsl \
    --without-sigsegv \
    CXXFLAGS="-O2 -flto -DNO_PARALLEL -DBLOCKING_SLEEP -fexceptions -sDISABLE_EXCEPTION_CATCHING=0 -Ibackports/glm-headers" \
    LDFLAGS="-flto -sUSE_ZLIB=1 -fexceptions -sDISABLE_EXCEPTION_CATCHING=0" \
    && emmake make asy -j$(nproc) \
        LFLAGS="-flto -sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAsymptoteModule -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=134217728 -sMAXIMUM_MEMORY=2147483648 -sSTACK_SIZE=16777216 -sDISABLE_EXCEPTION_CATCHING=0 -fexceptions -sASSERTIONS=0 -sFILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=['FS','callMain','print','printErr'] -sEXPORTED_FUNCTIONS=['_main'] --preload-file base@/usr/local/share/asymptote"

CMD ["sh", "-c", "cp asy /out/asymptote.js && cp asy.wasm /out/asymptote.wasm && cp asy.data /out/asy.data && cp base/webgl/asygl.js /out/asygl.js && echo 'Build complete. Output in /out/'"]
