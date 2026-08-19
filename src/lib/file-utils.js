// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import JSZip from "jszip";
import {
  ARCHIVE_INPUT_LIMIT_BYTES,
  ARCHIVE_ITEM_LIMIT_BYTES,
  MAX_GENERATED_RESULTS,
  MAX_PAGE_SELECTION_CHARACTERS,
  MAX_PAGE_SELECTION_ENTRIES,
  assertOrganizedPageCount,
  assertOutputSize,
  formatLimitBytes,
  FileLimitError,
} from "./file-limits.js";

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

export function getCompressionSizeChange(inputBytes, outputBytes) {
  const input = Number(inputBytes);
  const output = Number(outputBytes);
  if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output < 0) return null;
  const bytesSaved = input - output;
  const percent = (bytesSaved / input) * 100;
  return {
    inputBytes: input,
    outputBytes: output,
    bytesSaved,
    percent,
    status: bytesSaved > 0 ? "reduced" : bytesSaved < 0 ? "increased" : "unchanged",
  };
}

const PDF_COMPRESSION_PRESETS = Object.freeze({
  gentle: Object.freeze({ quality: 82, scale: 1.45 }),
  balanced: Object.freeze({ quality: 68, scale: 1.2 }),
  strong: Object.freeze({ quality: 48, scale: 0.95 }),
});

export function getPdfCompressionPreset(mode) {
  return PDF_COMPRESSION_PRESETS[mode] || PDF_COMPRESSION_PRESETS.balanced;
}

export function projectPdfCompressionSize(inputBytes, pageCount, sampleSizes) {
  const input = Number(inputBytes);
  const pages = Number(pageCount);
  const samples = Array.isArray(sampleSizes) ? sampleSizes.map(Number).filter((size) => Number.isFinite(size) && size >= 0) : [];
  if (!Number.isFinite(input) || input <= 0 || !Number.isInteger(pages) || pages < 1 || !samples.length) return null;
  const average = samples.reduce((sum, size) => sum + size, 0) / samples.length;
  const overhead = 4096 + pages * 1200;
  const projectedBytes = Math.ceil(average * pages + overhead);
  const minSample = Math.min(...samples);
  const maxSample = Math.max(...samples);
  const sampleSpread = average ? (maxSample - minSample) / average : 0;
  const uncertainty = samples.length >= pages ? 0.08 : Math.min(0.4, Math.max(0.15, sampleSpread * 0.5));
  return {
    projectedBytes,
    lowerBytes: Math.max(1, Math.floor(projectedBytes * (1 - uncertainty))),
    upperBytes: Math.ceil(projectedBytes * (1 + uncertainty)),
    sampledPages: samples.length,
    ...getCompressionSizeChange(input, projectedBytes),
  };
}

export function compressionEstimateAllowsProcessing(estimate) {
  if (estimate?.state === "error") return true;
  return estimate?.state === "ready" && estimate.status === "reduced";
}

export function buildOcrCopyText(pages) {
  if (!Array.isArray(pages)) return "";
  return pages.map((page, index) => {
    const pageNumber = Number.isInteger(page?.pageNumber) && page.pageNumber > 0 ? page.pageNumber : index + 1;
    const text = String(page?.text || "").trim();
    return `PAGE ${pageNumber}\n${text || "[No text recognized]"}`;
  }).join("\n\n");
}

export function baseName(name = "file") {
  return name.replace(/\.[^/.]+$/, "");
}

export function extensionForMime(mime = "") {
  const map = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/html": "html",
    "application/zip": "zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  return map[mime] || "bin";
}

export function resultFromBlob(name, blob, details = "Ready to save") {
  assertOutputSize(blob.size, name);
  return {
    id: crypto.randomUUID(),
    name,
    blob,
    size: blob.size,
    type: blob.type,
    details,
  };
}

export function resultFromText(name, text, type = "text/plain", details = "Ready to copy", viewer = "text") {
  const textContent = String(text ?? "");
  const result = resultFromBlob(name, new Blob([textContent], { type }), details);
  return { ...result, textContent, viewer };
}

