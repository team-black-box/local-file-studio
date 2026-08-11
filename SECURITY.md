<!--
SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
SPDX-License-Identifier: Apache-2.0
-->

# Security policy

## Supported versions

Local File Studio has not published a stable release yet. Until a supported-version table is added, security fixes are made on the latest `main` branch only.

## Reporting a vulnerability

Please do not open an issue for a suspected vulnerability or include private documents, credentials, exploit details, or other sensitive data in an issue or pull request.

The repository is currently private, and GitHub Private Vulnerability Reporting is not available in this state. If you already have repository access, use an existing private maintainer or team channel to ask for a confidential reporting path, without including exploit details in the initial request. If you do not have an established private channel, retain the details until the repository becomes public and its private reporting flow is enabled. Do not disclose sensitive or exploitable information merely to request contact.

After the repository is public and maintainers have enabled GitHub Private Vulnerability Reporting, use **Report a vulnerability** on the repository's **Security** tab. Verify that the form says the report will be private before submitting details.

Include only the information needed to reproduce and assess the issue:

- the affected tool and browser;
- the affected revision or release;
- impact and required user interaction;
- minimal reproduction steps using synthetic, non-sensitive files; and
- any suggested mitigation.

Do not upload a user's real documents. Local File Studio's privacy boundary is that selected files and generated results stay on the user's device; any unexpected network transfer of file content is a security issue.

## Scope

Security reports may cover the application, its offline cache, vendored browser engines, build and release configuration, or a dependency used by the shipped static application. General bugs and feature requests should use the normal issue tracker once it is available.

GitHub dependency alerts and Dependabot security updates are enabled, but they do not inspect project code or replace human review. Secret scanning and GitHub code-security features are not enabled for the private repository because the required private-repository licensing has not been authorized. Do not assume GitHub will detect a committed secret or vulnerable code.

The maintainers cannot promise a fixed response or disclosure timeline before the first stable release. They will coordinate remediation and disclosure through an established confidential channel when possible.
