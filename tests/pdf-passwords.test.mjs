// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { PDF, rgb } from "@libpdf/core";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { createUnlockedPdfFile, getPdfAccessMode, inspectPdfAccess } from "../src/lib/pdf-passwords.js";
import { protectGeneratedPdfResults } from "../src/lib/pdf-output-protection.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";

function namedPdf(bytes, name = "protected.pdf") {
  return new File([bytes], name, { type: "application/pdf", lastModified: 1 });
}

async function protectedPdf({ userPassword = "reader", ownerPassword = "owner", permissions = {}, pages = 1 } = {}) {
  const pdf = PDF.create();
  for (let index = 0; index < pages; index += 1) {
    const page = pdf.addPage({ size: "letter" });
    page.drawText(`Protected local document ${index + 1}`, { x: 54, y: 720, fontSize: 18, color: rgb(0, 0, 0) });
  }
  pdf.setProtection({
    userPassword,
    ownerPassword,
    algorithm: "AES-256",
    permissions,
  });
  return namedPdf(await pdf.save({ incremental: false }));
}

test("password access modes cover structural, render, text, repair, and explicit unlock tools", () => {
  assert.equal(getPdfAccessMode("split-pdf"), "modify");
  assert.equal(getPdfAccessMode("add-image-to-pdf"), "modify");
  assert.equal(getPdfAccessMode("compress-pdf"), "render");
  assert.equal(getPdfAccessMode("pdf-to-word"), "text");
  assert.equal(getPdfAccessMode("repair-pdf"), "repair");
  assert.equal(getPdfAccessMode("unlock-pdf"), null);
});

test("the gate distinguishes missing, wrong, reader-restricted, and owner passwords", async () => {
  const file = await protectedPdf({ permissions: { modify: false, print: true, copy: true } });

  assert.equal((await inspectPdfAccess(file, "modify")).status, "password-required");
  const wrong = await inspectPdfAccess(file, "modify", "not-the-password");
  assert.equal(wrong.status, "wrong-password");
  assert.doesNotMatch(wrong.message, /not-the-password/);

  const readerModify = await inspectPdfAccess(file, "modify", "reader");
  assert.equal(readerModify.status, "owner-required");
  assert.match(readerModify.message, /owner password/i);
  assert.equal((await inspectPdfAccess(file, "render", "reader")).status, "verified");
  assert.equal((await inspectPdfAccess(file, "text", "reader")).status, "verified");
  assert.equal((await inspectPdfAccess(file, "modify", "owner")).status, "verified");
});

test("render and text permission restrictions request the owner password only when needed", async () => {
  const file = await protectedPdf({ permissions: { modify: true, print: false, copy: false } });
  assert.equal((await inspectPdfAccess(file, "render", "reader")).status, "owner-required");
  assert.equal((await inspectPdfAccess(file, "text", "reader")).status, "owner-required");
  assert.equal((await inspectPdfAccess(file, "render", "owner")).status, "verified");
  assert.equal((await inspectPdfAccess(file, "text", "owner")).status, "verified");
});

test("structural tools use an unlocked memory-only copy and Split PDF succeeds", async () => {
  const original = await protectedPdf({ permissions: { modify: false } });
  const originalBytes = new Uint8Array(await original.arrayBuffer());
  const unlocked = await createUnlockedPdfFile(original, "owner");
  assert.equal(unlocked.name, original.name);
  assert.equal(unlocked.type, "application/pdf");
  assert.deepEqual(new Uint8Array(await original.arrayBuffer()), originalBytes);

  const readable = await PDFDocument.load(await unlocked.arrayBuffer());
  assert.equal(readable.getPageCount(), 1);
  const [result] = await processPdfTool("split-pdf", [unlocked], { mode: "every" });
  assert.equal(result.details, "1 page · 1");
});

test("representative render and text tools accept an authorized reader password", async () => {
  const file = await protectedPdf({ permissions: { print: true, copy: true } });
  assert.equal((await inspectPdfAccess(file, getPdfAccessMode("compress-pdf"), "reader")).status, "verified");
  assert.equal((await inspectPdfAccess(file, getPdfAccessMode("pdf-to-word"), "reader")).status, "verified");
});

