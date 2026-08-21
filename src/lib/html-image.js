// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError, assertOutputDimensions, getToolLimits } from "./file-limits.js";

export const HTML_IMAGE_PIXEL_RATIO = 1.5;
export const HTML_IMAGE_MIN_VIEWPORT_WIDTH = 320;
export const HTML_IMAGE_MAX_VIEWPORT_WIDTH = 3840;
export const HTML_IMAGE_CAPTURE_MIN_HEIGHT = 560;

export const HTML_IMAGE_FORMATS = Object.freeze([
  Object.freeze({ value: "jpg", label: "JPG", hint: "Compact and easy to share", description: "Best for messages, documents, and social posts." }),
  Object.freeze({ value: "svg", label: "SVG", hint: "Sharp at every size", description: "Best for text-heavy captures and design handoff." }),
]);

export const HTML_IMAGE_VIEWPORTS = Object.freeze([
  Object.freeze({ value: 375, label: "Phone", hint: "375 px" }),
  Object.freeze({ value: 768, label: "Tablet", hint: "768 px" }),
  Object.freeze({ value: 1440, label: "Desktop", hint: "1,440 px" }),
  Object.freeze({ value: 1920, label: "Wide", hint: "1,920 px" }),
]);

const BLOCKED_ELEMENTS = "base, canvas, embed, form, iframe, link, meta, noscript, object, script, style, template";
const REMOTE_ATTRIBUTE_NAMES = new Set([
  "action",
  "background",
  "formaction",
  "href",
  "ping",
  "poster",
  "srcset",
  "xlink:href",
]);
const PRESENTATION_ATTRIBUTE_NAMES = new Set(["class", "contenteditable", "id", "style", "xml:base"]);
const SAFE_DATA_IMAGE = /^data:image\/(?:gif|jpe?g|png|webp);base64,[a-z0-9+/]+={0,2}$/i;

function resolveLimits(limitsOrTool) {
  return limitsOrTool?.maxHtmlOutputPixels
    ? limitsOrTool
    : getToolLimits(limitsOrTool || "html-to-image");
}

export function getHtmlImageFormat(value) {
  const format = HTML_IMAGE_FORMATS.find((option) => option.value === String(value || "").toLowerCase());
  if (!format) throw new FileLimitError("invalid-html-image-format", "Choose JPG or SVG for the HTML capture.");
  return format;
}

export function getHtmlImageViewport(value) {
  const width = Number(value);
  if (!Number.isInteger(width) || width < HTML_IMAGE_MIN_VIEWPORT_WIDTH || width > HTML_IMAGE_MAX_VIEWPORT_WIDTH) {
    throw new FileLimitError(
      "invalid-html-viewport",
      `Choose a viewport width from ${HTML_IMAGE_MIN_VIEWPORT_WIDTH.toLocaleString()} to ${HTML_IMAGE_MAX_VIEWPORT_WIDTH.toLocaleString()} px.`,
    );
  }
  return width;
}

export function hasNonFragmentHtmlImageUrl(value) {
  const source = String(value || "");
  for (const match of source.matchAll(/url\s*\(\s*([^)]*?)(?:\)|$)/gi)) {
    let target = match[1].trim();
    if ((target.startsWith("\"") && target.endsWith("\"")) || (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1).trim();
    }
    if (!target.startsWith("#")) return true;
  }
  return false;
}

export function shouldRemoveHtmlImageAttribute(name, value, nodeLocalName = "") {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedValue = String(value || "").trim();
  const normalizedNodeName = String(nodeLocalName || "").toLowerCase();

  if (normalizedName.startsWith("on") || PRESENTATION_ATTRIBUTE_NAMES.has(normalizedName)) return true;
  if (normalizedName === "src") return normalizedNodeName !== "img" || !SAFE_DATA_IMAGE.test(normalizedValue);
  if (REMOTE_ATTRIBUTE_NAMES.has(normalizedName)) return true;
  return hasNonFragmentHtmlImageUrl(normalizedValue);
}

