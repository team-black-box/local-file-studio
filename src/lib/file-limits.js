// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

const MIB = 1024 * 1024;
const MEGAPIXEL = 1_000_000;
const PDF_OVERLAY_IMAGE_ACCEPTS = Object.freeze([".png", ".jpg", ".jpeg"]);

export const GLOBAL_OUTPUT_LIMIT_BYTES = 128 * MIB;
export const ARCHIVE_INPUT_LIMIT_BYTES = 128 * MIB;
export const ARCHIVE_ITEM_LIMIT_BYTES = 48 * MIB;
export const MAX_GENERATED_RESULTS = 100;
export const MAX_PAGE_SELECTION_CHARACTERS = 4_096;
export const MAX_PAGE_SELECTION_ENTRIES = 2_000;
export const MAX_PDF_PASSWORD_CHARACTERS = 1_024;
export const IMAGE_CROP_SCALE_MIN_PERCENT = 40;
export const IMAGE_CROP_SCALE_MAX_PERCENT = 100;
export const GIF_FRAME_DELAY_MIN_MS = 100;
export const GIF_FRAME_DELAY_MAX_MS = 3000;
export const GIF_FRAME_DELAY_DEFAULT_MS = 900;
export const IMAGE_UPSCALE_SCALES = Object.freeze([2, 4]);
export const PHOTO_EDITOR_ADJUSTMENTS = Object.freeze({
  brightness: Object.freeze({ min: 50, max: 150, default: 100 }),
  contrast: Object.freeze({ min: 50, max: 150, default: 100 }),
  saturation: Object.freeze({ min: 0, max: 180, default: 100 }),
  warmth: Object.freeze({ min: 0, max: 60, default: 0 }),
});
export const PHOTO_EDITOR_TEXT_COLORS = Object.freeze(["#ffffff", "#14201d"]);
export const PDF_PREVIEW_LIMITS = Object.freeze({
  maxOutputBytes: GLOBAL_OUTPUT_LIMIT_BYTES,
  maxPages: 500,
  maxRasterPixels: 8 * MEGAPIXEL,
  maxRasterEdge: 4096,
});

const DEFAULTS = Object.freeze({
  minFiles: 1,
  maxFiles: 1,
  maxFileBytes: 75 * MIB,
  maxTotalBytes: 75 * MIB,
  maxOutputBytes: GLOBAL_OUTPUT_LIMIT_BYTES,
  maxArchiveItemBytes: ARCHIVE_ITEM_LIMIT_BYTES,
  maxArchiveInputBytes: ARCHIVE_INPUT_LIMIT_BYTES,
});

const PDF_RASTER_PROFILES = {
  "compress-pdf": { maxFileBytes: 50 * MIB, maxTotalBytes: 50 * MIB, maxPdfPagesPerFile: 150, maxRasterPixelsTotal: 150 * MEGAPIXEL },
  "redact-pdf": { maxFileBytes: 50 * MIB, maxTotalBytes: 50 * MIB, maxPdfPagesPerFile: 100, maxRasterPixelsTotal: 150 * MEGAPIXEL },
  "pdf-to-jpg": { maxFileBytes: 50 * MIB, maxTotalBytes: 50 * MIB, maxPdfPagesPerFile: 100, maxRasterPixelsTotal: 150 * MEGAPIXEL, maxGeneratedItems: 100 },
  "ocr-pdf": { maxFileBytes: 30 * MIB, maxTotalBytes: 30 * MIB, maxPdfPagesPerFile: 25, maxRasterPixels: 12 * MEGAPIXEL, maxRasterPixelsTotal: 40 * MEGAPIXEL, maxRasterEdge: 6000, maxOcrCharactersPerPage: 16_800 },
};

const PDF_TEXT_TOOLS = new Set([
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "summarize-pdf",
  "translate-pdf",
  "pdf-to-markdown",
]);

const PDF_UNBOUNDED_PAGE_TOOLS = new Set(["repair-pdf", "unlock-pdf", "protect-pdf"]);
const OFFICE_TOOLS = new Set(["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf"]);
const HTML_TOOLS = new Set(["html-to-pdf", "html-to-image"]);
const IMAGE_TO_PDF_TOOLS = new Set(["jpg-to-pdf", "scan-to-pdf"]);
const HEAVY_IMAGE_TOOLS = new Set(["upscale-image", "remove-image-background", "blur-face"]);
const SINGLE_IMAGE_TOOLS = new Set(["photo-editor", "meme-generator"]);
const IMAGE_BATCH_TOOLS = new Set(["compress-image", "resize-image", "crop-image", "watermark-image", "rotate-image"]);
const PAGE_SELECTION_TOOLS = new Set(["split-pdf", "remove-pdf-pages", "extract-pdf-pages", "organize-pdf"]);
const SLUG_ALIASES = {
  "convert-to-jpg": "convert-image",
  "remove-pages": "remove-pdf-pages",
  "extract-pages": "extract-pdf-pages",
  "add-page-numbers": "add-pdf-page-numbers",
  "ai-summarizer": "summarize-pdf",
  "remove-background": "remove-image-background",
};
const TEXT_SETTING_LIMITS = {
  "split-pdf": { pages: MAX_PAGE_SELECTION_CHARACTERS, customBreaks: MAX_PAGE_SELECTION_CHARACTERS },
  "remove-pdf-pages": { pages: MAX_PAGE_SELECTION_CHARACTERS },
  "extract-pdf-pages": { pages: MAX_PAGE_SELECTION_CHARACTERS },
  "organize-pdf": { order: MAX_PAGE_SELECTION_CHARACTERS },
  "watermark-pdf": { text: 200 },
  "edit-pdf": { text: 500 },
  "sign-pdf": { name: 200 },
  "pdf-forms": { values: 256 * 1024 },
  "redact-pdf": { regions: 64 * 1024 },
  "unlock-pdf": { password: MAX_PDF_PASSWORD_CHARACTERS },
  "protect-pdf": { password: MAX_PDF_PASSWORD_CHARACTERS },
  "watermark-image": { text: 500 },
  "photo-editor": { text: 500 },
  "meme-generator": { topText: 500, bottomText: 500 },
};

const TEXT_SETTING_LABELS = {
  "split-pdf": { pages: "page selection", customBreaks: "custom split points" },
  "remove-pdf-pages": { pages: "page selection" },
  "extract-pdf-pages": { pages: "page selection" },
  "organize-pdf": { order: "page order" },
  "watermark-pdf": { text: "watermark text" },
  "edit-pdf": { text: "annotation text" },
  "sign-pdf": { name: "typed signature" },
  "pdf-forms": { values: "advanced field JSON" },
  "redact-pdf": { regions: "redaction area data" },
  "unlock-pdf": { password: "current password" },
  "protect-pdf": { password: "new password" },
  "watermark-image": { text: "watermark text" },
  "photo-editor": { text: "caption" },
  "meme-generator": { topText: "each caption", bottomText: "each caption" },
};

function withDefaults(overrides = {}) {
  return Object.freeze({ ...DEFAULTS, ...overrides });
}

function imageProfile(overrides = {}) {
  return withDefaults({
    maxFiles: 20,
    maxFileBytes: 25 * MIB,
    maxTotalBytes: 100 * MIB,
    maxImagePixelsPerFile: 16 * MEGAPIXEL,
    maxImagePixelsTotal: 160 * MEGAPIXEL,
    maxImageEdge: 8192,
    maxOutputPixels: 16 * MEGAPIXEL,
    maxOutputEdge: 8192,
    ...overrides,
  });
}

export class FileLimitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FileLimitError";
    this.code = code;
    this.details = details;
  }
}

