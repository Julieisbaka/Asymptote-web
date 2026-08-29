import assert from "node:assert/strict";
import { unlink, writeFile } from "node:fs/promises";
import test, { after, beforeEach } from "node:test";

const gluePath = new URL("../dist/asymptote.js", import.meta.url);
const customGluePath = new URL("../dist/asymptote-custom.js", import.meta.url);
const glueSource = `
const state = globalThis.__asymptoteWebTestState ??= {
  calls: [],
  factoryCalls: 0,
  rejectFactoryCount: 0,
  exitCode: 0,
  versionExitCode: 0,
  stderr: [],
};

function createFs() {
  const files = new Map([["/", null]]);
  return {
    writeFile(path, data) { files.set(path, data); },
    readFile(path) {
      const data = files.get(path);
      if (data === undefined || data === null) throw new Error("missing file: " + path);
      return typeof data === "string" ? data : new TextDecoder().decode(data);
    },
    mkdir(path) { files.set(path, null); },
    unlink(path) { files.delete(path); },
    rmdir(path) {
      const prefix = path.endsWith("/") ? path : path + "/";
      for (const key of files.keys()) {
        if (key !== path && key.startsWith(prefix)) throw new Error("directory not empty");
      }
      files.delete(path);
    },
    readdir(path) {
      const prefix = path.endsWith("/") ? path : path + "/";
      const entries = new Set([".", ".."]).values();
      const result = [...entries];
      for (const key of files.keys()) {
        if (!key.startsWith(prefix) || key === path) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split("/")[0];
        if (name && !result.includes(name)) result.push(name);
      }
      return result;
    },
    analyzePath(path) { return { exists: files.has(path) }; },
  };
}

export default async function factory(options = {}) {
  state.factoryCalls += 1;
  state.locateFile = options.locateFile;
  if (state.rejectFactoryCount > 0) {
    state.rejectFactoryCount -= 1;
    throw new Error("fake module load failure");
  }
  const FS = createFs();
  const module = {
    FS,
    print() {},
    printErr(text) { state.stderr.push(text); },
    callMain(args) {
      if (args[0] === "--version") {
        state.calls.push({ args: [...args], source: null });
        module.print("Asymptote test version");
        return state.versionExitCode;
      }
      state.calls.push({ args: [...args], source: FS.readFile(args[args.length - 1]) });
      for (const line of state.stderr) {
        module.printErr(line.replace("{{INPUT}}", args[args.length - 1]));
      }
      if (state.exitCode !== 0) return state.exitCode;
      let format = "eps";
      let outputPrefix = "";
      for (let i = 0; i < args.length; i += 1) {
        if ((args[i] === "-f" || args[i] === "--format") && args[i + 1]) format = args[++i];
        else if (args[i].startsWith("-f=")) format = args[i].slice(3);
        else if (args[i].startsWith("--format=")) format = args[i].slice(9);
        else if (args[i] === "-o") outputPrefix = args[++i];
      }
      const output = format === "html"
        ? "<!doctype html><html><head></head><body><canvas id=\\\"Asymptote\\\"></canvas></body></html>"
        : format === "eps"
          ? "%!PS-Adobe-3.0 EPSF-3.0\\n%%BoundingBox: 0 0 100 100\\nnewpath 0 0 moveto 10 10 lineto stroke\\n"
          : "%!PS-Adobe-3.0\\n%%BoundingBox: 0 0 100 100\\n" + format;
      FS.writeFile(outputPrefix + "." + format, output);
      return 0;
    },
  };
  return module;
}
`;

await writeFile(gluePath, glueSource, "utf8");
await writeFile(customGluePath, glueSource, "utf8");
globalThis.__asymptoteWebTestState = {
  calls: [],
  factoryCalls: 0,
  rejectFactoryCount: 1,
  exitCode: 0,
  versionExitCode: 0,
  stderr: [],
};

const { AsymptoteError, createAsymptote, parseCompilerDiagnostics } = await import("../dist/asymptote-web.js");
const state = globalThis.__asymptoteWebTestState;

after(async () => {
  await unlink(gluePath).catch(() => { });
  await unlink(customGluePath).catch(() => { });
  delete globalThis.__asymptoteWebTestState;
});

beforeEach(() => {
  state.calls.length = 0;
  state.stderr.length = 0;
  state.exitCode = 0;
  state.versionExitCode = 0;
});

test("retries module initialization after a failed factory", async () => {
  await assert.rejects(() => createAsymptote(), /fake module load failure/);
  const asy = await createAsymptote({ glueUrl: customGluePath.href });
  assert.equal(await asy.version(), "Asymptote test version");
  assert.equal(state.factoryCalls, 2);
});

test("renders SVG and reports compiler/converter warnings", async () => {
  const asy = await createAsymptote();
  state.stderr.push("Warning: compiler warning", ": warning [unbounded]: x scaling in picture unbounded", "informational output");
  const result = await asy.render("draw((0,0)--(1,1));");

  assert.equal(result.format, "svg");
  assert.match(result.output, /^<svg/);
  assert.deepEqual(result.warnings, [
    "Warning: compiler warning",
    ": warning [unbounded]: x scaling in picture unbounded",
  ]);
  assert.deepEqual(result.diagnostics, [
    {
      severity: "warning",
      message: "compiler warning",
      raw: "Warning: compiler warning",
    },
    {
      severity: "warning",
      message: "x scaling in picture unbounded",
      code: "unbounded",
      raw: ": warning [unbounded]: x scaling in picture unbounded",
    },
    {
      severity: "info",
      message: "informational output",
      raw: "informational output",
    },
  ]);
  assert.deepEqual(state.calls.at(-1).source, "draw((0,0)--(1,1));");
});

