// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  FileLimitError,
  assertPdfOverlayImageDimensions,
  assertImageDimensions,
  assertMarkupLength,
  assertRasterDimensions,
  formatLimitBytes,
  getImageCropPlan,
  getImageUpscalePlan,
  getProportionalResizeDimensions,
  getPdfOverlayImagePolicy,
  getToolLimits,
  validatePreflightMetadata,
  validatePdfOverlayImageSelection,
} from "./file-limits.js";
import { destroyPdfJsDocument, getPdfJsEngine } from "./pdfjs-utils.js";
import { getTiffDimensions } from "./tiff-utils.js";

function rasterScaleFor(tool, options) {
  if (tool.slug === "compress-pdf") {
    if (typeof options.quality === "string") return { gentle: 1.45, balanced: 1.2, strong: 0.95 }[options.quality] || 1.2;
    return Number(options.scale || 1.2);
  }
  if (tool.slug === "ocr-pdf") return 1.55;
  if (tool.slug === "redact-pdf") return 1.6;
  if (tool.slug === "pdf-to-jpg") return Number(options.scale || 1.7);
  return null;
}

function isPasswordError(error) {
  return /password/i.test(`${error?.name || ""} ${error?.message || ""}`);
}

async function inspectPdf(file, tool, options, limits, report, fileIndex, fileCount) {
  const pdfjs = await getPdfJsEngine();
  const password = Array.isArray(options.inputPasswords)
    ? options.inputPasswords[fileIndex]
    : tool.slug === "unlock-pdf"
      ? options.password
      : undefined;
  let document;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      password: password === undefined ? undefined : password,
    }).promise;
  } catch (error) {
    if (isPasswordError(error)) {
      throw new FileLimitError(
        "pdf-password-required",
        password
          ? `${file.name} could not be opened with the supplied password. Check it and try again.`
          : `${file.name} is password protected. Enter its password in ${tool.name} and try again.`,
        { name: file.name, cause: error },
      );
    }
    // Repair must still reach the lenient libpdf parser when PDF.js cannot
    // build metadata from a damaged cross-reference table or page tree. The
    // repair engine applies the same page cap again before rewriting.
    if (tool.slug === "repair-pdf") return { name: file.name };
    throw new FileLimitError(
      "invalid-pdf",
      `${file.name} could not be read as a valid PDF. Re-save it from its original app, or try Repair PDF first.`,
      { name: file.name, cause: error },
    );
  }

  let renderedPixels = 0;
  try {
    if (limits.maxPdfPagesPerFile && document.numPages > limits.maxPdfPagesPerFile) {
      throw new FileLimitError(
        "too-many-pages",
        `${file.name} has ${document.numPages.toLocaleString()} pages; ${tool.name} safely handles up to ${limits.maxPdfPagesPerFile.toLocaleString()} per file. Split the PDF into smaller parts first.`,
        { name: file.name, pdfPages: document.numPages },
      );
    }
    const scale = rasterScaleFor(tool, options);
    if (scale && (limits.maxRasterPixels || limits.maxRasterEdge)) {
      for (let pageIndex = 0; pageIndex < document.numPages; pageIndex += 1) {
        report?.({
          phase: `Checking ${file.name} · page ${pageIndex + 1} of ${document.numPages}`,
          progress: 0.08 + ((fileIndex + (pageIndex + 1) / document.numPages) / fileCount) * 0.12,
        });
        const page = await document.getPage(pageIndex + 1);
        try {
          const viewport = page.getViewport({ scale });
          assertRasterDimensions(viewport.width, viewport.height, limits, `${file.name}, page ${pageIndex + 1}`);
          renderedPixels += viewport.width * viewport.height;
          if (limits.maxRasterPixelsTotal && renderedPixels > limits.maxRasterPixelsTotal) {
            throw new FileLimitError(
              "pdf-render-work-too-large",
              `${file.name} would render ${(renderedPixels / 1_000_000).toFixed(1)} MP across its pages; ${tool.name} safely handles ${limits.maxRasterPixelsTotal / 1_000_000} MP per job. Split the PDF into smaller parts.`,
              { fileName: file.name, page: pageIndex + 1 },
            );
          }
        } finally {
          page.cleanup();
        }
      }
    }
    return { name: file.name, pdfPages: document.numPages };
  } finally {
    await destroyPdfJsDocument(document);
  }
}

