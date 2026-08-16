// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

function firstTagValue(value) {
  return Array.isArray(value) || ArrayBuffer.isView(value) ? value[0] : value;
}

export function getTiffDimensions(ifd) {
  const width = Number(ifd?.width ?? firstTagValue(ifd?.t256));
  const height = Number(ifd?.height ?? firstTagValue(ifd?.t257));

  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) return null;
  return { width, height };
}
