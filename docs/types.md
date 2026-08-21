# Type reference

This document describes the public TypeScript types exported by
`asymptote-web`.

## `OutputFormat`

```ts
type OutputFormat = "svg" | "eps" | "ps" | "webgl";
```

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
  webglLabels?: readonly WebGLLabel[];
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
  className?: string;
}
```

- `format` defaults to `"svg"`.
- `flags` are additional arguments passed to Asymptote. They are intentionally
  an escape hatch for advanced or unsafe configuration.
- `files` contains relative virtual paths and text or binary contents mounted
  for that render. Host filesystem paths and URLs are not accessed directly.
- `offline`, `position`, `devicePixelRatio`, and `autobillboard` apply to
  WebGL output.
- `webglLabels` creates camera-facing screen-space labels in CSS pixels. It
  does not anchor labels to 3D world coordinates.
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
}
```

`warnings` contains non-fatal diagnostics emitted by Asymptote or the EPS/PS
converter.

## `CreateOptions`

```ts
interface CreateOptions {
  wasmUrl?: string;
  asyglUrl?: string;
}
```

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
}
```
