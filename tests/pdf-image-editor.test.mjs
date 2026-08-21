// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
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
import { createOcrReaderResult, createPdfOfficeTextPreview, createPdfSpreadsheetPlan, createTextReaderResult, extractiveSummary, processPdfTool } from "../src/lib/pdf-processors.js";
import { destroyPdfJsDocument } from "../src/lib/pdfjs-utils.js";
import { createImageCompressionOutcome, hasNonFragmentSvgUrl, shouldRemoveSvgAttribute } from "../src/lib/image-processors.js";
import { applyBackgroundRemovalPixels, createBackgroundRemovalOutcome, inspectBackgroundCorners } from "../src/lib/background-removal.js";
import { IMAGE_WATERMARK_ANGLES, IMAGE_WATERMARK_COLORS, IMAGE_WATERMARK_POSITIONS, createImageWatermarkOutcome, drawImageWatermark, getImageWatermarkPlan } from "../src/lib/image-watermark.js";
import { IMAGE_MEME_CASES, IMAGE_MEME_MAX_LINES, createImageMemeOutcome, drawImageMeme, getImageMemePlan, wrapImageMemeCaption } from "../src/lib/image-meme.js";
import { IMAGE_ROTATIONS, createImageRotationOutcome, getImageRotation, getImageRotationPlan } from "../src/lib/image-rotation.js";
import { FACE_BLUR_DEFAULT_FOCUS, FACE_BLUR_STRENGTHS, createFaceBlurOutcome, createFaceBlurPlan, drawFaceBlur, validateFaceBlurPlan } from "../src/lib/face-blur.js";
import { HTML_IMAGE_FORMATS, HTML_IMAGE_VIEWPORTS, createHtmlImageOutcome, createHtmlImagePlan, getHtmlImageFormat, getHtmlImageViewport, hasNonFragmentHtmlImageUrl, shouldRemoveHtmlImageAttribute } from "../src/lib/html-image.js";
import { PDF_TO_JPG_RENDER_SCALE, assertPdfPreviewResult, buildOcrCopyText, compressionEstimateAllowsProcessing, createPdfJpgOutputPlan, getCompressionSizeChange, getPdfCompressionPreset, isPdfPreviewResult, parseMarkdownPreview, parseRemovalPageSelection, projectPdfCompressionSize } from "../src/lib/file-utils.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

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

test("compression size summaries report reductions without hiding larger outputs", () => {
  assert.deepEqual(getCompressionSizeChange(1000, 600), {
    inputBytes: 1000,
    outputBytes: 600,
    bytesSaved: 400,
    percent: 40,
    status: "reduced",
  });
  assert.equal(getCompressionSizeChange(1000, 1000).status, "unchanged");
  assert.equal(getCompressionSizeChange(1000, 1200).status, "increased");
  assert.equal(getCompressionSizeChange(0, 0), null);
  assert.deepEqual(getPdfCompressionPreset("strong"), { quality: 48, scale: 0.95 });
  assert.deepEqual(getPdfCompressionPreset("unknown"), { quality: 68, scale: 1.2 });
  const estimate = projectPdfCompressionSize(1_000_000, 10, [40_000, 50_000, 60_000]);
  assert.equal(estimate.projectedBytes, 516_096);
  assert.equal(estimate.status, "reduced");
  assert.equal(estimate.sampledPages, 3);
  assert.ok(estimate.lowerBytes < estimate.projectedBytes);
  assert.ok(estimate.upperBytes > estimate.projectedBytes);
  assert.equal(projectPdfCompressionSize(0, 10, [50_000]), null);
  assert.equal(compressionEstimateAllowsProcessing({ state: "ready", status: "reduced" }), true);
  assert.equal(compressionEstimateAllowsProcessing({ state: "ready", status: "increased" }), false);
  assert.equal(compressionEstimateAllowsProcessing({ state: "ready", status: "unchanged" }), false);
  assert.equal(compressionEstimateAllowsProcessing({ state: "loading" }), false);
  assert.equal(compressionEstimateAllowsProcessing({ state: "error" }), true);
});

test("image compression outcomes distinguish lossy quality from lossless PNG re-encoding", () => {
  assert.deepEqual(createImageCompressionOutcome(1_000, 600, 1200, 800, "jpg", 82), {
    inputBytes: 1_000,
    outputBytes: 600,
    bytesSaved: 400,
    percent: 40,
    status: "reduced",
    width: 1200,
    height: 800,
    format: "jpg",
    quality: 82,
    qualityApplies: true,
  });
  assert.equal(createImageCompressionOutcome(1_000, 1_200, 1200, 800, "png", 20).status, "increased");
  assert.equal(createImageCompressionOutcome(1_000, 1_200, 1200, 800, "png", 20).qualityApplies, false);
  assert.throws(
    () => createImageCompressionOutcome(0, 0, 0, 800, "gif", Number.NaN),
    (error) => error instanceof FileLimitError && error.code === "invalid-image-compression-outcome",
  );
});

