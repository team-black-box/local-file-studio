// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { DOMParser } from "@xmldom/xmldom";
import { FileLimitError, assertExtractedTextLength, assertPresentationSlideCount } from "./file-limits.js";

const CONTENT_TYPES_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/package/2006/content-types",
  "http://purl.oclc.org/ooxml/package/content-types",
]);
const PACKAGE_RELATIONSHIPS_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/package/2006/relationships",
  "http://purl.oclc.org/ooxml/package/relationships",
]);
const OFFICE_RELATIONSHIPS_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "http://purl.oclc.org/ooxml/officeDocument/relationships",
]);
const OFFICE_DOCUMENT_RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
]);
const SLIDE_RELATIONSHIP_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/slide",
]);
const PRESENTATION_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/presentationml/2006/main",
  "http://purl.oclc.org/ooxml/presentationml/main",
]);
const DRAWING_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/drawingml/2006/main",
  "http://purl.oclc.org/ooxml/drawingml/main",
]);
const PRESENTATION_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
const SLIDE_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";

export const PPTX_FIRST_SLIDE_PREVIEW_CHARACTERS = 1200;

function invalidPptx(code, label, message, cause) {
  return new FileLimitError(code, `${label} ${message}`, cause ? { name: label, cause } : { name: label });
}

function parseXml(source, label, partName) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) {
    throw invalidPptx(
      "unsafe-pptx-xml",
      label,
      `contains a forbidden document type or entity declaration in ${partName}. Re-save it as a standard PPTX file and try again.`,
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
  const document = parser.parseFromString(String(source || ""), "application/xml");
  const parserErrors = document?.getElementsByTagName?.("parsererror") || [];
  if (!document?.documentElement || errors.length || parserErrors.length) {
    throw invalidPptx(
      "invalid-pptx-xml",
      label,
      `contains malformed XML in ${partName}. Re-save it in PowerPoint or another trusted editor and try again.`,
    );
  }
  return document;
}

function elementChildren(node) {
  return Array.from(node?.childNodes || []).filter((child) => child?.nodeType === 1);
}

function attributeByLocalName(node, name, allowedNamespaces = null) {
  for (const attribute of Array.from(node?.attributes || [])) {
    if (attribute.localName !== name && attribute.name !== name) continue;
    if (allowedNamespaces && !allowedNamespaces.has(attribute.namespaceURI)) continue;
    return attribute.value;
  }
  return "";
}

function normalizeInternalPartTarget(rawTarget, label, baseDirectory = "") {
  const target = String(rawTarget || "").trim();
  let decodedTarget;
  try {
    decodedTarget = decodeURIComponent(target);
  } catch (error) {
    throw invalidPptx(
      "unsafe-pptx-relationship",
      label,
      "contains a malformed internal relationship target. Re-save it as PPTX and try again.",
      error,
    );
  }

  if (!decodedTarget
    || decodedTarget.includes("\\")
    || decodedTarget.includes("\0")
    || decodedTarget.includes("?")
    || decodedTarget.includes("#")
    || decodedTarget.includes("//")
    || /^[a-z][a-z0-9+.-]*:/i.test(decodedTarget)) {
    throw invalidPptx(
      "unsafe-pptx-relationship",
      label,
      "contains an unsafe internal relationship target. Re-save it as a self-contained PPTX file and try again.",
    );
  }

  const rooted = decodedTarget.startsWith("/");
  const relativeTarget = decodedTarget.replace(/^\//, "");
  const combined = rooted || !baseDirectory ? relativeTarget : `${baseDirectory}/${relativeTarget}`;
  const segments = combined.split("/");
  if (!combined || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw invalidPptx(
      "unsafe-pptx-relationship",
      label,
      "contains a traversing or invalid internal relationship target. Re-save it as PPTX and try again.",
    );
  }
  return segments.join("/");
}

function directoryName(partName) {
  const separator = partName.lastIndexOf("/");
  return separator < 0 ? "" : partName.slice(0, separator);
}

function relationshipPartName(partName) {
  const directory = directoryName(partName);
  const fileName = partName.slice(directory ? directory.length + 1 : 0);
  return `${directory ? `${directory}/` : ""}_rels/${fileName}.rels`;
}

function readContentTypeOverrides(source, label) {
  const document = parseXml(source, label, "[Content_Types].xml");
  if (document.documentElement.localName !== "Types"
    || !CONTENT_TYPES_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      "does not contain a valid Office content-type manifest. Re-save it as PPTX and try again.",
    );
  }

  const overrides = new Map();
  for (const node of elementChildren(document.documentElement)) {
    if (node.localName !== "Override" || !CONTENT_TYPES_NAMESPACES.has(node.namespaceURI)) continue;
    const partName = attributeByLocalName(node, "PartName");
    if (!partName.startsWith("/")) {
      throw invalidPptx(
        "invalid-pptx-structure",
        label,
        "contains an invalid content-type path. Re-save it as PPTX and try again.",
      );
    }
    const normalized = normalizeInternalPartTarget(partName, label);
    if (overrides.has(normalized)) {
      throw invalidPptx(
        "ambiguous-pptx-content-type",
        label,
        `declares ${normalized} more than once in its content-type manifest. Re-save it as PPTX and try again.`,
      );
    }
    overrides.set(normalized, attributeByLocalName(node, "ContentType"));
  }
  return overrides;
}

function readRelationships(source, label, partName) {
  const document = parseXml(source, label, partName);
  if (document.documentElement.localName !== "Relationships"
    || !PACKAGE_RELATIONSHIPS_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      `does not contain a valid relationship manifest in ${partName}. Re-save it as PPTX and try again.`,
    );
  }

  const relationships = [];
  const identifiers = new Set();
  for (const node of elementChildren(document.documentElement)) {
    if (node.localName !== "Relationship" || !PACKAGE_RELATIONSHIPS_NAMESPACES.has(node.namespaceURI)) continue;
    const id = attributeByLocalName(node, "Id");
    if (!id || identifiers.has(id)) {
      throw invalidPptx(
        "ambiguous-pptx-relationship",
        label,
        `contains a missing or duplicate relationship identifier in ${partName}. Re-save it as PPTX and try again.`,
      );
    }
    identifiers.add(id);
    relationships.push({
      id,
      type: attributeByLocalName(node, "Type"),
      target: attributeByLocalName(node, "Target"),
      targetMode: attributeByLocalName(node, "TargetMode").trim(),
    });
  }
  return relationships;
}

