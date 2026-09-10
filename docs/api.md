# API guide

This guide describes the runtime API exported by `asymptote-web`. For the
exact TypeScript interfaces, see the [type reference](types.md).

## `createAsymptote(options?)`

Initializes the Asymptote WebAssembly module and returns an
`AsymptoteEngine`. The module is initialized when this function is called and
cached for the lifetime of the page, so multiple calls can share the same
runtime.

### `getAssetUrls(baseUrl?)`

Returns matching URLs for the generated `asymptote.js`, `asymptote.wasm`, and
`asygl.js` runtime assets. Pass the result directly to `createAsymptote()`:

```ts
import { createAsymptote, getAssetUrls } from "asymptote-web";

const asy = await createAsymptote(getAssetUrls());
```

Use `baseUrl` when the four runtime assets have been copied to a public
directory or hosted on a CDN. The directory must also contain `asy.data`,
which is loaded automatically by the Emscripten runtime:

```ts
const asy = await createAsymptote(
  getAssetUrls("https://cdn.example.com/asymptote/")
);
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `glueUrl` | `string` | automatic | URL of `asymptote.js`. Set this when a bundler relocates the wrapper during dependency optimization, such as Vite. |
| `wasmUrl` | `string` | automatic | URL of `asymptote.wasm`. Use this when hosting the binary on a CDN or another path. |
| `asyglUrl` | `string` | automatic | URL of `asygl.js` for normal WebGL output. Not needed when using `offline: true`. |

```ts
const asy = await createAsymptote({
  glueUrl: "/assets/asymptote.js",
  wasmUrl: "/assets/asymptote.wasm",
  asyglUrl: "/assets/asygl.js",
});
```

Vite may prebundle dependencies into `node_modules/.vite/deps`, which can
make automatic glue discovery point at the wrong directory. In that case,
either exclude the package from dependency optimization or provide an explicit
`glueUrl` (and matching `wasmUrl`/`asyglUrl` when those assets are hosted
elsewhere):

```ts
const asy = await createAsymptote({
  glueUrl: "/node_modules/asymptote-web/dist/asymptote.js",
});
```

The package also exports the runtime assets as `asymptote-web/asymptote.js`,
`asymptote-web/asymptote.wasm`, `asymptote-web/asy.data`, and
`asymptote-web/asygl.js` for bundler-specific asset URL handling. These
subpath exports include TypeScript declarations: `asymptote.js` is typed as
the generated Emscripten module factory, while the binary/data/viewer assets
are typed as URL strings for bundler asset pipelines.

The WASM module requires all four generated runtime assets to be served:
`asymptote.js`, `asymptote.wasm`, `asy.data`, and `asygl.js`. A standard npm
installation includes them in `node_modules/asymptote-web/dist/`; bundlers
that do not copy package assets automatically should copy that complete set
to the application's public assets directory.

Release builds minify the TypeScript wrapper and omit its source map to reduce
the published package. Set `ASY_DEBUG=1` when running the build if you need an
unminified wrapper and source map for debugging.

## `AsymptoteEngine`

### `render(source, options?)`

Compiles Asymptote source and returns a `Promise<RenderResult>`.

```ts
const result = await asy.render(`
  size(150);
  draw(unitcircle, blue + 2bp);
  dot(origin, red + 3bp);
`);

