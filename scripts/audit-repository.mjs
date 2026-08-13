#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const githubHardLimit = 100 * 1024 * 1024;
const githubWarningLimit = 50 * 1024 * 1024;

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 },
);
const files = [...new Set(listed.toString("utf8").split("\0").filter(Boolean))].sort();

if (!files.length) throw new Error("Repository audit found no intended files.");

const forbiddenPaths = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.npmrc$/,
  /(^|\/)coverage\//,
  /(^|\/)design-qa(?:-[^/]*)?\.(?:md|png)$/,
  /(^|\/)dist\//,
  /(^|\/)node_modules\//,
  /(^|\/)playwright-report\//,
  /(^|\/)test-results\//,
  /(^|\/)\.vercel\//,
];
const sensitiveFileNames = [
  /(^|\/)(?:id_rsa|id_ed25519)$/i,
  /(^|\/)(?:credentials|service-account)(?:\.[^/]*)?\.json$/i,
  /\.(?:key|p12|pfx|pem)$/i,
];
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bnpm_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /:\/\/[^/\s:]+:[^/@\s]+@/,
];

const errors = [];
const warnings = [];
let totalBytes = 0;
let largest = { path: "", size: 0 };

for (const relativePath of files) {
  const normalized = relativePath.split(path.sep).join("/");
  const absolutePath = path.join(root, relativePath);
  const stats = lstatSync(absolutePath);

  if (!stats.isFile()) {
    errors.push(`${normalized}: intended repository entry is not a regular file`);
    continue;
  }
  if ((stats.mode & 0o111) !== 0 && !normalized.startsWith("scripts/")) {
    errors.push(`${normalized}: non-script repository file must not be executable`);
  }

  totalBytes += stats.size;
  if (stats.size > largest.size) largest = { path: normalized, size: stats.size };
  if (stats.size >= githubHardLimit) errors.push(`${normalized}: ${stats.size} bytes exceeds GitHub's 100 MiB per-file limit`);
  else if (stats.size >= githubWarningLimit) warnings.push(`${normalized}: ${stats.size} bytes exceeds GitHub's 50 MiB warning threshold`);

  if (forbiddenPaths.some((pattern) => pattern.test(normalized))) errors.push(`${normalized}: generated or private path must not be committed`);
  if (sensitiveFileNames.some((pattern) => pattern.test(normalized))) errors.push(`${normalized}: credential-like filename must not be committed`);

  const bytes = readFileSync(absolutePath);
  if (bytes.subarray(0, 8192).includes(0)) continue;
  const text = bytes.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) errors.push(`${normalized}: contains a high-confidence credential or private-key pattern`);
}

const packageMetadata = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
if (packageMetadata.private !== true) errors.push("package.json: private must stay true unless npm publication is explicitly intended");
if (packageMetadata.packageManager !== "bun@1.2.20") errors.push("package.json: packageManager must pin bun@1.2.20");
const removedRuntimePackages = ["dingbat-to-unicode", "heic2any", "mammoth"];
for (const name of removedRuntimePackages) {
  if (packageMetadata.dependencies?.[name] || packageMetadata.optionalDependencies?.[name]) {
    errors.push(`package.json: removed runtime package ${name} must not return without completing its TASKS.md gate`);
  }
}
const bunLock = readFileSync(path.join(root, "bun.lock"), "utf8");
for (const name of removedRuntimePackages) {
  if (bunLock.includes(`"${name}": ["${name}@`)) {
    errors.push(`bun.lock: removed runtime package ${name} is still resolved`);
  }
}

const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
if (vercel.framework !== "vite") errors.push("vercel.json: framework must remain vite");
if (vercel.installCommand !== "bun install --frozen-lockfile") errors.push("vercel.json: installCommand must use Bun's frozen lockfile");
if (vercel.buildCommand !== "bun run build") errors.push("vercel.json: buildCommand must remain bun run build");
if (vercel.outputDirectory !== "dist/client") errors.push("vercel.json: outputDirectory must remain dist/client");
if (vercel.functions || vercel.crons) errors.push("vercel.json: the static application must not define Functions or Cron Jobs");

const vercelIgnore = readFileSync(path.join(root, ".vercelignore"), "utf8");
const requiredVercelIgnoreRules = [
  ".git/",
  ".vercel/",
  ".env",
  ".env.*",
  "node_modules/",
  "dist/",
  "design-qa-*.png",
  "design-qa.md",
];
const vercelIgnoreRules = new Set(
  vercelIgnore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#")),
);
for (const rule of requiredVercelIgnoreRules) {
  if (!vercelIgnoreRules.has(rule)) errors.push(`.vercelignore: required local/private exclusion is missing: ${rule}`);
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) throw new Error(`Repository hygiene audit failed:\n- ${errors.join("\n- ")}`);

const toMiB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
console.log(
  `Repository hygiene audit passed for ${files.length} intended files (${toMiB(totalBytes)} MiB; largest: ${largest.path}, ${toMiB(largest.size)} MiB).`,
);
