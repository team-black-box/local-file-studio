// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArchiveIcon,
  ArrowClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowsLeftRightIcon,
  ArrowsInIcon,
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
  EyeIcon,
  EyeSlashIcon,
  FeatherIcon,
  FileArrowUpIcon,
  FileArrowDownIcon,
  FileDocIcon,
  FileHtmlIcon,
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
  ScalesIcon,
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
import { categories, categoryById, rankToolSearchResults, tools } from "./tools.js";
import { PdfImageWorkbench } from "./PdfImageWorkbench.jsx";
import { PdfOutputProtectionControl, PdfPasswordGate } from "./PdfPasswordGate.jsx";
import { assertPdfPreviewResult, buildOcrCopyText, compressionEstimateAllowsProcessing, createExtractPagePlan, createSplitPdfGroups, downloadResult, formatBytes, formatPageSelection, getCompressionSizeChange, getPdfCompressionPreset, isPdfPreviewResult, isToolSearchShortcut, parseMarkdownPreview, parseSplitPageSelection, projectPdfCompressionSize } from "./lib/file-utils.js";
import { MAX_PDF_PASSWORD_CHARACTERS, PDF_PREVIEW_LIMITS, assertRasterDimensions, describeToolLimits, getTextSettingLimit, getToolLimits, summarizeRejections, validateFileSelection } from "./lib/file-limits.js";
import { destroyPdfJsDocument, getPdfJsEngine } from "./lib/pdfjs-utils.js";
import { HOME_METADATA, SOCIAL_IMAGE_PATH, SITE_ORIGIN, createHomeStructuredData, createToolStructuredData, getPageMetadata, toolPath } from "./lib/site-metadata.js";
import { runTool } from "./lib/processors.js";
import { useProtectedPdfGate } from "./useProtectedPdfGate.js";

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

