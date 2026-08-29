import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");

const assetUrlDeclaration = `/**
 * Type declaration for runtime asset subpath exports.
 *
 * Bundlers commonly resolve these imports to the emitted asset URL string.
 */
declare const url: string;
export default url;
`;

const asymptoteJsDeclaration = `/**
 * Minimal public type declaration for the Emscripten-generated Asymptote
 * module factory exported by \"asymptote-web/asymptote.js\".
 */
export interface AsymptoteRuntimeFS {
  writeFile(path: string, data: string | Uint8Array, opts?: { encoding?: string }): void;
  readFile(path: string, opts: { encoding: \"utf8\" }): string;
  readFile(path: string, opts?: { encoding?: string }): Uint8Array;
  mkdir(path: string): void;
  unlink(path: string): void;
  rmdir(path: string): void;
  readdir(path: string): string[];
  analyzePath(path: string): { exists: boolean };
}

export interface AsymptoteRuntimeModule {
  FS: AsymptoteRuntimeFS;
  callMain(args: string[]): number;
  print(text: string): void;
  printErr(text: string): void;
  [property: string]: unknown;
}

export interface AsymptoteRuntimeOptions {
  locateFile?: (filename: string, scriptDirectory?: string) => string;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
  [property: string]: unknown;
}

declare function createAsymptoteModule(
  options?: AsymptoteRuntimeOptions
): Promise<AsymptoteRuntimeModule>;

export default createAsymptoteModule;
`;

await mkdir(dist, { recursive: true });
await Promise.all([
  writeFile(join(dist, "asset-url.d.ts"), assetUrlDeclaration, "utf8"),
  writeFile(join(dist, "asymptote-js.d.ts"), asymptoteJsDeclaration, "utf8"),
]);

console.log("Wrote package subpath declaration files.");
