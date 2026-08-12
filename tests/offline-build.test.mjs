// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("emits the static application entry point", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
});

test("ships exact canonical legal and third-party notice files", async () => {
  for (const fileName of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.md", "TRADEMARKS.md"]) {
    const source = await readFile(new URL(`../${fileName}`, import.meta.url));
    const shipped = await readFile(new URL(`../dist/client/legal/${fileName}`, import.meta.url));
    assert.deepEqual(shipped, source, `${fileName} must ship byte-for-byte in the static distribution`);
  }
});

test("emits a complete revisioned offline manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../dist/client/precache-manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest, [...manifest].sort());
  assert.equal(new Set(manifest).size, manifest.length);
  assert.ok(manifest.includes("/"));
  assert.ok(manifest.includes("/index.html"));
  assert.ok(manifest.includes("/manifest.webmanifest"));
  assert.ok(manifest.some((pathname) => pathname.startsWith("/assets/")));
  assert.ok(manifest.some((pathname) => pathname.startsWith("/engines/tesseract/")));
  assert.ok(manifest.some((pathname) => pathname.startsWith("/icons/")));
  assert.ok(manifest.includes("/legal/LICENSE"));
  assert.ok(manifest.includes("/legal/NOTICE"));
  assert.ok(manifest.includes("/legal/THIRD_PARTY_NOTICES.md"));
  assert.ok(manifest.includes("/legal/TRADEMARKS.md"));
  assert.ok(manifest.some((pathname) => pathname.startsWith("/third-party/licenses/")));
  assert.ok(manifest.includes("/assets/paper-terminal-dots.png"));
  assert.ok(manifest.includes("/assets/paper-terminal-dots-short.png"));
  assert.ok(manifest.includes("/assets/paper-terminal-ruler.png"));
  assert.ok(manifest.includes("/assets/local-file-studio-social.png"));
  assert.ok(manifest.includes("/assets/local-file-studio-social.svg"));

  for (const pathname of manifest.filter((entry) => entry !== "/")) {
    await access(new URL(`../dist/client${pathname}`, import.meta.url));
  }

  const serviceWorker = await readFile(new URL("../dist/client/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /const CACHE_VERSION = "[a-f0-9]{16}";/);
  assert.doesNotMatch(serviceWorker, /__LFS_BUILD_HASH__/);
  assert.doesNotMatch(
    serviceWorker,
    /\bskipWaiting\s*\(/,
    "an update must not strand open clients by replacing their content-hashed asset cache",
  );
  assert.match(
    serviceWorker,
    /self\.addEventListener\("activate"[\s\S]*caches[\s\S]*self\.clients\.claim\(\)/,
    "old build caches must be retired only after the fully installed worker activates",
  );

  const webManifest = JSON.parse(await readFile(new URL("../dist/client/manifest.webmanifest", import.meta.url), "utf8"));
  assert.ok(webManifest.icons.length >= 3);
  for (const icon of webManifest.icons) await access(new URL(`../dist/client${icon.src}`, import.meta.url));
});
