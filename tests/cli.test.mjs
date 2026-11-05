// Runs the built CLI (dist/cli/index.js) as a child process in an empty temp cwd, with a minimal env
// (no inherited OPENAI_API_KEY, HOME = temp dir). Only paths that never reach the OpenAI API are exercised.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DIST, tmpDir, rmDir, write, stripAnsi } from "./helpers.mjs";

const CLI = path.join(DIST, "cli/index.js");

describe("autostack-ai CLI", () => {
  let cwd;
  beforeEach(() => { cwd = tmpDir(); });
  afterEach(() => rmDir(cwd));

  function run(args, env = {}) {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      cwd,
      encoding: "utf8",
      timeout: 20_000,
      env: { PATH: process.env.PATH, HOME: cwd, NO_COLOR: "1", ...env },
    });
    assert.equal(r.error, undefined, String(r.error));
    return { code: r.status, out: stripAnsi(r.stdout), err: stripAnsi(r.stderr) };
  }
  const exists = (rel) => fs.existsSync(path.join(cwd, rel));

  it("--version prints 1.0.0 and exits 0", () => {
    const { code, out } = run(["--version"]);
    assert.equal(code, 0);
    assert.match(out, /^\s*⚡ AutoStack AI[^\n]*\n\s*1\.0\.0\s*$/);
  });

  it("--help lists every command", () => {
    const { code, out } = run(["--help"]);
    assert.equal(code, 0);
    for (const c of ["init", "install <skill>", "build [options] <feature>", "fix [options]", "dev"]) {
      assert.ok(out.includes(c), `help should list "${c}"`);
    }
  });

  it("an unknown command exits non-zero with a commander error", () => {
    const { code, err } = run(["bogus"]);
    assert.notEqual(code, 0);
    assert.match(err, /unknown command 'bogus'/);
  });

  it("build without a feature exits non-zero", () => {
    const { code, err } = run(["build"]);
    assert.notEqual(code, 0);
    assert.match(err, /missing required argument 'feature'/);
  });

  for (const args of [["build", "a feature"], ["fix"], ["dev"]]) {
    it(`'${args[0]}' exits 1 with a clear message when OPENAI_API_KEY is not set`, () => {
      const { code, err } = run(args);
      assert.equal(code, 1);
      assert.match(err, /OPENAI_API_KEY not set\. Add it to your \.env file\./);
      assert.equal(exists(".ai"), false);
    });
  }

  it("'build' also refuses an empty OPENAI_API_KEY", () => {
    const { code, err } = run(["build", "x"], { OPENAI_API_KEY: "" });
    assert.equal(code, 1);
    assert.match(err, /OPENAI_API_KEY not set/);
  });

  describe("init", () => {
    it("detects the stack from package.json and installs the matching skills", () => {
      write(cwd, "package.json", JSON.stringify({
        dependencies: { next: "^14", react: "^18", tailwindcss: "^3" },
        devDependencies: { typescript: "^5" },
      }));
      const { code, out } = run(["init"]);
      assert.equal(code, 0);
      assert.match(out, /"framework": "nextjs"/);
      assert.match(out, /"styling": "tailwind"/);
      assert.match(out, /AutoStack AI is ready!/);
      assert.deepEqual(fs.readdirSync(path.join(cwd, ".ai/skills")).sort(), ["api-agent", "nextjs-agent", "react-codegen"]);
      const config = JSON.parse(fs.readFileSync(path.join(cwd, ".ai/config.json"), "utf8"));
      assert.equal(config.stack.language, "typescript");
      assert.equal(config.agents.codegen.skill, "react-codegen");
    });

    it("exits 1 with 'Init failed' when package.json is malformed", () => {
      write(cwd, "package.json", "{ not json");
      const { code, err } = run(["init"]);
      assert.equal(code, 1);
      assert.match(err, /Init failed:/);
      assert.equal(exists(".ai"), false);
    });
  });

  describe("install <skill>", () => {
    it("installs a named skill only", () => {
      const { code, out } = run(["install", "node-agent"]);
      assert.equal(code, 0);
      assert.match(out, /Skill "node-agent" installed\./);
      assert.deepEqual(fs.readdirSync(path.join(cwd, ".ai/skills")), ["node-agent"]);
    });

    it("does not claim success for a skill that does not exist", () => {
      const { code, out, err } = run(["install", "no-such-skill"]);
      assert.equal(code, 1);
      assert.doesNotMatch(out, /Skill "no-such-skill" installed\./);
      assert.match(err, /Install failed: skill "no-such-skill" not found\./);
    });
  });
});
