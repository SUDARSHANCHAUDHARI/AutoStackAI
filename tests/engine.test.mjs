import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DIST, tmpDir, rmDir, write, inCwd, withEnv, stubOpenAI, streamOf, captureConsole, withStdoutCaptured } from "./helpers.mjs";

const { runBuild } = await import(`${DIST}/core/engine/engine.js`);

const FIXED_NOW = Date.parse("2026-03-04T05:06:07.000Z");
const STACK = { framework: "express", language: "typescript", styling: "css", backend: "none", database: "none" };

describe("runBuild", () => {
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

  const build = (feature, outputName) =>
    withStdoutCaptured(() =>
      inCwd(dir, () => withEnv({ OPENAI_API_KEY: "sk-test" }, () => runBuild(feature, outputName))));
  const config = (stack = STACK, extra = {}) =>
    write(dir, ".ai/config.json", JSON.stringify({ version: "1.0.0", stack, agents: { codegen: { skill: "node-agent", model: "gpt-4o", temperature: 0.3 } }, ...extra }));
  const file = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");

  describe("generation", () => {
    it("streams from gpt-4o at temperature 0.3 and saves the concatenated output", async () => {
      config();
      const { calls } = stubOpenAI(() => streamOf("const a", " = 1;"));
      await build("add a counter", "counter.ts");
      assert.equal(file("counter.ts"), "const a = 1;");
      assert.equal(calls.length, 1);
      assert.equal(calls[0].model, "gpt-4o");
      assert.equal(calls[0].temperature, 0.3);
      assert.equal(calls[0].stream, true);
    });

    it("builds the prompt from the stored stack and the feature text", async () => {
      config({ framework: "vue", language: "typescript", styling: "tailwind", backend: "supabase", database: "postgresql" });
      const { calls } = stubOpenAI(() => streamOf("x"));
      await build("a login form", "login");
      const prompt = calls[0].messages[1].content;
      assert.match(prompt, /^You are building a feature for a vue project\./);
      for (const line of ["- Framework: vue", "- Language: typescript", "- Styling: tailwind", "- Backend: supabase", "- Database: postgresql"]) {
        assert.ok(prompt.includes(line), line);
      }
      assert.match(prompt, /Feature to implement:\na login form\n/);
    });

    it("prepends the installed skill prompt, separated by a rule", async () => {
      config();
      write(dir, ".ai/skills/node-agent/prompt.md", "SKILL PROMPT BODY");
      const { calls } = stubOpenAI(() => streamOf("x"));
      await build("f", "o.ts");
      assert.ok(calls[0].messages[1].content.startsWith("SKILL PROMPT BODY\n\n---\n\nYou are building a feature for a express project."));
    });

    it("still builds when the skill prompt file is missing", async () => {
      config();
      const { calls } = stubOpenAI(() => streamOf("x"));
      await build("f", "o.ts");
      assert.ok(calls[0].messages[1].content.startsWith("You are building a feature"));
    });

    it("falls back to the api-agent skill when config has no agents section", async () => {
      write(dir, ".ai/config.json", JSON.stringify({ version: "1.0.0", stack: STACK }));
      write(dir, ".ai/skills/api-agent/prompt.md", "API SKILL");
      const { calls } = stubOpenAI(() => streamOf("x"));
      await build("f", "o.ts");
      assert.ok(calls[0].messages[1].content.startsWith("API SKILL\n\n---\n\n"));
    });

    it("detects the stack when no .ai/config.json exists, and says init is recommended", async () => {
      write(dir, "package.json", JSON.stringify({ dependencies: { react: "^18" }, devDependencies: { typescript: "^5" } }));
      write(dir, ".ai/placeholder", "");
      const { calls } = stubOpenAI(() => streamOf("x"));
      await build("f", "widget");
      assert.match(calls[0].messages[1].content, /- Framework: react\n- Language: typescript/);
      assert.match(out.text(), /No \.ai config found/);
      assert.ok(fs.existsSync(path.join(dir, "widget.tsx")));
    });
  });

  describe("output file name", () => {
    for (const [stack, name, expected] of [
      [{ framework: "react", language: "typescript" }, "App", "App.tsx"],
      [{ framework: "nextjs", language: "typescript" }, "App", "App.tsx"],
      [{ framework: "gatsby", language: "typescript" }, "App", "App.tsx"],
      [{ framework: "remix", language: "typescript" }, "App", "App.tsx"],
      [{ framework: "vue", language: "typescript" }, "App", "App.vue"],
      [{ framework: "nuxt", language: "typescript" }, "App", "App.vue"],
      [{ framework: "svelte", language: "typescript" }, "App", "App.svelte"],
      [{ framework: "sveltekit", language: "typescript" }, "App", "App.svelte"],
      [{ framework: "express", language: "typescript" }, "api", "api.ts"],
      [{ framework: "react", language: "javascript" }, "App", "App.jsx"],
      [{ framework: "nextjs", language: "javascript" }, "App", "App.jsx"],
      [{ framework: "express", language: "javascript" }, "api", "api.js"],
      [{ framework: "django", language: "python" }, "views", "views.py"],
      [{ framework: "laravel", language: "php" }, "Ctl", "Ctl.php"],
      [{ framework: "flutter", language: "dart" }, "main", "main.dart"],
      [{ framework: "react", language: "typescript" }, "custom.txt", "custom.txt"], // a dot in the name disables the extension
    ]) {
      it(`${stack.framework}/${stack.language} + "${name}" -> ${expected}`, async () => {
        config({ styling: "css", backend: "none", database: "none", ...stack });
        stubOpenAI(() => streamOf("content"));
        await build("f", name);
        assert.equal(file(expected), "content");
      });
    }
  });

  // Android is Kotlin (not Dart), and Vue/Svelte single-file components keep their extension in JavaScript projects too.
  describe("output file name, android and JavaScript vue/svelte", () => {
    for (const [stack, expected] of [
      [{ framework: "android", language: "kotlin" }, "Main.kt"],
      [{ framework: "vue", language: "javascript" }, "Main.vue"],
      [{ framework: "svelte", language: "javascript" }, "Main.svelte"],
    ]) {
      it(`${stack.framework}/${stack.language} -> ${expected}`, async () => {
        config({ styling: "css", backend: "none", database: "none", ...stack });
        stubOpenAI(() => streamOf("content"));
        await build("f", "Main");
        assert.equal(file(expected), "content");
      });
    }
  });

  describe("build log", () => {
    it("appends feature, output file and ISO timestamp to .ai/build-log.json", async () => {
      config();
      stubOpenAI(() => streamOf("x"));
      await build("first", "a.ts");
      await build("second", "b");
      assert.deepEqual(JSON.parse(file(".ai/build-log.json")), [
        { feature: "first", output: "a.ts", timestamp: "2026-03-04T05:06:07.000Z" },
        { feature: "second", output: "b.ts", timestamp: "2026-03-04T05:06:07.000Z" },
      ]);
    });

    // A build before `init` must create .ai/ for the build log instead of throwing ENOENT.
    it("works before `init` (no .ai directory yet)", async () => {
      write(dir, "package.json", JSON.stringify({ dependencies: { express: "4" } }));
      stubOpenAI(() => streamOf("x"));
      await build("f", "out");
    });
  });
});
