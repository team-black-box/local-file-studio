<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# CLI, MCP, and agent skill plan

Status: research and implementation plan recorded on 2026-08-13. Local File Studio does not currently ship a command-line interface, MCP server, or installable agent skill. This document does not promise a release date or expand the behavior claimed by the web application.

## Objective

Let people and local agents run supported Local File Studio operations without opening the React interface while preserving the same privacy, input validation, resource limits, output integrity, and licensing guarantees.

The CLI and MCP server must be interfaces over one shared execution contract. The agent skill must orchestrate those interfaces; it must not contain another PDF or image implementation.

```text
React UI ----\
CLI ----------> shared runner -> catalog -> limits -> preflight -> processors
MCP server --/                                            |
                                                    runtime adapters
```

## Non-goals

- Do not turn the static Vite application into a hosted processing service.
- Do not add uploads, remote document processing, document telemetry, or a server fallback.
- Do not advertise all 47 browser tools as CLI-compatible before each runtime path is implemented and tested.
- Do not make an agent read document bytes, extracted text, OCR text, passwords, or other derived content merely to invoke a transformation.
- Do not duplicate tool names, settings, limits, accepted formats, or user-facing safety rules in the CLI, MCP server, or skill.
- Do not make npm publication, MCP-directory publication, binary releases, or skill installation automatic; each is a separate release decision.

## Current technical evidence

The repository already has the main components of a shared engine:

- `src/tools.js` is the catalog and settings source.
- `src/lib/file-limits.js` owns resource policy and displayed limit descriptions.
- `src/lib/file-preflight.js` performs format-aware validation before expensive work.
- `src/lib/processors.js` validates settings, runs preflight, dispatches processors, and returns structured results.
- `src/lib/pdf-processors.js` and `src/lib/image-processors.js` contain the transformations.
- `src/lib/file-utils.js` combines reusable result helpers with browser-only download behavior.

The current runner accepts browser `File` objects and produces results containing browser `Blob` objects. Several processors also use `document`, canvas, `createImageBitmap`, PDF.js rendering, or browser workers. File download uses object URLs and DOM anchors. Those browser dependencies must be isolated behind explicit adapters rather than polyfilled globally or copied into a second engine.

The catalog's visible `settings` are not yet a complete machine contract. Page selections, page order, form values, overlay assets, placements, and other workbench state can currently reach processors through additional options. Phase one must define those inputs in one machine-readable schema beside the catalog so CLI and MCP validation cannot drift from the UI.

The first implementation phase must create a tested runtime-capability inventory. A tool is available through an interface only when its complete preflight and processing path works in that runtime.

## Shared execution contract

Define a versioned request and response that can be used by React, the CLI, and MCP:

```text
ToolRequest
  schemaVersion
  tool slug
  input sources
  validated settings
  output destination policy
  AbortSignal / cancellation
  progress callback

ToolResponse
  schemaVersion
  tool slug
  result name
  relative output path or in-memory browser artifact
  MIME type
  byte size
  SHA-256 for persisted CLI/MCP output
  safe details
  elapsed time

ToolError
  stable code
  actionable message
  bounded safe details
  retryable flag where meaningful
```

Add narrow adapters rather than branching processor semantics:

- Browser input: existing `File`/`Blob` objects.
- Bun input: a bounded path-backed file source exposing `name`, `type`, `size`, and `arrayBuffer()`.
- Browser output: retained `Blob` results and existing download/preview lifecycle.
- CLI/MCP output: bounded temporary file followed by an atomic rename into an approved output directory.
- Browser rendering: existing canvas, image decoding, PDF.js, and worker lifecycle.
- Non-browser runtime: only explicitly implemented and audited capabilities.

Keep `AbortSignal` and cleanup in the shared contract. Cancellation must close documents and workers, discard incomplete temporary files, release buffers, and never expose a partial result as complete.

## CLI MVP

Use the long binary name `local-file-studio`; an `lfs` alias can be considered separately because that abbreviation is already used by other software.

Proposed generic commands:

```bash
local-file-studio list --json
local-file-studio describe merge-pdf --json
local-file-studio run merge-pdf \
  --input first.pdf \
  --input second.pdf \
  --output-dir ./results \
  --json
```

Settings should come from the catalog schema and use repeatable `--set key=value` arguments or a validated request file. Do not add a hand-maintained set of flags whose accepted values can drift from the web application.

The first supported group should be the deterministic structural PDF paths that can be made runtime-neutral without raster or DOM behavior:

