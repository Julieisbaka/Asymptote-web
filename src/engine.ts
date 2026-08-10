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
    const glueUrl = new URL("./asymptote.js", import.meta.url).href;
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
const OUTPUT_FILE = "/tmp/input.svg"; // asy names output after the input stem

/**
 * Execute Asymptote inside the WASM module and return the SVG output.
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

    const format = renderOptions.format ?? "svg";
    const extraFlags = renderOptions.flags ?? [];

    const args = [
      "-f", format,
      "-o", OUTPUT_FILE,
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

    const svg = mod.FS.readFile(OUTPUT_FILE, { encoding: "utf8" });

    return {
      svg,
      warnings: stderrLines.filter((l) => l.startsWith("Warning")),
    };
  } finally {
    mod.print = origPrint;
    mod.printErr = origPrintErr;
  }
}
