#!/usr/bin/env python3
"""Candidate: remove LSP-only objects from the Asymptote core link list.

The browser build passes --disable-lsp, so these objects should not be needed
by the renderer. This candidate changes only Makefile.in and is intentionally
kept separate from the proven browser patches.
"""

import re
import sys

PATH = "/src/asymptote/Makefile.in"
OBJECTS = (
    "lspserv",
    "symbolmaps",
    "lspdec",
    "lspexp",
    "lspfundec",
    "lspstm",
)

with open(PATH, "r", encoding="utf-8") as stream:
    content = stream.read()

# Restrict the edit to the COREFILES assignment, including continued lines,
# rather than removing names from unrelated rules or documentation.
match = re.search(r"(?ms)^COREFILES\s*=.*?(?=^\S[^=\n]*=|\Z)", content)
if match is None:
    sys.exit("remove-lsp-objects.py: could not find COREFILES")

corefiles = match.group(0)
missing = [name for name in OBJECTS if not re.search(rf"\b{re.escape(name)}\b", corefiles)]
if missing:
    sys.exit("remove-lsp-objects.py: missing expected objects: " + ", ".join(missing))

prefix, body = re.match(r"(COREFILES\s*=\s*)(.*)", corefiles, re.DOTALL).groups()
tokens = body.replace("\\\r\n", " ").replace("\\\n", " ").split()
filtered = [token for token in tokens if token not in OBJECTS]

# Re-emit a simple, valid Make assignment instead of deleting names in place
# across continuation lines. This avoids leaving a bare continuation marker,
# which GNU Make can expand into the literal target `\\.o`.
corefiles = prefix + " ".join(filtered) + "\n"
content = content[:match.start()] + corefiles + content[match.end():]
with open(PATH, "w", encoding="utf-8") as stream:
    stream.write(content)