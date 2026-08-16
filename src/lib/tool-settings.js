// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

export function clearSensitiveToolSettings(current, settings) {
  let next = current;

  for (const setting of settings || []) {
    if (setting?.type !== "password" || !setting.key || current?.[setting.key] === "") continue;
    if (next === current) next = { ...current };
    next[setting.key] = "";
  }

  return next;
}
