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
# Build Boehm GC with Emscripten (static, threading disabled)
# ---------------------------------------------------------------------------
ARG GC_VERSION=8.2.4
RUN wget -q "https://github.com/ivmai/bdwgc/releases/download/v${GC_VERSION}/gc-${GC_VERSION}.tar.gz" \
    -O /tmp/gc.tar.gz \
    && tar -xzf /tmp/gc.tar.gz -C /tmp \
    && cd /tmp/gc-${GC_VERSION} \
    && emconfigure ./configure \
        --host=wasm32-unknown-emscripten \
        --disable-shared \
        --disable-threads \
        --prefix=/usr/local/emscripten-sysroot \
    && emmake make -j$(nproc) install \
    && rm -rf /tmp/gc*

# ---------------------------------------------------------------------------
# Configure & build Asymptote with Emscripten
# ---------------------------------------------------------------------------
RUN emconfigure ./configure \
    --disable-gl \
    --disable-offscreen \
    --without-readline \
    --without-fftw \
    --without-gsl \
    --without-sigsegv \
    CXXFLAGS="-O2 -DNOSYM -DNO_PARALLEL -DBLOCKING_SLEEP" \
    LDFLAGS="" \
    && emmake make asy -j$(nproc)

# ---------------------------------------------------------------------------
# Link the final WASM module
# ---------------------------------------------------------------------------
RUN emcc \
    -O2 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME="createAsymptoteModule" \
    -s ENVIRONMENT="web,worker" \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s FILESYSTEM=1 \
    -s INVOKE_RUN=0 \
    -s EXIT_RUNTIME=0 \
    -s EXPORTED_RUNTIME_METHODS='["FS","callMain","print","printErr"]' \
    -s EXPORTED_FUNCTIONS='["_main"]' \
    --preload-file base@/usr/local/share/asymptote \
    -o /out/asymptote.js \
    asy.o \
    $(find . -name '*.o' ! -name 'asy.o' | tr '\n' ' ')

CMD ["echo", "Build complete. Output in /out/"]
