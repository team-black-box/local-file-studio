<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# GitHub and Vercel operations

This is the intended operating model for the public Local File Studio project. It does not authorize a commit, push, visibility change, Vercel link, deployment, environment change, or DNS change. A maintainer must approve each external action.

## Source, package, and deployment model

- Canonical source repository: `https://github.com/team-black-box/local-file-studio`.
- Default and production source branch: `main`.
- Runtime: a static Vite application built with the pinned Bun toolchain and frozen `bun.lock`.
- Vercel output: `dist/client`, as declared in `vercel.json`.
- Application backend: none. No upload endpoint, database, or runtime secret is required.
- Intended production hostname: `localfilestudio.app`, after an owner explicitly approves Vercel project linking, domain verification, and DNS changes.

`"private": true` in `package.json` prevents accidental publication to the npm registry. It has no effect on GitHub repository visibility, source licensing, Vercel access, or the visibility of a deployed website.

Apache-2.0 and Vercel address different layers. Apache-2.0 permits use, modification, and redistribution of covered source and built first-party code subject to its terms; Vercel serves a compiled copy of the application. Hosting the app does not change the source license, grant trademark rights, or replace the separate licenses and notices for third-party components. Keep `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`, and component-local notices with every applicable source or binary distribution.

## Repository rules before public contributions

Configure these rules for `main` after the first approved push and before opening the repository to contributions:

1. Require a pull request before merge and at least one approving review.
2. Dismiss stale approvals when code changes and require all review conversations to be resolved.
3. Require the `CI / verify` status check to pass on the latest commit.
4. Install or enable a DCO check and require it. Every contributed commit must contain a valid `Signed-off-by` trailer.
5. Block force pushes and branch deletion. Do not allow routine direct pushes to `main`.
6. Restrict rule bypass to the smallest maintainer group. Record emergency bypasses in an issue or incident note after the repository is safe.
7. Enable dependency alerts and secret scanning supported by the repository's GitHub plan. Review automated updates through the same CI and preview flow as contributor changes.

Use squash, rebase, or merge commits only if the resulting history retains the required DCO evidence and is consistent with the repository settings. Do not make signed commits and DCO sign-off interchangeable; they attest to different things.

## Change flow

```text
issue -> topic branch -> pull request -> CI -> Vercel preview -> production QA
      -> approval -> merge to main -> production build -> smoke checks
```

1. Triage the issue for privacy, data-integrity, resource-limit, compatibility, provenance, and licensing impact.
2. Create a focused branch from current `main`; use `fix/…`, `feat/…`, `docs/…`, or another descriptive prefix.
3. Develop with synthetic fixtures. Run `bun install --frozen-lockfile`, focused tests, and `bun run verify`.
4. Open a pull request with signed-off commits. CI builds from checked-out repository files only.
5. Let the Vercel Git integration create a preview for the pull request. Treat preview URLs as public enough that no secrets, customer documents, or confidential fixture data may be embedded in them.
6. Complete affected rows in [PRODUCTION_QA.md](PRODUCTION_QA.md), including a no-upload network inspection and offline test against the production build.
7. Merge only after CI, DCO, review, preview, and applicable legal/provenance gates pass.
8. Produce the public deployment only from `main`, or explicitly promote the exact preview deployment already approved for that commit. Do not deploy an unreviewed working tree or arbitrary topic branch to production.
9. Run production smoke checks on the Vercel hostname and `localfilestudio.app` when configured. Confirm the deployed commit and service-worker revision.

## Vercel configuration

When an owner authorizes project linking:

- Import the `team-black-box/local-file-studio` repository and keep the repository root as the project root.
- Use the production branch `main`.
- Keep the install, build, and output settings sourced from `vercel.json`: frozen Bun install, `bun run build`, and `dist/client`.
- Do not add a server function, upload route, rewrite to a backend, or document-processing secret.
- Enable pull-request previews for non-production branches. A preview is test infrastructure, not a release.
- Keep production deployment restricted to `main` or explicit promotion by an authorized maintainer.
- Apply deployment access controls to private-repository previews if available, without making runtime document processing depend on authentication.

The static application requires no environment variables. If a future operational integration needs one, document its purpose and scope separately; it must not receive selected document content by default.

## Domain launch

Do not change DNS until the repository's public-release gates, the full production QA matrix, and a Vercel-hostname smoke test pass.

1. Add `localfilestudio.app` to the approved Vercel production project.
2. Copy the exact DNS records Vercel presents into the authoritative DNS provider; do not infer them from this document.
3. Verify ownership, TLS issuance, canonical redirects, security headers, manifest scope, service-worker scope, and offline reload on the final hostname.
4. Decide explicitly whether `www.localfilestudio.app` redirects to the apex or is unsupported, then test that behavior.
5. Record the deployed Git commit, Vercel deployment identifier, DNS change, approver, and rollback target in the release record.

## Rollback

Keep at least the immediately preceding known-good Vercel deployment available.

- For a hosting-only failure, use Vercel's rollback or promote the previous known-good production deployment, then verify the hostname and offline update path.
- For a source defect, revert the offending commit in a reviewed pull request, run CI and focused QA, merge the revert, and deploy from `main`.
- For a security or privacy defect, stop promotion, limit exposure using the least disruptive available project control, and follow `SECURITY.md`. Do not erase source history or force-push `main`.
- After any rollback, reload once online so the service worker can install the known-good revision completely, then verify an offline reload. Existing clients may continue using an already-installed revision until their next successful online update.

Record what failed, the affected commit/deployment, the rollback action, and the checks that restored confidence. Fixes resume through the normal issue-to-preview flow.

## Release records

For each production release, retain:

- source commit and pull request;
- successful CI run;
- Vercel preview and production deployment identifiers;
- completed rows or exceptions from [PRODUCTION_QA.md](PRODUCTION_QA.md);
- dependency and third-party asset changes, hashes, notices, and legal review status;
- known limitations and rollback target; and
- the maintainer who approved external publication or promotion.
