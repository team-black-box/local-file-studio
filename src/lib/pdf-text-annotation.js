// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, getTextSettingLimit } from "./file-limits.js";

export const PDF_TEXT_ANNOTATION_SCOPES = Object.freeze({
  all: Object.freeze({ value: "all", label: "Every page", description: "Add the same note in the same place on every page." }),
  single: Object.freeze({ value: "single", label: "One page", description: "Add the note only to the page selected below." }),
});

export const PDF_TEXT_ANNOTATION_DEFAULTS = Object.freeze({
  text: "Reviewed locally",
  scope: "all",
  targetPage: 1,
  x: 18,
  y: 14,
  fontSize: 16,
});

export const PDF_TEXT_ANNOTATION_LIMITS = Object.freeze({
  minFontSize: 10,
  maxFontSize: 48,
  minPosition: 0,
  maxPosition: 100,
  pageMargin: 18,
  maxLineWidthRatio: 0.72,
  lineHeightRatio: 1.22,
});

const PDF_TEXT_ANNOTATION_MAX_CHARACTERS = getTextSettingLimit("edit-pdf", "text");
const PDF_PAGE_ROTATIONS = Object.freeze([0, 90, 180, 270]);

function finiteNumber(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number)) {
    throw new FileLimitError("invalid-text-annotation-setting", `${label} must be a valid number.`);
  }
  return number;
}

function boundedNumber(value, fallback, min, max, label) {
  const number = finiteNumber(value, fallback, label);
  if (number < min || number > max) {
    throw new FileLimitError("text-annotation-setting-out-of-range", `${label} must be between ${min} and ${max}.`);
  }
  return number;
}

export function createPdfTextAnnotationPlan(options = {}, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new FileLimitError("invalid-page-count", "This PDF did not report a valid page count. Re-save it and try again.");
  }

  const text = String(options.text ?? PDF_TEXT_ANNOTATION_DEFAULTS.text).replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  if (!text.trim()) {
    throw new FileLimitError("missing-text-annotation", "Enter the text you want to add before creating the PDF.");
  }
  if (text.length > PDF_TEXT_ANNOTATION_MAX_CHARACTERS) {
    throw new FileLimitError(
      "text-setting-too-long",
      `Text to add contains ${text.length.toLocaleString()} characters; Edit PDF supports ${PDF_TEXT_ANNOTATION_MAX_CHARACTERS.toLocaleString()}. Shorten the text and try again.`,
    );
  }

  const scope = options.scope ?? PDF_TEXT_ANNOTATION_DEFAULTS.scope;
  if (!Object.prototype.hasOwnProperty.call(PDF_TEXT_ANNOTATION_SCOPES, scope)) {
    throw new FileLimitError("invalid-text-annotation-scope", "Choose whether to add this note to every page or one page.");
  }

  let targetPage = PDF_TEXT_ANNOTATION_DEFAULTS.targetPage;
  if (scope === "single") {
    targetPage = finiteNumber(options.targetPage, PDF_TEXT_ANNOTATION_DEFAULTS.targetPage, "Selected page");
    if (!Number.isInteger(targetPage) || targetPage < 1 || targetPage > pageCount) {
      throw new FileLimitError("text-annotation-page-out-of-range", `Choose a whole page number from 1 to ${pageCount.toLocaleString()} for this PDF.`);
    }
  }

  const x = boundedNumber(
    options.x,
    PDF_TEXT_ANNOTATION_DEFAULTS.x,
    PDF_TEXT_ANNOTATION_LIMITS.minPosition,
    PDF_TEXT_ANNOTATION_LIMITS.maxPosition,
    "Horizontal position",
  );
  const y = boundedNumber(
    options.y,
    PDF_TEXT_ANNOTATION_DEFAULTS.y,
    PDF_TEXT_ANNOTATION_LIMITS.minPosition,
    PDF_TEXT_ANNOTATION_LIMITS.maxPosition,
    "Vertical position",
  );
  const fontSize = boundedNumber(
    options.fontSize,
    PDF_TEXT_ANNOTATION_DEFAULTS.fontSize,
    PDF_TEXT_ANNOTATION_LIMITS.minFontSize,
    PDF_TEXT_ANNOTATION_LIMITS.maxFontSize,
    "Text size",
  );
  const pageIndices = scope === "single"
    ? [targetPage - 1]
    : Array.from({ length: pageCount }, (_, index) => index);
  const scopeLabel = scope === "single" ? `Page ${targetPage}` : `All ${pageCount.toLocaleString()} pages`;

  return Object.freeze({
    text,
    scope,
    targetPage,
    x,
    y,
    fontSize,
    pageCount,
    pageIndices: Object.freeze(pageIndices),
    affectedPageCount: pageIndices.length,
    scopeLabel,
    actionLabel: pageIndices.length === 1 ? "Add text to 1 page" : `Add text to ${pageIndices.length.toLocaleString()} pages`,
    readyLabel: `${scopeLabel} · ${fontSize.toLocaleString()} pt`,
  });
}

