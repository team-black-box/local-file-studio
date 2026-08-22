// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  PDF_TO_JPG_RENDER_SCALE,
  baseName,
  createMergePdfPlan,
  createSplitPdfGroups,
  createResultBudget,
  formatPageSelection,
  parsePageSelection,
  parseRemovalPageSelection,
  resultFromBlob,
  resultFromText,
  retainResult,
  safeFileName,
  zipResults,
} from "./file-utils.js";
import { protectPdf, repairPdf, unlockPdf } from "./libpdf.js";
import { fillPdfFormFields } from "./pdf-form-fields.js";
import { createRedactionPlan } from "./pdf-redactions.js";
import {
  PDF_SIGNATURE_LIMITS,
  createPdfSignatureDrawOperations,
  createPdfSignatureLayout,
  createPdfSignaturePlan,
  getPdfSignaturePageGeometry,
} from "./pdf-signature.js";
import { createPdfTextAnnotationDrawOperation, createPdfTextAnnotationLayout, createPdfTextAnnotationPlan, getPdfTextAnnotationPageGeometry } from "./pdf-text-annotation.js";
import {
  FileLimitError,
  assertExtractedTextLength,
  assertGeneratedItemCount,
  assertGeneratedPdfPageCount,
  assertImageDimensions,
  assertImagePixelTotal,
  assertOcrCharacterCount,
  assertOrganizedPageCount,
  assertPdfOverlayImageDimensions,
  assertRasterDimensions,
  countLogicalLines,
  formatLimitBytes,
  getPdfOverlayImagePolicy,
  getToolLimits,
  validatePdfOverlayImageSelection,
  validatePdfOverlayPlacements,
} from "./file-limits.js";
import { runBoundedLineDiff } from "./diff-worker-client.js";
import { createComparisonHtml, createComparisonView } from "./pdf-comparison.js";
import { destroyPdfJsDocument, getPdfJsEngine } from "./pdfjs-utils.js";
import { protectGeneratedPdfResults } from "./pdf-output-protection.js";
import { applyBasicTranslationGlossary, getPdfTranslationLanguage, getPdfTranslationMode, splitTranslationText } from "./pdf-translation.js";

const WIN_ANSI_EXTRA_CODE_POINTS = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192,
  0x02c6, 0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c,
  0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039,
  0x203a, 0x20ac, 0x2122,
]);

export const PDF_OFFICE_TEXT_PREVIEW_CHARACTERS = 1600;

function isStandardPdfTextCharacter(character) {
  const codePoint = character.codePointAt(0);
  return [9, 10, 13].includes(codePoint)
    || (codePoint >= 0x20 && codePoint <= 0x7e)
    || (codePoint >= 0xa0 && codePoint <= 0xff)
    || WIN_ANSI_EXTRA_CODE_POINTS.has(codePoint);
}

function standardPdfMetadataText(value, fallback) {
  const sanitized = Array.from(String(value || ""), (character) => (
    isStandardPdfTextCharacter(character) && !["\t", "\n", "\r"].includes(character) ? character : "?"
  )).join("").trim();
  return sanitized || fallback;
}

export function assertPdfTextFontCompatibility(value, label = "This document") {
  const unsupported = [];
  const seen = new Set();
  for (const character of String(value || "")) {
    if (isStandardPdfTextCharacter(character) || seen.has(character)) continue;
    seen.add(character);
    unsupported.push(character);
    if (unsupported.length === 5) break;
  }
  if (!unsupported.length) return;
  const examples = unsupported.map((character) => {
    const labelCharacter = /\s/u.test(character) ? "control character" : `“${character}”`;
    return `${labelCharacter} (U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")})`;
  }).join(", ");
  throw new FileLimitError(
    "unsupported-pdf-text-character",
    `${label} contains text characters the current local PDF font cannot preserve: ${examples}. Replace them with Latin text (for example, use INR instead of the rupee symbol) and try again.`,
  );
}

async function openRenderedPdf(file, password = "") {
  const pdfjs = await getPdfJsEngine();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return await pdfjs.getDocument({ data: bytes, password: password || undefined }).promise;
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.86) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not render this PDF page."))), type, quality);
  });
}

