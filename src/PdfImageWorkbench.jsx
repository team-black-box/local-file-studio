// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CopyIcon,
  DownloadSimpleIcon,
  GaugeIcon,
  ImageSquareIcon,
  MinusIcon,
  PlusIcon,
  ResizeIcon,
  ShieldCheckIcon,
  SpinnerGapIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { categoryById } from "./tools.js";
import {
  describePdfOverlayImageLimits,
  describeToolLimits,
  getPdfOverlayImagePolicy,
  getToolLimits,
  summarizeRejections,
  validateFileSelection,
  validatePdfOverlayImageSelection,
  validatePdfOverlayPlacements,
} from "./lib/file-limits.js";
import { preflightPdfOverlayImages, preflightToolFiles, toFriendlyResourceError } from "./lib/file-preflight.js";
import { downloadResult, formatBytes } from "./lib/file-utils.js";
import { destroyPdfJsDocument } from "./lib/pdfjs-utils.js";
import { runTool } from "./lib/processors.js";

let pdfJsPromise;

async function getPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
  }
  return await pdfJsPromise;
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The browser could not prepare this image."))), type);
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function placementHeight(placement, asset, pageSize) {
  if (!asset || !pageSize?.width || !pageSize?.height) return placement.width;
  return placement.width * (asset.height / asset.width) * (pageSize.width / pageSize.height);
}

function PageThumbnail({ document, pageIndex, active, placementCount, onSelect }) {
  const buttonRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(active);

  useEffect(() => {
    if (visible || !buttonRef.current || !("IntersectionObserver" in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(buttonRef.current);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !document || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask;
    let page;
    (async () => {
      page = await document.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: 96 / base.width });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      renderTask = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport });
      await renderTask.promise;
    })().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.warn("Page thumbnail could not render", error);
    });
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* Render already completed. */ }
      page?.cleanup();
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
    };
  }, [document, pageIndex, visible]);

  return (
    <button ref={buttonRef} className={`pdf-page-thumbnail ${active ? "active" : ""}`} onClick={onSelect} aria-current={active ? "page" : undefined} aria-label={`Open page ${pageIndex + 1}${placementCount ? `, ${placementCount} placed ${placementCount === 1 ? "image" : "images"}` : ""}`}>
      <span className="thumbnail-sheet">{visible && <canvas ref={canvasRef} aria-hidden="true" />}</span>
      <span>Page {pageIndex + 1}</span>
      {placementCount > 0 && <strong>{placementCount}</strong>}
    </button>
  );
}

function MainPageCanvas({ document, pageIndex, limits, onPageSize }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask;
    let page;
    (async () => {
      page = await document.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      onPageSize({ width: base.width, height: base.height });
      const targetWidth = Math.min(1200, limits.maxRasterEdge, Math.max(760, base.width));
      let scale = targetWidth / base.width;
      const pixels = base.width * scale * base.height * scale;
      if (pixels > limits.maxRasterPixels) scale *= Math.sqrt(limits.maxRasterPixels / pixels);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      renderTask = page.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport });
      await renderTask.promise;
    })().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") console.warn("PDF page could not render", error);
    });
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* Render already completed. */ }
      page?.cleanup();
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
    };
  }, [document, pageIndex, limits, onPageSize]);

  return <canvas ref={canvasRef} className="pdf-editor-page-canvas" aria-label={`Preview of PDF page ${pageIndex + 1}`} />;
}

