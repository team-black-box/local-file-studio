// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractDocxText, extractWordDocumentXmlText } from "../src/lib/docx-text.js";
import { FileLimitError } from "../src/lib/file-limits.js";
import { runTool } from "../src/lib/processors.js";
import { tools } from "../src/tools.js";

const WORD_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STRICT_WORD_NAMESPACE = "http://purl.oclc.org/ooxml/wordprocessingml/main";
const MARKUP_COMPATIBILITY_NAMESPACE = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";
const WORD_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const PACKAGE_RELATIONSHIPS_NAMESPACES = [
  "http://schemas.openxmlformats.org/package/2006/relationships",
  "http://purl.oclc.org/ooxml/package/relationships",
];
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = [
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
];

function wordDocument(body, prefix = "w", namespace = WORD_NAMESPACE) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <${prefix}:document xmlns:${prefix}="${namespace}">
      <${prefix}:body>${body}</${prefix}:body>
    </${prefix}:document>`;
}

function contentTypes(documentPaths = ["word/document.xml"]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="${CONTENT_TYPES_NAMESPACE}">
      ${documentPaths.map((documentPath) =>
        `<Override PartName="/${documentPath}" ContentType="${WORD_CONTENT_TYPE}"/>`).join("")}
    </Types>`;
}