async function renderPdfPage(pdf, index, { scale = 1.45, type = "image/jpeg", quality = 0.86, limits, label } = {}) {
  const page = await pdf.getPage(index + 1);
  let canvas;
  try {
    const viewport = page.getViewport({ scale });
    const renderLimits = limits || { maxFileBytes: 1, maxRasterPixels: 16_000_000, maxRasterEdge: 8192 };
    const renderLabel = label || `PDF page ${index + 1}`;
    assertRasterDimensions(viewport.width, viewport.height, renderLimits, renderLabel);
    const canvasWidth = Math.ceil(viewport.width);
    const canvasHeight = Math.ceil(viewport.height);
    assertRasterDimensions(canvasWidth, canvasHeight, renderLimits, renderLabel);
    canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d", { alpha: type !== "image/jpeg" });
    if (type === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    await page.render({ canvasContext: context, viewport }).promise;
    const blob = await canvasToBlob(canvas, type, quality);
    return { canvas, blob, width: canvas.width, height: canvas.height };
  } catch (error) {
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    throw error;
  } finally {
    page.cleanup();
  }
}

export async function extractPdfPagesText(file, password = "", report, characterLimit, signal) {
  const pdf = await openRenderedPdf(file, password);
  const pages = [];
  const budget = characterLimit && typeof characterLimit === "object"
    ? characterLimit
    : { maxCharacters: characterLimit, used: 0 };
  const assertWithinCharacterBudget = (nextUsed) => {
    if (budget.maxCharacters && nextUsed > budget.maxCharacters) {
      throw new FileLimitError(
        budget.code || "extracted-text-limit",
        budget.message?.(file, budget.maxCharacters)
          || `${file.name} contains more than ${budget.maxCharacters.toLocaleString()} selectable characters for this tool. Choose fewer pages or split the PDF first.`,
      );
    }
  };
  try {
    for (let index = 0; index < pdf.numPages; index += 1) {
      if (signal?.aborted) throw new DOMException("PDF text inspection was cancelled.", "AbortError");
      report?.({ phase: `Reading page ${index + 1} of ${pdf.numPages}`, progress: (index + 1) / (pdf.numPages + 1) });
      const page = await pdf.getPage(index + 1);
      try {
        let line = "";
        let lastY = null;
        const lines = [];
        const usedBeforePage = Number(budget.used || 0);
        let pageCharacters = 0;
        const reader = page.streamTextContent({ includeMarkedContent: false }).getReader();
        try {
          while (true) {
            if (signal?.aborted) throw new DOMException("PDF text inspection was cancelled.", "AbortError");
            const { value: chunk, done } = await reader.read();
            if (done) break;
            for (const item of chunk?.items || []) {
              const y = item.transform?.[5] ?? lastY;
              if (lastY !== null && Math.abs(y - lastY) > 4 && line.trim()) {
                lines.push(line.trim());
                line = "";
              }
              const itemText = `${item.str || ""}${item.hasEOL ? "\n" : " "}`;
              pageCharacters += itemText.length;
              assertWithinCharacterBudget(usedBeforePage + pageCharacters);
              line += itemText;
              if (item.hasEOL && line.trim()) {
                lines.push(line.trim());
                line = "";
              }
              lastY = y;
            }
          }
        } finally {
          try {
            await reader.cancel();
          } catch {
            // The stream is already closed after a normal read; cancellation
            // matters only when a character budget stops extraction early.
          }
        }
        if (line.trim()) lines.push(line.trim());
        const pageText = lines.join("\n");
        const nextUsed = usedBeforePage + pageText.length;
        assertWithinCharacterBudget(nextUsed);
        budget.used = nextUsed;
        pages.push(pageText);
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await destroyPdfJsDocument(pdf);
  }
}

export function createPdfOfficeTextPreview(pages, maxPreviewCharacters = PDF_OFFICE_TEXT_PREVIEW_CHARACTERS) {
  if (!Array.isArray(pages) || !pages.length || pages.some((page) => typeof page !== "string")) {
    throw new FileLimitError("invalid-pdf-text-pages", "The extracted PDF text could not be used to plan this Office export. Choose the PDF again.");
  }
  const previewLimit = Number.isInteger(Number(maxPreviewCharacters)) && Number(maxPreviewCharacters) > 0
    ? Number(maxPreviewCharacters)
    : PDF_OFFICE_TEXT_PREVIEW_CHARACTERS;
  const pageStats = pages.map((text, index) => {
    const trimmed = text.trim();
    return {
      pageNumber: index + 1,
      characterCount: text.length,
      wordCount: trimmed ? trimmed.split(/\s+/u).length : 0,
      hasText: Boolean(trimmed),
      previewText: text.slice(0, previewLimit),
      truncated: text.length > previewLimit,
    };
  });
  return {
    pageCount: pageStats.length,
    pagesWithText: pageStats.filter((page) => page.hasText).length,
    emptyPageCount: pageStats.filter((page) => !page.hasText).length,
    characterCount: pageStats.reduce((sum, page) => sum + page.characterCount, 0),
    wordCount: pageStats.reduce((sum, page) => sum + page.wordCount, 0),
    pageStats,
  };
}

function validatePdfOfficeTextPages(pages, file, limits) {
  const preview = createPdfOfficeTextPreview(pages);
  if (preview.pageCount > limits.maxPdfPagesPerFile) {
    throw new FileLimitError(
      "too-many-pages",
      `${file.name} has ${preview.pageCount.toLocaleString()} pages; this conversion supports ${limits.maxPdfPagesPerFile.toLocaleString()} per file. Split it first.`,
    );
  }
  if (preview.characterCount > limits.maxExtractedCharactersTotal) {
    throw new FileLimitError(
      "extracted-text-limit",
      `${file.name} contains more than ${limits.maxExtractedCharactersTotal.toLocaleString()} selectable characters for this tool. Choose fewer pages or split the PDF first.`,
    );
  }
  return preview;
}

function pdfTextToSpreadsheetRows(text) {
  if (!String(text).trim()) return [];
  return String(text).split("\n").map((line) => line.split(/\s{2,}|\t|\|/).map((cell) => cell.trim()));
}

export function createPdfSpreadsheetPlan(pages, maxPreviewRows = 8, maxPreviewColumns = 6) {
  createPdfOfficeTextPreview(pages, 1);
  const sheets = pages.map((text, index) => {
    const rows = pdfTextToSpreadsheetRows(text);
    const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    return {
      pageNumber: index + 1,
      name: `Page ${index + 1}`.slice(0, 31),
      rowCount: rows.length,
      valueCount: rows.reduce((sum, row) => sum + row.filter(Boolean).length, 0),
      columnCount,
      previewRows: rows.slice(0, maxPreviewRows).map((row) => row.slice(0, maxPreviewColumns)),
      previewTruncatedRows: rows.length > maxPreviewRows,
      previewTruncatedColumns: columnCount > maxPreviewColumns,
    };
  });
  return {
    sheetCount: sheets.length,
    rowCount: sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
    valueCount: sheets.reduce((sum, sheet) => sum + sheet.valueCount, 0),
    sheets,
  };
}

export async function inspectPdfOfficeText(file, password = "", limits = getToolLimits("pdf-to-word"), report, signal, format) {
  const pages = await extractPdfPagesText(file, password, report, limits.maxExtractedCharactersTotal, signal);
  const preview = { pages, ...validatePdfOfficeTextPages(pages, file, limits) };
  if (format === "xlsx") preview.spreadsheetPlan = createPdfSpreadsheetPlan(pages);
  return preview;
}

async function loadPdfLib(file) {
  const { PDFDocument } = await import("pdf-lib");
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
  } catch (error) {
    if (/encrypt/i.test(String(error))) throw new Error("This PDF is encrypted. Use Unlock PDF first, then retry this tool.");
    throw error;
  }
}

function pdfResult(name, bytes, details = "PDF created on this device") {
  return resultFromBlob(name, new Blob([bytes], { type: "application/pdf" }), details);
}

async function copyPagesToNewDocument(source, indices) {
  const { PDFDocument } = await import("pdf-lib");
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  return output;
}

async function mergePdfs(files, options, report) {
  const { PDFDocument } = await import("pdf-lib");
  const limits = getToolLimits("merge-pdf");
  const output = await PDFDocument.create();
  const pageCounts = [];
  let plan = createMergePdfPlan(pageCounts, files.map((file) => file.name), limits);
  for (let index = 0; index < files.length; index += 1) {
    report?.({ phase: `Adding PDF ${index + 1} of ${files.length}`, progress: index / files.length });
    const source = await loadPdfLib(files[index]);
    const sourcePages = source.getPageCount();
    pageCounts.push(sourcePages);
    plan = createMergePdfPlan(pageCounts, files.map((file) => file.name), limits);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  if (!plan.valid) throw new FileLimitError("not-enough-files", `Merge PDF needs at least ${limits.minFiles.toLocaleString()} PDFs.`);
  const bytes = await output.save({ useObjectStreams: true });
  const result = pdfResult("merged-local.pdf", bytes, `${plan.totalPages.toLocaleString()} ${plan.totalPages === 1 ? "page" : "pages"} merged`);
  return [{ ...result, mergeOutcome: { fileCount: plan.fileCount, totalPages: plan.totalPages } }];
}

async function splitPdf(file, options, report) {
  const source = await loadPdfLib(file);
  const pageCount = source.getPageCount();
  const splitMode = options.mode || (options.pages && options.pages !== "all" ? "selected" : "all");
  const groups = createSplitPdfGroups(splitMode, pageCount, options.customBreaks, options.pages);
  assertGeneratedItemCount(groups.length, "split-pdf", "PDF files");
  const results = [];
  const resultBudget = createResultBudget();
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const firstPage = group[0] + 1;
    const lastPage = group[group.length - 1] + 1;
    const contiguous = group.every((page, pageIndex) => pageIndex === 0 || page === group[pageIndex - 1] + 1);
    const pageLabel = formatPageSelection(group);
    const fileLabel = splitMode === "odd" || splitMode === "even"
      ? `${splitMode}-pages`
      : group.length === 1
        ? `page-${firstPage}`
        : contiguous
          ? `pages-${firstPage}-${lastPage}`
          : `pages-${index + 1}`;
    report?.({ phase: `Creating PDF ${index + 1} of ${groups.length}`, progress: index / groups.length });
    const output = await copyPagesToNewDocument(source, group);
    results.push(retainResult(
      resultBudget,
      pdfResult(
        `${safeFileName(baseName(file.name))}-${fileLabel}.pdf`,
        await output.save(),
        `${group.length.toLocaleString()} ${group.length === 1 ? "page" : "pages"} · ${pageLabel}`,
      ),
    ));
  }
  const protectedResults = await protectGeneratedPdfResults(results, options.outputPassword);
  const output = await zipResults(protectedResults, `${safeFileName(baseName(file.name))}-split.zip`);
  if (output.length === 1 && output[0].type === "application/zip") {
    output[0].details = `${groups.length} PDFs in one ZIP${options.outputPassword ? " · contained PDFs are password-protected" : ""}`;
  }
  return output;
}

async function selectPdfPages(slug, file, options) {
  const source = await loadPdfLib(file);
  const pageCount = source.getPageCount();
  const selected = slug === "remove-pages"
    ? parseRemovalPageSelection(options.pages || options.range || "", pageCount)
    : parsePageSelection(options.pages || options.range || "1", pageCount, "none");
  let order;
  if (slug === "remove-pages") {
    const removed = new Set(selected);
    order = source.getPageIndices().filter((index) => !removed.has(index));
  } else if (slug === "organize-pdf") {
    order = parsePageSelection(options.order || options.pages || "all", pageCount, "all", true);
  } else {
    order = selected.length ? selected : source.getPageIndices();
  }
  if (!order.length) throw new Error("That page selection would create an empty PDF.");
  if (slug === "organize-pdf") assertOrganizedPageCount(order.length, pageCount, "organize-pdf");
  if (slug === "extract-pages" && options.combine === false) {
    assertGeneratedItemCount(order.length, "extract-pdf-pages", "PDF files");
    const results = [];
    const resultBudget = createResultBudget();
    for (const index of order) {
      const single = await copyPagesToNewDocument(source, [index]);
      results.push(retainResult(
        resultBudget,
        pdfResult(`${safeFileName(baseName(file.name))}-page-${index + 1}.pdf`, await single.save(), "Extracted page"),
      ));
    }
    const protectedResults = await protectGeneratedPdfResults(results, options.outputPassword);
    const output = await zipResults(protectedResults, `${safeFileName(baseName(file.name))}-extracted-pages.zip`);
    if (options.outputPassword && output[0]?.type === "application/zip") {
      output[0].details = `${output[0].details} · contained PDFs are password-protected`;
    }
    return output;
  }
  const output = await copyPagesToNewDocument(source, order);
  return [pdfResult(`${safeFileName(baseName(file.name))}-${safeFileName(slug)}.pdf`, await output.save(), `${order.length} pages`)];
}

async function mutatePdf(slug, file, options) {
  const { StandardFonts, degrees, rgb } = await import("pdf-lib");
  const pdf = await loadPdfLib(file);
  const pages = pdf.getPages();
  const font = await pdf.embedFont(slug === "sign-pdf" ? StandardFonts.TimesRomanItalic : StandardFonts.Helvetica);
  const detailFont = slug === "sign-pdf" ? await pdf.embedFont(StandardFonts.Helvetica) : font;
  const textAnnotationPlan = slug === "edit-pdf" ? createPdfTextAnnotationPlan(options, pages.length) : null;
  const textAnnotationPages = textAnnotationPlan ? new Set(textAnnotationPlan.pageIndices) : null;
  const signaturePlan = slug === "sign-pdf" ? createPdfSignaturePlan(options, pages.length) : null;
  if (textAnnotationPlan) assertPdfTextFontCompatibility(textAnnotationPlan.text, "Text to add");
  if (signaturePlan) {
    assertPdfTextFontCompatibility(signaturePlan.name, "Typed signature");
    if (signaturePlan.includeDate) assertPdfTextFontCompatibility(signaturePlan.dateLabel, "Signing date");
  }

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const { width, height } = page.getSize();

    if (slug === "rotate-pdf") {
      const angle = Number(options.angle || 90);
      page.setRotation(degrees((page.getRotation().angle + angle + 360) % 360));
    }

    if (slug === "add-page-numbers") {
      const text = String(index + Number(options.start || 1));
      const size = Number(options.fontSize || 11);
      const textWidth = font.widthOfTextAtSize(text, size);
      const position = options.position || "bottom-center";
      const x = position.includes("left") ? 36 : position.includes("right") ? width - textWidth - 36 : (width - textWidth) / 2;
      const y = position.includes("top") ? height - size - 28 : 28;
      page.drawText(text, { x, y, size, font, color: rgb(0.22, 0.22, 0.24) });
    }

    if (slug === "watermark-pdf") {
      const text = String(options.text || "PRIVATE");
      const size = Number(options.fontSize || Math.max(28, Math.min(64, width / 8)));
      const textWidth = font.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: (width - textWidth) / 2,
        y: height / 2,
        size,
        font,
        color: rgb(0.36, 0.3, 0.86),
        rotate: degrees(Number(options.angle || 35)),
        opacity: Number(options.opacity || 24) / 100,
      });
    }

    if (slug === "crop-pdf") {
      const margin = Math.max(0, Math.min(42, Number(options.margin || 5))) / 100;
      page.setCropBox(width * margin, height * margin, width * (1 - margin * 2), height * (1 - margin * 2));
    }

    if (slug === "edit-pdf" && textAnnotationPages.has(index)) {
      const geometry = getPdfTextAnnotationPageGeometry(width, height, page.getRotation().angle);
      const layout = createPdfTextAnnotationLayout(
        textAnnotationPlan,
        geometry.visualWidth,
        geometry.visualHeight,
        (text) => font.widthOfTextAtSize(text, textAnnotationPlan.fontSize),
      );
      layout.lines.forEach((line, lineIndex) => {
        if (!line) return;
        const operation = createPdfTextAnnotationDrawOperation(layout, geometry, lineIndex, textAnnotationPlan.fontSize);
        page.drawText(line, {
          x: operation.x,
          y: operation.y,
          size: textAnnotationPlan.fontSize,
          font,
          color: rgb(0.12, 0.12, 0.16),
          rotate: degrees(operation.rotation),
        });
      });
    }

    if (signaturePlan && index === signaturePlan.pageIndex) {
      const geometry = getPdfSignaturePageGeometry(width, height, page.getRotation().angle);
      const layout = createPdfSignatureLayout(
        signaturePlan,
        geometry.visualWidth,
        geometry.visualHeight,
        (text) => font.widthOfTextAtSize(text, signaturePlan.fontSize),
        (text) => detailFont.widthOfTextAtSize(text, PDF_SIGNATURE_LIMITS.dateFontSize),
      );
      const operations = createPdfSignatureDrawOperations(layout, geometry, signaturePlan.includeDate);
      page.drawLine({
        start: operations.line.start,
        end: operations.line.end,
        thickness: 0.7,
        color: rgb(0.38, 0.38, 0.42),
      });
      page.drawText(signaturePlan.name, {
        x: operations.signature.x,
        y: operations.signature.y,
        size: signaturePlan.fontSize,
        font,
        color: rgb(0.12, 0.12, 0.18),
        rotate: degrees(operations.signature.rotation),
      });
      if (signaturePlan.includeDate) {
        page.drawText(signaturePlan.dateLabel, {
          x: operations.date.x,
          y: operations.date.y,
          size: PDF_SIGNATURE_LIMITS.dateFontSize,
          font: detailFont,
          color: rgb(0.42, 0.42, 0.46),
          rotate: degrees(operations.date.rotation),
        });
      }
    }
  }

  pdf.setProducer("Local File Studio — browser-local processing");
  pdf.setModificationDate(new Date());
  const bytes = await pdf.save({ useObjectStreams: true });
  if (textAnnotationPlan) {
    const result = pdfResult(
      `${safeFileName(baseName(file.name))}-${safeFileName(slug)}.pdf`,
      bytes,
      `${textAnnotationPlan.affectedPageCount.toLocaleString()} ${textAnnotationPlan.affectedPageCount === 1 ? "page" : "pages"} annotated · ${textAnnotationPlan.fontSize.toLocaleString()} pt`,
    );
    result.textAnnotationOutcome = {
      scope: textAnnotationPlan.scope,
      targetPage: textAnnotationPlan.targetPage,
      affectedPageCount: textAnnotationPlan.affectedPageCount,
      pageCount: textAnnotationPlan.pageCount,
      fontSize: textAnnotationPlan.fontSize,
      x: textAnnotationPlan.x,
      y: textAnnotationPlan.y,
    };
    return [result];
  }
  if (signaturePlan) {
    const result = pdfResult(
      `${safeFileName(baseName(file.name))}-${safeFileName(slug)}.pdf`,
      bytes,
      `Final page signed · ${signaturePlan.fontSize.toLocaleString()} pt${signaturePlan.includeDate ? " · date included" : " · signature only"}`,
    );
    result.signatureOutcome = {
      pageCount: signaturePlan.pageCount,
      pageNumber: signaturePlan.pageCount,
      fontSize: signaturePlan.fontSize,
      includeDate: signaturePlan.includeDate,
      signingDate: signaturePlan.includeDate ? signaturePlan.signingDate : null,
      x: signaturePlan.x,
      y: signaturePlan.y,
    };
    return [result];
  }
  return [pdfResult(`${safeFileName(baseName(file.name))}-${safeFileName(slug)}.pdf`, bytes, `${pages.length} pages updated`)];
}

