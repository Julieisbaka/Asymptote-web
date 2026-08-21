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

import { getAsymptoteVersion, runAsymptote } from "./engine.js";
import { epsToSvg } from "./eps-to-svg.js";
import {
  type AsymptoteEngine,
  type CreateOptions,
  type RenderOptions,
  type RenderResult,
  type WebGLLabel,
  type UnsafeSvgCustomizer,
  type UnsafeWebGLCustomizer,
} from "./types.js";

export type { EpsToSvgOptions, EpsToSvgResult } from "./eps-to-svg.js";
export { AsymptoteError } from "./types.js";
export type {
  AsymptoteEngine,
  CreateOptions,
  OutputFormat,
  RenderOptions,
  RenderResult,
  WebGLLabel,
  UnsafeSvgCustomizer,
  UnsafeWebGLCustomizer,
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

function mountUnsafeSvg(
  target: Element,
  svgText: string,
  customize: UnsafeSvgCustomizer
): void {
  const container = document.createElement("div");
  container.innerHTML = svgText;
  const svg = container.firstElementChild;
  if (!svg || svg.tagName.toLowerCase() !== "svg") {
    throw new Error("asymptote-web: unsafe.mount produced invalid SVG output");
  }
  customize(svg as SVGSVGElement);
  target.replaceChildren(svg);
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

function containWebGLScroll(html: string): string {
  const guard = `<script>(function(){function stop(event){event.preventDefault()}document.addEventListener("wheel",stop,{capture:true,passive:false});document.addEventListener("touchmove",stop,{capture:true,passive:false})})()</script>`;
  const prime = `<script>(function(){var attempts=0;function prime(){var canvas=document.getElementById("Asymptote");if(!canvas||!canvas.onmousedown){if(++attempts<120)setTimeout(prime,16);return}canvas.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,clientX:0,clientY:0}));canvas.dispatchEvent(new MouseEvent("mouseup",{bubbles:true}))}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",prime,{once:true});else prime()})()</script>`;
  const head = html.indexOf("</head>");
  const withGuard = head >= 0 ? `${html.slice(0, head)}${guard}${html.slice(head)}` : `${guard}${html}`;
  const body = withGuard.indexOf("</body>");
  return body >= 0 ? `${withGuard.slice(0, body)}${prime}${withGuard.slice(body)}` : `${withGuard}${prime}`;
}

function waitForIframeDocument(iframe: HTMLIFrameElement, timeoutMs = 15000): Promise<Document> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
      window.clearTimeout(timeout);
    };
    const onLoad = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(iframe.contentDocument ?? document);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("asymptote-web: WebGL iframe failed to load"));
    };
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("asymptote-web: timed out waiting for WebGL iframe"));
    }, timeoutMs);
    iframe.addEventListener("load", onLoad, { once: true });
    iframe.addEventListener("error", onError, { once: true });
  });
}

function addWebGLLabels(doc: Document, labels: readonly WebGLLabel[]): void {
  if (labels.length === 0) return;
  const body = doc.body;
  if (!body) return;
  body.style.position = body.style.position || "relative";
  const container = doc.createElement("div");
  container.setAttribute("aria-label", "Asymptote WebGL labels");
  container.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  for (const label of labels) {
    const element = doc.createElement("div");
    element.textContent = label.text;
    if (label.className) element.className = label.className;
    element.style.position = "absolute";
    element.style.left = `${label.x}px`;
    element.style.top = `${label.y}px`;
    element.style.color = label.color ?? "currentColor";
    element.style.fontSize = `${label.fontSize ?? 14}px`;
    element.style.transform = "translate(-50%, -50%)";
    element.style.whiteSpace = "nowrap";
    container.appendChild(element);
  }
  body.appendChild(container);
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
    async version(): Promise<string> {
      return getAsymptoteVersion(resolvedOptions);
    },

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

    unsafe: {
      async mount(
        target: string | Element,
        source: string,
        customize: UnsafeSvgCustomizer,
        renderOptions: RenderOptions = {}
      ): Promise<RenderResult> {
        const result = await runAsymptote(source, renderOptions, resolvedOptions);
        if (result.format !== "svg") {
          throw new Error("asymptote-web: unsafe.mount only supports SVG output");
        }
        const el = typeof target === "string"
          ? document.querySelector(target)
          : target;
        if (!el) {
          throw new Error(`asymptote-web: unsafe.mount target not found: ${target}`);
        }
        mountUnsafeSvg(el, result.svg, customize);
        return result;
      },
      async mountWebGL(
        target: string | Element,
        source: string,
        customize: UnsafeWebGLCustomizer,
        renderOptions: Omit<RenderOptions, "format"> = {}
      ): Promise<RenderResult> {
        const result = await runAsymptote(
          source,
          { ...renderOptions, format: "webgl" },
          resolvedOptions
        );
        const el = typeof target === "string"
          ? document.querySelector(target)
          : target;
        if (!el) {
          throw new Error(`asymptote-web: unsafe.mountWebGL target not found: ${target}`);
        }
        const iframe = document.createElement("iframe");
        iframe.srcdoc = containWebGLScroll(result.output);
        iframe.style.border = "none";
        iframe.style.width = "100%";
        iframe.style.height = "100%";
        const loaded = waitForIframeDocument(iframe);
        el.replaceChildren(iframe);
        await customize(iframe, await loaded);
        return result;
      },
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
      iframe.srcdoc = containWebGLScroll(result.output);
      iframe.style.border = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      const loaded = renderOptions.webglLabels?.length
        ? waitForIframeDocument(iframe)
        : null;
      el.replaceChildren(iframe);
      if (loaded) addWebGLLabels(await loaded, renderOptions.webglLabels ?? []);

      return result;
    },
  };

  return engine;
}