function toolFromLocation() {
  const pathSlug = window.location.pathname.match(/^\/tools\/([^/]+)\/?$/)?.[1];
  const legacySlug = window.location.hash.match(/^#tool\/(.+)$/)?.[1];
  const requestedSlug = pathSlug || legacySlug;
  const slug = TOOL_SLUG_ALIASES[requestedSlug] || requestedSlug;
  return tools.find((tool) => tool.slug === slug) || null;
}

function updatePageMetadata(tool) {
  const metadata = getPageMetadata(tool);
  document.title = metadata.title;
  const setContent = (selector, value) => document.querySelector(selector)?.setAttribute("content", value);
  setContent("#seo-description", metadata.description);
  setContent("#seo-og-title", metadata.title);
  setContent("#seo-og-description", metadata.description);
  setContent("#seo-og-url", metadata.canonical);
  setContent("#seo-og-image", `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`);
  setContent("#seo-twitter-title", metadata.title);
  setContent("#seo-twitter-description", metadata.description);
  setContent("#seo-twitter-image", `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`);
  document.querySelector("#seo-canonical")?.setAttribute("href", metadata.canonical);
  const structuredData = tool
    ? createToolStructuredData(tool, categoryById[tool.category])
    : createHomeStructuredData(tools.length);
  const script = document.querySelector("#seo-structured-data");
  if (script) script.textContent = JSON.stringify(structuredData).replaceAll("<", "\\u003c");
}

const modelTools = new Set(["ocr-pdf", "summarize-pdf", "translate-pdf", "pdf-to-markdown", "upscale-image", "remove-image-background", "blur-face"]);
const inlineReaderTools = new Set(["ocr-pdf", "translate-pdf", "pdf-to-markdown"]);
const TOOL_SLUG_ALIASES = Object.freeze({ "convert-to-jpg": "convert-image" });
const contextualSettings = {
  "remove-pdf-pages": [
    { key: "pages", type: "text", label: "Pages to remove", default: "", hint: "Example: 1,3-5" },
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

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src="/icons/icon-192.png" alt="" width="39" height="39" />
    </span>
  );
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
          <BrandMark />
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
            <MagnifyingGlassIcon size={16} aria-hidden="true" />
            <span>Search tools</span>
            <kbd>⌘ K</kbd>
          </button>
          <span className={`connectivity ${online ? "online" : "offline"}`} role="status" aria-live="polite" aria-atomic="true" title={offlineReady ? "App shell saved for offline use" : "Files are still processed locally"}>
            <span className="status-dot" aria-hidden="true" />
            <span>{online ? "Local only" : (offlineReady ? "Offline ready" : "Offline")}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function Hero({ query, setQuery, searchRef, onQuickTool, searchResults, resultCount, onViewAll }) {
  const searchShellRef = useRef(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const hasQuery = Boolean(query.trim());

  useEffect(() => {
    setActiveIndex(0);
    if (!hasQuery) setSearchOpen(false);
  }, [hasQuery, query]);

  const openResult = (tool) => {
    setSearchOpen(false);
    setSearchActive(false);
    onQuickTool(tool);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchActive(false);
    searchRef.current?.blur();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape" && searchActive) {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (!hasQuery || !searchResults.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSearchOpen(true);
      setActiveIndex((current) => event.key === "ArrowDown"
        ? (current + 1) % searchResults.length
        : (current - 1 + searchResults.length) % searchResults.length);
      return;
    }
    if (event.key === "Enter" && searchOpen) {
      event.preventDefault();
      openResult(searchResults[Math.min(activeIndex, searchResults.length - 1)]);
    }
  };

  return (
    <section className="hero shell" aria-labelledby="hero-title">
      <div className="hero-copy">
        {searchActive && <div className="search-focus-backdrop" aria-hidden="true" onPointerDown={(event) => { event.preventDefault(); closeSearch(); }} />}
        <div className="eyebrow"><LockIcon size={15} weight="bold" /> Private by default</div>
        <h1 id="hero-title"><span className="hero-line hero-line-first">Every file tool</span><span className="hero-line">you need.</span><span className="hero-line hero-line-accent">Nothing uploaded<b aria-hidden="true">.</b></span></h1>
        <p><span>Work with PDFs and images right in your browser.</span><span>Your files never leave this device—there is no account,</span><span>queue, or server copy.</span></p>
        <div
          ref={searchShellRef}
          className={`hero-search-shell${searchActive ? " search-active" : ""}`}
          onBlur={(event) => { if (!searchShellRef.current?.contains(event.relatedTarget)) { setSearchOpen(false); setSearchActive(false); } }}
        >
          <label className="hero-search">
            <MagnifyingGlassIcon size={23} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSearchOpen(Boolean(event.target.value.trim())); }}
              onFocus={() => { setSearchActive(true); if (hasQuery) setSearchOpen(true); }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search tools or type a command"
              aria-label="Search all tools"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen && hasQuery}
              aria-controls="hero-search-results"
              aria-activedescendant={searchOpen && searchResults[activeIndex] ? `hero-search-result-${searchResults[activeIndex].slug}` : undefined}
            />
            {query
              ? <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} aria-label="Clear search"><XIcon size={17} /></button>
              : <kbd className="hero-shortcut" aria-hidden="true">⌘ K</kbd>}
          </label>
          {searchOpen && hasQuery && (
            <div id="hero-search-results" className="hero-search-results" role="listbox" aria-label="Matching tools">
              {searchResults.length ? searchResults.map((tool, index) => (
                <button
                  type="button"
                  role="option"
                  id={`hero-search-result-${tool.slug}`}
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  key={tool.slug}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openResult(tool)}
                >
                  <span className={`hero-result-icon accent-${categoryById[tool.category].accent}`}><ToolIcon tool={tool} size={19} /></span>
                  <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  <b>{tool.kind === "pdf" ? "PDF" : "IMAGE"}</b>
                </button>
              )) : <div className="hero-search-empty" role="status"><MagnifyingGlassIcon size={18} aria-hidden="true" /><span><strong>No matching tools</strong><small>Try a format or simpler action.</small></span></div>}
              <button type="button" className="hero-search-view-all" onClick={() => { setSearchOpen(false); setSearchActive(false); onViewAll(); }} disabled={!resultCount}>
                <span>{resultCount ? `${resultCount} matching ${resultCount === 1 ? "tool" : "tools"}` : "No tools to show"}</span>
                <strong>View full list <ArrowRightIcon size={14} aria-hidden="true" /></strong>
              </button>
            </div>
          )}
        </div>
        <div className="hero-quick" aria-label="Popular tools">
          <span>Jump to</span>
          {["merge-pdf", "compress-pdf", "jpg-to-pdf", "compress-image"].map((slug) => {
            const tool = tools.find((item) => item.slug === slug);
            return <button key={slug} onClick={() => onQuickTool(tool)}><span>{tool.name}</span></button>;
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
      <a className="tool-card-main" href={toolPath(tool)} onClick={(event) => { event.preventDefault(); onOpen(tool); }} aria-label={`Open ${tool.name}`}>
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
      </a>
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

function usePdfPageInfo(file, enabled, limits, toolName) {
  const [info, setInfo] = useState({ state: "idle", pageCount: 0, message: "", document: null });

  useEffect(() => {
    if (!enabled || !file) {
      setInfo({ state: "idle", pageCount: 0, message: "", document: null });
      return undefined;
    }

    let cancelled = false;
    let loadingTask;
    let loadedDocument;
    setInfo({ state: "loading", pageCount: 0, message: "Reading the PDF locally…", document: null });
    (async () => {
      const pdfjs = await getPdfJsEngine();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      loadingTask = pdfjs.getDocument({ data: bytes });
      loadedDocument = await loadingTask.promise;
      const pageCount = loadedDocument.numPages;
      if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("This PDF did not report a valid page count.");
      if (pageCount > limits.maxPdfPagesPerFile) {
        throw new Error(`This PDF has ${pageCount.toLocaleString()} pages; ${toolName} supports ${limits.maxPdfPagesPerFile.toLocaleString()} per file.`);
      }
      if (!cancelled) setInfo({ state: "ready", pageCount, message: `${pageCount.toLocaleString()} ${pageCount === 1 ? "page" : "pages"} found locally`, document: loadedDocument });
    })().catch((error) => {
      if (cancelled || error?.name === "RenderingCancelledException") return;
      void destroyPdfJsDocument(loadedDocument || loadingTask).catch(() => {});
      loadedDocument = null;
      loadingTask = null;
      setInfo({ state: "error", pageCount: 0, message: error?.message || "The page count could not be read. Unlock or repair the PDF, then try again.", document: null });
    });

    return () => {
      cancelled = true;
      void destroyPdfJsDocument(loadedDocument || loadingTask).catch(() => {});
    };
  }, [enabled, file, limits.maxPdfPagesPerFile, toolName]);

  return info;
}

function getRemovePlan(settings, info) {
  if (info.state === "idle") return { valid: false, selection: [], keptCount: 0, message: "Add one PDF to choose pages." };
  if (info.state === "loading") return { valid: false, selection: [], keptCount: 0, message: "Reading the page count locally…" };
  if (info.state === "error") return { valid: false, selection: [], keptCount: 0, message: info.message };
  if (!String(settings.pages || "").trim()) {
    return { valid: false, selection: [], keptCount: info.pageCount, message: "Choose at least one page to remove." };
  }
  try {
    const selection = parseSplitPageSelection(settings.pages, info.pageCount);
    if (selection.length >= info.pageCount) {
      return {
        valid: false,
        selection,
        keptCount: 0,
        message: "Keep at least one page. Removing every page would create an empty PDF.",
      };
    }
    return { valid: true, selection, keptCount: info.pageCount - selection.length, message: "" };
  } catch (error) {
    return { valid: false, selection: [], keptCount: info.pageCount, message: error?.message || "Choose valid pages to remove." };
  }
}

function getExtractPlan(settings, info, limits) {
  if (info.state === "idle") return { valid: false, selection: [], outputCount: 0, message: "Add one PDF to choose pages." };
  if (info.state === "loading") return { valid: false, selection: [], outputCount: 0, message: "Reading the page count locally…" };
  if (info.state === "error") return { valid: false, selection: [], outputCount: 0, message: info.message };
  try {
    return { valid: true, ...createExtractPagePlan(settings.pages, info.pageCount, settings.combine, limits.maxGeneratedItems), message: "" };
  } catch (error) {
    let selection = [];
    try { selection = parseSplitPageSelection(settings.pages, info.pageCount); } catch { /* Keep valid over-limit selections visible when possible. */ }
    return { valid: false, selection, outputCount: 0, message: error?.message || "Choose valid pages to extract." };
  }
}

function PdfPageSourceStatus({ info }) {
  return (
    <div className={`split-source-status ${info.state}`} role="status" aria-live="polite">
      {info.state === "loading" ? <SpinnerGapIcon size={17} className="spin" aria-hidden="true" /> : <FilePdfIcon size={17} weight="duotone" aria-hidden="true" />}
      <span><strong>{info.state === "ready" ? info.message : info.state === "idle" ? "Waiting for a PDF" : info.message}</strong><small>Page details are read on this device. Nothing is uploaded.</small></span>
    </div>
  );
}

function PageSelectionPicker({ value, pageCount, selection, onChange, intent, maxSelection, valid, document }) {
  const selected = new Set(selection);
  const isRemove = intent === "remove";
  const isExtract = intent === "extract";
  const selectedCount = selected.size;
  const pagesPerWindow = 6;
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const pageRailRef = useRef(null);
  const pendingRailAlignmentRef = useRef(null);
  const lastWheelPageTurnRef = useRef(0);
  const visiblePages = Array.from(
    { length: Math.min(pagesPerWindow, Math.max(0, pageCount - pageWindowStart)) },
    (_, index) => pageWindowStart + index,
  );

  useEffect(() => {
    const maxWindowStart = Math.max(0, Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow);
    setPageWindowStart((current) => Math.min(current, maxWindowStart));
  }, [pageCount]);

  useEffect(() => {
    const alignment = pendingRailAlignmentRef.current;
    const rail = pageRailRef.current;
    if (!alignment || !rail) return;
    rail.scrollLeft = alignment === "end" ? Math.max(0, rail.scrollWidth - rail.clientWidth) : 0;
    pendingRailAlignmentRef.current = null;
  }, [pageWindowStart]);

  const showPageWindow = (nextStart, alignment = "start") => {
    const boundedStart = Math.max(0, Math.min(Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow, nextStart));
    pendingRailAlignmentRef.current = alignment;
    setPageWindowStart(boundedStart);
    if (boundedStart === pageWindowStart && pageRailRef.current) {
      pageRailRef.current.scrollLeft = alignment === "end"
        ? Math.max(0, pageRailRef.current.scrollWidth - pageRailRef.current.clientWidth)
        : 0;
      pendingRailAlignmentRef.current = null;
    }
  };

  const scrollPageRailHorizontally = (event) => {
    const rail = event.currentTarget;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta));
    if (nextScrollLeft !== rail.scrollLeft) {
      event.preventDefault();
      rail.scrollLeft = nextScrollLeft;
      return;
    }

    const maxWindowStart = Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow;
    const nextWindowStart = delta > 0
      ? Math.min(maxWindowStart, pageWindowStart + pagesPerWindow)
      : Math.max(0, pageWindowStart - pagesPerWindow);
    if (nextWindowStart === pageWindowStart) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelPageTurnRef.current < 220) return;
    lastWheelPageTurnRef.current = now;
    showPageWindow(nextWindowStart, delta > 0 ? "start" : "end");
  };

  const setRule = (rule) => {
    let pages = [];
    if (rule === "all") pages = Array.from({ length: Math.min(pageCount, maxSelection || pageCount) }, (_, index) => index);
    if (rule === "odd") pages = Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 0);
    if (rule === "even") pages = Array.from({ length: pageCount }, (_, index) => index).filter((index) => index % 2 === 1);
    onChange(formatPageSelection(pages));
  };

  const togglePage = (pageIndex) => {
    let current = [];
    try {
      current = parseSplitPageSelection(value, pageCount);
    } catch {
      current = [];
    }
    const next = new Set(current);
    if (next.has(pageIndex)) next.delete(pageIndex);
    else next.add(pageIndex);
    onChange(formatPageSelection([...next]));
  };

  const selectionLabel = selectedCount
    ? `${selectedCount.toLocaleString()} ${isRemove ? "marked for removal" : "selected"}`
    : isRemove ? "No pages marked" : "No pages selected";
  const pageRangeLabel = `Pages ${pageWindowStart + 1}–${Math.min(pageWindowStart + pagesPerWindow, pageCount)} of ${pageCount}`;

  return (
    <section className={`page-selection-picker ${isRemove ? "remove" : "include"}`} aria-labelledby={`${intent}-page-picker-title`}>
      <div className="page-selection-heading">
        <span><strong id={`${intent}-page-picker-title`}>{isRemove ? "Choose pages to delete" : isExtract ? "Choose pages to extract" : "Choose pages to split"}</strong><small>{isRemove ? "Tap page previews to mark them. Every unmarked page stays in the PDF." : isExtract ? "Tap the pages you want to copy into the new output." : "Tap page previews to include them. Each selected page becomes its own PDF."}</small></span>
        <b aria-live="polite">{selectionLabel}</b>
      </div>
      <div className="page-selection-actions" aria-label={isRemove ? "Quick removal selections" : "Quick page selections"}>
        {!isRemove && <button type="button" onClick={() => setRule("all")}>{pageCount > maxSelection ? `First ${maxSelection}` : "Select all"}</button>}
        <button type="button" onClick={() => setRule("odd")}>Odd pages</button>
        <button type="button" onClick={() => setRule("even")}>Even pages</button>
        <button type="button" onClick={() => setRule("clear")} disabled={!selectedCount}>Clear</button>
      </div>
      <div className="page-selection-strip-heading">
        <small>Click a page preview to {isRemove ? "remove or keep it" : "select or clear it"}.</small>
        {pageCount > pagesPerWindow && (
          <span className="split-window-controls">
            <button type="button" onClick={() => showPageWindow(pageWindowStart - pagesPerWindow)} disabled={pageWindowStart === 0} aria-label="Show previous PDF pages"><ArrowLeftIcon size={14} /></button>
            <b aria-live="polite">{pageRangeLabel}</b>
            <button type="button" onClick={() => showPageWindow(pageWindowStart + pagesPerWindow)} disabled={pageWindowStart + pagesPerWindow >= pageCount} aria-label="Show next PDF pages"><ArrowRightIcon size={14} /></button>
          </span>
        )}
      </div>
      <div
        className="page-selection-strip"
        ref={pageRailRef}
        role="group"
        aria-label={`${isRemove ? "Mark pages to remove" : isExtract ? "Select pages to extract" : "Select pages to split"} from ${pageRangeLabel.toLowerCase()}`}
        onWheel={scrollPageRailHorizontally}
      >
        {visiblePages.map((pageIndex) => {
          const isSelected = selected.has(pageIndex);
          return (
            <button
              type="button"
              key={pageIndex}
              className={`page-selection-card ${isSelected ? "selected" : ""}`}
              aria-pressed={isSelected}
              aria-label={`Page ${pageIndex + 1}, ${isRemove ? isSelected ? "marked for removal" : "will be kept" : isSelected ? isExtract ? "selected for extraction" : "selected for splitting" : "not selected"}`}
              onClick={() => togglePage(pageIndex)}
            >
              <span className="page-selection-preview">
                <PdfPageThumbnail document={document} pageIndex={pageIndex} />
                {isSelected && <span className="page-selection-state" aria-hidden="true">{isRemove ? <TrashIcon size={16} weight="fill" /> : <CheckCircleIcon size={17} weight="fill" />}</span>}
              </span>
              <span className="page-selection-card-label"><b>Page {pageIndex + 1}</b><small>{isRemove ? isSelected ? "Remove" : "Keep" : isSelected ? "Selected" : "Not selected"}</small></span>
            </button>
          );
        })}
      </div>
      <details className="page-manual-entry">
        <summary><KeyboardIcon size={15} aria-hidden="true" /><span>Enter page numbers instead</span><CaretRightIcon size={13} aria-hidden="true" /></summary>
        <div className="setting-field">
          <label htmlFor={`${intent}-page-ranges`}><strong>{isRemove ? "Pages to remove" : isExtract ? "Pages to extract" : "Pages to split"}</strong></label>
          <small id={`${intent}-page-ranges-description`} className="field-description">Examples: 1-4, 6, or 8-5. The page buttons stay in sync.</small>
          <input
            id={`${intent}-page-ranges`}
            type="text"
            maxLength={4096}
            value={value}
            aria-describedby={`${intent}-page-ranges-description ${intent}-plan-message`}
            aria-invalid={!valid}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </details>
    </section>
  );
}

