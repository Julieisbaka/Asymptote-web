#!/usr/bin/env python3
"""Replace Asymptote's process-backed textpath() with an in-process vector font.

The generated implementation remains a single textpath() definition because
runtime.py regenerates runlabel.cc from blank-line-delimited function sections.
"""
import sys

PATH = "/src/asymptote/runlabel.in"


def strokes(*segments):
    return segments


# Coordinates are in a 5x7 em square. Each segment is expanded into a narrow
# filled quadrilateral in C++, so the result is still a patharray2 and keeps
# the existing textpath() ABI. Lowercase input deliberately reuses uppercase
# outlines to keep the browser fallback small and deterministic.
GLYPH_STROKES = {
    " ": (),
    "0": strokes((0, 0, 5, 0), (5, 0, 5, 7), (5, 7, 0, 7), (0, 7, 0, 0), (0, 0, 5, 7), (5, 0, 0, 7)),
    "1": strokes((2.5, 0, 2.5, 7), (1, 6, 2.5, 7), (1, 0, 4, 0)),
    "2": strokes((0, 7, 5, 7), (5, 7, 5, 4), (5, 4, 0, 0), (0, 0, 5, 0)),
    "3": strokes((0, 7, 5, 7), (5, 7, 5, 0), (0, 0, 5, 0), (0, 3.5, 4, 3.5)),
    "4": strokes((0, 7, 0, 3), (0, 3, 5, 3), (5, 7, 5, 0)),
    "5": strokes((5, 7, 0, 7), (0, 7, 0, 3.5), (0, 3.5, 5, 3.5), (5, 3.5, 5, 0), (5, 0, 0, 0)),
    "6": strokes((5, 7, 0, 7), (0, 7, 0, 0), (0, 0, 5, 0), (5, 0, 5, 3.5), (5, 3.5, 0, 3.5)),
    "7": strokes((0, 7, 5, 7), (5, 7, 0, 0)),
    "8": strokes((0, 0, 5, 0), (5, 0, 5, 7), (5, 7, 0, 7), (0, 7, 0, 0), (0, 3.5, 5, 3.5)),
    "9": strokes((5, 0, 5, 7), (5, 7, 0, 7), (0, 7, 0, 3.5), (0, 3.5, 5, 3.5)),
    "A": strokes((0, 0, 2.5, 7), (2.5, 7, 5, 0), (1, 2.5, 4, 2.5)),
    "B": strokes((0, 0, 0, 7), (0, 7, 4, 7), (4, 7, 5, 6), (5, 6, 4, 3.5), (4, 3.5, 0, 3.5), (4, 3.5, 5, 3), (5, 3, 4, 0), (4, 0, 0, 0)),
    "C": strokes((5, 7, 0, 7), (0, 7, 0, 0), (0, 0, 5, 0)),
    "D": strokes((0, 0, 0, 7), (0, 7, 4, 7), (4, 7, 5, 6), (5, 6, 5, 1), (5, 1, 4, 0), (4, 0, 0, 0)),
    "E": strokes((5, 7, 0, 7), (0, 7, 0, 0), (0, 0, 5, 0), (0, 3.5, 4, 3.5)),
    "F": strokes((0, 0, 0, 7), (0, 7, 5, 7), (0, 3.5, 4, 3.5)),
    "G": strokes((5, 7, 0, 7), (0, 7, 0, 0), (0, 0, 5, 0), (5, 0, 5, 3), (5, 3, 2.5, 3)),
    "H": strokes((0, 0, 0, 7), (5, 0, 5, 7), (0, 3.5, 5, 3.5)),
    "I": strokes((0, 7, 5, 7), (2.5, 7, 2.5, 0), (0, 0, 5, 0)),
    "J": strokes((5, 7, 5, 0), (5, 0, 0, 0), (0, 0, 0, 2)),
    "K": strokes((0, 0, 0, 7), (0, 3.5, 5, 7), (0, 3.5, 5, 0)),
    "L": strokes((0, 7, 0, 0), (0, 0, 5, 0)),
    "M": strokes((0, 0, 0, 7), (0, 7, 2.5, 3.5), (2.5, 3.5, 5, 7), (5, 7, 5, 0)),
    "N": strokes((0, 0, 0, 7), (0, 7, 5, 0), (5, 0, 5, 7)),
    "O": strokes((0, 0, 0, 7), (0, 7, 5, 7), (5, 7, 5, 0), (5, 0, 0, 0)),
    "P": strokes((0, 0, 0, 7), (0, 7, 5, 7), (5, 7, 5, 3.5), (5, 3.5, 0, 3.5)),
    "Q": strokes((0, 0, 0, 7), (0, 7, 5, 7), (5, 7, 5, 0), (5, 0, 0, 0), (3, 2, 5, 0)),
    "R": strokes((0, 0, 0, 7), (0, 7, 5, 7), (5, 7, 5, 3.5), (5, 3.5, 0, 3.5), (2.5, 3.5, 5, 0)),
    "S": strokes((5, 7, 0, 7), (0, 7, 0, 3.5), (0, 3.5, 5, 3.5), (5, 3.5, 5, 0), (5, 0, 0, 0)),
    "T": strokes((0, 7, 5, 7), (2.5, 7, 2.5, 0)),
    "U": strokes((0, 7, 0, 0), (0, 0, 5, 0), (5, 0, 5, 7)),
    "V": strokes((0, 7, 2.5, 0), (2.5, 0, 5, 7)),
    "W": strokes((0, 7, 1.25, 0), (1.25, 0, 2.5, 4), (2.5, 4, 3.75, 0), (3.75, 0, 5, 7)),
    "X": strokes((0, 7, 5, 0), (5, 7, 0, 0)),
    "Y": strokes((0, 7, 2.5, 3.5), (5, 7, 2.5, 3.5), (2.5, 3.5, 2.5, 0)),
    "Z": strokes((0, 7, 5, 7), (5, 7, 0, 0), (0, 0, 5, 0)),
    ".": strokes((2, 0, 3, 0)), ",": strokes((2, 1, 3, 0)), "!": strokes((2.5, 7, 2.5, 2), (2.5, 0, 2.5, 0)),
    "?": strokes((0, 6, 1, 7), (1, 7, 4, 7), (4, 7, 5, 6), (5, 6, 2.5, 3.5), (2.5, 3.5, 2.5, 2)),
        ":": strokes((2.5, 5, 2.5, 5), (2.5, 1, 2.5, 1)), ";": strokes((2.5, 5, 2.5, 5), (2.5, 1, 2, 0)),
        "'": strokes((2.5, 7, 2.5, 5)), '"': strokes((1.5, 7, 1.5, 5), (3.5, 7, 3.5, 5)),
    "-": strokes((1, 3.5, 4, 3.5)), "+": strokes((2.5, 1, 2.5, 6), (0, 3.5, 5, 3.5)), "=": strokes((0, 4.5, 5, 4.5), (0, 2.5, 5, 2.5)),
    "/": strokes((0, 0, 5, 7)), "(": strokes((4, 7, 1, 5), (1, 5, 1, 2), (1, 2, 4, 0)), ")": strokes((1, 7, 4, 5), (4, 5, 4, 2), (4, 2, 1, 0)),
    "^": strokes((1, 5, 2.5, 7), (2.5, 7, 4, 5)), "_": strokes((0, 0, 5, 0)), "|": strokes((2.5, 0, 2.5, 7)), "\\": strokes((0, 7, 5, 0)),
        "{": strokes((4, 7, 2, 7), (2, 7, 2, 0), (2, 0, 4, 0)), "}": strokes((1, 7, 3, 7), (3, 7, 3, 0), (3, 0, 1, 0)),
        "~": strokes((0, 4, 1, 5), (1, 5, 2, 4), (2, 4, 3, 3), (3, 3, 4, 4), (4, 4, 5, 5)),
}