export function getToolLimits(toolOrSlug) {
  const rawSlug = typeof toolOrSlug === "string" ? toolOrSlug : toolOrSlug.slug;
  const slug = SLUG_ALIASES[rawSlug] || rawSlug;
  const tool = typeof toolOrSlug === "string" ? null : toolOrSlug;

  if (slug === "merge-pdf") {
    return withDefaults({
      minFiles: 2,
      maxFiles: 20,
      maxFileBytes: 50 * MIB,
      maxTotalBytes: 120 * MIB,
      maxPdfPagesPerFile: 300,
      maxPdfPagesTotal: 500,
    });
  }

  if (slug === "compare-pdf") {
    return withDefaults({
      minFiles: 2,
      maxFiles: 2,
      maxFileBytes: 50 * MIB,
      maxTotalBytes: 100 * MIB,
      maxPdfPagesPerFile: 250,
      maxPdfPagesTotal: 400,
      maxExtractedCharactersTotal: 2_000_000,
      maxExtractedLinesPerFile: 25_000,
      maxExtractedLinesTotal: 40_000,
      maxDiffEditLength: 2_000,
      maxDiffMilliseconds: 3_000,
      maxDiffHardMilliseconds: 4_000,
    });
  }

  if (slug === "add-image-to-pdf") {
    return withDefaults({
      maxFileBytes: 50 * MIB,
      maxTotalBytes: 50 * MIB,
      maxPdfPagesPerFile: 200,
      maxRasterPixels: 12 * MEGAPIXEL,
      maxRasterEdge: 6000,
      maxOverlayImages: 10,
      maxOverlayImageBytes: 10 * MIB,
      maxOverlayImageBytesTotal: 30 * MIB,
      maxPreparedOverlayBytes: 24 * MIB,
      maxPreparedOverlayBytesTotal: 64 * MIB,
      maxOverlayPixelsPerFile: 12 * MEGAPIXEL,
      maxOverlayPixelsTotal: 40 * MEGAPIXEL,
      maxOverlayImageEdge: 6000,
      maxOverlayPlacements: 100,
    });
  }

  if (PDF_RASTER_PROFILES[slug]) {
    return withDefaults({
      ...PDF_RASTER_PROFILES[slug],
      maxRasterPixels: PDF_RASTER_PROFILES[slug].maxRasterPixels || 16 * MEGAPIXEL,
      maxRasterEdge: PDF_RASTER_PROFILES[slug].maxRasterEdge || 8192,
      ...(slug === "redact-pdf" ? {
        maxRedactionRegions: 200,
        maxRedactionRegionsPerPage: 50,
        maxRedactionSettingsCharacters: 64 * 1024,
      } : {}),
    });
  }

  if (["split-pdf", "extract-pdf-pages"].includes(slug)) {
    return withDefaults({
      maxFileBytes: 75 * MIB,
      maxTotalBytes: 75 * MIB,
      maxPdfPagesPerFile: 500,
      maxPageSelectionEntries: MAX_PAGE_SELECTION_ENTRIES,
      maxGeneratedItems: 100,
    });
  }

  if (PDF_TEXT_TOOLS.has(slug)) {
    const textLimits = {
      "pdf-to-word": 5_000_000,
      "pdf-to-powerpoint": 1_000_000,
      "pdf-to-excel": 2_000_000,
      "summarize-pdf": 1_000_000,
      "translate-pdf": 120_000,
      "pdf-to-markdown": 5_000_000,
    };
    return withDefaults({
      maxFileBytes: slug === "translate-pdf" ? 30 * MIB : 50 * MIB,
      maxTotalBytes: slug === "translate-pdf" ? 30 * MIB : 50 * MIB,
      maxPdfPagesPerFile: slug === "translate-pdf" ? 150 : slug === "pdf-to-powerpoint" ? 100 : 300,
      maxExtractedCharactersTotal: textLimits[slug],
      ...(slug === "pdf-to-markdown" ? {
        maxTextPreviewCharacters: 250_000,
        maxTextPreviewBlocks: 1_000,
      } : {}),
    });
  }

  if (PDF_UNBOUNDED_PAGE_TOOLS.has(slug)) {
    return withDefaults({
      maxFileBytes: slug === "repair-pdf" ? 50 * MIB : 75 * MIB,
      maxTotalBytes: slug === "repair-pdf" ? 50 * MIB : 75 * MIB,
      maxPdfPagesPerFile: slug === "repair-pdf" ? 300 : 500,
    });
  }

  if (OFFICE_TOOLS.has(slug)) {
    const extractedCharacters = {
      "word-to-pdf": 2_000_000,
      "powerpoint-to-pdf": 1_000_000,
      "excel-to-pdf": 2_000_000,
    };
    return withDefaults({
      maxFileBytes: 25 * MIB,
      maxTotalBytes: 25 * MIB,
      maxArchiveEntries: slug === "word-to-pdf" ? 2000 : 5000,
      maxExpandedArchiveItemBytes: 25 * MIB,
      maxExpandedArchiveBytes: slug === "word-to-pdf" ? 100 * MIB : slug === "excel-to-pdf" ? 120 * MIB : 160 * MIB,
      maxArchiveExpansionRatio: 20,
      maxExtractedCharactersTotal: extractedCharacters[slug],
      maxGeneratedPdfPages: 500,
      ...(slug === "powerpoint-to-pdf" ? { maxPresentationSlides: 250 } : {}),
      ...(slug === "excel-to-pdf" ? { maxSpreadsheetSheets: 100, maxSpreadsheetCellSlots: 500_000 } : {}),
    });
  }

  if (HTML_TOOLS.has(slug)) {
    return withDefaults({
      minFiles: 0,
      maxFileBytes: 2 * MIB,
      maxTotalBytes: 2 * MIB,
      maxMarkupCharacters: 500_000,
      ...(slug === "html-to-pdf" ? { maxExtractedCharactersTotal: 500_000, maxGeneratedPdfPages: 500 } : {}),
      ...(slug === "html-to-image" ? {
        maxHtmlOutputPixels: 12 * MEGAPIXEL,
        maxHtmlHeight: 4096,
        maxOutputEdge: 8192,
      } : {}),
    });
  }

  if (IMAGE_TO_PDF_TOOLS.has(slug)) {
    return imageProfile({
      maxFiles: 30,
      maxTotalBytes: 120 * MIB,
      maxImagePixelsTotal: 240 * MEGAPIXEL,
      firstFrameImageFormats: slug === "scan-to-pdf" ? "animated PNG/WebP" : "animated PNG",
    });
  }

  if (HEAVY_IMAGE_TOOLS.has(slug)) {
    const canEnlarge = slug === "upscale-image";
    return imageProfile({
      maxFiles: 10,
      maxFileBytes: 20 * MIB,
      maxTotalBytes: 60 * MIB,
      maxImagePixelsPerFile: 12 * MEGAPIXEL,
      maxImagePixelsTotal: 60 * MEGAPIXEL,
      maxImageEdge: 6000,
      maxOutputPixels: canEnlarge ? 16 * MEGAPIXEL : 12 * MEGAPIXEL,
      maxOutputEdge: canEnlarge ? 8192 : 6000,
      firstFrameImageFormats: canEnlarge ? "animated PNG" : "animated PNG/WebP",
      ...(slug === "remove-image-background" ? { maxInteractivePreviewPixels: 1.5 * MEGAPIXEL, maxInteractivePreviewEdge: 1600 } : {}),
      ...(slug === "blur-face" ? { maxDetectedFaces: 40 } : {}),
    });
  }

  if (slug === "convert-image") {
    return imageProfile({
      maxFiles: 10,
      maxFileBytes: 20 * MIB,
      maxTotalBytes: 80 * MIB,
      maxImagePixelsPerFile: 12 * MEGAPIXEL,
      maxImagePixelsTotal: 80 * MEGAPIXEL,
      maxOutputPixels: 12 * MEGAPIXEL,
      singleFrameImageFormats: "TIFF",
      firstFrameImageFormats: "animated GIF/PNG/WebP",
    });
  }

  if (slug === "convert-from-jpg") {
    return imageProfile({
      maxFiles: 20,
      maxFileBytes: 20 * MIB,
      maxTotalBytes: 80 * MIB,
      maxGifFrames: 20,
      maxGifWidth: 1400,
      maxGifFramePixels: 4 * MEGAPIXEL,
      maxGifFrameEdge: 4096,
    });
  }

  if (SINGLE_IMAGE_TOOLS.has(slug)) {
    return imageProfile({
      maxFiles: 1,
      maxFileBytes: 30 * MIB,
      maxTotalBytes: 30 * MIB,
      maxImagePixelsTotal: 16 * MEGAPIXEL,
      firstFrameImageFormats: "animated PNG/WebP",
    });
  }

  if (IMAGE_BATCH_TOOLS.has(slug) || tool?.kind === "image") {
    return imageProfile({
      firstFrameImageFormats: "animated PNG/WebP",
      ...(slug === "watermark-image" ? { maxInteractivePreviewPixels: 1.5 * MEGAPIXEL, maxInteractivePreviewEdge: 1600 } : {}),
    });
  }

  if (PAGE_SELECTION_TOOLS.has(slug)) {
    return withDefaults({
      maxPdfPagesPerFile: 500,
      maxPageSelectionEntries: MAX_PAGE_SELECTION_ENTRIES,
      ...(slug === "organize-pdf" ? { maxOrganizedPageMultiplier: 2 } : {}),
    });
  }

  if (slug === "pdf-forms") {
    return withDefaults({
      maxPdfPagesPerFile: 500,
      maxPdfFormFields: 1_000,
      maxPdfFormOptionsPerField: 500,
      maxPdfFormOptionsTotal: 5_000,
      maxPdfFormFieldNameCharacters: 2_048,
      maxPdfFormValueCharacters: 10_000,
      maxPdfFormMetadataCharacters: 512_000,
    });
  }

  if (tool?.kind === "pdf" || slug?.includes("pdf")) {
    return withDefaults({ maxPdfPagesPerFile: 500 });
  }

  return withDefaults();
}

