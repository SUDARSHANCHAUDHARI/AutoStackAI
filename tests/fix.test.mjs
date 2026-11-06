import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DIST, tmpDir, rmDir, write, inCwd, withEnv, stubOpenAI, reply, captureConsole, withStdoutCaptured } from "./helpers.mjs";

const { runFix } = await import(`${DIST}/core/engine/fix.js`);

const FIXED_NOW = Date.parse("2026-03-04T05:06:07.000Z");
const issue = (severity, message, extra = {}) => ({ line: null, severity, message, fix: "", ...extra });

describe("runFix", () => {
  let dir;
  let out;
  beforeEach(() => {
    dir = tmpDir();
    out = captureConsole();
    mock.timers.enable({ apis: ["Date"], now: FIXED_NOW });
  });
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
    rmDir(dir);
  });

  const fix = (apply = false) =>
    withStdoutCaptured(() => inCwd(dir, () => withEnv({ OPENAI_API_KEY: "sk-test" }, () => runFix(apply))));
  const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
  const exists = (rel) => fs.existsSync(path.join(dir, rel));

  /**
   * Fake model. analyze(contextFile, code) -> issues array | string | Error ; fixer(issueMessage, code) -> string | Error
   * Records which file each analysis call was for.
   */
  function fakeModel({ analyze = () => [], fixer = () => "" } = {}) {
    const analyzed = [];
    const fixes = [];
    const { calls } = stubOpenAI((req) => {
      const user = req.messages[1].content;
      if (user.startsWith("Fix the following issue")) {
        const m = /^Fix the following issue in this code\.\nIssue: (.*)\n\nCode:\n([\s\S]*)\n\nReturn the fixed code only/.exec(user);
        fixes.push({ issue: m[1], code: m[2] });
        const r = fixer(m[1], m[2]);
        if (r instanceof Error) throw r;
        return reply(r);
      }
      const m = /^Context: File: (.*)\n\nCode to analyze:\n\n([\s\S]*)$/.exec(user);
      analyzed.push(m[1]);
      const r = analyze(m[1], m[2]);
      if (r instanceof Error) throw r;
      return reply(typeof r === "string" ? r : JSON.stringify(r));
    });
    return { analyzed, fixes, calls };
  }

  describe("file discovery", () => {
    it("reports and stops when there is nothing to scan", async () => {
      write(dir, "README.md", "# hi");
      const model = fakeModel();
      await fix();
      assert.match(out.text(), /No scannable files found/);
      assert.equal(model.calls.length, 0);
      assert.equal(exists(".ai/fix-report.json"), false);
    });

    it("scans code files in nested dirs and skips ignored dirs and other extensions", async () => {
      for (const f of ["a.ts", "src/b.tsx", "src/deep/c.js", "d.jsx", "e.vue", "f.svelte", "g.py"]) write(dir, f, "code");
      for (const f of [
        "node_modules/x.js", ".git/y.js", "dist/z.js", "build/z.js", ".next/z.js", ".nuxt/z.js", "__pycache__/z.py", ".ai/skills/z.ts",
        "notes.md", "data.json", "style.css", "a.ts.backup",
      ]) write(dir, f, "code");
      const model = fakeModel();
      await fix();
      assert.deepEqual([...model.analyzed].sort(), ["a.ts", "d.jsx", "e.vue", "f.svelte", "g.py", "src/b.tsx", "src/deep/c.js"]);
    });

    it("skips empty and whitespace-only files without calling the API", async () => {
      write(dir, "empty.ts", "");
      write(dir, "blank.ts", "  \n\t\n");
      write(dir, "real.ts", "let x");
      const model = fakeModel();
      await fix();
      assert.deepEqual(model.analyzed, ["real.ts"]);
      assert.equal(out.lines.filter((l) => l.includes("empty, skipping")).length, 2);
    });

    it("scans at most 10 files (cost control) and records that in the report", async () => {
      for (let i = 0; i < 12; i++) write(dir, `f${i}.ts`, `code ${i}`);
      const model = fakeModel({ analyze: () => [issue("suggestion", "s")] });
      await fix();
      assert.equal(model.analyzed.length, 10);
      assert.match(out.text(), /Scanning 12 files/);
      assert.equal(JSON.parse(read(".ai/fix-report.json")).totalFiles, 10);
    });
  });

  describe("analysis and report", () => {
    it("lists issues, writes .ai/fix-report.json, and leaves sources untouched without --apply", async () => {
      write(dir, "a.ts", "let a = 1");
      write(dir, "src/b.ts", "let b = 2");
      write(dir, "clean.ts", "let c = 3");
      fakeModel({
        analyze: (file) =>
          file === "a.ts" ? [issue("error", "a is bad", { line: 7, fix: "rename a" })]
          : file === "src/b.ts" ? [issue("suggestion", "b could be const")]
          : [],
      });
      await fix(false);
      const report = JSON.parse(read(".ai/fix-report.json"));
      assert.equal(report.timestamp, "2026-03-04T05:06:07.000Z");
      assert.equal(report.totalFiles, 3);
      assert.equal(report.filesWithIssues, 2);
      assert.deepEqual(
        report.issues.map((f) => f.file).sort(),
        ["a.ts", path.join("src", "b.ts")],
      );
      assert.deepEqual(report.issues.find((f) => f.file === "a.ts").issues, [issue("error", "a is bad", { line: 7, fix: "rename a" })]);
      assert.equal(read("a.ts"), "let a = 1");
      assert.equal(exists("a.ts.backup"), false);
      const text = out.text();
      assert.match(text, /a is bad :7/);
      assert.match(text, /Fix: rename a/);
      assert.match(text, /Run with --apply to auto-fix issues\./);
    });

    it("says the code is clean and makes no changes when no file has issues", async () => {
      write(dir, "a.ts", "let a = 1");
      const model = fakeModel({ analyze: () => [] });
      await fix(true);
      assert.match(out.text(), /No issues found/);
      assert.equal(model.fixes.length, 0);
      assert.equal(exists("a.ts.backup"), false);
    });

    it("turns a non-JSON model reply into a single suggestion issue", async () => {
      write(dir, "a.ts", "let a = 1");
      fakeModel({ analyze: () => "I think this is fine" });
      await fix();
      const [entry] = JSON.parse(read(".ai/fix-report.json")).issues;
      assert.deepEqual(entry.issues, [issue("suggestion", "I think this is fine")]);
    });

    it("keeps going when analysing one file fails", async () => {
      write(dir, "bad.ts", "x");
      write(dir, "good.ts", "y");
      fakeModel({ analyze: (file) => (file === "bad.ts" ? new Error("500 upstream") : [issue("warning", "w")]) });
      await fix();
      assert.match(out.text(), /failed to analyze/);
      const report = JSON.parse(read(".ai/fix-report.json"));
      assert.deepEqual(report.issues.map((f) => f.file), ["good.ts"]);
    });
  });

  describe("--apply", () => {
    it("fixes errors and warnings in order (each fix feeds the next), skips suggestions, and backs up the original", async () => {
      write(dir, "a.ts", "v0");
      const model = fakeModel({
        analyze: () => [issue("error", "E1"), issue("suggestion", "S1"), issue("warning", "W1")],
        fixer: (msg, code) => `${code}+${msg}`,
      });
      await fix(true);
      assert.deepEqual(model.fixes, [
        { issue: "E1", code: "v0" },
        { issue: "W1", code: "v0+E1" },
      ]);
      assert.equal(read("a.ts"), "v0+E1+W1");
      assert.equal(read("a.ts.backup"), "v0");
      assert.match(out.text(), /Fixed: E1/);
      assert.match(out.text(), /Fixes applied\. Originals backed up as \.backup files\./);
    });

    it("ignores a blank fix result and keeps the previous code", async () => {
      write(dir, "a.ts", "v0");
      fakeModel({ analyze: () => [issue("error", "E1")], fixer: () => "   " });
      await fix(true);
      assert.equal(read("a.ts"), "v0");
      assert.doesNotMatch(out.text(), /Fixed: E1/);
    });

    it("skips an issue whose fix request fails and still applies the others", async () => {
      write(dir, "a.ts", "v0");
      fakeModel({
        analyze: () => [issue("error", "E1"), issue("error", "E2")],
        fixer: (msg, code) => (msg === "E1" ? new Error("timeout") : `${code}+${msg}`),
      });
      await fix(true);
      assert.equal(read("a.ts"), "v0+E2");
      assert.match(out.text(), /Skipped: E1/);
    });

    it("truncates long issue messages to 60 chars in the progress line", async () => {
      write(dir, "a.ts", "v0");
      const long = "x".repeat(100);
      fakeModel({ analyze: () => [issue("error", long)], fixer: (m, c) => `${c}!` });
      await fix(true);
      assert.ok(out.lines.some((l) => l.endsWith(`Fixed: ${"x".repeat(60)}`)));
    });
  });
});
