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

export function parseStops(value: Operand | undefined, c1?: Operand, c2?: Operand): ParsedStop[] | null {
  const flat = numbers(value);
  if (flat && flat.length >= 8 && flat.length % 4 === 0) {
    const stops: ParsedStop[] = [];
    for (let i = 0; i < flat.length; i += 4) {
      stops.push({ offset: flat[i], color: toColor(flat.slice(i + 1, i + 4)), opacity: 1 });
    }
    return stops;
  }
  const first = numbers(c1);
  const second = numbers(c2);
  if (first && second && first.length >= 3 && second.length >= 3) {
    return [
      { offset: 0, color: toColor(first.slice(0, 3)), opacity: first[3] ?? 1 },
      { offset: 1, color: toColor(second.slice(0, 3)), opacity: second[3] ?? 1 },
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
  const stops = parseStops(value.ColorStops, value.C0, value.C1);
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