document.querySelector("#output").innerHTML = result.output;
```

### `version()`

Returns a promise containing the version string reported by the compiled
Asymptote CLI:

```ts
const version = await asy.version();
console.log(version); // e.g. "Asymptote version 3.14"
```

### Structured diagnostics

`RenderResult.diagnostics` contains editor-friendly diagnostics parsed from
Asymptote's compiler output. Each diagnostic includes `severity`, `message`,
and `raw`, plus `sourceFile`, `line`, `column`, and `code` when available:

```ts
const result = await asy.render(source);
for (const diagnostic of result.diagnostics) {
  console.log(diagnostic.sourceFile, diagnostic.line, diagnostic.message);
}
```

Use the `sourceFile` render option to replace the internal virtual filename
reported for the main source file. Diagnostics for files supplied through
`files` are reported using their relative file keys.

Failed renders expose the same parsed diagnostics as
`AsymptoteError.diagnostics`. The existing `warnings` and `stderr` fields are
preserved for backwards compatibility. The standalone `parseCompilerDiagnostics`
helper is also exported for parsing captured Asymptote output.

#### Render options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `sourceFile` | `string` | `"input.asy"` | Friendly filename to report for diagnostics from the main source file. |
| `format` | `"svg" \| "eps" \| "ps" \| "webgl"` | `"svg"` | Output format. WebGL returns HTML for the interactive viewer. |
| `flags` | `string[]` | `[]` | Additional command-line arguments forwarded to Asymptote. |
| `signal` | `AbortSignal` | automatic | Cancels a render while it is queued; running WASM execution is not forcibly interrupted. |
| `files` | `Record<string, string \| Uint8Array>` | `{}` | Files mounted into the isolated browser filesystem for imports and assets. |
| `offline` | `boolean` | `false` | For WebGL, embed the AsyGL viewer into the generated HTML. |
| `position` | `[number, number]` | automatic | Initial WebGL camera position. |
| `devicePixelRatio` | `number` | automatic | WebGL viewer device-pixel ratio. |
| `autobillboard` | `boolean` | automatic | Make 3D labels face the viewer by default. |
| `webglLabels` | `WebGLLabel[]` | `[]` | Camera-facing screen-space labels in the WebGL iframe. |
| `webglIframeTimeoutMs` | `number` | `15000` | Maximum time to wait for a WebGL iframe to load when readiness is required. |
| `webglIframeStyles` | `Record<string, string>` | current defaults | CSS properties applied to the WebGL iframe; supplied properties override the defaults. |
| `containWebGLScroll` | `boolean` | `true` | Prevent wheel and touch scrolling inside the WebGL viewer iframe. |
| `primeWebGLZoom` | `boolean` | `true` | Prime the viewer's zoom handling with a synthetic interaction. |
| `raw` | `boolean` | `false` | For the default SVG mode, return the native EPS instead of converting it to SVG. |
| `svgPrecision` | `number` | `3` | Opt-in number of decimal places for generated SVG coordinates. Valid range: 0–12. |
| `reuseSvg` | `boolean` | `false` | For `mount()`, reuse an existing direct child SVG instead of replacing it. |

The default SVG path is WASM-safe: Asymptote generates native EPS and the
package converts that EPS to SVG in-process. The browser build forces
`-tex none` and `-noV`, because LaTeX and external viewer tools are not
available inside the WASM runtime.

For standalone EPS/PS conversion, custom CSS fonts can be selected by mapping
PostScript font names to `font-family` values:

```ts
const svg = epsToSvg(eps, {
  fonts: {
    Helvetica: "Inter, sans-serif",
    MyPostScriptFont: "My Web Font, sans-serif",
  },
});
```

The fonts must already be installed or loaded by the host page, for example
with `@font-face`. This option affects EPS/PS `<text>` output; normal Asymptote
browser labels remain vector paths in the current WASM fallback.

Ordinary labels use the bundled native vector fallback. Explicit `texsize()`
calls return approximate native metrics, while explicit `texpath()` calls
return an empty path array and emit a warning because TeX shaping is not
available in the browser build.

EPS and PS output can be retrieved as text:

```ts
const { output, format } = await asy.render("draw(unitcircle);", {
  format: "eps",
});
// format === "eps"
// output contains the EPS text
```

PDF output is not available in the browser build. The candidate WASM build
stubs the Ghostscript-backed PDF conversion and reports an explicit error;
this does not affect SVG, EPS, PS, or WebGL output.

For browser-generated PDF export, use the optional `asymptote-web/pdf`
subpath. It is intentionally not imported by the main package entry, so PDF
helpers and browser canvas work only load when requested:

```ts
import { renderToPdfBlob } from "asymptote-web/pdf";

