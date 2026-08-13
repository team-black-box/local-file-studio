// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

export const SITE_NAME = "Local File Studio";
export const SITE_ORIGIN = "https://localfilestudio.app";
export const SEO_CONTENT_UPDATED = "2026-08-12";
export const SOCIAL_IMAGE_PATH = "/assets/local-file-studio-social.png";

export const HOME_METADATA = Object.freeze({
  title: "Local File Studio — Private PDF & Image Tools",
  description: "Free, open-source PDF and image tools that process files privately on your device and work offline after the first load.",
  path: "/",
  canonical: `${SITE_ORIGIN}/`,
});

export function toolPath(toolOrSlug) {
  const slug = typeof toolOrSlug === "string" ? toolOrSlug : toolOrSlug?.slug;
  return `/tools/${slug}`;
}

export function getToolMetadata(tool) {
  const format = tool.kind === "pdf" ? "PDF" : "Image";
  const path = toolPath(tool);
  return Object.freeze({
    title: `${tool.name} — Private, Local ${format} Tool | ${SITE_NAME}`,
    description: `${tool.description} Process files privately in your browser with no uploads.`,
    path,
    canonical: `${SITE_ORIGIN}${path}`,
  });
}

export function getPageMetadata(tool) {
  return tool ? getToolMetadata(tool) : HOME_METADATA;
}

export function createToolStructuredData(tool, category) {
  const metadata = getToolMetadata(tool);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        "@id": `${metadata.canonical}#application`,
        name: tool.name,
        description: metadata.description,
        url: metadata.canonical,
        applicationCategory: `${category.label}Application`,
        applicationSubCategory: tool.kind === "pdf" ? "PDF tool" : "Image tool",
        operatingSystem: "Any operating system with a modern web browser",
        browserRequirements: "Requires JavaScript; processing runs locally in the browser",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Files remain on the user's device",
          "No account or upload required",
          "Works offline after the first successful load",
          `${tool.accepts.join(", ").toUpperCase()} input`,
          `${tool.output.join(", ").toUpperCase()} output`,
        ],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: category.label, item: `${SITE_ORIGIN}/#tool-library` },
          { "@type": "ListItem", position: 3, name: tool.name, item: metadata.canonical },
        ],
      },
    ],
  };
}

export function createHomeStructuredData(toolCount) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        description: HOME_METADATA.description,
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_ORIGIN}/#application`,
        name: SITE_NAME,
        url: `${SITE_ORIGIN}/`,
        description: HOME_METADATA.description,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any operating system with a modern web browser",
        browserRequirements: "Requires JavaScript; processing runs locally in the browser",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [`${toolCount} local PDF and image tools`, "No file uploads", "Offline-capable after first load"],
      },
    ],
  };
}