function resolveMainPresentationPath(source, label) {
  const relationships = readRelationships(source, label, "_rels/.rels")
    .filter(({ type }) => OFFICE_DOCUMENT_RELATIONSHIP_TYPES.has(type));
  if (relationships.length !== 1) {
    throw invalidPptx(
      relationships.length ? "ambiguous-pptx-main-part" : "invalid-pptx-structure",
      label,
      relationships.length
        ? "declares more than one main presentation part. Re-save it as a standard PPTX file and try again."
        : "does not declare a main presentation part. Re-save it as PPTX and try again.",
    );
  }
  const relationship = relationships[0];
  if (relationship.targetMode && relationship.targetMode.toLowerCase() !== "internal") {
    throw invalidPptx(
      "external-pptx-main-part",
      label,
      "declares its main presentation as an external resource. Save a self-contained PPTX file and try again.",
    );
  }
  return normalizeInternalPartTarget(relationship.target, label);
}

function readSlideRelationshipIds(source, label, partName) {
  const document = parseXml(source, label, partName);
  if (document.documentElement.localName !== "presentation"
    || !PRESENTATION_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      `does not contain a valid PresentationML root in ${partName}. Re-save it as PPTX and try again.`,
    );
  }
  const slideLists = elementChildren(document.documentElement)
    .filter((node) => node.localName === "sldIdLst" && PRESENTATION_NAMESPACES.has(node.namespaceURI));
  if (slideLists.length > 1) {
    throw invalidPptx(
      "ambiguous-pptx-slide-list",
      label,
      "contains more than one slide list. Re-save it as a standard PPTX file and try again.",
    );
  }
  if (!slideLists.length) return [];

  const relationshipIds = [];
  const seen = new Set();
  for (const node of elementChildren(slideLists[0])) {
    if (node.localName !== "sldId" || !PRESENTATION_NAMESPACES.has(node.namespaceURI)) continue;
    const id = attributeByLocalName(node, "id", OFFICE_RELATIONSHIPS_NAMESPACES);
    if (!id || seen.has(id)) {
      throw invalidPptx(
        "ambiguous-pptx-slide-list",
        label,
        "contains a missing or duplicate slide relationship. Re-save it as PPTX and try again.",
      );
    }
    seen.add(id);
    relationshipIds.push(id);
  }
  return relationshipIds;
}

function resolveSlidePaths(relationshipIds, relationships, presentationPath, contentTypes, label) {
  const relationshipById = new Map(relationships.map((relationship) => [relationship.id, relationship]));
  const slidePaths = [];
  const seenPaths = new Set();
  for (const relationshipId of relationshipIds) {
    const relationship = relationshipById.get(relationshipId);
    if (!relationship || !SLIDE_RELATIONSHIP_TYPES.has(relationship.type)) {
      throw invalidPptx(
        "invalid-pptx-slide-relationship",
        label,
        `does not contain a valid internal slide relationship for ${relationshipId}. Re-save it as PPTX and try again.`,
      );
    }
    if (relationship.targetMode && relationship.targetMode.toLowerCase() !== "internal") {
      throw invalidPptx(
        "external-pptx-slide",
        label,
        "declares a slide as an external resource. Save a self-contained PPTX file and try again.",
      );
    }
    const slidePath = normalizeInternalPartTarget(relationship.target, label, directoryName(presentationPath));
    if (contentTypes.get(slidePath) !== SLIDE_CONTENT_TYPE) {
      throw invalidPptx(
        "invalid-pptx-structure",
        label,
        `does not declare ${slidePath} as a standard PowerPoint slide. Re-save it as PPTX and try again.`,
      );
    }
    if (seenPaths.has(slidePath)) {
      throw invalidPptx(
        "ambiguous-pptx-slide-list",
        label,
        `references ${slidePath} more than once. Re-save it as PPTX and try again.`,
      );
    }
    seenPaths.add(slidePath);
    slidePaths.push(slidePath);
  }
  return slidePaths;
}