const pdf = await renderToPdfBlob(asy, "label(\"A selectable label\", origin);");
const url = URL.createObjectURL(pdf);
```

The PDF helper renders SVG, rasterizes that SVG into the PDF page image, and
adds a real text layer for SVG `<text>` labels. This keeps labels selectable
and searchable while preserving the current browser-safe rendering pipeline.
Native fallback labels that Asymptote emits as vector paths can be made
selectable by passing matching `textRuns`. It is a hybrid raster PDF export,
not native vector PDF output.

Raw flags remain available for Asymptote features that do not have typed
options:

```ts
await asy.render("draw(unitcircle);", {
  flags: ["-f", "eps"],
});
```

Flags are appended after the convenience options. This means a later flag can
override a convenience option, for example `flags: ["-nooffline"]` overrides
`offline: true` for WebGL output.

`files` provides browser-side imports without exposing the host filesystem:

```ts
await asy.render(`include "lib/helpers.asy"; draw(helperPath);`, {
  files: {
    "lib/helpers.asy": "path helperPath = unitsquare;",
    "data/values.bin": new Uint8Array([1, 2, 3]),
  },
});
```

File keys must be relative and cannot contain `.` or `..` path segments. Files
are mounted beside the temporary input file and removed after rendering. Each
render uses an isolated virtual directory and renders are serialized because
the WASM module has shared global state.

`svgPrecision` is opt-in. The default remains three decimal places; lower
precision can reduce SVG size at the cost of geometric precision. `reuseSvg`
is only used by `mount()` and is disabled by default. When enabled, an
existing direct child `<svg>` keeps its root DOM node while its attributes and
children are updated.

### `unsafe.mount(target, source, customize, options?)`

Use this opt-in API when trusted pre-rendered LaTeX or other SVG content must
be inserted directly into the rendered SVG. The callback receives the live
`SVGSVGElement` before it is mounted:

```ts
await asy.unsafe.mount("#output", "draw(unitsquare);", (svg) => {
  // `latexSvg` must come from a trusted pre-rendering pipeline.
  svg.insertAdjacentHTML("beforeend", latexSvg);
});
```

This API intentionally permits raw DOM insertion. Never pass user-controlled
or untrusted HTML/SVG to the callback. It supports SVG output only.

### `renderToBlob(source, options?)`

Renders source and returns a browser `Blob`. The MIME type is selected from the
actual result format:

- SVG: `image/svg+xml`
- EPS and PS: `application/postscript`
- WebGL HTML: `text/html`

```ts
const blob = await asy.renderToBlob("draw(unitcircle);", {
  format: "svg",
});
const url = URL.createObjectURL(blob);
const image = document.querySelector("img");
if (image) image.src = url;
```

Call `URL.revokeObjectURL(url)` when the object URL is no longer needed.

### `renderBatch(sources, options?)`

Renders multiple source strings sequentially and returns results in the same
order as the input.

```ts
const results = await asy.renderBatch([
  "draw(unitcircle);",
  "draw(unitsquare);",
]);
```

Sequential processing is intentional: the WASM runtime uses a shared virtual
filesystem and fixed temporary output paths. A failed source rejects the batch
and stops subsequent renders.

### `download(source, filename?, options?)`

Renders source and triggers a browser download. If no filename is supplied,
the method uses `asymptote.svg`, `asymptote.eps`, `asymptote.ps`, or
`asymptote.html`, depending on the actual format.

```ts
await asy.download("draw(unitcircle);", "circle.svg");
await asy.download("draw(unitcircle);", undefined, { format: "eps" });
```

This method requires browser `Blob`, `URL`, `document`, and anchor-download
support. It is not intended for server-side rendering.

## Optional PDF export: `asymptote-web/pdf`

PDF helpers live in a separate subpath so applications that only render SVG,
EPS, PS, or WebGL do not import any PDF code:

```ts
import { downloadPdf, renderToPdfBlob, svgToPdfBlob } from "asymptote-web/pdf";
```

### `renderToPdfBlob(engine, source, options?)`

Renders Asymptote source as SVG, rasterizes the SVG in a browser canvas, and
returns an `application/pdf` `Blob`. SVG `<text>` nodes are also written as a
real PDF text layer so labels remain selectable/searchable:

```ts
const pdf = await renderToPdfBlob(asy, `
  size(150);
  draw(unitcircle);
  label("selectable", origin);
`, {
  title: "Circle diagram",
  scale: 3,
});
```

Options include:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `scale` | `number` | `2` | Rasterization scale before JPEG embedding. Higher values improve zoom/print quality but increase file size. |
| `background` | `string \| null` | `"white"` | Canvas background used before rasterization. |
| `quality` | `number` | browser default | JPEG quality from 0 to 1. |
| `margin` | `number \| { top?, right?, bottom?, left? }` | `0` | Extra page space around the SVG before rasterization, useful when labels extend beyond the SVG viewport. |
| `textMode` | `"invisible" \| "visible" \| "none"` | `"invisible"` | Whether to add invisible selectable text, visible overlay text, or no text layer. Some PDF viewers do not expose invisible text for selection; use `"visible"` when reliable click/drag selection is more important than preserving the exact rasterized label appearance. |
| `textRuns` | `PdfTextRun[]` | auto-extracted SVG text | Explicit text runs to write into the PDF; use this for native fallback labels that are drawn as paths. |
| `render` | `RenderOptions` except `format` | `{}` | Options passed to `engine.render()`; PDF export forces SVG output. |

### `svgToPdfBlob(svg, options?)`

Converts an existing SVG string to a PDF `Blob` using the same raster image +
text-layer strategy. This is useful when you already have SVG output from
`render()` or from `epsToSvg()`.

### `downloadPdf(engine, source, filename?, options?)`

Renders source, creates a PDF blob, and triggers a browser download. It returns
the underlying SVG render result so callers can still inspect warnings and
diagnostics.

The browser helpers require DOM, `Blob`, `FileReader`, `Image`, and canvas
support. The low-level `imageToPdfBytes()` helper accepts JPEG bytes directly
and can also be used outside the browser.

### `imagesToPdfBytes(pages, options?)`

Creates a multi-page PDF from multiple JPEG-backed pages. Each page can use
its own image dimensions, PDF page dimensions, text mode, and selectable text
runs:

```ts
import { imagesToPdfBytes } from "asymptote-web/pdf";

