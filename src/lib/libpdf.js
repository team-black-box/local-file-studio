// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { PDF, PermissionDeniedError, SecurityError } from "@libpdf/core";
import { MAX_PDF_PASSWORD_CHARACTERS, getToolLimits } from "./file-limits.js";

class PdfAdapterError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "PdfAdapterError";
    this.code = code;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function toPdfBytes(bytes) {
  let data;

  if (bytes instanceof Uint8Array) {
    data = bytes;
  } else if (bytes instanceof ArrayBuffer) {
    data = new Uint8Array(bytes);
  } else if (ArrayBuffer.isView(bytes)) {
    data = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  } else {
    throw new PdfAdapterError(
      "INVALID_PDF_DATA",
      "PDF data must be a Uint8Array, ArrayBuffer, or typed-array view.",
    );
  }

  if (data.byteLength === 0) {
    throw new PdfAdapterError("EMPTY_PDF", "The PDF file is empty.");
  }

  return data;
}

function normalizePassword(password, { required = false, nonEmpty = false } = {}) {
  if (password === undefined || password === null) {
    if (required) {
      throw new PdfAdapterError("PASSWORD_REQUIRED", "A PDF password is required.");
    }

    return undefined;
  }

  if (typeof password !== "string") {
    throw new PdfAdapterError("INVALID_PASSWORD", "The PDF password must be a string.");
  }

  if (nonEmpty && password.length === 0) {
    throw new PdfAdapterError("PASSWORD_REQUIRED", "Choose a non-empty password to protect the PDF.");
  }

  if (password.length > MAX_PDF_PASSWORD_CHARACTERS) {
    throw new PdfAdapterError(
      "PASSWORD_TOO_LONG",
      `The PDF password contains ${password.length.toLocaleString()} characters; the local security engine supports ${MAX_PDF_PASSWORD_CHARACTERS.toLocaleString()}. Shorten the password and try again.`,
    );
  }

  return password;
}

function assertAuthenticated(pdf, password, purpose) {
  if (!pdf.isEncrypted || pdf.isAuthenticated) {
    return;
  }

  if (password === undefined) {
    throw new PdfAdapterError(
      "PASSWORD_REQUIRED",
      `This PDF is password protected. Provide its password before ${purpose}.`,
    );
  }

  throw new PdfAdapterError(
    "INCORRECT_PASSWORD",
    `The password could not unlock this PDF. It may be incorrect or the encryption format may be unsupported.`,
  );
}

async function loadPdf(bytes, password, purpose) {
  const options = { lenient: true };

  if (password !== undefined) {
    options.credentials = password;
  }

  const pdf = await PDF.load(bytes, options);
  assertAuthenticated(pdf, password, purpose);
  return pdf;
}

/** Inspect password protection without changing the source document. */
export async function inspectPdfProtection(bytes, password) {
  return runPdfOperation("Checking PDF protection", async () => {
    const data = toPdfBytes(bytes);
    const credential = normalizePassword(password);
    const options = { lenient: true };
    if (credential !== undefined) options.credentials = credential;
    const pdf = await PDF.load(data, options);
    const encrypted = pdf.isEncrypted;

    return {
      encrypted,
      authenticated: !encrypted || pdf.isAuthenticated,
      ownerAccess: !encrypted || pdf.hasOwnerAccess(),
      permissions: pdf.getPermissions(),
      security: encrypted && pdf.isAuthenticated ? pdf.getSecurity() : null,
    };
  });
}

function assertRuntimePageLimit(pdf, toolSlug, toolName) {
  const maxPages = getToolLimits(toolSlug).maxPdfPagesPerFile;
  const pageCount = pdf.getPageCount();
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new PdfAdapterError("INVALID_PAGE_COUNT", `${toolName} could not determine a safe page count for this PDF.`);
  }
  if (maxPages && pageCount > maxPages) {
    throw new PdfAdapterError(
      "PDF_PAGE_LIMIT",
      `This PDF has ${pageCount.toLocaleString()} pages; ${toolName} safely handles up to ${maxPages.toLocaleString()}. Split it into smaller parts first.`,
    );
  }
}

function readableError(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

async function runPdfOperation(action, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PdfAdapterError) {
      throw error;
    }

    if (error instanceof PermissionDeniedError) {
      throw new PdfAdapterError(
        "PERMISSION_DENIED",
        `${action} was denied by the PDF's security settings. Try the owner password.`,
        error,
      );
    }

    if (error instanceof SecurityError) {
      throw new PdfAdapterError(
        "PDF_SECURITY_ERROR",
        `${action} failed because of the PDF's security settings: ${readableError(error)}`,
        error,
      );
    }

    throw new PdfAdapterError(
      "PDF_OPERATION_FAILED",
      `${action} failed: ${readableError(error)}`,
      error,
    );
  }
}

