// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import JSZip from "jszip";
import {
  ARCHIVE_INPUT_LIMIT_BYTES,
  ARCHIVE_ITEM_LIMIT_BYTES,
  MAX_GENERATED_RESULTS,
  MAX_PAGE_SELECTION_CHARACTERS,
  MAX_PAGE_SELECTION_ENTRIES,
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
    zip.file(uniqueName, result.blob, { compression: alreadyCompressed ? "STORE" : "DEFLATE" });
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

export function safeFileName(value, fallback = "result") {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

export async function blobToDataUrl(blob) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
