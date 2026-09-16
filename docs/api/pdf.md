# PDF export

PDF helpers live in `asymptote-web/pdf`, so applications that only render
SVG, EPS, PS, or WebGL do not load PDF code:

```ts
import { downloadPdf, renderToPdfBlob, svgToPdfBlob } from "asymptote-web/pdf";
```

## `renderToPdfBlob(engine, source, options?)`

Renders Asymptote source as SVG, rasterizes it in a browser canvas, and
returns an `application/pdf` `Blob`. SVG text is also written as a selectable
PDF text layer.

| Option       | Type                                 | Default         | Description                          |
| ------------ | ------------------------------------ | --------------- | ------------------------------------ |
| `scale`      | `number`                             | `2`             | Rasterization scale.                 |
| `background` | `string \| null`                     | `"white"`       | Canvas background.                   |
| `quality`    | `number`                             | browser default | JPEG quality from 0 to 1.            |
| `margin`     | `number \| object`                   | `0`             | Extra page space around the SVG.     |
| `textMode`   | `"invisible" \| "visible" \| "none"` | `"invisible"`   | PDF text-layer mode.                 |
| `textRuns`   | `PdfTextRun[]`                       | auto-extracted  | Explicit selectable text runs.       |
| `render`     | `RenderOptions` except `format`      | `{}`            | Options passed to `engine.render()`. |

## `svgToPdfBlob(svg, options?)`

Converts an existing SVG string to a PDF blob using the same raster image and
text-layer strategy.

## `downloadPdf(engine, source, filename?, options?)`

Renders source, creates a PDF blob, and triggers a browser download. It returns
the underlying SVG render result.

## `imagesToPdfBytes(pages, options?)`

Creates a multi-page PDF from JPEG-backed pages. Each page can specify image
dimensions, PDF dimensions, text mode, and selectable text runs. The lower-level
`imageToPdfBytes()` helper accepts JPEG bytes directly and can be used outside
the browser.

Browser helpers require DOM, `Blob`, `FileReader`, `Image`, and canvas support.
This is hybrid raster PDF export, not native vector PDF output.
