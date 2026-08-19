// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { FileLimitError, getToolLimits } from "../src/lib/file-limits.js";
import { createComparisonHtml, createComparisonView } from "../src/lib/pdf-comparison.js";

test("comparison views preserve exact line order, sides, and counts", () => {
  const view = createComparisonView([
    { value: "Header\r\n" },
    { value: "Old value\n", removed: true },
    { value: "New value\nExtra\n", added: true },
    { value: "Footer" },
  ], "original.pdf", "revised.pdf");

  assert.deepEqual(view.rows, [
    { kind: "unchanged", leftLine: 1, rightLine: 1, text: "Header" },
    { kind: "removed", leftLine: 2, rightLine: null, text: "Old value" },
    { kind: "added", leftLine: null, rightLine: 2, text: "New value" },
    { kind: "added", leftLine: null, rightLine: 3, text: "Extra" },
    { kind: "unchanged", leftLine: 3, rightLine: 4, text: "Footer" },
  ]);
  assert.deepEqual(view.stats, {
    addedLines: 2,
    removedLines: 1,
    unchangedLines: 2,
    changedLines: 3,
    changedBlocks: 2,
    identical: false,
  });
});

test("identical and empty comparisons remain explicit", () => {
  const identical = createComparisonView([{ value: "same\ntext" }], "left.pdf", "right.pdf");
  assert.equal(identical.stats.identical, true);
  assert.equal(identical.stats.changedLines, 0);
  assert.equal(identical.stats.unchangedLines, 2);

  const empty = createComparisonView([], "", "");
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.stats.identical, true);
  assert.equal(empty.leftName, "First PDF");
  assert.equal(empty.rightName, "Second PDF");
});

test("comparison views reject invalid worker output", () => {
  assert.throws(
    () => createComparisonView(null, "left.pdf", "right.pdf"),
    (error) => error instanceof FileLimitError && error.code === "invalid-comparison-changes",
  );
  for (const changes of [
    [null],
    [{ value: 42 }],
    [{ value: "invalid", added: true, removed: true }],
  ]) {
    assert.throws(
      () => createComparisonView(changes, "left.pdf", "right.pdf"),
      (error) => error instanceof FileLimitError && error.code === "invalid-comparison-change",
    );
  }
});

test("comparison views enforce the central character and row limits at the boundary", () => {
  const limits = { ...getToolLimits("compare-pdf"), maxExtractedCharactersTotal: 5, maxExtractedLinesTotal: 2 };
  assert.equal(createComparisonView([{ value: "a\nb\n" }], "a", "b", limits).rows.length, 2);
  assert.throws(
    () => createComparisonView([{ value: "123456" }], "a", "b", limits),
    (error) => error instanceof FileLimitError && error.code === "comparison-view-text-limit",
  );
  assert.throws(
    () => createComparisonView([{ value: "a\nb\nc" }], "a", "b", limits),
    (error) => error instanceof FileLimitError && error.code === "comparison-view-line-limit",
  );
});

test("downloadable comparison HTML is scriptless, self-contained, and escapes untrusted text", () => {
  const view = createComparisonView([
    { value: "<script src=https://example.test/bad.js>alert('&')</script>", added: true },
  ], '<img src="https://example.test/name">.pdf', "revised & final.pdf");
  const html = createComparisonHtml(view);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /<script(?:\s|>)/i);
  assert.doesNotMatch(html, /<img src=/i);
  assert.doesNotMatch(html, /<script src=https:\/\/example\.test\/bad\.js>/i);
  assert.match(html, /&lt;img src=&quot;https:\/\/example\.test\/name&quot;&gt;\.pdf/);
  assert.match(html, /&lt;script src=https:\/\/example\.test\/bad\.js&gt;alert\(&#039;&amp;&#039;\)&lt;\/script&gt;/);
  assert.match(html, /revised &amp; final\.pdf/);
});

test("comparison HTML rejects a missing structured view", () => {
  assert.throws(
    () => createComparisonHtml({}),
    (error) => error instanceof FileLimitError && error.code === "invalid-comparison-view",
  );
});
