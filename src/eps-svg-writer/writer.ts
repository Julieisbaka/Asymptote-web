import type { GraphicsState } from "../eps-graphics.js";
import type { SvgAccessibility, SvgFontMap } from "../types.js";
import type { Dictionary } from "../eps-interpreter/interpreter-types.js";
import { serializeNativeLabel } from "./native-labels.js";
import type { NativeLabelContext } from "./native-labels.js";
import { SvgWriterCore } from "./svg-writer-core.js";
import { toCssFont } from "./svg-fonts.js";
import { escapeXml, formatOpacity } from "./svg-xml.js";

let accessibilityId = 0;

/** Write supported EPS graphics operations as a standalone SVG document. */
export class SvgWriter extends SvgWriterCore {
  private readonly warnings: string[] = [];
  private readonly warnedUnknownFonts = new Set<string>();
  private readonly warnedMalformedFontDescriptors = new Set<string>();
  private readonly nativeLabelStack: NativeLabelContext[] = [];

  constructor(
    llx: number,
    lly: number,
    width: number,
    height: number,
    formatNumber: (value: number) => string,
    private readonly customFonts: SvgFontMap = {},
    private readonly accessibility: SvgAccessibility = {}
  ) {
    super(llx, lly, width, height, formatNumber);
  }

  getWarnings(): string[] {
    return [...this.warnings];
  }

  beginNativeLabel(metadata: Dictionary): void {
    this.nativeLabelStack.push({ metadata, elements: [] });
  }

  endNativeLabel(): boolean {
    const context = this.nativeLabelStack.pop();
    if (!context) return false;
    const group = serializeNativeLabel(context);
    if (this.nativeLabelStack.length > 0) {
      this.nativeLabelStack[this.nativeLabelStack.length - 1].elements.push(group);
    } else {
      this.elements.push(group);
    }
    return true;
  }

  show(state: GraphicsState, text: string, adjustments: Array<[number, number]> = []): void {
    const point = this.currentPoint;
    const x = point.x - this.llx;
    const y = this.height - (point.y - this.lly);
    const scale = Math.sqrt(state.ctm.a ** 2 + state.ctm.b ** 2);
    const angle = -(Math.atan2(state.ctm.b, state.ctm.a) * 180) / Math.PI;
    const font = toCssFont(
      state.fontFamily,
      this.customFonts,
      (fontName) => this.warnUnknownFont(fontName),
      (fontName) => this.warnMalformedFontDescriptor(fontName)
    );
    const transform =
      angle !== 0
        ? ` transform="rotate(${this.formatNumber(angle)} ${this.formatNumber(x)} ${this.formatNumber(y)})"`
        : "";
    const opacityAttr = state.opacity < 1 ? ` opacity="${formatOpacity(state.opacity)}"` : "";
    const weightAttr = font.weight ? ` font-weight="${font.weight}"` : "";
    const styleAttr = font.style ? ` font-style="${font.style}"` : "";
    const stretchAttr = font.stretch ? ` font-stretch="${font.stretch}"` : "";
    const chars = Array.from(text);
    const content =
      adjustments.length === 0
        ? escapeXml(text)
        : chars
            .map((char, index) => {
              if (index === 0) return `<tspan>${escapeXml(char)}</tspan>`;
              const [dx, dy] = adjustments[index - 1] ?? [0, 0];
              const tx = state.ctm.a * dx + state.ctm.c * dy;
              const ty = -(state.ctm.b * dx + state.ctm.d * dy);
              return `<tspan dx="${this.formatNumber(tx)}" dy="${this.formatNumber(ty)}">${escapeXml(char)}</tspan>`;
            })
            .join("");
    this.pushElement(
      `<text x="${this.formatNumber(x)}" y="${this.formatNumber(y)}" fill="${state.fill}" ` +
        `font-family="${escapeXml(font.family)}" font-size="${this.formatNumber(state.fontSize * scale)}"` +
        `${weightAttr}${styleAttr}${stretchAttr}${transform}${opacityAttr}>${content}</text>`
    );
    const advance = state.fontSize * 0.6 * chars.length;
    const extraX = adjustments.reduce((sum, value) => sum + value[0], 0);
    const extraY = adjustments.reduce((sum, value) => sum + value[1], 0);
    this.path.advanceCurrentPoint(state, advance + extraX, extraY);
  }

  protected override pushElement(element: string): void {
    if (this.nativeLabelStack.length > 0) {
      this.nativeLabelStack[this.nativeLabelStack.length - 1].elements.push(element);
      return;
    }
    this.elements.push(element);
  }

  private warn(message: string): void {
    this.warnings.push(`EPS/PS: ${message}`);
  }

  private warnUnknownFont(fontName: string): void {
    if (this.warnedUnknownFonts.has(fontName)) return;
    this.warnedUnknownFonts.add(fontName);
    this.warn(`unknown font '${fontName}'; preserving family with generic fallback`);
  }

  private warnMalformedFontDescriptor(fontName: string): void {
    if (this.warnedMalformedFontDescriptors.has(fontName)) return;
    this.warnedMalformedFontDescriptors.add(fontName);
    this.warn(`ignored malformed custom font descriptor for '${fontName}'`);
  }

  private finalizeOpenNativeLabels(): void {
    while (this.nativeLabelStack.length > 0) {
      this.warn("unmatched native-label begin marker; auto-closing at end of file");
      this.endNativeLabel();
    }
  }

  serialize(): string {
    this.finalizeOpenNativeLabels();
    const title = this.accessibility.title;
    const description = this.accessibility.description;
    const titleId = title ? `asy-title-${(accessibilityId += 1)}` : undefined;
    const descriptionId = description ? `asy-description-${(accessibilityId += 1)}` : undefined;
    const labelledBy = this.accessibility.labelledBy ?? titleId;
    const describedBy = this.accessibility.describedBy ?? descriptionId;
    const role = this.accessibility.role ?? (title || description ? "img" : undefined);
    const accessibilityAttributes = [
      role ? ` role="${escapeXml(role)}"` : "",
      labelledBy ? ` aria-labelledby="${escapeXml(labelledBy)}"` : "",
      describedBy ? ` aria-describedby="${escapeXml(describedBy)}"` : ""
    ].join("");
    const metadata = [
      title ? `<title id="${titleId}">${escapeXml(title)}</title>` : "",
      description ? `<desc id="${descriptionId}">${escapeXml(description)}</desc>` : ""
    ].join("");
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" ` +
      `viewBox="0 0 ${this.width} ${this.height}"${accessibilityAttributes}>` +
      metadata +
      (this.defs.length > 0 ? `<defs>${this.defs.join("")}</defs>` : "") +
      this.elements.join("") +
      `</svg>`
    );
  }
}
