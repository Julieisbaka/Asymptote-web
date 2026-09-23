/**
 * engine.ts — Loads and manages the Asymptote WebAssembly module.
 *
 * This module handles:
 *  - Lazy-loading the WASM binary.
 *  - Setting up Emscripten's in-memory virtual filesystem (MEMFS).
 *  - Running `asy` with the given arguments and capturing output.
 */

import {
  AsymptoteError,
  type CompilerDiagnostic,
  type CreateOptions,
  type RenderOptions,
  type RenderResult,
} from "./types.js";
import { parseCompilerDiagnostics } from "./diagnostics.js";
import { epsToSvgWithWarnings } from "./eps-to-svg.js";

// ---------------------------------------------------------------------------
// Emscripten module shape (minimal subset we rely on)
// ---------------------------------------------------------------------------

interface EmscriptenModule {
  FS: {
    writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: string }): void;
    readFile(path: string, opts: { encoding: "utf8" }): string;
    mkdir(path: string): void;
    unlink(path: string): void;
    rmdir(path: string): void;
    readdir(path: string): string[];
    analyzePath(path: string): { exists: boolean };
  };
  callMain(args: string[]): number;
  print(text: string): void;
  printErr(text: string): void;
}

// The Emscripten-generated factory function (MODULARIZE=1, EXPORT_ES6=1)
type ModuleFactory = (opts?: Partial<EmscriptenModule>) => Promise<EmscriptenModule>;

// ---------------------------------------------------------------------------
// Module-level singleton so the WASM binary is only loaded once per page.
// ---------------------------------------------------------------------------

/** Cached module initialization promises keyed by glue and WASM URLs. */
const _modulePromises = new Map<string, Promise<EmscriptenModule>>();
/** Serialized render queues keyed by the corresponding runtime configuration. */
const _renderQueues = new Map<string, Promise<void>>();

/**
 * URL of the Emscripten-generated JS glue, relative to this file inside the
 * published dist/. Kept dynamic: asymptote.js is a separately published
 * runtime asset next to the wrapper and is not part of the Vite bundle.
 */
/** Resolve the Emscripten glue asset URL for a runtime configuration. */
function getGlueUrl(options: CreateOptions = {}): string {
  return options.glueUrl
    ? new URL(options.glueUrl, import.meta.url).href
    : new URL(["./asymptote", ".js"].join(""), import.meta.url).href;
}

/** Build the cache and queue key for a runtime configuration. */
function getModuleCacheKey(options: CreateOptions): string {
  const glueUrl = getGlueUrl(options);
  const wasmUrl = options.wasmUrl ?? new URL("asymptote.wasm", glueUrl).href;
  return `${glueUrl}\0${wasmUrl}`;
}

/**
 * Load (or return the cached) Emscripten module.
 */
/** Load or reuse the Emscripten module for the requested asset configuration. */
async function loadModule(options: CreateOptions): Promise<EmscriptenModule> {
  const glueUrl = getGlueUrl(options);
  const wasmUrl = options.wasmUrl ?? new URL("asymptote.wasm", glueUrl).href;
  const cacheKey = getModuleCacheKey(options);
  const cached = _modulePromises.get(cacheKey);
  if (cached) return cached;

  const modulePromise = (async (): Promise<EmscriptenModule> => {
    const { default: factory }: { default: ModuleFactory } = await import(
      /* @vite-ignore */ glueUrl
    );

    // Emscripten requests both the WASM binary and the preloaded standard
    // library data file through this callback. Keep both beside the glue.
    const locateFile = (filename: string) => {
      if (filename.endsWith(".wasm")) {
        return wasmUrl;
      }
      if (filename.endsWith(".data")) {
        return new URL("asy.data", glueUrl).href;
      }
      return filename;
    };

    const mod = await factory({ locateFile } as Partial<EmscriptenModule>);
    return mod;
  })();

  _modulePromises.set(cacheKey, modulePromise);
  void modulePromise.catch(() => {
    // Allow a later call to retry after a transient load or initialization
    // failure, without clearing a newer successful initialization.
    if (_modulePromises.get(cacheKey) === modulePromise) _modulePromises.delete(cacheKey);
  });
  return modulePromise;
}

