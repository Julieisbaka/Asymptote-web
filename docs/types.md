# Type reference

This document describes the public TypeScript types exported by
`asymptote-web`.

## `OutputFormat`

```ts
type OutputFormat = "svg" | "eps" | "ps";
```

`OutputFormat` selects the Asymptote output driver used by `render()`:

| Value | Output | Browser use |
|---|---|---|
| `"svg"` | SVG markup | Can be mounted directly into an element |
| `"eps"` | Encapsulated PostScript text | Return or save as a file |
| `"ps"` | PostScript text | Return or save as a file |

SVG, EPS, and PS are all supported output options. EPS and PS support was
added in version **0.0.2**.

## `RenderOptions`

```ts
interface RenderOptions {
  format?: OutputFormat;
  flags?: string[];
}
```

- `format` defaults to `"svg"`.
- `flags` contains additional command-line arguments passed to Asymptote.
  A format can also be selected with `flags: ["-f", "eps"]` (or `ps`).
  When both `format` and a format flag are supplied, the format flag takes
  precedence.

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
}
```

`wasmUrl` optionally overrides the URL used to load the Asymptote WebAssembly
binary.

## `AsymptoteEngine`

```ts
interface AsymptoteEngine {
  render(source: string, options?: RenderOptions): Promise<RenderResult>;
  mount(
    target: string | Element,
    source: string,
    options?: RenderOptions,
  ): Promise<RenderResult>;
}
```

`render()` supports all `OutputFormat` values. `mount()` is specifically for
SVG output and throws if EPS or PS is selected.

## `AsymptoteError`

```ts
class AsymptoteError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
}
```

This error is thrown when the Asymptote process exits unsuccessfully. `exitCode`
is the process exit code and `stderr` contains the raw diagnostic output.
