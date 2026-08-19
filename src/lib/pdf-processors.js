// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  baseName,
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
  FileLimitError,
  assertExtractedTextLength,
  assertGeneratedItemCount,
  assertGeneratedPdfPageCount,
  assertImageDimensions,
  assertImagePixelTotal,
  assertOcrCharacterCount,
  assertOrganizedPageCount,
  assertPdfOverlayImageDimensions,
  assertPresentationSlideCount,
  assertRasterDimensions,
  assertSpreadsheetComplexity,
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

async function extractPdfPagesText(file, password = "", report, characterLimit) {
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
  let totalPages = 0;
  for (let index = 0; index < files.length; index += 1) {
    report?.({ phase: `Adding PDF ${index + 1} of ${files.length}`, progress: index / files.length });
    const source = await loadPdfLib(files[index]);
    const sourcePages = source.getPageCount();
    if (sourcePages > limits.maxPdfPagesPerFile) {
      throw new FileLimitError("too-many-pages", `${files[index].name} has ${sourcePages.toLocaleString()} pages; Merge PDF supports ${limits.maxPdfPagesPerFile.toLocaleString()} per file. Split it first.`);
    }
    totalPages += sourcePages;
    if (totalPages > limits.maxPdfPagesTotal) {
      throw new FileLimitError("too-many-total-pages", `${files[index].name} takes this merge above ${limits.maxPdfPagesTotal.toLocaleString()} pages combined. Merge fewer PDFs at a time.`);
    }
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
  }
  const bytes = await output.save({ useObjectStreams: true });
  return [pdfResult("merged-local.pdf", bytes, `${output.getPageCount()} pages merged`)];
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

    if (slug === "edit-pdf") {
      const text = String(options.text || "Reviewed locally");
      const size = Number(options.fontSize || 16);
      const positionMap = {
        "top-left": [10, 10],
        "top-right": [70, 10],
        center: [35, 50],
        "bottom-left": [10, 90],
        "bottom-right": [70, 90],
      };
      const [positionX, positionY] = positionMap[options.position] || [Number(options.x || 10), Number(options.y || 10)];
      const x = Math.max(12, Math.min(width - 12, (positionX / 100) * width));
      const y = Math.max(12, Math.min(height - 12, height - (positionY / 100) * height));
      page.drawText(text, { x, y, size, font, color: rgb(0.12, 0.12, 0.16), maxWidth: width - x - 18 });
    }

    if (slug === "sign-pdf" && index === pages.length - 1) {
      const signature = String(options.name || options.signature || "Signed locally");
      const size = Number(options.fontSize || 24);
      page.drawLine({ start: { x: 42, y: 76 }, end: { x: Math.min(width - 42, 280), y: 76 }, thickness: 0.7, color: rgb(0.38, 0.38, 0.42) });
      page.drawText(signature, { x: 48, y: 88, size, font, color: rgb(0.12, 0.12, 0.18), maxWidth: 250 });
      if (options.includeDate !== false) page.drawText(`Signed on ${new Date().toLocaleDateString()}`, { x: 48, y: 61, size: 8, font, color: rgb(0.42, 0.42, 0.46) });
    }
  }

  pdf.setProducer("Local File Studio — browser-local processing");
  pdf.setModificationDate(new Date());
  const bytes = await pdf.save({ useObjectStreams: true });
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
      const page = await renderPdfPage(rendered, index, { scale: Number(options.scale || 1.7), ...format, limits, label: `${file.name}, page ${index + 1}` });
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

function textToPdfDocument(text, title = "Local document", options = {}, toolSlug = "html-to-pdf") {
  return import("jspdf").then(({ jsPDF }) => {
    const limits = getToolLimits(toolSlug);
    const conversionLabel = `${title || "This document"} conversion`;
    const pageSize = options.pageSize === "letter" ? "letter" : "a4";
    const orientation = options.orientation === "landscape" ? "landscape" : "portrait";
    const document = new jsPDF({ unit: "pt", format: pageSize, orientation });
    document.setProperties({ title, creator: "Local File Studio" });
    document.setFont("helvetica", "normal");
    document.setFontSize(11);
    const margin = 48;
    const maxWidth = document.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = document.internal.pageSize.getHeight();
    const sourceText = String(text || "No readable text was found.");
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
  });
}

