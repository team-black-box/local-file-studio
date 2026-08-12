// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { LockKeyIcon, ShieldCheckIcon, SpinnerGapIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { MAX_PDF_PASSWORD_CHARACTERS } from "./lib/file-limits.js";

export function PdfOutputProtectionControl({ control, compact = false }) {
  if (!control?.visible) return null;
  const descriptionId = `pdf-output-protection-${compact ? "compact" : "gate"}`;
  return (
    <div className={`pdf-output-protection ${compact ? "compact" : ""} ${control.disabled ? "disabled" : ""}`}>
      <label>
        <input
          type="checkbox"
          checked={control.checked}
          disabled={control.disabled}
          aria-describedby={descriptionId}
          onChange={(event) => control.onChange(event.target.checked)}
        />
        <span><strong>Keep output files password-protected</strong><small>Default: output PDFs are unlocked.</small></span>
      </label>
      <p id={descriptionId}>{control.message}{control.multiple && control.supported ? " For multi-PDF jobs, the first non-empty password you verify is used for every generated PDF." : ""}</p>
    </div>
  );
}

export function PdfPasswordGate({ entry, password, onPasswordChange, onVerify, verifying, outputProtection }) {
  if (!entry) return null;
  const checking = entry.status === "checking" || verifying;
  const unsupported = entry.status === "unsupported";
  const ownerRequired = entry.status === "owner-required";
  const wrong = entry.status === "wrong-password";
  const inputId = `pdf-password-${entry.file?.name?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "file"}`;

  return (
    <section className={`pdf-password-gate ${wrong || ownerRequired || unsupported ? "has-error" : ""}`} aria-labelledby={`${inputId}-title`}>
      <span className="pdf-password-icon" aria-hidden="true">
        {unsupported ? <WarningCircleIcon size={22} weight="fill" /> : <LockKeyIcon size={22} weight="duotone" />}
      </span>
      <div className="pdf-password-copy">
        <h3 id={`${inputId}-title`}>{checking ? "Checking PDF protection" : ownerRequired ? "Owner password needed" : unsupported ? "Protection is not supported" : "Password protected PDF"}</h3>
        <p role={wrong || ownerRequired || unsupported ? "alert" : undefined}>{entry.message}</p>
        {ownerRequired && <small>A reader password can open a PDF while still blocking changes, printing, or text copying. The owner password grants the permission this tool needs.</small>}
        {!unsupported && !checking && (
          <form onSubmit={(event) => { event.preventDefault(); onVerify(); }}>
            <label htmlFor={inputId}>PDF password</label>
            <div className="pdf-password-controls">
              <input
                id={inputId}
                type="password"
                value={password}
                maxLength={MAX_PDF_PASSWORD_CHARACTERS}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck="false"
                onChange={(event) => onPasswordChange(event.target.value)}
              />
              <button type="submit" disabled={!password || verifying}>Verify and continue</button>
            </div>
          </form>
        )}
        <PdfOutputProtectionControl control={outputProtection} />
        <span className="pdf-password-local-note"><ShieldCheckIcon size={14} weight="fill" aria-hidden="true" />Used only in this tab, never saved or sent anywhere.</span>
      </div>
      {checking && <SpinnerGapIcon className="spin" size={21} aria-label="Checking" />}
    </section>
  );
}
