// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import UTIF from "utif";
import {
  ARCHIVE_INPUT_LIMIT_BYTES,
  ARCHIVE_ITEM_LIMIT_BYTES,
  FileLimitError,
  GIF_FRAME_DELAY_DEFAULT_MS,
  GIF_FRAME_DELAY_MAX_MS,
  GIF_FRAME_DELAY_MIN_MS,
  GLOBAL_OUTPUT_LIMIT_BYTES,
  IMAGE_CROP_SCALE_MAX_PERCENT,
  IMAGE_CROP_SCALE_MIN_PERCENT,
  IMAGE_UPSCALE_SCALES,
  MAX_GENERATED_RESULTS,
  MAX_PDF_PASSWORD_CHARACTERS,
  PDF_PREVIEW_LIMITS,
  PHOTO_EDITOR_ADJUSTMENTS,
  PHOTO_EDITOR_TEXT_COLORS,
  assertComparisonLineCounts,
  assertExtractedTextLength,
  assertGeneratedItemCount,
  assertGeneratedPdfPageCount,
  assertImageDimensions,
  assertImagePixelTotal,
  assertMarkupLength,
  assertMinimumFileCount,
  assertOcrCharacterCount,
  assertOrganizedPageCount,
  assertOutputDimensions,
  assertOutputSize,
  assertPdfFormFieldCount,
  assertPdfFormMetadata,
  assertPresentationSlideCount,
  assertRasterDimensions,
  assertSpreadsheetComplexity,
  assertTextSettingLengths,
  countLogicalLines,
  describeToolLimits,
  getAnimatedGifPlan,
  getImageCropPlan,
  getImageUpscalePlan,
  getPhotoEditorPlan,
  getProportionalResizeDimensions,
  getTextSettingLimit,
  getToolLimits,
  summarizeRejections,
  validateFileSelection,
  validatePreflightMetadata,
} from "../src/lib/file-limits.js";
import { runBoundedLineDiff } from "../src/lib/diff-worker-client.js";
import { protectPdf, unlockPdf } from "../src/lib/libpdf.js";
import { createExtractPagePlan, createOrganizePagePlan, createResultBudget, createSplitPdfGroups, formatPageSelection, getAutomaticDownloadResult, isToolSearchShortcut, parsePageSelection, parseSplitPageSelection, retainResult, safeFileName, zipResults } from "../src/lib/file-utils.js";
import { runTool } from "../src/lib/processors.js";
import { matchesImageSignature } from "../src/lib/image-processors.js";
import { preflightToolFiles } from "../src/lib/file-preflight.js";
import { getTiffDimensions } from "../src/lib/tiff-utils.js";
import { clearSensitiveToolSettings } from "../src/lib/tool-settings.js";
import { rankToolSearchResults, tools } from "../src/tools.js";

const MiB = 1024 * 1024;

test("tool search uses Command or Control K without taking browser tab shortcuts", () => {
  assert.equal(isToolSearchShortcut({ metaKey: true, key: "k" }), true);
  assert.equal(isToolSearchShortcut({ ctrlKey: true, key: "K" }), true);
  assert.equal(isToolSearchShortcut({ metaKey: true, key: "1" }), false);
  assert.equal(isToolSearchShortcut({ ctrlKey: true, key: "9" }), false);
  assert.equal(isToolSearchShortcut({ metaKey: true, shiftKey: true, key: "k" }), false);
  assert.equal(isToolSearchShortcut({ key: "k" }), false);
});

test("automatic downloads are limited to one real generated result", () => {
  const first = { id: "one", name: "one.pdf", blob: new Blob(["one"], { type: "application/pdf" }) };
  const second = { id: "two", name: "two.pdf", blob: new Blob(["two"], { type: "application/pdf" }) };
  assert.strictEqual(getAutomaticDownloadResult([first]), first);
  assert.equal(getAutomaticDownloadResult([first], false), null);
  assert.equal(getAutomaticDownloadResult([first, second]), null);
  assert.equal(getAutomaticDownloadResult([{ ...first, noNewFile: true }]), null);
  assert.equal(getAutomaticDownloadResult([]), null);
});

test("Organize PDF preserves visual order, copies, omissions, and the central multiplier", () => {
  assert.deepEqual(createOrganizePagePlan("3,1,2,2", 4), {
    order: [2, 0, 1, 1],
    copiedPages: 1,
    omittedPages: 1,
  });
  assert.deepEqual(createOrganizePagePlan("all", 3).order, [0, 1, 2]);
  assert.throws(() => createOrganizePagePlan("", 0), /valid page count/);
  assert.throws(() => createOrganizePagePlan("1,1,1,1,1", 2), /2× the source page count \(4 here\)/);
});

function tool(slug, { name = slug, kind = "pdf", accepts = [".pdf"], batch = false } = {}) {
  return { slug, name, kind, accepts, batch, settings: [] };
}

function file(name, size) {
  return Object.freeze({ name, size });
}

test("tool policies expose the intended exact count and byte budgets", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(getToolLimits("merge-pdf")).filter(([key]) => ["minFiles", "maxFiles", "maxFileBytes", "maxTotalBytes", "maxPdfPagesTotal"].includes(key))),
    { minFiles: 2, maxFiles: 20, maxFileBytes: 50 * MiB, maxTotalBytes: 120 * MiB, maxPdfPagesTotal: 500 },
  );
  assert.deepEqual(PDF_PREVIEW_LIMITS, { maxOutputBytes: 128 * MiB, maxPages: 500, maxRasterPixels: 8_000_000, maxRasterEdge: 4096 });
  assert.equal(getToolLimits("compare-pdf").maxFiles, 2);
  assert.equal(getToolLimits("ocr-pdf").maxPdfPagesPerFile, 25);
  assert.equal(getToolLimits("remove-background").maxImagePixelsPerFile, 12_000_000);
  assert.equal(getToolLimits("compress-image").maxImagePixelsPerFile, 16_000_000);
  assert.equal(getToolLimits("pdf-to-markdown").maxTextPreviewCharacters, 250_000);
  assert.equal(getToolLimits("pdf-to-markdown").maxTextPreviewBlocks, 1_000);
  assert.equal(getToolLimits("redact-pdf").maxRedactionRegions, 200);
  assert.equal(getToolLimits("redact-pdf").maxRedactionRegionsPerPage, 50);
  assert.equal(getToolLimits("redact-pdf").maxRedactionSettingsCharacters, 64 * 1024);
  assert.equal(GLOBAL_OUTPUT_LIMIT_BYTES, 128 * MiB);
  assert.equal(ARCHIVE_INPUT_LIMIT_BYTES, 128 * MiB);
});

test("hero search ranks immediate tool matches without changing the catalog", () => {
  assert.equal(rankToolSearchResults(tools, "ocr")[0].slug, "ocr-pdf");
  assert.equal(rankToolSearchResults(tools, "merge")[0].slug, "merge-pdf");
  assert.equal(rankToolSearchResults(tools, "reader")[0].slug, "ocr-pdf");
  assert.equal(rankToolSearchResults(tools, "pdf", 2).length, 2);
  assert.deepEqual(rankToolSearchResults(tools, "", 4), []);
  assert.deepEqual(rankToolSearchResults(tools, "pdf", 0), []);
});