export function formatLimitBytes(bytes) {
  if (bytes >= MIB && bytes % MIB === 0) return `${bytes / MIB} MB`;
  if (bytes >= MIB) return `${(bytes / MIB).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

export function getTextSettingLimit(toolOrSlug, key) {
  const rawSlug = typeof toolOrSlug === "string" ? toolOrSlug : toolOrSlug.slug;
  const slug = SLUG_ALIASES[rawSlug] || rawSlug;
  if (key === "html") return getToolLimits(toolOrSlug).maxMarkupCharacters;
  return TEXT_SETTING_LIMITS[slug]?.[key];
}

function formatPixels(pixels) {
  return `${pixels / MEGAPIXEL} MP`;
}

function formatAcceptedTypes(tool) {
  const extensions = new Set(tool.accepts.map((extension) => extension.replace(/^\./, "").toUpperCase()));
  if (extensions.has("JPG") && extensions.has("JPEG")) extensions.delete("JPEG");
  if (extensions.has("TIF") && extensions.has("TIFF")) extensions.delete("TIF");
  return [...extensions].join("/");
}

export function describeToolLimits(tool) {
  const limits = getToolLimits(tool);
  const types = formatAcceptedTypes(tool);
  const count = limits.maxFiles === 1
    ? `1 ${types} file`
    : limits.minFiles === limits.maxFiles
      ? `Exactly ${limits.maxFiles} ${types} files`
      : limits.minFiles > 1
        ? `${limits.minFiles}–${limits.maxFiles} ${types} files`
        : `Up to ${limits.maxFiles} ${types} files`;
  const primary = limits.minFiles === 0
    ? `1 ${types} file up to ${formatLimitBytes(limits.maxFileBytes)}, or pasted markup in Settings`
    : limits.maxFiles === 1
      ? `${count} · ${formatLimitBytes(limits.maxFileBytes)}`
      : `${count} · ${formatLimitBytes(limits.maxFileBytes)} each · ${formatLimitBytes(limits.maxTotalBytes)} combined`;
  const details = [];

  if (limits.maxPdfPagesPerFile) details.push(`${limits.maxPdfPagesPerFile.toLocaleString()} pages/file`);
  if (limits.maxPdfPagesTotal) details.push(`${limits.maxPdfPagesTotal.toLocaleString()} pages combined`);
  if (limits.maxImagePixelsPerFile) details.push(`${formatPixels(limits.maxImagePixelsPerFile)} / ${limits.maxImageEdge.toLocaleString()} px per image`);
  if (limits.maxImagePixelsTotal && limits.maxFiles > 1) details.push(`${formatPixels(limits.maxImagePixelsTotal)} per batch`);
  if (limits.maxOutputPixels && (limits.maxOutputPixels !== limits.maxImagePixelsPerFile || limits.maxOutputEdge !== limits.maxImageEdge || ["resize-image", "upscale-image"].includes(tool.slug))) {
    details.push(`${formatPixels(limits.maxOutputPixels)} / ${limits.maxOutputEdge.toLocaleString()} px max output`);
  }
  if (limits.maxDetectedFaces) details.push(`${limits.maxDetectedFaces.toLocaleString()} detected faces max`);
  if (limits.singleFrameImageFormats) details.push(`1 image per ${limits.singleFrameImageFormats} file`);
  if (limits.firstFrameImageFormats) details.push(`${limits.firstFrameImageFormats}: first frame only`);
  if (limits.maxRasterPixels) details.push(`${formatPixels(limits.maxRasterPixels)} / ${limits.maxRasterEdge.toLocaleString()} px per rendered page`);
  if (limits.maxRasterPixelsTotal) details.push(`${formatPixels(limits.maxRasterPixelsTotal)} rendered per job`);
  if (limits.maxExtractedCharactersTotal) details.push(`${limits.maxExtractedCharactersTotal.toLocaleString()} extracted characters`);
  if (limits.maxExtractedLinesPerFile) details.push(`${limits.maxExtractedLinesPerFile.toLocaleString()} extracted lines/file`);
  if (limits.maxExtractedLinesTotal) details.push(`${limits.maxExtractedLinesTotal.toLocaleString()} extracted lines combined`);
  if (limits.maxDiffEditLength) details.push(`${limits.maxDiffEditLength.toLocaleString()} line edits max`);
  if (limits.maxDiffMilliseconds && limits.maxDiffHardMilliseconds) details.push(`${(limits.maxDiffMilliseconds / 1000).toLocaleString()} s diff budget · ${(limits.maxDiffHardMilliseconds / 1000).toLocaleString()} s hard stop`);
  if (limits.maxOcrCharactersPerPage) details.push(`${limits.maxOcrCharactersPerPage.toLocaleString()} OCR characters/page`);
  if (limits.maxPresentationSlides) details.push(`${limits.maxPresentationSlides.toLocaleString()} slides`);
  if (limits.maxSpreadsheetSheets) details.push(`${limits.maxSpreadsheetSheets.toLocaleString()} sheets`);
  if (limits.maxSpreadsheetCellSlots) details.push(`${limits.maxSpreadsheetCellSlots.toLocaleString()} used-range cells`);
  if (limits.maxGeneratedPdfPages) details.push(`${limits.maxGeneratedPdfPages.toLocaleString()} generated PDF pages`);
  if (limits.maxPdfFormFields) details.push(`${limits.maxPdfFormFields.toLocaleString()} form fields`);
  if (limits.maxPdfFormOptionsPerField) details.push(`${limits.maxPdfFormOptionsPerField.toLocaleString()} choices/field`);
  if (limits.maxPdfFormOptionsTotal) details.push(`${limits.maxPdfFormOptionsTotal.toLocaleString()} field choices total`);
  if (limits.maxPdfFormFieldNameCharacters) details.push(`${limits.maxPdfFormFieldNameCharacters.toLocaleString()} characters/field name`);
  if (limits.maxPdfFormValueCharacters) details.push(`${limits.maxPdfFormValueCharacters.toLocaleString()} characters/field value`);
  if (limits.maxPdfFormMetadataCharacters) details.push(`${limits.maxPdfFormMetadataCharacters.toLocaleString()} field text/choice characters total`);
  if (limits.maxRedactionRegions) details.push(`${limits.maxRedactionRegions.toLocaleString()} redaction areas · ${limits.maxRedactionRegionsPerPage.toLocaleString()}/page`);
  if (limits.maxPageSelectionEntries) details.push(`${limits.maxPageSelectionEntries.toLocaleString()} expanded page-selection entries max`);
  if (limits.maxOrganizedPageMultiplier) details.push(`${limits.maxOrganizedPageMultiplier}× source pages max output`);
  if (limits.maxArchiveEntries) details.push(`${limits.maxArchiveEntries.toLocaleString()} internal items`);
  if (limits.maxExpandedArchiveItemBytes) details.push(`${formatLimitBytes(limits.maxExpandedArchiveItemBytes)} per expanded item`);
  if (limits.maxExpandedArchiveBytes) details.push(`${formatLimitBytes(limits.maxExpandedArchiveBytes)} expanded total`);
  if (limits.maxArchiveExpansionRatio) details.push(`${limits.maxArchiveExpansionRatio}× max expansion`);
  if (limits.maxMarkupCharacters) details.push(`${limits.maxMarkupCharacters.toLocaleString()} pasted characters`);
  if (limits.maxHtmlOutputPixels) {
    details.push(`${formatPixels(limits.maxHtmlOutputPixels)} · ${limits.maxOutputEdge.toLocaleString()} px wide · ${limits.maxHtmlHeight.toLocaleString()} px tall capture`);
  }
  if (limits.maxGifFrames) details.push(`${limits.maxGifFrames} GIF frames · ${limits.maxGifWidth.toLocaleString()} px wide · ${formatPixels(limits.maxGifFramePixels)} / ${limits.maxGifFrameEdge.toLocaleString()} px frame buffer`);
  if (limits.maxOverlayImages) {
    details.push(`${limits.maxOverlayImages} PNG/JPG images · ${formatLimitBytes(limits.maxOverlayImageBytes)} each · ${formatLimitBytes(limits.maxOverlayImageBytesTotal)} combined`);
    details.push(`${formatPixels(limits.maxOverlayPixelsPerFile)} / ${limits.maxOverlayImageEdge.toLocaleString()} px per placed image · ${formatPixels(limits.maxOverlayPixelsTotal)} combined`);
    details.push(`${limits.maxOverlayPlacements.toLocaleString()} placements max`);
  }
  const settingEntries = Object.entries(TEXT_SETTING_LIMITS[tool.slug] || {});
  if (settingEntries.length) {
    const uniqueLimits = new Set(settingEntries.map(([, maxLength]) => maxLength));
    if (uniqueLimits.size === 1) {
      const [[key, maxLength]] = settingEntries;
      details.push(`${maxLength.toLocaleString()} characters max in ${TEXT_SETTING_LABELS[tool.slug]?.[key] || "each text field"}`);
    } else {
      details.push(settingEntries.map(([key, maxLength]) => `${maxLength.toLocaleString()} characters in ${TEXT_SETTING_LABELS[tool.slug]?.[key] || key}`).join(" · "));
    }
  }
  if (limits.maxGeneratedItems) details.push(`${limits.maxGeneratedItems.toLocaleString()} generated files max`);
  if (limits.maxGeneratedItems || tool.output?.includes(".zip") || (tool.kind === "image" && limits.maxFiles > 1)) {
    details.push(`${formatLimitBytes(limits.maxArchiveItemBytes)} per generated file · ${formatLimitBytes(limits.maxArchiveInputBytes)} generated files combined`);
  }
  details.push(`${formatLimitBytes(limits.maxOutputBytes)} max result`);

  return { primary, secondary: details.join(" · ") };
}

function rejection(code, file, message) {
  return { code, file, message };
}

export function getPdfOverlayImagePolicy(toolOrSlug = "add-image-to-pdf") {
  const limits = getToolLimits(toolOrSlug);
  if (!limits.maxOverlayImages) {
    throw new FileLimitError("missing-overlay-policy", "This tool does not define a local image-placement policy.");
  }
  return Object.freeze({
    accepts: PDF_OVERLAY_IMAGE_ACCEPTS,
    maxFiles: limits.maxOverlayImages,
    maxFileBytes: limits.maxOverlayImageBytes,
    maxTotalBytes: limits.maxOverlayImageBytesTotal,
    maxPreparedFileBytes: limits.maxPreparedOverlayBytes,
    maxPreparedTotalBytes: limits.maxPreparedOverlayBytesTotal,
    maxImagePixelsPerFile: limits.maxOverlayPixelsPerFile,
    maxImagePixelsTotal: limits.maxOverlayPixelsTotal,
    maxImageEdge: limits.maxOverlayImageEdge,
    maxPlacements: limits.maxOverlayPlacements,
  });
}

export function describePdfOverlayImageLimits(toolOrSlug = "add-image-to-pdf") {
  const policy = getPdfOverlayImagePolicy(toolOrSlug);
  return {
    primary: `Up to ${policy.maxFiles} PNG/JPG images · ${formatLimitBytes(policy.maxFileBytes)} each · ${formatLimitBytes(policy.maxTotalBytes)} combined`,
    secondary: `${formatPixels(policy.maxImagePixelsPerFile)} / ${policy.maxImageEdge.toLocaleString()} px each · ${formatPixels(policy.maxImagePixelsTotal)} combined · static images only · ${policy.maxPlacements.toLocaleString()} placements max`,
  };
}

export function validatePdfOverlayImageSelection(toolOrSlug, currentFiles, incomingFiles) {
  const policy = getPdfOverlayImagePolicy(toolOrSlug);
  const nextFiles = [...currentFiles];
  const accepted = [];
  const rejected = [];
  let totalBytes = nextFiles.reduce((sum, file) => sum + Number(file?.size || 0), 0);

  for (const file of [...incomingFiles]) {
    const name = file?.name || "Unnamed image";
    const size = Number(file?.size);
    const lowerName = name.toLowerCase();
    if (!Number.isFinite(size) || size < 0) {
      rejected.push(rejection("invalid-size", file, `${name} wasn’t added because its size could not be read. Save a fresh copy and try again.`));
      continue;
    }
    if (size === 0) {
      rejected.push(rejection("empty-file", file, `${name} wasn’t added because it is empty. Choose an image that contains data.`));
      continue;
    }
    if (!policy.accepts.some((extension) => lowerName.endsWith(extension))) {
      rejected.push(rejection("unsupported-type", file, `${name} wasn’t added. Image placement accepts static PNG and JPG files.`));
      continue;
    }
    if (size > policy.maxFileBytes) {
      rejected.push(rejection("file-too-large", file, `${name} is ${formatLimitBytes(size)}, above the ${formatLimitBytes(policy.maxFileBytes)} image limit. Resize or compress it first.`));
      continue;
    }
    if (nextFiles.length >= policy.maxFiles) {
      rejected.push(rejection("too-many-files", file, `${name} wasn’t added because this tool accepts at most ${policy.maxFiles} placed images. Remove one or start another job.`));
      continue;
    }
    if (totalBytes + size > policy.maxTotalBytes) {
      rejected.push(rejection("total-too-large", file, `${name} would take placed images above ${formatLimitBytes(policy.maxTotalBytes)} combined. Remove images or use smaller copies.`));
      continue;
    }
    nextFiles.push(file);
    accepted.push(file);
    totalBytes += size;
  }

  return { policy, nextFiles, accepted, rejected, totalBytes };
}

export function assertPdfOverlayImageDimensions(width, height, toolOrSlug = "add-image-to-pdf", label = "This image") {
  const policy = getPdfOverlayImagePolicy(toolOrSlug);
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-overlay-dimensions", `${label} has invalid image dimensions. Re-save it as a static PNG or JPG.`);
  }
  if (Math.max(width, height) > policy.maxImageEdge) {
    throw new FileLimitError("overlay-edge-too-large", `${label} is ${width.toLocaleString()} × ${height.toLocaleString()} px; placed images support a ${policy.maxImageEdge.toLocaleString()} px longest edge. Resize it first.`);
  }
  if (pixels > policy.maxImagePixelsPerFile) {
    throw new FileLimitError("overlay-pixels-too-large", `${label} is ${formatPixels(pixels)}; placed images support ${formatPixels(policy.maxImagePixelsPerFile)} each. Resize it first.`);
  }
}

export function validatePdfOverlayPlacements(placements, assets, pageCount, toolOrSlug = "add-image-to-pdf") {
  const policy = getPdfOverlayImagePolicy(toolOrSlug);
  if (!Array.isArray(placements) || !Array.isArray(assets)) {
    throw new FileLimitError("invalid-overlay-state", "The image placements could not be read. Remove them and place the images again.");
  }
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new FileLimitError("invalid-page-count", "The PDF reported an invalid page count. Re-save it and try again.");
  }
  if (placements.length < 1) {
    throw new FileLimitError("missing-overlay-placement", "Place at least one image on a PDF page before exporting.");
  }
  if (placements.length > policy.maxPlacements) {
    throw new FileLimitError("too-many-overlay-placements", `This job has ${placements.length.toLocaleString()} image placements; the safe limit is ${policy.maxPlacements.toLocaleString()}. Remove some placements or use another job.`);
  }
  const assetIds = new Set(assets.map((asset) => asset?.id));
  if (assetIds.has(undefined) || assetIds.size !== assets.length) {
    throw new FileLimitError("invalid-overlay-assets", "Placed images contain a missing or duplicate identifier. Remove them and add the images again.");
  }
  for (const placement of placements) {
    if (!assetIds.has(placement?.assetId)) {
      throw new FileLimitError("missing-overlay-image", "A placed image is no longer available. Remove that placement and add the image again.");
    }
    if (!Number.isInteger(placement.pageIndex) || placement.pageIndex < 0 || placement.pageIndex >= pageCount) {
      throw new FileLimitError("invalid-overlay-page", "A placed image points to an unavailable PDF page. Move or remove it before exporting.");
    }
    const values = [placement.x, placement.y, placement.width, placement.rotation, placement.opacity];
    if (!values.every(Number.isFinite)
      || placement.x < 0 || placement.y < 0 || placement.x > 1 || placement.y > 1
      || placement.width < 0.02 || placement.width > 1
      || placement.x + placement.width > 1.000001
      || placement.rotation < -180 || placement.rotation > 180
      || placement.opacity < 0.1 || placement.opacity > 1) {
      throw new FileLimitError("invalid-overlay-placement", "A placed image is outside the supported page, size, rotation, or opacity range. Select it and adjust its controls.");
    }
  }
  return { placementCount: placements.length, policy };
}

export function validateFileSelection(tool, currentFiles, incomingFiles) {
  const limits = getToolLimits(tool);
  const nextFiles = [...currentFiles];
  const accepted = [];
  const rejected = [];
  let totalBytes = nextFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);

  for (const file of [...incomingFiles]) {
    const name = file?.name || "Unnamed file";
    const size = Number(file?.size);
    const lowerName = name.toLowerCase();

    if (!Number.isFinite(size) || size < 0) {
      rejected.push(rejection("invalid-size", file, `${name} wasn’t added because its size could not be read. Save a fresh copy and try again.`));
      continue;
    }
    if (size === 0) {
      rejected.push(rejection("empty-file", file, `${name} wasn’t added because it is empty. Choose a file that contains data.`));
      continue;
    }
    if (!tool.accepts.includes("*") && !tool.accepts.some((extension) => lowerName.endsWith(extension.toLowerCase()))) {
      rejected.push(rejection("unsupported-type", file, `${name} wasn’t added. ${tool.name} accepts ${formatAcceptedTypes(tool)} files.`));
      continue;
    }
    if (size > limits.maxFileBytes) {
      rejected.push(rejection("file-too-large", file, `${name} is ${formatLimitBytes(size)}, above the ${formatLimitBytes(limits.maxFileBytes)} per-file limit. Split or compress it, then try again.`));
      continue;
    }
    if (nextFiles.length >= limits.maxFiles) {
      rejected.push(rejection("too-many-files", file, `${name} wasn’t added because ${tool.name} accepts at most ${limits.maxFiles} ${limits.maxFiles === 1 ? "file" : "files"}. Start another job for the remaining files.`));
      continue;
    }
    if (totalBytes + size > limits.maxTotalBytes) {
      rejected.push(rejection("total-too-large", file, `${name} would take this job above ${formatLimitBytes(limits.maxTotalBytes)} combined. Remove files or split the work into another job.`));
      continue;
    }

    nextFiles.push(file);
    accepted.push(file);
    totalBytes += size;
  }

  return { limits, nextFiles, accepted, rejected, totalBytes };
}

export function assertMinimumFileCount(tool, count) {
  const limits = getToolLimits(tool);
  if (!Number.isInteger(count) || count < 0) {
    throw new FileLimitError("invalid-file-count", `${tool.name} could not read the selected file count. Clear the queue and try again.`);
  }
  if (count < limits.minFiles) {
    throw new FileLimitError(
      "not-enough-files",
      `${tool.name} needs at least ${limits.minFiles} ${limits.minFiles === 1 ? "file" : "files"}. Add ${limits.minFiles - count} more and try again.`,
    );
  }
}

export function assertMarkupLength(toolOrSlug, value) {
  const limits = getToolLimits(toolOrSlug);
  const length = String(value || "").length;
  if (limits.maxMarkupCharacters && length > limits.maxMarkupCharacters) {
    const name = typeof toolOrSlug === "string" ? "This HTML tool" : toolOrSlug.name;
    throw new FileLimitError(
      "markup-too-large",
      `The pasted HTML contains ${length.toLocaleString()} characters; ${name} supports ${limits.maxMarkupCharacters.toLocaleString()}. Split or simplify the markup first.`,
    );
  }
}

export function assertTextSettingLengths(tool, options) {
  for (const [key, maxLength] of Object.entries(TEXT_SETTING_LIMITS[tool.slug] || {})) {
    const value = String(options[key] || "");
    if (value.length > maxLength) {
      const label = tool.settings?.find((setting) => setting.key === key)?.label || key;
      throw new FileLimitError(
        "text-setting-too-long",
        `${label} contains ${value.length.toLocaleString()} characters; ${tool.name} supports ${maxLength.toLocaleString()}. Shorten the text and try again.`,
      );
    }
  }
}

function resolveLimits(limitsOrTool) {
  return limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
}

function assertNonNegativeInteger(value, code, message) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new FileLimitError(code, message);
  }
}

export function assertExtractedTextLength(length, limitsOrTool, label = "This document") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(length, "invalid-extracted-text-length", `${label} reported an invalid extracted-text length. Save a fresh copy and try again.`);
  if (limits.maxExtractedCharactersTotal && length > limits.maxExtractedCharactersTotal) {
    throw new FileLimitError(
      "extracted-text-limit",
      `${label} contains ${length.toLocaleString()} extracted characters; this conversion supports ${limits.maxExtractedCharactersTotal.toLocaleString()}. Split the document into smaller parts first.`,
    );
  }
}

export function assertPresentationSlideCount(count, limitsOrTool = "powerpoint-to-pdf", label = "This presentation") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(count, "invalid-slide-count", `${label} reported an invalid slide count. Save a fresh copy and try again.`);
  if (limits.maxPresentationSlides && count > limits.maxPresentationSlides) {
    throw new FileLimitError(
      "presentation-slide-limit",
      `${label} contains ${count.toLocaleString()} slides; PowerPoint to PDF supports ${limits.maxPresentationSlides.toLocaleString()}. Split the presentation first.`,
    );
  }
}

export function assertSpreadsheetComplexity(sheetCount, cellSlots, limitsOrTool = "excel-to-pdf", label = "This workbook") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(sheetCount, "invalid-sheet-count", `${label} reported an invalid sheet count. Save a fresh copy and try again.`);
  assertNonNegativeInteger(cellSlots, "invalid-cell-range", `${label} contains an invalid worksheet range. Remove malformed used ranges and try again.`);
  if (limits.maxSpreadsheetSheets && sheetCount > limits.maxSpreadsheetSheets) {
    throw new FileLimitError(
      "spreadsheet-sheet-limit",
      `${label} contains ${sheetCount.toLocaleString()} sheets; Excel to PDF supports ${limits.maxSpreadsheetSheets.toLocaleString()}. Export fewer sheets at a time.`,
    );
  }
  if (limits.maxSpreadsheetCellSlots && cellSlots > limits.maxSpreadsheetCellSlots) {
    throw new FileLimitError(
      "spreadsheet-cell-limit",
      `${label}'s used ranges cover ${cellSlots.toLocaleString()} cells; Excel to PDF supports ${limits.maxSpreadsheetCellSlots.toLocaleString()}. Clear unused rows or columns, or split the workbook first.`,
    );
  }
}

