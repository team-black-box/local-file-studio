// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError } from "./file-limits.js";
import { createMergePdfPlan } from "./file-utils.js";

// The same bounded page order drives the preview and the exported document.
export function createPdfMergePlan(pageCounts, fileNames = [], limits = "merge-pdf", options = {}) {
  const mode = options.mode || "sequential";
  if (!["sequential", "interleave"].includes(mode)) {
    throw new FileLimitError("invalid-merge-mode", "Choose PDFs in order or Front/back scans.");
  }
  const plan = createMergePdfPlan(pageCounts, fileNames, limits);
  if (mode === "sequential") return { ...plan, mode };
  if (plan.fileCount !== 2) {
    throw new FileLimitError("interleave-file-count", "Front/back scans needs exactly two PDFs. Put the front scan first and the back scan second.");
  }
  if (pageCounts[0] !== pageCounts[1]) {
    throw new FileLimitError("interleave-page-count", `The front scan has ${pageCounts[0]} pages and the back scan has ${pageCounts[1]}. Use scans with equal page counts, including blank backs, so every front has its matching back. No pages have been merged.`);
  }
  const count = pageCounts[0];
  const reverseBacks = options.reverseBacks === true;
  const pageOrder = Array.from({ length: count }, (_, index) => [
    { fileIndex: 0, pageIndex: index, outputPage: index * 2 + 1 },
    { fileIndex: 1, pageIndex: reverseBacks ? count - index - 1 : index, outputPage: index * 2 + 2 },
  ]).flat();
  return {
    ...plan,
    mode,
    reverseBacks,
    pageOrder,
    entries: plan.entries.map((entry, index) => ({
      ...entry,
      role: index === 0 ? "Front scan" : "Back scan",
      rangeLabel: index === 0 ? "Odd pages" : "Even pages",
    })),
    actionLabel: `Interleave scans · ${plan.totalPages.toLocaleString()} pages`,
    readyLabel: `Front + back · ${plan.totalPages.toLocaleString()} pages ready`,
  };
}
