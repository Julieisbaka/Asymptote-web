/**
 * asymptote-web — Public API
 *
 * @example
 * ```ts
 * import { createAsymptote } from "asymptote-web";
 *
 * const asy = await createAsymptote();
 *
 * const { svg } = await asy.render(`
 *   size(100);
 *   draw(unitcircle);
 * `);
 *
 * document.querySelector("#output").innerHTML = svg;
 * ```
 */

import { runAsymptote } from "./engine.js";
import { epsToSvg } from "./eps-to-svg.js";
import {
  type AsymptoteEngine,
  type CreateOptions,
  type RenderOptions,
  type RenderResult,
} from "./types.js";

export type { EpsToSvgOptions, EpsToSvgResult } from "./eps-to-svg.js";
export { AsymptoteError } from "./types.js";
export type {
  AsymptoteEngine,
  CreateOptions,
  OutputFormat,
  RenderOptions,
  RenderResult,
} from "./types.js";

/**
 * Convert standalone EPS or PS content (e.g. produced by an earlier
 * `asy -f eps`/`asy -f ps` run, or any file already on disk) to SVG.
 *
 * This is the same in-process converter `render({ format: "svg" })` uses
 * internally, exposed directly so existing EPS/PS files can be converted
 * without needing an Asymptote engine instance at all.
 *
 * @example
 * ```ts
 * import { epsToSvg } from "asymptote-web";
 *
 * const eps = await (await fetch("drawing.eps")).text();
 * document.querySelector("#output").innerHTML = epsToSvg(eps);
 * ```
 */
export { epsToSvg };
export { epsToSvgWithWarnings } from "./eps-to-svg.js";

/**
 * Alias of {@link epsToSvg} — Asymptote's PS output uses the same operator
 * subset as its EPS output, so both can be converted with the same function.
 */
export const psToSvg = epsToSvg;

function updateSvgElement(target: Element, svgText: string): boolean {
  const current = target.firstElementChild;
  if (!current || current.tagName.toLowerCase() !== "svg") return false;

  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const next = parsed.documentElement;
  if (next.tagName.toLowerCase() !== "svg") return false;

  for (const attribute of Array.from(current.attributes)) {
    current.removeAttribute(attribute.name);
  }
  for (const attribute of Array.from(next.attributes)) {
    current.setAttribute(attribute.name, attribute.value);
  }
  current.replaceChildren(
    ...Array.from(next.childNodes).map((node) => document.importNode(node, true))
  );
  return true;
}

function outputMimeType(format: RenderResult["format"]): string {
  switch (format) {
    case "svg":
      return "image/svg+xml";
    case "webgl":
      return "text/html";
    case "eps":
    case "ps":
      return "application/postscript";
  }
}

function defaultFilename(format: RenderResult["format"]): string {
  return `asymptote.${format === "webgl" ? "html" : format}`;
}

/**
 * Initialise the Asymptote WebAssembly engine and return a rendering instance.
 *
 * The WASM module is loaded **once** and cached for the lifetime of the page,
 * so it is safe (and efficient) to call `createAsymptote()` multiple times.
 *
 * @param options - Optional configuration (e.g. a custom WASM URL).
 *
 * @example
 * ```ts
 * const asy = await createAsymptote({ wasmUrl: "/assets/asymptote.wasm" });
 * const { svg } = await asy.render("size(200); draw(unitsquare);");
 * ```
 */
export async function createAsymptote(
  options: CreateOptions = {}
): Promise<AsymptoteEngine> {
  // Eagerly kick off the WASM load so it is already in-flight by the time
  // the caller first calls render().
  const resolvedOptions: CreateOptions = { ...options };

  const engine: AsymptoteEngine = {
    async render(
      source: string,
      renderOptions: RenderOptions = {}
    ): Promise<RenderResult> {
      return runAsymptote(source, renderOptions, resolvedOptions);
    },

    async renderToBlob(
      source: string,
      renderOptions: RenderOptions = {}
    ): Promise<Blob> {
      const result = await runAsymptote(source, renderOptions, resolvedOptions);
      return new Blob([result.output], { type: outputMimeType(result.format) });
    },

    async renderBatch(
      sources: readonly string[],
      renderOptions: RenderOptions = {}
    ): Promise<RenderResult[]> {
      const results: RenderResult[] = [];
      for (const source of sources) {
        results.push(await runAsymptote(source, renderOptions, resolvedOptions));
      }
      return results;
    },

    async download(
      source: string,
      filename?: string,
      renderOptions: RenderOptions = {}
    ): Promise<RenderResult> {
      const result = await runAsymptote(source, renderOptions, resolvedOptions);
      const blob = new Blob([result.output], { type: outputMimeType(result.format) });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? defaultFilename(result.format);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return result;
    },

    async mount(
      target: string | Element,
      source: string,
      renderOptions: RenderOptions = {}
    ): Promise<RenderResult> {
      const result = await runAsymptote(source, renderOptions, resolvedOptions);

      if (result.format !== "svg") {
        throw new Error("asymptote-web: mount only supports SVG output");
      }

      const el =
        typeof target === "string"
          ? document.querySelector(target)
          : target;

      if (!el) {
        throw new Error(`asymptote-web: mount target not found: ${target}`);
      }

      if (!(renderOptions.reuseSvg && updateSvgElement(el, result.svg))) {
        el.innerHTML = result.svg;
      }
      return result;
    },

    async mountWebGL(
      target: string | Element,
      source: string,
      renderOptions: RenderOptions = {}
    ): Promise<RenderResult> {
      const result = await runAsymptote(
        source,
        { ...renderOptions, format: "webgl" },
        resolvedOptions
      );

      const el =
        typeof target === "string"
          ? document.querySelector(target)
          : target;

      if (!el) {
        throw new Error(`asymptote-web: mountWebGL target not found: ${target}`);
      }

      // The generated HTML is a complete standalone document (own <head>,
      // styles, and viewer <script>) — embed it in an iframe rather than
      // splicing it into the host page's DOM.
      const iframe = document.createElement("iframe");
      iframe.srcdoc = result.output;
      iframe.style.border = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      el.replaceChildren(iframe);

      return result;
    },
  };

  return engine;
}