export function parseMarkdownPreview(markdown, {
  maxCharacters = 250_000,
  maxBlocks = 1_000,
} = {}) {
  const source = String(markdown ?? "").replace(/\r\n?/g, "\n");
  const characterLimited = source.length > maxCharacters;
  const previewSource = source.slice(0, maxCharacters);
  const lines = previewSource.split("\n");
  const blocks = [];
  let index = 0;

  const isBlockStart = (line) => /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|---+\s*$)/.test(line);
  while (index < lines.length && blocks.length < maxBlocks) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (/^\s*---+\s*$/.test(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const listType = ordered ? "ordered-list" : "list";
      const items = [];
      while (index < lines.length) {
        const item = listType === "ordered-list"
          ? lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
          : lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: listType, items });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  return {
    blocks,
    truncated: characterLimited || index < lines.length,
    sourceCharacters: source.length,
    previewCharacters: previewSource.length,
  };
}

export function isPdfPreviewResult(result) {
  return result?.blob instanceof Blob
    && result?.type === "application/pdf"
    && result.blob.type === "application/pdf";
}

export function assertPdfPreviewResult(result, maxBytes) {
  const blob = result?.blob;
  const name = result?.name || "PDF preview";
  if (!isPdfPreviewResult(result)) {
    throw new FileLimitError("unsupported-preview-type", `${name} is not a valid PDF result and cannot be previewed.`);
  }
  assertOutputSize(blob.size, name, maxBytes);
  return blob;
}

export function createResultBudget({
  maxItems = MAX_GENERATED_RESULTS,
  maxItemBytes = ARCHIVE_ITEM_LIMIT_BYTES,
  maxTotalBytes = ARCHIVE_INPUT_LIMIT_BYTES,
} = {}) {
  if (!Number.isInteger(maxItems) || maxItems < 1
    || !Number.isFinite(maxItemBytes) || maxItemBytes <= 0
    || !Number.isFinite(maxTotalBytes) || maxTotalBytes <= 0) {
    throw new FileLimitError("invalid-result-budget", "The local result safety budget could not be initialized. Reload the app and try again.");
  }
  return { count: 0, totalBytes: 0, maxItems, maxItemBytes, maxTotalBytes };
}

export function retainResult(budget, result) {
  const nextCount = budget?.count + 1;
  const size = Number(result?.blob?.size);
  const name = result?.name || "A generated file";
  const validBudget = budget
    && Number.isInteger(budget.count) && budget.count >= 0
    && Number.isFinite(budget.totalBytes) && budget.totalBytes >= 0
    && Number.isInteger(budget.maxItems) && budget.maxItems >= 1
    && Number.isFinite(budget.maxItemBytes) && budget.maxItemBytes > 0
    && Number.isFinite(budget.maxTotalBytes) && budget.maxTotalBytes > 0;
  if (!validBudget || !Number.isInteger(nextCount) || !Number.isFinite(size) || size < 0) {
    throw new FileLimitError("invalid-result-size", `${name} reported an invalid size. Process a smaller job after reloading the app.`);
  }
  if (nextCount > budget.maxItems) {
    throw new FileLimitError(
      "result-count-limit",
      `This job would create more than ${budget.maxItems.toLocaleString()} files. Process fewer pages or images at a time.`,
    );
  }
  if (size > budget.maxItemBytes) {
    throw new FileLimitError(
      "archive-item-too-large",
      `${name} is ${formatLimitBytes(size)}, above the ${formatLimitBytes(budget.maxItemBytes)} per-file in-memory limit. Reduce dimensions, pages, or quality.`,
    );
  }
  if (budget.totalBytes + size > budget.maxTotalBytes) {
    throw new FileLimitError(
      "archive-input-too-large",
      `${name} would take generated files above the ${formatLimitBytes(budget.maxTotalBytes)} in-memory limit. Process a smaller batch.`,
    );
  }
  budget.count = nextCount;
  budget.totalBytes += size;
  return result;
}

