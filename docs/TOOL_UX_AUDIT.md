<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Tool UX audit

This is the working interaction audit for all 47 tools as of 2026-08-19. It evaluates task clarity, visible control of the transformation, result feedback, and whether the user can understand the output before running. It does not replace the production QA matrix.

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
| Merge PDF | Strong ordered file list and PDF preview | Keep; add page-count feedback before merge |
| Split PDF | Strong visual page rail, presets, and output groups | Keep; continue boundary/mobile QA |
| Remove Pages | Strong visual page selection | Keep; continue boundary/mobile QA |
| Extract Pages | Strong visual page selection and output choice | Keep; continue boundary/mobile QA |
| Organize PDF | Visual page rail with reorder, copy, remove, restore, reset, and exact-entry fallback | Keep; add direct drag-and-drop only if testing shows the buttons are slower |
| Scan to PDF | Ordered files; page size was a dropdown | Use visual page-size cards and show a page-frame preview |
| Compress PDF | Strong visual modes, local estimate, and actual result delta | Keep; improve scan/image-heavy explanation only if testing finds confusion |
| Repair PDF | One clear rebuild action with honest recovery limits, original-file reassurance, and a review-before-replace result summary | Keep; continue malformed, protected, browser, and boundary QA |
| OCR Reader | Strong page-by-page copyable reader | Keep; add page navigation/search only after core QA |
| JPG to PDF | Ordered images; page size and margin were dropdowns | Use visual cards and show one representative page frame |
| Word to PDF | Honest text-reconstruction conversion | Add a short extracted-text preview before export |
| PowerPoint to PDF | Honest text-reconstruction conversion | Add slide count and first-slide text preview |
| Excel to PDF | Orientation was a dropdown | Use visual orientation cards and show sheet/page count |
| HTML to PDF | Page size was a dropdown | Use visual page-size cards and sanitized text preview |
| PDF to JPG | Quality slider only | Add page thumbnails, output count, and a representative quality preview |
| PDF to Word | One-action conversion | Show extracted page/text count before export |
| PDF to PowerPoint | One-action conversion | Show slide count before export |
| PDF to Excel | One-action conversion | Show sheet count before export |
| Archive PDF Rewrite | One-action conversion with accurate caveat | Keep; make the non-certified PDF/A caveat visible beside the action |
| Rotate PDF | Visual direction cards and a representative first-page orientation preview | Keep; continue real-document/mobile QA |
| Add Page Numbers | Visual position grid, accessible starting-number stepper, and first-page preview | Keep; continue real-document/mobile QA |
| Add Watermark | Text, visual opacity scale, and representative first-page preview | Keep; continue real-document/mobile QA |
| Crop PDF | Visible trim control and representative page-edge preview | Keep; continue boundary QA |
| Edit PDF | Visible text, position, size, and representative first-page preview | Build direct drag placement only if the preset positions test poorly |
| Add Image to PDF | Strong page canvas, placement, resize, and rotation | Keep; continue browser and touch QA |
| PDF Forms | Dynamic field-aware editor with search, paging, exact controls, change count, editable/flattened export choice, and optional advanced JSON | Keep; continue protected-form, browser, and unusual-widget QA |
| Unlock PDF | Clear password gate and previewable result | Keep |
| Protect PDF | Clear memory-only password control and previewable result | Keep |
| Sign PDF | Typed signature, date choice, and representative placement preview | Build final-page drag placement only if preset placement tests poorly |
| Redact PDF | Real per-page canvas with drag-to-draw, multiple movable/resizable areas, page counts, black/white preview, exact controls, undo, page/all reset, and flattened-result preview | Keep; continue touch, protected-input, and large-document QA |
| Compare PDF | Inline paginated text diff with original/revised order, changes/all views, exact counts, and optional scriptless HTML export | Keep; continue protected-input, mobile, and boundary QA |
| Local Summarizer | Visual length/format choices, exact extractive plan, and copyable in-tab summary with optional TXT | Keep; continue protected-input, short-source, mobile, and boundary QA |
| Translate PDF | Visual language choice and copyable reader | Keep; improve model/glossary status clarity |
| PDF to Markdown | Copyable text/preview tabs | Keep |
| Compress Image | Quality slider | Add before/after file-size estimate and representative image preview |
| Resize Image | Raw width number | Add width presets and stepper now; show original → target dimensions next |
| Crop Image | Aspect-ratio dropdown | Use visual ratio cards and add draggable crop preview |
| Convert Image | Strong visual format choices and quality feedback | Keep |
| JPG to GIF | Previously used hidden timing defaults | Expose timing and looping now; add animation preview next |
| Photo Editor | Previously used hidden neutral defaults | Expose adjustments/caption now; add live image canvas next |
| Upscale Image | Scale dropdown | Use visual 2×/4× cards and show target dimensions/memory warning |
| Remove Background | Edge/background dropdowns | Use visual choices and add transparent checkerboard preview |
| Watermark Image | Text, position dropdown, opacity slider | Use visual position buttons and add image preview |
| Meme Generator | Previously used hidden stock captions | Expose both captions now; add live image preview |
| Rotate Image | Rotation dropdown | Use visual direction cards and image preview |
| HTML to Image | Format dropdown and raw viewport number | Use format cards plus device-width presets and stepper |
| Blur Face | Strength slider only | Add detected-region preview and explicit review before export |

## Delivery waves

1. **Shared foundation:** visual choice cards, number steppers/presets, meaningful range endpoints, and safe single-result automatic download.
2. **PDF page editors:** Organize, representative single-operation previews, field-aware Forms, and per-page multi-region Redact are complete; continue targeted touch and large-document QA.
3. **PDF conversions and readers:** pre-export page/text/output feedback plus inline Compare and Summary results.
4. **Image canvas tools:** Resize, Crop, Photo Editor, Remove Background, Watermark, Meme, Rotate, and Blur Face live previews.
5. **Final QA:** keyboard, screen-reader names, mobile reflow, large/boundary files, repeated runs, preview, automatic download, offline reload, and browser coverage.

## Current audit limits

Representative desktop screens were captured for the shared settings/result patterns. Full accessibility behavior, touch gestures, real document variety, and every generated result still require interactive production QA; screenshots alone cannot establish those properties.
