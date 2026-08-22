// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { decodePDFRawStream, degrees, PDFContentStream, PDFDocument, PDFRawStream, PDFStream, StandardFonts } from "pdf-lib";
import {
  PDF_TEXT_ANNOTATION_DEFAULTS,
  createPdfTextAnnotationDrawOperation,
  createPdfTextAnnotationLayout,
  createPdfTextAnnotationPlan,
  getPdfTextAnnotationPageGeometry,
} from "../src/lib/pdf-text-annotation.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";
import { isPdfPreviewResult } from "../src/lib/file-utils.js";
import { getTextSettingLimit } from "../src/lib/file-limits.js";

function namedBlob(bytes, name, type = "application/pdf") {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

async function createTextPdf(pageCount = 3, rotation = 0) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([300 + index * 10, 400 + index * 10]);
    page.drawText(`SOURCE PAGE ${index + 1}`, { x: 24, y: page.getHeight() - 36, size: 11, font });
    if (rotation) page.setRotation(degrees(rotation));
  }
  return namedBlob(await document.save(), "source.pdf");
}

function decodedPageContent(document, page) {
  const contents = page.node.normalizedEntries().Contents;
  const chunks = [];
  for (let index = 0; index < contents.size(); index += 1) {
    const stream = contents.lookup(index, PDFStream);
    if (stream instanceof PDFRawStream) chunks.push(decodePDFRawStream(stream).decode());
    else if (stream instanceof PDFContentStream) chunks.push(stream.getUnencodedContents());
    else throw new Error("Unexpected PDF content stream in test fixture.");
  }
  return chunks.map((chunk) => Buffer.from(chunk).toString("latin1")).join("\n");
}

function pdfHex(value) {
  return Buffer.from(value, "latin1").toString("hex").toUpperCase();
}

test("text annotation plans distinguish every-page and one-page intent without silently changing invalid input", () => {
  const everyPage = createPdfTextAnnotationPlan({
    ...PDF_TEXT_ANNOTATION_DEFAULTS,
    targetPage: 999,
  }, 3);
  assert.equal(everyPage.scope, "all");
  assert.deepEqual(everyPage.pageIndices, [0, 1, 2]);
  assert.equal(everyPage.actionLabel, "Add text to 3 pages");

  const onePage = createPdfTextAnnotationPlan({
    ...PDF_TEXT_ANNOTATION_DEFAULTS,
    scope: "single",
    targetPage: 2,
    x: 44.5,
    y: 67,
    fontSize: 24,
  }, 3);
  assert.deepEqual(onePage.pageIndices, [1]);
  assert.equal(onePage.scopeLabel, "Page 2");
  assert.equal(onePage.readyLabel, "Page 2 · 24 pt");

  assert.throws(() => createPdfTextAnnotationPlan({ scope: "unexpected" }, 3), /every page or one page/);
  assert.throws(() => createPdfTextAnnotationPlan({ scope: "single", targetPage: 1.5 }, 3), /whole page number/);
  assert.throws(() => createPdfTextAnnotationPlan({ scope: "single", targetPage: 4 }, 3), /from 1 to 3/);
  assert.throws(() => createPdfTextAnnotationPlan({ text: "   \n" }, 3), /Enter the text/);
  assert.throws(() => createPdfTextAnnotationPlan({ text: "A".repeat(501) }, 3), /501 characters.*500/);
  assert.throws(() => createPdfTextAnnotationPlan({ x: 100.1 }, 3), /Horizontal position.*between 0 and 100/);
  assert.throws(() => createPdfTextAnnotationPlan({ fontSize: 49 }, 3), /Text size.*between 10 and 48/);
});

