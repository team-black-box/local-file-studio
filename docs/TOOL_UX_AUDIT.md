<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Tool UX audit

This is the working interaction audit for all 47 tools as of 2026-08-20. It evaluates task clarity, visible control of the transformation, result feedback, and whether the user can understand the output before running. It does not replace the production QA matrix.

## Shared interaction standard

Every tool should follow the shortest truthful flow:

1. Add files and immediately see what was accepted.
2. Choose the transformation with visual controls instead of decoding raw values.
3. See the expected page, size, format, or placement before running whenever that can be computed locally.
4. Run one clearly named primary action.
5. Request an automatic download for a single generated file, while keeping Preview and Download again available when a browser blocks or defers that request.
6. Keep multi-output and reader tools explicit: one ZIP may download automatically, but multiple independent files and copy-first results must not trigger a burst of downloads.

Native text or number entry remains available when precision matters. Numeric limits continue to come from the central policy path.

## Catalog review

| Tool | Current interaction | Next enhancement |
| --- | --- | --- |
| Merge PDF | Complete: ordered file list, local per-file page inspection, live final page ranges and total, exact readiness action, and previewable result summary | Keep; continue protected-input, 20-file, 500-page, reorder, mobile, and boundary QA |
| Split PDF | Strong visual page rail, presets, and output groups | Keep; continue boundary/mobile QA |
| Remove Pages | Strong visual page selection | Keep; continue boundary/mobile QA |
| Extract Pages | Strong visual page selection and output choice | Keep; continue boundary/mobile QA |
| Organize PDF | Visual page rail with reorder, copy, remove, restore, reset, and exact-entry fallback | Keep; add direct drag-and-drop only if testing shows the buttons are slower |
| Scan to PDF | Numbered thumbnail order strip, accessible earlier/later controls, visual page-shape cards, real first-page fit preview, exact page-count action, and post-run review summary | Keep; validate longer mobile camera batches and mixed portrait/landscape scans |
| Compress PDF | Strong visual modes, local estimate, and actual result delta | Keep; improve scan/image-heavy explanation only if testing finds confusion |
| Repair PDF | One clear rebuild action with honest recovery limits, original-file reassurance, and a review-before-replace result summary | Keep; continue malformed, protected, browser, and boundary QA |
| OCR Reader | Strong page-by-page copyable reader | Keep; add page navigation/search only after core QA |
| JPG to PDF | Numbered thumbnail order strip, accessible earlier/later controls, visual page and margin cards, real first-page fit preview, exact page-count action, and post-run review summary | Keep; validate 30-image mobile batches and mixed image aspect ratios |
| Word to PDF | Bounded pre-export text preview with character, word, and paragraph feedback; honest clean-reconstruction result | Keep; continue real-document, malformed-archive, symbol-placeholder, and mobile QA |
| PowerPoint to PDF | Bounded pre-export slide count and first-slide text preview with honest ordered text reconstruction | Keep; continue real-deck, malformed-archive, and mobile QA |
| Excel to PDF | Visual orientation cards, bounded first-sheet value preview, and exact sheet/used-cell/PDF-page feedback | Keep; continue real-workbook, malformed-file, formula-cache, and mobile QA |
| HTML to PDF | Visual A4/US Letter choices, bounded sanitized text preview, exact readable-text/page feedback, and explicit no-fetch reconstruction scope | Keep; continue malformed-markup, remote-reference, mobile, and offline QA |
| PDF to JPG | Bounded page-thumbnail rail, exact JPG/ZIP output plan, and an actual encoded sample-page quality preview with per-page dimensions and size | Keep; continue protected-input, long-document, mobile, and boundary QA |
| PDF to Word | Bounded page-by-page selectable-text preview, exact page/text counts, and one-section-per-page DOCX plan | Keep; continue protected-input, empty-page, long-document, mobile, and boundary QA |
| PDF to PowerPoint | Bounded page-by-page selectable-text preview, exact text counts, and one-slide-per-page PPTX plan | Keep; continue protected-input, empty-page, long-document, mobile, and boundary QA |
| PDF to Excel | Bounded page-by-page table preview with exact sheet, row, and value counts | Keep; continue protected-input, empty-page, table-separator, mobile, and boundary QA |
| Archive PDF Rewrite | Exact page-count rewrite plan, visible description of structural and metadata changes, non-certified PDF/A warning beside the action, and matching result summary | Keep; continue real-document, validator, protected-input, mobile, and boundary QA |
| Rotate PDF | Visual direction cards and a representative first-page orientation preview | Keep; continue real-document/mobile QA |
| Add Page Numbers | Visual position grid, accessible starting-number stepper, and first-page preview | Keep; continue real-document/mobile QA |
| Add Watermark | Text, visual opacity scale, and representative first-page preview | Keep; continue real-document/mobile QA |
| Crop PDF | Visible trim control and representative page-edge preview | Keep; continue boundary QA |
| Edit PDF | Direct text-note placement on a real page canvas, every-page/one-page scope, uniform six-page strip with trackpad navigation, accessible manual page entry, drag/click/keyboard placement, reset and exact-position controls, rotation-aware output, exact action/result feedback, automatic download, and shared PDF Preview | Keep; continue protected-input, mixed page-size/rotation, touch, long-note, mobile, and boundary QA |
| Add Image to PDF | Strong page canvas, placement, resize, and rotation | Keep; continue browser and touch QA |
| PDF Forms | Dynamic field-aware editor with search, paging, exact controls, change count, editable/flattened export choice, and optional advanced JSON | Keep; continue protected-form, browser, and unusual-widget QA |
| Unlock PDF | Clear password gate and previewable result | Keep |
| Protect PDF | Explicit AES-256 plan, exact password confirmation, shared show/hide control, honest length guide, unrecoverable-password warning, fail-closed action, memory-only clearing, and previewable result | Keep; continue compatible-viewer, mobile, and boundary QA |
| Sign PDF | Real final-page canvas with direct drag/click/keyboard placement, explicit Signature only/Signature + date choices, live local date, bounded size and exact-position controls, reset, rotation-aware output, exact result feedback, automatic download, and shared PDF Preview | Keep; continue protected-input, rotated/landscape final-page, long-name, touch, mobile, and boundary QA |
| Redact PDF | Real per-page canvas with drag-to-draw, multiple movable/resizable areas, page counts, black/white preview, exact controls, undo, page/all reset, and flattened-result preview | Keep; continue touch, protected-input, and large-document QA |
| Compare PDF | Inline paginated text diff with original/revised order, changes/all views, exact counts, and optional scriptless HTML export | Keep; continue protected-input, mobile, and boundary QA |
| Local Summarizer | Visual length/format choices, exact extractive plan, and copyable in-tab summary with optional TXT | Keep; continue protected-input, short-source, mobile, and boundary QA |
| Translate PDF | Complete: visual language and engine choices, selectable-source preview with exact counts, explicit browser-model availability/preparation/download progress, honestly limited 10-term glossary, and labeled copyable result | Keep; continue supported-Chrome model-pack, unsupported-browser, protected-input, offline, mobile, and boundary QA |
| PDF to Markdown | Copyable text/preview tabs | Keep |
| Compress Image | Visual quality presets, exact fine-tuning, real first-image before/after encoding preview, byte delta, honest PNG behavior, checked-sample reuse, and actual result/ZIP size feedback | Keep; continue mixed-format batch, transparency, metadata, mobile, and boundary QA |
| Resize Image | Friendly width presets, exact stepper, first-image proportional preview, exact original → target dimensions, batch explanation, central output validation, and matching result feedback | Keep; continue mixed-orientation batch, enlargement, mobile, and boundary QA |
| Crop Image | Visual ratio cards, real first-image preview, draggable and keyboard-movable crop frame, bounded crop amount, reset, exact dimensions, retained-pixel feedback, and matching batch/result summaries | Keep; continue mixed-orientation batch, touch, keyboard, mobile, and boundary QA |
| Convert Image | Strong visual format choices and quality feedback | Keep |
| JPG to GIF | Numbered thumbnail frame order, visual timing presets plus exact bounded timing, loop/play-once control, local Play/Pause source preview, exact output shape/duration feedback, crop and palette disclosures, and matching result summary | Keep; continue long-sequence, palette, mobile, and browser playback QA |
| Photo Editor | Live first-image canvas, four visual starting looks, exact bounded fine-tuning, optional light/dark caption preview, reset, exact output plan, privacy/metadata disclosure, and matching result summary | Keep; continue color fidelity, caption edge, mobile, and browser-canvas QA |
| Upscale Image | Visual 2×/4× choices with exact first-image targets, unsafe-option disabling, source preview, pixel and raw-canvas growth, batch rules, honest resampling limits, privacy note, and matching result summary | Keep; continue mixed-batch, maximum-canvas, mobile, and browser-memory QA |
| Remove Background | Visual Light/Balanced/Strong cleanup and Transparent/White/Black output choices, real bounded first-image before/after sample, detected corner color and mixed-corner warning, batch rule, honest non-AI method disclosure, and matching result summary | Keep; continue difficult-edge, mixed-background, transparency, mobile, and browser-memory QA |
| Watermark Image | Live bounded first-image preview, counted text input, visual center/corner placement, upward/straight/downward direction, light/dark contrast choices, exact opacity, batch rule, privacy/metadata disclosure, and matching result summary | Keep; continue mixed-orientation batch, text-fit, contrast, mobile, and browser-canvas QA |
| Meme Generator | Real bounded image preview, counted top/bottom captions, caption swap, Meme caps/Keep typing choices, deterministic four-line auto-fit, honest fit/privacy disclosure, and matching result summary | Keep; continue long/non-ASCII caption, contrast, mobile, and browser-canvas QA |
| Rotate Image | Real bounded first-image preview, direct Turn right/Turn around/Turn left choices with direction icons, exact original → rotated dimensions, batch rule, privacy/metadata disclosure, and matching result summary | Keep; continue mixed-orientation batch, transparency, mobile, and browser-canvas QA |
| HTML to Image | Complete: direct JPG/SVG choices, familiar device-width presets plus exact fine-tuning, same-rule sanitized live capture, exact layout/output dimensions, removal feedback, and matching result summary | Keep; continue long-capture, embedded-data-image, browser-rendering, mobile, and offline QA |
| Blur Face | Complete: bounded first-image privacy preview, auto-detected region guides or an explicitly movable and 18–64% resizable manual fallback, direct Light/Balanced/Strong choices, exact fine-tuning, and single/batch outcomes | Keep; re-test native detection across supported browsers as the Shape Detection API changes |

## Delivery waves

1. **Shared foundation:** visual choice cards, number steppers/presets, meaningful range endpoints, and safe single-result automatic download.
2. **PDF page editors:** Organize, representative single-operation previews, field-aware Forms, and per-page multi-region Redact are complete; continue targeted touch and large-document QA.
3. **PDF conversions and readers:** pre-export page/text/output feedback plus inline Compare and Summary results.
4. **Image canvas tools:** Resize, Crop, Photo Editor, Upscale, Remove Background, Watermark, Meme, Rotate, and Blur Face live previews are complete.
5. **Final QA:** keyboard, screen-reader names, mobile reflow, large/boundary files, repeated runs, preview, automatic download, offline reload, and browser coverage.

## Current audit limits

Representative desktop screens were captured for the shared settings/result patterns. Full accessibility behavior, touch gestures, real document variety, and every generated result still require interactive production QA; screenshots alone cannot establish those properties.
