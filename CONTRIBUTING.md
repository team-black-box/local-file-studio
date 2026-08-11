<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Contributing to Local File Studio

Thank you for helping improve Local File Studio. Contributions should preserve the project's offline-first privacy model: user documents stay on the device, and processing features must not introduce uploads or required server dependencies.

## Before you start

Search existing issues before starting. For a substantial feature, new file format, dependency, vendored asset, or behavior change, open an issue first so maintainers can agree on the tool contract, safety limits, licensing work, and test approach. This avoids asking contributors to invest in a direction the project cannot safely ship.

Do not attach private, customer, or production documents to an issue or pull request. Reproduce file-specific bugs with the smallest synthetic fixture possible and remove names, metadata, and other identifying content. For a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

Do not add generated binaries, trained models, fonts, codecs, or other third-party material without documented provenance, an integrity hash, and a license/notice review.

## Repository workflow

The `main` branch is protected, including for administrators. Do not push directly to it. Force pushes and branch deletion are disabled, and changes reach `main` only through a pull request. Merge commits are disabled; maintainers use squash or rebase merges to preserve linear history.

1. Create a topic branch from the current `main` branch. Do not commit generated `dist/` output.
2. Keep the change focused. Preserve the local-only processing model, central resource policies, structured errors, and cleanup paths described in [AGENTS.md](AGENTS.md).
3. Add focused automated tests for behavior and boundaries. Update user-facing limits and documentation from the same policy source.
4. Run the frozen install and full verification commands below.
5. Exercise affected tools in a production preview. Use the shared checks in [docs/PRODUCTION_QA.md](docs/PRODUCTION_QA.md) and record the relevant rows in the pull request.
6. Open a pull request with the template completed and every commit signed off for the DCO.
7. Keep the branch up to date with `main`. The strict required `verify` check must pass on the current revision, all review conversations must be resolved, and at least one independent reviewer must approve.

Pull requests should be small enough to review, explain why the behavior is safe, and include tests or documentation for user-visible changes. A passing build is necessary but does not replace manual checks for visual output, browser compatibility, offline operation, malformed input, or resource cleanup. A review becomes stale after a reviewable push, and the person who made the most recent reviewable push cannot supply the required approval for that push.

## Local setup

The validated toolchain is Bun 1.2.20 and Node.js 24.

```bash
bun install --frozen-lockfile
bun run verify
```

Before opening a pull request, confirm that the frozen install, automated tests, static production build, and offline/PWA checks succeed.

For UI or processing changes, start the production preview after `bun run verify`:

```bash
bun run preview
```

Test representative success, malformed-input, boundary, cancellation, repeated-run, and download cases. Browser developer tools must show no unexpected network transfer of selected file bytes and no new console errors. Never use sensitive files for public test evidence.

## Pull request expectations

- Link the issue when one exists and describe the user-visible contract before the implementation details.
- State which tools, formats, limits, browsers, and viewport sizes were exercised.
- Include focused automated tests and the relevant production-QA rows, or explain why they do not apply.
- Call out dependency, vendored asset, CSP, service worker, and output-format changes explicitly.
- Include reproducible provenance, SHA-256 checksums, upstream licenses, and notices for third-party or generated material.
- Pin every GitHub Action reference, including GitHub-owned actions, to a full commit SHA and explain any newly introduced action. Workflows must keep the default token read-only and must not gain pull-request creation or approval permissions.
- Keep source and documentation under Apache-2.0-compatible terms. Do not add first-party ownership headers to upstream or generated assets.
- Do not include secrets, credentials, user documents, build output, editor state, or unrelated local files.

## Developer Certificate of Origin

Local File Studio uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/) instead of a contributor license agreement. Sign off each commit to certify that you have the right to submit the contribution under the project's Apache-2.0 license:

```bash
git commit -s
```

The sign-off adds this trailer using your real name and an email address you control:

```text
Signed-off-by: Your Name <you@example.com>
```

Unless a separate written agreement applies, contributions intentionally submitted for inclusion in this project are provided under Apache-2.0 without additional terms, consistent with section 5 of the license. The DCO does not transfer your copyright.

A maintainer may ask you to amend or re-sign commits that lack a valid `Signed-off-by` trailer. When committing in GitHub's web interface, select its DCO sign-off option; when committing locally, use `git commit -s`. The current repository setting adds or requires sign-off for web commits only, so command-line contributors remain responsible for their own trailers. DCO sign-off is distinct from cryptographic Git commit signing; repository rules can require both independently.

## Review and release

Maintainers merge changes only after the branch is current with `main`, strict `verify` succeeds, review conversations are resolved, the latest reviewable push has an independent approval, DCO evidence is present, and applicable production-preview checks pass. Merging does not promise an immediate public release. The production and rollback process is documented in [docs/RELEASE_OPERATIONS.md](docs/RELEASE_OPERATIONS.md).

## Trademarks

Code contributions are governed by Apache-2.0. The Local File Studio name and logos are governed separately by [TRADEMARKS.md](TRADEMARKS.md).
