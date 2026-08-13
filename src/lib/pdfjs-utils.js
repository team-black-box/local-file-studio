// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

let pdfJsPromise;

export async function getPdfJsEngine() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return await pdfJsPromise;
}

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