function backgroundRemovalFixture(center = [230, 230, 230, 255]) {
  const pixels = new Uint8ClampedArray(3 * 3 * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set([255, 255, 255, 255], index);
  pixels.set(center, 4 * 4);
  return pixels;
}

test("background cleanup choices share one deterministic corner-sampling algorithm", () => {
  const light = backgroundRemovalFixture();
  const balanced = backgroundRemovalFixture();
  const strong = backgroundRemovalFixture();
  const lightStats = applyBackgroundRemovalPixels(light, 3, 3, "light", "transparent");
  const balancedStats = applyBackgroundRemovalPixels(balanced, 3, 3, "balanced", "transparent");
  const strongStats = applyBackgroundRemovalPixels(strong, 3, 3, "strong", "transparent");

  assert.deepEqual(inspectBackgroundCorners(backgroundRemovalFixture(), 3, 3), {
    color: [255, 255, 255],
    colorHex: "#ffffff",
    spread: 0,
  });
  assert.equal(lightStats.tolerance, 38);
  assert.equal(balancedStats.tolerance, 54);
  assert.equal(strongStats.tolerance, 72);
  assert.ok(light[19] > balanced[19], "Balanced removes more of the near-background center pixel than Light");
  assert.ok(balanced[19] > strong[19], "Strong removes more of the near-background center pixel than Balanced");
  assert.ok(lightStats.removedPercent < balancedStats.removedPercent);
  assert.ok(balancedStats.removedPercent < strongStats.removedPercent);
});

test("background removal preserves source transparency and flattens only when requested", () => {
  const transparent = backgroundRemovalFixture([0, 0, 0, 100]);
  const transparentStats = applyBackgroundRemovalPixels(transparent, 3, 3, "balanced", "transparent");
  assert.equal(transparent[19], 100, "existing subject transparency is never increased");
  assert.equal(transparent[3], 0, "matching white corners become transparent");
  assert.equal(transparentStats.detectedColor, "#ffffff");

  const white = backgroundRemovalFixture([0, 0, 0, 255]);
  const whiteStats = applyBackgroundRemovalPixels(white, 3, 3, "balanced", "white");
  assert.deepEqual([...white.slice(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual([...white.slice(16, 20)], [0, 0, 0, 255]);
  assert.equal(whiteStats.background, "white");

  const black = backgroundRemovalFixture([0, 0, 0, 255]);
  applyBackgroundRemovalPixels(black, 3, 3, "balanced", "black");
  assert.deepEqual([...black.slice(0, 4)], [0, 0, 0, 255]);
});

test("background removal reports mixed corners and rejects invalid contracts", () => {
  const mixed = new Uint8ClampedArray([
    255, 255, 255, 255, 0, 0, 0, 255,
    255, 0, 0, 255, 0, 255, 0, 255,
  ]);
  const inspection = inspectBackgroundCorners(mixed, 2, 2);
  assert.equal(inspection.colorHex, "#808040");
  assert.ok(inspection.spread > 300);

  assert.deepEqual(createBackgroundRemovalOutcome({
    cleanup: "balanced",
    tolerance: 54,
    background: "transparent",
    detectedColor: "#ffffff",
    cornerSpread: 0,
    removedPercent: 80,
    softenedPercent: 10,
  }, 1200, 800, 42_000), {
    cleanup: "balanced",
    tolerance: 54,
    background: "transparent",
    detectedColor: "#ffffff",
    cornerSpread: 0,
    removedPercent: 80,
    softenedPercent: 10,
    width: 1200,
    height: 800,
    outputBytes: 42_000,
  });
  assert.throws(() => applyBackgroundRemovalPixels(backgroundRemovalFixture(), 3, 3, "medium", "transparent"), (error) => error instanceof FileLimitError && error.code === "invalid-background-cleanup");
  assert.throws(() => applyBackgroundRemovalPixels(backgroundRemovalFixture(), 3, 3, "balanced", "blue"), (error) => error instanceof FileLimitError && error.code === "invalid-background-output");
  assert.throws(() => inspectBackgroundCorners(new Uint8ClampedArray(4), 2, 2), (error) => error instanceof FileLimitError && error.code === "invalid-background-pixels");
  assert.throws(
    () => createBackgroundRemovalOutcome({ cleanup: "balanced", tolerance: 72, background: "transparent", detectedColor: "white", cornerSpread: -1, removedPercent: 101, softenedPercent: 0 }, 2, 2, 100),
    (error) => error instanceof FileLimitError && error.code === "invalid-background-outcome",
  );
});

test("image watermark plans exact placement, direction, contrast, and opacity", () => {
  const bottomRight = getImageWatermarkPlan(1200, 800, {
    text: "  © Studio  ",
    position: "bottom-right",
    opacity: 45,
    angle: -24,
    color: "#ffffff",
  });
  assert.deepEqual({
    width: bottomRight.width,
    height: bottomRight.height,
    text: bottomRight.text,
    textLength: bottomRight.textLength,
    position: bottomRight.position,
    opacity: bottomRight.opacity,
    angle: bottomRight.angle,
    color: bottomRight.color,
    fontSize: bottomRight.fontSize,
    x: bottomRight.x,
    y: bottomRight.y,
    textAlign: bottomRight.textAlign,
    textBaseline: bottomRight.textBaseline,
    maxWidth: bottomRight.maxWidth,
    shadowColor: bottomRight.shadowColor,
  }, {
    width: 1200,
    height: 800,
    text: "© Studio",
    textLength: 8,
    position: "bottom-right",
    opacity: 45,
    angle: -24,
    color: "#ffffff",
    fontSize: 48,
    x: 1200 - (48 * 0.7),
    y: 800 - (48 * 0.7),
    textAlign: "right",
    textBaseline: "bottom",
    maxWidth: 1032,
    shadowColor: "rgba(0,0,0,.72)",
  });

  const center = getImageWatermarkPlan(400, 300, {
    text: "Proof",
    position: "center",
    angle: 0,
    color: "#14201d",
  });
  assert.deepEqual({ x: center.x, y: center.y, opacity: center.opacity, textAlign: center.textAlign, textBaseline: center.textBaseline, shadowColor: center.shadowColor }, {
    x: 200,
    y: 150,
    opacity: 45,
    textAlign: "center",
    textBaseline: "middle",
    shadowColor: "rgba(255,255,255,.78)",
  });
});

test("image watermark drawing and result reporting use the validated plan", () => {
  const plan = getImageWatermarkPlan(600, 400, { text: "Local", position: "top-left", opacity: 70, angle: 24, color: "#14201d" });
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    translate: (...values) => calls.push(["translate", ...values]),
    rotate: (value) => calls.push(["rotate", value]),
    fillText: (...values) => calls.push(["fillText", ...values]),
    restore: () => calls.push("restore"),
  };
  drawImageWatermark(context, plan);
  assert.equal(context.globalAlpha, 0.7);
  assert.equal(context.textAlign, "left");
  assert.equal(context.textBaseline, "top");
  assert.equal(context.fillStyle, "#14201d");
  assert.deepEqual(calls[0], "save");
  assert.deepEqual(calls[1], ["translate", plan.x, plan.y]);
  assert.equal(calls[2][0], "rotate");
  assert.deepEqual(calls[3], ["fillText", "Local", 0, 0, plan.maxWidth]);
  assert.deepEqual(calls[4], "restore");

  assert.deepEqual(createImageWatermarkOutcome(plan, "png", 42_000), {
    width: 600,
    height: 400,
    text: "Local",
    textLength: 5,
    position: "top-left",
    opacity: 70,
    angle: 24,
    color: "#14201d",
    format: "png",
    outputBytes: 42_000,
  });
});

test("image watermark contracts reject unsupported or unsafe settings", () => {
  assert.deepEqual(IMAGE_WATERMARK_POSITIONS.map(({ value }) => value), ["center", "top-left", "top-right", "bottom-left", "bottom-right"]);
  assert.deepEqual(IMAGE_WATERMARK_ANGLES.map(({ value }) => value), [-24, 0, 24]);
  assert.deepEqual(IMAGE_WATERMARK_COLORS.map(({ value }) => value), ["#ffffff", "#14201d"]);

  const valid = { text: "Watermark", position: "center", opacity: 45, angle: 0, color: "#ffffff" };
  for (const [options, code] of [
    [{ ...valid, text: "   " }, "missing-watermark-text"],
    [{ ...valid, text: "x".repeat(501) }, "watermark-text-limit"],
    [{ ...valid, position: "tile" }, "invalid-watermark-position"],
    [{ ...valid, opacity: 4 }, "invalid-watermark-opacity"],
    [{ ...valid, opacity: 101 }, "invalid-watermark-opacity"],
    [{ ...valid, angle: 15 }, "invalid-watermark-angle"],
    [{ ...valid, color: "#ff0000" }, "invalid-watermark-color"],
  ]) {
    assert.throws(() => getImageWatermarkPlan(800, 600, options), (error) => error instanceof FileLimitError && error.code === code);
  }
  assert.throws(() => createImageWatermarkOutcome(getImageWatermarkPlan(800, 600, valid), "gif", 100), (error) => error instanceof FileLimitError && error.code === "invalid-watermark-outcome");
});

const measuredMemeText = (text, fontSize) => Array.from(text).length * fontSize * 0.55;

test("image meme captions auto-fit without truncation and preserve optional case", () => {
  const classic = getImageMemePlan(1200, 800, {
    topText: "when files stay here",
    bottomText: "privacy wins",
    letterCase: "uppercase",
  }, measuredMemeText);
  assert.equal(classic.topText, "WHEN FILES STAY HERE");
  assert.equal(classic.bottomText, "PRIVACY WINS");
  assert.deepEqual(classic.topLines, ["WHEN FILES STAY HERE"]);
  assert.deepEqual(classic.bottomLines, ["PRIVACY WINS"]);
  assert.equal(classic.fontSize, 72);
  assert.equal(classic.maxWidth, 1080);
  assert.equal(classic.x, 600);

  const original = getImageMemePlan(720, 720, {
    topText: "Keep My Case",
    bottomText: "and wrap a much longer sentence across the lower edge",
    letterCase: "original",
  }, measuredMemeText);
  assert.equal(original.topText, "Keep My Case");
  assert.ok(original.bottomLines.length > 1);
  assert.ok(original.bottomLines.length <= IMAGE_MEME_MAX_LINES);
  assert.equal(original.bottomLines.join(" "), original.bottomText);

  assert.deepEqual(wrapImageMemeCaption("SUPERCALIFRAGILISTIC", 60, (text) => text.length * 10), ["SUPERC", "ALIFRA", "GILIST", "IC"]);
});

test("image meme drawing and outcome reporting use the same exact caption plan", () => {
  const plan = getImageMemePlan(600, 400, { topText: "Top", bottomText: "Bottom", letterCase: "original" }, measuredMemeText);
  const calls = [];
  const context = {
    save: () => calls.push("save"),
    strokeText: (...values) => calls.push(["stroke", ...values]),
    fillText: (...values) => calls.push(["fill", ...values]),
    restore: () => calls.push("restore"),
  };
  drawImageMeme(context, plan);
  assert.equal(context.textAlign, "center");
  assert.equal(context.textBaseline, "middle");
  assert.equal(context.fillStyle, "#ffffff");
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "stroke").length, 2);
  assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "fill").length, 2);
  assert.deepEqual(createImageMemeOutcome(plan, "webp", 32_000), {
    width: 600,
    height: 400,
    topTextLength: 3,
    bottomTextLength: 6,
    topLineCount: 1,
    bottomLineCount: 1,
    fontSize: plan.fontSize,
    letterCase: "original",
    format: "webp",
    outputBytes: 32_000,
  });
});