test("visible limit copy is generated from the same policy as validation", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  const copy = describeToolLimits(merge);
  assert.match(copy.primary, /2–20 PDF files/);
  assert.match(copy.primary, /50 MB each/);
  assert.match(copy.primary, /120 MB combined/);
  assert.match(copy.secondary, /500 pages combined/);
  assert.match(copy.secondary, /128 MB max result/);

  const split = tool("split-pdf", { name: "Split PDF" });
  const splitCopy = describeToolLimits(split);
  assert.equal(splitCopy.primary, "1 PDF file · 75 MB");
  assert.doesNotMatch(splitCopy.primary, /each|combined/);

  const redact = tool("redact-pdf", { name: "Redact PDF" });
  const redactCopy = describeToolLimits(redact);
  assert.match(redactCopy.secondary, /200 redaction areas · 50\/page/);
  assert.match(redactCopy.secondary, /65,536 characters max in redaction area data/);
});

test("Convert Image exposes one static PNG/JPG/WebP matrix with central safeguards", () => {
  const convert = tools.find(({ slug }) => slug === "convert-image");
  assert.deepEqual(convert.accepts, [".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff", ".svg", ".webp"]);
  assert.deepEqual(convert.output, [".png", ".jpg", ".webp"]);
  assert.deepEqual(convert.settings.find(({ key }) => key === "format")?.options.map(({ value }) => value), ["webp", "png", "jpg"]);
  assert.equal(tools.some(({ slug }) => slug === "convert-to-jpg"), false);
  assert.deepEqual(getToolLimits("convert-to-jpg"), getToolLimits("convert-image"));
  for (const name of ["camera.heic", "camera.heif", "camera.bmp"]) {
    const result = validateFileSelection(convert, [], [file(name, MiB)]);
    assert.equal(result.accepted.length, 0);
    assert.equal(result.rejected[0].code, "unsupported-type");
    assert.match(result.rejected[0].message, /accepts JPG\/PNG\/GIF\/TIFF\/SVG\/WEBP/s);
  }
  const limits = getToolLimits(convert);
  assert.equal(limits.maxFiles, 10);
  assert.equal(limits.maxImagePixelsPerFile, 12_000_000);
  assert.match(describeToolLimits(convert).secondary, /animated GIF\/PNG\/WebP: first frame only/);
});

test("JPG to GIF remains a distinct animation tool instead of an overlapping static converter", () => {
  const gif = tools.find(({ slug }) => slug === "convert-from-jpg");
  assert.equal(gif.name, "JPG to GIF");
  assert.deepEqual(gif.accepts, [".jpg", ".jpeg"]);
  assert.deepEqual(gif.output, [".gif"]);
  assert.deepEqual(gif.settings.map(({ key, type }) => [key, type]), [["delay", "range"], ["loop", "toggle"]]);
  assert.deepEqual(gif.settings.find(({ key }) => key === "delay"), {
    key: "delay",
    type: "range",
    label: "Time per image",
    default: GIF_FRAME_DELAY_DEFAULT_MS,
    min: GIF_FRAME_DELAY_MIN_MS,
    max: GIF_FRAME_DELAY_MAX_MS,
    step: 100,
    suffix: "ms",
    minLabel: "Faster",
    maxLabel: "Slower",
  });
  assert.equal(getToolLimits(gif).maxGifFrames, 20);

  assert.deepEqual(
    getAnimatedGifPlan([
      { name: "wide.jpg", width: 1200, height: 630 },
      { name: "square.jpg", width: 512, height: 512 },
      { name: "matching.jpg", width: 800, height: 420 },
    ], GIF_FRAME_DELAY_DEFAULT_MS, true, gif),
    {
      frameCount: 3,
      width: 1200,
      height: 630,
      delayMs: GIF_FRAME_DELAY_DEFAULT_MS,
      durationMs: 2700,
      loop: true,
      coverCroppedFrames: 1,
    },
  );
  assert.deepEqual(
    getAnimatedGifPlan([{ name: "large.jpg", width: 2800, height: 1400 }], 1500, false, gif),
    { frameCount: 1, width: 1400, height: 700, delayMs: 1500, durationMs: 1500, loop: false, coverCroppedFrames: 0 },
  );
  assert.throws(() => getAnimatedGifPlan([{ name: "frame.jpg", width: 1200, height: 630 }], GIF_FRAME_DELAY_MIN_MS - 1, true, gif), /100 to 3,000 milliseconds/);
  assert.throws(() => getAnimatedGifPlan([{ name: "frame.jpg", width: 1200, height: 630 }], GIF_FRAME_DELAY_MAX_MS + 1, true, gif), /100 to 3,000 milliseconds/);
  assert.throws(() => getAnimatedGifPlan([], GIF_FRAME_DELAY_DEFAULT_MS, true, gif), /at least one JPG frame/);
  assert.throws(() => getAnimatedGifPlan([{ name: "frame.jpg", width: 1200, height: 630 }], GIF_FRAME_DELAY_DEFAULT_MS, true, gif, 21), /1–20 frames/);
});

test("converted image signatures must match the requested output container", () => {
  assert.equal(matchesImageSignature(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"), true);
  assert.equal(matchesImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"), true);
  assert.equal(matchesImageSignature(new TextEncoder().encode("RIFF1234WEBP"), "image/webp"), true);
  assert.equal(matchesImageSignature(new TextEncoder().encode("RIFF1234WAVE"), "image/webp"), false);
  assert.equal(matchesImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), "image/jpeg"), false);
});

test("single-page TIFF dimensions are available before pixel decoding", async () => {
  const encoded = UTIF.encodeImage(new Uint8Array(3 * 2 * 4).fill(255), 3, 2);
  const ifd = UTIF.decode(encoded)[0];
  assert.equal(ifd.width, undefined);
  assert.deepEqual(getTiffDimensions(ifd), { width: 3, height: 2 });

  const convert = tools.find(({ slug }) => slug === "convert-image");
  const image = new File([encoded], "small.tiff", { type: "image/tiff" });
  const inspected = await preflightToolFiles(convert, [image]);
  assert.deepEqual(inspected.metadata, [{ name: "small.tiff", width: 3, height: 2 }]);
});

test("password settings clear without changing non-sensitive tool options", () => {
  const current = { password: "memory-only", quality: "balanced" };
  const settings = [{ key: "password", type: "password" }, { key: "quality", type: "select" }];
  assert.deepEqual(clearSensitiveToolSettings(current, settings), { password: "", quality: "balanced" });
  assert.deepEqual(current, { password: "memory-only", quality: "balanced" });
  const alreadyClear = { password: "", quality: "balanced" };
  assert.strictEqual(clearSensitiveToolSettings(alreadyClear, settings), alreadyClear);
});

test("selection accepts exact boundaries without mutating inputs", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  const existing = Object.freeze([file("a.pdf", 50 * MiB)]);
  const incoming = Object.freeze([file("b.pdf", 50 * MiB), file("c.pdf", 20 * MiB)]);
  const result = validateFileSelection(merge, existing, incoming);
  assert.equal(result.accepted.length, 2);
  assert.equal(result.rejected.length, 0);
  assert.equal(result.totalBytes, 120 * MiB);
  assert.deepEqual(existing.map((item) => item.name), ["a.pdf"]);
  assert.deepEqual(result.nextFiles.map((item) => item.name), ["a.pdf", "b.pdf", "c.pdf"]);
});

