<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Release checklist

Use this checklist for the first repository push, the public-source transition, and production releases. Checkboxes are evidence prompts, not standing authorization for an external action.

## Before the first approved private push

- [ ] Review the exact first-commit file list and all ignored/untracked files.
- [ ] Exclude local documents, screenshots, design-QA artifacts, editor state, logs, credentials, `.vercel/`, build output, and unrelated user work.
- [ ] Confirm no committed file exceeds GitHub's per-file limit and review the repository's largest assets intentionally.
- [ ] Confirm the configured remote is the approved `team-black-box/local-file-studio` repository and no push URL differs unexpectedly.
- [ ] Run `bun install --frozen-lockfile` from committed inputs only.
- [ ] Run `bun run verify`; confirm tests, production build, vendored-asset hashes, and offline/PWA checks pass.
- [ ] Run dependency vulnerability, secret, license, SPDX, notice, and repository-hygiene checks; record tool versions and results.
- [ ] Confirm `dist/client` can be recreated without an ignored local dependency and that it contains no user files or secrets.
- [ ] Review `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, `SECURITY.md`, `AGENTS.md`, package metadata, CI, and `vercel.json` together.
- [ ] Obtain explicit approval before staging, committing, or pushing.

## Before making the repository public

- [ ] Close every unresolved redistribution blocker for bundled packages, OCR WASM/native libraries, English OCR data, SheetJS, fonts, images, and generated/vendored assets.
- [ ] Ensure exact upstream licenses, notices, versions, source URLs, SHA-256 hashes, and reproducible acquisition/build notes are committed where applicable.
- [ ] Separate verified copyright/license facts from unresolved legal or patent risk; obtain qualified counsel for unresolved questions rather than representing them as cleared.
- [ ] Confirm the canonical Apache-2.0 `LICENSE` is unchanged and third-party/generated assets do not claim first-party ownership.
- [ ] Configure `main` branch rules, required `CI / verify`, review requirements, DCO enforcement, secret scanning, and dependency alerts.
- [ ] Check public issue/PR forms and `SECURITY.md` without inventing a private-reporting address or response-time promise.
- [ ] Run the full [production QA matrix](PRODUCTION_QA.md) against the exact public candidate in supported browsers.
- [ ] Review README maturity, privacy, format, offline, limit, and third-party caveats against observed behavior.
- [ ] Confirm deferred capabilities in `TASKS.md` are not advertised as supported and their current user-visible limitations agree across the catalog, README, and production QA matrix.
- [ ] Obtain explicit owner approval before changing GitHub visibility.

## Before Vercel production and domain launch

- [ ] Link only the approved GitHub repository and Vercel team/project after explicit owner authorization.
- [ ] Confirm `main` is the production branch; non-main branches create previews only.
- [ ] Confirm the frozen Bun install, `bun run build`, and `dist/client` output are taken from `vercel.json` with no secret or backend requirement.
- [ ] Complete all 47 catalog rows in [PRODUCTION_QA.md](PRODUCTION_QA.md) on the exact Vercel candidate and record exceptions as launch blockers.
- [ ] Verify selected file bytes stay local using the browser network panel; inspect Cache Storage and confirm it contains only the production app shell/runtime assets.
- [ ] Verify desktop and mobile accessibility, limits/errors, cancellation, repeated runs, downloads, malformed input, offline reload, and storage-reset behavior. During an update, keep an old tab open and confirm a previously unopened lazy-loaded tool still works; close every old tab before checking that the new revision activates.
- [ ] Confirm security and cache headers on HTML, hashed assets, engines, `sw.js`, `manifest.webmanifest`, and `precache-manifest.json`.
- [ ] Smoke-test the Vercel hostname before changing DNS.
- [ ] Record the candidate commit/deployment and the previous known-good rollback deployment.
- [ ] Obtain explicit approval before promotion, adding `localfilestudio.app`, or changing DNS.
- [ ] After DNS: verify TLS, redirects, headers, manifest/service-worker scope, online processing, offline reload, and downloads on the final hostname.

## After production promotion

- [ ] Confirm the served build maps to the approved `main` commit.
- [ ] Run high-value smoke tests: Merge PDF, Compress PDF, OCR PDF, Add Image to PDF, Protect/Unlock PDF, Convert to JPG with TIFF, and one standard image workflow.
- [ ] Reload once online, then offline, and confirm the current service-worker revision installed completely.
- [ ] Monitor user reports and hosting/build health without adding document-data telemetry.
- [ ] Record final evidence, known limitations, and rollback target.
