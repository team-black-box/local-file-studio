// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { baseName, createResultBudget, getCompressionSizeChange, resultFromBlob, retainResult, safeFileName, zipResults } from "./file-utils.js";
import { FileLimitError, assertImageDimensions, assertOutputDimensions, assertOutputSize, getAnimatedGifPlan, getImageCropPlan, getProportionalResizeDimensions, getToolLimits } from "./file-limits.js";
import { getTiffDimensions } from "./tiff-utils.js";

const IMAGE_OUTPUTS = {
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  webp: { mime: "image/webp", ext: "webp" },
};

const ABSOLUTE_CANVAS_LIMITS = getToolLimits("compress-image");

export function createImageCompressionOutcome(inputBytes, outputBytes, width, height, format, quality) {
  const change = getCompressionSizeChange(inputBytes, outputBytes);
  const normalizedFormat = String(format || "").toLowerCase();
  const normalizedQuality = Math.max(10, Math.min(100, Math.round(Number(quality))));
  if (!change || !Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || !IMAGE_OUTPUTS[normalizedFormat] || !Number.isFinite(normalizedQuality)) {
    throw new FileLimitError("invalid-image-compression-outcome", "The image compression preview reported invalid output details. Choose the image again and retry.");
  }
  return {
    ...change,
    width,
    height,
    format: IMAGE_OUTPUTS[normalizedFormat].ext,
    quality: normalizedQuality,
    qualityApplies: normalizedFormat !== "png",
  };
}

export function hasNonFragmentSvgUrl(value) {
  const source = String(value || "");
  const references = source.matchAll(/url\s*\(\s*([^)]*?)(?:\)|$)/gi);

  for (const match of references) {
    let target = match[1].trim();
    if ((target.startsWith('"') && target.endsWith('"'))
      || (target.startsWith("'") && target.endsWith("'"))) {
      target = target.slice(1, -1).trim();
    }
    if (!target.startsWith("#")) return true;
  }

  return false;
}

export function shouldRemoveSvgAttribute(name, value, nodeLocalName = "") {
  const normalizedName = String(name || "").toLowerCase();
  const normalizedValue = String(value || "").trim();
  const normalizedNodeName = String(nodeLocalName || "").toLowerCase();

  return normalizedName.startsWith("on")
    || normalizedName === "xml:base"
    || /^(src|srcset|poster|background)$/.test(normalizedName)
    || (/^(href|xlink:href)$/.test(normalizedName)
      && (!normalizedValue.startsWith("#") || normalizedNodeName === "image"))
    || hasNonFragmentSvgUrl(normalizedValue);
}

function makeCanvas(width, height, label = "This image") {
  assertImageDimensions(width, height, ABSOLUTE_CANVAS_LIMITS, label);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function matchesImageSignature(bytes, mime) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (mime === "image/jpeg") return input.length >= 3 && input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  if (mime === "image/png") return input.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => input[index] === value);
  if (mime === "image/webp") {
    return input.length >= 12
      && String.fromCharCode(...input.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...input.slice(8, 12)) === "WEBP";
  }
  return false;
}

async function canvasToBlob(canvas, mime = "image/png", quality = 0.88) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("This browser could not encode the image."))), mime, quality);
  });
  if (blob.type !== mime) {
    throw new FileLimitError(
      "unsupported-image-encoder",
      `This browser cannot create ${IMAGE_OUTPUTS[Object.keys(IMAGE_OUTPUTS).find((key) => IMAGE_OUTPUTS[key].mime === mime)]?.ext.toUpperCase() || mime} images. Choose another output format or update the browser.`,
    );
  }
  const signature = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (!matchesImageSignature(signature, mime)) {
    throw new FileLimitError("invalid-image-output", "The browser returned an invalid encoded image. No result was kept; choose another output format and try again.");
  }
  return blob;
}

