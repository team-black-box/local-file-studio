<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Repository Engineering Guide

## Scope and priorities

Local File Studio is an open-source, local-only browser application for PDF and image workflows. Keep changes focused on the repository and preserve these priorities, in order:

1. User privacy and document integrity.
2. Bounded resource use and safe failure.
3. Correct, deterministic processing.
4. Offline reliability, accessibility, and clear UX.
5. Performance and maintainability.

Do not change tool semantics, formats, limits, or visible promises incidentally. Preserve unrelated and untracked work.

## Non-negotiable invariants

- File contents and derived data stay on the user's device. Do not add uploads, telemetry containing document data, remote processing, server fallbacks, or required network APIs.
- Never silently truncate, skip, downsample, or partially process rejected input. Fail before expensive work with an actionable error; do not expose a partial result as complete.
- Preserve input bytes unless the selected tool explicitly transforms them. Downloads must represent only the user's requested operation.
- Keep limits visible, exact, and tool-specific beside every file picker. Displayed copy and enforcement must share the same policy source.
- Treat file names, metadata, archive entries, markup, and document contents as untrusted input. Do not log document content or secrets.

## Architecture and code map

The application is a static React/Vite SPA. Vite writes `dist/client`; Vercel serves that directory with the SPA rewrite and security/cache headers in `vercel.json`. There is no application backend.

- `src/App.jsx`, `src/styles.css`: application shell and workbench UI.
- `src/PdfImageWorkbench.jsx`: visual local editor for placing reusable images and signatures on PDF pages.
- `src/PdfPasswordGate.jsx`, `src/useProtectedPdfGate.js`: shared inline protected-PDF credential UX and memory-only lifecycle.
- `src/tools.js`: tool catalog, accepted formats, settings, and user-facing metadata.
- `src/lib/processors.js`: tool dispatch and shared processing paths.
- `src/lib/pdf-processors.js`, `src/lib/image-processors.js`, `src/lib/libpdf.js`: format-specific engines.
- `src/lib/html-image.js`: sanitized HTML capture, viewport, preview, and output contracts.
- `src/lib/docx-text.js`: bounded, local DOCX text extraction for Word-to-PDF.
- `src/lib/pptx-text.js`: bounded, ordered local PPTX slide-text extraction and preview.
- `src/lib/spreadsheet-text.js`: bounded XLS/XLSX value extraction, used-range inspection, and preview data.
- `src/lib/html-text.js`: bounded parser-free HTML text extraction and sanitized preview data without loading remote resources.
- `src/lib/pptx-writer.js`: dependency-light text reconstruction for PDF-to-PPTX output.
- `src/lib/pdfjs-utils.js`: version-compatible PDF.js document cleanup.
- `src/lib/pdf-passwords.js`: protected-PDF access modes, permission checks, and in-memory unlock adapter.
- `src/lib/pdf-protection-password.js`: dedicated Protect PDF confirmation, length guide, and fail-closed password plan.
- `src/lib/pdf-form-fields.js`: bounded AcroForm inspection, visual field descriptors, validation, and fill/flatten behavior.
- `src/lib/pdf-redactions.js`: bounded per-page redaction geometry, serialization, and execution planning.
- `src/lib/pdf-comparison.js`: bounded line-view construction and scriptless local HTML comparison export.
- `src/lib/pdf-translation.js`: explicit browser-model availability/preparation and deterministic limited-glossary contracts.
- `src/lib/pdf-text-annotation.js`: bounded page scope, wrapping, safe-margin placement, and rotation-aware draw geometry for Edit PDF.
- `src/lib/pdf-signature.js`: bounded typed-signature, local-date, safe-margin placement, and rotation-aware draw geometry for Sign PDF.
- `src/lib/pdf-output-protection.js`: opt-in fresh protection for generated PDF results.
- `src/lib/background-removal.js`: shared corner sampling, cleanup profiles, output flattening, and exact cutout outcomes.
- `src/lib/face-blur.js`: shared face-region normalization, movable fallback geometry, blur drawing, preview guides, and result contracts.
- `src/lib/image-watermark.js`: shared watermark placement, direction, contrast, opacity, drawing, and result contracts.
- `src/lib/image-meme.js`: shared caption normalization, auto-fit wrapping, outlined drawing, and meme result contracts.
- `src/lib/image-rotation.js`: shared direction choices, exact rotated dimensions, and rotation result contracts.
- `src/lib/tool-settings.js`: shared cleanup for memory-only sensitive tool settings.
- `src/lib/tiff-utils.js`: bounded TIFF metadata normalization shared by preflight and decoding.
- `src/lib/file-limits.js`: canonical resource policies and displayed limit descriptions.
- `src/lib/file-preflight.js`: pre-allocation inspection and format-aware validation.
- `src/lib/file-utils.js`: bounded result/download helpers and cleanup utilities.
- `src/lib/site-metadata.js`: canonical paths, metadata, and structured-data definitions.
- `public/`: PWA shell, icons, service worker, and vendored local engines.
- `scripts/generate-seo-assets.mjs`: static tool pages, sitemap, robots, and AI-readable discovery files.
- `scripts/prepare-production-build.mjs`: deterministic offline precache manifest and service-worker revision injection.
- `scripts/audit-git-history.mjs`: reachable-history path, size, and high-confidence secret checks before public distribution.
- `scripts/audit-repository.mjs`: intended-file, secret-pattern, removed-runtime, and hosting-configuration checks.
- `scripts/verify-ocr-assets.mjs`: vendored OCR integrity checks.
- `scripts/verify-third-party-assets.mjs`: package, native-code, license, and visual-asset provenance checks.
- `scripts/verify-seo-build.mjs`: exact catalog coverage and generated SEO/AIO artifact checks.
- `.github/workflows/ci.yml`: read-only clean-checkout verification workflow with full-SHA-pinned actions.
- `TASKS.md`: dated external-readiness snapshot and deferred capability gates; it is not a product roadmap.
- `tests/`: Node tests for policy and production/offline artifacts.

