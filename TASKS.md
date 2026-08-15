<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Deferred engineering tasks

This file records intentionally deferred repository work whose prerequisites are not yet satisfied. It is not a release promise or a substitute for scoped GitHub issues. Before implementation, open a focused issue with the current technical, security, licensing, and browser-support evidence.

## Public repository and security launch gate

The following is a dated audit snapshot, not a promise that external settings cannot drift. Recheck GitHub live immediately before changing visibility, accepting public contributions, or connecting production hosting.

### Private-repository checkpoint — 2026-08-14

- The repository is private. The configured remote remains `https://github.com/team-black-box/local-file-studio.git` and the inspected workflow token defaults remain read-only.
- GitHub Actions requires full commit SHAs and uses a selected-actions allowlist. The hardened `CI` workflow rerun passed.
- `main` requires the strict `verify` check from the `CI` workflow, resolved conversations, and administrator enforcement. Linear history is required; force pushes and branch deletion are blocked. The owner temporarily removed required approvals, stale-review dismissal, and last-push approval on 2026-08-14 to reduce private-iteration friction.
- Merge commits are disabled. DCO sign-off is enabled for GitHub web commits, and the pull-request workflow verifies every non-merge commit's `Signed-off-by` trailer.
- The GitHub repository homepage now uses the canonical `https://localfilestudio.app` URL rather than the legacy Vercel hostname.
- Dependency alerts and Dependabot are enabled.
- Private vulnerability reporting is unavailable while the repository remains private. Enable and verify it after public visibility is approved and before inviting public security reports; do not invent a contact address in the meantime.
- GitHub Secret Protection and Code Security are not enabled because their licensing or purchase has not been approved. Re-evaluate the features available under the chosen public-repository plan and obtain explicit owner approval before enabling a paid or separately licensed capability.

### Remaining public-source gate

- The reviewed public-readiness work in PR #11, Convert Image/search work in PR #13, private-iteration controls in PR #15, and final audit in PR #16 are merged. The protected clean-checkout `verify` job passed on the exact final-audit change before it merged as private `main` commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0`.
- Re-audit Actions pins and allowlist, workflow permissions, token access, branch protection, merge/DCO settings, dependency automation, security features, repository visibility, and the configured remote immediately before launch.
- Before public visibility, restore one independent approval, stale-review dismissal, and approval of the latest reviewable push by someone other than its pusher; verify the restored rule with a test pull request.
- Choose a small accurate public topic set before visibility changes; do not change visibility as a side effect.
- Decide and document the approved secret-scanning/code-security posture. Treat an unavailable or unapproved feature as an explicit residual risk, not as enabled protection.
- Obtain explicit owner authorization before making the repository public. After visibility changes, verify public vulnerability reporting and every intended public security control before soliciting contributions.
- Keep the live Vercel beta operationally separate from the still-private source repository. Public visibility, later production promotions, and security-setting changes continue to require their own current approval and verification.

## Staged Vercel beta and ongoing QA checkpoint

### Owner decision — 2026-08-13

- The exhaustive 47-tool browser matrix remains the long-term QA target, but completing every row is not a hard gate for the first explicitly authorized Vercel beta.
- The initial beta gate is the focused launch-critical smoke suite defined in `docs/PRODUCTION_QA.md` and referenced by `docs/RELEASE_CHECKLIST.md`. It covers representative structural PDF, rendering/OCR, protected-PDF, visual-editor, generated-PDF preview, image-codec, privacy/network, offline-update, accessibility, metadata/header, and rollback paths.
- Every untested matrix box stays visibly unchecked. Deferring a noncritical row is neither a pass nor a waiver; it remains scheduled for ongoing testing against deployed candidates.
- A discovered privacy leak, document-integrity/corruption defect, security failure, crash, unbounded resource problem, broken offline update, or failed rollback path remains a release blocker even when its catalog row is outside the focused suite.
- This checkpoint changes QA sequencing only. It does not authorize Vercel linking, a preview or production deployment, a domain/DNS change, or public GitHub visibility; each still requires separate owner approval.

### Local candidate checkpoint — 2026-08-13

- Private `main` commit `1ee9f2f2e84912be89a72f12d3e551c4e165680f` passed a frozen install, clean dependency audit, full repository verification, and a focused local production-browser smoke using synthetic fixtures.
- The local smoke exercised Merge, Split, Compress, OCR Reader, JPG to PDF, Add Image to PDF, Protect/Unlock PDF, and Convert to JPG. It also proved one direct Split PDF route could reload and process successfully from the installed service worker while the local server was stopped.
- Detailed evidence and limitations are recorded in `docs/PRODUCTION_QA.md`. No deployment-dependent smoke checkbox was closed: Vercel headers/non-indexing, preserved network and Cache Storage evidence, broader browser/device coverage, independent browser-download inspection, the two-build update path, and a real rollback target remain open.
- The production preview is available locally at `http://127.0.0.1:4200/` for review. This remains local evidence and does not authorize or imply a Vercel deployment.

