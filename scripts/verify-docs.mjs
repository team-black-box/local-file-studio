#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "buffer",
  maxBuffer: 16 * 1024 * 1024,
})
  .toString("utf8")
  .split("\0")
  .filter((file) => file.endsWith(".md"))
  .sort();

const errors = [];
let checkedLinks = 0;

function localTarget(rawTarget) {
  const trimmed = rawTarget.trim();
  const target = trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.indexOf(">"))
    : trimmed.match(/^\S+/)?.[0];

  if (!target || target.startsWith("#") || target.startsWith("/")) return null;
  if (/^(?:https?:|mailto:|data:)/i.test(target)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) return null;

  const withoutFragment = target.split("#", 1)[0].split("?", 1)[0];
  if (!withoutFragment) return null;
  try {
    return decodeURIComponent(withoutFragment);
  } catch {
    return withoutFragment;
  }
}

for (const relativePath of tracked) {
  const absolutePath = path.join(root, relativePath);
  const markdown = readFileSync(absolutePath, "utf8");

  if (/(?:\/Users\/|\/private\/tmp\/|\/var\/folders\/|file:\/\/)/.test(markdown)) {
    errors.push(`${relativePath}: contains a local-only filesystem path`);
  }

  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)\n]+)\)/g)) {
    const target = localTarget(match[1]);
    if (!target) continue;

    checkedLinks += 1;
    const resolved = path.resolve(path.dirname(absolutePath), target);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
      errors.push(`${relativePath}: local link escapes the repository: ${target}`);
    } else if (!existsSync(resolved)) {
      errors.push(`${relativePath}: local link target does not exist: ${target}`);
    }
  }
}

if (errors.length) throw new Error(`Documentation verification failed:\n- ${errors.join("\n- ")}`);

console.log(`Documentation verification passed for ${tracked.length} tracked Markdown files and ${checkedLinks} local links.`);