test("selection rejects empty, wrong-type, oversized, count, and combined-size inputs with filenames", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  assert.equal(validateFileSelection(merge, [], [file("empty.pdf", 0)]).rejected[0].code, "empty-file");
  assert.match(validateFileSelection(merge, [], [file("notes.docx", MiB)]).rejected[0].message, /notes\.docx.*accepts PDF/s);
  assert.match(validateFileSelection(merge, [], [file("huge.pdf", 50 * MiB + 1)]).rejected[0].message, /huge\.pdf.*50 MB/s);

  const twentyOne = Array.from({ length: 21 }, (_, index) => file(`${index + 1}.pdf`, MiB));
  const countResult = validateFileSelection(merge, [], twentyOne);
  assert.equal(countResult.accepted.length, 20);
  assert.equal(countResult.rejected[0].code, "too-many-files");
  assert.match(countResult.rejected[0].message, /21\.pdf/);

  const totalResult = validateFileSelection(merge, [file("existing.pdf", 100 * MiB)], [file("overflow.pdf", 21 * MiB)]);
  assert.equal(totalResult.accepted.length, 0);
  assert.equal(totalResult.rejected[0].code, "total-too-large");
  assert.match(totalResult.rejected[0].message, /overflow\.pdf.*120 MB/s);

  for (const invalidSize of [Number.NaN, Number.POSITIVE_INFINITY, -1, undefined]) {
    assert.equal(validateFileSelection(merge, [], [file("invalid.pdf", invalidSize)]).rejected[0].code, "invalid-size");
  }
});

test("rejection summaries stay compact while reporting partial acceptance", () => {
  const rejected = [
    { code: "unsupported-type", message: "one" },
    { code: "unsupported-type", message: "two" },
    { code: "file-too-large", message: "three" },
    { code: "total-too-large", message: "four" },
  ];
  assert.equal(summarizeRejections(2, rejected), "2 files were added; 4 files were not added: 2 unsupported types, 1 over the per-file size limit, 1 over the combined-size limit.");
  assert.equal(summarizeRejections(1, rejected, { acceptedAction: "replaced" }), "The previous file was replaced; 4 files were not added: 2 unsupported types, 1 over the per-file size limit, 1 over the combined-size limit.");
});

test("minimum count and optional HTML policies are enforced from the same registry", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  const compare = tool("compare-pdf", { name: "Compare PDF" });
  const html = tool("html-to-pdf", { name: "HTML to PDF", accepts: [".html", ".htm"] });
  assert.throws(() => assertMinimumFileCount(merge, 1), /Add 1 more/);
  assert.throws(() => assertMinimumFileCount(compare, 0), /Add 2 more/);
  assert.doesNotThrow(() => assertMinimumFileCount(html, 0));
  assert.deepEqual(validateFileSelection(html, [], []).nextFiles, []);
  assert.doesNotThrow(() => assertMarkupLength(html, "x".repeat(500_000)));
  assert.throws(() => assertMarkupLength(html, "x".repeat(500_001)), /500,001 characters.*500,000/s);
  assert.equal(getTextSettingLimit(html, "html"), 500_000);
  for (const slug of ["split-pdf", "remove-pdf-pages", "extract-pdf-pages", "organize-pdf"]) {
    const subject = tool(slug, { name: slug, accepts: [".pdf"] });
    assert.equal(getToolLimits(subject).maxPageSelectionEntries, 2_000);
    assert.match(describeToolLimits(subject).secondary, /2,000 expanded page-selection entries max/);
  }
});

test("HTML tools require a local file or nonblank pasted markup before processing", async () => {
  const html = tool("html-to-pdf", { name: "HTML to PDF", accepts: [".html", ".htm"] });
  await assert.rejects(
    () => runTool(html, [], { html: "   " }),
    (error) => error instanceof FileLimitError
      && error.code === "missing-html-input"
      && /HTML file or pasted markup/.test(error.message),
  );

  const htmlImage = tool("html-to-image", { name: "HTML to Image", kind: "image", accepts: [".html", ".htm"] });
  assert.match(describeToolLimits(htmlImage).secondary, /12 MP · 8,192 px wide · 4,096 px tall capture/);
});

test("every registered text setting accepts its exact cap and rejects one extra character", () => {
  const policies = {
    "split-pdf": { pages: 4096, customBreaks: 4096 },
    "remove-pdf-pages": { pages: 4096 },
    "extract-pdf-pages": { pages: 4096 },
    "organize-pdf": { order: 4096 },
    "watermark-pdf": { text: 200 },
    "edit-pdf": { text: 500 },
    "sign-pdf": { name: 200 },
    "pdf-forms": { values: 256 * 1024 },
    "redact-pdf": { regions: 64 * 1024 },
    "unlock-pdf": { password: 1024 },
    "protect-pdf": { password: 1024 },
    "watermark-image": { text: 500 },
    "photo-editor": { text: 500 },
    "meme-generator": { topText: 500, bottomText: 500 },
  };

  for (const [slug, settingLimits] of Object.entries(policies)) {
    const subject = {
      ...tool(slug, {
        name: slug.replaceAll("-", " "),
        kind: slug.includes("image") || slug === "photo-editor" || slug === "meme-generator" ? "image" : "pdf",
      }),
      settings: Object.keys(settingLimits).map((key) => ({ key, label: `${key} label` })),
    };

    for (const [key, maxLength] of Object.entries(settingLimits)) {
      assert.equal(getTextSettingLimit(subject, key), maxLength, `${slug}.${key} should expose its UI cap`);
      assert.doesNotThrow(() => assertTextSettingLengths(subject, { [key]: "x".repeat(maxLength) }));
      assert.throws(
        () => assertTextSettingLengths(subject, { [key]: "x".repeat(maxLength + 1) }),
        (error) => error instanceof FileLimitError
          && error.code === "text-setting-too-long"
          && error.message.includes(`${key} label`)
          && error.message.includes(maxLength.toLocaleString()),
        `${slug}.${key} should reject a one-character overflow`,
      );
    }
  }

  assert.equal(getTextSettingLimit("compress-pdf", "quality"), undefined);
  assert.doesNotThrow(() => assertTextSettingLengths(tool("compress-pdf"), { quality: "strong" }));
});

test("Office policies expose every archive-expansion guard in the picker copy", () => {
  const word = tool("word-to-pdf", { name: "Word to PDF", accepts: [".docx"] });
  const limits = getToolLimits(word);
  assert.equal(limits.maxArchiveEntries, 2000);
  assert.equal(limits.maxExpandedArchiveItemBytes, 25 * MiB);
  assert.equal(limits.maxExpandedArchiveBytes, 100 * MiB);
  assert.equal(limits.maxArchiveExpansionRatio, 20);
  const copy = describeToolLimits(word).secondary;
  assert.match(copy, /2,000 internal items/);
  assert.match(copy, /25 MB per expanded item/);
  assert.match(copy, /100 MB expanded total/);
  assert.match(copy, /20× max expansion/);
});

