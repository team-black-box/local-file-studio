// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const engineDirectory = path.join(projectRoot, "public/engines/tesseract");

const assets = [
  {
    name: "eng.traineddata.gz",
    source: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    sha256: "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
  },
  {
    name: "tesseract-core-lstm.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    sha256: "66b17df6e20c5329a17ffa9c202a47eaa3e32500b253d4c7f38e7f2bc01457c3",
  },
  {
    name: "tesseract-core-lstm.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    sha256: "eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680",
  },
  {
    name: "tesseract-core-relaxedsimd-lstm.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
    sha256: "7985c92d4c64e7267d24cadffe1b2a1da6bf8aa55fdcaf953fe94fe122a24545",
  },
  {
    name: "tesseract-core-relaxedsimd-lstm.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    sha256: "861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3",
  },
  {
    name: "tesseract-core-relaxedsimd.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm",
    sha256: "45f8c9b516df326b6ae6b493ed3a6289df5cbd10490e7b6ff8bf5b12ea42d1da",
  },
  {
    name: "tesseract-core-relaxedsimd.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core-relaxedsimd.wasm.js",
    sha256: "843074aa5bad1cc6421b74a86201768ced9f244795e4d81435435a61a40ce535",
  },
  {
    name: "tesseract-core-simd-lstm.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
    sha256: "34e8d50cac216427d86bf397d610fdd9f49492539bbcdfbfccc4eda20c810bea",
  },
  {
    name: "tesseract-core-simd-lstm.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    sha256: "c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38",
  },
  {
    name: "tesseract-core-simd.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core-simd.wasm",
    sha256: "7d237a13edfeb0fa2f104744fccde0a00e0c076c3e23b7a8fc7af75ec9af2c3e",
  },
  {
    name: "tesseract-core-simd.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core-simd.wasm.js",
    sha256: "6b61ef4e911b5cf57e656bbfe983d6e2b3711a02dd164154ddda064566e8e09d",
  },
  {
    name: "tesseract-core.wasm",
    source: "node_modules/tesseract.js-core/tesseract-core.wasm",
    sha256: "c7f5ace62ac0ad065e71e9c6725f1d7cdf82e7eda8fba532cbb9563964da7098",
  },
  {
    name: "tesseract-core.wasm.js",
    source: "node_modules/tesseract.js-core/tesseract-core.wasm.js",
    sha256: "0bc6ce3e5fbbd0cd89706cf2fd70960e3372f4f01ee24265b26990808aaeb286",
  },
  {
    name: "worker.min.js",
    source: "node_modules/tesseract.js/dist/worker.min.js",
    sha256: "576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d",
  },
];

const sidecars = [
  {
    name: "LICENSE-APACHE-2.0.txt",
    source: "node_modules/tesseract.js-core/LICENSE",
    sha256: "c6596eb7be8581c18be736c846fb9173b69eccf6ef94c5135893ec56bd92ba08",
  },
  {
    name: "worker.min.js.LICENSE.txt",
    source: "node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt",
    sha256: "45f54171aeaa1d10c0c1a66f374b7bba1f02472b1487fbe892eec04f840002ac",
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function verifyCopy({ name, source, sha256: expectedHash }) {
  const destinationPath = path.join(engineDirectory, name);
  const sourcePath = path.join(projectRoot, source);
  const [destinationBytes, sourceBytes] = await Promise.all([
    readFile(destinationPath),
    readFile(sourcePath),
  ]);

  if (!destinationBytes.equals(sourceBytes)) {
    throw new Error(`${name} differs from its installed source: ${source}`);
  }

  const actualHash = sha256(destinationBytes);
  if (actualHash !== expectedHash) {
    throw new Error(`${name} has SHA-256 ${actualHash}; expected ${expectedHash}`);
  }
}

for (const asset of assets) {
  await verifyCopy(asset);
}

for (const sidecar of sidecars) {
  await verifyCopy(sidecar);
}

const runtimePattern = /^(?:eng\.traineddata\.gz|worker\.min\.js|tesseract-core(?:-.*)?\.wasm(?:\.js)?)$/;
const runtimeFiles = (await readdir(engineDirectory))
  .filter((name) => runtimePattern.test(name))
  .sort();
const expectedRuntimeFiles = assets.map(({ name }) => name).sort();

if (JSON.stringify(runtimeFiles) !== JSON.stringify(expectedRuntimeFiles)) {
  throw new Error(
    `Unexpected OCR runtime inventory. Found: ${runtimeFiles.join(", ")}`,
  );
}

const expectedManifest = `${assets
  .map(({ name, sha256: expectedHash }) => `${expectedHash}  ${name}`)
  .join("\n")}\n`;
const actualManifest = await readFile(
  path.join(engineDirectory, "HASHES.sha256"),
  "utf8",
);

if (actualManifest !== expectedManifest) {
  throw new Error("HASHES.sha256 does not match the verified OCR runtime inventory.");
}

console.log(
  `Verified ${assets.length} vendored Tesseract assets and ${sidecars.length} license sidecars.`,
);
