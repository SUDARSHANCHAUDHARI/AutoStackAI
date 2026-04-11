# AutoStack AI

> One command. Full AI-powered dev stack.

AutoStack AI automatically detects your project's tech stack and installs AI agents, code generation skills, and workflows — instantly.

## Install

```bash
pnpm dlx autostack-ai init
```

Or install globally:

```bash
pnpm add -g autostack-ai
```

## Setup

Copy `.env.example` to `.env` and add your OpenAI key:

```bash
cp .env.example .env
# Edit .env and add: OPENAI_API_KEY=sk-...
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

## Author

SudarshanTechLabs — [sudarshantechlabs@gmail.com](mailto:sudarshantechlabs@gmail.com)

## License

MIT
