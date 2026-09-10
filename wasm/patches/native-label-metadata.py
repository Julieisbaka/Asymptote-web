#!/usr/bin/env python3
"""Annotate native-label EPS output with bracket markers.

This patch is intentionally conservative: if expected anchors change between
Asymptote releases, the script leaves the file unchanged instead of failing the
build. The EPS interpreter still treats the markers as optional.
"""

from pathlib import Path

PATH = Path('/src/asymptote/base/plain_Label.asy')

BEGIN = '<< /text s /font defaultpen.font /size defaultpen.size >> asy_label_begin\n'
END = 'asy_label_end\n'


def main() -> None:
    if not PATH.exists():
        return
    content = PATH.read_text(encoding='utf-8')
    original = content

    if 'asy_label_begin' in content and 'asy_label_end' in content:
        return

    # Common path in upstream plain_Label.asy: native fallback writes EPS paths
    # through out() calls in the non-TeX branch.
    anchor = 'out("gsave\\n");'
    marker = 'out("newpath\\n");'
    if anchor in content and marker in content:
        content = content.replace(anchor, anchor + f'\n  out("{BEGIN}");', 1)
        content = content.replace(marker, marker + f'\n  out("{END}");', 1)

    if content != original:
        PATH.write_text(content, encoding='utf-8')


if __name__ == '__main__':
    main()