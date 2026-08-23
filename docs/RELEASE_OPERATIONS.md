<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# GitHub and Vercel operations

This document separates the GitHub controls already applied to the private repository from the current production-beta and future public-source operating model. Recorded past approvals do not authorize a later commit, push, visibility change, Vercel deployment, environment change, or DNS change; a maintainer must approve each external action.

## Source, package, and deployment model

- Canonical source repository: `https://github.com/team-black-box/local-file-studio`.
- Default source branch and connected Vercel production source branch: `main`.
- Runtime: a static Vite application built with the pinned Bun toolchain and frozen `bun.lock`.
- Vercel output: `dist/client`, as declared in `vercel.json`.
- Application backend: none. No upload endpoint, database, or runtime secret is required.
- Canonical production hostname: `localfilestudio.app`. It serves the production beta over TLS; `www.localfilestudio.app` permanently redirects to the apex.

The open-source build also generates the crawlable homepage, all canonical `/tools/{slug}` pages, structured metadata, social-card assets, `sitemap.xml`, `robots.txt`, `llms.txt`, and `sitemap.md`. These are derived from committed catalog and metadata sources; no proprietary SEO service, runtime API, analytics key, or hidden production repository is required. Search-console accounts, domain verification, DNS values, and crawler observations remain operational state and must not be committed when they contain secrets.

`"private": true` in `package.json` prevents accidental publication to the npm registry. It has no effect on GitHub repository visibility, source licensing, Vercel access, or the visibility of a deployed website.

Apache-2.0 and Vercel address different layers. Apache-2.0 permits use, modification, and redistribution of covered source and built first-party code subject to its terms; Vercel serves a compiled copy of the application. Hosting the app does not change the source license, grant trademark rights, or replace the separate licenses and notices for third-party components. Keep `LICENSE`, `NOTICE`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`, and component-local notices with every applicable source or binary distribution.

## Current GitHub posture: private repository

Last verified live 2026-08-23:

- Repository visibility is private.
- Actions must use full-length commit SHA references. The repository allows selected actions only: GitHub-owned actions are allowed, actions from other verified creators are disallowed, and the exact approved `oven-sh/setup-bun` SHA is allowlisted.
- The default workflow token has read-only permissions and workflows cannot approve pull requests.
- `main` requires resolution of review conversations, linear history, and the strict required `verify` status check. Branches must be up to date before merge. Required approvals, stale-review dismissal, and last-push approval are temporarily disabled during private iteration and must be restored before public visibility.
- The `main` rule applies to administrators. Force pushes and branch deletion are disabled.
- Merge commits are disabled; squash and rebase merges are enabled. Merged branches are deleted automatically, and updating pull-request branches is enabled.
- GitHub web commits require a DCO sign-off. The pull-request workflow verifies the `Signed-off-by` trailer on every non-merge commit, including commits created outside the web interface.
- Dependency alerts and Dependabot security updates are enabled. Automated security updates must pass the same strict CI rules as other changes and, after public visibility, the restored review rules.
- CI was rerun successfully after these settings were applied. The latest inspected protected run, [32634352301](https://github.com/team-black-box/local-file-studio/actions/runs/32634352301), passed on exact private-`main` commit `e11e52d42cd70273f3568b53289f9e31b33fee26`.
- The repository currently has no discovery topics. The reviewed public launch set is `pdf`, `image-tools`, `offline-first`, `privacy`, `pwa`, `vite`, `react`, and `open-source`; applying it is a separate repository-setting action.

Private Vulnerability Reporting is not available in the current private state. GitHub secret scanning and code-security features are also disabled because private-repository licensing has not been authorized. Do not describe any of those controls as active. Enabling paid or licensed private-repository security features requires explicit owner authorization.

These repository controls reduce source-change risk; they are not evidence that the source is ready to become public or that the application has passed either the focused launch gate or the ongoing production QA matrix.

## Additional gates before public contributions

Before inviting public issues or pull requests:

1. Complete the public-release section of [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and obtain explicit approval for the visibility change.
2. Re-audit the Actions policy, workflow permissions, `main` rules, merge settings, dependency alerts, and Dependabot security updates after the visibility change.
3. Enable Private Vulnerability Reporting as soon as it becomes available and verify the private reporting path from `SECURITY.md` and the issue forms.
4. Re-evaluate secret-scanning and code-security availability/licensing in the public state. Enable only owner-approved controls and record what was actually verified.
5. Reverify DCO enforcement for both contribution paths: the GitHub setting supplies sign-off for web commits, and the checked-in pull-request workflow validates every non-merge commit created outside the web interface.
6. Before changing visibility, restore and verify one independent approval, stale-review dismissal, and last-push approval by someone other than its pusher. Preserve strict `verify`, administrator enforcement, linear history, and the force-push/deletion blocks.

Use squash or rebase merges only if the resulting history retains the required DCO evidence. Merge commits are disabled. Do not make cryptographic commit signing and DCO sign-off interchangeable; they attest to different things.

## Change flow

The current private-repository source flow is:

```text
issue -> topic branch -> pull request -> strict CI
      -> squash/rebase merge to main