export function sanitizeHtmlImageSource(source, limitsOrTool = "html-to-image", label = "Pasted HTML") {
  if (typeof DOMParser !== "function") {
    throw new FileLimitError("html-preview-unavailable", "This browser cannot safely prepare an HTML capture.");
  }
  const limits = resolveLimits(limitsOrTool);
  const markup = String(source || "");
  if (!markup.trim()) throw new FileLimitError("missing-html-input", "Add an HTML file or paste HTML to continue.");
  if (markup.length > limits.maxMarkupCharacters) {
    throw new FileLimitError(
      "markup-too-large",
      `${label} contains ${markup.length.toLocaleString()} characters; HTML to Image supports ${limits.maxMarkupCharacters.toLocaleString()}. Split or simplify the markup first.`,
    );
  }

  const parsed = new DOMParser().parseFromString(markup, "text/html");
  let removedElements = 0;
  let removedAttributes = 0;
  let removedResources = 0;
  let keptDataImages = 0;

  parsed.querySelectorAll(BLOCKED_ELEMENTS).forEach((node) => {
    removedElements += 1;
    node.remove();
  });

  parsed.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (!shouldRemoveHtmlImageAttribute(attribute.name, attribute.value, node.localName)) {
        if (attribute.name.toLowerCase() === "src" && node.localName?.toLowerCase() === "img") keptDataImages += 1;
        continue;
      }
      if (["action", "background", "formaction", "href", "ping", "poster", "src", "srcset", "xlink:href"].includes(attribute.name.toLowerCase())
        || hasNonFragmentHtmlImageUrl(attribute.value)) removedResources += 1;
      node.removeAttribute(attribute.name);
      removedAttributes += 1;
    }
    if (["button", "input", "select", "textarea"].includes(node.localName?.toLowerCase())) node.setAttribute("disabled", "");
  });

  parsed.querySelectorAll("img:not([src])").forEach((node) => {
    const alt = String(node.getAttribute("alt") || "").trim().slice(0, 200);
    node.replaceWith(parsed.createTextNode(alt ? `[Image removed: ${alt}]` : "[Image removed]"));
    removedElements += 1;
  });

  return {
    markup: parsed.body.innerHTML,
    sourceCharacters: markup.length,
    elementCount: parsed.body.querySelectorAll("*").length,
    removedElements,
    removedAttributes,
    removedResources,
    keptDataImages,
  };
}

export function createHtmlImageCapture(prepared, viewportWidth, { offscreen = false } = {}) {
  if (!prepared || typeof prepared.markup !== "string") {
    throw new FileLimitError("invalid-html-preview", "The sanitized HTML preview is unavailable. Check the source and try again.");
  }
  const width = getHtmlImageViewport(viewportWidth);
  const host = document.createElement("div");
  host.className = "html-image-capture-host";
  host.style.cssText = offscreen
    ? `position:fixed;left:-12000px;top:0;width:${width}px;pointer-events:none;`
    : `display:block;width:${width}px;pointer-events:none;transform-origin:top left;`;
  const shadow = host.attachShadow({ mode: "open" });
  const frame = document.createElement("div");
  frame.className = "html-image-capture-frame";
  frame.style.cssText = `box-sizing:border-box;width:${width}px;min-height:${HTML_IMAGE_CAPTURE_MIN_HEIGHT}px;overflow:hidden;padding:64px;background:#fff;color:#17171a;font:16px/1.55 Manrope,Arial,sans-serif;overflow-wrap:anywhere;`;
  const parsed = new DOMParser().parseFromString(prepared.markup, "text/html");
  frame.append(...parsed.body.childNodes);
  shadow.append(frame);
  return { host, frame };
}

export function createHtmlImagePlan(options, captureHeight, limitsOrTool = "html-to-image") {
  const limits = resolveLimits(limitsOrTool);
  const format = getHtmlImageFormat(options?.format);
  const viewportWidth = getHtmlImageViewport(options?.viewportWidth);
  const height = Math.max(1, Math.ceil(Number(captureHeight)));
  if (!Number.isSafeInteger(height) || height > limits.maxHtmlHeight) {
    throw new FileLimitError(
      "html-height-limit",
      `The rendered HTML is ${Number.isFinite(height) ? height.toLocaleString() : "an invalid number of"} px tall; local capture supports ${limits.maxHtmlHeight.toLocaleString()} px. Split the document into shorter sections.`,
    );
  }
  const pixelRatio = format.value === "jpg" ? HTML_IMAGE_PIXEL_RATIO : 1;
  // Canvas bitmap dimensions use Web IDL integer conversion, so fractional
  // pixel-ratio results are truncated. Mirror that here so the preview plan,
  // result metadata, and generated bitmap always agree for odd dimensions.
  const outputWidth = Math.floor(viewportWidth * pixelRatio);
  const outputHeight = Math.floor(height * pixelRatio);
  assertOutputDimensions(
    outputWidth,
    outputHeight,
    { maxFileBytes: 1, maxOutputEdge: limits.maxOutputEdge, maxOutputPixels: limits.maxHtmlOutputPixels },
    "The HTML capture",
  );
  return {
    format: format.value,
    formatLabel: format.label,
    viewportWidth,
    captureHeight: height,
    pixelRatio,
    outputWidth,
    outputHeight,
    outputPixels: outputWidth * outputHeight,
  };
}

export function createHtmlImageOutcome(plan, prepared, outputBytes) {
  if (!plan || !prepared || !Number.isSafeInteger(outputBytes) || outputBytes < 1) {
    throw new FileLimitError("invalid-html-image-outcome", "The HTML capture reported invalid output details. Try the capture again.");
  }
  return {
    format: getHtmlImageFormat(plan.format).value,
    viewportWidth: getHtmlImageViewport(plan.viewportWidth),
    captureHeight: plan.captureHeight,
    outputWidth: plan.outputWidth,
    outputHeight: plan.outputHeight,
    outputBytes,
    sourceCharacters: prepared.sourceCharacters,
    elementCount: prepared.elementCount,
    removedElements: prepared.removedElements,
    removedAttributes: prepared.removedAttributes,
    removedResources: prepared.removedResources,
    keptDataImages: prepared.keptDataImages,
  };
}
