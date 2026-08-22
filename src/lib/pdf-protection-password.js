// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, MAX_PDF_PASSWORD_CHARACTERS } from "./file-limits.js";

export const PDF_PROTECTION_PASSWORD_GUIDES = Object.freeze([
  Object.freeze({ id: "short", label: "Short", minimumLength: 1, level: 1, hint: "A longer unique password is safer." }),
  Object.freeze({ id: "good", label: "Good length", minimumLength: 8, level: 2, hint: "Keep it unique and store it somewhere safe." }),
  Object.freeze({ id: "long", label: "Long passphrase", minimumLength: 14, level: 3, hint: "Length helps, but this is not a security guarantee." }),
]);

export function getPdfProtectionPasswordGuide(password) {
  const length = String(password ?? "").length;
  if (!length) return Object.freeze({ id: "empty", label: "Not entered", minimumLength: 0, level: 0, hint: "Use a unique password or passphrase." });
  return PDF_PROTECTION_PASSWORD_GUIDES.reduce(
    (selected, guide) => length >= guide.minimumLength ? guide : selected,
    PDF_PROTECTION_PASSWORD_GUIDES[0],
  );
}

export function createPdfProtectionPasswordPlan(options = {}) {
  const password = String(options.password ?? "");
  const confirmation = String(options.passwordConfirm ?? "");
  const passwordTooLong = password.length > MAX_PDF_PASSWORD_CHARACTERS;
  const confirmationTooLong = confirmation.length > MAX_PDF_PASSWORD_CHARACTERS;
  const matches = Boolean(password) && password === confirmation;
  const guide = getPdfProtectionPasswordGuide(password);

  let code = "ready";
  let message = `Passwords match. Save this password before downloading—the finished PDF cannot recover it for you.`;
  if (!password) {
    code = "missing-password";
    message = "Create a password only you and the recipient know.";
  } else if (passwordTooLong) {
    code = "password-too-long";
    message = `New password contains ${password.length.toLocaleString()} characters; Protect PDF supports ${MAX_PDF_PASSWORD_CHARACTERS.toLocaleString()}. Shorten it and try again.`;
  } else if (!confirmation) {
    code = "missing-confirmation";
    message = "Type the new password again to catch accidental mistakes.";
  } else if (confirmationTooLong) {
    code = "confirmation-too-long";
    message = `Password confirmation contains ${confirmation.length.toLocaleString()} characters; Protect PDF supports ${MAX_PDF_PASSWORD_CHARACTERS.toLocaleString()}. Shorten it and try again.`;
  } else if (!matches) {
    code = "password-mismatch";
    message = "The two passwords do not match. Re-enter the confirmation before protecting the PDF.";
  }

  return Object.freeze({
    password,
    confirmation,
    passwordLength: password.length,
    confirmationLength: confirmation.length,
    matches,
    guide,
    valid: code === "ready",
    code,
    message,
    actionLabel: "Protect with AES-256",
  });
}

export function assertPdfProtectionPasswordPlan(options = {}) {
  const plan = createPdfProtectionPasswordPlan(options);
  if (plan.valid) return plan;
  throw new FileLimitError(`protect-pdf-${plan.code}`, plan.message);
}
