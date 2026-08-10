// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

// Replaced with a deterministic content hash in scripts/prepare-production-build.mjs.
const CACHE_VERSION = "__LFS_BUILD_HASH__";
const CACHE_PREFIX = "local-file-studio";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}-static-${CACHE_VERSION}`;
const INDEX_PATH = "/index.html";
const ROOT_PATH = "/";
const MANIFEST_PATH = "/manifest.webmanifest";
const PRECACHE_MANIFEST_PATH = "/precache-manifest.json";
const BUILD_ASSET_PREFIXES = ["/assets/", "/engines/", "/icons/", "/legal/", "/third-party/"];

const USER_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/rtf",
  "application/zip",
  "application/vnd.ms-",
  "application/vnd.openxmlformats-officedocument",
  "text/csv",
];

function isUsableResponse(response) {
  return response.ok && (response.type === "basic" || response.type === "default");
}

function isCacheableBuildResponse(response) {
  if (!isUsableResponse(response)) return false;

  const disposition = response.headers.get("content-disposition") || "";
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  return (
    !disposition.toLowerCase().includes("attachment") &&
    !contentType.includes("text/html") &&
    !contentType.includes("application/xhtml+xml") &&
    !USER_DOCUMENT_MIME_TYPES.some((type) => contentType.includes(type))
  );
}

function isBuildAssetPath(pathname) {
  return BUILD_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAllowedPrecachePath(pathname) {
  return (
    [ROOT_PATH, INDEX_PATH, MANIFEST_PATH].includes(pathname) ||
    (pathname.startsWith("/") && !pathname.startsWith("//") && isBuildAssetPath(pathname))
  );
}

function isBuildAsset(request, url) {
  return (
    url.origin === self.location.origin &&
    isBuildAssetPath(url.pathname) &&
    !request.headers.has("authorization") &&
    !request.headers.has("range")
  );
}

async function precacheOfflineAssets() {
  const response = await fetch(new Request(PRECACHE_MANIFEST_PATH, { cache: "no-cache", credentials: "same-origin" }));
  if (!isUsableResponse(response)) throw new Error(`Unable to load offline manifest (${response.status})`);
  const paths = await response.json();
  if (!Array.isArray(paths) || !paths.every((pathname) => typeof pathname === "string" && isAllowedPrecachePath(pathname))) {
    throw new Error("Offline manifest contains an invalid path");
  }
  const cache = await caches.open(STATIC_CACHE);
  for (let index = 0; index < paths.length; index += 4) {
    const batch = paths.slice(index, index + 4);
    await Promise.all(batch.map(async (pathname) => {
      if ([ROOT_PATH, INDEX_PATH, MANIFEST_PATH].includes(pathname)) return;
      const request = new Request(pathname, { cache: "reload", credentials: "same-origin" });
      const asset = await fetch(request);
      if (!isCacheableBuildResponse(asset)) throw new Error(`Unable to cache ${pathname}`);
      await cache.put(request, asset);
    }));
  }
}

async function cacheReferencedBuildAssets(indexResponse) {
  const html = await indexResponse.text();
  const assetUrls = new Set();
  const referencePattern = /(?:src|href)=["']([^"'#]+)["']/gi;

  for (const match of html.matchAll(referencePattern)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && isBuildAssetPath(url.pathname)) {
      assetUrls.add(url.href);
    }
  }

  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    [...assetUrls].map(async (href) => {
      const request = new Request(href, {
        cache: "reload",
        credentials: "same-origin",
      });
      const response = await fetch(request);
      if (isCacheableBuildResponse(response)) {
        await cache.put(request, response);
      }
    }),
  );
}

async function refreshAppShell() {
  const request = new Request(INDEX_PATH, {
    cache: "no-cache",
    credentials: "same-origin",
  });
  const response = await fetch(request);

  if (!isUsableResponse(response)) {
    throw new Error(`Unable to refresh app shell (${response.status})`);
  }

  const cache = await caches.open(SHELL_CACHE);
  await Promise.all([
    cache.put(INDEX_PATH, response.clone()),
    cache.put(ROOT_PATH, response.clone()),
    cacheReferencedBuildAssets(response.clone()),
  ]);

  return response;
}

async function refreshManifest() {
  const request = new Request(MANIFEST_PATH, {
    cache: "no-cache",
    credentials: "same-origin",
  });
  const response = await fetch(request);

  if (!isCacheableBuildResponse(response)) {
    throw new Error(`Unable to refresh web app manifest (${response.status})`);
  }

  const cache = await caches.open(SHELL_CACHE);
  await cache.put(request, response.clone());

  return response;
}

async function serveAppShell() {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(INDEX_PATH);

  if (cached) {
    return cached;
  }

  try {
    return await refreshAppShell();
  } catch {
    return new Response(
      "<!doctype html><title>Local File Studio is offline</title><h1>You're offline</h1><p>Open Local File Studio once while connected to make it available offline.</p>",
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
}

async function serveManifest() {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(MANIFEST_PATH);

  if (cached) {
    return cached;
  }

  return refreshManifest();
}

async function cacheFirstBuildAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  // Script/module requests can carry an Origin header while install-time fetches do not.
  // Build URLs are same-origin and content-hashed, so Vary must not turn that harmless
  // header difference into an offline cache miss.
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (!isCacheableBuildResponse(response)) return Response.error();
    await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function installOfflineBuild() {
  try {
    await Promise.all([refreshAppShell(), refreshManifest(), precacheOfflineAssets()]);
    // Do not force an update to activate over an already-open client. That client
    // may still reference content-hashed lazy chunks from the previous build, so
    // its worker and caches must remain active until every old client closes.
  } catch (error) {
    await Promise.all([caches.delete(SHELL_CACHE), caches.delete(STATIC_CACHE)]);
    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(installOfflineBuild());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith(`${CACHE_PREFIX}-`) &&
                name !== SHELL_CACHE &&
                name !== STATIC_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(serveAppShell());
    return;
  }

  if (url.pathname === MANIFEST_PATH) {
    event.respondWith(serveManifest());
    return;
  }

  if (isBuildAsset(request, url)) {
    event.respondWith(cacheFirstBuildAsset(request));
  }
});
