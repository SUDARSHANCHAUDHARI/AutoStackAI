// Shared test helpers. Everything is local and deterministic; files go to OS temp dirs only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mock } from "node:test";
import OpenAI from "openai";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(REPO, "dist");

export function tmpDir(prefix = "autostack-test-") {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function rmDir(dir) {
  // Only ever remove something we created under the OS temp dir.
  if (dir && path.resolve(dir).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function write(root, rel, content = "") {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
}

/** Make `dir` the cwd for the duration of fn (the code under test reads process.cwd()). */
export async function inCwd(dir, fn) {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(prev);
  }
}

export async function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

let fresh = 0;
/** Import a dist module with its own module state (e.g. the cached OpenAI client). */
export const importFresh = (rel) => import(`${path.join(DIST, rel)}?fresh=${++fresh}`);

/** Stub the OpenAI network call. impl(request) returns the response (or an async iterable when streaming). */
export function stubOpenAI(impl) {
  const calls = [];
  const stub = mock.method(OpenAI.Chat.Completions.prototype, "create", async function (req) {
    calls.push(req);
    return impl(req, calls.length);
  });
  return { calls, stub };
}

export const reply = (content) => ({ choices: [{ message: { content } }] });

export async function* streamOf(...chunks) {
  for (const c of chunks) yield { choices: [{ delta: { content: c } }] };
}

const ANSI = /\u001b\[[0-9;]*m/g;
export const stripAnsi = (s) => String(s).replace(ANSI, "");

/** Capture console.log/warn/error lines (ANSI stripped) instead of printing them. */
export function captureConsole() {
  const lines = [];
  for (const m of ["log", "warn", "error"]) {
    mock.method(console, m, (...a) => lines.push(stripAnsi(a.join(" "))));
  }
  return { lines, text: () => lines.join("\n") };
}

/**
 * Swallow process.stdout.write while fn runs (the code under test streams raw chunks to it).
 * The test runner reports through stdout too, so non-string writes pass through and the patch ends with fn.
 */
export async function withStdoutCaptured(fn) {
  const chunks = [];
  const orig = process.stdout.write;
  // Only plain strings are swallowed; the runner's own frames are Buffers and must pass through.
  process.stdout.write = function (c, ...rest) {
    if (typeof c !== "string") return orig.call(process.stdout, c, ...rest);
    chunks.push(stripAnsi(c));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks;
}