function breakToken(token, maxWidth, widthOfText) {
  const chunks = [];
  let current = "";
  for (const character of token) {
    const next = `${current}${character}`;
    if (current && widthOfText(next) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function createPdfTextAnnotationLayout(plan, pageWidth, pageHeight, widthOfText) {
  if (![pageWidth, pageHeight].every((value) => Number.isFinite(value) && value > 0) || typeof widthOfText !== "function") {
    throw new FileLimitError("invalid-text-annotation-page", "This PDF page has invalid dimensions for text placement.");
  }

  const margin = PDF_TEXT_ANNOTATION_LIMITS.pageMargin;
  const maxWidth = Math.min(pageWidth - margin * 2, pageWidth * PDF_TEXT_ANNOTATION_LIMITS.maxLineWidthRatio);
  if (maxWidth <= 0) throw new FileLimitError("text-annotation-page-too-small", "This PDF page is too small for the text note.");

  const lines = [];
  for (const paragraph of plan.text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.trim().split(/\s+/u)) {
      const tokens = widthOfText(word) > maxWidth ? breakToken(word, maxWidth, widthOfText) : [word];
      for (const token of tokens) {
        const candidate = current ? `${current} ${token}` : token;
        if (current && widthOfText(candidate) > maxWidth) {
          lines.push(current);
          current = token;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
  }

  const lineHeight = plan.fontSize * PDF_TEXT_ANNOTATION_LIMITS.lineHeightRatio;
  const blockHeight = Math.max(plan.fontSize, plan.fontSize + Math.max(0, lines.length - 1) * lineHeight);
  if (blockHeight > pageHeight - margin * 2) {
    throw new FileLimitError("text-annotation-does-not-fit", `This note does not fit on the page at ${plan.fontSize.toLocaleString()} pt. Shorten it or choose a smaller text size.`);
  }
  const blockWidth = Math.max(...lines.map((line) => widthOfText(line)), 1);
  if (blockWidth > pageWidth - margin * 2) {
    throw new FileLimitError("text-annotation-does-not-fit", `This note does not fit on the page at ${plan.fontSize.toLocaleString()} pt. Shorten it or choose a smaller text size.`);
  }
  const anchorX = (plan.x / 100) * pageWidth;
  const anchorY = (plan.y / 100) * pageHeight;
  const left = Math.max(margin, Math.min(pageWidth - margin - blockWidth, anchorX - blockWidth / 2));
  const top = Math.max(margin, Math.min(pageHeight - margin - blockHeight, anchorY - blockHeight / 2));

  return Object.freeze({
    lines: Object.freeze(lines),
    lineHeight,
    blockWidth,
    blockHeight,
    left,
    top,
  });
}

export function getPdfTextAnnotationPageGeometry(pageWidth, pageHeight, rotationAngle = 0) {
  if (![pageWidth, pageHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new FileLimitError("invalid-text-annotation-page", "This PDF page has invalid dimensions for text placement.");
  }
  const rotation = ((Number(rotationAngle) % 360) + 360) % 360;
  if (!PDF_PAGE_ROTATIONS.includes(rotation)) {
    throw new FileLimitError("unsupported-text-annotation-page-rotation", "This PDF page uses an unsupported rotation. Re-save it with a standard page rotation and try again.");
  }
  return Object.freeze({
    rotation,
    pageWidth,
    pageHeight,
    visualWidth: rotation === 90 || rotation === 270 ? pageHeight : pageWidth,
    visualHeight: rotation === 90 || rotation === 270 ? pageWidth : pageHeight,
  });
}

export function createPdfTextAnnotationDrawOperation(layout, geometry, lineIndex, fontSize) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= layout.lines.length) {
    throw new FileLimitError("invalid-text-annotation-line", "The PDF text note reported an invalid line position.");
  }
  const visualX = layout.left;
  const visualBaselineFromTop = layout.top + fontSize + lineIndex * layout.lineHeight;
  if (geometry.rotation === 90) {
    return Object.freeze({ x: visualBaselineFromTop, y: visualX, rotation: 90 });
  }
  if (geometry.rotation === 180) {
    return Object.freeze({ x: geometry.pageWidth - visualX, y: visualBaselineFromTop, rotation: 180 });
  }
  if (geometry.rotation === 270) {
    return Object.freeze({ x: geometry.pageWidth - visualBaselineFromTop, y: geometry.pageHeight - visualX, rotation: 270 });
  }
  return Object.freeze({ x: visualX, y: geometry.pageHeight - visualBaselineFromTop, rotation: 0 });
}
