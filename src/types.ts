/**
 * Public TypeScript types for asymptote-web.
 */

/** Options accepted by {@link AsymptoteEngine.render}. */
export interface RenderOptions {
  /**
   * Output format. Defaults to `"svg"`.
   * Only `"svg"` is guaranteed to be supported in all browsers.
   */
  format?: "svg";

  /**
   * Additional command-line flags forwarded to `asy`.
   * Example: `["-nosafe"]`
   */
  flags?: string[];
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
  /** The rendered SVG markup string (when successful). */
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
   * Render Asymptote source code and return an SVG string.
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
