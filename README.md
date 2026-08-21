# Asymptote-Web

> Run [Asymptote](https://asymptote.sourceforge.io/) — the powerful vector graphics language — entirely in the browser via **WebAssembly**. No server required. Works on any static website.

---

## Features

- **100 % client-side** — the full Asymptote compiler runs inside the browser via WASM.
- **Zero runtime dependencies** — drop in one JS file + one WASM binary.
- **TypeScript-first** — full type declarations included.
- **SVG output** — inline-ready vector graphics, scales perfectly at any size.*
- **EPS and PostScript output** — return print-oriented output as text.
- **Works everywhere** — Vite, Webpack, esbuild, or plain `<script type="module">`.

*Technically SVGs don't scale perfectly at every size because of math.

---

## Installation

### NPM

```bash
npm install asymptote-web
```

The runtime assets are `asymptote.js`, `asymptote.wasm`, `asy.data`, and
`asygl.js`; keep all four together when serving the package. The published
npm package includes them under `dist/`. If your bundler does not copy package
assets automatically, copy the complete `node_modules/asymptote-web/dist/`
runtime set to your application's public assets. If Vite prebundles the wrapper into
`node_modules/.vite/deps`, pass the actual glue URL explicitly:

```ts
const asy = await createAsymptote({
  glueUrl: "/node_modules/asymptote-web/dist/asymptote.js",
});
```

### CDN (no build step)

```html
<script type="module">
  import { createAsymptote } from "https://cdn.jsdelivr.net/npm/asymptote-web/dist/asymptote-web.js";
  // `asymptote.wasm` is expected at the same URL base as `asymptote-web.js`
</script>
```

---

## Quick start

```ts
import { createAsymptote } from "asymptote-web";

// Load the WASM module once (subsequent calls reuse the cached module).
const asy = await createAsymptote();

// Render Asymptote source → SVG string
const { svg } = await asy.render(`
  size(150);
  draw(unitcircle, blue+2bp);
  dot(origin, red+3bp);
`);

document.querySelector("#output").innerHTML = svg;
```

### Mount directly to a DOM element

```ts
await asy.mount("#output", `
  size(100);
  filldraw(unitsquare, yellow, black);
`);
```

---

## API

The complete function guide is in [docs/api.md](docs/api.md), including
examples for rendering, downloads, batch rendering, WebGL, output formats,
errors, and standalone EPS/PS conversion.

The exact exported TypeScript interfaces are in the [type reference](docs/types.md).

For repeatable render timing comparisons, use the browser
[performance benchmark](docs/performance.md).

### Quick API overview

- `createAsymptote()` initializes the browser WASM engine.
- `render()` returns SVG, EPS, PS, or WebGL HTML.
- `renderToBlob()` returns rendered output as a browser `Blob`.
- `renderBatch()` renders several sources sequentially.
- `download()` triggers a browser download.
- `mount()` inserts SVG into an element.
- `mountWebGL()` embeds an interactive 3D viewer.
- `epsToSvg()` and `psToSvg()` convert standalone PostScript output.

See [docs/api.md](docs/api.md) for usage guidance and [docs/types.md](docs/types.md)
for the complete type signatures.

## Building from source

### Prerequisites

- [Docker](https://www.docker.com/) (for the Emscripten + Asymptote WASM build)
- [Node.js](https://nodejs.org/) ≥ 18 (for the TypeScript wrapper build)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/Julieisbaka/asymptote.git
cd asymptote

# 2. Build the Asymptote WASM binary
#    This compiles Asymptote's C++ source with Emscripten inside Docker.
./wasm/build.sh
#    → produces dist/asymptote.js and dist/asymptote.wasm

# 3. Install JS dependencies
npm install

# 4. Build the TypeScript wrapper
npm run build
#    → produces dist/asymptote-web.js and dist/asymptote-web.d.ts

# 5. Open the demo
open examples/index.html   # or serve the project root with any static server
```

---

## Server headers

The WASM runtime uses Emscripten's `PTHREAD` feature. Your server must send
these headers so browsers expose `SharedArrayBuffer`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, single-threaded mode is used automatically, which is fine for most use-cases.

---

## How it works

1. **Asymptote** is compiled from C++ to WebAssembly using [Emscripten](https://emscripten.org/) and a set of patches that remove unsupported features and add browser-friendly fallbacks.
2. An in-memory virtual filesystem (Emscripten's MEMFS) is used to pass the `.asy` source file to the compiler and read back the `.svg` output — no real filesystem access needed.
3. Asymptote's `base/` standard library is bundled into the WASM binary at build time via Emscripten's `--preload-file` flag.
4. The TypeScript wrapper provides a clean Promise-based API on top of the low-level Emscripten module.

---

## Known limitations

- 3D scenes render via WebGL (`format: "webgl"` / `mountWebGL()`), but text labels within 3D scenes are unsupported (same `-tex none` limitation as 2D), and the binary v3d/PRC export format is not supported.
- Browser builds report `convert()` and `animate()` as unavailable instead of attempting to launch ImageMagick or an external viewer.
- Browser-provided imports and assets can be mounted with the `render()` `files` option; host filesystem paths are not accessible.
- Explicit `texsize()` calls use approximate native metrics, while `texpath()` reports unavailable because TeX shaping is not bundled.
- PDF output is deliberately stubbed in browser WebAssembly and reports a clear error because Ghostscript is not bundled; use SVG, EPS, PS, or WebGL instead.
- Trusted pre-rendered LaTeX SVG can be inserted with the opt-in `asy.unsafe.mount()` DOM hook.
- WebGL supports basic camera-facing screen-space labels through `webglLabels`; world-coordinate labels require `asy.unsafe.mountWebGL()` customization.

---

## License

LGPL-3.0 — same as Asymptote itself.
