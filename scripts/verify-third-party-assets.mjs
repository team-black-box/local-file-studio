#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import {
  access,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const updateNotices = process.argv.includes("--update-npm-notices");
const verifyProduction = process.argv.includes("--production");

const expectedFiles = new Map(Object.entries({
  "assets/local-file-studio-icon-source.png": "3e4eb6743d793110828cf69981fe6cd131329e8a5427e2fb7f174f5199d864d0",
  "public/assets/paper-terminal-dots-short.png": "0da98c7c16d8be0469fc2f6252e3f1a4f3703e913d84ff21406b7aebd481207b",
  "public/assets/paper-terminal-dots.png": "1e3105b1f386ea2a8964bc7bde2a5928aff250bf275e1e0e354accbe8d32b602",
  "public/assets/paper-terminal-ruler.png": "6343a30759edf1b876f0dd21d5e4395b2f5719529d54318b99df5b688fe832ea",
  "public/icons/apple-touch-icon.png": "b05a643a3dfd065f87fcd8ed6ee88393f2bfc1ad5c2df27e8f83f72c1d4d42db",
  "public/icons/icon-192.png": "041ea5a73c2a6c07a355b0d4d4140059422eb9ccdd0004440ffee59976ac4cf7",
  "public/icons/icon-512.png": "102a481f5f6ba4dea909b39e4483b380509a5ca2b19788cd77beed0b2cf87527",
  "public/icons/icon-maskable-512.png": "102a481f5f6ba4dea909b39e4483b380509a5ca2b19788cd77beed0b2cf87527",
  "public/engines/tesseract/eng.traineddata.gz": "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
  "public/third-party/licenses/Manrope-OFL-1.1.txt": "d826ab6583b12c26807d8716a545bdbbb672df04f48608a364ba9efdbe501c30",
  "public/third-party/licenses/SheetJS-Apache-2.0.txt": "4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64",
  "public/third-party/licenses/giflib-COPYING.txt": "0c9b7990ecdca88b676db232c226548ac408b279f550d424d996f0d83591dd8e",
  "public/third-party/licenses/leptonica-license.txt": "87829abb5bbb00b55a107365da89e9a33f86c4250169e5a1e5588505be7d5806",
  "public/third-party/licenses/libjpeg-IJG-README.txt": "c791da525733040e622ed257c7b096b8f5191b332604ead0c6bc2b54cbd8e0d1",
  "public/third-party/licenses/libpng-LICENSE.txt": "33ba4e187d8b0c8d7ab2bc2e522bb095219e03089e9aa0122b4fb9eb2b7de82b",
  "public/third-party/licenses/libtiff-COPYRIGHT.txt": "fbd6fed7938541d2c809c0826225fc85e551fdbfa8732b10f0c87e0847acafd7",
  "public/third-party/licenses/libwebp-COPYING.txt": "5aec868f669e384a22372a4e8a1a6cd7d44c64cd451f960ca69cc170d1e13acf",
  "public/third-party/licenses/openlibm-LICENSE.md": "b1843fbf5b03f519a5f0a44fce751bdd1022ae7148614923f9d6293e17a18b17",
  "public/third-party/licenses/tessdata-Apache-2.0.txt": "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  "public/third-party/licenses/tesseract-Apache-2.0.txt": "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  "public/third-party/licenses/tesseract.js-Apache-2.0.txt": "b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1",
  "public/third-party/licenses/zlib-README.txt": "fc2c3368901700f0acdeb1d8afeaca5923296768ec6824ecdf627aac396001fd",
  "node_modules/@fontsource-variable/manrope/LICENSE": "d826ab6583b12c26807d8716a545bdbbb672df04f48608a364ba9efdbe501c30",
  "node_modules/xlsx/LICENSE": "4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64",
  "node_modules/xlsx/package.json": "bb9458277a69b41a304a89e45f19173ac0d23f2fc296091db49dba3c8b61c546",
  "node_modules/xlsx/xlsx.mjs": "1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db",
}));

const expectedLicenseInventory = [
  "Manrope-OFL-1.1.txt",
  "SheetJS-Apache-2.0.txt",
  "giflib-COPYING.txt",
  "leptonica-license.txt",
  "libjpeg-IJG-README.txt",
  "libpng-LICENSE.txt",
  "libtiff-COPYRIGHT.txt",
  "libwebp-COPYING.txt",
  "openlibm-LICENSE.md",
  "tessdata-Apache-2.0.txt",
  "tesseract-Apache-2.0.txt",
  "tesseract.js-Apache-2.0.txt",
  "zlib-README.txt",
].sort();

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function findPackageDirectory(name, fromDirectory) {
  const segments = name.split("/");
  let current = fromDirectory;
  while (true) {
    const candidate = path.join(current, "node_modules", ...segments);
    if (await exists(path.join(candidate, "package.json"))) return candidate;
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(root)) break;
    current = parent;
  }
  return null;
}

