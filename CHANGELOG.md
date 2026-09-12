<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

This changelog records public source releases of Local File Studio. GitHub source releases, npm publication, and Vercel production deployments are separate actions; this repository remains marked `private: true` in package metadata because it is not published to npm.

## 0.1.0 — Public beta

Local File Studio's first public source release provides 47 browser-based PDF and image workflows under Apache-2.0. Processing remains local to the user's device, the production application is a static Vite build with no document-processing backend, and the app shell plus required runtime assets work offline after one successful online load.

### Highlights

- Visual PDF organization flows for merge, split, remove, extract, reorder, duplicate, rotate, crop, annotate, sign, redact, forms, and reusable image placement, including rotation- and crop-aware placement export.
- Previewable PDF results and automatic download for eligible single-file outputs, with bounded multi-result ZIP creation.
- Inline, memory-only handling for supported protected PDFs. Generated PDFs are unlocked by default, with an explicit option to apply fresh password protection where supported.
- Page-by-page OCR and copyable in-tab readers for summary, translation, comparison, and Markdown workflows.
- Static image conversion between PNG, JPG, and WebP plus compression, resize, crop, rotation, watermark, meme, flat-color background removal, upscaling, GIF creation, photo editing, and reviewed face-blur assistance.
- Central file, page, pixel, archive-expansion, text, generated-item, and retained-result safeguards shared by picker copy, preflight, and processors.
- Deterministic offline/PWA artifacts, 47 crawlable tool pages, canonical metadata, sitemap, robots policy, and AI-readable discovery files generated from committed sources.
- Public contribution and release safeguards including DCO enforcement, read-only pinned CI, dependency/provenance verification, secret scanning and push protection, Private Vulnerability Reporting, and GitHub-managed default CodeQL scanning.

### Known limitations

- This is a public beta. The complete browser/device/tool production QA matrix remains ongoing; untested rows are not represented as passes.
- Offline use requires one successful online load and sufficient retained browser storage. Clearing or evicting site data removes offline availability until the next successful visit.
- Service-worker updates intentionally wait for older Local File Studio tabs to close so open tabs keep their matching lazy chunks and in-memory files.
- Browser memory, canvas, codec, translation, face-detection, and file-system support vary. The interface rejects unsupported or over-limit work instead of uploading it or silently returning a partial result.
- HEIC/HEIF input, broader legacy DOCX dingbat mapping, saved custom workflows, a CLI, a local MCP server, and an agent skill are not included in this release.
- Certificate/public-key encrypted PDFs and unsupported security handlers are not supported. Applying fresh output protection does not clone every source permission or security detail.

See the [README](README.md) for exact behavior and limits, [production QA matrix](docs/PRODUCTION_QA.md) for current test evidence, [release checklist](docs/RELEASE_CHECKLIST.md) for release gates, [security policy](SECURITY.md) for private reporting, and [deferred tasks](TASKS.md) for capabilities that are intentionally not shipped.