async function officeToPdf(slug, file, options, report) {
  let text = "";
  const limits = getToolLimits(slug);
  const sourceLabel = file?.name || "Pasted HTML";
  report?.({ phase: "Reading document", progress: 0.2 });

  if (slug === "word-to-pdf") {
    const { extractDocxText } = await import("./docx-text.js");
    text = await extractDocxText(file, limits);
  } else if (slug === "powerpoint-to-pdf") {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    assertPresentationSlideCount(slideNames.length, limits, sourceLabel);
    const slides = [];
    let extractedCharacters = 0;
    for (const name of slideNames) {
      const xml = await zip.file(name).async("text");
      const document = new DOMParser().parseFromString(xml, "application/xml");
      const slideText = [...document.getElementsByTagNameNS("*", "t")].map((node) => node.textContent).join(" ");
      const section = `SLIDE ${slides.length + 1}\n${slideText}`;
      extractedCharacters += section.length + (slides.length ? 2 : 0);
      assertExtractedTextLength(extractedCharacters, limits, sourceLabel);
      slides.push(section);
    }
    text = slides.join("\n\n");
  } else if (slug === "excel-to-pdf") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    assertSpreadsheetComplexity(workbook.SheetNames.length, 0, limits, sourceLabel);
    let usedCellSlots = 0;
    for (const name of workbook.SheetNames) {
      const reference = workbook.Sheets[name]?.["!ref"];
      if (!reference) continue;
      let range;
      try {
        range = XLSX.utils.decode_range(reference);
      } catch {
        throw new FileLimitError("invalid-cell-range", `${sourceLabel} contains an invalid used range in sheet "${name}". Clear that sheet's used range and save a fresh copy.`);
      }
      const rows = range.e.r - range.s.r + 1;
      const columns = range.e.c - range.s.c + 1;
      const slots = rows * columns;
      if (!Number.isSafeInteger(slots) || slots < 0 || !Number.isSafeInteger(usedCellSlots + slots)) {
        throw new FileLimitError("invalid-cell-range", `${sourceLabel} contains an unsafe used range in sheet "${name}". Clear unused rows or columns and save a fresh copy.`);
      }
      usedCellSlots += slots;
      assertSpreadsheetComplexity(workbook.SheetNames.length, usedCellSlots, limits, sourceLabel);
    }

    const sheets = [];
    let extractedCharacters = 0;
    for (const name of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false });
      const lines = [name];
      let sectionLength = name.length;
      for (const row of rows) {
        const line = row.join("  |  ");
        sectionLength += 1 + line.length;
        assertExtractedTextLength(extractedCharacters + (sheets.length ? 2 : 0) + sectionLength, limits, sourceLabel);
        lines.push(line);
      }
      const section = lines.join("\n");
      extractedCharacters += section.length + (sheets.length ? 2 : 0);
      assertExtractedTextLength(extractedCharacters, limits, sourceLabel);
      sheets.push(section);
    }
    text = sheets.join("\n\n");
  } else {
    const html = file ? await file.text() : String(options.html || "");
    const document = new DOMParser().parseFromString(html, "text/html");
    document.querySelectorAll("script, iframe, object, embed, form").forEach((node) => node.remove());
    text = document.body.textContent || "";
    assertExtractedTextLength(text.length, limits, sourceLabel);
  }

  report?.({ phase: "Laying out pages", progress: 0.68 });
  const document = await textToPdfDocument(text, baseName(file?.name || "local-html"), options, slug);
  return [resultFromBlob(`${safeFileName(baseName(file?.name || "local-html"))}.pdf`, document.output("blob"), "Best-effort local document rendering")];
}

