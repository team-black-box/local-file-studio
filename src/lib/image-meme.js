// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, assertOutputDimensions, getTextSettingLimit, getToolLimits } from "./file-limits.js";

export const IMAGE_MEME_CASES = Object.freeze([
  Object.freeze({ value: "uppercase", label: "Meme caps", hint: "Classic all-caps captions." }),
  Object.freeze({ value: "original", label: "Keep typing", hint: "Preserve the case you enter." }),
]);

export const IMAGE_MEME_MAX_LINES = 4;

export function getImageMemeCase(value = "uppercase") {
  const normalized = String(value || "").toLowerCase();
  const choice = IMAGE_MEME_CASES.find((item) => item.value === normalized);
  if (!choice) throw new FileLimitError("invalid-meme-case", "Caption case must be Meme caps or Keep typing. Choose an available option and try again.");
  return choice;
}

function normalizeCaption(value, letterCase) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return letterCase === "uppercase" ? normalized.toUpperCase() : normalized;
}

function splitLongToken(token, maxWidth, measure) {
  const chunks = [];
  let chunk = "";
  for (const character of Array.from(token)) {
    const candidate = `${chunk}${character}`;
    if (chunk && measure(candidate) > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function wrapImageMemeCaption(text, maxWidth, measure) {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0 || typeof measure !== "function") {
    throw new FileLimitError("invalid-meme-layout", "The meme caption area is unavailable. Choose the image again and retry.");
  }
  const normalized = String(text || "").trim();
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/).flatMap((token) => measure(token) > maxWidth ? splitLongToken(token, maxWidth, measure) : [token]);
  const lines = [];
  let line = "";
  for (const token of tokens) {
    const candidate = line ? `${line} ${token}` : token;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = token;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function getImageMemePlan(width, height, options = {}, measureText, limitsOrTool = "meme-generator", label = "This meme") {
  const limits = limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool);
  const normalizedWidth = Math.round(Number(width));
  const normalizedHeight = Math.round(Number(height));
  assertOutputDimensions(normalizedWidth, normalizedHeight, limits, label);
  if (typeof measureText !== "function") throw new FileLimitError("invalid-meme-layout", "The browser could not measure the meme captions. Choose the image again and retry.");

  const letterCase = getImageMemeCase(options.letterCase).value;
  const topText = normalizeCaption(options.topText === undefined ? "WHEN THE FILE" : options.topText, letterCase);
  const bottomText = normalizeCaption(options.bottomText === undefined ? "STAYS ON YOUR DEVICE" : options.bottomText, letterCase);
  const maximumCaptionLength = getTextSettingLimit("meme-generator", "topText");
  for (const [caption, position] of [[topText, "Top"], [bottomText, "Bottom"]]) {
    if (caption.length > maximumCaptionLength) throw new FileLimitError("meme-caption-limit", `${position} caption has ${caption.length.toLocaleString()} characters; the local limit is ${maximumCaptionLength.toLocaleString()}. Shorten the caption and try again.`);
  }
  if (!topText && !bottomText) throw new FileLimitError("missing-meme-caption", "Enter a top or bottom caption before creating the meme.");

  const maxWidth = normalizedWidth * 0.9;
  const maximumFontSize = Math.max(24, Math.round(Math.min(normalizedWidth, normalizedHeight) * 0.09));
  const minimumFontSize = Math.max(14, Math.round(Math.min(normalizedWidth, normalizedHeight) * 0.035));
  let selected = null;
  for (let fontSize = maximumFontSize; fontSize >= minimumFontSize; fontSize -= 2) {
    const measure = (text) => {
      const measured = Number(measureText(text, fontSize));
      if (!Number.isFinite(measured) || measured < 0) throw new FileLimitError("invalid-meme-layout", "The browser could not measure the meme captions. Choose the image again and retry.");
      return measured;
    };
    const topLines = wrapImageMemeCaption(topText, maxWidth, measure);
    const bottomLines = wrapImageMemeCaption(bottomText, maxWidth, measure);
    const lineHeight = fontSize * 1.08;
    const topHeight = topLines.length * lineHeight;
    const bottomHeight = bottomLines.length * lineHeight;
    if (topLines.length <= IMAGE_MEME_MAX_LINES
      && bottomLines.length <= IMAGE_MEME_MAX_LINES
      && topHeight <= normalizedHeight * 0.31
      && bottomHeight <= normalizedHeight * 0.31
      && topHeight + bottomHeight <= normalizedHeight * 0.68) {
      selected = { fontSize, lineHeight, topLines, bottomLines, topHeight, bottomHeight };
      break;
    }
  }

  if (!selected) throw new FileLimitError("meme-caption-does-not-fit", `The caption needs more than ${IMAGE_MEME_MAX_LINES} lines at a readable size. Shorten it and try again.`);
  const padding = Math.max(selected.fontSize * 0.58, normalizedHeight * 0.035);
  const topStartY = padding + selected.fontSize / 2;
  const bottomStartY = normalizedHeight - padding - selected.bottomHeight + selected.fontSize / 2;

  return Object.freeze({
    width: normalizedWidth,
    height: normalizedHeight,
    letterCase,
    topText,
    bottomText,
    topTextLength: topText.length,
    bottomTextLength: bottomText.length,
    topLines: Object.freeze(selected.topLines),
    bottomLines: Object.freeze(selected.bottomLines),
    fontSize: selected.fontSize,
    lineHeight: selected.lineHeight,
    maxWidth,
    x: normalizedWidth / 2,
    topStartY,
    bottomStartY,
    lineWidth: Math.max(3, selected.fontSize * 0.09),
  });
}

export function drawImageMeme(context, plan) {
  if (!context || !plan) throw new FileLimitError("invalid-meme-canvas", "The meme canvas is unavailable. Choose the image again and retry.");
  context.save();
  context.font = `900 ${plan.fontSize}px Manrope, Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0,0,0,.94)";
  context.lineWidth = plan.lineWidth;
  context.fillStyle = "#ffffff";
  for (const [lines, startY] of [[plan.topLines, plan.topStartY], [plan.bottomLines, plan.bottomStartY]]) {
    lines.forEach((line, index) => {
      const y = startY + index * plan.lineHeight;
      context.strokeText(line, plan.x, y, plan.maxWidth);
      context.fillText(line, plan.x, y, plan.maxWidth);
    });
  }
  context.restore();
}

export function createImageMemeOutcome(plan, format, outputBytes) {
  const normalizedFormat = String(format || "").toLowerCase();
  if (!plan
    || !Number.isInteger(plan.width) || plan.width < 1
    || !Number.isInteger(plan.height) || plan.height < 1
    || !Number.isInteger(plan.topTextLength) || plan.topTextLength < 0
    || !Number.isInteger(plan.bottomTextLength) || plan.bottomTextLength < 0
    || !Array.isArray(plan.topLines) || plan.topLines.length > IMAGE_MEME_MAX_LINES
    || !Array.isArray(plan.bottomLines) || plan.bottomLines.length > IMAGE_MEME_MAX_LINES
    || !Number.isFinite(plan.fontSize) || plan.fontSize < 1
    || !["jpg", "png", "webp"].includes(normalizedFormat)
    || !Number.isFinite(outputBytes) || outputBytes < 0) {
    throw new FileLimitError("invalid-meme-outcome", "The meme result reported invalid output details. No result was kept; choose the image again and retry.");
  }
  getImageMemeCase(plan.letterCase);
  return Object.freeze({
    width: plan.width,
    height: plan.height,
    topTextLength: plan.topTextLength,
    bottomTextLength: plan.bottomTextLength,
    topLineCount: plan.topLines.length,
    bottomLineCount: plan.bottomLines.length,
    fontSize: plan.fontSize,
    letterCase: plan.letterCase,
    format: normalizedFormat,
    outputBytes: Math.round(outputBytes),
  });
}
