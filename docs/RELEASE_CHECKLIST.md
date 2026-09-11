<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Release checklist

Use this checklist for public-repository maintenance and production releases. Checkboxes are evidence prompts, not standing authorization for an external action.

## Current public-repository hardening

Last verified live 2026-09-11. These items describe completed GitHub settings, not public-release or production-QA approval.

Evidence: initial private commit [`a0c8c067d26a9dc4179b8d35a3c5f33bf2591254`](https://github.com/team-black-box/local-file-studio/commit/a0c8c067d26a9dc4179b8d35a3c5f33bf2591254), successful hardened-policy [`CI` rerun](https://github.com/team-black-box/local-file-studio/actions/runs/31434123487), and the 2026-09-11 live-settings audit plus successful [`CI` run 34195854847](https://github.com/team-black-box/local-file-studio/actions/runs/34195854847) and [`CodeQL` run 34535537621](https://github.com/team-black-box/local-file-studio/actions/runs/34535537621) for exact public-`main` commit `7995286a49bdbc578266c1b7e3719b6d7990ee01`.

- [x] Repository visibility is public by owner action on 2026-08-23.
- [x] GitHub Actions requires full-length commit SHA references and allows selected actions only: GitHub-owned actions are allowed, other verified creators are not, and the exact approved `oven-sh/setup-bun` SHA is allowlisted.
- [x] The default workflow token is read-only and GitHub Actions cannot approve pull requests.
- [x] `main` requires the strict `verify` status check, an up-to-date branch, one independent approval, stale-review dismissal, latest-push approval by someone other than the pusher, resolved conversations, and linear history. The rule applies to administrators.
- [x] Force pushes and deletion of `main` are blocked.
- [x] Merge commits are disabled; squash and rebase merges are enabled. Merged branches are deleted automatically and pull-request branches can be updated.
- [x] GitHub web commits require a DCO sign-off. The pull-request workflow also verifies every non-merge commit's `Signed-off-by` trailer, covering command-line contributions before merge.
- [x] Dependency alerts and Dependabot security updates are enabled.
- [x] CI was rerun successfully after the Actions and branch-rule hardening; the latest inspected `main` CI run also passed on `7995286a49bdbc578266c1b7e3719b6d7990ee01`.
- [x] Private Vulnerability Reporting, standard secret scanning, push protection, and GitHub-managed default CodeQL scanning are enabled. The default query suite covers GitHub Actions and JavaScript/TypeScript on relevant branch/pull-request events plus a weekly schedule. The 2026-09-11 live review found no open CodeQL, Dependabot, or secret-scanning alerts.

## Historical public-source candidate audit — 2026-08-13

- [x] Frozen Bun 1.2.20 install, `bun audit --json`, and `bun run verify` passed on the readiness branch. The repository audit covered 111 intended files totaling 48.71 MiB; the largest file was 4.48 MiB, below GitHub's warning and hard limits. A separate reachable-history audit found no forbidden private/generated paths, oversized blobs, private keys, or high-confidence credential patterns.
- [x] Provenance verification covered 28 fixed hashes, 13 exact license copies, 92 installed runtime packages, the vendored OCR runtime/model, SheetJS anchors, and byte-identical production notice copies. The canonical root `LICENSE` is unchanged.
- [x] The dependency audit reported no known advisory for registry packages. Bun does not audit the direct non-default-registry SheetJS tarball; its exact 0.20.3 URL, independently recorded tarball digest, installed anchor hashes, license, and production notice remain separately verified.
- [x] The 2026-08-13 live GitHub review confirmed the then-current private-iteration state: private visibility, selected-action/SHA-pinning policy, read-only workflow token, strict `verify`, no required PR reviews at that time, conversation resolution, administrator enforcement, linear history, merge restrictions, dependency alerts, and Dependabot. The current review rules are recorded above.
- [x] Public issue forms, the pull-request template, `CONTRIBUTING.md`, `SECURITY.md`, and the DCO workflow avoid invented contacts or response promises and provide a post-public Private Vulnerability Reporting path.
- [x] The production beta is live on the canonical apex, the `www` redirect is correct, all 48 sitemap URLs return the matching canonical and security headers, and exact Git-to-production mapping is recorded. This evidence does not mark remaining browser/offline QA rows as passed.
- [x] Merge the reviewed public-readiness work. PR #11, the Convert Image/search work in PR #13, and the private-iteration documentation in PR #15 are present on private `main`.
- [x] Merge the final-audit dependency/documentation change and rerun protected `verify` on the exact resulting `main` commit proposed for public visibility. PR #16 merged at `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0` after the required protected `verify` job passed.

## Current public-source launch gate — 2026-08-23

- [x] Re-audit the live private repository: visibility, Actions pins/allowlist, read-only workflow token, branch protection, merge/DCO settings, dependency alerts, Dependabot security updates, topics, and security-feature status.
- [x] Confirm protected CI passed on the current reviewed source candidate, exact private-`main` commit `eb71dd8ce1d2b279f9ead1e55f81a63286b6b8e9`.
- [x] Confirm the production beta maps to that baseline through READY deployment `dpl_AeULhE48NQyLpmxKJpSeKrctP1Gi`, with byte-identical offline artifacts and the static no-backend architecture intact.
- [x] Keep the deferred Blur Face portrait check and every other unexecuted matrix box visibly unchecked; no deferred case is recorded as a pass or waiver.
- [x] Merge the 2026-08-23 launch-preparation documentation change and confirm protected `verify` on the resulting exact `main` revision before using it as the public-visibility candidate. PR #55 merged as `e5c248cc4668854ac19ca85b6c5de4571dc1bce3`; protected run 32651454945 passed.
- [x] Restore one independent approval, stale-review dismissal, and latest-push approval by someone other than its pusher; apply the reviewed discovery topics without changing visibility.
- [x] Prove the review gate. Repository member `subramanian-elavathur` approved the latest reviewable commit in [PR #56](https://github.com/team-black-box/local-file-studio/pull/56) before merging it; protected post-merge run 32652054358 passed.
- [x] The owner changed visibility to public. Private Vulnerability Reporting was enabled, public security controls were re-audited, and exact public `main` commit `195f9c13115feb6ec736fc5cc12db8cb0ff52bc5` passed CI attempt 2 in run 32654552303.

## Current Vercel production-beta checkpoint

Last verified 2026-08-23. These boxes record owner-authorized external actions and observed deployment state; they do not mark the remaining production QA matrix complete.

- [x] The existing Team Black Box Vercel project is linked locally without committing `.vercel/`, credentials, or environment state.
- [x] Preview `dpl_J3ThWYmv3zcajRqsrfpSqgBdT6jZ` built the clean private-`main` source at `477e6dd1a90a31913de86388a3b97db817485ba4` and reached `READY`.
- [x] The exact preview artifact was promoted to production deployment `dpl_L7xc47MHdLRjNscXF1k2RRM7wMnM`; previous production `dpl_8GftPWFsxYtpBBxWpNxgQKESH224` is retained as the rollback target.
- [x] Production Vercel responses preserve the static Vite architecture, direct tool routes, security/cache headers, 48 canonical sitemap entries, 77 offline assets, and service-worker revision `00d57810cbd189ca`; no Functions or document-upload path exists.
- [x] Vercel is connected to `team-black-box/local-file-studio` and reports `main` as the production branch.
- [x] `localfilestudio.app` and `www.localfilestudio.app` are attached, with an explicit permanent redirect from `www` to the canonical apex.
- [x] The final apex serves over TLS with the committed security headers, while `www` returns a permanent `308` to the apex. The live sitemap exposes exactly 48 canonical URLs, all of which returned `200` with a matching canonical and security headers on 2026-08-13.
- [x] An authorized cofounder commit proved the Git integration: deployment `dpl_2RpBaYuDSJWvCBbQYqEAAb3JeYSa` reached `READY` from exact private-`main` commit `4f22fc0e468b72c30ed521d45d96ab598f8d00b2`.
- [x] Read-only inspection on 2026-08-14 mapped the apex to READY production deployment `dpl_7wCrLUHAhixQpbRDEDtXsskeh7PJ` from commit `050b09a56871172ad333667b30e2fba51a3fd355`, with no Vercel Functions. The 48 sitemap URLs, matching canonicals, CSP/HSTS, `www` redirect, 77-entry precache, and service-worker revision `0eeaa74b99c2ac74` passed HTTP verification.
- [x] Deploy an approved current source commit before claiming production parity. Exact merged `main` commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0` was exported without Git metadata or ignored local state, built as READY preview `dpl_3cgubPBbTCHFjnJGhEsB4wvrrCzK`, and promoted to READY production `dpl_EY92wx11fjabk3gpkacNVrAoCiMe`. The live `/tools/convert-image` metadata and service-worker revision `0d18c08aa9b66df0` match the reviewed build. Git-triggered releases authored by `abs192` remain blocked pending Vercel project access.
- [x] Current production parity was re-established from a clean archive of exact merged `main` commit `e11e52d42cd70273f3568b53289f9e31b33fee26`. READY production deployment `dpl_AeULhE48NQyLpmxKJpSeKrctP1Gi` serves the apex; the deployed service worker and 80-entry precache manifest are byte-identical to the clean build at revision `b8c58adfee8c0147`.
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
- [x] Restore and verify one independent approval, stale-review dismissal, and latest-push approval by someone other than its pusher before public visibility. The 2026-08-23 live audit also reconfirmed the Actions allowlist, read-only workflow token, strict `verify`, administrator enforcement, linear history, and merge restrictions.
- [x] Verify DCO sign-off for non-web commits: the pull-request workflow checks every non-merge commit, while the GitHub web setting covers web commits.
- [x] Check public issue/PR forms and `SECURITY.md` without inventing a private-reporting address or response-time promise.
- [ ] Review the [launch-critical smoke record](PRODUCTION_QA.md#initial-vercel-beta-smoke-gate) against the public-source candidate. Incomplete noncritical browser rows remain visible ongoing beta work; an observed privacy, integrity, security, crash, unbounded-resource, offline-update, or rollback defect remains a blocker.
- [ ] Review all unchecked QA rows and known defects. Do not treat deferred rows as passed or waived, and do not proceed with an unresolved privacy, integrity, security, crash, resource-bound, offline-update, or rollback blocker.
- [x] Review README maturity, privacy, format, offline, limit, and third-party caveats against observed behavior.
- [x] Confirm deferred capabilities in `TASKS.md` are not advertised as supported and their current user-visible limitations agree across the catalog, README, and production QA matrix.
- [x] With owner approval, update the GitHub repository homepage to `https://localfilestudio.app/` without changing visibility.
- [x] Resolve or explicitly accept the production/source version gap before announcing the public repository as the exact source of the live build. Production deployment `dpl_AeULhE48NQyLpmxKJpSeKrctP1Gi` was built from exact merged application baseline `e11e52d42cd70273f3568b53289f9e31b33fee26`; current candidate `eb71dd8ce1d2b279f9ead1e55f81a63286b6b8e9` changes only launch documentation and verification tooling, and its protected build passed.
- [x] Apply accurate discovery topics without changing visibility: `pdf`, `image-tools`, `offline-first`, `privacy`, `pwa`, `vite`, `react`, and `open-source`.
- [ ] Obtain explicit owner approval before changing GitHub visibility.

## Post-public verification

- [x] Confirm the Actions policy, branch protection, dependency alerts, Dependabot security updates, merge settings, and administrator enforcement survived the visibility change.
- [x] Enable GitHub Private Vulnerability Reporting and update `SECURITY.md` plus the issue-template security route to the working private channel.
- [x] Confirm standard secret scanning and push protection are enabled. The owner later authorized GitHub-managed default CodeQL setup; PR #59 recorded the initial alert triage, and the latest inspected public-`main` CodeQL run passed with no open alerts.
- [x] Public [PR #58](https://github.com/team-black-box/local-file-studio/pull/58) executed the DCO workflow check and verified its signed-off commit; the GitHub web-commit sign-off setting also remains enabled.
- [x] Rerun CI on the public repository: attempt 2 of run 32654552303 passed on exact `main` commit `195f9c13115feb6ec736fc5cc12db8cb0ff52bc5`.

## `v0.1.0` public-beta source release

Preparation started 2026-08-30 and was refreshed onto public `main` on 2026-09-11. A source release does not publish the package to npm, promote a Vercel deployment, change DNS, or imply that every production QA row has passed.

- [x] Set the root package version to `0.1.0` while preserving `private: true`; the root web package is not intended for npm publication.
- [x] Add a public changelog entry with shipped capabilities, privacy/offline architecture, security posture, and known beta limitations.
- [x] Reverify public visibility, homepage, merge settings, DCO, selected-actions/SHA-pinning policy, read-only workflow posture, strict protected-`main` review/check rules, dependency automation, secret scanning, push protection, Private Vulnerability Reporting, default CodeQL setup, and live open security-alert counts.
- [x] Run a frozen Bun 1.2.20 install, registry dependency audit, `bun run verify`, and release-candidate file/secret/license/provenance review. The refreshed 2026-09-11 pass left `bun.lock` unchanged, returned `{}` from `bun audit --json`, audited 141 intended files totaling 49.64 MiB with a 4.48 MiB largest file, verified 28 provenance hashes, 13 exact license copies, 92 runtime packages, all 47 catalog entries, 48 canonical pages, and 80 offline assets.
- [ ] Merge the reviewed release-preparation pull request and confirm protected `main` CI and CodeQL pass on the exact resulting commit.
- [ ] With explicit owner approval, create tag `v0.1.0` from that exact merged `main` commit and verify the remote tag target before publishing release notes.
- [ ] Publish a GitHub source release using the reviewed changelog entry. Do not attach ad hoc binaries, publish to npm, or trigger/promote Vercel as part of the source-release action.
- [ ] Record the tag, commit, GitHub Release URL, CI/CodeQL runs, open-alert counts, and any separately approved production deployment in the dated release evidence.

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

- [x] Confirm the served build maps to the approved `main` commit. The controlled source export, preview build, promotion record, live tool metadata, and service-worker revision map production deployment `dpl_EY92wx11fjabk3gpkacNVrAoCiMe` to merged `main` commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0`.
- [ ] Run high-value smoke tests: Merge PDF, Compress PDF, OCR Reader, Add Image to PDF, Protect/Unlock PDF, Convert Image with TIFF plus PNG-to-WebP, and one standard image workflow.
- [ ] Reload once online, then offline, and confirm the current service-worker revision installed completely.
- [ ] Monitor user reports and hosting/build health without adding document-data telemetry.
- [x] Record current deployment evidence, known limitations, and rollback candidates. The current record retains READY deployments `dpl_7wCrLUHAhixQpbRDEDtXsskeh7PJ` and `dpl_qt1lzjprg`; an actual rollback exercise remains open.