def build_replacement():
        glyph_chars = " 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.,!?:;'\"-+=/()^$_{}~|\\"
        glyph_data = []
        offsets = [0]
        for char in glyph_chars:
                for segment in GLYPH_STROKES.get(char, GLYPH_STROKES.get(char.upper(), ())):
                        glyph_data.extend(segment)
                offsets.append(len(glyph_data))
        chars_literal = glyph_chars.replace("\\", "\\\\").replace('"', '\\"')
        data_literal = ",".join(str(int(value * 10)) for value in glyph_data)
        offsets_literal = ",".join(str(value) for value in offsets)
        return f'''patharray2 *textpath(stringarray *s, penarray *p)
{{
    // Compact stroke-vector fallback; no groff/Ghostscript process is needed.
    static const char glyphChars[]="{chars_literal}";
    static const signed char glyphData[]={{ {data_literal} }};
    static const unsigned short glyphOffsets[]={{ {offsets_literal} }};
    size_t n=checkArrays(s,p);
    if(n == 0) return new array(0);
    patharray2 *PP=new array(0);
    for(size_t i=0; i < n; ++i) {{
        string str=read<string>(s,i);
        double fontsize=read<pen>(p,i).size();
        if(fontsize <= 0) fontsize=10.0;
        double em=fontsize/7.0;
        double width=em*0.65;
        patharray *P=new array(0);
        double x=0.0;
        for(size_t ci=0; ci < str.size(); ++ci) {{
                        unsigned char character=static_cast<unsigned char>(str[ci]);
                        if(character >= 'a' && character <= 'z') character -= 'a'-'A';
            size_t glyph=0;
            for(size_t gi=0; gi < sizeof(glyphChars)-1; ++gi)
                                if(glyphChars[gi] == character) {{ glyph=gi; break; }}
            for(size_t si=glyphOffsets[glyph]; si < glyphOffsets[glyph+1]; si += 4) {{
                double x0=x+glyphData[si]*em/10.0, y0=glyphData[si+1]*em/10.0;
                double x1=x+glyphData[si+2]*em/10.0, y1=glyphData[si+3]*em/10.0;
                double dx=x1-x0, dy=y1-y0, length=sqrt(dx*dx+dy*dy);
                if(length == 0) continue;
                double nx=-dy*width/(2*length), ny=dx*width/(2*length);
                pair pts[4]={{pair(x0+nx,y0+ny), pair(x1+nx,y1+ny), pair(x1-nx,y1-ny), pair(x0-nx,y0-ny)}};
                mem::vector<solvedKnot> nodes(4);
                for(int k=0; k < 4; ++k) {{
                    pair prev=pts[(k+3)%4], cur=pts[k], next=pts[(k+1)%4];
                    nodes[k].point=cur; nodes[k].post=cur+(next-cur)*third;
                    nodes[k].pre=cur-(cur-prev)*third; nodes[k].straight=true;
                }}
                P->push(path(nodes,4,true));
            }}
            x += 6.0*em;
        }}
        PP->push(P);
    }}
    return PP;
}}
'''


def main():
        with open(PATH, "r", encoding="utf-8") as stream:
                content = stream.read()
        marker = "patharray2 *textpath(stringarray *s, penarray *p)"
        start = content.find(marker)
        if start < 0:
                sys.exit("native-text-font.py: could not find textpath() to replace")
        brace = content.find("{", start)
        depth = 0
        end = brace
        while end < len(content):
                if content[end] == "{":
                        depth += 1
                elif content[end] == "}":
                        depth -= 1
                        if depth == 0:
                                end += 1
                                break
                end += 1
        content = content[:start] + build_replacement().rstrip() + content[end:]
        with open(PATH, "w", encoding="utf-8") as stream:
                stream.write(content)


if __name__ == "__main__":
        main()
