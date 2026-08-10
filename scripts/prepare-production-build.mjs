#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import {
  existsSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_WORKER_HASH_TOKEN = "__LFS_BUILD_HASH__";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "dist", "client");
const index = path.join(client, "index.html");

if (!existsSync(index)) {
  throw new Error(`Missing production build input: ${index}`);
}

const legalOutput = path.join(client, "legal");
mkdirSync(legalOutput, { recursive: true });
for (const fileName of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "TRADEMARKS.md"]) {
  copyFileSync(path.join(root, fileName), path.join(legalOutput, fileName));
}

function listPublicFiles(directory, relative = "") {
  const current = path.join(directory, relative);
  if (!existsSync(current)) return [];
  return readdirSync(current).flatMap((name) => {
    const next = path.join(relative, name);
    return statSync(path.join(directory, next)).isDirectory()
      ? listPublicFiles(directory, next)
      : [`/${next.split(path.sep).join("/")}`];
  });
}

const precacheFiles = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  ...listPublicFiles(client, "assets"),
  ...listPublicFiles(client, "engines"),
  ...listPublicFiles(client, "icons"),
  ...listPublicFiles(client, "legal"),
  ...listPublicFiles(client, "third-party"),
];
const normalizedPrecacheFiles = [...new Set(precacheFiles)].sort();
const precacheManifest = `${JSON.stringify(normalizedPrecacheFiles, null, 2)}\n`;

writeFileSync(
  path.join(client, "precache-manifest.json"),
  precacheManifest,
  "utf8",
);

const serviceWorkerPath = path.join(client, "sw.js");
const serviceWorkerTemplate = readFileSync(serviceWorkerPath, "utf8");
const tokenMatches = serviceWorkerTemplate.split(SERVICE_WORKER_HASH_TOKEN).length - 1;

if (tokenMatches !== 1) {
  throw new Error(
    `Expected exactly one ${SERVICE_WORKER_HASH_TOKEN} token in ${serviceWorkerPath}, found ${tokenMatches}`,
  );
}

const buildHash = createHash("sha256");
buildHash.update("local-file-studio-precache-v1\0");
buildHash.update(precacheManifest);

for (const pathname of normalizedPrecacheFiles) {
  if (pathname === "/") continue;
  buildHash.update(`\0${pathname}\0`);
  buildHash.update(readFileSync(path.join(client, pathname.slice(1))));
}

// Include service-worker behavior without creating a self-referential hash.
buildHash.update("\0service-worker-template\0");
buildHash.update(serviceWorkerTemplate);

const cacheRevision = buildHash.digest("hex").slice(0, 16);
writeFileSync(
  serviceWorkerPath,
  serviceWorkerTemplate.replace(SERVICE_WORKER_HASH_TOKEN, cacheRevision),
  "utf8",
);

console.log(
  `Prepared ${normalizedPrecacheFiles.length} offline assets with cache revision ${cacheRevision}.`,
);
