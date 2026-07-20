# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`envprism` is a TUI-based env file manager. It discovers `.env*` files in a directory and shows them as a matrix (rows = variable keys, columns = files) so n-way differences are visible at a glance. Cells are editable in place; writes preserve comments, blank lines, and key order. There is also a non-interactive `envprism diff` subcommand for CI use.

Distributed as a Bun CLI (`bunx envprism`, `bun add -g envprism`). Node is **not** supported at runtime — opentui's native core links via `bun:ffi` and Node has no built-in equivalent.

## Stack

Mirrors `../forgemap` (the kirchDev CLI house style) but pivoted to Bun for opentui compatibility:

- **Bun 1.3+** at runtime (`engines.bun`, version pinned in `.bun-version`). **Node is unsupported at runtime** because of opentui's FFI dependency.
- **pnpm 11** for dev dependency management (`packageManager` + `pnpm-workspace.yaml`). ESM only (`"type": "module"`).
- **TypeScript strict** (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowImportingTsExtensions` with `noEmit`).
- **Vite (lib mode)** bundles to `dist/bin/envprism.mjs` (`#!/usr/bin/env bun` shebang via banner) and `dist/index.mjs`. Runtime deps are externalised in `vite.config.ts` — update `runtimeDeps` there when adding a new runtime dep, or the bundle will inline it.
- **Vitest** for unit tests (config inlined in `vite.config.ts` via `vitest/config`'s `defineConfig`). Vitest still runs under Node for the core tests; TUI tests (when added) will need Bun.
- **[opentui](https://opentui.com/)** for the TUI. Loaded behind a dynamic import in `src/commands/tui.ts` so the `diff` subcommand never reaches it — useful while opentui only runs on Bun. Tracks the upstream "debunification" effort: when opentui ships a Node FFI backend, runtime can move back to Node with mostly toolchain changes (`.bun-version` removed, shebang flipped, `engines` updated). App code against opentui's API stays unchanged. **Discipline**: no direct `Bun.*` globals or `bun:ffi` imports in app code; stick to opentui's API + Node-compatible libs so the migration back is mechanical.
- **citty** for CLI parsing, **consola** for non-TUI output, **pathe** for paths.
- **`.env` parser/serializer is custom** — `dotenv` doesn't round-trip. Round-trip (parse → serialize === original bytes) is a hard requirement so write-back preserves comments, blank lines, and key order.

## Code layout

```
src/
  bin/envprism.ts        citty runMain entry, gets the shebang banner
  cli.ts                 root command + subcommand registration
  commands/
    diff.ts              text / JSON / --check diff output
    tui.ts               default command; dynamic-imports tui/app.ts
    config/              `config` group: init / path / show / edit
  config/
    schema.ts            config types + DEFAULT_CONFIG (canonical defaults)
    define.ts            defineEnvprismConfig + types — `envprism/config` entry (RGBA-free)
    load.ts              loadEnvprismConfig: walk-up from cwd, --config / ENVPRISM_CONFIG
    resolve.ts           mergeConfig (defu + replace/extend lists), resolveHeuristics
  core/
    parse.ts             .env → EnvEntry[] (round-trippable)
    serialize.ts         EnvEntry[] → string + rebuildKvLine()
    discover.ts          glob .env* in cwd or --paths
    base.ts              base-file resolution (--base flag, .env.example, fallback)
    matrix.ts            keys × files matrix with cell states + sectionOf()
    diff.ts              drift report for `envprism diff`
    mask.ts              secret-key heuristic + value masking
    sections.ts          banner-comment → section name detection
    types.ts             EnvEntry / EnvFile / KvEntry types
  tui/
    app.ts               opentui matrix view, edit prompts, undo, help overlay
  index.ts               public library reexports
tests/                   vitest suite — 60 tests covering core/ end-to-end
examples/                .env* fixture set used to smoke the TUI / diff
```

The TUI app lives in a single file (`src/tui/app.ts`). State is one mutable `State` object with mode (`browse` / `filter` / `prompt`), focus indices, filter string, dirty set, undo stack, etc. A `refresh()` function rebuilds the whole sidebar + matrix on every state change — opentui handles diffing under the hood, so we don't memoise.

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

After `pnpm build`, smoke-test the produced binary: `bun dist/bin/envprism.mjs tui examples/` (the included `examples/` fixture set has four files with realistic drift across ~31 keys grouped into five comment-banner sections).

## TUI keybindings

| Key           | Action                                              |
| :------------ | :-------------------------------------------------- |
| `↑ ↓ ← →`     | Move focused cell                                   |
| Mouse wheel   | Scroll the matrix (X + Y)                           |
| `e` / `Enter` | Edit focused cell value                             |
| `a`           | Add a new key to the focused file (key, then value) |
| `d`           | Delete the key from the focused file                |
| `n`           | Create a new env file next to the base              |
| `Ctrl-Z`      | Undo last edit/add/delete (50-entry stack)          |
| `Ctrl-S`      | Write every dirty file to disk                      |
| `/`           | Filter keys (Esc clears, Enter keeps)               |
| `v`           | Toggle: all keys ↔ only drifting keys               |
| `g`           | Toggle: group by comment banner ↔ key prefix        |
| `?`           | Toggle keybinding overlay                           |
| `q`           | Quit (press twice if there are unsaved changes)     |
| `Ctrl-C`      | Force quit                                          |

## Tooling conventions

- **Lint/format are oxc (oxlint + oxfmt), not ESLint/Prettier.** Configs: `.oxlintrc.json`, `.oxfmtrc.json`. Both ignore `dist/` and `node_modules/`; `oxfmt` additionally skips `README.md`, `CHANGELOG.md`, `pnpm-lock.yaml`.
- **Conventional Commits enforced** via `commitlint` on `commit-msg`; `lint-staged` runs `oxlint --fix` + `oxfmt` on `pre-commit`. Don't bypass with `--no-verify` unless explicitly asked. Subject must be lowercase.
- **Release-please** is wired up (workflow + `release-please-config.json` + `.release-please-manifest.json` at `0.0.0`). Conventional commits on `main` drive version bumps. `release-type: simple`, tags include `v` prefix.
- **CI** (`.github/workflows/ci.yml`) runs `lint`/`format` + `typecheck` + `test` + `build` on PRs (skips drafts). `dev-pr.yml` opens / updates a draft PR from the `dev` branch into `main` on every push. CodeQL runs on push/PR + weekly.
- **`pnpm-workspace.yaml`** holds `allowBuilds: esbuild: true` — pnpm 11 blocks build scripts by default; vite needs esbuild's postinstall.
- **Dependabot**: npm weekly, GitHub Actions monthly. `taze.config.js` for interactive bumps.

## Working with this repo

- Match existing kirchDev house style for any new meta files. The reference for CLI structure is `../forgemap`.
- Keep PRs small and single-concern. The TUI rendering is the riskiest piece — when changing layout, smoke with `bun dist/bin/envprism.mjs tui examples/` and decode the ANSI dump if you can't run a TTY.
- When writing back to `.env` files, use the custom serializer. Preserve comments, blank lines, and key order. Round-trip tests are mandatory for any parser/serializer changes.
- Out of scope for v0: encryption, remote secrets backends, schema validation, env templating, recursive/monorepo discovery. Keep the architecture open to them but don't ship them.
- **Distribution is npm package only**, executed via Bun. No multi-platform compiled binaries (`bun build --compile`) and no self-upgrade subcommand in v0 — users install with `bun add -g envprism`. Cross-platform binary distribution can land later if it becomes worth the maintenance cost.
