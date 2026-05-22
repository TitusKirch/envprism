# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`envprism` is a TUI-based env file manager: it discovers `.env*` files in a directory and shows them as a matrix (rows = variable keys, columns = files) so n-way differences are visible at a glance, with inline editing that writes back to the original files preserving comment/key order.

Distributed as a CLI (`npx envprism`, `pnpm dlx envprism`). The repository is currently in **bootstrap** state — meta layer (tooling, CI, release-please) is in place; no application source code exists yet. See `TEMP_AI.md` for the original bootstrap brief (delete once the project is past bootstrap).

## Target stack

- Node **24+** (pinned via `.nvmrc`) and **pnpm 11** (pinned via `packageManager` + `.npmrc`).
- TUI framework: **[anomalyco/opentui](https://github.com/anomalyco/opentui)** is the primary candidate. Evaluate fit before writing UI code; fall back to `ink` or `blessed` if it doesn't work out.
- ESM only (`"type": "module"`).

## Commands

| Command          | What it does                                       |
| :--------------- | :------------------------------------------------- |
| `pnpm install`   | Installs deps and activates Husky hooks (prepare). |
| `pnpm lint`      | `oxlint .` with `--deny-warnings`.                 |
| `pnpm format`    | `oxfmt --check .` across JS/JSON/YAML/MD.          |
| `pnpm check`     | `lint` then `format` — the CI gate.                |
| `pnpm check:fix` | Auto-fix lint + format.                            |
| `pnpm taze`      | Interactive dependency upgrades (`-w` to write).   |

No test runner is wired up yet — when adding one, also expose it as `pnpm test` and add it to `check` / CI.

## Tooling conventions

- **Lint/format are oxc (oxlint + oxfmt), not ESLint/Prettier.** Configs: `.oxlintrc.json`, `.oxfmtrc.json`. `oxfmt` ignores `README.md`, `CHANGELOG.md`, and `pnpm-lock.yaml`.
- **Conventional Commits enforced** via `commitlint` on `commit-msg`; `lint-staged` runs `oxlint --fix` + `oxfmt` on `pre-commit`. Don't bypass with `--no-verify` unless explicitly asked.
- **Release-please** is wired up (workflow + `release-please-config.json` + `.release-please-manifest.json` at `0.0.0`). Conventional commits on `main` drive version bumps and CHANGELOG generation. `release-type: simple`, tags include `v` prefix.
- **CI** (`.github/workflows/ci.yml`) only runs `pnpm lint` + `pnpm format` on PRs (skips drafts). CodeQL runs on push/PR + weekly.
- **Dependabot**: npm weekly, GitHub Actions monthly. `taze.config.js` exists for interactive bumps.

## Working with this repo

- Match existing kirchDev house style for any new meta files — do not invent new conventions; this repo was bootstrapped from `TitusKirch/scaffold` and the README structure / SECURITY / CONTRIBUTING patterns should stay aligned with that.
- Keep PRs small and single-concern. The TUI rendering is the riskiest piece — prove the rendering approach with a read-only view before investing in edit logic.
- When writing back to `.env` files, use a custom serializer (not `dotenv`'s — it doesn't round-trip). Preserve comments and key order in the original file.
- Out of scope for v0: encryption, remote secrets backends, schema validation, env templating. Keep the architecture open to them but don't ship them.
