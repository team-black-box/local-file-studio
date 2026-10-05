// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import UTIF from "utif";
import {
  ARCHIVE_INPUT_LIMIT_BYTES,
  ARCHIVE_ITEM_LIMIT_BYTES,
  DEVICE_MANAGED_LIMIT,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_BYTES,
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
  PDF_COMPRESSION_SETTINGS,
  assertPdfRasterWork,
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
  getInteractiveImagePreviewDimensions,
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
import { assertZipRepresentable, createExtractPagePlan, createMergePdfPlan, createOrganizePagePlan, createResultBudget, getPdfCompressionPreset, compressionEstimateAllowsProcessing, createSplitPdfGroups, formatPageSelection, getAutomaticDownloadResult, isToolSearchShortcut, parsePageSelection, parseSplitPageSelection, retainResult, safeFileName, zipResults } from "../src/lib/file-utils.js";
import { runTool } from "../src/lib/processors.js";
import { matchesImageSignature } from "../src/lib/image-processors.js";
import { preflightToolFiles } from "../src/lib/file-preflight.js";
import { getTiffDimensions } from "../src/lib/tiff-utils.js";
import { clearSensitiveToolSettings } from "../src/lib/tool-settings.js";
import { rankToolSearchResults, tools } from "../src/tools.js";
import { IMAGE_WATERMARK_ANGLES, IMAGE_WATERMARK_COLORS, IMAGE_WATERMARK_OPACITY_MAX, IMAGE_WATERMARK_OPACITY_MIN, IMAGE_WATERMARK_POSITIONS } from "../src/lib/image-watermark.js";
import { IMAGE_MEME_CASES } from "../src/lib/image-meme.js";
import { IMAGE_ROTATIONS } from "../src/lib/image-rotation.js";
import { FACE_BLUR_DEFAULT_REGION_SIZE, FACE_BLUR_STRENGTHS } from "../src/lib/face-blur.js";

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

test("Organize PDF preserves visual order, unrestricted copies, and omissions", () => {
  assert.deepEqual(createOrganizePagePlan("3,1,2,2", 4), {
    order: [2, 0, 1, 1],
    copiedPages: 1,
    omittedPages: 1,
  });
  assert.deepEqual(createOrganizePagePlan("all", 3).order, [0, 1, 2]);
  assert.throws(() => createOrganizePagePlan("", 0), /valid page count/);
  assert.deepEqual(createOrganizePagePlan("1,1,1,1,1", 2).order, [0,0,0,0,0]);
});

function tool(slug, { name = slug, kind = "pdf", accepts = [".pdf"], batch = false } = {}) {
  return { slug, name, kind, accepts, batch, settings: [] };
}

function file(name, size) {
  return Object.freeze({ name, size });
}

test("catalog workload capacity is device-managed while previews and semantic counts remain exact", () => {
  for (const subject of tools) {
    const limits = getToolLimits(subject);
    assert.equal(limits.maxFileBytes, DEVICE_MANAGED_LIMIT, subject.slug);
    assert.equal(limits.maxTotalBytes, DEVICE_MANAGED_LIMIT, subject.slug);
    assert.equal(limits.maxOutputBytes, DEVICE_MANAGED_LIMIT, subject.slug);
    if (subject.accepts.includes(".pdf")) assert.equal(limits.maxPdfPagesPerFile, DEVICE_MANAGED_LIMIT, subject.slug);
    for (const key of ["maxPdfPagesPerFile", "maxPdfPagesTotal", "maxImagePixelsPerFile", "maxImagePixelsTotal", "maxOutputPixels", "maxRasterPixels", "maxRasterPixelsTotal", "maxGeneratedItems"]) {
      if (key in limits) assert.equal(limits[key], DEVICE_MANAGED_LIMIT, `${subject.slug}.${key}`);
    }
    const copy = describeToolLimits(subject);
    assert.match(copy.primary, /No file-size cap/);
    assert.doesNotMatch(JSON.stringify(copy), /Infinity|∞|NaN|undefined/);
    assert.match(copy.secondary, /browser and device/);
  }
  assert.equal(getToolLimits("merge-pdf").maxFiles, DEVICE_MANAGED_LIMIT);
  assert.equal(getToolLimits("compare-pdf").maxFiles, 2);
  assert.equal(getToolLimits("photo-editor").maxFiles, 1);
  assert.deepEqual(PDF_PREVIEW_LIMITS, { maxOutputBytes: DEVICE_MANAGED_LIMIT, maxPages: DEVICE_MANAGED_LIMIT, maxRasterPixels: 8_000_000, maxRasterEdge: 4096 });
  assert.equal(getToolLimits("pdf-to-markdown").maxTextPreviewCharacters, 250_000);
  assert.equal(getToolLimits("pdf-to-markdown").maxTextPreviewBlocks, 1_000);
  for (const value of [GLOBAL_OUTPUT_LIMIT_BYTES, ARCHIVE_INPUT_LIMIT_BYTES, ARCHIVE_ITEM_LIMIT_BYTES, MAX_GENERATED_RESULTS]) assert.equal(value, DEVICE_MANAGED_LIMIT);
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
  const merge = describeToolLimits(tool("merge-pdf"));
  assert.equal(merge.primary, "PDF files · at least 2 · No file-size cap or batch cap");
  assert.equal(describeToolLimits(tool("split-pdf")).primary, "1 PDF file · No file-size cap");
  assert.match(describeToolLimits(tool("compare-pdf")).primary, /Exactly 2 PDF files/);
  assert.doesNotMatch(describeToolLimits(tool("redact-pdf")).secondary, /200 redaction|50\/page|65,536/);
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
  assert.equal(limits.maxFiles, DEVICE_MANAGED_LIMIT);
  assert.equal(limits.maxImagePixelsPerFile, DEVICE_MANAGED_LIMIT);
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
  assert.equal(getToolLimits(gif).maxGifFrames, DEVICE_MANAGED_LIMIT);

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
  assert.equal(getAnimatedGifPlan([{ name: "frame.jpg", width: 1200, height: 630 }], GIF_FRAME_DELAY_DEFAULT_MS, true, gif, 101).frameCount, 101);
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
  const current = { password: "memory-only", passwordConfirm: "memory-only", quality: "balanced" };
  const settings = [{ key: "password", type: "password" }, { key: "passwordConfirm", type: "password" }, { key: "quality", type: "select" }];
  assert.deepEqual(clearSensitiveToolSettings(current, settings), { password: "", passwordConfirm: "", quality: "balanced" });
  assert.deepEqual(current, { password: "memory-only", passwordConfirm: "memory-only", quality: "balanced" });
  const alreadyClear = { password: "", passwordConfirm: "", quality: "balanced" };
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

test("all pickers accept files and batches above the former byte quotas without reading them", () => {
  for (const subject of tools) {
    const extension = subject.accepts[0];
    for (const size of [25 * MiB + 1, 50 * MiB + 1, 100 * MiB + 1, 1024 * MiB]) {
      const selected = validateFileSelection(subject, [], [file(`large${extension}`, size)]);
      assert.equal(selected.accepted.length, 1, subject.slug);
      assert.equal(selected.rejected.length, 0, subject.slug);
    }
  }
  const batch = Array.from({ length: 101 }, (_, i) => file(`${i}.jpg`, 60 * MiB));
  const selected = validateFileSelection(tool("compress-image", { kind: "image", accepts: [".jpg"] }), [], batch);
  assert.equal(selected.accepted.length, 101);
  assert.equal(selected.totalBytes, 6060 * MiB);
  assert.equal(selected.rejected.length, 0);
});

test("PDF compression accepts large page and raster jobs while rejecting invalid metadata", () => {
  const subject = tool("compress-pdf");
  const limits = getToolLimits(subject);
  assert.doesNotThrow(() => validatePreflightMetadata(subject, [{ name: "scan.pdf", pdfPages: 2000 }]));
  assert.doesNotThrow(() => assertRasterDimensions(4961, 7016, limits));
  assert.doesNotThrow(() => assertPdfRasterWork(2_000_000_000, limits));
  assert.doesNotThrow(() => assertOutputSize(1024 * MiB, "result.pdf"));
  assert.throws(() => assertPdfRasterWork(Infinity, limits), { code: "invalid-raster-work" });
});

test("other PDF tools share the removed file-size quotas", () => {
  for (const slug of ["redact-pdf", "pdf-to-jpg", "add-image-to-pdf", "compare-pdf", "pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel", "pdf-to-markdown", "summarize-pdf", "ocr-pdf", "translate-pdf"]) {
    assert.equal(getToolLimits(slug).maxFileBytes, DEVICE_MANAGED_LIMIT, slug);
  }
  assert.equal(getToolLimits("split-pdf").maxGeneratedItems, DEVICE_MANAGED_LIMIT);
});

test("large inputs reach the local reader while empty files fail before reading", async () => {
  let reads = 0;
  const subject = tool("compress-image", { kind: "image", accepts: [".png"] });
  const malformed = { name: "large.png", size: 1024 * MiB, arrayBuffer() { reads++; throw new Error("local read reached"); } };
  await assert.rejects(runTool(subject, [malformed]), (error) => error.code === "unreadable-image-metadata" && error.details.cause.message === "local read reached");
  assert.equal(reads, 1);
  reads = 0;
  await assert.rejects(runTool(subject, [{ ...malformed, size: 0 }]), { code: "input-limit" });
  assert.equal(reads, 0);
});

test("selection retains file validity and tool cardinality without arbitrary workload caps", () => {
  const merge = tool("merge-pdf", { name: "Merge PDF" });
  assert.equal(validateFileSelection(merge, [], [file("empty.pdf", 0)]).rejected[0].code, "empty-file");
  assert.match(validateFileSelection(merge, [], [file("notes.docx", MiB)]).rejected[0].message, /notes\.docx.*accepts PDF/s);
  const many = Array.from({ length: 101 }, (_, index) => file(`${index}.pdf`, 100 * MiB + 1));
  assert.equal(validateFileSelection(merge, [], many).accepted.length, many.length);
  for (const invalidSize of [NaN, Infinity, -1, undefined]) assert.equal(validateFileSelection(merge, [], [file("invalid.pdf", invalidSize)]).rejected[0].code, "invalid-size");
  assert.equal(validateFileSelection(tool("compare-pdf"), [], many).accepted.length, 2);
  assert.equal(validateFileSelection(tool("split-pdf"), [], many).accepted.length, 1);
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
  assert.doesNotThrow(() => assertMarkupLength(html, "x".repeat(500_001)));
  assert.equal(getTextSettingLimit(html, "html"), undefined);
  for (const slug of ["split-pdf", "remove-pdf-pages", "extract-pdf-pages", "organize-pdf"]) {
    const subject = tool(slug, { name: slug, accepts: [".pdf"] });
    assert.equal(getToolLimits(subject).maxPageSelectionEntries, DEVICE_MANAGED_LIMIT);
    assert.doesNotMatch(describeToolLimits(subject).secondary, /expanded page-selection entries max/);
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
  assert.doesNotMatch(describeToolLimits(htmlImage).secondary, /MP.*capture/);
});

test("every registered text setting accepts its exact cap and rejects one extra character", () => {
  const policies = {
    "watermark-pdf": { text: 200 },
    "edit-pdf": { text: 500 },
    "sign-pdf": { name: 200 },
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
  const word = tool("word-to-pdf", { accepts: [".docx"] });
  const limits = getToolLimits(word);
  assert.equal(limits.maxArchiveEntries, 100_000);
  assert.equal(limits.maxExpandedArchiveItemBytes, 512 * MiB);
  assert.equal(limits.maxExpandedArchiveBytes, 2048 * MiB);
  assert.equal(limits.maxArchiveExpansionRatio, 1000);
  assert.equal(limits.archiveExpansionRatioFloorBytes, 64 * MiB);
  const copy = describeToolLimits(word).secondary;
  for (const pattern of [/100,000 internal items/, /512 MB per expanded item/, /2048 MB expanded total/, /1000× max expansion above 64 MB/]) assert.match(copy, pattern);
});

test("only archive amplification, sparse worksheet work and comparison stalls retain resource safeguards", () => {
  for (const slug of ["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "pdf-to-word", "translate-pdf"]) assert.equal(getToolLimits(slug).maxExtractedCharactersTotal, DEVICE_MANAGED_LIMIT);
  assert.equal(getToolLimits("pdf-forms").maxPdfFormFields, DEVICE_MANAGED_LIMIT);
  assert.equal(getToolLimits("organize-pdf").maxOrganizedPageMultiplier, DEVICE_MANAGED_LIMIT);
  assert.equal(getToolLimits("compare-pdf").maxDiffEditLength, DEVICE_MANAGED_LIMIT);
  assert.match(describeToolLimits(tool("compare-pdf")).secondary, /30 s diff budget.*31 s hard stop/);
  assert.match(describeToolLimits(tool("excel-to-pdf")).secondary, /10,000,000 used-range cells/);
});

test("derived workloads above former ceilings remain complete and invalid counters fail", () => {
  assert.doesNotThrow(() => assertExtractedTextLength(20_000_000, "word-to-pdf"));
  assert.doesNotThrow(() => assertPresentationSlideCount(1000));
  assert.doesNotThrow(() => assertSpreadsheetComplexity(101, 10_000_000));
  assert.throws(() => assertSpreadsheetComplexity(101, 10_000_001), { code: "spreadsheet-cell-limit" });
  assert.doesNotThrow(() => assertGeneratedPdfPageCount(5001, "word-to-pdf"));
  assert.doesNotThrow(() => assertPdfFormFieldCount(10_001));
  assert.doesNotThrow(() => assertOrganizedPageCount(5001, 1));
  assert.doesNotThrow(() => assertOcrCharacterCount(100_000, 1));
  assert.doesNotThrow(() => assertImagePixelTotal(2_000_000_000, "jpg-to-pdf"));
  for (const bad of [NaN, Infinity, -1, 1.5]) {
    assert.throws(() => assertExtractedTextLength(bad, "word-to-pdf"), { code: "invalid-extracted-text-length" });
    assert.throws(() => assertGeneratedPdfPageCount(bad, "word-to-pdf"), { code: "invalid-generated-page-count" });
  }
});

test("PDF form metadata accepts large valid values and rejects malformed metadata", () => {
  assert.doesNotThrow(() => assertPdfFormMetadata({ optionCount: 50_001, metadataCharacters: 5_120_001, maxFieldNameCharacters: 2049, maxFieldValueCharacters: 10_001, maxOptionsPerField: 501 }));
  assert.throws(() => assertPdfFormMetadata({}), { code: "invalid-pdf-form-metadata" });
});

test("comparison counts all lines above the former per-file and combined ceilings", () => {
  assert.equal(countLogicalLines(""), 0);
  assert.equal(countLogicalLines("one"), 1);
  assert.equal(countLogicalLines("one\n"), 1);
  assert.equal(countLogicalLines("one\ntwo"), 2);
  const text = "x\n".repeat(25_001);
  assert.deepEqual(assertComparisonLineCounts(text, text), { leftLines: 25_001, rightLines: 25_001, totalLines: 50_002 });
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
  assert.equal(successWorker.posted.maxEditLength, DEVICE_MANAGED_LIMIT);
  assert.equal(successWorker.posted.timeoutMs, 30_000);

  const limitedWorker = makeWorker({ type: "limited" });
  await assert.rejects(
    () => runBoundedLineDiff("old", "new", getToolLimits("compare-pdf"), { createWorker: () => limitedWorker }),
    (error) => error instanceof FileLimitError && error.code === "comparison-complexity-limit" && /30 seconds/.test(error.message),
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
    (error) => error instanceof FileLimitError && error.code === "comparison-hard-timeout" && /31 seconds/s.test(error.message),
  );
  assert.equal(scheduledMilliseconds, 31_000);
  assert.equal(clearedTimer, 42);
  assert.equal(hangingWorker.terminated, true);
});

test("Unlock and Protect expose and enforce the shared 1,024-character password cap", () => {
  assert.equal(MAX_PDF_PASSWORD_CHARACTERS, 1_024);
  for (const [slug, name] of [["unlock-pdf", "Unlock PDF"], ["protect-pdf", "Protect PDF"]]) {
    const settings = [{ key: "password", label: "Password" }];
    if (slug === "protect-pdf") settings.push({ key: "passwordConfirm", label: "Confirm password" });
    const subject = { ...tool(slug, { name }), settings };
    assert.equal(getTextSettingLimit(subject, "password"), MAX_PDF_PASSWORD_CHARACTERS);
    assert.doesNotThrow(() => assertTextSettingLengths(subject, { password: "x".repeat(1_024) }));
    assert.throws(() => assertTextSettingLengths(subject, { password: "x".repeat(1_025) }), /1,025 characters.*1,024/s);
    if (slug === "protect-pdf") {
      assert.equal(getTextSettingLimit(subject, "passwordConfirm"), MAX_PDF_PASSWORD_CHARACTERS);
      assert.doesNotThrow(() => assertTextSettingLengths(subject, { password: "x", passwordConfirm: "x".repeat(1_024) }));
      assert.throws(() => assertTextSettingLengths(subject, { password: "x", passwordConfirm: "x".repeat(1_025) }), /Confirm password contains 1,025 characters.*1,024/s);
      assert.match(describeToolLimits(subject).secondary, /1,024 characters max in each field: new password and password confirmation/);
    } else {
      assert.match(describeToolLimits(subject).secondary, /1,024 characters max in current password/);
    }
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

test("repair and protection tools accept large files and long documents", () => {
  for (const slug of ["repair-pdf", "unlock-pdf", "protect-pdf"]) {
    const subject = tool(slug);
    assert.equal(validateFileSelection(subject, [], [file("large.pdf", 1024 * MiB)]).accepted.length, 1);
    assert.doesNotThrow(() => validatePreflightMetadata(subject, [{ name: "large.pdf", pdfPages: 5001 }]));
  }
});

test("PDF metadata allows long documents and rejects invalid page counts", () => {
  const merge = tool("merge-pdf");
  assert.deepEqual(validatePreflightMetadata(merge, [{ name: "a.pdf", pdfPages: 5001 }, { name: "b.pdf", pdfPages: 5001 }]), { totalPages: 10_002, totalPixels: 0 });
  for (const pdfPages of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => validatePreflightMetadata(merge, [{ name: "invalid.pdf", pdfPages }]), { code: "invalid-page-count" });
});

test("Merge PDF plans exact final ranges from the same central page limits", () => {
  const limits = { ...getToolLimits("merge-pdf"), maxPdfPagesPerFile: 300, maxPdfPagesTotal: 500 };
  const exact = createMergePdfPlan([300, 200], ["first.pdf", "second.pdf"], limits);
  assert.equal(exact.valid, true);
  assert.equal(exact.totalPages, 500);
  assert.equal(exact.actionLabel, "Merge 2 PDFs · 500 pages");
  assert.equal(exact.readyLabel, "2 PDFs · 500 pages ready");
  assert.deepEqual(exact.entries, [
    { index: 0, name: "first.pdf", pageCount: 300, startPage: 1, endPage: 300, rangeLabel: "1–300" },
    { index: 1, name: "second.pdf", pageCount: 200, startPage: 301, endPage: 500, rangeLabel: "301–500" },
  ]);

  const waiting = createMergePdfPlan([1], ["only.pdf"], limits);
  assert.equal(waiting.valid, false);
  assert.equal(waiting.readyLabel, "1 of 2 PDFs added");
  assert.throws(
    () => createMergePdfPlan([301, 1], ["large.pdf", "small.pdf"], limits),
    (error) => error instanceof FileLimitError && error.code === "too-many-pages" && /large\.pdf/.test(error.message),
  );
  assert.throws(
    () => createMergePdfPlan([300, 201], ["first.pdf", "overflow.pdf"], limits),
    (error) => error instanceof FileLimitError && error.code === "too-many-total-pages" && /overflow\.pdf/.test(error.message),
  );
  assert.throws(
    () => createMergePdfPlan([0, 1], ["invalid.pdf", "valid.pdf"], limits),
    (error) => error instanceof FileLimitError && error.code === "invalid-page-count" && /invalid\.pdf/.test(error.message),
  );
});

test("image and raster guards accept exact pixel limits and reject one-pixel overflow", () => {
  const imageLimits = { ...getToolLimits("compress-image"), maxImagePixelsPerFile: 16_000_000, maxImageEdge: 8192, maxOutputPixels: 16_000_000 };
  assert.doesNotThrow(() => assertImageDimensions(4000, 4000, imageLimits, "exact.png"));
  assert.throws(() => assertImageDimensions(4001, 4000, imageLimits, "wide.png"), /wide\.png.*16 MP/s);
  assert.throws(() => assertImageDimensions(8193, 1, imageLimits, "edge.png"), /8,192 px/s);

  const rasterLimits = { ...getToolLimits("compress-pdf"), maxRasterPixels: 16_000_000 };
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
  assert.deepEqual(getProportionalResizeDimensions(100, 8192, 640), { width: 640, height: 52429 });
});

test("Resize Image preflight exposes exact target dimensions before processing", async () => {
  const resize = tools.find(({ slug }) => slug === "resize-image");
  const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const image = new File([onePixelPng], "pixel.png", { type: "image/png" });
  const inspected = await preflightToolFiles(resize, [image], { width: 640 });
  assert.deepEqual(inspected.metadata, [{ name: "pixel.png", width: 1, height: 1, format: "png", animated: false, outputWidth: 640, outputHeight: 640 }]);
  const large = await preflightToolFiles(resize, [image], { width: 8192 });
  assert.equal(large.metadata[0].outputHeight, 8192);
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
  assert.equal(getImageUpscalePlan(2000, 2000, 4).outputPixels, 64_000_000);
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

test("Remove Background uses one catalog contract and a bounded interactive preview", () => {
  const removeBackground = tools.find(({ slug }) => slug === "remove-image-background");
  const cleanup = removeBackground.settings.find(({ key }) => key === "cleanup");
  const background = removeBackground.settings.find(({ key }) => key === "background");
  const limits = getToolLimits(removeBackground);

  assert.equal(cleanup.default, "balanced");
  assert.deepEqual(cleanup.options.map(({ value }) => value), ["light", "balanced", "strong"]);
  assert.equal(removeBackground.settings.some(({ key }) => key === "edgeQuality"), false);
  assert.deepEqual(background.options.map(({ value }) => value), ["transparent", "white", "black"]);
  assert.equal(limits.maxInteractivePreviewPixels, 1_500_000);
  assert.equal(limits.maxInteractivePreviewEdge, 1600);
  assert.deepEqual(getInteractiveImagePreviewDimensions(1200, 630, removeBackground), {
    sourceWidth: 1200,
    sourceHeight: 630,
    width: 1200,
    height: 630,
    scale: 1,
  });

  const large = getInteractiveImagePreviewDimensions(6000, 4000, removeBackground);
  assert.equal(large.width, 1500);
  assert.equal(large.height, 1000);
  assert.equal(large.width * large.height, limits.maxInteractivePreviewPixels);
  assert.ok(Math.max(large.width, large.height) <= limits.maxInteractivePreviewEdge);
  assert.throws(
    () => getInteractiveImagePreviewDimensions(0, 400, removeBackground),
    (error) => error instanceof FileLimitError && error.code === "invalid-image-dimensions",
  );
  assert.throws(
    () => getInteractiveImagePreviewDimensions(400, 400, "compress-image"),
    (error) => error instanceof FileLimitError && error.code === "missing-preview-limits",
  );
});

test("Watermark Image uses one catalog contract and a bounded live preview", () => {
  const watermark = tools.find(({ slug }) => slug === "watermark-image");
  const settings = Object.fromEntries(watermark.settings.map((setting) => [setting.key, setting]));
  const limits = getToolLimits(watermark);

  assert.equal(settings.text.default, "© My work");
  assert.equal(settings.position.default, "bottom-right");
  assert.deepEqual(settings.position.options.map(({ value }) => value), IMAGE_WATERMARK_POSITIONS.map(({ value }) => value));
  assert.equal(settings.angle.default, -24);
  assert.deepEqual(settings.angle.options.map(({ value }) => value), IMAGE_WATERMARK_ANGLES.map(({ value }) => value));
  assert.equal(settings.color.default, "#ffffff");
  assert.deepEqual(settings.color.options.map(({ value }) => value), IMAGE_WATERMARK_COLORS.map(({ value }) => value));
  assert.deepEqual({ min: settings.opacity.min, max: settings.opacity.max, step: settings.opacity.step, default: settings.opacity.default }, {
    min: IMAGE_WATERMARK_OPACITY_MIN,
    max: IMAGE_WATERMARK_OPACITY_MAX,
    step: 5,
    default: 45,
  });
  assert.equal(limits.maxInteractivePreviewPixels, 1_500_000);
  assert.equal(limits.maxInteractivePreviewEdge, 1600);
  assert.deepEqual(getInteractiveImagePreviewDimensions(6000, 4000, watermark), {
    sourceWidth: 6000,
    sourceHeight: 4000,
    width: 1500,
    height: 1000,
    scale: 0.25,
  });
});

test("Meme Generator exposes both captions, case choices, and a bounded live preview", () => {
  const meme = tools.find(({ slug }) => slug === "meme-generator");
  const settings = Object.fromEntries(meme.settings.map((setting) => [setting.key, setting]));
  const limits = getToolLimits(meme);

  assert.equal(settings.topText.default, "WHEN THE FILE");
  assert.equal(settings.bottomText.default, "STAYS ON YOUR DEVICE");
  assert.equal(settings.letterCase.default, "uppercase");
  assert.deepEqual(settings.letterCase.options.map(({ value }) => value), IMAGE_MEME_CASES.map(({ value }) => value));
  assert.equal(limits.maxInteractivePreviewPixels, 1_500_000);
  assert.equal(limits.maxInteractivePreviewEdge, 1600);
  assert.deepEqual(getInteractiveImagePreviewDimensions(6000, 4000, meme), {
    sourceWidth: 6000,
    sourceHeight: 4000,
    width: 1500,
    height: 1000,
    scale: 0.25,
  });
});

test("Rotate Image exposes exact direction choices and a bounded first-image preview", () => {
  const rotate = tools.find(({ slug }) => slug === "rotate-image");
  const settings = Object.fromEntries(rotate.settings.map((setting) => [setting.key, setting]));
  const limits = getToolLimits(rotate);

  assert.equal(settings.angle.default, 90);
  assert.deepEqual(settings.angle.options, IMAGE_ROTATIONS.map(({ value, label, hint }) => ({ value, label, hint })));
  assert.equal(limits.maxInteractivePreviewPixels, 1_500_000);
  assert.equal(limits.maxInteractivePreviewEdge, 1600);
  assert.deepEqual(getInteractiveImagePreviewDimensions(6000, 4000, rotate), {
    sourceWidth: 6000,
    sourceHeight: 4000,
    width: 1500,
    height: 1000,
    scale: 0.25,
  });
});

test("Blur Face exposes reviewable strength and fallback controls with a bounded preview", () => {
  const blur = tools.find(({ slug }) => slug === "blur-face");
  const settings = Object.fromEntries(blur.settings.map((setting) => [setting.key, setting]));
  const limits = getToolLimits(blur);

  assert.deepEqual({ min: settings.strength.min, max: settings.strength.max, step: settings.strength.step, default: settings.strength.default }, { min: 8, max: 48, step: 2, default: 24 });
  assert.equal(FACE_BLUR_STRENGTHS.some(({ value }) => value === settings.strength.default), true);
  assert.deepEqual({ min: settings.focusX.min, max: settings.focusX.max, default: settings.focusX.default }, { min: 10, max: 90, default: 50 });
  assert.deepEqual({ min: settings.focusY.min, max: settings.focusY.max, default: settings.focusY.default }, { min: 10, max: 90, default: 35 });
  assert.deepEqual({ min: settings.regionSize.min, max: settings.regionSize.max, step: settings.regionSize.step, default: settings.regionSize.default }, { min: 18, max: 64, step: 2, default: FACE_BLUR_DEFAULT_REGION_SIZE });
  assert.equal(limits.maxDetectedFaces, DEVICE_MANAGED_LIMIT);
  assert.equal(limits.maxInteractivePreviewPixels, 1_500_000);
  assert.equal(limits.maxInteractivePreviewEdge, 1600);
  assert.deepEqual(getInteractiveImagePreviewDimensions(6000, 4000, blur), {
    sourceWidth: 6000,
    sourceHeight: 4000,
    width: 1500,
    height: 1000,
    scale: 0.25,
  });
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

test("aggregate decoded-pixel accounting includes images beyond the old batch ceiling", () => {
  const imageTool = tool("compress-image", { name: "Compress Image", kind: "image", accepts: [".jpg", ".jpeg", ".png", ".webp"], batch: true });
  const exact = Array.from({ length: 10 }, (_, index) => ({ name: `${index}.png`, width: 4000, height: 4000 }));
  assert.equal(validatePreflightMetadata(imageTool, exact).totalPixels, 160_000_000);
  assert.equal(validatePreflightMetadata(imageTool, [...exact, { name: "extra.png", width: 4000, height: 4000 }]).totalPixels, 176_000_000);
});

test("image-only safeguards are visible and generated names are not silently truncated", () => {
  const blur = tool("blur-face", { name: "Blur Face", kind: "image", accepts: [".jpg", ".png", ".webp"], batch: true });
  assert.equal(getToolLimits(blur).maxDetectedFaces, DEVICE_MANAGED_LIMIT);
  assert.doesNotMatch(describeToolLimits(blur).secondary, /detected faces max/);

  const convert = tool("convert-to-jpg", { name: "Convert to JPG", kind: "image", accepts: [".gif", ".tiff"], batch: true });
  const copy = describeToolLimits(convert).secondary;
  assert.match(copy, /1 image per TIFF file/);
  assert.match(copy, /animated GIF\/PNG\/WebP: first frame only/);

  const compress = tool("compress-image", { name: "Compress Image", kind: "image", accepts: [".jpg", ".png", ".webp"], batch: true });
  assert.match(describeToolLimits(compress).secondary, /animated PNG\/WebP: first frame only/);

  const longName = "a".repeat(180);
  assert.equal(safeFileName(longName), longName);
});

test("generated counts and page selections exceed the old quotas without truncation", () => {
  assert.doesNotThrow(() => assertGeneratedItemCount(1001, "split-pdf"));
  assert.doesNotThrow(() => assertOutputSize(1024 * MiB, "result.pdf"));
  assert.throws(() => assertOutputSize(NaN, "result.pdf"), /invalid size/);
  assert.throws(() => assertGeneratedItemCount(NaN, "split-pdf"), /number of generated results is invalid/);
  assert.equal(parsePageSelection("1,".repeat(2050), 500).length, 1);
  assert.equal(parsePageSelection("1-500,1-500,1-500,1-500,1-500", 500, "all", true).length, 2500);
  assert.equal(getTextSettingLimit("split-pdf", "pages"), undefined);
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
    { maxItemBytes: 0 },
    { maxItemBytes: Number.NaN },
    { maxTotalBytes: -1 },
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

test("ZIP exports exceed old quotas and reject actual format overflows before reading data", async () => {
  const tiny = { name: "one.bin", blob: { size: 1 } };
  assert.doesNotThrow(() => assertZipRepresentable(Array(101).fill(tiny)));
  assert.doesNotThrow(() => assertZipRepresentable([{ name: "large.jpg", blob: { size: 200 * MiB } }]));
  assert.doesNotThrow(() => assertZipRepresentable(Array(ZIP_MAX_ENTRIES).fill(tiny)));
  await assert.rejects(zipResults(Array(ZIP_MAX_ENTRIES + 1).fill(tiny)), { code: "zip-entry-limit" });
  await assert.rejects(zipResults([{ name: "large.bin", blob: { size: ZIP_MAX_BYTES } }, tiny]), { code: "zip-format-limit" });
  assert.throws(() => assertZipRepresentable([{ name: "invalid.bin", blob: { size: Infinity } }]), { code: "invalid-result-size" });
  const results = Array.from({ length: 101 }, (_, i) => ({ name: `${i}.txt`, blob: new Blob([String(i)], { type: "text/plain" }) }));
  const [result] = await zipResults(results);
  const { default: JSZip } = await import("jszip");
  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  assert.equal(Object.keys(archive.files).length, 101);
  assert.equal(await archive.file("100.txt").async("string"), "100");
});


test("PDF compression defaults preserve scan detail and custom controls share exact bounds", () => {
  assert.deepEqual(getPdfCompressionPreset(), { quality: 94, scale: 300 / 72 });
  assert.deepEqual(getPdfCompressionPreset("balanced"), { quality: 85, scale: 200 / 72 });
  const compression = tools.find(({ slug }) => slug === "compress-pdf");
  assert.equal(compression.settings.find(({ key }) => key === "quality").default, "gentle");
  for (const key of ["dpi", "jpegQuality"]) {
    const setting = compression.settings.find((entry) => entry.key === key);
    assert.equal(setting.min, PDF_COMPRESSION_SETTINGS[key].min);
    assert.equal(setting.max, PDF_COMPRESSION_SETTINGS[key].max);
    for (const value of [setting.min, setting.max]) assert.doesNotThrow(() => getPdfCompressionPreset("custom", { [key]: value }));
    for (const value of [setting.min - 1, setting.max + 1, NaN, Infinity, "bad", ""]) {
      assert.throws(() => getPdfCompressionPreset("custom", { [key]: value }), { code: "invalid-compression-setting" });
    }
  }
  assert.deepEqual(getPdfCompressionPreset("custom", { dpi: 288, jpegQuality: 100 }), { scale: 4, quality: 100 });
  assert.deepEqual(getPdfCompressionPreset(100, { scale: 4 }), { scale: 4, quality: 100 });
  const limits = getToolLimits("compress-pdf");
  assert.doesNotThrow(() => assertPdfRasterWork(1_000_000_000, limits));
  assert.throws(() => assertPdfRasterWork(Infinity, limits), { code: "invalid-raster-work" });
  // Both A4 at 300 DPI and 600 DPI are offered to the local engine unchanged.
  assert.doesNotThrow(() => assertRasterDimensions(2481, 3508, limits));
  assert.doesNotThrow(() => assertRasterDimensions(4961, 7016, limits));
  assert.equal(compressionEstimateAllowsProcessing({ state: "error", blocked: true }), false);
});

test("invalid custom PDF compression settings fail before reading document bytes", async () => {
  let reads = 0;
  const input = { name: "scan.pdf", size: 1000, arrayBuffer() { reads += 1; throw new Error("must not read"); } };
  for (const options of [
    { quality: "custom", dpi: 601 },
    { quality: "custom", jpegQuality: 101 },
    { quality: "custom", dpi: "bad" },
    { quality: "unknown" },
  ]) {
    await assert.rejects(runTool(tool("compress-pdf"), [input], options), { code: "invalid-compression-setting" });
  }
  assert.equal(reads, 0);
});
