// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { DOMParser } from "@xmldom/xmldom";
import { FileLimitError, assertExtractedTextLength } from "./file-limits.js";

const WORD_DOCUMENT_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
const DEFAULT_WORD_DOCUMENT_PATH = "word/document.xml";
const WORD_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);
const CONTENT_TYPES_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/package/2006/content-types",
  "http://purl.oclc.org/ooxml/package/content-types",
]);
const MARKUP_COMPATIBILITY_NAMESPACE = "http://schemas.openxmlformats.org/markup-compatibility/2006";
const PACKAGE_RELATIONSHIPS_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/package/2006/relationships",
  "http://purl.oclc.org/ooxml/package/relationships",
]);
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);

function invalidDocx(code, label, message, cause) {
  return new FileLimitError(code, `${label} ${message}`, cause ? { name: label, cause } : { name: label });
}

function parseXml(source, label, partName) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) {
    throw invalidDocx(
      "unsafe-docx-xml",
      label,
      `contains a forbidden document type or entity declaration in ${partName}. Re-save it as a standard DOCX file and try again.`,
    );
  }

  const errors = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: (message) => errors.push(String(message)),
      error: (message) => errors.push(String(message)),
      fatalError: (message) => errors.push(String(message)),
    },
  });
  const document = parser.parseFromString(source, "application/xml");
  const parserErrors = document?.getElementsByTagName?.("parsererror") || [];
  if (!document?.documentElement || errors.length || parserErrors.length) {
    throw invalidDocx(
      "invalid-docx-xml",
      label,
      `contains malformed XML in ${partName}. Re-save it in Word or another trusted editor and try again.`,
    );
  }
  return document;
}

function attributeByLocalName(node, name) {
  for (const attribute of Array.from(node?.attributes || [])) {
    if (attribute.localName === name || attribute.name === name) return attribute.value;
  }
  return "";
}

function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child?.nodeType === 1);
}

function isWordElement(node, name) {
  return node?.nodeType === 1 && node.localName === name && WORD_NAMESPACES.has(node.namespaceURI);
}

function normalizeInternalPartTarget(rawTarget, label) {
  const target = String(rawTarget || "").trim();
  let decodedTarget;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch (error) {
    throw invalidDocx(
      "unsafe-docx-relationship",
      label,
      "contains a malformed main-document relationship target. Re-save it as DOCX and try again.",
      error,
    );
  }

  if (!decodedTarget
    || decodedTarget.includes("\\")
    || decodedTarget.includes("\0")
    || decodedTarget.includes("?")
    || decodedTarget.includes("#")
    || decodedTarget.startsWith("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(decodedTarget)) {
    throw invalidDocx(
      "unsafe-docx-relationship",
      label,
      "contains an unsafe main-document relationship target. Re-save it as DOCX and try again.",
    );
  }

  const relativeTarget = decodedTarget.replace(/^\//, "");
  const segments = relativeTarget.split("/");
  if (!relativeTarget || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw invalidDocx(
      "unsafe-docx-relationship",
      label,
      "contains a traversing or invalid main-document relationship target. Re-save it as DOCX and try again.",
    );
  }
  return segments.join("/");
}

function resolveOfficeDocumentTarget(source, label) {
  const document = parseXml(String(source || ""), label, "_rels/.rels");
  if (document.documentElement.localName !== "Relationships"
    || !PACKAGE_RELATIONSHIPS_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "does not contain a valid package relationship manifest. Re-save it as DOCX and try again.",
    );
  }

  const relationships = elementChildren(document.documentElement).filter((node) =>
    node.localName === "Relationship"
      && PACKAGE_RELATIONSHIPS_NAMESPACES.has(node.namespaceURI)
      && OFFICE_DOCUMENT_RELATIONSHIP_TYPES.has(attributeByLocalName(node, "Type")));
  if (relationships.length > 1) {
    throw invalidDocx(
      "ambiguous-docx-main-part",
      label,
      "declares more than one main Word document part. Re-save it as a standard DOCX file and try again.",
    );
  }
  if (relationships.length === 0) return null;

  const relationship = relationships[0];
  const targetMode = attributeByLocalName(relationship, "TargetMode").trim();
  if (targetMode && targetMode.toLowerCase() !== "internal") {
    throw invalidDocx(
      "external-docx-main-part",
      label,
      "declares its main Word document as an external resource. Save a self-contained DOCX file and try again.",
    );
  }
  return normalizeInternalPartTarget(attributeByLocalName(relationship, "Target"), label);
}

function symbolMarker(node) {
  const clean = (value, pattern, maxLength) => {
    const candidate = String(value || "").trim().slice(0, maxLength);
    return pattern.test(candidate) ? candidate : "";
  };
  const font = clean(attributeByLocalName(node, "font"), /^[\p{L}\p{N} ._-]+$/u, 80);
  const code = clean(attributeByLocalName(node, "char"), /^[0-9a-f]+$/i, 8).toUpperCase();
  const identity = [font, code].filter(Boolean).join(" ");
  return identity ? `[symbol ${identity}]` : "[symbol]";
}

export function extractWordDocumentXmlText(
  source,
  limitsOrTool = "word-to-pdf",
  label = "This DOCX",
  partName = DEFAULT_WORD_DOCUMENT_PATH,
) {
  const document = parseXml(String(source || ""), label, partName);
  if (!isWordElement(document.documentElement, "document")) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "does not contain a valid Word document root. Re-save it as DOCX and try again.",
    );
  }

  const bodies = elementChildren(document.documentElement).filter((node) => isWordElement(node, "body"));
  if (bodies.length !== 1) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "does not contain exactly one Word document body. Re-save it as DOCX and try again.",
    );
  }

  let extractedLength = 0;
  const append = (chunks, value) => {
    const text = String(value || "");
    if (!text) return;
    extractedLength += text.length;
    assertExtractedTextLength(extractedLength, limitsOrTool, label);
    chunks.push(text);
  };

  let paragraphCount = 0;
  const readNode = (node, chunks, insideParagraph = false) => {
    if (node?.nodeType !== 1) return;
    const name = node.localName;
    const isWord = WORD_NAMESPACES.has(node.namespaceURI);

    if (node.namespaceURI === MARKUP_COMPATIBILITY_NAMESPACE && name === "AlternateContent") {
      const fallback = elementChildren(node).find((child) =>
        child.namespaceURI === MARKUP_COMPATIBILITY_NAMESPACE && child.localName === "Fallback");
      if (fallback) readNode(fallback, chunks, insideParagraph);
      return;
    }
    if (isWord && ["del", "delText", "instrText", "moveFrom", "moveFromRangeStart", "moveFromRangeEnd"].includes(name)) return;
    if (isWord && name === "p") {
      if (paragraphCount) append(chunks, "\n\n");
      paragraphCount += 1;
      for (const child of elementChildren(node)) readNode(child, chunks, true);
      return;
    }
    if (isWord && insideParagraph && name === "t") {
      append(chunks, node.textContent || "");
      return;
    }
    if (isWord && insideParagraph && name === "tab") {
      append(chunks, "\t");
      return;
    }
    if (isWord && insideParagraph && (name === "br" || name === "cr" || name === "lastRenderedPageBreak")) {
      append(chunks, "\n");
      return;
    }
    if (isWord && insideParagraph && name === "noBreakHyphen") {
      append(chunks, "\u2011");
      return;
    }
    if (isWord && insideParagraph && name === "softHyphen") {
      append(chunks, "\u00ad");
      return;
    }
    if (isWord && insideParagraph && name === "sym") {
      append(chunks, symbolMarker(node));
      return;
    }
    for (const child of elementChildren(node)) readNode(child, chunks, insideParagraph);
  };

  const output = [];
  for (const child of elementChildren(bodies[0])) readNode(child, output, false);
  return output.join("");
}

