import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { REPO, DIST, tmpDir, rmDir, write, inCwd, captureConsole } from "./helpers.mjs";

const { installSkills } = await import(`${DIST}/core/installer/install.js`);

const FIXED_NOW = Date.parse("2026-03-04T05:06:07.000Z");
const stack = (over = {}) => ({
  framework: "unknown", language: "unknown", styling: "none", backend: "none", database: "none", ...over,
});

describe("installSkills", () => {
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

  const install = (s) => inCwd(dir, () => installSkills(s));
  const ai = (...p) => path.join(dir, ".ai", ...p);
  const installedSkills = () => fs.readdirSync(ai("skills")).sort();
  const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

  it("creates the .ai directory layout and writes stack.json", async () => {
    const s = stack({ framework: "react", language: "typescript", styling: "tailwind" });
    await install(s);
    for (const d of ["agents", "prompts", "skills", "workflows"]) assert.ok(fs.statSync(ai(d)).isDirectory(), d);
    assert.deepEqual(readJson(ai("stack.json")), s);
  });

  describe("skills chosen per framework", () => {
    for (const [framework, expected] of [
      ["nextjs", ["api-agent", "nextjs-agent", "react-codegen"]],
      ["react", ["api-agent", "react-codegen"]],
      ["vue", ["api-agent", "vue-codegen"]],
      ["nuxt", ["api-agent", "vue-codegen"]],
      ["sveltekit", ["api-agent"]],
      ["svelte", ["api-agent"]],
      ["express", ["api-agent", "node-agent"]],
      ["fastify", ["api-agent", "node-agent"]],
      ["hono", ["api-agent", "node-agent"]],
      ["node", ["api-agent", "node-agent"]],
      ["django", ["api-agent"]],
      ["flask", ["api-agent"]],
      ["fastapi", ["api-agent"]],
      ["flutter", ["mobile-agent"]],
      ["android", ["mobile-agent"]],
      ["laravel", ["api-agent"]],
      ["unknown", ["api-agent"]],
      // detectStack can return these but there is no mapping, so they fall back to api-agent
      ["gatsby", ["api-agent"]],
      ["remix", ["api-agent"]],
      ["python-generic", ["api-agent"]],
    ]) {
      it(`${framework} -> ${expected.join(", ")}`, async () => {
        await install(stack({ framework }));
        assert.deepEqual(installedSkills(), expected);
        for (const skill of expected) {
          assert.ok(fs.existsSync(ai("skills", skill, "prompt.md")), `${skill}/prompt.md copied`);
        }
        assert.equal(out.lines.filter((l) => /not found, skipping/.test(l)).length, 0, "every mapped skill exists in skills/");
      });
    }
  });

  it("copies skill files byte-for-byte from the package skills/ dir", async () => {
    await install(stack({ framework: "nextjs" }));
    for (const f of ["react-codegen/prompt.md", "react-codegen/template.ts", "api-agent/template.ts"]) {
      assert.equal(fs.readFileSync(ai("skills", f), "utf8"), fs.readFileSync(path.join(REPO, "skills", f), "utf8"), f);
    }
  });

  it("installs the default workflow", async () => {
    await install(stack());
    assert.equal(
      fs.readFileSync(ai("workflows", "default.json"), "utf8"),
      fs.readFileSync(path.join(REPO, "workflows", "default.json"), "utf8"),
    );
  });

  describe("config.json", () => {
    it("points codegen at the framework's first skill and records the stack", async () => {
      const s = stack({ framework: "nextjs", language: "typescript" });
      await install(s);
      assert.deepEqual(readJson(ai("config.json")), {
        version: "1.0.0",
        stack: s,
        agents: {
          codegen: { skill: "react-codegen", model: "gpt-4o", temperature: 0.3 },
          fix: { model: "gpt-4o-mini", temperature: 0.1 },
        },
        createdAt: "2026-03-04T05:06:07.000Z",
      });
    });
    it("uses api-agent for unknown and for unmapped frameworks", async () => {
      await install(stack({ framework: "unknown" }));
      assert.equal(readJson(ai("config.json")).agents.codegen.skill, "api-agent");
      await install(stack({ framework: "gatsby" }));
      assert.equal(readJson(ai("config.json")).agents.codegen.skill, "api-agent");
    });
    it("uses mobile-agent for flutter", async () => {
      await install(stack({ framework: "flutter" }));
      assert.equal(readJson(ai("config.json")).agents.codegen.skill, "mobile-agent");
    });
  });

  describe("manual skill", () => {
    it("installs only the requested skill: no workflow, no config.json", async () => {
      await install(stack({ manual: "node-agent" }));
      assert.deepEqual(installedSkills(), ["node-agent"]);
      assert.equal(fs.existsSync(ai("config.json")), false);
      assert.equal(fs.existsSync(ai("workflows", "default.json")), false);
      assert.equal(readJson(ai("stack.json")).manual, "node-agent");
    });
    it("warns and installs nothing when the skill does not exist", async () => {
      await install(stack({ manual: "no-such-skill" }));
      assert.deepEqual(installedSkills(), []);
      assert.match(out.text(), /Skill "no-such-skill" not found, skipping\./);
    });
  });

  describe("re-running", () => {
    it("restores a locally edited skill file to the packaged version", async () => {
      await install(stack({ framework: "node" }));
      const edited = ai("skills", "node-agent", "prompt.md");
      fs.writeFileSync(edited, "LOCAL EDIT");
      await install(stack({ framework: "node" }));
      assert.equal(fs.readFileSync(edited, "utf8"), fs.readFileSync(path.join(REPO, "skills/node-agent/prompt.md"), "utf8"));
    });
    it("leaves unrelated files the user added under .ai/ alone", async () => {
      write(dir, ".ai/skills/node-agent/notes.txt", "mine");
      write(dir, ".ai/custom.json", "{}");
      await install(stack({ framework: "node" }));
      assert.equal(fs.readFileSync(ai("skills/node-agent/notes.txt"), "utf8"), "mine");
      assert.equal(fs.readFileSync(ai("custom.json"), "utf8"), "{}");
    });
  });

  it("prints the number of skills installed and the location", async () => {
    await install(stack({ framework: "express" }));
    assert.match(out.text(), /Installed 2 skill\(s\) for express/);
    assert.match(out.text(), new RegExp(`Location: ${ai().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });
});
