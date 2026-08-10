// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  FileLimitError,
  assertComparisonLineCounts,
  getToolLimits,
} from "./file-limits.js";

function complexityError(limits) {
  return new FileLimitError(
    "comparison-complexity-limit",
    `The PDFs differ too extensively to compare safely within ${limits.maxDiffEditLength.toLocaleString()} line edits and ${(limits.maxDiffMilliseconds / 1000).toLocaleString()} seconds. Compare smaller page ranges or more similar versions.`,
  );
}

function workerFailure(message) {
  const detail = message ? `: ${String(message).replace(/[.\s]+$/, "")}.` : ".";
  return new FileLimitError(
    "comparison-worker-failed",
    `The local comparison worker could not finish safely${detail} Try smaller page ranges or reload the app and retry.`,
  );
}

export function runBoundedLineDiff(left, right, limits = getToolLimits("compare-pdf"), dependencies = {}) {
  assertComparisonLineCounts(left, right, limits);
  const createWorker = dependencies.createWorker || (() => new Worker(
    new URL("./diff-lines.worker.js", import.meta.url),
    { type: "module" },
  ));
  const schedule = dependencies.setTimer || globalThis.setTimeout.bind(globalThis);
  const cancel = dependencies.clearTimer || globalThis.clearTimeout.bind(globalThis);

  return new Promise((resolve, reject) => {
    let worker;
    let hardTimer;
    let settled = false;
    let started = false;

    const finish = (error, changes) => {
      if (settled) return;
      settled = true;
      if (hardTimer !== undefined) cancel(hardTimer);
      worker?.terminate();
      if (error) reject(error);
      else resolve(changes);
    };

    try {
      worker = createWorker();
    } catch (error) {
      finish(workerFailure(error instanceof Error ? error.message : String(error)));
      return;
    }

    worker.onmessage = ({ data }) => {
      if (settled) return;
      if (data?.type === "ready") {
        if (started) {
          finish(workerFailure("the worker sent an invalid duplicate ready signal."));
          return;
        }
        started = true;
        hardTimer = schedule(() => {
          finish(new FileLimitError(
            "comparison-hard-timeout",
            `Compare PDF stopped its local worker after ${(limits.maxDiffHardMilliseconds / 1000).toLocaleString()} seconds. Compare smaller page ranges or more similar versions.`,
          ));
        }, limits.maxDiffHardMilliseconds);
        worker.postMessage({
          left,
          right,
          maxEditLength: limits.maxDiffEditLength,
          timeoutMs: limits.maxDiffMilliseconds,
        });
        return;
      }
      if (!started) {
        finish(workerFailure("the worker returned data before it was ready."));
        return;
      }
      if (data?.type === "result" && Array.isArray(data.changes)) finish(null, data.changes);
      else if (data?.type === "limited") finish(complexityError(limits));
      else if (data?.type === "error") finish(workerFailure(data.message));
      else finish(workerFailure("the worker returned an invalid response."));
    };
    worker.onerror = (event) => {
      event?.preventDefault?.();
      finish(workerFailure(event?.message));
    };
    worker.onmessageerror = () => finish(workerFailure("its response could not be decoded."));
  });
}
