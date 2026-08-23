#!/usr/bin/env python3
"""Provide bounded native fallbacks for TeX-dependent label helpers.

The existing native textpath() patch handles ordinary labels. This patch keeps
texsize() and _texpath() from invoking TeX, dvips, or Ghostscript when source
code calls them explicitly. Metrics are approximate and _texpath() returns an
empty path array because TeX glyph shaping is not available in browser WASM.
"""

import sys

PATH = "/src/asymptote/runlabel.in"


def replace_function(content, marker, replacement):
    start = content.find(marker)
    if start < 0:
        sys.exit(f"browser-tex-fallback.py: could not find {marker}()")
    brace = content.find("{", start)
    if brace < 0:
        sys.exit(f"browser-tex-fallback.py: could not find body for {marker}()")
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
    return content[:start] + replacement + content[end:]


def main():
    with open(PATH, "r", encoding="utf-8") as stream:
        content = stream.read()

    texsize = """realarray *texsize(string *s, pen p=CURRENTPEN)
{
  // Browser fallback: native vector labels use approximate em metrics.
  realarray *t=new array(3);
  double fontsize=p.size();
  if(fontsize <= 0) fontsize=10.0;
  (*t)[0]=0.6*fontsize*s->size();
  (*t)[1]=fontsize;
  (*t)[2]=0.0;
  return t;
}
"""
    texpath = """patharray2 *_texpath(stringarray *s, penarray *p)
{
  (void) s;
  (void) p;
  Warn("texpath() is unavailable in browser WebAssembly: TeX shaping is not bundled");
  return new array(0);
}
"""

    content = replace_function(content, "realarray *texsize", texsize)
    content = replace_function(content, "patharray2 *_texpath", texpath)

    with open(PATH, "w", encoding="utf-8") as stream:
        stream.write(content)


if __name__ == "__main__":
    main()
