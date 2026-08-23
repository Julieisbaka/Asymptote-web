#!/usr/bin/env python3
"""Candidate: stub the Ghostscript-backed _strokepath() helper.

The browser build has no Ghostscript process, so this path cannot produce a
stroke outline. Returning an empty path array avoids retaining the normal
process-backed implementation when LTO can eliminate it.
"""

import sys

PATH = "/src/asymptote/runlabel.in"
MARKER = "patharray *_strokepath(path g, pen p=CURRENTPEN)"


def replace_function(content, marker, replacement):
    start = content.find(marker)
    if start < 0:
        sys.exit(f"browser-strokepath.py: could not find {marker}()")
    brace = content.find("{", start)
    if brace < 0:
        sys.exit("browser-strokepath.py: could not find _strokepath() body")
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


with open(PATH, "r", encoding="utf-8") as stream:
    content = stream.read()

replacement = """patharray *_strokepath(path g, pen p=CURRENTPEN)
{
  (void) g;
  (void) p;
  Warn(\"strokepath() is unavailable in browser WebAssembly: Ghostscript is not bundled\");
  return new array(0);
}
"""
content = replace_function(content, MARKER, replacement)
with open(PATH, "w", encoding="utf-8") as stream:
    stream.write(content)
