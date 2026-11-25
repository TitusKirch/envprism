# Contributing to envprism

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting issues

- **Bugs**: a [Bug report](https://github.com/TitusKirch/envprism/issues/new?template=bug_report.yml) with a minimal reproduction.
- **Feature requests**: a [Feature request](https://github.com/TitusKirch/envprism/issues/new?template=feature_request.yml).
- **Questions, ideas, possible bugs**: the [Discord forum](https://discord.kirch.dev/).
- **Security vulnerabilities**: never a public issue — see [SECURITY.md](SECURITY.md).

## Development setup

Needs [Bun](https://bun.sh/) (version in `.bun-version`), pnpm (version in `package.json` → `packageManager`) and `git`.

```bash
git clone https://github.com/TitusKirch/envprism.git
cd envprism
pnpm install   # also wires the husky hooks
```

`pnpm check` runs lint, format, typecheck, tests and build — the same gate CI runs. `pnpm check:fix` fixes lint and format. All scripts are in `package.json`.

## Branching & PRs

1. Branch off `dev` and open the PR against `dev`. Never push to `main`.
2. Conventional Commits, enforced by commitlint. Breaking changes: `feat!:` or a `BREAKING CHANGE:` footer.
3. One concern per PR.
4. Changing a default or a keybinding? Update the README too.

## Hooks

Husky runs oxlint and oxfmt on staged files at `pre-commit` and commitlint at `commit-msg`. If a hook fails, fix it and commit again — no `--no-verify`.

## AI agents

Agent rules live in [AGENTS.md](AGENTS.md). Claude Code reads it directly from v2.1.277 on, as long as no `CLAUDE.md` or `CLAUDE.local.md` sits in the working directory or above it.

## License

Contributions are licensed under the [MIT License](LICENSE).
