# 0.1.0

- Split EPS/PS interpreter types, operand helpers, and gradient helpers into focused modules.
- Fixed EPS/PS paths not resetting after painting and successive clipping paths not intersecting.
- Preserved radial gradient inner radii and added grayscale/CMYK shading stop support.
- Prevented unsupported color operations from clearing unrelated PostScript operands.
- Made WASM initialization retryable after a failed load instead of caching a rejected promise permanently.
- Made `createAsymptote()` eagerly initialize the WASM module as documented.
- Replaced deprecated `unescape`-based image encoding with UTF-8 `TextEncoder` encoding.
- Fixed unsupported `setcolor` operations leaving stale operands on the PostScript stack.
- Applied PostScript image transformation matrices when converting raster images to SVG.
- Preserved procedure-valued names that are not followed by `def` during EPS/PS tokenization.
- Fixed EPS/PS parsing for scientific-notation coordinates emitted by Asymptote.
- Fixed relative EPS/PS path operators after transforms such as `scale` and `rotate`.
- Fixed `closepath` so subsequent relative path commands use the subpath start as `currentpoint`.
- Fixed WebGL zoom requiring an initial click by priming the embedded viewer's wheel handler.
- Bounded WebGL wheel-listener priming and added iframe load failure/timeout handling.
- Optimized release output by minifying the wrapper and omitting production source maps.
- Added scientific-notation bounding-box parsing and safe fallback dimensions.
- Normalized negative zero coordinates and clamped EPS/PS colors and opacity.
- Cleaned up failed WebGL mounts and synchronized the public type reference.
- Removed the unused `vite-plugin-dts` development dependency.
- Added queued render cancellation through `AbortSignal`.
- Added bounded 8-bit grayscale PostScript `image` conversion to SVG.
- Prefixed Asymptote compiler failures with `ASYMPTOTE ERROR` for clearer diagnostics.
- Fixed lowercase characters in native fallback text labels by normalizing glyph lookup.
- Stubbed browser PDF generation with a clear Ghostscript-unavailable error (Slightly reduces package size as a bonus).

# 0.0.9

- Replaced the 5×7 glyph table with a compact vector font while preserving the existing `textpath()` patch interface. 
- Added HSB colors, basic text spacing operators, and broader font mappings.
- Report ignored operators, images, mesh shadings, and unsupported color spaces instead of silently dropping them.
- Added isolated virtual files for browser-side imports and assets, with serialized concurrent renders.
- Added browser-safe `convert()` and `animate()` runtime patching with non-fatal capability warnings.
- Added approximate browser-native `texsize()` metrics and a safe `texpath()` fallback.
- Added trusted `asy.unsafe.mount()` DOM customization for pre-rendered LaTeX SVG.
- Added `asy.version()` to report the compiled Asymptote CLI version.
- Added PostScript arcs/matrices and WebGL screen-space label overlays.

# 0.0.8

- Improve SVG gradients
- Skip unnecessary parsing
- Prevent duplicate gradient definitions
- Decreased package size by patching asymptote source code that cannot be used in the browser
- Updated emscripten to 6.0.7

# 0.0.7

- Added `renderToBlob()` for returning rendered output as a browser `Blob`.
- Added `renderBatch()` for rendering multiple sources sequentially.
- Added `download()` for triggering browser downloads of rendered output.
- Added transparency support for EPS-to-SVG conversion through opacity
  commands such as `setopacityalpha`.
- Added basic PostScript text conversion with font-family mapping, font size,
  transformed positions, escaped text content, and opacity support.
- Preserved caret and common LaTeX-like characters (`$`, `^`, `_`, braces,
  tilde, pipe, and backslash) in the WASM fallback text renderer.
- Added opt-in `reuseSvg` mounting and `svgPrecision` coordinate formatting;
  existing rendering and DOM behavior remain unchanged by default.
- Performance stuff.
- Expanded the SVG renderer to support more PostScript features.