export function assertGeneratedPdfPageCount(count, limitsOrTool, label = "This conversion") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(count, "invalid-generated-page-count", `${label} reported an invalid generated page count. Simplify the source and try again.`);
  if (limits.maxGeneratedPdfPages && count > limits.maxGeneratedPdfPages) {
    throw new FileLimitError(
      "generated-pdf-page-limit",
      `${label} would create ${count.toLocaleString()} PDF pages; the safe limit is ${limits.maxGeneratedPdfPages.toLocaleString()}. Split or shorten the source document first.`,
    );
  }
}

export function assertPdfFormFieldCount(count, limitsOrTool = "pdf-forms", label = "This PDF") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(count, "invalid-form-field-count", `${label} reported an invalid form-field count. Save a fresh copy and try again.`);
  if (limits.maxPdfFormFields && count > limits.maxPdfFormFields) {
    throw new FileLimitError(
      "pdf-form-field-limit",
      `${label} contains ${count.toLocaleString()} form fields; PDF Forms supports ${limits.maxPdfFormFields.toLocaleString()}. Fill a smaller form or remove unused fields first.`,
    );
  }
}

export function assertPdfFormMetadata(stats, limitsOrTool = "pdf-forms", label = "This PDF") {
  const limits = resolveLimits(limitsOrTool);
  const values = [
    stats?.optionCount,
    stats?.metadataCharacters,
    stats?.maxFieldNameCharacters,
    stats?.maxFieldValueCharacters,
    stats?.maxOptionsPerField,
  ];
  if (!values.every((value) => Number.isInteger(value) && value >= 0)) {
    throw new FileLimitError(
      "invalid-pdf-form-metadata",
      `${label} reported invalid form metadata. Save a fresh copy and try again.`,
    );
  }
  if (stats.maxOptionsPerField > limits.maxPdfFormOptionsPerField) {
    throw new FileLimitError(
      "pdf-form-options-per-field-limit",
      `${label} contains a field with ${stats.maxOptionsPerField.toLocaleString()} choices; PDF Forms supports ${limits.maxPdfFormOptionsPerField.toLocaleString()} choices per field. Simplify that field and try again.`,
    );
  }
  if (stats.optionCount > limits.maxPdfFormOptionsTotal) {
    throw new FileLimitError(
      "pdf-form-option-limit",
      `${label} contains ${stats.optionCount.toLocaleString()} field choices; PDF Forms supports ${limits.maxPdfFormOptionsTotal.toLocaleString()} choices in one PDF. Simplify the form and try again.`,
    );
  }
  if (stats.maxFieldNameCharacters > limits.maxPdfFormFieldNameCharacters) {
    throw new FileLimitError(
      "pdf-form-field-name-limit",
      `${label} contains a ${stats.maxFieldNameCharacters.toLocaleString()}-character field name; PDF Forms supports ${limits.maxPdfFormFieldNameCharacters.toLocaleString()} characters per field name. Rename that field and try again.`,
    );
  }
  if (stats.maxFieldValueCharacters > limits.maxPdfFormValueCharacters) {
    throw new FileLimitError(
      "pdf-form-field-value-limit",
      `${label} contains a ${stats.maxFieldValueCharacters.toLocaleString()}-character field value; PDF Forms supports ${limits.maxPdfFormValueCharacters.toLocaleString()} characters per value. Shorten that field and try again.`,
    );
  }
  if (stats.metadataCharacters > limits.maxPdfFormMetadataCharacters) {
    throw new FileLimitError(
      "pdf-form-metadata-limit",
      `${label} contains ${stats.metadataCharacters.toLocaleString()} field-name, value, and choice characters; PDF Forms supports ${limits.maxPdfFormMetadataCharacters.toLocaleString()} in one PDF. Simplify the form and try again.`,
    );
  }
}