function uint24(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

const SVG_UNIT_TO_PX = Object.freeze({ px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 });

function parseSvgLength(rawValue) {
  if (rawValue === undefined) return { kind: "missing" };
  const value = String(rawValue).trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*%$/i.test(value)) return { kind: "percentage" };
  const match = value.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(px|in|cm|mm|pt|pc)?$/i);
  if (!match) return { kind: "unsupported" };
  const amount = Number(match[1]);
  const multiplier = SVG_UNIT_TO_PX[match[2]?.toLowerCase() || "px"];
  const pixels = amount * multiplier;
  return Number.isFinite(pixels) ? { kind: "absolute", pixels } : { kind: "unsupported" };
}

function parseSvgViewBox(rawValue) {
  const values = String(rawValue || "").trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite) || values[2] <= 0 || values[3] <= 0) return null;
  return { width: values[2], height: values[3] };
}

async function readImageHeader(file) {
  if (/\.svg$/i.test(file.name)) {
    const source = await file.text();
    const opening = source.match(/<svg\b[^>]*>/i)?.[0] || "";
    const width = parseSvgLength(opening.match(/\bwidth\s*=\s*["']([^"']+)/i)?.[1]);
    const height = parseSvgLength(opening.match(/\bheight\s*=\s*["']([^"']+)/i)?.[1]);
    if (width.kind === "unsupported" || height.kind === "unsupported") return null;
    if (width.kind === "absolute" && height.kind === "absolute") return { width: width.pixels, height: height.pixels };
    const viewBox = parseSvgViewBox(opening.match(/\bviewBox\s*=\s*["']([^"']+)/i)?.[1]);
    if (!viewBox) return null;
    return {
      width: Math.max(viewBox.width, width.kind === "absolute" ? width.pixels : 0),
      height: Math.max(viewBox.height, height.kind === "absolute" ? height.pixels : 0),
    };
  }

  if (/\.tiff?$/i.test(file.name)) {
    const module = await import("utif");
    const UTIF = module.default || module;
    const ifd = UTIF.decode(await file.arrayBuffer())[0];
    return getTiffDimensions(ifd);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 10) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes.length >= 24) {
    let animated = false;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      if (!Number.isSafeInteger(length) || length < 0 || offset + 12 + length > bytes.length) break;
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
      if (type === "acTL") animated = true;
      offset += 12 + length;
      if (type === "IEND") break;
    }
    return { width: view.getUint32(16), height: view.getUint32(20), format: "png", animated };
  }
  if (String.fromCharCode(...bytes.slice(0, 4)) === "GIF8") {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5), format: "jpg", animated: false };
      }
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      offset += length + 2;
    }
  }
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (chunk === "VP8X" && bytes.length >= 30) return { width: uint24(bytes, 24) + 1, height: uint24(bytes, 27) + 1 };
    if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    }
  }
  return null;
}

export async function preflightPdfOverlayImages(tool, files) {
  const selection = validatePdfOverlayImageSelection(tool, [], files);
  if (selection.rejected.length || selection.accepted.length !== files.length) {
    throw new FileLimitError("overlay-input-limit", selection.rejected[0]?.message || "One or more placed images are outside this tool’s limits.");
  }
  const policy = getPdfOverlayImagePolicy(tool);
  const metadata = [];
  let totalPixels = 0;
  for (const file of files) {
    let header;
    try {
      header = await readImageHeader(file);
    } catch (error) {
      throw new FileLimitError("unreadable-overlay-image", `${file.name} could not be inspected safely. Re-save it as a static PNG or JPG.`, { name: file.name, cause: error });
    }
    if (!header || !["png", "jpg"].includes(header.format)) {
      throw new FileLimitError("unsupported-overlay-content", `${file.name} does not contain a supported PNG or JPG image. Its extension may not match its contents.`);
    }
    if (header.animated) {
      throw new FileLimitError("animated-overlay-image", `${file.name} is animated. Export one frame as a static PNG or JPG before placing it on a PDF.`);
    }
    assertPdfOverlayImageDimensions(header.width, header.height, tool, file.name);
    totalPixels += header.width * header.height;
    if (!Number.isSafeInteger(totalPixels) || totalPixels > policy.maxImagePixelsTotal) {
      throw new FileLimitError("overlay-total-pixels", `${file.name} takes placed images above ${policy.maxImagePixelsTotal / 1_000_000} MP combined. Remove images or use smaller copies.`);
    }
    metadata.push({ name: file.name, ...header });
  }
  return { policy, metadata, totalPixels };
}

async function inspectImage(file, limits) {
  let header;
  try {
    header = await readImageHeader(file);
  } catch (error) {
    throw new FileLimitError(
      "unreadable-image-metadata",
      `${file.name} has image metadata that could not be read safely. Re-save the image in its original app and try again.`,
      { name: file.name, cause: error },
    );
  }
  if (!header || !Number.isFinite(header.width) || !Number.isFinite(header.height)) {
    throw new FileLimitError(
      "unreadable-image-metadata",
      `${file.name} does not expose readable image dimensions. Re-save it as JPG, PNG, or WebP and try again.`,
      { name: file.name },
    );
  }
  assertImageDimensions(header.width, header.height, limits, file.name);
  return { name: file.name, ...header };
}

function invalidArchiveEntryError(file, entry, cause) {
  return new FileLimitError(
    "invalid-office-entry",
    `${file.name} contains an internal item (${entry.name}) that could not be expanded safely. Re-save the document in its original app and try again.`,
    { name: file.name, entry: entry.name, cause },
  );
}

async function measureExpandedArchiveEntry(entry, file, tool, limits, state) {
  if (entry.dir) return 0;
  return await new Promise((resolve, reject) => {
    let helper;
    let entryBytes = 0;
    let settled = false;

    const fail = (error, abortWorker = true) => {
      if (settled) return;
      settled = true;
      if (abortWorker) {
        const worker = helper?._worker;
        // Do not tear down the worker while its own data-listener array is
        // being iterated. A microtask still runs before JSZip schedules the
        // next source chunk, while avoiding listener-mutation errors.
        queueMicrotask(() => {
          try {
            worker?.error(error);
          } catch {
            // The original limit error is more useful than teardown failure.
          }
        });
      }
      reject(error);
    };

    try {
      helper = entry.internalStream("uint8array");
      if (typeof helper?._worker?.error !== "function") {
        fail(invalidArchiveEntryError(file, entry), false);
        return;
      }
      helper
        .on("data", (chunk) => {
          if (settled) return;
          const chunkBytes = Number(chunk?.byteLength ?? chunk?.length);
          if (!Number.isFinite(chunkBytes) || chunkBytes < 0) {
            fail(invalidArchiveEntryError(file, entry));
            return;
          }
          const nextEntryBytes = entryBytes + chunkBytes;
          const nextTotalBytes = state.expandedBytes + chunkBytes;
          if (nextEntryBytes > limits.maxExpandedArchiveItemBytes) {
            fail(new FileLimitError(
              "archive-entry-too-large",
              `${file.name} contains an internal item (${entry.name}) that expands beyond ${formatLimitBytes(limits.maxExpandedArchiveItemBytes)}. Remove large embedded media and try again.`,
              { name: file.name, entry: entry.name },
            ));
            return;
          }
          if (nextTotalBytes > limits.maxExpandedArchiveBytes) {
            fail(new FileLimitError(
              "archive-expansion-limit",
              `${file.name} expands beyond ${formatLimitBytes(limits.maxExpandedArchiveBytes)} in memory; ${tool.name} cannot process it safely. Remove embedded media or split the document.`,
              { name: file.name, entry: entry.name },
            ));
            return;
          }
          if (file.size && limits.maxArchiveExpansionRatio && nextTotalBytes > file.size * limits.maxArchiveExpansionRatio) {
            fail(new FileLimitError(
              "archive-ratio-limit",
              `${file.name} expands beyond the safe ${limits.maxArchiveExpansionRatio}× archive ratio. Re-save it without highly compressed embedded content, then try again.`,
              { name: file.name, entry: entry.name },
            ));
            return;
          }
          entryBytes = nextEntryBytes;
          state.expandedBytes = nextTotalBytes;
        })
        .on("error", (error) => fail(error instanceof FileLimitError ? error : invalidArchiveEntryError(file, entry, error), false))
        .on("end", () => {
          if (settled) return;
          settled = true;
          resolve(entryBytes);
        })
        .resume();
    } catch (error) {
      fail(error instanceof FileLimitError ? error : invalidArchiveEntryError(file, entry, error));
    }
  });
}

async function inspectOfficeArchive(file, tool, limits) {
  if (!/\.(docx|pptx|xlsx)$/i.test(file.name)) return;
  const JSZip = (await import("jszip")).default;
  let archive;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (error) {
    throw new FileLimitError("invalid-office-archive", `${file.name} could not be read as a valid ${file.name.split(".").pop().toUpperCase()} file. Re-save it in its original app and try again.`, { cause: error });
  }
  const entries = Object.values(archive.files);
  if (entries.length > limits.maxArchiveEntries) {
    throw new FileLimitError(
      "archive-entry-limit",
      `${file.name} contains ${entries.length.toLocaleString()} internal items; ${tool.name} supports ${limits.maxArchiveEntries.toLocaleString()}. Remove embedded media or split the document.`,
    );
  }
  let claimedExpandedBytes = 0;
  for (const entry of entries) {
    const originalName = entry.unsafeOriginalName || entry.name;
    if (originalName.split(/[\\/]/).includes("..")) {
      throw new FileLimitError("unsafe-archive-path", `${file.name} contains an unsafe internal path. Re-save the document in its original app before converting it.`);
    }
    const claimedSize = Number(entry._data?.uncompressedSize || 0);
    if (!Number.isFinite(claimedSize) || claimedSize < 0) throw invalidArchiveEntryError(file, entry);
    claimedExpandedBytes += claimedSize;
    if (claimedSize > limits.maxExpandedArchiveItemBytes) {
      throw new FileLimitError("archive-entry-too-large", `${file.name} contains an internal item larger than ${formatLimitBytes(limits.maxExpandedArchiveItemBytes)}. Remove large embedded media and try again.`);
    }
  }
  if (claimedExpandedBytes > limits.maxExpandedArchiveBytes) {
    throw new FileLimitError(
      "archive-expansion-limit",
      `${file.name} declares ${formatLimitBytes(claimedExpandedBytes)} of expanded content; ${tool.name} safely handles ${formatLimitBytes(limits.maxExpandedArchiveBytes)}. Remove embedded media or split the document.`,
    );
  }
  if (file.size && limits.maxArchiveExpansionRatio && claimedExpandedBytes > file.size * limits.maxArchiveExpansionRatio) {
    throw new FileLimitError("archive-ratio-limit", `${file.name} declares more than ${limits.maxArchiveExpansionRatio}× expansion in memory. Re-save it without large compressed media, then try again.`);
  }

  const state = { expandedBytes: 0 };
  for (const entry of entries) await measureExpandedArchiveEntry(entry, file, tool, limits, state);
}

export async function preflightToolFiles(tool, files, options = {}, report) {
  const limits = getToolLimits(tool);
  assertMarkupLength(tool, options.html);
  const metadata = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    report?.({ phase: `Checking ${file.name}`, progress: 0.06 + ((index + 1) / Math.max(1, files.length)) * 0.12 });

    if (/\.pdf$/i.test(file.name) && (limits.maxPdfPagesPerFile || limits.maxPdfPagesTotal || limits.maxRasterPixels)) {
      metadata.push(await inspectPdf(file, tool, options, limits, report, index, files.length));
    } else if (limits.maxImagePixelsPerFile) {
      metadata.push(await inspectImage(file, limits));
    } else {
      metadata.push({ name: file.name });
    }

    if (limits.maxArchiveEntries) await inspectOfficeArchive(file, tool, limits);
  }

  const totals = validatePreflightMetadata(tool, metadata);
  const outputMetadata = tool.slug === "resize-image"
    ? metadata.map((item) => {
      const output = getProportionalResizeDimensions(
        item.width,
        item.height,
        options.width ?? item.width,
        limits,
        `${item.name} after resizing`,
      );
      return { ...item, outputWidth: output.width, outputHeight: output.height };
    })
    : tool.slug === "upscale-image"
      ? metadata.map((item) => {
        const output = getImageUpscalePlan(
          item.width,
          item.height,
          options.scale,
          limits,
          `${item.name} after upscaling`,
        );
        return { ...item, outputWidth: output.width, outputHeight: output.height, scale: output.scale, outputPixels: output.outputPixels };
      })
    : tool.slug === "crop-image"
      ? metadata.map((item) => {
        const output = getImageCropPlan(
          item.width,
          item.height,
          options.aspectRatio ?? options.aspect ?? "free",
          options.cropScale ?? 100,
          options.focusX ?? 50,
          options.focusY ?? 50,
          limits,
          `${item.name} after cropping`,
        );
        return { ...item, outputWidth: output.width, outputHeight: output.height, cropX: output.x, cropY: output.y };
      })
      : metadata;
  return { limits, metadata: outputMetadata, ...totals };
}

export function toFriendlyResourceError(error, toolName = "This tool") {
  if (error instanceof FileLimitError) return error;
  if (/out of memory|allocation|array buffer|canvas|image data|too large|memory|invalid (?:array|string) length|quota exceeded|maximum call stack/i.test(String(error?.message || error))) {
    return new FileLimitError(
      "browser-resource-limit",
      `${toolName} reached this browser’s local memory or canvas limit. Close other heavy tabs, then retry with fewer pages, fewer images, or smaller dimensions.`,
      { cause: error },
    );
  }
  return error;
}
