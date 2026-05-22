# Security Policy

## Scope

`envprism` is a CLI / TUI tool for managing `.env` files. Because it reads and writes files that frequently contain secrets, security issues are taken seriously.

The supported version is always the **latest published release** (and the tip of `main` for unreleased fixes). Older versions are not back-patched.

## Reporting a Vulnerability

**Please do not file a public GitHub issue for security problems.**

Relevant vulnerability categories include:

- Unintended disclosure of secret values (logs, error messages, crash dumps).
- File write paths that could clobber or corrupt env files outside the expected scope.
- Dependency in `package.json` introducing a known CVE that affects users.

Use one of the following private channels:

1. **GitHub Private Vulnerability Reporting** (preferred): open a private advisory at <https://github.com/TitusKirch/envprism/security/advisories/new>.
2. **Email**: [titus.kirch@kirch.dev](mailto:titus.kirch@kirch.dev). PGP available on request.

Please include:

- A description of the vulnerability and its impact on users.
- Steps to reproduce.
- Any suggested fix, if you have one.

### What to expect

| Stage                        | Target timeline                                   |
| :--------------------------- | :------------------------------------------------ |
| Acknowledgement of report    | within **3 business days**                        |
| Initial assessment & triage  | within **7 business days**                        |
| Patch released (if accepted) | depends on severity — critical issues prioritised |
| Public disclosure & advisory | coordinated with reporter after the patch ships   |

## Credit

Reporters who follow this process responsibly are credited in the [CHANGELOG](CHANGELOG.md) and the corresponding GitHub Security Advisory, unless they prefer to remain anonymous.

---

Maintained by [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev).
