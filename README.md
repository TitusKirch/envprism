<div align="center">

# 🔻 envprism

**One set of variables, refracted into many environment views — a TUI for managing `.env*` files side by side**

</div>

---

```bash
npx envprism
```

Point `envprism` at a directory containing `.env*` files and it opens a matrix view: rows are variable keys, columns are files. Differences light up, missing keys are obvious, and you can edit cells in place — with comments and ordering preserved on write-back.

## ✨ Features

- **🔍 Auto-discovery** — finds every `.env*` file in the current directory (or in `--paths a b c`).
- **🧮 Matrix view** — rows = union of all variable keys, columns = files. The prism metaphor, literal.
- **🎨 Diff highlights** — cells that differ from the leftmost column are coloured; missing keys are marked.
- **✏️ Inline edit** — `enter` on a cell opens an editor; writes preserve comments and key order in the original file.
- **🙈 Secret masking** — likely-secret values are masked by default; toggle per row.
- **🔎 Filter & search** — `/` filters rows by key substring.

## 🚀 Setup

Run without installing:

```bash
npx envprism
# or
pnpm dlx envprism
```

Or install globally:

```bash
pnpm add -g envprism
envprism
```

Requirements: Node **24+**.

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