```

With the owner-authorized Vercel link active, extend it to:

```text
issue -> topic branch -> pull request -> CI -> Vercel preview -> affected QA
      -> merge to main -> production build -> smoke checks
```

Before public visibility, restore the contribution review step:

```text
issue -> topic branch -> pull request -> strict CI -> independent approval
      -> squash/rebase merge to main
```

1. Triage the issue for privacy, data-integrity, resource-limit, compatibility, provenance, and licensing impact.
2. Create a focused branch from current `main`; use `fix/…`, `feat/…`, `docs/…`, or another descriptive prefix.
3. Develop with synthetic fixtures. Run `bun install --frozen-lockfile`, focused tests, and `bun run verify`.
4. Open a pull request with signed-off commits. CI builds from checked-out repository files only and the strict `verify` check must pass on an up-to-date branch.
5. Resolve every conversation. During private iteration, independent approval is optional; after the repository becomes public, obtain the restored required approval after the latest reviewable push. Merge by squash or rebase only.
6. Let the Git integration create a preview for the pull request. Treat preview URLs as public enough that no secrets, customer documents, or confidential fixture data may be embedded in them.
7. Complete affected rows in [PRODUCTION_QA.md](PRODUCTION_QA.md), including a no-upload network inspection and offline test against the production build. For the first beta promotion, also complete the document's focused launch-critical smoke gate; the rest of the 47-tool matrix remains an ongoing deployed-candidate ledger.
8. Merge only after CI, DCO, applicable review requirements, preview QA, and legal/provenance gates pass.
9. Produce the public deployment only from `main`, or explicitly promote the exact preview deployment already approved for that commit. Do not deploy an unreviewed working tree or arbitrary topic branch to production.
10. Run production smoke checks on the Vercel hostname and `localfilestudio.app` when configured. Confirm the deployed commit and service-worker revision.

## Vercel configuration

Current owner-authorized project configuration:

- The `team-black-box/local-file-studio` repository is connected with the repository root as the project root.
- Use the production branch `main`.
- Keep the install, build, and output settings sourced from `vercel.json`: frozen Bun install, `bun run build`, and `dist/client`.
- Do not add a server function, upload route, rewrite to a backend, or document-processing secret.
- Pull-request previews are intended for non-production branches. A preview is test infrastructure, not a release. The production Git trigger was proven by an authorized cofounder commit: deployment `dpl_2RpBaYuDSJWvCBbQYqEAAb3JeYSa` reached `READY` from exact `main` commit `4f22fc0e468b72c30ed521d45d96ab598f8d00b2`.
- On 2026-08-14, exact merged `main` commit `65dff79f82b0dc6d9e1755d8125ebc7aff4184d0` was exported with `git archive`, excluding Git metadata and ignored local state, then deployed by an authenticated team identity. Preview `dpl_3cgubPBbTCHFjnJGhEsB4wvrrCzK` reached `READY` and was promoted to READY production deployment `dpl_EY92wx11fjabk3gpkacNVrAoCiMe`. The live service-worker revision `0d18c08aa9b66df0` and `/tools/convert-image` metadata match that reviewed source revision.
- On 2026-08-23, exact merged `main` commit `e11e52d42cd70273f3568b53289f9e31b33fee26` was exported with `git archive` and deployed as READY production deployment `dpl_AeULhE48NQyLpmxKJpSeKrctP1Gi`. The apex aliases that deployment. Its service worker and 80-entry precache manifest are byte-identical to the clean local production build at revision `b8c58adfee8c0147`; the static deployment still defines no Vercel Functions or document-upload path.
- Git-triggered deployments for commits authored by `abs192` remain `BLOCKED` because that Git author lacks Vercel project access. A manual clean-archive deployment is acceptable only from a clean, reviewed `main`, using an authenticated maintainer, with the source commit, preview deployment, production deployment, and live revision recorded. It does not fix the Git-trigger limitation; resolve Vercel membership before depending on that path.
- Keep production deployment restricted to `main` or explicit promotion by an authorized maintainer.
- Apply deployment access controls to private-repository previews if available, without making runtime document processing depend on authentication.

## Staged beta QA model

The first approved Vercel release is a staged beta, not a claim that all 47 tools have completed exhaustive production-browser QA.

1. Create a preview only after the owner explicitly authorizes Vercel linking and preview deployment. Assume the URL can be reached externally unless access control is verified.
2. Run the focused launch-critical smoke gate in [PRODUCTION_QA.md](PRODUCTION_QA.md) on the exact candidate. It samples the highest-risk processing families and verifies local-only networking, offline update safety, accessibility, generated-result preview, metadata/headers, and rollback readiness.
3. Promote only the reviewed `main` commit, or the exact approved preview for that commit, after the owner separately authorizes production promotion.
4. Continue the complete 47-tool matrix on deployed candidates. Leave untested boxes open and attach evidence only after the named browser/environment and independent result checks run.
5. Stop promotion or roll back for any observed privacy leak, document corruption/integrity defect, security failure, crash, unbounded resource use, broken offline update, or failed rollback path. A deferred noncritical row is not a pass or a waiver.
6. Keep GitHub public visibility and `localfilestudio.app` DNS as separate owner-approved transitions; neither follows automatically from a successful beta smoke run.

The static application requires no environment variables. If a future operational integration needs one, document its purpose and scope separately; it must not receive selected document content by default.

## Domain launch

The owner authorized and completed the custom-domain transition on 2026-08-13 while explicitly carrying the unchecked noncritical matrix rows into ongoing beta QA. The apex serves the Vercel production deployment over TLS, and `www` redirects permanently to the apex. Final-hostname offline/update and exercised rollback checks remain ongoing beta QA.

1. Add `localfilestudio.app` to the approved Vercel production project.
2. Copy the exact DNS records Vercel presents into the authoritative DNS provider; do not infer them from this document.
3. Verify ownership, TLS issuance, canonical redirects, security headers, manifest scope, service-worker scope, and offline reload on the final hostname.
4. Decide explicitly whether `www.localfilestudio.app` redirects to the apex or is unsupported, then test that behavior.
5. Confirm all canonical tool paths return their static tool-specific source, preview deployments are non-indexable, and the Vercel hostname does not compete as an unintended duplicate host.
6. Validate the sitemap, representative JSON-LD, link previews, and crawler policies. After owner approval, verify Search Console/Bing properties and submit the sitemap without committing verification secrets.
7. Record the deployed Git commit, Vercel deployment identifier, DNS change, approver, and rollback target in the release record.

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
