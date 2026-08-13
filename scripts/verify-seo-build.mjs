#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tools } from "../src/tools.js";
import { HOME_METADATA, SITE_ORIGIN, SOCIAL_IMAGE_PATH, getToolMetadata, toolPath } from "../src/lib/site-metadata.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "dist", "client");

const readText = (relative) => readFile(path.join(client, relative), "utf8");
const expectedMetadata = [HOME_METADATA, ...tools.map(getToolMetadata)];

assert.equal(tools.length, 47, "SEO coverage must be reviewed when the catalog size changes");
assert.equal(new Set(expectedMetadata.map(({ title }) => title)).size, expectedMetadata.length, "every indexable page needs a unique title");
assert.equal(new Set(expectedMetadata.map(({ description }) => description)).size, expectedMetadata.length, "every indexable page needs a unique description");
assert.equal(new Set(expectedMetadata.map(({ canonical }) => canonical)).size, expectedMetadata.length, "every indexable page needs one canonical URL");

const homepage = await readText("index.html");
assert.match(homepage, new RegExp(`<link id="seo-canonical" rel="canonical" href="${HOME_METADATA.canonical}"`));
for (const tool of tools) assert.match(homepage, new RegExp(`href="${toolPath(tool)}"`), `${tool.name} must be crawlable from the homepage HTML`);

for (const tool of tools) {
  const metadata = getToolMetadata(tool);
  const html = await readText(path.join("tools", tool.slug, "index.html"));
  assert.match(html, new RegExp(`<title>${metadata.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</title>`));
  assert.match(html, new RegExp(`href="${metadata.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  assert.match(html, new RegExp(`<h1>${tool.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h1>`));
  assert.match(html, /"@type":"WebApplication"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.doesNotMatch(html, /#tool\//, "generated canonical tool pages must not depend on fragment routing");
}

const sitemap = await readText("sitemap.xml");
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.deepEqual(sitemapLocations, expectedMetadata.map(({ canonical }) => canonical));
assert.equal(new Set(sitemapLocations).size, expectedMetadata.length);

const robots = await readText("robots.txt");
assert.match(robots, /User-agent: OAI-SearchBot\nAllow: \//);
assert.match(robots, /User-agent: GPTBot\nDisallow: \//);
assert.match(robots, new RegExp(`Sitemap: ${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\/sitemap\\.xml`));

for (const fileName of ["llms.txt", "sitemap.md"]) {
  const markdown = await readText(fileName);
  for (const tool of tools) assert.match(markdown, new RegExp(`${SITE_ORIGIN}${toolPath(tool)}`), `${fileName} must include ${tool.name}`);
}

const png = await readFile(path.join(client, SOCIAL_IMAGE_PATH.slice(1)));
assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);

console.log(`Verified SEO/AIO output for ${tools.length} tool pages plus the homepage.`);
