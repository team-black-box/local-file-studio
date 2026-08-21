// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError } from "./file-limits.js";

export const FACE_BLUR_STRENGTHS = Object.freeze([
  Object.freeze({ value: 12, label: "Light", hint: "Softens facial detail" }),
  Object.freeze({ value: 24, label: "Balanced", hint: "Clear privacy blur" }),
  Object.freeze({ value: 40, label: "Strong", hint: "Harder to recognize" }),
]);

export const FACE_BLUR_DEFAULT_FOCUS = Object.freeze({ x: 50, y: 35 });

const VALID_FALLBACK_REASONS = new Set(["unavailable", "not-found", "detection-error"]);

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new FileLimitError("invalid-face-blur-setting", `${label} must be a valid number before Blur Face can run.`);
  }
  return number;
}

export function getFaceBlurStrength(value) {
  const strength = finiteNumber(value ?? 24, "Blur strength");
  if (strength < 8 || strength > 48) {
    throw new FileLimitError("invalid-face-blur-strength", "Blur strength must stay between 8 px and 48 px.");
  }
  return strength;
}

export function getFaceBlurFocus(focusX = FACE_BLUR_DEFAULT_FOCUS.x, focusY = FACE_BLUR_DEFAULT_FOCUS.y) {
  const x = finiteNumber(focusX, "Fallback horizontal position");
  const y = finiteNumber(focusY, "Fallback vertical position");
  if (x < 10 || x > 90 || y < 10 || y > 90) {
    throw new FileLimitError("invalid-face-blur-focus", "Keep the fallback privacy area between 10% and 90% of the image width and height.");
  }
  return { x, y };
}

