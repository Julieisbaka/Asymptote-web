# Asymptote-Web

> Run [Asymptote](https://asymptote.sourceforge.io/) — the powerful vector graphics language — entirely in the browser via **WebAssembly**. No server required. Works on any static website.

---

## Features

- 🖥 **100 % client-side** — the full Asymptote compiler runs inside the browser via WASM.
- 📦 **Zero runtime dependencies** — drop in one JS file + one WASM binary.
- 🔷 **TypeScript-first** — full type declarations included.
- 🖼 **SVG output** — inline-ready vector graphics, scales perfectly at any size.
- 🧩 **Works everywhere** — Vite, Webpack, esbuild, or plain `<script type="module">`.

---

## Installation

### NPM

```bash
npm install asymptote-web
```

Then copy `node_modules/asymptote-web/dist/asymptote.wasm` next to wherever you serve `asymptote-web.js` (bundlers usually handle this automatically).

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

### `createAsymptote(options?)`

Loads the Asymptote WASM module and returns an [`AsymptoteEngine`](#asymptoteengine).

| Option | Type | Default | Description |
|---|---|---|---|
| `wasmUrl` | `string` | auto | Override the path/URL of `asymptote.wasm`. Useful when the WASM file is on a CDN or at a non-standard path. |

```ts
const asy = await createAsymptote({
  wasmUrl: "https://example.com/assets/asymptote.wasm",
});
```

---

### `AsymptoteEngine`

#### `render(source, options?)`

Compiles `source` and returns a `Promise<RenderResult>`.

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `"svg"` | `"svg"` | Output format (only `svg` is browser-safe). |
| `flags` | `string[]` | `[]` | Extra CLI flags forwarded to `asy`. |

```ts
const { svg, warnings } = await asy.render("size(50); draw(unitcircle);");
```

#### `mount(target, source, options?)`

Renders `source` and sets `target.innerHTML` to the resulting SVG.

`target` can be a CSS selector string or an `Element`.

---

### `RenderResult`

```ts
interface RenderResult {
  svg: string;        // Rendered SVG markup
  warnings: string[]; // Non-fatal warnings from Asymptote
}
```

---

### `AsymptoteError`

Thrown when Asymptote exits with a non-zero status.

```ts
import { AsymptoteError } from "asymptote-web";

try {
  await asy.render("this is not valid asymptote code @@@@");
} catch (err) {
  if (err instanceof AsymptoteError) {
    console.error("Exit code:", err.exitCode);
    console.error("Stderr:", err.stderr);
  }
}
```

---

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

## Server headers (optional)

If you want to enable multi-threading inside the WASM module (Emscripten's `PTHREAD` feature, not enabled by default), your server must send:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these headers, single-threaded mode is used automatically, which is fine for most use-cases.

---

## How it works

1. **Asymptote** is compiled from C++ to WebAssembly using [Emscripten](https://emscripten.org/).
2. An in-memory virtual filesystem (Emscripten's MEMFS) is used to pass the `.asy` source file to the compiler and read back the `.svg` output — no real filesystem access needed.
3. Asymptote's `base/` standard library is bundled into the WASM binary at build time via Emscripten's `--preload-file` flag.
4. The TypeScript wrapper provides a clean Promise-based API on top of the low-level Emscripten module.

---

## License

LGPL-3.0 — same as Asymptote itself.