test("image meme contracts reject empty, oversized, unreadable, and invalid settings", () => {
  assert.deepEqual(IMAGE_MEME_CASES.map(({ value }) => value), ["uppercase", "original"]);
  assert.throws(
    () => getImageMemePlan(800, 600, { topText: " ", bottomText: "", letterCase: "uppercase" }, measuredMemeText),
    (error) => error instanceof FileLimitError && error.code === "missing-meme-caption",
  );
  assert.throws(
    () => getImageMemePlan(800, 600, { topText: "x".repeat(501), bottomText: "", letterCase: "uppercase" }, measuredMemeText),
    (error) => error instanceof FileLimitError && error.code === "meme-caption-limit",
  );
  assert.throws(
    () => getImageMemePlan(120, 80, { topText: "many words ".repeat(30), bottomText: "", letterCase: "uppercase" }, measuredMemeText),
    (error) => error instanceof FileLimitError && error.code === "meme-caption-does-not-fit",
  );
  assert.throws(
    () => getImageMemePlan(800, 600, { topText: "Top", bottomText: "Bottom", letterCase: "sentence" }, measuredMemeText),
    (error) => error instanceof FileLimitError && error.code === "invalid-meme-case",
  );
  assert.throws(
    () => getImageMemePlan(800, 600, { topText: "Top", bottomText: "", letterCase: "uppercase" }, () => Number.NaN),
    (error) => error instanceof FileLimitError && error.code === "invalid-meme-layout",
  );
  assert.throws(
    () => createImageMemeOutcome(getImageMemePlan(800, 600, { topText: "Top", bottomText: "", letterCase: "uppercase" }, measuredMemeText), "gif", 1),
    (error) => error instanceof FileLimitError && error.code === "invalid-meme-outcome",
  );
});