export function countLogicalLines(value) {
  const text = String(value || "");
  if (!text.length) return 0;
  let newlineCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) newlineCount += 1;
  }
  return newlineCount + (text.endsWith("\n") ? 0 : 1);
}

export function assertComparisonLineCounts(leftText, rightText, limitsOrTool = "compare-pdf") {
  const limits = resolveLimits(limitsOrTool);
  const leftLines = countLogicalLines(leftText);
  const rightLines = countLogicalLines(rightText);
  for (const [side, count] of [["first", leftLines], ["second", rightLines]]) {
    if (limits.maxExtractedLinesPerFile && count > limits.maxExtractedLinesPerFile) {
      throw new FileLimitError(
        "comparison-line-limit",
        `The ${side} PDF contains ${count.toLocaleString()} extracted lines; Compare PDF supports ${limits.maxExtractedLinesPerFile.toLocaleString()} per file. Compare a smaller page range first.`,
      );
    }
  }
  const totalLines = leftLines + rightLines;
  if (limits.maxExtractedLinesTotal && totalLines > limits.maxExtractedLinesTotal) {
    throw new FileLimitError(
      "comparison-total-line-limit",
      `These PDFs contain ${totalLines.toLocaleString()} extracted lines combined; Compare PDF supports ${limits.maxExtractedLinesTotal.toLocaleString()}. Split both PDFs into smaller ranges first.`,
    );
  }
  return { leftLines, rightLines, totalLines };
}