function getSplitPlan(settings, info, limits) {
  if (info.state === "idle") return { valid: false, groups: [], selection: [], message: "Add one PDF to see its pages." };
  if (info.state === "loading") return { valid: false, groups: [], selection: [], message: "Reading the page count locally…" };
  if (info.state === "error") return { valid: false, groups: [], selection: [], message: info.message };
  try {
    const groups = createSplitPdfGroups(settings.mode, info.pageCount, settings.customBreaks, settings.pages);
    if (groups.length > limits.maxGeneratedItems) {
      return {
        valid: false,
        groups,
        selection: groups.flat(),
        message: `This would create ${groups.length.toLocaleString()} files. Choose up to ${limits.maxGeneratedItems.toLocaleString()} output PDFs per job.`,
      };
    }
    return { valid: true, groups, selection: groups.flat(), message: "" };
  } catch (error) {
    return { valid: false, groups: [], selection: [], message: error?.message || "Choose valid split points to continue." };
  }
}

function PdfPageThumbnail({ document, pageIndex }) {
  const canvasRef = useRef(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let cancelled = false;
    let page;
    let renderTask;
    setState("loading");
    (async () => {
      page = await document.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(92 / base.width, 112 / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (!cancelled) setState("ready");
    })().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") setState("error");
    });
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* Render already completed. */ }
      page?.cleanup();
    };
  }, [document, pageIndex]);

  return (
    <span className={`split-page-thumbnail ${state}`} aria-hidden="true">
      <canvas ref={canvasRef} />
      {state === "loading" && <SpinnerGapIcon size={17} className="spin" />}
      {state === "error" && <FilePdfIcon size={20} weight="duotone" />}
    </span>
  );
}

const splitMethodOptions = [
  { value: "half", label: "Split in half", Icon: ColumnsIcon },
  { value: "every2", label: "Every 2 pages", Icon: SelectionBackgroundIcon },
  { value: "odd", label: "Odd pages", Icon: ListNumbersIcon },
  { value: "even", label: "Even pages", Icon: ListIcon },
  { value: "custom", label: "Custom", Icon: SlidersHorizontalIcon },
];

function SplitPdfControls({ settings, onChange, info, plan, limits }) {
  const mode = splitMethodOptions.some((option) => option.value === settings.mode) ? settings.mode : "half";
  const pageCount = info.pageCount || 0;
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const pageRailRef = useRef(null);
  const pendingRailAlignmentRef = useRef(null);
  const lastWheelPageTurnRef = useRef(0);
  const pagesPerWindow = 6;
  const visiblePages = Array.from(
    { length: Math.min(pagesPerWindow, Math.max(0, pageCount - pageWindowStart)) },
    (_, index) => pageWindowStart + index,
  );
  const activeBreaks = new Set(plan.groups.slice(0, -1).map((group) => group[group.length - 1] + 1));
  const groupsCoverInOrder = plan.groups.flat().every((page, index) => page === index);

  useEffect(() => {
    const maxWindowStart = Math.max(0, Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow);
    setPageWindowStart((current) => Math.min(current, maxWindowStart));
  }, [pageCount]);

  useEffect(() => {
    const alignment = pendingRailAlignmentRef.current;
    const rail = pageRailRef.current;
    if (!alignment || !rail) return;
    rail.scrollLeft = alignment === "end" ? Math.max(0, rail.scrollWidth - rail.clientWidth) : 0;
    pendingRailAlignmentRef.current = null;
  }, [pageWindowStart]);

  const showPageWindow = (nextStart, alignment = "start") => {
    const boundedStart = Math.max(0, Math.min(Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow, nextStart));
    pendingRailAlignmentRef.current = alignment;
    setPageWindowStart(boundedStart);
    if (boundedStart === pageWindowStart && pageRailRef.current) {
      pageRailRef.current.scrollLeft = alignment === "end"
        ? Math.max(0, pageRailRef.current.scrollWidth - pageRailRef.current.clientWidth)
        : 0;
      pendingRailAlignmentRef.current = null;
    }
  };

  const selectMode = (nextMode) => {
    if (nextMode === "custom" && !String(settings.customBreaks || "").trim() && groupsCoverInOrder) {
      onChange("customBreaks", [...activeBreaks].join(","));
    }
    onChange("mode", nextMode);
  };

  const toggleBreak = (afterPage) => {
    const nextBreaks = mode === "custom" ? new Set(activeBreaks) : groupsCoverInOrder ? new Set(activeBreaks) : new Set();
    if (nextBreaks.has(afterPage)) nextBreaks.delete(afterPage);
    else nextBreaks.add(afterPage);
    onChange("customBreaks", [...nextBreaks].sort((a, b) => a - b).join(","));
    onChange("mode", "custom");
  };

  const pageRangeLabel = pageCount
    ? `Pages ${pageWindowStart + 1}–${Math.min(pageWindowStart + pagesPerWindow, pageCount)} of ${pageCount}`
    : "Page preview";
  const selectionIsDefault = mode === "half" && !String(settings.customBreaks || "").trim() && pageWindowStart === 0;

  const resetSelection = () => {
    onChange("customBreaks", "");
    onChange("mode", "half");
    showPageWindow(0);
  };

  const scrollPageRailHorizontally = (event) => {
    const rail = event.currentTarget;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!delta) return;
    const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, rail.scrollLeft + delta));
    if (nextScrollLeft !== rail.scrollLeft) {
      event.preventDefault();
      rail.scrollLeft = nextScrollLeft;
      return;
    }

    const maxWindowStart = Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow;
    const nextWindowStart = delta > 0
      ? Math.min(maxWindowStart, pageWindowStart + pagesPerWindow)
      : Math.max(0, pageWindowStart - pagesPerWindow);
    if (nextWindowStart === pageWindowStart) return;

    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelPageTurnRef.current < 220) return;
    lastWheelPageTurnRef.current = now;
    showPageWindow(nextWindowStart, delta > 0 ? "start" : "end");
  };

  return (
    <div className="split-controls">
      <fieldset className="split-mode-picker">
        <legend>Choose a split method</legend>
        <div>
          {splitMethodOptions.map(({ value, label, Icon }) => (
            <label key={value} className={mode === value ? "selected" : ""}>
              <input type="radio" name="split-mode" value={value} checked={mode === value} onChange={() => selectMode(value)} />
              <Icon size={17} weight="duotone" aria-hidden="true" />
              <strong>{label}</strong>
            </label>
          ))}
        </div>
      </fieldset>

      <PdfPageSourceStatus info={info} />

      {info.state === "ready" && (
        <section className="split-visual-planner" aria-labelledby="split-visual-title">
          <div className="split-visual-heading">
            <span><strong id="split-visual-title">Click between pages to add or remove a split.</strong><small>{mode === "odd" || mode === "even" ? "Odd and even presets group their selected pages into one PDF. Adding a split switches to Custom." : "Each highlighted divider starts a new output PDF."}</small></span>
            <span className="split-planner-actions">
              <button type="button" className="split-reset-button" onClick={resetSelection} disabled={selectionIsDefault}>
                <ArrowClockwiseIcon size={14} aria-hidden="true" />Reset selection
              </button>
              {pageCount > pagesPerWindow && (
                <span className="split-window-controls">
                <button type="button" onClick={() => showPageWindow(pageWindowStart - pagesPerWindow)} disabled={pageWindowStart === 0} aria-label="Show previous PDF pages"><ArrowLeftIcon size={14} /></button>
                <b aria-live="polite">{pageRangeLabel}</b>
                <button type="button" onClick={() => showPageWindow(pageWindowStart + pagesPerWindow)} disabled={pageWindowStart + pagesPerWindow >= pageCount} aria-label="Show next PDF pages"><ArrowRightIcon size={14} /></button>
                </span>
              )}
            </span>
          </div>
          <div
            className="split-page-rail"
            ref={pageRailRef}
            role="group"
            aria-label={`Split points for ${pageRangeLabel.toLowerCase()}`}
            onWheel={scrollPageRailHorizontally}
          >
            {visiblePages.map((pageIndex) => {
              const groupIndex = groupsCoverInOrder ? plan.groups.findIndex((group) => group.includes(pageIndex)) : -1;
              const group = groupIndex >= 0 ? plan.groups[groupIndex] : [];
              const zebraGroup = groupIndex >= 0 && groupIndex % 2 === 0;
              const startsVisibleGroup = group[0] === pageIndex || visiblePages[0] === pageIndex;
              const endsVisibleGroup = group.at(-1) === pageIndex || visiblePages.at(-1) === pageIndex;
              return (
              <div
                className={`split-page-slot ${zebraGroup ? "zebra-section" : ""} ${zebraGroup && startsVisibleGroup ? "zebra-section-start" : ""} ${zebraGroup && endsVisibleGroup ? "zebra-section-end" : ""}`}
                key={pageIndex}
              >
                <span className="split-page-card">
                  <PdfPageThumbnail document={info.document} pageIndex={pageIndex} />
                  <b>Page {pageIndex + 1}</b>
                </span>
                {pageIndex + 1 < pageCount && (
                  <button
                    type="button"
                    className={`split-divider ${activeBreaks.has(pageIndex + 1) ? "active" : ""}`}
                    aria-pressed={activeBreaks.has(pageIndex + 1)}
                    aria-label={`${activeBreaks.has(pageIndex + 1) ? "Remove" : "Add"} split after page ${pageIndex + 1}`}
                    onClick={() => toggleBreak(pageIndex + 1)}
                  >
                    <span aria-hidden="true" />
                    <ScissorsIcon size={16} weight="bold" aria-hidden="true" />
                  </button>
                )}
              </div>
              );
            })}
          </div>
          {mode === "custom" && (
            <details className="page-manual-entry split-manual-entry">
              <summary><KeyboardIcon size={15} aria-hidden="true" /><span>Enter split points instead</span><CaretRightIcon size={13} aria-hidden="true" /></summary>
              <div className="setting-field">
                <label htmlFor="split-custom-breaks"><strong>Split after pages</strong></label>
                <small id="split-custom-breaks-description" className="field-description">Example: 3, 6 creates pages 1–3, 4–6, and 7 onward.</small>
                <input id="split-custom-breaks" type="text" maxLength={4096} value={settings.customBreaks} aria-describedby="split-custom-breaks-description" aria-invalid={!plan.valid} onChange={(event) => onChange("customBreaks", event.target.value)} />
              </div>
            </details>
          )}
        </section>
      )}

      {plan.valid ? (
        <section className="split-output-groups" aria-labelledby="split-output-title">
          <h4 id="split-output-title" className="visually-hidden">Planned output PDFs</h4>
          {plan.groups.map((group, index) => {
            const pages = formatPageSelection(group);
            const displayPages = pages.replaceAll("-", "–");
            return (
              <div className={`split-output-group tone-${index % 3}`} key={`${pages}-${index}`}>
                <span><FilePdfIcon size={19} weight="duotone" aria-hidden="true" /></span>
                <span><strong>PDF {index + 1} · {group.length === 1 ? `Page ${displayPages}` : `Pages ${displayPages}`}</strong><small>{group.length.toLocaleString()} {group.length === 1 ? "page" : "pages"}</small></span>
                <b title={`Pages ${displayPages}`}>{displayPages}</b>
              </div>
            );
          })}
          <div className="split-output-tip"><WarningCircleIcon size={15} weight="fill" aria-hidden="true" /><span><strong>Tip:</strong> Odd pages and Even pages create one PDF with all selected pages.</span></div>
        </section>
      ) : (
        <div id="split-plan-message" className={`split-output-plan ${["idle", "loading"].includes(info.state) ? "pending" : "warning"}`} role={["idle", "loading"].includes(info.state) ? "status" : "alert"} aria-live="polite">
          <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />
          <span><strong>Check your split</strong><small>{plan.message}</small></span>
        </div>
      )}
    </div>
  );
}