export function PdfImageWorkbench({ tool, onClose, onComplete }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const openerRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pageSurfaceRef = useRef(null);
  const documentRef = useRef(null);
  const urlsRef = useRef(new Set());
  const interactionCleanupRef = useRef(null);
  const dismissedRef = useRef(false);
  const placementsRef = useRef([]);
  const limits = useMemo(() => getToolLimits(tool), [tool]);
  const pdfLimitCopy = useMemo(() => describeToolLimits(tool), [tool]);
  const imagePolicy = useMemo(() => getPdfOverlayImagePolicy(tool), [tool]);
  const imageLimitCopy = useMemo(() => describePdfOverlayImageLimits(tool), [tool]);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [assets, setAssets] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [draggingPdf, setDraggingPdf] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [addingImages, setAddingImages] = useState(false);
  const [cleaningAssetId, setCleaningAssetId] = useState(null);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ phase: "Ready", progress: 0 });
  const [error, setError] = useState("");
  const [fileIssue, setFileIssue] = useState(null);
  const [results, setResults] = useState([]);

  placementsRef.current = placements;
  const selectedPlacement = placements.find((placement) => placement.id === selectedPlacementId) || null;
  const selectedAsset = selectedPlacement ? assets.find((asset) => asset.id === selectedPlacement.assetId) : null;
  const placementsByPage = useMemo(() => {
    const counts = new Map();
    for (const placement of placements) counts.set(placement.pageIndex, (counts.get(placement.pageIndex) || 0) + 1);
    return counts;
  }, [placements]);

  const revokeUrl = (url) => {
    if (!url || !urlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  };

  const createUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    urlsRef.current.add(url);
    return url;
  };

  const clearAssets = () => {
    for (const asset of assets) {
      revokeUrl(asset.sourceUrl);
      if (asset.previewUrl !== asset.sourceUrl) revokeUrl(asset.previewUrl);
    }
    setAssets([]);
    setPlacements([]);
    setSelectedPlacementId(null);
    setUndoStack([]);
    setRedoStack([]);
    setResults([]);
  };

  const closeWorkbench = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    interactionCleanupRef.current?.();
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
    window.requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else window.document.querySelector(".hero-search input")?.focus();
    });
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    dismissedRef.current = false;
    openerRef.current = window.document.activeElement;
    dialog?.showModal();
    titleRef.current?.focus();
    return () => {
      dismissedRef.current = true;
      interactionCleanupRef.current?.();
      destroyPdfJsDocument(documentRef.current).catch(() => {});
      documentRef.current = null;
      for (const url of urlsRef.current) URL.revokeObjectURL(url);
      urlsRef.current.clear();
      if (dialog?.open) dialog.close();
    };
  }, []);

  const commitPlacements = (next) => {
    setUndoStack((stack) => [...stack.slice(-39), placements]);
    setRedoStack([]);
    setPlacements(next);
    setResults([]);
    setError("");
  };

  const undo = () => {
    if (!undoStack.length) return;
    const previous = undoStack.at(-1);
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-39), placements]);
    setPlacements(previous);
    if (!previous.some((placement) => placement.id === selectedPlacementId)) setSelectedPlacementId(null);
    setResults([]);
  };

  const redo = () => {
    if (!redoStack.length) return;
    const next = redoStack.at(-1);
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-39), placements]);
    setPlacements(next);
    setResults([]);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undoStack, redoStack, placements, selectedPlacementId]);

  const choosePdf = async (incoming) => {
    const file = [...incoming][0];
    if (!file) return;
    const validation = validateFileSelection(tool, [], [file]);
    if (validation.rejected.length) {
      setFileIssue({ title: "PDF wasn’t added", details: validation.rejected.map((item) => item.message) });
      return;
    }
    setLoadingPdf(true);
    setError("");
    setFileIssue(null);
    setResults([]);
    try {
      await preflightToolFiles(tool, [file], {}, (next) => setProgress(next));
      const pdfjs = await getPdfJs();
      const nextDocument = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      if (dismissedRef.current) {
        await destroyPdfJsDocument(nextDocument);
        return;
      }
      await destroyPdfJsDocument(documentRef.current).catch(() => {});
      clearAssets();
      documentRef.current = nextDocument;
      setPdfDocument(nextDocument);
      setPdfFile(file);
      setPageCount(nextDocument.numPages);
      setCurrentPage(0);
      setPageSize(null);
      setProgress({ phase: "Ready", progress: 0 });
    } catch (caught) {
      setError(toFriendlyResourceError(caught, tool.name)?.message || "This PDF could not be opened locally.");
    } finally {
      setLoadingPdf(false);
    }
  };

  const addImages = async (incoming) => {
    const incomingFiles = [...incoming];
    if (!incomingFiles.length) return;
    setAddingImages(true);
    setError("");
    setFileIssue(null);
    const existingFiles = assets.map((asset) => asset.sourceFile);
    const validation = validatePdfOverlayImageSelection(tool, existingFiles, incomingFiles);
    const acceptedAssets = [];
    const rejected = [...validation.rejected];
    let safeFiles = [...existingFiles];
    try {
      for (const file of validation.accepted) {
        try {
          const preflight = await preflightPdfOverlayImages(tool, [...safeFiles, file]);
          if (dismissedRef.current) return;
          const metadata = preflight.metadata.at(-1);
          const sourceUrl = createUrl(file);
          acceptedAssets.push({
            id: crypto.randomUUID(),
            sourceFile: file,
            sourceUrl,
            previewUrl: sourceUrl,
            preparedBlob: null,
            cleanupMode: "off",
            width: metadata.width,
            height: metadata.height,
          });
          safeFiles.push(file);
        } catch (caught) {
          rejected.push({ code: caught.code || "invalid-image", file, message: caught.message });
        }
      }
      if (acceptedAssets.length) setAssets((current) => [...current, ...acceptedAssets]);
      if (rejected.length) {
        setFileIssue({
          title: acceptedAssets.length ? "Some images weren’t added" : "No images were added",
          summary: summarizeRejections(acceptedAssets.length, rejected),
          details: rejected.map((item) => item.message),
        });
      }
    } finally {
      setAddingImages(false);
    }
  };

  const removeAsset = (assetId) => {
    const asset = assets.find((item) => item.id === assetId);
    const nextPlacements = placements.filter((placement) => placement.assetId !== assetId);
    setUndoStack((stack) => [...stack.slice(-39), placements]);
    setRedoStack([]);
    setPlacements(nextPlacements);
    setAssets((current) => current.filter((item) => item.id !== assetId));
    if (selectedAsset?.id === assetId) setSelectedPlacementId(null);
    setResults([]);
    window.requestAnimationFrame(() => {
      revokeUrl(asset?.sourceUrl);
      if (asset?.previewUrl !== asset?.sourceUrl) revokeUrl(asset?.previewUrl);
    });
  };

  const placeAsset = (assetId) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset || !pageSize) return;
    let width = 0.28;
    const heightAtWidth = width * (asset.height / asset.width) * (pageSize.width / pageSize.height);
    if (heightAtWidth > 0.38) width *= 0.38 / heightAtWidth;
    width = clamp(width, 0.08, 0.55);
    const height = width * (asset.height / asset.width) * (pageSize.width / pageSize.height);
    const placement = {
      id: crypto.randomUUID(),
      assetId,
      pageIndex: currentPage,
      x: (1 - width) / 2,
      y: clamp(0.34, 0, 1 - height),
      width,
      rotation: 0,
      opacity: 1,
    };
    const next = [...placements, placement];
    try {
      validatePdfOverlayPlacements(next, assets, pageCount, tool);
      commitPlacements(next);
      setSelectedPlacementId(placement.id);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const removePlacement = (placementId) => {
    commitPlacements(placements.filter((placement) => placement.id !== placementId));
    if (selectedPlacementId === placementId) setSelectedPlacementId(null);
  };

  const duplicatePlacement = (placement = selectedPlacement) => {
    if (!placement) return;
    const asset = assets.find((item) => item.id === placement.assetId);
    const height = placementHeight(placement, asset, pageSize);
    const duplicate = {
      ...placement,
      id: crypto.randomUUID(),
      x: clamp(placement.x + 0.025, 0, 1 - placement.width),
      y: clamp(placement.y + 0.025, 0, 1 - height),
    };
    const next = [...placements, duplicate];
    try {
      validatePdfOverlayPlacements(next, assets, pageCount, tool);
      commitPlacements(next);
      setSelectedPlacementId(duplicate.id);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const repeatOnAllPages = () => {
    if (!selectedPlacement) return;
    const existingPages = new Set(placements.filter((placement) => placement.assetId === selectedPlacement.assetId).map((placement) => placement.pageIndex));
    const copies = Array.from({ length: pageCount }, (_, pageIndex) => pageIndex)
      .filter((pageIndex) => !existingPages.has(pageIndex))
      .map((pageIndex) => ({ ...selectedPlacement, id: crypto.randomUUID(), pageIndex }));
    const next = [...placements, ...copies];
    try {
      validatePdfOverlayPlacements(next, assets, pageCount, tool);
      commitPlacements(next);
    } catch (caught) {
      setError(caught.message);
    }
  };

  const updateSelectedPlacement = (patch, commit = false) => {
    if (!selectedPlacement) return;
    const next = placements.map((placement) => placement.id === selectedPlacement.id ? { ...placement, ...patch } : placement);
    if (commit) commitPlacements(next);
    else {
      setPlacements(next);
      setResults([]);
      setError("");
    }
  };

  const cleanWhiteBackground = async (assetId, mode) => {
    const asset = assets.find((item) => item.id === assetId);
    if (!asset || cleaningAssetId) return;
    setCleaningAssetId(assetId);
    setError("");
    try {
      if (mode === "off") {
        const oldPreview = asset.previewUrl;
        setAssets((current) => current.map((item) => item.id === assetId ? { ...item, previewUrl: item.sourceUrl, preparedBlob: null, cleanupMode: "off" } : item));
        if (oldPreview !== asset.sourceUrl) window.requestAnimationFrame(() => revokeUrl(oldPreview));
        return;
      }
      const bitmap = await createImageBitmap(asset.sourceFile);
      const canvas = window.document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const threshold = { gentle: 248, balanced: 236, strong: 220 }[mode] || 236;
      const featherStart = threshold - 28;
      for (let index = 0; index < pixels.data.length; index += 4) {
        const whiteness = Math.min(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
        if (whiteness >= threshold) pixels.data[index + 3] = 0;
        else if (whiteness > featherStart) pixels.data[index + 3] = Math.round(pixels.data[index + 3] * ((threshold - whiteness) / (threshold - featherStart)));
      }
      context.putImageData(pixels, 0, 0);
      const blob = await canvasToBlob(canvas);
      canvas.width = 1;
      canvas.height = 1;
      if (dismissedRef.current) return;
      if (blob.size > imagePolicy.maxPreparedFileBytes) {
        throw new Error(`${asset.sourceFile.name} becomes ${formatBytes(blob.size)} after cleanup, above the ${formatBytes(imagePolicy.maxPreparedFileBytes)} prepared-image limit. Use a smaller image.`);
      }
      const previewUrl = createUrl(blob);
      const oldPreview = asset.previewUrl;
      setAssets((current) => current.map((item) => item.id === assetId ? { ...item, previewUrl, preparedBlob: blob, cleanupMode: mode } : item));
      if (oldPreview !== asset.sourceUrl) window.requestAnimationFrame(() => revokeUrl(oldPreview));
      setResults([]);
    } catch (caught) {
      setError(toFriendlyResourceError(caught, "White-background cleanup")?.message || "The image background could not be cleaned locally.");
    } finally {
      setCleaningAssetId(null);
    }
  };

  const beginInteraction = (event, placement, mode) => {
    if (status === "processing" || !pageSurfaceRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedPlacementId(placement.id);
    interactionCleanupRef.current?.();
    const rect = pageSurfaceRef.current.getBoundingClientRect();
    const asset = assets.find((item) => item.id === placement.assetId);
    const height = placementHeight(placement, asset, pageSize);
    const snapshot = placements;
    const centerX = rect.left + (placement.x + placement.width / 2) * rect.width;
    const centerY = rect.top + (placement.y + height / 2) * rect.height;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));
    let changed = false;

    const onMove = (moveEvent) => {
      moveEvent.preventDefault();
      let patch;
      if (mode === "drag") {
        patch = {
          x: clamp(placement.x + (moveEvent.clientX - event.clientX) / rect.width, 0, 1 - placement.width),
          y: clamp(placement.y + (moveEvent.clientY - event.clientY) / rect.height, 0, 1 - height),
        };
      } else if (mode === "resize") {
        const distance = Math.hypot(moveEvent.clientX - centerX, moveEvent.clientY - centerY);
        const imageRatio = asset.height / asset.width;
        const maxByHeight = (1 - placement.y) / (imageRatio * (pageSize.width / pageSize.height));
        patch = { width: clamp(placement.width * (distance / startDistance), 0.04, Math.min(1 - placement.x, maxByHeight, 0.9)) };
      } else {
        let rotation = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * (180 / Math.PI) + 90;
        while (rotation > 180) rotation -= 360;
        while (rotation < -180) rotation += 360;
        patch = { rotation };
      }
      changed = true;
      setPlacements((current) => current.map((item) => item.id === placement.id ? { ...item, ...patch } : item));
      setResults([]);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      interactionCleanupRef.current = null;
    };
    const onUp = () => {
      cleanup();
      if (changed) {
        setUndoStack((stack) => [...stack.slice(-39), snapshot]);
        setRedoStack([]);
      }
    };
    interactionCleanupRef.current = cleanup;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const movePlacementWithKeyboard = (event, placement) => {
    if (["Backspace", "Delete"].includes(event.key)) {
      event.preventDefault();
      removePlacement(placement.id);
      return;
    }
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!directions[event.key]) return;
    event.preventDefault();
    const asset = assets.find((item) => item.id === placement.assetId);
    const height = placementHeight(placement, asset, pageSize);
    const step = event.shiftKey ? 0.0025 : 0.01;
    const [dx, dy] = directions[event.key];
    const next = placements.map((item) => item.id === placement.id ? {
      ...item,
      x: clamp(item.x + dx * step, 0, 1 - item.width),
      y: clamp(item.y + dy * step, 0, 1 - height),
    } : item);
    commitPlacements(next);
  };

  const exportPdf = async () => {
    if (!pdfFile || !placements.length || status === "processing") return;
    setStatus("processing");
    setError("");
    setResults([]);
    setProgress({ phase: "Checking local safety limits", progress: 0.04 });
    try {
      validatePdfOverlayPlacements(placements, assets, pageCount, tool);
      const response = await runTool(tool, [pdfFile], {
        overlayAssets: assets.map(({ id, sourceFile, preparedBlob }) => ({ id, sourceFile, preparedBlob })),
        placements,
      }, (next) => {
        if (!dismissedRef.current) setProgress(next);
      });
      if (dismissedRef.current) return;
      setResults(response.results);
      setStatus("complete");
      onComplete({ tool, files: 1 + assets.length, results: response.results.length, elapsedMs: response.elapsedMs });
    } catch (caught) {
      if (dismissedRef.current) return;
      setStatus("error");
      setError(caught?.message || "The PDF could not be exported locally.");
    }
  };

  const replacePdf = () => {
    if (status === "processing") return;
    pdfInputRef.current?.click();
  };

  return (
    <dialog ref={dialogRef} className="workbench-dialog pdf-image-workbench" onCancel={(event) => { event.preventDefault(); closeWorkbench(); }} aria-labelledby="workbench-title" aria-describedby="workbench-description">
      <div className="workbench-shell">
        <header className="workbench-header">
          <div className={`workbench-icon accent-${categoryById[tool.category].accent}`}><ImageSquareIcon size={27} weight="duotone" aria-hidden="true" /></div>
          <div>
            <div className="breadcrumb"><span>PDF tools</span><ArrowRightIcon size={13} /><span>{categoryById[tool.category].label}</span></div>
            <h2 ref={titleRef} id="workbench-title" tabIndex="-1">{tool.name}</h2>
            <p id="workbench-description">{tool.description}</p>
          </div>
          <button className="dialog-close" onClick={closeWorkbench} aria-label="Close tool"><XIcon size={21} aria-hidden="true" /></button>
        </header>
        <div className="local-reassurance"><ShieldCheckIcon size={17} weight="fill" /><span><strong>Private editor.</strong> The PDF and every placed image stay in this tab.</span><span className="engine-badge">ON-DEVICE</span></div>

        {!pdfDocument ? (
          <section className="pdf-editor-empty">
            <button
              className={`dropzone ${draggingPdf ? "dragging" : ""}`}
              onClick={() => pdfInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDraggingPdf(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDraggingPdf(false)}
              onDrop={(event) => { event.preventDefault(); setDraggingPdf(false); choosePdf(event.dataTransfer.files); }}
              disabled={loadingPdf}
            >
              <span className="upload-icon">{loadingPdf ? <SpinnerGapIcon size={26} className="spin" /> : <UploadSimpleIcon size={26} weight="duotone" />}</span>
              <strong>{loadingPdf ? progress.phase : "Choose the PDF you want to edit"}</strong>
              <span>PDF · DRAG AND DROP READY</span>
              <span className="choose-files">{loadingPdf ? "Opening locally" : "Choose PDF"}</span>
            </button>
            <input ref={pdfInputRef} hidden type="file" accept=".pdf" onChange={(event) => { choosePdf(event.target.files); event.target.value = ""; }} />
            <div className="limits-note" role="note"><GaugeIcon size={17} /><span><strong>PDF limits</strong><span>{pdfLimitCopy.primary}</span><span className="limits-details">{pdfLimitCopy.secondary}</span></span></div>
            {fileIssue && <div className="error-card file-error"><WarningCircleIcon size={20} weight="fill" /><span><strong>{fileIssue.title}</strong>{fileIssue.summary && <span>{fileIssue.summary}</span>}<ul>{fileIssue.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></span></div>}
            {error && <div className="error-card" role="alert"><WarningCircleIcon size={20} weight="fill" /><span><strong>Couldn’t open this PDF</strong>{error}</span></div>}
          </section>
        ) : (
          <div className="pdf-editor-layout">
            <aside className="pdf-pages-panel" aria-label="PDF pages">
              <div className="pdf-editor-panel-heading"><span>Pages</span><strong>{pageCount}</strong></div>
              <div className="pdf-page-thumbnails">
                {Array.from({ length: pageCount }, (_, pageIndex) => (
                  <PageThumbnail key={pageIndex} document={pdfDocument} pageIndex={pageIndex} active={pageIndex === currentPage} placementCount={placementsByPage.get(pageIndex) || 0} onSelect={() => { setCurrentPage(pageIndex); setSelectedPlacementId(null); }} />
                ))}
              </div>
            </aside>

            <main className="pdf-editor-canvas-panel">
              <div className="pdf-editor-toolbar">
                <span className="pdf-editor-filename" title={pdfFile.name}><strong>{pdfFile.name}</strong><small>{formatBytes(pdfFile.size)}</small></span>
                <span className="pdf-editor-history">
                  <button onClick={undo} disabled={!undoStack.length} aria-label="Undo"><ArrowCounterClockwiseIcon size={17} /></button>
                  <button onClick={redo} disabled={!redoStack.length} aria-label="Redo"><ArrowCounterClockwiseIcon size={17} style={{ transform: "scaleX(-1)" }} /></button>
                </span>
                <button className="pdf-change-button" onClick={replacePdf} disabled={status === "processing"}>Change PDF</button>
                <input ref={pdfInputRef} hidden type="file" accept=".pdf" onChange={(event) => { choosePdf(event.target.files); event.target.value = ""; }} />
              </div>
              <div className="pdf-page-navigation">
                <button onClick={() => { setCurrentPage((page) => Math.max(0, page - 1)); setSelectedPlacementId(null); }} disabled={currentPage === 0} aria-label="Previous page"><ArrowLeftIcon size={17} /></button>
                <span>Page <strong>{currentPage + 1}</strong> of {pageCount}</span>
                <button onClick={() => { setCurrentPage((page) => Math.min(pageCount - 1, page + 1)); setSelectedPlacementId(null); }} disabled={currentPage === pageCount - 1} aria-label="Next page"><ArrowRightIcon size={17} /></button>
                <span className="pdf-zoom-controls"><button onClick={() => setZoom((value) => Math.max(70, value - 10))} disabled={zoom <= 70} aria-label="Zoom out"><MinusIcon size={15} /></button><output>{zoom}%</output><button onClick={() => setZoom((value) => Math.min(150, value + 10))} disabled={zoom >= 150} aria-label="Zoom in"><PlusIcon size={15} /></button></span>
              </div>
              <div className="pdf-editor-scroll-area" onClick={() => setSelectedPlacementId(null)}>
                <div ref={pageSurfaceRef} className="pdf-page-surface" style={{ width: `${zoom}%`, aspectRatio: pageSize ? `${pageSize.width} / ${pageSize.height}` : undefined }}>
                  <MainPageCanvas document={pdfDocument} pageIndex={currentPage} limits={limits} onPageSize={setPageSize} />
                  <div className="pdf-placement-layer">
                    {placements.filter((placement) => placement.pageIndex === currentPage).map((placement) => {
                      const asset = assets.find((item) => item.id === placement.assetId);
                      if (!asset) return null;
                      const selected = placement.id === selectedPlacementId;
                      return (
                        <div
                          key={placement.id}
                          className={`pdf-image-placement ${selected ? "selected" : ""}`}
                          style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: `${placement.width * 100}%`, transform: `rotate(${placement.rotation}deg)` }}
                          role="button"
                          tabIndex="0"
                          aria-label={`${asset.sourceFile.name} on page ${currentPage + 1}. Use arrow keys to move; Delete removes it.`}
                          onClick={(event) => { event.stopPropagation(); setSelectedPlacementId(placement.id); }}
                          onPointerDown={(event) => beginInteraction(event, placement, "drag")}
                          onKeyDown={(event) => movePlacementWithKeyboard(event, placement)}
                        >
                          <img src={asset.previewUrl} alt="" draggable="false" style={{ opacity: placement.opacity }} />
                          {selected && <>
                            <span className="placement-rotate-handle" onPointerDown={(event) => beginInteraction(event, placement, "rotate")} aria-hidden="true"><ArrowClockwiseIcon size={13} weight="bold" /></span>
                            <span className="placement-resize-handle" onPointerDown={(event) => beginInteraction(event, placement, "resize")} aria-hidden="true"><ResizeIcon size={13} weight="bold" /></span>
                          </>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <p className="pdf-editor-canvas-hint">Drag to move · use corner handles to resize and rotate · arrow keys nudge precisely</p>
            </main>

            <aside className="pdf-assets-panel" aria-label="Images and export controls">
              <div className="pdf-editor-panel-heading"><span>Images</span><strong>{assets.length}/{imagePolicy.maxFiles}</strong></div>
              <button className="pdf-add-image-button" onClick={() => imageInputRef.current?.click()} disabled={addingImages || assets.length >= imagePolicy.maxFiles}>
                {addingImages ? <SpinnerGapIcon size={18} className="spin" /> : <PlusIcon size={18} />} {addingImages ? "Checking images" : "Add PNG or JPG"}
              </button>
              <input ref={imageInputRef} hidden type="file" accept={imagePolicy.accepts.join(",")} multiple onChange={(event) => { addImages(event.target.files); event.target.value = ""; }} />
              <p className="pdf-signature-note">Signature images are visual marks only. Export does not create a certificate-backed digital signature.</p>
              <div className="pdf-image-limit-copy" role="note"><GaugeIcon size={15} /><span><strong>Image limits</strong>{imageLimitCopy.primary}<small>{imageLimitCopy.secondary}</small></span></div>
              {fileIssue && <div className="error-card file-error"><WarningCircleIcon size={18} weight="fill" /><span><strong>{fileIssue.title}</strong>{fileIssue.summary && <span>{fileIssue.summary}</span>}<details><summary>Review</summary><ul>{fileIssue.details.map((detail) => <li key={detail}>{detail}</li>)}</ul></details></span></div>}

              <div className="pdf-asset-list">
                {!assets.length && <div className="pdf-assets-empty"><ImageSquareIcon size={24} /><strong>Add a signature or image</strong><span>Then place it on any page as many times as needed.</span></div>}
                {assets.map((asset) => {
                  const used = placements.filter((placement) => placement.assetId === asset.id).length;
                  return (
                    <div key={asset.id} className={`pdf-asset-card ${selectedAsset?.id === asset.id ? "active" : ""}`}>
                      <span className="pdf-asset-preview"><img src={asset.previewUrl} alt="" /></span>
                      <span className="pdf-asset-info"><strong title={asset.sourceFile.name}>{asset.sourceFile.name}</strong><small>{asset.width.toLocaleString()} × {asset.height.toLocaleString()} px · {used} placed</small></span>
                      <button onClick={() => placeAsset(asset.id)}>Place</button>
                      <button className="pdf-asset-remove" onClick={() => removeAsset(asset.id)} aria-label={`Remove ${asset.sourceFile.name}`}><TrashIcon size={16} /></button>
                    </div>
                  );
                })}
              </div>

              {selectedPlacement && selectedAsset && (
                <section className="pdf-object-inspector" aria-label="Selected image controls">
                  <div><strong>Selected image</strong><span>Page {selectedPlacement.pageIndex + 1}</span></div>
                  <label><span>Size <output>{Math.round(selectedPlacement.width * 100)}%</output></span><input type="range" min="4" max="90" value={Math.round(selectedPlacement.width * 100)} onChange={(event) => {
                    const heightRatio = (selectedAsset.height / selectedAsset.width) * (pageSize.width / pageSize.height);
                    const maximum = Math.min(0.9, 1 - selectedPlacement.x, (1 - selectedPlacement.y) / heightRatio);
                    updateSelectedPlacement({ width: clamp(Number(event.target.value) / 100, 0.04, maximum) });
                  }} /></label>
                  <label><span>Rotation <output>{Math.round(selectedPlacement.rotation)}°</output></span><input type="range" min="-180" max="180" value={Math.round(selectedPlacement.rotation)} onChange={(event) => updateSelectedPlacement({ rotation: Number(event.target.value) })} /></label>
                  <label><span>Opacity <output>{Math.round(selectedPlacement.opacity * 100)}%</output></span><input type="range" min="10" max="100" value={Math.round(selectedPlacement.opacity * 100)} onChange={(event) => updateSelectedPlacement({ opacity: Number(event.target.value) / 100 })} /></label>
                  <label className="pdf-cleanup-control"><span>White background</span><select value={selectedAsset.cleanupMode} disabled={cleaningAssetId === selectedAsset.id} onChange={(event) => cleanWhiteBackground(selectedAsset.id, event.target.value)}><option value="off">Keep original</option><option value="gentle">Remove gently</option><option value="balanced">Remove — balanced</option><option value="strong">Remove strongly</option></select>{cleaningAssetId === selectedAsset.id && <small><SpinnerGapIcon size={13} className="spin" /> Cleaning locally…</small>}</label>
                  <div className="pdf-object-actions"><button onClick={() => duplicatePlacement()}><CopyIcon size={15} /> Duplicate</button><button onClick={repeatOnAllPages}>Copy to every page</button><button className="danger" onClick={() => removePlacement(selectedPlacement.id)}><TrashIcon size={15} /> Remove</button></div>
                </section>
              )}

              <div className="pdf-export-panel">
                <div><span>Ready to export</span><strong>{placements.length} placement{placements.length === 1 ? "" : "s"}</strong></div>
                {status === "processing" && <div className="pdf-export-progress"><span><SpinnerGapIcon size={15} className="spin" />{progress.phase}</span><div><span style={{ width: `${Math.max(3, (progress.progress || 0) * 100)}%` }} /></div></div>}
                {error && <div className="error-card" role="alert"><WarningCircleIcon size={18} weight="fill" /><span><strong>Couldn’t finish</strong>{error}</span></div>}
                <button className="process-button" onClick={exportPdf} aria-disabled={!placements.length || status === "processing"}>{status === "processing" ? <><SpinnerGapIcon size={18} className="spin" />Exporting locally</> : <><CheckCircleIcon size={18} weight="fill" />Export edited PDF</>}</button>
                {!placements.length && <small>Place at least one image to export.</small>}
              </div>

              {results.map((result) => (
                <div className="pdf-editor-result" key={result.id}><span><CheckCircleIcon size={20} weight="fill" /></span><span><strong>Your PDF is ready</strong><small>{result.name} · {formatBytes(result.size)}</small></span><button onClick={() => downloadResult(result)} aria-label={`Download ${result.name}`}><DownloadSimpleIcon size={17} /> Download</button></div>
              ))}
            </aside>
          </div>
        )}
      </div>
    </dialog>
  );
}
