#!/usr/bin/env python3
"""Candidate: remove the LSP server object from the browser build.

The browser build passes --disable-lsp, but the upstream Makefile still carries
the standalone LSP server object. Remove it directly from the source template
so the generated Makefile never reintroduces that symbol.
"""

import re
import sys

MAKEFILE_PATH = "/src/asymptote/Makefile.in"
CONFIGURE_PATH = "/src/asymptote/configure"
OBJECTS = (
    "lspserv",
)


def ensure_present(path: str, needle: str, label: str) -> None:
    with open(path, "r", encoding="utf-8") as stream:
        content = stream.read()
    if needle not in content:
        sys.exit(f"remove-lsp-objects.py: missing expected {label} in {path}")


def strip_lsp_from_makefile(content: str) -> str:
    # Remove the LSP objects from the core link list, even when they are split
    # across backslash-continued lines.
    match = re.search(r"(?ms)^COREFILES\s*=.*?(?=^\S[^=\n]*=|\Z)", content)
    if match is None:
        raise ValueError("COREFILES not found")

    corefiles = match.group(0)
    missing = [name for name in OBJECTS if not re.search(rf"\b{re.escape(name)}\b", corefiles)]
    if missing:
        raise ValueError("missing expected LSP objects in COREFILES: " + ", ".join(missing))

    prefix, body = re.match(r"(COREFILES\s*=\s*)(.*)", corefiles, re.DOTALL).groups()
    tokens = body.replace("\\\r\n", " ").replace("\\\n", " ").split()
    filtered = [token for token in tokens if token not in OBJECTS]
    replacement = prefix + " ".join(filtered) + "\n"
    content = content[:match.start()] + replacement + content[match.end():]

    return content


def strip_lsp_from_configure(content: str) -> str:
    # Keep configure syntactically intact. The browser build already passes
    # --disable-lsp, which prevents the LSP libraries from being linked.
    return content


def strip_lsp_hooks(content: str) -> str:
    # In Asymptote 3.14, `symbolmaps`, `lspdec`, `lspexp`, `lspfundec`, and
    # `lspstm` are not standalone server code: they provide AST symbol-map
    # definitions that are referenced by core classes even with --disable-lsp.
    # The LSP include path must therefore remain. Only `lspserv` is pruned.
    return content


def validate_no_lsp(content: str, path: str) -> None:
    remaining = [name for name in OBJECTS if re.search(rf"\b{re.escape(name)}\b", content)]
    if remaining:
        raise ValueError(f"LSP objects still present in {path}: {', '.join(remaining)}")
    return


for path in (MAKEFILE_PATH, CONFIGURE_PATH):
    with open(path, "r", encoding="utf-8") as stream:
        original = stream.read()
    if path.endswith("Makefile.in"):
        updated = strip_lsp_from_makefile(original)
        updated = strip_lsp_hooks(updated)
    else:
        updated = strip_lsp_from_configure(original)
        updated = strip_lsp_hooks(updated)
    validate_no_lsp(updated, path)
    with open(path, "w", encoding="utf-8") as stream:
        stream.write(updated)

# Final sanity check on the generated browser build template.
with open(MAKEFILE_PATH, "r", encoding="utf-8") as stream:
    makefile = stream.read()
if any(token in makefile for token in OBJECTS):
    sys.exit("remove-lsp-objects.py: final COREFILES check failed; LSP objects remain present")