function readMainDocumentContentTypes(source, label) {
  const document = parseXml(String(source || ""), label, "[Content_Types].xml");
  if (document.documentElement.localName !== "Types"
    || !CONTENT_TYPES_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "does not contain a valid Office content-type manifest. Re-save it as DOCX and try again.",
    );
  }
  const overrides = Array.from(document.getElementsByTagNameNS("*", "Override"))
    .filter((node) => CONTENT_TYPES_NAMESPACES.has(node.namespaceURI));
  const mainDocumentPaths = new Set();
  for (const node of overrides) {
    if (attributeByLocalName(node, "ContentType") !== WORD_DOCUMENT_CONTENT_TYPE) continue;
    const partName = attributeByLocalName(node, "PartName");
    if (!partName.startsWith("/")) {
      throw invalidDocx(
        "invalid-docx-structure",
        label,
        "contains an invalid main-document content-type path. Re-save it as DOCX and try again.",
      );
    }
    mainDocumentPaths.add(normalizeInternalPartTarget(partName, label));
  }
  if (mainDocumentPaths.size === 0) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "is not a standard DOCX document. Re-save it in DOCX format and try again.",
    );
  }
  return mainDocumentPaths;
}

export async function extractDocxText(file, limitsOrTool = "word-to-pdf") {
  const label = file?.name || "This DOCX";
  const JSZip = (await import("jszip")).default;
  let archive;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (error) {
    throw invalidDocx(
      "invalid-docx-archive",
      label,
      "could not be read as a DOCX archive. Re-save it in Word or another trusted editor and try again.",
      error,
    );
  }

  const contentTypesEntry = archive.file("[Content_Types].xml");
  if (!contentTypesEntry) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      "is missing required Word document parts. Re-save it as DOCX and try again.",
    );
  }

  const rootRelationshipsEntry = archive.file("_rels/.rels");
  let contentTypes;
  let rootRelationships;
  try {
    [contentTypes, rootRelationships] = await Promise.all([
      contentTypesEntry.async("text"),
      rootRelationshipsEntry ? rootRelationshipsEntry.async("text") : Promise.resolve(null),
    ]);
  } catch (error) {
    throw invalidDocx(
      "invalid-docx-entry",
      label,
      "contains a Word document part that could not be expanded safely. Re-save it and try again.",
      error,
    );
  }

  const mainDocumentPaths = readMainDocumentContentTypes(contentTypes, label);
  const relatedDocumentPath = rootRelationships === null
    ? null
    : resolveOfficeDocumentTarget(rootRelationships, label);
  const documentPath = relatedDocumentPath || DEFAULT_WORD_DOCUMENT_PATH;
  if (!mainDocumentPaths.has(documentPath)) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      `does not declare ${documentPath} as its main Word document content type. Re-save it as DOCX and try again.`,
    );
  }

  const documentEntry = archive.file(documentPath);
  if (!documentEntry) {
    throw invalidDocx(
      "invalid-docx-structure",
      label,
      `is missing its declared main Word document part (${documentPath}). Re-save it as DOCX and try again.`,
    );
  }

  let documentXml;
  try {
    documentXml = await documentEntry.async("text");
  } catch (error) {
    throw invalidDocx(
      "invalid-docx-entry",
      label,
      "contains a Word document part that could not be expanded safely. Re-save it and try again.",
      error,
    );
  }
  return extractWordDocumentXmlText(documentXml, limitsOrTool, label, documentPath);
}
