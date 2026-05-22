# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`envprism` is a TUI-based env file manager: it discovers `.env*` files in a directory and shows them as a matrix (rows = variable keys, columns = files) so n-way differences are visible at a glance, with inline editing that writes back to the original files preserving comment/key order.

Distributed as a Bun CLI (`bunx envprism`, `bun add -g envprism`). Node is **not** supported at runtime — opentui's native core links via `bun:ffi` and Node has no built-in equivalent. See `TEMP_AI.md` for the original bootstrap brief (delete once the project is past bootstrap). The detailed v0 feature plan lives at `/root/.claude/plans/purring-wishing-tiger.md`.

## Stack

Mirrors `../forgemap` (the kirchDev CLI house style) but pivoted to Bun for opentui compatibility:

- **Bun 1.3+** at runtime (`engines.bun`, version pinned in `.bun-version`). **Node is unsupported at runtime** because of opentui's FFI dependency.
- **pnpm 11** for dev dependency management (`packageManager` + `.npmrc`). ESM only (`"type": "module"`).
- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowImportingTsExtensions` with `noEmit`).
- **Vite (lib mode)** bundles to `dist/bin/envprism.mjs` (`#!/usr/bin/env bun` shebang via banner) and `dist/index.mjs`. Runtime deps are externalised in `vite.config.ts` — update `runtimeDeps` there when adding a new runtime dep, or the bundle will inline it.
- **Vitest** for unit tests (config inlined in `vite.config.ts` via `vitest/config`'s `defineConfig`). Vitest still runs under Node for the core tests; TUI tests (when added) will need Bun.
- **[opentui](https://opentui.com/)** for the TUI. Tracks the upstream "debunification" effort — when opentui ships a Node FFI backend, the runtime can move back to Node with mostly toolchain changes (`.bun-version` removed, shebang flipped, `engines` updated). App code against opentui's API stays unchanged. **Discipline**: no direct `Bun.*` globals or `bun:ffi` imports in app code; stick to opentui's API + Node-compatible libs so the migration back is mechanical.
- **citty** for CLI parsing, **consola** for non-TUI output, **pathe** for paths.
- **`.env` parser/serializer is custom** — `dotenv` doesn't round-trip. Round-trip (parse → serialize === original bytes) is a hard requirement so write-back preserves comments, blank lines, and key order.

## Commands

| Command           | What it does                                              |
| :---------------- | :-------------------------------------------------------- |
| `pnpm install`    | Installs deps and activates Husky hooks (`prepare`).      |
| `pnpm build`      | `vite build` → emits `dist/bin/envprism.mjs` and bundles. |
| `pnpm dev`        | `vite build --watch`.                                     |
| `pnpm lint`       | `oxlint . --deny-warnings`.                               |
| `pnpm format`     | `oxfmt --check .` across JS/TS/JSON/YAML/MD.              |
| `pnpm typecheck`  | `tsc --noEmit` (strict).                                  |
| `pnpm test`       | `vitest run --passWithNoTests`.                           |
| `pnpm test:watch` | `vitest` watch mode.                                      |
| `pnpm check`      | `lint && format && typecheck` — the local gate.           |
| `pnpm check:fix`  | Auto-fix lint + format.                                   |
| `pnpm taze[:w]`   | Interactive dependency upgrades.                          |

Run a single test file: `pnpm vitest run tests/parse.test.ts`. Single test name: `pnpm vitest run -t 'key substring'`.

## Tooling conventions

- **Lint/format are oxc (oxlint + oxfmt), not ESLint/Prettier.** Configs: `.oxlintrc.json`, `.oxfmtrc.json`. Both ignore `dist/` and `node_modules/`; `oxfmt` additionally skips `README.md`, `CHANGELOG.md`, `pnpm-lock.yaml`.
- **Conventional Commits enforced** via `commitlint` on `commit-msg`; `lint-staged` runs `oxlint --fix` + `oxfmt` on `pre-commit`. Don't bypass with `--no-verify` unless explicitly asked.
- **Release-please** is wired up (workflow + `release-please-config.json` + `.release-please-manifest.json` at `0.0.0`). Conventional commits on `main` drive version bumps. `release-type: simple`, tags include `v` prefix.
- **CI** (`.github/workflows/ci.yml`) runs `lint`/`format` + `typecheck` + `test` + `build` on PRs (skips drafts). CodeQL runs on push/PR + weekly.
- **`pnpm-workspace.yaml`** holds `allowBuilds: esbuild: true` — pnpm 11 blocks build scripts by default; vite needs esbuild's postinstall.
- **Dependabot**: npm weekly, GitHub Actions monthly. `taze.config.js` for interactive bumps.

## Working with this repo

- Match existing kirchDev house style for any new meta files. The reference for CLI structure (`src/bin/*`, `src/cli.ts`, `src/commands/*`, `src/config/define.ts`, `src/index.ts`) is `../forgemap`.
- Keep PRs small and single-concern. The TUI rendering is the riskiest piece — prove the read-only render before investing in editing logic.
- When writing back to `.env` files, use the custom serializer. Preserve comments, blank lines, and key order. Round-trip tests are mandatory.
- Out of scope for v0: encryption, remote secrets backends, schema validation, env templating, recursive/monorepo discovery. Keep the architecture open to them but don't ship them.
- **Distribution is npm package only**, executed via Bun. No multi-platform compiled binaries (`bun build --compile`) and no self-upgrade subcommand in v0 — users install with `bun add -g envprism`. Cross-platform binary distribution can land later if it becomes worth the maintenance cost.
