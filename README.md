<div align="center">

# 🔻 envprism

**One set of variables, refracted into many environment views — a TUI for managing `.env*` files side by side**

</div>

---

```bash
bunx envprism
```

Point `envprism` at a directory containing `.env*` files and it opens a matrix view: rows are variable keys, columns are files. Differences light up, missing keys are obvious, and you can edit cells in place — with comments and ordering preserved on write-back.

> [!IMPORTANT]
> `envprism` runs on **[Bun](https://bun.sh/)** 1.3+. The TUI is powered by [opentui](https://opentui.com/), which links to a native Zig core via `bun:ffi`. Node has no equivalent built-in FFI, so `npx envprism` will not work — install Bun first.

## ✨ Features

- **🔍 Auto-discovery** — finds every `.env*` file in the current directory (or in `--paths a b c`).
- **🧮 Matrix view** — rows = union of all variable keys, columns = files. The prism metaphor, literal.
- **🎨 Diff highlights** — `≠ differs` (yellow), `✗ missing` (red), `★ extra` (purple), in-sync (neutral).
- **✏️ Inline edit** — `e` or `Enter` on a cell opens an editor; writes preserve comments, blank lines, and key order in the original file.
- **➕ Add / delete / new file** — `a` adds a variable to the focused file, `d` removes it, `n` scaffolds a new `.env.*` next to the base.
- **↩️ Undo** — `Ctrl-Z` walks back the last 50 edits.
- **🙈 Secret masking** — keys with `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, `PRIVATE`, … render as `•••• (N)` so values don't appear over your shoulder.
- **📂 Grouping** — comment banners like `# === Database ===` become section dividers in the TUI; `g` toggles to grouping by key prefix (`APP_*`, `DB_*`, `FEATURE_*`).
- **🔎 Filter & view** — `/` filters keys live; `v` toggles to a drift-only view that hides keys already in sync.
- **🧪 CI mode** — `envprism diff` prints a text or JSON drift report; `--check` exits non-zero when any file diverges.

## 📺 What it looks like

```
╭─ Files (4) ────────────────╮╭─ Matrix · 31 keys ─────────────────────────────╮
│  ★▸ .env.example           ││  KEY                   .env.example      .env  │
│     .env                   ││  ─────────────── Application ───────────────── │
│     .env.production        ││  APP_NAME              envprism          envpr │
│     .env.staging           ││  APP_ENV               development       devel │
│                            ││  APP_URL               http://localhos…  ≠ htt │
│                            ││  PORT                  3000              ≠ 300 │
│                            ││  LOG_LEVEL             info              ≠ deb │
│                            ││  TZ                    UTC               ≠ Eur │
│                            ││  ─────────────── Database ──────────────────── │
│                            ││  DATABASE_URL          postgres://loca…  ≠ pos │
│                            ││  DATABASE_POOL_SIZE    10                ≠ 5   │
│                            ││  DATABASE_SSL          false             false │
│                            ││  REDIS_URL             redis://localho…  redis │
│                            ││  REDIS_DB              0                 ≠ 1   │
│                            ││  ───────── Auth / Secrets — fill in… ───────── │
│                            ││  SECRET_KEY            ••••              ≠ ••• │
│                            ││  API_TOKEN             ••••              ≠ ••• │
│                            ││  JWT_PRIVATE_KEY       ••••              ≠ ••• │
╰────────────────────────────╯╰────────────────────────────────────────────────╯
 ↑↓←→ move · e edit · a add · d del · n new · ^Z undo · ^S save · / filter · ? help · q quit
 v view: all · g group: banner
```

`envprism diff` (non-interactive, CI-friendly):

```text
$ envprism diff examples/
Base: .env.example  (vs. .env, .env.production, .env.staging)

KEY                  .env             .env.production  .env.staging
API_TOKEN            ≠ differs        ≠ differs        ≠ differs
DEBUG                ★ extra          ✗ missing        ✗ missing
FEATURE_NEW_UI       ≠ differs        ✗ missing        ≠ differs
PORT                 ≠ differs        — same           — same
…

8 key(s) differ across 3 file(s) (21 cell drift).
```

```bash
envprism diff --json | jq          # structured drift report
envprism diff --check; echo $?     # 1 if any file drifts, 0 otherwise
```

## 🚀 Setup

Install Bun (one-time): see [bun.sh](https://bun.sh/).

Run without installing envprism:

```bash
bunx envprism                      # TUI in the current directory
bunx envprism tui path/to/repo     # TUI scanning another directory
bunx envprism diff path/to/repo    # non-interactive drift report
```

Or install globally:

```bash
bun add -g envprism
envprism
```

Requirements: **Bun 1.3+**.

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
