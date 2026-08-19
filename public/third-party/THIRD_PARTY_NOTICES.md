<!-- SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Browser distribution: third-party notices and provenance

This document describes third-party code and generated binary assets shipped by
the Local File Studio static browser build. It does not change upstream terms.
Exact license texts are in [`licenses/`](licenses/), and the deterministic
installed JavaScript package notice bundle is in
[`npm-licenses.txt`](npm-licenses.txt).

The version and license fields reported by an npm package are **package
metadata**. The native/WASM and binary-asset statements below are separately
verified facts based on exact upstream commits, package contents, build files,
and SHA-256 comparisons. This is an engineering provenance record, not legal
advice or a patent clearance opinion.

## Runtime JavaScript packages

`npm-licenses.txt` is generated from the exact installed production dependency
closure rooted at `package.json` (dependencies and browser-relevant installed
optional dependencies, excluding development-only packages). PDF.js's
Node-only optional `@napi-rs/canvas` subtree is explicitly excluded: it is not
used or emitted by the static browser build, and its installed platform binary
would make the result host-specific. For every included package the bundle
records the resolved name/version, declared license, repository metadata, and
verbatim root license/copying/notice files. Run
`node scripts/verify-third-party-assets.mjs` after a frozen install to detect
drift.

Minified or bundled code does not replace these notices. The static build ships
this directory so the upstream terms survive bundling.

### Packaged README license texts and browser exclusions

`hash.js@1.1.7` and `isarray@1.0.0` lack standalone license files, but their
packaged READMEs contain their complete MIT notices and are reproduced
verbatim in the generated bundle.

The inventory deliberately excludes Tesseract.js's `node-fetch` dependency
subtree and PDF.js's optional `@napi-rs/canvas` subtree. Those adapters are
Node-only, are not emitted by the static browser build, and would otherwise
introduce irrelevant or platform-specific packages into the browser notice.

## Office XML parser

- Package: `@xmldom/xmldom` 0.8.13
- Upstream: <https://github.com/xmldom/xmldom>
- Declared and packaged license: MIT

For the text-only Word-to-PDF workflow, the parser reads only the local
`[Content_Types].xml`, optional `_rels/.rels`, and the single internal main
document part declared there (or the standard `word/document.xml` fallback).
For PowerPoint-to-PDF, it reads the corresponding local manifests,
presentation order, and declared internal slide XML parts. Local File Studio
rejects document type and entity declarations plus external, ambiguous,
malformed, disguised, or traversing main/slide targets; it never loads Office
document resources. The exact packaged license text is reproduced in
`npm-licenses.txt`.

## Manrope font

- Package: `@fontsource-variable/manrope@5.3.0`
- Package/source: <https://github.com/fontsource/font-files/tree/v5.3.0/fonts/variable/manrope>
- Declared license: SIL Open Font License 1.1 (`OFL-1.1`)
- Shipped font license: [`Manrope-OFL-1.1.txt`](licenses/Manrope-OFL-1.1.txt)
- License SHA-256: `d826ab6583b12c26807d8716a545bdbbb672df04f48608a364ba9efdbe501c30`

The production CSS bundles the package's Manrope WOFF2 font data. The license
copy is byte-identical to the installed package license.

## SheetJS

