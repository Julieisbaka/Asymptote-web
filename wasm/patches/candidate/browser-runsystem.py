#!/usr/bin/env python3
"""Replace ImageMagick/viewer runtime calls with browser capability warnings.

The browser cannot synchronously launch ImageMagick or an external animation
viewer. Keep the generated runtime ABI intact, but return a failure status so
Asymptote programs can inspect it without entering POSIX process code.
"""
import sys

PATH = "/src/asymptote/runsystem.in"


def replace_function(content, marker, replacement):
    start = content.find(marker)
    if start < 0:
        sys.exit(f"browser-runsystem.py: could not find {marker}()")
    brace = content.find("{", start)
    if brace < 0:
        sys.exit(f"browser-runsystem.py: could not find body for {marker}()")
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

    convert = '''Int convert(string args=emptystring, string file=emptystring,
            string format=emptystring)
{
  (void) args;
  (void) file;
  (void) format;
  Warn("convert() is unavailable in browser WebAssembly: ImageMagick is not bundled");
  return -1;
}
'''
    animate = '''Int animate(string args=emptystring, string file=emptystring,
            string format=emptystring)
{
  (void) args;
  (void) file;
  (void) format;
  Warn("animate() is unavailable in browser WebAssembly: external viewers are not bundled");
  return -1;
}
'''

    content = replace_function(content, "Int convert", convert)
    content = replace_function(content, "Int animate", animate)

    with open(PATH, "w", encoding="utf-8") as stream:
        stream.write(content)


if __name__ == "__main__":
    main()