### Final public-launch audit — merged 2026-08-14

- PR #16 merged the final audit into private `main` at commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0`. The audit found a new high-severity advisory against PostCSS's locked `nanoid@3.3.17`; the merged change moves build-only PostCSS to exact `8.5.26` and constrains build-only Nano ID to exact patched `3.3.18`, while DOCX retains its separate compatible `nanoid@5.1.16` copy.
- Bun 1.2.20 completed a frozen install and `bun audit --json` returned `{}`. The merged change adds that registry advisory audit as a separate CI step while keeping deterministic `bun run verify` independent of network access; the direct SheetJS tarball remains covered by its separate pinned provenance checks. `bun run verify` passed: the reachable-history and intended-file audits, exact 47-tool QA coverage, 14 OCR assets plus two sidecars, 28 provenance hashes, 13 exact license copies, 92 runtime package notices, 32 limits/search/converter tests, 17 editor/result tests, nine protected-PDF tests, 12 DOCX tests, three PPTX tests, the production build, 47 tool pages plus the homepage, 77 offline assets, and source/production notice parity. The protected `CI` workflow's required `verify` job also passed on the reviewed PR before merge.
- A production-style local browser smoke opened `/tools/convert-image`, accepted the committed 192 × 192 first-party PNG fixture, and created a 2.8 KB WebP from the 36 KB input without a captured warning or error. This proves one normal PNG-to-WebP path only; the broader animation, TIFF, privacy-panel, offline, repeat/reset, malformed-input, desktop-browser, and physical-mobile checks remain open in `docs/PRODUCTION_QA.md`.
- The ignored `.env.local` is not a committed or required build input; source inspection found no application environment dependency beyond Vite's compile-time `import.meta.env.PROD` service-worker gate. The clean source remains a static `dist/client` application with no document-processing backend or required secret.

### Vercel production-beta checkpoint — updated 2026-08-14

- The owner subsequently authorized a CLI preview, production promotion, GitHub repository connection, and custom-domain attachment while keeping the GitHub repository private.
- Private `main` commit `477e6dd1a90a31913de86388a3b97db817485ba4` was exported without Git metadata or ignored local state and built as preview deployment `dpl_J3ThWYmv3zcajRqsrfpSqgBdT6jZ`. Vercel reported `READY`; the static build has no Functions or application backend.
- The exact preview artifact was promoted to production deployment `dpl_L7xc47MHdLRjNscXF1k2RRM7wMnM`. The prior known-good production deployment `dpl_8GftPWFsxYtpBBxWpNxgQKESH224` remains available as the rollback target.
- Production responses on the Vercel hostname returned the committed CSP, Permissions Policy, referrer, framing, MIME, cache, service-worker, and HSTS headers. The generated sitemap contains 48 canonical URLs, the precache manifest contains 77 entries, and the deployed service-worker revision is `00d57810cbd189ca`.
- Vercel is connected to `team-black-box/local-file-studio` with protected `main` as the production branch. An authorized cofounder commit proved the Git trigger: production deployment `dpl_2RpBaYuDSJWvCBbQYqEAAb3JeYSa` reached `READY` from exact private-`main` commit `4f22fc0e468b72c30ed521d45d96ab598f8d00b2` without a CLI promotion.
- `https://localfilestudio.app/` returns `200` with TLS and the committed security headers. `https://www.localfilestudio.app/` returns a permanent `308` redirect to the canonical apex. The live sitemap contains exactly 48 canonical URLs; every URL returned `200` with its matching canonical and security headers during the 2026-08-13 readiness check. The deployed service-worker revision was `54633880d5b7bdee`.
- On 2026-08-14 the apex mapped to READY production deployment `dpl_7wCrLUHAhixQpbRDEDtXsskeh7PJ` from exact private-`main` commit `050b09a56871172ad333667b30e2fba51a3fd355`. Its 48 sitemap URLs again returned `200` with matching canonicals, CSP, and HSTS; `www` returned the expected `308`; the service worker used revision `0eeaa74b99c2ac74`; and the precache contained 77 entries. No Vercel Functions are defined.
- The owner authorized a manual deployment of exact merged `main` commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0`. A clean `git archive` export omitted `.git`, ignored local state, credentials, dependencies, and generated output. Authenticated CLI preview `dpl_3cgubPBbTCHFjnJGhEsB4wvrrCzK` reached `READY` after the configured frozen install and production build generated all 47 tool pages, 77 offline assets, and service-worker revision `0d18c08aa9b66df0`. The homepage, `/tools/convert-image`, `sw.js`, and `precache-manifest.json` returned `200` with the expected content types.
- The exact tested preview was promoted without a source change to READY production deployment `dpl_EY92wx11fjabk3gpkacNVrAoCiMe`. `https://localfilestudio.app/` and `/tools/convert-image` return `200`, the tool page has its matching canonical metadata, `www` returns the expected permanent `308`, and the live service-worker revision matches the preview build. This resolves the previously recorded source/production catalog gap.
- Git-triggered deployments authored by `abs192` remain blocked because that Git author does not have Vercel project access. The authenticated clean-archive deployment is a controlled manual release path, not evidence that this Git-author limitation is fixed. Resolve Vercel team access before relying on `abs192` Git-triggered releases.
- READY deployments `dpl_7wCrLUHAhixQpbRDEDtXsskeh7PJ` and `dpl_qt1lzjprg` remain confirmed previous artifacts. Their availability is rollback-readiness evidence only; no rollback, two-build update, or production offline reload was exercised during the current promotion.
- The complete 47-tool matrix, preserved browser network/Cache Storage evidence, physical mobile/browser breadth, two-build update path, and exercised rollback remain ongoing beta QA. No unchecked item is relabeled as passed or waived.

