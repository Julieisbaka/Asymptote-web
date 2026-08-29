#!/usr/bin/env python3
"""Stub Ghostscript-backed PDF output for browser WebAssembly builds.

Asymptote 3.14 routes PDF conversion through picture::epstopdf(), which
launches Ghostscript. Browser WASM cannot launch that external process, so
fail at the PDF boundary with a precise diagnostic instead of attempting an
unavailable conversion.
"""

import sys

PATH = "/src/asymptote/picture.cc"
MARKER = "int picture::epstopdf(const string& epsname, const string& pdfname)"


def replace_function(content, marker, replacement):
    start = content.find(marker)
    if start < 0:
        sys.exit(f"browser-pdf-stub.py: could not find {marker}()")
    brace = content.find("{", start)
    if brace < 0:
        sys.exit("browser-pdf-stub.py: could not find epstopdf() body")
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

    replacement = """int picture::epstopdf(const string& epsname, const string& pdfname)
{
  (void) epsname;
  (void) pdfname;
  reportError("PDF output is unavailable in browser WebAssembly: Ghostscript is not bundled");
  return -1;
}
"""
    content = replace_function(content, MARKER, replacement)

    with open(PATH, "w", encoding="utf-8") as stream:
        stream.write(content)


if __name__ == "__main__":
    main()
