import assert from "node:assert/strict";
import { unlink, writeFile } from "node:fs/promises";
import test, { after, before, beforeEach } from "node:test";

const gluePath = new URL("../dist/asymptote.js", import.meta.url);
await writeFile(gluePath, `
const state = globalThis.__asymptoteDomState ??= { output: "normal", calls: [] };
function fs() {
  const files = new Map([["/", null]]);
  return {
    writeFile(path, data) { files.set(path, data); },
    readFile(path) { return files.get(path); },
    mkdir(path) { files.set(path, null); },
    unlink(path) { files.delete(path); },
    rmdir(path) { files.delete(path); },
    readdir() { return [".", ".."]; },
    analyzePath(path) { return { exists: files.has(path) }; },
  };
}
export default async function factory() {
  const FS = fs();
  const module = {
    FS,
    print() {},
    printErr() {},
    callMain(args) {
      if (args[0] === "--version") { module.print("DOM test version"); return 0; }
      state.calls.push([...args]);
      let format = "eps";
      let prefix = "";
      for (let i = 0; i < args.length; i += 1) {
        if (args[i] === "-f") format = args[++i];
        if (args[i] === "-o") prefix = args[++i];
      }
      const output = state.output === "invalid"
        ? "not svg"
        : format === "html"
          ? "<!doctype html><html><head></head><body><canvas id=\\\"Asymptote\\\"></canvas></body></html>"
          : "%!PS-Adobe-3.0 EPSF-3.0\\n%%BoundingBox: 0 0 100 100\\nnewpath 0 0 moveto 10 10 lineto stroke\\n";
      FS.writeFile(prefix + "." + format, output);
      return 0;
    },
  };
  return module;
}
`, "utf8");

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.childNodes = [];
    this.attributes = [];
    this.style = {
      setProperty: (name, value) => { this.style[name] = value; },
    };
    this.className = "";
    this.parentElement = null;
    this._innerHTML = "";
  }
  get firstElementChild() { return this.children[0] ?? null; }
  set innerHTML(value) {
    this._innerHTML = value;
    this.replaceChildren();
    if (value.trim().startsWith("<svg")) this.appendChild(new FakeElement("svg", this.ownerDocument));
  }
  get innerHTML() { return this._innerHTML; }
  setAttribute(name, value) {
    const existing = this.attributes.find((attribute) => attribute.name === name);
    if (existing) existing.value = String(value);
    else this.attributes.push({ name, value: String(value) });
  }
  getAttribute(name) { return this.attributes.find((attribute) => attribute.name === name)?.value ?? null; }
  removeAttribute(name) { this.attributes = this.attributes.filter((attribute) => attribute.name !== name); }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    this.childNodes.push(child);
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.childNodes = [];
    for (const child of children) this.appendChild(child);
    for (const child of children) {
      if (child instanceof FakeIframe) queueMicrotask(() => child.dispatch("load"));
    }
  }
  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      this.children.splice(index, 1);
      this.childNodes.splice(index, 1);
      child.parentElement = null;
    }
    return child;
  }
  click() { this.clicked = true; }
}

class FakeIframe extends FakeElement {
  constructor(ownerDocument) {
    super("iframe", ownerDocument);
    this.listeners = new Map();
    this.contentDocument = new FakeDocument();
    this.srcdoc = "";
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
  dispatch(type) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener({ type });
  }
}

class FakeDocument {
  constructor() {
    this.nodes = new Map();
    this.body = new FakeElement("body", this);
  }
  querySelector(selector) { return this.nodes.get(selector) ?? null; }
  createElement(tagName) {
    if (tagName.toLowerCase() === "iframe") return new FakeIframe(this);
    const element = new FakeElement(tagName, this);
    if (tagName.toLowerCase() === "a") this.lastAnchor = element;
    return element;
  }
  importNode(node) {
    const copy = new FakeElement(node.tagName, this);
    copy.attributes = node.attributes.map((attribute) => ({ ...attribute }));
    return copy;
  }
}

const document = new FakeDocument();
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalDOMParser = globalThis.DOMParser;
const originalElement = globalThis.Element;
const originalSvgElement = globalThis.SVGSVGElement;
const originalIframeElement = globalThis.HTMLIFrameElement;
const OriginalURL = globalThis.URL;

class TestURL extends OriginalURL {
  static created = [];
  static revoked = [];
  static createObjectURL(blob) { TestURL.created.push(blob); return "blob:test"; }
  static revokeObjectURL(url) { TestURL.revoked.push(url); }
}

globalThis.document = document;
globalThis.window = { setTimeout, clearTimeout };
globalThis.Element = FakeElement;
globalThis.SVGSVGElement = FakeElement;
globalThis.HTMLIFrameElement = FakeIframe;
globalThis.DOMParser = class {
  parseFromString(value) {
    const parsed = new FakeDocument();
    parsed.documentElement = new FakeElement(value.trim().startsWith("<svg") ? "svg" : "parsererror", parsed);
    if (parsed.documentElement.tagName === "SVG") {
      parsed.documentElement.setAttribute("width", "100");
      parsed.documentElement.setAttribute("height", "100");
      parsed.documentElement.setAttribute("viewBox", "0 0 100 100");
    }
    return parsed;
  }
};
globalThis.URL = TestURL;
globalThis.__asymptoteDomState = { output: "normal", calls: [] };

const { createAsymptote } = await import("../dist/asymptote-web.js");
const state = globalThis.__asymptoteDomState;
const asy = await createAsymptote();

