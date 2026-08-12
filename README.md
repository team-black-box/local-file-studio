<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Local File Studio

Private PDF and image tools that run on your device. The production build is a static Vite SPA suitable for Vercel and includes an offline app shell.

**Status:** Pre-release alpha. Interfaces, supported formats, and safety limits may change. At the 2026-08-11 readiness checkpoint, the GitHub repository remained private and neither public-source nor production launch had been authorized.

## Catalog coverage

The catalog provides 47 common PDF and image workflows in one independent, offline-first browser workbench.

### PDF — 34 actions

- Organize: Merge, Split, Remove Pages, Extract Pages, Organize PDF, Scan to PDF.
- Optimize: Compress, Repair, and English OCR.
- Convert to PDF: JPG, DOCX, PPTX, XLS/XLSX, and sanitized local HTML.
- Convert from PDF: JPG, DOCX, PPTX, XLSX, archival rewrite, and Markdown.
- Edit: Rotate, Page Numbers, Watermark, Crop, text annotation, visual image/signature placement, and Forms.
- Protect: Unlock, AES-256 Protect, Sign, permanent raster Redact, and text Compare.
- Smart local helpers: extractive Summarizer and glossary-assisted Translate.

Compress PDF rebuilds pages as compressed images. This can substantially reduce image-heavy documents, but searchable text, links, forms, and annotations are flattened, fine detail may soften, and an already-optimized PDF can become larger.

### Images — 13 actions

- Compress, Resize, Crop, Convert to JPG, Convert from JPG, Photo Editor, Upscale, Remove Background, Watermark, Meme Generator, Rotate, sanitized HTML to Image, and Blur Face.

Tools whose output depends heavily on source layout, browser codecs, heuristics, or on-device recognition are labelled **Local beta** in the interface. Catalog copy and file pickers intentionally list only formats that the bundled browser processors can decode.

Word to PDF extracts readable DOCX text without preserving Word layout. Legacy symbol-font characters are kept visible as `[symbol …]` placeholders rather than being guessed incorrectly; a verified broader mapping is deferred in [TASKS.md](TASKS.md).

Password-protected PDFs can be opened in place in every applicable PDF workbench. The password is held only in tab memory for the current operation and is cleared after completion, reset, or failure. Reader passwords work when the PDF grants the permission the selected tool needs; structural changes require modification permission or the owner password, rendering requires print permission, and text conversion requires copy permission. Generated PDFs are unlocked by default. An explicit **Keep output files password-protected** checkbox can instead apply fresh AES-256 protection using the first non-empty password verified for that job, including every PDF inside Split/Extract ZIP results. This does not promise to clone the source PDF's original permission flags or every security detail. Non-PDF outputs cannot receive PDF password protection. The dedicated Unlock and Protect PDF tools retain their explicit purposes. Standard password security is supported; certificate/public-key encrypted PDFs and unsupported security handlers fail locally with an actionable message.

## Visible local safety limits

Every workbench shows its exact file-count, per-file, combined-size, page/pixel, and result limits next to the file picker. These deterministic limits protect browsers with roughly a 4 GB device-memory budget; files are validated before local engines allocate large canvases, page buffers, or ZIP archives.

