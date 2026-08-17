#!/usr/bin/env python3
"""
Replaces Asymptote's `textpath()` native-text fallback (which normally shells
out to `groff`+`gs` via fork()/exec(), unavailable in WASM) with an in-process
5x7 dot-matrix font renderer. Produces real filled vector paths — no external
processes, and no interpreter-binding changes needed since textpath() already
returns a path[][] that the existing label-drawing pipeline fills/positions.

Patches runlabel.in (not the generated runlabel.cc): Asymptote's Makefile has
a rule regenerating runlabel.cc from runlabel.in (via runtime.py) whenever
the .in is newer, so patching the generated .cc directly gets silently
overwritten during the build. runtime.py splits the file into blank-line
delimited "sections" and requires each one to be exactly one function
definition — it rejects file-scope data/helper declarations between
functions ("bad function definition") — so everything here (font table,
lookup, and the small rect-path builder) lives as local statics/lambdas
inside the single textpath() function body, keeping it one section.
"""
import sys

PATH = "/src/asymptote/runlabel.in"

ORIGINAL = '''patharray2 *textpath(stringarray *s, penarray *p)
{
  size_t n=checkArrays(s,p);
  if(n == 0) return new array(0);

  string prefix=cleanpath(outname());
  string outputname=auxname(prefix,getSetting<string>("textoutformat"));

  string textname=auxname(prefix,getSetting<string>("textextension"));
  std::ofstream text(textname.c_str());

  if(!text) cannotwrite(textname);

  for(size_t i=0; i < n; ++i) {
    text << getSetting<string>("textprologue") << newl
         << read<pen>(p,i).Font() << newl
         << read<string>(s,i) << newl
         << getSetting<string>("textepilogue") << endl;
  }
  text.close();

  string psname=auxname(prefix,"ps");
  std::ofstream ps(psname.c_str());
  if(!ps) cannotwrite(psname);

  showpath(ps);

  mem::vector<string> cmd;
  cmd.push_back(getSetting<string>("textcommand"));
  push_split(cmd,getSetting<string>("textcommandOptions"));
  cmd.push_back(textname);
  iopipestream typesetter(cmd);
  typesetter.block(true,false);

  mem::vector<string> cmd2;
  cmd2.push_back(getSetting<string>("gs"));
  cmd2.push_back("-q");
  cmd2.push_back("-dNoOutputFonts");
  cmd2.push_back("-dNOPAUSE");
  cmd2.push_back("-dBATCH");
  cmd2.push_back("-P");
  if(safe) cmd2.push_back("-dSAFER");
  cmd2.push_back("-sDEVICE="+getSetting<string>("psdriver"));
  cmd2.push_back("-sOutputFile=-");
  cmd2.push_back("-");
  iopipestream gs(cmd2,"gs","Ghostscript");
  gs.block(false,false);

  // TODO: Simplify by connecting the pipes directly.
  for(;;) {
    string out;
    if(typesetter.isopen()) {
      typesetter >> out;
      if(!out.empty()) gs << out;
      else if(!typesetter.running()) {
        typesetter.pipeclose();
        gs.eof();
      }
    }
    string out2;
    gs >> out2;
    if(out2.empty() && !gs.running()) break;
    ps << out2;
  }
  ps.close();

  if(verbose > 2) cout << endl;

  bool keep=getSetting<bool>("keep");
  if(!keep) // Delete temporary files.
    unlink(textname.c_str());
  return readpath(psname,keep,0.1);
}
'''