function normalizeRegion(region, width, height) {
  const x = Number(region?.x);
  const y = Number(region?.y);
  const regionWidth = Number(region?.width);
  const regionHeight = Number(region?.height);
  if (![x, y, regionWidth, regionHeight].every(Number.isFinite) || regionWidth <= 0 || regionHeight <= 0) return null;

  const left = Math.max(0, Math.min(width, x));
  const top = Math.max(0, Math.min(height, y));
  const right = Math.max(0, Math.min(width, x + regionWidth));
  const bottom = Math.max(0, Math.min(height, y + regionHeight));
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function createFaceBlurFallbackRegion(width, height, focusX, focusY) {
  const focus = getFaceBlurFocus(focusX, focusY);
  const size = Math.min(width, height) * 0.34;
  return normalizeRegion({
    x: width * (focus.x / 100) - size / 2,
    y: height * (focus.y / 100) - (size * 1.12) / 2,
    width: size,
    height: size * 1.12,
  }, width, height);
}

export function createFaceBlurPlan({
  width,
  height,
  strength = 24,
  focusX = FACE_BLUR_DEFAULT_FOCUS.x,
  focusY = FACE_BLUR_DEFAULT_FOCUS.y,
  detectedRegions = [],
  fallbackReason = "not-found",
  maxDetectedFaces = 40,
} = {}) {
  const sourceWidth = finiteNumber(width, "Image width");
  const sourceHeight = finiteNumber(height, "Image height");
  if (!Number.isInteger(sourceWidth) || sourceWidth < 1 || !Number.isInteger(sourceHeight) || sourceHeight < 1) {
    throw new FileLimitError("invalid-face-blur-dimensions", "Blur Face needs valid whole-pixel image dimensions.");
  }
  if (!Array.isArray(detectedRegions)) {
    throw new FileLimitError("invalid-face-blur-regions", "The detected face regions were invalid. Choose the image again and retry.");
  }
  if (detectedRegions.length > maxDetectedFaces) {
    throw new FileLimitError(
      "face-count-limit",
      `This image has more than ${maxDetectedFaces.toLocaleString()} detected faces. Crop it into smaller groups so every detected face can be blurred and reviewed.`,
    );
  }

  const normalizedStrength = getFaceBlurStrength(strength);
  const focus = getFaceBlurFocus(focusX, focusY);
  const regions = detectedRegions.map((region) => normalizeRegion(region, sourceWidth, sourceHeight)).filter(Boolean);
  if (regions.length) {
    return {
      width: sourceWidth,
      height: sourceHeight,
      strength: normalizedStrength,
      mode: "detected",
      fallbackReason: "",
      focusX: focus.x,
      focusY: focus.y,
      regions,
    };
  }
  if (!VALID_FALLBACK_REASONS.has(fallbackReason)) {
    throw new FileLimitError("invalid-face-blur-fallback", "The centered privacy-area fallback reported an invalid reason. Choose the image again and retry.");
  }
  return {
    width: sourceWidth,
    height: sourceHeight,
    strength: normalizedStrength,
    mode: "centered-fallback",
    fallbackReason,
    focusX: focus.x,
    focusY: focus.y,
    regions: [createFaceBlurFallbackRegion(sourceWidth, sourceHeight, focus.x, focus.y)],
  };
}

export function validateFaceBlurPlan(plan, width, height, strength, maxDetectedFaces = 40, focusX = plan?.focusX, focusY = plan?.focusY) {
  if (!plan || !["detected", "centered-fallback"].includes(plan.mode)) {
    throw new FileLimitError("invalid-face-blur-plan", "The reviewed Blur Face plan is no longer valid. Wait for a fresh preview and retry.");
  }
  const recreated = createFaceBlurPlan({
    width,
    height,
    strength,
    focusX,
    focusY,
    detectedRegions: plan.mode === "detected" ? plan.regions : [],
    fallbackReason: plan.mode === "centered-fallback" ? plan.fallbackReason : "not-found",
    maxDetectedFaces,
  });
  if (recreated.mode !== plan.mode || recreated.width !== plan.width || recreated.height !== plan.height || recreated.focusX !== plan.focusX || recreated.focusY !== plan.focusY) {
    throw new FileLimitError("stale-face-blur-plan", "The image changed after its Blur Face preview. Wait for the new preview and retry.");
  }
  return recreated;
}

export function drawFaceBlur(context, source, plan, { width = plan.width, height = plan.height, guides = false } = {}) {
  if (!context || !source) {
    throw new FileLimitError("invalid-face-blur-canvas", "The Blur Face canvas could not be prepared safely.");
  }
  const scaleX = width / plan.width;
  const scaleY = height / plan.height;
  const blurScale = Math.min(scaleX, scaleY);
  context.drawImage(source, 0, 0, width, height);

  for (const sourceRegion of plan.regions) {
    const region = {
      x: sourceRegion.x * scaleX,
      y: sourceRegion.y * scaleY,
      width: sourceRegion.width * scaleX,
      height: sourceRegion.height * scaleY,
    };
    const pad = Math.max(region.width, region.height) * 0.14;
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    const radiusX = region.width / 2 + pad;
    const radiusY = region.height / 2 + pad;

    context.save();
    context.beginPath();
    context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.clip();
    context.filter = `blur(${Math.max(1, plan.strength * blurScale)}px)`;
    context.drawImage(source, 0, 0, width, height);
    context.restore();

    if (guides) {
      context.save();
      context.beginPath();
      context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.setLineDash([Math.max(4, 7 * blurScale), Math.max(3, 5 * blurScale)]);
      context.lineWidth = Math.max(2, 3 * blurScale);
      context.strokeStyle = "#e7683f";
      context.shadowColor = "rgba(255,255,255,.9)";
      context.shadowBlur = Math.max(2, 3 * blurScale);
      context.stroke();
      context.restore();
    }
  }
}

export function createFaceBlurOutcome(plan, format, outputBytes) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (!["jpg", "png", "webp"].includes(normalizedFormat)
    || !Number.isInteger(outputBytes) || outputBytes < 1
    || !Array.isArray(plan?.regions) || !plan.regions.length
    || !["detected", "centered-fallback"].includes(plan.mode)) {
    throw new FileLimitError("invalid-face-blur-outcome", "Blur Face reported invalid output details. No result was kept; choose the image again and retry.");
  }
  return {
    width: plan.width,
    height: plan.height,
    strength: plan.strength,
    mode: plan.mode,
    fallbackReason: plan.fallbackReason,
    regionCount: plan.regions.length,
    focusX: plan.focusX,
    focusY: plan.focusY,
    format: normalizedFormat,
    outputBytes,
  };
}
