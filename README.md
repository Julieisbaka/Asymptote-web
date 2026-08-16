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

For a complete description of the exported TypeScript types, see the
[type reference](docs/types.md).

### `createAsymptote(options?)`

Loads the Asymptote WASM module and returns an [`AsymptoteEngine`](#asymptoteengine).

| Option | Type | Default | Description |
|---|---|---|---|
| `wasmUrl` | `string` | auto | Override the path/URL of `asymptote.wasm`. Useful when the WASM file is on a CDN or at a non-standard path. |
| `asyglUrl` | `string` | auto | Override the path/URL of the `asygl.js` WebGL viewer. Useful when normal (non-offline) WebGL output loads the viewer from a CDN or other hosted location. |

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
| `format` | `"svg" \| "eps" \| "ps" \| "webgl"` | `"svg"` | Output format. EPS and PS are returned as text. `webgl` returns a self-contained HTML document for 3D scenes — use `mountWebGL()` instead of `render()` to display it. |
| `flags` | `string[]` | `[]` | Extra CLI flags forwarded to `asy`. |
| `offline` | `boolean` | `false` | For WebGL output, embed the AsyGL viewer in the generated HTML instead of loading it from `asyglUrl`. Extra `flags` are appended afterward, so `-nooffline` can override this option. |
| `position` | `[number, number]` | auto | Initial WebGL camera position. |
| `devicePixelRatio` | `number` | auto | Device-pixel ratio used by the WebGL viewer. |
| `autobillboard` | `boolean` | auto | Make 3D labels face the viewer by default. |

```ts
const { svg, warnings } = await asy.render("size(50); draw(unitcircle);");
```

The format-independent `output` field contains the generated file contents,
and `format` identifies the selected format. The `svg` field contains the same
string and is convenient when the selected format is SVG.

```ts
const { output, format } = await asy.render("draw(unitcircle);", {
  format: "eps",
});
// output is the EPS text and format is "eps"
```

The format can also be selected through forwarded flags, for example
`flags: ["-f", "eps"]`. `mount()` only accepts SVG output.

#### `mount(target, source, options?)`

Renders `source` and sets `target.innerHTML` to the resulting SVG.

`target` can be a CSS selector string or an `Element`.

#### `mountWebGL(target, source, options?)`

Renders a 3D `source` (e.g. using `import three;`) and embeds the interactive
WebGL viewer into `target` via an `<iframe srcdoc>`. Rotate/zoom/pan controls
are provided by the bundled `asygl.js` viewer.

```ts
await asy.mountWebGL("#output", `
  import three;
  currentprojection=orthographic(5,4,2);
  draw(unitsphere, blue);
`);
```

For a self-contained WebGL document that can be deployed without a separate
viewer script, enable `offline`. Normal WebGL output uses the bundled (or
custom `asyglUrl`) viewer script, which remains useful when the viewer should
be cached or hosted separately.

```ts
await asy.mountWebGL("#output", source, { offline: true });
```

Raw command-line flags are appended afterward, so `-nooffline` can override
the convenience option when needed:

```ts
await asy.mountWebGL("#output", source, {
  offline: true,
  flags: ["-nooffline"],
});
```

The initial camera and 3D label behavior can also be configured with typed
options:

```ts
await asy.mountWebGL("#output", source, {
  position: [100, 80],
  devicePixelRatio: 2,
  autobillboard: true,
});
```

These options apply only to WebGL output. Raw flags remain available for
additional Asymptote viewer settings, and are appended afterward so they can
override the convenience options.

---

### `RenderResult`

```ts
interface RenderResult {
  output: string;     // Generated SVG, EPS, PS, or (for webgl) HTML contents
  format: "svg" | "eps" | "ps" | "webgl";
  svg: string;        // Generated output string; especially convenient for SVG
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

1. **Asymptote** is compiled from C++ to WebAssembly using [Emscripten](https://emscripten.org/).
2. An in-memory virtual filesystem (Emscripten's MEMFS) is used to pass the `.asy` source file to the compiler and read back the `.svg` output — no real filesystem access needed.
3. Asymptote's `base/` standard library is bundled into the WASM binary at build time via Emscripten's `--preload-file` flag.
4. The TypeScript wrapper provides a clean Promise-based API on top of the low-level Emscripten module.

---

## Known limitations

- 3D scenes render via WebGL (`format: "webgl"` / `mountWebGL()`), but text labels within 3D scenes are unsupported (same `-tex none` limitation as 2D), and the binary v3d/PRC export format is not supported.
- Generated PDF may have bugs because diffrent browsers use diffrent PDF renderers (PDFs not yet supported)

---

## License

LGPL-3.0 — same as Asymptote itself.