# 5x7 dot-matrix font: one 7-byte row-group per character in glyphChars
# (parallel arrays, kept flat/unnested so runtime.py's simple parser handles
# them like the existing flat array literals elsewhere in this file, e.g.
# runpair.in's `real p[]={...}`). Each byte's low 5 bits are columns
# left(bit4)-to-right(bit0).
GLYPH_CHARS = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,!?:;'\"-+=/()^$_{}~|\\"
GLYPH_ROWS = {
    ' ': (0,0,0,0,0,0,0),
    '0': (0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110),
    '1': (0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110),
    '2': (0b01110,0b10001,0b00001,0b00010,0b00100,0b01000,0b11111),
    '3': (0b11111,0b00010,0b00100,0b00010,0b00001,0b10001,0b01110),
    '4': (0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010),
    '5': (0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110),
    '6': (0b00110,0b01000,0b10000,0b11110,0b10001,0b10001,0b01110),
    '7': (0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000),
    '8': (0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110),
    '9': (0b01110,0b10001,0b10001,0b01111,0b00001,0b00010,0b01100),
    'A': (0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001),
    'B': (0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b11110),
    'C': (0b01111,0b10000,0b10000,0b10000,0b10000,0b10000,0b01111),
    'D': (0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110),
    'E': (0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111),
    'F': (0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000),
    'G': (0b01111,0b10000,0b10000,0b10111,0b10001,0b10001,0b01111),
    'H': (0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001),
    'I': (0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110),
    'J': (0b00001,0b00001,0b00001,0b00001,0b00001,0b10001,0b01110),
    'K': (0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001),
    'L': (0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111),
    'M': (0b10001,0b11011,0b10101,0b10101,0b10001,0b10001,0b10001),
    'N': (0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001),
    'O': (0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110),
    'P': (0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000),
    'Q': (0b01110,0b10001,0b10001,0b10001,0b10101,0b10010,0b01101),
    'R': (0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001),
    'S': (0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110),
    'T': (0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100),
    'U': (0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110),
    'V': (0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b00100),
    'W': (0b10001,0b10001,0b10001,0b10101,0b10101,0b10101,0b01010),
    'X': (0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001),
    'Y': (0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100),
    'Z': (0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111),
    '.': (0,0,0,0,0,0b01100,0b01100),
    ',': (0,0,0,0,0b01100,0b01100,0b01000),
    '!': (0b00100,0b00100,0b00100,0b00100,0b00100,0,0b00100),
    '?': (0b01110,0b10001,0b00010,0b00100,0b00100,0,0b00100),
    ':': (0,0b01100,0b01100,0,0b01100,0b01100,0),
    ';': (0,0b01100,0b01100,0,0b01100,0b01100,0b01000),
    "'": (0b00100,0b00100,0b01000,0,0,0,0),
    '"': (0b01010,0b01010,0,0,0,0,0),
    '-': (0,0,0,0b11111,0,0,0),
    '+': (0,0b00100,0b00100,0b11111,0b00100,0b00100,0),
    '=': (0,0,0b11111,0,0b11111,0,0),
    '/': (0b00001,0b00010,0b00100,0b00100,0b01000,0b10000,0b10000),
    '(': (0b00010,0b00100,0b01000,0b01000,0b01000,0b00100,0b00010),
    ')': (0b01000,0b00100,0b00010,0b00010,0b00010,0b00100,0b01000),
    '^': (0b00100,0b01010,0b10001,0,0,0,0),
    '$': (0b00100,0b01111,0b10100,0b01110,0b00101,0b11110,0b00100),
    '_': (0,0,0,0,0,0,0b11111),
    '{': (0b00011,0b00100,0b00100,0b11000,0b00100,0b00100,0b00011),
    '}': (0b11000,0b00100,0b00100,0b00011,0b00100,0b00100,0b11000),
    '~': (0,0b01001,0b10110,0,0,0,0),
    '|': (0b00100,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100),
    '\\': (0b10000,0b10000,0b01000,0b00100,0b00010,0b00001,0b00001),
}


def cpp_char_literal(c):
    if c == "'":
        return "'\\''"
    if c == '"':
        return "'\"'"
    if c == '\\':
        return "'\\\\'"
    return f"'{c}'"


