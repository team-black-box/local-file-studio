// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, assertMinimumFileCount, assertTextSettingLengths, summarizeRejections, validateFileSelection } from "./file-limits.js";
import { preflightToolFiles, toFriendlyResourceError } from "./file-preflight.js";
import { getPdfCompressionPreset } from "./file-utils.js";

const ALIASES = {
  "remove-pdf-pages": "remove-pages",
  "extract-pdf-pages": "extract-pages",
  "add-pdf-page-numbers": "add-page-numbers",
  "summarize-pdf": "ai-summarizer",
  "remove-image-background": "remove-background",
};

function validateNumericOptions(tool, options) {
  for (const setting of tool.settings || []) {
    if (!["number", "range"].includes(setting.type) || options[setting.key] === undefined || options[setting.key] === "") continue;
    const value = Number(options[setting.key]);
    if (!Number.isFinite(value)) {
      throw new FileLimitError("invalid-setting", `${setting.label} must be a valid number before ${tool.name} can run.`);
    }
    if (setting.min !== undefined && value < Number(setting.min)) {
      throw new FileLimitError("setting-below-minimum", `${setting.label} must be at least ${setting.min}${setting.suffix || ""}.`);
    }
    if (setting.max !== undefined && value > Number(setting.max)) {
      throw new FileLimitError("setting-above-maximum", `${setting.label} must be no more than ${setting.max}${setting.suffix || ""}.`);
    }
  }
}

export async function runTool(tool, files, options = {}, report) {
  const slug = ALIASES[tool.slug] || tool.slug;
  const startedAt = performance.now();
  const normalizedOptions = { ...options };
  if (Array.isArray(options.inputPasswords)) {
    normalizedOptions.inputPassword = options.inputPasswords[0];
    normalizedOptions.inputPassword2 = options.inputPasswords[1];
  }
  const selection = validateFileSelection(tool, [], files);
  validateNumericOptions(tool, normalizedOptions);
  assertTextSettingLengths(tool, normalizedOptions);

  if (selection.rejected.length || selection.accepted.length !== files.length) {
    throw new FileLimitError("input-limit", `${summarizeRejections(0, selection.rejected)} ${selection.rejected[0]?.message || ""}`.trim());
  }
  assertMinimumFileCount(tool, files.length);
  if (selection.limits.maxMarkupCharacters && files.length === 0 && !String(normalizedOptions.html || "").trim()) {
    throw new FileLimitError("missing-html-input", `${tool.name} needs an HTML file or pasted markup. Add one in Files or Settings, then try again.`);
  }

  if (slug === "compress-pdf" && typeof normalizedOptions.quality === "string") {
    const preset = getPdfCompressionPreset(normalizedOptions.quality);
    normalizedOptions.quality = preset.quality;
    normalizedOptions.scale = preset.scale;
  }

  if (["jpg-to-pdf", "scan-to-pdf"].includes(slug) && typeof normalizedOptions.margin === "string") {
    normalizedOptions.margin = { none: 0, small: 18, large: 42 }[normalizedOptions.margin] ?? 18;
  }

  normalizedOptions.start = normalizedOptions.startAt ?? normalizedOptions.start;
  normalizedOptions.aspect = normalizedOptions.aspectRatio ?? normalizedOptions.aspect;
  normalizedOptions.blur = normalizedOptions.strength ?? normalizedOptions.blur;
  normalizedOptions.tolerance = { fast: 72, balanced: 54, fine: 38 }[normalizedOptions.edgeQuality] || normalizedOptions.tolerance;

  report?.({ phase: "Checking local safety limits", progress: 0.04 });
  try {
    await preflightToolFiles(tool, files, normalizedOptions, report);
  } catch (error) {
    throw toFriendlyResourceError(error, tool.name);
  }

  report?.({ phase: "Loading local engine", progress: 0.2 });
  let results;
  try {
    results = tool.kind === "image"
      ? await import("./image-processors.js").then(({ processImageTool }) => processImageTool(slug, files, normalizedOptions, report))
      : await import("./pdf-processors.js").then(({ processPdfTool }) => processPdfTool(slug, files, normalizedOptions, report));
    if (normalizedOptions.outputPassword) {
      results = await import("./pdf-output-protection.js")
        .then(({ protectGeneratedPdfResults }) => protectGeneratedPdfResults(results, normalizedOptions.outputPassword));
    }
  } catch (error) {
    throw toFriendlyResourceError(error, tool.name);
  }

  report?.({ phase: "Complete", progress: 1 });
  return {
    results,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
