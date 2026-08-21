// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, assertOutputDimensions, getToolLimits } from "./file-limits.js";

export const IMAGE_ROTATIONS = Object.freeze([
  Object.freeze({ value: 90, label: "Turn right", hint: "90° clockwise" }),
  Object.freeze({ value: 180, label: "Turn around", hint: "180° flip" }),
  Object.freeze({ value: 270, label: "Turn left", hint: "90° counter-clockwise" }),
]);

export function getImageRotation(value = 90) {
  const angle = Number(value);
  const rotation = IMAGE_ROTATIONS.find((item) => item.value === angle);
  if (!rotation) {
    throw new FileLimitError("invalid-image-rotation", "Rotation must be 90° right, 180°, or 90° left. Choose an available direction and try again.");
  }
  return rotation;
}

export function getImageRotationPlan(width, height, angle = 90, limitsOrTool = "rotate-image", label = "This rotated image") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const sourceWidth = Math.round(Number(width));
  const sourceHeight = Math.round(Number(height));
  const rotation = getImageRotation(angle);
  const swapsDimensions = rotation.value === 90 || rotation.value === 270;
  const outputWidth = swapsDimensions ? sourceHeight : sourceWidth;
  const outputHeight = swapsDimensions ? sourceWidth : sourceHeight;
  assertOutputDimensions(outputWidth, outputHeight, limits, label);
  return Object.freeze({
    sourceWidth,
    sourceHeight,
    width: outputWidth,
    height: outputHeight,
    angle: rotation.value,
    label: rotation.label,
    hint: rotation.hint,
    swapsDimensions,
  });
}

export function createImageRotationOutcome(plan, format, outputBytes) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (!plan
    || !Number.isInteger(plan.sourceWidth) || plan.sourceWidth < 1
    || !Number.isInteger(plan.sourceHeight) || plan.sourceHeight < 1
    || !Number.isInteger(plan.width) || plan.width < 1
    || !Number.isInteger(plan.height) || plan.height < 1
    || !["jpg", "png", "webp"].includes(normalizedFormat)
    || !Number.isFinite(outputBytes) || outputBytes < 0) {
    throw new FileLimitError("invalid-image-rotation-outcome", "The rotated image reported invalid output details. No result was kept; choose the image again and retry.");
  }
  const rotation = getImageRotation(plan.angle);
  const expectedWidth = rotation.value === 180 ? plan.sourceWidth : plan.sourceHeight;
  const expectedHeight = rotation.value === 180 ? plan.sourceHeight : plan.sourceWidth;
  if (plan.width !== expectedWidth || plan.height !== expectedHeight) {
    throw new FileLimitError("invalid-image-rotation-outcome", "The rotated image reported inconsistent dimensions. No result was kept; choose the image again and retry.");
  }
  return Object.freeze({
    sourceWidth: plan.sourceWidth,
    sourceHeight: plan.sourceHeight,
    width: plan.width,
    height: plan.height,
    angle: rotation.value,
    format: normalizedFormat,
    outputBytes: Math.round(outputBytes),
  });
}
