# Rendering and browser integration

## `AsymptoteEngine.render(source, options?)`

Compiles Asymptote source and returns a `Promise<RenderResult>`:

```ts
const result = await asy.render(`
  size(150);
  draw(unitcircle, blue + 2bp);
`);

document.querySelector("#output").innerHTML = result.output;
```

| Option                 | Type                                   | Default          | Description                                                 |
| ---------------------- | -------------------------------------- | ---------------- | ----------------------------------------------------------- |
| `sourceFile`           | `string`                               | `input.asy`      | Friendly filename for diagnostics.                          |
| `format`               | `"svg" \| "eps" \| "ps" \| "webgl"`    | `"svg"`          | Output format.                                              |
| `flags`                | `string[]`                             | `[]`             | Extra arguments passed to Asymptote.                        |
| `signal`               | `AbortSignal`                          | automatic        | Cancels a queued render.                                    |
| `files`                | `Record<string, string \| Uint8Array>` | `{}`             | Relative virtual files for imports and assets.              |
| `offline`              | `boolean`                              | `false`          | Embed the WebGL viewer in generated HTML.                   |
| `position`             | `[number, number]`                     | automatic        | Initial WebGL camera position.                              |
| `devicePixelRatio`     | `number`                               | automatic        | WebGL viewer pixel ratio.                                   |
| `autobillboard`        | `boolean`                              | automatic        | Face 3D labels toward the viewer.                           |
| `webglLabels`          | `WebGLLabel[]`                         | `[]`             | Camera-facing screen-space labels.                          |
| `webglIframeTimeoutMs` | `number`                               | `15000`          | WebGL iframe load timeout.                                  |
| `webglIframeStyles`    | `Record<string, string>`               | current defaults | CSS applied to the iframe.                                  |
| `containWebGLScroll`   | `boolean`                              | `true`           | Prevent wheel and touch scrolling.                          |
| `primeWebGLZoom`       | `boolean`                              | `true`           | Prime viewer zoom handling.                                 |
| `raw`                  | `boolean`                              | `false`          | Return native EPS instead of converting default SVG output. |
| `svgPrecision`         | `number`                               | `3`              | SVG coordinate precision from 0 through 12.                 |
| `svgFonts`             | `SvgFontMap`                           | `{}`             | PostScript-to-CSS font mappings.                            |
| `reuseSvg`             | `boolean`                              | `false`          | Reuse an existing direct child SVG when mounting.           |

Flags are appended after convenience options, so a later flag can override an
option such as `offline: true`. `files` keys must be relative and cannot
contain `.` or `..` path segments. Renders are serialized because the WASM
runtime has shared global state.

The default SVG path asks Asymptote for EPS and converts it in-process. Browser
output forces `-tex none` and `-noV`; LaTeX and external viewers are not
available in the WASM runtime.

## `version()`

Returns the version string reported by the compiled Asymptote CLI.

## `renderToBlob(source, options?)`

Renders source and returns a browser `Blob`. MIME types are SVG
`image/svg+xml`, EPS/PS `application/postscript`, and WebGL `text/html`.

## `renderBatch(sources, options?)`

Renders multiple sources sequentially and returns results in input order. A
failed source rejects the batch and stops subsequent renders.

## `download(source, filename?, options?)`

Renders source and triggers a browser download. Defaults are
`asymptote.svg`, `asymptote.eps`, `asymptote.ps`, or `asymptote.html`.

## `mount(target, source, options?)`

Renders SVG and replaces the target element's contents. The target can be a
CSS selector or an `Element`.

## `mountWebGL(target, source, options?)`

Renders a 3D scene into an iframe. Use `offline: true` to embed the viewer
script. `webglLabels` are screen-space overlays, not world-coordinate labels.

## Trusted customization

`unsafe.mount()` receives the live `SVGSVGElement` before mounting. The
`unsafe.mountWebGL()` callback receives the live iframe and its document.
`unsafe.getSvg()` and `unsafe.getWebGLIframe()` return mounted nodes or `null`.
These APIs allow unrestricted DOM access and must only receive trusted content.

## `RenderResult` and `AsymptoteError`

`RenderResult` contains `output`, `format`, the compatibility `svg` field,
`warnings`, and structured `diagnostics`. Failed renders throw
`AsymptoteError`, which exposes `exitCode`, `stderr`, and `diagnostics`.