- Merge PDF.
- Split PDF.
- Remove Pages.
- Extract Pages.
- Organize PDF.
- Rotate PDF.
- Add Page Numbers.
- Add Watermark.
- Crop PDF.
- Archive PDF Rewrite.

This list is a research target, not a compatibility claim. Each tool remains unavailable until its existing preflight, processor, output, password, and cleanup path passes Bun parity tests.

CLI safeguards:

- Resolve and validate every input and output path; reject traversal, symlink escapes, unsupported file types, and non-files.
- Refuse to overwrite existing files by default. Require an explicit overwrite option for the exact resolved target.
- Write each result to a temporary file in the destination filesystem, verify its size and type, then rename atomically.
- Keep machine-readable results on stdout and progress/diagnostics on stderr.
- Map stable errors to documented nonzero exit codes without printing document content.
- Accept passwords only from a no-echo interactive prompt or standard input. Never accept them in command arguments, environment variables, logs, shell history, or JSON output.
- Preserve the central count, byte, page, generated-item, retained-result, archive, pixel, and output limits.

## Later CLI capability groups

Evaluate these only after the structural MVP:

1. PDF repair, unlock, protect, and form processing after the WASM/runtime and secret-input paths are verified.
2. Add Image to PDF after placement geometry and image sources have a serializable, bounded schema. The visual editor remains the preferred interface for manual placement.
3. PDF rendering, compression, redaction, OCR, PDF-to-image, and text extraction after an audited rendering/worker adapter exists.
4. Office conversion and image tools after DOM, canvas, codec, font, native-code, memory, and cross-platform behavior are explicitly resolved.
5. Photo Editor, Meme Generator, and other interactive tools only when a complete nonvisual request schema can express the intended edit without guessing user choices.

Do not install a large headless-browser or native-image dependency merely to claim catalog parity. Compare maintenance, security, binary size, licensing, platform coverage, and whether a local browser executor can safely reuse the production bundle before choosing a runtime.

## Local MCP server

Build MCP only after the CLI contract and structural tools are stable. Use the current authoritative MCP specification and an audited official SDK version selected during implementation; do not pin a version in this planning document.

The initial server should use local `stdio` transport only and expose a small stable surface:

- `list_local_file_tools`
- `describe_local_file_tool`
- `run_local_file_tool`

Do not generate one permanent MCP function per catalog entry. `list` and `describe` must derive their schemas and runtime-availability facts from the live catalog and shared runner.

MCP safeguards:

- Require configured filesystem roots and a configured output root.
- Resolve real paths and reject traversal, symlink escape, device files, sockets, and writes outside the output root.
- Do not expose a remote HTTP/SSE processing endpoint.
- Do not fetch input URLs or accept uploaded/base64 document bodies.
- Return result identifiers, relative output paths, MIME types, sizes, hashes, and safe diagnostics—not document bytes.
- Write text, OCR, Markdown, translation, and other content-bearing results to local files. Do not return their contents to the agent or model by default.
- Treat filenames as potentially sensitive metadata and keep tool responses minimal.
- Support cancellation and MCP progress notifications through the shared runner.
- Reject password-protected operations until the host has a verified secret-entry mechanism that does not place a password in model-visible tool arguments or transcripts.

An agent conversation may be processed by a remote model even when the MCP process is local. Therefore “local MCP” alone does not make model-visible tool arguments or responses private. The server and skill must keep document content and secrets out of that channel.

## Repository-hosted agent skill

After the MCP wrapper works, create the source skill at:

```text
skills/local-file-studio/
├── SKILL.md
└── agents/
    └── openai.yaml
```

Initialize it with the standard skill initializer rather than handcrafting the package. Keep `SKILL.md` concise and imperative. It should trigger when an agent is asked to perform a supported local PDF or image transformation with Local File Studio.

The skill should:

1. Prefer the configured Local File Studio MCP server.
2. Fall back to the installed CLI when MCP is unavailable.
3. Call `list` and `describe` before relying on a capability, so the skill never embeds a stale 47-tool catalog.
4. Use an explicit input scope and output directory.
5. Avoid reading, uploading, attaching, quoting, or summarizing document contents.
6. Refuse silent overwrite and surface lossy-format or unsupported-runtime limitations before running.
7. Verify the result count, MIME type, byte size, and SHA-256 returned by the runner.
8. Report local result locations and safe metadata without claiming to have visually inspected a document it did not open.

The skill should not include conversion scripts, copied processors, an asset bundle, or a second policy reference. Detailed live capability data belongs in `describe`; durable privacy and orchestration rules belong in the skill.

Proposed trigger examples for later forward testing:

