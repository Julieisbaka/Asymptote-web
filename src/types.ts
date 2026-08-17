/**
 * Public TypeScript types for asymptote-web.
 */

/** Output formats supported by the Asymptote driver. */
export type OutputFormat = "svg" | "eps" | "ps" | "webgl";

/** Options accepted by {@link AsymptoteEngine.render}. */
export interface RenderOptions {
  /**
   * Output format. Defaults to `"svg"`.
   * EPS and PS are returned as text and are not mountable in the browser.
   */
  format?: OutputFormat;

  /**
   * Additional command-line flags forwarded to `asy`.
   * Example: `["-nosafe"]`
   */
  flags?: string[];

  /**
   * When `format` is `"webgl"`, embed the AsyGL viewer in the generated HTML
   * instead of loading it from `asyglUrl`. This makes the HTML self-contained
   * for offline or static-file deployments. Extra `flags` are appended after
   * this convenience option, so `flags: ["-nooffline"]` can override it.
   *
   * Has no effect for other output formats.
   */
  offline?: boolean;

  /**
   * Initial WebGL camera position in screen coordinates. Maps to Asymptote's
   * `-position x,y` option. Has no effect for non-WebGL output.
   */
  position?: [number, number];

  /**
   * Device-pixel ratio used by the WebGL viewer. Maps to Asymptote's
   * `-devicepixelratio` option. Has no effect for non-WebGL output.
   */
  devicePixelRatio?: number;

  /**
   * Whether 3D labels face the viewer by default. Maps to Asymptote's
   * `-autobillboard` / `-noautobillboard` options. Has no effect for
   * non-WebGL output.
   */
  autobillboard?: boolean;

  /**
   * When `format` is `"svg"`, Asymptote itself has no native SVG writer, so
   * `render()` asks Asymptote for EPS and converts it to SVG in-process (see
   * {@link epsToSvg}). Set this to `true` to skip that automatic conversion
   * and get the raw EPS text back instead — useful if you want to intercept
   * it and post-process it yourself (e.g. with your own modified copy of
   * {@link epsToSvg}, or a different converter entirely).
   *
   * Has no effect when `format` is `"eps"` or `"ps"`, since no conversion
   * happens for those formats regardless.
   */
  raw?: boolean;

  /**
   * Number of decimal places used for SVG coordinates. Defaults to 3.
   * Lower values can reduce output size, but may reduce geometric precision.
   * Has no effect for EPS, PS, or WebGL output.
   */
  svgPrecision?: number;

  /**
   * When used with {@link AsymptoteEngine.mount}, update an existing direct
   * child SVG instead of replacing it. Disabled by default to preserve the
   * existing DOM behavior and event semantics.
   */
  reuseSvg?: boolean;
}

/** Options accepted by {@link createAsymptote}. */
export interface CreateOptions {
  /**
   * URL of the `asymptote.wasm` file.
   * Defaults to the path relative to `asymptote.js` in the same directory.
   *
   * Override this when hosting the WASM file on a CDN or a different path.
   */
  wasmUrl?: string;

  /**
   * URL of the bundled `asygl.js` WebGL viewer, used for `format: "webgl"`
   * output. Defaults to the path relative to `asymptote.js` in the same
   * directory. Override this when hosting it on a CDN or a different path.
   */
  asyglUrl?: string;
}

/** Result returned by {@link AsymptoteEngine.render}. */
export interface RenderResult {
  /**
   * The generated output: SVG, EPS, or PostScript markup, or (when
   * `format` is `"webgl"`) a complete, self-contained HTML document
   * embedding the 3D scene and a `<script>` reference to the WebGL viewer.
   */
  output: string;
  /** The format of {@link output}. */
  format: OutputFormat;
  /** The generated output, also available through the format-independent `output` field. */
  svg: string;
  /** Any warnings or informational messages emitted by Asymptote. */
  warnings: string[];
}

/**
 * An initialised Asymptote rendering engine.
 * Obtain one via {@link createAsymptote}.
 */
export interface AsymptoteEngine {
  /**
   * Render Asymptote source code and return the generated output.
   *
   * @param source - Asymptote source code.
   * @param options - Optional render options.
   * @throws {AsymptoteError} when Asymptote exits with a non-zero status.
   */
  render(source: string, options?: RenderOptions): Promise<RenderResult>;

  /**
   * Render source code and return the generated output as a browser Blob.
   *
   * @param source - Asymptote source code.
   * @param options - Optional render options.
   */
  renderToBlob(source: string, options?: RenderOptions): Promise<Blob>;

  /**
   * Render multiple sources sequentially.
   *
   * Renders are intentionally processed one at a time because the WASM
   * engine uses a shared virtual filesystem.
   *
   * @param sources - Asymptote source strings to render.
   * @param options - Optional render options applied to every source.
   */
  renderBatch(
    sources: readonly string[],
    options?: RenderOptions
  ): Promise<RenderResult[]>;

  /**
   * Render source code and trigger a browser download.
   *
   * @param source - Asymptote source code.
   * @param filename - Download filename. Defaults based on the output format.
   * @param options - Optional render options.
   */
  download(
    source: string,
    filename?: string,
    options?: RenderOptions
  ): Promise<RenderResult>;

  /**
   * Render Asymptote source code and mount the resulting SVG into a DOM element.
   *
   * @param target - CSS selector string or an `Element`.
   * @param source - Asymptote source code.
   * @param options - Optional render options.
    * @throws {AsymptoteError} when Asymptote exits with a non-zero status.
    * @throws {Error} when the selected output format is not SVG.
   */
  mount(
    target: string | Element,
    source: string,
    options?: RenderOptions
  ): Promise<RenderResult>;

  /**
   * Render a 3D Asymptote scene and mount the interactive WebGL viewer into
   * an `<iframe>` placed inside the target element.
   *
   * The generated output (Asymptote's `-f html` format) is a complete,
   * self-contained HTML document — it is embedded via `<iframe srcdoc>`
   * rather than spliced into the host page, since it brings its own
   * `<head>`/styles/`<script>` and viewer state. Rotate/zoom/pan controls
   * are provided by the bundled `asygl.js` viewer itself.
   *
   * @param target - CSS selector string or an `Element`.
   * @param source - Asymptote source code (should contain a 3D scene, e.g. `import three;`).
   * @param options - Optional render options (`format` is always `"webgl"`).
   * @throws {AsymptoteError} when Asymptote exits with a non-zero status.
   */
  mountWebGL(
    target: string | Element,
    source: string,
    options?: Omit<RenderOptions, "format">
  ): Promise<RenderResult>;
}

/** Thrown when Asymptote exits with a non-zero status code. */
export class AsymptoteError extends Error {
  /** The exit code returned by the Asymptote process (inside WASM). */
  public readonly exitCode: number;
  /** Raw stderr output from Asymptote. */
  public readonly stderr: string;

  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = "AsymptoteError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}