function validateFormValues(values) {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw new PdfAdapterError(
      "INVALID_FORM_VALUES",
      "Form values must be an object whose keys are PDF field names.",
    );
  }

  const entries = Object.entries(values);

  if (entries.length === 0) {
    throw new PdfAdapterError("EMPTY_FORM_VALUES", "Provide at least one form field value.");
  }

  for (const [name, value] of entries) {
    const isStringList = Array.isArray(value) && value.every((item) => typeof item === "string");
    const isSupported =
      value === null || typeof value === "string" || typeof value === "boolean" || isStringList;

    if (!isSupported) {
      throw new PdfAdapterError(
        "INVALID_FORM_VALUE",
        `Form field "${name}" must be a string, boolean, string array, or null.`,
      );
    }
  }

  return values;
}

function formatFieldNames(names) {
  const visible = names.slice(0, 8).map((name) => `"${name}"`).join(", ");
  const remainder = names.length - 8;
  return remainder > 0 ? `${visible}, and ${remainder} more` : visible;
}

/** Remove password protection and return an unencrypted PDF. */
export async function unlockPdf(bytes, password) {
  return runPdfOperation("Unlocking the PDF", async () => {
    const data = toPdfBytes(bytes);
    const credential = normalizePassword(password, { required: true });
    const pdf = await loadPdf(data, credential, "unlocking it");
    assertRuntimePageLimit(pdf, "unlock-pdf", "Unlock PDF");

    if (!pdf.isEncrypted) {
      throw new PdfAdapterError("PDF_NOT_PROTECTED", "This PDF is not password protected.");
    }

    pdf.removeProtection();
    return pdf.save({ incremental: false });
  });
}

/** Protect a PDF with AES-256 encryption and return the encrypted bytes. */
export async function protectPdf(bytes, password) {
  return runPdfOperation("Protecting the PDF", async () => {
    const data = toPdfBytes(bytes);
    const credential = normalizePassword(password, { required: true, nonEmpty: true });
    const pdf = await PDF.load(data, { lenient: true, credentials: credential });
    assertRuntimePageLimit(pdf, "protect-pdf", "Protect PDF");

    if (pdf.isEncrypted) {
      throw new PdfAdapterError(
        "PDF_ALREADY_PROTECTED",
        "This PDF is already password protected. Unlock it before assigning a new password.",
      );
    }

    pdf.setProtection({
      userPassword: credential,
      ownerPassword: credential,
      algorithm: "AES-256",
    });

    return pdf.save({ incremental: false });
  });
}

/** Rebuild a PDF with lenient parsing and a full, non-incremental save. */
export async function repairPdf(bytes, password) {
  return runPdfOperation("Repairing the PDF", async () => {
    const data = toPdfBytes(bytes);
    const credential = normalizePassword(password);
    const pdf = await loadPdf(data, credential, "repairing it");
    assertRuntimePageLimit(pdf, "repair-pdf", "Repair PDF");
    return pdf.save({ incremental: false });
  });
}

/** Fill existing AcroForm fields while keeping the resulting form editable. */
export async function fillPdfForm(bytes, values, password) {
  return runPdfOperation("Filling the PDF form", async () => {
    const data = toPdfBytes(bytes);
    const fieldValues = validateFormValues(values);
    const credential = normalizePassword(password);
    const pdf = await loadPdf(data, credential, "filling its form");

    if (pdf.isEncrypted && !pdf.hasOwnerAccess() && !pdf.getPermissions().fillForms) {
      throw new PdfAdapterError(
        "FORM_FILLING_NOT_ALLOWED",
        "This password opens the PDF but does not allow form filling. Try the owner password.",
      );
    }

    const form = pdf.getForm();

    if (!form || form.isEmpty) {
      throw new PdfAdapterError("PDF_HAS_NO_FORM", "This PDF does not contain any fillable form fields.");
    }

    const result = form.fill(fieldValues);

    if (result.skipped.length > 0) {
      throw new PdfAdapterError(
        "FORM_FIELDS_NOT_FOUND",
        `These form fields were not found: ${formatFieldNames(result.skipped)}.`,
      );
    }

    form.updateAppearances();
    return pdf.save({ incremental: false });
  });
}

/** Extract plain text from every page, separated by a blank line. */
export async function getPdfText(bytes, password) {
  return runPdfOperation("Extracting PDF text", async () => {
    const data = toPdfBytes(bytes);
    const credential = normalizePassword(password);
    const pdf = await loadPdf(data, credential, "extracting its text");
    return pdf
      .extractText()
      .map((page) => page.text ?? "")
      .join("\n\n");
  });
}