function detectEmbeddedImageFormat(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

async function addImagesToPdf(file, options, report) {
  const { degrees } = await import("pdf-lib");
  const assets = Array.isArray(options.overlayAssets) ? options.overlayAssets : [];
  const placements = Array.isArray(options.placements) ? options.placements : [];
  const sourceFiles = assets.map((asset) => asset?.sourceFile);
  const selection = validatePdfOverlayImageSelection("add-image-to-pdf", [], sourceFiles);
  if (selection.rejected.length || selection.accepted.length !== sourceFiles.length) {
    throw new FileLimitError("overlay-input-limit", selection.rejected[0]?.message || "One or more placed images are outside this tool’s limits.");
  }

  const policy = getPdfOverlayImagePolicy("add-image-to-pdf");
  const pdf = await loadPdfLib(file);
  const pages = pdf.getPages();
  validatePdfOverlayPlacements(placements, assets, pages.length, "add-image-to-pdf");

  const embedded = new Map();
  let totalPreparedBytes = 0;
  let totalPixels = 0;
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const blob = asset?.preparedBlob || asset?.sourceFile;
    const name = asset?.sourceFile?.name || `Placed image ${index + 1}`;
    const size = Number(blob?.size);
    if (!Number.isFinite(size) || size < 1 || size > policy.maxPreparedFileBytes) {
      throw new FileLimitError("prepared-overlay-size", `${name} would use more than ${formatLimitBytes(policy.maxPreparedFileBytes)} after local preparation. Use a smaller image or disable white-background cleanup.`);
    }
    totalPreparedBytes += size;
    if (!Number.isSafeInteger(totalPreparedBytes) || totalPreparedBytes > policy.maxPreparedTotalBytes) {
      throw new FileLimitError("prepared-overlay-total", `Prepared images exceed ${formatLimitBytes(policy.maxPreparedTotalBytes)} in browser memory. Remove images or use smaller copies.`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const format = detectEmbeddedImageFormat(bytes);
    if (!format) throw new FileLimitError("unsupported-overlay-content", `${name} does not contain a supported PNG or JPG image.`);
    const image = format === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    assertPdfOverlayImageDimensions(image.width, image.height, "add-image-to-pdf", name);
    totalPixels += image.width * image.height;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > policy.maxImagePixelsTotal) {
      throw new FileLimitError("overlay-total-pixels", `${name} takes placed images above ${policy.maxImagePixelsTotal / 1_000_000} MP combined. Remove images or use smaller copies.`);
    }
    embedded.set(asset.id, { image, name });
  }

  for (let index = 0; index < placements.length; index += 1) {
    const placement = placements[index];
    report?.({ phase: `Placing image ${index + 1} of ${placements.length}`, progress: 0.25 + ((index + 1) / placements.length) * 0.65 });
    const page = pages[placement.pageIndex];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const entry = embedded.get(placement.assetId);
    const drawWidth = pageWidth * placement.width;
    const drawHeight = drawWidth * (entry.image.height / entry.image.width);
    const top = pageHeight * placement.y;
    const left = pageWidth * placement.x;
    const bottom = pageHeight - top - drawHeight;
    if (drawHeight > pageHeight || bottom < -0.001) {
      throw new FileLimitError("overlay-outside-page", `${entry.name} extends below page ${placement.pageIndex + 1}. Resize it or move it upward before exporting.`);
    }
    const radians = (-placement.rotation * Math.PI) / 180;
    const centerX = left + drawWidth / 2;
    const centerY = bottom + drawHeight / 2;
    const rotatedCenterX = (drawWidth / 2) * Math.cos(radians) - (drawHeight / 2) * Math.sin(radians);
    const rotatedCenterY = (drawWidth / 2) * Math.sin(radians) + (drawHeight / 2) * Math.cos(radians);
    page.drawImage(entry.image, {
      x: centerX - rotatedCenterX,
      y: centerY - rotatedCenterY,
      width: drawWidth,
      height: drawHeight,
      rotate: degrees(-placement.rotation),
      opacity: placement.opacity,
    });
  }

  pdf.setProducer("Local File Studio — browser-local processing");
  pdf.setModificationDate(new Date());
  const bytes = await pdf.save({ useObjectStreams: true });
  return [pdfResult(`${safeFileName(baseName(file.name))}-with-images.pdf`, bytes, `${placements.length} image placement${placements.length === 1 ? "" : "s"}`)];
}

async function imageFilesToPdf(slug, files, options, report) {
  const { PDFDocument } = await import("pdf-lib");
  const limits = getToolLimits(slug);
  const output = await PDFDocument.create();
  let totalDecodedPixels = 0;
  for (let index = 0; index < files.length; index += 1) {
    report?.({ phase: `Adding image ${index + 1} of ${files.length}`, progress: index / files.length });
    const file = files[index];
    let bytes = await file.arrayBuffer();
    let image;
    if (/png/i.test(file.type) || /\.png$/i.test(file.name)) image = await output.embedPng(bytes);
    else if (/jpe?g/i.test(file.type) || /\.jpe?g$/i.test(file.name)) image = await output.embedJpg(bytes);
    else {
      const bitmap = await createImageBitmap(file);
      assertImageDimensions(bitmap.width, bitmap.height, limits, file.name);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      bytes = await (await canvasToBlob(canvas, "image/png")).arrayBuffer();
      canvas.width = 1;
      canvas.height = 1;
      image = await output.embedPng(bytes);
    }
    assertImageDimensions(image.width, image.height, limits, file.name);
    totalDecodedPixels += image.width * image.height;
    assertImagePixelTotal(totalDecodedPixels, limits, `${file.name} and the images before it`);
    const requestedMargin = Number(options.margin ?? 20);
    const margin = [0, 18, 20, 42].includes(requestedMargin) ? requestedMargin : 20;
    const pagePreset = options.pageSize === "a4" ? [595.28, 841.89] : options.pageSize === "letter" ? [612, 792] : null;
    const pageWidth = pagePreset?.[0] || image.width + margin * 2;
    const pageHeight = pagePreset?.[1] || image.height + margin * 2;
    const page = output.addPage([pageWidth, pageHeight]);
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, { x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight });
  }
  const bytes = await output.save();
  if (slug === "scan-to-pdf") {
    const pageSize = options.pageSize === "a4" ? "a4" : options.pageSize === "letter" ? "letter" : "auto";
    const pageSizeLabel = pageSize === "a4" ? "A4 pages" : pageSize === "letter" ? "US Letter pages" : "Matched image shapes";
    return [{
      ...pdfResult(options.outputName ? `${safeFileName(options.outputName)}.pdf` : "scans-local.pdf", bytes, `${files.length} ${files.length === 1 ? "page" : "pages"} · ${pageSizeLabel}`),
      scanOutcome: { pageCount: files.length, pageSize },
    }];
  }
  const pageSize = options.pageSize === "a4" ? "a4" : options.pageSize === "letter" ? "letter" : "fit";
  const pageSizeLabel = pageSize === "a4" ? "A4" : pageSize === "letter" ? "US Letter" : "Fit each image";
  const requestedMargin = Number(options.margin ?? 20);
  const margin = requestedMargin === 0 ? "none" : requestedMargin >= 40 ? "large" : "small";
  const marginLabel = margin === "none" ? "No margin" : margin === "large" ? "Large margin" : "Small margin";
  return [{
    ...pdfResult(options.outputName ? `${safeFileName(options.outputName)}.pdf` : "images-local.pdf", bytes, `${files.length} ${files.length === 1 ? "page" : "pages"} · ${pageSizeLabel} · ${marginLabel}`),
    imagePdfOutcome: { pageCount: files.length, pageSize, margin },
  }];
}

