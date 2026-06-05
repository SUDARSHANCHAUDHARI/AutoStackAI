# Release Memory: AutoStackAI
_Last updated: 2026-06-04_

## Current Status

AutoStackAI is a local CLI package release candidate for detecting project stacks and installing AI skills/workflows.

README and `.env.example` examples use `YOUR_*` placeholders, not secret-shaped sample keys.

## Release Target

Local CLI package release. Public npm publish should wait for package-name/version confirmation and release notes.

## Success Criteria

- `pnpm build` passes. Done on 2026-06-04.
- Local package tarball installs cleanly. Done on 2026-06-04.
- `autostack-ai init` works on tiny React, Express, and package-smoke fixtures. Done on 2026-06-04.
- OpenAI/env behavior fails gracefully when missing. Done on 2026-06-04.
- Package metadata and README are ready for local release. Done on 2026-06-04.
- Generic placeholder cleanup is complete. Done on 2026-06-04.

## Ordered Plan

1. Confirm npm package name and version.
2. Prepare public release notes if publishing outside local install.
3. Consider adding automated tests for stack detection and installer output.
4. Consider adding a dry-run mode before promoting `fix --apply`.

## Risks

- AI-assisted code modification can be risky without dry-run/preview behavior.
- Stack detection has manual fixture coverage, but no automated tests yet.
- `fix --apply` can edit project files and write `.backup` files.

## Verification Log

- `pnpm install --frozen-lockfile` passed.
- `pnpm build` passed.
- `node dist/cli/index.js --help` passed.
- `node dist/cli/index.js init` passed in `/private/tmp/autostack-fixtures/react-app`.
- `node dist/cli/index.js init` passed in `/private/tmp/autostack-fixtures/node-app`.
- `pnpm pack` passed after adding a package allowlist and `prepack` build hook.
- `pnpm add /path/to/AutoStackAI/autostack-ai-1.0.0.tgz` passed in `/private/tmp/autostack-package-smoke`.
- `pnpm exec autostack-ai --help` passed in the package-smoke fixture.
- `pnpm exec autostack-ai init` passed in the package-smoke fixture.
- `pnpm exec autostack-ai build "hello world"` failed gracefully without `OPENAI_API_KEY`.
- `pnpm exec autostack-ai fix` failed gracefully without `OPENAI_API_KEY`.
- `pnpm build` passed after replacing key-looking placeholders with `YOUR_*` values.
- `pnpm pack` passed again after placeholder cleanup.
- Polished README with local CLI release status, technical decisions, package release notes, known limits, and author section.