function rootRelationships(relationships, namespace = PACKAGE_RELATIONSHIPS_NAMESPACES[0]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="${namespace}">
      ${relationships.map(({ id, type, target, targetMode }) =>
        `<Relationship Id="${id}" Type="${type}" Target="${target}"${targetMode ? ` TargetMode="${targetMode}"` : ""}/>`).join("")}
    </Relationships>`;
}

async function createDocxFile({
  documentXml = wordDocument("<w:p><w:r><w:t>Hello</w:t></w:r></w:p>"),
  includeContentTypes = true,
  includeDocument = true,
  validContentType = true,
  documentPath = "word/document.xml",
  contentTypeDocumentPaths,
  additionalDocuments = [],
  rootRelationshipsXml = null,
  paddingBytes = 0,
  name = "sample.docx",
} = {}) {
  const zip = new JSZip();
  const declaredDocumentPaths = contentTypeDocumentPaths
    ?? (validContentType ? [documentPath] : []);
  if (includeContentTypes) zip.file("[Content_Types].xml", contentTypes(declaredDocumentPaths));
  if (includeDocument) zip.file(documentPath, documentXml);
  for (const document of additionalDocuments) zip.file(document.path, document.xml);
  if (rootRelationshipsXml !== null) zip.file("_rels/.rels", rootRelationshipsXml);
  if (paddingBytes) zip.file("word/media/highly-compressible.bin", new Uint8Array(paddingBytes));
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return {
    name,
    size: bytes.byteLength,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test("DOCX extraction preserves document order and explicit text boundaries", async () => {
  const xml = wordDocument(`
    <w:p>
      <w:r><w:t>Hello &amp; private</w:t><w:tab/><w:t>world</w:t><w:br/><w:t>next</w:t></w:r>
      <w:del><w:r><w:t>deleted text</w:t></w:r></w:del>
      <w:r><w:instrText>HYPERLINK https://example.invalid</w:instrText></w:r>
    </w:p>
    <w:tbl><w:tr><w:tc><w:p>
      <w:r><w:t>Cell</w:t><w:noBreakHyphen/><w:t>text</w:t><w:sym w:font="Wingdings" w:char="F0B7"/></w:r>
    </w:p></w:tc></w:tr></w:tbl>
    <w:p><w:r><w:t>Final</w:t><w:softHyphen/><w:t>line</w:t></w:r></w:p>
  `);
  const file = await createDocxFile({ documentXml: xml });

  assert.equal(
    await extractDocxText(file),
    "Hello & private\tworld\nnext\n\nCell‑text[symbol Wingdings F0B7]\n\nFinal­line",
  );
});

test("DOCX extraction accepts namespace-prefix variation and strict WordprocessingML", () => {
  const xml = wordDocument("<word:p><word:r><word:t>Prefix safe</word:t></word:r></word:p>", "word");
  assert.equal(extractWordDocumentXmlText(xml), "Prefix safe");

  const strict = wordDocument("<s:p><s:r><s:t>Strict safe</s:t></s:r></s:p>", "s", STRICT_WORD_NAMESPACE);
  assert.equal(extractWordDocumentXmlText(strict), "Strict safe");
});

test("DOCX extraction follows one safe internal main-document relationship", async () => {
  for (const [index, relationshipType] of OFFICE_DOCUMENT_RELATIONSHIP_TYPES.entries()) {
    const documentPath = relationshipType.includes("purl.oclc.org")
      ? "strict/main-document.xml"
      : "custom/main-document.xml";
    const file = await createDocxFile({
      name: "relocated.docx",
      documentPath,
      documentXml: wordDocument(`<w:p><w:r><w:t>${documentPath}</w:t></w:r></w:p>`),
      rootRelationshipsXml: rootRelationships([{
        id: "rId1",
        type: relationshipType,
        target: documentPath,
      }], PACKAGE_RELATIONSHIPS_NAMESPACES[index]),
    });
    assert.equal(await extractDocxText(file), documentPath);
  }
});

test("DOCX extraction rejects external, traversing, and backslash main-document targets without falling back", async () => {
  for (const { target, targetMode, expectedCode } of [
    { target: "https://example.invalid/document.xml", targetMode: "External", expectedCode: "external-docx-main-part" },
    { target: "../word/document.xml", expectedCode: "unsafe-docx-relationship" },
    { target: "word\\document.xml", expectedCode: "unsafe-docx-relationship" },
  ]) {
    const file = await createDocxFile({
      rootRelationshipsXml: rootRelationships([{
        id: "rId1",
        type: OFFICE_DOCUMENT_RELATIONSHIP_TYPES[0],
        target,
        targetMode,
      }]),
    });
    await assert.rejects(
      () => extractDocxText(file),
      (error) => error instanceof FileLimitError && error.code === expectedCode,
      target,
    );
  }
});

test("DOCX extraction rejects ambiguous main-document relationships", async () => {
  const file = await createDocxFile({
    contentTypeDocumentPaths: ["word/document.xml", "custom/main.xml"],
    additionalDocuments: [{
      path: "custom/main.xml",
      xml: wordDocument("<w:p><w:r><w:t>Alternate</w:t></w:r></w:p>"),
    }],
    rootRelationshipsXml: rootRelationships([
      { id: "rId1", type: OFFICE_DOCUMENT_RELATIONSHIP_TYPES[0], target: "word/document.xml" },
      { id: "rId2", type: OFFICE_DOCUMENT_RELATIONSHIP_TYPES[1], target: "custom/main.xml" },
    ]),
  });
  await assert.rejects(
    () => extractDocxText(file),
    (error) => error instanceof FileLimitError && error.code === "ambiguous-docx-main-part",
  );
});

test("DOCX extraction requires the resolved main part to have the DOCX main content type", async () => {
  const file = await createDocxFile({
    additionalDocuments: [{
      path: "custom/main.xml",
      xml: wordDocument("<w:p><w:r><w:t>Undeclared</w:t></w:r></w:p>"),
    }],
    rootRelationshipsXml: rootRelationships([{
      id: "rId1",
      type: OFFICE_DOCUMENT_RELATIONSHIP_TYPES[0],
      target: "custom/main.xml",
    }]),
  });
  await assert.rejects(
    () => extractDocxText(file),
    (error) => error instanceof FileLimitError
      && error.code === "invalid-docx-structure"
      && /does not declare custom\/main\.xml/.test(error.message),
  );
});

test("DOCX extraction rejects lookalike namespaces and reads one fallback branch", () => {
  const lookalike = `
    <evil:document xmlns:evil="urn:not-word">
      <evil:body><evil:p><evil:t>accepted incorrectly</evil:t></evil:p></evil:body>
    </evil:document>`;
  assert.throws(
    () => extractWordDocumentXmlText(lookalike, "word-to-pdf", "lookalike.docx"),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-structure",
  );

  const alternate = `
    <w:document xmlns:w="${WORD_NAMESPACE}" xmlns:mc="${MARKUP_COMPATIBILITY_NAMESPACE}">
      <w:body>
        <w:p><w:r><w:t>Outer</w:t></w:r>
          <mc:AlternateContent>
            <mc:Choice Requires="feature"><w:r><w:t>Choice</w:t></w:r></mc:Choice>
            <mc:Fallback><w:r><w:t>Fallback</w:t></w:r></mc:Fallback>
          </mc:AlternateContent>
        </w:p>
        <w:p><w:r><w:t>Before</w:t><w:drawing><w:txbxContent>
          <w:p><w:r><w:t>Inner</w:t></w:r></w:p>
        </w:txbxContent></w:drawing></w:r></w:p>
      </w:body>
    </w:document>`;
  assert.equal(extractWordDocumentXmlText(alternate), "OuterFallback\n\nBefore\n\nInner");
});

test("DOCX extraction enforces the central text limit while appending", () => {
  const xml = wordDocument("<w:p><w:r><w:t>12345</w:t></w:r></w:p>");
  assert.equal(extractWordDocumentXmlText(xml, { maxFileBytes: 1, maxExtractedCharactersTotal: 5 }, "exact.docx"), "12345");
  assert.throws(
    () => extractWordDocumentXmlText(xml, { maxFileBytes: 1, maxExtractedCharactersTotal: 4 }, "overflow.docx"),
    (error) => error instanceof FileLimitError
      && error.code === "extracted-text-limit"
      && /overflow\.docx.*5 extracted characters.*4/s.test(error.message),
  );
});

test("DOCX extraction rejects active XML declarations and malformed document XML", () => {
  const doctype = `<!DOCTYPE w:document [<!ENTITY remote SYSTEM "https://example.invalid/entity">]>
    ${wordDocument("<w:p><w:r><w:t>&remote;</w:t></w:r></w:p>")}`;
  assert.throws(
    () => extractWordDocumentXmlText(doctype, "word-to-pdf", "unsafe.docx"),
    (error) => error instanceof FileLimitError && error.code === "unsafe-docx-xml",
  );

  const malformed = `<w:document xmlns:w="${WORD_NAMESPACE}"><w:body><w:p><w:r><w:t>broken</w:r></w:p></w:body></w:document>`;
  assert.throws(
    () => extractWordDocumentXmlText(malformed, "word-to-pdf", "malformed.docx"),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-xml",
  );
});

test("DOCX extraction rejects missing or disguised Office parts", async () => {
  const invalidArchive = {
    name: "not-a-docx.docx",
    async arrayBuffer() {
      return new TextEncoder().encode("not a zip archive").buffer;
    },
  };
  await assert.rejects(
    () => extractDocxText(invalidArchive),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-archive",
  );

  const missingDocument = await createDocxFile({ includeDocument: false });
  await assert.rejects(
    () => extractDocxText(missingDocument),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-structure",
  );

  const wrongContentType = await createDocxFile({ validContentType: false });
  await assert.rejects(
    () => extractDocxText(wrongContentType),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-structure",
  );

  const missingBody = await createDocxFile({
    documentXml: `<w:document xmlns:w="${WORD_NAMESPACE}"><w:background/></w:document>`,
  });
  await assert.rejects(
    () => extractDocxText(missingBody),
    (error) => error instanceof FileLimitError && error.code === "invalid-docx-structure",
  );
});

test("Word to PDF still produces a readable PDF through the shared processor", async () => {
  const file = await createDocxFile({
    name: "local-report.docx",
    documentXml: wordDocument("<w:p><w:r><w:t>Local report text</w:t></w:r></w:p>"),
  });
  const wordTool = tools.find(({ slug }) => slug === "word-to-pdf");
  const { results: [result] } = await runTool(wordTool, [file]);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());

  assert.equal(result.name, "local-report.pdf");
  assert.equal(result.blob.type, "application/pdf");
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
  assert.ok(bytes.byteLength > 500);
});

test("Word to PDF rejects excessive archive expansion through shared preflight", async () => {
  const file = await createDocxFile({ name: "compressed.docx", paddingBytes: 1024 * 1024 });
  const wordTool = tools.find(({ slug }) => slug === "word-to-pdf");
  await assert.rejects(
    () => runTool(wordTool, [file]),
    (error) => error instanceof FileLimitError
      && error.code === "archive-ratio-limit"
      && /compressed\.docx.*20× expansion/s.test(error.message),
  );
});
