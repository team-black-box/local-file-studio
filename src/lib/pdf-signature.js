// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, getTextSettingLimit } from "./file-limits.js";
import { getPdfTextAnnotationPageGeometry } from "./pdf-text-annotation.js";

const MONTH_NAMES = Object.freeze([
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]);

export const PDF_SIGNATURE_DEFAULTS = Object.freeze({
  name: "Signed locally",
  includeDate: true,
  x: 72,
  y: 82,
  fontSize: 24,
});

export const PDF_SIGNATURE_LIMITS = Object.freeze({
  minFontSize: 12,
  maxFontSize: 48,
  minPosition: 0,
  maxPosition: 100,
  pageMargin: 18,
  maxLineWidthRatio: 0.62,
  preferredLineWidth: 150,
  dateFontSize: 8,
  lineGap: 5,
  dateGap: 7,
});

const PDF_SIGNATURE_MAX_CHARACTERS = getTextSettingLimit("sign-pdf", "name");

function finiteNumber(value, fallback, label) {
  const number = value === "" || value === undefined || value === null ? fallback : Number(value);
  if (!Number.isFinite(number)) {
    throw new FileLimitError("invalid-pdf-signature-setting", `${label} must be a valid number.`);
  }
  return number;
}

function boundedNumber(value, fallback, min, max, label) {
  const number = finiteNumber(value, fallback, label);
  if (number < min || number > max) {
    throw new FileLimitError("pdf-signature-setting-out-of-range", `${label} must be between ${min} and ${max}.`);
  }
  return number;
}

function isValidIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function createSigningDateIso(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new FileLimitError("invalid-pdf-signature-date", "The signing date could not be read on this device.");
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatSigningDateLabel(isoDate) {
  if (!isValidIsoDate(isoDate)) {
    throw new FileLimitError("invalid-pdf-signature-date", "The signing date must use a valid YYYY-MM-DD value.");
  }
  const [year, month, day] = isoDate.split("-").map(Number);
  return `Signed on ${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function createPdfSignaturePlan(options = {}, pageCount, date = new Date()) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new FileLimitError("invalid-page-count", "This PDF did not report a valid page count. Re-save it and try again.");
  }

  const name = String(options.name ?? options.signature ?? PDF_SIGNATURE_DEFAULTS.name).trim();
  if (!name) {
    throw new FileLimitError("missing-pdf-signature", "Enter the typed signature you want to place before creating the PDF.");
  }
  if (/\r|\n/u.test(name)) {
    throw new FileLimitError("invalid-pdf-signature-line", "Use one line for the typed signature.");
  }
  if (name.length > PDF_SIGNATURE_MAX_CHARACTERS) {
    throw new FileLimitError(
      "text-setting-too-long",
      `Typed signature contains ${name.length.toLocaleString()} characters; Sign PDF supports ${PDF_SIGNATURE_MAX_CHARACTERS.toLocaleString()}. Shorten it and try again.`,
    );
  }

  const x = boundedNumber(
    options.x,
    PDF_SIGNATURE_DEFAULTS.x,
    PDF_SIGNATURE_LIMITS.minPosition,
    PDF_SIGNATURE_LIMITS.maxPosition,
    "Horizontal position",
  );
  const y = boundedNumber(
    options.y,
    PDF_SIGNATURE_DEFAULTS.y,
    PDF_SIGNATURE_LIMITS.minPosition,
    PDF_SIGNATURE_LIMITS.maxPosition,
    "Vertical position",
  );
  const fontSize = boundedNumber(
    options.fontSize,
    PDF_SIGNATURE_DEFAULTS.fontSize,
    PDF_SIGNATURE_LIMITS.minFontSize,
    PDF_SIGNATURE_LIMITS.maxFontSize,
    "Signature size",
  );
  const includeDate = options.includeDate !== false;
  const signingDate = options.signingDate === undefined ? createSigningDateIso(date) : String(options.signingDate);
  const dateLabel = includeDate ? formatSigningDateLabel(signingDate) : "";

  return Object.freeze({
    name,
    includeDate,
    signingDate,
    dateLabel,
    x,
    y,
    fontSize,
    pageCount,
    pageIndex: pageCount - 1,
    pageLabel: `Final page · ${pageCount.toLocaleString()} of ${pageCount.toLocaleString()}`,
    actionLabel: "Sign final page",
    readyLabel: `Final page ${pageCount.toLocaleString()} · ${fontSize.toLocaleString()} pt${includeDate ? " · date included" : " · signature only"}`,
  });
}

export function createPdfSignatureLayout(plan, pageWidth, pageHeight, widthOfSignature, widthOfDate) {
  if (![pageWidth, pageHeight].every((value) => Number.isFinite(value) && value > 0)
    || typeof widthOfSignature !== "function"
    || typeof widthOfDate !== "function") {
    throw new FileLimitError("invalid-pdf-signature-page", "This PDF page has invalid dimensions for signature placement.");
  }

  const margin = PDF_SIGNATURE_LIMITS.pageMargin;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  const maxLineWidth = Math.min(availableWidth, pageWidth * PDF_SIGNATURE_LIMITS.maxLineWidthRatio);
  if (maxLineWidth <= 0 || availableHeight <= 0) {
    throw new FileLimitError("pdf-signature-page-too-small", "This PDF page is too small for the typed signature.");
  }

  const signatureWidth = widthOfSignature(plan.name);
  const dateWidth = plan.includeDate ? widthOfDate(plan.dateLabel) : 0;
  if (![signatureWidth, dateWidth].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new FileLimitError("invalid-pdf-signature-width", "The typed signature could not be measured safely.");
  }
  if (signatureWidth > maxLineWidth || dateWidth > maxLineWidth) {
    throw new FileLimitError(
      "pdf-signature-does-not-fit",
      `This typed signature does not fit on the final page at ${plan.fontSize.toLocaleString()} pt. Shorten it or choose a smaller signature size.`,
    );
  }

  const preferredLineWidth = Math.min(PDF_SIGNATURE_LIMITS.preferredLineWidth, maxLineWidth);
  const lineWidth = Math.min(maxLineWidth, Math.max(signatureWidth + 12, dateWidth, preferredLineWidth));
  const signatureBaselineFromTop = plan.fontSize;
  const lineFromTop = signatureBaselineFromTop + PDF_SIGNATURE_LIMITS.lineGap;
  const dateBaselineFromTop = lineFromTop + PDF_SIGNATURE_LIMITS.dateGap + PDF_SIGNATURE_LIMITS.dateFontSize;
  const blockHeight = plan.includeDate ? dateBaselineFromTop : lineFromTop;
  if (blockHeight > availableHeight) {
    throw new FileLimitError(
      "pdf-signature-does-not-fit",
      `This typed signature does not fit on the final page at ${plan.fontSize.toLocaleString()} pt. Choose a smaller signature size.`,
    );
  }

  const anchorX = (plan.x / 100) * pageWidth;
  const anchorY = (plan.y / 100) * pageHeight;
  const left = Math.max(margin, Math.min(pageWidth - margin - lineWidth, anchorX - lineWidth / 2));
  const top = Math.max(margin, Math.min(pageHeight - margin - blockHeight, anchorY - blockHeight / 2));

  return Object.freeze({
    left,
    top,
    lineWidth,
    blockHeight,
    signatureBaselineFromTop: top + signatureBaselineFromTop,
    lineFromTop: top + lineFromTop,
    dateBaselineFromTop: plan.includeDate ? top + dateBaselineFromTop : null,
  });
}

function visualPointToPdf(geometry, x, yFromTop) {
  if (geometry.rotation === 90) return Object.freeze({ x: yFromTop, y: x });
  if (geometry.rotation === 180) return Object.freeze({ x: geometry.pageWidth - x, y: yFromTop });
  if (geometry.rotation === 270) return Object.freeze({ x: geometry.pageWidth - yFromTop, y: geometry.pageHeight - x });
  return Object.freeze({ x, y: geometry.pageHeight - yFromTop });
}

function visualTextToPdf(geometry, x, baselineFromTop) {
  const point = visualPointToPdf(geometry, x, baselineFromTop);
  return Object.freeze({ ...point, rotation: geometry.rotation });
}

export function getPdfSignaturePageGeometry(pageWidth, pageHeight, rotationAngle = 0) {
  return getPdfTextAnnotationPageGeometry(pageWidth, pageHeight, rotationAngle);
}

export function createPdfSignatureDrawOperations(layout, geometry, includeDate) {
  const signature = visualTextToPdf(geometry, layout.left, layout.signatureBaselineFromTop);
  const line = Object.freeze({
    start: visualPointToPdf(geometry, layout.left, layout.lineFromTop),
    end: visualPointToPdf(geometry, layout.left + layout.lineWidth, layout.lineFromTop),
  });
  const date = includeDate
    ? visualTextToPdf(geometry, layout.left, layout.dateBaselineFromTop)
    : null;
  return Object.freeze({ signature, line, date });
}