const pdfBytes = imagesToPdfBytes([
  {
    image: firstJpegBytes,
    imageWidth: 1200,
    imageHeight: 800,
    pageWidth: 600,
    pageHeight: 400,
    textRuns: [{ text: "First figure", x: 24, y: 36 }],
  },
  {
    image: secondJpegBytes,
    imageWidth: 1000,
    imageHeight: 1000,
    pageWidth: 500,
    pageHeight: 500,
    textRuns: [{ text: "Second figure", x: 24, y: 36 }],
  },
]);
```

This helper writes one PDF page per image. It is intentionally lower-level
than `svgToPdfBlob()` because callers may already have canvas/JPEG snapshots
or may want to combine images from different sources into one document.

### `mount(target, source, options?)`

Renders source as SVG and replaces the target element's contents with the
result. The target can be a CSS selector or an `Element`.

```ts
await asy.mount("#output", `
  size(100);
  filldraw(unitsquare, yellow, black);
`);
```

`mount()` throws if the selected output format is EPS, PS, or WebGL. Use
`render()` or `download()` when you need non-SVG output.

### `mountWebGL(target, source, options?)`

Renders a 3D scene and mounts the generated interactive HTML into an iframe
inside the target element.

```ts
await asy.mountWebGL("#output", `
  import three;
  currentprojection = orthographic(5, 4, 2);
  draw(unitsphere, blue);
`);
```

Use `offline: true` to embed the viewer script in the generated HTML:

```ts
await asy.mountWebGL("#output", source, { offline: true });
```

The viewer supports rotate, zoom, and pan controls. WebGL convenience options
such as `position`, `devicePixelRatio`, and `autobillboard` apply only to this
output mode.

`webglLabels` adds basic camera-facing labels using CSS pixel coordinates from
the viewer's top-left corner. These are screen-space overlays, not labels
anchored to 3D world coordinates. For custom viewer integration, the unsafe
API exposes the iframe document:

```ts
await asy.unsafe.mountWebGL("#output", source, async (iframe, viewerDocument) => {
  // Trusted DOM-only customization.
  viewerDocument.body.dataset.customized = "true";
});
```

**Warning:** `unsafe.mountWebGL()` exposes the live iframe document and must
only be used with trusted callbacks and content.

For post-mount customization, `unsafe.getSvg(target)` and
`unsafe.getWebGLIframe(target)` return the live direct child currently mounted
in the target. They return `null` when the target or expected child is absent.
These elements are intentionally unrestricted and may be modified directly;
only use these APIs with trusted content.

## `RenderResult`

```ts
interface RenderResult {
  output: string;
  format: "svg" | "eps" | "ps" | "webgl";
  svg: string;
  warnings: string[];
}
```

- `output` contains the generated content for the selected format.
- `format` identifies the actual output format. When `raw: true` is used with
  the default SVG request, it is reported as `"eps"` because the output is
  native EPS.
- `svg` contains the same string for backwards compatibility. Use `output`
  for EPS, PS, and WebGL HTML.
- `warnings` contains non-fatal warning lines emitted by Asymptote.

## `AsymptoteError`

Rendering throws `AsymptoteError` when Asymptote exits unsuccessfully.
Its message is prefixed with `ASYMPTOTE ERROR` so compiler/source failures
can be distinguished from package or browser integration errors.

```ts
import { AsymptoteError } from "asymptote-web";

