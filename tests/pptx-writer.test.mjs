// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import { createTextPresentation } from "../src/lib/pptx-writer.js";

test("text presentation contains one safe, related slide per page", async () => {
  const blob = await createTextPresentation(["Alpha & <beta>", "Second\nline"]);
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.presentationml.presentation");

  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files);
  assert.ok(names.includes("[Content_Types].xml"));
  assert.ok(names.includes("ppt/presentation.xml"));
  assert.ok(names.includes("ppt/slides/slide1.xml"));
  assert.ok(names.includes("ppt/slides/slide2.xml"));
  assert.ok(names.includes("ppt/slides/_rels/slide2.xml.rels"));

  const presentation = await zip.file("ppt/presentation.xml").async("text");
  assert.match(presentation, /<p:sldId id="256" r:id="rId2"\/>/);
  assert.match(presentation, /<p:sldId id="257" r:id="rId3"\/>/);

  const firstSlide = await zip.file("ppt/slides/slide1.xml").async("text");
  assert.match(firstSlide, /Page 1/);
  assert.match(firstSlide, /Alpha &amp; &lt;beta&gt;/);
  assert.doesNotMatch(firstSlide, /Alpha & <beta>/);

  const secondSlide = await zip.file("ppt/slides/slide2.xml").async("text");
  assert.match(secondSlide, /Second/);
  assert.match(secondSlide, /line/);
});

test("text presentation uses the documented empty-page fallback", async () => {
  const blob = await createTextPresentation([""]);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const slide = await zip.file("ppt/slides/slide1.xml").async("text");
  assert.match(slide, /No selectable text found on this page\./);
});

test("text presentation rejects an empty page set", async () => {
  await assert.rejects(createTextPresentation([]), /at least one page/);
});
