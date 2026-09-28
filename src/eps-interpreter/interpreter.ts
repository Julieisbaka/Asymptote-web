import { NUMBER_RE, unescapePostScriptString } from "./operands.js";
import { EpsNestingLimitError, OperandReader } from "./operand-reader.js";
import { PostScriptOperatorInterpreter } from "./interpreter-operators.js";
import type { SvgWriter } from "../eps-svg-writer/writer.js";
import type { PostScriptTokenizer } from "./tokenizer.js";

/** Interpret the constrained PostScript subset emitted by Asymptote. */
export class PostScriptInterpreter extends PostScriptOperatorInterpreter {
  constructor(
    private readonly tokens: PostScriptTokenizer,
    writer: SvgWriter
  ) {
    super(writer);
  }

  /** Consume all tokens and emit supported operations to the SVG writer. */
  run(): void {
    const values = new OperandReader(this.tokens);
    try {
      for (
        let tok = this.tokens.next();
        tok !== null;
        tok = this.tokens.next()
      ) {
        if (NUMBER_RE.test(tok)) {
          this.stack.push(parseFloat(tok));
          continue;
        }
        if (tok.startsWith("(") && tok.endsWith(")")) {
          this.stack.push(unescapePostScriptString(tok));
          continue;
        }
        if (tok === "[") {
          this.stack.push(values.readArray());
          continue;
        }
        if (tok === "<<") {
          this.stack.push(values.readDictionary());
          continue;
        }
        if (tok.startsWith("/")) {
          this.stack.push(tok.slice(1));
          continue;
        }

        this.dispatch(tok);
      }
    } catch (error) {
      if (error instanceof EpsNestingLimitError) {
        this.warn(
          "stopped parsing: exceeded maximum nested array/dictionary depth"
        );
      } else if (error instanceof RangeError) {
        this.warn(
          "stopped parsing: input exceeded the interpreter's safe recursion depth"
        );
      } else {
        throw error;
      }
    }
  }
}