test("parses source locations and diagnostic severities", () => {
  assert.deepEqual(parseCompilerDiagnostics([
    "/tmp/input.asy: 12.7: error: invalid path",
    "/tmp/input.asy: 18.3: no matching variable 'bold'",
    "C:/work/example.asy:4.2: warning [unbounded]: scaling is unbounded",
    "lib/foo:bar.asy: 9.1: warning: escaped colon filename",
    "note from compiler",
  ].join("\n")), [
    {
      severity: "error",
      message: "invalid path",
      sourceFile: "/tmp/input.asy",
      line: 12,
      column: 7,
      raw: "/tmp/input.asy: 12.7: error: invalid path",
    },
    {
      severity: "error",
      message: "no matching variable 'bold'",
      sourceFile: "/tmp/input.asy",
      line: 18,
      column: 3,
      raw: "/tmp/input.asy: 18.3: no matching variable 'bold'",
    },
    {
      severity: "warning",
      message: "scaling is unbounded",
      sourceFile: "C:/work/example.asy",
      line: 4,
      column: 2,
      code: "unbounded",
      raw: "C:/work/example.asy:4.2: warning [unbounded]: scaling is unbounded",
    },
    {
      severity: "warning",
      message: "escaped colon filename",
      sourceFile: "lib/foo:bar.asy",
      line: 9,
      column: 1,
      raw: "lib/foo:bar.asy: 9.1: warning: escaped colon filename",
    },
    {
      severity: "info",
      message: "note from compiler",
      raw: "note from compiler",
    },
  ]);
});

test("maps virtual diagnostic paths to friendly source filenames", async () => {
  const asy = await createAsymptote();
  state.stderr.push("{{INPUT}}: 3.5: error: bad source");
  const result = await asy.render("bad", { sourceFile: "diagram.asy" });

  assert.equal(result.diagnostics[0].sourceFile, "diagram.asy");
});

test("preserves format flag precedence and WebGL options", async () => {
  const asy = await createAsymptote();
  await asy.render("one", { format: "svg", flags: ["--format=ps"] });
  const psCall = state.calls.at(-1).args;
  assert.equal(psCall.at(-1).includes("input.asy"), true);
  assert.equal(psCall.includes("ps"), true);

  const webgl = await asy.render("three", {
    format: "webgl",
    offline: true,
    position: [10, 20],
    devicePixelRatio: 2,
    autobillboard: false,
  });
  const webglCall = state.calls.at(-1).args;
  assert.equal(webgl.format, "webgl");
  assert.match(webgl.output, /Asymptote/);
  assert.deepEqual(webglCall.slice(webglCall.indexOf("-position"), webglCall.indexOf("-position") + 2), ["-position", "10,20"]);
  assert.equal(webglCall.includes("-devicepixelratio"), true);
  assert.equal(webglCall.includes("-noautobillboard"), true);
  assert.equal(webglCall.includes("-offline"), true);
});

test("supports raw output, blobs, batches, and isolated files", async () => {
  const asy = await createAsymptote();
  const raw = await asy.render("raw", { raw: true });
  assert.equal(raw.format, "eps");
  assert.match(raw.output, /^%!PS/);

  const blob = await asy.renderToBlob("blob", { format: "eps" });
  assert.equal(blob.type, "application/postscript");
  assert.match(await blob.text(), /^%!PS/);

  const batch = await asy.renderBatch(["first", "second"], { files: { "lib/helper.asy": "helper" } });
  assert.equal(batch.length, 2);
  assert.deepEqual(state.calls.slice(-2).map((call) => call.source), ["first", "second"]);
});

test("rejects unsafe virtual file paths and supports abort", async () => {
  const asy = await createAsymptote();
  await assert.rejects(
    () => asy.render("bad", { files: { "../escape.asy": "nope" } }),
    TypeError
  );
  const callsBeforeAbort = state.calls.length;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => asy.render("aborted", { signal: controller.signal }),
    (error) => error.name === "AbortError"
  );
  assert.equal(state.calls.length, callsBeforeAbort);
});

test("serializes concurrent renders and exposes AsymptoteError", async () => {
  const asy = await createAsymptote();
  const results = await Promise.all([asy.render("queued-one"), asy.render("queued-two")]);
  assert.equal(results.length, 2);
  assert.deepEqual(state.calls.slice(-2).map((call) => call.source), ["queued-one", "queued-two"]);

  state.exitCode = 7;
  state.stderr.push("compiler failed");
  await assert.rejects(
    () => asy.render("failure"),
    (error) => {
      assert.ok(error instanceof AsymptoteError);
      assert.equal(error.exitCode, 7);
      assert.equal(error.stderr, "compiler failed");
      assert.deepEqual(error.diagnostics, [{
        severity: "info",
        message: "compiler failed",
        raw: "compiler failed",
      }]);
      assert.match(error.message, /ASYMPTOTE ERROR/);
      return true;
    }
  );
});
