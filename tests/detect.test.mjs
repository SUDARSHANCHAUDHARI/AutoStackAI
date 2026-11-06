import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DIST, tmpDir, rmDir, write, inCwd } from "./helpers.mjs";

const { detectStack } = await import(`${DIST}/core/detector/detect.js`);

describe("detectStack", () => {
  let dir;
  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => rmDir(dir));

  const detect = () => inCwd(dir, detectStack);
  const pkg = (deps = {}, devDeps = {}) =>
    write(dir, "package.json", JSON.stringify({ dependencies: deps, devDependencies: devDeps }));

  it("returns 'unknown' defaults for an empty directory", async () => {
    assert.deepEqual(await detect(), {
      framework: "unknown", language: "unknown", styling: "none", backend: "none", database: "none",
    });
  });

  describe("python (requirements.txt)", () => {
    for (const [reqs, framework] of [
      ["django==4.2\n", "django"],
      ["flask>=2\n", "flask"],
      ["fastapi\nuvicorn\n", "fastapi"],
      ["requests\n", "python-generic"],
      ["", "python-generic"],
      ["flask\ndjango\n", "django"], // django is checked first
    ]) {
      it(`${JSON.stringify(reqs)} -> ${framework}`, async () => {
        write(dir, "requirements.txt", reqs);
        assert.deepEqual(await detect(), {
          framework, language: "python", styling: "none", backend: "none", database: "none",
        });
      });
    }

    // pip names are case-insensitive and "Django==4.2" is common.
    it("detects capitalised package names (Django, Flask)", async () => {
      write(dir, "requirements.txt", "Django==4.2\n");
      assert.equal((await detect()).framework, "django");
    });
  });

  it("detects flutter from pubspec.yaml", async () => {
    write(dir, "pubspec.yaml", "name: app\n");
    assert.deepEqual(await detect(), {
      framework: "flutter", language: "dart", styling: "none", backend: "none", database: "none",
    });
  });

  describe("php (composer.json)", () => {
    it("detects laravel from require", async () => {
      write(dir, "composer.json", JSON.stringify({ require: { "laravel/framework": "^11" } }));
      const s = await detect();
      assert.equal(s.framework, "laravel");
      assert.equal(s.language, "php");
    });
    it("detects laravel from require-dev", async () => {
      write(dir, "composer.json", JSON.stringify({ "require-dev": { "laravel/framework": "^11" } }));
      assert.equal((await detect()).framework, "laravel");
    });
    it("keeps framework unknown for non-laravel php, even with no require sections", async () => {
      write(dir, "composer.json", "{}");
      assert.deepEqual(await detect(), {
        framework: "unknown", language: "php", styling: "none", backend: "none", database: "none",
      });
    });
    it("rejects on malformed composer.json", async () => {
      write(dir, "composer.json", "{ nope");
      await assert.rejects(detect(), SyntaxError);
    });
  });

  describe("node (package.json)", () => {
    it("plain package.json -> node / javascript / css", async () => {
      pkg();
      assert.deepEqual(await detect(), {
        framework: "node", language: "javascript", styling: "css", backend: "none", database: "none",
      });
    });
    it("package.json with no dependency sections at all does not crash", async () => {
      write(dir, "package.json", "{}");
      assert.equal((await detect()).framework, "node");
    });
    it("rejects on malformed package.json", async () => {
      write(dir, "package.json", "not json");
      await assert.rejects(detect(), SyntaxError);
    });

    describe("language", () => {
      it("typescript dependency -> typescript", async () => { pkg({}, { typescript: "^5" }); assert.equal((await detect()).language, "typescript"); });
      it("@types/node alone -> typescript", async () => { pkg({}, { "@types/node": "^20" }); assert.equal((await detect()).language, "typescript"); });
      it("neither -> javascript", async () => { pkg({ react: "^18" }); assert.equal((await detect()).language, "javascript"); });
    });

    describe("framework", () => {
      for (const [dep, framework] of [
        ["next", "nextjs"], ["gatsby", "gatsby"], ["remix", "remix"], ["nuxt", "nuxt"], ["nuxt3", "nuxt"],
        ["@sveltejs/kit", "sveltekit"], ["svelte", "svelte"], ["vue", "vue"], ["react", "react"],
        ["express", "express"], ["fastify", "fastify"], ["hono", "hono"],
      ]) {
        it(`${dep} -> ${framework}`, async () => {
          pkg({ [dep]: "1.0.0" });
          assert.equal((await detect()).framework, framework);
        });
      }
      it("reads devDependencies too", async () => {
        pkg({}, { vue: "^3" });
        assert.equal((await detect()).framework, "vue");
      });
      it("most specific wins: next beats react, sveltekit beats svelte, react beats express", async () => {
        pkg({ react: "^18", next: "^14" });
        assert.equal((await detect()).framework, "nextjs");
        pkg({ svelte: "^4", "@sveltejs/kit": "^2" });
        assert.equal((await detect()).framework, "sveltekit");
        pkg({ express: "^4", react: "^18" });
        assert.equal((await detect()).framework, "react");
      });
    });

    describe("styling", () => {
      for (const [dep, styling] of [
        ["tailwindcss", "tailwind"], ["@mui/material", "mui"], ["antd", "antd"], ["styled-components", "styled-components"],
      ]) {
        it(`${dep} -> ${styling}`, async () => { pkg({ [dep]: "1" }); assert.equal((await detect()).styling, styling); });
      }
      it("tailwind beats mui when both present", async () => {
        pkg({ "@mui/material": "5", tailwindcss: "3" });
        assert.equal((await detect()).styling, "tailwind");
      });
    });

    describe("backend and database", () => {
      for (const [dep, backend] of [
        ["@supabase/supabase-js", "supabase"], ["firebase", "firebase"], ["@prisma/client", "prisma"], ["mongoose", "mongoose"],
      ]) {
        it(`${dep} -> backend ${backend}`, async () => { pkg({ [dep]: "1" }); assert.equal((await detect()).backend, backend); });
      }
      for (const [dep, database] of [
        ["pg", "postgresql"], ["postgres", "postgresql"], ["mysql2", "mysql"], ["mongoose", "mongodb"],
        ["better-sqlite3", "sqlite"], ["@prisma/client", "prisma"],
      ]) {
        it(`${dep} -> database ${database}`, async () => { pkg({ [dep]: "1" }); assert.equal((await detect()).database, database); });
      }
      it("prisma + pg: backend prisma, database postgresql (pg is checked before prisma)", async () => {
        pkg({ "@prisma/client": "5", pg: "8" });
        const s = await detect();
        assert.equal(s.backend, "prisma");
        assert.equal(s.database, "postgresql");
      });
    });
  });

  describe("android (gradle)", () => {
    for (const file of ["build.gradle.kts", "build.gradle"]) {
      it(`${file} -> android / kotlin / compose`, async () => {
        write(dir, file, "");
        assert.deepEqual(await detect(), {
          framework: "android", language: "kotlin", styling: "compose", backend: "none", database: "none",
        });
      });
    }
  });
});
