<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Deferred engineering tasks

This file records intentionally deferred repository work whose prerequisites are not yet satisfied. It is not a release promise or a substitute for scoped GitHub issues. Before implementation, open a focused issue with the current technical, security, licensing, and browser-support evidence.

## Public repository and security launch gate

The following is a dated audit snapshot, not a promise that external settings cannot drift. Recheck GitHub live immediately before changing visibility, accepting public contributions, or connecting production hosting.

### Private-repository checkpoint — 2026-08-11

- The repository is private. The inspected automation token is read-only.
- GitHub Actions requires full commit SHAs and uses a selected-actions allowlist. The hardened `CI` workflow rerun passed.
- `main` requires the `verify` check from the `CI` workflow, one independent approving review, approval of the most recent reviewable push by someone other than its pusher, stale-approval dismissal, resolved conversations, and administrator enforcement. Linear history is required; force pushes and branch deletion are blocked.
- Merge commits are disabled. DCO sign-off is enabled for GitHub web commits.
- Dependency alerts and Dependabot are enabled.
- Private vulnerability reporting is unavailable while the repository remains private. Enable and verify it after public visibility is approved and before inviting public security reports; do not invent a contact address in the meantime.
- GitHub Secret Protection and Code Security are not enabled because their licensing or purchase has not been approved. Re-evaluate the features available under the chosen public-repository plan and obtain explicit owner approval before enabling a paid or separately licensed capability.

### Remaining gate

- Re-run the clean-checkout CI and local verification on the exact public candidate.
- Re-audit Actions pins and allowlist, workflow permissions, token access, branch protection, merge/DCO settings, dependency automation, security features, repository visibility, and the configured remote immediately before launch.
- Decide and document the approved secret-scanning/code-security posture. Treat an unavailable or unapproved feature as an explicit residual risk, not as enabled protection.
- Obtain explicit owner authorization before making the repository public. After visibility changes, verify public vulnerability reporting and every intended public security control before soliciting contributions.
- Keep Vercel linking, deployment, domain changes, and production promotion behind their separate approval and production-QA gates.

## Staged Vercel beta and ongoing QA checkpoint

### Owner decision — 2026-08-13

- The exhaustive 47-tool browser matrix remains the long-term QA target, but completing every row is not a hard gate for the first explicitly authorized Vercel beta.
- The initial beta gate is the focused launch-critical smoke suite defined in `docs/PRODUCTION_QA.md` and referenced by `docs/RELEASE_CHECKLIST.md`. It covers representative structural PDF, rendering/OCR, protected-PDF, visual-editor, generated-PDF preview, image-codec, privacy/network, offline-update, accessibility, metadata/header, and rollback paths.
- Every untested matrix box stays visibly unchecked. Deferring a noncritical row is neither a pass nor a waiver; it remains scheduled for ongoing testing against deployed candidates.
- A discovered privacy leak, document-integrity/corruption defect, security failure, crash, unbounded resource problem, broken offline update, or failed rollback path remains a release blocker even when its catalog row is outside the focused suite.
- This checkpoint changes QA sequencing only. It does not authorize Vercel linking, a preview or production deployment, a domain/DNS change, or public GitHub visibility; each still requires separate owner approval.

## SEO and AI-discovery launch gate

### Local foundation checkpoint — 2026-08-12

- The source catalog now generates a crawlable homepage and 47 canonical `/tools/{slug}` pages with unique metadata, visible tool facts, social cards, and structured data.
- `sitemap.xml`, `robots.txt`, `llms.txt`, and `sitemap.md` are deterministic production artifacts covered by `bun run test:seo`; no crawler SDK, analytics, backend, or secret is required.
- Search discovery is initially allowed, including `OAI-SearchBot`, while `GPTBot` is blocked. This is a deliberate source-controlled starting policy, not a permanent consent or governance promise.
- The generated output has been verified locally only. It is not evidence that the site is deployed, indexed, ranking, or approved for production.

### Remaining external gate

- After deployment and domain changes are separately authorized, verify that the apex domain, `www` decision, and Vercel hostname do not create uncontrolled duplicate indexable hosts; confirm canonical and redirect behavior on live responses.
- Confirm all 48 canonical paths return the intended status, static source content, metadata, JSON-LD, security headers, and mobile/desktop application behavior. Ensure preview deployments remain non-indexable.
- Validate and submit the production sitemap through owner-controlled Google Search Console and Bing Webmaster Tools accounts. Record verification ownership outside source; do not commit tokens or DNS secrets.
- Validate representative pages with search-engine rich-result/schema tools and social-card debuggers, then monitor coverage and crawl errors without adding document-data telemetry.
- Obtain explicit owner approval for the final AI-crawler policy, distinguishing search/discovery crawlers from model-training crawlers. Revisit `robots.txt` in a reviewed source change when policy changes.

## Restore local HEIC/HEIF input

HEIC/HEIF decoding may return to Convert to JPG only after a replacement path is demonstrably suitable for a public, local-only browser application processing untrusted files.

- Select a maintained implementation with an active security posture and explicit browser/offline support. Do not reintroduce `heic2any@0.0.4` or the audited `libheif` 1.10.x / `libde265` 1.0.2 bundle.
- Document the exact upstream project, version/commit, source and acquisition/build steps, complete dependency/native-code closure, SHA-256 hashes, licenses, notices, and redistribution obligations.
- Resolve LGPL source/relinking requirements if applicable and obtain qualified review for HEVC patent or other jurisdiction-dependent questions; do not represent unresolved questions as cleared.
- Add header/metadata preflight for dimensions, item/frame count, bit depth, orientation, and expansion before large allocations. Reject unsupported multi-image/container variants explicitly and keep central count, byte, pixel, output, and memory limits aligned with picker copy.
- Fuzz or otherwise exercise malformed and adversarial inputs, bound concurrency and cancellation, release decoder/WASM/canvas resources, and verify no input or derived content leaves the device.
- Bundle every required runtime file locally, add provenance/hash/license verification, include it in deterministic offline artifacts, and keep CSP changes minimal.
- Add success, boundary, malformed, over-limit, cancellation, repeated-run, browser-compatibility, output-integrity, offline, privacy/network, and production-artifact tests before restoring `.heic` or `.heif` to catalog claims.

## Improve DOCX symbol and dingbat mapping

Word to PDF remains a lightweight, local DOCX text-extraction workflow. Improve its handling of legacy symbol-font and dingbat characters only after a maintained, distributable mapping can be verified.

- Prefer a small first-party mapping derived from authoritative, redistribution-compatible specifications, with the source and derivation documented. Otherwise use a maintained dependency with authoritative complete license and copyright notices.
- Do not reintroduce `dingbat-to-unicode@1.0.1` unless its complete notice/provenance and maintenance/security status have been verified.
- Keep the mapping deterministic and data-only: do not execute document code, fetch external relationships/resources, load remote fonts, or weaken the existing ZIP/container and extracted-text limits.
- Add synthetic DOCX fixtures covering supported symbol fonts, mapped and unmapped characters, mixed normal/symbol runs, malformed declarations, and boundary text sizes. Unmapped characters must remain detectable rather than being silently changed to plausible but incorrect text.
- Keep the fidelity contract honest in catalog and README copy: Word to PDF extracts readable text and does not reproduce Word layout.

## Completion gate for either deferred item

A deferred capability is complete only when the catalog, accepted extensions, centralized limits, preflight, processor, structured errors, cleanup, tests, production QA matrix, README, notices, deployable license bundle, offline precache, and release checklist agree where applicable. `bun run verify` and affected production-browser QA must pass before merge. Public hosting still requires explicit release approval.