test("processor-amplification budgets are exact and visible from the shared policy", () => {
  const word = tool("word-to-pdf", { name: "Word to PDF", accepts: [".docx"] });
  const powerpoint = tool("powerpoint-to-pdf", { name: "PowerPoint to PDF", accepts: [".pptx"] });
  const excel = tool("excel-to-pdf", { name: "Excel to PDF", accepts: [".xlsx"] });
  const compare = tool("compare-pdf", { name: "Compare PDF" });
  const forms = tool("pdf-forms", { name: "PDF Forms" });
  const organize = tool("organize-pdf", { name: "Organize PDF" });

  assert.equal(getToolLimits(word).maxExtractedCharactersTotal, 2_000_000);
  assert.equal(getToolLimits(word).maxGeneratedPdfPages, 500);
  assert.deepEqual(
    Object.fromEntries(Object.entries(getToolLimits(powerpoint)).filter(([key]) => ["maxExtractedCharactersTotal", "maxPresentationSlides", "maxGeneratedPdfPages"].includes(key))),
    { maxExtractedCharactersTotal: 1_000_000, maxGeneratedPdfPages: 500, maxPresentationSlides: 250 },
  );
  assert.equal(getToolLimits(excel).maxExtractedCharactersTotal, 2_000_000);
  assert.equal(getToolLimits(excel).maxSpreadsheetSheets, 100);
  assert.equal(getToolLimits(excel).maxSpreadsheetCellSlots, 500_000);
  assert.equal(getToolLimits(forms).maxPdfFormFields, 1_000);
  assert.equal(getToolLimits(forms).maxPdfFormOptionsPerField, 500);
  assert.equal(getToolLimits(forms).maxPdfFormOptionsTotal, 5_000);
  assert.equal(getToolLimits(forms).maxPdfFormFieldNameCharacters, 2_048);
  assert.equal(getToolLimits(forms).maxPdfFormValueCharacters, 10_000);
  assert.equal(getToolLimits(forms).maxPdfFormMetadataCharacters, 512_000);
  assert.equal(getToolLimits(organize).maxOrganizedPageMultiplier, 2);
  assert.deepEqual(
    Object.fromEntries(Object.entries(getToolLimits(compare)).filter(([key]) => ["maxExtractedLinesPerFile", "maxExtractedLinesTotal", "maxDiffEditLength", "maxDiffMilliseconds", "maxDiffHardMilliseconds"].includes(key))),
    { maxExtractedLinesPerFile: 25_000, maxExtractedLinesTotal: 40_000, maxDiffEditLength: 2_000, maxDiffMilliseconds: 3_000, maxDiffHardMilliseconds: 4_000 },
  );

  assert.match(describeToolLimits(powerpoint).secondary, /1,000,000 extracted characters.*250 slides.*500 generated PDF pages/s);
  assert.match(describeToolLimits(excel).secondary, /100 sheets.*500,000 used-range cells.*500 generated PDF pages/s);
  assert.match(describeToolLimits(forms).secondary, /1,000 form fields.*500 choices\/field.*5,000 field choices total.*2,048 characters\/field name.*10,000 characters\/field value.*512,000 field text\/choice characters total/);
  assert.match(describeToolLimits(organize).secondary, /2× source pages max output/);
  assert.match(describeToolLimits(compare).secondary, /25,000 extracted lines\/file.*40,000 extracted lines combined.*2,000 line edits max.*3 s diff budget.*4 s hard stop/s);
});

test("central processor guards accept each exact boundary and reject one-unit overflow", () => {
  assert.doesNotThrow(() => assertExtractedTextLength(2_000_000, "word-to-pdf", "report.docx"));
  assert.throws(() => assertExtractedTextLength(2_000_001, "word-to-pdf", "report.docx"), /2,000,001 extracted characters.*2,000,000/s);
  assert.doesNotThrow(() => assertPresentationSlideCount(250));
  assert.throws(() => assertPresentationSlideCount(251), /251 slides.*250/s);
  assert.doesNotThrow(() => assertSpreadsheetComplexity(100, 500_000));
  assert.throws(() => assertSpreadsheetComplexity(101, 500_000), /101 sheets.*100/s);
  assert.throws(() => assertSpreadsheetComplexity(100, 500_001), /500,001 cells.*500,000/s);
  assert.doesNotThrow(() => assertGeneratedPdfPageCount(500, "word-to-pdf"));
  assert.throws(() => assertGeneratedPdfPageCount(501, "word-to-pdf"), /501 PDF pages.*500/s);
  assert.doesNotThrow(() => assertPdfFormFieldCount(1_000));
  assert.throws(() => assertPdfFormFieldCount(1_001), /1,001 form fields.*1,000/s);
  assert.doesNotThrow(() => assertOrganizedPageCount(1_000, 500));
  assert.throws(() => assertOrganizedPageCount(1_001, 500), /1,001 pages.*2×.*1,000/s);
  assert.doesNotThrow(() => assertOcrCharacterCount(16_800, 1));
  assert.throws(() => assertOcrCharacterCount(16_801, 1), /16,801 characters.*16,800/s);
  assert.doesNotThrow(() => assertImagePixelTotal(240_000_000, "jpg-to-pdf"));
  assert.throws(() => assertImagePixelTotal(240_000_001, "jpg-to-pdf"), /240\.000001 MP.*240 MP/s);
});

test("PDF form metadata budgets accept exact limits and reject one extra", () => {
  const exact = {
    optionCount: 5_000,
    metadataCharacters: 512_000,
    maxFieldNameCharacters: 2_048,
    maxFieldValueCharacters: 10_000,
    maxOptionsPerField: 500,
  };
  assert.doesNotThrow(() => assertPdfFormMetadata(exact));
  assert.throws(() => assertPdfFormMetadata({ ...exact, optionCount: 5_001 }), /5,001 field choices.*5,000/);
  assert.throws(() => assertPdfFormMetadata({ ...exact, metadataCharacters: 512_001 }), /512,001 field-name, value, and choice characters.*512,000/);
  assert.throws(() => assertPdfFormMetadata({ ...exact, maxFieldNameCharacters: 2_049 }), /2,049-character field name.*2,048/);
  assert.throws(() => assertPdfFormMetadata({ ...exact, maxFieldValueCharacters: 10_001 }), /10,001-character field value.*10,000/);
  assert.throws(() => assertPdfFormMetadata({ ...exact, maxOptionsPerField: 501 }), /501 choices.*500 choices per field/);
});

test("Compare line counting matches jsdiff tokens and enforces per-file plus combined caps", () => {
  assert.equal(countLogicalLines(""), 0);
  assert.equal(countLogicalLines("one"), 1);
  assert.equal(countLogicalLines("one\n"), 1);
  assert.equal(countLogicalLines("one\ntwo"), 2);
  const twentyThousandLines = `${"x\n".repeat(20_000)}`;
  const twentyFiveThousandLines = `${"x\n".repeat(25_000)}`;
  assert.deepEqual(assertComparisonLineCounts(twentyThousandLines, twentyThousandLines), { leftLines: 20_000, rightLines: 20_000, totalLines: 40_000 });
  assert.throws(() => assertComparisonLineCounts(twentyFiveThousandLines, `${"x\n".repeat(15_001)}`), /40,001 extracted lines combined.*40,000/s);
  assert.throws(() => assertComparisonLineCounts(`${"x\n".repeat(25_001)}`, "x"), /first PDF contains 25,001.*25,000/s);
});

