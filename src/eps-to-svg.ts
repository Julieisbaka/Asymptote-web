/**
 * eps-to-svg.ts — Public façade for converting constrained EPS/PS to SVG.
 */

import { PostScriptInterpreter } from "./eps-interpreter.js";
import { PostScriptTokenizer } from "./eps-tokenizer.js";
import { SvgWriter } from "./eps-svg-writer.js";

/** Options for the in-process EPS/PS-to-SVG converter. */
export interface EpsToSvgOptions {
  /** Number of decimal places used for generated coordinates. Defaults to 3. */
  precision?: number;
}

/**
 * Convert EPS/PS content into an SVG document string, entirely in-process
 * (no external tools, no fork/exec — safe to call in WASM or any browser).
 *
 * This understands the constrained PostScript operator subset Asymptote's
 * own EPS/PS writer emits (paths, fills, strokes, colors, clipping, and
 * `gsave`/`grestore`/`translate`/`scale`/`rotate` transforms), plus practical
 * linear and radial gradients. It is not a general-purpose PostScript
 * interpreter: arbitrary PS from other tools, embedded raster images, and
 * unsupported or malformed shading forms are silently ignored rather than
 * throwing.
 *
 * Since this only depends on plain string parsing, it works equally well
 * on EPS/PS files produced outside of this library (e.g. from a prior
 * `asy -f eps` run, or files already on disk) — it does not require an
 * Asymptote engine instance.
 *
 * @param eps - The full text of an EPS or PS file (must include a
 * `%%BoundingBox` or `%%HiResBoundingBox` comment to size the SVG).
 * @returns A standalone `<svg>` document string.
 *
 * @example
 * ```ts
 * import { epsToSvg } from "asymptote-web";
 *
 * const svg = epsToSvg(await (await fetch("drawing.eps")).text());
 * document.querySelector("#output").innerHTML = svg;
 * ```
 */
export function epsToSvg(eps: string, options: EpsToSvgOptions = {}): string {
  const precision = options.precision ?? 3;
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new RangeError("epsToSvg: precision must be an integer from 0 to 12");
  }
  const formatNumber = (value: number): string => {
    if (value === 0) return "0";
    return value.toFixed(precision).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, "$1");
  };
  const bboxMatch = /%%HiResBoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps)
    ?? /%%BoundingBox:\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)/.exec(eps);

  const llx = bboxMatch ? parseFloat(bboxMatch[1]) : 0;
  const lly = bboxMatch ? parseFloat(bboxMatch[2]) : 0;
  const urx = bboxMatch ? parseFloat(bboxMatch[3]) : 100;
  const ury = bboxMatch ? parseFloat(bboxMatch[4]) : 100;
  const width = urx - llx;
  const height = ury - lly;

  const writer = new SvgWriter(llx, lly, width, height, formatNumber);
  new PostScriptInterpreter(new PostScriptTokenizer(eps), writer).run();
  return writer.serialize();
}