export function assertOrganizedPageCount(outputPages, sourcePages, limitsOrTool = "organize-pdf") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(outputPages, "invalid-organized-page-count", "The organized PDF reported an invalid output page count. Choose a simpler order and try again.");
  assertNonNegativeInteger(sourcePages, "invalid-source-page-count", "The source PDF reported an invalid page count. Save a fresh copy and try again.");
  const maximum = sourcePages * (limits.maxOrganizedPageMultiplier || 1);
  if (!Number.isSafeInteger(maximum)) {
    throw new FileLimitError("invalid-organized-page-count", "The organized PDF page limit could not be calculated safely. Split the source PDF first.");
  }
  if (limits.maxOrganizedPageMultiplier && outputPages > maximum) {
    throw new FileLimitError(
      "organized-pages-too-large",
      `This order would create ${outputPages.toLocaleString()} pages. Organize PDF supports ${limits.maxOrganizedPageMultiplier}× the source page count (${maximum.toLocaleString()} here); use fewer repeated ranges.`,
    );
  }
}

export function assertOcrCharacterCount(count, pageNumber, limitsOrTool = "ocr-pdf") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(count, "invalid-ocr-text-length", `OCR reported an invalid text length on page ${pageNumber}. Crop that page and try again.`);
  if (limits.maxOcrCharactersPerPage && count > limits.maxOcrCharactersPerPage) {
    throw new FileLimitError(
      "ocr-text-limit",
      `OCR found ${count.toLocaleString()} characters on page ${pageNumber}; the searchable-layer limit is ${limits.maxOcrCharactersPerPage.toLocaleString()}. Crop that page or OCR it separately.`,
    );
  }
}

export function assertImagePixelTotal(totalPixels, limitsOrTool, label = "This image batch") {
  const limits = resolveLimits(limitsOrTool);
  assertNonNegativeInteger(totalPixels, "invalid-total-pixels", `${label} reported an invalid decoded-pixel total. Process the images in a smaller batch.`);
  if (limits.maxImagePixelsTotal && totalPixels > limits.maxImagePixelsTotal) {
    throw new FileLimitError(
      "too-many-total-pixels",
      `${label} would use ${formatPixels(totalPixels)} of decoded pixels, above the ${formatPixels(limits.maxImagePixelsTotal)} batch limit. Process fewer images at a time or resize them first.`,
    );
  }
}

export function summarizeRejections(acceptedCount, rejected, { acceptedAction = "added" } = {}) {
  if (!rejected.length) return "";
  const labels = {
    "unsupported-type": (count) => `${count} unsupported ${count === 1 ? "type" : "types"}`,
    "file-too-large": (count) => `${count} over the per-file size limit`,
    "total-too-large": (count) => `${count} over the combined-size limit`,
    "too-many-files": (count) => `${count} over the file-count limit`,
    "empty-file": (count) => `${count} empty ${count === 1 ? "file" : "files"}`,
    "invalid-size": (count) => `${count} with ${count === 1 ? "an unreadable size" : "unreadable sizes"}`,
  };
  const groups = new Map();
  for (const item of rejected) {
    groups.set(item.code, (groups.get(item.code) || 0) + 1);
  }
  const reasons = [...groups].map(([code, count]) => labels[code]?.(count) || `${count} outside this tool’s limits`).join(", ");
  const acceptedCopy = acceptedCount
    ? acceptedAction === "replaced"
      ? "The previous file was replaced; "
      : `${acceptedCount} ${acceptedCount === 1 ? "file was" : "files were"} added; `
    : "";
  return `${acceptedCopy}${rejected.length} ${rejected.length === 1 ? "file was" : "files were"} not added: ${reasons}.`;
}

