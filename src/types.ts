/**
 * Public TypeScript types for asymptote-web.
 */

/** Output formats supported by the Asymptote driver. */
export type OutputFormat = "svg" | "eps" | "ps";

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
}

/** Result returned by {@link AsymptoteEngine.render}. */
export interface RenderResult {
  /** The generated output, such as SVG, EPS, or PostScript. */
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