test("image rotation plans exact directions and output dimensions", () => {
  assert.deepEqual(IMAGE_ROTATIONS.map(({ value, label }) => [value, label]), [
    [90, "Turn right"],
    [180, "Turn around"],
    [270, "Turn left"],
  ]);
  assert.equal(getImageRotation("90").hint, "90° clockwise");
  assert.deepEqual(getImageRotationPlan(1200, 800, 90), {
    sourceWidth: 1200,
    sourceHeight: 800,
    width: 800,
    height: 1200,
    angle: 90,
    label: "Turn right",
    hint: "90° clockwise",
    swapsDimensions: true,
  });
  assert.deepEqual(getImageRotationPlan(1200, 800, 180), {
    sourceWidth: 1200,
    sourceHeight: 800,
    width: 1200,
    height: 800,
    angle: 180,
    label: "Turn around",
    hint: "180° flip",
    swapsDimensions: false,
  });
  assert.deepEqual(createImageRotationOutcome(getImageRotationPlan(1200, 800, 270), "png", 45_000), {
    sourceWidth: 1200,
    sourceHeight: 800,
    width: 800,
    height: 1200,
    angle: 270,
    format: "png",
    outputBytes: 45_000,
  });
});

test("image rotation contracts reject unsupported angles and inconsistent outcomes", () => {
  assert.throws(() => getImageRotation(0), (error) => error instanceof FileLimitError && error.code === "invalid-image-rotation");
  assert.throws(() => getImageRotationPlan(800, 600, 45), (error) => error instanceof FileLimitError && error.code === "invalid-image-rotation");
  const plan = getImageRotationPlan(800, 600, 90);
  assert.throws(() => createImageRotationOutcome({ ...plan, width: 800 }, "png", 100), (error) => error instanceof FileLimitError && error.code === "invalid-image-rotation-outcome");
  assert.throws(() => createImageRotationOutcome(plan, "gif", 100), (error) => error instanceof FileLimitError && error.code === "invalid-image-rotation-outcome");
});

test("Blur Face plans detected regions or one movable centered fallback", () => {
  assert.deepEqual(FACE_BLUR_STRENGTHS.map(({ value }) => value), [12, 24, 40]);
  assert.deepEqual(FACE_BLUR_DEFAULT_FOCUS, { x: 50, y: 35 });
  const detected = createFaceBlurPlan({
    width: 1000,
    height: 800,
    strength: 40,
    focusX: 50,
    focusY: 35,
    detectedRegions: [{ x: -20, y: 100, width: 220, height: 260 }, { x: 700, y: 50, width: 180, height: 210 }],
  });
  assert.equal(detected.mode, "detected");
  assert.equal(detected.regions.length, 2);
  assert.deepEqual(detected.regions[0], { x: 0, y: 100, width: 200, height: 260 });

  const fallback = createFaceBlurPlan({ width: 1000, height: 800, strength: 24, focusX: 70, focusY: 60, fallbackReason: "unavailable" });
  assert.equal(fallback.mode, "centered-fallback");
  assert.equal(fallback.regions.length, 1);
  assert.equal(fallback.focusX, 70);
  assert.equal(fallback.focusY, 60);
  assert.deepEqual(validateFaceBlurPlan(fallback, 1000, 800, 24), fallback);
  assert.throws(() => validateFaceBlurPlan(fallback, 999, 800, 24), (error) => error instanceof FileLimitError && error.code === "stale-face-blur-plan");
  assert.throws(() => validateFaceBlurPlan(fallback, 1000, 800, 24, 40, 50, 60), (error) => error instanceof FileLimitError && error.code === "stale-face-blur-plan");
  assert.throws(() => createFaceBlurPlan({ width: 100, height: 100, detectedRegions: Array.from({ length: 41 }, () => ({ x: 1, y: 1, width: 2, height: 2 })) }), (error) => error instanceof FileLimitError && error.code === "face-count-limit");
  assert.throws(() => createFaceBlurPlan({ width: 100, height: 100, strength: 49 }), (error) => error instanceof FileLimitError && error.code === "invalid-face-blur-strength");
});

test("Blur Face preview guides are separate from the validated export outcome", () => {
  const plan = createFaceBlurPlan({ width: 400, height: 300, strength: 24, detectedRegions: [{ x: 100, y: 60, width: 120, height: 140 }] });
  const calls = [];
  const context = {
    filter: "none",
    lineWidth: 0,
    shadowBlur: 0,
    strokeStyle: "",
    shadowColor: "",
    drawImage: (...args) => calls.push(["drawImage", ...args.slice(1)]),
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    ellipse: (...args) => calls.push(["ellipse", ...args]),
    clip: () => calls.push(["clip"]),
    setLineDash: (value) => calls.push(["setLineDash", value]),
    stroke: () => calls.push(["stroke"]),
  };
  drawFaceBlur(context, {}, plan, { width: 200, height: 150, guides: true });
  assert.equal(calls.filter(([name]) => name === "drawImage").length, 2);
  assert.equal(calls.filter(([name]) => name === "ellipse").length, 2);
  assert.equal(calls.some(([name]) => name === "stroke"), true);
  assert.deepEqual(createFaceBlurOutcome(plan, "png", 12_345), {
    width: 400,
    height: 300,
    strength: 24,
    mode: "detected",
    fallbackReason: "",
    regionCount: 1,
    focusX: 50,
    focusY: 35,
    format: "png",
    outputBytes: 12_345,
  });
  assert.throws(() => createFaceBlurOutcome(plan, "gif", 12_345), (error) => error instanceof FileLimitError && error.code === "invalid-face-blur-outcome");
});

