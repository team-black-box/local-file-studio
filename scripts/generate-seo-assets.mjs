#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categoryById, tools } from "../src/tools.js";
import { describeToolLimits } from "../src/lib/file-limits.js";
import {
  HOME_METADATA,
  SEO_CONTENT_UPDATED,
  SITE_NAME,
  SITE_ORIGIN,
  SOCIAL_IMAGE_PATH,
  createHomeStructuredData,
  createToolStructuredData,
  getToolMetadata,
  toolPath,
} from "../src/lib/site-metadata.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "dist", "client");
const indexPath = path.join(client, "index.html");

if (!existsSync(indexPath)) throw new Error(`Missing production build input: ${indexPath}`);

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const escapeXml = escapeHtml;
const baseHtml = readFileSync(indexPath, "utf8");

function replaceAttribute(html, id, attribute, value) {
  const pattern = new RegExp(`(<[^>]+\\bid="${id}"[^>]+\\b${attribute}=")[^"]*(")`);
  if (!pattern.test(html)) throw new Error(`Missing ${attribute} on #${id} in built index.html`);
  return html.replace(pattern, `$1${escapeHtml(value)}$2`);
}

function replaceStructuredData(html, data) {
  const serialized = JSON.stringify(data).replaceAll("<", "\\u003c");
  const pattern = /(<script id="seo-structured-data" type="application\/ld\+json">)[\s\S]*?(<\/script>)/;
  if (!pattern.test(html)) throw new Error("Missing #seo-structured-data in built index.html");
  return html.replace(pattern, `$1${serialized}$2`);
}

function replaceRoot(html, content) {
  const pattern = /<div id="root"><\/div>/;
  if (!pattern.test(html)) throw new Error("Built index.html no longer contains an empty #root mount");
  return html.replace(pattern, `<div id="root">${content}</div>`);
}

function renderPage(metadata, structuredData, content) {
  let html = baseHtml.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(metadata.title)}</title>`);
  html = replaceAttribute(html, "seo-description", "content", metadata.description);
  html = replaceAttribute(html, "seo-og-title", "content", metadata.title);
  html = replaceAttribute(html, "seo-og-description", "content", metadata.description);
  html = replaceAttribute(html, "seo-og-url", "content", metadata.canonical);
  html = replaceAttribute(html, "seo-og-image", "content", `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`);
  html = replaceAttribute(html, "seo-twitter-title", "content", metadata.title);
  html = replaceAttribute(html, "seo-twitter-description", "content", metadata.description);
  html = replaceAttribute(html, "seo-twitter-image", "content", `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`);
  html = replaceAttribute(html, "seo-canonical", "href", metadata.canonical);
  html = replaceStructuredData(html, structuredData);
  return replaceRoot(html, content);
}

function homeContent() {
  const categorySections = Object.values(categoryById).map((category) => {
    const links = tools
      .filter((tool) => tool.category === category.id)
      .map((tool) => `<li><a href="${toolPath(tool)}"><strong>${escapeHtml(tool.name)}</strong><span>${escapeHtml(tool.description)}</span></a></li>`)
      .join("");
    return `<section><h2>${escapeHtml(category.label)} tools</h2><p>${escapeHtml(category.description)}</p><ul>${links}</ul></section>`;
  }).join("");
  return `<main class="seo-prerender"><header><a href="/">${SITE_NAME}</a><span>Private · Local · Open source</span></header><article><p class="seo-kicker">No uploads. No account. On-device processing.</p><h1>Private PDF and image tools that run in your browser</h1><p>${escapeHtml(HOME_METADATA.description)}</p></article><nav aria-label="All Local File Studio tools">${categorySections}</nav><footer><p>Files stay in browser memory and are cleared when the tab closes. After one successful load, the production app can work offline.</p></footer></main>`;
}

function toolContent(tool) {
  const category = categoryById[tool.category];
  const limits = describeToolLimits(tool);
  const related = tools
    .filter((candidate) => candidate.slug !== tool.slug && (candidate.category === tool.category || candidate.kind === tool.kind))
    .slice(0, 6)
    .map((candidate) => `<li><a href="${toolPath(candidate)}">${escapeHtml(candidate.name)}</a></li>`)
    .join("");
  return `<main class="seo-prerender seo-tool-prerender"><header><a href="/">${SITE_NAME}</a><span>${escapeHtml(category.label)} · ${tool.kind === "pdf" ? "PDF" : "Image"}</span></header><article><p class="seo-kicker">Private browser tool</p><h1>${escapeHtml(tool.name)}</h1><p>${escapeHtml(tool.description)}</p><a class="seo-start" href="${toolPath(tool)}">Open ${escapeHtml(tool.name)}</a></article><section><h2>What this tool accepts</h2><p>${escapeHtml(tool.accepts.join(", ").toUpperCase())} input · ${escapeHtml(tool.output.join(", ").toUpperCase())} output</p><h2>Local safeguards</h2><p>${escapeHtml(limits.primary)}. ${escapeHtml(limits.secondary)}</p><h2>Private and offline-capable</h2><p>Processing happens in this browser. Files are not uploaded, and generated results remain in memory until downloaded or the tab is closed. After the first successful production load, the app shell and local processing engines can work offline.</p><h2>Related tools</h2><ul>${related}</ul></section><footer><a href="/#tool-library">Browse all ${tools.length} tools</a></footer></main>`;
}

const homepage = renderPage(HOME_METADATA, createHomeStructuredData(tools.length), homeContent());
writeFileSync(indexPath, homepage, "utf8");

const toolRoot = path.join(client, "tools");
rmSync(toolRoot, { recursive: true, force: true });
for (const tool of tools) {
  const output = path.join(toolRoot, tool.slug);
  mkdirSync(output, { recursive: true });
  writeFileSync(
    path.join(output, "index.html"),
    renderPage(getToolMetadata(tool), createToolStructuredData(tool, categoryById[tool.category]), toolContent(tool)),
    "utf8",
  );
}

const sitemapUrls = [HOME_METADATA, ...tools.map(getToolMetadata)];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((metadata) => `  <url><loc>${escapeXml(metadata.canonical)}</loc><lastmod>${SEO_CONTENT_UPDATED}</lastmod></url>`).join("\n")}\n</urlset>\n`;
writeFileSync(path.join(client, "sitemap.xml"), sitemap, "utf8");

