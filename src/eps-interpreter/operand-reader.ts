import type { Dictionary, Operand } from "./interpreter-types.js";
import { NUMBER_RE, unescapePostScriptString } from "./operands.js";
import type { PostScriptTokenizer } from "./tokenizer.js";

const MAX_NESTING_DEPTH = 64;

/** Raised for nested PostScript literals deeper than the supported limit. */
export class EpsNestingLimitError extends Error {}

/** Reads nested PostScript values from the interpreter's shared token stream. */
export class OperandReader {
  private nestingDepth = 0;

  constructor(private readonly tokens: PostScriptTokenizer) {}

  readArray(): Operand[] {
    this.nestingDepth += 1;
    if (this.nestingDepth > MAX_NESTING_DEPTH) throw new EpsNestingLimitError();
    try {
      const values: Operand[] = [];
      for (
        let token = this.tokens.next();
        token !== null && token !== "]";
        token = this.tokens.next()
      ) {
        values.push(this.readValue(token));
      }
      return values;
    } finally {
      this.nestingDepth -= 1;
    }
  }

  readDictionary(): Dictionary {
    this.nestingDepth += 1;
    if (this.nestingDepth > MAX_NESTING_DEPTH) throw new EpsNestingLimitError();
    try {
      const dictionary: Dictionary = {};
      for (let token = this.tokens.next(); token !== null && token !== ">>";) {
        const key = token.startsWith("/") ? token.slice(1) : token;
        const valueToken = this.tokens.next();
        if (valueToken === null) break;
        dictionary[key] = this.readValue(valueToken);
        token = this.tokens.next() ?? ">>";
      }
      return dictionary;
    } finally {
      this.nestingDepth -= 1;
    }
  }

  readValue(token: string): Operand {
    if (token === "[") return this.readArray();
    if (token === "<<") return this.readDictionary();
    if (token.startsWith("(") && token.endsWith(")"))
      return unescapePostScriptString(token);
    if (NUMBER_RE.test(token)) return parseFloat(token);
    return token.startsWith("/") ? token.slice(1) : token;
  }
}
