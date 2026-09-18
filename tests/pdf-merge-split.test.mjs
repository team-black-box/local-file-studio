// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { createPdfMergePlan } from "../src/lib/pdf-merge.js";
import { createSplitPdfGroups } from "../src/lib/file-utils.js";
import { getToolLimits } from "../src/lib/file-limits.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";

async function fixture(widths, name = "scan.pdf") {
  const document = await PDFDocument.create();
  for (const width of widths) document.addPage([width, 500]);
  return new File([await document.save()], name, { type: "application/pdf" });
}

async function outputWidths(result) {
  const document = await PDFDocument.load(await result.blob.arrayBuffer());
  return document.getPages().map((page) => page.getWidth());
}

test("front/back preview uses the exact complete page order and preserves source roles", () => {
  const plan = createPdfMergePlan([3, 3], ["front.pdf", "back.pdf"], "merge-pdf", { mode: "interleave" });
  assert.deepEqual(plan.pageOrder.map(({ fileIndex, pageIndex }) => [fileIndex, pageIndex]), [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]);
  assert.deepEqual(plan.pageOrder.map(({ outputPage }) => outputPage), [1, 2, 3, 4, 5, 6]);
  assert.equal(plan.entries[0].role, "Front scan");
  assert.equal(plan.entries[1].rangeLabel, "Even pages");
  const reversed = createPdfMergePlan([3, 3], [], "merge-pdf", { mode: "interleave", reverseBacks: true });
  assert.deepEqual(reversed.pageOrder.filter(({ fileIndex }) => fileIndex === 1).map(({ pageIndex }) => pageIndex), [2, 1, 0]);
});

test("front/back validation rejects missing, surplus, unequal, malformed, and over-limit inputs", () => {
  for (const counts of [[], [2], [2, 2, 2]]) {
    assert.throws(() => createPdfMergePlan(counts, [], "merge-pdf", { mode: "interleave" }), { code: "interleave-file-count" });
  }
  assert.throws(() => createPdfMergePlan([3, 2], [], "merge-pdf", { mode: "interleave" }), { code: "interleave-page-count" });
  assert.throws(() => createPdfMergePlan([0, 0], [], "merge-pdf", { mode: "interleave" }), { code: "invalid-page-count" });
  assert.throws(() => createPdfMergePlan([1, 1], [], "merge-pdf", { mode: "other" }), { code: "invalid-merge-mode" });
  const limits = getToolLimits("merge-pdf");
  assert.throws(() => createPdfMergePlan([limits.maxPdfPagesPerFile + 1, 1], [], limits, { mode: "interleave" }), { code: "too-many-pages" });
  const half = limits.maxPdfPagesTotal / 2;
  assert.equal(createPdfMergePlan([half, half], [], limits, { mode: "interleave" }).pageOrder.length, limits.maxPdfPagesTotal);
  assert.throws(() => createPdfMergePlan([half + 1, half + 1], [], limits, { mode: "interleave" }), { code: "too-many-total-pages" });
});

test("actual PDF exports interleave forward/reversed backs and preserve the default merge order", async () => {
  const front = await fixture([101, 103, 105], "front.pdf");
  const back = await fixture([102, 104, 106], "back.pdf");
  const forward = await processPdfTool("merge-pdf", [front, back], { mode: "interleave" });
  assert.deepEqual(await outputWidths(forward[0]), [101, 102, 103, 104, 105, 106]);
  assert.equal(forward[0].mergeOutcome.mode, "interleave");
  const reversedBack = await fixture([106, 104, 102], "back-reversed.pdf");
  const reversed = await processPdfTool("merge-pdf", [front, reversedBack], { mode: "interleave", reverseBacks: true });
  assert.deepEqual(await outputWidths(reversed[0]), [101, 102, 103, 104, 105, 106]);
  const sequential = await processPdfTool("merge-pdf", [front, back]);
  assert.deepEqual(await outputWidths(sequential[0]), [101, 103, 105, 102, 104, 106]);
  const swapped = await processPdfTool("merge-pdf", [back, front], { mode: "interleave" });
  assert.deepEqual(await outputWidths(swapped[0]), [102, 101, 104, 103, 106, 105]);
});

test("merge fails without results on unequal or malformed PDFs and responds to cancellation", async () => {
  const front = await fixture([101, 103]);
  const shortBack = await fixture([102]);
  await assert.rejects(processPdfTool("merge-pdf", [front, shortBack], { mode: "interleave" }), { code: "interleave-page-count" });
  await assert.rejects(processPdfTool("merge-pdf", [front, new File(["not a pdf"], "bad.pdf")], { mode: "interleave" }));
  const controller = new AbortController();
  await assert.rejects(processPdfTool("merge-pdf", [front, front], { mode: "interleave", signal: controller.signal }, () => controller.abort()), { name: "AbortError" });
  await assert.rejects(processPdfTool("merge-pdf", [front, front], { signal: controller.signal }), { name: "AbortError" });
});

test("every-page split emits one correctly ordered named PDF for every source page", async () => {
  assert.deepEqual(createSplitPdfGroups("every-page", 3), [[0], [1], [2]]);
  const source = await fixture([201, 202, 203], "report.pdf");
  const results = await processPdfTool("split-pdf", [source], { mode: "every-page" });
  assert.equal(results.length, 1);
  assert.equal(results[0].type, "application/zip");
  const zip = await JSZip.loadAsync(await results[0].blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files), ["report-page-1.pdf", "report-page-2.pdf", "report-page-3.pdf"]);
  for (let index = 1; index <= 3; index += 1) {
    const document = await PDFDocument.load(await zip.file(`report-page-${index}.pdf`).async("uint8array"));
    assert.equal(document.getPageCount(), 1);
    assert.equal(document.getPage(0).getWidth(), 200 + index);
  }
  const single = await processPdfTool("split-pdf", [await fixture([201])], { mode: "every-page" });
  assert.equal(single[0].type, "application/pdf");
  assert.deepEqual(await outputWidths(single[0]), [201]);
});

test("every-page split accepts its output-count boundary and rejects overflow before copies", async () => {
  const limit = getToolLimits("split-pdf").maxGeneratedItems;
  const exact = await fixture(Array.from({ length: limit }, (_, index) => 100 + index));
  const results = await processPdfTool("split-pdf", [exact], { mode: "every-page" });
  const zip = await JSZip.loadAsync(await results[0].blob.arrayBuffer());
  assert.equal(Object.keys(zip.files).length, limit);
  const overflow = await fixture(Array.from({ length: limit + 1 }, () => 100));
  let reported = false;
  await assert.rejects(processPdfTool("split-pdf", [overflow], { mode: "every-page" }, () => { reported = true; }), /files|outputs|results/i);
  assert.equal(reported, false);
  const controller = new AbortController();
  await assert.rejects(processPdfTool("split-pdf", [exact], { mode: "every-page", signal: controller.signal }, () => controller.abort()), { name: "AbortError" });
});