function extractSlideText(source, label, partName) {
  const document = parseXml(source, label, partName);
  if (document.documentElement.localName !== "sld"
    || !PRESENTATION_NAMESPACES.has(document.documentElement.namespaceURI)) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      `does not contain a valid PresentationML slide in ${partName}. Re-save it as PPTX and try again.`,
    );
  }

  const textRuns = [];
  const visit = (node) => {
    if (node?.nodeType !== 1) return;
    if (node.localName === "t" && DRAWING_NAMESPACES.has(node.namespaceURI)) {
      const text = String(node.textContent || "").replace(/\s+/g, " ").trim();
      if (text) textRuns.push(text);
      return;
    }
    for (const child of elementChildren(node)) visit(child);
  };
  visit(document.documentElement);
  return textRuns.join(" ");
}

async function readArchiveText(archive, partName, label) {
  const entry = archive.file(partName);
  if (!entry) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      `is missing its declared Office part (${partName}). Re-save it as PPTX and try again.`,
    );
  }
  try {
    return await entry.async("text");
  } catch (error) {
    throw invalidPptx(
      "invalid-pptx-entry",
      label,
      `contains an Office part (${partName}) that could not be expanded safely. Re-save it and try again.`,
      error,
    );
  }
}

export async function extractPptxText(file, limitsOrTool = "powerpoint-to-pdf") {
  const label = file?.name || "This PPTX";
  const JSZip = (await import("jszip")).default;
  let archive;
  try {
    archive = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (error) {
    throw invalidPptx(
      "invalid-pptx-archive",
      label,
      "could not be read as a PPTX archive. Re-save it in PowerPoint or another trusted editor and try again.",
      error,
    );
  }

  const [contentTypesXml, rootRelationshipsXml] = await Promise.all([
    readArchiveText(archive, "[Content_Types].xml", label),
    readArchiveText(archive, "_rels/.rels", label),
  ]);
  const contentTypes = readContentTypeOverrides(contentTypesXml, label);
  const presentationPath = resolveMainPresentationPath(rootRelationshipsXml, label);
  if (contentTypes.get(presentationPath) !== PRESENTATION_CONTENT_TYPE) {
    throw invalidPptx(
      "invalid-pptx-structure",
      label,
      `does not declare ${presentationPath} as a standard PowerPoint presentation. Re-save it as PPTX and try again.`,
    );
  }

  const presentationXml = await readArchiveText(archive, presentationPath, label);
  const relationshipIds = readSlideRelationshipIds(presentationXml, label, presentationPath);
  assertPresentationSlideCount(relationshipIds.length, limitsOrTool, label);

  let slidePaths = [];
  if (relationshipIds.length) {
    const presentationRelationshipsPath = relationshipPartName(presentationPath);
    const presentationRelationshipsXml = await readArchiveText(archive, presentationRelationshipsPath, label);
    const relationships = readRelationships(presentationRelationshipsXml, label, presentationRelationshipsPath);
    slidePaths = resolveSlidePaths(relationshipIds, relationships, presentationPath, contentTypes, label);
  }

  const slides = [];
  let extractedCharacters = 0;
  for (const slidePath of slidePaths) {
    const slideXml = await readArchiveText(archive, slidePath, label);
    const slideText = extractSlideText(slideXml, label, slidePath);
    const section = `SLIDE ${slides.length + 1}\n${slideText}`;
    extractedCharacters += section.length + (slides.length ? 2 : 0);
    assertExtractedTextLength(extractedCharacters, limitsOrTool, label);
    slides.push({ slideNumber: slides.length + 1, partName: slidePath, text: slideText });
  }

  return {
    slides,
    text: slides.map(({ slideNumber, text }) => `SLIDE ${slideNumber}\n${text}`).join("\n\n"),
  };
}

export function createPptxTextPreview(extraction, maxPreviewCharacters = PPTX_FIRST_SLIDE_PREVIEW_CHARACTERS) {
  const slides = Array.isArray(extraction?.slides) ? extraction.slides : [];
  const firstSlideText = String(slides[0]?.text || "");
  const readableText = slides.map(({ text }) => String(text || "")).filter(Boolean).join("\n\n");
  const previewLimit = Number.isSafeInteger(maxPreviewCharacters) && maxPreviewCharacters > 0
    ? maxPreviewCharacters
    : PPTX_FIRST_SLIDE_PREVIEW_CHARACTERS;
  const firstSlidePreview = firstSlideText.slice(0, previewLimit).trimEnd();
  return {
    slideCount: slides.length,
    slidesWithText: slides.filter(({ text }) => String(text || "").trim()).length,
    characterCount: readableText.length,
    firstSlideCharacterCount: firstSlideText.length,
    firstSlidePreview,
    firstSlidePreviewCharacterCount: firstSlidePreview.length,
    firstSlideTruncated: firstSlideText.length > previewLimit,
  };
}
