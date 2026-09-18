// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useId } from "react";
import { MAX_OUTPUT_NAME_CHARACTERS } from "./lib/file-limits.js";
import { suggestOutputBaseName, validateOutputName } from "./lib/output-names.js";

export function OutputNameControl({ tool, files, options = {}, value = "", onChange, disabled = false }) {
  const id = useId();
  let error = "";
  try { validateOutputName(value); } catch (caught) { error = caught.message; }
  return (
    <div className="output-name-control">
      <label htmlFor={id}>Output file name <span>(optional)</span></label>
      <input id={id} type="text" value={value} maxLength={MAX_OUTPUT_NAME_CHARACTERS}
        placeholder={suggestOutputBaseName(tool, files, options)} disabled={disabled}
        onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} autoComplete="off" spellCheck="false" />
      <small id={`${id}-hint`}>Leave blank to name it automatically. The correct extension is added. Multiple files keep page labels or receive numbers.</small>
      {error && <small id={`${id}-error`} role="alert">{error}</small>}
    </div>
  );
}
