<!-- SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Vendored OCR engine provenance

Local File Studio keeps the English Tesseract OCR runtime in this directory so
OCR can run locally and offline. `scripts/verify-ocr-assets.mjs` checks every
runtime byte against the frozen installation and `HASHES.sha256`.

## Package sources

| Component | Version | Vendored material | Verified license fact |
| --- | --- | --- | --- |
| `tesseract.js` | 7.0.0 | `worker.min.js` | Package declares Apache-2.0; bundled worker notices are in `worker.min.js.LICENSE.txt`. |
| `tesseract.js-core` | 7.0.0 | Every `tesseract-core*` WASM/loader file | Package declares Apache-2.0; tag `v7.0.0` is commit `acffef2b66eb44a31df297e11d905f4b39001068`. |
| `@tesseract.js-data/eng` | 1.0.0 | `eng.traineddata.gz` from `4.0.0_best_int` | Package metadata says MIT but contains no license text. Exact bytes match Apache-2.0 `naptha/tessdata` commit `806cd9adc8c6e8abc11c782db1818c990576bebc`. |

The English model SHA-256 is
`45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`.
The exact upstream model and Apache-2.0 license are documented and copied in
[`../../third-party/THIRD_PARTY_NOTICES.md`](../../third-party/THIRD_PARTY_NOTICES.md)
and `../../third-party/licenses/tessdata-Apache-2.0.txt`.

## Native libraries compiled into the WASM files

The audited `tesseract.js-core` build scripts compile/link this exact submodule
tree:

| Component | Version/commit | License |
| --- | --- | --- |
| Tesseract OCR fork | 5.3.0 / `2a9c1c49c360462733c386d2a44fcd22c4e21411` | Apache-2.0 |
| Leptonica | 1.83.0 / `4af068b56a9674da915debea4ed7e1b9885b17e8` | BSD-2-Clause-style upstream terms |
| giflib | 5.1.4 / `fa37672085ce4b3d62c51627ab3c8cf2dda8009a` | MIT-style upstream terms |
| Independent JPEG Group libjpeg | 9a / `6c0fcb8ddee365e7abc4d332662b06900612e923` | IJG terms and acknowledgement |
| libpng | 1.6.38.git / `a37d4836519517bdce6cb9d956092321eca3e73b` | libpng-2.0-style upstream terms |
| libtiff | 4.3.0 / `b51bb157123264e26d34c09cc673d213aea61fc7` | libtiff |
| libwebp | 1.2.2 / `20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c` | BSD-3-Clause |
| openlibm | 0.8.0 / `ae2d91698508701c83cab83714d42a1146dccf85` | Mixed permissive terms in upstream LICENSE |
| zlib | 1.2.12 / `21767c654d31d2dccdde4330529775c6c5fd5389` | Zlib |

Exact source URLs, exact upstream license/notice copies, and the complete
installed runtime dependency notice bundle ship under `public/third-party/`.
The top-level Apache copy in this directory is an exact
`tesseract.js-core@7.0.0` license sidecar; it is not a substitute for the native
component notices.

## Verification

- `eng.traineddata.gz` maps to
  `node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz`.
- `worker.min.js` maps to `node_modules/tesseract.js/dist/worker.min.js`.
- Each `tesseract-core*` file maps to the same basename in
  `node_modules/tesseract.js-core/`.
- `worker.min.js.LICENSE.txt` and `LICENSE-APACHE-2.0.txt` are exact installed
  package copies.

Run `bun run verify:ocr` after a frozen dependency installation. Run the
repository's third-party provenance verification as well so native license
copies, package versions, asset hashes, and the deployable notice bundle are
checked together.
