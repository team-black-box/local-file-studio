<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Security policy

## Supported versions

Local File Studio has not published a stable release yet. Until a supported-version table is added, security fixes are made on the latest `main` branch only.

## Reporting a vulnerability

Please do not open an issue for a suspected vulnerability or include private documents, credentials, exploit details, or other sensitive data in an issue or pull request.

Use **Report a vulnerability** on the repository's **Security** tab, or open the [private vulnerability report form](https://github.com/team-black-box/local-file-studio/security/advisories/new). Verify that GitHub says the report will be private before submitting sensitive or exploitable details.

Include only the information needed to reproduce and assess the issue:

- the affected tool and browser;
- the affected revision or release;
- impact and required user interaction;
- minimal reproduction steps using synthetic, non-sensitive files; and
- any suggested mitigation.

Do not upload a user's real documents. Local File Studio's privacy boundary is that selected files and generated results stay on the user's device; any unexpected network transfer of file content is a security issue.

## Scope

Security reports may cover the application, its offline cache, vendored browser engines, build and release configuration, or a dependency used by the shipped static application. General bugs and feature requests should use the normal issue tracker once it is available.

GitHub dependency alerts, Dependabot security updates, standard secret scanning, and push protection are enabled. Code scanning is not configured. These automated controls do not replace human review, the frozen dependency audit, provenance checks, or the repository-history audit.

The maintainers cannot promise a fixed response or disclosure timeline before the first stable release. They will coordinate remediation and disclosure through an established confidential channel when possible.