test("a protected PDF with an empty reader password still surfaces owner restrictions", async () => {
  const file = await protectedPdf({ userPassword: "", permissions: { modify: false, print: true, copy: true } });
  assert.equal((await inspectPdfAccess(file, "modify")).status, "owner-required");
  assert.equal((await inspectPdfAccess(file, "render")).status, "verified");
});

test("Split PDF outputs are unlocked by default and every opted-in ZIP entry is protected", async () => {
  const original = await protectedPdf({ permissions: { modify: false }, pages: 2 });
  const unlocked = await createUnlockedPdfFile(original, "owner");

  const [plainArchive] = await processPdfTool("split-pdf", [unlocked], { mode: "every" });
  const plainZip = await JSZip.loadAsync(await plainArchive.blob.arrayBuffer());
  const plainEntries = Object.values(plainZip.files).filter((entry) => !entry.dir);
  assert.equal(plainEntries.length, 2);
  for (const entry of plainEntries) {
    const bytes = await entry.async("uint8array");
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
  }

  const [protectedArchive] = await processPdfTool("split-pdf", [unlocked], { mode: "every", outputPassword: "owner" });
  assert.match(protectedArchive.details, /contained PDFs are password-protected/);
  assert.doesNotMatch(JSON.stringify(protectedArchive), /"owner"/);
  const protectedZip = await JSZip.loadAsync(await protectedArchive.blob.arrayBuffer());
  const protectedEntries = Object.values(protectedZip.files).filter((entry) => !entry.dir);
  assert.equal(protectedEntries.length, 2);
  for (const entry of protectedEntries) {
    const bytes = await entry.async("uint8array");
    await assert.rejects(() => PDFDocument.load(bytes), /encrypted/i);
    assert.equal((await inspectPdfAccess(namedPdf(bytes, entry.name), "render", "owner")).status, "verified");
  }
});

test("Repair PDF removes input protection by default and can apply fresh output protection", async () => {
  const original = await protectedPdf({ permissions: { modify: false } });
  const [repaired] = await processPdfTool("repair-pdf", [original], { inputPassword: "owner" });
  const readable = await PDFDocument.load(await repaired.blob.arrayBuffer());
  assert.equal(readable.getPageCount(), 1);

  const [protectedResult] = await protectGeneratedPdfResults([repaired], "owner");
  const protectedBytes = await protectedResult.blob.arrayBuffer();
  await assert.rejects(() => PDFDocument.load(protectedBytes), /encrypted/i);
  assert.match(protectedResult.details, /password-protected locally/);
  assert.doesNotMatch(JSON.stringify(protectedResult), /"owner"/);

  const textResult = { id: "text", name: "notes.txt", type: "text/plain", blob: new Blob(["notes"], { type: "text/plain" }), size: 5, details: "Text" };
  const [unchanged] = await protectGeneratedPdfResults([textResult], "owner");
  assert.strictEqual(unchanged, textResult);
});

test("output protection turns a kept Compress PDF original into an explicit protected copy", async () => {
  const plainPdf = await PDFDocument.create();
  plainPdf.addPage([300, 400]);
  const original = new Blob([await plainPdf.save()], { type: "application/pdf" });
  const [protectedResult] = await protectGeneratedPdfResults([{
    id: "kept-original",
    name: "already-small.pdf",
    blob: original,
    size: original.size,
    type: "application/pdf",
    details: "Original kept because the trial output was larger",
    compressionOutcome: "original-kept",
    originalSize: original.size,
    attemptedSize: original.size + 500,
    noNewFile: true,
  }], "owner");
  assert.equal(protectedResult.name, "already-small-protected.pdf");
  assert.equal(protectedResult.compressionOutcome, "protected-original");
  assert.equal(protectedResult.passwordProtected, true);
  assert.equal(protectedResult.noNewFile, undefined);
  assert.equal(protectedResult.attemptedSize, original.size + 500);
});
