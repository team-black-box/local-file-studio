// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  FileLimitError,
  assertExtractedTextLength,
  getToolLimits,
} from "./file-limits.js";

export const HTML_TEXT_PREVIEW_CHARACTERS = 1600;

const IGNORED_CONTAINERS = new Set([
  "canvas",
  "embed",
  "form",
  "head",
  "iframe",
  "math",
  "noscript",
  "object",
  "script",
  "style",
  "svg",
  "template",
]);

const PARAGRAPH_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "main",
  "nav",
  "ol",
  "p",
  "section",
  "table",
  "tbody",
  "tfoot",
  "thead",
  "ul",
]);

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  emdash: "—",
  emsp: " ",
  ensp: " ",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "“",
  lsquo: "‘",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: "\"",
  raquo: "»",
  rdquo: "”",
  reg: "®",
  rsquo: "’",
  trade: "™",
});

function resolveLimits(limitsOrTool) {
  return limitsOrTool?.maxFileBytes
    ? limitsOrTool
    : getToolLimits(limitsOrTool || "html-to-pdf");
}

function decodeEntity(reference) {
  const normalized = String(reference || "");
  let codePoint;
  if (/^#x[0-9a-f]+$/i.test(normalized)) codePoint = Number.parseInt(normalized.slice(2), 16);
  else if (/^#[0-9]+$/.test(normalized)) codePoint = Number.parseInt(normalized.slice(1), 10);
  else return NAMED_ENTITIES[normalized.toLowerCase()] ?? `&${normalized};`;

  if (!Number.isSafeInteger(codePoint)
    || codePoint <= 0
    || codePoint > 0x10ffff
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "�";
  if (codePoint < 32 && ![9, 10, 13].includes(codePoint)) return "";
  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(value) {
  return String(value || "").replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi, (_, reference) => decodeEntity(reference));
}

function readTag(source, start) {
  if (source.startsWith("<!--", start)) {
    const end = source.indexOf("-->", start + 4);
    return { end: end < 0 ? source.length : end + 3, ignored: true };
  }

  let quote = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character !== ">") continue;

    const raw = source.slice(start + 1, index);
    const match = raw.match(/^\s*(\/?)\s*([a-z][a-z0-9:-]*)/i);
    if (!match) return { end: index + 1, ignored: true };
    const qualifiedName = match[2].toLowerCase();
    return {
      end: index + 1,
      closing: Boolean(match[1]),
      name: qualifiedName.split(":").at(-1),
      selfClosing: /\/\s*$/.test(raw),
    };
  }
  return { end: source.length, ignored: true };
}

function skipContainer(source, start, name) {
  const closingPattern = new RegExp(`<\\s*\\/\\s*(?:[a-z][a-z0-9-]*:)?${name}\\s*`, "ig");
  closingPattern.lastIndex = start;
  const closing = closingPattern.exec(source);
  if (!closing) return source.length;
  return readTag(source, closing.index).end;
}

function normalizeReadableText(value) {
  return String(value || "")
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\t{2,}/g, "\t")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractHtmlText(source, limitsOrTool = "html-to-pdf", label = "Pasted HTML") {
  const limits = resolveLimits(limitsOrTool);
  const markup = String(source || "");
  if (limits.maxMarkupCharacters && markup.length > limits.maxMarkupCharacters) {
    throw new FileLimitError(
      "markup-too-large",
      `${label} contains ${markup.length.toLocaleString()} characters; HTML to PDF supports ${limits.maxMarkupCharacters.toLocaleString()}. Split or simplify the markup first.`,
    );
  }

  const chunks = [];
  let index = 0;
  let bodySeen = false;
  let bodyClosed = false;
  const append = (value) => {
    if (!bodyClosed && value) chunks.push(value);
  };

  while (index < markup.length) {
    const tagStart = markup.indexOf("<", index);
    const textEnd = tagStart < 0 ? markup.length : tagStart;
    if (!bodyClosed && textEnd > index) {
      append(decodeHtmlEntities(markup.slice(index, textEnd)).replace(/\s+/g, " "));
    }
    if (tagStart < 0) break;

    const tag = readTag(markup, tagStart);
    index = tag.end;
    if (tag.ignored || !tag.name) continue;

    if (tag.name === "body") {
      if (tag.closing) {
        bodyClosed = true;
      } else if (!bodySeen) {
        bodySeen = true;
        bodyClosed = false;
        chunks.length = 0;
      }
      continue;
    }
    if (bodyClosed) continue;

    if (!tag.closing && IGNORED_CONTAINERS.has(tag.name)) {
      if (!tag.selfClosing) index = skipContainer(markup, index, tag.name);
      continue;
    }
    if (tag.closing && IGNORED_CONTAINERS.has(tag.name)) continue;

    if (tag.name === "br") append("\n");
    else if (tag.name === "hr") append("\n\n");
    else if (tag.name === "li" && !tag.closing) append("\n- ");
    else if (["td", "th"].includes(tag.name) && tag.closing) append("\t");
    else if (tag.name === "tr" && tag.closing) append("\n");
    else if (PARAGRAPH_TAGS.has(tag.name) && tag.closing) append("\n\n");
  }

  const text = normalizeReadableText(chunks.join(""));
  assertExtractedTextLength(text.length, limits, label);
  return {
    text,
    characterCount: text.length,
    wordCount: text.match(/\S+/g)?.length || 0,
    paragraphCount: text ? text.split(/\n{2,}/).filter((paragraph) => paragraph.trim()).length : 0,
  };
}

export function createHtmlTextPreview(extraction, { pageCount = 0, pageSize = "a4" } = {}) {
  const text = String(extraction?.text || "");
  const previewText = text.slice(0, HTML_TEXT_PREVIEW_CHARACTERS);
  return {
    characterCount: Number(extraction?.characterCount ?? text.length),
    wordCount: Number(extraction?.wordCount ?? (text.match(/\S+/g)?.length || 0)),
    paragraphCount: Number(extraction?.paragraphCount ?? (text ? text.split(/\n{2,}/).length : 0)),
    pageCount: Number(pageCount || 0),
    pageSize: pageSize === "letter" ? "letter" : "a4",
    previewText,
    previewCharacterCount: previewText.length,
    truncated: text.length > previewText.length,
  };
}