function RemovePdfControls({ settings, onChange, info, plan }) {
  const resultDescription = plan.valid
    ? `Removes ${formatPageSelection(plan.selection)}. Keeps ${plan.keptCount.toLocaleString()} ${plan.keptCount === 1 ? "page" : "pages"} in one PDF.`
    : plan.message;
  const planIsWarning = !plan.valid && !["idle", "loading"].includes(info.state);

  return (
    <div className="page-tool-controls">
      <PdfPageSourceStatus info={info} />
      {info.state === "ready" && (
        <PageSelectionPicker
          value={settings.pages}
          pageCount={info.pageCount}
          selection={plan.selection}
          onChange={(value) => onChange("pages", value)}
          intent="remove"
          valid={plan.valid}
          document={info.document}
        />
      )}
      <div id="remove-plan-message" className={`split-output-plan ${plan.valid ? "ready" : planIsWarning ? "warning" : "pending"}`} role={planIsWarning ? "alert" : "status"} aria-live="polite">
        {plan.valid ? <FilePdfIcon size={18} weight="duotone" aria-hidden="true" /> : <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />}
        <span><strong>{plan.valid ? "Result preview" : "Choose pages"}</strong><small>{resultDescription}</small></span>
      </div>
    </div>
  );
}

function ExtractPdfControls({ settings, onChange, info, plan, limits }) {
  const separate = settings.combine === false;
  const selectedPages = plan.selection.length;
  const pageSequence = plan.selection.length <= 12
    ? plan.selection.map((page) => page + 1).join(", ")
    : `${plan.selection.slice(0, 10).map((page) => page + 1).join(", ")}, …`;
  const resultDescription = plan.valid
    ? separate
      ? `${selectedPages.toLocaleString()} selected ${selectedPages === 1 ? "page becomes one PDF inside a ZIP" : "pages become separate PDFs in one ZIP"}.`
      : `${selectedPages.toLocaleString()} selected ${selectedPages === 1 ? "page will be copied" : "pages will be copied"} into one PDF in this order: ${pageSequence}.`
    : plan.message;
  const planIsWarning = !plan.valid && !["idle", "loading"].includes(info.state);

  return (
    <div className="page-tool-controls extract-page-controls">
      <PdfPageSourceStatus info={info} />
      {info.state === "ready" && (
        <>
          <fieldset className="extract-output-picker">
            <legend>How should the selected pages be saved?</legend>
            <div>
              <label className={!separate ? "selected" : ""}>
                <input type="radio" name="extract-output" checked={!separate} onChange={() => onChange("combine", true)} />
                <FilePdfIcon size={19} weight="duotone" aria-hidden="true" />
                <span><strong>One PDF</strong><small>Keep selected pages together</small></span>
              </label>
              <label className={separate ? "selected" : ""}>
                <input type="radio" name="extract-output" checked={separate} onChange={() => onChange("combine", false)} />
                <FilesIcon size={19} weight="duotone" aria-hidden="true" />
                <span><strong>Separate PDFs</strong><small>One PDF per page, downloaded as ZIP</small></span>
              </label>
            </div>
          </fieldset>
          <PageSelectionPicker
            value={settings.pages}
            pageCount={info.pageCount}
            selection={plan.selection}
            onChange={(value) => onChange("pages", value)}
            intent="extract"
            maxSelection={separate ? limits.maxGeneratedItems : undefined}
            valid={plan.valid}
            document={info.document}
          />
        </>
      )}
      <div id="extract-plan-message" className={`split-output-plan ${plan.valid ? "ready" : planIsWarning ? "warning" : "pending"}`} role={planIsWarning ? "alert" : "status"} aria-live="polite">
        {plan.valid ? (separate ? <FileZipIcon size={18} weight="duotone" aria-hidden="true" /> : <FilePdfIcon size={18} weight="duotone" aria-hidden="true" />) : <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />}
        <span><strong>{plan.valid ? separate ? `${plan.outputCount.toLocaleString()} ${plan.outputCount === 1 ? "PDF" : "PDFs"} ready in ZIP` : "One PDF ready" : "Choose pages"}</strong><small>{resultDescription}</small></span>
      </div>
    </div>
  );
}

const compressionModeIcons = {
  gentle: FeatherIcon,
  balanced: ScalesIcon,
  strong: ArrowsInIcon,
};

function usePdfCompressionEstimate(file, mode, password, enabled, limits) {
  const [estimate, setEstimate] = useState({ state: "idle" });

  useEffect(() => {
    if (!file || !enabled) {
      setEstimate({ state: "idle" });
      return undefined;
    }
    let cancelled = false;
    let loadingTask;
    let loadedDocument;
    let activeRenderTask;
    setEstimate({ state: "loading", file, mode });
    (async () => {
      const pdfjs = await getPdfJsEngine();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (cancelled) return;
      loadingTask = pdfjs.getDocument({ data: bytes, password: password || undefined });
      loadedDocument = await loadingTask.promise;
      const pageCount = loadedDocument.numPages;
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > limits.maxPdfPagesPerFile) throw new Error("This PDF cannot be sampled safely.");
      const sampleIndexes = [...new Set([0, Math.floor((pageCount - 1) / 2), pageCount - 1])];
      const preset = getPdfCompressionPreset(mode);
      const sampleSizes = [];
      for (const index of sampleIndexes) {
        if (cancelled) return;
        const page = await loadedDocument.getPage(index + 1);
        let canvas;
        try {
          const viewport = page.getViewport({ scale: preset.scale });
          assertRasterDimensions(viewport.width, viewport.height, limits, `Compression estimate page ${index + 1}`);
          canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          const context = canvas.getContext("2d", { alpha: false });
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          activeRenderTask = page.render({ canvasContext: context, viewport });
          await activeRenderTask.promise;
          activeRenderTask = null;
          const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("This page could not be sampled.")), "image/jpeg", preset.quality / 100));
          sampleSizes.push(blob.size);
        } finally {
          page.cleanup();
          if (canvas) {
            canvas.width = 1;
            canvas.height = 1;
          }
        }
      }
      const projection = projectPdfCompressionSize(file.size, pageCount, sampleSizes);
      if (!cancelled && projection) setEstimate({ state: "ready", file, mode, ...projection });
    })().catch((error) => {
      if (cancelled || error?.name === "RenderingCancelledException") return;
      setEstimate({ state: "error", file, mode, message: "Estimate unavailable. The exact result will still be checked before a download is offered." });
    }).finally(() => {
      void destroyPdfJsDocument(loadedDocument || loadingTask).catch(() => {});
      loadedDocument = null;
      loadingTask = null;
    });
    return () => {
      cancelled = true;
      try { activeRenderTask?.cancel(); } catch { /* Rendering already finished. */ }
      void destroyPdfJsDocument(loadedDocument || loadingTask).catch(() => {});
    };
  }, [enabled, file, limits, mode, password]);

  return estimate;
}

function CompressionEstimate({ estimate }) {
  if (estimate.state === "idle") return null;
  if (estimate.state === "loading") {
    return <div className="compression-estimate loading" role="status"><SpinnerGapIcon size={16} className="spin" aria-hidden="true" /><span><strong>Estimating output locally…</strong><small>Sampling up to three pages; nothing is uploaded.</small></span></div>;
  }
  if (estimate.state === "error") {
    return <div className="compression-estimate error" role="status"><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Estimate unavailable</strong><small>{estimate.message}</small></span></div>;
  }
  const magnitude = Math.abs(estimate.percent);
  const percentage = magnitude > 0 && magnitude < 1 ? "<1%" : `${Math.round(magnitude)}%`;
  const comparison = estimate.status === "reduced" ? `about ${percentage} smaller` : estimate.status === "increased" ? `may be ${percentage} larger; compression is disabled` : "no reduction projected; compression is disabled";
  return (
    <div className={`compression-estimate ${estimate.status}`} role="status" aria-live="polite">
      <FileArrowDownIcon size={18} weight="duotone" aria-hidden="true" />
      <span><strong>Estimated around {formatBytes(estimate.projectedBytes)}</strong><small>{formatBytes(estimate.lowerBytes)}–{formatBytes(estimate.upperBytes)} · {comparison} · based on {estimate.sampledPages} sampled {estimate.sampledPages === 1 ? "page" : "pages"}</small></span>
      <b>APPROX.</b>
    </div>
  );
}

