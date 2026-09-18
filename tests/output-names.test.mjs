// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { nameOutputResults, sanitizeOutputStem, suggestOutputBaseName, uniqueOutputNames, validateOutputName } from "../src/lib/output-names.js";
import { MAX_OUTPUT_NAME_BYTES, MAX_OUTPUT_NAME_CHARACTERS } from "../src/lib/file-limits.js";
import { resultFromBlob, zipResults } from "../src/lib/file-utils.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

const file = (name) => ({ name });
const result = (name) => resultFromBlob(name, new Blob([name], { type: "application/pdf" }));

test("automatic output names include source, operation, batch size, and duplex purpose", () => {
  assert.equal(suggestOutputBaseName("merge-pdf", [file("Statement.pdf"), file("Appendix.pdf")]), "Statement-and-1-more-merged");
  assert.equal(suggestOutputBaseName("merge-pdf", [file("Statement-front.pdf"), file("back.pdf")], { mode: "interleave" }), "Statement-and-1-more-interleaved");
  assert.equal(suggestOutputBaseName("compress-pdf", [file("Statement-compressed.pdf")]), "Statement-compressed");
  assert.equal(suggestOutputBaseName("pdf-to-word", [file("Annual report.pdf")]), "Annual report");
});

test("custom names retain Unicode, remove unsafe path/control characters and enforce existing extension", () => {
  const source = result("source.pdf");
  const [named] = nameOutputResults([source], { outputName: "  Résumé / 2026.PNG  " });
  assert.equal(named.name, "Résumé - 2026.pdf");
  assert.equal(named.blob, source.blob);
  assert.equal(named.id, source.id);
  assert.equal(sanitizeOutputStem("../CON\u202e.pdf"), "file-CON.pdf");
  assert.equal(sanitizeOutputStem("NUL"), "file-NUL");
  assert.equal(validateOutputName(""), "");
  assert.throws(() => validateOutputName("..."), { code: "invalid-output-name" });
  assert.throws(() => validateOutputName("x".repeat(MAX_OUTPUT_NAME_CHARACTERS + 1)), { code: "output-name-too-long" });
  assert.throws(() => validateOutputName("界".repeat(Math.floor(MAX_OUTPUT_NAME_BYTES / 3) + 1)), { code: "output-name-too-long" });
});

test("ZIP names are flat and unique even after normalization, reserved names and pre-numbered collisions", async () => {
  const originals = [result("../report.pdf"), result("REPORT.pdf"), result("report-2.pdf"), result("report.pdf"), result("con.pdf")];
  const [archive] = await zipResults(originals);
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const names = Object.keys(zip.files);
  assert.equal(names.length, originals.length);
  assert.equal(new Set(names.map((name) => name.toLowerCase())).size, originals.length);
  assert.ok(names.every((name) => !name.includes("/") && !name.includes("\\")));
  assert.ok(names.includes("file-con.pdf"));
  for (let index = 0; index < names.length; index += 1) assert.equal(await zip.file(names[index]).async("string"), originals[index].name);
});

test("custom split ZIP names keep actual page numbers/ranges and contents", async () => {
  const [archive] = await zipResults([result("source-page-2.pdf"), result("source-pages-4-8.pdf")], "source-split.zip", { outputName: "My scan.pdf" });
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  assert.deepEqual(Object.keys(zip.files), ["My scan-page-2.pdf", "My scan-pages-4-8.pdf"]);
  const long = "界".repeat(Math.floor(MAX_OUTPUT_NAME_BYTES / 3));
  const named = nameOutputResults([result("source-page-20.pdf")], { outputName: long, archiveEntries: true });
  assert.match(named[0].name, /-page-20\.pdf$/);
  assert.ok(new TextEncoder().encode(named[0].name.replace(/\.pdf$/, "")).length <= MAX_OUTPUT_NAME_BYTES);
});

test("custom batches are numbered deterministically and automatic single splits retain page identity", () => {
  const named = nameOutputResults([result("a.pdf"), result("b.pdf")], { outputName: "my output.zip" });
  assert.deepEqual(named.map(({ name }) => name), ["my output-1.pdf", "my output-2.pdf"]);
  const [split] = nameOutputResults([result("source-pages-2-8.pdf")], { tool: "split-pdf", files: [file("Annual report.pdf")] });
  assert.equal(split.name, "Annual report-pages-2-8.pdf");
  assert.deepEqual(uniqueOutputNames(["x.pdf", "x-2.pdf", "X.pdf"]), ["x.pdf", "x-2.pdf", "X-3.pdf"]);
});

test("invalid custom name fails before any input content is read", async () => {
  const input = { name: "report.pdf", size: 1024, type: "application/pdf", arrayBuffer() { throw new Error("Input must not be read"); } };
  await assert.rejects(runTool(tools.find(({ slug }) => slug === "split-pdf"), [input], { outputName: "x".repeat(MAX_OUTPUT_NAME_CHARACTERS + 1) }), { code: "output-name-too-long" });
});


test("automatic archive names preserve page labels when long source stems need shortening", async () => {
  const source = "a".repeat(MAX_OUTPUT_NAME_BYTES + 20);
  const originals = [result(`${source}-page-50.pdf`), result(`${source}-pages-70-80.pdf`)];
  const [archive] = await zipResults(originals);
  const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
  const names = Object.keys(zip.files);
  assert.equal(names.length, 2);
  assert.match(names[0], /-page-50\.pdf$/);
  assert.match(names[1], /-pages-70-80\.pdf$/);
  for (let index = 0; index < names.length; index += 1) {
    assert.ok(new TextEncoder().encode(names[index].replace(/\.pdf$/, "")).length <= MAX_OUTPUT_NAME_BYTES);
    assert.equal(await zip.file(names[index]).async("string"), originals[index].name);
  }
});
