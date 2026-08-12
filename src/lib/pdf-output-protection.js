// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { resultFromBlob } from "./file-utils.js";
import { protectPdf } from "./libpdf.js";

export async function protectGeneratedPdfResults(results, password) {
  if (!password) return results;
  return await Promise.all(results.map(async (result) => {
    if (result?.type !== "application/pdf" || result.passwordProtected) return result;
    const bytes = await protectPdf(new Uint8Array(await result.blob.arrayBuffer()), password);
    return {
      ...resultFromBlob(
        result.name,
        new Blob([bytes], { type: "application/pdf" }),
        `${result.details} · password-protected locally`,
      ),
      passwordProtected: true,
    };
  }));
}