export async function zipResults(results, archiveName = "local-file-studio-results.zip") {
  if (results.length === 1) return results;
  if (results.length > MAX_GENERATED_RESULTS) {
    throw new FileLimitError(
      "result-count-limit",
      `This job would create ${results.length.toLocaleString()} files; the safe local limit is ${MAX_GENERATED_RESULTS}. Process fewer pages or files at a time.`,
    );
  }
  const sourceBytes = results.reduce((sum, result) => sum + result.blob.size, 0);
  for (const result of results) {
    if (result.blob.size > ARCHIVE_ITEM_LIMIT_BYTES) {
      throw new FileLimitError(
        "archive-item-too-large",
        `${result.name} is ${formatLimitBytes(result.blob.size)}, above the ${formatLimitBytes(ARCHIVE_ITEM_LIMIT_BYTES)} per-file ZIP limit. Reduce dimensions, pages, or quality.`,
      );
    }
  }
  if (sourceBytes > ARCHIVE_INPUT_LIMIT_BYTES) {
    throw new FileLimitError(
      "archive-input-too-large",
      `The generated files total ${formatLimitBytes(sourceBytes)}, above the ${formatLimitBytes(ARCHIVE_INPUT_LIMIT_BYTES)} in-memory ZIP limit. Process a smaller batch.`,
    );
  }
  const zip = new JSZip();
  const usedNames = new Map();
  for (const result of results) {
    const count = (usedNames.get(result.name) || 0) + 1;
    usedNames.set(result.name, count);
    const extensionIndex = result.name.lastIndexOf(".");
    const uniqueName = count === 1
      ? result.name
      : extensionIndex > 0
        ? `${result.name.slice(0, extensionIndex)}-${count}${result.name.slice(extensionIndex)}`
        : `${result.name}-${count}`;
    const alreadyCompressed = /^(application\/(pdf|zip)|image\/(jpeg|png|webp|gif))$/i.test(result.blob.type);
    zip.file(uniqueName, new Uint8Array(await result.blob.arrayBuffer()), { compression: alreadyCompressed ? "STORE" : "DEFLATE" });
  }
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return [resultFromBlob(archiveName, blob, `${results.length} files in one archive`)];
}

export function downloadResult(result) {
  assertOutputSize(result.blob.size, result.name);
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function getAutomaticDownloadResult(results, enabled = true) {
  if (!enabled) return null;
  const downloadable = (results || []).filter((result) => result?.blob && !result.noNewFile);
  return downloadable.length === 1 ? downloadable[0] : null;
}

export function parsePageSelection(value, pageCount, fallback = "all", preserveDuplicates = false) {
  if (!pageCount) return [];
  const raw = String(value || "").trim().toLowerCase();
  if (raw.length > MAX_PAGE_SELECTION_CHARACTERS) {
    throw new FileLimitError("page-selection-too-long", `The page selection is longer than ${MAX_PAGE_SELECTION_CHARACTERS.toLocaleString()} characters. Use fewer ranges and process another job for the rest.`);
  }
  if (!raw || raw === "all") {
    return fallback === "all" ? Array.from({ length: pageCount }, (_, index) => index) : [];
  }

  const pages = [];
  for (const token of raw.split(",")) {
    const part = token.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [startRaw, endRaw] = part.split("-");
      const start = Math.min(pageCount, Math.max(1, Number.parseInt(startRaw, 10) || 1));
      const end = Math.max(1, Math.min(pageCount, Number.parseInt(endRaw, 10) || pageCount));
      const step = start <= end ? 1 : -1;
      for (let page = start; step > 0 ? page <= end : page >= end; page += step) {
        pages.push(page - 1);
        if (pages.length > MAX_PAGE_SELECTION_ENTRIES) throw new FileLimitError("page-selection-too-large", `The page selection expands beyond ${MAX_PAGE_SELECTION_ENTRIES.toLocaleString()} entries. Use fewer ranges and split the work into another job.`);
      }
    } else {
      const page = Number.parseInt(part, 10);
      if (page >= 1 && page <= pageCount) pages.push(page - 1);
      if (pages.length > MAX_PAGE_SELECTION_ENTRIES) throw new FileLimitError("page-selection-too-large", `The page selection expands beyond ${MAX_PAGE_SELECTION_ENTRIES.toLocaleString()} entries. Use fewer ranges and split the work into another job.`);
    }
  }
  return preserveDuplicates ? pages : [...new Set(pages)];
}

