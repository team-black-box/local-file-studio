// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsLeftRightIcon,
  ArrowsOutIcon,
  BrainIcon,
  BrowserIcon,
  CaretRightIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  ColumnsIcon,
  CommandIcon,
  CropIcon,
  DownloadSimpleIcon,
  EyeSlashIcon,
  FileArrowUpIcon,
  FileArrowDownIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileImageIcon,
  FileJpgIcon,
  FileMinusIcon,
  FilePdfIcon,
  FilePptIcon,
  FilePlusIcon,
  FileXlsIcon,
  FilesIcon,
  FileZipIcon,
  FlowArrowIcon,
  GaugeIcon,
  ImageSquareIcon,
  ImagesIcon,
  KeyboardIcon,
  LightningIcon,
  ListIcon,
  ListNumbersIcon,
  LockIcon,
  LockOpenIcon,
  MagnifyingGlassIcon,
  MarkdownLogoIcon,
  PaletteIcon,
  PencilSimpleIcon,
  PlusIcon,
  ResizeIcon,
  ScanIcon,
  ScissorsIcon,
  SelectionBackgroundIcon,
  ShieldCheckIcon,
  SignatureIcon,
  SlidersHorizontalIcon,
  SmileyIcon,
  SparkleIcon,
  SpinnerGapIcon,
  StackIcon,
  StampIcon,
  StarIcon,
  TextboxIcon,
  TextTIcon,
  TranslateIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  WifiHighIcon,
  WrenchIcon,
  XIcon,
} from "@phosphor-icons/react";
import { categories, categoryById, tools } from "./tools.js";
import { PdfImageWorkbench } from "./PdfImageWorkbench.jsx";
import { downloadResult, formatBytes } from "./lib/file-utils.js";
import { describeToolLimits, getTextSettingLimit, getToolLimits, summarizeRejections, validateFileSelection } from "./lib/file-limits.js";
import { runTool } from "./lib/processors.js";

const iconMap = {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowsLeftRightIcon,
  ArrowsOutIcon,
  BrainIcon,
  BrowserIcon,
  ColumnsIcon,
  CropIcon,
  EyeSlashIcon,
  FileArrowUpIcon,
  FileDocIcon,
  FileHtmlIcon,
  FileJpgIcon,
  FileMinusIcon,
  FilePdfIcon,
  FilePptIcon,
  FileXlsIcon,
  FilesIcon,
  FileZipIcon,
  GaugeIcon,
  ImageSquareIcon,
  ImagesIcon,
  ListNumbersIcon,
  LockIcon,
  LockOpenIcon,
  MarkdownLogoIcon,
  PaletteIcon,
  PencilSimpleIcon,
  ResizeIcon,
  ScanIcon,
  ScissorsIcon,
  SelectionBackgroundIcon,
  ShieldCheckIcon,
  SignatureIcon,
  SmileyIcon,
  SparkleIcon,
  StackIcon,
  StampIcon,
  TextboxIcon,
  TextTIcon,
  TranslateIcon,
  WrenchIcon,
};

const modelTools = new Set(["ocr-pdf", "summarize-pdf", "translate-pdf", "pdf-to-markdown", "upscale-image", "remove-image-background", "blur-face"]);
const contextualSettings = {
  "split-pdf": [
    { key: "pages", type: "text", label: "Pages", default: "all", hint: "Use all, 1-4,6, or 3-1." },
  ],
  "remove-pdf-pages": [
    { key: "pages", type: "text", label: "Pages to remove", default: "1", hint: "Example: 1,3-5" },
  ],
  "extract-pdf-pages": [
    { key: "pages", type: "text", label: "Pages to extract", default: "1", hint: "Example: 2-4,8" },
  ],
  "organize-pdf": [
    { key: "order", type: "text", label: "New page order", default: "all", hint: "Example: 3,1,2,4-8" },
  ],
  "crop-pdf": [
    { key: "margin", type: "range", label: "Trim from each edge", default: 5, min: 0, max: 35, step: 1, suffix: "%" },
  ],
  "edit-pdf": [
    { key: "text", type: "text", label: "Text to add", default: "Reviewed locally" },
    { key: "fontSize", type: "range", label: "Text size", default: 16, min: 8, max: 64, step: 1, suffix: "px" },
    { key: "x", type: "range", label: "Horizontal position", default: 10, min: 2, max: 80, step: 1, suffix: "%" },
    { key: "y", type: "range", label: "Vertical position", default: 10, min: 2, max: 90, step: 1, suffix: "%" },
  ],
  "pdf-forms": [
    { key: "values", type: "textarea", label: "Field values (JSON)", default: "", placeholder: "{\"Full name\": \"Asha Rao\"}" },
    { key: "value", type: "text", label: "Fallback value", default: "Completed locally" },
  ],
  "sign-pdf": [
    { key: "name", type: "text", label: "Typed signature", default: "Your name" },
  ],
  "redact-pdf": [
    { key: "x", type: "range", label: "From left", default: 10, min: 0, max: 90, step: 1, suffix: "%" },
    { key: "y", type: "range", label: "From top", default: 40, min: 0, max: 90, step: 1, suffix: "%" },
    { key: "width", type: "range", label: "Redaction width", default: 80, min: 5, max: 100, step: 1, suffix: "%" },
    { key: "height", type: "range", label: "Redaction height", default: 10, min: 2, max: 50, step: 1, suffix: "%" },
  ],
  "html-to-pdf": [
    { key: "html", type: "textarea", label: "Or paste HTML", default: "", placeholder: "<h1>Local document</h1>" },
  ],
  "photo-editor": [
    { key: "brightness", type: "range", label: "Brightness", default: 100, min: 40, max: 160, step: 1, suffix: "%" },
    { key: "contrast", type: "range", label: "Contrast", default: 100, min: 40, max: 160, step: 1, suffix: "%" },
    { key: "saturation", type: "range", label: "Saturation", default: 100, min: 0, max: 200, step: 1, suffix: "%" },
    { key: "text", type: "text", label: "Optional caption", default: "" },
  ],
  "meme-generator": [
    { key: "topText", type: "text", label: "Top caption", default: "WHEN THE FILE" },
    { key: "bottomText", type: "text", label: "STAYS ON YOUR DEVICE", default: "STAYS ON YOUR DEVICE" },
  ],
  "convert-from-jpg": [
    { key: "delay", type: "number", label: "GIF frame delay", default: 900, min: 80, max: 5000, step: 20, suffix: "ms" },
  ],
  "html-to-image": [
    { key: "html", type: "textarea", label: "Or paste HTML", default: "", placeholder: "<h1>Private by design</h1>" },
  ],
};