test("text annotation layout wraps and clamps the full note inside safe page margins", () => {
  const plan = createPdfTextAnnotationPlan({
    ...PDF_TEXT_ANNOTATION_DEFAULTS,
    text: "Alpha beta gamma",
    x: 0,
    y: 100,
    fontSize: 10,
  }, 1);
  const layout = createPdfTextAnnotationLayout(plan, 100, 100, (value) => value.length * 6);
  assert.deepEqual(layout.lines, ["Alpha beta", "gamma"]);
  assert.equal(layout.left, 18);
  assert.equal(layout.top, 59.8);
  assert.equal(layout.blockWidth, 60);
  assert.equal(layout.blockHeight, 22.2);

  const oversized = createPdfTextAnnotationPlan({ ...PDF_TEXT_ANNOTATION_DEFAULTS, text: "W", fontSize: 48 }, 1);
  assert.throws(
    () => createPdfTextAnnotationLayout(oversized, 50, 100, () => 40),
    /does not fit on the page/,
  );
});

test("text annotation drawing maps visual top-left placement across standard PDF page rotations", () => {
  const layout = { lines: ["Note"], left: 20, top: 30, lineHeight: 14 };
  const expected = {
    0: { x: 20, y: 360, rotation: 0 },
    90: { x: 40, y: 20, rotation: 90 },
    180: { x: 280, y: 40, rotation: 180 },
    270: { x: 260, y: 380, rotation: 270 },
  };
  for (const rotation of [0, 90, 180, 270]) {
    const geometry = getPdfTextAnnotationPageGeometry(300, 400, rotation);
    assert.deepEqual(createPdfTextAnnotationDrawOperation(layout, geometry, 0, 10), expected[rotation]);
    assert.deepEqual(
      [geometry.visualWidth, geometry.visualHeight],
      rotation === 90 || rotation === 270 ? [400, 300] : [300, 400],
    );
  }
  assert.throws(() => getPdfTextAnnotationPageGeometry(300, 400, 45), /unsupported rotation/);
});

test("Edit PDF annotates only the chosen page and returns an exact previewable outcome", async () => {
  const source = await createTextPdf();
  const [result] = await processPdfTool("edit-pdf", [source], {
    text: "ONLY PAGE TWO",
    scope: "single",
    targetPage: 2,
    x: 75,
    y: 68,
    fontSize: 18,
  });

  assert.equal(result.name, "source-edit-pdf.pdf");
  assert.equal(result.details, "1 page annotated · 18 pt");
  assert.equal(isPdfPreviewResult(result), true);
  assert.deepEqual(result.textAnnotationOutcome, {
    scope: "single",
    targetPage: 2,
    affectedPageCount: 1,
    pageCount: 3,
    fontSize: 18,
    x: 75,
    y: 68,
  });

  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  const pages = output.getPages().map((page) => decodedPageContent(output, page));
  assert.doesNotMatch(pages[0], new RegExp(pdfHex("ONLY PAGE TWO")));
  assert.match(pages[1], new RegExp(pdfHex("ONLY PAGE TWO")));
  assert.doesNotMatch(pages[2], new RegExp(pdfHex("ONLY PAGE TWO")));
  pages.forEach((content, index) => assert.match(content, new RegExp(pdfHex(`SOURCE PAGE ${index + 1}`))));
});

test("Edit PDF uses the catalog's central 500-character gate and handles rotated every-page output", async () => {
  const source = await createTextPdf(2, 90);
  const options = {
    ...PDF_TEXT_ANNOTATION_DEFAULTS,
    text: "A".repeat(500),
    fontSize: 10,
  };
  assert.equal(getTextSettingLimit("edit-pdf", "text"), 500);
  const [result] = await processPdfTool("edit-pdf", [source], options);
  assert.equal(result.details, "2 pages annotated · 10 pt");
  assert.equal(result.textAnnotationOutcome.affectedPageCount, 2);
  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.deepEqual(output.getPages().map((page) => page.getRotation().angle), [90, 90]);

  await assert.rejects(
    () => processPdfTool("edit-pdf", [source], { ...options, text: "A".repeat(501) }),
    /501 characters.*500/,
  );
});
