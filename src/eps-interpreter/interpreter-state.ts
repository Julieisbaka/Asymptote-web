import { IDENTITY, type GraphicsState } from "../eps-graphics.js";
import type { Operand } from "./interpreter-types.js";
import { unsupportedShadingMessage } from "./gradients.js";
import type { SvgWriter } from "../eps-svg-writer/writer.js";

interface SavedGraphicsState {
  state: GraphicsState;
  colorComponentCount: number | null;
}

/** Shared mutable PostScript graphics state, operand stack, and diagnostics. */
export class InterpreterState {
  protected state: GraphicsState = {
    ctm: IDENTITY,
    fill: "black",
    gradient: null,
    stroke: "black",
    opacity: 1,
    fontFamily: "sans-serif",
    fontSize: 12,
    linewidth: 1,
    linecap: 0,
    linejoin: 0,
    miterlimit: 10,
    dasharray: [],
    dashoffset: 0,
    clipId: null
  };
  protected readonly stateStack: SavedGraphicsState[] = [];
  protected readonly stack: Operand[] = [];
  protected readonly warnings: string[] = [];
  protected colorComponentCount: number | null = null;

  constructor(protected readonly writer: SvgWriter) {}

  /** Return non-fatal conversion warnings collected during interpretation. */
  getWarnings(): string[] {
    return [...this.warnings];
  }

  protected warn(message: string): void {
    this.warnings.push(`EPS/PS: ${message}`);
  }

  protected warnUnsupportedShading(value: Operand | undefined): void {
    const message = unsupportedShadingMessage(value);
    if (message) this.warn(message);
  }

  protected popN(n: number): number[] {
    const nums: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const value = this.stack.pop();
      nums.unshift(typeof value === "number" ? value : 0);
    }
    return nums;
  }

  protected finiteNumber(value: number): number {
    return Number.isFinite(value) ? value : 0;
  }
}
