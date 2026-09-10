# Type reference

This document describes the public TypeScript types exported by
`asymptote-web`.

## `OutputFormat`

```ts
type OutputFormat = "svg" | "eps" | "ps" | "webgl";
```

## `CompilerDiagnostic`

```ts
type DiagnosticSeverity = "info" | "warning" | "error";

interface CompilerDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  sourceFile?: string;
  line?: number;
  column?: number;
  code?: string;
  raw: string;
}
```

```ts
type WebGLIframeStyles = Record<string, string>;
```

`CompilerDiagnostic` is parsed from Asymptote's stderr and is suitable for
editor integrations. Location fields are omitted when Asymptote does not
provide a source location. `raw` preserves the original diagnostic line.

## `RenderOptions`

```ts
interface RenderOptions {
  sourceFile?: string;
  format?: OutputFormat;
  flags?: string[];
  signal?: AbortSignal;
  files?: Record<string, string | Uint8Array>;
  offline?: boolean;
  position?: [number, number];
  devicePixelRatio?: number;
  autobillboard?: boolean;
  webglLabels?: readonly WebGLLabel[];
  webglIframeTimeoutMs?: number;
  webglIframeStyles?: WebGLIframeStyles;
  containWebGLScroll?: boolean;
  primeWebGLZoom?: boolean;
  raw?: boolean;
  svgPrecision?: number;
  reuseSvg?: boolean;
}

interface WebGLLabel {
  text: string;
  x: number;
  y: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  className?: string;
}
```

- `format` defaults to `"svg"`.
- `flags` are additional arguments passed to Asymptote. They are intentionally
  an escape hatch for advanced or unsafe configuration.
- `signal` cancels a render while it waits in the shared queue. A render that
  has entered synchronous WASM execution cannot be forcibly stopped.
- `files` contains relative virtual paths and text or binary contents mounted
  for that render. Host filesystem paths and URLs are not accessed directly.
- `offline`, `position`, `devicePixelRatio`, and `autobillboard` apply to
  WebGL output.
- `webglLabels` creates camera-facing screen-space labels in CSS pixels. It
  does not anchor labels to 3D world coordinates.
- `webglIframeTimeoutMs` defaults to 15000 milliseconds.
- `webglIframeStyles` overrides the default `border: none`, `width: 100%`, and
  `height: 100%` iframe styles. Arbitrary CSS property names are supported.
- `containWebGLScroll` and `primeWebGLZoom` both default to `true`.
- `raw` skips EPS-to-SVG conversion for the default SVG request and returns
  native EPS text.
- `svgPrecision` controls generated SVG coordinate decimals from 0 through 12.
- `reuseSvg` reuses an existing direct child SVG when mounting.

## `RenderResult`

```ts
interface RenderResult {
  output: string;
  format: OutputFormat;
  svg: string;
  warnings: string[];
  diagnostics: CompilerDiagnostic[];
}
```

`warnings` contains non-fatal diagnostics emitted by Asymptote or the EPS/PS
converter. `diagnostics` contains structured diagnostics from Asymptote's
compiler output; `warnings` remains available for backwards compatibility.

## `CreateOptions`

```ts
interface CreateOptions {
  glueUrl?: string;
  wasmUrl?: string;
  asyglUrl?: string;
}
```

`EpsToSvgOptions` also accepts `fonts?: Record<string, string>`, mapping
PostScript font names to CSS `font-family` values for standalone EPS/PS
conversion. The host page is responsible for loading or installing those
fonts. Common PostScript/Base 35 names are mapped to browser-friendly CSS font
families with bold and italic styles when available.

`glueUrl` can be set to the Emscripten `asymptote.js` URL when a bundler
relocates the wrapper module during dependency optimization. This is commonly
needed with Vite unless `asymptote-web` is excluded from `optimizeDeps`.

## `Unsafe callbacks`

```ts
type UnsafeSvgCustomizer = (svg: SVGSVGElement) => void;
type UnsafeWebGLCustomizer = (
  iframe: HTMLIFrameElement,
  document: Document,
) => void | Promise<void>;
```

These callbacks intentionally expose direct DOM access and must only receive
trusted content.

## `AsymptoteEngine`

```ts
interface AsymptoteEngine {
  version(): Promise<string>;
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
  readonly unsafe: {
    getSvg(target: string | Element): SVGSVGElement | null;
    getWebGLIframe(target: string | Element): HTMLIFrameElement | null;
    mount(
      target: string | Element,
      source: string,
      customize: UnsafeSvgCustomizer,
      options?: RenderOptions,
    ): Promise<RenderResult>;
    mountWebGL(
      target: string | Element,
      source: string,
      customize: UnsafeWebGLCustomizer,
      options?: Omit<RenderOptions, "format">,
    ): Promise<RenderResult>;
  };
}
```

`mount()` is for SVG output. `mountWebGL()` renders a 3D scene into an
iframe. The `unsafe` methods are trusted-content escape hatches for direct DOM
customization.

## `AsymptoteError`

```ts
class AsymptoteError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
  readonly diagnostics: CompilerDiagnostic[];
}
```

## Optional PDF subpath

The `asymptote-web/pdf` subpath exports dependency-free helpers for hybrid
raster PDF export with selectable SVG text labels. It is separate from the
main entry point and is only loaded when imported directly.

```ts
interface PdfTextRun {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  opacity?: number;
  rotate?: number;
}

interface PdfOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string | null;
  quality?: number;
  margin?: number | {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  textMode?: "invisible" | "visible" | "none";
  textRuns?: readonly PdfTextRun[];
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
}

interface RenderToPdfOptions extends PdfOptions {
  render?: Omit<RenderOptions, "format">;
}

interface PdfImagePage {
  image: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  pageWidth?: number;
  pageHeight?: number;
  textMode?: "invisible" | "visible" | "none";
  textRuns?: readonly PdfTextRun[];
}

interface ImagesToPdfOptions {
  textMode?: "invisible" | "visible" | "none";
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
}
```

Key functions:

```ts
function renderToPdfBlob(
  engine: AsymptoteEngine,
  source: string,
  options?: RenderToPdfOptions
): Promise<Blob>;

function svgToPdfBlob(svg: string, options?: PdfOptions): Promise<Blob>;

function downloadPdf(
  engine: AsymptoteEngine,
  source: string,
  filename?: string,
  options?: RenderToPdfOptions
): Promise<RenderResult>;

function imagesToPdfBytes(
  pages: readonly PdfImagePage[],
  options?: ImagesToPdfOptions
): Uint8Array;
```
