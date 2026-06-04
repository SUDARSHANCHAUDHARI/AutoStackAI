# AutoStackAI - Codex Context

## Project

- Path: `CLIProjects/AutoStackAI`
- Type: TypeScript CLI project
- Framework: inspect `package.json` scripts before assuming a web framework.
- Package manager: `pnpm` unless repo scripts prove otherwise.

## Workflows

- Inspect `package.json` scripts before running build, lint, test, or dev commands.
- Do not commit `dist/`, local env files, generated caches, package tarballs, or deployment secrets.
- Verify CLI changes with `pnpm build` plus a local install or fixture smoke test when feasible.

## Codex Rules

- Global context comes from `~/.codex/AGENTS.md`.
- Verify actual files before claiming repo state, config, counts, or duplicates.
- Do not commit secrets, `.env*`, local config, signing material, generated caches, sessions, or auth files.
- Stage files by explicit path only.
- Prefer focused changes and match existing project patterns.
- Read `CodexConfig/rules/web.md` before substantial web/TypeScript work.