def build_replacement():
    glyph_data = []
    for c in GLYPH_CHARS:
        # Lowercase reuses its uppercase glyph (no distinct lowercase forms).
        rows = GLYPH_ROWS.get(c, GLYPH_ROWS.get(c.upper()))
        glyph_data.extend(rows)
    data_literal = ",".join(f"0b{v:05b}" for v in glyph_data)
    chars_literal = "".join(
        "\\'" if c == "'" else ("\\\\" if c == "\\" else ("\\\"" if c == '"' else c))
        for c in GLYPH_CHARS
    )

    return f'''patharray2 *textpath(stringarray *s, penarray *p)
{{
  // Simple built-in 5x7 dot-matrix font, since no external typesetter
  // (groff) is available. Kept as local statics/lambdas inside this single
  // function — runtime.py (the .in -> .cc generator) requires each
  // blank-line-delimited section of this file to be exactly one function
  // definition, and rejects file-scope data/helpers between functions.
  static const char glyphChars[]="{chars_literal}";
  static const unsigned char glyphData[]={{{data_literal}}};

  size_t n=checkArrays(s,p);
  if(n == 0) return new array(0);

  patharray2 *PP=new array(0);
  for(size_t i=0; i < n; ++i) {{
    string str=read<string>(s,i);
    double fontsize=read<pen>(p,i).size();
    if(fontsize <= 0) fontsize=10.0;
    double pixelSize=fontsize/9.0;
    double charAdvance=6.0*pixelSize;
    patharray *P=new array(0);
    double x=0.0;
    for(size_t ci=0; ci < str.size(); ++ci) {{
      const unsigned char *rows=glyphData;
      for(size_t gi=0; gi < sizeof(glyphChars)-1; ++gi) {{
        if(glyphChars[gi] == str[ci]) {{
          rows=glyphData+gi*7;
          break;
        }}
      }}
      for(int row=0; row < 7; ++row) {{
        unsigned char bits=rows[row];
        double y=(6-row)*pixelSize;
        for(int col=0; col < 5; ++col) {{
          if(bits & (1 << (4-col))) {{
            double px0=x+col*pixelSize;
            double py0=y;
            double px1=px0+pixelSize;
            double py1=py0+pixelSize;
            mem::vector<solvedKnot> nodes(4);
            pair pts[4]={{pair(px0,py0), pair(px1,py0), pair(px1,py1), pair(px0,py1)}};
            for(int k=0; k < 4; ++k) {{
              pair prevpt=pts[(k+3)%4];
              pair curpt=pts[k];
              pair nextpt=pts[(k+1)%4];
              nodes[k].point=curpt;
              nodes[k].post=curpt+(nextpt-curpt)*third;
              nodes[k].pre=curpt-(curpt-prevpt)*third;
              nodes[k].straight=true;
            }}
            P->push(path(nodes,4,true));
          }}
        }}
      }}
      x += charAdvance;
    }}
    PP->push(P);
  }}
  return PP;
}}
'''


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        content = f.read()

    replacement = build_replacement()
    if ORIGINAL in content:
        content = content.replace(ORIGINAL, replacement, 1)
    else:
        # Docker may reuse a layer where an earlier version of this patch has
        # already replaced textpath(). Replace that generated function too so
        # rebuilding after a glyph-table change is deterministic and safe.
        marker = "patharray2 *textpath(stringarray *s, penarray *p)"
        start = content.find(marker)
        if start == -1:
            sys.exit("native-text-font.py: could not find textpath() to replace")
        brace_start = content.find("{", start)
        depth = 0
        end = brace_start
        while end < len(content):
            if content[end] == "{":
                depth += 1
            elif content[end] == "}":
                depth -= 1
                if depth == 0:
                    end += 1
                    break
            end += 1
        content = content[:start] + replacement.rstrip() + content[end:]

    with open(PATH, "w", encoding="utf-8") as f:
        f.write(content)


if __name__ == "__main__":
    main()



