# Type reference

This document describes the public TypeScript types exported by
`asymptote-web`.

## `OutputFormat`

```ts
type OutputFormat = "svg" | "eps" | "ps" | "webgl";
```

`OutputFormat` selects the Asymptote output driver used by `render()`:

| Value | Output | Browser use |
|---|---|---|
| `"svg"` | SVG markup | Can be mounted directly into an element |
| `"eps"` | Encapsulated PostScript text | Return or save as a file |
| `"ps"` | PostScript text | Return or save as a file |
| `"webgl"` | HTML document containing a 3D scene | Mount with `mountWebGL()` |

SVG, EPS, and PS are all supported output options. EPS and PS support was
added in version **0.0.2**.

## `RenderOptions`

```ts
interface RenderOptions {
  format?: OutputFormat;
  flags?: string[];
  files?: Record<string, string | Uint8Array>;
  offline?: boolean;
  position?: [number, number];
  devicePixelRatio?: number;
  autobillboard?: boolean;
  raw?: boolean;
  svgPrecision?: number;
  reuseSvg?: boolean;
}

interface AsymptoteEngine {
  version(): Promise<string>;
}
```

- `format` defaults to `"svg"`.
- `flags` contains additional command-line arguments passed to Asymptote.
  A format can also be selected with `flags: ["-f", "eps"]` (or `ps`).
  When both `format` and a format flag are supplied, the format flag takes
  precedence.
- `files` contains relative virtual paths and text or binary contents mounted
  for that render. Host filesystem paths and URLs are not accessed directly.
  Render files are isolated and cleaned up after completion.
- `offline` applies only to WebGL output. When `true`, Asymptote embeds the
  AsyGL viewer in the generated HTML, making it suitable for offline or
  self-contained deployments. When omitted or `false`, the viewer is loaded
  from the bundled or configured `asyglUrl`.
- `flags` are appended after convenience options, so
  `flags: ["-nooffline"]` overrides `offline: true`.
- `position`, `devicePixelRatio`, and `autobillboard` are typed WebGL
  convenience options. They map to Asymptote's `-position`,
  `-devicepixelratio`, and `-autobillboard`/`-noautobillboard` flags.
- WebGL convenience options are ignored for SVG, EPS, and PS output.
- `raw` applies only to the default SVG mode. When `true`, it skips the
  in-process EPS-to-SVG conversion and returns native EPS text instead.
- `svgPrecision` is opt-in and controls generated coordinate decimals from 0
  through 12. The default remains 3.
- `reuseSvg` is opt-in and applies to `mount()`. It preserves an existing
  direct child SVG root while updating its generated content.

`version()` returns the version string reported by the compiled Asymptote CLI.

`AsymptoteEngine.unsafe.mount()` accepts a trusted callback for direct SVG DOM
manipulation, such as inserting pre-rendered LaTeX. The callback may insert
raw markup and must never receive untrusted content.

## `RenderResult`

```ts
interface RenderResult {
  output: string;
  format: OutputFormat;
  svg: string;
  warnings: string[];
}
```

- `output` contains the generated SVG, EPS, or PS text.
- `format` identifies the output format used for the render.
- `svg` contains the same generated string and is convenient for SVG output.
  It is populated for every format so callers can use the existing property
  consistently; use `output` when the format is EPS or PS.
- `warnings` contains non-fatal messages emitted by Asymptote.

## `CreateOptions`

```ts
interface CreateOptions {
  wasmUrl?: string;
  asyglUrl?: string;
}
```

`wasmUrl` optionally overrides the URL used to load the Asymptote WebAssembly
binary.

`asyglUrl` optionally overrides the viewer script URL used by normal WebGL
output. It is not needed when `offline: true` is used.

## `AsymptoteEngine`

```ts
interface AsymptoteEngine {
  render(source: string, options?: RenderOptions): Promise<RenderResult>;
  renderToBlob(source: string, options?: RenderOptions): Promise<Blob>;
  renderBatch(
    sources: readonly string[],
    options?: RenderOptions,
  ): Promise<RenderResult[]>;
  download(
    source: string,
    filename?: string,
    options?: RenderOptions,
  ): Promise<RenderResult>;
  mount(
    target: string | Element,
    source: string,
    options?: RenderOptions,
  ): Promise<RenderResult>;
  mountWebGL(
    target: string | Element,
    source: string,
    options?: Omit<RenderOptions, "format">,
  ): Promise<RenderResult>;
}
```

`render()` supports all `OutputFormat` values. `mount()` is specifically for
SVG output and throws if EPS or PS is selected.
`mountWebGL()` renders a 3D scene into an iframe. Pass `{ offline: true }`
to embed the viewer script in the generated HTML.

`renderToBlob()` returns the rendered output as a browser `Blob`, using an
appropriate MIME type for the selected format. `renderBatch()` renders each
source sequentially and returns the results in the same order. Sequential
processing is required because the WASM engine uses a shared virtual
filesystem.

`download()` triggers a browser download and returns the corresponding
`RenderResult`. If `filename` is omitted, it defaults to
`asymptote.svg`, `asymptote.eps`, `asymptote.ps`, or `asymptote.html`.

## `AsymptoteError`

```ts
class AsymptoteError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
}
```

This error is thrown when the Asymptote process exits unsuccessfully. `exitCode`
is the process exit code and `stderr` contains the raw diagnostic output.
