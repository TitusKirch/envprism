<div align="center">

# 🔻 envprism

**One set of variables, refracted into many environment views — a TUI for managing `.env*` files side by side**

[![npm Version](https://img.shields.io/npm/v/envprism.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/envprism)
[![Downloads](https://img.shields.io/npm/dm/envprism.svg?style=flat-square&color=4f46e5)](https://www.npmjs.com/package/envprism)
[![Tests](https://img.shields.io/github/actions/workflow/status/TitusKirch/envprism/ci.yml?branch=main&style=flat-square&label=tests)](https://github.com/TitusKirch/envprism/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/bun-1.3%2B-8993be?style=flat-square)](https://bun.sh/)
[![License: MIT](https://img.shields.io/npm/l/envprism.svg?style=flat-square&color=10b981)](LICENSE)

![envprism TUI preview](.github/assets/envprism-tui.gif)

</div>

---

```bash
bunx envprism
```

That's it. Point `envprism` at a directory containing `.env*` files and it opens a side-by-side matrix view: rows are variable keys, columns are files. Differences light up, missing keys are obvious, and you can edit cells in place — comments, blank lines, and key order survive the round trip.

> [!IMPORTANT]
> `envprism` runs on **[Bun](https://bun.sh/)** 1.3+. The TUI is powered by [opentui](https://opentui.com/), which links to a native Zig core via `bun:ffi`. Node has no equivalent built-in FFI, so `npx envprism` will not work — install Bun first.

## ✨ Features

### Discovery & comparison

- **🔍 Auto-discovery** — finds every `.env*` file in the current directory (or in `--paths a b c`); skips editor swap files and backups.
- **🧮 Matrix view** — rows are the union of every variable, columns are the files; the prism metaphor, literal.
- **🎯 Smart base resolution** — `.env.example` is auto-promoted to base if present, otherwise the alphabetically-first file. Override with `--base file`.
- **🎨 Per-cell diff icons** — `≠` value differs (yellow), `✗ missing` (red), `★` extra (key not in base, yellow), `⚠` placeholder (orange) — only the icon is coloured, values stay neutral.
- **🙈 Secret masking** — keys whose name contains `TOKEN`, `SECRET`, `PASSWORD`, `KEY`, `PRIVATE`, … render as `•••• (N)`; allow-list for `PUBLIC_*` and `*_ID`.
- **🕵️ Placeholder detection** — values like `TODO`, `FIXME`, `CHANGEME`, `xxx`, `your_secret_here`, `replace_me` flag a `⚠` so you know a secret was never filled in.
- **📂 Section grouping** — comment banners like `# === Database ===` (inline or three-line block, with `=`, `-`, `~`, `*`, or `#` separators) become section dividers; `g` toggles to grouping by key prefix (`APP_*`, `DB_*`).
- **🪗 Collapsible sections** — `c` folds the focused section; section dividers show drift count (`✗ 2 missing · ≠ 3/5 drift`) so you scan the worst groups first; `Shift-C` expands all.
- **🔎 Live filter** — `/` opens a popover that filters keys by substring, with a `matching N of M` counter.
- **🛣️ Drift-only view** — `v` hides keys that already agree with the base, so only the work-to-do remains.

### Editing & write-back

- **✏️ Edit-or-add** — `e` / `Enter` opens an edit popover on any cell; if the key isn't in that file yet, save creates it. The popover renders every file's current value as context next to the input.
- **➕ Add variable** — `a` walks key + value across two prompts; the parser's `[A-Za-z_][A-Za-z0-9_]*` rule guards the key name.
- **➖ Delete variable** — `d` removes the focused key from the focused file.
- **🆕 New `.env*` file** — `n` scaffolds a new file next to the base; saved with the rest on `Ctrl-S`.
- **🔁 Sync-to-all** — `=` copies the focused cell's value into every file (create or update); `Ctrl-A` inside the edit popover applies what you're typing to every file at once.
- **🟢 Modified marker** — every cell you touch this session gets a green `●`; clears on save so unsaved local work stands out from "this file just disagrees with base".
- **↩️ Undo** — `Ctrl-Z` walks back the last 50 edits / adds / deletes.
- **💾 Save** — `Ctrl-S` writes every dirty file. **Round-trip preserving**: comments, blank lines, key order, quoting, `export ` prefixes, and inline `#` comments survive byte-for-byte — only the keys you changed are rewritten.
- **⚠️ Quit guard** — `q` asks once before quitting if you have unsaved changes; `Ctrl-C` always force-quits.

### Navigation & panes

- **🧭 Two panes** — `Tab` switches between the matrix and the files sidebar; arrow-left at the leftmost matrix column hops into the sidebar.
- **☑️ Enable / disable files** — `Space` in the sidebar drops a file out of the matrix (without deleting from disk); `b` promotes the selected file to base (auto-enables it if disabled).
- **🖱️ Mouse** — wheel scrolls the matrix in both axes; the focused cell auto-scrolls into view when you reach the viewport edge.
- **❓ Help overlay** — `?` (or `ß` for QWERTZ) opens a keybinding reference; renders as a two-column grid on wide terminals and a single scrollable column on narrow / short ones.

### CI & scripting

- **🧪 `envprism diff`** — non-interactive subcommand that prints a text drift table, JSON (`--json`), or just sets the exit code (`--check`). Drop it into a pre-commit hook or CI to fail builds that drift from `.env.example`.

## 📦 Installation

Install Bun (one-time): see [bun.sh](https://bun.sh/).

```bash
bun add -g envprism
```

Or run without installing:

```bash
bunx envprism
```

Requirements: **Bun 1.3+**.

## 🚀 Quick start

```bash
bunx envprism                      # open the TUI in the current directory
bunx envprism tui path/to/repo     # TUI scanning another directory
bunx envprism diff path/to/repo    # non-interactive drift report
bunx envprism diff --json | jq     # structured drift report
bunx envprism diff --check; echo $?  # exits 1 if any file drifts from base
```

Inside the TUI, press `?` for the full keybinding reference.

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
