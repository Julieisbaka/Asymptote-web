export interface Dictionary {
    [key: string]: Operand;
}

export type Operand = number | Operand[] | string | Dictionary;

export interface ParsedStop {
    offset: number;
    color: string;
    opacity: number;
}
