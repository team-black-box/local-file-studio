<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

## What changed

<!-- Describe the user-visible contract and why this change is needed. Link the issue when one exists. -->

## Safety and compatibility

- [ ] Selected files and derived document data remain on the user's device.
- [ ] Limits, picker copy, preflight, processors, and structured errors agree.
- [ ] Success, error, cancellation, repeated-run, and unmount paths release resources.
- [ ] Untrusted names, metadata, markup, archives, and document content are handled safely.
- [ ] Offline/PWA behavior is unchanged, or the service-worker and precache changes are explained below.
- [ ] No secrets, private documents, generated `dist/` output, or unrelated local files are included.

## Verification

- [ ] `bun install --frozen-lockfile`
- [ ] `bun run verify`
- [ ] This branch is up to date with `main`, and the strict required `verify` check passes on the current revision.
- [ ] Production preview exercised in the affected desktop and mobile browsers.
- [ ] Relevant rows in `docs/PRODUCTION_QA.md` completed.
- [ ] Malformed and over-limit inputs fail before expensive work without exposing a partial result.
- [ ] Downloads reopen correctly and contain only the requested transformation.
- [ ] Browser console and network panels show no unexpected errors or document-data transfer.

Affected QA rows, browsers, and evidence:

<!-- List tool routes, browser/version, connection state, and synthetic fixtures. Do not attach sensitive documents. -->

## Dependencies, assets, and legal

- [ ] No dependency, binary, model, codec, font, generated bundle, or other vendored asset changed.
- [ ] Or: provenance, exact version/source, SHA-256 checksums, reproduction notes, upstream licenses, notices, and distribution implications are included.
- [ ] Every GitHub Action reference is pinned to a full commit SHA; workflow permissions remain read-only and cannot create or approve pull requests.
- [ ] Every commit includes a valid DCO `Signed-off-by` trailer.

## Review and merge readiness

- [ ] All review conversations are resolved.
- [ ] A reviewer other than the latest pusher approved after the latest reviewable push.
- [ ] The change can be squash- or rebase-merged with a linear history and without force-pushing or deleting `main`.

## Deployment notes

<!-- State whether this needs a preview-only check, migration, coordinated release, or rollback consideration. Merging must not require a secret or backend to build the static app. -->
