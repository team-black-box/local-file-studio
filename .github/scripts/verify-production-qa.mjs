// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";

import { tools } from "../../src/tools.js";

const qaDocument = await readFile(
  new URL("../../docs/PRODUCTION_QA.md", import.meta.url),
  "utf8",
);

const rowSlugs = [...qaDocument.matchAll(/^\|\s*\d+\s*\|\s*`#tool\/([^`]+)`/gm)].map(
  ([, slug]) => slug,
);
const catalogSlugs = tools.map(({ slug }) => slug);
const catalogSet = new Set(catalogSlugs);
const rowCounts = new Map();

for (const slug of rowSlugs) {
  rowCounts.set(slug, (rowCounts.get(slug) ?? 0) + 1);
}

const missing = catalogSlugs.filter((slug) => !rowCounts.has(slug));
const unknown = rowSlugs.filter((slug) => !catalogSet.has(slug));
const duplicates = [...rowCounts]
  .filter(([, count]) => count !== 1)
  .map(([slug, count]) => `${slug} (${count})`);

if (
  rowSlugs.length !== catalogSlugs.length ||
  missing.length > 0 ||
  unknown.length > 0 ||
  duplicates.length > 0
) {
  console.error("Production QA catalog coverage is inconsistent.");
  console.error(`Catalog tools: ${catalogSlugs.length}; QA rows: ${rowSlugs.length}`);
  if (missing.length > 0) console.error(`Missing: ${missing.join(", ")}`);
  if (unknown.length > 0) console.error(`Unknown: ${unknown.join(", ")}`);
  if (duplicates.length > 0) console.error(`Duplicate: ${duplicates.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Production QA covers all ${catalogSlugs.length} catalog tools exactly once.`);
}