async function fileToBitmap(file, limits) {
  const lower = file.name.toLowerCase();
  let source = file;

  if (/\.svg$/.test(lower)) {
    const parsed = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
    if (parsed.querySelector("parsererror") || parsed.documentElement?.localName !== "svg") {
      throw new FileLimitError("invalid-svg", `${file.name} is not a valid SVG. Re-save it as a self-contained SVG and try again.`);
    }
    parsed.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((node) => node.remove());
    parsed.querySelectorAll("style").forEach((node) => {
      if (/@import/i.test(node.textContent || "") || hasNonFragmentSvgUrl(node.textContent)) node.remove();
    });
    parsed.querySelectorAll("*").forEach((node) => {
      for (const attribute of [...node.attributes]) {
        if (shouldRemoveSvgAttribute(attribute.name, attribute.value, node.localName)) {
          node.removeAttribute(attribute.name);
        }
      }
    });
    source = new Blob([new XMLSerializer().serializeToString(parsed.documentElement)], { type: "image/svg+xml" });
  } else if (/\.(tif|tiff)$/.test(lower)) {
    const module = await import("utif");
    const UTIF = module.default || module;
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    if (!ifds.length) throw new Error("No image frame was found in this TIFF.");
    if (ifds.length !== 1) {
      throw new FileLimitError(
        "multi-frame-image",
        `${file.name} contains ${ifds.length.toLocaleString()} pages or frames. Image conversion accepts one image per TIFF; export the pages separately and try again.`,
      );
    }
    const dimensions = getTiffDimensions(ifds[0]);
    if (!dimensions) {
      throw new FileLimitError("unreadable-image-metadata", `${file.name} does not expose readable TIFF dimensions. Re-save it as JPG, PNG, or WebP and try again.`);
    }
    assertImageDimensions(dimensions.width, dimensions.height, limits, file.name);
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = makeCanvas(dimensions.width, dimensions.height);
    canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba), dimensions.width, dimensions.height), 0, 0);
    return {
      source: canvas,
      width: canvas.width,
      height: canvas.height,
      close: () => {
        canvas.width = 1;
        canvas.height = 1;
      },
    };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    bitmap = null;
  }
  if (bitmap) {
    try {
      assertImageDimensions(bitmap.width, bitmap.height, limits, file.name);
    } catch (error) {
      bitmap.close();
      throw error;
    }
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  {
    const url = URL.createObjectURL(source);
    try {
      const image = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = () => reject(new Error("This image format is not supported by the browser."));
        node.src = url;
      });
      assertImageDimensions(image.naturalWidth, image.naturalHeight, limits, file.name);
      return { source: image, width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function consumeImagePixels(budget, bitmap, fileName) {
  const pixels = Number(bitmap.width) * Number(bitmap.height);
  if (!Number.isFinite(pixels) || pixels <= 0) {
    throw new FileLimitError("invalid-image-dimensions", `${fileName} reported invalid image dimensions. Re-save the image and try again.`);
  }
  if (budget.limit && budget.used + pixels > budget.limit) {
    throw new FileLimitError(
      "image-batch-too-large",
      `${fileName} takes this job above ${(budget.limit / 1_000_000).toLocaleString()} MP of decoded pixels. Remove images or process the batch in smaller groups.`,
    );
  }
  budget.used += pixels;
}

function fitWithin(width, height, maxDimension = 10000) {
  const ratio = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

function outputConfig(options, fallback = "png") {
  const requested = String(options.format || fallback).toLowerCase();
  const config = IMAGE_OUTPUTS[requested];
  if (!config) {
    throw new FileLimitError("unsupported-output-format", "Choose PNG, JPG, or WebP as the image output format.");
  }
  return config;
}

function drawCover(context, source, sourceWidth, sourceHeight, width, height) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawOutlinedText(context, text, x, y, maxWidth, size, align = "center") {
  context.save();
  context.font = `900 ${size}px Manrope, Arial, sans-serif`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0,0,0,.92)";
  context.lineWidth = Math.max(3, size * 0.09);
  context.strokeText(text, x, y, maxWidth);
  context.fillStyle = "white";
  context.fillText(text, x, y, maxWidth);
  context.restore();
}

async function renderOne(slug, file, options, report, pixelBudget) {
  const limits = getToolLimits(slug);
  const bitmap = await fileToBitmap(file, limits);
  const quality = Math.max(0.1, Math.min(1, Number(options.quality || 82) / 100));
  let canvas;
  let imageResizeOutcome = null;
  let imageCropOutcome = null;
  const originalFormat = /jpe?g/i.test(file.type) ? "jpg" : /webp/i.test(file.type) ? "webp" : "png";
  let config = outputConfig(options, slug === "convert-image" ? "webp" : originalFormat);

  try {
    consumeImagePixels(pixelBudget, bitmap, file.name);
    report?.({ phase: "Preparing pixels", progress: 0.18 });

    if (slug === "resize-image" || slug === "upscale-image") {
      const scale = slug === "upscale-image"
        ? Math.max(2, Number(options.scale || 2))
        : Number(options.percent || 0) > 0
          ? Number(options.percent) / 100
          : null;
      const target = slug === "resize-image"
        ? getProportionalResizeDimensions(bitmap.width, bitmap.height, options.width ?? bitmap.width, limits, `${file.name} after resizing`)
        : fitWithin(bitmap.width * scale, bitmap.height * scale);
      assertOutputDimensions(target.width, target.height, limits, `${file.name} after ${slug === "upscale-image" ? "upscaling" : "resizing"}`);
      if (slug === "resize-image") {
        imageResizeOutcome = {
          sourceWidth: bitmap.width,
          sourceHeight: bitmap.height,
          width: target.width,
          height: target.height,
          scalePercent: Math.round((target.width / bitmap.width) * 100),
          direction: target.width < bitmap.width ? "downsize" : target.width > bitmap.width ? "enlarge" : "unchanged",
        };
      }
      canvas = makeCanvas(target.width, target.height);
      const picaModule = await import("pica");
      const pica = picaModule.default();
      const sourceCanvas = makeCanvas(bitmap.width, bitmap.height);
      try {
        sourceCanvas.getContext("2d").drawImage(bitmap.source, 0, 0);
        await pica.resize(sourceCanvas, canvas, { quality: 3, alpha: true });
      } finally {
        sourceCanvas.width = 1;
        sourceCanvas.height = 1;
      }
    } else if (slug === "crop-image") {
      const crop = getImageCropPlan(
        bitmap.width,
        bitmap.height,
        options.aspectRatio ?? options.aspect ?? "free",
        options.cropScale ?? 100,
        options.focusX ?? 50,
        options.focusY ?? 50,
        limits,
        `${file.name} after cropping`,
      );
      imageCropOutcome = crop;
      canvas = makeCanvas(crop.width, crop.height);
      canvas.getContext("2d").drawImage(bitmap.source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    } else if (slug === "rotate-image") {
      const angle = Number(options.angle || 90);
      const radians = (angle * Math.PI) / 180;
      const swap = Math.abs(angle % 180) === 90;
      canvas = makeCanvas(swap ? bitmap.height : bitmap.width, swap ? bitmap.width : bitmap.height);
      const context = canvas.getContext("2d");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(radians);
      context.drawImage(bitmap.source, -bitmap.width / 2, -bitmap.height / 2);
    } else if (slug === "remove-background") {
      canvas = makeCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap.source, 0, 0);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = frame.data;
      const corners = [0, (canvas.width - 1) * 4, (canvas.width * (canvas.height - 1)) * 4, (canvas.width * canvas.height - 1) * 4];
      const background = corners.reduce((acc, index) => [acc[0] + pixels[index], acc[1] + pixels[index + 1], acc[2] + pixels[index + 2]], [0, 0, 0]).map((value) => value / 4);
      const tolerance = Number(options.tolerance || 54);
      for (let index = 0; index < pixels.length; index += 4) {
        const distance = Math.hypot(pixels[index] - background[0], pixels[index + 1] - background[1], pixels[index + 2] - background[2]);
        pixels[index + 3] = Math.max(0, Math.min(255, ((distance - tolerance * 0.55) / (tolerance * 0.65)) * 255));
      }
      context.putImageData(frame, 0, 0);
      if (options.background && options.background !== "transparent") {
        const flattened = makeCanvas(canvas.width, canvas.height);
        const flattenedContext = flattened.getContext("2d");
        flattenedContext.fillStyle = options.background === "black" ? "#000000" : "#ffffff";
        flattenedContext.fillRect(0, 0, flattened.width, flattened.height);
        flattenedContext.drawImage(canvas, 0, 0);
        canvas.width = 1;
        canvas.height = 1;
        canvas = flattened;
      }
      config = IMAGE_OUTPUTS.png;
    } else if (slug === "blur-face") {
      canvas = makeCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap.source, 0, 0);
      let regions = [];
      if ("FaceDetector" in window) {
        try {
          const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: limits.maxDetectedFaces + 1 });
          const faces = await detector.detect(bitmap.source);
          if (faces.length > limits.maxDetectedFaces) {
            throw new FileLimitError(
              "face-count-limit",
              `${file.name} has more than ${limits.maxDetectedFaces.toLocaleString()} detected faces. Crop it into smaller groups so every detected face can be blurred and reviewed.`,
            );
          }
          regions = faces.map(({ boundingBox }) => boundingBox);
        } catch (error) {
          if (error instanceof FileLimitError) throw error;
          regions = [];
        }
      }
      if (!regions.length) {
        const size = Math.min(bitmap.width, bitmap.height) * 0.34;
        regions = [{ x: bitmap.width / 2 - size / 2, y: bitmap.height * 0.16, width: size, height: size * 1.12 }];
      }
      for (const region of regions) {
        const pad = Math.max(region.width, region.height) * 0.14;
        context.save();
        context.beginPath();
        context.ellipse(region.x + region.width / 2, region.y + region.height / 2, region.width / 2 + pad, region.height / 2 + pad, 0, 0, Math.PI * 2);
        context.clip();
        context.filter = `blur(${Number(options.blur || 22)}px)`;
        context.drawImage(bitmap.source, 0, 0);
        context.restore();
      }
    } else {
      canvas = makeCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (config.mime === "image/jpeg") {
        context.fillStyle = options.background || "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (slug === "photo-editor") {
        const brightness = Number(options.brightness || 100);
        const contrast = Number(options.contrast || 100);
        const saturation = Number(options.saturation || 100);
        const warmth = Number(options.warmth || 0);
        context.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${Math.max(0, warmth)}%)`;
      }
      context.drawImage(bitmap.source, 0, 0);
      context.filter = "none";

      if (slug === "watermark-image") {
        const text = String(options.text || "Local File Studio");
        const size = Math.max(18, Math.round(Math.min(canvas.width, canvas.height) * 0.06));
        context.save();
        context.globalAlpha = Number(options.opacity || 35) / 100;
        context.font = `700 ${size}px Manrope, Arial, sans-serif`;
        const position = options.position || "center";
        const padding = size * 0.7;
        const x = position.includes("left") ? padding : position.includes("right") ? canvas.width - padding : canvas.width / 2;
        const y = position.includes("top") ? padding : position.includes("bottom") ? canvas.height - padding : canvas.height / 2;
        context.textAlign = position.includes("left") ? "left" : position.includes("right") ? "right" : "center";
        context.fillStyle = options.color || "#ffffff";
        context.translate(x, y);
        context.rotate((Number(options.angle || -24) * Math.PI) / 180);
        context.fillText(text, 0, 0, canvas.width * 0.86);
        context.restore();
      }

      if (slug === "meme-generator") {
        const size = Math.max(24, Math.round(canvas.width * 0.07));
        drawOutlinedText(context, String(options.topText || "WHEN THE FILE" ).toUpperCase(), canvas.width / 2, size * 0.85, canvas.width * 0.9, size);
        drawOutlinedText(context, String(options.bottomText || "STAYS ON YOUR DEVICE").toUpperCase(), canvas.width / 2, canvas.height - size * 0.85, canvas.width * 0.9, size);
      }

      if (slug === "photo-editor" && options.text) {
        const size = Math.max(20, Math.round(Math.min(canvas.width, canvas.height) * 0.055));
        context.font = `700 ${size}px Manrope, Arial, sans-serif`;
        context.textAlign = "center";
        context.fillStyle = options.textColor || "#ffffff";
        context.fillText(String(options.text), canvas.width / 2, canvas.height * 0.9, canvas.width * 0.86);
      }
    }

    report?.({ phase: "Encoding image", progress: 0.76 });
    const blob = await canvasToBlob(canvas, config.mime, quality);
    const suffix = slug === "compress-image" ? "compressed" : slug === "convert-image" ? "converted" : slug.replace(/-image$|^convert-/g, "") || "edited";
    const result = resultFromBlob(`${safeFileName(baseName(file.name))}-${safeFileName(suffix)}.${config.ext}`, blob, `${canvas.width} × ${canvas.height}`);
    return slug === "compress-image"
      ? {
        ...result,
        details: `${canvas.width.toLocaleString()} × ${canvas.height.toLocaleString()} · ${config.ext === "png" ? "Lossless PNG re-encode" : `${Math.round(quality * 100).toLocaleString()}% quality`}`,
        imageCompressionOutcome: createImageCompressionOutcome(file.size, blob.size, canvas.width, canvas.height, config.ext, quality * 100),
      }
      : slug === "resize-image"
        ? { ...result, imageResizeOutcome }
      : slug === "crop-image"
        ? { ...result, imageCropOutcome }
      : result;
  } finally {
    bitmap.close?.();
    if (canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
  }
}

export async function createImageCompressionPreview(file, quality = 82) {
  const limits = getToolLimits("compress-image");
  const result = await renderOne("compress-image", file, { quality }, undefined, { used: 0, limit: limits.maxImagePixelsTotal });
  assertOutputSize(result.size, result.name, limits.maxOutputBytes);
  return result;
}

async function jpgsToAnimatedGif(files, options, report) {
  const limits = getToolLimits("convert-from-jpg");
  const pixelBudget = { used: 0, limit: limits.maxImagePixelsTotal };
  if (files.length > limits.maxGifFrames) {
    throw new FileLimitError("gif-frame-limit", `Animated GIF supports up to ${limits.maxGifFrames} frames. Process the remaining images in another animation.`);
  }
  const { GIFEncoder, applyPalette, quantize } = await import("gifenc");
  const first = await fileToBitmap(files[0], limits);
  try {
    consumeImagePixels(pixelBudget, first, files[0].name);
    const plan = getAnimatedGifPlan(
      [{ name: files[0].name, width: first.width, height: first.height }],
      options.delay,
      options.loop,
      limits,
      files.length,
    );
    const encoder = GIFEncoder();
    let coverCroppedFrames = 0;
    for (let index = 0; index < files.length; index += 1) {
      report?.({ phase: `Encoding GIF frame ${index + 1} of ${files.length}`, progress: index / files.length });
      const bitmap = index === 0 ? first : await fileToBitmap(files[index], limits);
      const canvas = makeCanvas(plan.width, plan.height);
      try {
        if (index > 0) consumeImagePixels(pixelBudget, bitmap, files[index].name);
        if ((bitmap.width * first.height) !== (bitmap.height * first.width)) coverCroppedFrames += 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        drawCover(context, bitmap.source, bitmap.width, bitmap.height, plan.width, plan.height);
        const data = context.getImageData(0, 0, plan.width, plan.height).data;
        const palette = quantize(data, 256);
        const indexed = applyPalette(data, palette);
        encoder.writeFrame(indexed, plan.width, plan.height, { palette, delay: plan.delayMs, repeat: plan.loop ? 0 : -1 });
      } finally {
        if (index > 0) bitmap.close?.();
        canvas.width = 1;
        canvas.height = 1;
      }
    }
    encoder.finish();
    const blob = new Blob([encoder.bytes()], { type: "image/gif" });
    const result = resultFromBlob(
      "local-animation.gif",
      blob,
      `${plan.frameCount} frames · ${plan.width} × ${plan.height} · ${plan.delayMs} ms/frame`,
    );
    return [{ ...result, gifOutcome: { ...plan, coverCroppedFrames } }];
  } finally {
    first.close?.();
  }
}

async function htmlToImage(files, options) {
  const limits = getToolLimits("html-to-image");
  const module = await import("html-to-image");
  const source = files[0] ? await files[0].text() : String(options.html || "<h1>Private by design</h1><p>This image was rendered locally.</p>");
  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.querySelectorAll("script, iframe, object, embed, form, link, meta, style").forEach((node) => node.remove());
  parsed.querySelectorAll("*").forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith("on") || /^(src|srcset|href|xlink:href|poster|background|style)$/i.test(attribute.name)) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  const frame = document.createElement("div");
  frame.className = "html-capture-frame";
  const viewportWidth = Math.max(320, Math.min(3840, Number(options.viewportWidth || 900)));
  frame.style.cssText = `position:fixed;left:-12000px;top:0;width:${viewportWidth}px;min-height:560px;padding:64px;background:#fff;color:#17171a;font:16px/1.55 Manrope,Arial,sans-serif`;
  frame.append(...parsed.body.childNodes);
  document.body.append(frame);
  try {
    const captureHeight = Math.max(1, frame.scrollHeight);
    if (captureHeight > limits.maxHtmlHeight) {
      throw new FileLimitError("html-height-limit", `The rendered HTML is ${captureHeight.toLocaleString()} px tall; local capture supports ${limits.maxHtmlHeight.toLocaleString()} px. Split the document into shorter sections.`);
    }
    assertOutputDimensions(
      viewportWidth * 1.5,
      captureHeight * 1.5,
      { maxFileBytes: 1, maxOutputEdge: limits.maxOutputEdge, maxOutputPixels: limits.maxHtmlOutputPixels },
      "The HTML capture",
    );
    const method = options.format === "svg" ? module.toSvg : options.format === "jpg" ? module.toJpeg : module.toPng;
    const dataUrl = await method(frame, { cacheBust: false, pixelRatio: 1.5, backgroundColor: "#ffffff", quality: 0.92 });
    const blob = await (await fetch(dataUrl)).blob();
    const ext = options.format === "svg" ? "svg" : options.format === "jpg" ? "jpg" : "png";
    return [resultFromBlob(`local-html-capture.${ext}`, blob, `${viewportWidth} px local HTML capture`)];
  } finally {
    frame.remove();
  }
}

export async function processImageTool(slug, files, options = {}, report) {
  if (slug === "html-to-image") return await htmlToImage(files, options);
  if (!files.length) throw new Error("Choose at least one image to continue.");
  if (slug === "convert-from-jpg") return await jpgsToAnimatedGif(files, options, report);

  const results = [];
  const limits = getToolLimits(slug);
  const pixelBudget = { used: 0, limit: limits.maxImagePixelsTotal };
  const resultBudget = createResultBudget({ maxItems: limits.maxGeneratedItems || undefined });
  for (let index = 0; index < files.length; index += 1) {
    report?.({ phase: `Processing ${index + 1} of ${files.length}`, progress: index / files.length });
    const checkedPreview = options.compressionPreview;
    const previewOutcome = checkedPreview?.result?.imageCompressionOutcome;
    const previewMatches = slug === "compress-image"
      && index === 0
      && checkedPreview?.file === files[index]
      && checkedPreview.result?.blob instanceof Blob
      && (previewOutcome?.qualityApplies === false || previewOutcome?.quality === Math.round(Number(options.quality || 82)));
    const result = previewMatches
      ? checkedPreview.result
      : await renderOne(slug, files[index], options, report, pixelBudget);
    if (previewMatches) {
      consumeImagePixels(pixelBudget, { width: previewOutcome.width, height: previewOutcome.height }, files[index].name);
      assertOutputSize(result.size, result.name, limits.maxOutputBytes);
      report?.({ phase: "Reusing checked sample", progress: 0.76 });
    }
    results.push(retainResult(resultBudget, result));
  }
  report?.({ phase: "Finishing", progress: 0.96 });
  const finalResults = options.keepSeparate ? results : await zipResults(results, `${safeFileName(slug)}-results.zip`);
  if (slug === "compress-image" && results.length > 1 && finalResults.length === 1) {
    const inputBytes = files.reduce((sum, file) => sum + file.size, 0);
    const outputBytes = finalResults[0].size;
    const change = getCompressionSizeChange(inputBytes, outputBytes);
    return [{
      ...finalResults[0],
      imageCompressionBatchOutcome: {
        ...change,
        fileCount: results.length,
        inputBytes,
        outputBytes,
        encodedBytes: results.reduce((sum, result) => sum + result.size, 0),
        reducedFiles: results.filter((result) => result.imageCompressionOutcome?.status === "reduced").length,
      },
    }];
  }
  if (slug === "resize-image" && results.length > 1 && finalResults.length === 1) {
    const outcomes = results.map((result) => result.imageResizeOutcome).filter(Boolean);
    return [{
      ...finalResults[0],
      imageResizeBatchOutcome: {
        fileCount: results.length,
        targetWidth: outcomes[0]?.width || Math.round(Number(options.width)),
        downsizedFiles: outcomes.filter((outcome) => outcome.direction === "downsize").length,
        enlargedFiles: outcomes.filter((outcome) => outcome.direction === "enlarge").length,
        unchangedFiles: outcomes.filter((outcome) => outcome.direction === "unchanged").length,
      },
    }];
  }
  if (slug === "crop-image" && results.length > 1 && finalResults.length === 1) {
    const outcomes = results.map((result) => result.imageCropOutcome).filter(Boolean);
    if (outcomes.length !== results.length) {
      throw new FileLimitError("invalid-crop-outcome", "The crop batch did not report complete output details. No result was kept; choose the images again and retry.");
    }
    return [{
      ...finalResults[0],
      imageCropBatchOutcome: {
        fileCount: results.length,
        aspectRatio: String(options.aspectRatio ?? options.aspect ?? "free"),
        cropScale: Number(options.cropScale ?? 100),
        focusX: Number(options.focusX ?? 50),
        focusY: Number(options.focusY ?? 50),
        retainedPercentMinimum: Math.min(...outcomes.map((outcome) => outcome.retainedPercent)),
        retainedPercentMaximum: Math.max(...outcomes.map((outcome) => outcome.retainedPercent)),
      },
    }];
  }
  return finalResults;
}
