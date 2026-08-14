<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Release checklist

Use this checklist for private-repository maintenance, the public-source transition, and production releases. Checkboxes are evidence prompts, not standing authorization for an external action.

## Current private-repository hardening

Last verified live 2026-08-14. These items describe completed GitHub settings, not public-release or production-QA approval.

Evidence: initial private commit [`a0c8c067d26a9dc4179b8d35a3c5f33bf2591254`](https://github.com/team-black-box/local-file-studio/commit/a0c8c067d26a9dc4179b8d35a3c5f33bf2591254) and successful hardened-policy [`CI` rerun](https://github.com/team-black-box/local-file-studio/actions/runs/31434123487).

- [x] Repository visibility remains private.
- [x] GitHub Actions requires full-length commit SHA references and allows selected actions only: GitHub-owned actions are allowed, other verified creators are not, and the exact approved `oven-sh/setup-bun` SHA is allowlisted.
- [x] The default workflow token is read-only and GitHub Actions cannot approve pull requests.
- [x] `main` requires the strict `verify` status check, an up-to-date branch, resolved conversations, and linear history. The rule applies to administrators. Required approvals, stale-review dismissal, and last-push approval were temporarily removed on 2026-08-14 for private iteration.
- [x] Force pushes and deletion of `main` are blocked.
- [x] Merge commits are disabled; squash and rebase merges are enabled. Merged branches are deleted automatically and pull-request branches can be updated.
- [x] GitHub web commits require a DCO sign-off. The pull-request workflow also verifies every non-merge commit's `Signed-off-by` trailer, covering command-line contributions before merge.
- [x] Dependency alerts and Dependabot security updates are enabled.
- [x] CI was rerun successfully after the Actions and branch-rule hardening.
- [x] Current limitations are recorded: Private Vulnerability Reporting is unavailable while the repository is private, and GitHub secret scanning/code-security features remain disabled because private-repository licensing has not been authorized.

## Public-source candidate audit — 2026-08-13

- [x] Frozen Bun 1.2.20 install, `bun audit --json`, and `bun run verify` passed on the readiness branch. The repository audit covered 111 intended files totaling 48.71 MiB; the largest file was 4.48 MiB, below GitHub's warning and hard limits. A separate reachable-history audit found no forbidden private/generated paths, oversized blobs, private keys, or high-confidence credential patterns.
- [x] Provenance verification covered 28 fixed hashes, 13 exact license copies, 92 installed runtime packages, the vendored OCR runtime/model, SheetJS anchors, and byte-identical production notice copies. The canonical root `LICENSE` is unchanged.
- [x] The dependency audit reported no known advisory for registry packages. Bun does not audit the direct non-default-registry SheetJS tarball; its exact 0.20.3 URL, independently recorded tarball digest, installed anchor hashes, license, and production notice remain separately verified.
- [x] Live GitHub review confirmed private visibility, the selected-action/SHA-pinning policy, read-only workflow token, strict `verify`, no required PR reviews, conversation resolution, administrator enforcement, linear history, merge restrictions, dependency alerts, and Dependabot.
- [x] Public issue forms, the pull-request template, `CONTRIBUTING.md`, `SECURITY.md`, and the DCO workflow avoid invented contacts or response promises and provide a post-public Private Vulnerability Reporting path.
- [x] The production beta is live on the canonical apex, the `www` redirect is correct, all 48 sitemap URLs return the matching canonical and security headers, and exact Git-to-production mapping is recorded. This evidence does not mark remaining browser/offline QA rows as passed.
- [x] Merge the reviewed public-readiness work. PR #11, the Convert Image/search work in PR #13, and the private-iteration documentation in PR #15 are present on private `main`.
- [ ] Merge the final-audit dependency/documentation change and rerun protected `verify` on the exact resulting `main` commit proposed for public visibility. The local audit branch passed frozen install, a clean advisory audit, full verification, and deterministic notice generation; protected clean-checkout CI remains the authoritative post-merge evidence.
- [ ] Obtain explicit owner approval for the visibility change. Immediately afterward, enable and test Private Vulnerability Reporting and re-audit every mutable repository control before inviting contributions.

## Current Vercel production-beta checkpoint

Last verified 2026-08-14. These boxes record owner-authorized external actions and observed deployment state; they do not mark the remaining production QA matrix complete.

- [x] The existing Team Black Box Vercel project is linked locally without committing `.vercel/`, credentials, or environment state.
- [x] Preview `dpl_J3ThWYmv3zcajRqsrfpSqgBdT6jZ` built the clean private-`main` source at `477e6dd1a90a31913de86388a3b97db817485ba4` and reached `READY`.
- [x] The exact preview artifact was promoted to production deployment `dpl_L7xc47MHdLRjNscXF1k2RRM7wMnM`; previous production `dpl_8GftPWFsxYtpBBxWpNxgQKESH224` is retained as the rollback target.
- [x] Production Vercel responses preserve the static Vite architecture, direct tool routes, security/cache headers, 48 canonical sitemap entries, 77 offline assets, and service-worker revision `00d57810cbd189ca`; no Functions or document-upload path exists.
- [x] Vercel is connected to `team-black-box/local-file-studio` and reports `main` as the production branch.
- [x] `localfilestudio.app` and `www.localfilestudio.app` are attached, with an explicit permanent redirect from `www` to the canonical apex.
- [x] The final apex serves over TLS with the committed security headers, while `www` returns a permanent `308` to the apex. The live sitemap exposes exactly 48 canonical URLs, all of which returned `200` with a matching canonical and security headers on 2026-08-13.
- [x] An authorized cofounder commit proved the Git integration: deployment `dpl_2RpBaYuDSJWvCBbQYqEAAb3JeYSa` reached `READY` from exact private-`main` commit `4f22fc0e468b72c30ed521d45d96ab598f8d00b2`.
- [x] Read-only inspection on 2026-08-14 mapped the apex to READY production deployment `dpl_7wCrLUHAhixQpbRDEDtXsskeh7PJ` from commit `050b09a56871172ad333667b30e2fba51a3fd355`, with no Vercel Functions. The 48 sitemap URLs, matching canonicals, CSP/HSTS, `www` redirect, 77-entry precache, and service-worker revision `0eeaa74b99c2ac74` passed HTTP verification.
- [ ] Deploy an approved current source commit before claiming production parity. Git deployments for `31eee8320244d1067f09d3f660868659848b661d` and `6d9dcf35b567eeb8b3f720532a001211866a503b` are `BLOCKED` because Git author `abs192` lacks Vercel project access; the live `/tools/convert-image` path therefore still returns homepage metadata while the older `/tools/convert-to-jpg` path remains deployed.
- [ ] Exercise the current custom-domain offline reload, two-build service-worker update, and rollback procedure. READY deployment `dpl_qt1lzjprg` from commit `4f22fc0e468b72c30ed521d45d96ab598f8d00b2` is a confirmed previous artifact, but availability alone is not an exercised rollback.
- [ ] Continue every unchecked launch-critical and catalog QA row against deployed candidates; do not present an untested row as passed.

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

- [x] Close every unresolved redistribution blocker for bundled packages, OCR WASM/native libraries, English OCR data, SheetJS, fonts, images, and generated/vendored assets.
- [x] Ensure exact upstream licenses, notices, versions, source URLs, SHA-256 hashes, and reproducible acquisition/build notes are committed where applicable.
- [x] Separate verified copyright/license facts from unresolved legal or patent risk; obtain qualified counsel for unresolved questions rather than representing them as cleared.
- [x] Confirm the canonical Apache-2.0 `LICENSE` is unchanged and third-party/generated assets do not claim first-party ownership.
- [ ] Restore and verify one independent approval, stale-review dismissal, and last-push approval by someone other than its pusher before public visibility. Re-audit the Actions allowlist, read-only workflow token, strict `verify`, administrator enforcement, linear history, and merge restrictions at the same time.
- [x] Verify DCO sign-off for non-web commits: the pull-request workflow checks every non-merge commit, while the GitHub web setting covers web commits.
- [x] Check public issue/PR forms and `SECURITY.md` without inventing a private-reporting address or response-time promise.
- [ ] Review the [launch-critical smoke record](PRODUCTION_QA.md#initial-vercel-beta-smoke-gate) against the public-source candidate. Incomplete noncritical browser rows remain visible ongoing beta work; an observed privacy, integrity, security, crash, unbounded-resource, offline-update, or rollback defect remains a blocker.
- [ ] Review all unchecked QA rows and known defects. Do not treat deferred rows as passed or waived, and do not proceed with an unresolved privacy, integrity, security, crash, resource-bound, offline-update, or rollback blocker.
- [x] Review README maturity, privacy, format, offline, limit, and third-party caveats against observed behavior.
- [x] Confirm deferred capabilities in `TASKS.md` are not advertised as supported and their current user-visible limitations agree across the catalog, README, and production QA matrix.
- [x] With owner approval, update the GitHub repository homepage to `https://localfilestudio.app/` without changing visibility.
- [ ] Resolve or explicitly accept the production/source version gap before announcing the public repository as the exact source of the live build. The 2026-08-14 production deployment predates Convert Image and the latest documentation changes.
- [ ] Choose accurate discovery topics without changing visibility.
- [ ] Obtain explicit owner approval before changing GitHub visibility.

## Immediately after an approved public visibility change

- [ ] Confirm the Actions policy, branch protection, dependency alerts, Dependabot security updates, merge settings, and administrator enforcement survived the visibility change.
- [ ] Enable GitHub Private Vulnerability Reporting and verify that `SECURITY.md` and the issue-template security route point reporters to the working private channel.
- [ ] Re-evaluate secret-scanning and code-security availability/licensing for the public repository. Obtain owner authorization and enable the approved controls, or document the approved alternative; do not claim these controls are enabled before verification.
- [ ] Re-run the DCO check on a public pull request and confirm web sign-off remains enabled before inviting external contributions.
- [ ] Rerun CI on the public repository and record the successful run and settings review.

## Before an initial Vercel preview

- [x] Link only the approved GitHub repository and Vercel team/project after explicit owner authorization.
- [x] Confirm `main` is the production branch; non-main branches create previews only.
- [x] Confirm the frozen Bun install, `bun run build`, and `dist/client` output are taken from `vercel.json` with no secret or backend requirement.
- [x] Confirm preview access and indexing policy. Treat every preview URL as externally reachable unless an access control has been verified, and never use private or customer documents as fixtures.

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
- [x] Smoke-test the Vercel hostname before changing DNS.
- [x] Record the candidate commit/deployment and the previous known-good rollback deployment.
- [ ] Review unresolved rows and defects. A deferred noncritical row may continue into ongoing beta QA, but an observed privacy, integrity, security, crash, unbounded-resource, offline-update, or rollback failure blocks promotion.
- [x] Obtain explicit approval before promotion, adding `localfilestudio.app`, or changing DNS.

## Custom-domain follow-up

- [ ] Confirm the initial Vercel beta smoke gate and post-promotion checks passed on the exact candidate, and that every known launch-blocking defect is closed.
- [ ] Confirm ongoing QA findings and still-untested rows are recorded without being presented as passes or hidden from the release record.
- [x] After DNS: verify TLS, apex status, the `www` redirect, canonical URLs, and committed security headers on the final hostname.
- [ ] Verify manifest/service-worker scope, online processing, offline reload, downloads, and the two-build update path on the final hostname.
- [ ] After DNS: verify owner-controlled Search Console/Bing properties and submit the canonical sitemap without committing verification tokens or DNS secrets.

## After production promotion

- [ ] Confirm the served build maps to the approved `main` commit.
- [ ] Run high-value smoke tests: Merge PDF, Compress PDF, OCR Reader, Add Image to PDF, Protect/Unlock PDF, Convert Image with TIFF plus PNG-to-WebP, and one standard image workflow.
- [ ] Reload once online, then offline, and confirm the current service-worker revision installed completely.
- [ ] Monitor user reports and hosting/build health without adding document-data telemetry.
- [ ] Record final evidence, known limitations, and rollback target.
