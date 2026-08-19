// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";

import JSZip from "jszip";

import { FileLimitError } from "../src/lib/file-limits.js";
import { createPptxTextPreview, extractPptxText } from "../src/lib/pptx-text.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

const CONTENT_TYPES_NAMESPACES = [
  "http://schemas.openxmlformats.org/package/2006/content-types",
  "http://purl.oclc.org/ooxml/package/content-types",
];
const PACKAGE_RELATIONSHIPS_NAMESPACES = [
  "http://schemas.openxmlformats.org/package/2006/relationships",
  "http://purl.oclc.org/ooxml/package/relationships",
];
const OFFICE_RELATIONSHIPS_NAMESPACES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
];
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
];
const SLIDE_RELATIONSHIP_TYPES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/slide",
];
const PRESENTATION_NAMESPACES = [
  "http://schemas.openxmlformats.org/presentationml/2006/main",
  "http://purl.oclc.org/ooxml/presentationml/main",
];
const DRAWING_NAMESPACES = [
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
];
const PRESENTATION_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";

function contentTypes(mainPath, slidePaths, namespace = CONTENT_TYPES_NAMESPACES[0]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="${namespace}">
      <Override PartName="/${mainPath}" ContentType="${PRESENTATION_CONTENT_TYPE}"/>
      ${slidePaths.map((path) => `<Override PartName="/${path}" ContentType="${SLIDE_CONTENT_TYPE}"/>`).join("")}
    </Types>`;
}

function relationships(entries, namespace = PACKAGE_RELATIONSHIPS_NAMESPACES[0]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="${namespace}">
      ${entries.map(({ id, type, target, targetMode }) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${targetMode ? ` TargetMode="${targetMode}"` : ""}/>`).join("")}
    </Relationships>`;
}

function presentationXml(relationshipIds, strict = false) {
  const presentationNamespace = PRESENTATION_NAMESPACES[strict ? 1 : 0];
  const relationshipNamespace = OFFICE_RELATIONSHIPS_NAMESPACES[strict ? 1 : 0];
  return `<?xml version="1.0" encoding="UTF-8"?>
    <p:presentation xmlns:p="${presentationNamespace}" xmlns:r="${relationshipNamespace}">
      <p:sldIdLst>${relationshipIds.map((id, index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join("")}</p:sldIdLst>
    </p:presentation>`;
}

function slideXml(textRuns, strict = false) {
  const presentationNamespace = PRESENTATION_NAMESPACES[strict ? 1 : 0];
  const drawingNamespace = DRAWING_NAMESPACES[strict ? 1 : 0];
  return `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="${presentationNamespace}" xmlns:a="${drawingNamespace}">
      <p:cSld><p:spTree><p:sp><p:txBody><a:p>${textRuns.map((text) => `<a:r><a:t>${text}</a:t></a:r>`).join("")}</a:p></p:txBody></p:sp></p:spTree></p:cSld>
    </p:sld>`;
}

function relationshipPartName(partName) {
  const separator = partName.lastIndexOf("/");
  const directory = separator < 0 ? "" : partName.slice(0, separator);
  const fileName = separator < 0 ? partName : partName.slice(separator + 1);
  return `${directory ? `${directory}/` : ""}_rels/${fileName}.rels`;
}

async function createPptxFile({
  name = "sample.pptx",
  mainPath = "ppt/presentation.xml",
  slideEntries = [
    { id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["First slide"] },
    { id: "rId2", path: "ppt/slides/slide2.xml", target: "slides/slide2.xml", textRuns: ["Second slide"] },
  ],
  order = slideEntries.map(({ id }) => id),
  strict = false,
  rootTarget = mainPath,
  rootTargetMode = "",
  rootType = OFFICE_DOCUMENT_RELATIONSHIP_TYPES[strict ? 1 : 0],
  rootRelationshipsXml,
  presentationXmlSource,
  presentationRelationshipsXml,
  contentTypesXml,
  paddingBytes = 0,
} = {}) {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    contentTypesXml ?? contentTypes(mainPath, slideEntries.map(({ path }) => path), CONTENT_TYPES_NAMESPACES[strict ? 1 : 0]),
  );
  zip.file(
    "_rels/.rels",
    rootRelationshipsXml ?? relationships([{ id: "rIdOffice", type: rootType, target: rootTarget, targetMode: rootTargetMode }], PACKAGE_RELATIONSHIPS_NAMESPACES[strict ? 1 : 0]),
  );
  zip.file(mainPath, presentationXmlSource ?? presentationXml(order, strict));
  zip.file(
    relationshipPartName(mainPath),
    presentationRelationshipsXml ?? relationships(
      slideEntries.map(({ id, target }) => ({ id, type: SLIDE_RELATIONSHIP_TYPES[strict ? 1 : 0], target })),
      PACKAGE_RELATIONSHIPS_NAMESPACES[strict ? 1 : 0],
    ),
  );
  for (const entry of slideEntries) zip.file(entry.path, entry.xml ?? slideXml(entry.textRuns || [], strict));
  if (paddingBytes) zip.file("ppt/media/highly-compressible.bin", new Uint8Array(paddingBytes));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test("PPTX extraction follows presentation order and ignores unreferenced slides", async () => {
  const file = await createPptxFile({
    slideEntries: [
      { id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["Second", "physical slide"] },
      { id: "rId2", path: "ppt/slides/slide2.xml", target: "slides/slide2.xml", textRuns: ["First logical slide"] },
      { id: "orphan", path: "ppt/slides/slide3.xml", target: "slides/slide3.xml", textRuns: ["Orphan text"] },
    ],
    order: ["rId2", "rId1"],
  });
  const extraction = await extractPptxText(file);

  assert.deepEqual(extraction.slides.map(({ slideNumber, partName, text }) => ({ slideNumber, partName, text })), [
    { slideNumber: 1, partName: "ppt/slides/slide2.xml", text: "First logical slide" },
    { slideNumber: 2, partName: "ppt/slides/slide1.xml", text: "Second physical slide" },
  ]);
  assert.equal(extraction.text, "SLIDE 1\nFirst logical slide\n\nSLIDE 2\nSecond physical slide");
  assert.doesNotMatch(extraction.text, /Orphan text/);
});

test("PPTX preview reports bounded first-slide text and whole-deck counts", async () => {
  const extraction = await extractPptxText(await createPptxFile({
    slideEntries: [
      { id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["Alpha beta"] },
      { id: "rId2", path: "ppt/slides/slide2.xml", target: "slides/slide2.xml", textRuns: [] },
    ],
  }));
  assert.deepEqual(createPptxTextPreview(extraction, 5), {
    slideCount: 2,
    slidesWithText: 1,
    characterCount: 10,
    firstSlideCharacterCount: 10,
    firstSlidePreview: "Alpha",
    firstSlidePreviewCharacterCount: 5,
    firstSlideTruncated: true,
  });
});

test("PPTX extraction accepts strict Office namespaces", async () => {
  const extraction = await extractPptxText(await createPptxFile({ strict: true }));
  assert.equal(extraction.text, "SLIDE 1\nFirst slide\n\nSLIDE 2\nSecond slide");
});

test("PPTX extraction rejects active XML, malformed XML, and lookalike namespaces", async () => {
  const unsafe = await createPptxFile({
    slideEntries: [{
      id: "rId1",
      path: "ppt/slides/slide1.xml",
      target: "slides/slide1.xml",
      xml: `<!DOCTYPE p:sld [<!ENTITY remote SYSTEM "https://example.invalid/entity">]>${slideXml(["&remote;"])}`,
    }],
  });
  await assert.rejects(
    () => extractPptxText(unsafe),
    (error) => error instanceof FileLimitError && error.code === "unsafe-pptx-xml",
  );

  const malformed = await createPptxFile({
    presentationXmlSource: `<p:presentation xmlns:p="${PRESENTATION_NAMESPACES[0]}"><p:sldIdLst>`,
  });
  await assert.rejects(
    () => extractPptxText(malformed),
    (error) => error instanceof FileLimitError && error.code === "invalid-pptx-xml",
  );

  const lookalike = await createPptxFile({
    presentationXmlSource: `<evil:presentation xmlns:evil="urn:not-powerpoint"><evil:sldIdLst/></evil:presentation>`,
  });
  await assert.rejects(
    () => extractPptxText(lookalike),
    (error) => error instanceof FileLimitError && error.code === "invalid-pptx-structure",
  );
});

test("PPTX extraction rejects external, traversing, ambiguous, and disguised slide relationships", async () => {
  for (const { relationshipXml, expectedCode } of [
    {
      relationshipXml: relationships([{ id: "rId1", type: SLIDE_RELATIONSHIP_TYPES[0], target: "https://example.invalid/slide.xml", targetMode: "External" }]),
      expectedCode: "external-pptx-slide",
    },
    {
      relationshipXml: relationships([{ id: "rId1", type: SLIDE_RELATIONSHIP_TYPES[0], target: "../slides/slide1.xml" }]),
      expectedCode: "unsafe-pptx-relationship",
    },
    {
      relationshipXml: relationships([
        { id: "rId1", type: SLIDE_RELATIONSHIP_TYPES[0], target: "slides/slide1.xml" },
        { id: "rId1", type: SLIDE_RELATIONSHIP_TYPES[0], target: "slides/slide1.xml" },
      ]),
      expectedCode: "ambiguous-pptx-relationship",
    },
    {
      relationshipXml: relationships([{ id: "rId1", type: "urn:not-a-slide", target: "slides/slide1.xml" }]),
      expectedCode: "invalid-pptx-slide-relationship",
    },
  ]) {
    const file = await createPptxFile({
      slideEntries: [{ id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["Safe text"] }],
      presentationRelationshipsXml: relationshipXml,
    });
    await assert.rejects(
      () => extractPptxText(file),
      (error) => error instanceof FileLimitError && error.code === expectedCode,
    );
  }
});

test("PPTX extraction enforces central slide and text limits", async () => {
  const twoSlides = await createPptxFile();
  await assert.rejects(
    () => extractPptxText(twoSlides, { maxFileBytes: 1, maxPresentationSlides: 1, maxExtractedCharactersTotal: 100 }),
    (error) => error instanceof FileLimitError && error.code === "presentation-slide-limit",
  );

  const oneSlide = await createPptxFile({
    slideEntries: [{ id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["ABCDE"] }],
  });
  assert.equal(
    (await extractPptxText(oneSlide, { maxFileBytes: 1, maxPresentationSlides: 1, maxExtractedCharactersTotal: 13 })).text,
    "SLIDE 1\nABCDE",
  );
  await assert.rejects(
    () => extractPptxText(oneSlide, { maxFileBytes: 1, maxPresentationSlides: 1, maxExtractedCharactersTotal: 12 }),
    (error) => error instanceof FileLimitError && error.code === "extracted-text-limit",
  );
});

test("PowerPoint to PDF uses the inspected slide order and reports an honest outcome", async () => {
  const file = await createPptxFile({
    name: "local-deck.pptx",
    slideEntries: [
      { id: "rId1", path: "ppt/slides/slide1.xml", target: "slides/slide1.xml", textRuns: ["Opening slide"] },
      { id: "rId2", path: "ppt/slides/slide2.xml", target: "slides/slide2.xml", textRuns: ["Closing slide"] },
    ],
  });
  const tool = tools.find(({ slug }) => slug === "powerpoint-to-pdf");
  const { results: [result] } = await runTool(tool, [file]);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());

  assert.equal(result.name, "local-deck.pdf");
  assert.equal(result.blob.type, "application/pdf");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.byteLength > 500);
  assert.deepEqual(result.powerpointOutcome, {
    slideCount: 2,
    slidesWithText: 2,
    characterCount: 28,
    firstSlideCharacterCount: 13,
    firstSlideTruncated: false,
    firstSlidePreviewCharacterCount: 13,
    pageCount: 1,
  });
  assert.match(result.details, /1 page · 2 slides · 28 readable characters/);
});

test("PowerPoint to PDF rejects excessive archive expansion through shared preflight", async () => {
  const file = await createPptxFile({ name: "compressed.pptx", paddingBytes: 1024 * 1024 });
  const tool = tools.find(({ slug }) => slug === "powerpoint-to-pdf");
  await assert.rejects(
    () => runTool(tool, [file]),
    (error) => error instanceof FileLimitError
      && error.code === "archive-ratio-limit"
      && /compressed\.pptx.*20× expansion/s.test(error.message),
  );
});