## SEO and AI-discovery launch gate

### Local foundation checkpoint — 2026-08-12

- The source catalog now generates a crawlable homepage and 47 canonical `/tools/{slug}` pages with unique metadata, visible tool facts, social cards, and structured data.
- `sitemap.xml`, `robots.txt`, `llms.txt`, and `sitemap.md` are deterministic production artifacts covered by `bun run test:seo`; no crawler SDK, analytics, backend, or secret is required.
- Search discovery is initially allowed, including `OAI-SearchBot`, while `GPTBot` is blocked. This is a deliberate source-controlled starting policy, not a permanent consent or governance promise.
- The generated output has been verified locally only. It is not evidence that the site is deployed, indexed, ranking, or approved for production.

### Remaining external discovery gate

- Continue checking that the apex domain, explicit `www` redirect, and Vercel hostname do not create uncontrolled duplicate indexable hosts. The apex and redirect are live; preview non-indexing and search-engine observations remain operational checks.
- Validate representative structured data and social previews with external search-engine/debugger tools. The 2026-08-13 live-source check confirmed all 48 canonical paths return `200` with matching canonical and security headers, but it did not replace browser/device behavior QA.
- Validate and submit the production sitemap through owner-controlled Google Search Console and Bing Webmaster Tools accounts. Record verification ownership outside source; do not commit tokens or DNS secrets.
- Validate representative pages with search-engine rich-result/schema tools and social-card debuggers, then monitor coverage and crawl errors without adding document-data telemetry.
- Obtain explicit owner approval for the final AI-crawler policy, distinguishing search/discovery crawlers from model-training crawlers. Revisit `robots.txt` in a reviewed source change when policy changes.

## CLI, local MCP, and agent skill

### Research checkpoint — 2026-08-13

The architecture, privacy model, initial capability grouping, command and MCP contracts, agent-skill shape, packaging options, verification strategy, and open decisions are recorded in [CLI_MCP_AGENT_SKILL_PLAN.md](docs/CLI_MCP_AGENT_SKILL_PLAN.md).

Current state:

- The static web application is the only shipped interface. No CLI, MCP server, installable agent skill, public package, or release binary exists yet.
- `AGENTS.md` already requires future interfaces to reuse the catalog, centralized policies, preflight, processors, errors, cleanup, and local-only guarantees rather than creating a second behavior path.
- Browser `File`/`Blob`, DOM, canvas, PDF.js rendering, image decoding, workers, object URLs, and downloads are not yet isolated behind a complete non-browser runtime contract.
- An MCP process running locally does not make model-visible arguments or responses private. Document bytes, extracted/OCR text, passwords, and other content-bearing results must stay out of agent transcripts by default.

Implementation tasks, in order:

1. Open an issue for the shared runner contract and runtime-capability inventory. Add versioned requests, results, stable errors, cancellation, browser/Bun adapters, and UI parity tests without changing tool semantics.
2. Open a separate issue for a structural PDF CLI MVP derived from the live catalog. Require safe paths, central preflight, atomic outputs, overwrite refusal, stable JSON/exit codes, no-echo password handling, and cross-platform clean-clone tests.
3. Open a separate issue for a local `stdio` MCP wrapper after the CLI contract stabilizes. Require configured roots, traversal/symlink protection, progress/cancellation, minimal metadata responses, no remote transport, and no document content or secrets in model-visible fields.
4. Create the repository-hosted `skills/local-file-studio` package only after MCP and CLI discovery work. Initialize it with the standard skill tooling, keep it thin, derive capabilities through `list`/`describe`, validate it, and forward-test MCP preference plus CLI fallback with synthetic files.
5. Evaluate password/WASM, placement, rendering/OCR, Office, image, and interactive capability groups separately. Do not advertise runtime support until the complete path passes security, resource, licensing, privacy, parity, and clean-install verification.

Before implementation, resolve the operating-system support matrix, package layout/versioning, distribution channels, MCP SDK/protocol version, host root configuration, secret-entry approach, and whether any content-returning agent operation can meet the product privacy contract. Package publication, binary releases, MCP/skill directory submission, global installation, and hosted services remain separately authorized external actions.

### Owner scheduling decision — 2026-08-13

CLI, MCP, and agent-skill implementation is parked while the repository completes its public-source transition. The research document remains available for later issue scoping, but none of these interfaces is on the active release path and no current product claim depends on them.

## General image-format conversion — merged 2026-08-14

PR #13 merged one understandable local image converter for common static conversions such as PNG to WebP, rather than forcing users to infer the path through JPG-specific tools. The implementation is part of private `main`; production deployment parity and the unchecked QA cases below remain follow-up work.

- **Convert Image** replaces **Convert to JPG** and owns static PNG/JPG/WebP output. **JPG to GIF** retains the separate animation workflow without overlapping static PNG conversion.
- Output cards detect PNG/JPG/WebP encoder support at runtime. The processor rejects MIME fallbacks and invalid output signatures rather than mislabelling a file.
- The UI states transparency, lossy quality, metadata stripping, first-frame behavior, TIFF rejection, and new-file behavior before conversion. JPG flattening requires the visible chosen background.
- Existing central image count, byte, decoded-pixel, batch-pixel, result-retention, ZIP, and output safeguards remain authoritative; processing stays sequential and releases bitmap/canvas resources.
- Continue desktop/mobile deployed-candidate checks for transparency, animated input, repeated conversion, offline use, privacy/network behavior, encoder fallback, malformed input, and exact-limit fixtures recorded in `docs/PRODUCTION_QA.md`. Do not treat the single PNG-to-WebP audit smoke as completing that matrix.

## Evaluate custom workflows

Custom multi-tool workflows are valuable, but the first design must preserve the no-login, offline-only product model. Do not introduce an account, sync service, remote workflow runner, analytics dependency, or server-side document storage merely to save recipes.

Recommended baseline to validate:

- Store versioned workflow definitions in origin-scoped IndexedDB. Store tool identifiers, schema versions, and bounded settings only—never selected files, generated results, passwords, signatures, OCR text, filenames, object URLs, or document-derived content.
- Explain that browser storage is local to one browser profile and origin and may be removed by private browsing, site-data clearing, storage eviction, or a domain change. An optional `navigator.storage.persist()` request may reduce eviction risk but cannot be presented as a backup guarantee.
- Provide explicit Export workflow / Import workflow using a small versioned JSON format so users can back up or move recipes without an account. Treat imported JSON as untrusted: cap file size, node count, text/settings sizes, and graph depth; reject unknown tools, cycles, path/URL fields, executable expressions, scripts, and schema mismatches.
- Consider the File System Access API only as a progressive enhancement for explicit save/open gestures where supported. It cannot be the cross-browser storage baseline.
- Keep execution local and sequential by default. Validate input/output compatibility between steps, enforce cumulative resource and retained-result budgets, request passwords only at run time, support cancellation and cleanup, and stop on failure without describing partial downstream output as complete.

Before implementation, prototype the workflow builder with synthetic definitions and decide: allowed tool combinations, intermediate-file naming, branch/fan-out limits, per-step previews, error recovery, schema migration, export-file privacy copy, and what happens when a saved tool or setting changes. Add a focused issue only after browser storage/eviction behavior and the workflow threat model are documented.

## Restore local HEIC/HEIF input

HEIC/HEIF decoding may return to Convert Image only after a replacement path is demonstrably suitable for a public, local-only browser application processing untrusted files.

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