test("Compare worker uses policy budgets, terminates on success, and maps budget aborts", async () => {
  const makeWorker = (response) => {
    const worker = {
      terminated: false,
      posted: null,
      postMessage(payload) {
        this.posted = payload;
        queueMicrotask(() => this.onmessage({ data: response }));
      },
      terminate() { this.terminated = true; },
    };
    queueMicrotask(() => worker.onmessage({ data: { type: "ready" } }));
    return worker;
  };

  const successWorker = makeWorker({ type: "result", changes: [{ value: "same" }] });
  let settled = false;
  const success = runBoundedLineDiff("same", "same", getToolLimits("compare-pdf"), { createWorker: () => successWorker }).then((value) => {
    settled = true;
    return value;
  });
  assert.equal(settled, false, "comparison must settle asynchronously");
  assert.deepEqual(await success, [{ value: "same" }]);
  assert.equal(successWorker.terminated, true);
  assert.equal(successWorker.posted.maxEditLength, 2_000);
  assert.equal(successWorker.posted.timeoutMs, 3_000);

  const limitedWorker = makeWorker({ type: "limited" });
  await assert.rejects(
    () => runBoundedLineDiff("old", "new", getToolLimits("compare-pdf"), { createWorker: () => limitedWorker }),
    (error) => error instanceof FileLimitError && error.code === "comparison-complexity-limit" && /2,000 line edits.*3 seconds/s.test(error.message),
  );
  assert.equal(limitedWorker.terminated, true);

  const hangingWorker = makeWorker({ type: "ignored" });
  hangingWorker.postMessage = (payload) => { hangingWorker.posted = payload; };
  let scheduledMilliseconds;
  let clearedTimer;
  await assert.rejects(
    () => runBoundedLineDiff("old", "new", getToolLimits("compare-pdf"), {
      createWorker: () => hangingWorker,
      setTimer: (callback, milliseconds) => {
        scheduledMilliseconds = milliseconds;
        queueMicrotask(callback);
        return 42;
      },
      clearTimer: (timer) => { clearedTimer = timer; },
    }),
    (error) => error instanceof FileLimitError && error.code === "comparison-hard-timeout" && /4 seconds/s.test(error.message),
  );
  assert.equal(scheduledMilliseconds, 4_000);
  assert.equal(clearedTimer, 42);
  assert.equal(hangingWorker.terminated, true);
});

test("Unlock and Protect expose and enforce the shared 1,024-character password cap", () => {
  assert.equal(MAX_PDF_PASSWORD_CHARACTERS, 1_024);
  for (const [slug, name] of [["unlock-pdf", "Unlock PDF"], ["protect-pdf", "Protect PDF"]]) {
    const subject = { ...tool(slug, { name }), settings: [{ key: "password", label: "Password" }] };
    assert.equal(getTextSettingLimit(subject, "password"), MAX_PDF_PASSWORD_CHARACTERS);
    assert.doesNotThrow(() => assertTextSettingLengths(subject, { password: "x".repeat(1_024) }));
    assert.throws(() => assertTextSettingLengths(subject, { password: "x".repeat(1_025) }), /1,025 characters.*1,024/s);
    assert.match(describeToolLimits(subject).secondary, /1,024 characters max in (current|new) password/);
  }
});

test("the libpdf adapter rejects oversized passwords before parsing PDF bytes", async () => {
  for (const operation of [unlockPdf, protectPdf]) {
    await assert.rejects(
      () => operation(new Uint8Array([1]), "x".repeat(1_025)),
      (error) => error.code === "PASSWORD_TOO_LONG" && /1,025 characters.*1,024/s.test(error.message),
    );
  }
});

test("Repair, Unlock, and Protect enforce their exact byte and page boundaries", () => {
  const policies = [
    ["repair-pdf", "Repair PDF", 50 * MiB, 300],
    ["unlock-pdf", "Unlock PDF", 75 * MiB, 500],
    ["protect-pdf", "Protect PDF", 75 * MiB, 500],
  ];

  for (const [slug, name, maxBytes, maxPages] of policies) {
    const subject = tool(slug, { name });
    const limits = getToolLimits(subject);
    assert.equal(limits.maxFileBytes, maxBytes);
    assert.equal(limits.maxTotalBytes, maxBytes);
    assert.equal(limits.maxPdfPagesPerFile, maxPages);

    const exactSelection = validateFileSelection(subject, [], [file(`${slug}-exact.pdf`, maxBytes)]);
    assert.equal(exactSelection.accepted.length, 1);
    assert.equal(exactSelection.rejected.length, 0);
    assert.doesNotThrow(() => validatePreflightMetadata(subject, [{ name: `${slug}-exact.pdf`, pdfPages: maxPages }]));

    const byteOverflow = validateFileSelection(subject, [], [file(`${slug}-large.pdf`, maxBytes + 1)]);
    assert.equal(byteOverflow.accepted.length, 0);
    assert.equal(byteOverflow.rejected[0].code, "file-too-large");
    assert.match(byteOverflow.rejected[0].message, new RegExp(`${slug}-large\\.pdf`));
    assert.throws(
      () => validatePreflightMetadata(subject, [{ name: `${slug}-long.pdf`, pdfPages: maxPages + 1 }]),
      (error) => error instanceof FileLimitError
        && error.code === "too-many-pages"
        && error.message.includes(`${slug}-long.pdf`),
    );
  }
});

test("PDF metadata accepts the merge boundary and rejects per-file or combined overflow", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  assert.deepEqual(validatePreflightMetadata(merge, [
    { name: "a.pdf", pdfPages: 250 },
    { name: "b.pdf", pdfPages: 250 },
  ]), { totalPages: 500, totalPixels: 0 });
  assert.throws(
    () => validatePreflightMetadata(merge, [{ name: "large.pdf", pdfPages: 301 }]),
    (error) => error instanceof FileLimitError && error.code === "too-many-pages" && /large\.pdf/.test(error.message),
  );
  assert.throws(
    () => validatePreflightMetadata(merge, [{ name: "a.pdf", pdfPages: 300 }, { name: "b.pdf", pdfPages: 201 }]),
    (error) => error.code === "too-many-total-pages" && /b\.pdf/.test(error.message),
  );
  for (const pdfPages of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => validatePreflightMetadata(merge, [{ name: "invalid.pdf", pdfPages }]),
      (error) => error instanceof FileLimitError && error.code === "invalid-page-count" && /invalid\.pdf/.test(error.message),
    );
  }
});