try {
  await asy.render("invalid Asymptote source @@@@");
} catch (error) {
  if (error instanceof AsymptoteError) {
    console.error(error.exitCode);
    console.error(error.stderr);
  }
}
```

The error exposes the process exit code and raw stderr output, which is useful
for displaying compiler diagnostics in an editor or playground.

## Standalone conversion helpers

`epsToSvg()` converts EPS or PS text to SVG without creating an engine. The
converter is intentionally limited to the PostScript subset emitted by
Asymptote's native writer. It supports basic `show` text output, common
PostScript fonts, opacity, paths, clipping, colors, and transforms. Text that
Asymptote emits as glyph outlines is preserved as vector paths; standard
PostScript text sequences are emitted as SVG `<text>` elements.

```ts
import { epsToSvg, epsToSvgWithWarnings, psToSvg } from "asymptote-web";

const eps = await (await fetch("drawing.eps")).text();
const svg = epsToSvg(eps);
```

Pass `{ precision: 1 }` to opt into shorter coordinate formatting. Omitting
the option preserves the default three-decimal output.

`psToSvg` is an alias of `epsToSvg`.

`epsToSvg()` remains a convenience helper that returns only the SVG string.
Use `epsToSvgWithWarnings()` when you need diagnostics for content that was
skipped while conversion continued:

```ts
const { svg, warnings } = epsToSvgWithWarnings(eps);
for (const warning of warnings) console.warn(warning);
```

Warnings are non-fatal and currently identify ignored operators, raster image
operators, mesh or function-based shadings, unsupported color spaces, and
malformed shading dictionaries. Engine renders include these messages in
`RenderResult.warnings` automatically.

The converter supports a bounded `image` form with 8-bit grayscale string data
and emits an SVG data-backed image. `colorimage`, `imagemask`, binary image
filters, and procedure-backed image sources remain unsupported and produce a
warning.

The converter supports Asymptote opacity commands such as
`setopacityalpha`. Opacity is preserved on generated SVG paths using the
`opacity` attribute, including across `gsave`/`grestore` state changes.

### Gradients

Linear and radial gradients are supported when their geometry and color stops
are explicit and parseable. The converter-friendly operators accept a flat
stop array containing repeated `offset r g b` groups:

```postscript
% x1 y1 x2 y2 [offset r g b ...] setlineargradient
0 0 100 0 [0 1 0 0 1 0 0 1] setlineargradient
newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill

% x1 y1 r1 x2 y2 r2 [offset r g b ...] setradialgradient
50 50 0 50 50 70 [0 1 1 1 1 0 0 0] setradialgradient
newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill
```

Common Level 2-style shading dictionaries are also recognized for shading
types 2 and 3 when they provide `/Coords` and either `/C0` plus `/C1` or a
`/ColorStops` array. For example:

```postscript
<< /ShadingType 2 /Coords [0 0 100 100]
  /C0 [1 0 0] /C1 [0 0 1] >> shfill
```

`makepattern`/`setpattern` forms are accepted when the pattern contains such a
shading dictionary. Transforms are applied to gradient geometry, and existing
path clipping and opacity are retained. Mesh, function-based, unsupported
color spaces, malformed dictionaries, and incomplete stop arrays are skipped
with warnings; they do not make `epsToSvg()` throw.