const robots = `# Local File Studio crawl policy\nUser-agent: OAI-SearchBot\nAllow: /\n\n# Search visibility does not imply permission for model-training crawling.\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
writeFileSync(path.join(client, "robots.txt"), robots, "utf8");

const toolMarkdown = Object.values(categoryById).map((category) => {
  const links = tools
    .filter((tool) => tool.category === category.id)
    .map((tool) => `- [${tool.name}](${SITE_ORIGIN}${toolPath(tool)}): ${tool.description}`)
    .join("\n");
  return `## ${category.label}\n\n${category.description}\n\n${links}`;
}).join("\n\n");

const llms = `# ${SITE_NAME}\n\n> Free, open-source PDF and image tools that process files locally in the browser. Selected files and generated results are not uploaded.\n\nCanonical site: ${SITE_ORIGIN}/\nSource: https://github.com/team-black-box/local-file-studio\nLicense: Apache-2.0\nLast reviewed: ${SEO_CONTENT_UPDATED}\n\n## Product guarantees\n\n- File processing is local-only; there is no upload or server-processing path.\n- Production works offline after one successful online load, subject to normal browser storage limitations.\n- Limits are tool-specific, visible, and enforced before expensive work where possible.\n- Tool pages describe verified behavior; Beta labels identify best-effort or browser-sensitive capabilities.\n\n${toolMarkdown}\n\n## Important resources\n\n- [All tools](${SITE_ORIGIN}/#tool-library)\n- [Source repository](https://github.com/team-black-box/local-file-studio)\n- [Apache-2.0 license](${SITE_ORIGIN}/legal/LICENSE)\n- [Third-party notices](${SITE_ORIGIN}/legal/THIRD_PARTY_NOTICES.md)\n`;
writeFileSync(path.join(client, "llms.txt"), llms, "utf8");

const sitemapMarkdown = `# ${SITE_NAME} site map\n\nCanonical site: ${SITE_ORIGIN}/  \nLast reviewed: ${SEO_CONTENT_UPDATED}\n\n${toolMarkdown}\n`;
writeFileSync(path.join(client, "sitemap.md"), sitemapMarkdown, "utf8");

console.log(`Generated SEO/AIO metadata and static HTML for ${tools.length} tool routes.`);