test("image and raster guards accept exact pixel limits and reject one-pixel overflow", () => {
  const imageLimits = getToolLimits("compress-image");
  assert.doesNotThrow(() => assertImageDimensions(4000, 4000, imageLimits, "exact.png"));
  assert.throws(() => assertImageDimensions(4001, 4000, imageLimits, "wide.png"), /wide\.png.*16 MP/s);
  assert.throws(() => assertImageDimensions(8193, 1, imageLimits, "edge.png"), /8,192 px/s);

  const rasterLimits = getToolLimits("compress-pdf");
  assert.doesNotThrow(() => assertRasterDimensions(4000, 4000, rasterLimits, "page 1"));
  assert.throws(() => assertRasterDimensions(4001, 4000, rasterLimits, "page 2"), /page 2.*safe canvas limit/s);
  assert.doesNotThrow(() => assertOutputDimensions(4000, 4000, imageLimits, "output"));
  assert.throws(() => assertOutputDimensions(Number.NaN, 4000, imageLimits, "output"), /invalid dimensions/);
  assert.throws(() => assertRasterDimensions(0, 4000, rasterLimits, "page 3"), /invalid render dimensions/);
});

test("Resize Image derives proportional targets from the central output policy", () => {
  assert.deepEqual(getProportionalResizeDimensions(1200, 630, 640, "resize-image", "fixture.jpg after resizing"), { width: 640, height: 336 });
  assert.deepEqual(getProportionalResizeDimensions(1200, 630, 1920, "resize-image", "fixture.jpg after resizing"), { width: 1920, height: 1008 });
  assert.deepEqual(getProportionalResizeDimensions(8192, 1, 8192, "resize-image", "wide.png after resizing"), { width: 8192, height: 1 });
  assert.throws(
    () => getProportionalResizeDimensions(1200, 630, 0, "resize-image", "fixture.jpg after resizing"),
    (error) => error instanceof FileLimitError && error.code === "invalid-output-dimensions",
  );
  assert.throws(
    () => getProportionalResizeDimensions(100, 8192, 640, "resize-image", "tall.png after resizing"),
    (error) => error instanceof FileLimitError && error.code === "output-dimensions-too-large",
  );
});

test("Resize Image preflight exposes exact target dimensions before processing", async () => {
  const resize = tools.find(({ slug }) => slug === "resize-image");
  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const image = new File([onePixelPng], "pixel.png", { type: "image/png" });
  const inspected = await preflightToolFiles(resize, [image], { width: 640 });
  assert.deepEqual(inspected.metadata, [{ name: "pixel.png", width: 1, height: 1, format: "png", animated: false, outputWidth: 640, outputHeight: 640 }]);
  await assert.rejects(
    preflightToolFiles(resize, [image], { width: 8192 }),
    (error) => error instanceof FileLimitError && error.code === "output-dimensions-too-large",
  );
});

test("Upscale Image plans exact 2× and 4× dimensions, pixels, and raw canvas bytes", () => {
  assert.deepEqual(IMAGE_UPSCALE_SCALES, [2, 4]);
  assert.deepEqual(
    getImageUpscalePlan(1200, 630, 2, "upscale-image", "fixture.jpg after upscaling"),
    { sourceWidth: 1200, sourceHeight: 630, width: 2400, height: 1260, scale: 2, pixelMultiplier: 4, outputPixels: 3_024_000, outputRgbaBytes: 12_096_000 },
  );
  assert.deepEqual(
    getImageUpscalePlan(1200, 630, 4, "upscale-image", "fixture.jpg after upscaling"),
    { sourceWidth: 1200, sourceHeight: 630, width: 4800, height: 2520, scale: 4, pixelMultiplier: 16, outputPixels: 12_096_000, outputRgbaBytes: 48_384_000 },
  );
  assert.deepEqual(
    getImageUpscalePlan(2000, 2000, 2, "upscale-image", "boundary.png after upscaling"),
    { sourceWidth: 2000, sourceHeight: 2000, width: 4000, height: 4000, scale: 2, pixelMultiplier: 4, outputPixels: 16_000_000, outputRgbaBytes: 64_000_000 },
  );
  assert.throws(
    () => getImageUpscalePlan(1200, 630, 3, "upscale-image", "fixture.jpg after upscaling"),
    (error) => error instanceof FileLimitError && error.code === "invalid-upscale-scale",
  );
  assert.throws(
    () => getImageUpscalePlan(2000, 2000, 4, "upscale-image", "large.png after upscaling"),
    (error) => error instanceof FileLimitError && error.code === "output-dimensions-too-large",
  );
});

test("Upscale Image preflight and catalog use the same exact scale policy", async () => {
  const upscale = tools.find(({ slug }) => slug === "upscale-image");
  const scaleSetting = upscale.settings.find(({ key }) => key === "scale");
  assert.equal(scaleSetting.default, IMAGE_UPSCALE_SCALES[0]);
  assert.deepEqual(scaleSetting.options.map(({ value }) => value), IMAGE_UPSCALE_SCALES);

  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const image = new File([onePixelPng], "pixel.png", { type: "image/png" });
  const inspected = await preflightToolFiles(upscale, [image], { scale: 4 });
  assert.deepEqual(inspected.metadata, [{ name: "pixel.png", width: 1, height: 1, format: "png", animated: false, outputWidth: 4, outputHeight: 4, scale: 4, outputPixels: 16 }]);
  await assert.rejects(
    preflightToolFiles(upscale, [image], { scale: 3 }),
    (error) => error instanceof FileLimitError && error.code === "invalid-upscale-scale",
  );
});

test("Crop Image derives an exact movable crop from the central output policy", () => {
  assert.equal(IMAGE_CROP_SCALE_MIN_PERCENT, 40);
  assert.equal(IMAGE_CROP_SCALE_MAX_PERCENT, 100);
  assert.deepEqual(
    getImageCropPlan(1200, 630, "1:1", 100, 50, 50, "crop-image", "fixture.jpg after cropping"),
    { x: 285, y: 0, width: 630, height: 630, sourceWidth: 1200, sourceHeight: 630, aspectRatio: "1:1", cropScale: 100, focusX: 50, focusY: 50, retainedPercent: 53 },
  );
  assert.deepEqual(
    getImageCropPlan(1200, 630, "1:1", 80, 0, 100, "crop-image", "fixture.jpg after cropping"),
    { x: 0, y: 126, width: 504, height: 504, sourceWidth: 1200, sourceHeight: 630, aspectRatio: "1:1", cropScale: 80, focusX: 0, focusY: 100, retainedPercent: 34 },
  );
  const wide = getImageCropPlan(1200, 630, "16:9", 100, 100, 50, "crop-image", "fixture.jpg after cropping");
  assert.deepEqual({ x: wide.x, y: wide.y, width: wide.width, height: wide.height, retainedPercent: wide.retainedPercent }, { x: 80, y: 0, width: 1120, height: 630, retainedPercent: 93 });
  assert.throws(
    () => getImageCropPlan(1200, 630, "1:1", 39, 50, 50, "crop-image", "fixture.jpg after cropping"),
    (error) => error instanceof FileLimitError && error.code === "invalid-crop-settings",
  );
  assert.throws(
    () => getImageCropPlan(1200, 630, "1:1", 100, -1, 50, "crop-image", "fixture.jpg after cropping"),
    (error) => error instanceof FileLimitError && error.code === "invalid-crop-settings",
  );
});