const workflows = [
  {
    title: "Send a smaller PDF",
    description: "Merge, compress, then protect a document before sharing.",
    steps: ["Merge", "Compress", "Protect"],
    tool: "merge-pdf",
    accent: "coral",
  },
  {
    title: "Make a scan searchable",
    description: "Capture paper pages, clean the PDF, and add local OCR.",
    steps: ["Scan", "Repair", "OCR"],
    tool: "scan-to-pdf",
    accent: "emerald",
  },
  {
    title: "Prep images for the web",
    description: "Resize, remove backgrounds, and compress a whole batch.",
    steps: ["Resize", "Cut out", "Compress"],
    tool: "resize-image",
    accent: "indigo",
  },
];

function loadLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function useConnectivity() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const updateOfflineReady = async () => {
      if (!navigator.serviceWorker?.controller || !("caches" in window)) {
        setOfflineReady(false);
        return;
      }
      try {
        const [shell, manifest] = await Promise.all([
          caches.match("/index.html"),
          caches.match("/manifest.webmanifest"),
        ]);
        setOfflineReady(Boolean(shell && manifest));
      } catch {
        setOfflineReady(false);
      }
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(updateOfflineReady).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", updateOfflineReady);
      updateOfflineReady();
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      navigator.serviceWorker?.removeEventListener("controllerchange", updateOfflineReady);
    };
  }, []);

  return { online, offlineReady };
}

function ToolIcon({ tool, size = 24 }) {
  const Icon = iconMap[tool.icon] || FilePdfIcon;
  return <Icon size={size} weight="duotone" aria-hidden="true" />;
}

function Header({ kind, onKind, onHome, onSearchFocus }) {
  const { online, offlineReady } = useConnectivity();
  const mobileNavRef = useRef(null);

  const chooseKind = (next) => {
    closeMobileNav();
    onKind(next);
  };

  const closeMobileNav = () => {
    const navigation = mobileNavRef.current;
    if (!navigation?.open) return;
    navigation.removeAttribute("open");
    navigation.querySelector("summary")?.focus();
  };

  return (
    <header className="app-header">
      <img className="terminal-dots terminal-dots-header" src="/assets/paper-terminal-dots.png" alt="" aria-hidden="true" />
      <div className="shell header-inner">
        <button className="brand" onClick={onHome} aria-label="Local File Studio home">
          <span className="brand-mark"><FileImageIcon size={20} weight="duotone" /></span>
          <span>Local File <strong>Studio</strong></span>
        </button>
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={kind === "all" ? "active" : ""} aria-pressed={kind === "all"} onClick={() => onKind("all")}>All tools</button>
          <button className={kind === "pdf" ? "active" : ""} aria-pressed={kind === "pdf"} onClick={() => onKind("pdf")}>PDF</button>
          <button className={kind === "image" ? "active" : ""} aria-pressed={kind === "image"} onClick={() => onKind("image")}>Images</button>
          <a href="#workflows">Workflows</a>
        </nav>
        <div className="header-actions">
          <details ref={mobileNavRef} className="mobile-nav" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMobileNav(); } }}>
            <summary aria-label="Primary navigation menu"><ListIcon size={19} aria-hidden="true" /><span>Browse</span></summary>
            <nav aria-label="Mobile primary navigation">
              <button aria-pressed={kind === "all"} onClick={() => chooseKind("all")}>All tools</button>
              <button aria-pressed={kind === "pdf"} onClick={() => chooseKind("pdf")}>PDF tools</button>
              <button aria-pressed={kind === "image"} onClick={() => chooseKind("image")}>Image tools</button>
              <a href="#workflows" onClick={closeMobileNav}>Workflows</a>
            </nav>
          </details>
          <button className="command-button" onClick={onSearchFocus} aria-label="Focus tool search">
            <kbd>⌘ K</kbd>
            <span>Search tools or type a command</span>
          </button>
          <span className={`connectivity ${online ? "online" : "offline"}`} role="status" aria-live="polite" aria-atomic="true" title={offlineReady ? "App shell saved for offline use" : "Files are still processed locally"}>
            <span className="status-dot" aria-hidden="true" />
            <span>{online ? (offlineReady ? "Local / Offline" : "Local / On-device") : "Local / Offline"}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function Hero({ query, setQuery, searchRef, onQuickTool }) {
  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        <div className="eyebrow"><LockIcon size={15} weight="bold" /> Private by default</div>
        <h1 id="hero-title"><span className="hero-line hero-line-first">Every file tool</span><span className="hero-line">you need.</span><span className="hero-line hero-line-accent">Nothing uploaded<b aria-hidden="true">.</b></span></h1>
        <p><span>Work with PDFs and images right in your browser.</span><span>Your files never leave this device—there is no account,</span><span>queue, or server copy.</span></p>
        <label className="hero-search">
          <MagnifyingGlassIcon size={23} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools or type a command"
            aria-label="Search all tools"
          />
          {query
            ? <button onClick={() => setQuery("")} aria-label="Clear search"><XIcon size={17} /></button>
            : <kbd className="hero-shortcut" aria-hidden="true">⌘ K</kbd>}
        </label>
        <div className="hero-quick" aria-label="Popular tools">
          <span>Jump to</span>
          {["merge-pdf", "compress-pdf", "jpg-to-pdf", "compress-image"].map((slug, index) => {
            const tool = tools.find((item) => item.slug === slug);
            return <button key={slug} onClick={() => onQuickTool(tool)}><span>{tool.name}</span><kbd>⌘{index + 1}</kbd></button>;
          })}
        </div>
      </div>
      <div className="privacy-board" aria-label="How local processing works">
        <div className="privacy-board-head">
          <span className="status-dot" />
          <span>Local session</span>
          <span>NO UPLOADS</span>
        </div>
        <div className="privacy-ledger-head" aria-hidden="true"><span>Step</span><span>Item</span><span>Status</span><span>Details</span><span>Time</span></div>
        <div className="privacy-flow">
          <div className="flow-node pdf">
            <span className="flow-icon"><FilePdfIcon size={25} weight="regular" /></span>
            <span className="flow-item"><strong>report.pdf</strong><small>PDF · 2.4 MB</small></span>
            <span className="flow-status"><span className="status-dot" />Opened</span>
            <span className="flow-detail">In browser memory</span>
            <time>10:41:02</time>
          </div>
          <div className="flow-engine">
            <span className="flow-icon"><LightningIcon size={27} weight="fill" /></span>
            <span className="flow-item"><strong>Compress PDF</strong><small>Reduce file size</small></span>
            <span className="flow-status"><span className="status-dot" />Processed</span>
            <span className="flow-detail"><span>Quality: 70%</span><span>Images optimized</span></span>
            <time>10:41:05</time>
          </div>
          <div className="flow-node result">
            <span className="flow-icon"><FilePdfIcon size={25} weight="regular" /></span>
            <span className="flow-item"><strong>report-compressed.pdf</strong><small>PDF · 1.1 MB</small></span>
            <span className="flow-status"><span className="status-dot" />Created</span>
            <span className="flow-detail"><span>Saved in browser</span><span>Ready to download</span></span>
            <time>10:41:08</time>
          </div>
        </div>
        <div className="privacy-metrics">
          <div><strong>0 B</strong><span>sent to servers</span></div>
          <div><strong>3</strong><span>local actions</span></div>
          <div><strong>1</strong><span>file ready</span></div>
        </div>
        <div className="local-log">
          <span><ShieldCheckIcon size={18} weight="fill" /> Everything stays on this device</span>
          <a href="#privacy-details">Learn more about privacy <ArrowRightIcon size={17} /></a>
        </div>
      </div>
    </section>
  );
}

