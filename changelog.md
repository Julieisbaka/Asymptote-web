# 0.0.8

- Improve SVG gradients
- Skip unnecessary parsing
- Prevent duplicate gradient definitions
- Decreased package size by patching asymptote source code that cannot be used in the browser

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