export function validatePreflightMetadata(tool, metadata) {
  const limits = getToolLimits(tool);
  let totalPages = 0;
  let totalPixels = 0;

  for (const item of metadata) {
    if ("pdfPages" in item && (!Number.isInteger(item.pdfPages) || item.pdfPages < 1)) {
      throw new FileLimitError("invalid-page-count", `${item.name} reported an invalid PDF page count. Re-save the PDF and try again.`);
    }
    if (Number.isFinite(item.pdfPages)) {
      if (limits.maxPdfPagesPerFile && item.pdfPages > limits.maxPdfPagesPerFile) {
        throw new FileLimitError(
          "too-many-pages",
          `${item.name} has ${item.pdfPages.toLocaleString()} pages; ${tool.name} safely handles up to ${limits.maxPdfPagesPerFile.toLocaleString()} per file. Split the PDF into smaller parts first.`,
          item,
        );
      }
      totalPages += item.pdfPages;
      if (limits.maxPdfPagesTotal && totalPages > limits.maxPdfPagesTotal) {
        throw new FileLimitError(
          "too-many-total-pages",
          `${item.name} takes this job above ${limits.maxPdfPagesTotal.toLocaleString()} pages combined. Remove PDFs or merge them in smaller groups.`,
          item,
        );
      }
    }

    if (("width" in item || "height" in item) && (!Number.isFinite(item.width) || !Number.isFinite(item.height))) {
      throw new FileLimitError("invalid-image-dimensions", `${item.name} reported invalid image dimensions. Re-save the image and try again.`);
    }
    if (Number.isFinite(item.width) && Number.isFinite(item.height)) {
      assertImageDimensions(item.width, item.height, limits, item.name);
      const displayedPixels = item.width * item.height;
      const decodedPixels = "decodedPixels" in item ? item.decodedPixels : displayedPixels;
      if (!Number.isSafeInteger(decodedPixels) || decodedPixels < displayedPixels) {
        throw new FileLimitError(
          "invalid-decoded-pixels",
          `${item.name} reported an invalid decoded-pixel total. Re-save the image or export it as JPG/PNG, then try again.`,
          item,
        );
      }
      totalPixels += decodedPixels;
      if (!Number.isSafeInteger(totalPixels)) {
        throw new FileLimitError(
          "invalid-total-pixels",
          `${item.name} takes this batch beyond a safe decoded-pixel total. Process fewer images at a time or export them as JPG/PNG.`,
          item,
        );
      }
      if (limits.maxImagePixelsTotal && totalPixels > limits.maxImagePixelsTotal) {
        throw new FileLimitError(
          "too-many-total-pixels",
          `${item.name} takes this batch above ${formatPixels(limits.maxImagePixelsTotal)} of decoded pixels. Process fewer images at a time or resize them first.`,
          item,
        );
      }
    }
  }

  return { totalPages, totalPixels };
}

export function assertImageDimensions(width, height, limitsOrTool, fileName = "This image") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const pixels = width * height;
  if (!Number.isFinite(pixels) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-image-dimensions", `${fileName} has invalid image dimensions. Save a fresh copy and try again.`);
  }
  if (limits.maxImageEdge && Math.max(width, height) > limits.maxImageEdge) {
    throw new FileLimitError(
      "image-edge-too-large",
      `${fileName} is ${width.toLocaleString()} × ${height.toLocaleString()} px; the longest edge limit is ${limits.maxImageEdge.toLocaleString()} px. Resize the image first.`,
    );
  }
  if (limits.maxImagePixelsPerFile && pixels > limits.maxImagePixelsPerFile) {
    throw new FileLimitError(
      "image-pixels-too-large",
      `${fileName} is ${(pixels / MEGAPIXEL).toFixed(1)} MP; this tool’s limit is ${formatPixels(limits.maxImagePixelsPerFile)}. Reduce its pixel dimensions first.`,
    );
  }
}

export function assertOutputDimensions(width, height, limitsOrTool, label = "The output") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const pixels = width * height;
  if (!Number.isFinite(pixels) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-output-dimensions", `${label} has invalid dimensions. Choose valid size settings and try again.`);
  }
  if ((limits.maxOutputEdge && Math.max(width, height) > limits.maxOutputEdge) || (limits.maxOutputPixels && pixels > limits.maxOutputPixels)) {
    throw new FileLimitError(
      "output-dimensions-too-large",
      `${label} would be ${width.toLocaleString()} × ${height.toLocaleString()} px (${(pixels / MEGAPIXEL).toFixed(1)} MP), above this tool’s safe output dimensions. Choose a smaller width, scale, or batch.`,
    );
  }
}

export function getProportionalResizeDimensions(sourceWidth, sourceHeight, targetWidth, limitsOrTool = "resize-image", label = "The resized output") {
  const normalizedSourceWidth = Number(sourceWidth);
  const normalizedSourceHeight = Number(sourceHeight);
  const normalizedTargetWidth = Math.round(Number(targetWidth));
  if (!Number.isFinite(normalizedSourceWidth) || !Number.isFinite(normalizedSourceHeight) || normalizedSourceWidth < 1 || normalizedSourceHeight < 1) {
    throw new FileLimitError("invalid-image-dimensions", `${label} could not be planned because the source dimensions are invalid. Re-save the image and try again.`);
  }
  if (!Number.isFinite(normalizedTargetWidth) || normalizedTargetWidth < 1) {
    throw new FileLimitError("invalid-output-dimensions", `${label} needs a width of at least 1 pixel. Enter a valid width and try again.`);
  }
  const output = {
    width: normalizedTargetWidth,
    height: Math.max(1, Math.round(normalizedSourceHeight * (normalizedTargetWidth / normalizedSourceWidth))),
  };
  assertOutputDimensions(output.width, output.height, limitsOrTool, label);
  return output;
}

export function getImageUpscalePlan(sourceWidth, sourceHeight, scale = IMAGE_UPSCALE_SCALES[0], limitsOrTool = "upscale-image", label = "The upscaled output") {
  const normalizedSourceWidth = Math.round(Number(sourceWidth));
  const normalizedSourceHeight = Math.round(Number(sourceHeight));
  const normalizedScale = Number(scale);
  if (!Number.isFinite(normalizedSourceWidth) || !Number.isFinite(normalizedSourceHeight) || normalizedSourceWidth < 1 || normalizedSourceHeight < 1) {
    throw new FileLimitError("invalid-image-dimensions", `${label} could not be planned because the source dimensions are invalid. Re-save the image and try again.`);
  }
  if (!IMAGE_UPSCALE_SCALES.includes(normalizedScale)) {
    throw new FileLimitError("invalid-upscale-scale", `${label} needs the 2× or 4× scale. Choose one of the available sizes and try again.`);
  }
  const width = normalizedSourceWidth * normalizedScale;
  const height = normalizedSourceHeight * normalizedScale;
  assertOutputDimensions(width, height, limitsOrTool, label);
  return Object.freeze({
    sourceWidth: normalizedSourceWidth,
    sourceHeight: normalizedSourceHeight,
    width,
    height,
    scale: normalizedScale,
    pixelMultiplier: normalizedScale ** 2,
    outputPixels: width * height,
    outputRgbaBytes: width * height * 4,
  });
}

export function getInteractiveImagePreviewDimensions(sourceWidth, sourceHeight, limitsOrTool = "remove-image-background", label = "The local preview") {
  const limits = resolveLimits(limitsOrTool);
  const width = Math.round(Number(sourceWidth));
  const height = Math.round(Number(sourceHeight));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-image-dimensions", `${label} could not be planned because the source dimensions are invalid. Re-save the image and try again.`);
  }
  if (!Number.isFinite(limits.maxInteractivePreviewPixels) || !Number.isFinite(limits.maxInteractivePreviewEdge)) {
    throw new FileLimitError("missing-preview-limits", `${label} is missing its local preview safeguards. Try another tool while this is fixed.`);
  }
  const scale = Math.min(
    1,
    limits.maxInteractivePreviewEdge / Math.max(width, height),
    Math.sqrt(limits.maxInteractivePreviewPixels / (width * height)),
  );
  return Object.freeze({
    sourceWidth: width,
    sourceHeight: height,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
    scale,
  });
}

