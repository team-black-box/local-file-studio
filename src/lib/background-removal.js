// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError } from "./file-limits.js";

export const BACKGROUND_REMOVAL_PROFILES = Object.freeze([
  Object.freeze({ value: "light", label: "Light", hint: "Preserve more near the subject.", tolerance: 38 }),
  Object.freeze({ value: "balanced", label: "Balanced", hint: "A practical first pass.", tolerance: 54 }),
  Object.freeze({ value: "strong", label: "Strong", hint: "Remove more background shades.", tolerance: 72 }),
]);

export const BACKGROUND_REMOVAL_BACKGROUNDS = Object.freeze([
  Object.freeze({ value: "transparent", label: "Transparent", hint: "Reusable cutout." }),
  Object.freeze({ value: "white", label: "White", hint: "Clean light background." }),
  Object.freeze({ value: "black", label: "Black", hint: "Dark contrast check." }),
]);

const LEGACY_PROFILE_ALIASES = Object.freeze({ fine: "light", fast: "strong" });

export function getBackgroundRemovalProfile(value = "balanced") {
  const normalized = LEGACY_PROFILE_ALIASES[String(value || "").toLowerCase()] || String(value || "").toLowerCase();
  const profile = BACKGROUND_REMOVAL_PROFILES.find((item) => item.value === normalized);
  if (!profile) {
    throw new FileLimitError("invalid-background-cleanup", "Background cleanup must be Light, Balanced, or Strong. Choose one of the available options and try again.");
  }
  return profile;
}

export function getBackgroundRemovalBackground(value = "transparent") {
  const normalized = String(value || "").toLowerCase();
  const background = BACKGROUND_REMOVAL_BACKGROUNDS.find((item) => item.value === normalized);
  if (!background) {
    throw new FileLimitError("invalid-background-output", "The cutout background must be Transparent, White, or Black. Choose one of the available options and try again.");
  }
  return background;
}

function colorDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function colorHex(color) {
  return `#${color.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
}

export function inspectBackgroundCorners(pixels, width, height) {
  if (!(pixels instanceof Uint8ClampedArray) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height * 4) {
    throw new FileLimitError("invalid-background-pixels", "The background preview reported invalid image pixels. Choose the image again and retry.");
  }
  const indexes = [0, (width - 1) * 4, width * (height - 1) * 4, (width * height - 1) * 4];
  const corners = indexes.map((index) => [pixels[index], pixels[index + 1], pixels[index + 2]]);
  const color = corners.reduce((sum, corner) => [sum[0] + corner[0], sum[1] + corner[1], sum[2] + corner[2]], [0, 0, 0]).map((value) => value / corners.length);
  let spread = 0;
  for (let left = 0; left < corners.length; left += 1) {
    for (let right = left + 1; right < corners.length; right += 1) spread = Math.max(spread, colorDistance(corners[left], corners[right]));
  }
  return Object.freeze({ color: Object.freeze(color), colorHex: colorHex(color), spread: Math.round(spread) });
}

export function applyBackgroundRemovalPixels(pixels, width, height, cleanup = "balanced", outputBackground = "transparent") {
  const profile = getBackgroundRemovalProfile(cleanup);
  const background = getBackgroundRemovalBackground(outputBackground);
  const inspection = inspectBackgroundCorners(pixels, width, height);
  const fill = background.value === "black" ? 0 : 255;
  let removedOpacity = 0;
  let softenedPixels = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const originalAlpha = pixels[index + 3];
    const distance = Math.hypot(
      pixels[index] - inspection.color[0],
      pixels[index + 1] - inspection.color[1],
      pixels[index + 2] - inspection.color[2],
    );
    const maskAlpha = Math.round(Math.max(0, Math.min(255, ((distance - profile.tolerance * 0.55) / (profile.tolerance * 0.65)) * 255)));
    const nextAlpha = Math.min(originalAlpha, maskAlpha);
    removedOpacity += originalAlpha - nextAlpha;
    if (nextAlpha > 0 && nextAlpha < originalAlpha) softenedPixels += 1;

    if (background.value === "transparent") {
      pixels[index + 3] = nextAlpha;
      continue;
    }

    const opacity = nextAlpha / 255;
    pixels[index] = Math.round((pixels[index] * opacity) + (fill * (1 - opacity)));
    pixels[index + 1] = Math.round((pixels[index + 1] * opacity) + (fill * (1 - opacity)));
    pixels[index + 2] = Math.round((pixels[index + 2] * opacity) + (fill * (1 - opacity)));
    pixels[index + 3] = 255;
  }

  const pixelCount = width * height;
  return Object.freeze({
    cleanup: profile.value,
    tolerance: profile.tolerance,
    background: background.value,
    detectedColor: inspection.colorHex,
    cornerSpread: inspection.spread,
    removedPercent: Math.round((removedOpacity / (pixelCount * 255)) * 100),
    softenedPercent: Math.round((softenedPixels / pixelCount) * 100),
  });
}

export function createBackgroundRemovalOutcome(stats, width, height, outputBytes) {
  if (!stats || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !Number.isFinite(outputBytes) || outputBytes < 0) {
    throw new FileLimitError("invalid-background-outcome", "The background result reported invalid output details. Choose the image again and retry.");
  }
  const profile = getBackgroundRemovalProfile(stats.cleanup);
  getBackgroundRemovalBackground(stats.background);
  if (stats.tolerance !== profile.tolerance
    || !/^#[0-9a-f]{6}$/i.test(String(stats.detectedColor || ""))
    || !Number.isInteger(stats.cornerSpread) || stats.cornerSpread < 0 || stats.cornerSpread > 442
    || !Number.isInteger(stats.removedPercent) || stats.removedPercent < 0 || stats.removedPercent > 100
    || !Number.isInteger(stats.softenedPercent) || stats.softenedPercent < 0 || stats.softenedPercent > 100) {
    throw new FileLimitError("invalid-background-outcome", "The background result reported invalid cleanup statistics. No result was kept; choose the image again and retry.");
  }
  return Object.freeze({ ...stats, width, height, outputBytes: Math.round(outputBytes) });
}