async function rasterizePdf(file, options, report, mode = "compress") {
  const { PDFDocument } = await import("pdf-lib");
  const limits = getToolLimits(mode === "redact" ? "redact-pdf" : "compress-pdf");
  const rendered = await openRenderedPdf(file, options.inputPassword);
  const output = await PDFDocument.create();
  const quality = Math.max(0.25, Math.min(0.95, Number(options.quality || (mode === "redact" ? 90 : 68)) / 100));
  const scale = mode === "compress" ? Number(options.scale || 1.2) : 1.6;
  const redactionPlan = mode === "redact" ? createRedactionPlan(options.regions, rendered.numPages, limits) : null;

  try {
    for (let index = 0; index < rendered.numPages; index += 1) {
      report?.({ phase: `${mode === "redact" ? "Flattening" : "Compressing"} page ${index + 1} of ${rendered.numPages}`, progress: index / rendered.numPages });
      const pageImage = await renderPdfPage(rendered, index, { scale, quality, limits, label: `${file.name}, page ${index + 1}` });
      if (mode === "redact") {
        const context = pageImage.canvas.getContext("2d");
        context.fillStyle = options.overlay === "white" ? "#ffffff" : "#111111";
        for (const region of redactionPlan.byPage[index + 1] || []) {
          const x = (region.x / 100) * pageImage.canvas.width;
          const y = (region.y / 100) * pageImage.canvas.height;
          const width = (region.width / 100) * pageImage.canvas.width;
          const height = (region.height / 100) * pageImage.canvas.height;
          context.fillRect(x, y, width, height);
        }
        pageImage.blob = await canvasToBlob(pageImage.canvas, "image/jpeg", quality);
      }
      const image = await output.embedJpg(await pageImage.blob.arrayBuffer());
      pageImage.canvas.width = 1;
      pageImage.canvas.height = 1;
      const sourcePage = await rendered.getPage(index + 1);
      const viewport = sourcePage.getViewport({ scale: 1 });
      sourcePage.cleanup();
      const page = output.addPage([viewport.width, viewport.height]);
      page.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }
    const outputBytes = await output.save({ useObjectStreams: true });
    if (mode === "compress" && outputBytes.byteLength >= file.size) {
      return [{
        ...resultFromBlob(file.name, file.slice(0, file.size, "application/pdf"), "Original kept because the trial output was larger"),
        compressionOutcome: "original-kept",
        originalSize: file.size,
        attemptedSize: outputBytes.byteLength,
        noNewFile: true,
      }];
    }
    const suffix = mode === "redact" ? "secure-redacted" : "compressed";
    return [pdfResult(
      `${safeFileName(baseName(file.name))}-${suffix}.pdf`,
      outputBytes,
      mode === "redact"
        ? `${redactionPlan.regionCount.toLocaleString()} ${redactionPlan.regionCount === 1 ? "area" : "areas"} redacted across ${redactionPlan.affectedPageCount.toLocaleString()} ${redactionPlan.affectedPageCount === 1 ? "page" : "pages"}; all pages flattened`
        : "Pages re-encoded locally",
    )];
  } finally {
    await destroyPdfJsDocument(rendered);
  }
}

