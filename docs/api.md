# API guide

This guide describes the runtime API exported by `asymptote-web`. For the
exact TypeScript interfaces, see the [type reference](types.md).

## `createAsymptote(options?)`

Initializes the Asymptote WebAssembly module and returns an
`AsymptoteEngine`. The module is loaded lazily and cached for the lifetime of
the page, so multiple calls can share the same runtime.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `wasmUrl` | `string` | automatic | URL of `asymptote.wasm`. Use this when hosting the binary on a CDN or another path. |
| `asyglUrl` | `string` | automatic | URL of `asygl.js` for normal WebGL output. Not needed when using `offline: true`. |

```ts
const asy = await createAsymptote({
  wasmUrl: "/assets/asymptote.wasm",
  asyglUrl: "/assets/asygl.js",
});
```

The WASM module requires the generated runtime assets to be served correctly.
For a standard npm installation, keep `asymptote.js`, `asymptote.wasm`,
`asy.data`, and `asygl.js` together unless you provide custom URLs where the
API supports them.

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

#### Render options

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `"svg" \| "eps" \| "ps" \| "webgl"` | `"svg"` | Output format. WebGL returns HTML for the interactive viewer. |
| `flags` | `string[]` | `[]` | Additional command-line arguments forwarded to Asymptote. |
| `offline` | `boolean` | `false` | For WebGL, embed the AsyGL viewer into the generated HTML. |
| `position` | `[number, number]` | automatic | Initial WebGL camera position. |
| `devicePixelRatio` | `number` | automatic | WebGL viewer device-pixel ratio. |
| `autobillboard` | `boolean` | automatic | Make 3D labels face the viewer by default. |
| `raw` | `boolean` | `false` | For the default SVG mode, return the native EPS instead of converting it to SVG. |
| `svgPrecision` | `number` | `3` | Opt-in number of decimal places for generated SVG coordinates. Valid range: 0–12. |
| `reuseSvg` | `boolean` | `false` | For `mount()`, reuse an existing direct child SVG instead of replacing it. |

The default SVG path is WASM-safe: Asymptote generates native EPS and the
package converts that EPS to SVG in-process. The browser build forces
`-tex none` and `-noV`, because LaTeX and external viewer tools are not
available inside the WASM runtime.

EPS and PS output can be retrieved as text:

```ts
const { output, format } = await asy.render("draw(unitcircle);", {
  format: "eps",
});
// format === "eps"
// output contains the EPS text
```

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

`svgPrecision` is opt-in. The default remains three decimal places; lower
precision can reduce SVG size at the cost of geometric precision. `reuseSvg`
is only used by `mount()` and is disabled by default. When enabled, an
existing direct child `<svg>` keeps its root DOM node while its attributes and
children are updated.

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
import { epsToSvg, psToSvg } from "asymptote-web";

const eps = await (await fetch("drawing.eps")).text();
const svg = epsToSvg(eps);
```

Pass `{ precision: 1 }` to opt into shorter coordinate formatting. Omitting
the option preserves the default three-decimal output.

`psToSvg` is an alias of `epsToSvg`.

The converter supports Asymptote opacity commands such as
`setopacityalpha`. Opacity is preserved on generated SVG paths using the
`opacity` attribute, including across `gsave`/`grestore` state changes.
