// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  FileLimitError,
  assertPdfOverlayImageDimensions,
  describePdfOverlayImageLimits,
  describeToolLimits,
  getPdfOverlayImagePolicy,
  validatePdfOverlayImageSelection,
  validatePdfOverlayPlacements,
} from "../src/lib/file-limits.js";
import { preflightPdfOverlayImages } from "../src/lib/file-preflight.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";
import { destroyPdfJsDocument } from "../src/lib/pdfjs-utils.js";
import { hasNonFragmentSvgUrl, shouldRemoveSvgAttribute } from "../src/lib/image-processors.js";

const MiB = 1024 * 1024;
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

function namedBlob(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { value: name });
  return blob;
}

function editorTool() {
  return {
    slug: "add-image-to-pdf",
    name: "Add Image to PDF",
    kind: "pdf",
    accepts: [".pdf"],
    output: [".pdf"],
    settings: [],
  };
}

test("SVG URL guards preserve local fragments and remove remote resource variants", () => {
  for (const local of [
    "url(#gradient)",
    "url( '#filter' )",
    "fill: url(\"#pattern\")",
    "filter:url(#blur);mask:url(#mask)",
  ]) {
    assert.equal(hasNonFragmentSvgUrl(local), false, local);
    assert.equal(shouldRemoveSvgAttribute("fill", local, "path"), false, local);
  }

  for (const remote of [
    "url(https://example.invalid/track.svg#pixel)",
    "url('https://example.invalid/filter.svg#blur')",
    "url(//example.invalid/pattern.svg)",
    "url(data:image/svg+xml;base64,PHN2Zy8+)",
    "url(blob:https://example.invalid/resource-id)",
    "fill:url(#local);filter:url(https://example.invalid/filter.svg)",
    "url(https://example.invalid/unterminated",
  ]) {
    assert.equal(hasNonFragmentSvgUrl(remote), true, remote);
    assert.equal(shouldRemoveSvgAttribute("style", remote, "path"), true, remote);
  }

  assert.equal(shouldRemoveSvgAttribute("filter", "url(#blur)", "path"), false);
  assert.equal(shouldRemoveSvgAttribute("filter", "url(https://example.invalid/blur.svg#filter)", "path"), true);
  assert.equal(shouldRemoveSvgAttribute("xml:base", "https://example.invalid/base.svg", "svg"), true);
  assert.equal(shouldRemoveSvgAttribute("href", "#local-symbol", "use"), false);
  assert.equal(shouldRemoveSvgAttribute("href", "#embedded-raster", "image"), true);
  assert.equal(shouldRemoveSvgAttribute("href", "https://example.invalid/icon.svg", "use"), true);
  assert.equal(shouldRemoveSvgAttribute("onLoad", "fetch('https://example.invalid')", "svg"), true);
});

test("PDF.js cleanup supports the current loading-task API and older document API", async () => {
  let currentCalls = 0;
  let legacyCalls = 0;
  await destroyPdfJsDocument({ loadingTask: { destroy: async () => { currentCalls += 1; } } });
  await destroyPdfJsDocument({ destroy: async () => { legacyCalls += 1; } });
  await destroyPdfJsDocument(null);
  assert.equal(currentCalls, 1);
  assert.equal(legacyCalls, 1);
});

test("image placement exposes exact PDF, image, pixel, and placement limits in UI copy", () => {
  const tool = editorTool();
  const limits = getPdfOverlayImagePolicy(tool);
  assert.deepEqual({
    maxFiles: limits.maxFiles,
    maxFileBytes: limits.maxFileBytes,
    maxTotalBytes: limits.maxTotalBytes,
    maxImagePixelsPerFile: limits.maxImagePixelsPerFile,
    maxImagePixelsTotal: limits.maxImagePixelsTotal,
    maxImageEdge: limits.maxImageEdge,
    maxPlacements: limits.maxPlacements,
  }, {
    maxFiles: 10,
    maxFileBytes: 10 * MiB,
    maxTotalBytes: 30 * MiB,
    maxImagePixelsPerFile: 12_000_000,
    maxImagePixelsTotal: 40_000_000,
    maxImageEdge: 6000,
    maxPlacements: 100,
  });
  assert.match(describeToolLimits(tool).secondary, /200 pages\/file.*10 PNG\/JPG images.*100 placements max/s);
  assert.match(describePdfOverlayImageLimits(tool).primary, /10 PNG\/JPG images.*10 MB each.*30 MB combined/s);
  assert.match(describePdfOverlayImageLimits(tool).secondary, /12 MP.*6,000 px.*40 MP combined.*static images only.*100 placements/s);
});

