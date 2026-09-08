<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Local File Studio

Private PDF and image tools that run on your device. The production build is a static Vite SPA suitable for Vercel and includes an offline app shell

**Status:** Public beta at [localfilestudio.app](https://localfilestudio.app/), with [public source on GitHub](https://github.com/team-black-box/local-file-studio). Interfaces, supported formats, and safety limits may change. Repository visibility does not alter the live app's local-only architecture.

## Catalog coverage

The catalog provides 47 common PDF and image workflows in one independent, offline-first browser workbench.

### PDF — 34 actions

- Organize: Merge, Split, Remove Pages, Extract Pages, Organize PDF, Scan to PDF.
- Optimize: Compress, Repair, and a page-by-page English OCR reader with copyable text.
- Convert to PDF: JPG, DOCX, PPTX, XLS/XLSX, and sanitized local HTML.
- Convert from PDF: JPG, DOCX, PPTX, XLSX, archival rewrite, and Markdown.
- Edit: Rotate, Page Numbers, Watermark, Crop, text annotation, visual image/signature placement, and Forms.
- Protect: Unlock, AES-256 Protect, Sign, permanent raster Redact, and text Compare.
- Smart local helpers: extractive Summarizer and an explicitly chosen browser-model or limited-glossary Translate.

Compress PDF rebuilds pages as compressed images. This can substantially reduce image-heavy documents, but searchable text, links, forms, and annotations are flattened, fine detail may soften, and an already-optimized PDF can become larger.

### Images — 13 actions

- Compress, Resize, Crop, Convert Image (PNG/JPG/WebP), JPG to GIF, Photo Editor, Upscale, Remove Background, Watermark, Meme Generator, Rotate, previewed and sanitized HTML to Image, and Blur Face.

Tools whose output depends heavily on source layout, browser codecs, heuristics, or on-device recognition are labelled **Local beta** in the interface. Catalog copy and file pickers intentionally list only formats that the bundled browser processors can decode.

HTML to Image accepts one local HTML file or pasted markup, removes scripts, forms, authored styles, classes, IDs, and remote references without loading them, and shows the same clean capture plus exact dimensions before creating JPG or SVG output. Self-contained base64 PNG/JPG/GIF/WebP images may remain; external assets are never fetched.

Word to PDF checks the DOCX locally, previews a bounded sample with readable-text counts, and then reconstructs the complete extracted text as a clean PDF without preserving Word layout. Legacy symbol-font characters are kept visible as `[symbol …]` placeholders rather than being guessed incorrectly; a verified broader mapping is deferred in [TASKS.md](TASKS.md).

PowerPoint to PDF checks the PPTX locally, follows the deck's declared slide order, reports the slide and readable-text counts, and previews a bounded sample from the first slide before reconstructing all extracted slide text as a clean PDF. It does not preserve slide themes, images, charts, animations, or original placement.

Excel to PDF checks XLS/XLSX worksheet ranges locally, reports sheet, used-cell, and exact generated-page counts for the selected visual orientation, and shows a bounded first-sheet value preview before export. It reconstructs saved cell values as readable text; workbook styling, charts, merged-cell layout, formulas without saved results, and print settings are not preserved.

HTML to PDF accepts one local HTML file or pasted markup, shows a bounded sanitized text preview, and calculates the exact generated-page count for the selected A4 or US Letter page size before export. Its parser-free extraction never opens the page or fetches referenced URLs; scripts, styles, forms, frames, vector markup, and remote resources are ignored. The result is a clean readable-text reconstruction rather than a screenshot of the original webpage.

Compress Image offers understandable Compact, Balanced, and Sharp starting points plus an exact quality slider. Before export it locally encodes the first selected image with the same browser path used by the final job, shows the real before/after image and byte delta, and reuses those checked bytes for the first output. Batch results are delivered as one ZIP with an actual final size; the first-image sample is never presented as a guessed batch total. JPG/WebP quality is lossy, while PNG remains lossless and may not become smaller after metadata-removing re-encoding.

Resize Image offers Small, Web, Full HD, and Large width presets plus an accessible exact-width stepper. It inspects every selected image locally, shows the first image’s exact original → target dimensions before export, preserves each aspect ratio, and rejects unsafe output dimensions before pixel allocation. Batch images share the chosen width while retaining proportional heights; originals remain unchanged, JPG/WebP use balanced local re-encoding, and PNG stays lossless.

Crop Image replaces raw crop coordinates with visual Original, Square, Standard, and Wide choices. After an image is selected, the first image appears under an exact movable crop frame: drag the frame, use its arrow-key controls, tighten the crop with the bounded slider, or reset everything in one step. The UI reports original and output dimensions plus the retained-pixel percentage before processing. A batch shares the chosen shape, crop amount, and focal position while calculating safe pixel dimensions separately for every source image; originals stay unchanged.

PDF to JPG reads the page count locally, shows a bounded page-thumbnail rail, and encodes the selected sample page at the chosen JPG quality before export. The sample dimensions and byte size are exact for that page; total multi-page ZIP size is calculated only after every page is converted rather than guessed. A one-page PDF produces one JPG, while a multi-page PDF produces one ordered ZIP.

PDF to Word checks selectable text on every page locally before export. It reports the exact PDF-page, text-page, and character counts, shows a bounded page-by-page text preview, and creates one editable DOCX section for every source page—including an empty section when a page has no selectable text. The checked extraction is reused for the export; images, tables, columns, fonts, page geometry, and original placement are not reproduced.

PDF to PowerPoint uses the same bounded local inspection to plan one editable text slide per PDF page. It reports exact slide and selectable-text counts, lets you inspect each source page before export, and uses an explicit no-text placeholder for pages without selectable text. The PPTX is a clean 16:9 text reconstruction; graphics, tables, columns, fonts, page geometry, and original placement are not reproduced.

PDF to Excel plans one editable worksheet per PDF page and previews the exact rows and values produced by its text rules. PDF text lines become rows, while tabs, pipes, or wider spaces separate values into columns. Pages without selectable text remain as ordered empty sheets; complex table geometry, merged cells, formulas, images, fonts, and original placement are not reconstructed.

Clean text-reconstruction exports use the bundled standard PDF font. If Word, PowerPoint, Excel, or HTML text contains a character that font cannot preserve, the conversion stops before export and names the unsupported code point instead of silently substituting a wrong glyph.

Password-protected PDFs can be opened in place in every applicable PDF workbench. The password is held only in tab memory for the current operation and is cleared after completion, reset, or failure. Reader passwords work when the PDF grants the permission the selected tool needs; structural changes require modification permission or the owner password, rendering requires print permission, and text conversion requires copy permission. Generated PDFs are unlocked by default. An explicit **Keep output files password-protected** checkbox can instead apply fresh AES-256 protection using the first non-empty password verified for that job, including every PDF inside Split/Extract ZIP results. This does not promise to clone the source PDF's original permission flags or every security detail. Non-PDF outputs cannot receive PDF password protection. The dedicated Protect PDF tool requires an exact password confirmation, offers one shared show/hide control and an honest length guide, and clears both fields as processing starts; the app cannot recover the password. Unlock PDF retains its explicit removal purpose. Standard password security is supported; certificate/public-key encrypted PDFs and unsupported security handlers fail locally with an actionable message.

PDF Forms reads the selected AcroForm locally and presents its text fields, checkboxes, dropdowns, radio groups, and multi-select choices as ordinary controls. Only explicitly edited fields are changed; read-only, button, signature, unknown, and unsupported fields remain untouched. Outputs stay editable by default or can be flattened intentionally. Exact field-name JSON remains available as an advanced fallback, not the primary workflow.

Repair PDF leniently reads recoverable objects and creates a fresh, full, non-incremental PDF rewrite while leaving the original untouched. It can help with damaged indexes or trailing updates, but it cannot recreate pages, images, fonts, text, or bytes that are missing from the source. The result stays previewable before download.

Scan to PDF presents camera images as numbered page thumbnails before conversion, with accessible earlier/later controls that determine the exact PDF order. Match Image preserves each image's natural page shape; A4 and US Letter contain the full image on portrait paper with white margins. No mode crops or stretches the image, and the generated PDF remains previewable before sharing.

JPG to PDF uses the same numbered page-order preview for JPG and PNG batches, with visual Fit Each Image, A4, and US Letter choices plus None, Small, and Large margin controls. The first image is shown inside the selected page and margin before conversion; None adds no outer edge, while every mode still contains the full image without cropping or stretching. The generated page count and settings remain visible beside the shared PDF preview and download.

JPG to GIF presents every JPG as a numbered, reorderable frame before export. Quick, Balanced, and Slideshow timing choices stay synchronized with an exact 100–3,000 ms control, while Play/Pause and loop controls drive a local source-image preview. The output shape follows the first frame; differently shaped later frames are visibly disclosed and center-cropped without stretching. The preview also states that GIF's 256-color palette can shift colors, and the generated result reports exact dimensions, timing, cycle duration, playback mode, and size.

Photo Editor shows the selected JPG, PNG, or WebP in a live on-device canvas before export. Original, Bright, Punchy, and Warm starting looks stay synchronized with exact bounded brightness, contrast, color, and warmth controls. An optional light or dark caption appears in the same bottom position used by the full-resolution export; Reset all restores the neutral image. The output plan and generated result report the exact dimensions, format, applied settings, caption state, and actual size. The original stays untouched, and local re-encoding removes metadata.

Upscale Image turns its 2× and 4× choices into an exact local output plan before allocating a large canvas. The first image preview shows original and target dimensions, 4× or 16× pixel growth, approximate raw RGBA canvas size, and retained format; an option is disabled if any selected image would exceed the central 16 MP / 8,192 px output safeguards. Upscaling uses high-quality local resampling: it can smooth enlarged edges, but it does not claim to reconstruct focus, texture, or missing detail. Results report the actual dimensions, scale, and download size while originals remain untouched.

Remove Background shows a real before-and-after sample of the first image before export. Light, Balanced, and Strong cleanup choices control how broadly colors similar to the four sampled corners are removed; Transparent, White, and Black choices show the resulting background directly. A mixed-corner warning explains when the source may need cropping or lighter cleanup. The bounded preview and full-size PNG export use the same deterministic local pixel rule, report the sampled color and actual opacity removed, and apply one chosen rule independently to every batch image. This is an honest flat-color cutout for simple backgrounds, not an AI subject detector.

Blur Face shows the exact privacy area on a bounded first-image preview before export. When the browser provides native face detection, every detected region is outlined for review; otherwise a clearly labelled manual oval can be dragged, clicked, moved with keyboard-accessible controls, and resized from 18–64% of the image's shorter edge. Light, Balanced, and Strong choices stay synchronized with the exact 8–48 px control, and the reviewed first-image region is reused for full-resolution output. Batch images are inspected independently and use the same relative manual position and size when detection is unavailable. Detection is browser-dependent and cannot guarantee anonymity, so the interface requires visual review; orange guides are preview-only, processing remains local, and re-encoding removes image metadata.

Watermark Image shows a bounded live preview of the first selected image while the watermark text, corner or center placement, upward/straight/downward direction, light/dark color, and opacity are adjusted. Preview and full-resolution export use the same local drawing plan; each batch image keeps its own dimensions and JPG/PNG/WebP format, and the result reports the exact placement and output size. Original files remain untouched and image metadata is removed during re-encoding.

Meme Generator places editable top and bottom captions directly on a bounded live image preview. Captions can use classic meme capitals or preserve the typed case, wrap automatically without truncation, and stay outlined for contrast; a caption that cannot fit within four readable lines is rejected with guidance to shorten it. The full-resolution JPG/PNG/WebP export uses the same fit plan, keeps the source dimensions and format, and reports the exact caption line count and output size.

Rotate Image replaces angle entry with three direct choices—turn right, turn around, or turn left—and shows the first queued image in that exact orientation before processing. The preview reports the original and rotated dimensions; batch exports apply the same direction to every image while preserving each source format and pixel count.

Redact PDF shows the actual document pages and lets users draw, move, resize, review, and remove multiple black or white redaction areas on specific pages. Exact percentage controls remain available for keyboard and precision entry. The generated PDF rasterizes every page so covered pixels and hidden text are removed; this also means text is no longer selectable anywhere in the output.

Compare PDF presents the bounded selectable-text difference directly in the workbench, with original/revised line numbers, changes-only and all-lines views, and local pagination. The optional HTML report is self-contained, scriptless, and generated locally. This is a text comparison: scans, images, fonts, layout, and visual movement are not compared.

Local Summarizer selects up to 3, 5, or 9 source sentences and shows the extractive result in a copyable in-tab reader. It does not generate new claims or rewrite the document. An optional TXT download contains the same complete text shown in the reader.

Translate PDF first previews the selectable English source with exact page, word, and character counts. Full translation uses a supported desktop browser's on-device Translator API and is prepared only after an explicit click; the browser may download a language pack on first use, but PDF text stays on the device. The fallback Basic glossary is deliberately not presented as full translation: it replaces only 10 documented common terms, leaves every other English word unchanged, and labels both the reader and optional TXT accordingly. A browser-model failure does not silently switch engines.

Sign PDF shows the real final document page and lets users drag, click, or keyboard-position a typed signature with an optional local date. Exact position and size controls remain available, rotated pages preserve the reviewed visual placement, and the finished PDF stays previewable before reuse. This is a visible typed mark, not a certificate-backed digital signature.

## Visible local safety limits

Every workbench shows its exact file-count, per-file, combined-size, page/pixel, and result limits next to the file picker. These deterministic limits protect browsers with roughly a 4 GB device-memory budget; files are validated before local engines allocate large canvases, page buffers, or ZIP archives.

- Most structural PDF tools accept one file up to 75 MB and 500 pages. Repair is 50 MB/300 pages; Unlock and Protect are 75 MB/500 pages with 1,024-character passwords. Merge accepts 2–20 PDFs, 50 MB each, 120 MB combined, 300 pages per file, and 500 pages combined. Compare accepts exactly two 50 MB PDFs, up to 250 pages each/400 combined and 2,000,000 extracted characters, with 25,000 lines per file/40,000 combined, 2,000 line edits, a 3-second diff budget, and a 4-second hard worker stop.
- Raster PDF tools use smaller budgets: Compress is 50 MB/150 pages/150 MP rendered per job; Redact and PDF-to-JPG are 50 MB/100 pages/150 MP; OCR is 30 MB/25 pages/40 MP. Redact allows 200 areas per PDF, at most 50 on one page, with 65,536 characters of bounded area data. Each rendered page is capped at 12–16 MP and a 6,000–8,192 px edge.
- Add Image to PDF accepts one 50 MB/200-page PDF plus up to 10 static PNG/JPG images, 10 MB each/30 MB combined, 12 MP and 6,000 px per image/40 MP combined, and 100 visual placements. Export preserves visual placement on rotated pages and within the visible crop area. Locally prepared transparent images are capped at 24 MB each/64 MB combined. Placed signature images are visual marks, not certificate-backed digital signatures.
- PDF text conversions use 30–50 MB files, 100–300 pages, and tool-specific extracted-text ceilings from 120,000 characters for Translate to 5,000,000 for Word/Markdown. Page-selection text is capped at 4,096 characters and 2,000 expanded entries; Split/Extract return at most 100 files and Organize returns at most 2× the source page count. PDF Forms accepts up to 1,000 fields, 500 choices per field/5,000 total, 2,048 characters per field name, 10,000 per field value, 512,000 field text/choice characters total, and 262,144 characters of advanced JSON.
- Standard image batches accept up to 20 images, 25 MB each and 100 MB combined, with a 16 MP / 8,192 px decoded-image limit and 160 MP per batch. Pixel-heavy tools accept up to 10 images, 20 MB each/60 MB combined, with a 12 MP / 6,000 px input limit and 60 MP per batch. Image-to-PDF accepts 30 files, 120 MB combined, and 240 MP per batch. Convert Image accepts 10 files/80 MB combined, rejects multi-page TIFF, and uses only the first frame of animated GIF, PNG, or WebP inputs. JPG to GIF accepts up to 20 frames/80 MB combined, caps output width at 1,400 px and each GIF frame at 4 MP / 4,096 px, and bounds timing to 100–3,000 ms per frame.
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

## Search and AI discovery

The production build generates an indexable homepage and one static HTML entry point for every catalog tool at `/tools/{slug}`. All 47 tool pages have unique titles, descriptions, canonical URLs, social metadata, visible input/output and safeguard summaries, and `WebApplication` plus breadcrumb structured data. Legacy `#tool/{slug}` links are upgraded in the browser to the canonical path.

The same build writes `sitemap.xml`, `robots.txt`, `llms.txt`, and `sitemap.md` from the checked-in catalog. Search discovery is allowed by default, including `OAI-SearchBot`; the initial policy blocks `GPTBot` because search visibility is not blanket permission for model-training crawling. Maintainers must review that policy explicitly before launch rather than changing it through a hosting-only override.

This work remains open source in the same repository: metadata definitions, generation, verification, and social artwork are committed source; `dist/client` is reproducible build output and is not committed. No analytics, crawler SDK, runtime secret, server rendering service, or document-data telemetry is required. Search Console verification, sitemap submission, production-domain redirects, and crawler observations are external operational steps performed only after deployment is separately authorized.

## Offline behavior

Offline mode becomes available after one successful production visit. The build emits a strict precache manifest for the HTML app shell, Vite-generated chunks, fonts, PDF worker, and bundled English OCR engine. Arbitrary requests, uploads, and generated documents are never added to Cache Storage. Local documents selected in the browser are not uploaded by the service worker.

Each production build injects a content-derived revision into the service worker and installs into new cache names. An update waits while an older Local File Studio tab is open, so that tab keeps the matching content-hashed chunks and any files already selected in memory. The old working cache is removed only after those clients close and the fully installed revision activates. This prevents a partial update from breaking an existing offline installation or forcing a document-clearing reload.

Clearing site data, using private browsing, or browser storage eviction removes the offline cache. A first visit still needs a connection, and any feature that depends on a resource not bundled into the build will remain unavailable offline until that resource is made local.

## Verification

```bash
bun run verify
```

`bun run verify` checks repository hygiene and production-QA catalog coverage, validates vendored runtime assets, runs resource-limit, protected-PDF, and processor tests, creates the static production build, verifies all homepage/tool SEO and AI-discovery artifacts, and verifies offline/PWA output. Responsive interaction, conversion, crawler-source, and offline-processing checks are also exercised manually where applicable.

The hardened public-repository controls were re-audited on 2026-08-23. GitHub permissions, branch rules, security features, and workflow policy can change independently of this source tree, so that result is evidence for the audited revision rather than a product guarantee. The dated control snapshot and remaining operational work are in [TASKS.md](TASKS.md).

Release and deployment evidence is tracked in:

- [47-tool UX audit and enhancement waves](docs/TOOL_UX_AUDIT.md)
- [Production tool QA matrix](docs/PRODUCTION_QA.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)
- [GitHub and Vercel operations](docs/RELEASE_OPERATIONS.md)
- [Security policy](SECURITY.md)
- [Deferred engineering tasks](TASKS.md)

## License and third-party status

Copyright 2026 TeamBlackBox Private Limited and contributors. Local File Studio source code authored by TeamBlackBox Private Limited and contributors is licensed under the [Apache License 2.0](LICENSE); see [NOTICE](NOTICE) for attribution. The license does not grant trademark rights in the Local File Studio name or logos—see [TRADEMARKS.md](TRADEMARKS.md).

Package, font, OCR/WASM, native-code, SheetJS, and generated-asset provenance and required notices are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The static build ships the corresponding license and notice bundle; every component remains under its upstream terms.

Changes are accepted under Apache-2.0 using the Developer Certificate of Origin process described in [CONTRIBUTING.md](CONTRIBUTING.md).