async function pdfToImages(file, options, report) {
  const limits = getToolLimits("pdf-to-jpg");
  const rendered = await openRenderedPdf(file, options.inputPassword);
  const format = options.format === "png" ? { type: "image/png", ext: "png", quality: 1 } : { type: "image/jpeg", ext: "jpg", quality: Number(options.quality || 88) / 100 };
  const results = [];
  const resultBudget = createResultBudget();
  try {
    for (let index = 0; index < rendered.numPages; index += 1) {
      report?.({ phase: `Rendering page ${index + 1} of ${rendered.numPages}`, progress: index / rendered.numPages });
      const page = await renderPdfPage(rendered, index, { scale: Number(options.scale || PDF_TO_JPG_RENDER_SCALE), ...format, limits, label: `${file.name}, page ${index + 1}` });
      try {
        results.push(retainResult(
          resultBudget,
          resultFromBlob(`${safeFileName(baseName(file.name))}-page-${index + 1}.${format.ext}`, page.blob, `${page.width} × ${page.height}`),
        ));
      } finally {
        page.canvas.width = 1;
        page.canvas.height = 1;
      }
    }
    return await zipResults(results, `${safeFileName(baseName(file.name))}-pages.zip`);
  } finally {
    await destroyPdfJsDocument(rendered);
  }
}

async function ocrPdf(file, options, report) {
  const limits = getToolLimits("ocr-pdf");
  const rendered = await openRenderedPdf(file, options.inputPassword);
  if (rendered.numPages > limits.maxPdfPagesPerFile) {
    await destroyPdfJsDocument(rendered);
    throw new FileLimitError("too-many-pages", `${file.name} has ${rendered.numPages} pages; OCR Reader supports ${limits.maxPdfPagesPerFile}. Split it first.`);
  }
  const { createWorker } = await import("tesseract.js");
  const pages = [];
  let activeOcrPage = 0;
  const worker = await createWorker("eng", 1, {
    workerPath: "/engines/tesseract/worker.min.js",
    corePath: "/engines/tesseract",
    langPath: "/engines/tesseract",
    logger: (event) => {
      if (event.status === "recognizing text") {
        const pageProgress = Math.max(0, Math.min(1, Number(event.progress || 0)));
        report?.({
          phase: `Recognizing page ${activeOcrPage + 1} of ${rendered.numPages} · ${Math.round(pageProgress * 100)}%`,
          progress: (activeOcrPage + pageProgress) / rendered.numPages,
        });
      }
    },
  });

  try {
    for (let index = 0; index < rendered.numPages; index += 1) {
      activeOcrPage = index;
      report?.({ phase: `OCR page ${index + 1} of ${rendered.numPages}`, progress: index / rendered.numPages });
      const renderedPage = await renderPdfPage(rendered, index, { scale: 1.55, quality: 0.9, limits, label: `${file.name}, page ${index + 1}` });
      try {
        const { data } = await worker.recognize(renderedPage.canvas);
        const ocrText = String(data.text || "").replace(/\r\n?/g, "\n").trim();
        assertOcrCharacterCount(ocrText.length, index + 1, limits);
        pages.push({
          pageNumber: index + 1,
          text: ocrText,
          confidence: Number.isFinite(Number(data.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(data.confidence)))) : null,
        });
      } finally {
        renderedPage.canvas.width = 1;
        renderedPage.canvas.height = 1;
      }
    }
  } finally {
    await worker.terminate();
    await destroyPdfJsDocument(rendered);
  }
  return [createOcrReaderResult(file.name, pages)];
}