test("HTML to Image offers direct formats and familiar bounded viewport widths", () => {
  const tool = tools.find((item) => item.slug === "html-to-image");
  assert.deepEqual(tool.output, [".jpg", ".svg"]);
  assert.deepEqual(tool.settings.find(({ key }) => key === "format")?.options.map(({ value }) => value), ["jpg", "svg"]);
  assert.deepEqual(tool.settings.find(({ key }) => key === "viewportWidth")?.presets.map(({ value }) => value), [375, 768, 1440, 1920]);
  assert.deepEqual(HTML_IMAGE_FORMATS.map(({ value }) => value), ["jpg", "svg"]);
  assert.deepEqual(HTML_IMAGE_VIEWPORTS.map(({ value }) => value), [375, 768, 1440, 1920]);
  assert.equal(getHtmlImageFormat("jpg").label, "JPG");
  assert.equal(getHtmlImageViewport("1440"), 1440);
  assert.throws(() => getHtmlImageFormat("png"), (error) => error instanceof FileLimitError && error.code === "invalid-html-image-format");
  for (const width of [319, 3841, 1440.5, Number.NaN]) {
    assert.throws(() => getHtmlImageViewport(width), (error) => error instanceof FileLimitError && error.code === "invalid-html-viewport");
  }
});

test("HTML to Image plans exact JPG density and native-size SVG output", () => {
  assert.deepEqual(createHtmlImagePlan({ format: "jpg", viewportWidth: 1440 }, 560), {
    format: "jpg",
    formatLabel: "JPG",
    viewportWidth: 1440,
    captureHeight: 560,
    pixelRatio: 1.5,
    outputWidth: 2160,
    outputHeight: 840,
    outputPixels: 1_814_400,
  });
  assert.deepEqual(createHtmlImagePlan({ format: "svg", viewportWidth: 768 }, 701.2), {
    format: "svg",
    formatLabel: "SVG",
    viewportWidth: 768,
    captureHeight: 702,
    pixelRatio: 1,
    outputWidth: 768,
    outputHeight: 702,
    outputPixels: 539_136,
  });
  assert.throws(() => createHtmlImagePlan({ format: "jpg", viewportWidth: 1440 }, 4097), (error) => error instanceof FileLimitError && error.code === "html-height-limit");
  assert.throws(() => createHtmlImagePlan({ format: "jpg", viewportWidth: 3840 }, 4096), (error) => error instanceof FileLimitError && error.code === "output-dimensions-too-large");
});