export function createOrganizePagePlan(value, pageCount, limitsOrTool = "organize-pdf") {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new FileLimitError("invalid-page-count", "This PDF did not report a valid page count.");
  }
  const order = parsePageSelection(value, pageCount, "all", true);
  if (!order.length) throw new FileLimitError("empty-page-order", "Keep at least one page in the output PDF.");
  assertOrganizedPageCount(order.length, pageCount, limitsOrTool);
  const distinctPages = new Set(order);
  return {
    order,
    copiedPages: order.length - distinctPages.size,
    omittedPages: pageCount - distinctPages.size,
  };
}

export function parseSplitPageSelection(value, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];
  const raw = String(value || "").trim().toLowerCase();
  if (raw.length > MAX_PAGE_SELECTION_CHARACTERS) {
    throw new FileLimitError("page-selection-too-long", `The page selection is longer than ${MAX_PAGE_SELECTION_CHARACTERS.toLocaleString()} characters. Use fewer ranges and process another job for the rest.`);
  }
  if (raw === "all") return Array.from({ length: pageCount }, (_, index) => index);
  if (!raw) throw new FileLimitError("missing-page-selection", "Choose at least one page to split.");

  const pages = [];
  const seen = new Set();
  const addPage = (page) => {
    if (page < 1 || page > pageCount) {
      throw new FileLimitError("page-out-of-range", `Page ${page.toLocaleString()} is outside this ${pageCount.toLocaleString()}-page PDF.`);
    }
    const index = page - 1;
    if (!seen.has(index)) {
      pages.push(index);
      seen.add(index);
    }
    if (pages.length > MAX_PAGE_SELECTION_ENTRIES) {
      throw new FileLimitError("page-selection-too-large", `The page selection expands beyond ${MAX_PAGE_SELECTION_ENTRIES.toLocaleString()} entries. Use fewer ranges and split the work into another job.`);
    }
  };

  for (const token of raw.split(",")) {
    const part = token.trim();
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      throw new FileLimitError("invalid-page-selection", `“${part || "empty entry"}” is not a valid page or range. Use entries like 2, 4-7, or 8-5.`);
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new FileLimitError("invalid-page-selection", `“${part}” is not a valid page or range.`);
    }
    const step = start <= end ? 1 : -1;
    for (let page = start; step > 0 ? page <= end : page >= end; page += step) addPage(page);
  }
  return pages;
}

export function createExtractPagePlan(value, pageCount, combine, maxGeneratedItems) {
  let selection;
  try {
    selection = parseSplitPageSelection(value, pageCount);
  } catch (error) {
    if (error instanceof FileLimitError && error.code === "missing-page-selection") {
      throw new FileLimitError("missing-page-selection", "Choose at least one page to extract.");
    }
    throw error;
  }
  const outputCount = combine === false ? selection.length : 1;
  if (combine === false && (!Number.isInteger(maxGeneratedItems) || maxGeneratedItems < 1)) {
    throw new FileLimitError("invalid-generated-item-limit", "The generated-file safeguard is unavailable. Reload the tool and try again.");
  }
  if (combine === false && outputCount > maxGeneratedItems) {
    throw new FileLimitError(
      "too-many-generated-items",
      `This would create ${outputCount.toLocaleString()} PDF files. Select up to ${maxGeneratedItems.toLocaleString()} pages, or combine them into one PDF.`,
    );
  }
  return { selection, outputCount, combine: combine !== false };
}

