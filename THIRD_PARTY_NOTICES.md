<!-- SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Third-party notices

Local File Studio first-party source is licensed under Apache-2.0 as described
in the root `LICENSE` and `NOTICE`. Third-party components remain under their
upstream terms.

The static application ships a deployable notice bundle at
[`public/third-party/THIRD_PARTY_NOTICES.md`](public/third-party/THIRD_PARTY_NOTICES.md),
with exact license copies under `public/third-party/licenses/` and a
deterministic notice bundle for the full installed production dependency
closure at `public/third-party/npm-licenses.txt`. Vendored OCR bytes have an
additional component-local manifest and notice under
`public/engines/tesseract/`.

Those records deliberately distinguish npm-declared metadata from verified
native and binary provenance. Automated checks pin the audited OCR runtime,
SheetJS package anchors, font and native license copies, and generated visual
hashes.
