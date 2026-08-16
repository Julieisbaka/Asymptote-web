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
import {
  type AsymptoteEngine,
  type CreateOptions,
  type RenderOptions,
  type RenderResult,
} from "./types.js";

export { AsymptoteError } from "./types.js";
export type {
  AsymptoteEngine,
  CreateOptions,
  OutputFormat,
  RenderOptions,
  RenderResult,
} from "./types.js";

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

      el.innerHTML = result.svg;
      return result;
    },
  };

  return engine;
}
