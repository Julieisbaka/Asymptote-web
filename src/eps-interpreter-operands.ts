import type { Matrix } from "./eps-graphics.js";
import type { Dictionary, Operand } from "./eps-interpreter-types.js";

export const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function unescapePostScriptString(token: string): string {
    const body = token.slice(1, -1);
    return body.replace(/\\([\\()nrtbf])/g, (_, escaped: string) => {
        switch (escaped) {
            case "n": return "\n";
            case "r": return "\r";
            case "t": return "\t";
            case "b": return "\b";
            case "f": return "\f";
            default: return escaped;
        }
    });
}

export function textChars(text: string): number[] {
    return Array.from(text, (char) => char.codePointAt(0) ?? 0);
}

export function isDictionary(value: Operand | undefined): value is Dictionary {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function numbers(value: Operand | undefined): number[] | null {
    return Array.isArray(value) && value.every((item) => typeof item === "number")
        ? value as number[]
        : null;
}

export function matrixFromOperand(value: Operand | undefined): Matrix | null {
    if (!Array.isArray(value) || value.length !== 6 || !value.every((item) => typeof item === "number")) {
        return null;
    }
    return { a: value[0], b: value[1], c: value[2], d: value[3], e: value[4], f: value[5] };
}

export function isMatrix(value: Matrix | null): value is Matrix {
    return value !== null;
}

export function isMatrixArray(value: Operand | undefined): value is Operand[] {
    return Array.isArray(value) && value.length === 6 && value.every((item) => typeof item === "number");
}
