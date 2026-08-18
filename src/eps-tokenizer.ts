/**
 * Streaming tokenizer for the constrained PostScript emitted by Asymptote.
 */
export class PostScriptTokenizer {
  private index = 0;

  constructor(private readonly source: string) {}

  next(): string | null {
    while (this.index < this.source.length) {
      this.skipIgnored();
      if (this.index >= this.source.length) return null;

      const start = this.index;
      const first = this.source[this.index];
      if (first === "[" || first === "]") {
        this.index += 1;
        return first;
      }
      if (this.source.startsWith("<<", this.index) || this.source.startsWith(">>", this.index)) {
        this.index += 2;
        return this.source.slice(start, this.index);
      }
      if (first === "(") return this.readString();

      while (
        this.index < this.source.length &&
        !/\s/.test(this.source[this.index]) &&
        this.source[this.index] !== "[" &&
        this.source[this.index] !== "]"
      ) {
        this.index += 1;
      }
      return this.source.slice(start, this.index);
    }
    return null;
  }

  private skipIgnored(): void {
    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (/\s/.test(char)) {
        this.index += 1;
      } else if (char === "%") {
        while (this.index < this.source.length && this.source[this.index] !== "\n") {
          this.index += 1;
        }
      } else if (char === "/" && this.skipProcedureDefinition()) {
        // Continue to skip whitespace following the procedure definition.
      } else {
        return;
      }
    }
  }

  private skipProcedureDefinition(): boolean {
    const start = this.index;
    let nameEnd = start + 1;
    while (
      nameEnd < this.source.length &&
      !/\s/.test(this.source[nameEnd]) &&
      !"{}/".includes(this.source[nameEnd])
    ) {
      nameEnd += 1;
    }
    if (nameEnd === start + 1) return false;

    let bodyStart = nameEnd;
    while (bodyStart < this.source.length && /\s/.test(this.source[bodyStart])) bodyStart += 1;
    if (this.source[bodyStart] !== "{") return false;

    let depth = 0;
    let bodyEnd = bodyStart;
    do {
      if (this.source[bodyEnd] === "{") depth += 1;
      else if (this.source[bodyEnd] === "}") depth -= 1;
      bodyEnd += 1;
    } while (bodyEnd < this.source.length && depth > 0);

    let suffix = bodyEnd;
    while (suffix < this.source.length && /\s/.test(this.source[suffix])) suffix += 1;
    if (this.source.startsWith("bind", suffix) && /\s/.test(this.source[suffix + 4] ?? "")) {
      suffix += 4;
      while (suffix < this.source.length && /\s/.test(this.source[suffix])) suffix += 1;
    }
    if (this.source.startsWith("def", suffix)) {
      this.index = suffix + 3;
    } else {
      this.index = bodyEnd;
    }
    return true;
  }

  private readString(): string {
    const start = this.index;
    let depth = 0;
    let escaped = false;
    do {
      const char = this.source[this.index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      this.index += 1;
    } while (this.index < this.source.length && depth > 0);
    return this.source.slice(start, this.index);
  }
}
