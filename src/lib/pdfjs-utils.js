// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

export async function destroyPdfJsDocument(document) {
  if (!document) return;
  if (typeof document.destroy === "function") {
    await document.destroy();
    return;
  }
  if (typeof document.loadingTask?.destroy === "function") {
    await document.loadingTask.destroy();
  }
}
