import { describe, it, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { importFresh, stubOpenAI, reply, streamOf, withEnv } from "./helpers.mjs";

const DEFAULT_SYSTEM =
  "You are an expert software engineer. Return only clean, production-ready code. No markdown fences. No explanation.";

describe("ai/openai", () => {
  afterEach(() => mock.restoreAll());
  // Each test imports a fresh module because getClient() caches the client at module level.
  const load = () => importFresh("core/ai/openai.js");
  const keyed = (fn) => withEnv({ OPENAI_API_KEY: "sk-test" }, fn);

  describe("API key handling", () => {
    it("generateCode rejects with a helpful message when OPENAI_API_KEY is unset", async () => {
      const { generateCode } = await load();
      const { stub } = stubOpenAI(() => reply("x"));
      await withEnv({ OPENAI_API_KEY: undefined }, async () => {
        await assert.rejects(generateCode("hi"), { message: "OPENAI_API_KEY is not set. Add it to your .env file." });
      });
      assert.equal(stub.mock.callCount(), 0);
    });

    it("generateWithStream rejects when OPENAI_API_KEY is unset", async () => {
      const { generateWithStream } = await load();
      await withEnv({ OPENAI_API_KEY: undefined }, async () => {
        await assert.rejects(generateWithStream("hi", () => {}), /OPENAI_API_KEY is not set/);
      });
    });
  });

  describe("generateCode", () => {
    it("sends defaults (gpt-4o, temp 0.3, 4096 tokens, default system prompt) and returns trimmed text", async () => {
      const { generateCode } = await load();
      const { calls } = stubOpenAI(() => reply("  const a = 1;\n\n"));
      const out = await keyed(() => generateCode("write a"));
      assert.equal(out, "const a = 1;");
      assert.deepEqual(calls[0], {
        model: "gpt-4o",
        messages: [
          { role: "system", content: DEFAULT_SYSTEM },
          { role: "user", content: "write a" },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });
    });

    it("honours option overrides", async () => {
      const { generateCode } = await load();
      const { calls } = stubOpenAI(() => reply("ok"));
      await keyed(() => generateCode("p", { model: "m", temperature: 0, systemPrompt: "sys", maxTokens: 10 }));
      assert.deepEqual(calls[0], {
        model: "m",
        messages: [{ role: "system", content: "sys" }, { role: "user", content: "p" }],
        temperature: 0,
        max_tokens: 10,
      });
    });

    it("keeps temperature 0 (does not fall back to the 0.3 default)", async () => {
      const { generateCode } = await load();
      const { calls } = stubOpenAI(() => reply("ok"));
      await keyed(() => generateCode("p", { temperature: 0 }));
      assert.equal(calls[0].temperature, 0);
    });

    it("returns '' for empty choices or null content", async () => {
      const { generateCode } = await load();
      stubOpenAI((_, n) => (n === 1 ? { choices: [] } : reply(null)));
      assert.equal(await keyed(() => generateCode("p")), "");
      assert.equal(await keyed(() => generateCode("p")), "");
    });

    it("propagates API errors", async () => {
      const { generateCode } = await load();
      stubOpenAI(() => { throw new Error("401 bad key"); });
      await keyed(() => assert.rejects(generateCode("p"), { message: "401 bad key" }));
    });
  });

  describe("generateWithStream", () => {
    it("forwards each non-empty delta to onChunk and returns the concatenation", async () => {
      const { generateWithStream } = await load();
      const { calls } = stubOpenAI(() => streamOf("Hel", "", "lo ", "world"));
      const seen = [];
      const out = await keyed(() => generateWithStream("p", (c) => seen.push(c)));
      assert.equal(out, "Hello world");
      assert.deepEqual(seen, ["Hel", "lo ", "world"]);
      assert.equal(calls[0].stream, true);
      assert.equal(calls[0].model, "gpt-4o");
      assert.equal(calls[0].temperature, 0.3);
    });

    it("ignores chunks with no delta content or no choices", async () => {
      const { generateWithStream } = await load();
      stubOpenAI(async function* () {
        yield { choices: [] };
        yield { choices: [{ delta: {} }] };
        yield { choices: [{ delta: { content: "x" } }] };
      });
      assert.equal(await keyed(() => generateWithStream("p", () => {})), "x");
    });

    it("returns '' for an empty stream", async () => {
      const { generateWithStream } = await load();
      stubOpenAI(() => streamOf());
      assert.equal(await keyed(() => generateWithStream("p", () => {})), "");
    });

    it("propagates a mid-stream failure", async () => {
      const { generateWithStream } = await load();
      stubOpenAI(async function* () {
        yield { choices: [{ delta: { content: "a" } }] };
        throw new Error("connection reset");
      });
      await keyed(() => assert.rejects(generateWithStream("p", () => {}), { message: "connection reset" }));
    });
  });

  describe("analyzeCode", () => {
    it("returns valid JSON from the model untouched", async () => {
      const { analyzeCode } = await load();
      const json = '[{"line":3,"severity":"error","message":"m","fix":"f"}]';
      stubOpenAI(() => reply(json));
      assert.equal(await keyed(() => analyzeCode("code")), json);
    });

    it("wraps non-JSON model output in a single suggestion issue", async () => {
      const { analyzeCode } = await load();
      stubOpenAI(() => reply("Looks fine to me."));
      const out = JSON.parse(await keyed(() => analyzeCode("code")));
      assert.deepEqual(out, [{ line: null, severity: "suggestion", message: "Looks fine to me.", fix: "" }]);
    });

    it("builds the prompt with context when given, and uses gpt-4o-mini @ 0.1", async () => {
      const { analyzeCode } = await load();
      const { calls } = stubOpenAI(() => reply("[]"));
      await keyed(() => analyzeCode("let x", "File: a.ts"));
      assert.equal(calls[0].model, "gpt-4o-mini");
      assert.equal(calls[0].temperature, 0.1);
      assert.equal(calls[0].messages[1].content, "Context: File: a.ts\n\nCode to analyze:\n\nlet x");
      assert.match(calls[0].messages[0].content, /Return ONLY valid JSON/);
    });

    it("omits the Context line when no context is given", async () => {
      const { analyzeCode } = await load();
      const { calls } = stubOpenAI(() => reply("[]"));
      await keyed(() => analyzeCode("let x"));
      assert.equal(calls[0].messages[1].content, "Code to analyze:\n\nlet x");
    });

    it("an empty model reply is wrapped as a suggestion with an empty message", async () => {
      const { analyzeCode } = await load();
      stubOpenAI(() => reply(null));
      const out = JSON.parse(await keyed(() => analyzeCode("code")));
      assert.deepEqual(out, [{ line: null, severity: "suggestion", message: "", fix: "" }]);
    });

    // The prompt promises an array, and callers (fix.ts, dev.ts) treat a non-array as "no issues",
    // so {"issues":[...]} must be unwrapped rather than passed through as a silent false "clean".
    it("always returns a JSON array, even if the model answers with an object", async () => {
      const { analyzeCode } = await load();
      stubOpenAI(() => reply('{"issues":[{"line":1,"severity":"error","message":"boom","fix":""}]}'));
      const out = JSON.parse(await keyed(() => analyzeCode("code")));
      assert.ok(Array.isArray(out));
      assert.deepEqual(out, [{ line: 1, severity: "error", message: "boom", fix: "" }]);
    });

    it("rejects any other JSON shape instead of reporting it as clean", async () => {
      const { analyzeCode } = await load();
      stubOpenAI(() => reply('{"result":"ok"}'));
      await assert.rejects(keyed(() => analyzeCode("code")), /expected a JSON array/);
    });
  });

  describe("suggestFix", () => {
    it("asks gpt-4o-mini @ 0.1 to fix the issue in the given code", async () => {
      const { suggestFix } = await load();
      const { calls } = stubOpenAI(() => reply("fixed code\n"));
      const out = await keyed(() => suggestFix("let x = 1", "x is unused"));
      assert.equal(out, "fixed code");
      assert.equal(calls[0].model, "gpt-4o-mini");
      assert.equal(calls[0].temperature, 0.1);
      const prompt = calls[0].messages[1].content;
      assert.match(prompt, /Issue: x is unused/);
      assert.match(prompt, /Code:\nlet x = 1\n/);
      assert.match(prompt, /Return the fixed code only/);
    });
  });
});
