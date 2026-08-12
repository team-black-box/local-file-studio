// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { inspectPdfProtection, unlockPdf } from "./libpdf.js";

const MODIFICATION_TOOLS = new Set([
  "merge-pdf",
  "split-pdf",
  "remove-pdf-pages",
  "remove-pages",
  "extract-pdf-pages",
  "extract-pages",
  "organize-pdf",
  "pdf-to-pdfa",
  "add-image-to-pdf",
  "rotate-pdf",
  "add-pdf-page-numbers",
  "add-page-numbers",
  "watermark-pdf",
  "crop-pdf",
  "edit-pdf",
  "sign-pdf",
  "pdf-forms",
  "protect-pdf",
]);

const RENDER_TOOLS = new Set(["compress-pdf", "redact-pdf", "ocr-pdf", "pdf-to-jpg"]);
const TEXT_TOOLS = new Set([
  "pdf-to-word",
  "pdf-to-powerpoint",
  "pdf-to-excel",
  "compare-pdf",
  "summarize-pdf",
  "ai-summarizer",
  "translate-pdf",
  "pdf-to-markdown",
]);

export function getPdfAccessMode(tool) {
  const slug = typeof tool === "string" ? tool : tool?.slug;
  if (!slug || slug === "unlock-pdf") return null;
  if (MODIFICATION_TOOLS.has(slug)) return "modify";
  if (RENDER_TOOLS.has(slug)) return "render";
  if (TEXT_TOOLS.has(slug)) return "text";
  if (slug === "repair-pdf") return "repair";
  return null;
}

export function isPdfFile(file) {
  return Boolean(file) && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));
}

function permissionForMode(mode, permissions) {
  if (mode === "modify" || mode === "repair") return Boolean(permissions?.modify);
  if (mode === "render") return Boolean(permissions?.print);
  if (mode === "text") return Boolean(permissions?.copy);
  return true;
}

function restrictedMessage(mode, name) {
  const action = mode === "render"
    ? "render or print its pages"
    : mode === "text"
      ? "copy or extract its text"
      : "modify the document";
  return `${name} opened, but this password does not allow Local File Studio to ${action}. Enter the owner password instead.`;
}

export async function inspectPdfAccess(file, mode, password) {
  if (!mode || !isPdfFile(file)) return { status: "ready", protected: false };
  const supplied = password !== undefined;
  let inspection;
  try {
    inspection = await inspectPdfProtection(new Uint8Array(await file.arrayBuffer()), supplied ? password : "");
  } catch (error) {
    return {
      status: "unsupported",
      protected: true,
      message: `${file.name} uses PDF security this browser build cannot inspect safely. Try another copy or use a supported password-protected PDF.`,
      cause: error,
    };
  }

  if (!inspection.encrypted) return { status: "ready", protected: false, inspection };
  if (!inspection.authenticated) {
    return {
      status: supplied ? "wrong-password" : "password-required",
      protected: true,
      message: supplied
        ? `That password did not open ${file.name}. Check it and try again.`
        : `${file.name} is password protected. Enter its password to continue here.`,
    };
  }
  if (!inspection.ownerAccess && !permissionForMode(mode, inspection.permissions)) {
    return {
      status: "owner-required",
      protected: true,
      message: restrictedMessage(mode, file.name),
      inspection,
    };
  }
  return {
    status: "verified",
    protected: true,
    ownerAccess: inspection.ownerAccess,
    inspection,
  };
}

export async function createUnlockedPdfFile(file, password) {
  const bytes = await unlockPdf(new Uint8Array(await file.arrayBuffer()), password);
  return new File([bytes], file.name, {
    type: "application/pdf",
    lastModified: file.lastModified || Date.now(),
  });
}
