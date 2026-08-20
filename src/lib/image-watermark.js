// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, assertOutputDimensions, getTextSettingLimit, getToolLimits } from "./file-limits.js";

export const IMAGE_WATERMARK_POSITIONS = Object.freeze([
  Object.freeze({ value: "center", label: "Center", hint: "Across the middle." }),
  Object.freeze({ value: "top-left", label: "Top left", hint: "Upper corner." }),
  Object.freeze({ value: "top-right", label: "Top right", hint: "Upper corner." }),
  Object.freeze({ value: "bottom-left", label: "Bottom left", hint: "Lower corner." }),
  Object.freeze({ value: "bottom-right", label: "Bottom right", hint: "Lower corner." }),
]);

export const IMAGE_WATERMARK_ANGLES = Object.freeze([
  Object.freeze({ value: -24, label: "Upward", hint: "Classic diagonal." }),
  Object.freeze({ value: 0, label: "Straight", hint: "Easy to read." }),
  Object.freeze({ value: 24, label: "Downward", hint: "Reverse diagonal." }),
]);

export const IMAGE_WATERMARK_COLORS = Object.freeze([
  Object.freeze({ value: "#ffffff", label: "Light", hint: "For darker photos." }),
  Object.freeze({ value: "#14201d", label: "Dark", hint: "For lighter photos." }),
]);

export const IMAGE_WATERMARK_OPACITY_MIN = 5;
export const IMAGE_WATERMARK_OPACITY_MAX = 100;

export function getImageWatermarkPosition(value = "bottom-right") {
  const normalized = String(value || "").toLowerCase();
  const position = IMAGE_WATERMARK_POSITIONS.find((item) => item.value === normalized);
  if (!position) throw new FileLimitError("invalid-watermark-position", "Watermark position must be Center or one of the four corners. Choose an available position and try again.");
  return position;
}

export function getImageWatermarkAngle(value = -24) {
  const normalized = Number(value);
  const angle = IMAGE_WATERMARK_ANGLES.find((item) => item.value === normalized);
  if (!angle) throw new FileLimitError("invalid-watermark-angle", "Watermark direction must be Upward, Straight, or Downward. Choose an available direction and try again.");
  return angle;
}

export function getImageWatermarkColor(value = IMAGE_WATERMARK_COLORS[0].value) {
  const normalized = String(value || "").toLowerCase();
  const color = IMAGE_WATERMARK_COLORS.find((item) => item.value === normalized);
  if (!color) throw new FileLimitError("invalid-watermark-color", "Watermark color must be Light or Dark. Choose an available color and try again.");
  return color;
}

export function getImageWatermarkPlan(width, height, options = {}, limitsOrTool = "watermark-image", label = "This watermark") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const normalizedWidth = Math.round(Number(width));
  const normalizedHeight = Math.round(Number(height));
  assertOutputDimensions(normalizedWidth, normalizedHeight, limits, label);
  const text = String(options.text ?? "").trim();
  const maximumTextLength = getTextSettingLimit("watermark-image", "text");
  if (!text) throw new FileLimitError("missing-watermark-text", "Enter the text you want to place on the image.");
  if (text.length > maximumTextLength) throw new FileLimitError("watermark-text-limit", `Watermark text has ${text.length.toLocaleString()} characters; the local limit is ${maximumTextLength.toLocaleString()}. Shorten the text and try again.`);

  const position = getImageWatermarkPosition(options.position);
  const angle = getImageWatermarkAngle(options.angle);
  const color = getImageWatermarkColor(options.color);
  const opacity = Number(options.opacity ?? 45);
  if (!Number.isFinite(opacity) || opacity < IMAGE_WATERMARK_OPACITY_MIN || opacity > IMAGE_WATERMARK_OPACITY_MAX) {
    throw new FileLimitError("invalid-watermark-opacity", `Watermark opacity must be from ${IMAGE_WATERMARK_OPACITY_MIN}% to ${IMAGE_WATERMARK_OPACITY_MAX}%. Choose a value in that range and try again.`);
  }

  const fontSize = Math.max(18, Math.round(Math.min(normalizedWidth, normalizedHeight) * 0.06));
  const padding = fontSize * 0.7;
  const x = position.value.includes("left") ? padding : position.value.includes("right") ? normalizedWidth - padding : normalizedWidth / 2;
  const y = position.value.includes("top") ? padding : position.value.includes("bottom") ? normalizedHeight - padding : normalizedHeight / 2;
  const textAlign = position.value.includes("left") ? "left" : position.value.includes("right") ? "right" : "center";
  const textBaseline = position.value.includes("top") ? "top" : position.value.includes("bottom") ? "bottom" : "middle";

  return Object.freeze({
    width: normalizedWidth,
    height: normalizedHeight,
    text,
    textLength: text.length,
    position: position.value,
    opacity: Math.round(opacity),
    angle: angle.value,
    color: color.value,
    fontSize,
    padding,
    x,
    y,
    textAlign,
    textBaseline,
    maxWidth: normalizedWidth * 0.86,
    shadowColor: color.value === "#ffffff" ? "rgba(0,0,0,.72)" : "rgba(255,255,255,.78)",
  });
}

export function drawImageWatermark(context, plan) {
  if (!context || !plan) throw new FileLimitError("invalid-watermark-canvas", "The watermark canvas is unavailable. Choose the image again and retry.");
  context.save();
  context.globalAlpha = plan.opacity / 100;
  context.font = `700 ${plan.fontSize}px Manrope, Arial, sans-serif`;
  context.textAlign = plan.textAlign;
  context.textBaseline = plan.textBaseline;
  context.fillStyle = plan.color;
  context.shadowColor = plan.shadowColor;
  context.shadowBlur = Math.max(3, plan.fontSize * 0.1);
  context.shadowOffsetY = Math.max(1, plan.fontSize * 0.025);
  context.translate(plan.x, plan.y);
  context.rotate((plan.angle * Math.PI) / 180);
  context.fillText(plan.text, 0, 0, plan.maxWidth);
  context.restore();
}

export function createImageWatermarkOutcome(plan, format, outputBytes) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (!plan || !["jpg", "png", "webp"].includes(normalizedFormat) || !Number.isFinite(outputBytes) || outputBytes < 0) {
    throw new FileLimitError("invalid-watermark-outcome", "The watermark result reported invalid output details. No result was kept; choose the image again and retry.");
  }
  getImageWatermarkPlan(plan.width, plan.height, plan, "watermark-image", "The watermark result");
  return Object.freeze({
    width: plan.width,
    height: plan.height,
    text: plan.text,
    textLength: plan.textLength,
    position: plan.position,
    opacity: plan.opacity,
    angle: plan.angle,
    color: plan.color,
    format: normalizedFormat,
    outputBytes: Math.round(outputBytes),
  });
}
