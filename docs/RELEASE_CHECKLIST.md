<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Release checklist

Use this checklist for private-repository maintenance, the public-source transition, and production releases. Checkboxes are evidence prompts, not standing authorization for an external action.

## Current private-repository hardening

Last verified 2026-08-11. These items describe completed GitHub settings, not public-release or production-QA approval.

Evidence: initial private commit [`a0c8c067d26a9dc4179b8d35a3c5f33bf2591254`](https://github.com/team-black-box/local-file-studio/commit/a0c8c067d26a9dc4179b8d35a3c5f33bf2591254) and successful hardened-policy [`CI` rerun](https://github.com/team-black-box/local-file-studio/actions/runs/31434123487).

- [x] Repository visibility remains private.
- [x] GitHub Actions requires full-length commit SHA references and allows selected actions only: GitHub-owned actions are allowed, other verified creators are not, and the exact approved `oven-sh/setup-bun` SHA is allowlisted.
- [x] The default workflow token is read-only and GitHub Actions cannot approve pull requests.
- [x] `main` requires the strict `verify` status check, including an up-to-date branch, one independent approval, stale-review dismissal, approval after the most recent push by someone other than the pusher, resolved conversations, and linear history. The rule applies to administrators.
- [x] Force pushes and deletion of `main` are blocked.
- [x] Merge commits are disabled; squash and rebase merges are enabled. Merged branches are deleted automatically and pull-request branches can be updated.
- [x] GitHub web commits require a DCO sign-off. Command-line contributors remain responsible for `git commit -s` under `CONTRIBUTING.md`.
- [x] Dependency alerts and Dependabot security updates are enabled.
- [x] CI was rerun successfully after the Actions and branch-rule hardening.
- [x] Current limitations are recorded: Private Vulnerability Reporting is unavailable while the repository is private, and GitHub secret scanning/code-security features remain disabled because private-repository licensing has not been authorized.

## Before any approved source update

- [ ] Review the exact intended commit file list and all ignored/untracked files.
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
- [ ] Re-audit the current Actions allowlist, read-only workflow token, strict `verify` requirement, independent-review rules, administrator enforcement, linear history, and merge restrictions; do not weaken them for publication.
- [ ] Decide how DCO sign-off will be verified for non-web commits before accepting public contributions; the current GitHub setting covers web commits only.
- [ ] Check public issue/PR forms and `SECURITY.md` without inventing a private-reporting address or response-time promise.
- [ ] Complete the [launch-critical smoke gate](PRODUCTION_QA.md#initial-vercel-beta-smoke-gate) against the exact public candidate; leave every other untested matrix box open for ongoing deployed-candidate QA.
- [ ] Review all unchecked QA rows and known defects. Do not treat deferred rows as passed or waived, and do not proceed with an unresolved privacy, integrity, security, crash, resource-bound, offline-update, or rollback blocker.
- [ ] Review README maturity, privacy, format, offline, limit, and third-party caveats against observed behavior.
- [ ] Confirm deferred capabilities in `TASKS.md` are not advertised as supported and their current user-visible limitations agree across the catalog, README, and production QA matrix.
- [ ] Obtain explicit owner approval before changing GitHub visibility.

## Immediately after an approved public visibility change

- [ ] Confirm the Actions policy, branch protection, dependency alerts, Dependabot security updates, merge settings, and administrator enforcement survived the visibility change.
- [ ] Enable GitHub Private Vulnerability Reporting and verify that `SECURITY.md` and the issue-template security route point reporters to the working private channel.
- [ ] Re-evaluate secret-scanning and code-security availability/licensing for the public repository. Obtain owner authorization and enable the approved controls, or document the approved alternative; do not claim these controls are enabled before verification.
- [ ] Verify DCO enforcement for command-line as well as web-based contributions before inviting external pull requests.
- [ ] Rerun CI on the public repository and record the successful run and settings review.

## Before an initial Vercel preview

- [ ] Link only the approved GitHub repository and Vercel team/project after explicit owner authorization.
- [ ] Confirm `main` is the production branch; non-main branches create previews only.
- [ ] Confirm the frozen Bun install, `bun run build`, and `dist/client` output are taken from `vercel.json` with no secret or backend requirement.
- [ ] Confirm preview access and indexing policy. Treat every preview URL as externally reachable unless an access control has been verified, and never use private or customer documents as fixtures.

## Before an initial Vercel beta promotion

- [ ] Complete the [launch-critical smoke gate](PRODUCTION_QA.md#initial-vercel-beta-smoke-gate) on the exact deployment candidate. Keep every remaining catalog row visible and unchecked until it is actually tested.
- [ ] Verify selected file bytes stay local using the browser network panel; inspect Cache Storage and confirm it contains only the production app shell/runtime assets.
- [ ] Verify the focused flows on desktop and mobile, including keyboard access, visible limits/errors, cancellation, repeated runs, downloads/previews, malformed input, offline reload, and storage-reset behavior. During an update, keep an old tab open and confirm a previously unopened lazy-loaded tool still works; close every old tab before checking that the new revision activates.
- [ ] Verify the inline protected-PDF gate with wrong, reader, restricted-reader, owner, empty-reader, and unsupported-security fixtures across Split PDF, one structural edit, one raster/render tool, one text-conversion tool, Repair PDF, and Add Image to PDF. Confirm generated PDFs are unlocked by default; opted-in PDFs and every PDF inside Split/Extract ZIPs use the first verified non-empty password; non-PDF tools explain why protection is unavailable; no exact source-permission cloning is claimed. Confirm credentials never enter network/log/history/storage/cache/result data and are cleared after completion, reset, and error.
- [ ] Confirm security and cache headers on HTML, hashed assets, engines, `sw.js`, `manifest.webmanifest`, and `precache-manifest.json`.
- [ ] Confirm `/` and every one of the 47 canonical `/tools/{slug}` paths return the intended static source content and application, with unique title, description, canonical URL, social metadata, and valid `WebApplication`/breadcrumb JSON-LD.
- [ ] Verify `sitemap.xml` has exactly the 48 canonical URLs and that `robots.txt`, `llms.txt`, and `sitemap.md` are reachable, accurate, source-controlled, and contain no secret or generated document data.
- [ ] Confirm preview deployments are non-indexable; verify the Vercel hostname, apex domain, and explicit `www` decision cannot create unintended duplicate indexable hosts.
- [ ] Review and approve the distinction between search/discovery and model-training crawler policy. Do not treat `llms.txt` or `robots.txt` as a guarantee that every crawler will comply.
- [ ] Render the social image, validate representative structured data and link previews, and test canonical tool paths with JavaScript enabled and disabled.
- [ ] Smoke-test the Vercel hostname before changing DNS.
- [ ] Record the candidate commit/deployment and the previous known-good rollback deployment.
- [ ] Review unresolved rows and defects. A deferred noncritical row may continue into ongoing beta QA, but an observed privacy, integrity, security, crash, unbounded-resource, offline-update, or rollback failure blocks promotion.
- [ ] Obtain explicit approval before promotion, adding `localfilestudio.app`, or changing DNS.

## Before custom-domain launch

- [ ] Confirm the initial Vercel beta smoke gate and post-promotion checks passed on the exact candidate, and that every known launch-blocking defect is closed.
- [ ] Confirm ongoing QA findings and still-untested rows are recorded without being presented as passes or hidden from the release record.
- [ ] After DNS: verify TLS, redirects, headers, manifest/service-worker scope, online processing, offline reload, and downloads on the final hostname.
- [ ] After DNS: verify owner-controlled Search Console/Bing properties and submit the canonical sitemap without committing verification tokens or DNS secrets.

## After production promotion

- [ ] Confirm the served build maps to the approved `main` commit.
- [ ] Run high-value smoke tests: Merge PDF, Compress PDF, OCR Reader, Add Image to PDF, Protect/Unlock PDF, Convert to JPG with TIFF, and one standard image workflow.
- [ ] Reload once online, then offline, and confirm the current service-worker revision installed completely.
- [ ] Monitor user reports and hosting/build health without adding document-data telemetry.
- [ ] Record final evidence, known limitations, and rollback target.