function ToolCard({ tool, favorite, onFavorite, onOpen, compact = false }) {
  const category = categoryById[tool.category];
  return (
    <article className={`tool-card accent-${category.accent} ${compact ? "compact" : ""}`}>
      <button className="tool-card-main" onClick={() => onOpen(tool)} aria-label={`Open ${tool.name}`}>
        <span className="tool-icon"><ToolIcon tool={tool} size={compact ? 22 : 25} /></span>
        <span className="tool-card-title-row">
          <strong>{tool.name}</strong>
          <CaretRightIcon size={17} aria-hidden="true" />
        </span>
        <span className="tool-description">{tool.description}</span>
        <span className="tool-meta">
          <span className={`kind-badge ${tool.kind}`}>{tool.kind === "pdf" ? "PDF" : "IMAGE"}</span>
          <span>{category.label}</span>
          {tool.maturity === "beta" && <span>Beta</span>}
        </span>
      </button>
      {!compact && (
        <button className={`favorite-button ${favorite ? "selected" : ""}`} aria-pressed={favorite} onClick={() => onFavorite(tool.slug)} aria-label={`${favorite ? "Remove" : "Add"} ${tool.name} ${favorite ? "from" : "to"} favorites`}>
          <StarIcon size={17} weight={favorite ? "fill" : "regular"} />
        </button>
      )}
    </article>
  );
}

function FilterBar({ kind, setKind, category, setCategory, resultCount }) {
  return (
    <div className="filter-row">
      <div className="media-tabs" role="group" aria-label="File type">
        {[{ id: "all", label: "All tools" }, { id: "pdf", label: "PDF" }, { id: "image", label: "Images" }].map((item) => (
          <button key={item.id} className={kind === item.id ? "active" : ""} aria-pressed={kind === item.id} onClick={() => setKind(item.id)}>{item.label}</button>
        ))}
      </div>
      <div className="category-filters" role="group" aria-label="Tool category">
        <button className={category === "all" ? "active" : ""} aria-pressed={category === "all"} onClick={() => setCategory("all")}>All</button>
        {categories.map((item) => (
          <button key={item.id} className={category === item.id ? "active" : ""} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>
        ))}
      </div>
      <span className="result-count" aria-hidden="true">{resultCount} tools</span>
      <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{resultCount} tools shown</span>
    </div>
  );
}