test("HTML to Image sanitization contracts keep only bounded data images and local fragments", () => {
  assert.equal(hasNonFragmentHtmlImageUrl("fill:url(#safe-gradient)"), false);
  assert.equal(hasNonFragmentHtmlImageUrl("filter:url(https://tracker.example/filter.svg#x)"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("onclick", "alert(1)", "button"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("style", "color:red", "p"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("href", "https://example.com", "a"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("src", "https://example.com/photo.jpg", "img"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("src", "data:image/svg+xml;base64,PHN2Zz4=", "img"), true);
  assert.equal(shouldRemoveHtmlImageAttribute("src", "data:image/png;base64,iVBORw0KGgo=", "img"), false);
  assert.equal(shouldRemoveHtmlImageAttribute("fill", "url(#safe-gradient)", "path"), false);
  assert.equal(shouldRemoveHtmlImageAttribute("filter", "url(//tracker.example/filter.svg)", "path"), true);
});

test("HTML to Image result reporting preserves the reviewed capture contract", () => {
  const plan = createHtmlImagePlan({ format: "jpg", viewportWidth: 375 }, 560);
  const prepared = { sourceCharacters: 120, elementCount: 5, removedElements: 2, removedAttributes: 3, removedResources: 1, keptDataImages: 1 };
  assert.deepEqual(createHtmlImageOutcome(plan, prepared, 42_000), {
    format: "jpg",
    viewportWidth: 375,
    captureHeight: 560,
    outputWidth: 562,
    outputHeight: 840,
    outputBytes: 42_000,
    ...prepared,
  });
  assert.throws(() => createHtmlImageOutcome(plan, prepared, 0), (error) => error instanceof FileLimitError && error.code === "invalid-html-image-outcome");
});

test("PDF to JPG plans one direct image or an exact multi-page ZIP", () => {
  assert.equal(PDF_TO_JPG_RENDER_SCALE, 1.7);
  assert.deepEqual(createPdfJpgOutputPlan(1, 100), {
    pageCount: 1,
    outputCount: 1,
    archive: false,
    outputLabel: "1 JPG file",
    actionLabel: "Create 1 JPG",
    readyLabel: "1 JPG ready",
  });
  assert.deepEqual(createPdfJpgOutputPlan(8, 100), {
    pageCount: 8,
    outputCount: 8,
    archive: true,
    outputLabel: "8 JPGs in one ZIP",
    actionLabel: "Create ZIP · 8 JPGs",
    readyLabel: "8 JPGs in one ZIP ready",
  });
  assert.throws(() => createPdfJpgOutputPlan(0, 100), (error) => error instanceof FileLimitError && error.code === "invalid-pdf-page-count");
  assert.throws(() => createPdfJpgOutputPlan(101, 100), (error) => error instanceof FileLimitError && error.code === "result-count-limit" && /101 JPG files/.test(error.message));
});

test("PDF to Word previews exact page text and reuses the checked extraction", async () => {
  assert.deepEqual(createPdfOfficeTextPreview(["Alpha beta\nGamma", "", "Delta"], 5), {
    pageCount: 3,
    pagesWithText: 2,
    emptyPageCount: 1,
    characterCount: 21,
    wordCount: 4,
    pageStats: [
      { pageNumber: 1, characterCount: 16, wordCount: 3, hasText: true, previewText: "Alpha", truncated: true },
      { pageNumber: 2, characterCount: 0, wordCount: 0, hasText: false, previewText: "", truncated: false },
      { pageNumber: 3, characterCount: 5, wordCount: 1, hasText: true, previewText: "Delta", truncated: false },
    ],
  });
  assert.throws(() => createPdfOfficeTextPreview([]), (error) => error instanceof FileLimitError && error.code === "invalid-pdf-text-pages");

  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([300, 400]);
  const file = namedBlob(await source.save(), "checked-text.pdf", "application/pdf");
  const [result] = await processPdfTool("pdf-to-word", [file], { pdfOfficeTextPages: ["Alpha beta", ""] });
  assert.equal(result.name, "checked-text.docx");
  assert.equal(result.details, "2 editable sections · 10 characters");
  assert.deepEqual(result.pdfOfficeTextOutcome, {
    pageCount: 2,
    pagesWithText: 1,
    emptyPageCount: 1,
    characterCount: 10,
    wordCount: 2,
    format: "docx",
  });
  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  const documentXml = await archive.file("word/document.xml").async("string");
  assert.match(documentXml, /Page 1/);
  assert.match(documentXml, /Alpha beta/);
  assert.match(documentXml, /Page 2/);
  assert.equal((documentXml.match(/<w:sectPr>/g) || []).length, 2, "one DOCX section is created for every checked PDF page");

  await assert.rejects(
    () => processPdfTool("pdf-to-word", [file], { pdfOfficeTextPages: ["x".repeat(5_000_001)] }),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit",
  );
});

test("PDF to PowerPoint previews exact slide text and reuses the checked extraction", async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([300, 400]);
  const file = namedBlob(await source.save(), "checked-slides.pdf", "application/pdf");
  const [result] = await processPdfTool("pdf-to-powerpoint", [file], { pdfOfficeTextPages: ["Alpha beta", ""] });

  assert.equal(result.name, "checked-slides.pptx");
  assert.equal(result.details, "2 editable slides · 10 characters");
  assert.deepEqual(result.pdfOfficeTextOutcome, {
    pageCount: 2,
    pagesWithText: 1,
    emptyPageCount: 1,
    characterCount: 10,
    wordCount: 2,
    format: "pptx",
  });

  const archive = await JSZip.loadAsync(await result.blob.arrayBuffer());
  assert.match(await archive.file("ppt/slides/slide1.xml").async("string"), /Alpha beta/);
  assert.match(await archive.file("ppt/slides/slide2.xml").async("string"), /No selectable text found on this page\./);

  await assert.rejects(
    () => processPdfTool("pdf-to-powerpoint", [file], { pdfOfficeTextPages: ["x".repeat(1_000_001)] }),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit",
  );
});

test("PDF to Excel previews exact sheets, rows, and values before export", async () => {
  const pages = ["Name  Score\nAlice  9", "City|Country\nPune|India", ""];
  assert.deepEqual(createPdfSpreadsheetPlan(pages, 1, 1), {
    sheetCount: 3,
    rowCount: 4,
    valueCount: 8,
    sheets: [
      { pageNumber: 1, name: "Page 1", rowCount: 2, valueCount: 4, columnCount: 2, previewRows: [["Name"]], previewTruncatedRows: true, previewTruncatedColumns: true },
      { pageNumber: 2, name: "Page 2", rowCount: 2, valueCount: 4, columnCount: 2, previewRows: [["City"]], previewTruncatedRows: true, previewTruncatedColumns: true },
      { pageNumber: 3, name: "Page 3", rowCount: 0, valueCount: 0, columnCount: 0, previewRows: [], previewTruncatedRows: false, previewTruncatedColumns: false },
    ],
  });

  const source = await PDFDocument.create();
  pages.forEach(() => source.addPage([300, 400]));
  const file = namedBlob(await source.save(), "checked-sheets.pdf", "application/pdf");
  const [result] = await processPdfTool("pdf-to-excel", [file], { pdfOfficeTextPages: pages });
  assert.equal(result.name, "checked-sheets.xlsx");
  assert.equal(result.details, "3 editable sheets · 8 values");
  assert.deepEqual(result.pdfOfficeTextOutcome, {
    pageCount: 3,
    pagesWithText: 2,
    emptyPageCount: 1,
    characterCount: pages.reduce((sum, page) => sum + page.length, 0),
    wordCount: 6,
    format: "xlsx",
    rowCount: 4,
    valueCount: 8,
  });

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await result.blob.arrayBuffer(), { type: "array" });
  assert.deepEqual(workbook.SheetNames, ["Page 1", "Page 2", "Page 3"]);
  assert.equal(workbook.Sheets["Page 1"].A2.v, "Alice");
  assert.equal(workbook.Sheets["Page 1"].B2.v, "9");
  assert.equal(workbook.Sheets["Page 2"].B2.v, "India");

  await assert.rejects(
    () => processPdfTool("pdf-to-excel", [file], { pdfOfficeTextPages: ["x".repeat(2_000_001)] }),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit",
  );
});

test("Archive PDF Rewrite reports its exact non-certified output contract", async () => {
  const source = await PDFDocument.create();
  source.addPage([300, 400]);
  source.addPage([500, 600]);
  source.setProducer("Legacy producer");
  source.setCreator("Legacy creator");
  const file = namedBlob(await source.save(), "records.pdf", "application/pdf");
  const phases = [];

  const [result] = await processPdfTool("pdf-to-pdfa", [file], {}, (progress) => phases.push(progress.phase));

  assert.equal(result.name, "records-archive.pdf");
  assert.equal(result.type, "application/pdf");
  assert.equal(result.details, "2 pages · Archive-friendly rewrite · Not certified PDF/A");
  assert.deepEqual(result.archiveRewriteOutcome, {
    pageCount: 2,
    certifiedPdfA: false,
    objectStreams: false,
    metadataRefreshed: true,
  });
  assert.deepEqual(phases, ["Reading PDF structure", "Rewriting PDF structure", "Finishing archive-friendly PDF"]);

  const rewritten = await PDFDocument.load(await result.blob.arrayBuffer(), { updateMetadata: false });
  assert.equal(rewritten.getPageCount(), 2);
  assert.deepEqual(rewritten.getPages().map((page) => [page.getWidth(), page.getHeight()]), [[300, 400], [500, 600]]);
  assert.equal(rewritten.getProducer(), "Local File Studio archival normalization");
  assert.equal(rewritten.getCreator(), "Local File Studio");
});

test("OCR reader results keep bounded page text in memory without a download blob", () => {
  const result = createOcrReaderResult("scan.pdf", [
    { pageNumber: 1, text: "First page", confidence: 97.6 },
    { pageNumber: 2, text: "", confidence: -5 },
  ]);
  assert.equal(result.type, "application/x-local-ocr-pages");
  assert.equal(result.name, "scan text reader");
  assert.equal(result.blob, undefined);
  assert.deepEqual(result.ocrPages, [
    { pageNumber: 1, text: "First page", confidence: 98 },
    { pageNumber: 2, text: "", confidence: 0 },
  ]);
  assert.equal(buildOcrCopyText(result.ocrPages), "PAGE 1\nFirst page\n\nPAGE 2\n[No text recognized]");
});

test("Summary, Translate, and Markdown results expose complete copyable text beside optional downloads", async () => {
  const summary = createTextReaderResult("local-notes.pdf", "LOCAL EXTRACTIVE SUMMARY\n\n• Private files stay local.", "summary");
  assert.equal(summary.viewer, "summary");
  assert.equal(summary.name, "local-notes-summary.txt");
  assert.equal(summary.type, "text/plain");
  assert.match(summary.textContent, /Private files stay local/);
  assert.equal(await summary.blob.text(), summary.textContent);

  const translation = createTextReaderResult("local-notes.pdf", "[Limited glossary]\n\ndocumento privado", "translation");
  assert.equal(translation.viewer, "translation");
  assert.equal(translation.type, "text/plain");
  assert.match(translation.textContent, /glossary/i);
  assert.match(translation.textContent, /documento/i);
  assert.equal(await translation.blob.text(), translation.textContent);

  const markdown = createTextReaderResult("local-notes.pdf", "# Page 1\n\n## PRIVATE DOCUMENT", "markdown");
  assert.equal(markdown.viewer, "markdown");
  assert.equal(markdown.type, "text/markdown");
  assert.match(markdown.textContent, /^# Page 1/m);
  assert.match(markdown.textContent, /^## PRIVATE DOCUMENT/m);
  assert.equal(await markdown.blob.text(), markdown.textContent);
});

test("extractive summaries treat PDF lines as candidates and do not repeat identical source sentences", () => {
  assert.equal(
    extractiveSummary("Project title\nPrivate files stay on this device.\nPrivate files stay on this device.\nNo uploads are required.", 5),
    "• Project title\n• Private files stay on this device.\n• No uploads are required.",
  );
  assert.equal(extractiveSummary("One\nTwo\nThree", 2).split("\n").length, 2);
});

test("Markdown preview parsing stays structural and caps only the visual preview", () => {
  const preview = parseMarkdownPreview("# Title\n\n- One\n- Two\n\n<script>alert('no')</script>\n\n---\n\nEnd", { maxCharacters: 1_000, maxBlocks: 20 });
  assert.deepEqual(preview.blocks, [
    { type: "heading", level: 1, text: "Title" },
    { type: "list", items: ["One", "Two"] },
    { type: "paragraph", text: "<script>alert('no')</script>" },
    { type: "divider" },
    { type: "paragraph", text: "End" },
  ]);
  assert.equal(preview.truncated, false);
  const capped = parseMarkdownPreview("# One\n\n# Two\n\n# Three", { maxCharacters: 1_000, maxBlocks: 2 });
  assert.equal(capped.blocks.length, 2);
  assert.equal(capped.truncated, true);
});

test("Merge PDF preserves selected order in a previewable PDF result", async () => {
  const first = await PDFDocument.create();
  first.addPage([300, 400]);
  first.addPage([310, 410]);
  const second = await PDFDocument.create();
  second.addPage([500, 600]);
  const files = [
    namedBlob(await first.save(), "first.pdf", "application/pdf"),
    namedBlob(await second.save(), "second.pdf", "application/pdf"),
  ];

  const [result] = await processPdfTool("merge-pdf", files, {});

  assert.equal(result.name, "merged-local.pdf");
  assert.equal(result.type, "application/pdf");
  assert.equal(result.details, "3 pages merged");
  assert.equal(result.size, result.blob.size);
  assert.ok(result.size > 0);

  const merged = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(
    merged.getPages().map((page) => [page.getWidth(), page.getHeight()]),
    [[300, 400], [310, 410], [500, 600]],
  );
});

test("JPG to PDF creates a PDF result that is eligible for the shared preview", async () => {
  const image = namedBlob(onePixelPng, "page.png", "image/png");
  const [result] = await processPdfTool("jpg-to-pdf", [image], { pageSize: "fit", margin: 0 });
  assert.equal(isPdfPreviewResult(result), true);
  assert.equal(assertPdfPreviewResult(result, result.size), result.blob);
  assert.equal(result.details, "1 page · Fit each image · No margin");
  assert.deepEqual(result.imagePdfOutcome, { pageCount: 1, pageSize: "fit", margin: "none" });
  const document = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(document.getPageCount(), 1);
  assert.deepEqual([document.getPage(0).getWidth(), document.getPage(0).getHeight()], [1, 1]);

  const tool = tools.find((item) => item.slug === "jpg-to-pdf");
  const response = await runTool(tool, [image], { pageSize: "fit", margin: "none" });
  const normalizedDocument = await PDFDocument.load(await response.results[0].blob.arrayBuffer());
  assert.deepEqual([normalizedDocument.getPage(0).getWidth(), normalizedDocument.getPage(0).getHeight()], [1, 1]);
});

test("Scan to PDF preserves visual image order and reports its page fit", async () => {
  const files = [
    namedBlob(onePixelPng, "scan-1.png", "image/png"),
    namedBlob(onePixelPng, "scan-2.png", "image/png"),
    namedBlob(onePixelPng, "scan-3.png", "image/png"),
  ];

  const [autoResult] = await processPdfTool("scan-to-pdf", files, { pageSize: "auto" });
  assert.equal(autoResult.name, "scans-local.pdf");
  assert.equal(autoResult.type, "application/pdf");
  assert.equal(autoResult.details, "3 pages · Matched image shapes");
  assert.deepEqual(autoResult.scanOutcome, { pageCount: 3, pageSize: "auto" });
  const autoDocument = await PDFDocument.load(await autoResult.blob.arrayBuffer());
  assert.equal(autoDocument.getPageCount(), 3);

  const [a4Result] = await processPdfTool("scan-to-pdf", files.slice(0, 2), { pageSize: "a4" });
  assert.equal(a4Result.details, "2 pages · A4 pages");
  assert.deepEqual(a4Result.scanOutcome, { pageCount: 2, pageSize: "a4" });
  const a4Document = await PDFDocument.load(await a4Result.blob.arrayBuffer());
  assert.deepEqual(
    a4Document.getPages().map((page) => [Math.round(page.getWidth()), Math.round(page.getHeight())]),
    [[595, 842], [595, 842]],
  );
});

test("Split PDF creates the exact visually selected one-page file", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  source.addPage([210, 310]);
  source.addPage([220, 320]);
  source.addPage([230, 330]);
  const file = namedBlob(await source.save(), "four-pages.pdf", "application/pdf");

  const [result] = await processPdfTool("split-pdf", [file], { mode: "selected", pages: "4" });
  assert.equal(result.name, "four-pages-page-4.pdf");
  assert.equal(result.type, "application/pdf");
  assert.equal(result.details, "1 page · 4");

  const pageFour = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.deepEqual([pageFour.getPage(0).getWidth(), pageFour.getPage(0).getHeight()], [230, 330]);

  await assert.rejects(
    () => processPdfTool("split-pdf", [file], { mode: "selected", pages: "2,,3" }),
    /empty entry.*not a valid page or range/s,
  );
});

test("Split PDF creates the visual half, pair, odd, and custom output groups", async () => {
  const source = await PDFDocument.create();
  for (let page = 1; page <= 6; page += 1) source.addPage([200 + page, 300 + page]);
  const file = namedBlob(await source.save(), "six-pages.pdf", "application/pdf");

  const [halfArchive] = await processPdfTool("split-pdf", [file], { mode: "half" });
  assert.equal(halfArchive.type, "application/zip");
  assert.equal(halfArchive.details, "2 PDFs in one ZIP");

  const [odd] = await processPdfTool("split-pdf", [file], { mode: "odd" });
  assert.equal(odd.name, "six-pages-odd-pages.pdf");
  assert.equal(odd.details, "3 pages · 1,3,5");
  const oddPdf = await PDFDocument.load(await odd.blob.arrayBuffer());
  assert.deepEqual(oddPdf.getPages().map((page) => page.getWidth()), [201, 203, 205]);

  const [customArchive] = await processPdfTool("split-pdf", [file], { mode: "custom", customBreaks: "2,5" });
  assert.equal(customArchive.type, "application/zip");
  assert.equal(customArchive.details, "3 PDFs in one ZIP");

  const [pairedArchive] = await processPdfTool("split-pdf", [file], { mode: "every2" });
  assert.equal(pairedArchive.details, "3 PDFs in one ZIP");
});

test("Remove Pages keeps the unmarked pages and rejects unsafe selections", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  source.addPage([210, 310]);
  source.addPage([220, 320]);
  source.addPage([230, 330]);
  const file = namedBlob(await source.save(), "four-pages.pdf", "application/pdf");

  const [result] = await processPdfTool("remove-pages", [file], { pages: "2,4" });
  const retained = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(retained.getPageCount(), 2);
  assert.deepEqual(
    retained.getPages().map((page) => [page.getWidth(), page.getHeight()]),
    [[200, 300], [220, 320]],
  );

  assert.throws(() => parseRemovalPageSelection("", 4), /Choose at least one page to remove/);
  assert.throws(() => parseRemovalPageSelection("1-4", 4), /Removing every page would create an empty PDF/);
  assert.throws(() => parseRemovalPageSelection("5", 4), /outside this 4-page PDF/);
  await assert.rejects(
    () => processPdfTool("remove-pages", [file], { pages: "1-4" }),
    /Removing every page would create an empty PDF/,
  );
});

test("Extract Pages preserves selected order in one PDF or separate ZIP entries", async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  source.addPage([210, 310]);
  source.addPage([220, 320]);
  source.addPage([230, 330]);
  const file = namedBlob(await source.save(), "four-pages.pdf", "application/pdf");

  const [combined] = await processPdfTool("extract-pages", [file], { pages: "4,2", combine: true });
  const combinedPdf = await PDFDocument.load(await combined.blob.arrayBuffer());
  assert.deepEqual(combinedPdf.getPages().map((page) => page.getWidth()), [230, 210]);

  const [archive] = await processPdfTool("extract-pages", [file], { pages: "4,2", combine: false });
  assert.equal(archive.type, "application/zip");
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files).sort(), ["four-pages-page-2.pdf", "four-pages-page-4.pdf"]);
  const pageFour = await PDFDocument.load(await zip.file("four-pages-page-4.pdf").async("uint8array"));
  const pageTwo = await PDFDocument.load(await zip.file("four-pages-page-2.pdf").async("uint8array"));
  assert.equal(pageFour.getPage(0).getWidth(), 230);
  assert.equal(pageTwo.getPage(0).getWidth(), 210);
});

test("PDF previews validate type and size before reading the result", () => {
  const pdf = new Blob(["%PDF"], { type: "application/pdf" });
  const result = { name: "merged-local.pdf", type: "application/pdf", blob: pdf };
  assert.equal(assertPdfPreviewResult(result, pdf.size), pdf);
  assert.equal(isPdfPreviewResult(result), true);
  assert.equal(isPdfPreviewResult({ ...result, type: "application/zip" }), false);

  assert.throws(
    () => assertPdfPreviewResult({ ...result, type: "text/plain" }, pdf.size),
    /not a valid PDF result/s,
  );
  assert.throws(
    () => assertPdfPreviewResult(result, pdf.size - 1),
    /merged-local\.pdf.*above the 1 KB in-memory result limit/s,
  );
});

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
