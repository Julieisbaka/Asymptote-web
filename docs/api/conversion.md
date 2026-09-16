# Standalone EPS/PS conversion

## `epsToSvg(eps, options?)`

Converts EPS or PS text to SVG without creating an engine. The converter
supports the PostScript subset emitted by Asymptote, including paths, common
fonts, opacity, clipping, colors, transforms, and standard text sequences.

```ts
import { epsToSvg, epsToSvgWithWarnings, psToSvg } from "asymptote-web";

const eps = await (await fetch("drawing.eps")).text();
const svg = epsToSvg(eps);
```

Pass `{ precision: 1 }` for shorter coordinate formatting; the default is
three decimal places. `psToSvg` is an alias of `epsToSvg`.

## `epsToSvgWithWarnings(eps, options?)`

Returns `{ svg, warnings }` so callers can inspect content skipped while
conversion continued. Warnings identify ignored operators, unsupported raster
image operators, mesh or function-based shadings, unsupported color spaces,
and malformed shading dictionaries.

The bounded `image` form supports 8-bit grayscale string data. `colorimage`,
`imagemask`, binary image filters, and procedure-backed image sources remain
unsupported. Asymptote opacity commands such as `setopacityalpha` are
preserved across graphics state changes.

## Gradients

Linear and radial gradients are supported when geometry and color stops are
explicit and parseable. The converter accepts flat stop arrays:

```postscript
% x1 y1 x2 y2 [offset r g b ...] setlineargradient
0 0 100 0 [0 1 0 0 1 0 0 1] setlineargradient
newpath 0 0 moveto 100 0 lineto 100 100 lineto closepath fill
```

Common Level 2 shading dictionaries with `/Coords`, `/C0`, `/C1`, or
`/ColorStops` are also recognized. Mesh, function-based, unsupported color
spaces, malformed dictionaries, and incomplete stop arrays are skipped with
warnings rather than causing conversion to throw.
