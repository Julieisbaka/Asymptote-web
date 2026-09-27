import type { GraphicsState } from "../eps-graphics.js";

/** Maintains EPS path geometry and the current PostScript point. */
export class SvgPathBuilder {
  private pathParts: string[] = [];
  private pathD = "";
  private pathDirty = true;
  private pathStarted = false;
  private subpathStarted = false;
  private subpathStartX = 0;
  private subpathStartY = 0;
  private currentX = 0;
  private currentY = 0;

  constructor(
    private readonly llx: number,
    private readonly lly: number,
    private readonly height: number,
    private readonly formatNumber: (value: number) => string
  ) {}

  get currentPoint(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  newPath(): void {
    this.pathParts = [];
    this.pathD = "";
    this.pathDirty = false;
    this.pathStarted = false;
    this.subpathStarted = false;
  }

  userPoint(state: GraphicsState): { x: number; y: number } {
    const determinant = state.ctm.a * state.ctm.d - state.ctm.b * state.ctm.c;
    if (determinant === 0) return { x: 0, y: 0 };
    const x = this.currentX - state.ctm.e;
    const y = this.currentY - state.ctm.f;
    return {
      x: (state.ctm.d * x - state.ctm.c * y) / determinant,
      y: (-state.ctm.b * x + state.ctm.a * y) / determinant
    };
  }

  appendPoint(state: GraphicsState, op: "M" | "L", x: number, y: number): void {
    const { a, b, c, d, e, f } = state.ctm;
    this.currentX = a * x + c * y + e;
    this.currentY = b * x + d * y + f;
    this.pathParts.push(
      `${op}${this.formatNumber(this.currentX - this.llx)},${this.formatNumber(this.height - (this.currentY - this.lly))}`
    );
    this.pathDirty = true;
    this.pathStarted = true;
    if (op === "M") {
      this.subpathStarted = true;
      this.subpathStartX = this.currentX;
      this.subpathStartY = this.currentY;
    }
  }

  appendCurve(
    state: GraphicsState,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x: number,
    y: number
  ): void {
    const { a, b, c, d, e, f } = state.ctm;
    const ax1 = a * x1 + c * y1 + e;
    const ay1 = b * x1 + d * y1 + f;
    const ax2 = a * x2 + c * y2 + e;
    const ay2 = b * x2 + d * y2 + f;
    this.currentX = a * x + c * y + e;
    this.currentY = b * x + d * y + f;
    this.pathParts.push(
      `C${this.formatNumber(ax1 - this.llx)},${this.formatNumber(this.height - (ay1 - this.lly))} ` +
        `${this.formatNumber(ax2 - this.llx)},${this.formatNumber(this.height - (ay2 - this.lly))} ` +
        `${this.formatNumber(this.currentX - this.llx)},${this.formatNumber(this.height - (this.currentY - this.lly))}`
    );
    this.pathDirty = true;
    this.pathStarted = true;
  }

  appendArc(
    state: GraphicsState,
    cx: number,
    cy: number,
    radius: number,
    startDegrees: number,
    endDegrees: number,
    counterClockwise: boolean
  ): void {
    if (radius < 0 || !Number.isFinite(radius)) return;
    const direction = counterClockwise ? 1 : -1;
    let sweep = (endDegrees - startDegrees) * direction;
    if (Math.abs(sweep) < 1e-9) sweep = direction * 360;
    while (sweep > 360) sweep -= 360;
    while (sweep < -360) sweep += 360;
    const segments = Math.max(1, Math.ceil(Math.abs(sweep) / 90));
    const delta = sweep / segments;
    const start = (startDegrees * Math.PI) / 180;
    const startPoint = { x: cx + radius * Math.cos(start), y: cy + radius * Math.sin(start) };
    if (!this.pathStarted) this.appendPoint(state, "M", startPoint.x, startPoint.y);
    else {
      const current = this.userPoint(state);
      if (Math.hypot(current.x - startPoint.x, current.y - startPoint.y) > 1e-7) {
        this.appendPoint(state, "L", startPoint.x, startPoint.y);
      }
    }
    let angle = start;
    for (let index = 0; index < segments; index += 1) {
      const nextAngle = angle + (delta * Math.PI) / 180;
      const factor = (4 / 3) * Math.tan((nextAngle - angle) / 4);
      const p0 = { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
      const p3 = { x: cx + radius * Math.cos(nextAngle), y: cy + radius * Math.sin(nextAngle) };
      const p1 = {
        x: p0.x - factor * radius * Math.sin(angle),
        y: p0.y + factor * radius * Math.cos(angle)
      };
      const p2 = {
        x: p3.x + factor * radius * Math.sin(nextAngle),
        y: p3.y - factor * radius * Math.cos(nextAngle)
      };
      this.appendCurve(state, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      angle = nextAngle;
    }
  }

  closePath(): void {
    this.pathParts.push("Z");
    this.pathDirty = true;
    if (this.subpathStarted) {
      this.currentX = this.subpathStartX;
      this.currentY = this.subpathStartY;
    }
  }

  pathData(): string {
    if (this.pathDirty) {
      this.pathD = this.pathParts.join(" ");
      this.pathDirty = false;
    }
    return this.pathD;
  }

  advanceCurrentPoint(state: GraphicsState, dx: number, dy: number): void {
    this.currentX += state.ctm.a * dx + state.ctm.c * dy;
    this.currentY += state.ctm.b * dx + state.ctm.d * dy;
  }
}
