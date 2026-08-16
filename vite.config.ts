import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// The Emscripten glue (dist/asymptote.js) is a huge, already-built ES module.
// Vite's dev-server transform pipeline (import-analysis/esbuild) rewrites it
// and corrupts the invoke_* trampoline bindings the wasm import object needs,
// producing "LinkError: ... requires a callable" at runtime. Serve it verbatim.
function serveEmscriptenGlueRaw(): Plugin {
  const root = fileURLToPath(new URL(".", import.meta.url));
  return {
    name: "serve-emscripten-glue-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !/^\/dist\/asymptote\.js(\?.*)?$/.test(req.url)) {
          next();
          return;
        }
        const filePath = resolve(root, "dist/asymptote.js");
        if (!existsSync(filePath)) {
          next();
          return;
        }
        res.setHeader("Content-Type", "text/javascript");
        createReadStream(filePath).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [serveEmscriptenGlueRaw()],
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
    open: "/examples/index.html",
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
});