function parseSplitBreaks(value, pageCount) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  if (raw.length > MAX_PAGE_SELECTION_CHARACTERS) {
    throw new FileLimitError("page-selection-too-long", `The custom split rule is longer than ${MAX_PAGE_SELECTION_CHARACTERS.toLocaleString()} characters. Use fewer split points.`);
  }

  const breaks = new Set();
  for (const token of raw.split(",")) {
    const part = token.trim();
    if (!/^\d+$/.test(part)) {
      throw new FileLimitError("invalid-split-point", `“${part || "empty entry"}” is not a valid split point. Enter page numbers like 3, 6, 9.`);
    }
    const page = Number(part);
    if (!Number.isSafeInteger(page) || page < 1 || page >= pageCount) {
      throw new FileLimitError("split-point-out-of-range", `Split after a page from 1 to ${(pageCount - 1).toLocaleString()}. Page ${part} cannot be a split point.`);
    }
    breaks.add(page);
    if (breaks.size >= MAX_PAGE_SELECTION_ENTRIES) {
      throw new FileLimitError("page-selection-too-large", `The custom split rule expands beyond ${MAX_PAGE_SELECTION_ENTRIES.toLocaleString()} split points. Use fewer splits.`);
    }
  }
  return [...breaks].sort((a, b) => a - b);
}

export function createSplitPdfGroups(mode, pageCount, customBreaks = "", selectedPages = "") {
  if (!Number.isInteger(pageCount) || pageCount < 1) return [];
  const normalizedMode = String(mode || "half").toLowerCase();
  const allPages = Array.from({ length: pageCount }, (_, index) => index);

  if (["all", "every", "every-page"].includes(normalizedMode)) return allPages.map((page) => [page]);
  if (normalizedMode === "selected") return parseSplitPageSelection(selectedPages, pageCount).map((page) => [page]);
  if (normalizedMode === "odd") return [allPages.filter((page) => page % 2 === 0)];
  if (normalizedMode === "even") {
    const evenPages = allPages.filter((page) => page % 2 === 1);
    if (!evenPages.length) throw new FileLimitError("empty-pdf-result", "This PDF has no even-numbered pages.");
    return [evenPages];
  }
  if (normalizedMode === "every2") {
    const groups = [];
    for (let index = 0; index < allPages.length; index += 2) groups.push(allPages.slice(index, index + 2));
    return groups;
  }
  if (normalizedMode === "half") {
    if (pageCount === 1) return [allPages];
    const midpoint = Math.ceil(pageCount / 2);
    return [allPages.slice(0, midpoint), allPages.slice(midpoint)];
  }
  if (normalizedMode === "custom") {
    const breaks = parseSplitBreaks(customBreaks, pageCount);
    const groups = [];
    let start = 0;
    for (const endPage of [...breaks, pageCount]) {
      groups.push(allPages.slice(start, endPage));
      start = endPage;
    }
    return groups;
  }

  throw new FileLimitError("invalid-split-mode", "Choose a valid PDF split method.");
}

export function parseRemovalPageSelection(value, pageCount) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new FileLimitError("missing-page-selection", "Choose at least one page to remove.");
  }
  const pages = parseSplitPageSelection(raw, pageCount);
  if (pages.length >= pageCount) {
    throw new FileLimitError("empty-pdf-result", "Keep at least one page. Removing every page would create an empty PDF.");
  }
  return pages;
}

export function formatPageSelection(indices) {
  const pages = [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b)
    .map((index) => index + 1);
  if (!pages.length) return "";
  const ranges = [];
  let start = pages[0];
  let end = pages[0];
  for (let index = 1; index <= pages.length; index += 1) {
    const page = pages[index];
    if (page === end + 1) {
      end = page;
      continue;
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
    start = page;
    end = page;
  }
  return ranges.join(",");
}

export function safeFileName(value, fallback = "result") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

export function isToolSearchShortcut(event) {
  return Boolean(
    (event?.metaKey || event?.ctrlKey)
    && !event?.altKey
    && !event?.shiftKey
    && String(event?.key || "").toLowerCase() === "k"
  );
}

export async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