export function createOcrReaderResult(fileName, pages) {
  const safePages = Array.isArray(pages) ? pages.map((page, index) => ({
    pageNumber: Number.isInteger(page?.pageNumber) && page.pageNumber > 0 ? page.pageNumber : index + 1,
    text: String(page?.text || ""),
    confidence: Number.isFinite(Number(page?.confidence)) ? Math.max(0, Math.min(100, Math.round(Number(page.confidence)))) : null,
  })) : [];
  return {
    id: crypto.randomUUID(),
    name: `${safeFileName(baseName(fileName || "document"))} text reader`,
    type: "application/x-local-ocr-pages",
    size: safePages.reduce((sum, page) => sum + page.text.length, 0),
    details: `${safePages.length} ${safePages.length === 1 ? "page" : "pages"} recognized locally`,
    ocrPages: safePages,
  };
}

export async function textToPdfDocument(text, title = "Local document", options = {}, toolSlug = "html-to-pdf") {
  const limits = getToolLimits(toolSlug);
  const conversionLabel = `${title || "This document"} conversion`;
  const pageSize = options.pageSize === "letter" ? "letter" : "a4";
  const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
  const sourceText = String(text || "No readable text was found.");
  assertPdfTextFontCompatibility(sourceText, conversionLabel);
  const { jsPDF } = await import("jspdf");
  const document = new jsPDF({ unit: "pt", format: pageSize, orientation });
  document.setProperties({ title: standardPdfMetadataText(title, "Local document"), creator: "Local File Studio" });
  document.setFont("helvetica", "normal");
  document.setFontSize(11);
  const margin = 48;
  const maxWidth = document.internal.pageSize.getWidth() - margin * 2;
  const pageHeight = document.internal.pageSize.getHeight();
  const linesPerPage = Math.floor((pageHeight - 52 - 58) / 16) + 1;
  const explicitLinePages = Math.max(1, Math.ceil(countLogicalLines(sourceText) / linesPerPage));
  assertGeneratedPdfPageCount(explicitLinePages, limits, conversionLabel);
  const lines = document.splitTextToSize(sourceText, maxWidth);
  const requiredPages = Math.max(1, Math.ceil(lines.length / linesPerPage));
  assertGeneratedPdfPageCount(requiredPages, limits, conversionLabel);
  let y = 58;
  let pageCount = 1;
  for (const line of lines) {
    if (y > pageHeight - 52) {
      pageCount += 1;
      assertGeneratedPdfPageCount(pageCount, limits, conversionLabel);
      document.addPage();
      y = 58;
    }
    document.text(line, margin, y);
    y += 16;
  }
  return document;
}

async function officeToPdf(slug, file, options, report) {
  let text = "";
  let wordOutcome = null;
  let powerpointOutcome = null;
  let spreadsheetOutcome = null;
  let htmlOutcome = null;
  const limits = getToolLimits(slug);
  const sourceLabel = file?.name || "Pasted HTML";
  report?.({ phase: "Reading document", progress: 0.2 });

  if (slug === "word-to-pdf") {
    const { createDocxTextPreview, extractDocxText } = await import("./docx-text.js");
    text = await extractDocxText(file, limits);
    wordOutcome = createDocxTextPreview(text);
  } else if (slug === "powerpoint-to-pdf") {
    const { createPptxTextPreview, extractPptxText } = await import("./pptx-text.js");
    const extraction = await extractPptxText(file, limits);
    text = extraction.text;
    powerpointOutcome = createPptxTextPreview(extraction);
  } else if (slug === "excel-to-pdf") {
    const { createSpreadsheetTextPreview, extractSpreadsheetText } = await import("./spreadsheet-text.js");
    const extraction = await extractSpreadsheetText(file, limits);
    text = extraction.text;
    spreadsheetOutcome = createSpreadsheetTextPreview(extraction);
  } else {
    const html = file ? await file.text() : String(options.html || "");
    const { createHtmlTextPreview, extractHtmlText } = await import("./html-text.js");
    const extraction = extractHtmlText(html, limits, sourceLabel);
    text = extraction.text;
    htmlOutcome = createHtmlTextPreview(extraction, { pageSize: options.pageSize });
  }

  report?.({ phase: "Laying out pages", progress: 0.68 });
  const document = await textToPdfDocument(text, baseName(file?.name || "local-html"), options, slug);
  const pageCount = document.getNumberOfPages();
  const result = resultFromBlob(
    `${safeFileName(baseName(file?.name || "local-html"))}.pdf`,
    document.output("blob"),
    wordOutcome
      ? `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} · ${wordOutcome.characterCount.toLocaleString()} readable characters`
      : powerpointOutcome
        ? `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} · ${powerpointOutcome.slideCount.toLocaleString()} ${powerpointOutcome.slideCount === 1 ? "slide" : "slides"} · ${powerpointOutcome.characterCount.toLocaleString()} readable characters`
        : spreadsheetOutcome
          ? `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} · ${spreadsheetOutcome.sheetCount.toLocaleString()} ${spreadsheetOutcome.sheetCount === 1 ? "sheet" : "sheets"} · ${spreadsheetOutcome.usedCellSlots.toLocaleString()} used-range cells`
          : `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} · ${htmlOutcome.characterCount.toLocaleString()} readable characters`,
  );
  if (wordOutcome) {
    result.wordOutcome = {
      characterCount: wordOutcome.characterCount,
      wordCount: wordOutcome.wordCount,
      paragraphCount: wordOutcome.paragraphCount,
      symbolCount: wordOutcome.symbolCount,
      truncated: wordOutcome.truncated,
      previewCharacterCount: wordOutcome.previewCharacterCount,
      pageCount,
    };
  }
  if (powerpointOutcome) {
    result.powerpointOutcome = {
      slideCount: powerpointOutcome.slideCount,
      slidesWithText: powerpointOutcome.slidesWithText,
      characterCount: powerpointOutcome.characterCount,
      firstSlideCharacterCount: powerpointOutcome.firstSlideCharacterCount,
      firstSlideTruncated: powerpointOutcome.firstSlideTruncated,
      firstSlidePreviewCharacterCount: powerpointOutcome.firstSlidePreviewCharacterCount,
      pageCount,
    };
  }
  if (spreadsheetOutcome) {
    result.spreadsheetOutcome = {
      sheetCount: spreadsheetOutcome.sheetCount,
      sheetsWithValues: spreadsheetOutcome.sheetsWithValues,
      usedCellSlots: spreadsheetOutcome.usedCellSlots,
      characterCount: spreadsheetOutcome.characterCount,
      orientation: options.orientation === "portrait" ? "portrait" : "landscape",
      pageCount,
    };
  }
  if (htmlOutcome) {
    result.htmlOutcome = {
      characterCount: htmlOutcome.characterCount,
      wordCount: htmlOutcome.wordCount,
      paragraphCount: htmlOutcome.paragraphCount,
      pageSize: options.pageSize === "letter" ? "letter" : "a4",
      pageCount,
    };
  }
  return [result];
}

