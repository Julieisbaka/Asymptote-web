# Build environment for compiling Asymptote to WebAssembly via Emscripten.
#
# Usage:
#   docker build -t asymptote-wasm-builder ./wasm
#   docker run --rm -v $(pwd)/dist:/out asymptote-wasm-builder
#
# The build outputs asymptote.js + asymptote.wasm into /out.

FROM emscripten/emsdk:3.1.51

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

# ---------------------------------------------------------------------------
# Copy patches and apply them
# ---------------------------------------------------------------------------
COPY patches/ /patches/
RUN for p in /patches/*.patch; do \
      [ -f "$p" ] && patch -p1 < "$p" || true; \
    done

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
    CXXFLAGS="-O2 -DNO_PARALLEL -DBLOCKING_SLEEP" \
    LDFLAGS="-sUSE_ZLIB=1" \
    && emmake make asy -j$(nproc) \
        LFLAGS="-sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createAsymptoteModule -sENVIRONMENT=web,worker -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=1 -sINVOKE_RUN=0 -sEXIT_RUNTIME=0 -sEXPORTED_RUNTIME_METHODS=['FS','callMain','print','printErr'] -sEXPORTED_FUNCTIONS=['_main'] --preload-file base@/usr/local/share/asymptote"

CMD ["sh", "-c", "cp asy /out/asymptote.js && cp asy.wasm /out/asymptote.wasm && echo 'Build complete. Output in /out/'"]
