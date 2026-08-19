// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import { FileLimitError } from "../src/lib/file-limits.js";
import { textToPdfDocument } from "../src/lib/pdf-processors.js";
import {
  SPREADSHEET_PREVIEW_CELL_CHARACTERS,
  SPREADSHEET_PREVIEW_COLUMNS,
  SPREADSHEET_PREVIEW_ROWS,
  createSpreadsheetTextPreview,
  extractSpreadsheetText,
} from "../src/lib/spreadsheet-text.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

function workbookFile({
  name = "sample.xlsx",
  sheets = [
    { name: "Summary", rows: [["Quarter", "Revenue"], ["Q1", 120], ["Q2", 145]] },
    { name: "Notes", rows: [["Saved values only"]] },
  ],
  bookType = name.toLowerCase().endsWith(".xls") ? "biff8" : "xlsx",
} = {}) {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = sheet.origin ? {} : XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.origin) {
      XLSX.utils.sheet_add_aoa(worksheet, sheet.rows, { origin: sheet.origin });
      const start = XLSX.utils.decode_cell(sheet.origin);
      const width = sheet.rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
      worksheet["!ref"] = XLSX.utils.encode_range({ s: start, e: { r: start.r + sheet.rows.length - 1, c: start.c + width - 1 } });
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  const bytes = XLSX.write(workbook, { type: "array", bookType });
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    name,
    size: view.byteLength,
    type: name.toLowerCase().endsWith(".xls") ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    async arrayBuffer() {
      return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    },
  };
}

test("spreadsheet extraction preserves worksheet order and readable saved values", async () => {
  const extraction = await extractSpreadsheetText(workbookFile());

  assert.equal(extraction.sheetCount, 2);
  assert.equal(extraction.sheetsWithValues, 2);
  assert.equal(extraction.usedCellSlots, 7);
  assert.equal(extraction.text, "Summary\nQuarter  |  Revenue\nQ1  |  120\nQ2  |  145\n\nNotes\nSaved values only");
  assert.deepEqual(extraction.sheets.map(({ name, rowCount, columnCount, valueCount }) => ({ name, rowCount, columnCount, valueCount })), [
    { name: "Summary", rowCount: 3, columnCount: 2, valueCount: 6 },
    { name: "Notes", rowCount: 1, columnCount: 1, valueCount: 1 },
  ]);
});

test("spreadsheet extraction accepts legacy XLS workbooks", async () => {
  const extraction = await extractSpreadsheetText(workbookFile({ name: "legacy.xls" }));
  assert.equal(extraction.sheetCount, 2);
  assert.match(extraction.text, /Quarter  \|  Revenue/);
});

test("spreadsheet preview retains the first used row and column coordinates", async () => {
  const extraction = await extractSpreadsheetText(workbookFile({ sheets: [{ name: "Offset", origin: "C4", rows: [["Start", "Value"], [1, 2]] }] }));
  const preview = createSpreadsheetTextPreview(extraction);
  assert.equal(preview.firstSheet.startRow, 4);
  assert.equal(preview.firstSheet.startColumn, 2);
  assert.equal(preview.firstSheet.rowCount, 2);
  assert.equal(preview.firstSheet.columnCount, 2);
});

test("spreadsheet preview is bounded by rows, columns, and cell characters", async () => {
  const rows = Array.from({ length: SPREADSHEET_PREVIEW_ROWS + 2 }, (_, rowIndex) => (
    Array.from({ length: SPREADSHEET_PREVIEW_COLUMNS + 2 }, (_, columnIndex) => (
      rowIndex === 0 && columnIndex === 0 ? "A".repeat(SPREADSHEET_PREVIEW_CELL_CHARACTERS + 8) : `R${rowIndex + 1}C${columnIndex + 1}`
    ))
  ));
  const extraction = await extractSpreadsheetText(workbookFile({ sheets: [{ name: "Wide", rows }] }));
  const preview = createSpreadsheetTextPreview(extraction, { pageCount: 4, orientation: "portrait" });

  assert.equal(preview.pageCount, 4);
  assert.equal(preview.orientation, "portrait");
  assert.equal(preview.firstSheet.previewRows.length, SPREADSHEET_PREVIEW_ROWS);
  assert.equal(preview.firstSheet.previewRows[0].length, SPREADSHEET_PREVIEW_COLUMNS);
  assert.equal(preview.firstSheet.previewRows[0][0].length, SPREADSHEET_PREVIEW_CELL_CHARACTERS);
  assert.match(preview.firstSheet.previewRows[0][0], /…$/);
  assert.equal(preview.firstSheet.previewTruncatedRows, true);
  assert.equal(preview.firstSheet.previewTruncatedColumns, true);
});

test("spreadsheet extraction enforces central sheet, cell-slot, and text limits", async () => {
  const twoSheets = workbookFile({ sheets: [{ name: "One", rows: [[1]] }, { name: "Two", rows: [[2]] }] });
  await assert.rejects(
    () => extractSpreadsheetText(twoSheets, { maxFileBytes: 1, maxSpreadsheetSheets: 1, maxSpreadsheetCellSlots: 10, maxExtractedCharactersTotal: 100 }),
    (error) => error instanceof FileLimitError && error.code === "spreadsheet-sheet-limit",
  );

  const fourCells = workbookFile({ sheets: [{ name: "Four", rows: [[1, 2], [3, 4]] }] });
  await assert.rejects(
    () => extractSpreadsheetText(fourCells, { maxFileBytes: 1, maxSpreadsheetSheets: 1, maxSpreadsheetCellSlots: 3, maxExtractedCharactersTotal: 100 }),
    (error) => error instanceof FileLimitError && error.code === "spreadsheet-cell-limit",
  );
  await assert.rejects(
    () => extractSpreadsheetText(fourCells, { maxFileBytes: 1, maxSpreadsheetSheets: 1, maxSpreadsheetCellSlots: 4, maxExtractedCharactersTotal: 8 }),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit",
  );
});

test("Excel to PDF uses the inspected workbook and reports exact layout feedback", async () => {
  const file = workbookFile({ name: "quarterly.xlsx" });
  const tool = tools.find(({ slug }) => slug === "excel-to-pdf");
  const extraction = await extractSpreadsheetText(file);
  const expectedPdf = await textToPdfDocument(extraction.text, file.name, { orientation: "portrait" }, tool.slug);
  const response = await runTool(tool, [file], { orientation: "portrait" });
  const [result] = response.results;
  const bytes = new Uint8Array(await result.blob.arrayBuffer());

  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal(result.spreadsheetOutcome.sheetCount, 2);
  assert.equal(result.spreadsheetOutcome.sheetsWithValues, 2);
  assert.equal(result.spreadsheetOutcome.usedCellSlots, 7);
  assert.equal(result.spreadsheetOutcome.orientation, "portrait");
  assert.equal(result.spreadsheetOutcome.pageCount, expectedPdf.getNumberOfPages());
  assert.match(result.details, /2 sheets · 7 used-range cells/);
});

test("Excel to PDF rejects a malformed XLSX package before processing", async () => {
  const bytes = new TextEncoder().encode("not an Office archive");
  const file = {
    name: "broken.xlsx",
    size: bytes.byteLength,
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
  const tool = tools.find(({ slug }) => slug === "excel-to-pdf");
  await assert.rejects(() => runTool(tool, [file], {}), /valid XLSX|Office archive|workbook/i);
});
