#!/usr/bin/env python3
"""Replace Asymptote's POSIX process-pipe implementation in browser WASM.

Emscripten browser builds have no fork(), execvp(), or POSIX signal delivery.
The replacement retains the iopipestream ABI so that existing process-backed
features report Asymptote's normal error instead of linking the unreachable
process-management implementation into the WASM binary.
"""

from pathlib import Path

path = Path("/src/asymptote/pipestream.cc")
path.write_text(r'''/* Browser-WASM replacement for the POSIX pipestream implementation. */
#if !defined(_WIN32)

#include <cstring>

#include "pipestream.h"
#include "errormsg.h"

namespace {
[[noreturn]] void unsupportedProcess() {
  camp::reportError("external processes are unavailable in browser WebAssembly");
}
} // namespace

iopipestream *instance;

void iopipestream::open(const mem::vector<string> &, const char *, const char *, int)
{
  unsupportedProcess();
}

void iopipestream::eof()
{
  pipein=false;
}

void iopipestream::pipeclose()
{
  Running=false;
  pipeopen=false;
  pipein=false;
}

void iopipestream::block(bool, bool)
{
}

ssize_t iopipestream::readbuffer()
{
  buffer[0]=0;
  Running=false;
  return 0;
}

string iopipestream::readline()
{
  return string();
}

bool iopipestream::tailequals(const char *, size_t, const char *, size_t)
{
  return false;
}

void iopipestream::wait(const char *)
{
  unsupportedProcess();
}

int iopipestream::wait()
{
  unsupportedProcess();
}

void iopipestream::Write(const string &)
{
  unsupportedProcess();
}

#endif
''')
