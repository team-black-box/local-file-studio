<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Deferred engineering tasks

This file records intentionally deferred repository work whose prerequisites are not yet satisfied. It is not a release promise or a substitute for scoped GitHub issues. Before implementation, open a focused issue with the current technical, security, licensing, and browser-support evidence.

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
