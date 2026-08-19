// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import { FileLimitError } from "../src/lib/file-limits.js";
import {
  HTML_TEXT_PREVIEW_CHARACTERS,
  createHtmlTextPreview,
  extractHtmlText,
} from "../src/lib/html-text.js";
import { textToPdfDocument } from "../src/lib/pdf-processors.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

function htmlFile(markup, name = "sample.html") {
  const bytes = new TextEncoder().encode(markup);
  return {
    name,
    size: bytes.byteLength,
    type: "text/html",
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return markup;
    },
  };
}

test("HTML extraction keeps readable body structure and decodes safe text entities", () => {
  const extraction = extractHtmlText(`<!doctype html>
    <html>
      <head><title>Ignored title</title><style>body { color: red; }</style></head>
      <body>
        <h1>Quarterly &amp; local</h1>
        <p>Hello <strong>team</strong>.<br>Nothing leaves this device.</p>
        <ul><li>First</li><li>Second &#x2713;</li></ul>
        <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>42</td></tr></table>
      </body>
    </html>`);

  assert.equal(extraction.text, "Quarterly & local\n\nHello team.\nNothing leaves this device.\n\n- First\n- Second ✓\n\nName\tValue\nA\t42");
  assert.equal(extraction.characterCount, extraction.text.length);
  assert.equal(extraction.paragraphCount, 4);
  assert.ok(extraction.wordCount > 10);
});

test("HTML extraction ignores executable, interactive, vector, and remote-resource containers", () => {
  const extraction = extractHtmlText(`<main>
    <p>Keep this sentence.</p>
    <script>fetch("https://example.invalid/private")</script>
    <style>@import url("https://example.invalid/style.css")</style>
    <iframe src="https://example.invalid/frame">frame fallback</iframe>
    <object data="https://example.invalid/file">object fallback</object>
    <form action="https://example.invalid/post"><label>Secret</label><input value="private"></form>
    <svg><text>vector text</text></svg>
    <img src="https://example.invalid/image.png" alt="not rendered">
    <p>Keep this too.</p>
  </main>`);

  assert.equal(extraction.text, "Keep this sentence.\n\nKeep this too.");
  assert.doesNotMatch(extraction.text, /example\.invalid|Secret|vector|fallback|fetch/);
});

test("HTML extraction fails closed around quoted tag delimiters and unclosed unsafe containers", () => {
  const quotedAttribute = extractHtmlText('<p>Before</p><img alt="2 > 1" src="https://example.invalid/a.png"><p>After</p>');
  assert.equal(quotedAttribute.text, "Before\n\nAfter");

  const unclosedScript = extractHtmlText('<p>Keep</p><script src="https://example.invalid/a.js">fetch("https://example.invalid/private")<p>Do not recover this');
  assert.equal(unclosedScript.text, "Keep");
});

test("HTML extraction supports fragments and does not require a browser DOM", () => {
  const previousParser = globalThis.DOMParser;
  try {
    globalThis.DOMParser = undefined;
    const extraction = extractHtmlText("<h2>Fragment</h2><p>Readable&nbsp;text &mdash; locally.</p>");
    assert.equal(extraction.text, "Fragment\n\nReadable text — locally.");
  } finally {
    globalThis.DOMParser = previousParser;
  }
});

test("HTML preview is bounded while retaining exact full-text statistics", () => {
  const extraction = extractHtmlText(`<p>${"a".repeat(HTML_TEXT_PREVIEW_CHARACTERS + 25)}</p>`);
  const preview = createHtmlTextPreview(extraction, { pageCount: 3, pageSize: "letter" });

  assert.equal(preview.previewText.length, HTML_TEXT_PREVIEW_CHARACTERS);
  assert.equal(preview.previewCharacterCount, HTML_TEXT_PREVIEW_CHARACTERS);
  assert.equal(preview.characterCount, HTML_TEXT_PREVIEW_CHARACTERS + 25);
  assert.equal(preview.truncated, true);
  assert.equal(preview.pageCount, 3);
  assert.equal(preview.pageSize, "letter");
});

test("HTML extraction enforces markup and extracted-text limits from the central policy", () => {
  assert.throws(
    () => extractHtmlText("<p>123456</p>", { maxFileBytes: 1, maxMarkupCharacters: 5, maxExtractedCharactersTotal: 100 }, "too-large.html"),
    (error) => error instanceof FileLimitError && error.code === "markup-too-large" && /too-large\.html/.test(error.message),
  );
  assert.throws(
    () => extractHtmlText("<p>123456</p>", { maxFileBytes: 1, maxMarkupCharacters: 100, maxExtractedCharactersTotal: 5 }, "text-heavy.html"),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit" && /text-heavy\.html/.test(error.message),
  );
});

test("HTML to PDF rejects text the bundled standard font cannot preserve", async () => {
  await assert.rejects(
    () => textToPdfDocument("Price: ₹ 500", "prices.html", { pageSize: "a4" }, "html-to-pdf"),
    (error) => error instanceof FileLimitError
      && error.code === "unsupported-pdf-text-character"
      && /₹.*U\+20B9.*INR/.test(error.message),
  );
});

test("HTML to PDF uses the inspected text and reports exact page feedback", async () => {
  const markup = "<h1>Local report</h1><p>One readable paragraph.</p><script>throw new Error('never')</script>";
  const file = htmlFile(markup, "local-report.html");
  const tool = tools.find(({ slug }) => slug === "html-to-pdf");
  const extraction = extractHtmlText(markup, tool, file.name);
  const expectedPdf = await textToPdfDocument(extraction.text, file.name, { pageSize: "letter" }, tool.slug);
  const response = await runTool(tool, [file], { pageSize: "letter", html: "<p>ignored because a file is selected</p>" });
  const [result] = response.results;
  const bytes = new Uint8Array(await result.blob.arrayBuffer());

  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.equal(result.htmlOutcome.characterCount, extraction.characterCount);
  assert.equal(result.htmlOutcome.wordCount, extraction.wordCount);
  assert.equal(result.htmlOutcome.paragraphCount, extraction.paragraphCount);
  assert.equal(result.htmlOutcome.pageSize, "letter");
  assert.equal(result.htmlOutcome.pageCount, expectedPdf.getNumberOfPages());
  assert.match(result.details, /1 page · 37 readable characters/);
});

test("HTML to PDF accepts pasted markup without a file", async () => {
  const tool = tools.find(({ slug }) => slug === "html-to-pdf");
  const response = await runTool(tool, [], { pageSize: "a4", html: "<h1>Pasted locally</h1><p>Readable text.</p>" });
  const [result] = response.results;

  assert.equal(result.type, "application/pdf");
  assert.equal(result.htmlOutcome.pageSize, "a4");
  assert.equal(result.htmlOutcome.pageCount, 1);
  assert.equal(result.htmlOutcome.paragraphCount, 2);
});