function CompressionControls({ setting, value, onChange, inputSize, estimate }) {
  return (
    <section className="compression-controls" aria-labelledby="compression-strength-title">
      <fieldset>
        <legend id="compression-strength-title">Choose compression strength</legend>
        <p>More compression makes a smaller target, but fine text and images can look softer.</p>
        <div className="compression-mode-grid">
          {setting.options.map((option) => {
            const ModeIcon = compressionModeIcons[option.value] || FileArrowDownIcon;
            const selected = value === option.value;
            return (
              <label className={`compression-mode-card ${selected ? "selected" : ""}`} key={option.value}>
                <input type="radio" name="compression-quality" value={option.value} checked={selected} onChange={() => onChange(option.value)} />
                <span className="compression-mode-icon"><ModeIcon size={20} weight="duotone" aria-hidden="true" /></span>
                <span className="compression-mode-copy">
                  <span className="compression-mode-title"><strong>{option.label}</strong><b>{option.badge}</b></span>
                  <small>{option.hint}</small>
                  <span>{option.description}</span>
                </span>
                <CheckCircleIcon className="compression-selected-mark" size={19} weight="fill" aria-hidden="true" />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="compression-size-preview" aria-live="polite">
        <span className="compression-file source"><FilePdfIcon size={24} weight="duotone" aria-hidden="true" /><small>{inputSize ? formatBytes(inputSize) : "Original"}</small></span>
        <span className="compression-flow"><span /><ArrowRightIcon size={15} aria-hidden="true" /></span>
        <span className={`compression-file output mode-${value}`}><FileArrowDownIcon size={24} weight="duotone" aria-hidden="true" /><small>{setting.options.find((option) => option.value === value)?.hint}</small></span>
      </div>
      <CompressionEstimate estimate={estimate} />
      <div className="compression-method-note">
        <WarningCircleIcon size={17} weight="fill" aria-hidden="true" />
        <span><strong>Pages become compressed images.</strong> Searchable text, links, forms, and annotations are flattened.</span>
      </div>
    </section>
  );
}

function CompressionResultSummary({ inputSize, result }) {
  const keptOriginal = result.compressionOutcome === "original-kept";
  const protectedOriginal = result.compressionOutcome === "protected-original";
  if (keptOriginal || protectedOriginal) {
    const attemptedChange = getCompressionSizeChange(inputSize, result.attemptedSize);
    const magnitude = Math.abs(attemptedChange?.percent || 0);
    const percentage = magnitude > 0 && magnitude < 1 ? "<1%" : `${Math.round(magnitude)}%`;
    return (
      <div className="compression-result-summary unchanged" role="status" aria-live="polite">
        <div className="compression-result-highlight">
          <ShieldCheckIcon size={23} weight="duotone" aria-hidden="true" />
          <span><strong>Original kept unchanged</strong><small>The trial output was {formatBytes(result.attemptedSize)} ({percentage} larger), so its lossy bytes were discarded.</small></span>
        </div>
        <div className="compression-result-sizes" aria-label={`Original ${formatBytes(inputSize)}. Discarded trial ${formatBytes(result.attemptedSize)}.`}>
          <span><small>Original</small><strong>{formatBytes(inputSize)}</strong></span>
          <ArrowRightIcon size={17} aria-hidden="true" />
          <span><small>Trial discarded</small><strong>{formatBytes(result.attemptedSize)}</strong></span>
        </div>
      </div>
    );
  }
  const change = getCompressionSizeChange(inputSize, result.size);
  if (!change) return null;
  const magnitude = Math.abs(change.percent);
  const percentLabel = magnitude > 0 && magnitude < 1 ? "<1%" : `${Math.round(magnitude)}%`;
  const headline = change.status === "reduced"
    ? `${percentLabel} smaller`
    : change.status === "increased"
      ? `${percentLabel} larger`
      : "Same size";
  const detail = change.status === "reduced"
    ? `${formatBytes(change.bytesSaved)} saved`
    : change.status === "increased"
      ? `Output is ${formatBytes(Math.abs(change.bytesSaved))} larger. Try Strong or keep the original.`
      : "This PDF could not be made smaller with this setting.";

  return (
    <div className={`compression-result-summary ${change.status}`} role="status" aria-live="polite">
      <div className="compression-result-highlight">
        <FileArrowDownIcon size={23} weight="duotone" aria-hidden="true" />
        <span><strong>{headline}</strong><small>{detail}</small></span>
      </div>
      <div className="compression-result-sizes" aria-label={`Original ${formatBytes(change.inputBytes)}. Compressed ${formatBytes(change.outputBytes)}.`}>
        <span><small>Original</small><strong>{formatBytes(change.inputBytes)}</strong></span>
        <ArrowRightIcon size={17} aria-hidden="true" />
        <span><small>Compressed</small><strong>{formatBytes(change.outputBytes)}</strong></span>
      </div>
    </div>
  );
}

async function copyOcrText(text) {
  const value = String(text || "");
  if (!value) throw new Error("There is no recognized text to copy.");
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser. Select the text and copy it manually.");
  await navigator.clipboard.writeText(value);
}

function OcrReaderResult({ result, headingRef, onReset }) {
  const pages = result?.ocrPages || [];
  const [pageIndex, setPageIndex] = useState(0);
  const [copyState, setCopyState] = useState({ kind: "idle", message: "" });
  const page = pages[pageIndex] || { pageNumber: pageIndex + 1, text: "", confidence: null };

  const copy = async (kind) => {
    const text = kind === "all" ? buildOcrCopyText(pages) : page.text;
    try {
      await copyOcrText(text);
      setCopyState({ kind: "success", message: kind === "all" ? `Copied all ${pages.length} pages.` : `Copied page ${page.pageNumber}.` });
    } catch (error) {
      setCopyState({ kind: "error", message: error?.message || "Text could not be copied." });
    }
  };

  const openPage = (nextIndex) => {
    setPageIndex(Math.max(0, Math.min(pages.length - 1, nextIndex)));
    setCopyState({ kind: "idle", message: "" });
  };

  return (
    <section className="ocr-reader-card" aria-labelledby="ocr-reader-title">
      <header className="ocr-reader-header">
        <span><TextTIcon size={24} weight="duotone" aria-hidden="true" /></span>
        <div><h3 id="ocr-reader-title" ref={headingRef} tabIndex="-1">Recognized text</h3><p>{result.details} · held only in this tab</p></div>
        <b>ENGLISH</b>
      </header>
      <nav className="ocr-page-nav" aria-label="OCR reader pages">
        <button type="button" onClick={() => openPage(pageIndex - 1)} disabled={pageIndex === 0} aria-label="Show previous recognized page"><ArrowLeftIcon size={15} aria-hidden="true" />Previous</button>
        <span aria-live="polite"><strong>Page {page.pageNumber} of {pages.length}</strong>{page.confidence !== null && <small>{page.confidence}% recognition confidence</small>}</span>
        <button type="button" onClick={() => openPage(pageIndex + 1)} disabled={pageIndex >= pages.length - 1} aria-label="Show next recognized page">Next<ArrowRightIcon size={15} aria-hidden="true" /></button>
      </nav>
      {pages.length > 1 && (
        <div className="ocr-page-strip" role="group" aria-label="Open recognized page">
          {pages.map((item, index) => <button key={item.pageNumber} type="button" aria-pressed={index === pageIndex} onClick={() => openPage(index)}>{item.pageNumber}</button>)}
        </div>
      )}
      <div className="ocr-text-panel">
        <label htmlFor="ocr-page-text">Page {page.pageNumber} text</label>
        {page.text ? <textarea id="ocr-page-text" readOnly value={page.text} spellCheck="false" /> : <div className="ocr-empty-text"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" /><span><strong>No text recognized on this page</strong><small>Try a clearer scan with upright, high-contrast English text.</small></span></div>}
      </div>
      <footer className="ocr-reader-actions">
        <span className={`ocr-copy-status ${copyState.kind}`} role="status" aria-live="polite">{copyState.message || "Text stays local until you copy it."}</span>
        <button type="button" onClick={() => copy("page")} disabled={!page.text}><FilesIcon size={16} aria-hidden="true" />Copy page</button>
        <button type="button" className="primary" onClick={() => copy("all")} disabled={!pages.some((item) => item.text)}><StackIcon size={16} aria-hidden="true" />Copy all pages</button>
      </footer>
      <button className="start-another ocr-start-another" onClick={onReset}>Read another PDF</button>
    </section>
  );
}

function MarkdownPreview({ text, limits }) {
  const preview = useMemo(() => parseMarkdownPreview(text, {
    maxCharacters: limits.maxTextPreviewCharacters,
    maxBlocks: limits.maxTextPreviewBlocks,
  }), [limits, text]);

  return (
    <div className="markdown-preview-panel">
      <article aria-label="Rendered Markdown preview">
        {preview.blocks.map((block, index) => {
          if (block.type === "divider") return <hr key={`divider-${index}`} />;
          if (block.type === "list" || block.type === "ordered-list") {
            const List = block.type === "ordered-list" ? "ol" : "ul";
            return <List key={`list-${index}`}>{block.items.map((item, itemIndex) => <li key={`${index}-${itemIndex}`}>{item}</li>)}</List>;
          }
          if (block.type === "heading") {
            const Heading = block.level <= 1 ? "h4" : block.level === 2 ? "h5" : "h6";
            return <Heading key={`heading-${index}`}>{block.text}</Heading>;
          }
          return <p key={`paragraph-${index}`}>{block.text}</p>;
        })}
      </article>
      {preview.truncated && <p className="markdown-preview-limit" role="note"><WarningCircleIcon size={16} aria-hidden="true" />This visual preview is capped for browser safety. The Text tab, Copy, and downloaded Markdown remain complete.</p>}
    </div>
  );
}

function TextReaderResult({ tool, result, limits, headingRef, onReset }) {
  const markdown = tool.slug === "pdf-to-markdown";
  const text = String(result?.textContent || "");
  const [activeTab, setActiveTab] = useState("text");
  const [copyState, setCopyState] = useState({ kind: "idle", message: "" });
  const textPanelId = `${tool.slug}-result-text`;
  const previewPanelId = `${tool.slug}-result-preview`;

  const copy = async () => {
    try {
      await copyOcrText(text);
      setCopyState({ kind: "success", message: markdown ? "Markdown copied." : "Translation copied." });
    } catch (error) {
      setCopyState({ kind: "error", message: error?.message || "Text could not be copied." });
    }
  };

  return (
    <section className="ocr-reader-card text-reader-card" aria-labelledby={`${tool.slug}-reader-title`}>
      <header className="ocr-reader-header text-reader-header">
        <span>{markdown ? <MarkdownLogoIcon size={24} weight="duotone" aria-hidden="true" /> : <TranslateIcon size={24} weight="duotone" aria-hidden="true" />}</span>
        <div><h3 id={`${tool.slug}-reader-title`} ref={headingRef} tabIndex="-1">{markdown ? "Markdown result" : "Translated text"}</h3><p>{result.details} · held only in this tab</p></div>
        <b>{markdown ? "MARKDOWN" : "LOCAL"}</b>
      </header>

      {markdown && (
        <div className="text-reader-tabs" role="tablist" aria-label="Markdown result views">
          <button type="button" role="tab" id={`${textPanelId}-tab`} aria-controls={textPanelId} aria-selected={activeTab === "text"} onClick={() => setActiveTab("text")}><TextTIcon size={16} aria-hidden="true" />Text</button>
          <button type="button" role="tab" id={`${previewPanelId}-tab`} aria-controls={previewPanelId} aria-selected={activeTab === "preview"} onClick={() => setActiveTab("preview")}><EyeIcon size={16} aria-hidden="true" />Preview</button>
        </div>
      )}

      {(!markdown || activeTab === "text") && (
        <div className="ocr-text-panel" id={textPanelId} role={markdown ? "tabpanel" : undefined} aria-labelledby={markdown ? `${textPanelId}-tab` : undefined}>
          <label htmlFor={`${tool.slug}-result-value`}>{markdown ? "Markdown text" : "Translated text"}</label>
          <textarea id={`${tool.slug}-result-value`} readOnly value={text} spellCheck="false" />
        </div>
      )}
      {markdown && activeTab === "preview" && (
        <div id={previewPanelId} role="tabpanel" aria-labelledby={`${previewPanelId}-tab`}><MarkdownPreview text={text} limits={limits} /></div>
      )}

      <footer className="ocr-reader-actions text-reader-actions">
        <span className={`ocr-copy-status ${copyState.kind}`} role="status" aria-live="polite">{copyState.message || "Text stays local until you copy or download it."}</span>
        <button type="button" onClick={() => downloadResult(result)}><DownloadSimpleIcon size={16} aria-hidden="true" />Download {markdown ? ".md" : ".txt"}</button>
        <button type="button" className="primary" onClick={copy} disabled={!text}><FilesIcon size={16} aria-hidden="true" />Copy {markdown ? "Markdown" : "translation"}</button>
      </footer>
      <button className="start-another ocr-start-another" onClick={onReset}>{markdown ? "Convert another PDF" : "Translate another PDF"}</button>
    </section>
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

function PdfPreviewCanvas({ document, pageIndex, limits, onState, onError }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let cancelled = false;
    let renderTask;
    let page;
    onState("loading");
    onError("");
    (async () => {
      page = await document.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(320, canvasRef.current?.parentElement?.clientWidth - 32 || 760);
      let scale = Math.min(limits.maxRasterEdge / base.width, availableWidth / base.width);
      const projectedPixels = base.width * scale * base.height * scale;
      if (projectedPixels > limits.maxRasterPixels) {
        scale *= Math.sqrt(limits.maxRasterPixels / projectedPixels);
      }
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      assertRasterDimensions(width, height, {
        maxRasterPixels: limits.maxRasterPixels,
        maxRasterEdge: limits.maxRasterEdge,
      }, `PDF page ${pageIndex + 1} preview`);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (!cancelled) onState("ready");
    })().catch((error) => {
      if (cancelled || error?.name === "RenderingCancelledException") return;
      onState("error");
      onError(error?.message || "This page could not be rendered in the browser preview.");
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
  }, [document, pageIndex, limits, onState, onError]);

  return <canvas ref={canvasRef} className="pdf-preview-canvas" role="img" aria-label={`Preview of PDF page ${pageIndex + 1}`} />;
}

function PdfPreviewDialog({ result, limits, onClose }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const passwordUpdateRef = useRef(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [previewState, setPreviewState] = useState("loading");
  const [previewError, setPreviewError] = useState("");
  const [previewPassword, setPreviewPassword] = useState("");
  const [passwordIncorrect, setPasswordIncorrect] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    titleRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadingTask;
    let loadedDocument;
    setPdfDocument(null);
    setPreviewState("loading");
    setPreviewError("");
    setPreviewPassword("");
    setPasswordIncorrect(false);
    passwordUpdateRef.current = null;
    setPageIndex(0);
    (async () => {
      const blob = assertPdfPreviewResult(result, limits.maxOutputBytes);
      const pdfjs = await getPdfJsEngine();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      loadingTask = pdfjs.getDocument({ data: bytes });
      loadingTask.onPassword = (updatePassword, reason) => {
        if (cancelled) return;
        passwordUpdateRef.current = updatePassword;
        setPasswordIncorrect(reason === 2);
        setPreviewPassword("");
        setPreviewState("password");
      };
      loadedDocument = await loadingTask.promise;
      if (!Number.isInteger(loadedDocument.numPages) || loadedDocument.numPages < 1 || loadedDocument.numPages > limits.maxPages) {
        throw new Error(`This PDF cannot be previewed because it exceeds the ${limits.maxPages.toLocaleString()}-page local preview limit.`);
      }
      if (cancelled) {
        await destroyPdfJsDocument(loadedDocument);
        loadedDocument = null;
        loadingTask = null;
        return;
      }
      setPdfDocument(loadedDocument);
    })().catch((error) => {
      if (cancelled || error?.name === "RenderingCancelledException") return;
      void destroyPdfJsDocument(loadedDocument).catch(() => {});
      loadedDocument = null;
      loadingTask = null;
      setPreviewState("error");
      setPreviewError(error?.message || "This PDF could not be opened in the browser preview.");
    });
    return () => {
      cancelled = true;
      passwordUpdateRef.current = null;
      void destroyPdfJsDocument(loadedDocument || loadingTask).catch(() => {});
    };
  }, [result, limits]);

  const pageCount = pdfDocument?.numPages || 0;
  const openPage = (nextPage) => {
    setPreviewError("");
    setPreviewState("loading");
    setPageIndex(nextPage);
  };
  const submitPreviewPassword = (event) => {
    event.preventDefault();
    if (!previewPassword || typeof passwordUpdateRef.current !== "function") return;
    const updatePassword = passwordUpdateRef.current;
    passwordUpdateRef.current = null;
    setPasswordIncorrect(false);
    setPreviewState("loading");
    updatePassword(previewPassword);
    setPreviewPassword("");
  };

  return (
    <dialog
      ref={dialogRef}
      className="pdf-preview-dialog"
      aria-labelledby="pdf-preview-title"
      aria-describedby="pdf-preview-description"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <div className="pdf-preview-shell">
        <header className="pdf-preview-header">
          <span className="pdf-preview-icon"><FilePdfIcon size={24} weight="duotone" aria-hidden="true" /></span>
          <div>
            <span className="pdf-preview-kicker">Local result preview</span>
            <h2 ref={titleRef} id="pdf-preview-title" tabIndex="-1">{result.name}</h2>
            <p id="pdf-preview-description">Review this PDF here without uploading it. Download remains available for your preferred PDF viewer.</p>
          </div>
          <button className="dialog-close" onClick={onClose} aria-label="Close PDF preview"><XIcon size={21} aria-hidden="true" /></button>
        </header>

        <nav className="pdf-preview-toolbar" aria-label="PDF preview pages">
          <button onClick={() => openPage(Math.max(0, pageIndex - 1))} disabled={!pageCount || pageIndex === 0} aria-label="Preview previous page"><ArrowLeftIcon size={16} aria-hidden="true" />Previous</button>
          <span aria-live="polite">{pageCount ? `Page ${pageIndex + 1} of ${pageCount}` : "Opening PDF…"}</span>
          <button onClick={() => openPage(Math.min(pageCount - 1, pageIndex + 1))} disabled={!pageCount || pageIndex === pageCount - 1} aria-label="Preview next page">Next<ArrowRightIcon size={16} aria-hidden="true" /></button>
        </nav>

        <div className="pdf-preview-frame">
          {pdfDocument && !previewError && (
            <PdfPreviewCanvas
              document={pdfDocument}
              pageIndex={pageIndex}
              limits={limits}
              onState={setPreviewState}
              onError={setPreviewError}
            />
          )}
          {previewState === "loading" && <div className="pdf-preview-state" role="status"><SpinnerGapIcon size={22} className="spin" aria-hidden="true" /><strong>Rendering page locally</strong><span>No file data leaves this device.</span></div>}
          {previewState === "password" && (
            <form className="pdf-preview-password" onSubmit={submitPreviewPassword}>
              <LockIcon size={24} weight="duotone" aria-hidden="true" />
              <strong>{passwordIncorrect ? "That password didn’t open this PDF" : "Password-protected PDF"}</strong>
              <span>Enter the output password to preview it. It stays in memory only and is cleared when this preview closes.</span>
              <label htmlFor="pdf-preview-password">PDF password</label>
              <div><input id="pdf-preview-password" type="password" value={previewPassword} maxLength={MAX_PDF_PASSWORD_CHARACTERS} autoComplete="off" autoCapitalize="none" spellCheck="false" onChange={(event) => setPreviewPassword(event.target.value)} /><button type="submit" disabled={!previewPassword}>Open preview</button></div>
            </form>
          )}
          {previewError && <div className="pdf-preview-state error" role="alert"><WarningCircleIcon size={23} weight="fill" aria-hidden="true" /><strong>Preview unavailable</strong><span>{previewError} Your PDF is still ready to download.</span></div>}
        </div>

        <footer className="pdf-preview-footer">
          <span><ShieldCheckIcon size={17} weight="fill" aria-hidden="true" />On-device preview · {formatBytes(result.size)} · {result.details}</span>
          <div>
            <button className="preview-back-button" onClick={onClose}>Back to result</button>
            <button className="preview-download-button" onClick={() => downloadResult(result)} aria-label={`Download ${result.name}`}><DownloadSimpleIcon size={17} aria-hidden="true" />Download PDF</button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

const imageFormatChoices = [
  { value: "webp", label: "WebP", badge: "Compact", hint: "Great for web and sharing", description: "Keeps transparency and uses the quality setting." },
  { value: "png", label: "PNG", badge: "Lossless", hint: "Best for graphics", description: "Keeps transparency; quality does not apply." },
  { value: "jpg", label: "JPG", badge: "Photos", hint: "Widely compatible", description: "Uses the quality setting and fills transparent pixels." },
];

function useImageEncoderSupport(enabled) {
  const [support, setSupport] = useState(() => ({ state: enabled ? "checking" : "idle", formats: {} }));

  useEffect(() => {
    if (!enabled) {
      setSupport({ state: "idle", formats: {} });
      return undefined;
    }
    let cancelled = false;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const check = (format) => new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(Boolean(blob && blob.type === `image/${format === "jpg" ? "jpeg" : format}`)), `image/${format === "jpg" ? "jpeg" : format}`, 0.8);
    });
    Promise.all(imageFormatChoices.map(async ({ value }) => [value, await check(value)]))
      .then((entries) => {
        if (!cancelled) setSupport({ state: "ready", formats: Object.fromEntries(entries) });
      })
      .catch(() => {
        if (!cancelled) setSupport({ state: "ready", formats: { png: true, jpg: true, webp: false } });
      })
      .finally(() => {
        canvas.width = 1;
        canvas.height = 1;
      });
    return () => {
      cancelled = true;
      canvas.width = 1;
      canvas.height = 1;
    };
  }, [enabled]);

  return support;
}

function ImageFormatControls({ settings, onChange, support }) {
  const format = settings.format || "webp";
  const lossy = format === "webp" || format === "jpg";
  return (
    <section className="image-format-controls" aria-labelledby="image-format-title">
      <fieldset>
        <legend id="image-format-title">Choose the new format</legend>
        <p>The image dimensions stay the same. The new file is created locally with metadata removed.</p>
        <div className="image-format-grid">
          {imageFormatChoices.map((option) => {
            const selected = format === option.value;
            const available = support.state !== "ready" || support.formats[option.value] !== false;
            return (
              <label className={`image-format-card ${selected ? "selected" : ""} ${available ? "" : "unavailable"}`} key={option.value}>
                <input type="radio" name="image-output-format" value={option.value} checked={selected} disabled={!available} onChange={() => onChange("format", option.value)} />
                <span className="image-format-extension">.{option.value}</span>
                <span className="image-format-copy"><strong>{option.label}<b>{option.badge}</b></strong><small>{option.hint}</small><span>{available ? option.description : "Not supported by this browser."}</span></span>
                <CheckCircleIcon size={18} weight="fill" aria-hidden="true" />
              </label>
            );
          })}
        </div>
      </fieldset>
      {lossy && (
        <label className="setting-field range-field" htmlFor="image-convert-quality">
          <span><strong>{format.toUpperCase()} quality</strong><output>{settings.quality}%</output></span>
          <input id="image-convert-quality" type="range" min="40" max="100" step="1" value={settings.quality} onChange={(event) => onChange("quality", event.target.value)} />
        </label>
      )}
      {format === "jpg" && (
        <label className="image-format-background" htmlFor="image-convert-background">
          <span><strong>Transparency fill</strong><small>JPG cannot store transparency.</small></span>
          <input id="image-convert-background" type="color" value={settings.background} onChange={(event) => onChange("background", event.target.value)} />
        </label>
      )}
      <div className="image-format-note"><ShieldCheckIcon size={17} weight="fill" aria-hidden="true" /><span><strong>Static output, on device.</strong> Animated inputs use their first frame. Multi-page TIFFs are rejected instead of partially converted.</span></div>
    </section>
  );
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
  const previewOpenerRef = useRef(null);
  const settingsList = useMemo(() => [...tool.settings, ...(contextualSettings[tool.slug] || [])].map((setting) => ({
    ...setting,
    maxLength: setting.maxLength ?? getTextSettingLimit(tool, setting.key),
  })), [tool]);
  const limits = useMemo(() => getToolLimits(tool), [tool]);
  const limitCopy = useMemo(() => describeToolLimits(tool), [tool]);
  const limitsId = `tool-limits-${tool.slug}`;
  const limitsPrimaryId = `${limitsId}-primary`;
  const [settings, setSettings] = useState(() => Object.fromEntries(settingsList.map((setting) => [setting.key, setting.default])));
  const imageEncoderSupport = useImageEncoderSupport(tool.slug === "convert-image");
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState({ phase: "Ready", progress: 0 });
  const [progressAnnouncement, setProgressAnnouncement] = useState(null);
  const [results, setResults] = useState([]);
  const [previewResult, setPreviewResult] = useState(null);
  const [processError, setProcessError] = useState("");
  const [fileIssue, setFileIssue] = useState(null);
  const [queueAnnouncement, setQueueAnnouncement] = useState(null);
  const passwordGate = useProtectedPdfGate(tool, files, setFiles);
  const usesPagePicker = ["split-pdf", "remove-pdf-pages", "extract-pdf-pages"].includes(tool.slug);
  const pageInfo = usePdfPageInfo(files[0], usesPagePicker && passwordGate.ready, limits, tool.name);
  const splitInfo = tool.slug === "split-pdf" ? pageInfo : { state: "idle", pageCount: 0, message: "" };
  const splitPlan = useMemo(() => tool.slug === "split-pdf" ? getSplitPlan(settings, splitInfo, limits) : null, [limits, settings, splitInfo, tool.slug]);
  const removePlan = useMemo(() => tool.slug === "remove-pdf-pages" ? getRemovePlan(settings, pageInfo) : null, [pageInfo, settings, tool.slug]);
  const extractPlan = useMemo(() => tool.slug === "extract-pdf-pages" ? getExtractPlan(settings, pageInfo, limits) : null, [limits, pageInfo, settings, tool.slug]);
  const compressionEstimate = usePdfCompressionEstimate(files[0], settings.quality, passwordGate.inputPasswords?.[0], tool.slug === "compress-pdf" && passwordGate.ready && status !== "processing" && !results.length, limits);
  const activeCompressionEstimate = tool.slug === "compress-pdf" && files[0] && (compressionEstimate.file !== files[0] || compressionEstimate.mode !== settings.quality)
    ? { state: "loading", file: files[0], mode: settings.quality }
    : compressionEstimate;

  useEffect(() => {
    if (tool.slug !== "convert-image" || imageEncoderSupport.state !== "ready" || imageEncoderSupport.formats[settings.format] !== false) return;
    const fallback = imageFormatChoices.find(({ value }) => imageEncoderSupport.formats[value])?.value;
    if (fallback) setSettings((current) => ({ ...current, format: fallback }));
  }, [imageEncoderSupport, settings.format, tool.slug]);

  const getFileId = (file) => {
    if (!fileIdsRef.current.has(file)) fileIdsRef.current.set(file, crypto.randomUUID());
    return fileIdsRef.current.get(file);
  };

  const clearResults = () => {
    setResults([]);
    setPreviewResult(null);
  };

  const openResultPreview = (result, opener) => {
    previewOpenerRef.current = opener;
    if (dialogRef.current?.open) dialogRef.current.close();
    setPreviewResult(result);
  };

  const closeResultPreview = () => {
    const opener = previewOpenerRef.current;
    setPreviewResult(null);
    window.requestAnimationFrame(() => {
      if (!dismissedRef.current && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    });
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
      passwordGate.resetForFileChange();
      setFiles(validation.nextFiles);
      clearResults();
      setStatus("idle");
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
    passwordGate.resetForFileChange();
    setFiles(next);
    clearResults();
    setStatus("idle");
    setProcessError("");
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
    passwordGate.resetForFileChange();
    setFiles(remaining);
    clearResults();
    setStatus("idle");
    setProcessError("");
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
  const pageSelectionReady = tool.slug === "split-pdf"
    ? Boolean(splitPlan?.valid)
    : tool.slug === "remove-pdf-pages"
      ? Boolean(removePlan?.valid)
      : tool.slug === "extract-pdf-pages"
        ? Boolean(extractPlan?.valid)
        : true;
  const compressionReady = tool.slug !== "compress-pdf" || !hasRequiredInput || compressionEstimateAllowsProcessing(activeCompressionEstimate);
  const imageEncoderReady = tool.slug !== "convert-image" || (imageEncoderSupport.state === "ready" && imageEncoderSupport.formats[settings.format] === true);
  const canRun = hasRequiredInput && pageSelectionReady && passwordGate.ready && compressionReady && imageEncoderReady && status !== "processing";
  const remainingFiles = Math.max(0, minFiles - files.length);
  const processHint = !hasRequiredInput
    ? minFiles === 0
      ? "Paste HTML or add an HTML file to continue."
      : `Add ${remainingFiles} ${files.length ? "more " : ""}${remainingFiles === 1 ? "file" : "files"} to continue.`
    : !passwordGate.ready
      ? passwordGate.active?.status === "checking"
        ? "Checking PDF protection locally."
        : "Enter the PDF password above to continue."
    : tool.slug === "split-pdf" && !splitPlan?.valid
      ? splitPlan?.message
    : tool.slug === "remove-pdf-pages" && !removePlan?.valid
      ? removePlan?.message
    : tool.slug === "extract-pdf-pages" && !extractPlan?.valid
      ? extractPlan?.message
    : tool.slug === "compress-pdf" && activeCompressionEstimate.state === "loading"
      ? "Checking whether this strength will reduce the file size locally."
    : tool.slug === "compress-pdf" && activeCompressionEstimate.state === "ready" && activeCompressionEstimate.status !== "reduced"
      ? "No size reduction is projected at this strength. Choose another strength or keep the original."
    : tool.slug === "convert-image" && !imageEncoderReady
      ? imageEncoderSupport.state === "checking" ? "Checking image encoders in this browser." : "Choose an output format supported by this browser."
    : "";
  const processHintId = `process-hint-${tool.slug}`;
  const showProcessHint = Boolean(processHint) && status !== "processing";

  const process = async () => {
    if (!canRun) return;
    setStatus("processing");
    setProcessError("");
    setFileIssue(null);
    clearResults();
    setProgress({ phase: "Starting", progress: 0.02 });
    setProgressAnnouncement({ id: crypto.randomUUID(), message: "Local processing started." });
    try {
      const response = await runTool(tool, files, {
        ...settings,
        inputPasswords: passwordGate.inputPasswords,
        outputPassword: passwordGate.outputPassword,
      }, (nextProgress) => {
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
    } finally {
      if (!dismissedRef.current) passwordGate.clearCredentials({ resetPreference: true });
    }
  };

  const dropzoneAction = files.length
    ? limits.maxFiles === 1 ? "Choose a different file" : "Add more files"
    : "Drop files here or choose files";
  const processButtonLabel = tool.slug === "ocr-pdf" && hasRequiredInput
    ? "Recognize text"
    : tool.slug === "compress-pdf" && hasRequiredInput && activeCompressionEstimate.state === "loading"
    ? "Checking estimated size"
    : tool.slug === "compress-pdf" && hasRequiredInput && activeCompressionEstimate.state === "ready" && activeCompressionEstimate.status !== "reduced"
      ? "No size reduction"
    : tool.slug === "split-pdf" && splitPlan?.valid
    ? splitPlan.groups.length === 1
      ? "Create 1 PDF"
      : `Create ${splitPlan.groups.length.toLocaleString()} PDFs`
    : tool.slug === "remove-pdf-pages" && removePlan?.valid
      ? `Remove ${removePlan.selection.length.toLocaleString()} ${removePlan.selection.length === 1 ? "page" : "pages"}`
    : tool.slug === "extract-pdf-pages" && extractPlan?.valid
      ? settings.combine === false
        ? `Create ZIP · ${extractPlan.outputCount.toLocaleString()} ${extractPlan.outputCount === 1 ? "PDF" : "PDFs"}`
        : `Create 1 PDF · ${extractPlan.selection.length.toLocaleString()} ${extractPlan.selection.length === 1 ? "page" : "pages"}`
    : tool.slug === "convert-image" && imageEncoderSupport.state === "checking"
      ? "Checking browser support"
    : tool.slug === "convert-image"
      ? `Convert to ${String(settings.format || "webp").toUpperCase()}`
    : tool.name;

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    clearResults();
    setStatus("idle");
    setProcessError("");
  };

  return (
    <>
    <dialog ref={dialogRef} className={`workbench-dialog ${tool.slug === "split-pdf" ? "split-pdf-workbench" : ["remove-pdf-pages", "extract-pdf-pages"].includes(tool.slug) ? "remove-pages-workbench" : ""}`} onCancel={(event) => { event.preventDefault(); closeWorkbench(); }} aria-labelledby="workbench-title" aria-describedby="workbench-description">
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

        <div className={`workbench-body ${usesPagePicker ? "page-picker-body" : ""} ${tool.slug === "split-pdf" ? "split-planner-body" : tool.slug === "remove-pdf-pages" ? "remove-pages-planner-body" : tool.slug === "extract-pdf-pages" ? "extract-pages-planner-body" : ""}`}>
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
            <details id={limitsId} className="limits-note">
              <summary>
                <GaugeIcon size={17} aria-hidden="true" />
                <span><strong>Local safeguards</strong><span id={limitsPrimaryId}>{limitCopy.primary}</span></span>
                <span className="limits-disclosure" aria-hidden="true">Details <CaretRightIcon size={13} /></span>
              </summary>
              <div className="limits-details"><strong>Additional safeguards</strong><span>{limitCopy.secondary}</span></div>
            </details>
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

            {!results.length && (
              <PdfPasswordGate
                entry={passwordGate.active}
                password={passwordGate.password}
                onPasswordChange={passwordGate.setPassword}
                onVerify={passwordGate.verify}
                verifying={passwordGate.verifying}
                outputProtection={passwordGate.outputProtection}
              />
            )}

            {!results.length && !passwordGate.active && (
              <PdfOutputProtectionControl control={passwordGate.outputProtection} compact />
            )}

            {results.length > 0 && tool.slug === "ocr-pdf" && (
              <OcrReaderResult result={results[0]} headingRef={resultHeadingRef} onReset={() => { passwordGate.resetForFileChange(); clearResults(); setFiles([]); setStatus("idle"); setProcessError(""); setFileIssue(null); setQueueAnnouncement(null); }} />
            )}

            {results.length > 0 && ["translate-pdf", "pdf-to-markdown"].includes(tool.slug) && (
              <TextReaderResult tool={tool} result={results[0]} limits={limits} headingRef={resultHeadingRef} onReset={() => { passwordGate.resetForFileChange(); clearResults(); setFiles([]); setStatus("idle"); setProcessError(""); setFileIssue(null); setQueueAnnouncement(null); }} />
            )}

            {results.length > 0 && !inlineReaderTools.has(tool.slug) && (
              <div className="results-card">
                <div className="result-celebration"><span><CheckCircleIcon size={24} weight="fill" /></span><div><h3 ref={resultHeadingRef} tabIndex="-1">{results[0]?.compressionOutcome === "original-kept" ? "Your original is already smaller" : results[0]?.compressionOutcome === "protected-original" ? "Protected original is ready" : "Your result is ready"}</h3><p>{results[0]?.compressionOutcome === "original-kept" ? "No new file was created; the larger trial result was discarded locally." : results[0]?.compressionOutcome === "protected-original" ? "Compression was skipped, then fresh password protection was applied locally." : "Created locally. Download it before closing this tab."}</p></div></div>
                {tool.slug === "compress-pdf" && files[0] && results[0] && (
                  <CompressionResultSummary inputSize={files[0].size} result={results[0]} />
                )}
                {results.filter((result) => !result.noNewFile).map((result) => (
                  <div className="result-row" key={result.id}>
                    <span className="result-icon"><DownloadSimpleIcon size={19} /></span>
                    <span><strong>{result.name}</strong><small>{formatBytes(result.size)} · {result.details}</small></span>
                    <span className="result-actions">
                      {isPdfPreviewResult(result) && (
                        <button onClick={(event) => openResultPreview(result, event.currentTarget)} aria-label={`Preview ${result.name}`}><EyeIcon size={16} aria-hidden="true" />Preview</button>
                      )}
                      <button onClick={() => downloadResult(result)} aria-label={`Download ${result.name}`}>Download</button>
                    </span>
                  </div>
                ))}
                <button className="start-another" onClick={() => { passwordGate.resetForFileChange(); clearResults(); setFiles([]); setStatus("idle"); setProcessError(""); setFileIssue(null); setQueueAnnouncement(null); }}>Start another</button>
              </div>
            )}
          </section>

          <aside className={`settings-panel ${usesPagePicker ? "page-picker-settings-panel" : ""}`} aria-label="Tool settings">
            <div className="settings-scroll">
            <div className="settings-heading"><span><SlidersHorizontalIcon size={19} /></span><div><h3>Settings</h3><p>Fine-tune the local output.</p></div></div>
            {tool.slug === "split-pdf" ? (
              <SplitPdfControls settings={settings} onChange={updateSetting} info={splitInfo} plan={splitPlan} limits={limits} />
            ) : tool.slug === "remove-pdf-pages" ? (
              <RemovePdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={removePlan} />
            ) : tool.slug === "extract-pdf-pages" ? (
              <ExtractPdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={extractPlan} limits={limits} />
            ) : tool.slug === "compress-pdf" ? (
              <CompressionControls setting={settingsList.find((setting) => setting.key === "quality")} value={settings.quality} onChange={(value) => updateSetting("quality", value)} inputSize={files[0]?.size || 0} estimate={activeCompressionEstimate} />
            ) : tool.slug === "convert-image" ? (
              <ImageFormatControls settings={settings} onChange={updateSetting} support={imageEncoderSupport} />
            ) : settingsList.length ? settingsList.map((setting) => (
              <SettingControl key={setting.key} setting={setting} value={settings[setting.key]} onChange={(value) => updateSetting(setting.key, value)} />
            )) : <div className="no-settings"><CheckCircleIcon size={20} /><span><strong>Nothing to configure</strong>This tool uses sensible local defaults.</span></div>}

            {tool.maturity === "beta" && (
              <div className="beta-note"><SparkleIcon size={18} /><span><strong>Local beta</strong>Complex layouts, rare formats, and very large files may vary by browser.</span></div>
            )}

            <div className="output-summary">
              <span>Output</span>
              <strong>{tool.slug === "convert-image" ? `.${String(settings.format || "webp").toUpperCase()}` : tool.output.join(" · ").toUpperCase()}</strong>
            </div>
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
              {tool.slug === "split-pdf" && splitPlan?.valid && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{splitPlan.groups.length.toLocaleString()} {splitPlan.groups.length === 1 ? "PDF" : "PDFs"} ready</strong>
              )}
              {tool.slug === "extract-pdf-pages" && extractPlan?.valid && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{settings.combine === false ? `${extractPlan.outputCount.toLocaleString()} ${extractPlan.outputCount === 1 ? "PDF" : "PDFs"} in ZIP` : "1 PDF"} ready</strong>
              )}
              {!(inlineReaderTools.has(tool.slug) && results.length) && (
                <button className="process-button" onClick={process} aria-disabled={!canRun} aria-describedby={showProcessHint ? processHintId : undefined}>
                  {status === "processing" ? <><SpinnerGapIcon size={19} className="spin" />Processing locally</> : <><LightningIcon size={19} weight="fill" />{processButtonLabel}</>}
                </button>
              )}
              {showProcessHint && <small id={processHintId} className="button-hint">{processHint}</small>}
            </div>
          </aside>
        </div>
      </div>
    </dialog>
    {previewResult && (
      <PdfPreviewDialog
        result={previewResult}
        limits={PDF_PREVIEW_LIMITS}
        onClose={closeResultPreview}
      />
    )}
    </>
  );
}

function ToolWorkbench(props) {
  return props.tool.slug === "add-image-to-pdf"
    ? <PdfImageWorkbench {...props} PreviewDialog={PdfPreviewDialog} previewLimits={PDF_PREVIEW_LIMITS} />
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
            {paperTerminalPrimaryTools.map((item) => {
              const tool = tools.find((candidate) => candidate.slug === item.slug);
              return (
                <button key={item.slug} onClick={() => onOpen(tool)} aria-label={`Open ${tool.name}`}>
                  <span className="popular-tool-icon"><PopularToolIcon tool={tool} /></span>
                  <span className="popular-tool-copy"><strong>{tool.name}</strong><small>{item.description}</small></span>
                  <CaretRightIcon size={19} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <aside className="more-tools-panel" aria-label="More tools">
            <div className="more-tools-heading"><strong>More tools</strong><span aria-hidden="true" /></div>
            {paperTerminalMoreTools.map((slug) => {
              const tool = tools.find((candidate) => candidate.slug === slug);
              return <button key={slug} onClick={() => onOpen(tool)}><span>{tool.name}</span><CaretRightIcon size={16} /></button>;
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
        <div className="terminal-tip-actions"><span>Search</span><button onClick={onSearch}><kbd>⌘ K</kbd></button><i aria-hidden="true" /><span>Help</span><button onClick={onHelp} aria-label="Open privacy help">?</button></div>
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
  const [selectedTool, setSelectedTool] = useState(toolFromLocation);

  useEffect(() => {
    const handleKey = (event) => {
      if (isToolSearchShortcut(event)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const locatedTool = toolFromLocation();
    const pathSlug = window.location.pathname.match(/^\/tools\/([^/]+)\/?$/)?.[1];
    if (locatedTool && (window.location.hash.startsWith("#tool/") || TOOL_SLUG_ALIASES[pathSlug])) {
      window.history.replaceState(null, "", toolPath(locatedTool));
    }
  }, []);

  useEffect(() => {
    updatePageMetadata(selectedTool);
  }, [selectedTool]);

  useEffect(() => {
    const handleHistory = () => setSelectedTool(toolFromLocation());
    window.addEventListener("popstate", handleHistory);
    return () => window.removeEventListener("popstate", handleHistory);
  }, []);

  const openTool = (tool) => {
    toolOpenerRef.current = document.activeElement;
    setSelectedTool(tool);
    window.history.pushState(null, "", toolPath(tool));
  };

  const closeTool = () => {
    setSelectedTool(null);
    window.history.replaceState(null, "", HOME_METADATA.path);
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
  const heroSearchResults = useMemo(() => rankToolSearchResults(filtered, query), [filtered, query]);

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
          <Hero query={query} setQuery={setQuery} searchRef={searchRef} onQuickTool={openTool} searchResults={heroSearchResults} resultCount={filtered.length} onViewAll={() => document.getElementById("tool-library")?.scrollIntoView({ block: "start", behavior: "smooth" })} />
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
        <div className="shell footer-inner"><div className="brand footer-brand"><BrandMark /><span>Local File <strong>Studio</strong></span></div><p>Private PDF and image tools, built to stay on your device.</p></div>
      </footer>

      {selectedTool && <ToolWorkbench key={selectedTool.slug} tool={selectedTool} onClose={closeTool} onComplete={recordComplete} />}
    </>
  );
}