async function pdfToOffice(slug, file, options, report) {
  const limits = getToolLimits(slug);
  const pages = Array.isArray(options.pdfOfficeTextPages)
    ? options.pdfOfficeTextPages
    : await extractPdfPagesText(file, options.inputPassword, report, limits.maxExtractedCharactersTotal);
  const textPreview = validatePdfOfficeTextPages(pages, file, limits);
  const cleanName = safeFileName(baseName(file.name));

  if (slug === "pdf-to-word") {
    const { Document, Packer, Paragraph, TextRun } = await import("docx");
    const sections = pages.map((text, index) => ({
      children: [
        new Paragraph({ children: [new TextRun({ text: `Page ${index + 1}`, bold: true, size: 30 })] }),
        ...text.split(/\n+/).map((line) => new Paragraph(line)),
      ],
    }));
    const blob = await Packer.toBlob(new Document({ sections }));
    const result = resultFromBlob(
      `${cleanName}.docx`,
      blob,
      `${textPreview.pageCount.toLocaleString()} editable ${textPreview.pageCount === 1 ? "section" : "sections"} · ${textPreview.characterCount.toLocaleString()} characters`,
    );
    result.pdfOfficeTextOutcome = {
      pageCount: textPreview.pageCount,
      pagesWithText: textPreview.pagesWithText,
      emptyPageCount: textPreview.emptyPageCount,
      characterCount: textPreview.characterCount,
      wordCount: textPreview.wordCount,
      format: "docx",
    };
    return [result];
  }

  if (slug === "pdf-to-powerpoint") {
    const { createTextPresentation } = await import("./pptx-writer.js");
    const blob = await createTextPresentation(pages);
    const result = resultFromBlob(
      `${cleanName}.pptx`,
      blob,
      `${textPreview.pageCount.toLocaleString()} editable ${textPreview.pageCount === 1 ? "slide" : "slides"} · ${textPreview.characterCount.toLocaleString()} characters`,
    );
    result.pdfOfficeTextOutcome = {
      pageCount: textPreview.pageCount,
      pagesWithText: textPreview.pagesWithText,
      emptyPageCount: textPreview.emptyPageCount,
      characterCount: textPreview.characterCount,
      wordCount: textPreview.wordCount,
      format: "pptx",
    };
    return [result];
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const spreadsheetPlan = createPdfSpreadsheetPlan(pages);
  pages.forEach((text, index) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(pdfTextToSpreadsheetRows(text)), spreadsheetPlan.sheets[index].name));
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const result = resultFromBlob(
    `${cleanName}.xlsx`,
    new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${spreadsheetPlan.sheetCount.toLocaleString()} editable ${spreadsheetPlan.sheetCount === 1 ? "sheet" : "sheets"} · ${spreadsheetPlan.valueCount.toLocaleString()} values`,
  );
  result.pdfOfficeTextOutcome = {
    pageCount: textPreview.pageCount,
    pagesWithText: textPreview.pagesWithText,
    emptyPageCount: textPreview.emptyPageCount,
    characterCount: textPreview.characterCount,
    wordCount: textPreview.wordCount,
    format: "xlsx",
    rowCount: spreadsheetPlan.rowCount,
    valueCount: spreadsheetPlan.valueCount,
  };
  return [result];
}

export function extractiveSummary(text, targetSentences = 5) {
  const sentences = String(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const uniqueSentences = [];
  const seen = new Set();
  sentences.forEach((sentence) => {
    const key = sentence.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    uniqueSentences.push(sentence);
  });
  const stop = new Set("about after again also and are because been before being between both but can could did does doing down during each few for from further had has have having her here hers herself him himself his how into its itself just more most other our ours ourselves out over own same she should some such than that the their theirs them themselves then there these they this those through too under until very was were what when where which while who whom why will with you your yours yourself yourselves".split(" "));
  const counts = {};
  String(text).toLowerCase().match(/[a-z][a-z'-]{3,}/g)?.forEach((word) => {
    if (!stop.has(word)) counts[word] = (counts[word] || 0) + 1;
  });
  const ranked = uniqueSentences.map((sentence, index) => ({
    sentence: sentence.trim(),
    index,
    score: (sentence.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []).reduce((sum, word) => sum + (counts[word] || 0), 0) / Math.max(8, sentence.length ** 0.5),
  }));
  return ranked.sort((a, b) => b.score - a.score).slice(0, targetSentences).sort((a, b) => a.index - b.index).map((item) => `• ${item.sentence}`).join("\n");
}

function markdownFromPages(pages, pageBreaks = false) {
  return pages.map((page, index) => {
    const lines = page.split("\n").filter(Boolean);
    const body = lines.map((line) => {
      if (line.length < 72 && /^[A-Z\d\s:&-]+$/.test(line)) return `## ${line.replace(/\s+/g, " ")}`;
      if (/^[•*-]\s*/.test(line)) return `- ${line.replace(/^[•*-]\s*/, "")}`;
      return line;
    }).join("\n\n");
    return `# Page ${index + 1}\n\n${body}`;
  }).join(pageBreaks ? "\n\n---\n\n" : "\n\n");
}

export function createTextReaderResult(name, text, viewer) {
  const safeName = safeFileName(baseName(name));
  if (viewer === "summary") {
    return resultFromText(`${safeName}-summary.txt`, text, "text/plain", "Local extractive summary", viewer);
  }
  if (viewer === "translation") {
    return resultFromText(`${safeName}-translation.txt`, text, "text/plain", "Device-local text translation", viewer);
  }
  if (viewer === "markdown") {
    return resultFromText(`${safeName}.md`, text, "text/markdown", "Layout-aware Markdown draft", viewer);
  }
  throw new FileLimitError("invalid-text-viewer", "The local text result could not be prepared. Reload the app and try again.");
}

export async function translateLocally(text, targetLanguage, options = {}, report) {
  const language = getPdfTranslationLanguage(targetLanguage);
  const mode = getPdfTranslationMode(options.translationMode);
  if (mode === "glossary") return applyBasicTranslationGlossary(text, language.value);

  const translator = options.translationSession;
  if (!translator || typeof translator.translate !== "function") {
    throw new FileLimitError(
      "translation-model-not-ready",
      `Prepare the full English-to-${language.label} translator in this tab before processing, or choose the Basic glossary option.`,
    );
  }

  report?.({ phase: `Translating to ${language.label} on this device`, progress: 0.72 });
  const chunks = splitTranslationText(text);
  const translated = [];
  try {
    for (let index = 0; index < chunks.length; index += 1) {
      report?.({
        phase: `Translating text ${index + 1} of ${chunks.length}`,
        progress: 0.72 + ((index / Math.max(1, chunks.length)) * 0.22),
      });
      translated.push(await translator.translate(chunks[index]));
    }
  } catch (error) {
    throw new FileLimitError(
      "translation-model-failed",
      `Full English-to-${language.label} translation stopped locally. Try preparing the browser model again, or choose the Basic glossary option.`,
      { cause: error?.name || "translator-error" },
    );
  } finally {
    await translator.destroy?.();
  }

  return Object.freeze({
    mode: "full",
    sourceLanguage: "en",
    targetLanguage: language.value,
    targetLabel: language.label,
    glossarySize: 0,
    replacementCount: null,
    body: translated.join("\n"),
    text: translated.join("\n"),
  });
}

