// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError } from "./file-limits.js";

// Match PDF.js's visible page: normalized MediaBox intersected with CropBox.
// Placement fractions describe that displayed page, not the unrotated MediaBox.
function normalizedBox(box) {
  const x = Math.min(box.x, box.x + box.width);
  const y = Math.min(box.y, box.y + box.height);
  return { x, y, width: Math.abs(box.width), height: Math.abs(box.height) };
}

export function createPdfImageDrawOperation(page, placement, image, name) {
  const media = normalizedBox(page.getMediaBox());
  const crop = normalizedBox(page.getCropBox());
  const x = Math.max(media.x, crop.x);
  const y = Math.max(media.y, crop.y);
  const width = Math.min(media.x + media.width, crop.x + crop.width) - x;
  const height = Math.min(media.y + media.height, crop.y + crop.height) - y;
  const box = width > 0 && height > 0 ? { x, y, width, height } : media;
  const angle = page.getRotation().angle;
  const rotation = angle % 90 === 0 ? ((angle % 360) + 360) % 360 : 0;
  const sideways = rotation === 90 || rotation === 270;
  const pageWidth = sideways ? box.height : box.width;
  const pageHeight = sideways ? box.width : box.height;
  const drawWidth = pageWidth * placement.width;
  const drawHeight = drawWidth * (image.height / image.width);
  const top = pageHeight * placement.y;
  if (drawHeight > pageHeight || pageHeight - top - drawHeight < -0.001) {
    throw new FileLimitError("overlay-outside-page", `${name} extends below page ${placement.pageIndex + 1}. Resize it or move it upward before exporting.`);
  }

  const visualCenterX = pageWidth * placement.x + drawWidth / 2;
  const visualCenterY = top + drawHeight / 2;
  let centerX;
  let centerY;
  switch (rotation) {
    case 90: [centerX, centerY] = [visualCenterY, visualCenterX]; break;
    case 180: [centerX, centerY] = [box.width - visualCenterX, visualCenterY]; break;
    case 270: [centerX, centerY] = [box.width - visualCenterY, box.height - visualCenterX]; break;
    default: [centerX, centerY] = [visualCenterX, box.height - visualCenterY];
  }
  // CSS rotates clockwise about the image center; PDF rotates counterclockwise
  // about its lower-left draw origin. Include the page's intrinsic rotation.
  const drawRotation = rotation - placement.rotation;
  const radians = drawRotation * Math.PI / 180;
  return {
    x: box.x + centerX - (drawWidth / 2 * Math.cos(radians) - drawHeight / 2 * Math.sin(radians)),
    y: box.y + centerY - (drawWidth / 2 * Math.sin(radians) + drawHeight / 2 * Math.cos(radians)),
    width: drawWidth,
    height: drawHeight,
    rotation: drawRotation,
    opacity: placement.opacity,
  };
}