test("placed-image selection accepts exact boundaries and rejects type, size, count, and combined overflow", () => {
  const tool = editorTool();
  const exact = Array.from({ length: 3 }, (_, index) => ({ name: `signature-${index}.png`, size: 10 * MiB }));
  assert.equal(validatePdfOverlayImageSelection(tool, [], exact).accepted.length, 3);
  assert.equal(validatePdfOverlayImageSelection(tool, [], [{ name: "signature.svg", size: 100 }]).rejected[0].code, "unsupported-type");
  assert.equal(validatePdfOverlayImageSelection(tool, [], [{ name: "large.jpg", size: 10 * MiB + 1 }]).rejected[0].code, "file-too-large");
  const eleven = Array.from({ length: 11 }, (_, index) => ({ name: `${index}.jpg`, size: MiB }));
  assert.equal(validatePdfOverlayImageSelection(tool, [], eleven).rejected[0].code, "too-many-files");
  assert.equal(validatePdfOverlayImageSelection(tool, [{ name: "used.png", size: 29 * MiB }], [{ name: "overflow.jpg", size: 2 * MiB }]).rejected[0].code, "total-too-large");
});

test("placed-image metadata and placement geometry fail closed at exact safeguards", async () => {
  const tool = editorTool();
  const image = namedBlob(onePixelPng, "signature.png", "image/png");
  const inspected = await preflightPdfOverlayImages(tool, [image]);
  assert.equal(inspected.metadata[0].format, "png");
  assert.equal(inspected.metadata[0].width, 1);
  assert.doesNotThrow(() => assertPdfOverlayImageDimensions(4000, 3000, tool, "signature.png"));
  assert.throws(() => assertPdfOverlayImageDimensions(4001, 3000, tool, "signature.png"), /12\.003 MP.*12 MP/s);

  const asset = { id: "signature" };
  const placement = { assetId: "signature", pageIndex: 0, x: 0.1, y: 0.2, width: 0.3, rotation: 30, opacity: 0.8 };
  assert.deepEqual(validatePdfOverlayPlacements([placement], [asset], 1, tool).placementCount, 1);
  assert.throws(() => validatePdfOverlayPlacements([{ ...placement, width: 0.95 }], [asset], 1, tool), /outside the supported page/s);
  assert.throws(() => validatePdfOverlayPlacements([{ ...placement, pageIndex: 1 }], [asset], 1, tool), /unavailable PDF page/s);
  assert.throws(() => validatePdfOverlayPlacements(Array.from({ length: 101 }, () => placement), [asset], 1, tool), /101 image placements.*100/s);

  const iend = onePixelPng.lastIndexOf(Buffer.from("IEND")) - 4;
  const animationChunk = Buffer.alloc(20);
  animationChunk.writeUInt32BE(8, 0);
  animationChunk.write("acTL", 4, "ascii");
  animationChunk.writeUInt32BE(2, 8);
  animationChunk.writeUInt32BE(0, 12);
  const animated = namedBlob(Buffer.concat([onePixelPng.subarray(0, iend), animationChunk, onePixelPng.subarray(iend)]), "animated.png", "image/png");
  await assert.rejects(() => preflightPdfOverlayImages(tool, [animated]), (error) => error instanceof FileLimitError && error.code === "animated-overlay-image");
});

test("PDF export embeds one reusable image at multiple bounded placements", async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([300, 400]);
  const pdfFile = namedBlob(await source.save(), "contract.pdf", "application/pdf");
  const imageFile = namedBlob(onePixelPng, "signature.png", "image/png");
  const asset = { id: "signature", sourceFile: imageFile, preparedBlob: null };
  const placements = [
    { id: "one", assetId: "signature", pageIndex: 0, x: 0.1, y: 0.2, width: 0.25, rotation: 0, opacity: 1 },
    { id: "two", assetId: "signature", pageIndex: 1, x: 0.55, y: 0.65, width: 0.2, rotation: -18, opacity: 0.75 },
  ];
  const [result] = await processPdfTool("add-image-to-pdf", [pdfFile], { overlayAssets: [asset], placements });
  assert.equal(result.type, "application/pdf");
  assert.match(result.name, /contract-with-images\.pdf/);
  assert.equal(result.details, "2 image placements");
  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(output.getPageCount(), 2);
  assert.ok(result.size > pdfFile.size);
});
