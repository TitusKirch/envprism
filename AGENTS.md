# envprism

TUI env file manager: discovers `.env*` files and shows them as a keys × files matrix with in-place editing. `envprism diff` is the non-interactive variant for CI.

## Runtime

- Bun only (floor in `engines.bun`, dev pin in `.bun-version`): opentui's native core links via `bun:ffi`. Keep `engines.bun` at or above `@opentui/core`'s own `engines.bun`.
- opentui is reached only through the dynamic import in `src/commands/tui.ts`, so `diff` never loads it.
- No `Bun.*` globals or `bun:ffi` imports in app code — only opentui's API and Node-compatible libs, so moving back to Node stays a toolchain change once opentui ships a Node backend.
- Distribution is the npm package only: no `bun build --compile` binaries, no self-upgrade subcommand.

## Build

- pnpm (`packageManager`), ESM only, TypeScript strict.
- Vite lib mode builds `dist/`; the Bun shebang comes from the banner in `vite.config.ts`. Add every new runtime dep to `runtimeDeps` there, or the bundle inlines it.
- Vitest runs under Node (config in `vite.config.ts`). Code that loads `bun:ffi` cannot be tested there and is excluded from coverage.
- `pnpm-workspace.yaml` gates installs with `minimumReleaseAge`; a new dep with a build script needs an `allowBuilds` entry.

## Code

- `src/core/` — parser, serializer, discovery, matrix, diff, masking.
- `src/config/` — schema and defaults (`schema.ts`), loading, merging. `schema.ts` and `define.ts` (the `envprism/config` export) must not import `@opentui/core`; `define.ts` also not c12 or defu.
- `src/commands/` — citty subcommands. `src/tui/` — the opentui app: `app.ts` wires it, `render/` draws, `keys/` handles input.
- `src/tui/help.ts` is the source of truth for keybindings; keep the README in sync with it.

## Rules

- The `.env` parser/serializer is custom because `dotenv` does not round-trip. parse → serialize must reproduce the original bytes; write back only through the serializer. Every parser/serializer change needs a round-trip test.
- After a TUI layout change, build and smoke it: `bun dist/bin/envprism.mjs tui examples/`. Without a TTY, decode the ANSI dump.
- Out of scope for v0: encryption, remote secret backends, schema validation, env templating, recursive/monorepo discovery. Keep the architecture open to them; don't ship them.
- New meta files follow the kirchDev house style; `../forgemap` is the reference CLI.

## Commands

`pnpm check` is the full gate (lint, format, typecheck, test, build); `pnpm check:fix` fixes lint and format. One test: `pnpm vitest run tests/parse.test.ts` or `pnpm vitest run -t 'name'`. Everything else: `package.json`.

## Conventions

- Lint and format are oxlint and oxfmt (`.oxlintrc.json`, `.oxfmtrc.json`), not ESLint/Prettier.
- Conventional Commits with a lowercase subject, enforced by commitlint on `commit-msg`; lint-staged runs on `pre-commit`. Never `--no-verify` unless asked.
- Branch off `dev` and target PRs at `dev`. release-please on `main` versions from the commits; only `feat` and `fix` cut a release.
