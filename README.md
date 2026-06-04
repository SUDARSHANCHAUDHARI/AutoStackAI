# AutoStack AI

> One command. Full AI-powered dev stack.

AutoStack AI automatically detects your project's tech stack and installs AI agents, code generation skills, and workflows — instantly.

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

## Setup

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

## Release Status

The local package release path has been verified with:

- `pnpm build`
- `pnpm pack`
- clean tarball install
- `autostack-ai --help`
- `autostack-ai init` on React, Express, and package-smoke fixtures

Do not publish to npm until the package name, version, and release notes are confirmed.

## Author

SudarshanTechLabs — [sudarshantechlabs@gmail.com](mailto:sudarshantechlabs@gmail.com)

## License

MIT
