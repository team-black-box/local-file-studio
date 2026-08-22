// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { decodePDFRawStream, degrees, PDFContentStream, PDFDocument, PDFRawStream, PDFStream, StandardFonts } from "pdf-lib";
import {
  PDF_SIGNATURE_DEFAULTS,
  createPdfSignatureDrawOperations,
  createPdfSignatureLayout,
  createPdfSignaturePlan,
  createSigningDateIso,
  formatSigningDateLabel,
  getPdfSignaturePageGeometry,
} from "../src/lib/pdf-signature.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";
import { isPdfPreviewResult } from "../src/lib/file-utils.js";
import { getTextSettingLimit } from "../src/lib/file-limits.js";

function namedBlob(bytes, name, type = "application/pdf") {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

async function createTextPdf(pageCount = 3, finalRotation = 0, size = [360, 480]) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage(size);
    page.drawText(`SOURCE PAGE ${index + 1}`, { x: 24, y: page.getHeight() - 36, size: 11, font });
    if (index === pageCount - 1 && finalRotation) page.setRotation(degrees(finalRotation));
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

test("typed signature plans keep the final-page intent, local date, and central boundaries explicit", () => {
  const date = new Date(2026, 7, 23, 11, 30);
  const plan = createPdfSignaturePlan({
    ...PDF_SIGNATURE_DEFAULTS,
    name: "Aditya Shetty",
    x: 72.5,
    y: 64,
    fontSize: 30,
  }, 4, date);
  assert.equal(createSigningDateIso(date), "2026-08-23");
  assert.equal(formatSigningDateLabel("2026-08-23"), "Signed on 23 Aug 2026");
  assert.equal(plan.pageIndex, 3);
  assert.equal(plan.actionLabel, "Sign final page");
  assert.equal(plan.readyLabel, "Final page 4 · 30 pt · date included");

  const withoutDate = createPdfSignaturePlan({ ...PDF_SIGNATURE_DEFAULTS, includeDate: false }, 2, date);
  assert.equal(withoutDate.dateLabel, "");
  assert.equal(withoutDate.readyLabel, "Final page 2 · 24 pt · signature only");

  assert.equal(getTextSettingLimit("sign-pdf", "name"), 200);
  assert.equal(createPdfSignaturePlan({ name: "A".repeat(200) }, 1, date).name.length, 200);
  assert.throws(() => createPdfSignaturePlan({ name: "A".repeat(201) }, 1, date), /201 characters.*200/);
  assert.throws(() => createPdfSignaturePlan({ name: "  " }, 1, date), /Enter the typed signature/);
  assert.throws(() => createPdfSignaturePlan({ name: "Two\nlines" }, 1, date), /Use one line/);
  assert.throws(() => createPdfSignaturePlan({ x: -0.1 }, 1, date), /Horizontal position.*between 0 and 100/);
  assert.throws(() => createPdfSignaturePlan({ fontSize: 49 }, 1, date), /Signature size.*between 12 and 48/);
  assert.throws(() => createPdfSignaturePlan({ signingDate: "2026-02-30" }, 1, date), /valid YYYY-MM-DD/);
});

test("typed signature layout keeps the complete block inside safe page margins", () => {
  const plan = createPdfSignaturePlan({
    ...PDF_SIGNATURE_DEFAULTS,
    name: "Ada Lovelace",
    signingDate: "2026-08-23",
    x: 0,
    y: 100,
  }, 1);
  const layout = createPdfSignatureLayout(plan, 300, 400, (value) => value.length * 8, (value) => value.length * 4);
  assert.equal(layout.left, 18);
  assert.equal(layout.top, 338);
  assert.equal(layout.lineWidth, 150);
  assert.equal(layout.blockHeight, 44);
  assert.equal(layout.signatureBaselineFromTop, 362);
  assert.equal(layout.lineFromTop, 367);
  assert.equal(layout.dateBaselineFromTop, 382);

  const oversized = createPdfSignaturePlan({ ...PDF_SIGNATURE_DEFAULTS, name: "A wide signature" }, 1);
  assert.throws(
    () => createPdfSignatureLayout(oversized, 120, 180, () => 100, () => 60),
    /does not fit on the final page/,
  );
});

test("typed signature drawing maps the mark, line, and date across standard page rotations", () => {
  const layout = {
    left: 20,
    signatureBaselineFromTop: 40,
    lineFromTop: 45,
    dateBaselineFromTop: 60,
    lineWidth: 100,
  };
  const expected = {
    0: {
      signature: { x: 20, y: 360, rotation: 0 },
      line: { start: { x: 20, y: 355 }, end: { x: 120, y: 355 } },
      date: { x: 20, y: 340, rotation: 0 },
    },
    90: {
      signature: { x: 40, y: 20, rotation: 90 },
      line: { start: { x: 45, y: 20 }, end: { x: 45, y: 120 } },
      date: { x: 60, y: 20, rotation: 90 },
    },
    180: {
      signature: { x: 280, y: 40, rotation: 180 },
      line: { start: { x: 280, y: 45 }, end: { x: 180, y: 45 } },
      date: { x: 280, y: 60, rotation: 180 },
    },
    270: {
      signature: { x: 260, y: 380, rotation: 270 },
      line: { start: { x: 255, y: 380 }, end: { x: 255, y: 280 } },
      date: { x: 240, y: 380, rotation: 270 },
    },
  };
  for (const rotation of [0, 90, 180, 270]) {
    const geometry = getPdfSignaturePageGeometry(300, 400, rotation);
    assert.deepEqual(createPdfSignatureDrawOperations(layout, geometry, true), expected[rotation]);
  }
  assert.equal(createPdfSignatureDrawOperations(layout, getPdfSignaturePageGeometry(300, 400), false).date, null);
});

test("Sign PDF changes only the final page and reports the reviewed visual placement", async () => {
  const source = await createTextPdf(3, 90);
  const [result] = await processPdfTool("sign-pdf", [source], {
    name: "ADITYA SHETTY",
    includeDate: true,
    signingDate: "2026-08-23",
    x: 68,
    y: 72,
    fontSize: 22,
  });

  assert.equal(result.name, "source-sign-pdf.pdf");
  assert.equal(result.details, "Final page signed · 22 pt · date included");
  assert.equal(isPdfPreviewResult(result), true);
  assert.deepEqual(result.signatureOutcome, {
    pageCount: 3,
    pageNumber: 3,
    fontSize: 22,
    includeDate: true,
    signingDate: "2026-08-23",
    x: 68,
    y: 72,
  });

  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  const pages = output.getPages().map((page) => decodedPageContent(output, page));
  assert.doesNotMatch(pages[0], new RegExp(pdfHex("ADITYA SHETTY")));
  assert.doesNotMatch(pages[1], new RegExp(pdfHex("ADITYA SHETTY")));
  assert.match(pages[2], new RegExp(pdfHex("ADITYA SHETTY")));
  assert.match(pages[2], new RegExp(pdfHex("Signed on 23 Aug 2026")));
  pages.forEach((content, index) => assert.match(content, new RegExp(pdfHex(`SOURCE PAGE ${index + 1}`))));
  assert.deepEqual(output.getPages().map((page) => page.getRotation().angle), [0, 0, 90]);
});

test("Sign PDF omits the date only by explicit choice and rejects unsupported font text", async () => {
  const source = await createTextPdf(1);
  const [result] = await processPdfTool("sign-pdf", [source], {
    ...PDF_SIGNATURE_DEFAULTS,
    name: "Signature only",
    includeDate: false,
    signingDate: "2026-08-23",
  });
  assert.equal(result.signatureOutcome.includeDate, false);
  assert.equal(result.signatureOutcome.signingDate, null);
  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  const content = decodedPageContent(output, output.getPages()[0]);
  assert.match(content, new RegExp(pdfHex("Signature only")));
  assert.doesNotMatch(content, new RegExp(pdfHex("Signed on")));

  await assert.rejects(
    () => processPdfTool("sign-pdf", [source], { ...PDF_SIGNATURE_DEFAULTS, name: "₹ signature" }),
    /Typed signature contains text characters.*cannot preserve/,
  );
});
