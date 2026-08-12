// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { baseName, resultFromBlob, safeFileName } from "./file-utils.js";
import { protectPdf } from "./libpdf.js";

export async function protectGeneratedPdfResults(results, password) {
  if (!password) return results;
  return await Promise.all(results.map(async (result) => {
    if (result?.type !== "application/pdf" || result.passwordProtected) return result;
    const bytes = await protectPdf(new Uint8Array(await result.blob.arrayBuffer()), password);
    const originalWasKept = result.compressionOutcome === "original-kept";
    return {
      ...resultFromBlob(
        originalWasKept ? `${safeFileName(baseName(result.name))}-protected.pdf` : result.name,
        new Blob([bytes], { type: "application/pdf" }),
        originalWasKept ? "Original content kept and password-protected locally" : `${result.details} · password-protected locally`,
      ),
      passwordProtected: true,
      ...(originalWasKept ? {
        compressionOutcome: "protected-original",
        originalSize: result.originalSize,
        attemptedSize: result.attemptedSize,
      } : {}),
    };
  }));
}
