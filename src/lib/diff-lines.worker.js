// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { diffLines } from "diff";

self.postMessage({ type: "ready" });

self.onmessage = ({ data }) => {
  try {
    const changes = diffLines(data.left, data.right, {
      maxEditLength: data.maxEditLength,
      timeout: data.timeoutMs,
    });
    self.postMessage(changes ? { type: "result", changes } : { type: "limited" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
