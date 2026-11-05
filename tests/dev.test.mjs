import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DIST, tmpDir, rmDir, write, inCwd, stubOpenAI, reply, captureConsole, withStdoutCaptured } from "./helpers.mjs";

const { runDevMode } = await import(`${DIST}/core/engine/dev.js`);

const DEBOUNCE_MS = 1500;
const tick = () => new Promise((r) => setImmediate(r)); // real setImmediate: only setTimeout is mocked
const flush = async () => { for (let i = 0; i < 5; i++) await tick(); };
const issue = (severity, message, fix = "") => ({ line: null, severity, message, fix });

describe("runDevMode (file watcher)", () => {
  let dir;
  let out;
  let emit;        // (event, filename) -> simulate fs.watch callback
  let closed;
  let sigintBefore;
  let model;
  let savedKey;

  beforeEach(async () => {
    dir = tmpDir();
    savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test"; // analysis runs later, from timers, so the key must outlive runDevMode()
    out = captureConsole();
    mock.timers.enable({ apis: ["setTimeout"] });
    closed = false;
    // Stub fs.watch: capture the listener instead of watching the real filesystem.
    mock.method(fs, "watch", (_dir, _opts, listener) => {
      emit = listener;
      return { close: () => { closed = true; } };
    });
    model = { analyzed: [], reply: () => [] };
    stubOpenAI((req) => {
      const m = /^Context: File: (.*)\n\nCode to analyze:\n\n([\s\S]*)$/.exec(req.messages[1].content);
      model.analyzed.push({ file: m[1], code: m[2] });
      const r = model.reply(m[1]);
      if (r instanceof Error) throw r;
      return reply(JSON.stringify(r));
    });
    sigintBefore = process.listeners("SIGINT");
    // runDevMode never resolves by design (runs until Ctrl+C); start it and do not await.
    void withStdoutCaptured(() => inCwd(dir, () => { runDevMode(); return tick(); }));
    await tick();
    assert.equal(typeof emit, "function", "watcher was registered");
  });
  afterEach(() => {
    for (const l of process.listeners("SIGINT")) if (!sigintBefore.includes(l)) process.removeListener("SIGINT", l);
    mock.timers.reset();
    mock.restoreAll();
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    rmDir(dir);
  });

  const advance = async (ms) => { mock.timers.tick(ms); await flush(); };
  const edit = (rel, content) => write(dir, rel, content);

  it("watches the current directory recursively", () => {
    const [watchedDir, opts] = fs.watch.mock.calls[0].arguments;
    assert.equal(fs.realpathSync(watchedDir), dir);
    assert.deepEqual(opts, { recursive: true });
  });

  it("analyses a changed file once the debounce window passes", async () => {
    edit("a.ts", "let a = 1");
    emit("change", "a.ts");
    await advance(DEBOUNCE_MS - 1);
    assert.equal(model.analyzed.length, 0, "not before the debounce window ends");
    await advance(1);
    assert.deepEqual(model.analyzed, [{ file: "a.ts", code: "let a = 1" }]);
    assert.match(out.text(), /Changed: a\.ts/);
    assert.match(out.text(), /Looks good!/);
  });

  it("collapses a burst of saves to the same file into one analysis, restarting the timer each time", async () => {
    edit("a.ts", "v1");
    emit("change", "a.ts");
    await advance(1000);
    edit("a.ts", "v2");
    emit("change", "a.ts");
    await advance(1000); // 2000ms since first event, but only 1000 since the last
    assert.equal(model.analyzed.length, 0);
    emit("change", "a.ts");
    await advance(DEBOUNCE_MS);
    assert.deepEqual(model.analyzed, [{ file: "a.ts", code: "v2" }]);
  });

  it("debounces different files independently", async () => {
    edit("a.ts", "A");
    edit("sub/b.py", "B");
    emit("change", "a.ts");
    emit("change", path.join("sub", "b.py"));
    await advance(DEBOUNCE_MS);
    assert.deepEqual(model.analyzed.map((x) => x.file).sort(), ["a.ts", path.join("sub", "b.py")]);
  });

  it("ignores unwatched extensions, ignored directories and events without a filename", async () => {
    for (const f of ["README.md", "data.json", "node_modules/x.js", "a/dist/b.ts", ".git/c.js", "build/d.ts", ".next/e.ts", ".nuxt/f.vue", ".ai/g.ts"]) {
      edit(f, "code");
      emit("change", f);
    }
    emit("change", null);
    await advance(DEBOUNCE_MS * 2);
    assert.equal(model.analyzed.length, 0);
  });

  it("does nothing if the file was deleted before the timer fired", async () => {
    edit("a.ts", "x");
    emit("rename", "a.ts");
    fs.rmSync(path.join(dir, "a.ts"));
    await advance(DEBOUNCE_MS);
    assert.equal(model.analyzed.length, 0);
  });

  it("does nothing for an empty or whitespace-only file", async () => {
    edit("a.ts", " \n");
    emit("change", "a.ts");
    await advance(DEBOUNCE_MS);
    assert.equal(model.analyzed.length, 0);
  });

  it("shows at most 3 issues, with their fixes, and a count of the rest", async () => {
    model.reply = () => [issue("error", "E1", "fix1"), issue("warning", "W2"), issue("suggestion", "S3"), issue("error", "E4"), issue("error", "E5")];
    edit("a.ts", "x");
    emit("change", "a.ts");
    await advance(DEBOUNCE_MS);
    const text = out.text();
    for (const m of ["E1", "W2", "S3"]) assert.ok(text.includes(m), m);
    assert.ok(!text.includes("E4") && !text.includes("E5"));
    assert.match(text, /→ fix1/);
    assert.match(text, /\.\.\. and 2 more\. Run `autostack-ai fix` for full report\./);
  });

  it("reports 'Analysis unavailable' instead of crashing when the API fails", async () => {
    model.reply = () => new Error("503");
    edit("a.ts", "x");
    emit("change", "a.ts");
    await advance(DEBOUNCE_MS);
    assert.match(out.text(), /Analysis unavailable\./);
  });

  it("closes the watcher and exits 0 on SIGINT", async () => {
    const exit = mock.method(process, "exit", () => {});
    const handler = process.listeners("SIGINT").find((l) => !sigintBefore.includes(l));
    handler();
    assert.equal(closed, true);
    assert.deepEqual(exit.mock.calls.map((c) => c.arguments[0]), [0]);
    assert.match(out.text(), /Dev mode stopped\./);
  });
});