async function intelligenceTool(slug, file, options, report) {
  const limits = getToolLimits(slug);
  const pages = slug === "translate-pdf" && Array.isArray(options.pdfTranslationTextPages)
    ? options.pdfTranslationTextPages
    : await extractPdfPagesText(file, options.inputPassword, report, limits.maxExtractedCharactersTotal);
  if (slug === "translate-pdf") validatePdfOfficeTextPages(pages, file, limits);
  const text = pages.join("\n\n");
  if (!text.trim()) throw new Error("No selectable text was found. Use OCR Reader to recognize and copy scanned text page by page.");
  const name = safeFileName(baseName(file.name));

  if (slug === "ai-summarizer") {
    const count = options.length === "short" ? 3 : options.length === "long" ? 9 : 5;
    const extracted = extractiveSummary(text, count);
    const formatted = options.format === "prose" ? extracted.replace(/^•\s*/gm, "").replace(/\n+/g, " ") : extracted;
    const summary = `LOCAL EXTRACTIVE SUMMARY\n\n${formatted}\n\nGenerated without uploading the document.`;
    const selectedSentences = extracted ? extracted.split("\n").length : 0;
    return [{ ...createTextReaderResult(name, summary, "summary"), details: `${selectedSentences.toLocaleString()} source ${selectedSentences === 1 ? "sentence" : "sentences"} selected locally` }];
  }
  if (slug === "translate-pdf") {
    const translated = await translateLocally(text, options.language || options.targetLanguage || "es", options, report);
    const details = translated.mode === "full"
      ? `${translated.targetLabel} · full browser translation`
      : `${translated.targetLabel} · basic ${translated.glossarySize.toLocaleString()}-term glossary · ${translated.replacementCount.toLocaleString()} ${translated.replacementCount === 1 ? "replacement" : "replacements"}`;
    const result = createTextReaderResult(name, translated.text, "translation");
    result.details = details;
    result.translationOutcome = {
      mode: translated.mode,
      sourceLanguage: translated.sourceLanguage,
      targetLanguage: translated.targetLanguage,
      targetLabel: translated.targetLabel,
      pageCount: pages.length,
      sourceCharacterCount: text.length,
      glossarySize: translated.glossarySize,
      replacementCount: translated.replacementCount,
    };
    return [result];
  }
  const markdown = markdownFromPages(pages, options.pageBreaks === true || options.pageBreaks === "true");
  return [createTextReaderResult(name, markdown, "markdown")];
}

async function comparePdfs(files, options, report) {
  if (files.length < 2) throw new Error("Compare PDF needs two documents.");
  const limits = getToolLimits("compare-pdf");
  const characterBudget = {
    maxCharacters: limits.maxExtractedCharactersTotal,
    used: 0,
    code: "comparison-text-limit",
    message: (_file, maxCharacters) => `These PDFs contain more than ${maxCharacters.toLocaleString()} selectable characters combined; Compare PDF cannot process them safely. Compare smaller page ranges or split the files first.`,
  };
  const leftPages = await extractPdfPagesText(files[0], options.inputPassword, report, characterBudget);
  const rightPages = await extractPdfPagesText(files[1], options.inputPassword2, report, characterBudget);
  const leftText = leftPages.join("\n");
  const rightText = rightPages.join("\n");
  report?.({ phase: "Comparing extracted lines", progress: 0.78 });
  const changes = await runBoundedLineDiff(leftText, rightText, limits);
  const comparison = createComparisonView(changes, files[0].name, files[1].name, limits);
  const html = createComparisonHtml(comparison);
  const details = comparison.stats.identical
    ? "No selectable-text differences found"
    : `${comparison.stats.changedLines.toLocaleString()} changed ${comparison.stats.changedLines === 1 ? "line" : "lines"} in ${comparison.stats.changedBlocks.toLocaleString()} ${comparison.stats.changedBlocks === 1 ? "block" : "blocks"}`;
  const result = resultFromBlob("local-pdf-comparison.html", new Blob([html], { type: "text/html" }), details);
  return [{ ...result, viewer: "comparison", comparison }];
}

async function fillForm(file, options) {
  const result = await fillPdfFormFields(file, options.values, {
    flatten: options.flatten === true || options.flatten === "true",
    label: file.name,
  });
  const changeCopy = result.changeCount
    ? `${result.changeCount.toLocaleString()} ${result.changeCount === 1 ? "field" : "fields"} updated`
    : `${result.fieldCount.toLocaleString()} ${result.fieldCount === 1 ? "field" : "fields"} preserved`;
  return [pdfResult(
    `${safeFileName(baseName(file.name))}-filled.pdf`,
    result.bytes,
    `${changeCopy}${result.flattened ? " and flattened" : "; form remains editable"}`,
  )];
}

async function archiveNormalize(file, report) {
  report?.({ phase: "Reading PDF structure", progress: 0.18 });
  const pdf = await loadPdfLib(file);
  const pageCount = pdf.getPageCount();
  pdf.setProducer("Local File Studio archival normalization");
  pdf.setCreator("Local File Studio");
  try {
    pdf.setCreationDate(pdf.getCreationDate() || new Date());
  } catch {
    pdf.setCreationDate(new Date());
  }
  pdf.setModificationDate(new Date());
  report?.({ phase: "Rewriting PDF structure", progress: 0.68 });
  const bytes = await pdf.save({ useObjectStreams: false });
  report?.({ phase: "Finishing archive-friendly PDF", progress: 1 });
  return [{
    ...pdfResult(
      `${safeFileName(baseName(file.name))}-archive.pdf`,
      bytes,
      `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} · Archive-friendly rewrite · Not certified PDF/A`,
    ),
    archiveRewriteOutcome: {
      pageCount,
      certifiedPdfA: false,
      objectStreams: false,
      metadataRefreshed: true,
    },
  }];
}

export async function processPdfTool(slug, files, options = {}, report) {
  if (!files.length && slug !== "html-to-pdf") throw new Error("Choose the required file or files to continue.");

  if (slug === "merge-pdf") return await mergePdfs(files, options, report);
  if (slug === "split-pdf") return await splitPdf(files[0], options, report);
  if (["remove-pages", "extract-pages", "organize-pdf"].includes(slug)) return await selectPdfPages(slug, files[0], options);
  if (["scan-to-pdf", "jpg-to-pdf"].includes(slug)) return await imageFilesToPdf(slug, files, options, report);
  if (slug === "compress-pdf") return await rasterizePdf(files[0], options, report, "compress");
  if (slug === "redact-pdf") return await rasterizePdf(files[0], options, report, "redact");
  if (slug === "ocr-pdf") return await ocrPdf(files[0], options, report);
  if (slug === "repair-pdf") {
    const repaired = await repairPdf(new Uint8Array(await files[0].arrayBuffer()), options.inputPassword);
    const bytes = options.inputPassword === undefined ? repaired : await unlockPdf(repaired, options.inputPassword);
    return [{
      ...pdfResult(`${safeFileName(baseName(files[0].name))}-repaired.pdf`, bytes, "Fresh full rewrite completed locally"),
      repairOutcome: "full-rewrite",
    }];
  }
  if (["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"].includes(slug)) return await officeToPdf(slug, files[0], options, report);
  if (slug === "pdf-to-jpg") return await pdfToImages(files[0], options, report);
  if (["pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel"].includes(slug)) return await pdfToOffice(slug, files[0], options, report);
  if (slug === "pdf-to-pdfa") return await archiveNormalize(files[0], report);
  if (slug === "add-image-to-pdf") return await addImagesToPdf(files[0], options, report);
  if (["rotate-pdf", "add-page-numbers", "watermark-pdf", "crop-pdf", "edit-pdf", "sign-pdf"].includes(slug)) return await mutatePdf(slug, files[0], options);
  if (slug === "pdf-forms") return await fillForm(files[0], options);
  if (slug === "unlock-pdf") {
    const bytes = await unlockPdf(new Uint8Array(await files[0].arrayBuffer()), options.password || "");
    return [pdfResult(`${safeFileName(baseName(files[0].name))}-unlocked.pdf`, bytes, "Password protection removed with supplied password")];
  }
  if (slug === "protect-pdf") {
    if (!options.password) throw new Error("Enter a password before protecting this PDF.");
    const bytes = await protectPdf(new Uint8Array(await files[0].arrayBuffer()), options.password);
    return [pdfResult(`${safeFileName(baseName(files[0].name))}-protected.pdf`, bytes, "AES password protection added locally")];
  }
  if (slug === "compare-pdf") return await comparePdfs(files, options, report);
  if (["ai-summarizer", "translate-pdf", "pdf-to-markdown"].includes(slug)) return await intelligenceTool(slug, files[0], options, report);

  throw new Error("This tool is listed but its local processor is not connected yet.");
}
