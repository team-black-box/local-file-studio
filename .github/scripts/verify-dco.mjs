#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { execFileSync } from "node:child_process";

const [baseSha, headSha] = process.argv.slice(2);

if (!/^[a-f0-9]{40}$/i.test(baseSha ?? "") || !/^[a-f0-9]{40}$/i.test(headSha ?? "")) {
  throw new Error("Usage: verify-dco.mjs <40-character-base-sha> <40-character-head-sha>");
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const commits = git("rev-list", "--reverse", "--no-merges", `${baseSha}..${headSha}`)
  .split("\n")
  .filter(Boolean);

if (!commits.length) throw new Error("DCO verification found no pull-request commits.");

const signoffPattern = /^Signed-off-by:\s+\S(?:.*\S)?\s+<[^<>\s@]+@[^<>\s@]+>\s*$/im;
const missing = [];

for (const commit of commits) {
  const message = git("show", "-s", "--format=%B", commit);
  if (!signoffPattern.test(message)) {
    missing.push(`${commit.slice(0, 12)} ${git("show", "-s", "--format=%s", commit)}`);
  }
}

if (missing.length) {
  throw new Error(`DCO sign-off is missing from ${missing.length} commit(s):\n- ${missing.join("\n- ")}`);
}

console.log(`Verified DCO sign-off for ${commits.length} pull-request commit(s).`);
