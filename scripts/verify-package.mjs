import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const requiredFiles = [
    "dist/asymptote-web.js",
    "dist/index.d.ts",
    "dist/asymptote.js",
    "dist/asymptote.wasm",
    "dist/asy.data",
    "dist/asygl.js",
];

const missing = [];
for (const relativePath of requiredFiles) {
    try {
        await access(join(root, relativePath));
    } catch {
        missing.push(relativePath);
    }
}

if (missing.length > 0) {
    console.error("Package verification failed. Missing required release assets:");
    for (const relativePath of missing) console.error(`- ${relativePath}`);
    console.error("Run the WASM build before packing or publishing.");
    process.exitCode = 1;
} else {
    console.log(`Package verification passed: ${requiredFiles.length} required files found.`);
}