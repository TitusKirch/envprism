# Contributing to envprism

Thanks for taking the time to contribute! 🛠️ This document covers what you need to get a PR landed.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Reporting issues

- **Bugs**: open a [Bug report](https://github.com/TitusKirch/envprism/issues/new?template=bug_report.yml) with a minimal reproduction if at all possible.
- **Feature requests**: open a [Feature request](https://github.com/TitusKirch/envprism/issues/new?template=feature_request.yml).
- **Questions**: open a [Question](https://github.com/TitusKirch/envprism/issues/new?template=question.yml).
- **Security vulnerabilities**: **do not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- **[Bun](https://bun.sh/) 1.3+** — required at runtime (opentui's TUI uses Bun's FFI). Version is pinned in `.bun-version`.
- **pnpm 11** for dependency management.
- `git`.

Node is not required for development or use; it can still execute the built `diff` subcommand because that path doesn't touch opentui, but the TUI and the published binary are Bun-only.

Clone and install:

```bash
git clone https://github.com/TitusKirch/envprism.git
cd envprism
pnpm install   # wires husky hooks
```

## Running the suite

| Command          | What it does                                   |
| :--------------- | :--------------------------------------------- |
| `pnpm build`     | Build via vite to `dist/`.                     |
| `pnpm lint`      | oxlint across the repo.                        |
| `pnpm format`    | oxfmt check across JS / TS / JSON / YAML / MD. |
| `pnpm typecheck` | `tsc --noEmit` (strict).                       |
| `pnpm test`      | Run the vitest unit suite.                     |
| `pnpm check`     | Runs `lint`, `format`, and `typecheck`.        |
| `pnpm check:fix` | Auto-fix lint + format issues.                 |

The same commands run in CI — keep them green before you push.

## Branching & PRs

1. **Don't push directly to `main`.** Branch off `main` for every change.
2. **Conventional Commits required.** Commitlint enforces this on every commit. Examples:
   - `feat: add new GitHub workflow`
   - `fix(ci): correct pnpm cache key`
   - `docs(readme): clarify template usage steps`
   - `chore(deps): bump oxlint to 1.67`
   - Breaking changes: `feat!: ...` or include `BREAKING CHANGE:` in the body.
3. **One concern per PR.** Smaller PRs land faster.
4. **Update relevant docs.** README, CONTRIBUTING, or comments if you change a default.

## Style & quality gates

Husky runs the following on `git commit`:

- **JS / JSON / YAML / MD** → `oxlint` + `oxfmt`

If a hook fails, fix the issue and commit again. **Don't `--no-verify`** unless I explicitly ask.

> [!TIP]
> Run `pnpm check:fix` before opening a PR — saves a CI cycle.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