function SettingControl({ setting, value, onChange }) {
  const id = `setting-${setting.key}`;
  if (setting.type === "toggle") {
    return (
      <label className="toggle-row" htmlFor={id}>
        <span><strong>{setting.label}</strong>{setting.hint && <small>{setting.hint}</small>}</span>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <span className="toggle-track" aria-hidden="true"><span /></span>
      </label>
    );
  }

  if (setting.type === "range") {
    return (
      <label className="setting-field range-field" htmlFor={id}>
        <span><strong>{setting.label}</strong><output>{value}{setting.suffix || ""}</output></span>
        <input id={id} type="range" min={setting.min} max={setting.max} step={setting.step || 1} value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
    );
  }

  if (setting.type === "select") {
    return (
      <label className="setting-field" htmlFor={id}>
        <span><strong>{setting.label}</strong></span>
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {setting.options.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }

  const inputType = ["number", "password", "color"].includes(setting.type) ? setting.type : "text";
  const description = [
    setting.hint,
    setting.maxLength ? `Maximum ${Number(setting.maxLength).toLocaleString()} characters.` : "",
  ].filter(Boolean).join(" ");
  const descriptionId = description ? `${id}-description` : undefined;
  const suffixId = setting.suffix ? `${id}-suffix` : undefined;
  const describedBy = [descriptionId, suffixId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="setting-field">
      <label htmlFor={id}><strong>{setting.label}</strong></label>
      {description && <small id={descriptionId} className="field-description">{description}</small>}
      {setting.type === "textarea" ? (
        <textarea id={id} rows={4} maxLength={setting.maxLength} aria-describedby={describedBy} value={value} placeholder={setting.placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <div className={setting.suffix ? "input-with-suffix" : ""}>
          <input id={id} type={inputType} required={setting.required} min={setting.min} max={setting.max} maxLength={setting.maxLength} step={setting.step} aria-describedby={describedBy} value={value} placeholder={setting.placeholder} onChange={(event) => onChange(event.target.value)} />
          {setting.suffix && <span id={suffixId}>{setting.suffix}</span>}
        </div>
      )}
    </div>
  );
}

function accessibleProgressMessage(phase = "") {
  if (/checking/i.test(phase)) return "Checking files against local safety limits.";
  if (/loading/i.test(phase)) return "Loading the local processing engine.";
  if (/reading|extracting/i.test(phase)) return "Reading the document locally.";
  if (/rendering|compressing|flattening/i.test(phase)) return "Rendering document pages locally.";
  if (/ocr|recognizing/i.test(phase)) return "Recognizing text locally.";
  if (/adding/i.test(phase)) return "Adding files to the local result.";
  if (/encoding|processing|preparing/i.test(phase)) return "Processing files locally.";
  if (/finishing/i.test(phase)) return "Finishing the local result.";
  if (/complete/i.test(phase)) return "Local processing is complete.";
  return phase || "Local processing started.";
}

function GenericToolWorkbench({ tool, onClose, onComplete }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const openerRef = useRef(null);
  const dismissedRef = useRef(false);
  const fileInputRef = useRef(null);
  const dropzoneRef = useRef(null);
  const fileIdsRef = useRef(new WeakMap());
  const reorderButtonsRef = useRef(new Map());
  const removeButtonsRef = useRef(new Map());
  const resultHeadingRef = useRef(null);
  const settingsList = useMemo(() => [...tool.settings, ...(contextualSettings[tool.slug] || [])].map((setting) => ({
    ...setting,
    maxLength: setting.maxLength ?? getTextSettingLimit(tool, setting.key),
  })), [tool]);
  const limits = useMemo(() => getToolLimits(tool), [tool]);
  const limitCopy = useMemo(() => describeToolLimits(tool), [tool]);
  const limitsId = `tool-limits-${tool.slug}`;
  const limitsPrimaryId = `${limitsId}-primary`;
  const [settings, setSettings] = useState(() => Object.fromEntries(settingsList.map((setting) => [setting.key, setting.default])));
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ phase: "Ready", progress: 0 });
  const [progressAnnouncement, setProgressAnnouncement] = useState(null);
  const [results, setResults] = useState([]);
  const [processError, setProcessError] = useState("");
  const [fileIssue, setFileIssue] = useState(null);
  const [queueAnnouncement, setQueueAnnouncement] = useState(null);

  const getFileId = (file) => {
    if (!fileIdsRef.current.has(file)) fileIdsRef.current.set(file, crypto.randomUUID());
    return fileIdsRef.current.get(file);
  };

  const closeWorkbench = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (dialogRef.current?.open) dialogRef.current.close();
    onClose();
    window.requestAnimationFrame(() => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      else document.querySelector(".hero-search input")?.focus();
    });
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    dismissedRef.current = false;
    if (!openerRef.current) openerRef.current = document.activeElement;
    if (dialog && !dialog.open) {
      dialog.showModal();
      titleRef.current?.focus();
    }
    return () => {
      dismissedRef.current = true;
      if (dialog?.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    if (results.length) resultHeadingRef.current?.focus();
  }, [results]);

  const addFiles = (incoming) => {
    const incomingFiles = [...incoming];
    if (!incomingFiles.length) return;
    const replacingSingleFile = limits.maxFiles === 1 && files.length > 0;
    const baseFiles = replacingSingleFile ? [] : files;
    const validation = validateFileSelection(tool, baseFiles, incomingFiles);

    if (validation.accepted.length) {
      setFiles(validation.nextFiles);
      setResults([]);
      setProcessError("");
    }

    if (validation.rejected.length) {
      const rejectedCount = validation.rejected.length;
      setFileIssue({
        id: crypto.randomUUID(),
        title: validation.accepted.length ? "Some files weren’t added" : rejectedCount === 1 ? "File wasn’t added" : "No files were added",
        summary: summarizeRejections(validation.accepted.length, validation.rejected, { acceptedAction: replacingSingleFile ? "replaced" : "added" }),
        details: validation.rejected.map((item) => item.message),
      });
      setQueueAnnouncement(null);
    } else {
      setFileIssue(null);
      const action = replacingSingleFile ? "replaced" : "added";
      const names = validation.accepted.map((file) => file.name).join(", ");
      setQueueAnnouncement({ id: crypto.randomUUID(), message: `${names}. ${validation.accepted.length === 1 ? "File" : "Files"} ${action}. ${validation.nextFiles.length} ${validation.nextFiles.length === 1 ? "file" : "files"} in the queue.` });
    }

    window.requestAnimationFrame(() => {
      if (document.activeElement === fileInputRef.current || document.activeElement === document.body) dropzoneRef.current?.focus();
    });
  };

  const moveFile = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const movedFile = files[index];
    const movedFileId = getFileId(movedFile);
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
    setQueueAnnouncement({ id: crypto.randomUUID(), message: `${movedFile.name} moved to position ${target + 1} of ${files.length}.` });
    const focusDirection = direction < 0
      ? (target === 0 ? "down" : "up")
      : (target === files.length - 1 ? "up" : "down");
    window.requestAnimationFrame(() => reorderButtonsRef.current.get(`${movedFileId}:${focusDirection}`)?.focus());
  };

  const removeFile = (file, index) => {
    const fileId = getFileId(file);
    const remaining = files.filter((_, fileIndex) => fileIndex !== index);
    const nextFocusFile = remaining[Math.min(index, remaining.length - 1)];
    const nextFocusId = nextFocusFile ? getFileId(nextFocusFile) : null;
    setFiles(remaining);
    setResults([]);
    setFileIssue(null);
    setQueueAnnouncement({ id: crypto.randomUUID(), message: `${file.name} removed. ${remaining.length} ${remaining.length === 1 ? "file remains" : "files remain"}.` });
    window.requestAnimationFrame(() => {
      if (nextFocusId) removeButtonsRef.current.get(nextFocusId)?.focus();
      else dropzoneRef.current?.focus();
    });
    removeButtonsRef.current.delete(fileId);
  };

  const minFiles = limits.minFiles;
  const hasRequiredInput = minFiles === 0
    ? files.length > 0 || Boolean(String(settings.html || "").trim())
    : files.length >= minFiles;
  const canRun = hasRequiredInput && status !== "processing";
  const remainingFiles = Math.max(0, minFiles - files.length);
  const processHint = !hasRequiredInput
    ? minFiles === 0
      ? "Paste HTML or add an HTML file to continue."
      : `Add ${remainingFiles} ${files.length ? "more " : ""}${remainingFiles === 1 ? "file" : "files"} to continue.`
    : "";
  const processHintId = `process-hint-${tool.slug}`;
  const showProcessHint = Boolean(processHint) && status !== "processing";

  const process = async () => {
    if (!canRun) return;
    setStatus("processing");
    setProcessError("");
    setFileIssue(null);
    setResults([]);
    setProgress({ phase: "Starting", progress: 0.02 });
    setProgressAnnouncement({ id: crypto.randomUUID(), message: "Local processing started." });
    try {
      const response = await runTool(tool, files, settings, (nextProgress) => {
        if (!dismissedRef.current) {
          setProgress(nextProgress);
          const message = accessibleProgressMessage(nextProgress.phase);
          setProgressAnnouncement((current) => current?.message === message ? current : { id: crypto.randomUUID(), message });
        }
      });
      if (dismissedRef.current) return;
      setResults(response.results);
      setStatus("complete");
      onComplete({ tool, files: files.length, results: response.results.length, elapsedMs: response.elapsedMs });
    } catch (error) {
      if (dismissedRef.current) return;
      setStatus("error");
      setProcessError(error?.message || "The local processor could not finish this file.");
    }
  };

  const dropzoneAction = files.length
    ? limits.maxFiles === 1 ? "Choose a different file" : "Add more files"
    : "Drop files here or choose files";

  return (
    <dialog ref={dialogRef} className="workbench-dialog" onCancel={(event) => { event.preventDefault(); closeWorkbench(); }} aria-labelledby="workbench-title" aria-describedby="workbench-description">
      <div className="workbench-shell">
        <header className="workbench-header">
          <div className={`workbench-icon accent-${categoryById[tool.category].accent}`}><ToolIcon tool={tool} size={27} /></div>
          <div>
            <div className="breadcrumb"><span>{tool.kind === "pdf" ? "PDF tools" : "Image tools"}</span><CaretRightIcon size={13} /><span>{categoryById[tool.category].label}</span></div>
            <h2 ref={titleRef} id="workbench-title" tabIndex="-1">{tool.name}</h2>
            <p id="workbench-description">{tool.description}</p>
          </div>
          <button className="dialog-close" onClick={closeWorkbench} aria-label="Close tool"><XIcon size={21} aria-hidden="true" /></button>
        </header>

        <div className="local-reassurance"><ShieldCheckIcon size={17} weight="fill" /><span><strong>Private session.</strong> Files stay in this tab and are cleared when you close it.</span><span className="engine-badge">{modelTools.has(tool.slug) ? "LOCAL ENGINE" : "ON-DEVICE"}</span></div>

        <div className="workbench-body">
          <section className="file-stage" aria-label="Files">
            <button
              ref={dropzoneRef}
              className={`dropzone ${dragging ? "dragging" : ""}`}
              aria-label={`${dropzoneAction} for ${tool.name}`}
              aria-describedby={limitsPrimaryId}
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
            >
              <span className="upload-icon"><UploadSimpleIcon size={26} weight="duotone" /></span>
              <strong>{dropzoneAction}</strong>
              <span aria-hidden="true">{tool.accepts.join(" · ").toUpperCase()} {limits.maxFiles > 1 ? "· BATCH READY" : ""}</span>
              <span className="choose-files">Choose files <ArrowRightIcon size={16} /></span>
            </button>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept={tool.accepts.join(",")}
              multiple={limits.maxFiles > 1}
              capture={tool.slug === "scan-to-pdf" ? "environment" : undefined}
              onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
            />
            <div id={limitsId} className="limits-note" role="note">
              <GaugeIcon size={17} aria-hidden="true" />
              <span><strong>Limits</strong><span id={limitsPrimaryId}>{limitCopy.primary}</span><span className="limits-details">{limitCopy.secondary}</span></span>
            </div>
            {fileIssue && <div key={fileIssue.id} className="error-card file-error"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" /><span><span role="alert" aria-atomic="true"><strong>{fileIssue.title}</strong>{fileIssue.summary}</span><details><summary>Review rejected files</summary><ul>{fileIssue.details.map((detail, index) => <li key={`${fileIssue.id}-${index}`}>{detail}</li>)}</ul></details></span></div>}
            {queueAnnouncement && <p key={queueAnnouncement.id} className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{queueAnnouncement.message}</p>}

            {files.length > 0 && (
              <div className="file-queue">
                <div className="queue-heading"><strong>{files.length} {files.length === 1 ? "file" : "files"}</strong><span>{formatBytes(files.reduce((sum, file) => sum + file.size, 0))} total</span></div>
                <div role="list" aria-label={`${files.length} queued ${files.length === 1 ? "file" : "files"}`}>
                  {files.map((file, index) => (
                    <div className="file-row" role="listitem" key={getFileId(file)}>
                      <span className={`file-type ${tool.kind}`}><ToolIcon tool={tool} size={19} /></span>
                      <span className="file-info"><strong title={file.name}>{file.name}</strong><small>{formatBytes(file.size)} · ready locally</small></span>
                      {files.length > 1 && <span className="reorder-controls"><button ref={(node) => { const key = `${getFileId(file)}:up`; if (node) reorderButtonsRef.current.set(key, node); else reorderButtonsRef.current.delete(key); }} onClick={() => moveFile(index, -1)} disabled={index === 0} aria-label={`Move ${file.name} up from position ${index + 1} of ${files.length}`}><ArrowUpIcon size={15} aria-hidden="true" /></button><button ref={(node) => { const key = `${getFileId(file)}:down`; if (node) reorderButtonsRef.current.set(key, node); else reorderButtonsRef.current.delete(key); }} onClick={() => moveFile(index, 1)} disabled={index === files.length - 1} aria-label={`Move ${file.name} down from position ${index + 1} of ${files.length}`}><ArrowDownIcon size={15} aria-hidden="true" /></button></span>}
                      <button ref={(node) => { const fileId = getFileId(file); if (node) removeButtonsRef.current.set(fileId, node); else removeButtonsRef.current.delete(fileId); }} className="remove-file" onClick={() => removeFile(file, index)} aria-label={`Remove ${file.name}, position ${index + 1} of ${files.length}`}><TrashIcon size={17} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.length > 0 && (
              <div className="results-card">
                <div className="result-celebration"><span><CheckCircleIcon size={24} weight="fill" /></span><div><h3 ref={resultHeadingRef} tabIndex="-1">Your result is ready</h3><p>Created locally. Download it before closing this tab.</p></div></div>
                {results.map((result) => (
                  <div className="result-row" key={result.id}>
                    <span className="result-icon"><DownloadSimpleIcon size={19} /></span>
                    <span><strong>{result.name}</strong><small>{formatBytes(result.size)} · {result.details}</small></span>
                    <button onClick={() => downloadResult(result)} aria-label={`Download ${result.name}`}>Download</button>
                  </div>
                ))}
                <button className="start-another" onClick={() => { setResults([]); setFiles([]); setStatus("idle"); setProcessError(""); setFileIssue(null); setQueueAnnouncement(null); }}>Start another</button>
              </div>
            )}
          </section>

          <aside className="settings-panel" aria-label="Tool settings">
            <div className="settings-heading"><span><SlidersHorizontalIcon size={19} /></span><div><h3>Settings</h3><p>Fine-tune the local output.</p></div></div>
            {settingsList.length ? settingsList.map((setting) => (
              <SettingControl key={setting.key} setting={setting} value={settings[setting.key]} onChange={(value) => { setSettings((current) => ({ ...current, [setting.key]: value })); setResults([]); setProcessError(""); }} />
            )) : <div className="no-settings"><CheckCircleIcon size={20} /><span><strong>Nothing to configure</strong>This tool uses sensible local defaults.</span></div>}

            {tool.maturity === "beta" && (
              <div className="beta-note"><SparkleIcon size={18} /><span><strong>Local beta</strong>Complex layouts, rare formats, and very large files may vary by browser.</span></div>
            )}

            <div className="output-summary">
              <span>Output</span>
              <strong>{tool.output.join(" · ").toUpperCase()}</strong>
            </div>
            <div className="process-action-stack">
              {status === "processing" && (
                <div className="progress-card">
                  <div className="progress-copy"><span><SpinnerGapIcon size={18} className="spin" aria-hidden="true" />{progress.phase}</span><strong aria-hidden="true">{Math.round((progress.progress || 0) * 100)}%</strong></div>
                  {progressAnnouncement && <span key={progressAnnouncement.id} className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{progressAnnouncement.message}</span>}
                  <div className="progress-track" role="progressbar" aria-label={`${tool.name} progress`} aria-valuetext={`${Math.round((progress.progress || 0) * 100)}%, ${progress.phase}`} aria-valuenow={Math.round((progress.progress || 0) * 100)} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${Math.max(3, (progress.progress || 0) * 100)}%` }} /></div>
                  <small>Keep this tab open. Large files and local models can take a little longer.</small>
                </div>
              )}
              {processError && <div className="error-card" role="alert"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" /><span><strong>Couldn’t finish that job</strong>{processError}</span></div>}
              <button className="process-button" onClick={process} aria-disabled={!canRun} aria-describedby={showProcessHint ? processHintId : undefined}>
                {status === "processing" ? <><SpinnerGapIcon size={19} className="spin" />Processing locally</> : <><LightningIcon size={19} weight="fill" />{tool.name}</>}
              </button>
              {showProcessHint && <small id={processHintId} className="button-hint">{processHint}</small>}
            </div>
          </aside>
        </div>
      </div>
    </dialog>
  );
}

function ToolWorkbench(props) {
  return props.tool.slug === "add-image-to-pdf"
    ? <PdfImageWorkbench {...props} />
    : <GenericToolWorkbench {...props} />;
}

function RecentSection({ recents, onOpen }) {
  if (!recents.length) return null;
  return (
    <section className="recent-section shell" aria-labelledby="recent-title">
      <div className="section-kicker"><ClockCounterClockwiseIcon size={18} /><span>Stored only on this device</span></div>
      <div className="section-heading compact-heading"><div><h2 id="recent-title">Recent local jobs</h2><p>Job names only—your actual files are never saved here.</p></div></div>
      <div className="recent-grid">
        {recents.slice(0, 4).map((recent) => {
          const tool = tools.find((item) => item.slug === recent.slug);
          if (!tool) return null;
          return <button key={recent.id} onClick={() => onOpen(tool)}><span className={`recent-icon ${tool.kind}`}><ToolIcon tool={tool} size={20} /></span><span><strong>{tool.name}</strong><small>{recent.files} input · {recent.results} output · {new Date(recent.at).toLocaleDateString()}</small></span><ArrowRightIcon size={17} /></button>;
        })}
      </div>
    </section>
  );
}

const paperTerminalPrimaryTools = [
  { slug: "merge-pdf", description: "Combine multiple PDFs" },
  { slug: "compress-pdf", description: "Reduce file size" },
  { slug: "add-image-to-pdf", description: "Insert images into any PDF" },
];

const paperTerminalMoreTools = ["jpg-to-pdf", "pdf-to-jpg", "rotate-pdf"];

function PopularToolIcon({ tool }) {
  if (tool.slug === "merge-pdf") return <FilePlusIcon size={27} weight="duotone" aria-hidden="true" />;
  if (tool.slug === "compress-pdf") return <FileArrowDownIcon size={27} weight="duotone" aria-hidden="true" />;
  return <ToolIcon tool={tool} size={27} />;
}

function PopularToolsSection({ onOpen, onBrowse }) {
  return (
    <section className="featured-stage" aria-labelledby="featured-title">
      <img className="terminal-dots terminal-dots-popular-top" src="/assets/paper-terminal-dots-short.png" alt="" aria-hidden="true" />
      <img className="terminal-dots terminal-dots-popular-bottom" src="/assets/paper-terminal-dots-short.png" alt="" aria-hidden="true" />
      <div className="featured-section shell">
        <div className="popular-heading">
          <h2 id="featured-title"><StarIcon size={17} weight="fill" />Popular tools</h2>
          <span aria-hidden="true" />
        </div>
        <div className="popular-layout">
          <div className="popular-primary-list">
            {paperTerminalPrimaryTools.map((item, index) => {
              const tool = tools.find((candidate) => candidate.slug === item.slug);
              return (
                <button key={item.slug} onClick={() => onOpen(tool)} aria-label={`Open ${tool.name}`}>
                  <span className="popular-tool-icon"><PopularToolIcon tool={tool} /></span>
                  <span className="popular-tool-copy"><strong>{tool.name}</strong><small>{item.description}</small></span>
                  <kbd>⌘ {index + 1}</kbd>
                  <CaretRightIcon size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <aside className="more-tools-panel" aria-label="More tools">
            <div className="more-tools-heading"><strong>More tools</strong><span aria-hidden="true" /></div>
            {paperTerminalMoreTools.map((slug, index) => {
              const tool = tools.find((candidate) => candidate.slug === slug);
              return <button key={slug} onClick={() => onOpen(tool)}><span>{tool.name}</span><kbd>⌘ {index + 4}</kbd><CaretRightIcon size={16} /></button>;
            })}
            <button className="view-all-tools" onClick={onBrowse}><span>View all tools</span><ArrowRightIcon size={17} /></button>
          </aside>
        </div>
      </div>
    </section>
  );
}

function TerminalTipBar({ onSearch, onHelp }) {
  return (
    <section className="terminal-tip-bar" aria-label="Command palette tip">
      <div className="shell terminal-tip-inner">
        <div className="terminal-tip-copy"><KeyboardIcon size={18} /><kbd>TIP</kbd><span>Use the command palette</span><button onClick={onSearch}><kbd>⌘ K</kbd></button><span>to search tools, commands, or file actions.</span></div>
        <div className="terminal-tip-actions"><span>Shortcuts</span><button onClick={onSearch}><kbd>⌘ /</kbd></button><i aria-hidden="true" /><span>Help</span><button onClick={onHelp} aria-label="Open privacy help">?</button></div>
      </div>
    </section>
  );
}

export function App() {
  const searchRef = useRef(null);
  const toolOpenerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [category, setCategory] = useState("all");
  const [favorites, setFavorites] = useState(() => loadLocal("lfs-favorites", []));
  const [recents, setRecents] = useState(() => loadLocal("lfs-recents", []));
  const [selectedTool, setSelectedTool] = useState(() => {
    const slug = window.location.hash.match(/^#tool\/(.+)$/)?.[1];
    return tools.find((tool) => tool.slug === slug) || null;
  });

  useEffect(() => {
    const handleKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const openTool = (tool) => {
    toolOpenerRef.current = document.activeElement;
    setSelectedTool(tool);
    window.history.replaceState(null, "", `#tool/${tool.slug}`);
  };

  const closeTool = () => {
    setSelectedTool(null);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    window.requestAnimationFrame(() => toolOpenerRef.current?.focus?.());
  };

  const toggleFavorite = (slug) => {
    const next = favorites.includes(slug) ? favorites.filter((item) => item !== slug) : [...favorites, slug];
    setFavorites(next);
    localStorage.setItem("lfs-favorites", JSON.stringify(next));
  };

  const recordComplete = ({ tool, files, results, elapsedMs }) => {
    const next = [{ id: crypto.randomUUID(), slug: tool.slug, files, results, elapsedMs, at: Date.now() }, ...recents].slice(0, 8);
    setRecents(next);
    localStorage.setItem("lfs-recents", JSON.stringify(next));
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (kind !== "all" && tool.kind !== kind) return false;
      if (category !== "all" && tool.category !== category) return false;
      if (!needle) return true;
      return `${tool.name} ${tool.description} ${tool.tags.join(" ")} ${categoryById[tool.category].label}`.toLowerCase().includes(needle);
    });
  }, [query, kind, category]);

  return (
    <>
      <a className="skip-link" href="#tool-library">Skip to tool library</a>
      <Header
        kind={kind}
        onKind={(next) => { setKind(next); document.getElementById("tool-library")?.scrollIntoView({ block: "start" }); }}
        onHome={() => { setKind("all"); setCategory("all"); setQuery(""); window.scrollTo({ top: 0 }); }}
        onSearchFocus={() => searchRef.current?.focus()}
      />
      <main>
        <div className="hero-stage">
          <img className="terminal-ruler" src="/assets/paper-terminal-ruler.png" alt="" aria-hidden="true" />
          <Hero query={query} setQuery={setQuery} searchRef={searchRef} onQuickTool={openTool} />
        </div>

        <section className="trust-strip" aria-label="Privacy features">
          <div className="shell trust-grid">
            <span><ShieldCheckIcon size={25} weight="fill" /><strong>No uploads</strong><small>Files stay in browser memory</small></span>
            <span><LightningIcon size={25} weight="fill" /><strong>Fast on-device</strong><small>No waiting for a server queue</small></span>
            <span><WifiHighIcon size={25} weight="bold" /><strong>Works offline</strong><small>After the first app load</small></span>
            <span><TrashIcon size={25} weight="fill" /><strong>Auto-cleared</strong><small>Close the tab and files are gone</small></span>
          </div>
        </section>

        <PopularToolsSection onOpen={openTool} onBrowse={() => document.getElementById("tool-library")?.scrollIntoView({ block: "start" })} />

        <TerminalTipBar onSearch={() => searchRef.current?.focus()} onHelp={() => document.getElementById("privacy-details")?.scrollIntoView({ block: "center" })} />

        <section id="tool-library" className="library-section">
          <div className="shell">
            <div className="section-kicker"><CommandIcon size={18} /><span>Complete toolkit</span></div>
            <div className="section-heading"><div><h2>One private studio, every file task</h2><p>Search or filter the full PDF and image library.</p></div></div>
            <FilterBar kind={kind} setKind={setKind} category={category} setCategory={setCategory} resultCount={filtered.length} />
            {filtered.length ? (
              <div className="tool-grid">
                {filtered.map((tool) => <ToolCard key={tool.slug} tool={tool} favorite={favorites.includes(tool.slug)} onFavorite={toggleFavorite} onOpen={openTool} />)}
              </div>
            ) : (
              <div className="empty-state"><MagnifyingGlassIcon size={30} /><h3>No matching tools</h3><p>Try a format, task, or broader category.</p><button onClick={() => { setQuery(""); setKind("all"); setCategory("all"); }}>Clear filters</button></div>
            )}
          </div>
        </section>

        <section id="workflows" className="workflow-section shell" aria-labelledby="workflow-title">
          <div className="section-kicker"><FlowArrowIcon size={19} /><span>Smart batches</span></div>
          <div className="section-heading"><div><h2 id="workflow-title">Common jobs, already mapped out</h2><p>Start the first step and keep each file on this device.</p></div></div>
          <div className="workflow-grid">
            {workflows.map((workflow) => (
              <button className={`workflow-card accent-${workflow.accent}`} key={workflow.title} onClick={() => openTool(tools.find((tool) => tool.slug === workflow.tool))}>
                <span className="workflow-number">0{workflows.indexOf(workflow) + 1}</span>
                <h3>{workflow.title}</h3>
                <p>{workflow.description}</p>
                <span className="workflow-steps">{workflow.steps.map((step, index) => <span key={step}>{step}{index < workflow.steps.length - 1 && <CaretRightIcon size={12} />}</span>)}</span>
                <span className="workflow-start">Start workflow <ArrowRightIcon size={17} /></span>
              </button>
            ))}
          </div>
        </section>

        <RecentSection recents={recents} onOpen={openTool} />

        <section id="privacy-details" className="privacy-section shell" aria-labelledby="privacy-title">
          <div className="privacy-seal"><LockIcon size={36} weight="duotone" /></div>
          <div><div className="section-kicker"><ShieldCheckIcon size={18} /><span>Your files are yours</span></div><h2 id="privacy-title">Privacy you can verify by going offline.</h2><p>Once this app is saved, switch off your connection and keep working. PDF, image, OCR, and conversion engines run in the browser; file contents are never sent to our servers.</p></div>
          <div className="privacy-checks"><span><CheckCircleIcon size={18} weight="fill" />No sign-up or cloud history</span><span><CheckCircleIcon size={18} weight="fill" />No document analytics</span><span><CheckCircleIcon size={18} weight="fill" />Visible local safety limits</span><span><CheckCircleIcon size={18} weight="fill" />Open-source browser engines</span></div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="shell footer-inner"><div className="brand footer-brand"><span className="brand-mark"><FilesIcon size={20} weight="duotone" /></span><span>Local File <strong>Studio</strong></span></div><p>Private PDF and image tools, built to stay on your device.</p><span>Local-first · Bun · Vercel-ready</span></div>
      </footer>

      {selectedTool && <ToolWorkbench key={selectedTool.slug} tool={selectedTool} onClose={closeTool} onComplete={recordComplete} />}
    </>
  );
}
