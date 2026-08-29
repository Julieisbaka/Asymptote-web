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

let _modulePromise: Promise<EmscriptenModule> | null = null;

/**
 * URL of the Emscripten-generated JS glue, relative to this file inside the
 * published dist/. Kept dynamic: asymptote.js is a separately published
 * runtime asset next to the wrapper and is not part of the Vite bundle.
 */
function getGlueUrl(options: CreateOptions = {}): string {
  return options.glueUrl
    ? new URL(options.glueUrl, import.meta.url).href
    : new URL(["./asymptote", ".js"].join(""), import.meta.url).href;
}

/**
 * Load (or return the cached) Emscripten module.
 */
async function loadModule(options: CreateOptions): Promise<EmscriptenModule> {
  if (_modulePromise) return _modulePromise;

  const modulePromise = (async (): Promise<EmscriptenModule> => {
    const glueUrl = getGlueUrl(options);
    const { default: factory }: { default: ModuleFactory } = await import(
      /* @vite-ignore */ glueUrl
    );

    // Emscripten requests both the WASM binary and the preloaded standard
    // library data file through this callback. Keep both beside the glue.
    const locateFile = (filename: string) => {
      if (filename.endsWith(".wasm")) {
        return options.wasmUrl ?? new URL("asymptote.wasm", glueUrl).href;
      }
      if (filename.endsWith(".data")) {
        return new URL("asy.data", glueUrl).href;
      }
      return filename;
    };

    const mod = await factory({ locateFile } as Partial<EmscriptenModule>);
    return mod;
  })();

  _modulePromise = modulePromise;
  void modulePromise.catch(() => {
    // Allow a later call to retry after a transient load or initialization
    // failure, without clearing a newer successful initialization.
    if (_modulePromise === modulePromise) _modulePromise = null;
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

const RENDER_ROOT = "/tmp/asymptote-web";
let renderCounter = 0;
let renderQueue: Promise<void> = Promise.resolve();

function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
  const result = renderQueue.then(task);
  renderQueue = result.then(() => undefined, () => undefined);
  return result;
}

function abortError(): DOMException {
  return new DOMException("The render was aborted", "AbortError");
}

function ensureDirectory(mod: EmscriptenModule, path: string): void {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    if (!mod.FS.analyzePath(current).exists) mod.FS.mkdir(current);
  }
}

function virtualFilePath(renderDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new TypeError(`Render file path must be relative: ${relativePath}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new TypeError(`Render file path must not contain empty, '.' or '..' segments: ${relativePath}`);
  }
  return `${renderDir}/${parts.join("/")}`;
}

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

function remapDiagnosticSources(
  diagnostics: CompilerDiagnostic[],
  renderDir: string,
  inputFile: string,
  renderOptions: RenderOptions
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

function getOutputFormat(
  renderOptions: RenderOptions,
  flags: string[]
): "svg" | "eps" | "ps" | "webgl" {
  // Asy processes flags from left to right, so a format in flags should take
  // precedence over the convenience option when both are supplied.
  let format = renderOptions.format ?? "svg";

  for (let i = 0; i < flags.length; i += 1) {
    const flag = flags[i];
    const value = flag === "-f" || flag === "--format"
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
  createOptions: CreateOptions
): Promise<RenderResult> {
  return enqueueRender(async () => {
    if (renderOptions.signal?.aborted) throw abortError();
    return runAsymptoteUnsafe(source, renderOptions, createOptions);
  });
}

async function runAsymptoteUnsafe(
  source: string,
  renderOptions: RenderOptions,
  createOptions: CreateOptions
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
      "-f", asyFormat,
      // Asymptote appends the format extension to the -o prefix itself.
      "-o", outputPrefix,
      // No LaTeX toolchain is available in WASM, and using it would spawn
      // external processes (fork) that WASM can't do — force native labels.
      "-tex", "none",
      "-noV",
      ...(format === "webgl" ? ["-asygl", asyglUrl] : []),
      ...(format === "webgl" && renderOptions.offline ? ["-offline"] : []),
      ...(format === "webgl" ? getWebGLFlags(renderOptions) : []),
      ...extraFlags,
      inputFile,
    ];

    const exitCode = mod.callMain(args);
    const stderr = stderrLines.join("\n");
    const diagnostics = remapDiagnosticSources(
      parseCompilerDiagnostics(stderr),
      renderDir,
      inputFile,
      renderOptions
    );

    if (exitCode !== 0) {
      throw new AsymptoteError(
        `ASYMPTOTE ERROR: Asymptote exited with code ${exitCode}:\n${stderr}`,
        exitCode,
        stderr,
        diagnostics
      );
    }

    const rawOutput = mod.FS.readFile(outputFile, { encoding: "utf8" });
    const skipConversion = format === "svg" && renderOptions.raw === true;
    const conversion = format === "svg" && !skipConversion
      ? epsToSvgWithWarnings(rawOutput, { precision: renderOptions.svgPrecision })
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
    if (mod.FS.analyzePath(renderDir).exists) removeTree(mod, renderDir);
  }
}

/** @internal */
export function getAsymptoteVersion(createOptions: CreateOptions): Promise<string> {
  return enqueueRender(async () => {
    const mod = await loadModule(createOptions);
    const output: string[] = [];
    const errors: string[] = [];
    const origPrint = mod.print;
    const origPrintErr = mod.printErr;
    mod.print = (text: string) => output.push(text);
    mod.printErr = (text: string) => errors.push(text);
    try {
      const exitCode = mod.callMain(["--version"]);
      if (exitCode !== 0) {
        const stderr = errors.join("\n");
        throw new AsymptoteError(
          `Unable to read Asymptote version (exit code ${exitCode})`,
          exitCode,
          stderr,
          parseCompilerDiagnostics(stderr)
        );
      }
      return [...output, ...errors].join("\n").trim();
    } finally {
      mod.print = origPrint;
      mod.printErr = origPrintErr;
    }
  });
}
