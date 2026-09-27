# Runtime and engine setup

## `createAsymptote(options?)`

Initializes the Asymptote WebAssembly module and returns an `AsymptoteEngine`.
The module is initialized when this function is called and cached for the
lifetime of the page, so multiple calls can share the same runtime.

### `getAssetUrls(baseUrl?)`

Returns matching URLs for the generated `asymptote.js`, `asymptote.wasm`, and
`asygl.js` runtime assets. Pass the result directly to `createAsymptote()`:

```ts
import { createAsymptote, getAssetUrls } from "asymptote-web";

const asy = await createAsymptote(getAssetUrls());
```

Use `baseUrl` when the four runtime assets have been copied to a public
directory or hosted on a CDN. The directory must also contain `asy.data`:

```ts
const asy = await createAsymptote(getAssetUrls("https://cdn.example.com/asymptote/"));
```

| Option     | Type     | Default   | Description                         |
| ---------- | -------- | --------- | ----------------------------------- |
| `glueUrl`  | `string` | automatic | URL of `asymptote.js`.              |
| `wasmUrl`  | `string` | automatic | URL of `asymptote.wasm`.            |
| `asyglUrl` | `string` | automatic | URL of `asygl.js` for WebGL output. |

Vite may prebundle dependencies into `node_modules/.vite/deps`, which can
make automatic glue discovery point at the wrong directory. Provide an
explicit `glueUrl` when needed:

```ts
const asy = await createAsymptote({
  glueUrl: "/node_modules/asymptote-web/dist/asymptote.js"
});
```

The package exports runtime assets as `asymptote-web/asymptote.js`,
`asymptote-web/asymptote.wasm`, `asymptote-web/asy.data`, and
`asymptote-web/asygl.js`. These subpath exports include declarations: the
Emscripten module has a factory type and binary/data/viewer assets are typed as
URL strings.

The WASM module requires all four generated assets to be served together.
Release builds minify the wrapper and omit its source map; set `ASY_DEBUG=1`
for an unminified wrapper and source map.

## Structured diagnostics

`RenderResult.diagnostics` contains editor-friendly diagnostics parsed from
Asymptote's compiler output. Each diagnostic includes `severity`, `message`,
and `raw`, plus `sourceFile`, `line`, `column`, and `code` when available.
See [Utility helpers](utilities.md) for the standalone parser.