export function getAnimatedGifPlan(frames, delayMs = GIF_FRAME_DELAY_DEFAULT_MS, loop = true, limitsOrTool = "convert-from-jpg", frameCount = frames?.length) {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const count = Number(frameCount);
  const delay = Number(delayMs);
  if (!Array.isArray(frames) || !frames.length) {
    throw new FileLimitError("missing-gif-frames", "Add at least one JPG frame before creating the animation.");
  }
  if (!Number.isInteger(count) || count < 1 || count > limits.maxGifFrames) {
    throw new FileLimitError("gif-frame-limit", `Animated GIF supports 1–${limits.maxGifFrames.toLocaleString()} frames. Remove extra images or create another animation.`);
  }
  if (!Number.isInteger(delay) || delay < GIF_FRAME_DELAY_MIN_MS || delay > GIF_FRAME_DELAY_MAX_MS) {
    throw new FileLimitError("invalid-gif-delay", `Time per image must be from ${GIF_FRAME_DELAY_MIN_MS.toLocaleString()} to ${GIF_FRAME_DELAY_MAX_MS.toLocaleString()} milliseconds.`);
  }

  const normalizedFrames = frames.map((frame, index) => {
    const width = Math.round(Number(frame?.width));
    const height = Math.round(Number(frame?.height));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new FileLimitError("invalid-image-dimensions", `${frame?.name || `Frame ${index + 1}`} has invalid image dimensions. Re-save it as a JPG and try again.`);
    }
    return { ...frame, width, height };
  });
  const first = normalizedFrames[0];
  const width = Math.min(limits.maxGifWidth, first.width);
  const height = Math.max(1, Math.round(width * (first.height / first.width)));
  assertOutputDimensions(
    width,
    height,
    { ...limits, maxOutputEdge: limits.maxGifFrameEdge, maxOutputPixels: limits.maxGifFramePixels },
    "The animated GIF frame",
  );
  const coverCroppedFrames = normalizedFrames.reduce((total, frame) => (
    (frame.width * first.height) === (frame.height * first.width) ? total : total + 1
  ), 0);

  return Object.freeze({
    frameCount: count,
    width,
    height,
    delayMs: delay,
    durationMs: count * delay,
    loop: Boolean(loop),
    coverCroppedFrames,
  });
}

export function getPhotoEditorPlan(sourceWidth, sourceHeight, settings = {}, limitsOrTool = "photo-editor", label = "The edited photo") {
  const width = Math.round(Number(sourceWidth));
  const height = Math.round(Number(sourceHeight));
  assertOutputDimensions(width, height, limitsOrTool, label);

  const adjustments = Object.fromEntries(Object.entries(PHOTO_EDITOR_ADJUSTMENTS).map(([key, policy]) => {
    const value = Number(settings[key] ?? policy.default);
    if (!Number.isInteger(value) || value < policy.min || value > policy.max) {
      throw new FileLimitError(
        "invalid-photo-adjustment",
        `${label} has an invalid ${key} value. Reset the adjustments and try again.`,
      );
    }
    return [key, value];
  }));
  const caption = String(settings.text || "");
  const captionLimit = TEXT_SETTING_LIMITS["photo-editor"].text;
  if (caption.length > captionLimit) {
    throw new FileLimitError(
      "text-setting-too-long",
      `Optional caption contains ${caption.length.toLocaleString()} characters; Photo Editor supports ${captionLimit.toLocaleString()}. Shorten the text and try again.`,
    );
  }
  const textColor = String(settings.textColor || PHOTO_EDITOR_TEXT_COLORS[0]).toLowerCase();
  if (!PHOTO_EDITOR_TEXT_COLORS.includes(textColor)) {
    throw new FileLimitError("invalid-photo-caption-color", `${label} has an unsupported caption color. Choose Light or Dark and try again.`);
  }

  return Object.freeze({
    width,
    height,
    ...adjustments,
    caption,
    captionCharacters: caption.length,
    textColor,
    adjusted: Object.entries(PHOTO_EDITOR_ADJUSTMENTS).some(([key, policy]) => adjustments[key] !== policy.default),
    changed: caption.length > 0 || Object.entries(PHOTO_EDITOR_ADJUSTMENTS).some(([key, policy]) => adjustments[key] !== policy.default),
  });
}

export function getImageCropPlan(sourceWidth, sourceHeight, aspectRatio = "free", cropScale = 100, focusX = 50, focusY = 50, limitsOrTool = "crop-image", label = "The cropped output") {
  const width = Number(sourceWidth);
  const height = Number(sourceHeight);
  const scalePercent = Number(cropScale);
  const normalizedFocusX = Number(focusX);
  const normalizedFocusY = Number(focusY);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-image-dimensions", `${label} could not be planned because the source dimensions are invalid. Re-save the image and try again.`);
  }
  if (!Number.isFinite(scalePercent) || scalePercent < IMAGE_CROP_SCALE_MIN_PERCENT || scalePercent > IMAGE_CROP_SCALE_MAX_PERCENT) {
    throw new FileLimitError("invalid-crop-settings", `${label} needs a crop size from ${IMAGE_CROP_SCALE_MIN_PERCENT}% to ${IMAGE_CROP_SCALE_MAX_PERCENT}%. Reset the crop and try again.`);
  }
  if (![normalizedFocusX, normalizedFocusY].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
    throw new FileLimitError("invalid-crop-settings", `${label} has an invalid focal position. Reset the crop and try again.`);
  }

  const ratioMap = { free: width / height, original: width / height, "1:1": 1, "4:3": 4 / 3, "16:9": 16 / 9 };
  const ratio = ratioMap[aspectRatio] || Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new FileLimitError("invalid-crop-settings", `${label} has an unsupported aspect ratio. Choose Original, Square, Standard, or Wide.`);
  }

  let maximumWidth = width;
  let maximumHeight = maximumWidth / ratio;
  if (maximumHeight > height) {
    maximumHeight = height;
    maximumWidth = maximumHeight * ratio;
  }
  const scale = scalePercent / 100;
  const outputWidth = Math.max(1, Math.min(Math.round(width), Math.round(maximumWidth * scale)));
  const outputHeight = Math.max(1, Math.min(Math.round(height), Math.round(maximumHeight * scale)));
  const availableX = Math.max(0, Math.round(width) - outputWidth);
  const availableY = Math.max(0, Math.round(height) - outputHeight);
  const x = Math.round(availableX * (normalizedFocusX / 100));
  const y = Math.round(availableY * (normalizedFocusY / 100));
  assertOutputDimensions(outputWidth, outputHeight, limitsOrTool, label);
  return {
    x,
    y,
    width: outputWidth,
    height: outputHeight,
    sourceWidth: Math.round(width),
    sourceHeight: Math.round(height),
    aspectRatio: String(aspectRatio || "free"),
    cropScale: scalePercent,
    focusX: normalizedFocusX,
    focusY: normalizedFocusY,
    retainedPercent: Math.max(1, Math.min(100, Math.round(((outputWidth * outputHeight) / (width * height)) * 100))),
  };
}

export function assertRasterDimensions(width, height, limitsOrTool, label = "This PDF page") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const pixels = width * height;
  if (!Number.isFinite(pixels) || width < 1 || height < 1) {
    throw new FileLimitError("invalid-raster-dimensions", `${label} has invalid render dimensions. Re-save the PDF and try again.`);
  }
  if ((limits.maxRasterEdge && Math.max(width, height) > limits.maxRasterEdge) || (limits.maxRasterPixels && pixels > limits.maxRasterPixels)) {
    throw new FileLimitError(
      "pdf-page-too-large",
      `${label} would render at ${Math.ceil(width).toLocaleString()} × ${Math.ceil(height).toLocaleString()} px (${(pixels / MEGAPIXEL).toFixed(1)} MP), above the safe canvas limit. Crop or resize the page, or process a lower-resolution copy.`,
    );
  }
}

export function assertGeneratedItemCount(count, toolOrSlug, label = "results") {
  const limits = getToolLimits(toolOrSlug);
  if (!Number.isInteger(count) || count < 0) {
    throw new FileLimitError("invalid-result-count", `The number of generated ${label} is invalid. Choose a smaller selection and try again.`);
  }
  if (limits.maxGeneratedItems && count > limits.maxGeneratedItems) {
    throw new FileLimitError(
      "too-many-generated-items",
      `This selection would create ${count.toLocaleString()} ${label}; the safe limit is ${limits.maxGeneratedItems.toLocaleString()}. Choose fewer pages and run another job for the rest.`,
    );
  }
}

export function assertOutputSize(size, name = "The generated file", maxBytes = GLOBAL_OUTPUT_LIMIT_BYTES) {
  if (!Number.isFinite(size) || size < 0) {
    throw new FileLimitError("invalid-output-size", `${name} reported an invalid size, so it was not prepared for download. Retry with a smaller job.`);
  }
  if (size > maxBytes) {
    throw new FileLimitError(
      "output-too-large",
      `${name} is ${formatLimitBytes(size)}, above the ${formatLimitBytes(maxBytes)} in-memory result limit. Reduce pages, dimensions, or quality and try again.`,
    );
  }
}