- “Merge these three PDFs locally and save the result beside them.”
- “Split this PDF after pages 3 and 8 without uploading it.”
- “Rotate every page in this PDF 90 degrees and keep the original.”
- “Use Local File Studio to remove pages 2 and 5.”
- “List the Local File Studio operations available to this agent.”

Validate the skill package with the standard skill validator. Forward-test it in fresh agent tasks using synthetic files and no leaked expected result. Test MCP preference, CLI fallback, unsupported tools, overwrite refusal, malformed input, cancellation, and privacy-safe output reporting.

Keep the repository copy as the open-source source of truth. Installation into Codex or another compatible agent environment is a separate, documented user action and must not mutate global agent configuration during a build or package install.

## Package and release shape

A likely target layout is:

```text
packages/core/
packages/cli/
packages/mcp/
skills/local-file-studio/
```

Introduce that layout incrementally; do not move every browser module in one refactor. The root web package can remain `"private": true`. If CLI or MCP packages are later published, give each its own package metadata, versioning, `files` allowlist, license/notice inclusion, provenance, vulnerability audit, and explicit publication approval.

Evaluate distribution separately:

- source use through a clean clone and Bun;
- an npm-compatible package invoked with Bun;
- signed release binaries for supported operating systems; and
- MCP/skill directory listings.

Do not promise any distribution channel until clean-machine installation, update, uninstall, checksum, license, and rollback behavior is verified.

## Verification strategy

Every implementation PR must keep `bun run verify` green and add focused checks appropriate to the new layer.

Shared-core checks:

- Browser runner and Bun runner use the same catalog, policies, settings validation, and stable error codes.
- Synthetic fixtures produce semantically equivalent outputs; do not require byte equality where timestamps or container ordering are intentionally nondeterministic.
- Exact-boundary and one-unit-over limits agree across interfaces.
- Cancellation and injected failures leave no partial output or retained resource.

CLI checks:

- Help, list, describe, success, malformed input, unsupported tool, overwrite refusal, cancellation, and stable JSON/exit-code behavior.
- Paths with spaces and Unicode, traversal, symlinks, non-files, missing files, read-only destinations, and interrupted atomic writes.
- Passwords do not appear in process arguments, output, logs, or error messages.
- Clean-clone operation on every supported operating system and architecture.

MCP checks:

- Schema parity with CLI/catalog discovery.
- Root isolation, safe relative outputs, minimal responses, cancellation, and progress.
- No network access or document bytes/content in tool responses.
- Host behavior when secrets, unsupported capabilities, or inaccessible paths are requested.

Skill checks:

- Standard package validation and accurate UI metadata.
- Fresh-task forward tests for representative requests.
- MCP preference, CLI fallback, correct capability discovery, and honest unsupported-tool responses.
- No copied catalog, no file-content inspection, and no undocumented overwrite or upload behavior.

Before releasing any layer, repeat dependency, native-code, license, notice, checksum, SBOM, clean-install, repository-hygiene, and security review. Add the new distribution artifacts to `THIRD_PARTY_NOTICES.md` and production/release documentation where applicable.

## Implementation sequence

Use separate issues and reviewed pull requests:

1. **Shared runner contract and runtime inventory** — isolate browser adapters, define versioned requests/results/errors, add cancellation, and prove UI parity without changing product behavior.
2. **Structural PDF CLI MVP** — implement safe filesystem adapters, atomic outputs, generic catalog-derived commands, and cross-platform tests.
3. **Local stdio MCP wrapper** — add root isolation, minimal metadata responses, progress/cancellation, and explicit secret/content exclusions.
4. **Repository-hosted agent skill** — initialize, author, validate, install locally for development, and forward-test against MCP and CLI.
5. **Capability expansion** — evaluate password/WASM, placement, rendering/OCR, Office, image, and interactive groups through separate evidence-backed issues.

Each issue must define its supported-tool list and explicit exclusions. No later phase should block shipping or maintaining the static web application.

## Open decisions before implementation

- Confirm the initial operating-system and architecture support matrix.
- Decide whether the shared package is internal-only or separately versioned.
- Choose CLI source-only, npm-compatible, compiled-binary, or staged distribution after clean-machine research.
- Select and audit the MCP SDK and protocol version at implementation time.
- Define the exact MCP host/root configuration and supported secret-entry mechanism.
- Decide whether any content-returning agent operation can satisfy the product privacy promise; default to local-file output only.
- Decide when the repository-hosted skill should also be published to external skill directories.
- Obtain explicit authorization before package publication, release uploads, directory submission, or global skill/MCP installation.
