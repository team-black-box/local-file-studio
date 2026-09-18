// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, MAX_OUTPUT_NAME_BYTES, MAX_OUTPUT_NAME_CHARACTERS } from "./file-limits.js";

const KNOWN_EXTENSION = /\.(?:pdf|zip|jpe?g|png|webp|gif|tiff?|bmp|svg|heic|avif|txt|md|html?|docx?|pptx?|xlsx?|csv)$/i;
const encoder = new TextEncoder();
const PAGE_LABEL = /-(?:page-\d+|pages-\d+(?:-\d+)?|odd-pages|even-pages)$/i;
const OPERATIONS = {
  "merge-pdf": "merged", "split-pdf": "split", "compress-pdf": "compressed",
  "organize-pdf": "organized", "remove-pages": "pages-removed", "remove-pdf-pages": "pages-removed",
  "extract-pages": "extracted-pages", "extract-pdf-pages": "extracted-pages",
  "rotate-pdf": "rotated", "edit-pdf": "edited", "add-image-to-pdf": "with-images",
  "add-pdf-page-numbers": "numbered", "add-page-numbers": "numbered", "watermark-pdf": "watermarked",
  "sign-pdf": "signed", "redact-pdf": "redacted", "crop-pdf": "cropped",
  "protect-pdf": "protected", "unlock-pdf": "unlocked", "repair-pdf": "repaired",
  "scan-to-pdf": "scanned", "jpg-to-pdf": "images", "compare-pdf": "comparison",
  "pdf-to-pdfa": "archive", "pdf-to-jpg": "pages", "pdf-forms": "filled", "fill-pdf": "filled",
  "compress-image": "compressed", "resize-image": "resized", "upscale-image": "upscaled",
  "remove-background": "background-removed", "remove-image-background": "background-removed",
  "blur-face": "face-blurred", "watermark-image": "watermarked", "meme-generator": "meme",
  "rotate-image": "rotated", "crop-image": "cropped", "photo-editor": "edited",
  "convert-from-jpg": "animation", "html-to-image": "capture",
  "ocr-pdf": "text", "ai-summarizer": "summary", "summarize-pdf": "summary", "translate-pdf": "translation",
};

function boundedStem(value, maxBytes = MAX_OUTPUT_NAME_BYTES) {
  let output = "";
  let bytes = 0;
  for (const character of value) {
    bytes += encoder.encode(character).length;
    if (bytes > maxBytes) break;
    output += character;
  }
  return output.replace(/[.\s-]+$/g, "");
}

function appendLabel(stem, label) {
  return `${boundedStem(stem, MAX_OUTPUT_NAME_BYTES - encoder.encode(label).length)}${label}`;
}

export function sanitizeOutputStem(value, fallback = "result") {
  let cleaned = String(value ?? "").normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) cleaned = `file-${cleaned}`;
  return boundedStem(cleaned) || fallback;
}

export function validateOutputName(value) {
  const name = String(value ?? "").trim();
  if (name.length > MAX_OUTPUT_NAME_CHARACTERS || encoder.encode(name).length > MAX_OUTPUT_NAME_BYTES) {
    throw new FileLimitError("output-name-too-long", `Use an output name of at most ${MAX_OUTPUT_NAME_CHARACTERS} characters (${MAX_OUTPUT_NAME_BYTES} UTF-8 bytes). Shorten the name and try again.`);
  }
  if (name && !sanitizeOutputStem(name.replace(KNOWN_EXTENSION, ""), "")) {
    throw new FileLimitError("invalid-output-name", "Add at least one usable character to the output file name, or leave it blank for automatic naming.");
  }
  return name ? sanitizeOutputStem(name.replace(KNOWN_EXTENSION, "")) : "";
}

export function suggestOutputBaseName(tool, files = [], options = {}) {
  const slug = typeof tool === "string" ? tool : tool?.slug || "result";
  let source = sanitizeOutputStem(String(files[0]?.name || (slug.startsWith("html-") ? "html-document" : "document")).replace(KNOWN_EXTENSION, ""));
  if (slug === "merge-pdf" && options.mode === "interleave") {
    source = source.replace(/[-_ ](?:fronts?|odd)(?:[-_ ]pages)?$/i, "") || source;
  }
  const operation = slug === "merge-pdf" && options.mode === "interleave" ? "interleaved" : OPERATIONS[slug] || "";
  const batch = files.length > 1 ? `-and-${files.length - 1}-more` : "";
  return appendLabel(source, `${batch}${operation && !source.toLowerCase().endsWith(`-${operation}`) ? `-${operation}` : ""}`);
}

function nameParts(name) {
  const match = String(name || "result").match(/^(.*)\.([a-z0-9]{1,8})$/i);
  return match ? { stem: match[1], extension: match[2].toLowerCase() } : { stem: name || "result", extension: "" };
}

export function uniqueOutputNames(names) {
  const used = new Set();
  return names.map((name) => {
    const { stem, extension } = nameParts(name);
    const pageLabel = String(stem).match(PAGE_LABEL)?.[0];
    const safeStem = pageLabel
      ? appendLabel(sanitizeOutputStem(stem.slice(0, -pageLabel.length)), pageLabel)
      : sanitizeOutputStem(stem);
    const suffix = extension ? `.${extension}` : "";
    let candidate = `${safeStem}${suffix}`;
    let number = 2;
    while (used.has(candidate.toLocaleLowerCase("en-US"))) candidate = `${safeStem}-${number++}${suffix}`;
    used.add(candidate.toLocaleLowerCase("en-US"));
    return candidate;
  });
}

// Only names are changed: result blobs, metadata, IDs, and page order stay intact.
export function nameOutputResults(results, { tool, files = [], outputName = "", options = {}, archiveEntries = false } = {}) {
  const custom = validateOutputName(outputName);
  const defaultBase = tool ? suggestOutputBaseName(tool, files, options) : "";
  const names = results.map((result, index) => {
    const { stem, extension } = nameParts(result.name);
    const suffix = extension ? `.${extension}` : "";
    if (custom) {
      const pageSuffix = archiveEntries ? stem.match(PAGE_LABEL)?.[0] : "";
      const label = pageSuffix || (results.length > 1 ? `-${String(index + 1).padStart(String(results.length).length, "0")}` : "");
      return `${appendLabel(custom, label)}${suffix}`;
    }
    if (!archiveEntries && defaultBase && results.length === 1 && !result.noNewFile) {
      const pageSuffix = stem.match(PAGE_LABEL)?.[0];
      // A single split/extract result still identifies the selected pages.
      const slug = typeof tool === "string" ? tool : tool.slug;
      if (pageSuffix && ["split-pdf", "extract-pages", "extract-pdf-pages"].includes(slug)) {
        return `${appendLabel(sanitizeOutputStem(String(files[0]?.name || "document").replace(KNOWN_EXTENSION, "")), pageSuffix)}${suffix}`;
      }
      return `${defaultBase}${suffix}`;
    }
    return result.name;
  });
  const unique = uniqueOutputNames(names);
  return results.map((result, index) => ({ ...result, name: unique[index] }));
}