function repositoryUrl(repository) {
  if (typeof repository === "string") return repository;
  return repository?.url ?? "not declared";
}

async function collectRuntimePackages() {
  const projectPackage = await readJson(path.join(root, "package.json"));
  const queue = Object.keys(projectPackage.dependencies ?? {})
    .sort()
    .map((name) => ({ name, from: root }));
  const packages = new Map();

  while (queue.length > 0) {
    const next = queue.shift();
    const packageDirectory = await findPackageDirectory(next.name, next.from);
    if (!packageDirectory) {
      throw new Error(`Runtime package ${next.name} is not installed from ${next.from}`);
    }
    const packageJsonPath = path.join(packageDirectory, "package.json");
    const metadata = await readJson(packageJsonPath);
    const key = `${metadata.name}@${metadata.version}:${path.relative(root, packageDirectory)}`;
    if (packages.has(key)) continue;

    const entries = await readdir(packageDirectory);
    const legalFiles = entries
      .filter((name) => /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i.test(name))
      .sort();
    if (
      legalFiles.length === 0 &&
      new Set(["hash.js@1.1.7", "isarray@1.0.0"]).has(
        `${metadata.name}@${metadata.version}`,
      ) &&
      entries.includes("README.md")
    ) {
      // These exact packages publish their complete MIT text in README.md.
      legalFiles.push("README.md");
    }
    const legalTexts = [];
    for (const name of legalFiles) {
      const filePath = path.join(packageDirectory, name);
      if ((await stat(filePath)).isFile()) {
        legalTexts.push({ name, text: await readFile(filePath, "utf8") });
      }
    }

    packages.set(key, {
      name: metadata.name,
      version: metadata.version,
      license: metadata.license ?? "not declared",
      repository: repositoryUrl(metadata.repository),
      location: path.relative(root, packageDirectory).split(path.sep).join("/"),
      legalTexts,
    });

    // Vite resolves Tesseract's browser worker instead of its node-fetch path;
    // PDF.js's native canvas adapter is likewise Node-only. Neither subtree is
    // emitted by this static browser build, and canvas is platform-specific.
    const isNodeOnlyBrowserExclusion = (name) =>
      (metadata.name === "tesseract.js" && name === "node-fetch")
      || (metadata.name === "pdfjs-dist" && name === "@napi-rs/canvas");
    const dependencyNames = Object.keys(metadata.dependencies ?? {})
      .filter((name) => !isNodeOnlyBrowserExclusion(name));
    const optionalDependencyNames = Object.keys(metadata.optionalDependencies ?? {})
      .filter((name) => !isNodeOnlyBrowserExclusion(name));
    for (const name of [...new Set([...dependencyNames, ...optionalDependencyNames])].sort()) {
      const childDirectory = await findPackageDirectory(name, packageDirectory);
      if (childDirectory) queue.push({ name, from: packageDirectory });
    }
  }

  return [...packages.values()].sort((left, right) => {
    const leftKey = `${left.name}@${left.version}:${left.location}`;
    const rightKey = `${right.name}@${right.version}:${right.location}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

async function renderNpmNotices() {
  const packages = await collectRuntimePackages();
  const missing = packages.filter(({ legalTexts }) => legalTexts.length === 0);
  const allowedWithoutPackagedLicense = new Set([
    "@tesseract.js-data/eng@1.0.0",
  ]);
  const unexpectedMissing = missing.filter(
    ({ name, version }) => !allowedWithoutPackagedLicense.has(`${name}@${version}`),
  );
  if (unexpectedMissing.length > 0) {
    throw new Error(
      `Runtime packages without a packaged license/notice file: ${unexpectedMissing
        .map(({ name, version }) => `${name}@${version}`)
        .join(", ")}`,
    );
  }

  const lines = [
    "LOCAL FILE STUDIO — INSTALLED RUNTIME PACKAGE LICENSES",
    "",
    "This file is generated deterministically from the installed production dependency",
    "closure. It reproduces upstream package metadata and packaged legal files; it is",
    "not licensed as Local File Studio first-party source.",
    "",
    "One resolved package does not contain a license file: @tesseract.js-data/eng",
    "1.0.0. Its section preserves the exact package-declared SPDX identifier and",
    "repository metadata instead of inventing an upstream copyright notice. The OCR",
    "model's separately verified Apache-2.0 provenance is documented in",
    "THIRD_PARTY_NOTICES.md, with the license at",
    "licenses/tessdata-Apache-2.0.txt.",
    "",
  ];

  for (const entry of packages) {
    lines.push("=".repeat(78));
    lines.push(`${entry.name}@${entry.version}`);
    lines.push(`Declared license: ${entry.license}`);
    lines.push(`Repository: ${entry.repository}`);
    lines.push(`Installed path: ${entry.location}`);
    if (entry.legalTexts.length === 0) {
      lines.push("Packaged legal files: none (see special provenance note above)");
    }
    for (const legal of entry.legalTexts) {
      lines.push(`--- ${legal.name} ---`);
      lines.push(legal.text.trimEnd());
    }
    lines.push("");
  }

  return { content: `${lines.join("\n")}\n`, packageCount: packages.length };
}

for (const [relativePath, expectedHash] of expectedFiles) {
  const actualHash = digest(await readFile(path.join(root, relativePath)));
  if (actualHash !== expectedHash) {
    throw new Error(`${relativePath} has SHA-256 ${actualHash}; expected ${expectedHash}`);
  }
}

const licenseInventory = (await readdir(path.join(root, "public/third-party/licenses"))).sort();
if (JSON.stringify(licenseInventory) !== JSON.stringify(expectedLicenseInventory)) {
  throw new Error(`Unexpected third-party license inventory: ${licenseInventory.join(", ")}`);
}

const projectPackage = await readJson(path.join(root, "package.json"));
if (projectPackage.dependencies?.xlsx !== "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz") {
  throw new Error("package.json must pin the audited SheetJS 0.20.3 tarball URL exactly");
}

const expectedPackageMetadata = [
  ["@fontsource-variable/manrope", "5.3.0", "OFL-1.1"],
  ["@tesseract.js-data/eng", "1.0.0", "MIT"],
  ["@xmldom/xmldom", "0.8.13", "MIT"],
  ["tesseract.js", "7.0.0", "Apache-2.0"],
  ["tesseract.js-core", "7.0.0", "Apache-2.0"],
  ["xlsx", "0.20.3", "Apache-2.0"],
];
for (const [name, version, license] of expectedPackageMetadata) {
  const packageDirectory = await findPackageDirectory(name, root);
  const metadata = await readJson(path.join(packageDirectory, "package.json"));
  if (metadata.version !== version || metadata.license !== license) {
    throw new Error(
      `${name} metadata is ${metadata.version}/${metadata.license}; expected ${version}/${license}`,
    );
  }
}

const bunLock = await readFile(path.join(root, "bun.lock"), "utf8");
for (const marker of [
  "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz",
  '"@xmldom/xmldom": ["@xmldom/xmldom@0.8.13"',
  '"tesseract.js": ["tesseract.js@7.0.0"',
  '"tesseract.js-core": ["tesseract.js-core@7.0.0"',
]) {
  if (!bunLock.includes(marker)) throw new Error(`bun.lock is missing audited marker: ${marker}`);
}

const detailedNotice = await readFile(
  path.join(root, "public/third-party/THIRD_PARTY_NOTICES.md"),
  "utf8",
);
for (const marker of [
  "8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8",
  "acffef2b66eb44a31df297e11d905f4b39001068",
  "c0ec3ab10faee8c49eb7bfcca6e5601cd3534ac080f1ca6f9b5159265f9014ea",
]) {
  if (!detailedNotice.includes(marker)) {
    throw new Error(`Detailed third-party notice is missing required marker: ${marker}`);
  }
}

const npmNoticesPath = path.join(root, "public/third-party/npm-licenses.txt");
const rendered = await renderNpmNotices();
if (updateNotices) {
  await writeFile(npmNoticesPath, rendered.content, "utf8");
} else {
  const committed = await readFile(npmNoticesPath, "utf8");
  if (committed !== rendered.content) {
    throw new Error(
      "public/third-party/npm-licenses.txt is stale; run this script with --update-npm-notices",
    );
  }
}

if (verifyProduction) {
  const shippedFiles = [
    "third-party/THIRD_PARTY_NOTICES.md",
    "third-party/npm-licenses.txt",
    ...expectedLicenseInventory.map((name) => `third-party/licenses/${name}`),
  ];
  for (const relativePath of shippedFiles) {
    const source = await readFile(path.join(root, "public", relativePath));
    const built = await readFile(path.join(root, "dist/client", relativePath));
    if (!source.equals(built)) {
      throw new Error(`Production third-party file differs from public source: ${relativePath}`);
    }
  }
}

console.log(
  `Verified ${expectedFiles.size} provenance hashes, ${expectedLicenseInventory.length} exact license copies, and ${rendered.packageCount} runtime packages${verifyProduction ? " in source and production output" : ""}.`,
);