before(() => {
  document.nodes.clear();
});
beforeEach(() => {
  state.output = "normal";
  state.calls.length = 0;
  TestURL.created.length = 0;
  TestURL.revoked.length = 0;
  document.nodes.clear();
});
after(async () => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  globalThis.DOMParser = originalDOMParser;
  globalThis.Element = originalElement;
  globalThis.SVGSVGElement = originalSvgElement;
  globalThis.HTMLIFrameElement = originalIframeElement;
  globalThis.URL = OriginalURL;
  delete globalThis.__asymptoteDomState;
  await unlink(gluePath).catch(() => { });
});

test("mounts SVG output and reuses an existing SVG", async () => {
  const target = document.createElement("div");
  document.nodes.set("#drawing", target);
  const first = await asy.mount("#drawing", "draw");
  assert.equal(first.format, "svg");
  assert.equal(target.firstElementChild.tagName, "SVG");

  const oldSvg = target.firstElementChild;
  oldSvg.setAttribute("data-state", "preserve");
  const reused = await asy.mount(target, "draw again", { reuseSvg: true });
  assert.equal(reused.format, "svg");
  assert.equal(target.firstElementChild, oldSvg);
  assert.equal(target.firstElementChild.attributes.some((attribute) => attribute.name === "width"), true);
});

test("reports mount target and format errors", async () => {
  await assert.rejects(() => asy.mount("#missing", "draw"), /mount target not found/);
  await assert.rejects(() => asy.mount(document.createElement("div"), "draw", { format: "eps" }), /only supports SVG/);
});

test("supports unsafe SVG customization", async () => {
  const target = document.createElement("div");
  let customized = false;
  await asy.unsafe.mount(target, "draw", (svg) => {
    customized = true;
    svg.setAttribute("data-custom", "yes");
  });
  assert.equal(customized, true);
  assert.equal(target.firstElementChild.attributes.some((attribute) => attribute.name === "data-custom"), true);
});

test("exposes live mounted nodes through unsafe accessors", async () => {
  const target = document.createElement("div");
  document.nodes.set("#unsafe-access", target);

  await asy.mount(target, "draw");
  const svg = asy.unsafe.getSvg("#unsafe-access");
  assert.equal(svg, target.firstElementChild);
  svg.setAttribute("data-direct-edit", "yes");
  assert.equal(target.firstElementChild.getAttribute("data-direct-edit"), "yes");

  await asy.mountWebGL(target, "three");
  assert.equal(asy.unsafe.getSvg(target), null);
  assert.equal(asy.unsafe.getWebGLIframe(target), target.firstElementChild);
  assert.equal(asy.unsafe.getWebGLIframe("#missing"), null);
});

test("downloads output with a default filename and revokes the object URL", async () => {
  const result = await asy.download("draw", undefined, { format: "eps" });
  assert.equal(result.format, "eps");
  assert.equal(TestURL.created.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(TestURL.revoked[0], "blob:test");
  assert.equal(document.lastAnchor.download, "asymptote.eps");
});

test("mounts WebGL and adds screen-space labels", async () => {
  const target = document.createElement("div");
  const result = await asy.mountWebGL(target, "three", {
    webglLabels: [{ text: "origin", x: 10, y: 20, className: "point" }],
  });
  const iframe = target.firstElementChild;
  assert.equal(result.format, "webgl");
  assert.equal(iframe.tagName, "IFRAME");
  assert.match(iframe.srcdoc, /wheel/);
  assert.equal(iframe.style.width, "100%");
  assert.equal(iframe.style.height, "100%");
  assert.equal(iframe.style.border, "none");
  assert.equal(iframe.contentDocument.body.firstElementChild.getAttribute("aria-label"), "Asymptote WebGL labels");

  await assert.rejects(() => asy.mountWebGL("#missing", "three"), /mountWebGL target not found/);
});

test("configures WebGL iframe styles and injected behavior", async () => {
  const target = document.createElement("div");
  await asy.mountWebGL(target, "three", {
    containWebGLScroll: false,
    primeWebGLZoom: false,
    webglIframeStyles: {
      width: "640px",
      height: "480px",
      border: "1px solid red",
      "background-color": "black",
    },
  });
  const iframe = target.firstElementChild;
  assert.equal(iframe.style.width, "640px");
  assert.equal(iframe.style.height, "480px");
  assert.equal(iframe.style.border, "1px solid red");
  assert.equal(iframe.style["background-color"], "black");
  assert.doesNotMatch(iframe.srcdoc, /preventDefault/);
  assert.doesNotMatch(iframe.srcdoc, /MouseEvent/);
});

test("rejects invalid WebGL iframe timeouts", async () => {
  const target = document.createElement("div");
  await assert.rejects(
    () => asy.unsafe.mountWebGL(target, "three", () => { }, { webglIframeTimeoutMs: -1 }),
    /timeout must be a non-negative finite number/
  );
  assert.equal(target.children.length, 0);
});

test("cleans up unsafe WebGL mounts when customization fails", async () => {
  const target = document.createElement("div");
  await assert.rejects(
    () => asy.unsafe.mountWebGL(target, "three", async () => { throw new Error("customizer failed"); }),
    /customizer failed/
  );
  assert.equal(target.children.length, 0);

  await assert.rejects(
    () => asy.unsafe.mountWebGL("#missing", "three", () => { }),
    /mountWebGL target not found/
  );
});
