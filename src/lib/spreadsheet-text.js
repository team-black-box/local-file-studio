// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  FileLimitError,
  assertExtractedTextLength,
  assertSpreadsheetComplexity,
  getToolLimits,
} from "./file-limits.js";

export const SPREADSHEET_PREVIEW_ROWS = 8;
export const SPREADSHEET_PREVIEW_COLUMNS = 6;
export const SPREADSHEET_PREVIEW_CELL_CHARACTERS = 96;

function resolveLimits(limitsOrTool) {
  return limitsOrTool?.maxFileBytes ? limitsOrTool : getToolLimits(limitsOrTool || "excel-to-pdf");
}

function toCellText(value) {
  if (value == null) return "";
  return String(value).replaceAll("\u0000", "");
}

function previewCell(value) {
  const text = toCellText(value);
  return text.length > SPREADSHEET_PREVIEW_CELL_CHARACTERS
    ? `${text.slice(0, SPREADSHEET_PREVIEW_CELL_CHARACTERS - 1)}…`
    : text;
}

function readUsedRange(XLSX, worksheet, sheetName, sourceLabel) {
  const reference = worksheet?.["!ref"];
  if (!reference) return { startRow: 1, startColumn: 0, rowCount: 0, columnCount: 0, cellSlots: 0 };

  let range;
  try {
    range = XLSX.utils.decode_range(reference);
  } catch {
    throw new FileLimitError(
      "invalid-cell-range",
      `${sourceLabel} contains an invalid used range in sheet "${sheetName}". Clear that sheet's used range and save a fresh copy.`,
    );
  }

  const rowCount = range.e.r - range.s.r + 1;
  const columnCount = range.e.c - range.s.c + 1;
  const cellSlots = rowCount * columnCount;
  if (![rowCount, columnCount, cellSlots].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new FileLimitError(
      "invalid-cell-range",
      `${sourceLabel} contains an unsafe used range in sheet "${sheetName}". Clear unused rows or columns and save a fresh copy.`,
    );
  }
  return { startRow: range.s.r + 1, startColumn: range.s.c, rowCount, columnCount, cellSlots };
}

export async function extractSpreadsheetText(file, limitsOrTool = "excel-to-pdf") {
  const limits = resolveLimits(limitsOrTool);
  const sourceLabel = file?.name || "This workbook";
  const XLSX = await import("xlsx");
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookDeps: false,
      bookVBA: false,
    });
  } catch {
    throw new FileLimitError(
      "invalid-spreadsheet",
      `${sourceLabel} could not be read as an XLS or XLSX workbook. Open it in a spreadsheet app, save a fresh copy, and try again.`,
    );
  }

  const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
  if (!sheetNames.length) {
    throw new FileLimitError("empty-spreadsheet", `${sourceLabel} does not contain any worksheets. Add a worksheet and try again.`);
  }
  if (new Set(sheetNames).size !== sheetNames.length) {
    throw new FileLimitError("duplicate-spreadsheet-sheet", `${sourceLabel} contains duplicate worksheet names. Rename the duplicate sheets and save a fresh copy.`);
  }
  assertSpreadsheetComplexity(sheetNames.length, 0, limits, sourceLabel);

  let usedCellSlots = 0;
  let extractedCharacters = 0;
  const sections = [];
  const sheets = [];

  for (const sheetNameValue of sheetNames) {
    const sheetName = toCellText(sheetNameValue);
    const worksheetCollection = workbook.Sheets;
    const worksheet = worksheetCollection && Object.hasOwn(worksheetCollection, sheetNameValue) ? worksheetCollection[sheetNameValue] : null;
    if (!worksheet || typeof worksheet !== "object") {
      throw new FileLimitError("invalid-spreadsheet-structure", `${sourceLabel} is missing worksheet "${sheetName}". Save a fresh copy and try again.`);
    }

    const range = readUsedRange(XLSX, worksheet, sheetName, sourceLabel);
    if (!Number.isSafeInteger(usedCellSlots + range.cellSlots)) {
      throw new FileLimitError("invalid-cell-range", `${sourceLabel} contains unsafe worksheet ranges. Clear unused rows or columns and save a fresh copy.`);
    }
    usedCellSlots += range.cellSlots;
    assertSpreadsheetComplexity(sheetNames.length, usedCellSlots, limits, sourceLabel);

    let rows;
    try {
      rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });
      if (!Array.isArray(rows)) throw new Error("Worksheet values were not returned as rows.");
    } catch {
      throw new FileLimitError("invalid-spreadsheet-values", `${sourceLabel} contains unreadable values in sheet "${sheetName}". Save a fresh copy and try again.`);
    }

    const normalizedRows = rows.map((row) => (Array.isArray(row) ? Array.from(row, toCellText) : []));
    const lines = [sheetName];
    let sectionLength = sheetName.length;
    let valueCount = 0;
    for (const row of normalizedRows) {
      for (const cell of row) if (cell.trim()) valueCount += 1;
      const line = row.join("  |  ");
      sectionLength += 1 + line.length;
      assertExtractedTextLength(extractedCharacters + (sections.length ? 2 : 0) + sectionLength, limits, sourceLabel);
      lines.push(line);
    }

    const section = lines.join("\n");
    extractedCharacters += section.length + (sections.length ? 2 : 0);
    assertExtractedTextLength(extractedCharacters, limits, sourceLabel);
    sections.push(section);

    const previewRows = normalizedRows
      .slice(0, SPREADSHEET_PREVIEW_ROWS)
      .map((row) => row.slice(0, SPREADSHEET_PREVIEW_COLUMNS).map(previewCell));
    const maximumRowColumns = normalizedRows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    sheets.push({
      name: sheetName,
      startRow: range.startRow,
      startColumn: range.startColumn,
      rowCount: range.rowCount,
      columnCount: range.columnCount,
      cellSlots: range.cellSlots,
      valueCount,
      previewRows,
      previewTruncatedRows: normalizedRows.length > SPREADSHEET_PREVIEW_ROWS,
      previewTruncatedColumns: maximumRowColumns > SPREADSHEET_PREVIEW_COLUMNS,
    });
  }

  const text = sections.join("\n\n");
  assertExtractedTextLength(text.length, limits, sourceLabel);
  return {
    text,
    sheetCount: sheets.length,
    sheetsWithValues: sheets.filter((sheet) => sheet.valueCount > 0).length,
    usedCellSlots,
    characterCount: text.length,
    sheets,
  };
}

export function createSpreadsheetTextPreview(extraction, { pageCount = 0, orientation = "landscape" } = {}) {
  const sheets = Array.isArray(extraction?.sheets) ? extraction.sheets : [];
  const firstSheet = sheets[0] || null;
  return {
    sheetCount: Number(extraction?.sheetCount || sheets.length || 0),
    sheetsWithValues: Number(extraction?.sheetsWithValues || 0),
    usedCellSlots: Number(extraction?.usedCellSlots || 0),
    characterCount: Number(extraction?.characterCount || 0),
    pageCount: Number(pageCount || 0),
    orientation: orientation === "portrait" ? "portrait" : "landscape",
    firstSheet: firstSheet ? {
      name: firstSheet.name,
      startRow: firstSheet.startRow,
      startColumn: firstSheet.startColumn,
      rowCount: firstSheet.rowCount,
      columnCount: firstSheet.columnCount,
      valueCount: firstSheet.valueCount,
      previewRows: firstSheet.previewRows,
      previewTruncatedRows: Boolean(firstSheet.previewTruncatedRows),
      previewTruncatedColumns: Boolean(firstSheet.previewTruncatedColumns),
    } : null,
  };
}
