/**
 * engine.ts — Loads and manages the Asymptote WebAssembly module.
 *
 * This module handles:
 *  - Lazy-loading the WASM binary (with optional Cache API caching).
 *  - Setting up Emscripten's in-memory virtual filesystem (MEMFS).
 *  - Running `asy` with the given arguments and capturing output.
 */

import { AsymptoteError, type CreateOptions, type RenderOptions, type RenderResult } from "./types.js";

// ---------------------------------------------------------------------------
// Emscripten module shape (minimal subset we rely on)
// ---------------------------------------------------------------------------

interface EmscriptenModule {
  FS: {
    writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: string }): void;
    readFile(path: string, opts: { encoding: "utf8" }): string;
    mkdir(path: string): void;
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
 * Load (or return the cached) Emscripten module.
 */
async function loadModule(options: CreateOptions): Promise<EmscriptenModule> {
  if (_modulePromise) return _modulePromise;

  _modulePromise = (async (): Promise<EmscriptenModule> => {
    // Dynamically import the Emscripten-generated JS glue.
    // The path is relative to this file inside the published dist/.
    // Keep this path dynamic: asymptote.js is a separately published runtime
    // asset next to the wrapper and is not part of the Vite bundle.
    const glueUrl = "./asymptote.js";
    const { default: factory }: { default: ModuleFactory } = await import(
      /* @vite-ignore */ glueUrl
    );

    // Allow callers to override the WASM URL (CDN, versioned path, etc.)
    const locateFile = options.wasmUrl
      ? (filename: string) => (filename.endsWith(".wasm") ? options.wasmUrl! : filename)
      : undefined;

    const mod = await factory({ locateFile } as Partial<EmscriptenModule>);
    return mod;
  })();

  return _modulePromise;
}

// ---------------------------------------------------------------------------
// Core render logic
// ---------------------------------------------------------------------------

const INPUT_FILE = "/tmp/input.asy";

function getOutputFormat(
  renderOptions: RenderOptions,
  flags: string[]
): "svg" | "eps" | "ps" {
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

    if (value === "svg" || value === "eps" || value === "ps") {
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
export async function runAsymptote(
  source: string,
  renderOptions: RenderOptions,
  createOptions: CreateOptions
): Promise<RenderResult> {
  const mod = await loadModule(createOptions);

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
    // Write source into the virtual filesystem
    mod.FS.writeFile(INPUT_FILE, source);

    const extraFlags = renderOptions.flags ?? [];
    const format = getOutputFormat(renderOptions, extraFlags);
    const outputFile = `/tmp/input.${format}`;

    const args = [
      "-f", format,
      "-o", outputFile,
      ...extraFlags,
      INPUT_FILE,
    ];

    const exitCode = mod.callMain(args);

    if (exitCode !== 0) {
      const stderr = stderrLines.join("\n");
      throw new AsymptoteError(
        `Asymptote exited with code ${exitCode}:\n${stderr}`,
        exitCode,
        stderr
      );
    }

    const output = mod.FS.readFile(outputFile, { encoding: "utf8" });

    return {
      output,
      format,
      // Keep svg populated for backwards compatibility; use output for all
      // formats because EPS and PS are not SVG.
      svg: output,
      warnings: stderrLines.filter((l) => l.startsWith("Warning")),
    };
  } finally {
    mod.print = origPrint;
    mod.printErr = origPrintErr;
  }
}
