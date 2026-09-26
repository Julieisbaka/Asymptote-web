# Utility helpers

The dependency-free helpers are available from `asymptote-web/utils` without
initializing the WebAssembly runtime:

```ts
import {
  colorFromComponents,
  composeMatrix,
  hsbToColor,
  identityMatrix,
  parseCompilerDiagnostics
} from "asymptote-web/utils";
```

## `parseCompilerDiagnostics(stderr)`

Parses newline-delimited Asymptote compiler output into
`CompilerDiagnostic[]`. It recognizes source locations such as
`file.asy: 12: message` and `file.asy:12.7: message`, severity prefixes, and
bracketed diagnostic codes. Unlocated text defaults to informational.

## `identityMatrix()` and `composeMatrix(first, second)`

`identityMatrix()` returns a new six-value `Matrix` representing the identity
transform. `composeMatrix()` combines affine transforms in PostScript order.

## `colorFromComponents(components)`

Converts normalized gray, RGB, or CMYK component arrays to an SVG `rgb(...)`
string. Values are clamped to the displayable range; unsupported component
counts return `"black"`.

## `hsbToColor(hue, saturation, brightness)`

Converts normalized HSB components to an SVG `rgb(...)` string. Hue wraps
cyclically, while saturation and brightness are clamped to $[0, 1]$.
