import { createReadStream, existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// The Emscripten glue (dist/asymptote.js) and the bundled WebGL viewer
// (dist/asygl.js) are huge, already-built plain scripts. Vite's dev-server
// transform pipeline (import-analysis/esbuild) rewrites them and corrupts
// the invoke_* trampoline bindings the wasm import object needs, producing
// "LinkError: ... requires a callable" at runtime. Serve them verbatim.
const RAW_ASSET_RE = /^\/dist\/(asymptote|asygl)\.js(\?.*)?$/;

function serveEmscriptenGlueRaw(): Plugin {
  const root = fileURLToPath(new URL(".", import.meta.url));
  return {
    name: "serve-emscripten-glue-raw",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const match = req.url && RAW_ASSET_RE.exec(req.url);
        if (!match) {
          next();
          return;
        }
        const filePath = resolve(root, `dist/${match[1]}.js`);
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

function cleanReleaseSourceMap(debugBuild: boolean): Plugin {
  return {
    name: "clean-release-source-map",
    closeBundle() {
      if (!debugBuild) {
        const mapPath = resolve(fileURLToPath(new URL(".", import.meta.url)), "dist/asymptote-web.js.map");
        if (existsSync(mapPath)) unlinkSync(mapPath);
      }
    },
  };
}

const debugBuild = process.env.ASY_DEBUG === "1";

export default defineConfig({
  plugins: [serveEmscriptenGlueRaw(), cleanReleaseSourceMap(debugBuild)],
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
    // Release builds prioritize package and transfer size. Set ASY_DEBUG=1
    // when a readable wrapper and source map are needed for debugging.
    sourcemap: debugBuild,
    minify: !debugBuild,
    // The WASM build writes asymptote.js, asymptote.wasm, asy.data, and
    // asygl.js into dist separately. Preserve those files when rebuilding the
    // TypeScript wrapper.
    emptyOutDir: false,
  },
  server: {
    headers: crossOriginIsolationHeaders,
    open: "/examples/index.html",
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
});