async function pdfToOffice(slug, file, options, report) {
  const limits = getToolLimits(slug);
  const pages = await extractPdfPagesText(file, options.inputPassword, report, limits.maxExtractedCharactersTotal);
  const cleanName = safeFileName(baseName(file.name));

  if (slug === "pdf-to-word") {
    const { Document, Packer, Paragraph, PageBreak, TextRun } = await import("docx");
    const children = [];
    pages.forEach((text, index) => {
      if (index) children.push(new Paragraph({ children: [new PageBreak()] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `Page ${index + 1}`, bold: true, size: 30 })] }));
      text.split(/\n+/).forEach((line) => children.push(new Paragraph(line)));
    });
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
    return [resultFromBlob(`${cleanName}.docx`, blob, "Editable text reconstruction")];
  }

  if (slug === "pdf-to-powerpoint") {
    const { createTextPresentation } = await import("./pptx-writer.js");
    const blob = await createTextPresentation(pages);
    return [resultFromBlob(`${cleanName}.pptx`, blob, "One reconstructed slide per PDF page")];
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  pages.forEach((text, index) => {
    const rows = text.split("\n").map((line) => line.split(/\s{2,}|\t|\|/).map((cell) => cell.trim()));
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), `Page ${index + 1}`.slice(0, 31));
  });
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return [resultFromBlob(`${cleanName}.xlsx`, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Coordinate-light table reconstruction")];
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

async function translateLocally(text, targetLanguage, report) {
  const TranslatorApi = globalThis.Translator || globalThis.ai?.translator;
  if (TranslatorApi?.create) {
    report?.({ phase: "Using the device language model", progress: 0.72 });
    const translator = await TranslatorApi.create({ sourceLanguage: "en", targetLanguage });
    try {
      const chunks = text.match(/[\s\S]{1,3500}/g) || [text];
      const translated = [];
      for (const chunk of chunks) translated.push(await translator.translate(chunk));
      return translated.join("\n");
    } finally {
      await translator.destroy?.();
    }
  }

  const dictionaries = {
    es: { document: "documento", page: "página", private: "privado", local: "local", file: "archivo", image: "imagen", text: "texto", with: "con", and: "y", the: "el" },
    fr: { document: "document", page: "page", private: "privé", local: "local", file: "fichier", image: "image", text: "texte", with: "avec", and: "et", the: "le" },
    de: { document: "Dokument", page: "Seite", private: "privat", local: "lokal", file: "Datei", image: "Bild", text: "Text", with: "mit", and: "und", the: "die" },
    hi: { document: "दस्तावेज़", page: "पृष्ठ", private: "निजी", local: "स्थानीय", file: "फ़ाइल", image: "छवि", text: "पाठ", with: "के साथ", and: "और", the: "यह" },
  };
  const dictionary = dictionaries[targetLanguage] || {};
  const translated = text.replace(/\b[a-z]+\b/gi, (word) => {
    const replacement = dictionary[word.toLowerCase()];
    return replacement || word;
  });
  return `[Limited built-in glossary used. Enable your browser's on-device Translator model for full translation.]\n\n${translated}`;
}

async function intelligenceTool(slug, file, options, report) {
  const limits = getToolLimits(slug);
  const pages = await extractPdfPagesText(file, options.inputPassword, report, limits.maxExtractedCharactersTotal);
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
    const translated = await translateLocally(text, options.language || options.targetLanguage || "es", report);
    return [createTextReaderResult(name, translated, "translation")];
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

async function archiveNormalize(file, options) {
  const pdf = await loadPdfLib(file);
  pdf.setProducer("Local File Studio archival normalization");
  pdf.setCreator("Local File Studio");
  try {
    pdf.setCreationDate(pdf.getCreationDate() || new Date());
  } catch {
    pdf.setCreationDate(new Date());
  }
  pdf.setModificationDate(new Date());
  return [pdfResult(`${safeFileName(baseName(file.name))}-archive.pdf`, await pdf.save({ useObjectStreams: false }), "Archive-friendly rewrite; formal PDF/A conformance is not certified")];
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
  if (slug === "pdf-to-pdfa") return await archiveNormalize(files[0], options);
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
