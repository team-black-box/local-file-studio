// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, getToolLimits } from "./file-limits.js";

export const MIN_REDACTION_REGION_PERCENT = 0.5;

function fail(code, message, details = {}) {
  throw new FileLimitError(code, message, details);
}

function roundCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function numericCoordinate(value, label, index) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    fail("invalid-redaction-coordinate", `Redaction area ${index + 1} has an invalid ${label}.`, { index, label });
  }
  return roundCoordinate(number);
}

export function clampRedactionRegion(region) {
  const width = Math.max(MIN_REDACTION_REGION_PERCENT, Math.min(100, Number(region?.width) || MIN_REDACTION_REGION_PERCENT));
  const height = Math.max(MIN_REDACTION_REGION_PERCENT, Math.min(100, Number(region?.height) || MIN_REDACTION_REGION_PERCENT));
  return {
    page: Math.max(1, Math.round(Number(region?.page) || 1)),
    x: roundCoordinate(Math.max(0, Math.min(100 - width, Number(region?.x) || 0))),
    y: roundCoordinate(Math.max(0, Math.min(100 - height, Number(region?.y) || 0))),
    width: roundCoordinate(width),
    height: roundCoordinate(height),
  };
}

export function parseRedactionRegions(value, pageCount, limits = getToolLimits("redact-pdf")) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    fail("invalid-redaction-page-count", "The PDF page count is unavailable. Choose the PDF again and retry.", { pageCount });
  }

  const source = typeof value === "string" ? value : JSON.stringify(value ?? []);
  if (source.length > limits.maxRedactionSettingsCharacters) {
    fail(
      "redaction-settings-too-large",
      `Redaction settings exceed the ${limits.maxRedactionSettingsCharacters.toLocaleString()}-character local limit. Remove some areas and retry.`,
      { characters: source.length, maxCharacters: limits.maxRedactionSettingsCharacters },
    );
  }

  let parsed;
  try {
    parsed = source.trim() ? JSON.parse(source) : [];
  } catch {
    fail("invalid-redaction-json", "Redaction area data is not valid JSON. Reset the areas and try again.");
  }
  if (!Array.isArray(parsed)) {
    fail("invalid-redaction-list", "Redaction area data must be a JSON array.");
  }
  if (parsed.length > limits.maxRedactionRegions) {
    fail(
      "too-many-redaction-regions",
      `Choose at most ${limits.maxRedactionRegions.toLocaleString()} redaction areas per PDF.`,
      { count: parsed.length, maxRegions: limits.maxRedactionRegions },
    );
  }

  const perPage = new Map();
  const regions = parsed.map((region, index) => {
    if (!region || typeof region !== "object" || Array.isArray(region)) {
      fail("invalid-redaction-region", `Redaction area ${index + 1} is not a valid area.`, { index });
    }
    const page = Number(region.page);
    if (!Number.isInteger(page) || page < 1 || page > pageCount) {
      fail("invalid-redaction-page", `Redaction area ${index + 1} must use a page from 1 to ${pageCount.toLocaleString()}.`, { index, page });
    }
    const x = numericCoordinate(region.x, "horizontal position", index);
    const y = numericCoordinate(region.y, "vertical position", index);
    const width = numericCoordinate(region.width, "width", index);
    const height = numericCoordinate(region.height, "height", index);
    if (x < 0 || y < 0 || width < MIN_REDACTION_REGION_PERCENT || height < MIN_REDACTION_REGION_PERCENT || x + width > 100 || y + height > 100) {
      fail(
        "redaction-region-out-of-bounds",
        `Redaction area ${index + 1} must stay inside page ${page} and be at least ${MIN_REDACTION_REGION_PERCENT}% wide and tall.`,
        { index, page, x, y, width, height },
      );
    }
    const nextPageCount = (perPage.get(page) || 0) + 1;
    if (nextPageCount > limits.maxRedactionRegionsPerPage) {
      fail(
        "too-many-page-redactions",
        `Page ${page} has more than ${limits.maxRedactionRegionsPerPage.toLocaleString()} redaction areas.`,
        { page, count: nextPageCount, maxRegionsPerPage: limits.maxRedactionRegionsPerPage },
      );
    }
    perPage.set(page, nextPageCount);
    return { page, x, y, width, height };
  });

  return regions;
}

export function serializeRedactionRegions(regions, pageCount, limits = getToolLimits("redact-pdf")) {
  return JSON.stringify(parseRedactionRegions(regions, pageCount, limits));
}

export function createRedactionPlan(value, pageCount, limits = getToolLimits("redact-pdf")) {
  const regions = parseRedactionRegions(value, pageCount, limits);
  if (!regions.length) {
    fail("missing-redaction-region", "Draw or add at least one area to redact.");
  }
  const byPage = Object.create(null);
  for (const region of regions) (byPage[region.page] ||= []).push(region);
  const affectedPages = Object.keys(byPage).map(Number).sort((a, b) => a - b);
  return {
    regions,
    byPage,
    regionCount: regions.length,
    affectedPages,
    affectedPageCount: affectedPages.length,
  };
}
