# AutoStack AI

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![CLI](https://img.shields.io/badge/release-local%20CLI%20candidate-orange.svg)](RELEASE_MEMORY.md)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

One command to detect a project stack and install matching AI skills, code-generation prompts, and workflow templates.

> **Status:** Local CLI package release candidate · build and tarball smoke verified · public npm publish pending package-name/version decision

## Contents

1. [Why This Exists](#why-this-exists)
2. [Status](#status)
3. [Key Technical Decisions](#key-technical-decisions)
4. [Commands](#commands)
5. [Local Install](#local-install)
6. [Environment](#environment)
7. [Supported Stacks](#supported-stacks)
8. [Package Release](#package-release)
9. [Known Limits](#known-limits)
10. [Author](#author)

## Why This Exists

Modern projects need different AI instructions depending on their stack. A React app, Express API, Android app, and Laravel project should not receive the same coding prompt or workflow template.

AutoStackAI detects the project type and installs focused AI assets into `.ai/skills/`, so the next AI coding session starts with better context.

## Status

| Item | State |
|---|---|
| Release type | Local CLI package |
| Local build | Verified |
| Tarball install | Verified |
| Public npm publish | Pending |
| Last verified | 2026-06-04 |

Verified checks include `pnpm build`, `pnpm pack`, clean tarball install, `autostack-ai --help`, fixture `init`, and missing-key AI command behavior.

## Key Technical Decisions

**The CLI installs stack-specific skills instead of one generic prompt.** Each detected stack gets focused instructions and templates, which makes generated work more relevant.

**`init` works without an API key.** Project detection and skill installation should be useful even before AI generation is configured.

**AI commands require `OPENAI_API_KEY` and fail clearly when missing.** This prevents confusing runtime behavior and keeps setup explicit.

**The package uses a `files` allowlist.** Published tarballs include `dist`, `skills`, `workflows`, docs, license, and env example without leaking source-only or local files.

**`prepack` runs the TypeScript build.** Package artifacts stay aligned with source before tarball creation.

## Local Install

```bash
pnpm install
pnpm build
pnpm link --global
autostack-ai init
```

For a tarball smoke test before publishing:

```bash
pnpm pack
mkdir -p /tmp/autostack-smoke
cd /tmp/autostack-smoke
pnpm add /path/to/AutoStackAI/autostack-ai-1.0.0.tgz
pnpm exec autostack-ai init
```

After public package publishing, the install path becomes:

```bash
pnpm dlx autostack-ai init
```

## Environment

`init` does not require an OpenAI key. AI generation, fix, and dev-watch commands require `OPENAI_API_KEY`.

Copy `.env.example` to `.env` when using AI commands:

```bash
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

## Commands

| Command | Description |
|---|---|
| `autostack-ai init` | Auto-detect stack + install AI skills |
| `autostack-ai install <skill>` | Manually install a skill |
| `autostack-ai build "feature"` | Generate code for a feature with AI |
| `autostack-ai fix` | Scan project and get AI fix suggestions |
| `autostack-ai fix --apply` | Auto-apply AI fixes |
| `autostack-ai dev` | Watch mode — AI feedback as you code |

## Supported Stacks

- **React / Next.js / Remix / Gatsby**
- **Vue / Nuxt**
- **Svelte / SvelteKit**
- **Express / Fastify / Hono**
- **Django / Flask / FastAPI**
- **Flutter / Android (Kotlin)**
- **Laravel**

## Skills

Skills are installed into `.ai/skills/` in your project root.

Each skill contains:
- `prompt.md` — system prompt for that stack
- `template.ts` — optional code templates

## Build (for development)

```bash
pnpm install
pnpm build
pnpm link --global

autostack-ai init
```

## Package Release

```bash
pnpm build
pnpm pack
```

Before public npm publishing, confirm:

- package name
- version
- release notes
- whether `fix --apply` needs a dry-run/preview mode first

## Known Limits

- Stack detection has fixture smoke coverage but not a full automated test suite yet.
- `fix --apply` can modify project files and should be used carefully.
- AI generation is OpenAI-only in the current release path.

## Release Status

The local package release path has been verified with:

- `pnpm build`
- `pnpm pack`
- clean tarball install
- `autostack-ai --help`
- `autostack-ai init` on React, Express, and package-smoke fixtures

Do not publish to npm until the package name, version, and release notes are confirmed.

## Author

Built by **[Sudarshan Chaudhari](https://github.com/SUDARSHANCHAUDHARI)** — SudarshanTechLabs.

Contact: [sudarshantechlabs@gmail.com](mailto:sudarshantechlabs@gmail.com)

## License

MIT