test("Crop Image preflight exposes the exact source rectangle before processing", async () => {
  const crop = tools.find(({ slug }) => slug === "crop-image");
  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const image = new File([onePixelPng], "pixel.png", { type: "image/png" });
  const inspected = await preflightToolFiles(crop, [image], { aspectRatio: "1:1", cropScale: 100, focusX: 50, focusY: 50 });
  assert.deepEqual(inspected.metadata, [{ name: "pixel.png", width: 1, height: 1, format: "png", animated: false, outputWidth: 1, outputHeight: 1, cropX: 0, cropY: 0 }]);
  await assert.rejects(
    preflightToolFiles(crop, [image], { aspectRatio: "1:1", cropScale: 101, focusX: 50, focusY: 50 }),
    (error) => error instanceof FileLimitError && error.code === "invalid-crop-settings",
  );
});

test("Photo Editor plans exact local adjustments, captions, and unchanged output", () => {
  assert.deepEqual(PHOTO_EDITOR_ADJUSTMENTS, {
    brightness: { min: 50, max: 150, default: 100 },
    contrast: { min: 50, max: 150, default: 100 },
    saturation: { min: 0, max: 180, default: 100 },
    warmth: { min: 0, max: 60, default: 0 },
  });
  assert.deepEqual(PHOTO_EDITOR_TEXT_COLORS, ["#ffffff", "#14201d"]);
  assert.deepEqual(
    getPhotoEditorPlan(1200, 630, {}, "photo-editor", "fixture.jpg after editing"),
    {
      width: 1200,
      height: 630,
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      caption: "",
      captionCharacters: 0,
      textColor: "#ffffff",
      adjusted: false,
      changed: false,
    },
  );
  assert.deepEqual(
    getPhotoEditorPlan(1200, 630, { brightness: 115, contrast: 105, saturation: 110, warmth: 25, text: "Edited locally", textColor: "#14201d" }, "photo-editor", "fixture.jpg after editing"),
    {
      width: 1200,
      height: 630,
      brightness: 115,
      contrast: 105,
      saturation: 110,
      warmth: 25,
      caption: "Edited locally",
      captionCharacters: 14,
      textColor: "#14201d",
      adjusted: true,
      changed: true,
    },
  );
});

test("Photo Editor rejects invalid adjustments and caption settings before rendering", () => {
  for (const [settings, code] of [
    [{ brightness: PHOTO_EDITOR_ADJUSTMENTS.brightness.min - 1 }, "invalid-photo-adjustment"],
    [{ warmth: PHOTO_EDITOR_ADJUSTMENTS.warmth.max + 1 }, "invalid-photo-adjustment"],
    [{ contrast: 100.5 }, "invalid-photo-adjustment"],
    [{ textColor: "#ff0000" }, "invalid-photo-caption-color"],
    [{ text: "x".repeat(501) }, "text-setting-too-long"],
  ]) {
    assert.throws(
      () => getPhotoEditorPlan(1200, 630, settings, "photo-editor", "fixture.jpg after editing"),
      (error) => error instanceof FileLimitError && error.code === code,
    );
  }
});

test("Photo Editor catalog controls use the central adjustment and caption policy", () => {
  const photoEditor = tools.find(({ slug }) => slug === "photo-editor");
  const settingsByKey = Object.fromEntries(photoEditor.settings.map((setting) => [setting.key, setting]));
  for (const [key, policy] of Object.entries(PHOTO_EDITOR_ADJUSTMENTS)) {
    assert.deepEqual(
      { min: settingsByKey[key].min, max: settingsByKey[key].max, default: settingsByKey[key].default },
      policy,
    );
  }
  assert.equal(getTextSettingLimit(photoEditor, "text"), 500);
  assert.deepEqual(settingsByKey.textColor.options.map(({ value, label }) => ({ value, label })), [
    { value: "#ffffff", label: "Light" },
    { value: "#14201d", label: "Dark" },
  ]);
});

test("aggregate decoded-pixel budgets reject the file that crosses the boundary", () => {
  const imageTool = tool("compress-image", { name: "Compress Image", kind: "image", accepts: [".jpg", ".jpeg", ".png", ".webp"], batch: true });
  const exact = Array.from({ length: 10 }, (_, index) => ({ name: `${index}.png`, width: 4000, height: 4000 }));
  assert.equal(validatePreflightMetadata(imageTool, exact).totalPixels, 160_000_000);
  assert.throws(
    () => validatePreflightMetadata(imageTool, [...exact, { name: "overflow.png", width: 4000, height: 4000 }]),
    (error) => error.code === "too-many-total-pixels" && /overflow\.png/.test(error.message),
  );
});

test("image-only safeguards are visible and generated names are not silently truncated", () => {
  const blur = tool("blur-face", { name: "Blur Face", kind: "image", accepts: [".jpg", ".png", ".webp"], batch: true });
  assert.equal(getToolLimits(blur).maxDetectedFaces, 40);
  assert.match(describeToolLimits(blur).secondary, /40 detected faces max/);

  const convert = tool("convert-to-jpg", { name: "Convert to JPG", kind: "image", accepts: [".gif", ".tiff"], batch: true });
  const copy = describeToolLimits(convert).secondary;
  assert.match(copy, /1 image per TIFF file/);
  assert.match(copy, /animated GIF\/PNG\/WebP: first frame only/);

  const compress = tool("compress-image", { name: "Compress Image", kind: "image", accepts: [".jpg", ".png", ".webp"], batch: true });
  assert.match(describeToolLimits(compress).secondary, /animated PNG\/WebP: first frame only/);

  const longName = "a".repeat(180);
  assert.equal(safeFileName(longName), longName);
});

test("generated item, page-selection, and output guards fail before unsafe expansion", () => {
  assert.doesNotThrow(() => assertGeneratedItemCount(100, "split-pdf", "PDF files"));
  assert.throws(() => assertGeneratedItemCount(101, "split-pdf", "PDF files"), /101 PDF files.*safe limit is 100/s);
  assert.doesNotThrow(() => assertOutputSize(128 * MiB, "result.pdf"));
  assert.throws(() => assertOutputSize(128 * MiB + 1, "result.pdf"), /result\.pdf.*128 MB/s);
  assert.throws(() => assertOutputSize(Number.NaN, "result.pdf"), /invalid size/);
  assert.throws(() => assertGeneratedItemCount(Number.NaN, "split-pdf"), /number of generated results is invalid/);
  assert.throws(() => parsePageSelection("1,".repeat(2050), 500), /4,096 characters/);
  assert.throws(() => parsePageSelection("1-500,1-500,1-500,1-500,1-500", 500, "all", true), /beyond 2,000 entries/);
});

test("Split PDF uses strict, reversible page rules that round-trip with the visual picker", () => {
  assert.deepEqual(parseSplitPageSelection("1-3, 6, 8-7, 2", 8), [0, 1, 2, 5, 7, 6]);
  assert.deepEqual(parseSplitPageSelection("all", 4), [0, 1, 2, 3]);
  assert.equal(formatPageSelection([0, 1, 2, 5, 7, 6]), "1-3,6-8");
  assert.throws(() => parseSplitPageSelection("1,,3", 8), /empty entry.*not a valid page or range/s);
  assert.throws(() => parseSplitPageSelection("2-four", 8), /not a valid page or range/s);
  assert.throws(() => parseSplitPageSelection("9", 8), /outside this 8-page PDF/s);
  assert.throws(() => parseSplitPageSelection("", 8), /Choose at least one page/s);
});