/** Preload the shared WASM module during engine creation. */
export async function preloadModule(options: CreateOptions): Promise<void> {
  await loadModule(options);
}

// ---------------------------------------------------------------------------
// Core render logic
// ---------------------------------------------------------------------------

/** Root directory used for isolated per-render files in MEMFS. */
const RENDER_ROOT = "/tmp/asymptote-web";
let renderCounter = 0;
/** Append a task to the queue for one runtime without blocking other runtimes. */
function enqueueRender<T>(cacheKey: string, task: () => Promise<T>): Promise<T> {
  const queue = _renderQueues.get(cacheKey) ?? Promise.resolve();
  const result = queue.then(task);
  _renderQueues.set(
    cacheKey,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/** Create the standard cancellation error for queued renders. */
function abortError(): DOMException {
  return new DOMException("The render was aborted", "AbortError");
}

/** Validate render options before a request enters the serialized queue. */
function validateRenderOptions(renderOptions: RenderOptions): void {
  if (
    renderOptions.devicePixelRatio !== undefined &&
    (!Number.isFinite(renderOptions.devicePixelRatio) || renderOptions.devicePixelRatio <= 0)
  ) {
    throw new RangeError("asymptote-web: devicePixelRatio must be a positive finite number");
  }
  if (renderOptions.position && renderOptions.position.some((value) => !Number.isFinite(value))) {
    throw new RangeError("asymptote-web: position values must be finite numbers");
  }
  if (
    renderOptions.webglIframeTimeoutMs !== undefined &&
    (!Number.isFinite(renderOptions.webglIframeTimeoutMs) || renderOptions.webglIframeTimeoutMs < 0)
  ) {
    throw new TypeError("asymptote-web: WebGL iframe timeout must be a non-negative finite number");
  }
}

/** Create all missing directories in the runtime's virtual filesystem. */
function ensureDirectory(mod: EmscriptenModule, path: string): void {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    if (!mod.FS.analyzePath(current).exists) mod.FS.mkdir(current);
  }
}

/** Resolve and validate a caller-provided path inside a render directory. */
function virtualFilePath(renderDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new TypeError(`Render file path must be relative: ${relativePath}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new TypeError(
      `Render file path must not contain empty, '.' or '..' segments: ${relativePath}`,
    );
  }
  return `${renderDir}/${parts.join("/")}`;
}

/** Recursively remove a render directory from MEMFS on a best-effort basis. */
function removeTree(mod: EmscriptenModule, path: string): void {
  try {
    for (const entry of mod.FS.readdir(path)) {
      if (entry !== "." && entry !== "..") removeTree(mod, `${path}/${entry}`);
    }
    mod.FS.rmdir(path);
  } catch {
    if (mod.FS.analyzePath(path).exists) mod.FS.unlink(path);
  }
}

/** Replace internal virtual source paths with caller-facing diagnostic paths. */
function remapDiagnosticSources(
  diagnostics: CompilerDiagnostic[],
  renderDir: string,
  inputFile: string,
  renderOptions: RenderOptions,
): CompilerDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    if (!diagnostic.sourceFile) return diagnostic;
    if (diagnostic.sourceFile === inputFile) {
      return { ...diagnostic, sourceFile: renderOptions.sourceFile ?? "input.asy" };
    }
    const prefix = `${renderDir}/`;
    if (diagnostic.sourceFile.startsWith(prefix)) {
      return { ...diagnostic, sourceFile: diagnostic.sourceFile.slice(prefix.length) };
    }
    return diagnostic;
  });
}

/** Translate typed WebGL options into Asymptote command-line flags. */
function getWebGLFlags(renderOptions: RenderOptions): string[] {
  const flags: string[] = [];

  if (renderOptions.position) {
    flags.push("-position", renderOptions.position.join(","));
  }
  if (renderOptions.devicePixelRatio !== undefined) {
    flags.push("-devicepixelratio", String(renderOptions.devicePixelRatio));
  }
  if (renderOptions.autobillboard !== undefined) {
    flags.push(renderOptions.autobillboard ? "-autobillboard" : "-noautobillboard");
  }

  return flags;
}

/** Determine the effective output format, honoring later format flags. */
function getOutputFormat(
  renderOptions: RenderOptions,
  flags: string[],
): "svg" | "eps" | "ps" | "webgl" {
  // Asy processes flags from left to right, so a format in flags should take
  // precedence over the convenience option when both are supplied.
  let format = renderOptions.format ?? "svg";

  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    const value =
      flag === "-f" || flag === "--format"
        ? flags[i + 1]
        : flag.startsWith("-f=")
          ? flag.slice(3)
          : flag.startsWith("--format=")
            ? flag.slice(9)
            : undefined;

    if (value === "svg" || value === "eps" || value === "ps" || value === "webgl") {
      format = value;
      if (flag === "-f" || flag === "--format") i += 1;
    }
  }

  return format;
}

/**
 * Execute Asymptote inside the WASM module and return the generated output.
 *
 * @internal
 */
export function runAsymptote(
  source: string,
  renderOptions: RenderOptions,
  createOptions: CreateOptions,
): Promise<RenderResult> {
  validateRenderOptions(renderOptions);
  return enqueueRender(getModuleCacheKey(createOptions), async () => {
    if (renderOptions.signal?.aborted) throw abortError();
    return runAsymptoteUnsafe(source, renderOptions, createOptions);
  });
}

async function runAsymptoteUnsafe(
  source: string,
  renderOptions: RenderOptions,
  createOptions: CreateOptions,
): Promise<RenderResult> {
  const mod = await loadModule(createOptions);
  const renderDir = `${RENDER_ROOT}/render-${++renderCounter}`;
  const inputFile = `${renderDir}/input.asy`;
  const outputPrefix = `${renderDir}/output`;
  ensureDirectory(mod, RENDER_ROOT);
  ensureDirectory(mod, renderDir);

  // Capture stdout + stderr
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  // Temporarily monkey-patch the module's print functions.
  // Emscripten calls these synchronously during callMain.
  const origPrint = mod.print;
  const origPrintErr = mod.printErr;
  mod.print = (text: string) => stdoutLines.push(text);
  mod.printErr = (text: string) => stderrLines.push(text);

  try {
    // Write source and caller-provided files into this render's isolated
    // virtual filesystem. Relative imports resolve beside input.asy.
    mod.FS.writeFile(inputFile, source);
    for (const [relativePath, data] of Object.entries(renderOptions.files ?? {})) {
      const path = virtualFilePath(renderDir, relativePath);
      const directory = path.slice(0, path.lastIndexOf("/"));
      ensureDirectory(mod, directory);
      mod.FS.writeFile(path, data);
    }

    const extraFlags = renderOptions.flags ?? [];
    const format = getOutputFormat(renderOptions, extraFlags);

    // Asymptote has no in-process SVG writer: `-f svg` normally shells out to
    // the external `dvisvgm` tool via fork()/exec(), which WASM can't do.
    // Instead, render Asymptote's native (in-process) EPS output and convert
    // it to SVG ourselves — see eps-to-svg.ts.
    // `-f html` is Asymptote's WebGL 3D output (a self-contained document
    // embedding a <script> reference to the asygl.js viewer) — no conversion
    // needed, but it does need the bundled asygl.js resolved as -asygl=<url>.
    const asyFormat = format === "svg" ? "eps" : format === "webgl" ? "html" : format;
    const outputFile = `${outputPrefix}.${asyFormat}`;
    const asyglUrl = createOptions.asyglUrl ?? new URL("asygl.js", getGlueUrl(createOptions)).href;

    const args = [
      "-f",
      asyFormat,
      // No LaTeX toolchain is available in WASM, and using it would spawn
      // external processes (fork) that WASM can't do — force native labels.
      "-tex",
      "none",
      "-noV",
      ...(format === "webgl" ? ["-asygl", asyglUrl] : []),
      ...(format === "webgl" && renderOptions.offline ? ["-offline"] : []),
      ...(format === "webgl" ? getWebGLFlags(renderOptions) : []),
      ...extraFlags,
      // Asymptote appends the format extension to this prefix. Keep it after
      // extra flags so output-name options cannot override the isolated path.
      "-o",
      outputPrefix,
      inputFile,
    ];

    let exitCode: number;
    try {
      exitCode = mod.callMain(args);
    } catch (error) {
      // An uncaught WASM-level abort leaves the module instance permanently
      // unusable (Emscripten cannot resume after abort()). Drop the cached
      // instance so the next render lazily reinitializes a fresh module
      // instead of repeatedly failing against the crashed one.
      _modulePromises.delete(getModuleCacheKey(createOptions));
      const reason = error instanceof Error ? error.message : String(error);
      throw new AsymptoteError(
        `ASYMPTOTE ERROR: the WebAssembly module crashed while rendering (${reason}). It will be reinitialized on the next render.`,
        -1,
        stderrLines.join("\n"),
        [],
      );
    }
    const stderr = stderrLines.join("\n");
    const diagnostics = remapDiagnosticSources(
      parseCompilerDiagnostics(stderr),
      renderDir,
      inputFile,
      renderOptions,
    );

    if (exitCode !== 0) {
      throw new AsymptoteError(
        `ASYMPTOTE ERROR: Asymptote exited with code ${exitCode}:\n${stderr}`,
        exitCode,
        stderr,
        diagnostics,
      );
    }

    const rawOutput = mod.FS.readFile(outputFile, { encoding: "utf8" });
    const skipConversion = format === "svg" && renderOptions.raw === true;
    const conversion =
      format === "svg" && !skipConversion
        ? epsToSvgWithWarnings(rawOutput, {
            precision: renderOptions.svgPrecision,
            fonts: renderOptions.svgFonts,
            accessibility: renderOptions.accessibility,
          })
        : { svg: rawOutput, warnings: [] };
    const output = conversion.svg;

    return {
      output,
      // Report "eps" when the automatic SVG conversion was skipped, since
      // that's what output actually contains.
      format: skipConversion ? "eps" : format,
      // Keep svg populated for backwards compatibility; use output for all
      // formats because EPS, PS, and webgl (HTML) are not SVG.
      svg: output,
      warnings: [
        ...stderrLines.filter((line) => /(?:^|\s)warning(?:\s|$)/i.test(line)),
        ...conversion.warnings,
      ],
      diagnostics,
    };
  } finally {
    mod.print = origPrint;
    mod.printErr = origPrintErr;
    // Best-effort cleanup: a crashed module may throw here too, but that
    // must not mask the original error above.
    try {
      if (mod.FS.analyzePath(renderDir).exists) removeTree(mod, renderDir);
    } catch {
      // Ignored — see comment above.
    }
  }
}

/** @internal */
export function getAsymptoteVersion(createOptions: CreateOptions): Promise<string> {
  return enqueueRender(getModuleCacheKey(createOptions), async () => {
    const mod = await loadModule(createOptions);
    const output: string[] = [];
    const errors: string[] = [];
    const origPrint = mod.print;
    const origPrintErr = mod.printErr;
    mod.print = (text: string) => output.push(text);
    mod.printErr = (text: string) => errors.push(text);
    let exitCode: number;
    try {
      exitCode = mod.callMain(["--version"]);
    } catch (error) {
      _modulePromises.delete(getModuleCacheKey(createOptions));
      const reason = error instanceof Error ? error.message : String(error);
      throw new AsymptoteError(
        `Unable to read Asymptote version: the WebAssembly module crashed (${reason}). It will be reinitialized on the next render.`,
        -1,
        errors.join("\n"),
        parseCompilerDiagnostics(errors.join("\n")),
      );
    } finally {
      mod.print = origPrint;
      mod.printErr = origPrintErr;
    }
    if (exitCode !== 0) {
      const stderr = errors.join("\n");
      throw new AsymptoteError(
        `Unable to read Asymptote version (exit code ${exitCode})`,
        exitCode,
        stderr,
        parseCompilerDiagnostics(stderr),
      );
    }
    return [...output, ...errors].join("\n").trim();
  });
}
