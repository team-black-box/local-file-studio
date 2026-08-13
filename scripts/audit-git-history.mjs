#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";

const git = (args, options = {}) => execFileSync("git", args, {
  encoding: options.encoding ?? "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

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

const objectLines = git(["rev-list", "--objects", "--all"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const objects = new Map();

for (const line of objectLines) {
  const separator = line.indexOf(" ");
  const oid = separator === -1 ? line : line.slice(0, separator);
  const pathname = separator === -1 ? "" : line.slice(separator + 1);
  if (pathname && !objects.has(oid)) objects.set(oid, pathname);
}

const errors = [];
let scannedBlobs = 0;
let scannedBytes = 0;

for (const [oid, pathname] of objects) {
  if (git(["cat-file", "-t", oid], { encoding: "utf8" }).trim() !== "blob") continue;
  scannedBlobs += 1;

  if (forbiddenPaths.some((pattern) => pattern.test(pathname))) {
    errors.push(`${pathname}: private or generated path is reachable in Git history`);
  }
  if (sensitiveFileNames.some((pattern) => pattern.test(pathname))) {
    errors.push(`${pathname}: credential-like filename is reachable in Git history`);
  }

  const size = Number(git(["cat-file", "-s", oid], { encoding: "utf8" }).trim());
  scannedBytes += size;
  if (size >= 100 * 1024 * 1024) {
    errors.push(`${pathname || oid}: historical blob exceeds GitHub's 100 MiB per-file limit`);
  }
  if (size > 16 * 1024 * 1024) continue;

  const bytes = git(["cat-file", "blob", oid], { encoding: "buffer" });
  if (bytes.subarray(0, 8192).includes(0)) continue;
  const text = bytes.toString("utf8");
  if (secretPatterns.some((pattern) => pattern.test(text))) {
    errors.push(`${pathname || oid}: high-confidence credential pattern is reachable in Git history`);
  }
}

if (errors.length) throw new Error(`Git history audit failed:\n- ${[...new Set(errors)].join("\n- ")}`);

const toMiB = (bytes) => (bytes / (1024 * 1024)).toFixed(2);
console.log(`Git history audit passed for ${scannedBlobs} unique blobs (${toMiB(scannedBytes)} MiB across reachable revisions).`);
