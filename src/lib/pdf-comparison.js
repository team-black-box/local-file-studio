// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, getToolLimits } from "./file-limits.js";

export const COMPARISON_ROWS_PER_PAGE = 80;

function fail(code, message, details = {}) {
  throw new FileLimitError(code, message, details);
}

function logicalLines(value) {
  const normalized = String(value).replace(/\r\n?/g, "\n");
  if (!normalized.length) return [];
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  return lines;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

export function createComparisonView(changes, leftName, rightName, limits = getToolLimits("compare-pdf")) {
  if (!Array.isArray(changes)) {
    fail("invalid-comparison-changes", "The local comparison worker returned an invalid result. Reload the app and retry.");
  }

  const rows = [];
  let leftLine = 1;
  let rightLine = 1;
  let sourceCharacters = 0;
  let changedBlocks = 0;
  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  changes.forEach((part, partIndex) => {
    if (!part || typeof part !== "object" || typeof part.value !== "string" || (part.added === true && part.removed === true)) {
      fail("invalid-comparison-change", `Comparison block ${partIndex + 1} is invalid. Reload the app and retry.`, { partIndex });
    }
    sourceCharacters += part.value.length;
    if (sourceCharacters > limits.maxExtractedCharactersTotal) {
      fail(
        "comparison-view-text-limit",
        `The comparison view exceeds the ${limits.maxExtractedCharactersTotal.toLocaleString()}-character local limit. Compare smaller page ranges first.`,
        { sourceCharacters, maxCharacters: limits.maxExtractedCharactersTotal },
      );
    }

    const kind = part.added === true ? "added" : part.removed === true ? "removed" : "unchanged";
    if (kind !== "unchanged") changedBlocks += 1;
    for (const text of logicalLines(part.value)) {
      if (rows.length >= limits.maxExtractedLinesTotal) {
        fail(
          "comparison-view-line-limit",
          `The comparison view exceeds the ${limits.maxExtractedLinesTotal.toLocaleString()}-line local limit. Compare smaller page ranges first.`,
          { rows: rows.length + 1, maxRows: limits.maxExtractedLinesTotal },
        );
      }
      if (kind === "added") {
        rows.push({ kind, leftLine: null, rightLine, text });
        rightLine += 1;
        addedLines += 1;
      } else if (kind === "removed") {
        rows.push({ kind, leftLine, rightLine: null, text });
        leftLine += 1;
        removedLines += 1;
      } else {
        rows.push({ kind, leftLine, rightLine, text });
        leftLine += 1;
        rightLine += 1;
        unchangedLines += 1;
      }
    }
  });

  return {
    leftName: String(leftName || "First PDF"),
    rightName: String(rightName || "Second PDF"),
    rows,
    stats: {
      addedLines,
      removedLines,
      unchangedLines,
      changedLines: addedLines + removedLines,
      changedBlocks,
      identical: changedBlocks === 0,
    },
  };
}

export function createComparisonHtml(view) {
  if (!view || !Array.isArray(view.rows) || !view.stats) {
    fail("invalid-comparison-view", "The local comparison report could not be prepared. Reload the app and retry.");
  }
  const summary = view.stats.identical
    ? "No selectable-text differences found"
    : `${view.stats.addedLines.toLocaleString()} added lines and ${view.stats.removedLines.toLocaleString()} removed lines`;
  const rows = view.rows.map((row) => {
    const marker = row.kind === "added" ? "+" : row.kind === "removed" ? "−" : "";
    const left = row.leftLine ?? "";
    const right = row.rightLine ?? "";
    return `<div class="diff-row ${row.kind}"><span class="marker">${marker}</span><span class="line">${left}</span><span class="line">${right}</span><pre>${escapeHtml(row.text)}</pre></div>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Local PDF comparison</title><style>
:root{color-scheme:light dark;font:15px/1.5 system-ui,sans-serif}body{margin:0;background:#f4f2ec;color:#1d2427}main{max-width:1100px;margin:0 auto;padding:40px 24px}.report{background:#fff;border:1px solid #d8d4ca;border-radius:12px;overflow:hidden}.report>header{padding:24px;border-bottom:1px solid #d8d4ca}h1{margin:0 0 6px;font-size:24px}.files,.summary{margin:4px 0;color:#5b6265;overflow-wrap:anywhere}.diff-row{display:grid;grid-template-columns:28px 54px 54px minmax(0,1fr);min-height:26px;border-bottom:1px solid #ece9e2}.diff-row:last-child{border-bottom:0}.marker,.line{padding:3px 8px;text-align:right;color:#6d7274;user-select:none}.marker{font-weight:800}.diff-row pre{margin:0;padding:3px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}.added{background:#e7f5ed}.added .marker{color:#19744e}.removed{background:#fff0ed}.removed .marker{color:#b24734}.unchanged{color:#73787a}@media(prefers-color-scheme:dark){body{background:#161b1d;color:#edf0ee}.report{background:#202729;border-color:#465052}.report>header,.diff-row{border-color:#394245}.files,.summary,.line{color:#aeb7b4}.added{background:#163b2d}.removed{background:#4a2723}.unchanged{color:#bdc4c2}}
</style></head><body><main><article class="report"><header><h1>PDF text comparison</h1><p class="files">${escapeHtml(view.leftName)} ↔ ${escapeHtml(view.rightName)}</p><p class="summary">${escapeHtml(summary)} · generated locally</p></header><section aria-label="Line comparison">${rows || '<p class="summary" style="padding:24px">No selectable text was available to display.</p>'}</section></article></main></body></html>`;
}