test("Split PDF presets create understandable output groups and custom dividers fail closed", () => {
  assert.deepEqual(createSplitPdfGroups("half", 6), [[0, 1, 2], [3, 4, 5]]);
  assert.deepEqual(createSplitPdfGroups("half", 5), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(createSplitPdfGroups("every2", 5), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(createSplitPdfGroups("odd", 6), [[0, 2, 4]]);
  assert.deepEqual(createSplitPdfGroups("even", 6), [[1, 3, 5]]);
  assert.deepEqual(createSplitPdfGroups("custom", 8, "3, 6"), [[0, 1, 2], [3, 4, 5], [6, 7]]);
  assert.deepEqual(createSplitPdfGroups("custom", 4, ""), [[0, 1, 2, 3]]);
  assert.throws(() => createSplitPdfGroups("custom", 6, "3,,5"), /empty entry.*not a valid split point/s);
  assert.throws(() => createSplitPdfGroups("custom", 6, "6"), /cannot be a split point/s);
  assert.throws(() => createSplitPdfGroups("even", 1), /no even-numbered pages/s);
});

test("Extract Pages plans combined and separate outputs from one strict visual selection", () => {
  assert.deepEqual(
    createExtractPagePlan("1,3-5", 8, true, 100),
    { selection: [0, 2, 3, 4], outputCount: 1, combine: true },
  );
  assert.deepEqual(
    createExtractPagePlan("1,3-5", 8, false, 4),
    { selection: [0, 2, 3, 4], outputCount: 4, combine: false },
  );
  assert.throws(() => createExtractPagePlan("", 8, true, 100), /Choose at least one page to extract/);
  assert.throws(() => createExtractPagePlan("2,,4", 8, true, 100), /empty entry.*not a valid page or range/s);
  assert.throws(() => createExtractPagePlan("9", 8, true, 100), /outside this 8-page PDF/);
  assert.throws(() => createExtractPagePlan("1-5", 8, false, 4), /create 5 PDF files.*up to 4 pages.*combine them/s);
});

test("result retention accepts exact item, count, and aggregate boundaries", () => {
  assert.deepEqual(createResultBudget(), {
    count: 0,
    totalBytes: 0,
    maxItems: MAX_GENERATED_RESULTS,
    maxItemBytes: ARCHIVE_ITEM_LIMIT_BYTES,
    maxTotalBytes: ARCHIVE_INPUT_LIMIT_BYTES,
  });

  const budget = createResultBudget({ maxItems: 2, maxItemBytes: 5, maxTotalBytes: 8 });
  const maxItem = { name: "max-item.bin", blob: { size: 5 } };
  const fillsAggregate = { name: "fills-total.bin", blob: { size: 3 } };
  assert.equal(retainResult(budget, maxItem), maxItem);
  assert.equal(retainResult(budget, fillsAggregate), fillsAggregate);
  assert.deepEqual(budget, { count: 2, totalBytes: 8, maxItems: 2, maxItemBytes: 5, maxTotalBytes: 8 });

  assert.throws(
    () => retainResult(budget, { name: "third.bin", blob: { size: 0 } }),
    (error) => error instanceof FileLimitError && error.code === "result-count-limit",
  );
  assert.deepEqual(budget, { count: 2, totalBytes: 8, maxItems: 2, maxItemBytes: 5, maxTotalBytes: 8 });

  const itemBudget = createResultBudget({ maxItems: 2, maxItemBytes: 5, maxTotalBytes: 10 });
  assert.throws(
    () => retainResult(itemBudget, { name: "item-over.bin", blob: { size: 6 } }),
    (error) => error instanceof FileLimitError && error.code === "archive-item-too-large" && /item-over\.bin/.test(error.message),
  );
  assert.deepEqual(itemBudget, { count: 0, totalBytes: 0, maxItems: 2, maxItemBytes: 5, maxTotalBytes: 10 });

  const aggregateBudget = createResultBudget({ maxItems: 3, maxItemBytes: 5, maxTotalBytes: 8 });
  retainResult(aggregateBudget, { name: "first.bin", blob: { size: 5 } });
  assert.throws(
    () => retainResult(aggregateBudget, { name: "aggregate-over.bin", blob: { size: 4 } }),
    (error) => error instanceof FileLimitError && error.code === "archive-input-too-large" && /aggregate-over\.bin/.test(error.message),
  );
  assert.deepEqual(aggregateBudget, { count: 1, totalBytes: 5, maxItems: 3, maxItemBytes: 5, maxTotalBytes: 8 });
});

test("result retention fails closed for invalid budgets and result sizes", () => {
  for (const options of [
    { maxItems: 0 },
    { maxItems: 1.5 },
    { maxItems: Number.POSITIVE_INFINITY },
    { maxItemBytes: 0 },
    { maxItemBytes: Number.NaN },
    { maxTotalBytes: -1 },
    { maxTotalBytes: Number.POSITIVE_INFINITY },
  ]) {
    assert.throws(
      () => createResultBudget(options),
      (error) => error instanceof FileLimitError && error.code === "invalid-result-budget",
    );
  }

  for (const size of [undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
    const budget = createResultBudget({ maxItems: 2, maxItemBytes: 5, maxTotalBytes: 10 });
    assert.throws(
      () => retainResult(budget, { name: "invalid.bin", blob: { size } }),
      (error) => error instanceof FileLimitError && error.code === "invalid-result-size" && /invalid\.bin/.test(error.message),
    );
    assert.equal(budget.count, 0);
    assert.equal(budget.totalBytes, 0);
  }

  assert.throws(
    () => retainResult(null, { name: "orphan.bin", blob: { size: 1 } }),
    (error) => error instanceof FileLimitError && error.code === "invalid-result-size" && /orphan\.bin/.test(error.message),
  );
  assert.throws(
    () => retainResult({ ...createResultBudget(), count: Number.NaN }, { name: "bad-state.bin", blob: { size: 1 } }),
    (error) => error instanceof FileLimitError && error.code === "invalid-result-size" && /bad-state\.bin/.test(error.message),
  );
});

test("ZIP guards reject excessive item count, individual size, and aggregate size before compression", async () => {
  const tiny = (index) => ({ name: `${index}.txt`, blob: { size: 1, type: "text/plain" } });
  await assert.rejects(() => zipResults(Array.from({ length: 101 }, (_, index) => tiny(index))), /create 101 files.*safe local limit is 100/s);
  await assert.rejects(() => zipResults([
    { name: "large.png", blob: { size: 48 * MiB + 1, type: "image/png" } },
    tiny(2),
  ]), /large\.png.*48 MB per-file ZIP limit/s);
  await assert.rejects(() => zipResults([
    { name: "one.bin", blob: { size: 44 * MiB, type: "application/octet-stream" } },
    { name: "two.bin", blob: { size: 44 * MiB, type: "application/octet-stream" } },
    { name: "three.bin", blob: { size: 44 * MiB, type: "application/octet-stream" } },
  ]), /generated files total 132 MB.*128 MB in-memory ZIP limit/s);
});
