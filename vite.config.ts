import { defineConfig } from "vite";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.ts",
      name: "AsymptoteWeb",
      fileName: "asymptote-web",
      formats: ["es"],
    },
    rollupOptions: {
      // Do not bundle the Emscripten glue — it is a peer asset loaded at runtime.
      external: ["./asymptote.js"],
      output: {
        // Preserve the WASM binary next to the JS bundle in dist/
        assetFileNames: "[name][extname]",
      },
    },
    // Keep source maps for easier debugging
    sourcemap: true,
    // Don't minify — the WASM binary is already optimised; let bundlers decide.
    minify: false,
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
});