Keep processing logic independent of React where practical. New interfaces such as a CLI or MCP server must reuse the same catalog, policies, preflight, processors, structured errors, and local-only guarantees rather than creating a second behavior path. Isolate browser-only APIs behind small adapters and support cancellation/cleanup so non-UI callers can be added without changing tool semantics.

## Offline/PWA behavior

Production builds must remain usable offline after one successful online load. `bun run build` must:

- create a static `dist/client/index.html`;
- generate crawlable `/tools/{slug}` HTML for every catalog tool plus deterministic discovery files;
- generate a sorted, duplicate-free `precache-manifest.json` containing the app shell and every required local runtime asset;
- inject a deterministic content revision into `sw.js`; and
- avoid caching user-selected files, generated outputs, arbitrary requests, or failed/opaque responses.

Install a new cache completely before retiring the previous revision. Keep first-load, storage-eviction, and unavailable-resource limitations documented. Development mode is not an offline verification target; verify the production build.
Do not force a new worker to activate over open clients: an older page may still need its matching content-hashed lazy chunks, and reloading it would discard files held in memory.

## Implementing or changing a tool

Before coding, identify the tool contract, accepted inputs, output, browser support, worst-case memory/CPU use, cancellation points, and failure modes. Then:

1. Update the catalog and settings in `src/tools.js`.
2. Add or revise a single policy in `src/lib/file-limits.js`; use that policy for both picker copy and enforcement.
3. Validate count and byte limits before reading files. Extend `src/lib/file-preflight.js` for trustworthy header/metadata, page, pixel, frame, archive, or expansion checks before allocating large buffers.
4. Recheck derived/runtime limits inside the processor when preflight cannot know them. Use `FileLimitError` with a stable code, a user-actionable message, and safe details.
5. Route processing through the shared dispatcher and bounded output helpers. Reject unsupported containers/frames explicitly.
6. Add focused tests for success, boundary values, malformed input, and over-limit rejection. Update README claims when formats, limits, offline assets, or behavior change.

All count, byte, page, pixel, text, archive-expansion, generated-item, and output-size guards belong in the central policy path. Do not duplicate numeric limits in components or processors. Never replace a rejection with an upload or server fallback.

## Resource lifecycle and security

- Release resources in success, error, cancellation, and component-unmount paths: destroy PDF documents/pages, terminate workers, revoke object URLs, clear timers/listeners, close image bitmaps, remove temporary DOM/canvases, and drop large buffers/results.
- Avoid unbounded concurrency and repeated whole-file copies. Check output and retained-result limits before ZIP creation or download assembly.
- Verify type from content where feasible; do not trust extensions or MIME strings alone. Bound archive entry count, expanded bytes, per-entry bytes, and expansion ratio before parsing.
- Sanitize imported HTML and generated DOM. Do not evaluate input as code, inject unsanitized markup, interpolate it into script/style contexts, or allow path traversal from archive names.
- Keep network access opt-in and unrelated to document processing. Any future external integration must be clearly separated, documented, and unable to receive file data by default.
- Maintain the CSP and other deployment headers when adding workers, WASM, fonts, media, or new asset types. Broaden policy only to the minimum required source.

