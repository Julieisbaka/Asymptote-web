import { toColor, type Gradient } from "./eps-graphics.js";
import { isDictionary, numbers } from "./eps-interpreter-operands.js";
import type { Operand, ParsedStop } from "./eps-interpreter-types.js";

export function colorComponentCount(value: Operand | undefined): number | null {
  const name = typeof value === "string"
    ? value
    : Array.isArray(value) && typeof value[0] === "string"
      ? value[0]
      : undefined;
  switch (name) {
    case "DeviceGray": return 1;
    case "DeviceRGB": return 3;
    case "DeviceCMYK": return 4;
    default: return null;
  }
}

function colorStop(value: number[], colorSpace?: Operand): ParsedStop | null {
  const components = colorComponentCount(colorSpace);
  if (components === 1 && value.length >= 1) {
    return { offset: 0, color: toColor(value.slice(0, 1)), opacity: 1 };
  }
  if (components === 3 && value.length >= 3) {
    return { offset: 0, color: toColor(value.slice(0, 3)), opacity: 1 };
  }
  if (components === 4 && value.length >= 4) {
    return { offset: 0, color: toColor(value.slice(0, 4)), opacity: 1 };
  }
  if (components === null) {
    if (value.length === 1) return { offset: 0, color: toColor(value), opacity: 1 };
    if (value.length === 3) return { offset: 0, color: toColor(value), opacity: 1 };
    if (value.length >= 4) return { offset: 0, color: toColor(value.slice(0, 3)), opacity: value[3] };
  }
  return null;
}

export function parseStops(
  value: Operand | undefined,
  c1?: Operand,
  c2?: Operand,
  colorSpace?: Operand
): ParsedStop[] | null {
  const flat = numbers(value);
  const components = colorComponentCount(colorSpace) ?? 3;
  const stride = components + 1;
  if (flat && flat.length >= stride * 2 && flat.length % stride === 0) {
    const stops: ParsedStop[] = [];
    for (let i = 0; i < flat.length; i += stride) {
      const stop = colorStop(flat.slice(i + 1, i + stride), colorSpace);
      if (!stop) return null;
      stop.offset = flat[i];
      stops.push(stop);
    }
    return stops;
  }
  const first = numbers(c1);
  const second = numbers(c2);
  const firstStop = first ? colorStop(first, colorSpace) : null;
  const secondStop = second ? colorStop(second, colorSpace) : null;
  if (firstStop && secondStop) {
    firstStop.offset = 0;
    secondStop.offset = 1;
    return [
      firstStop,
      secondStop,
    ];
  }
  return null;
}

export function gradientFromValue(value: Operand | undefined): Gradient | null {
  if (!isDictionary(value)) return null;
  if (value.Shading !== undefined) return gradientFromValue(value.Shading);
  const type = value.ShadingType;
  const coords = numbers(value.Coords);
  if (type !== 2 && type !== 3) return null;
  if (!coords || (type === 2 && coords.length < 4) || (type === 3 && coords.length < 6)) return null;
  const stops = parseStops(value.ColorStops, value.C0, value.C1, value.ColorSpace);
  if (!stops) return null;
  return type === 2
    ? { kind: "linear", x1: coords[0], y1: coords[1], x2: coords[2], y2: coords[3], stops }
    : { kind: "radial", x1: coords[0], y1: coords[1], r1: coords[2], x2: coords[3], y2: coords[4], r2: coords[5], stops };
}

export function unsupportedShadingMessage(value: Operand | undefined): string | null {
  if (!isDictionary(value)) return null;
  const type = value.ShadingType;
  return type === 1
    ? "ignored function-based shading (ShadingType 1)"
    : type === 4 || type === 5 || type === 6 || type === 7
      ? `ignored mesh shading (ShadingType ${String(type)})`
      : "ignored unsupported or malformed shading dictionary";
}