- Component: SheetJS Community Edition (`xlsx`) 0.20.3
- Exact package URL: <https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz>
- Upstream tag: <https://git.sheetjs.com/sheetjs/sheetjs/src/tag/v0.20.3>
- Tarball SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`
- Declared license: Apache-2.0
- Shipped license: [`SheetJS-Apache-2.0.txt`](licenses/SheetJS-Apache-2.0.txt)

The audited tarball's `package.json`, `xlsx.mjs`, and `LICENSE` are byte-identical
to the frozen installation. Their SHA-256 digests are respectively
`bb9458277a69b41a304a89e45f19173ac0d23f2fc296091db49dba3c8b61c546`,
`1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`,
and `4d2a38ac35cda06a555c84074a819d413339cd3691b822cae50f8f322fe01f64`.
`bun.lock` records the exact URL but not the tarball SHA-256; the repository
verification therefore pins the URL and checks the installed anchor files,
while this record preserves the independently downloaded tarball digest.

## Tesseract OCR browser runtime

The vendored runtime is byte-checked by `scripts/verify-ocr-assets.mjs` against:

| Package | Version | Package metadata | Upstream/source fact |
| --- | --- | --- | --- |
| `tesseract.js` | 7.0.0 | Apache-2.0 | Worker comes from the installed package. |
| `tesseract.js-core` | 7.0.0 | Apache-2.0 | Tag `v7.0.0`, commit `acffef2b66eb44a31df297e11d905f4b39001068`; native tree below. |
| `@tesseract.js-data/eng` | 1.0.0 | MIT | The package contains no license text; the exact payload is verified against Apache-2.0 `naptha/tessdata`. |

The exact English model `eng.traineddata.gz` has SHA-256
`45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91`.
It matches `4.0.0_best_int/eng.traineddata.gz` at
<https://github.com/naptha/tessdata/tree/806cd9adc8c6e8abc11c782db1818c990576bebc>.
That repository's license at the verified commit is Apache-2.0, reproduced in
[`tessdata-Apache-2.0.txt`](licenses/tessdata-Apache-2.0.txt). This resolves the
payload's upstream license while preserving the npm metadata discrepancy.

The `tesseract.js-core` v7.0.0 build files compile/link the following native
submodules into the checked-in WASM variants:

| Native component | Verified version/commit | License | Exact source |
| --- | --- | --- | --- |
| Tesseract OCR fork | 5.3.0 / `2a9c1c49c360462733c386d2a44fcd22c4e21411` | Apache-2.0 | <https://github.com/Balearica/tesseract/tree/2a9c1c49c360462733c386d2a44fcd22c4e21411> |
| Leptonica | 1.83.0 / `4af068b56a9674da915debea4ed7e1b9885b17e8` | BSD-2-Clause-style upstream terms | <https://github.com/DanBloomberg/leptonica/tree/4af068b56a9674da915debea4ed7e1b9885b17e8> |
| giflib | 5.1.4 / `fa37672085ce4b3d62c51627ab3c8cf2dda8009a` | MIT-style upstream terms | <https://git.code.sf.net/p/giflib/code/tree/fa37672085ce4b3d62c51627ab3c8cf2dda8009a> |
| Independent JPEG Group libjpeg | 9a / `6c0fcb8ddee365e7abc4d332662b06900612e923` | IJG terms | <https://github.com/LuaDist/libjpeg/tree/6c0fcb8ddee365e7abc4d332662b06900612e923> |
| libpng | 1.6.38.git / `a37d4836519517bdce6cb9d956092321eca3e73b` | libpng-2.0-style upstream terms | <https://github.com/glennrp/libpng/tree/a37d4836519517bdce6cb9d956092321eca3e73b> |
| libtiff | 4.3.0 / `b51bb157123264e26d34c09cc673d213aea61fc7` | libtiff | <https://gitlab.com/libtiff/libtiff/-/tree/b51bb157123264e26d34c09cc673d213aea61fc7> |
| libwebp | 1.2.2 / `20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c` | BSD-3-Clause | <https://chromium.googlesource.com/webm/libwebp/+/20ef03ee351d4ff03fc5ff3ec4804a879d1b9d5c> |
| openlibm | 0.8.0 / `ae2d91698508701c83cab83714d42a1146dccf85` | Mixed permissive terms in upstream LICENSE | <https://github.com/JuliaMath/openlibm/tree/ae2d91698508701c83cab83714d42a1146dccf85> |
| zlib | 1.2.12 / `21767c654d31d2dccdde4330529775c6c5fd5389` | Zlib | <https://github.com/madler/zlib/tree/21767c654d31d2dccdde4330529775c6c5fd5389> |

Exact upstream license/notice files for every row are shipped in
[`licenses/`](licenses/). In particular, the IJG acknowledgement required by
libjpeg is preserved in `libjpeg-IJG-README.txt`. The WASM files and their own
hash manifest remain under `public/engines/tesseract/`.

## First-party and generated visual assets

These are not third-party license grants. They are recorded here so generated
PNG provenance and byte identity can be reviewed without adding first-party
SPDX ownership metadata to the binary files.

| Asset | Provenance | SHA-256 |
| --- | --- | --- |
| `assets/local-file-studio-icon-source.png` | AI-edited project icon source visual using the site forest-green, warm-paper, and coral palette; the front paper includes four generated coral document lines | `1db1a41864a13e01526f411e434baafa3853b28fd5edaa8331925bc4e79adc42` |
| `public/assets/local-file-studio-social.svg` | First-party social-card source authored for this repository | `8e9838d4df613f00070dfe06e4f9e982bee271cd4e8f9baafb54c629f59bdaea` |
| `public/assets/local-file-studio-social.png` | 1200×630 PNG rasterization of the preceding first-party SVG source | `5b0647891c783132b1c1373eda61e71b9ff3ce9d1b724dd856e4881b2595c04d` |
| `public/icons/apple-touch-icon.png` | 180×180 generated project icon rendition | `66286f3fae1e9aeb82d6fd2e0359312c8d25e59b542b6d0c11ce20c934c13ba4` |
| `public/icons/icon-192.png` | 192×192 generated project icon rendition | `0f27c12419cadca9420f1f7ee0d9550bd7653c11a8547dc94edccac14098122e` |
| `public/icons/icon-512.png` | 512×512 generated project icon rendition | `9fb786335f4104bca885c753e72aa7f90b6a165048a8e649f5261b2de974e74c` |
| `public/icons/icon-maskable-512.png` | Generated project icon rendition; byte-identical to `icon-512.png` | `9fb786335f4104bca885c753e72aa7f90b6a165048a8e649f5261b2de974e74c` |
| `public/assets/paper-terminal-dots-short.png` | Crop/derivative of the selected AI-generated Paper Terminal design reference | `0da98c7c16d8be0469fc2f6252e3f1a4f3703e913d84ff21406b7aebd481207b` |
| `public/assets/paper-terminal-dots.png` | Crop/derivative of the selected AI-generated Paper Terminal design reference | `1e3105b1f386ea2a8964bc7bde2a5928aff250bf275e1e0e354accbe8d32b602` |
| `public/assets/paper-terminal-ruler.png` | Crop/derivative of the selected AI-generated Paper Terminal design reference | `6343a30759edf1b876f0dd21d5e4395b2f5719529d54318b99df5b688fe832ea` |

The current icon source was edited with the built-in OpenAI image-generation
tool on 2026-08-13 from the preceding project icon composition. The edit kept
the overlapping paper/photo geometry, changed the visual palette to the site's
forest green (`#2F7357`), warm canvas (`#FAF8F2`), and coral (`#F05A24`), and
added four coral non-text document lines to the front paper. The checked-in 180, 192,
and 512 pixel renditions were resized from that 1254×1254 source with macOS
`sips`; the maskable rendition is an exact copy of the 512 pixel rendition.

The selected AI-generated Paper Terminal source reference has SHA-256
`c0ec3ab10faee8c49eb7bfcca6e5601cd3534ac080f1ca6f9b5159265f9014ea`
and dimensions 1487×1058. It is intentionally not part of the first commit; only
the three extracted UI assets above ship. The repository does not currently
retain generation prompt/tool metadata beyond this provenance statement.

## Verification and update procedure

1. Use the frozen Bun installation.
2. Run `node scripts/verify-ocr-assets.mjs` for all vendored OCR bytes.
3. Run `node scripts/verify-third-party-assets.mjs` to verify special package
   versions, hashes, exact license copies, generated visual hashes, lockfile
   anchors, and the deterministic npm notice bundle.
4. When an intentional runtime dependency changes, review its upstream license
   and native/transitive code, update this provenance record and fixed hashes,
   then run `node scripts/verify-third-party-assets.mjs --update-npm-notices`.
5. After a production build, run
   `node scripts/verify-third-party-assets.mjs --production` to confirm the
   deployable license and notice copies are exact.