## Dependencies, vendored assets, and licensing

Use Bun and keep `package.json` and `bun.lock` synchronized. Prefer maintained dependencies that can be bundled and run locally; justify large or overlapping libraries. Do not introduce runtime CDN dependencies for core processing or offline-critical UI.

Vendored WASM, trained models, codecs, fonts, generated bundles, and other third-party assets require, before inclusion:

- exact upstream project, version, and source URL;
- reproducible acquisition/build notes when available;
- checked-in SHA-256 checksums and an automated verification path;
- the upstream license plus all required notices; and
- review of transitive/native licensing and redistribution terms.

First-party source and configuration files should carry:

```text
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
```

Preserve the exact legal name `TeamBlackBox Private Limited`. Keep the canonical root `LICENSE` unchanged. Do not add first-party SPDX ownership to third-party or generated assets; retain their upstream headers and notices. Update `THIRD_PARTY_NOTICES.md`, component-local notices, hashes, and README release caveats whenever vendored material changes.

## Commands and verification

Use the pinned Bun toolchain and frozen lockfile:

```bash
bun install --frozen-lockfile
bun run dev
bun run test:limits
bun run test:forms
bun run test:redactions
bun run test:comparisons
bun run test:annotations
bun run test:signatures
bun run verify:ocr
bun run verify:third-party
bun run test:docx
bun run test:pptx
bun run test:spreadsheet
bun run test:html
bun run build
bun run test:seo
bun run test:offline
bun run verify
bun run preview
```

`bun run verify` is the required full check. Run focused tests while iterating, then the full command before handoff. For UI or conversion changes, also inspect the production preview at relevant desktop/mobile sizes and exercise representative files, malformed inputs, boundary limits, cancellation, repeated runs, downloads, and a reload while offline.

## Repository and CI security

GitHub settings, token scopes, plan entitlements, and successful workflow runs are mutable external state. Verify them live before a release or visibility change, record dated readiness snapshots in `TASKS.md`, and do not present them as application behavior or permanent guarantees.

- Keep workflow permissions least-privilege and read-only unless a narrowly scoped write is explicitly approved. Pin every action reference, including GitHub-owned actions, to a full commit SHA, and keep the repository's selected-actions allowlist consistent with every referenced action.
- Preserve the protected-`main` private-iteration baseline: required `verify` status check in the `CI` workflow, resolved conversations, administrator enforcement, linear history, and no force pushes or branch deletion. The owner temporarily disabled required approvals on 2026-08-14 while the repository remains private. Before public visibility, restore one independent approval, last-push approval by someone other than the pusher, and stale-approval dismissal, then verify those rules live.
- Keep merge commits disabled. Retain GitHub's web-commit sign-off setting, and require every contribution to carry the DCO sign-off described in `CONTRIBUTING.md`. A cryptographically signed commit and DCO sign-off are not substitutes for one another.
- Treat dependency alerts and Dependabot as additional signals, not replacements for the frozen install, vulnerability audit, provenance checks, or full verification.
- Do not enable paid or separately licensed GitHub security features, change token access, weaken repository rules, alter the Actions policy, change visibility, or modify merge/security settings without explicit owner authorization.
- Reverify all controls after the repository becomes public. Features unavailable to a private repository, including public vulnerability reporting, are future launch steps rather than current guarantees.

## Documentation, version control, and deployment

Keep README setup, architecture, privacy/offline behavior, verified formats, resource limits, and known caveats aligned with the code. Record contributor workflow in `CONTRIBUTING.md`; legal and provenance facts belong in `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`, and component-local notices.

Do not stage, commit, amend, create/switch branches, push, alter remotes, open pull requests, change repository or security settings, link hosting projects, change environment variables, or deploy unless the user explicitly authorizes that action. Build and test locally without mutating unrelated files.

## Definition of done

A change is done when privacy and data-integrity invariants hold; policy, picker copy, preflight, processors, and errors agree; resources are cleaned up; untrusted and over-limit inputs fail safely; offline production artifacts remain complete and revisioned; applicable focused tests and `bun run verify` pass; documentation and legal/provenance records are current; and the final report lists changed/removed files, verification results, and any remaining caveats.