- Most structural PDF tools accept one file up to 75 MB and 500 pages. Repair is 50 MB/300 pages; Unlock and Protect are 75 MB/500 pages with 1,024-character passwords. Merge accepts 2–20 PDFs, 50 MB each, 120 MB combined, 300 pages per file, and 500 pages combined. Compare accepts exactly two 50 MB PDFs, up to 250 pages each/400 combined and 2,000,000 extracted characters, with 25,000 lines per file/40,000 combined, 2,000 line edits, a 3-second diff budget, and a 4-second hard worker stop.
- Raster PDF tools use smaller budgets: Compress is 50 MB/150 pages/150 MP rendered per job; Redact and PDF-to-JPG are 50 MB/100 pages/150 MP; OCR is 30 MB/25 pages/40 MP. Each rendered page is capped at 12–16 MP and a 6,000–8,192 px edge.
- Add Image to PDF accepts one 50 MB/200-page PDF plus up to 10 static PNG/JPG images, 10 MB each/30 MB combined, 12 MP and 6,000 px per image/40 MP combined, and 100 visual placements. Locally prepared transparent images are capped at 24 MB each/64 MB combined. Placed signature images are visual marks, not certificate-backed digital signatures.
- PDF text conversions use 30–50 MB files, 100–300 pages, and tool-specific extracted-text ceilings from 120,000 characters for Translate to 5,000,000 for Word/Markdown. Page-selection text is capped at 4,096 characters and 2,000 expanded entries; Split/Extract return at most 100 files, Organize returns at most 2× the source page count, and PDF Forms accepts up to 1,000 fields.
- Standard image batches accept up to 20 images, 25 MB each and 100 MB combined, with a 16 MP / 8,192 px decoded-image limit and 160 MP per batch. Pixel-heavy tools accept up to 10 images, 20 MB each/60 MB combined, with a 12 MP / 6,000 px input limit and 60 MP per batch. Image-to-PDF accepts 30 files, 120 MB combined, and 240 MP per batch. Convert-to-JPG accepts 10 files/80 MB combined, rejects multi-page TIFF, and uses only the first frame of animated GIF, PNG, or WebP inputs.
- Office conversions accept one 25 MB document and inspect actual decompression before parsing: 2,000 internal items/100 MB expanded for DOCX, 5,000/120 MB for XLSX, and 5,000/160 MB for PPTX, plus 25 MB per internal item and a 20× expansion ceiling. Derived-content guards cap DOCX at 2,000,000 characters, PPTX at 1,000,000 characters/250 slides, and XLSX at 2,000,000 characters/100 sheets/500,000 used-range cells; each may create at most 500 PDF pages. HTML tools require one file up to 2 MB or pasted markup up to 500,000 characters; HTML-to-PDF returns at most 500 pages and HTML-to-Image uses a 12 MP, 8,192 px-wide, 4,096 px-tall capture limit.
- Generated results are limited to 128 MB in browser memory. Multi-file generation stops at 100 files, 48 MB per generated file, or 128 MB retained before download/ZIP creation. There is no separate download quota.

Limits do not represent upload quotas: document bytes never leave the browser. Actual headroom can still be lower when other tabs use substantial memory or a browser has a stricter canvas implementation.

## Run with Bun

The validated local toolchain is Bun 1.2.20 and Node.js 24. Bun manages dependencies and runs the repository scripts; build preparation and tests use Node.js APIs.

```bash
bun install --frozen-lockfile
bun run dev
```

Build and preview the production site:

```bash
bun run build
bun run preview
```

Vercel uses the frozen-lockfile install and Bun build commands in `vercel.json`. It serves the static `dist/client` directory with SPA fallback routing, explicit cache behavior, and browser security headers; Local File Studio has no application backend or upload path.

## Offline behavior

Offline mode becomes available after one successful production visit. The build emits a strict precache manifest for the HTML app shell, Vite-generated chunks, fonts, PDF worker, and bundled English OCR engine. Arbitrary requests, uploads, and generated documents are never added to Cache Storage. Local documents selected in the browser are not uploaded by the service worker.

Each production build injects a content-derived revision into the service worker and installs into new cache names. An update waits while an older Local File Studio tab is open, so that tab keeps the matching content-hashed chunks and any files already selected in memory. The old working cache is removed only after those clients close and the fully installed revision activates. This prevents a partial update from breaking an existing offline installation or forcing a document-clearing reload.

Clearing site data, using private browsing, or browser storage eviction removes the offline cache. A first visit still needs a connection, and any feature that depends on a resource not bundled into the build will remain unavailable offline until that resource is made local.

## Verification

```bash
bun run verify
```

`bun run verify` checks repository hygiene and production-QA catalog coverage, validates vendored runtime assets, runs resource-limit, protected-PDF, and processor tests, creates the static production build, and verifies its offline/PWA artifacts. Responsive interaction, conversion, and offline-processing checks are also exercised manually where applicable.

The hardened private-repository CI rerun passed at the 2026-08-11 checkpoint. GitHub permissions, branch rules, security features, and workflow policy can change independently of this source tree, so that result is evidence for the audited revision rather than a product guarantee. The dated control snapshot and remaining public-launch gates are in [TASKS.md](TASKS.md).

Release and deployment evidence is tracked in:

- [Production tool QA matrix](docs/PRODUCTION_QA.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [GitHub and Vercel operations](docs/RELEASE_OPERATIONS.md)
- [Security policy](SECURITY.md)
- [Deferred engineering tasks](TASKS.md)

## License and third-party status

Copyright 2026 TeamBlackBox Private Limited and contributors. Local File Studio source code authored by TeamBlackBox Private Limited and contributors is licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE) for attribution. The license does not grant trademark rights in the Local File Studio name or logos—see [TRADEMARKS.md](TRADEMARKS.md).

Package, font, OCR/WASM, native-code, SheetJS, and generated-asset provenance and required notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The static build ships the corresponding license and notice bundle; every component remains under its upstream terms.

When the repository opens for public contributions, changes will be accepted under Apache-2.0 using the Developer Certificate of Origin process described in [CONTRIBUTING.md](CONTRIBUTING.md).
