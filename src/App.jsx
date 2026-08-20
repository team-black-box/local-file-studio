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
  CheckerboardIcon,
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
  MagicWandIcon,
  MarkdownLogoIcon,
  PaletteIcon,
  PaintBucketIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
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
  TimerIcon,
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
import { PDF_TO_JPG_RENDER_SCALE, assertPdfPreviewResult, buildOcrCopyText, compressionEstimateAllowsProcessing, createExtractPagePlan, createOrganizePagePlan, createPdfJpgOutputPlan, createSplitPdfGroups, downloadResult, formatBytes, formatPageSelection, getAutomaticDownloadResult, getCompressionSizeChange, getPdfCompressionPreset, isPdfPreviewResult, isToolSearchShortcut, parseMarkdownPreview, parseSplitPageSelection, projectPdfCompressionSize } from "./lib/file-utils.js";
import { IMAGE_CROP_SCALE_MAX_PERCENT, IMAGE_CROP_SCALE_MIN_PERCENT, IMAGE_UPSCALE_SCALES, MAX_PDF_PASSWORD_CHARACTERS, PDF_PREVIEW_LIMITS, PHOTO_EDITOR_ADJUSTMENTS, PHOTO_EDITOR_TEXT_COLORS, assertRasterDimensions, describeToolLimits, getAnimatedGifPlan, getImageCropPlan, getImageUpscalePlan, getPhotoEditorPlan, getProportionalResizeDimensions, getTextSettingLimit, getToolLimits, summarizeRejections, validateFileSelection } from "./lib/file-limits.js";
import { BACKGROUND_REMOVAL_BACKGROUNDS, BACKGROUND_REMOVAL_PROFILES, getBackgroundRemovalBackground, getBackgroundRemovalProfile } from "./lib/background-removal.js";
import { preflightToolFiles, toFriendlyResourceError } from "./lib/file-preflight.js";
import { destroyPdfJsDocument, getPdfJsEngine } from "./lib/pdfjs-utils.js";
import { createPdfFormPlan, inspectPdfForm, parsePdfFormValues } from "./lib/pdf-form-fields.js";
import { COMPARISON_ROWS_PER_PAGE } from "./lib/pdf-comparison.js";
import { MIN_REDACTION_REGION_PERCENT, clampRedactionRegion, createRedactionPlan, parseRedactionRegions, serializeRedactionRegions } from "./lib/pdf-redactions.js";
import { HOME_METADATA, SOCIAL_IMAGE_PATH, SITE_ORIGIN, createHomeStructuredData, createToolStructuredData, getPageMetadata, toolPath } from "./lib/site-metadata.js";
import { runTool } from "./lib/processors.js";
import { clearSensitiveToolSettings } from "./lib/tool-settings.js";
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
const inlineReaderTools = new Set(["ocr-pdf", "summarize-pdf", "translate-pdf", "pdf-to-markdown", "compare-pdf"]);
const pdfSettingPreviewTools = new Set(["rotate-pdf", "add-pdf-page-numbers", "watermark-pdf", "crop-pdf", "edit-pdf", "sign-pdf"]);
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
  "html-to-pdf": [
    { key: "html", type: "textarea", label: "Or paste HTML", default: "", placeholder: "<h1>Local document</h1>" },
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
        {setting.hint && <small className="field-description">{setting.hint}</small>}
        <input id={id} type="range" min={setting.min} max={setting.max} step={setting.step || 1} value={value} onChange={(event) => onChange(event.target.value)} />
        {(setting.minLabel || setting.maxLabel) && <span className="range-scale" aria-hidden="true"><small>{setting.minLabel || setting.min}</small><small>{setting.maxLabel || setting.max}</small></span>}
      </label>
    );
  }

  if (setting.type === "select") {
    return (
      <fieldset className={`visual-choice-setting ${setting.compactChoices ? "compact" : ""} columns-${setting.choiceColumns || 2}`}>
        <legend>{setting.label}</legend>
        {setting.hint && <p>{setting.hint}</p>}
        <div className="visual-choice-grid">
          {setting.options.map((option) => {
            const selected = String(option.value) === String(value);
            return (
              <button key={String(option.value)} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange(option.value)}>
                <strong>{option.label}</strong>
                {option.hint && <small>{option.hint}</small>}
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (setting.type === "number") {
    const numericValue = Number(value);
    const current = Number.isFinite(numericValue) ? numericValue : Number(setting.default || setting.min || 0);
    const step = Number(setting.step || 1);
    const clamp = (next) => Math.min(setting.max ?? Number.POSITIVE_INFINITY, Math.max(setting.min ?? Number.NEGATIVE_INFINITY, next));
    const changeBy = (direction) => onChange(clamp(current + (step * direction)));
    return (
      <div className="setting-field number-setting">
        <label htmlFor={id}><strong>{setting.label}</strong></label>
        {setting.hint && <small id={`${id}-description`} className="field-description">{setting.hint}</small>}
        {setting.presets?.length > 0 && (
          <div className="number-presets" aria-label={`${setting.label} presets`}>
            {setting.presets.map((preset) => {
              const selected = Number(preset.value) === current;
              return <button key={preset.value} type="button" aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => onChange(preset.value)}><strong>{preset.label}</strong>{preset.value !== Number(preset.label) && <small>{preset.value}{setting.suffix || ""}</small>}</button>;
            })}
          </div>
        )}
        <div className="number-stepper">
          <button type="button" onClick={() => changeBy(-1)} disabled={setting.min != null && current <= setting.min} aria-label={`Decrease ${setting.label}`}>−</button>
          <div className={setting.suffix ? "input-with-suffix" : ""}>
            <input id={id} type="number" inputMode="numeric" required={setting.required} min={setting.min} max={setting.max} step={step} aria-describedby={setting.hint ? `${id}-description` : undefined} value={value} onChange={(event) => onChange(event.target.value)} />
            {setting.suffix && <span>{setting.suffix}</span>}
          </div>
          <button type="button" onClick={() => changeBy(1)} disabled={setting.max != null && current >= setting.max} aria-label={`Increase ${setting.label}`}>+</button>
        </div>
      </div>
    );
  }

  const inputType = ["password", "color"].includes(setting.type) ? setting.type : "text";
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

function usePdfOfficeTextPreview(file, password, enabled, limits, format) {
  const [preview, setPreview] = useState({ state: "idle", file: null, pages: [], pageStats: [], message: "" });

  useEffect(() => {
    if (!file) {
      setPreview({ state: "idle", file: null, pages: [], pageStats: [], message: "" });
      return undefined;
    }
    if (!enabled) return undefined;

    let cancelled = false;
    const controller = new AbortController();
    setPreview({ state: "loading", file, pages: [], pageStats: [], message: "Reading selectable text locally…" });
    (async () => {
      const { inspectPdfOfficeText } = await import("./lib/pdf-processors.js");
      const inspected = await inspectPdfOfficeText(
        file,
        password,
        limits,
        (progress) => {
          if (!cancelled) setPreview((current) => ({ ...current, message: progress.phase }));
        },
        controller.signal,
        format,
      );
      if (!cancelled) setPreview({ state: "ready", file, message: "", ...inspected });
    })().catch((error) => {
      if (cancelled || error?.name === "AbortError") return;
      const friendly = toFriendlyResourceError(error, "PDF to Word");
      setPreview({ state: "error", file, pages: [], pageStats: [], message: friendly?.message || "The selectable PDF text could not be inspected." });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, file, format, limits, password]);

  return preview;
}

function useWordDocumentPreview(file, enabled, tool, limits) {
  const [preview, setPreview] = useState({ state: "idle", file: null, message: "" });

  useEffect(() => {
    if (!enabled || !file) {
      setPreview({ state: "idle", file: null, message: "" });
      return undefined;
    }

    let cancelled = false;
    setPreview({ state: "loading", file, message: "Reading the document locally…" });
    (async () => {
      const docxPromise = import("./lib/docx-text.js");
      await preflightToolFiles(tool, [file], {});
      const docx = await docxPromise;
      const text = await docx.extractDocxText(file, limits);
      if (!cancelled) setPreview({ state: "ready", file, message: "", ...docx.createDocxTextPreview(text) });
    })().catch((error) => {
      if (cancelled) return;
      const friendly = toFriendlyResourceError(error, tool.name);
      if (!cancelled) setPreview({ state: "error", file, message: friendly?.message || "The readable text could not be inspected." });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, limits, tool]);

  return preview;
}

function usePowerPointDocumentPreview(file, enabled, tool, limits) {
  const [preview, setPreview] = useState({ state: "idle", file: null, message: "" });

  useEffect(() => {
    if (!enabled || !file) {
      setPreview({ state: "idle", file: null, message: "" });
      return undefined;
    }

    let cancelled = false;
    setPreview({ state: "loading", file, message: "Reading the slides locally…" });
    (async () => {
      const pptxPromise = import("./lib/pptx-text.js");
      await preflightToolFiles(tool, [file], {});
      const pptx = await pptxPromise;
      const extraction = await pptx.extractPptxText(file, limits);
      if (!cancelled) setPreview({ state: "ready", file, message: "", ...pptx.createPptxTextPreview(extraction) });
    })().catch((error) => {
      if (cancelled) return;
      const friendly = toFriendlyResourceError(error, tool.name);
      if (!cancelled) setPreview({ state: "error", file, message: friendly?.message || "The slide text could not be inspected." });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, limits, tool]);

  return preview;
}

function useSpreadsheetDocumentPreview(file, enabled, tool, limits, orientation) {
  const [inspection, setInspection] = useState({ state: "idle", file: null, message: "", extraction: null, preview: null });
  const [layout, setLayout] = useState({ state: "idle", file: null, orientation: "", pageCount: 0, message: "" });

  useEffect(() => {
    if (!enabled || !file) {
      setInspection({ state: "idle", file: null, message: "", extraction: null, preview: null });
      setLayout({ state: "idle", file: null, orientation: "", pageCount: 0, message: "" });
      return undefined;
    }

    let cancelled = false;
    setInspection({ state: "loading", file, message: "Reading the workbook locally…", extraction: null, preview: null });
    setLayout({ state: "idle", file, orientation: "", pageCount: 0, message: "" });
    (async () => {
      const spreadsheetPromise = import("./lib/spreadsheet-text.js");
      await preflightToolFiles(tool, [file], {});
      const spreadsheet = await spreadsheetPromise;
      const extraction = await spreadsheet.extractSpreadsheetText(file, limits);
      if (!cancelled) {
        setInspection({
          state: "ready",
          file,
          message: "",
          extraction,
          preview: spreadsheet.createSpreadsheetTextPreview(extraction),
        });
      }
    })().catch((error) => {
      if (cancelled) return;
      const friendly = toFriendlyResourceError(error, tool.name);
      setInspection({ state: "error", file, message: friendly?.message || "The workbook could not be inspected.", extraction: null, preview: null });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, limits, tool]);

  useEffect(() => {
    if (!enabled || !file || inspection.state !== "ready" || inspection.file !== file || !inspection.extraction) return undefined;
    const normalizedOrientation = orientation === "portrait" ? "portrait" : "landscape";
    let cancelled = false;
    setLayout({ state: "loading", file, orientation: normalizedOrientation, pageCount: 0, message: "Calculating PDF pages…" });
    (async () => {
      const [{ textToPdfDocument }, spreadsheet] = await Promise.all([
        import("./lib/pdf-processors.js"),
        import("./lib/spreadsheet-text.js"),
      ]);
      const pdf = await textToPdfDocument(inspection.extraction.text, file.name, { orientation: normalizedOrientation }, "excel-to-pdf");
      const pageCount = pdf.getNumberOfPages();
      if (!cancelled) {
        setLayout({
          state: "ready",
          file,
          orientation: normalizedOrientation,
          pageCount,
          message: "",
          preview: spreadsheet.createSpreadsheetTextPreview(inspection.extraction, { pageCount, orientation: normalizedOrientation }),
        });
      }
    })().catch((error) => {
      if (cancelled) return;
      const friendly = toFriendlyResourceError(error, tool.name);
      setLayout({ state: "error", file, orientation: normalizedOrientation, pageCount: 0, message: friendly?.message || "The PDF page layout could not be calculated." });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, inspection.extraction, inspection.file, inspection.state, orientation, tool.name]);

  if (!enabled || !file) return { state: "idle", file: null, message: "" };
  if (inspection.state !== "ready") return inspection;
  if (layout.state === "error") return { ...inspection.preview, state: "error", file, message: layout.message };
  if (layout.state !== "ready" || layout.file !== file || layout.orientation !== (orientation === "portrait" ? "portrait" : "landscape")) {
    return { ...inspection.preview, state: "layout-loading", file, message: "Calculating the PDF page count locally…" };
  }
  return { ...layout.preview, state: "ready", file, message: "" };
}

function useHtmlDocumentPreview(file, markup, enabled, tool, limits, pageSize) {
  const [inspection, setInspection] = useState({ state: "idle", file: null, markup: "", message: "", extraction: null, preview: null });
  const [layout, setLayout] = useState({ state: "idle", file: null, markup: "", pageSize: "", pageCount: 0, message: "" });

  useEffect(() => {
    const activeMarkup = file ? "" : String(markup || "");
    if (!enabled || (!file && !activeMarkup.trim())) {
      setInspection({ state: "idle", file: null, markup: "", message: "", extraction: null, preview: null });
      setLayout({ state: "idle", file: null, markup: "", pageSize: "", pageCount: 0, message: "" });
      return undefined;
    }

    let cancelled = false;
    let timer;
    setInspection({ state: "loading", file, markup: activeMarkup, message: file ? "Reading the HTML file locally…" : "Checking the pasted HTML locally…", extraction: null, preview: null });
    setLayout({ state: "idle", file, markup: activeMarkup, pageSize: "", pageCount: 0, message: "" });
    timer = window.setTimeout(() => {
      (async () => {
        const htmlTextPromise = import("./lib/html-text.js");
        if (file) await preflightToolFiles(tool, [file], {});
        const source = file ? await file.text() : activeMarkup;
        const htmlText = await htmlTextPromise;
        const extraction = htmlText.extractHtmlText(source, limits, file?.name || "Pasted HTML");
        if (!cancelled) {
          setInspection({
            state: "ready",
            file,
            markup: activeMarkup,
            message: "",
            extraction,
            preview: htmlText.createHtmlTextPreview(extraction),
          });
        }
      })().catch((error) => {
        if (cancelled) return;
        const friendly = toFriendlyResourceError(error, tool.name);
        setInspection({ state: "error", file, markup: activeMarkup, message: friendly?.message || "The readable HTML text could not be inspected.", extraction: null, preview: null });
      });
    }, file ? 0 : 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, file, limits, markup, tool]);

  useEffect(() => {
    const activeMarkup = file ? "" : String(markup || "");
    if (!enabled
      || inspection.state !== "ready"
      || inspection.file !== file
      || inspection.markup !== activeMarkup
      || !inspection.extraction) return undefined;

    const normalizedPageSize = pageSize === "letter" ? "letter" : "a4";
    let cancelled = false;
    setLayout({ state: "loading", file, markup: activeMarkup, pageSize: normalizedPageSize, pageCount: 0, message: "Calculating PDF pages…" });
    (async () => {
      const [{ textToPdfDocument }, htmlText] = await Promise.all([
        import("./lib/pdf-processors.js"),
        import("./lib/html-text.js"),
      ]);
      const pdf = await textToPdfDocument(inspection.extraction.text, file?.name || "local-html", { pageSize: normalizedPageSize }, "html-to-pdf");
      const pageCount = pdf.getNumberOfPages();
      if (!cancelled) {
        setLayout({
          state: "ready",
          file,
          markup: activeMarkup,
          pageSize: normalizedPageSize,
          pageCount,
          message: "",
          preview: htmlText.createHtmlTextPreview(inspection.extraction, { pageCount, pageSize: normalizedPageSize }),
        });
      }
    })().catch((error) => {
      if (cancelled) return;
      const friendly = toFriendlyResourceError(error, tool.name);
      setLayout({ state: "error", file, markup: activeMarkup, pageSize: normalizedPageSize, pageCount: 0, message: friendly?.message || "The PDF page layout could not be calculated." });
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, inspection.extraction, inspection.file, inspection.markup, inspection.state, markup, pageSize, tool.name]);

  const activeMarkup = file ? "" : String(markup || "");
  if (!enabled || (!file && !activeMarkup.trim())) return { state: "idle", file: null, markup: "", message: "" };
  if (inspection.file !== file || inspection.markup !== activeMarkup) {
    return { state: "loading", file, markup: activeMarkup, message: file ? "Reading the HTML file locally…" : "Checking the pasted HTML locally…" };
  }
  if (inspection.state !== "ready") return inspection;
  if (layout.state === "error") return { ...inspection.preview, state: "error", file, markup: activeMarkup, message: layout.message };
  const normalizedPageSize = pageSize === "letter" ? "letter" : "a4";
  if (layout.state !== "ready"
    || layout.file !== file
    || layout.markup !== activeMarkup
    || layout.pageSize !== normalizedPageSize) {
    return { ...inspection.preview, state: "layout-loading", file, markup: activeMarkup, message: "Calculating the PDF page count locally…" };
  }
  return { ...layout.preview, state: "ready", file, markup: activeMarkup, message: "" };
}

function usePdfFormInfo(file, enabled, limits) {
  const [info, setInfo] = useState({ state: "idle", fieldCount: 0, fields: [], message: "" });

  useEffect(() => {
    if (!enabled || !file) {
      setInfo({ state: "idle", fieldCount: 0, fields: [], message: "" });
      return undefined;
    }

    let cancelled = false;
    setInfo({ state: "loading", fieldCount: 0, fields: [], message: "Reading form fields locally…" });
    inspectPdfForm(file, limits, file.name)
      .then((result) => {
        if (!cancelled) {
          setInfo({
            state: "ready",
            fieldCount: result.fieldCount,
            fields: result.fields,
            message: `${result.fieldCount.toLocaleString()} ${result.fieldCount === 1 ? "field" : "fields"} found locally`,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) setInfo({ state: "error", fieldCount: 0, fields: [], message: error?.message || "The form fields could not be read." });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, file, limits]);

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

function getOrganizePlan(settings, info, limits) {
  if (info.state === "idle") return { valid: false, order: [], message: "Add one PDF to arrange its pages." };
  if (info.state === "loading") return { valid: false, order: [], message: "Reading the page count locally…" };
  if (info.state === "error") return { valid: false, order: [], message: info.message };
  try {
    return { valid: true, ...createOrganizePagePlan(settings.order, info.pageCount, limits), message: "" };
  } catch (error) {
    return { valid: false, order: [], message: error?.message || "Choose a valid page order." };
  }
}

function getRedactionPlan(settings, info, limits) {
  if (info.state === "idle") return { valid: false, regions: [], regionCount: 0, affectedPages: [], affectedPageCount: 0, message: "Add one PDF to choose redaction areas." };
  if (info.state === "loading") return { valid: false, regions: [], regionCount: 0, affectedPages: [], affectedPageCount: 0, message: "Reading the PDF pages locally…" };
  if (info.state === "error") return { valid: false, regions: [], regionCount: 0, affectedPages: [], affectedPageCount: 0, message: info.message };
  try {
    const regions = parseRedactionRegions(settings.regions, info.pageCount, limits);
    if (!regions.length) {
      return { valid: false, regions, regionCount: 0, affectedPages: [], affectedPageCount: 0, message: "Draw or add at least one area to redact." };
    }
    return { valid: true, ...createRedactionPlan(regions, info.pageCount, limits), message: "" };
  } catch (error) {
    return { valid: false, regions: [], regionCount: 0, affectedPages: [], affectedPageCount: 0, message: error?.message || "Choose valid redaction areas." };
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

const PDF_JPG_PAGE_WINDOW = 6;

function usePdfJpgPageSample(pdfDocument, pageIndex, quality, enabled, limits) {
  const [sample, setSample] = useState({ state: "idle", url: "", pageIndex: 0, quality: 0, size: 0, width: 0, height: 0, message: "" });

  useEffect(() => {
    if (!enabled || !pdfDocument || !Number.isInteger(pageIndex) || pageIndex < 0) {
      setSample({ state: "idle", url: "", pageIndex: 0, quality: 0, size: 0, width: 0, height: 0, message: "" });
      return undefined;
    }

    let cancelled = false;
    let page;
    let renderTask;
    let canvas;
    let sampleUrl = "";
    const normalizedQuality = Math.max(40, Math.min(100, Number(quality || 88)));
    setSample({ state: "loading", url: "", pageIndex, quality: normalizedQuality, size: 0, width: 0, height: 0, message: "Encoding this page as a JPG locally…" });

    const timer = window.setTimeout(() => {
      (async () => {
        page = await pdfDocument.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: PDF_TO_JPG_RENDER_SCALE });
        assertRasterDimensions(viewport.width, viewport.height, limits, `PDF page ${pageIndex + 1} preview`);
        canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((value) => value ? resolve(value) : reject(new Error("This page could not be encoded as a JPG preview.")), "image/jpeg", normalizedQuality / 100);
        });
        if (cancelled) return;
        sampleUrl = URL.createObjectURL(blob);
        setSample({
          state: "ready",
          url: sampleUrl,
          pageIndex,
          quality: normalizedQuality,
          size: blob.size,
          width: canvas.width,
          height: canvas.height,
          message: "",
        });
      })().catch((error) => {
        if (cancelled || error?.name === "RenderingCancelledException") return;
        setSample({ state: "error", url: "", pageIndex, quality: normalizedQuality, size: 0, width: 0, height: 0, message: error?.message || "This page preview could not be rendered." });
      }).finally(() => {
        const finishedCanvas = canvas;
        canvas = undefined;
        if (finishedCanvas) {
          finishedCanvas.width = 1;
          finishedCanvas.height = 1;
        }
        const finishedPage = page;
        page = undefined;
        finishedPage?.cleanup();
      });
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try { renderTask?.cancel(); } catch { /* Rendering already completed. */ }
      const activePage = page;
      page = undefined;
      activePage?.cleanup();
      const activeCanvas = canvas;
      canvas = undefined;
      if (activeCanvas) {
        activeCanvas.width = 1;
        activeCanvas.height = 1;
      }
      if (sampleUrl) URL.revokeObjectURL(sampleUrl);
    };
  }, [enabled, limits, pageIndex, pdfDocument, quality]);

  return sample;
}

function PdfJpgControls({ setting, value, onChange, info, limits }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const ready = info.state === "ready" && info.document && info.pageCount > 0;
  const plan = useMemo(() => {
    if (!ready) return null;
    try {
      return createPdfJpgOutputPlan(info.pageCount, limits.maxGeneratedItems);
    } catch {
      return null;
    }
  }, [info.pageCount, limits.maxGeneratedItems, ready]);
  const sample = usePdfJpgPageSample(info.document, pageIndex, value, ready, limits);

  useEffect(() => {
    setPageIndex(0);
    setPageWindowStart(0);
  }, [info.document]);

  useEffect(() => {
    if (!ready || pageIndex < info.pageCount) return;
    setPageIndex(Math.max(0, info.pageCount - 1));
  }, [info.pageCount, pageIndex, ready]);

  const maxWindowStart = ready ? Math.max(0, info.pageCount - PDF_JPG_PAGE_WINDOW) : 0;
  const visiblePages = ready
    ? Array.from({ length: Math.min(PDF_JPG_PAGE_WINDOW, info.pageCount - pageWindowStart) }, (_, offset) => pageWindowStart + offset)
    : [];
  const windowLabel = ready
    ? `${pageWindowStart + 1}–${Math.min(pageWindowStart + PDF_JPG_PAGE_WINDOW, info.pageCount)} of ${info.pageCount}`
    : "";

  const showWindow = (requestedStart) => {
    const nextStart = Math.max(0, Math.min(maxWindowStart, requestedStart));
    setPageWindowStart(nextStart);
    if (pageIndex < nextStart || pageIndex >= nextStart + PDF_JPG_PAGE_WINDOW) setPageIndex(nextStart);
  };

  const movePageRail = (event) => {
    if (!ready) return;
    const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(distance) < 8) return;
    const direction = distance > 0 ? 1 : -1;
    const nextStart = pageWindowStart + direction;
    if (nextStart < 0 || nextStart > maxWindowStart) return;
    event.preventDefault();
    showWindow(nextStart);
  };

  return (
    <section className="pdf-jpg-controls" aria-labelledby="pdf-jpg-preview-title">
      <SettingControl setting={setting} value={value} onChange={onChange} />

      {!ready ? <PdfPageSourceStatus info={info} /> : (
        <>
          <div className="pdf-jpg-output-plan" role="status" aria-live="polite">
            <span><ImagesIcon size={19} weight="duotone" aria-hidden="true" /></span>
            <span><strong>{plan?.outputLabel}</strong><small>One export-size JPG for every PDF page.</small></span>
            <b>{plan?.archive ? "ZIP" : "JPG"}</b>
          </div>

          <div className="pdf-jpg-sample">
            <div className="pdf-jpg-sample-heading">
              <span><strong id="pdf-jpg-preview-title">Page {pageIndex + 1} quality preview</strong><small>Actual local JPG encoding at {Number(value).toLocaleString()}% quality</small></span>
              <EyeIcon size={17} aria-hidden="true" />
            </div>
            <div className={`pdf-jpg-sample-stage ${sample.state}`} aria-live="polite">
              {sample.state === "ready" && <img src={sample.url} alt={`JPG preview of PDF page ${pageIndex + 1} at ${Number(value).toLocaleString()} percent quality`} />}
              {sample.state === "loading" && <span><SpinnerGapIcon size={22} className="spin" aria-hidden="true" />Encoding page {pageIndex + 1}…</span>}
              {sample.state === "error" && <span><WarningCircleIcon size={22} aria-hidden="true" />{sample.message}</span>}
            </div>
            {sample.state === "ready" && (
              <p><strong>{sample.width.toLocaleString()} × {sample.height.toLocaleString()} px</strong><span>{formatBytes(sample.size)} for this page</span></p>
            )}
          </div>

          {info.pageCount > 1 && (
            <>
              <div className="pdf-jpg-page-heading">
                <span><strong>Choose a sample page</strong><small>Scroll sideways with a trackpad or use the arrows.</small></span>
                {info.pageCount > PDF_JPG_PAGE_WINDOW && (
                  <span>
                    <button type="button" onClick={() => showWindow(pageWindowStart - PDF_JPG_PAGE_WINDOW)} disabled={pageWindowStart === 0} aria-label="Show previous PDF pages"><ArrowLeftIcon size={14} /></button>
                    <b aria-live="polite">{windowLabel}</b>
                    <button type="button" onClick={() => showWindow(pageWindowStart + PDF_JPG_PAGE_WINDOW)} disabled={pageWindowStart >= maxWindowStart} aria-label="Show next PDF pages"><ArrowRightIcon size={14} /></button>
                  </span>
                )}
              </div>
              <div className="pdf-jpg-page-strip" role="group" aria-label={`Choose one of ${info.pageCount.toLocaleString()} PDF pages for the JPG quality preview`} onWheel={movePageRail}>
                {visiblePages.map((index) => (
                  <button type="button" key={index} className={index === pageIndex ? "selected" : ""} aria-pressed={index === pageIndex} onClick={() => setPageIndex(index)} aria-label={`Preview page ${index + 1} as a JPG`}>
                    <PdfPageThumbnail document={info.document} pageIndex={index} />
                    <small>Page {index + 1}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="pdf-jpg-estimate-note"><GaugeIcon size={15} aria-hidden="true" /><span>{plan?.archive
            ? "The sample size is exact for this page. Total ZIP size depends on every page, so it is calculated only after conversion."
            : "This sample size is the exact JPG output size at the selected quality."
          }</span></p>
        </>
      )}
    </section>
  );
}

const PDF_OFFICE_PAGE_WINDOW = 6;

function PdfOfficeTextControls({ file, preview, format }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const isPresentation = format === "pptx";
  const isSpreadsheet = format === "xlsx";
  const OutputIcon = isPresentation ? FilePptIcon : isSpreadsheet ? FileXlsIcon : FileDocIcon;
  const outputLabel = isPresentation ? "PPTX" : isSpreadsheet ? "XLSX" : "DOCX";
  const unit = isPresentation ? "slide" : isSpreadsheet ? "sheet" : "section";

  useEffect(() => {
    setPageIndex(0);
    setPageWindowStart(0);
  }, [file]);

  if (!file) {
    return (
      <section className="word-preview-empty pdf-office-preview-empty" aria-labelledby="pdf-office-preview-title">
        <span><OutputIcon size={21} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="pdf-office-preview-title">Preview selectable text</strong><small>Add one PDF to see the editable {outputLabel} {unit}s before export.</small></div>
      </section>
    );
  }

  if (preview.state === "loading" || preview.file !== file) {
    return (
      <section className="word-preview-loading pdf-office-preview-loading" aria-live="polite">
        <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
        <div><strong>Reading text locally</strong><small>{preview.message || "Checking each PDF page for selectable text."}</small></div>
      </section>
    );
  }

  if (preview.state === "error") {
    return (
      <section className="word-preview-error pdf-office-preview-error" role="alert">
        <WarningCircleIcon size={21} weight="fill" aria-hidden="true" />
        <div><strong>Text preview unavailable</strong><small>{preview.message}</small></div>
      </section>
    );
  }

  const pageCount = preview.pageCount || 0;
  const maxWindowStart = Math.max(0, pageCount - PDF_OFFICE_PAGE_WINDOW);
  const visiblePages = preview.pageStats.slice(pageWindowStart, pageWindowStart + PDF_OFFICE_PAGE_WINDOW);
  const selectedPage = preview.pageStats[Math.min(pageIndex, Math.max(0, pageCount - 1))];
  const selectedSheet = isSpreadsheet ? preview.spreadsheetPlan?.sheets?.[Math.min(pageIndex, Math.max(0, pageCount - 1))] : null;
  const sheetPreviewColumnCount = selectedSheet?.previewRows?.reduce((maximum, row) => Math.max(maximum, row.length), 0) || 0;
  const windowLabel = `${pageWindowStart + 1}–${Math.min(pageWindowStart + PDF_OFFICE_PAGE_WINDOW, pageCount)} of ${pageCount}`;
  const showWindow = (requestedStart) => {
    const nextStart = Math.max(0, Math.min(maxWindowStart, requestedStart));
    setPageWindowStart(nextStart);
    if (pageIndex < nextStart || pageIndex >= nextStart + PDF_OFFICE_PAGE_WINDOW) setPageIndex(nextStart);
  };
  const movePageRail = (event) => {
    const distance = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(distance) < 8) return;
    const nextStart = pageWindowStart + (distance > 0 ? 1 : -1);
    if (nextStart < 0 || nextStart > maxWindowStart) return;
    event.preventDefault();
    showWindow(nextStart);
  };

  return (
    <section className="pdf-office-text-preview" aria-labelledby="pdf-office-preview-title">
      <div className="pdf-office-output-plan" role="status" aria-live="polite">
        <span><OutputIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <span><strong id="pdf-office-preview-title">{pageCount.toLocaleString()} editable {pageCount === 1 ? unit : `${unit}s`}</strong><small>One {outputLabel} {unit} will be created for every PDF page.</small></span>
        <b>{outputLabel}</b>
      </div>

      {isSpreadsheet ? (
        <dl className="word-preview-stats pdf-office-preview-stats">
          <div><dt>Sheets</dt><dd>{preview.spreadsheetPlan?.sheetCount.toLocaleString()}</dd></div>
          <div><dt>Rows</dt><dd>{preview.spreadsheetPlan?.rowCount.toLocaleString()}</dd></div>
          <div><dt>Values</dt><dd>{preview.spreadsheetPlan?.valueCount.toLocaleString()}</dd></div>
        </dl>
      ) : (
        <dl className="word-preview-stats pdf-office-preview-stats">
          <div><dt>PDF pages</dt><dd>{pageCount.toLocaleString()}</dd></div>
          <div><dt>With text</dt><dd>{preview.pagesWithText.toLocaleString()}</dd></div>
          <div><dt>Characters</dt><dd>{preview.characterCount.toLocaleString()}</dd></div>
        </dl>
      )}

      {selectedPage && (
        <div className="pdf-office-page-preview">
          <div className="pdf-office-page-preview-heading">
            <span><strong>{isSpreadsheet ? `PDF page ${selectedPage.pageNumber} → Sheet “${selectedSheet?.name || selectedPage.pageNumber}”` : `Page ${selectedPage.pageNumber} text`}</strong><small>{isSpreadsheet ? `${selectedSheet?.rowCount.toLocaleString() || 0} rows · ${selectedSheet?.valueCount.toLocaleString() || 0} values` : `${selectedPage.characterCount.toLocaleString()} characters · ${selectedPage.wordCount.toLocaleString()} words`}</small></span>
            <EyeIcon size={17} aria-hidden="true" />
          </div>
          {selectedPage.hasText ? (
            isSpreadsheet ? (
              <div className="spreadsheet-table-wrap pdf-office-sheet-preview" tabIndex="0" aria-label={`Generated value preview for worksheet ${selectedSheet?.name || selectedPage.pageNumber}`}>
                <table>
                  <thead><tr><th aria-label="Row number" />{Array.from({ length: sheetPreviewColumnCount }, (_, index) => <th key={index} scope="col">{spreadsheetColumnLabel(index)}</th>)}</tr></thead>
                  <tbody>
                    {selectedSheet.previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex}><th scope="row">{rowIndex + 1}</th>{Array.from({ length: sheetPreviewColumnCount }, (_, columnIndex) => <td key={columnIndex} title={row[columnIndex] || undefined}>{row[columnIndex] || ""}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="word-preview-text pdf-office-preview-text" tabIndex="0" aria-label={`Selectable text preview for PDF page ${selectedPage.pageNumber}`}>
                <pre>{selectedPage.previewText}</pre>
              </div>
            )
          ) : (
            <div className="pdf-office-empty-page" role="status"><FilePdfIcon size={18} weight="duotone" aria-hidden="true" /><span><strong>No selectable text on this page</strong><small>{isPresentation ? "Its PPTX slide will keep the page order and show a clear no-text placeholder." : isSpreadsheet ? "Its XLSX sheet will keep the page order and contain no extracted values." : "Its DOCX section will keep the page position but contain no extracted body text."}</small></span></div>
          )}
          {selectedPage.hasText && (
            <p className="word-preview-scope"><CheckCircleIcon size={15} weight="fill" aria-hidden="true" /><span>{isSpreadsheet
              ? selectedSheet.previewTruncatedRows || selectedSheet.previewTruncatedColumns
                ? `Showing up to the first 8 rows and 6 columns of ${selectedSheet.name}. All checked values will be exported.`
                : `All generated rows and columns for ${selectedSheet.name} are shown above.`
              : selectedPage.truncated
                ? `Showing the first ${selectedPage.previewText.length.toLocaleString()} of ${selectedPage.characterCount.toLocaleString()} characters from this page. All checked text will be exported.`
                : "All selectable text from this page is shown above."}</span></p>
          )}
        </div>
      )}

      {pageCount > 1 && (
        <>
          <div className="pdf-office-page-heading">
            <span><strong>Check another page</strong><small>Scroll sideways with a trackpad or use the arrows.</small></span>
            {pageCount > PDF_OFFICE_PAGE_WINDOW && (
              <span>
                <button type="button" onClick={() => showWindow(pageWindowStart - PDF_OFFICE_PAGE_WINDOW)} disabled={pageWindowStart === 0} aria-label="Show previous PDF text pages"><ArrowLeftIcon size={14} /></button>
                <b aria-live="polite">{windowLabel}</b>
                <button type="button" onClick={() => showWindow(pageWindowStart + PDF_OFFICE_PAGE_WINDOW)} disabled={pageWindowStart >= maxWindowStart} aria-label="Show next PDF text pages"><ArrowRightIcon size={14} /></button>
              </span>
            )}
          </div>
          <div className="pdf-office-page-strip" role="group" aria-label={`Choose one of ${pageCount.toLocaleString()} PDF pages for selectable text preview`} onWheel={movePageRail}>
            {visiblePages.map((page) => (
              <button type="button" key={page.pageNumber} className={page.pageNumber - 1 === pageIndex ? "selected" : ""} aria-pressed={page.pageNumber - 1 === pageIndex} onClick={() => setPageIndex(page.pageNumber - 1)} aria-label={`Preview selectable text from PDF page ${page.pageNumber}`}>
                <span><OutputIcon size={16} weight="duotone" aria-hidden="true" /><strong>Page {page.pageNumber}</strong></span>
                <small>{page.hasText ? isSpreadsheet ? `${preview.spreadsheetPlan.sheets[page.pageNumber - 1].rowCount.toLocaleString()} rows` : `${page.characterCount.toLocaleString()} chars` : "No text"}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {isSpreadsheet && (
        <div className="pdf-office-sheet-rule">
          <ColumnsIcon size={18} weight="duotone" aria-hidden="true" />
          <span><strong>How each sheet is built</strong><small>PDF text lines become rows. Tabs, pipes, or wider spaces separate values into columns.</small></span>
        </div>
      )}

      <p className="word-layout-note pdf-office-layout-note"><WarningCircleIcon size={15} weight="duotone" aria-hidden="true" /><span><strong>Editable text reconstruction, not a layout copy.</strong> {isPresentation ? "Graphics, page geometry, tables, columns, fonts, and original placement are not preserved." : isSpreadsheet ? "Complex table geometry, merged cells, formulas, images, fonts, and original placement are not preserved." : "Images, page geometry, tables, columns, fonts, and original placement are not preserved."}</span></p>
    </section>
  );
}

function PdfOfficeTextResultSummary({ result }) {
  const outcome = result?.pdfOfficeTextOutcome;
  if (!outcome) return null;
  const isPresentation = outcome.format === "pptx";
  const isSpreadsheet = outcome.format === "xlsx";
  const OutputIcon = isPresentation ? FilePptIcon : isSpreadsheet ? FileXlsIcon : FileDocIcon;
  const unit = isPresentation ? "slide" : isSpreadsheet ? "sheet" : "section";
  const outputLabel = isPresentation ? "PPTX" : isSpreadsheet ? "XLSX" : "DOCX";
  const outcomeDetails = isSpreadsheet
    ? `${outcome.rowCount.toLocaleString()} rows · ${outcome.valueCount.toLocaleString()} values`
    : `${outcome.pagesWithText.toLocaleString()} ${outcome.pagesWithText === 1 ? "page has" : "pages have"} selectable text · ${outcome.characterCount.toLocaleString()} characters`;
  return (
    <div className="word-result-summary pdf-office-result-summary" role="status">
      <span><OutputIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.pageCount.toLocaleString()} editable {outcome.pageCount === 1 ? unit : `${unit}s`} created</strong><small>{outcomeDetails}</small></div>
      <p><CheckCircleIcon size={16} weight="fill" aria-hidden="true" />The checked page text was reused for this {outputLabel} without uploading or re-reading the PDF.</p>
    </div>
  );
}

function PdfRedactionCanvas({ document, pageIndex, regions, overlay, selectedIndex, onSelect, onCreate, onUpdate, onRemove }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const pointerActionRef = useRef(null);
  const [renderState, setRenderState] = useState("loading");
  const [aspectRatio, setAspectRatio] = useState("8.5 / 11");
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!document || !canvasRef.current) return undefined;
    let cancelled = false;
    let page;
    let renderTask;
    setRenderState("loading");
    (async () => {
      page = await document.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.8, 760 / base.width, 980 / base.height);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      setAspectRatio(`${viewport.width} / ${viewport.height}`);
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (!cancelled) setRenderState("ready");
    })().catch((error) => {
      if (!cancelled && error?.name !== "RenderingCancelledException") setRenderState("error");
    });
    return () => {
      cancelled = true;
      try { renderTask?.cancel(); } catch { /* Rendering already completed. */ }
      page?.cleanup();
    };
  }, [document, pageIndex]);

  const pointFromEvent = (event) => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds?.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
    };
  };

  const capturePointer = (event) => {
    try { frameRef.current?.setPointerCapture(event.pointerId); } catch { /* Pointer may already be released. */ }
  };

  const beginDraw = (event) => {
    if (event.button !== 0 || event.target.closest(".redaction-region")) return;
    event.preventDefault();
    const start = pointFromEvent(event);
    pointerActionRef.current = { type: "draw", start };
    setDraft({ page: pageIndex + 1, x: start.x, y: start.y, width: 0, height: 0 });
    capturePointer(event);
  };

  const beginRegionAction = (event, index, type) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = pointFromEvent(event);
    pointerActionRef.current = { type, index, start, original: regions.find((region) => region.index === index) };
    onSelect(index);
    capturePointer(event);
  };

  const movePointer = (event) => {
    const action = pointerActionRef.current;
    if (!action) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (action.type === "draw") {
      setDraft({
        page: pageIndex + 1,
        x: Math.min(action.start.x, point.x),
        y: Math.min(action.start.y, point.y),
        width: Math.abs(point.x - action.start.x),
        height: Math.abs(point.y - action.start.y),
      });
      return;
    }
    if (!action.original) return;
    const deltaX = point.x - action.start.x;
    const deltaY = point.y - action.start.y;
    if (action.type === "move") {
      onUpdate(action.index, clampRedactionRegion({ ...action.original, x: action.original.x + deltaX, y: action.original.y + deltaY }));
      return;
    }
    onUpdate(action.index, {
      ...action.original,
      width: Math.max(MIN_REDACTION_REGION_PERCENT, Math.min(100 - action.original.x, action.original.width + deltaX)),
      height: Math.max(MIN_REDACTION_REGION_PERCENT, Math.min(100 - action.original.y, action.original.height + deltaY)),
    });
  };

  const finishPointer = (event) => {
    const action = pointerActionRef.current;
    if (!action) return;
    event.preventDefault();
    if (action.type === "draw" && draft?.width >= MIN_REDACTION_REGION_PERCENT && draft?.height >= MIN_REDACTION_REGION_PERCENT) {
      onCreate(clampRedactionRegion(draft));
    }
    pointerActionRef.current = null;
    setDraft(null);
    try { frameRef.current?.releasePointerCapture(event.pointerId); } catch { /* Pointer capture already ended. */ }
  };

  const moveRegionWithKeyboard = (event, region) => {
    const step = event.shiftKey ? 5 : 1;
    const deltas = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (deltas[event.key]) {
      event.preventDefault();
      const [x, y] = deltas[event.key];
      onUpdate(region.index, clampRedactionRegion({ ...region, x: region.x + x, y: region.y + y }));
    }
    if (["Backspace", "Delete"].includes(event.key)) {
      event.preventDefault();
      onRemove(region.index);
    }
  };

  return (
    <div className={`redaction-page-shell ${renderState}`}>
      <div
        ref={frameRef}
        className="redaction-page-frame"
        style={{ aspectRatio }}
        aria-label={`Page ${pageIndex + 1} redaction canvas`}
        onPointerDown={beginDraw}
        onPointerMove={movePointer}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        {renderState === "loading" && <span className="redaction-canvas-state"><SpinnerGapIcon size={22} className="spin" />Rendering page locally…</span>}
        {renderState === "error" && <span className="redaction-canvas-state"><WarningCircleIcon size={22} />This page preview could not be rendered.</span>}
        {regions.map((region, pageRegionIndex) => (
          <div
            key={region.index}
            className={`redaction-region ${overlay === "white" ? "white" : "black"} ${selectedIndex === region.index ? "selected" : ""}`}
            style={{ left: `${region.x}%`, top: `${region.y}%`, width: `${region.width}%`, height: `${region.height}%` }}
            role="button"
            tabIndex="0"
            aria-label={`Redaction area ${pageRegionIndex + 1} on page ${pageIndex + 1}. Use arrow keys to move it or Delete to remove it.`}
            onFocus={() => onSelect(region.index)}
            onClick={(event) => { event.stopPropagation(); onSelect(region.index); }}
            onKeyDown={(event) => moveRegionWithKeyboard(event, region)}
            onPointerDown={(event) => beginRegionAction(event, region.index, "move")}
          >
            <span className="redaction-region-number" aria-hidden="true">{pageRegionIndex + 1}</span>
            <span className="redaction-resize-handle" aria-hidden="true" onPointerDown={(event) => beginRegionAction(event, region.index, "resize")}><ResizeIcon size={13} weight="bold" /></span>
          </div>
        ))}
        {draft && <span className="redaction-region draft" style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.width}%`, height: `${draft.height}%` }} aria-hidden="true" />}
      </div>
    </div>
  );
}

function RedactPdfControls({ settings, onChange, info, plan, limits }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const pageRailRef = useRef(null);
  const pendingRailAlignmentRef = useRef(null);
  const lastWheelPageTurnRef = useRef(0);
  const pageCount = info.pageCount || 0;
  const pagesPerWindow = 6;
  const regions = plan?.regions || [];
  const pageRegions = regions.map((region, index) => ({ ...region, index })).filter((region) => region.page === pageIndex + 1);
  const visiblePages = Array.from(
    { length: Math.min(pagesPerWindow, Math.max(0, pageCount - pageWindowStart)) },
    (_, index) => pageWindowStart + index,
  );
  const selectedRegion = Number.isInteger(selectedIndex) ? regions[selectedIndex] : null;
  const totalAtLimit = regions.length >= limits.maxRedactionRegions;
  const pageAtLimit = pageRegions.length >= limits.maxRedactionRegionsPerPage;

  useEffect(() => {
    setPageIndex((current) => Math.min(current, Math.max(0, pageCount - 1)));
    setPageWindowStart((current) => Math.min(current, Math.max(0, Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow)));
  }, [pageCount]);

  useEffect(() => {
    const alignment = pendingRailAlignmentRef.current;
    const rail = pageRailRef.current;
    if (!alignment || !rail) return;
    rail.scrollLeft = alignment === "end" ? Math.max(0, rail.scrollWidth - rail.clientWidth) : 0;
    pendingRailAlignmentRef.current = null;
  }, [pageWindowStart]);

  useEffect(() => {
    if (!selectedRegion || selectedRegion.page !== pageIndex + 1) setSelectedIndex(null);
  }, [pageIndex, selectedRegion]);

  if (info.state !== "ready") return <PdfPageSourceStatus info={info} />;

  const commitRegions = (nextRegions, nextSelectedIndex = selectedIndex) => {
    onChange("regions", serializeRedactionRegions(nextRegions, pageCount, limits));
    setSelectedIndex(nextSelectedIndex);
  };

  const addRegion = (region) => {
    if (totalAtLimit || pageAtLimit) return;
    const next = [...regions, clampRedactionRegion({ ...region, page: pageIndex + 1 })];
    commitRegions(next, next.length - 1);
  };

  const addDefaultRegion = () => {
    const offset = (pageRegions.length * 4) % 24;
    addRegion({ page: pageIndex + 1, x: 12 + offset, y: 18 + offset, width: 58, height: 9 });
  };

  const updateRegion = (index, region) => {
    if (!regions[index]) return;
    const next = [...regions];
    next[index] = clampRedactionRegion({ ...region, page: regions[index].page });
    commitRegions(next, index);
  };

  const removeRegion = (index) => {
    if (!regions[index]) return;
    const next = regions.filter((_, regionIndex) => regionIndex !== index);
    commitRegions(next, null);
  };

  const clearCurrentPage = () => commitRegions(regions.filter((region) => region.page !== pageIndex + 1), null);
  const clearAll = () => commitRegions([], null);
  const undoLast = () => {
    if (!regions.length) return;
    const next = regions.slice(0, -1);
    commitRegions(next, null);
  };

  const showPageWindow = (nextStart, alignment = "start") => {
    const maxStart = Math.max(0, Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow);
    pendingRailAlignmentRef.current = alignment;
    setPageWindowStart(Math.max(0, Math.min(maxStart, nextStart)));
  };

  const movePageRailHorizontally = (event) => {
    const rail = pageRailRef.current;
    if (!rail) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    const next = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, rail.scrollLeft + delta));
    if (next !== rail.scrollLeft) {
      event.preventDefault();
      rail.scrollLeft = next;
      return;
    }
    const maxStart = Math.max(0, Math.floor((pageCount - 1) / pagesPerWindow) * pagesPerWindow);
    const nextWindow = delta > 0 ? Math.min(maxStart, pageWindowStart + pagesPerWindow) : Math.max(0, pageWindowStart - pagesPerWindow);
    if (nextWindow === pageWindowStart) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelPageTurnRef.current < 220) return;
    lastWheelPageTurnRef.current = now;
    showPageWindow(nextWindow, delta > 0 ? "start" : "end");
  };

  const choosePage = (nextPageIndex) => {
    setPageIndex(nextPageIndex);
    setPageWindowStart(Math.floor(nextPageIndex / pagesPerWindow) * pagesPerWindow);
    setSelectedIndex(null);
  };

  const updateSelectedCoordinate = (key, value) => {
    if (!selectedRegion || value === "" || !Number.isFinite(Number(value))) return;
    const number = Number(value);
    const nextValue = key === "width" ? Math.min(100 - selectedRegion.x, number) : key === "height" ? Math.min(100 - selectedRegion.y, number) : number;
    updateRegion(selectedIndex, clampRedactionRegion({ ...selectedRegion, [key]: nextValue }));
  };

  const readyMessage = plan.valid
    ? `${plan.regionCount.toLocaleString()} ${plan.regionCount === 1 ? "area" : "areas"} on ${plan.affectedPageCount.toLocaleString()} ${plan.affectedPageCount === 1 ? "page" : "pages"} will be permanently flattened.`
    : plan.message;

  return (
    <section className="redaction-planner" aria-labelledby="redaction-planner-title">
      <div className="redaction-planner-heading">
        <span><strong id="redaction-planner-title">Mark what should disappear</strong><small>Drag across the page to draw an area. Choose another page below to add different areas.</small></span>
        <b aria-live="polite">{regions.length.toLocaleString()} / {limits.maxRedactionRegions.toLocaleString()}</b>
      </div>

      <fieldset className="redaction-style-picker">
        <legend>Cover style</legend>
        <div>
          <button type="button" className={settings.overlay !== "white" ? "selected" : ""} aria-pressed={settings.overlay !== "white"} onClick={() => onChange("overlay", "black")}><span className="redaction-style-swatch black" /><span><strong>Black box</strong><small>Conventional redaction</small></span></button>
          <button type="button" className={settings.overlay === "white" ? "selected" : ""} aria-pressed={settings.overlay === "white"} onClick={() => onChange("overlay", "white")}><span className="redaction-style-swatch white" /><span><strong>White space</strong><small>Blend into the page</small></span></button>
        </div>
      </fieldset>

      <div className="redaction-canvas-heading">
        <span><strong>Page {pageIndex + 1} of {pageCount}</strong><small>{pageRegions.length ? `${pageRegions.length} ${pageRegions.length === 1 ? "area" : "areas"} on this page` : "No areas on this page yet"}</small></span>
        <div className="redaction-canvas-actions">
          <button type="button" onClick={addDefaultRegion} disabled={totalAtLimit || pageAtLimit}><PlusIcon size={15} weight="bold" />Add area</button>
          <button type="button" onClick={undoLast} disabled={!regions.length} aria-label="Undo the most recently added redaction area"><ClockCounterClockwiseIcon size={15} />Undo</button>
          <button type="button" onClick={clearCurrentPage} disabled={!pageRegions.length}>Clear page</button>
        </div>
      </div>

      <PdfRedactionCanvas
        document={info.document}
        pageIndex={pageIndex}
        regions={pageRegions}
        overlay={settings.overlay}
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        onCreate={addRegion}
        onUpdate={updateRegion}
        onRemove={removeRegion}
      />

      <p className="redaction-canvas-tip"><EyeSlashIcon size={16} weight="fill" aria-hidden="true" /><span>Black or white areas replace the pixels beneath them. The whole output is flattened, so its text is no longer selectable.</span></p>

      <div className="redaction-page-strip-heading">
        <span><strong>Choose a page</strong><small>Scroll sideways with a trackpad or swipe.</small></span>
        {pageCount > pagesPerWindow && (
          <span className="redaction-page-window-controls">
            <button type="button" onClick={() => showPageWindow(pageWindowStart - pagesPerWindow, "end")} disabled={pageWindowStart === 0} aria-label="Show previous PDF pages"><ArrowLeftIcon size={14} /></button>
            <b aria-live="polite">{pageWindowStart + 1}–{Math.min(pageWindowStart + pagesPerWindow, pageCount)} of {pageCount}</b>
            <button type="button" onClick={() => showPageWindow(pageWindowStart + pagesPerWindow)} disabled={pageWindowStart + pagesPerWindow >= pageCount} aria-label="Show next PDF pages"><ArrowRightIcon size={14} /></button>
          </span>
        )}
      </div>
      <div ref={pageRailRef} className="redaction-page-strip" role="group" aria-label="PDF pages and redaction counts" onWheel={movePageRailHorizontally}>
        {visiblePages.map((index) => {
          const count = regions.filter((region) => region.page === index + 1).length;
          return (
            <button type="button" key={index} className={index === pageIndex ? "selected" : ""} aria-pressed={index === pageIndex} aria-label={`Page ${index + 1}, ${count ? `${count} redaction ${count === 1 ? "area" : "areas"}` : "no redaction areas"}`} onClick={() => choosePage(index)}>
              <span><PdfPageThumbnail document={info.document} pageIndex={index} />{count > 0 && <b aria-hidden="true">{count}</b>}</span>
              <small>Page {index + 1}</small>
            </button>
          );
        })}
      </div>

      {selectedRegion && (
        <details className="redaction-exact-controls" open>
          <summary><KeyboardIcon size={15} aria-hidden="true" /><span>Exact position · area {pageRegions.findIndex((region) => region.index === selectedIndex) + 1}</span><CaretRightIcon size={13} aria-hidden="true" /></summary>
          <p>Percent of page size. Arrow keys move the selected area; Shift moves it faster.</p>
          <div>
            {[{ key: "x", label: "Left" }, { key: "y", label: "Top" }, { key: "width", label: "Width" }, { key: "height", label: "Height" }].map(({ key, label }) => (
              <label key={key}><span>{label}</span><span><input type="number" min={key === "width" || key === "height" ? MIN_REDACTION_REGION_PERCENT : 0} max="100" step="0.5" value={selectedRegion[key]} onChange={(event) => updateSelectedCoordinate(key, event.target.value)} /><small>%</small></span></label>
            ))}
          </div>
          <button type="button" className="redaction-delete-area" onClick={() => removeRegion(selectedIndex)}><TrashIcon size={15} />Delete this area</button>
        </details>
      )}

      {(totalAtLimit || pageAtLimit) && <div className="error-card" role="alert"><WarningCircleIcon size={18} weight="fill" /><span><strong>Area limit reached</strong>{pageAtLimit ? `Page ${pageIndex + 1} already has ${limits.maxRedactionRegionsPerPage.toLocaleString()} areas.` : `This PDF already has ${limits.maxRedactionRegions.toLocaleString()} areas.`}</span></div>}
      <div className={`redaction-plan ${plan.valid ? "ready" : "waiting"}`} role="status" aria-live="polite">{plan.valid ? <CheckCircleIcon size={17} weight="fill" /> : <WarningCircleIcon size={17} />}<span>{readyMessage}</span>{regions.length > 0 && <button type="button" onClick={clearAll}>Reset all</button>}</div>
    </section>
  );
}

function PdfSettingPreview({ tool, settings, info }) {
  if (info.state === "idle") return null;
  if (info.state !== "ready") {
    return <PdfPageSourceStatus info={info} />;
  }

  const slug = tool.slug;
  const position = settings.position || "bottom-center";
  const editPosition = settings.position || "top-left";
  const rotation = Number(settings.angle || 90);
  const previewDescription = slug === "rotate-pdf"
    ? `The first page turns ${rotation === 270 ? "90 degrees counter-clockwise" : `${rotation} degrees clockwise`}.`
    : slug === "add-pdf-page-numbers"
      ? `The first page shows ${Number(settings.startAt || 1)} at the ${position.replace("-", " ")}.`
      : slug === "watermark-pdf"
        ? `The first page shows the watermark “${String(settings.text || "PRIVATE")}” at ${Number(settings.opacity || 24)} percent opacity.`
        : slug === "crop-pdf"
          ? `${Number(settings.margin || 0)} percent is trimmed from every edge.`
          : slug === "edit-pdf"
            ? `“${String(settings.text || "Reviewed locally")}” appears at the ${editPosition.replace("-", " ")}.`
            : slug === "sign-pdf"
              ? `The typed signature “${String(settings.name || "Signed locally")}” appears near the bottom of the final page.`
              : "The selected change is shown on the first page.";

  return (
    <section className="pdf-setting-preview" aria-labelledby={`${slug}-setting-preview-title`}>
      <div className="pdf-setting-preview-heading">
        <span><strong id={`${slug}-setting-preview-title`}>First-page preview</strong><small>Representative only · the generated PDF remains available in Preview</small></span>
        <EyeIcon size={17} aria-hidden="true" />
      </div>
      <div className="pdf-setting-preview-stage">
        <div className={`pdf-setting-preview-page ${slug === "rotate-pdf" ? "rotated" : ""}`} style={slug === "rotate-pdf" ? { "--preview-rotation": `${rotation}deg` } : undefined}>
          <PdfPageThumbnail document={info.document} pageIndex={0} />
          {slug === "add-pdf-page-numbers" && <span className={`preview-page-number ${position}`}>{Number(settings.startAt || 1)}</span>}
          {slug === "watermark-pdf" && <span className="preview-watermark" style={{ opacity: Math.max(0.12, Number(settings.opacity || 24) / 100) }}>{String(settings.text || "PRIVATE")}</span>}
          {slug === "crop-pdf" && <span className="preview-crop" style={{ inset: `${Math.max(0, Math.min(42, Number(settings.margin || 0)))}%` }} />}
          {slug === "edit-pdf" && <span className={`preview-edit-text ${editPosition}`} style={{ fontSize: `${Math.max(7, Math.min(16, Number(settings.fontSize || 16) * 0.38))}px` }}>{String(settings.text || "Reviewed locally")}</span>}
          {slug === "sign-pdf" && <span className="preview-signature">{String(settings.name || "Signed locally")}</span>}
        </div>
      </div>
      <p>{previewDescription}</p>
    </section>
  );
}

function useLocalImageUrl(file) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function ImageSequenceFileQueue({ files, getFileId, moveFile, removeFile, reorderButtonsRef, removeButtonsRef, mode = "pdf" }) {
  const [urls, setUrls] = useState(new Map());
  const gifMode = mode === "gif";
  const itemName = gifMode ? "frame" : "page";
  const headingId = `image-sequence-order-${mode}`;

  useEffect(() => {
    const nextEntries = files.map((file) => [getFileId(file), URL.createObjectURL(file)]);
    setUrls(new Map(nextEntries));
    return () => nextEntries.forEach(([, url]) => URL.revokeObjectURL(url));
  }, [files]);

  return (
    <div className={`scan-order ${gifMode ? "gif-frame-order" : ""}`} role="group" aria-labelledby={headingId}>
      <div className="scan-order-heading">
        <span><strong id={headingId}>{gifMode ? "GIF frame order" : "PDF page order"}</strong><small>{gifMode ? "Each JPG becomes one frame. Arrange the sequence before it plays." : "Each image becomes one page. Use the arrows to arrange the final PDF."}</small></span>
        <b>{files.length.toLocaleString()} {files.length === 1 ? itemName : `${itemName}s`}</b>
      </div>
      <div className="scan-order-strip" role="list" aria-label={`${files.length} image ${files.length === 1 ? itemName : `${itemName}s`} in output order`}>
        {files.map((file, index) => {
          const fileId = getFileId(file);
          return (
            <article className="scan-order-card" role="listitem" key={fileId}>
              <div className="scan-order-thumbnail">
                <img src={urls.get(fileId) || ""} alt="" />
                <b aria-hidden="true">{index + 1}</b>
              </div>
              <span className="scan-order-file"><strong title={file.name}>{file.name}</strong><small>{gifMode ? "Frame" : "Page"} {index + 1} · {formatBytes(file.size)}</small></span>
              <div className="scan-order-actions">
                <span>
                  <button
                    ref={(node) => { const key = `${fileId}:up`; if (node) reorderButtonsRef.current.set(key, node); else reorderButtonsRef.current.delete(key); }}
                    type="button"
                    onClick={() => moveFile(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${file.name} earlier from ${itemName} ${index + 1} of ${files.length}`}
                  ><ArrowLeftIcon size={15} aria-hidden="true" /></button>
                  <button
                    ref={(node) => { const key = `${fileId}:down`; if (node) reorderButtonsRef.current.set(key, node); else reorderButtonsRef.current.delete(key); }}
                    type="button"
                    onClick={() => moveFile(index, 1)}
                    disabled={index === files.length - 1}
                    aria-label={`Move ${file.name} later from ${itemName} ${index + 1} of ${files.length}`}
                  ><ArrowRightIcon size={15} aria-hidden="true" /></button>
                </span>
                <button
                  ref={(node) => { if (node) removeButtonsRef.current.set(fileId, node); else removeButtonsRef.current.delete(fileId); }}
                  type="button"
                  onClick={() => removeFile(file, index)}
                  aria-label={`Remove ${file.name}, ${itemName} ${index + 1} of ${files.length}`}
                ><TrashIcon size={15} aria-hidden="true" /></button>
              </div>
            </article>
          );
        })}
      </div>
      <p><ArrowsLeftRightIcon size={15} aria-hidden="true" />Scroll sideways with a trackpad or swipe to review every {itemName}.</p>
    </div>
  );
}

function ImagePdfPageControls({ files, pageSizeSetting, pageSizeValue, onPageSizeChange, marginSetting, marginValue, onMarginChange }) {
  const previewUrl = useLocalImageUrl(files[0]);
  const [measuredImage, setMeasuredImage] = useState({ file: null, ratio: 0.75 });
  const options = pageSizeSetting?.options || [];
  const pageSize = options.some((option) => option.value === pageSizeValue) ? pageSizeValue : options[0]?.value || "auto";
  const followsImageShape = pageSize === "auto" || pageSize === "fit";
  const imageRatio = measuredImage.file === files[0] ? measuredImage.ratio : 0.75;
  const pageAspect = pageSize === "a4" ? 595.28 / 841.89 : pageSize === "letter" ? 612 / 792 : imageRatio;
  const boundedPageAspect = Math.max(0.45, Math.min(2.2, pageAspect));
  const previewWidth = Math.min(176, 126 * boundedPageAspect);
  const previewHeight = previewWidth / boundedPageAspect;
  const selectedLabel = options.find((option) => option.value === pageSize)?.label || "Match image";
  const marginOptions = marginSetting?.options || [];
  const selectedMargin = marginOptions.some((option) => option.value === marginValue) ? marginValue : marginOptions[0]?.value || "small";
  const previewPadding = selectedMargin === "none" ? 0 : selectedMargin === "large" ? 16 : 7;
  const marginCopy = marginSetting
    ? selectedMargin === "none" ? "No outer margin is added." : `${marginOptions.find((option) => option.value === selectedMargin)?.label || "Small"} white margins are added.`
    : "A small white edge is added.";
  const previewCopy = followsImageShape
    ? "Each page follows its image shape."
    : `Every image is contained on portrait ${selectedLabel} paper.`;

  return (
    <section className="scan-controls" aria-labelledby="scan-page-size-title">
      <fieldset className="scan-size-picker">
        <legend id="scan-page-size-title">Choose the PDF page shape</legend>
        <div>
          {options.map((option) => {
            const selected = pageSize === option.value;
            const Icon = option.value === "auto" ? ImageSquareIcon : FilePdfIcon;
            return (
              <button key={option.value} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onPageSizeChange(option.value)}>
                <span><Icon size={19} weight="duotone" aria-hidden="true" /></span>
                <span><strong>{option.label}</strong><small>{option.hint}</small></span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {marginSetting && (
        <fieldset className="scan-size-picker image-pdf-margin-picker">
          <legend>Choose the white margin</legend>
          <div>
            {marginOptions.map((option) => {
              const selected = selectedMargin === option.value;
              const Icon = option.value === "none" ? ArrowsOutIcon : option.value === "large" ? ArrowsInIcon : ImageSquareIcon;
              return (
                <button key={option.value} type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onMarginChange(option.value)}>
                  <span><Icon size={19} weight="duotone" aria-hidden="true" /></span>
                  <span><strong>{option.label}</strong><small>{option.hint}</small></span>
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="scan-page-preview" aria-live="polite">
        <div className="scan-page-preview-heading"><span><strong>First-page preview</strong><small>{files.length ? `${files.length.toLocaleString()} ${files.length === 1 ? "page" : "pages"} will follow this fit rule` : "Add an image to preview its fit"}</small></span><EyeIcon size={17} aria-hidden="true" /></div>
        <div className="scan-page-preview-stage">
          <div className="scan-page-preview-paper" style={{ width: `${previewWidth}px`, height: `${previewHeight}px`, padding: `${previewPadding}px` }}>
            {previewUrl ? <img src={previewUrl} alt={`Preview of ${files[0].name} on ${selectedLabel} PDF paper`} onLoad={(event) => setMeasuredImage({ file: files[0], ratio: event.currentTarget.naturalWidth / event.currentTarget.naturalHeight })} /> : <ImageSquareIcon size={28} weight="duotone" aria-hidden="true" />}
          </div>
        </div>
        <p><CheckCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Nothing is cropped or stretched.</strong>{previewCopy} {marginCopy}</span></p>
      </div>
    </section>
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

function OrganizePdfControls({ settings, onChange, info, plan, limits }) {
  const pagesPerWindow = 6;
  const [windowStart, setWindowStart] = useState(0);
  const railRef = useRef(null);
  const lastWheelPageTurnRef = useRef(0);
  const order = plan.order;
  const visibleOrder = order.slice(windowStart, windowStart + pagesPerWindow);
  const maxPages = info.pageCount * limits.maxOrganizedPageMultiplier;
  const missingPages = info.state === "ready"
    ? Array.from({ length: info.pageCount }, (_, index) => index).filter((pageIndex) => !order.includes(pageIndex))
    : [];
  const rangeEnd = Math.min(order.length, windowStart + pagesPerWindow);

  useEffect(() => {
    const maxStart = Math.max(0, Math.floor((order.length - 1) / pagesPerWindow) * pagesPerWindow);
    setWindowStart((current) => Math.min(current, maxStart));
  }, [order.length]);

  const commitOrder = (next) => onChange("order", next.map((pageIndex) => pageIndex + 1).join(","));
  const move = (outputIndex, direction) => {
    const target = outputIndex + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[outputIndex], next[target]] = [next[target], next[outputIndex]];
    commitOrder(next);
    if (target < windowStart) setWindowStart(Math.max(0, windowStart - pagesPerWindow));
    if (target >= windowStart + pagesPerWindow) setWindowStart(windowStart + pagesPerWindow);
  };
  const duplicate = (outputIndex) => {
    if (order.length >= maxPages) return;
    const next = [...order];
    next.splice(outputIndex + 1, 0, order[outputIndex]);
    commitOrder(next);
  };
  const remove = (outputIndex) => {
    if (order.length <= 1) return;
    commitOrder(order.filter((_, index) => index !== outputIndex));
  };
  const appendMissing = () => {
    if (!missingPages.length) return;
    commitOrder([...order, ...missingPages].slice(0, maxPages));
    setWindowStart(Math.floor(order.length / pagesPerWindow) * pagesPerWindow);
  };
  const reset = () => {
    onChange("order", "all");
    setWindowStart(0);
  };
  const showWindow = (next) => setWindowStart(Math.max(0, Math.min(Math.max(0, Math.floor((order.length - 1) / pagesPerWindow) * pagesPerWindow), next)));
  const scrollRail = (event) => {
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
    const nextWindow = delta > 0 ? windowStart + pagesPerWindow : windowStart - pagesPerWindow;
    const maxWindow = Math.max(0, Math.floor((order.length - 1) / pagesPerWindow) * pagesPerWindow);
    if (nextWindow < 0 || nextWindow > maxWindow) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheelPageTurnRef.current < 220) return;
    lastWheelPageTurnRef.current = now;
    showWindow(nextWindow);
  };

  return (
    <div className="page-tool-controls organize-page-controls">
      <PdfPageSourceStatus info={info} />
      {info.state === "ready" && (
        <section className="organize-page-planner" aria-labelledby="organize-page-title">
          <div className="page-selection-heading organize-page-heading">
            <span><strong id="organize-page-title">Arrange the output pages</strong><small>Move, copy, or remove each page. The numbered badges show the new PDF order.</small></span>
            <b aria-live="polite">{order.length.toLocaleString()} {order.length === 1 ? "page" : "pages"}</b>
          </div>
          <div className="page-selection-actions organize-page-actions" aria-label="Page arrangement actions">
            <button type="button" onClick={reset} disabled={order.length === info.pageCount && order.every((page, index) => page === index)}><ArrowClockwiseIcon size={14} aria-hidden="true" />Reset order</button>
            <button type="button" onClick={appendMissing} disabled={!missingPages.length}><PlusIcon size={14} aria-hidden="true" />Add {missingPages.length ? `${missingPages.length} missing` : "missing pages"}</button>
          </div>
          <div className="page-selection-strip-heading">
            <small>Use the arrows to reorder. Copy creates another instance of that page.</small>
            {order.length > pagesPerWindow && (
              <span className="split-window-controls">
                <button type="button" onClick={() => showWindow(windowStart - pagesPerWindow)} disabled={windowStart === 0} aria-label="Show previous arranged pages"><ArrowLeftIcon size={14} /></button>
                <b aria-live="polite">Items {windowStart + 1}–{rangeEnd} of {order.length}</b>
                <button type="button" onClick={() => showWindow(windowStart + pagesPerWindow)} disabled={rangeEnd >= order.length} aria-label="Show next arranged pages"><ArrowRightIcon size={14} /></button>
              </span>
            )}
          </div>
          <div className="organize-page-rail" ref={railRef} role="list" aria-label="Arranged PDF pages" onWheel={scrollRail}>
            {visibleOrder.map((pageIndex, visibleIndex) => {
              const outputIndex = windowStart + visibleIndex;
              return (
                <article className="organize-page-card" role="listitem" key={`${outputIndex}-${pageIndex}`}>
                  <span className="organize-output-position" aria-label={`Output position ${outputIndex + 1}`}>{outputIndex + 1}</span>
                  <PdfPageThumbnail document={info.document} pageIndex={pageIndex} />
                  <span><strong>Page {pageIndex + 1}</strong><small>Source page</small></span>
                  <div className="organize-card-actions">
                    <button type="button" onClick={() => move(outputIndex, -1)} disabled={outputIndex === 0} aria-label={`Move source page ${pageIndex + 1} left`}><ArrowLeftIcon size={14} /></button>
                    <button type="button" onClick={() => duplicate(outputIndex)} disabled={order.length >= maxPages} aria-label={`Copy source page ${pageIndex + 1}`}><FilePlusIcon size={14} /></button>
                    <button type="button" onClick={() => remove(outputIndex)} disabled={order.length <= 1} aria-label={`Remove source page ${pageIndex + 1} from output`}><TrashIcon size={14} /></button>
                    <button type="button" onClick={() => move(outputIndex, 1)} disabled={outputIndex === order.length - 1} aria-label={`Move source page ${pageIndex + 1} right`}><ArrowRightIcon size={14} /></button>
                  </div>
                </article>
              );
            })}
          </div>
          <details className="page-manual-entry organize-manual-entry">
            <summary><KeyboardIcon size={15} aria-hidden="true" /><span>Enter an exact page order instead</span><CaretRightIcon size={13} aria-hidden="true" /></summary>
            <div className="setting-field">
              <label htmlFor="organize-page-order"><strong>Output page order</strong></label>
              <small id="organize-page-order-description" className="field-description">Example: 3, 1, 2, 2 copies page 2. Ranges such as 6-4 work too.</small>
              <input id="organize-page-order" type="text" maxLength={4096} value={settings.order} aria-describedby="organize-page-order-description organize-plan-message" aria-invalid={!plan.valid} onChange={(event) => onChange("order", event.target.value)} />
            </div>
          </details>
        </section>
      )}
      <div id="organize-plan-message" className={`split-output-plan ${plan.valid ? "ready" : ["idle", "loading"].includes(info.state) ? "pending" : "warning"}`} role={plan.valid || ["idle", "loading"].includes(info.state) ? "status" : "alert"} aria-live="polite">
        {plan.valid ? <FilesIcon size={18} weight="duotone" aria-hidden="true" /> : <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />}
        <span><strong>{plan.valid ? "Output order ready" : "Arrange pages"}</strong><small>{plan.valid ? `${order.length.toLocaleString()} ${order.length === 1 ? "page" : "pages"} will be saved in the order shown above.` : plan.message}</small></span>
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
  const summary = tool.slug === "summarize-pdf";
  const text = String(result?.textContent || "");
  const [activeTab, setActiveTab] = useState("text");
  const [copyState, setCopyState] = useState({ kind: "idle", message: "" });
  const textPanelId = `${tool.slug}-result-text`;
  const previewPanelId = `${tool.slug}-result-preview`;

  const copy = async () => {
    try {
      await copyOcrText(text);
      setCopyState({ kind: "success", message: markdown ? "Markdown copied." : summary ? "Summary copied." : "Translation copied." });
    } catch (error) {
      setCopyState({ kind: "error", message: error?.message || "Text could not be copied." });
    }
  };

  return (
    <section className={`ocr-reader-card text-reader-card ${summary ? "summary-reader-card" : ""}`} aria-labelledby={`${tool.slug}-reader-title`}>
      <header className="ocr-reader-header text-reader-header">
        <span>{markdown ? <MarkdownLogoIcon size={24} weight="duotone" aria-hidden="true" /> : summary ? <SparkleIcon size={24} weight="duotone" aria-hidden="true" /> : <TranslateIcon size={24} weight="duotone" aria-hidden="true" />}</span>
        <div><h3 id={`${tool.slug}-reader-title`} ref={headingRef} tabIndex="-1">{markdown ? "Markdown result" : summary ? "Extractive summary" : "Translated text"}</h3><p>{result.details} · held only in this tab</p></div>
        <b>{markdown ? "MARKDOWN" : summary ? "EXTRACTIVE" : "LOCAL"}</b>
      </header>

      {markdown && (
        <div className="text-reader-tabs" role="tablist" aria-label="Markdown result views">
          <button type="button" role="tab" id={`${textPanelId}-tab`} aria-controls={textPanelId} aria-selected={activeTab === "text"} onClick={() => setActiveTab("text")}><TextTIcon size={16} aria-hidden="true" />Text</button>
          <button type="button" role="tab" id={`${previewPanelId}-tab`} aria-controls={previewPanelId} aria-selected={activeTab === "preview"} onClick={() => setActiveTab("preview")}><EyeIcon size={16} aria-hidden="true" />Preview</button>
        </div>
      )}

      {(!markdown || activeTab === "text") && (
        <div className="ocr-text-panel" id={textPanelId} role={markdown ? "tabpanel" : undefined} aria-labelledby={markdown ? `${textPanelId}-tab` : undefined}>
          <label htmlFor={`${tool.slug}-result-value`}>{markdown ? "Markdown text" : summary ? "Summary text" : "Translated text"}</label>
          <textarea id={`${tool.slug}-result-value`} readOnly value={text} spellCheck="false" />
        </div>
      )}
      {markdown && activeTab === "preview" && (
        <div id={previewPanelId} role="tabpanel" aria-labelledby={`${previewPanelId}-tab`}><MarkdownPreview text={text} limits={limits} /></div>
      )}

      <footer className="ocr-reader-actions text-reader-actions">
        <span className={`ocr-copy-status ${copyState.kind}`} role="status" aria-live="polite">{copyState.message || "Text stays local until you copy or download it."}</span>
        <button type="button" onClick={() => downloadResult(result)}><DownloadSimpleIcon size={16} aria-hidden="true" />Download {markdown ? ".md" : ".txt"}</button>
        <button type="button" className="primary" onClick={copy} disabled={!text}><FilesIcon size={16} aria-hidden="true" />Copy {markdown ? "Markdown" : summary ? "summary" : "translation"}</button>
      </footer>
      <button className="start-another ocr-start-another" onClick={onReset}>{markdown ? "Convert another PDF" : summary ? "Summarize another PDF" : "Translate another PDF"}</button>
    </section>
  );
}

function SummaryPlan({ settings }) {
  const sentenceCounts = { short: 3, medium: 5, long: 9 };
  const sentenceCount = sentenceCounts[settings.length] || sentenceCounts.medium;
  const prose = settings.format === "prose";
  return (
    <div className="summary-plan" role="note">
      <span><SparkleIcon size={17} weight="duotone" aria-hidden="true" /></span>
      <div>
        <strong>Up to {sentenceCount} source {sentenceCount === 1 ? "sentence" : "sentences"}</strong>
        <small>{prose ? "Presented as one readable paragraph." : "Presented as scannable key points."}</small>
        <p>This is extractive: it selects existing PDF sentences instead of inventing or rewriting claims.</p>
      </div>
    </div>
  );
}

function ImageCompressionResultSummary({ files, result }) {
  const outcome = result?.imageCompressionBatchOutcome || result?.imageCompressionOutcome;
  if (!outcome) return null;
  const inputBytes = outcome.inputBytes ?? files.reduce((sum, file) => sum + file.size, 0);
  const outputBytes = outcome.outputBytes ?? result.size;
  const change = getCompressionSizeChange(inputBytes, outputBytes);
  if (!change) return null;
  const magnitude = Math.abs(change.percent);
  const percentLabel = magnitude > 0 && magnitude < 1 ? "<1%" : `${Math.round(magnitude)}%`;
  const batch = Number(outcome.fileCount) > 1;
  const headline = change.status === "reduced"
    ? `${percentLabel} smaller`
    : change.status === "increased"
      ? `${percentLabel} larger`
      : "Same size";
  const detail = batch
    ? `${outcome.fileCount.toLocaleString()} images packaged in one ZIP · ${outcome.reducedFiles.toLocaleString()} became smaller before packaging`
    : `${outcome.width.toLocaleString()} × ${outcome.height.toLocaleString()} px · ${outcome.qualityApplies ? `${outcome.quality}% quality` : "lossless PNG re-encode"}`;

  return (
    <div className={`image-compression-result-summary ${change.status}`} role="status" aria-live="polite">
      <div>
        {change.status === "reduced" ? <FileArrowDownIcon size={23} weight="duotone" aria-hidden="true" /> : <WarningCircleIcon size={23} weight="fill" aria-hidden="true" />}
        <span><strong>{headline}</strong><small>{detail}</small></span>
      </div>
      <dl aria-label={`Original ${formatBytes(inputBytes)}. Download ${formatBytes(outputBytes)}.`}>
        <div><dt>Original</dt><dd>{formatBytes(inputBytes)}</dd></div>
        <ArrowRightIcon size={17} aria-hidden="true" />
        <div><dt>{batch ? "ZIP download" : "Compressed"}</dt><dd>{formatBytes(outputBytes)}</dd></div>
      </dl>
      {change.status !== "reduced" && <p><WarningCircleIcon size={15} aria-hidden="true" />The output is not smaller. Keep the original or try a lower quality when space saving matters.</p>}
    </div>
  );
}

function ImageResizeResultSummary({ result }) {
  const batch = result?.imageResizeBatchOutcome;
  const outcome = result?.imageResizeOutcome;
  if (!batch && !outcome) return null;

  if (batch) {
    const changes = [
      batch.downsizedFiles ? `${batch.downsizedFiles.toLocaleString()} smaller` : "",
      batch.enlargedFiles ? `${batch.enlargedFiles.toLocaleString()} enlarged` : "",
      batch.unchangedFiles ? `${batch.unchangedFiles.toLocaleString()} unchanged` : "",
    ].filter(Boolean).join(" · ");
    return (
      <div className="image-resize-result-summary" role="status" aria-live="polite">
        <span><ResizeIcon size={23} weight="duotone" aria-hidden="true" /></span>
        <div><strong>{batch.fileCount.toLocaleString()} images resized</strong><small>{batch.targetWidth.toLocaleString()} px wide · proportional heights · {changes}</small></div>
        <b>{formatBytes(result.size)} ZIP</b>
      </div>
    );
  }

  const direction = outcome.direction === "downsize"
    ? `Downsized to ${outcome.scalePercent.toLocaleString()}%`
    : outcome.direction === "enlarge"
      ? `Enlarged to ${outcome.scalePercent.toLocaleString()}%`
      : "Dimensions unchanged";
  return (
    <div className="image-resize-result-summary" role="status" aria-live="polite">
      <span><ResizeIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.sourceWidth.toLocaleString()} × {outcome.sourceHeight.toLocaleString()} <ArrowRightIcon size={15} aria-hidden="true" /> {outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px</strong><small>{direction} · proportions preserved</small></div>
      <b>{formatBytes(result.size)}</b>
    </div>
  );
}

function ImageUpscaleResultSummary({ result }) {
  const batch = result?.imageUpscaleBatchOutcome;
  const outcome = result?.imageUpscaleOutcome;
  if (!batch && !outcome) return null;

  if (batch) {
    return (
      <div className="image-upscale-result-summary" role="status" aria-live="polite">
        <span><ArrowsOutIcon size={23} weight="duotone" aria-hidden="true" /></span>
        <div><strong>{batch.fileCount.toLocaleString()} images enlarged {batch.scale}×</strong><small>{batch.pixelMultiplier.toLocaleString()}× the pixels per image · high-quality local resampling</small></div>
        <b>{formatBytes(result.size)} ZIP</b>
      </div>
    );
  }

  return (
    <div className="image-upscale-result-summary" role="status" aria-live="polite">
      <span><ArrowsOutIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.sourceWidth.toLocaleString()} × {outcome.sourceHeight.toLocaleString()} <ArrowRightIcon size={15} aria-hidden="true" /> {outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px</strong><small>{outcome.scale}× each edge · {outcome.pixelMultiplier.toLocaleString()}× the pixels · local resampling</small></div>
      <b>{formatBytes(outcome.outputBytes)}</b>
    </div>
  );
}

function BackgroundRemovalResultSummary({ result }) {
  const batch = result?.backgroundRemovalBatchOutcome;
  const outcome = result?.backgroundRemovalOutcome;
  if (!batch && !outcome) return null;

  if (batch) {
    const removed = batch.removedPercentMinimum === batch.removedPercentMaximum
      ? `${batch.removedPercentMinimum}% opacity removed`
      : `${batch.removedPercentMinimum}–${batch.removedPercentMaximum}% opacity removed`;
    return (
      <div className="background-removal-result-summary" role="status" aria-live="polite">
        <span><SelectionBackgroundIcon size={23} weight="duotone" aria-hidden="true" /></span>
        <div><strong>{batch.fileCount.toLocaleString()} PNG cutouts created</strong><small>{getBackgroundRemovalProfile(batch.cleanup).label} cleanup · {getBackgroundRemovalBackground(batch.background).label.toLowerCase()} background · {removed}</small></div>
        <b>{formatBytes(result.size)} ZIP</b>
      </div>
    );
  }

  return (
    <div className="background-removal-result-summary" role="status" aria-live="polite">
      <span><SelectionBackgroundIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.removedPercent}% background opacity removed</strong><small>{outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px · {getBackgroundRemovalProfile(outcome.cleanup).label} cleanup · {getBackgroundRemovalBackground(outcome.background).label} PNG</small></div>
      <b>{formatBytes(outcome.outputBytes)}</b>
    </div>
  );
}

function ImageCropResultSummary({ result }) {
  const batch = result?.imageCropBatchOutcome;
  const outcome = result?.imageCropOutcome;
  if (!batch && !outcome) return null;

  if (batch) {
    const retention = batch.retainedPercentMinimum === batch.retainedPercentMaximum
      ? `${batch.retainedPercentMinimum.toLocaleString()}% of each image retained`
      : `${batch.retainedPercentMinimum.toLocaleString()}–${batch.retainedPercentMaximum.toLocaleString()}% retained`;
    return (
      <div className="image-crop-result-summary" role="status" aria-live="polite">
        <span><CropIcon size={23} weight="duotone" aria-hidden="true" /></span>
        <div><strong>{batch.fileCount.toLocaleString()} images cropped</strong><small>{retention} · same shape and focal position</small></div>
        <b>{formatBytes(result.size)} ZIP</b>
      </div>
    );
  }

  return (
    <div className="image-crop-result-summary" role="status" aria-live="polite">
      <span><CropIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.sourceWidth.toLocaleString()} × {outcome.sourceHeight.toLocaleString()} <ArrowRightIcon size={15} aria-hidden="true" /> {outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px</strong><small>{outcome.retainedPercent.toLocaleString()}% of the original pixels retained</small></div>
      <b>{formatBytes(result.size)}</b>
    </div>
  );
}

function PhotoEditorResultSummary({ result }) {
  const outcome = result?.photoEditorOutcome;
  if (!outcome) return null;
  const adjustmentSummary = outcome.adjusted
    ? `Brightness ${outcome.brightness}% · contrast ${outcome.contrast}% · color ${outcome.saturation}% · warmth ${outcome.warmth}%`
    : "Original color settings";
  return (
    <div className="photo-editor-result-summary" role="status" aria-live="polite">
      <span><PaletteIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.changed ? "Edited photo created" : "Fresh local copy created"}</strong><small>{outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px · {outcome.format.toUpperCase()} · {adjustmentSummary}</small>{outcome.captionCharacters > 0 && <p>{outcome.captionCharacters.toLocaleString()}-character caption added near the bottom edge.</p>}</div>
      <b>{formatBytes(outcome.outputBytes)}</b>
    </div>
  );
}

function AnimatedGifResultSummary({ result }) {
  const outcome = result?.gifOutcome;
  if (!outcome) return null;
  return (
    <div className="image-gif-result-summary" role="status" aria-live="polite">
      <span><PlayIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div>
        <strong>{outcome.frameCount.toLocaleString()}-frame GIF created</strong>
        <small>{outcome.width.toLocaleString()} × {outcome.height.toLocaleString()} px · {outcome.delayMs.toLocaleString()} ms/frame · {formatGifDuration(outcome.durationMs)} per cycle · {outcome.loop ? "continuous loop" : "plays once"}</small>
        {outcome.coverCroppedFrames > 0 && <p>{outcome.coverCroppedFrames.toLocaleString()} differently shaped {outcome.coverCroppedFrames === 1 ? "frame was" : "frames were"} centered and cropped to match frame 1.</p>}
      </div>
      <b>{formatBytes(result.size)}</b>
    </div>
  );
}

function ImagePdfResultSummary({ result }) {
  const outcome = result?.scanOutcome || result?.imagePdfOutcome;
  if (!outcome) return null;
  return (
    <div className="scan-result-summary" role="status">
      <span><FilesIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.pageCount.toLocaleString()}-page PDF created</strong><small>The numbered image order was preserved and every image was fitted without cropping.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview the PDF to check page order and margins before sharing it.</p>
    </div>
  );
}

function WordPdfControls({ file, preview }) {
  if (!file) {
    return (
      <section className="word-preview-empty" aria-labelledby="word-preview-title">
        <span><FileDocIcon size={21} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="word-preview-title">Preview readable text</strong><small>Add one DOCX to check what the clean PDF will contain.</small></div>
      </section>
    );
  }

  if (preview.state === "loading" || preview.file !== file) {
    return (
      <section className="word-preview-loading" aria-live="polite">
        <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
        <div><strong>Reading text locally</strong><small>Checking the DOCX structure and extracting readable text.</small></div>
      </section>
    );
  }

  if (preview.state === "error") {
    return (
      <section className="word-preview-error" role="alert">
        <WarningCircleIcon size={21} weight="fill" aria-hidden="true" />
        <div><strong>Preview unavailable</strong><small>{preview.message}</small></div>
      </section>
    );
  }

  const hasText = preview.characterCount > 0;
  return (
    <section className="word-document-preview" aria-labelledby="word-preview-title">
      <header role="status" aria-live="polite">
        <span><EyeIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="word-preview-title">{hasText ? "Readable text found" : "No readable text found"}</strong><small>{hasText ? "This is the content that will be reconstructed." : "The output would contain a no-readable-text notice."}</small></div>
      </header>
      <dl className="word-preview-stats">
        <div><dt>Characters</dt><dd>{preview.characterCount.toLocaleString()}</dd></div>
        <div><dt>Words</dt><dd>{preview.wordCount.toLocaleString()}</dd></div>
        <div><dt>Paragraphs</dt><dd>{preview.paragraphCount.toLocaleString()}</dd></div>
      </dl>
      {hasText && (
        <div className="word-preview-text" tabIndex="0" aria-label="Extracted DOCX text preview">
          <pre>{preview.previewText}</pre>
        </div>
      )}
      {hasText && (
        <p className="word-preview-scope">
          <CheckCircleIcon size={15} weight="fill" aria-hidden="true" />
          <span>{preview.truncated ? `Showing the first ${preview.previewCharacterCount.toLocaleString()} of ${preview.characterCount.toLocaleString()} characters. The full readable text will be used.` : "All extracted readable text is shown above."}</span>
        </p>
      )}
      <p className="word-layout-note"><WarningCircleIcon size={15} weight="duotone" aria-hidden="true" /><span><strong>Clean reconstruction, not a Word replica.</strong> Images, columns, styling, and original pagination are not preserved.</span></p>
    </section>
  );
}

function WordPdfResultSummary({ result }) {
  const outcome = result?.wordOutcome;
  if (!outcome) return null;
  return (
    <div className="word-result-summary" role="status">
      <span><FileDocIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>Readable text rebuilt across {outcome.pageCount.toLocaleString()} {outcome.pageCount === 1 ? "page" : "pages"}</strong><small>{outcome.characterCount.toLocaleString()} characters from {outcome.paragraphCount.toLocaleString()} {outcome.paragraphCount === 1 ? "paragraph" : "paragraphs"} were placed into a clean PDF.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview the PDF to review line wrapping and page breaks before sharing it.</p>
    </div>
  );
}

function PowerPointPdfControls({ file, preview }) {
  if (!file) {
    return (
      <section className="word-preview-empty ppt-preview-empty" aria-labelledby="powerpoint-preview-title">
        <span><FilePptIcon size={21} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="powerpoint-preview-title">Preview the first slide</strong><small>Add one PPTX to check its slide count, order, and readable text.</small></div>
      </section>
    );
  }

  if (preview.state === "loading" || preview.file !== file) {
    return (
      <section className="word-preview-loading ppt-preview-loading" aria-live="polite">
        <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
        <div><strong>Reading slides locally</strong><small>Checking the PPTX structure and extracting text in presentation order.</small></div>
      </section>
    );
  }

  if (preview.state === "error") {
    return (
      <section className="word-preview-error ppt-preview-error" role="alert">
        <WarningCircleIcon size={21} weight="fill" aria-hidden="true" />
        <div><strong>Preview unavailable</strong><small>{preview.message}</small></div>
      </section>
    );
  }

  const hasSlides = preview.slideCount > 0;
  const firstSlideHasText = preview.firstSlideCharacterCount > 0;
  return (
    <section className="word-document-preview ppt-document-preview" aria-labelledby="powerpoint-preview-title">
      <header role="status" aria-live="polite">
        <span><EyeIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="powerpoint-preview-title">{hasSlides ? `${preview.slideCount.toLocaleString()} ${preview.slideCount === 1 ? "slide" : "slides"} found` : "No slides found"}</strong><small>{hasSlides ? "The slide order below will be used for the clean PDF." : "The output would contain a no-readable-text notice."}</small></div>
      </header>
      <dl className="word-preview-stats">
        <div><dt>Slides</dt><dd>{preview.slideCount.toLocaleString()}</dd></div>
        <div><dt>With text</dt><dd>{preview.slidesWithText.toLocaleString()}</dd></div>
        <div><dt>Characters</dt><dd>{preview.characterCount.toLocaleString()}</dd></div>
      </dl>
      {hasSlides && (
        <div className="ppt-first-slide">
          <div className="ppt-first-slide-heading"><span>First in order</span><strong>Slide 1</strong></div>
          {firstSlideHasText ? (
            <div className="word-preview-text ppt-slide-text" tabIndex="0" aria-label="Extracted text preview for PowerPoint slide 1">
              <pre>{preview.firstSlidePreview}</pre>
            </div>
          ) : (
            <div className="ppt-slide-empty"><FilePptIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No readable text on Slide 1</strong><small>Other slides with text will still be included in order.</small></span></div>
          )}
        </div>
      )}
      {firstSlideHasText && (
        <p className="word-preview-scope">
          <CheckCircleIcon size={15} weight="fill" aria-hidden="true" />
          <span>{preview.firstSlideTruncated ? `Showing the first ${preview.firstSlidePreviewCharacterCount.toLocaleString()} of ${preview.firstSlideCharacterCount.toLocaleString()} characters on Slide 1. All readable text from every slide will be used.` : "All readable text from Slide 1 is shown. Text from every slide will be used in order."}</span>
        </p>
      )}
      <p className="word-layout-note"><WarningCircleIcon size={15} weight="duotone" aria-hidden="true" /><span><strong>Text reconstruction, not a slide replica.</strong> Images, charts, themes, animations, and original placement are not preserved.</span></p>
    </section>
  );
}

function PowerPointPdfResultSummary({ result }) {
  const outcome = result?.powerpointOutcome;
  if (!outcome) return null;
  return (
    <div className="ppt-result-summary" role="status">
      <span><FilePptIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.slideCount.toLocaleString()} {outcome.slideCount === 1 ? "slide" : "slides"} rebuilt across {outcome.pageCount.toLocaleString()} PDF {outcome.pageCount === 1 ? "page" : "pages"}</strong><small>{outcome.characterCount.toLocaleString()} readable characters from {outcome.slidesWithText.toLocaleString()} {outcome.slidesWithText === 1 ? "slide" : "slides"} were placed in presentation order.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview the PDF to review slide labels, line wrapping, and page breaks before sharing it.</p>
    </div>
  );
}

function spreadsheetColumnLabel(columnIndex) {
  let remaining = Number(columnIndex) + 1;
  let label = "";
  while (remaining > 0) {
    const character = (remaining - 1) % 26;
    label = String.fromCharCode(65 + character) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

function SpreadsheetPdfControls({ file, preview, orientationSetting, orientation, onOrientationChange }) {
  const firstSheet = preview.firstSheet;
  const previewColumnCount = firstSheet?.previewRows?.reduce((maximum, row) => Math.max(maximum, row.length), 0) || 0;

  return (
    <div className="spreadsheet-pdf-controls">
      <SettingControl setting={orientationSetting} value={orientation} onChange={onOrientationChange} />

      {!file ? (
        <section className="word-preview-empty spreadsheet-preview-empty" aria-labelledby="spreadsheet-preview-title">
          <span><FileXlsIcon size={21} weight="duotone" aria-hidden="true" /></span>
          <div><strong id="spreadsheet-preview-title">Preview workbook values</strong><small>Add one XLS or XLSX to check its sheets, used cells, and PDF page count.</small></div>
        </section>
      ) : preview.state === "loading" || preview.file !== file ? (
        <section className="word-preview-loading spreadsheet-preview-loading" aria-live="polite">
          <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
          <div><strong>Reading workbook locally</strong><small>Checking worksheet ranges and readable saved values.</small></div>
        </section>
      ) : preview.state === "layout-loading" ? (
        <section className="word-preview-loading spreadsheet-preview-loading" aria-live="polite">
          <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
          <div><strong>{preview.sheetCount.toLocaleString()} {preview.sheetCount === 1 ? "sheet" : "sheets"} found</strong><small>Calculating the exact PDF page count for {orientation === "portrait" ? "portrait" : "landscape"} pages.</small></div>
        </section>
      ) : preview.state === "error" ? (
        <section className="word-preview-error spreadsheet-preview-error" role="alert">
          <WarningCircleIcon size={21} weight="fill" aria-hidden="true" />
          <div><strong>Preview unavailable</strong><small>{preview.message}</small></div>
        </section>
      ) : (
        <section className="word-document-preview spreadsheet-document-preview" aria-labelledby="spreadsheet-preview-title">
          <header role="status" aria-live="polite">
            <span><EyeIcon size={19} weight="duotone" aria-hidden="true" /></span>
            <div><strong id="spreadsheet-preview-title">{preview.sheetCount.toLocaleString()} {preview.sheetCount === 1 ? "sheet" : "sheets"} · {preview.pageCount.toLocaleString()} PDF {preview.pageCount === 1 ? "page" : "pages"}</strong><small>The count updates when you change page orientation.</small></div>
          </header>
          <dl className="word-preview-stats spreadsheet-preview-stats">
            <div><dt>Sheets</dt><dd>{preview.sheetCount.toLocaleString()}</dd></div>
            <div><dt>Range cells</dt><dd>{preview.usedCellSlots.toLocaleString()}</dd></div>
            <div><dt>PDF pages</dt><dd>{preview.pageCount.toLocaleString()}</dd></div>
          </dl>

          {firstSheet && (
            <div className="spreadsheet-first-sheet">
              <div className="ppt-first-slide-heading"><span>First worksheet</span><strong title={firstSheet.name}>{firstSheet.name}</strong></div>
              {firstSheet.previewRows.length && previewColumnCount ? (
                <div className="spreadsheet-table-wrap" tabIndex="0" aria-label={`Value preview for worksheet ${firstSheet.name}`}>
                  <table>
                    <thead><tr><th aria-label="Row number" />{Array.from({ length: previewColumnCount }, (_, index) => <th key={index} scope="col">{spreadsheetColumnLabel((firstSheet.startColumn || 0) + index)}</th>)}</tr></thead>
                    <tbody>
                      {firstSheet.previewRows.map((row, rowIndex) => (
                        <tr key={rowIndex}><th scope="row">{(firstSheet.startRow || 1) + rowIndex}</th>{Array.from({ length: previewColumnCount }, (_, columnIndex) => <td key={columnIndex} title={row[columnIndex] || undefined}>{row[columnIndex] || ""}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="ppt-slide-empty spreadsheet-sheet-empty"><FileXlsIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No saved values on the first sheet</strong><small>Other worksheets with saved values will still be included.</small></span></div>
              )}
            </div>
          )}

          {firstSheet?.previewRows.length > 0 && (
            <p className="word-preview-scope">
              <CheckCircleIcon size={15} weight="fill" aria-hidden="true" />
              <span>{firstSheet.previewTruncatedRows || firstSheet.previewTruncatedColumns ? `Showing up to the first 8 rows and 6 columns of ${firstSheet.name}. All bounded worksheet values will be used.` : `All saved values from the used range of ${firstSheet.name} are shown.`}</span>
            </p>
          )}
          <p className="word-layout-note"><WarningCircleIcon size={15} weight="duotone" aria-hidden="true" /><span><strong>Readable values, not an Excel replica.</strong> Styling, charts, merged-cell layout, formulas without saved results, and print settings are not preserved.</span></p>
        </section>
      )}
    </div>
  );
}

function SpreadsheetPdfResultSummary({ result }) {
  const outcome = result?.spreadsheetOutcome;
  if (!outcome) return null;
  return (
    <div className="spreadsheet-result-summary" role="status">
      <span><FileXlsIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>{outcome.sheetCount.toLocaleString()} {outcome.sheetCount === 1 ? "sheet" : "sheets"} rebuilt across {outcome.pageCount.toLocaleString()} PDF {outcome.pageCount === 1 ? "page" : "pages"}</strong><small>{outcome.usedCellSlots.toLocaleString()} used-range cells were laid out on {outcome.orientation} pages.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview the PDF to review table wrapping and page breaks before sharing it.</p>
    </div>
  );
}

function HtmlPdfControls({ file, preview, pageSizeSetting, pageSize, onPageSizeChange, htmlSetting, html, onHtmlChange }) {
  const normalizedPageSize = pageSize === "letter" ? "letter" : "a4";
  const pageSizeLabel = normalizedPageSize === "letter" ? "US Letter" : "A4";
  const previewMatchesInput = preview.file === file && Boolean(file || preview.markup === String(html || ""));

  return (
    <div className="html-pdf-controls">
      <SettingControl setting={pageSizeSetting} value={pageSize} onChange={onPageSizeChange} />

      {file ? (
        <div className="html-source-file" role="status">
          <span><FileHtmlIcon size={19} weight="duotone" aria-hidden="true" /></span>
          <div><strong title={file.name}>{file.name}</strong><small>This selected file is the source. Remove it from Files to paste HTML instead.</small></div>
        </div>
      ) : (
        <SettingControl setting={htmlSetting} value={html} onChange={onHtmlChange} />
      )}

      {!file && !String(html || "").trim() ? (
        <section className="word-preview-empty html-preview-empty" aria-labelledby="html-preview-title">
          <span><FileHtmlIcon size={21} weight="duotone" aria-hidden="true" /></span>
          <div><strong id="html-preview-title">Preview readable content</strong><small>Add an HTML file or paste markup to check its text and PDF page count.</small></div>
        </section>
      ) : ["loading", "layout-loading"].includes(preview.state) || !previewMatchesInput ? (
        <section className="word-preview-loading html-preview-loading" aria-live="polite">
          <SpinnerGapIcon size={21} className="spin" aria-hidden="true" />
          <div><strong>{preview.state === "layout-loading" ? "Readable text found" : "Checking HTML locally"}</strong><small>{preview.state === "layout-loading" ? `Calculating the exact ${pageSizeLabel} PDF page count.` : "Ignoring code and remote resources while extracting readable text."}</small></div>
        </section>
      ) : preview.state === "error" ? (
        <section className="word-preview-error html-preview-error" role="alert">
          <WarningCircleIcon size={21} weight="fill" aria-hidden="true" />
          <div><strong>Preview unavailable</strong><small>{preview.message}</small></div>
        </section>
      ) : (
        <section className="word-document-preview html-document-preview" aria-labelledby="html-preview-title">
          <header role="status" aria-live="polite">
            <span><EyeIcon size={19} weight="duotone" aria-hidden="true" /></span>
            <div><strong id="html-preview-title">{preview.pageCount.toLocaleString()}-page {pageSizeLabel} PDF</strong><small>{preview.characterCount ? "This readable content will be reconstructed in the PDF." : "No readable body text was found; the PDF will contain a clear notice."}</small></div>
          </header>
          <dl className="word-preview-stats html-preview-stats">
            <div><dt>PDF pages</dt><dd>{preview.pageCount.toLocaleString()}</dd></div>
            <div><dt>Characters</dt><dd>{preview.characterCount.toLocaleString()}</dd></div>
            <div><dt>Words</dt><dd>{preview.wordCount.toLocaleString()}</dd></div>
          </dl>
          {preview.characterCount > 0 && (
            <div className="word-preview-text html-preview-text" tabIndex="0" aria-label="Sanitized readable HTML text preview">
              <pre>{preview.previewText}</pre>
            </div>
          )}
          {preview.characterCount > 0 && (
            <p className="word-preview-scope">
              <CheckCircleIcon size={15} weight="fill" aria-hidden="true" />
              <span>{preview.truncated ? `Showing the first ${preview.previewCharacterCount.toLocaleString()} of ${preview.characterCount.toLocaleString()} characters. All ${preview.paragraphCount.toLocaleString()} readable ${preview.paragraphCount === 1 ? "section" : "sections"} will be used.` : `All ${preview.characterCount.toLocaleString()} readable characters across ${preview.paragraphCount.toLocaleString()} ${preview.paragraphCount === 1 ? "section are" : "sections are"} shown.`}</span>
            </p>
          )}
          <p className="word-layout-note html-safety-note"><ShieldCheckIcon size={15} weight="fill" aria-hidden="true" /><span><strong>Text only—no web page is opened.</strong> Scripts, forms, styles, frames, and remote resources are ignored; no URL is fetched.</span></p>
          <p className="word-layout-note"><WarningCircleIcon size={15} weight="duotone" aria-hidden="true" /><span><strong>Clean reconstruction, not a browser screenshot.</strong> Original layout, images, colors, fonts, and interactive controls are not preserved.</span></p>
        </section>
      )}
    </div>
  );
}

function HtmlPdfResultSummary({ result }) {
  const outcome = result?.htmlOutcome;
  if (!outcome) return null;
  const pageSizeLabel = outcome.pageSize === "letter" ? "US Letter" : "A4";
  return (
    <div className="html-result-summary" role="status">
      <span><FileHtmlIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>Readable HTML rebuilt across {outcome.pageCount.toLocaleString()} {pageSizeLabel} {outcome.pageCount === 1 ? "page" : "pages"}</strong><small>{outcome.characterCount.toLocaleString()} readable characters from {outcome.paragraphCount.toLocaleString()} {outcome.paragraphCount === 1 ? "section" : "sections"} were placed into a clean PDF.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview the PDF to review text, line wrapping, and page breaks before sharing it.</p>
    </div>
  );
}

function RepairPdfControls() {
  return (
    <section className="repair-explainer" aria-labelledby="repair-explainer-title">
      <header>
        <span><WrenchIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="repair-explainer-title">Create a fresh PDF structure</strong><small>Your original file is never changed.</small></div>
      </header>
      <ol>
        <li><span>1</span><div><strong>Read leniently</strong><small>Open recoverable objects even when the PDF index or trailing updates are damaged.</small></div></li>
        <li><span>2</span><div><strong>Rewrite completely</strong><small>Save a new, non-incremental PDF instead of copying the broken structure forward.</small></div></li>
        <li><span>3</span><div><strong>Review the result</strong><small>Preview the rebuilt file before replacing or sharing the original.</small></div></li>
      </ol>
      <p><WarningCircleIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>Repair cannot recreate missing bytes.</strong> Pages, images, fonts, or text that are no longer present in the source may remain unavailable.</span></p>
    </section>
  );
}

function ArchivePdfControls({ file, info }) {
  const pageLabel = info.state === "ready"
    ? `${info.pageCount.toLocaleString()} ${info.pageCount === 1 ? "page" : "pages"} will be rewritten`
    : info.state === "loading"
      ? "Reading the PDF page count locally…"
      : info.state === "error"
        ? info.message
        : "Choose one PDF to see the rewrite plan.";

  return (
    <section className="archive-rewrite-plan" aria-labelledby="archive-rewrite-title">
      <header>
        <span><ArchiveIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="archive-rewrite-title">Create an archive-friendly copy</strong><small>Your original PDF is never changed.</small></div>
      </header>

      <div className={`archive-rewrite-status ${info.state}`} role={info.state === "error" ? "alert" : "status"} aria-live="polite">
        {info.state === "loading"
          ? <SpinnerGapIcon size={17} className="spin" aria-hidden="true" />
          : info.state === "error"
            ? <WarningCircleIcon size={17} weight="fill" aria-hidden="true" />
            : <FilePdfIcon size={17} weight="duotone" aria-hidden="true" />}
        <span><strong>{file?.name || "Archive rewrite plan"}</strong><small>{pageLabel}</small></span>
      </div>

      <ul>
        <li><CheckCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Fresh PDF structure</strong><small>The document is saved as a new, compatibility-oriented PDF with object streams disabled.</small></span></li>
        <li><CheckCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Updated standard metadata</strong><small>Creator, producer, and document dates are refreshed for the new copy.</small></span></li>
        <li><CheckCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Pages stay in order</strong><small>The rewrite does not intentionally change the document’s page content or sequence.</small></span></li>
      </ul>

      <p><WarningCircleIcon size={17} weight="fill" aria-hidden="true" /><span><strong>Not certified PDF/A.</strong> This tool does not validate conformance, embed missing fonts or color profiles, or add standards-required archival metadata. Use a certified validator when formal PDF/A compliance is required.</span></p>
    </section>
  );
}

function RepairResultSummary() {
  return (
    <div className="repair-result-summary" role="status">
      <span><ArrowClockwiseIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>Fresh PDF structure created</strong><small>The recoverable document was fully rewritten locally. Your original file is unchanged.</small></div>
      <p><EyeIcon size={16} aria-hidden="true" />Preview every important page before replacing the source; missing content cannot be reconstructed.</p>
    </div>
  );
}

function ArchivePdfResultSummary({ result }) {
  const outcome = result?.archiveRewriteOutcome;
  if (!outcome) return null;
  return (
    <div className="archive-result-summary" role="status">
      <span><ArchiveIcon size={23} weight="duotone" aria-hidden="true" /></span>
      <div><strong>Archive-friendly copy created</strong><small>{outcome.pageCount.toLocaleString()} {outcome.pageCount === 1 ? "page" : "pages"} rewritten with refreshed standard metadata. Your original file is unchanged.</small></div>
      <p><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Still not certified PDF/A.</strong> Preview the result, then use a certified validator if formal archival conformance is required.</span></p>
    </div>
  );
}

function ComparePdfControls({ files, result }) {
  const left = files[0];
  const right = files[1];
  const stats = result?.comparison?.stats;

  return (
    <section className="compare-setup" aria-labelledby="compare-setup-title">
      <div className="compare-setup-heading">
        <span><ColumnsIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <div><strong id="compare-setup-title">Comparison order</strong><small>The first PDF is the original; the second is the revised version.</small></div>
      </div>
      <div className="compare-file-pair">
        <article className={left ? "ready" : "waiting"}>
          <b>01 · ORIGINAL</b>
          <strong title={left?.name}>{left?.name || "Choose the first PDF"}</strong>
          <small>Removed lines appear in coral.</small>
        </article>
        <ArrowRightIcon size={16} aria-hidden="true" />
        <article className={right ? "ready" : "waiting"}>
          <b>02 · REVISED</b>
          <strong title={right?.name}>{right?.name || "Choose the second PDF"}</strong>
          <small>Added lines appear in green.</small>
        </article>
      </div>
      {stats && (
        <div className={`compare-ready-summary ${stats.identical ? "identical" : "changed"}`} role="status">
          {stats.identical ? <CheckCircleIcon size={17} weight="fill" aria-hidden="true" /> : <ArrowsLeftRightIcon size={17} weight="bold" aria-hidden="true" />}
          <span><strong>{stats.identical ? "No text differences" : `${stats.changedLines.toLocaleString()} changed ${stats.changedLines === 1 ? "line" : "lines"}`}</strong><small>{stats.identical ? "The extracted selectable text matches." : `${stats.addedLines.toLocaleString()} added · ${stats.removedLines.toLocaleString()} removed`}</small></span>
        </div>
      )}
      <div className="compare-text-note"><TextTIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>Selectable text only.</strong> Scans, images, layout, fonts, and visual movement are not compared. Use OCR Reader first for scanned pages.</span></div>
    </section>
  );
}

function ComparisonResult({ result, headingRef, onReset }) {
  const comparison = result?.comparison;
  const [viewMode, setViewMode] = useState("changes");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    if (!comparison?.rows) return [];
    return viewMode === "all" ? comparison.rows : comparison.rows.filter((row) => row.kind !== "unchanged");
  }, [comparison, viewMode]);
  const pageCount = Math.max(1, Math.ceil(rows.length / COMPARISON_ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = rows.slice(currentPage * COMPARISON_ROWS_PER_PAGE, (currentPage + 1) * COMPARISON_ROWS_PER_PAGE);
  const firstVisible = rows.length ? currentPage * COMPARISON_ROWS_PER_PAGE + 1 : 0;
  const lastVisible = Math.min(rows.length, (currentPage + 1) * COMPARISON_ROWS_PER_PAGE);

  useEffect(() => {
    setPage(0);
  }, [result?.id, viewMode]);

  if (!comparison?.stats) {
    return <div className="error-card" role="alert"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" /><span><strong>Comparison view unavailable</strong>The HTML report is still available to download.</span></div>;
  }

  const { stats } = comparison;
  const headline = stats.identical
    ? "No text differences found"
    : `${stats.changedLines.toLocaleString()} changed ${stats.changedLines === 1 ? "line" : "lines"}`;

  return (
    <section className="comparison-reader-card" aria-labelledby="comparison-reader-title">
      <header className="comparison-reader-header">
        <span><ColumnsIcon size={24} weight="duotone" aria-hidden="true" /></span>
        <div><h3 id="comparison-reader-title" ref={headingRef} tabIndex="-1">{headline}</h3><p>Compared locally · held only in this tab</p></div>
        <b>TEXT DIFF</b>
      </header>

      <div className="comparison-file-headings" aria-label="Compared PDF order">
        <span><b>ORIGINAL</b><strong title={comparison.leftName}>{comparison.leftName}</strong></span>
        <ArrowRightIcon size={15} aria-hidden="true" />
        <span><b>REVISED</b><strong title={comparison.rightName}>{comparison.rightName}</strong></span>
      </div>

      <div className="comparison-stat-grid" aria-label="Comparison summary">
        <span className="removed"><FileMinusIcon size={17} weight="duotone" aria-hidden="true" /><span><strong>{stats.removedLines.toLocaleString()}</strong><small>removed</small></span></span>
        <span className="added"><FilePlusIcon size={17} weight="duotone" aria-hidden="true" /><span><strong>{stats.addedLines.toLocaleString()}</strong><small>added</small></span></span>
        <span className="same"><CheckCircleIcon size={17} weight="duotone" aria-hidden="true" /><span><strong>{stats.unchangedLines.toLocaleString()}</strong><small>unchanged</small></span></span>
      </div>

      <div className="comparison-view-toolbar">
        <div role="group" aria-label="Comparison lines to show">
          <button type="button" aria-pressed={viewMode === "changes"} onClick={() => setViewMode("changes")}>Changes only</button>
          <button type="button" aria-pressed={viewMode === "all"} onClick={() => setViewMode("all")}>All lines</button>
        </div>
        <small aria-live="polite">{rows.length ? `Showing ${firstVisible.toLocaleString()}–${lastVisible.toLocaleString()} of ${rows.length.toLocaleString()} ${viewMode === "all" ? "lines" : "changed lines"}` : "No changed lines to show"}</small>
      </div>

      <div className="comparison-diff" role="list" aria-label={viewMode === "all" ? "All compared text lines" : "Changed text lines"}>
        <div className="comparison-diff-labels" aria-hidden="true"><span /><span>OLD</span><span>NEW</span><span>SELECTABLE TEXT</span></div>
        {visibleRows.map((row, index) => {
          const marker = row.kind === "added" ? "+" : row.kind === "removed" ? "−" : "";
          const accessibleKind = row.kind === "added" ? "Added" : row.kind === "removed" ? "Removed" : "Unchanged";
          return (
            <div className={`comparison-row ${row.kind}`} role="listitem" key={`${currentPage}-${index}-${row.leftLine ?? "x"}-${row.rightLine ?? "x"}`} aria-label={`${accessibleKind} line. Original ${row.leftLine ?? "not present"}; revised ${row.rightLine ?? "not present"}. ${row.text || "Blank line"}`}>
              <b aria-hidden="true">{marker}</b>
              <span aria-hidden="true">{row.leftLine ?? ""}</span>
              <span aria-hidden="true">{row.rightLine ?? ""}</span>
              <code>{row.text || " "}</code>
            </div>
          );
        })}
        {!visibleRows.length && (
          <div className="comparison-empty"><CheckCircleIcon size={22} weight="duotone" aria-hidden="true" /><span><strong>{stats.identical ? "The selectable text matches" : "No changed lines in this view"}</strong><small>{stats.identical ? "Switch to All lines to review the matching text." : "Choose All lines to include unchanged context."}</small></span></div>
        )}
      </div>

      {pageCount > 1 && (
        <nav className="comparison-pagination" aria-label="Comparison result pages">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ArrowLeftIcon size={14} aria-hidden="true" />Previous</button>
          <span aria-live="polite">Page {currentPage + 1} of {pageCount}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next<ArrowRightIcon size={14} aria-hidden="true" /></button>
        </nav>
      )}

      <div className="comparison-reader-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The PDFs and extracted text stay in this tab. The downloadable report is self-contained and has no scripts or external resources.</span></div>
      <footer className="comparison-reader-actions">
        <span><strong>Need to share or archive it?</strong><small>Download the complete local HTML report.</small></span>
        <button type="button" onClick={() => downloadResult(result)}><FileHtmlIcon size={17} aria-hidden="true" />Download HTML</button>
      </footer>
      <button className="start-another comparison-start-another" onClick={onReset}>Compare another pair</button>
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

const imageCompressionPresets = [
  { value: 55, label: "Compact", badge: "SMALLER", hint: "More compression", icon: FeatherIcon },
  { value: 82, label: "Balanced", badge: "RECOMMENDED", hint: "Good detail", icon: ScalesIcon },
  { value: 92, label: "Sharp", badge: "DETAIL", hint: "Larger file", icon: SparkleIcon },
];

function compressionInputFormat(file) {
  const type = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (type === "image/webp" || name.endsWith(".webp")) return "webp";
  return "jpg";
}

function useImageCompressionPreview(file, quality, enabled, tool) {
  const normalizedQuality = Math.max(20, Math.min(100, Math.round(Number(quality || 82))));
  const format = compressionInputFormat(file);
  const encodingQuality = format === "png" ? 82 : normalizedQuality;
  const [preview, setPreview] = useState({ state: "idle", file: null, quality: encodingQuality, sourceUrl: "", outputUrl: "", result: null, message: "" });

  useEffect(() => {
    if (!file || !enabled) {
      setPreview({ state: "idle", file: null, quality: encodingQuality, sourceUrl: "", outputUrl: "", result: null, message: "" });
      return undefined;
    }

    let cancelled = false;
    let sourceUrl = "";
    let outputUrl = "";
    setPreview({ state: "loading", file, quality: encodingQuality, sourceUrl: "", outputUrl: "", result: null, message: "" });
    const timer = window.setTimeout(() => {
      (async () => {
        await preflightToolFiles(tool, [file], { quality: encodingQuality });
        const { createImageCompressionPreview } = await import("./lib/image-processors.js");
        const result = await createImageCompressionPreview(file, encodingQuality);
        sourceUrl = URL.createObjectURL(file);
        outputUrl = URL.createObjectURL(result.blob);
        if (cancelled) {
          URL.revokeObjectURL(sourceUrl);
          URL.revokeObjectURL(outputUrl);
          sourceUrl = "";
          outputUrl = "";
          return;
        }
        setPreview({ state: "ready", file, quality: encodingQuality, sourceUrl, outputUrl, result, message: "" });
      })().catch((error) => {
        if (sourceUrl) {
          URL.revokeObjectURL(sourceUrl);
          sourceUrl = "";
        }
        if (outputUrl) {
          URL.revokeObjectURL(outputUrl);
          outputUrl = "";
        }
        if (!cancelled) {
          setPreview({ state: "error", file, quality: encodingQuality, sourceUrl: "", outputUrl: "", result: null, message: toFriendlyResourceError(error, "Compress Image")?.message || "This image could not be sampled safely." });
        }
      });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [enabled, encodingQuality, file, tool]);

  return preview;
}

function ImageCompressionControls({ files, setting, value, onChange, preview }) {
  const file = files[0];
  const batch = files.length > 1;
  const outcome = preview.state === "ready" ? preview.result?.imageCompressionOutcome : null;
  const percentMagnitude = Math.abs(outcome?.percent || 0);
  const percentLabel = percentMagnitude > 0 && percentMagnitude < 1 ? "<1%" : `${Math.round(percentMagnitude)}%`;
  const format = outcome?.format || compressionInputFormat(file);

  return (
    <section className="image-compression-controls" aria-labelledby="image-compression-quality-title">
      <fieldset>
        <legend id="image-compression-quality-title">Choose the quality</legend>
        <p>Start with Balanced, then use the exact local sample to decide whether you need a smaller or sharper result.</p>
        <div className="image-compression-presets">
          {imageCompressionPresets.map((preset) => {
            const PresetIcon = preset.icon;
            const selected = Number(value) === preset.value;
            return (
              <button type="button" key={preset.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange(preset.value)}>
                <span><PresetIcon size={18} weight="duotone" aria-hidden="true" /></span>
                <strong>{preset.label}<b>{preset.badge}</b></strong>
                <small>{preset.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="setting-field range-field image-compression-range" htmlFor="image-compression-quality">
        <span><strong>Fine-tune quality</strong><output>{value}%</output></span>
        <input id="image-compression-quality" type="range" min={setting.min} max={setting.max} step={setting.step || 1} value={value} onChange={(event) => onChange(event.target.value)} />
        <span className="range-scale" aria-hidden="true"><small>{setting.minLabel}</small><small>{setting.maxLabel}</small></span>
      </label>

      <div className="image-compression-preview" aria-live="polite">
        <div className="image-compression-preview-heading">
          <span><strong>Real encoded sample</strong><small>{file ? batch ? `Previewing ${file.name}, the first of ${files.length.toLocaleString()} images` : file.name : "Add an image to compare it"}</small></span>
          <EyeIcon size={17} aria-hidden="true" />
        </div>
        {preview.state === "ready" ? (
          <>
            <div className="image-compression-image-pair">
              <figure>
                <div><img src={preview.sourceUrl} alt={`Original ${file.name}`} /></div>
                <figcaption><span><strong>Original</strong><small>{formatBytes(file.size)}</small></span><b>{format.toUpperCase()}</b></figcaption>
              </figure>
              <ArrowRightIcon size={17} aria-hidden="true" />
              <figure>
                <div><img src={preview.outputUrl} alt={`${file.name} after local compression`} /></div>
                <figcaption><span><strong>{outcome.qualityApplies ? `${outcome.quality}% quality` : "Lossless re-encode"}</strong><small>{formatBytes(outcome.outputBytes)}</small></span><b>{outcome.format.toUpperCase()}</b></figcaption>
              </figure>
            </div>
            <div className={`image-compression-delta ${outcome.status}`} role="status">
              {outcome.status === "reduced" ? <FileArrowDownIcon size={18} weight="duotone" aria-hidden="true" /> : <WarningCircleIcon size={18} weight="fill" aria-hidden="true" />}
              <span><strong>{outcome.status === "reduced" ? `${percentLabel} smaller in this sample` : outcome.status === "increased" ? `${percentLabel} larger in this sample` : "Same size in this sample"}</strong><small>{outcome.status === "reduced" ? `${formatBytes(outcome.bytesSaved)} saved · ${outcome.width.toLocaleString()} × ${outcome.height.toLocaleString()} px` : "Try a lower quality or keep the original if saving space is the goal."}</small></span>
            </div>
          </>
        ) : preview.state === "loading" ? (
          <div className="image-compression-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Encoding this sample locally…</strong><small>The final processor will reuse these checked bytes.</small></span></div>
        ) : preview.state === "error" ? (
          <div className="image-compression-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>Sample unavailable</strong><small>{preview.message}</small></span></div>
        ) : (
          <div className="image-compression-preview-state"><ImagesIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No image selected</strong><small>Your before-and-after comparison will appear here.</small></span></div>
        )}
      </div>

      <div className={`image-compression-format-note ${format === "png" ? "lossless" : ""}`}>
        <ShieldCheckIcon size={17} weight="fill" aria-hidden="true" />
        <span>{format === "png" ? <><strong>PNG stays lossless.</strong> The quality control does not alter PNG pixels; re-encoding removes metadata and may not reduce the file.</> : <><strong>Same dimensions, less metadata.</strong> Quality affects JPG/WebP encoding while the image width and height stay unchanged.</>}</span>
      </div>
      {batch && <p className="image-compression-batch-note"><WarningCircleIcon size={15} aria-hidden="true" /><span>This is an exact result for the first image, not a guessed batch total. Other images can compress differently; the final ZIP reports its actual size.</span></p>}
    </section>
  );
}

function useImageSourceInspection(files, enabled, tool, mode) {
  const [inspection, setInspection] = useState({ state: "idle", file: null, files: null, metadata: [], sourceUrl: "", message: "" });

  useEffect(() => {
    if (!enabled || !files.length) {
      setInspection({ state: "idle", file: null, files: null, metadata: [], sourceUrl: "", message: "" });
      return undefined;
    }

    let cancelled = false;
    let sourceUrl = "";
    setInspection({ state: "loading", file: files[0], files, metadata: [], sourceUrl: "", message: "" });
    (async () => {
      const previewOptions = mode === "resize"
        ? { width: 1 }
        : mode === "upscale"
          ? { scale: IMAGE_UPSCALE_SCALES[0] }
        : mode === "crop"
          ? { aspectRatio: "free", cropScale: 100, focusX: 50, focusY: 50 }
          : { brightness: 100, contrast: 100, saturation: 100, warmth: 0, text: "", textColor: PHOTO_EDITOR_TEXT_COLORS[0] };
      const checked = await preflightToolFiles(tool, files, previewOptions);
      sourceUrl = URL.createObjectURL(files[0]);
      if (cancelled) {
        URL.revokeObjectURL(sourceUrl);
        sourceUrl = "";
        return;
      }
      setInspection({ state: "ready", file: files[0], files, metadata: checked.metadata, sourceUrl, message: "" });
    })().catch((error) => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
        sourceUrl = "";
      }
      if (!cancelled) {
        setInspection({ state: "error", file: files[0], files, metadata: [], sourceUrl: "", message: toFriendlyResourceError(error, tool.name)?.message || "These images could not be inspected safely." });
      }
    });

    return () => {
      cancelled = true;
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    };
  }, [enabled, files, mode, tool]);

  return inspection;
}

const photoEditorPresets = [
  { id: "original", label: "Original", hint: "Neutral", icon: ArrowClockwiseIcon, values: { brightness: 100, contrast: 100, saturation: 100, warmth: 0 } },
  { id: "bright", label: "Bright", hint: "Light and clean", icon: SparkleIcon, values: { brightness: 115, contrast: 100, saturation: 105, warmth: 0 } },
  { id: "punchy", label: "Punchy", hint: "Crisp color", icon: ScalesIcon, values: { brightness: 105, contrast: 120, saturation: 130, warmth: 0 } },
  { id: "warm", label: "Warm", hint: "Soft warmth", icon: PaletteIcon, values: { brightness: 105, contrast: 105, saturation: 110, warmth: 25 } },
];

function createPhotoEditorUiPlan(inspection, settings, limits) {
  if (inspection.state !== "ready") return { state: inspection.state, message: inspection.message || "", plan: null, format: "" };
  try {
    const first = inspection.metadata[0];
    const plan = getPhotoEditorPlan(first?.width, first?.height, settings, limits, `${first?.name || "The photo"} after editing`);
    return { state: "ready", message: "", plan, format: compressionInputFormat(inspection.file) };
  } catch (error) {
    return { state: "error", message: toFriendlyResourceError(error, "Photo Editor")?.message || "Reset the edits and try again.", plan: null, format: "" };
  }
}

function PhotoEditorAdjustment({ setting, value, onChange }) {
  const id = `photo-editor-${setting.key}`;
  return (
    <label className="photo-editor-adjustment" htmlFor={id}>
      <span><strong>{setting.label}</strong><output htmlFor={id}>{Number(value).toLocaleString()}{setting.suffix}</output></span>
      <input id={id} type="range" min={setting.min} max={setting.max} step={setting.step} value={value} onChange={(event) => onChange(setting.key, Number(event.target.value))} />
      <span className="range-endpoints" aria-hidden="true"><small>{setting.minLabel}</small><small>{setting.maxLabel}</small></span>
    </label>
  );
}

function PhotoEditorControls({ files, settings, settingsList, inspection, plan, onChange, onApply, onReset }) {
  const adjustmentSettings = settingsList.filter((setting) => Object.hasOwn(PHOTO_EDITOR_ADJUSTMENTS, setting.key));
  const captionSetting = settingsList.find((setting) => setting.key === "text");
  const captionColorSetting = settingsList.find((setting) => setting.key === "textColor");
  const currentPreset = photoEditorPresets.find((preset) => Object.entries(preset.values).every(([key, value]) => Number(settings[key]) === value));
  const caption = String(settings.text || "");
  const lightCaption = String(settings.textColor || PHOTO_EDITOR_TEXT_COLORS[0]).toLowerCase() === PHOTO_EDITOR_TEXT_COLORS[0];
  const imageFilter = plan.state === "ready" && plan.plan
    ? `brightness(${plan.plan.brightness}%) contrast(${plan.plan.contrast}%) saturate(${plan.plan.saturation}%) sepia(${plan.plan.warmth}%)`
    : "none";
  const unchanged = currentPreset?.id === "original" && !caption && lightCaption;

  return (
    <section className="photo-editor-controls" aria-labelledby="photo-editor-preview-title">
      <div className="photo-editor-preview-heading">
        <span><strong id="photo-editor-preview-title">Live edit</strong><small>{files[0] ? files[0].name : "Add one photo to preview every change"}</small></span>
        <button type="button" onClick={onReset} disabled={unchanged} aria-label="Reset all photo edits"><ArrowClockwiseIcon size={15} aria-hidden="true" />Reset all</button>
      </div>

      {plan.state === "ready" && plan.plan ? (
        <figure className="photo-editor-preview-figure">
          <div className="photo-editor-preview-stage">
            <div className="photo-editor-preview-canvas" style={{ "--photo-preview-ratio": plan.plan.width / plan.plan.height }}>
              <img src={inspection.sourceUrl} alt={`Live Photo Editor preview of ${files[0].name}`} style={{ filter: imageFilter }} />
              {caption && <span className={lightCaption ? "light" : "dark"}>{caption}</span>}
            </div>
          </div>
          <figcaption>Changes update here immediately. Export renders the full-size source locally and keeps its current image format.</figcaption>
        </figure>
      ) : plan.state === "loading" ? (
        <div className="photo-editor-preview-state" role="status"><SpinnerGapIcon size={20} className="spin" aria-hidden="true" /><span><strong>Opening the photo locally…</strong><small>No file data leaves this browser.</small></span></div>
      ) : plan.state === "error" ? (
        <div className="photo-editor-preview-state error" role="alert"><WarningCircleIcon size={20} weight="fill" aria-hidden="true" /><span><strong>This preview cannot be prepared safely</strong><small>{plan.message}</small></span></div>
      ) : (
        <div className="photo-editor-preview-state"><ImageSquareIcon size={21} weight="duotone" aria-hidden="true" /><span><strong>No photo selected</strong><small>Your live adjustments and caption will appear here.</small></span></div>
      )}

      <fieldset className="photo-editor-presets">
        <legend>Choose a starting look</legend>
        <div>
          {photoEditorPresets.map((preset) => {
            const PresetIcon = preset.icon;
            const selected = currentPreset?.id === preset.id;
            return (
              <button type="button" key={preset.id} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onApply(preset.values)}>
                <span><PresetIcon size={17} weight="duotone" aria-hidden="true" /></span>
                <strong>{preset.label}</strong>
                <small>{preset.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <details className="photo-editor-fine-tune">
        <summary><SlidersHorizontalIcon size={16} aria-hidden="true" /><span><strong>Fine-tune</strong><small>Brightness, contrast, color, and warmth</small></span><CaretRightIcon size={14} aria-hidden="true" /></summary>
        <div>{adjustmentSettings.map((setting) => <PhotoEditorAdjustment key={setting.key} setting={setting} value={settings[setting.key]} onChange={onChange} />)}</div>
      </details>

      <fieldset className="photo-editor-caption">
        <legend>Add a caption <small>Optional</small></legend>
        <label htmlFor="photo-editor-caption-text">
          <span className="visually-hidden">{captionSetting?.label || "Optional caption"}</span>
          <input id="photo-editor-caption-text" type="text" maxLength={captionSetting?.maxLength} value={caption} placeholder="Type a short caption" onChange={(event) => onChange("text", event.target.value)} />
          <small>{caption.length.toLocaleString()} / {Number(captionSetting?.maxLength || 500).toLocaleString()}</small>
        </label>
        <div role="group" aria-label="Caption color">
          {(captionColorSetting?.options || []).map((option) => {
            const selected = String(settings.textColor).toLowerCase() === String(option.value).toLowerCase();
            return <button type="button" key={option.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange("textColor", option.value)}><span style={{ background: option.value }} aria-hidden="true" />{option.label}</button>;
          })}
        </div>
      </fieldset>

      {plan.state === "ready" && plan.plan && (
        <div className="photo-editor-output-plan" aria-label={`Output ${plan.plan.width} by ${plan.plan.height} pixels in ${plan.format.toUpperCase()} format`}>
          <ImageSquareIcon size={18} weight="duotone" aria-hidden="true" />
          <span><strong>{plan.plan.width.toLocaleString()} × {plan.plan.height.toLocaleString()} px · {plan.format.toUpperCase()}</strong><small>{plan.plan.changed ? `${plan.plan.adjusted ? "Adjustments applied" : "Original color"}${plan.plan.captionCharacters ? ` · ${plan.plan.captionCharacters.toLocaleString()}-character caption` : ""}` : "No visual changes yet"}</small></span>
        </div>
      )}
      <p className="photo-editor-private-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The original stays untouched. Preview and export remain in this tab, and metadata is removed during local re-encoding.</span></p>
    </section>
  );
}

function useAnimatedGifInspection(files, enabled, tool) {
  const [inspection, setInspection] = useState({ state: "idle", files: null, metadata: [], urls: [], message: "" });

  useEffect(() => {
    if (!enabled || !files.length) {
      setInspection({ state: "idle", files: null, metadata: [], urls: [], message: "" });
      return undefined;
    }

    let cancelled = false;
    let urls = [];
    setInspection({ state: "loading", files, metadata: [], urls: [], message: "" });
    (async () => {
      const checked = await preflightToolFiles(tool, files, { delay: 900, loop: true });
      urls = files.map((file) => URL.createObjectURL(file));
      if (cancelled) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        urls = [];
        return;
      }
      setInspection({ state: "ready", files, metadata: checked.metadata, urls, message: "" });
    })().catch((error) => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls = [];
      if (!cancelled) {
        setInspection({ state: "error", files, metadata: [], urls: [], message: toFriendlyResourceError(error, "JPG to GIF")?.message || "These JPG frames could not be inspected safely." });
      }
    });

    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [enabled, files, tool]);

  return inspection;
}

function createAnimatedGifUiPlan(inspection, delay, loop, limits) {
  if (inspection.state !== "ready") return { state: inspection.state, message: inspection.message || "" };
  try {
    return { state: "ready", message: "", ...getAnimatedGifPlan(inspection.metadata, delay, loop, limits) };
  } catch (error) {
    return { state: "error", message: toFriendlyResourceError(error, "JPG to GIF")?.message || "Choose valid animation timing and try again." };
  }
}

function formatGifDuration(milliseconds) {
  const seconds = Number(milliseconds) / 1000;
  return `${Number.isInteger(seconds) ? seconds.toLocaleString() : seconds.toLocaleString(undefined, { maximumFractionDigits: 1 })} s`;
}

const gifTimingPresets = [
  { value: 300, label: "Quick", hint: "Fast motion", icon: LightningIcon },
  { value: 900, label: "Balanced", hint: "Easy to follow", icon: ScalesIcon },
  { value: 1500, label: "Slideshow", hint: "Longer pause", icon: TimerIcon },
];

function AnimatedGifControls({ files, setting, settings, inspection, plan, onChange }) {
  const [reducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const delay = Number(settings.delay);
  const activeIndex = plan.state === "ready" ? Math.min(frameIndex, plan.frameCount - 1) : 0;
  const currentUrl = inspection.urls[activeIndex] || "";

  useEffect(() => {
    setFrameIndex(0);
    setPlaying(inspection.state === "ready" && inspection.urls.length > 1 && !reducedMotion);
  }, [inspection.files, inspection.state, inspection.urls.length, reducedMotion]);

  useEffect(() => {
    if (!playing || plan.state !== "ready" || plan.frameCount < 2) return undefined;
    const timer = window.setTimeout(() => {
      setFrameIndex((current) => {
        if (current + 1 < plan.frameCount) return current + 1;
        if (plan.loop) return 0;
        setPlaying(false);
        return current;
      });
    }, plan.delayMs);
    return () => window.clearTimeout(timer);
  }, [frameIndex, plan.delayMs, plan.frameCount, plan.loop, plan.state, playing]);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const togglePreview = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (plan.state === "ready" && activeIndex === plan.frameCount - 1 && !plan.loop) setFrameIndex(0);
    setPlaying(true);
  };

  return (
    <section className="image-gif-controls" aria-labelledby="image-gif-timing-title">
      <fieldset>
        <legend id="image-gif-timing-title">Choose the pace</legend>
        <p>Pick how long each JPG stays on screen. The preview below uses the same frame order and timing.</p>
        <div className="image-gif-presets">
          {gifTimingPresets.map((preset) => {
            const PresetIcon = preset.icon;
            const selected = delay === preset.value;
            return (
              <button type="button" key={preset.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange("delay", preset.value)}>
                <span><PresetIcon size={18} weight="duotone" aria-hidden="true" /></span>
                <strong>{preset.label}</strong>
                <small>{preset.value.toLocaleString()} ms · {preset.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="setting-field range-field image-gif-range" htmlFor="image-gif-delay">
        <span><strong>Exact timing</strong><output>{delay.toLocaleString()} ms</output></span>
        <input id="image-gif-delay" type="range" min={setting.min} max={setting.max} step={setting.step || 100} value={settings.delay} onChange={(event) => onChange("delay", Number(event.target.value))} />
        <span className="range-endpoints"><small>{setting.min.toLocaleString()} ms</small><small>{setting.max.toLocaleString()} ms</small></span>
      </label>

      <button type="button" className={`image-gif-loop ${settings.loop ? "selected" : ""}`} aria-pressed={Boolean(settings.loop)} onClick={() => onChange("loop", !settings.loop)}>
        <span><RepeatIcon size={19} weight="duotone" aria-hidden="true" /></span>
        <span><strong>{settings.loop ? "Loop continuously" : "Play once"}</strong><small>{settings.loop ? "Restart after the final frame." : "Stop on the final frame."}</small></span>
        <b aria-hidden="true">{settings.loop ? "ON" : "OFF"}</b>
      </button>

      <div className="image-gif-preview">
        <div className="image-gif-preview-heading">
          <span><strong>Animation preview</strong><small>{files.length ? `${files.length.toLocaleString()} ${files.length === 1 ? "frame" : "frames"} · source JPG preview` : "Add JPGs to build the sequence"}</small></span>
          <button type="button" onClick={togglePreview} disabled={plan.state !== "ready" || plan.frameCount < 2} aria-label={playing ? "Pause animation preview" : "Play animation preview"}>
            {playing ? <PauseIcon size={16} weight="fill" aria-hidden="true" /> : <PlayIcon size={16} weight="fill" aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        {plan.state === "ready" ? (
          <>
            <figure className="image-gif-preview-figure">
              <div style={{ "--gif-preview-ratio": plan.width / plan.height }}>
                <img src={currentUrl} alt={`Frame ${activeIndex + 1} preview: ${files[activeIndex]?.name || "JPG image"}`} />
                <span aria-hidden="true">FRAME {activeIndex + 1} / {plan.frameCount}</span>
              </div>
              <figcaption>The browser cycles the original JPGs. The exported GIF uses a 256-color palette, so some colors may shift.</figcaption>
            </figure>
            <div className="image-gif-thumbnails" role="list" aria-label="Animation frames">
              {inspection.urls.map((url, index) => (
                <span role="listitem" key={`${files[index]?.name}-${files[index]?.size}-${index}`}>
                  <button type="button" className={index === activeIndex ? "selected" : ""} aria-label={`Show frame ${index + 1}, ${files[index]?.name}`} aria-current={index === activeIndex ? "true" : undefined} onClick={() => { setFrameIndex(index); setPlaying(false); }}>
                    <img src={url} alt="" />
                    <b>{index + 1}</b>
                  </button>
                </span>
              ))}
            </div>
            <dl className="image-gif-plan" aria-label="Animated GIF output plan">
              <div><dt>Output</dt><dd>{plan.width.toLocaleString()} × {plan.height.toLocaleString()} px</dd></div>
              <div><dt>One cycle</dt><dd>{formatGifDuration(plan.durationMs)}</dd></div>
              <div><dt>Playback</dt><dd>{plan.loop ? "Continuous loop" : "Play once"}</dd></div>
            </dl>
            {plan.coverCroppedFrames > 0 && <p className="image-gif-crop-note"><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>{plan.coverCroppedFrames.toLocaleString()} {plan.coverCroppedFrames === 1 ? "frame has" : "frames have"} a different shape.</strong> Those frames are centered and cropped to match the first frame; nothing is stretched.</span></p>}
          </>
        ) : plan.state === "loading" ? (
          <div className="image-gif-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Reading JPG dimensions locally…</strong><small>No file data leaves this browser.</small></span></div>
        ) : plan.state === "error" ? (
          <div className="image-gif-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>This animation cannot be prepared safely</strong><small>{plan.message}</small></span></div>
        ) : (
          <div className="image-gif-preview-state"><ImagesIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No frames selected</strong><small>The animation, frame order, dimensions, and duration will appear here.</small></span></div>
        )}
      </div>

      {reducedMotion && plan.state === "ready" && <p className="image-gif-motion-note"><PlayIcon size={15} aria-hidden="true" /><span>Automatic preview is paused because reduced motion is enabled. Use Play whenever you want to review it.</span></p>}
      <p className="image-gif-private-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The JPGs and animation stay in this tab. The originals are never changed.</span></p>
    </section>
  );
}

function createImageResizePlan(inspection, width, limits) {
  if (inspection.state !== "ready") return { state: inspection.state, message: inspection.message || "", plans: [], first: null };
  try {
    const plans = inspection.metadata.map((item) => {
      const output = getProportionalResizeDimensions(item.width, item.height, width, limits, `${item.name} after resizing`);
      return {
        ...item,
        outputWidth: output.width,
        outputHeight: output.height,
        scalePercent: Math.round((output.width / item.width) * 100),
        direction: output.width < item.width ? "downsize" : output.width > item.width ? "enlarge" : "unchanged",
      };
    });
    return { state: "ready", message: "", plans, first: plans[0] || null };
  } catch (error) {
    return { state: "error", message: toFriendlyResourceError(error, "Resize Image")?.message || "Choose a smaller output width.", plans: [], first: null };
  }
}

const resizePresetIcons = [ArrowsInIcon, BrowserIcon, ImageSquareIcon, ArrowsOutIcon];

function ImageResizeControls({ files, setting, value, onChange, inspection, plan, limits }) {
  const numericValue = Number(value);
  const current = Number.isFinite(numericValue) ? numericValue : Number(setting.default || 1920);
  const step = Number(setting.step || 10);
  const changeBy = (direction) => onChange(Math.min(limits.maxOutputEdge, Math.max(1, current + (step * direction))));
  const first = plan.first;
  const batch = files.length > 1;
  const directionLabel = first?.direction === "downsize"
    ? `Downsize to ${first.scalePercent.toLocaleString()}%`
    : first?.direction === "enlarge"
      ? `Enlarge to ${first.scalePercent.toLocaleString()}%`
      : "Keep the current width";

  return (
    <section className="image-resize-controls" aria-labelledby="image-resize-width-title">
      <fieldset>
        <legend id="image-resize-width-title">Choose the new width</legend>
        <p>Pick a useful starting size or enter the exact pixel width. Height always follows automatically.</p>
        <div className="image-resize-presets">
          {setting.presets.map((preset, index) => {
            const PresetIcon = resizePresetIcons[index] || ResizeIcon;
            const selected = Number(preset.value) === Number(value);
            return (
              <button type="button" key={preset.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange(preset.value)}>
                <span><PresetIcon size={18} weight="duotone" aria-hidden="true" /></span>
                <strong>{preset.label}</strong>
                <small>{preset.value.toLocaleString()} px</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="image-resize-exact-setting">
        <label htmlFor="image-resize-width"><strong>Exact width</strong><small>1–{limits.maxOutputEdge.toLocaleString()} px, subject to the {Math.round(limits.maxOutputPixels / 1_000_000)} MP output safeguard</small></label>
        <div className="number-stepper">
          <button type="button" onClick={() => changeBy(-1)} disabled={current <= 1} aria-label="Decrease resize width">−</button>
          <div className="input-with-suffix">
            <input id="image-resize-width" type="number" inputMode="numeric" min="1" max={limits.maxOutputEdge} step={step} value={value} aria-describedby="image-resize-width-note" onChange={(event) => onChange(event.target.value)} />
            <span>px</span>
          </div>
          <button type="button" onClick={() => changeBy(1)} disabled={current >= limits.maxOutputEdge} aria-label="Increase resize width">+</button>
        </div>
      </div>

      <div className="image-resize-preview" aria-live="polite">
        <div className="image-resize-preview-heading">
          <span><strong>Proportional preview</strong><small>{files[0] ? batch ? `${files[0].name}, first of ${files.length.toLocaleString()} images` : files[0].name : "Add an image to see its exact target size"}</small></span>
          <ResizeIcon size={18} weight="duotone" aria-hidden="true" />
        </div>
        {plan.state === "ready" && first ? (
          <>
            <figure className="image-resize-preview-figure">
              <div><img src={inspection.sourceUrl} alt={`Proportional resize preview of ${files[0].name}`} /></div>
              <figcaption>Preview uses the original image; the export is re-rendered at the target pixels below.</figcaption>
            </figure>
            <div className="image-resize-dimensions" aria-label={`Original ${first.width} by ${first.height} pixels. Target ${first.outputWidth} by ${first.outputHeight} pixels.`}>
              <span><small>Original</small><strong>{first.width.toLocaleString()} × {first.height.toLocaleString()}</strong><b>px</b></span>
              <ArrowRightIcon size={17} aria-hidden="true" />
              <span><small>Target</small><strong>{first.outputWidth.toLocaleString()} × {first.outputHeight.toLocaleString()}</strong><b>px</b></span>
            </div>
            <div className={`image-resize-direction ${first.direction}`}>
              {first.direction === "downsize" ? <ArrowsInIcon size={18} weight="duotone" aria-hidden="true" /> : first.direction === "enlarge" ? <ArrowsOutIcon size={18} weight="duotone" aria-hidden="true" /> : <ResizeIcon size={18} weight="duotone" aria-hidden="true" />}
              <span><strong>{directionLabel}</strong><small>{first.direction === "enlarge" ? "Pixel dimensions increase, but resizing cannot invent missing detail." : "The aspect ratio stays locked, so the image will not stretch."}</small></span>
            </div>
          </>
        ) : plan.state === "loading" ? (
          <div className="image-resize-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Reading image dimensions locally…</strong><small>No file data leaves this browser.</small></span></div>
        ) : plan.state === "error" ? (
          <div className="image-resize-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>This width will not fit safely</strong><small>{plan.message}</small></span></div>
        ) : (
          <div className="image-resize-preview-state"><ImageSquareIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No image selected</strong><small>The original and target dimensions will appear here.</small></span></div>
        )}
      </div>

      {batch && plan.state === "ready" && <p className="image-resize-batch-note"><StackIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>One width, proportional heights.</strong> All {files.length.toLocaleString()} images will be {first.outputWidth.toLocaleString()} px wide; each keeps its own shape.</span></p>}
      <p id="image-resize-width-note" className="image-resize-format-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The original files stay untouched. Output keeps each image’s format; JPG/WebP use balanced local re-encoding and PNG stays lossless.</span></p>
    </section>
  );
}

function createImageUpscaleUiPlan(inspection, scale, limits) {
  if (inspection.state !== "ready") return { state: inspection.state, message: inspection.message || "", plans: [], first: null, scale: Number(scale) };
  try {
    const plans = inspection.metadata.map((item) => ({ ...item, ...getImageUpscalePlan(item.width, item.height, scale, limits, `${item.name} after upscaling`) }));
    return {
      state: "ready",
      message: "",
      plans,
      first: plans[0] || null,
      scale: Number(scale),
      outputPixelsTotal: plans.reduce((sum, item) => sum + item.outputPixels, 0),
      outputRgbaBytesTotal: plans.reduce((sum, item) => sum + item.outputRgbaBytes, 0),
    };
  } catch (error) {
    return { state: "error", message: toFriendlyResourceError(error, "Upscale Image")?.message || "Choose a smaller scale or image batch.", plans: [], first: null, scale: Number(scale) };
  }
}

function ImageUpscaleControls({ files, setting, value, onChange, inspection, plan, limits }) {
  const scale = Number(value);
  const batch = files.length > 1;
  const choices = IMAGE_UPSCALE_SCALES.map((choice) => {
    if (inspection.state !== "ready") return { scale: choice, available: true, first: null, message: "" };
    try {
      const plans = inspection.metadata.map((item) => getImageUpscalePlan(item.width, item.height, choice, limits, `${item.name} after upscaling`));
      return { scale: choice, available: true, first: plans[0] || null, message: "" };
    } catch (error) {
      return { scale: choice, available: false, first: null, message: toFriendlyResourceError(error, "Upscale Image")?.message || "This scale is above the safe output limit." };
    }
  });

  return (
    <section className="image-upscale-controls" aria-labelledby="image-upscale-scale-title">
      <fieldset>
        <legend id="image-upscale-scale-title">Choose how much larger</legend>
        <p>Scale both edges together. The exact output is checked before any large canvas is created.</p>
        <div className="image-upscale-choices">
          {setting.options.map((option) => {
            const choice = choices.find((item) => item.scale === Number(option.value));
            const selected = Number(option.value) === scale;
            return (
              <button type="button" key={option.value} className={selected ? "selected" : ""} aria-pressed={selected} disabled={choice?.available === false} title={choice?.available === false ? choice.message : undefined} onClick={() => onChange(Number(option.value))}>
                <span><ArrowsOutIcon size={20} weight="duotone" aria-hidden="true" /></span>
                <strong>{option.label}<b>{Number(option.value) ** 2}× pixels</b></strong>
                <small>{choice?.available === false ? `Above ${Math.round(limits.maxOutputPixels / 1_000_000)} MP limit` : choice?.first ? `${choice.first.width.toLocaleString()} × ${choice.first.height.toLocaleString()} px` : option.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="image-upscale-preview" aria-live="polite">
        <div className="image-upscale-preview-heading">
          <span><strong>Image and output plan</strong><small>{files[0] ? batch ? `${files[0].name}, first of ${files.length.toLocaleString()} images` : files[0].name : "Add an image to see its safe target size"}</small></span>
          <EyeIcon size={17} aria-hidden="true" />
        </div>
        {plan.state === "ready" && plan.first ? (
          <>
            <figure className="image-upscale-preview-figure">
              <div><img src={inspection.sourceUrl} alt={`Source preview for upscaling ${files[0].name}`} /><b>{plan.scale}× EACH EDGE</b></div>
              <figcaption>This checks the source and shape. The full output is resampled locally at the exact dimensions below.</figcaption>
            </figure>
            <div className="image-upscale-dimensions">
              <span><small>Original</small><strong>{plan.first.sourceWidth.toLocaleString()} × {plan.first.sourceHeight.toLocaleString()} px</strong></span>
              <ArrowRightIcon size={18} aria-hidden="true" />
              <span><small>Output</small><strong>{plan.first.width.toLocaleString()} × {plan.first.height.toLocaleString()} px</strong></span>
            </div>
            <dl className="image-upscale-plan" aria-label="Upscale output plan">
              <div><dt>Pixels</dt><dd>{plan.first.pixelMultiplier.toLocaleString()}× source</dd></div>
              <div><dt>Raw canvas</dt><dd>≈ {formatBytes(plan.first.outputRgbaBytes)}</dd></div>
              <div><dt>Format</dt><dd>{compressionInputFormat(files[0]).toUpperCase()}</dd></div>
            </dl>
          </>
        ) : plan.state === "loading" ? (
          <div className="image-upscale-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Reading image dimensions locally…</strong><small>No file data leaves this browser.</small></span></div>
        ) : plan.state === "error" ? (
          <div className="image-upscale-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>This scale is too large for safe local processing</strong><small>{plan.message}</small></span></div>
        ) : (
          <div className="image-upscale-preview-state"><ImageSquareIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No image selected</strong><small>Your source, target dimensions, and local canvas size will appear here.</small></span></div>
        )}
      </div>

      <p className="image-upscale-quality-note"><SparkleIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>Smoother scaling, not invented detail.</strong> High-quality resampling adds pixels and can reduce jagged edges, but it cannot reconstruct focus, texture, or information missing from the original.</span></p>
      {batch && plan.state === "ready" && <p className="image-upscale-batch-note"><StackIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>One scale for the batch.</strong> All {files.length.toLocaleString()} images grow {plan.scale}× on each edge; their shapes and formats stay unchanged.</span></p>}
      <p className="image-upscale-private-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The source files stay untouched. Resampling and export run entirely in this tab.</span></p>
    </section>
  );
}

function useBackgroundRemovalPreview(file, settings, enabled, tool) {
  const cleanup = String(settings.cleanup || "balanced");
  const background = String(settings.background || "transparent");
  const [preview, setPreview] = useState({ state: "idle", file: null, cleanup, background, sourceUrl: "", outputUrl: "", result: null, message: "" });

  useEffect(() => {
    if (!file || !enabled) {
      setPreview({ state: "idle", file: null, cleanup, background, sourceUrl: "", outputUrl: "", result: null, message: "" });
      return undefined;
    }

    let cancelled = false;
    let sourceUrl = "";
    let outputUrl = "";
    setPreview({ state: "loading", file, cleanup, background, sourceUrl: "", outputUrl: "", result: null, message: "" });
    const timer = window.setTimeout(() => {
      (async () => {
        getBackgroundRemovalProfile(cleanup);
        getBackgroundRemovalBackground(background);
        await preflightToolFiles(tool, [file], { cleanup, background });
        const { createBackgroundRemovalPreview } = await import("./lib/image-processors.js");
        const result = await createBackgroundRemovalPreview(file, { cleanup, background });
        sourceUrl = URL.createObjectURL(file);
        outputUrl = URL.createObjectURL(result.blob);
        if (cancelled) {
          URL.revokeObjectURL(sourceUrl);
          URL.revokeObjectURL(outputUrl);
          sourceUrl = "";
          outputUrl = "";
          return;
        }
        setPreview({ state: "ready", file, cleanup, background, sourceUrl, outputUrl, result, message: "" });
      })().catch((error) => {
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        sourceUrl = "";
        outputUrl = "";
        if (!cancelled) setPreview({ state: "error", file, cleanup, background, sourceUrl: "", outputUrl: "", result: null, message: toFriendlyResourceError(error, "Remove Background")?.message || "This cutout preview could not be created safely." });
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [background, cleanup, enabled, file, tool]);

  return preview;
}

function BackgroundRemovalControls({ files, settings, onChange, preview }) {
  const file = files[0];
  const batch = files.length > 1;
  const outcome = preview.state === "ready" ? preview.result : null;
  const outputBackground = BACKGROUND_REMOVAL_BACKGROUNDS.find(({ value }) => value === settings.background) || BACKGROUND_REMOVAL_BACKGROUNDS[0];
  const cornerWarning = outcome && outcome.cornerSpread > getBackgroundRemovalProfile(settings.cleanup).tolerance;

  return (
    <section className="background-removal-controls" aria-labelledby="background-cleanup-title">
      <fieldset>
        <legend id="background-cleanup-title">How much background should go?</legend>
        <p>The four corners set the background color. Start with Balanced, then compare the real local sample.</p>
        <div className="background-cleanup-choices">
          {BACKGROUND_REMOVAL_PROFILES.map((profile) => {
            const selected = profile.value === settings.cleanup;
            const ProfileIcon = profile.value === "light" ? FeatherIcon : profile.value === "balanced" ? ScalesIcon : MagicWandIcon;
            return (
              <button type="button" key={profile.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange("cleanup", profile.value)}>
                <span><ProfileIcon size={18} weight="duotone" aria-hidden="true" /></span>
                <strong>{profile.label}</strong>
                <small>{profile.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Choose the result background</legend>
        <div className="background-output-choices">
          {BACKGROUND_REMOVAL_BACKGROUNDS.map((option) => {
            const selected = option.value === settings.background;
            return (
              <button type="button" key={option.value} className={`${option.value} ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => onChange("background", option.value)}>
                <span>{option.value === "transparent" ? <CheckerboardIcon size={18} weight="duotone" aria-hidden="true" /> : <PaintBucketIcon size={18} weight="duotone" aria-hidden="true" />}</span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="background-removal-preview" aria-live="polite">
        <div className="background-removal-preview-heading">
          <span><strong>Before and after</strong><small>{file ? batch ? `${file.name}, first of ${files.length.toLocaleString()} images` : file.name : "Add an image to see the cutout"}</small></span>
          <SelectionBackgroundIcon size={18} weight="duotone" aria-hidden="true" />
        </div>
        {preview.state === "ready" && outcome ? (
          <>
            <div className="background-removal-image-pair">
              <figure><div><img src={preview.sourceUrl} alt={`Original ${file.name}`} /></div><figcaption><strong>Original</strong><small>{outcome.sourceWidth.toLocaleString()} × {outcome.sourceHeight.toLocaleString()} px</small></figcaption></figure>
              <ArrowRightIcon size={17} aria-hidden="true" />
              <figure className={`output-${outcome.background}`}><div><img src={preview.outputUrl} alt={`${file.name} with its background removed`} /></div><figcaption><strong>{outputBackground.label}</strong><small>{outcome.removedPercent}% opacity removed</small></figcaption></figure>
            </div>
            <dl className="background-removal-stats" aria-label="Cutout preview details">
              <div><dt>Detected</dt><dd><i style={{ backgroundColor: outcome.detectedColor }} aria-hidden="true" />{outcome.detectedColor.toUpperCase()}</dd></div>
              <div><dt>Cleanup</dt><dd>{getBackgroundRemovalProfile(outcome.cleanup).label}</dd></div>
              <div><dt>Preview</dt><dd>{outcome.previewScale < 1 ? `${outcome.previewWidth.toLocaleString()} × ${outcome.previewHeight.toLocaleString()} px` : "Full size"}</dd></div>
            </dl>
            {cornerWarning && <p className="background-removal-corner-warning"><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span><strong>The corner colors differ.</strong> This local method works best when one flat background reaches all four corners. Crop distractions or try Light cleanup.</span></p>}
          </>
        ) : preview.state === "loading" ? (
          <div className="background-removal-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Creating the cutout sample locally…</strong><small>The first image is bounded for a responsive preview.</small></span></div>
        ) : preview.state === "error" ? (
          <div className="background-removal-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>Cutout preview unavailable</strong><small>{preview.message}</small></span></div>
        ) : (
          <div className="background-removal-preview-state"><SelectionBackgroundIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No image selected</strong><small>Your original and cutout sample will appear here.</small></span></div>
        )}
      </div>

      {batch && preview.state === "ready" && <p className="background-removal-batch-note"><StackIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>First-image preview, one rule for the batch.</strong> Every image samples its own four corners and uses the same {getBackgroundRemovalProfile(settings.cleanup).label.toLowerCase()} cleanup.</span></p>}
      <p className="background-removal-method-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span><strong>Local flat-color cutout.</strong> This is not an AI subject detector. It removes colors similar to the sampled corners and keeps the original dimensions; files never leave this tab.</span></p>
    </section>
  );
}

const cropRatioIcons = {
  free: CropIcon,
  "1:1": ImageSquareIcon,
  "4:3": SelectionBackgroundIcon,
  "16:9": BrowserIcon,
};

const cropRatioNames = {
  free: "Original shape",
  "1:1": "Square",
  "4:3": "Standard 4:3",
  "16:9": "Wide 16:9",
};

function createImageCropPlan(inspection, settings, limits) {
  if (inspection.state !== "ready") return { state: inspection.state, message: inspection.message || "", plans: [], first: null };
  try {
    const plans = inspection.metadata.map((item) => {
      const crop = getImageCropPlan(
        item.width,
        item.height,
        settings.aspectRatio,
        settings.cropScale,
        settings.focusX,
        settings.focusY,
        limits,
        `${item.name} after cropping`,
      );
      return { ...item, crop, outputWidth: crop.width, outputHeight: crop.height };
    });
    return { state: "ready", message: "", plans, first: plans[0] || null };
  } catch (error) {
    return { state: "error", message: toFriendlyResourceError(error, "Crop Image")?.message || "Reset the crop and try again.", plans: [], first: null };
  }
}

function getCropFocusLabel(plan) {
  if (!plan) return "Centered";
  const horizontal = plan.crop.width >= plan.crop.sourceWidth || Math.abs(plan.crop.focusX - 50) < 12
    ? "center"
    : plan.crop.focusX < 50 ? "left" : "right";
  const vertical = plan.crop.height >= plan.crop.sourceHeight || Math.abs(plan.crop.focusY - 50) < 12
    ? "center"
    : plan.crop.focusY < 50 ? "top" : "bottom";
  if (horizontal === "center" && vertical === "center") return "Centered";
  if (horizontal === "center") return `${vertical[0].toUpperCase()}${vertical.slice(1)} focus`;
  if (vertical === "center") return `${horizontal[0].toUpperCase()}${horizontal.slice(1)} focus`;
  return `${vertical[0].toUpperCase()}${vertical.slice(1)} ${horizontal} focus`;
}

function ImageCropControls({ files, setting, settings, inspection, plan, onChange, onMove, onReset }) {
  const previewRef = useRef(null);
  const dragRef = useRef(null);
  const first = plan.first;
  const crop = first?.crop;
  const batch = files.length > 1;
  const selectedOption = setting.options.find((option) => option.value === settings.aspectRatio) || setting.options[0];
  const cropLeft = crop ? (crop.x / crop.sourceWidth) * 100 : 0;
  const cropTop = crop ? (crop.y / crop.sourceHeight) * 100 : 0;
  const cropWidth = crop ? (crop.width / crop.sourceWidth) * 100 : 100;
  const cropHeight = crop ? (crop.height / crop.sourceHeight) * 100 : 100;

  const moveCrop = (clientX, clientY) => {
    const drag = dragRef.current;
    const preview = previewRef.current;
    if (!drag || !preview || !crop) return;
    const bounds = preview.getBoundingClientRect();
    const frameWidth = bounds.width * (cropWidth / 100);
    const frameHeight = bounds.height * (cropHeight / 100);
    const availableX = Math.max(0, bounds.width - frameWidth);
    const availableY = Math.max(0, bounds.height - frameHeight);
    const left = Math.max(0, Math.min(availableX, clientX - bounds.left - drag.offsetX));
    const top = Math.max(0, Math.min(availableY, clientY - bounds.top - drag.offsetY));
    onMove(availableX ? Math.round((left / availableX) * 100) : 50, availableY ? Math.round((top / availableY) * 100) : 50);
  };

  const beginDrag = (event) => {
    if (event.button !== 0 || !crop) return;
    const frameBounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - frameBounds.left, offsetY: event.clientY - frameBounds.top };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const endDrag = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  };

  const nudgeCrop = (event) => {
    const step = event.shiftKey ? 10 : 2;
    const directions = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    onMove(
      Math.max(0, Math.min(100, Number(settings.focusX) + direction[0])),
      Math.max(0, Math.min(100, Number(settings.focusY) + direction[1])),
    );
  };

  return (
    <section className="image-crop-controls" aria-labelledby="image-crop-ratio-title">
      <fieldset>
        <legend id="image-crop-ratio-title">Choose the crop shape</legend>
        <p>The frame shows exactly what stays. Pick a shape, then drag it over the part you want.</p>
        <div className="image-crop-ratios">
          {setting.options.map((option) => {
            const RatioIcon = cropRatioIcons[option.value] || CropIcon;
            const selected = option.value === settings.aspectRatio;
            return (
              <button type="button" key={option.value} className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => onChange("aspectRatio", option.value)}>
                <span><RatioIcon size={18} weight="duotone" aria-hidden="true" /></span>
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="image-crop-preview" aria-live="polite">
        <div className="image-crop-preview-heading">
          <span><strong>Position the crop</strong><small>{files[0] ? batch ? `${files[0].name}, first of ${files.length.toLocaleString()} images` : files[0].name : "Add an image to position its crop"}</small></span>
          <button
            type="button"
            onClick={onReset}
            disabled={settings.aspectRatio === "free" && Number(settings.cropScale) === 100 && Number(settings.focusX) === 50 && Number(settings.focusY) === 50}
            aria-label="Reset crop selection"
          ><ArrowClockwiseIcon size={15} aria-hidden="true" />Reset</button>
        </div>
        {plan.state === "ready" && first ? (
          <>
            <figure className="image-crop-preview-figure">
              <div className="image-crop-stage">
                <div ref={previewRef} className="image-crop-canvas" style={{ "--crop-preview-ratio": first.width / first.height }}>
                  <img src={inspection.sourceUrl} alt={`Crop preview of ${files[0].name}`} draggable="false" />
                  <button
                    type="button"
                    className="image-crop-frame"
                    style={{ left: `${cropLeft}%`, top: `${cropTop}%`, width: `${cropWidth}%`, height: `${cropHeight}%` }}
                    aria-label={`Move crop frame. ${getCropFocusLabel(first)}. Use arrow keys for fine positioning; hold Shift for larger steps.`}
                    aria-describedby="image-crop-help"
                    onPointerDown={beginDrag}
                    onPointerMove={(event) => { if (dragRef.current?.pointerId === event.pointerId) moveCrop(event.clientX, event.clientY); }}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={nudgeCrop}
                  >
                    <ArrowsOutIcon size={19} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <figcaption id="image-crop-help">Drag the outlined frame, or focus it and use the arrow keys. Dimmed pixels are removed.</figcaption>
            </figure>
            <div className="image-crop-dimensions" aria-label={`Original ${first.width} by ${first.height} pixels. Cropped output ${crop.width} by ${crop.height} pixels.`}>
              <span><small>Original</small><strong>{first.width.toLocaleString()} × {first.height.toLocaleString()}</strong><b>px</b></span>
              <ArrowRightIcon size={17} aria-hidden="true" />
              <span><small>Cropped</small><strong>{crop.width.toLocaleString()} × {crop.height.toLocaleString()}</strong><b>px</b></span>
            </div>
            <div className="image-crop-plan-note">
              <CropIcon size={18} weight="duotone" aria-hidden="true" />
              <span><strong>{cropRatioNames[settings.aspectRatio] || selectedOption.label} · {crop.retainedPercent.toLocaleString()}% retained</strong><small>{getCropFocusLabel(first)}. The output uses only the pixels inside the frame.</small></span>
            </div>
          </>
        ) : plan.state === "loading" ? (
          <div className="image-crop-preview-state" role="status"><SpinnerGapIcon size={19} className="spin" aria-hidden="true" /><span><strong>Reading image dimensions locally…</strong><small>No file data leaves this browser.</small></span></div>
        ) : plan.state === "error" ? (
          <div className="image-crop-preview-state error" role="alert"><WarningCircleIcon size={19} weight="fill" aria-hidden="true" /><span><strong>This crop cannot be prepared safely</strong><small>{plan.message}</small></span></div>
        ) : (
          <div className="image-crop-preview-state"><ImageSquareIcon size={20} weight="duotone" aria-hidden="true" /><span><strong>No image selected</strong><small>The crop frame and exact output dimensions will appear here.</small></span></div>
        )}
      </div>

      <label className="image-crop-scale" htmlFor="image-crop-scale">
        <span><strong>Crop amount</strong><small>Keep more of the image</small></span>
        <b>{Number(settings.cropScale).toLocaleString()}%</b>
        <input id="image-crop-scale" type="range" min={IMAGE_CROP_SCALE_MIN_PERCENT} max={IMAGE_CROP_SCALE_MAX_PERCENT} step="1" value={settings.cropScale} onChange={(event) => onChange("cropScale", Number(event.target.value))} />
        <span className="range-endpoints" aria-hidden="true"><small>Tighter crop</small><small>More image</small></span>
      </label>

      {batch && plan.state === "ready" && <p className="image-crop-batch-note"><StackIcon size={16} weight="duotone" aria-hidden="true" /><span><strong>One crop style for the batch.</strong> All {files.length.toLocaleString()} images use this shape, crop amount, and focal position; exact pixel dimensions follow each source image.</span></p>}
      <p className="image-crop-format-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>The originals stay untouched. JPG/WebP are locally re-encoded, while PNG stays lossless.</span></p>
    </section>
  );
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

const PDF_FORM_FIELDS_PER_PAGE = 10;

function readablePdfFormFieldName(name) {
  const leaf = String(name).split(/[./]/).filter(Boolean).at(-1) || String(name);
  const spaced = leaf.replace(/[_-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Form field";
}

function samePdfFormValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

function PdfFormFieldControl({ field, value, modified, disabled, limits, onChange, onReset }) {
  const id = `pdf-form-field-${field.index}`;
  const displayName = readablePdfFormFieldName(field.name);
  const showExactName = displayName.toLocaleLowerCase() !== field.name.toLocaleLowerCase();
  const inputMaxLength = Math.min(field.maxLength || limits.maxPdfFormValueCharacters, limits.maxPdfFormValueCharacters);
  const selectedOptions = new Set(Array.isArray(value) ? value : value == null ? [] : [value]);
  const selectionIndex = typeof value === "string" ? field.options.indexOf(value) : -1;
  const controlsDisabled = disabled || field.readOnly || !field.supported;

  const fieldControl = field.type === "text"
    ? field.multiline
      ? <textarea id={id} rows={3} maxLength={inputMaxLength} aria-labelledby={`${id}-label`} aria-required={field.required} value={String(value ?? "")} disabled={controlsDisabled} onChange={(event) => onChange(event.target.value)} />
      : <input id={id} type="text" maxLength={inputMaxLength} aria-labelledby={`${id}-label`} aria-required={field.required} value={String(value ?? "")} disabled={controlsDisabled} onChange={(event) => onChange(event.target.value)} />
    : field.type === "checkbox"
      ? (
        <label className="pdf-form-checkbox" htmlFor={id}>
          <input id={id} type="checkbox" aria-labelledby={`${id}-label`} aria-required={field.required} checked={Boolean(value)} disabled={controlsDisabled} onChange={(event) => onChange(event.target.checked)} />
          <span><strong>{value ? "Checked" : "Unchecked"}</strong><small>Tap to change this field.</small></span>
        </label>
      )
      : ["dropdown", "radio"].includes(field.type)
        ? (
          <select id={id} aria-labelledby={`${id}-label`} aria-required={field.required} value={selectionIndex < 0 ? "" : String(selectionIndex)} disabled={controlsDisabled} onChange={(event) => onChange(event.target.value === "" ? null : field.options[Number(event.target.value)])}>
            <option value="">No selection</option>
            {field.options.map((option, index) => <option key={`${index}-${option}`} value={index}>{option || "(blank choice)"}</option>)}
          </select>
        )
        : field.type === "option-list"
          ? field.options.length <= 8
            ? (
              <div className="pdf-form-option-list" role="group" aria-labelledby={`${id}-label`}>
                {field.options.map((option, index) => (
                  <label key={`${index}-${option}`}>
                    <input
                      type="checkbox"
                      checked={selectedOptions.has(option)}
                      disabled={controlsDisabled}
                      onChange={(event) => {
                        const next = new Set(selectedOptions);
                        if (event.target.checked) next.add(option);
                        else next.delete(option);
                        onChange([...next]);
                      }}
                    />
                    <span>{option || "(blank choice)"}</span>
                  </label>
                ))}
              </div>
            )
            : (
              <select
                id={id}
                multiple
                size={Math.min(6, field.options.length)}
                aria-labelledby={`${id}-label`}
                aria-required={field.required}
                value={field.options.map((option, index) => selectedOptions.has(option) ? String(index) : null).filter(Boolean)}
                disabled={controlsDisabled}
                onChange={(event) => onChange([...event.target.selectedOptions].map((option) => field.options[Number(option.value)]))}
              >
                {field.options.map((option, index) => <option key={`${index}-${option}`} value={index}>{option || "(blank choice)"}</option>)}
              </select>
            )
          : null;

  return (
    <article className={`pdf-form-field ${modified ? "modified" : ""} ${controlsDisabled ? "disabled" : ""}`}>
      <header>
        <span>
          <strong id={`${id}-label`}>{displayName}{field.required && <b aria-label="required">Required</b>}</strong>
          {showExactName && <small title={field.name}>{field.name}</small>}
        </span>
        <span className="pdf-form-field-meta"><b>{field.typeLabel}</b>{modified && <em>Edited</em>}</span>
      </header>
      {fieldControl}
      {!field.supported && <p>This field stays untouched. Buttons and signature widgets are not fillable here.</p>}
      {field.readOnly && <p>This field is read-only in the source PDF and stays untouched.</p>}
      {modified && <button className="pdf-form-reset-field" type="button" onClick={onReset}>Reset to original</button>}
    </article>
  );
}

function PdfFormControls({ file, info, settings, limits, plan, onChange }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [editError, setEditError] = useState("");
  const parsed = useMemo(() => {
    try {
      return { values: parsePdfFormValues(settings.values, limits), error: "" };
    } catch (error) {
      return { values: {}, error: error?.message || "Advanced field JSON is not valid." };
    }
  }, [limits, settings.values]);

  useEffect(() => {
    setQuery("");
    setPage(0);
    setEditError("");
  }, [file]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingFields = info.fields.filter((field) => !normalizedQuery
    || field.name.toLocaleLowerCase().includes(normalizedQuery)
    || field.typeLabel.toLocaleLowerCase().includes(normalizedQuery)
    || readablePdfFormFieldName(field.name).toLocaleLowerCase().includes(normalizedQuery));
  const pageCount = Math.max(1, Math.ceil(matchingFields.length / PDF_FORM_FIELDS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleFields = matchingFields.slice(currentPage * PDF_FORM_FIELDS_PER_PAGE, (currentPage + 1) * PDF_FORM_FIELDS_PER_PAGE);
  const changedNames = new Set(Object.keys(parsed.values));

  useEffect(() => {
    if (page > pageCount - 1) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  const replaceValues = (next) => {
    const serialized = Object.keys(next).length ? JSON.stringify(next, null, 2) : "";
    try {
      parsePdfFormValues(serialized, limits);
      setEditError("");
      onChange("values", serialized);
    } catch (error) {
      setEditError(error?.message || "That field value is too large to keep safely.");
    }
  };

  const updateField = (field, value) => {
    if (parsed.error) return;
    const next = { ...parsed.values };
    if (samePdfFormValue(value, field.currentValue)) delete next[field.name];
    else next[field.name] = value;
    replaceValues(next);
  };

  const resetField = (name) => {
    const next = { ...parsed.values };
    delete next[name];
    replaceValues(next);
  };

  if (!file || info.state === "idle") {
    return (
      <div className="pdf-form-empty-state">
        <span><TextboxIcon size={22} weight="duotone" aria-hidden="true" /></span>
        <strong>Choose a fillable PDF</strong>
        <p>Its text fields, checkboxes, and choices will appear here automatically. No field names or JSON needed.</p>
      </div>
    );
  }

  if (info.state === "loading") {
    return <div className="pdf-form-source-status loading" role="status"><SpinnerGapIcon size={18} className="spin" aria-hidden="true" /><span><strong>Reading form fields</strong><small>Everything stays in this tab.</small></span></div>;
  }

  if (info.state === "error") {
    return <div className="pdf-form-source-status error" role="alert"><WarningCircleIcon size={18} weight="fill" aria-hidden="true" /><span><strong>Form fields could not be opened</strong><small>{info.message}</small></span></div>;
  }

  return (
    <section className="pdf-form-controls" aria-labelledby="pdf-form-fields-title">
      <div className="pdf-form-summary">
        <span><CheckCircleIcon size={18} weight="fill" aria-hidden="true" /><span><strong id="pdf-form-fields-title">{info.fieldCount.toLocaleString()} {info.fieldCount === 1 ? "field" : "fields"} ready</strong><small>Fill only what you want to change.</small></span></span>
        <b aria-live="polite">{changedNames.size.toLocaleString()} edited</b>
      </div>

      {info.fieldCount > PDF_FORM_FIELDS_PER_PAGE && (
        <label className="pdf-form-search" htmlFor="pdf-form-field-search">
          <MagnifyingGlassIcon size={15} aria-hidden="true" />
          <input id="pdf-form-field-search" type="search" value={query} placeholder="Find a field" onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        </label>
      )}

      {parsed.error && (
        <div className="pdf-form-inline-error" role="alert"><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span>{parsed.error}</span><button type="button" onClick={() => onChange("values", "")}>Reset JSON</button></div>
      )}
      {editError && <div className="pdf-form-inline-error" role="alert"><WarningCircleIcon size={16} weight="fill" aria-hidden="true" /><span>{editError}</span></div>}

      <div className="pdf-form-field-list">
        {visibleFields.map((field) => {
          const modified = changedNames.has(field.name);
          return (
            <PdfFormFieldControl
              key={field.name}
              field={field}
              value={modified ? parsed.values[field.name] : field.currentValue}
              modified={modified}
              disabled={Boolean(parsed.error)}
              limits={limits}
              onChange={(value) => updateField(field, value)}
              onReset={() => resetField(field.name)}
            />
          );
        })}
        {!visibleFields.length && <p className="pdf-form-no-match">No fields match “{query}”.</p>}
      </div>

      {pageCount > 1 && (
        <div className="pdf-form-pagination" aria-label="Form field pages">
          <button type="button" disabled={currentPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}><ArrowLeftIcon size={14} aria-hidden="true" />Previous</button>
          <span>Fields {(currentPage * PDF_FORM_FIELDS_PER_PAGE) + 1}–{Math.min((currentPage + 1) * PDF_FORM_FIELDS_PER_PAGE, matchingFields.length)} of {matchingFields.length}</span>
          <button type="button" disabled={currentPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>Next<ArrowRightIcon size={14} aria-hidden="true" /></button>
        </div>
      )}

      <fieldset className="pdf-form-export-mode">
        <legend>How should the form export?</legend>
        <div>
          <button type="button" className={!settings.flatten ? "selected" : ""} aria-pressed={!settings.flatten} onClick={() => onChange("flatten", false)}><strong>Keep it editable</strong><small>Recipients can change the fields later.</small></button>
          <button type="button" className={settings.flatten ? "selected" : ""} aria-pressed={Boolean(settings.flatten)} onClick={() => onChange("flatten", true)}><strong>Flatten fields</strong><small>Values become part of the page.</small></button>
        </div>
      </fieldset>

      <details className="pdf-form-advanced">
        <summary><KeyboardIcon size={15} aria-hidden="true" /><span>Advanced field JSON</span><CaretRightIcon size={13} aria-hidden="true" /></summary>
        <p>Optional. It contains only your edits and uses the exact PDF field names.</p>
        <textarea
          aria-label="Advanced field JSON"
          aria-invalid={Boolean(parsed.error)}
          rows={6}
          maxLength={getTextSettingLimit("pdf-forms", "values")}
          value={settings.values}
          placeholder={'{"Full name": "Asha Rao", "Agree": true}'}
          onChange={(event) => onChange("values", event.target.value)}
        />
        <button type="button" disabled={!settings.values} onClick={() => onChange("values", "")}>Clear all edits</button>
      </details>

      <div className={`pdf-form-plan ${plan.valid ? "ready" : "waiting"}`} role="status" aria-live="polite">
        {plan.valid ? <CheckCircleIcon size={17} weight="fill" aria-hidden="true" /> : <WarningCircleIcon size={17} aria-hidden="true" />}
        <span>{plan.message}</span>
      </div>
      <div className="pdf-form-private-note"><ShieldCheckIcon size={16} weight="fill" aria-hidden="true" /><span>Field names and values are read and edited only in this tab.</span></div>
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
  const [automaticDownloadRequested, setAutomaticDownloadRequested] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [processError, setProcessError] = useState("");
  const [fileIssue, setFileIssue] = useState(null);
  const [queueAnnouncement, setQueueAnnouncement] = useState(null);
  const passwordGate = useProtectedPdfGate(tool, files, setFiles);
  const usesPagePicker = ["split-pdf", "remove-pdf-pages", "extract-pdf-pages", "organize-pdf"].includes(tool.slug);
  const usesPdfOfficeTextPreview = ["pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel"].includes(tool.slug);
  const usesStickySettings = usesPagePicker || ["scan-to-pdf", "jpg-to-pdf", "pdf-to-jpg", "pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel", "pdf-to-pdfa", "compress-image", "resize-image", "upscale-image", "remove-image-background", "crop-image", "convert-from-jpg", "photo-editor", "word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf", "pdf-forms", "redact-pdf", "compare-pdf"].includes(tool.slug);
  const needsPdfPageInfo = usesPagePicker || pdfSettingPreviewTools.has(tool.slug) || ["redact-pdf", "pdf-to-jpg", "pdf-to-pdfa"].includes(tool.slug);
  const pageInfo = usePdfPageInfo(files[0], needsPdfPageInfo && passwordGate.ready, limits, tool.name);
  const pdfJpgPlan = useMemo(() => {
    if (tool.slug !== "pdf-to-jpg" || pageInfo.state !== "ready") return null;
    try {
      return createPdfJpgOutputPlan(pageInfo.pageCount, limits.maxGeneratedItems);
    } catch {
      return null;
    }
  }, [limits.maxGeneratedItems, pageInfo.pageCount, pageInfo.state, tool.slug]);
  const pdfFormInfo = usePdfFormInfo(files[0], tool.slug === "pdf-forms" && passwordGate.ready, limits);
  const wordPreview = useWordDocumentPreview(files[0], tool.slug === "word-to-pdf", tool, limits);
  const powerpointPreview = usePowerPointDocumentPreview(files[0], tool.slug === "powerpoint-to-pdf", tool, limits);
  const spreadsheetPreview = useSpreadsheetDocumentPreview(files[0], tool.slug === "excel-to-pdf", tool, limits, settings.orientation);
  const htmlPreview = useHtmlDocumentPreview(files[0], files[0] ? "" : settings.html, tool.slug === "html-to-pdf", tool, limits, settings.pageSize);
  const splitInfo = tool.slug === "split-pdf" ? pageInfo : { state: "idle", pageCount: 0, message: "" };
  const splitPlan = useMemo(() => tool.slug === "split-pdf" ? getSplitPlan(settings, splitInfo, limits) : null, [limits, settings, splitInfo, tool.slug]);
  const removePlan = useMemo(() => tool.slug === "remove-pdf-pages" ? getRemovePlan(settings, pageInfo) : null, [pageInfo, settings, tool.slug]);
  const extractPlan = useMemo(() => tool.slug === "extract-pdf-pages" ? getExtractPlan(settings, pageInfo, limits) : null, [limits, pageInfo, settings, tool.slug]);
  const organizePlan = useMemo(() => tool.slug === "organize-pdf" ? getOrganizePlan(settings, pageInfo, limits) : null, [limits, pageInfo, settings, tool.slug]);
  const pdfFormPlan = useMemo(() => {
    if (tool.slug !== "pdf-forms") return null;
    if (pdfFormInfo.state === "idle") return { valid: false, values: {}, changeCount: 0, message: "Add one fillable PDF to continue." };
    if (pdfFormInfo.state === "loading") return { valid: false, values: {}, changeCount: 0, message: "Reading form fields locally…" };
    if (pdfFormInfo.state === "error") return { valid: false, values: {}, changeCount: 0, message: pdfFormInfo.message };
    return createPdfFormPlan(settings.values, pdfFormInfo.fields, settings.flatten, limits);
  }, [limits, pdfFormInfo, settings.flatten, settings.values, tool.slug]);
  const redactionPlan = useMemo(() => tool.slug === "redact-pdf" ? getRedactionPlan(settings, pageInfo, limits) : null, [limits, pageInfo, settings, tool.slug]);
  const compressionEstimate = usePdfCompressionEstimate(files[0], settings.quality, passwordGate.inputPasswords?.[0], tool.slug === "compress-pdf" && passwordGate.ready && status !== "processing" && !results.length, limits);
  const pdfOfficeTextPreview = usePdfOfficeTextPreview(files[0], passwordGate.inputPasswords?.[0], usesPdfOfficeTextPreview && passwordGate.ready && status !== "processing" && !results.length, limits, tool.output[0]?.slice(1));
  const imageCompressionPreview = useImageCompressionPreview(files[0], settings.quality, tool.slug === "compress-image", tool);
  const imageResizeInspection = useImageSourceInspection(files, tool.slug === "resize-image", tool, "resize");
  const imageResizePlan = createImageResizePlan(imageResizeInspection, settings.width, limits);
  const imageUpscaleInspection = useImageSourceInspection(files, tool.slug === "upscale-image", tool, "upscale");
  const imageUpscalePlan = createImageUpscaleUiPlan(imageUpscaleInspection, settings.scale, limits);
  const backgroundRemovalPreview = useBackgroundRemovalPreview(files[0], settings, tool.slug === "remove-image-background", tool);
  const imageCropInspection = useImageSourceInspection(files, tool.slug === "crop-image", tool, "crop");
  const imageCropPlan = createImageCropPlan(imageCropInspection, settings, limits);
  const animatedGifInspection = useAnimatedGifInspection(files, tool.slug === "convert-from-jpg", tool);
  const animatedGifPlan = createAnimatedGifUiPlan(animatedGifInspection, settings.delay, settings.loop, limits);
  const photoEditorInspection = useImageSourceInspection(files, tool.slug === "photo-editor", tool, "photo");
  const photoEditorPlan = createPhotoEditorUiPlan(photoEditorInspection, settings, limits);
  const activeCompressionEstimate = tool.slug === "compress-pdf" && files[0] && (compressionEstimate.file !== files[0] || compressionEstimate.mode !== settings.quality)
    ? { state: "loading", file: files[0], mode: settings.quality }
    : compressionEstimate;
  const imageCompressionPreviewMatches = imageCompressionPreview.state === "ready"
    && imageCompressionPreview.file === files[0]
    && (imageCompressionPreview.result?.imageCompressionOutcome?.qualityApplies === false
      || imageCompressionPreview.result?.imageCompressionOutcome?.quality === Math.round(Number(settings.quality || 82)));
  const backgroundRemovalPreviewMatches = backgroundRemovalPreview.state === "ready"
    && backgroundRemovalPreview.file === files[0]
    && backgroundRemovalPreview.cleanup === settings.cleanup
    && backgroundRemovalPreview.background === settings.background;

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
    setAutomaticDownloadRequested(false);
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
      if (tool.slug === "pdf-forms") setSettings((current) => ({ ...current, values: "" }));
      if (tool.slug === "redact-pdf") setSettings((current) => ({ ...current, regions: "[]" }));
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
    if (tool.slug === "pdf-forms") setSettings((current) => ({ ...current, values: "" }));
    if (tool.slug === "redact-pdf") setSettings((current) => ({ ...current, regions: "[]" }));
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
      : tool.slug === "organize-pdf"
        ? Boolean(organizePlan?.valid)
        : true;
  const compressionReady = tool.slug !== "compress-pdf" || !hasRequiredInput || compressionEstimateAllowsProcessing(activeCompressionEstimate);
  const imageEncoderReady = tool.slug !== "convert-image" || (imageEncoderSupport.state === "ready" && imageEncoderSupport.formats[settings.format] === true);
  const pdfFormReady = tool.slug !== "pdf-forms" || !hasRequiredInput || Boolean(pdfFormPlan?.valid);
  const redactionReady = tool.slug !== "redact-pdf" || !hasRequiredInput || Boolean(redactionPlan?.valid);
  const pdfJpgReady = tool.slug !== "pdf-to-jpg" || !hasRequiredInput || Boolean(pdfJpgPlan);
  const archiveRewriteReady = tool.slug !== "pdf-to-pdfa" || !hasRequiredInput || pageInfo.state === "ready";
  const imageCompressionReady = tool.slug !== "compress-image" || !hasRequiredInput || imageCompressionPreviewMatches;
  const imageResizeReady = tool.slug !== "resize-image" || !hasRequiredInput || (imageResizeInspection.files === files && imageResizePlan.state === "ready");
  const imageUpscaleReady = tool.slug !== "upscale-image" || !hasRequiredInput || (imageUpscaleInspection.files === files && imageUpscalePlan.state === "ready");
  const backgroundRemovalReady = tool.slug !== "remove-image-background" || !hasRequiredInput || backgroundRemovalPreviewMatches;
  const imageCropReady = tool.slug !== "crop-image" || !hasRequiredInput || (imageCropInspection.files === files && imageCropPlan.state === "ready");
  const animatedGifReady = tool.slug !== "convert-from-jpg" || !hasRequiredInput || (animatedGifInspection.files === files && animatedGifPlan.state === "ready");
  const photoEditorReady = tool.slug !== "photo-editor" || !hasRequiredInput || (photoEditorInspection.files === files && photoEditorPlan.state === "ready");
  const pdfOfficeTextReady = !usesPdfOfficeTextPreview || !hasRequiredInput || (pdfOfficeTextPreview.state === "ready" && pdfOfficeTextPreview.file === files[0]);
  const wordPreviewReady = tool.slug !== "word-to-pdf" || !hasRequiredInput || (wordPreview.state === "ready" && wordPreview.file === files[0]);
  const powerpointPreviewReady = tool.slug !== "powerpoint-to-pdf" || !hasRequiredInput || (powerpointPreview.state === "ready" && powerpointPreview.file === files[0]);
  const spreadsheetPreviewReady = tool.slug !== "excel-to-pdf" || !hasRequiredInput || (spreadsheetPreview.state === "ready" && spreadsheetPreview.file === files[0]);
  const htmlPreviewReady = tool.slug !== "html-to-pdf" || !hasRequiredInput || (htmlPreview.state === "ready" && htmlPreview.file === files[0] && Boolean(files[0] || htmlPreview.markup === String(settings.html || "")));
  const canRun = hasRequiredInput && pageSelectionReady && passwordGate.ready && compressionReady && imageEncoderReady && pdfFormReady && redactionReady && pdfJpgReady && archiveRewriteReady && imageCompressionReady && imageResizeReady && imageUpscaleReady && backgroundRemovalReady && imageCropReady && animatedGifReady && photoEditorReady && pdfOfficeTextReady && wordPreviewReady && powerpointPreviewReady && spreadsheetPreviewReady && htmlPreviewReady && status !== "processing";
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
    : tool.slug === "organize-pdf" && !organizePlan?.valid
      ? organizePlan?.message
    : tool.slug === "pdf-forms" && !pdfFormPlan?.valid
      ? pdfFormPlan?.message
    : tool.slug === "redact-pdf" && !redactionPlan?.valid
      ? redactionPlan?.message
    : tool.slug === "pdf-to-jpg" && pageInfo.state === "loading"
      ? "Reading the PDF page count before JPG conversion."
    : tool.slug === "pdf-to-jpg" && pageInfo.state === "error"
      ? pageInfo.message
    : tool.slug === "pdf-to-pdfa" && pageInfo.state === "loading"
      ? "Reading the PDF page count before the archive-friendly rewrite."
    : tool.slug === "pdf-to-pdfa" && pageInfo.state === "error"
      ? pageInfo.message
    : tool.slug === "compress-image" && imageCompressionPreview.file === files[0] && imageCompressionPreview.state === "loading"
      ? "Encoding the representative image sample locally."
    : tool.slug === "compress-image" && imageCompressionPreview.file === files[0] && imageCompressionPreview.state === "error"
      ? imageCompressionPreview.message
    : tool.slug === "resize-image" && imageResizeInspection.files === files && imageResizePlan.state === "loading"
      ? "Reading the image dimensions locally."
    : tool.slug === "resize-image" && imageResizeInspection.files === files && imageResizePlan.state === "error"
      ? imageResizePlan.message
    : tool.slug === "upscale-image" && imageUpscaleInspection.files === files && imageUpscalePlan.state === "loading"
      ? "Reading the image dimensions and safe output plan locally."
    : tool.slug === "upscale-image" && imageUpscaleInspection.files === files && imageUpscalePlan.state === "error"
      ? imageUpscalePlan.message
    : tool.slug === "remove-image-background" && backgroundRemovalPreview.file === files[0] && backgroundRemovalPreview.state === "loading"
      ? "Creating the first-image cutout preview locally."
    : tool.slug === "remove-image-background" && backgroundRemovalPreview.file === files[0] && backgroundRemovalPreview.state === "error"
      ? backgroundRemovalPreview.message
    : tool.slug === "crop-image" && imageCropInspection.files === files && imageCropPlan.state === "loading"
      ? "Reading the image dimensions locally."
    : tool.slug === "crop-image" && imageCropInspection.files === files && imageCropPlan.state === "error"
      ? imageCropPlan.message
    : tool.slug === "convert-from-jpg" && animatedGifInspection.files === files && animatedGifPlan.state === "loading"
      ? "Reading the JPG frame dimensions locally."
    : tool.slug === "convert-from-jpg" && animatedGifInspection.files === files && animatedGifPlan.state === "error"
      ? animatedGifPlan.message
    : tool.slug === "photo-editor" && photoEditorInspection.files === files && photoEditorPlan.state === "loading"
      ? "Opening the photo locally for a safe live preview."
    : tool.slug === "photo-editor" && photoEditorInspection.files === files && photoEditorPlan.state === "error"
      ? photoEditorPlan.message
    : usesPdfOfficeTextPreview && pdfOfficeTextPreview.file === files[0] && pdfOfficeTextPreview.state === "loading"
      ? "Reading selectable text from every PDF page locally."
    : usesPdfOfficeTextPreview && pdfOfficeTextPreview.file === files[0] && pdfOfficeTextPreview.state === "error"
      ? pdfOfficeTextPreview.message
    : tool.slug === "word-to-pdf" && wordPreview.file === files[0] && wordPreview.state === "loading"
      ? "Reading and checking the DOCX locally before export."
    : tool.slug === "word-to-pdf" && wordPreview.file === files[0] && wordPreview.state === "error"
      ? wordPreview.message
    : tool.slug === "powerpoint-to-pdf" && powerpointPreview.file === files[0] && powerpointPreview.state === "loading"
      ? "Reading and checking the PPTX locally before export."
    : tool.slug === "powerpoint-to-pdf" && powerpointPreview.file === files[0] && powerpointPreview.state === "error"
      ? powerpointPreview.message
    : tool.slug === "excel-to-pdf" && spreadsheetPreview.file === files[0] && ["loading", "layout-loading"].includes(spreadsheetPreview.state)
      ? spreadsheetPreview.state === "loading" ? "Reading and checking the workbook locally before export." : "Calculating the PDF page count for this orientation."
    : tool.slug === "excel-to-pdf" && spreadsheetPreview.file === files[0] && spreadsheetPreview.state === "error"
      ? spreadsheetPreview.message
    : tool.slug === "html-to-pdf" && ["loading", "layout-loading"].includes(htmlPreview.state)
      ? htmlPreview.state === "loading" ? "Checking the readable HTML content locally before export." : "Calculating the PDF page count for this page size."
    : tool.slug === "html-to-pdf" && htmlPreview.state === "error"
      ? htmlPreview.message
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
      const processOptions = {
        ...settings,
        inputPasswords: passwordGate.inputPasswords,
        outputPassword: passwordGate.outputPassword,
      };
      if (usesPdfOfficeTextPreview && pdfOfficeTextPreview.state === "ready" && pdfOfficeTextPreview.file === files[0]) {
        processOptions.pdfOfficeTextPages = pdfOfficeTextPreview.pages;
      }
      if (tool.slug === "compress-image" && imageCompressionPreviewMatches) {
        processOptions.compressionPreview = {
          file: files[0],
          result: imageCompressionPreview.result,
        };
      }
      setSettings((current) => clearSensitiveToolSettings(current, settingsList));
      const response = await runTool(tool, files, processOptions, (nextProgress) => {
        if (!dismissedRef.current) {
          setProgress(nextProgress);
          const message = accessibleProgressMessage(nextProgress.phase);
          setProgressAnnouncement((current) => current?.message === message ? current : { id: crypto.randomUUID(), message });
        }
      });
      if (dismissedRef.current) return;
      const automaticResult = getAutomaticDownloadResult(response.results, !inlineReaderTools.has(tool.slug));
      if (automaticResult) downloadResult(automaticResult);
      setResults(response.results);
      setAutomaticDownloadRequested(Boolean(automaticResult));
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
    : tool.slug === "summarize-pdf" && hasRequiredInput
      ? "Create summary"
    : tool.slug === "repair-pdf" && hasRequiredInput
      ? "Rebuild PDF"
    : tool.slug === "excel-to-pdf" && spreadsheetPreview.state === "ready"
      ? `Create ${spreadsheetPreview.pageCount.toLocaleString()}-page PDF`
    : tool.slug === "html-to-pdf" && htmlPreview.state === "ready" && Number.isInteger(htmlPreview.pageCount)
      ? `Create ${htmlPreview.pageCount.toLocaleString()}-page PDF`
    : tool.slug === "pdf-to-jpg" && pdfJpgPlan
      ? pdfJpgPlan.actionLabel
    : tool.slug === "pdf-to-word" && pdfOfficeTextPreview.state === "ready"
      ? `Create DOCX · ${pdfOfficeTextPreview.pageCount.toLocaleString()} ${pdfOfficeTextPreview.pageCount === 1 ? "section" : "sections"}`
    : tool.slug === "pdf-to-powerpoint" && pdfOfficeTextPreview.state === "ready"
      ? `Create PPTX · ${pdfOfficeTextPreview.pageCount.toLocaleString()} ${pdfOfficeTextPreview.pageCount === 1 ? "slide" : "slides"}`
    : tool.slug === "pdf-to-excel" && pdfOfficeTextPreview.state === "ready"
      ? `Create XLSX · ${pdfOfficeTextPreview.pageCount.toLocaleString()} ${pdfOfficeTextPreview.pageCount === 1 ? "sheet" : "sheets"}`
    : tool.slug === "pdf-to-pdfa" && pageInfo.state === "ready"
      ? `Rewrite ${pageInfo.pageCount.toLocaleString()}-page PDF`
    : tool.slug === "compress-image" && hasRequiredInput
      ? files.length === 1 ? "Compress image" : `Compress ${files.length.toLocaleString()} images`
    : tool.slug === "resize-image" && hasRequiredInput && imageResizePlan.state === "ready"
      ? files.length === 1
        ? `Resize to ${imageResizePlan.first.outputWidth.toLocaleString()} px`
        : `Resize ${files.length.toLocaleString()} images to ${imageResizePlan.first.outputWidth.toLocaleString()} px`
    : tool.slug === "upscale-image" && hasRequiredInput && imageUpscalePlan.state === "ready"
      ? files.length === 1
        ? `Upscale to ${imageUpscalePlan.first.width.toLocaleString()} × ${imageUpscalePlan.first.height.toLocaleString()} px`
        : `Upscale ${files.length.toLocaleString()} images · ${imageUpscalePlan.scale}×`
    : tool.slug === "remove-image-background" && hasRequiredInput && backgroundRemovalPreviewMatches
      ? files.length === 1
        ? `Create ${getBackgroundRemovalBackground(settings.background).label} PNG`
        : `Create ${files.length.toLocaleString()} PNG cutouts`
    : tool.slug === "crop-image" && hasRequiredInput && imageCropPlan.state === "ready"
      ? files.length === 1
        ? `Crop to ${imageCropPlan.first.outputWidth.toLocaleString()} × ${imageCropPlan.first.outputHeight.toLocaleString()} px`
        : `Crop ${files.length.toLocaleString()} images · ${cropRatioNames[settings.aspectRatio] || "Custom"}`
    : tool.slug === "convert-from-jpg" && hasRequiredInput && animatedGifPlan.state === "ready"
      ? `Create ${animatedGifPlan.frameCount.toLocaleString()}-frame GIF`
    : tool.slug === "photo-editor" && hasRequiredInput && photoEditorPlan.state === "ready"
      ? `Save edited ${photoEditorPlan.format.toUpperCase()}`
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
    : tool.slug === "pdf-forms" && pdfFormPlan?.valid
      ? pdfFormPlan.changeCount
        ? `Fill ${pdfFormPlan.changeCount.toLocaleString()} ${pdfFormPlan.changeCount === 1 ? "field" : "fields"}`
        : "Flatten PDF form"
    : tool.slug === "redact-pdf" && redactionPlan?.valid
      ? `Redact ${redactionPlan.regionCount.toLocaleString()} ${redactionPlan.regionCount === 1 ? "area" : "areas"}`
    : ["scan-to-pdf", "jpg-to-pdf"].includes(tool.slug) && hasRequiredInput
      ? `Create ${files.length.toLocaleString()}-page PDF`
    : tool.slug === "compare-pdf" && hasRequiredInput
      ? "Compare 2 PDFs"
    : tool.slug === "word-to-pdf" && hasRequiredInput
      ? "Create readable PDF"
    : tool.slug === "powerpoint-to-pdf" && hasRequiredInput
      ? "Create slide-text PDF"
    : tool.name;

  const updateSetting = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    clearResults();
    setStatus("idle");
    setProcessError("");
  };

  const updateSettings = (values) => {
    setSettings((current) => ({ ...current, ...values }));
    clearResults();
    setStatus("idle");
    setProcessError("");
  };

  const resetWorkbenchState = () => {
    passwordGate.resetForFileChange();
    clearResults();
    setFiles([]);
    setStatus("idle");
    setProcessError("");
    setFileIssue(null);
    setQueueAnnouncement(null);
  };

  return (
    <>
    <dialog ref={dialogRef} className={`workbench-dialog ${tool.slug === "split-pdf" ? "split-pdf-workbench" : ["remove-pdf-pages", "extract-pdf-pages", "organize-pdf"].includes(tool.slug) ? "remove-pages-workbench" : tool.slug === "redact-pdf" ? "redact-pdf-workbench" : tool.slug === "compare-pdf" ? "compare-pdf-workbench" : tool.slug === "pdf-to-jpg" ? "pdf-jpg-workbench" : tool.slug === "compress-image" ? "image-compression-workbench" : tool.slug === "resize-image" ? "image-resize-workbench" : tool.slug === "upscale-image" ? "image-upscale-workbench" : tool.slug === "remove-image-background" ? "background-removal-workbench" : tool.slug === "crop-image" ? "image-crop-workbench" : tool.slug === "convert-from-jpg" ? "image-gif-workbench" : tool.slug === "photo-editor" ? "photo-editor-workbench" : usesPdfOfficeTextPreview ? "pdf-office-text-workbench" : ["word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"].includes(tool.slug) ? "word-pdf-workbench" : ""}`} onCancel={(event) => { event.preventDefault(); closeWorkbench(); }} aria-labelledby="workbench-title" aria-describedby="workbench-description">
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

        <div className={`workbench-body ${usesPagePicker ? "page-picker-body" : ""} ${tool.slug === "split-pdf" ? "split-planner-body" : tool.slug === "remove-pdf-pages" ? "remove-pages-planner-body" : tool.slug === "extract-pdf-pages" ? "extract-pages-planner-body" : tool.slug === "organize-pdf" ? "organize-pages-planner-body" : tool.slug === "redact-pdf" ? "redact-planner-body" : tool.slug === "compare-pdf" ? "compare-planner-body" : tool.slug === "pdf-to-jpg" ? "pdf-jpg-preview-body" : tool.slug === "compress-image" ? "image-compression-preview-body" : tool.slug === "resize-image" ? "image-resize-preview-body" : tool.slug === "upscale-image" ? "image-upscale-preview-body" : tool.slug === "remove-image-background" ? "background-removal-preview-body" : tool.slug === "crop-image" ? "image-crop-preview-body" : tool.slug === "convert-from-jpg" ? "image-gif-preview-body" : tool.slug === "photo-editor" ? "photo-editor-preview-body" : usesPdfOfficeTextPreview ? "pdf-office-text-preview-body" : ""}`}>
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
                {["scan-to-pdf", "jpg-to-pdf", "convert-from-jpg"].includes(tool.slug) ? (
                  <ImageSequenceFileQueue
                    files={files}
                    getFileId={getFileId}
                    moveFile={moveFile}
                    removeFile={removeFile}
                    reorderButtonsRef={reorderButtonsRef}
                    removeButtonsRef={removeButtonsRef}
                    mode={tool.slug === "convert-from-jpg" ? "gif" : "pdf"}
                  />
                ) : (
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
                )}
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
              <OcrReaderResult result={results[0]} headingRef={resultHeadingRef} onReset={resetWorkbenchState} />
            )}

            {results.length > 0 && ["summarize-pdf", "translate-pdf", "pdf-to-markdown"].includes(tool.slug) && (
              <TextReaderResult tool={tool} result={results[0]} limits={limits} headingRef={resultHeadingRef} onReset={resetWorkbenchState} />
            )}

            {results.length > 0 && tool.slug === "compare-pdf" && (
              <ComparisonResult result={results[0]} headingRef={resultHeadingRef} onReset={resetWorkbenchState} />
            )}

            {results.length > 0 && !inlineReaderTools.has(tool.slug) && (
              <div className="results-card">
                <div className="result-celebration"><span><CheckCircleIcon size={24} weight="fill" /></span><div><h3 ref={resultHeadingRef} tabIndex="-1">{results[0]?.compressionOutcome === "original-kept" ? "Your original is already smaller" : results[0]?.compressionOutcome === "protected-original" ? "Protected original is ready" : "Your result is ready"}</h3><p>{results[0]?.compressionOutcome === "original-kept" ? "No new file was created; the larger trial result was discarded locally." : results[0]?.compressionOutcome === "protected-original" ? "Compression was skipped, then fresh password protection was applied locally." : automaticDownloadRequested ? isPdfPreviewResult(results[0]) ? "Automatic download requested. Preview it or download it again below." : "Automatic download requested. Download it again below if needed." : "Created locally. Download the files before closing this tab."}</p></div></div>
                {tool.slug === "compress-pdf" && files[0] && results[0] && (
                  <CompressionResultSummary inputSize={files[0].size} result={results[0]} />
                )}
                {tool.slug === "compress-image" && <ImageCompressionResultSummary files={files} result={results[0]} />}
                {tool.slug === "resize-image" && <ImageResizeResultSummary result={results[0]} />}
                {tool.slug === "upscale-image" && <ImageUpscaleResultSummary result={results[0]} />}
                {tool.slug === "remove-image-background" && <BackgroundRemovalResultSummary result={results[0]} />}
                {tool.slug === "crop-image" && <ImageCropResultSummary result={results[0]} />}
                {tool.slug === "convert-from-jpg" && <AnimatedGifResultSummary result={results[0]} />}
                {tool.slug === "photo-editor" && <PhotoEditorResultSummary result={results[0]} />}
                {["scan-to-pdf", "jpg-to-pdf"].includes(tool.slug) && <ImagePdfResultSummary result={results[0]} />}
                {tool.slug === "repair-pdf" && results[0]?.repairOutcome === "full-rewrite" && <RepairResultSummary />}
                {tool.slug === "pdf-to-pdfa" && <ArchivePdfResultSummary result={results[0]} />}
                {tool.slug === "word-to-pdf" && <WordPdfResultSummary result={results[0]} />}
                {usesPdfOfficeTextPreview && <PdfOfficeTextResultSummary result={results[0]} />}
                {tool.slug === "powerpoint-to-pdf" && <PowerPointPdfResultSummary result={results[0]} />}
                {tool.slug === "excel-to-pdf" && <SpreadsheetPdfResultSummary result={results[0]} />}
                {tool.slug === "html-to-pdf" && <HtmlPdfResultSummary result={results[0]} />}
                {results.filter((result) => !result.noNewFile).map((result) => (
                  <div className="result-row" key={result.id}>
                    <span className="result-icon"><DownloadSimpleIcon size={19} /></span>
                    <span><strong>{result.name}</strong><small>{formatBytes(result.size)} · {result.details}</small></span>
                    <span className="result-actions">
                      {isPdfPreviewResult(result) && (
                        <button onClick={(event) => openResultPreview(result, event.currentTarget)} aria-label={`Preview ${result.name}`}><EyeIcon size={16} aria-hidden="true" />Preview</button>
                      )}
                      <button onClick={() => downloadResult(result)} aria-label={`Download ${result.name}`}>{automaticDownloadRequested ? "Download again" : "Download"}</button>
                    </span>
                  </div>
                ))}
                <button className="start-another" onClick={resetWorkbenchState}>Start another</button>
              </div>
            )}
          </section>

          <aside className={`settings-panel ${usesStickySettings ? "page-picker-settings-panel" : ""}`} aria-label="Tool settings">
            <div className="settings-scroll">
            <div className="settings-heading"><span>{["pdf-to-jpg", "pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel", "pdf-to-pdfa", "compress-image", "resize-image", "upscale-image", "remove-image-background", "crop-image", "convert-from-jpg", "photo-editor", "word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"].includes(tool.slug) ? tool.slug === "pdf-to-pdfa" ? <ArchiveIcon size={19} /> : <EyeIcon size={19} /> : <SlidersHorizontalIcon size={19} />}</span><div><h3>{tool.slug === "pdf-to-jpg" ? "Output preview" : tool.slug === "pdf-to-word" ? "Document preview" : tool.slug === "pdf-to-powerpoint" ? "Slide preview" : tool.slug === "pdf-to-excel" ? "Sheet preview" : tool.slug === "pdf-to-pdfa" ? "Rewrite plan" : tool.slug === "compress-image" ? "Compression preview" : tool.slug === "resize-image" ? "Resize preview" : tool.slug === "upscale-image" ? "Upscale preview" : tool.slug === "remove-image-background" ? "Cutout preview" : tool.slug === "crop-image" ? "Crop preview" : tool.slug === "convert-from-jpg" ? "Animation preview" : tool.slug === "photo-editor" ? "Photo preview" : tool.slug === "word-to-pdf" ? "Document preview" : tool.slug === "powerpoint-to-pdf" ? "Slide preview" : tool.slug === "excel-to-pdf" ? "Workbook preview" : tool.slug === "html-to-pdf" ? "Content preview" : "Settings"}</h3><p>{tool.slug === "pdf-to-jpg" ? "Review pages and JPG quality before export." : tool.slug === "pdf-to-word" ? "Check selectable text and DOCX sections." : tool.slug === "pdf-to-powerpoint" ? "Check selectable text and the PPTX slide plan." : tool.slug === "pdf-to-excel" ? "Check selectable text and the XLSX sheet plan." : tool.slug === "pdf-to-pdfa" ? "Review exactly what this archival rewrite can—and cannot—do." : tool.slug === "compress-image" ? "Compare real local bytes before running the batch." : tool.slug === "resize-image" ? "See exact target dimensions before the batch." : tool.slug === "upscale-image" ? "Check the exact pixel growth before local resampling." : tool.slug === "remove-image-background" ? "Compare the sampled corner color and real local cutout." : tool.slug === "crop-image" ? "Position the exact pixels you want to keep." : tool.slug === "convert-from-jpg" ? "Arrange, time, and play the JPG sequence before export." : tool.slug === "photo-editor" ? "See every adjustment and caption before export." : tool.slug === "word-to-pdf" ? "Check the readable text before export." : tool.slug === "powerpoint-to-pdf" ? "Check slide order and text before export." : tool.slug === "excel-to-pdf" ? "Check sheets, values, and page layout." : tool.slug === "html-to-pdf" ? "Check sanitized text and PDF pages." : "Fine-tune the local output."}</p></div></div>
            {tool.slug === "split-pdf" ? (
              <SplitPdfControls settings={settings} onChange={updateSetting} info={splitInfo} plan={splitPlan} limits={limits} />
            ) : tool.slug === "remove-pdf-pages" ? (
              <RemovePdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={removePlan} />
            ) : tool.slug === "extract-pdf-pages" ? (
              <ExtractPdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={extractPlan} limits={limits} />
            ) : tool.slug === "organize-pdf" ? (
              <OrganizePdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={organizePlan} limits={limits} />
            ) : tool.slug === "scan-to-pdf" ? (
              <ImagePdfPageControls files={files} pageSizeSetting={settingsList.find((setting) => setting.key === "pageSize")} pageSizeValue={settings.pageSize} onPageSizeChange={(value) => updateSetting("pageSize", value)} />
            ) : tool.slug === "jpg-to-pdf" ? (
              <ImagePdfPageControls
                files={files}
                pageSizeSetting={settingsList.find((setting) => setting.key === "pageSize")}
                pageSizeValue={settings.pageSize}
                onPageSizeChange={(value) => updateSetting("pageSize", value)}
                marginSetting={settingsList.find((setting) => setting.key === "margin")}
                marginValue={settings.margin}
                onMarginChange={(value) => updateSetting("margin", value)}
              />
            ) : tool.slug === "compress-pdf" ? (
              <CompressionControls setting={settingsList.find((setting) => setting.key === "quality")} value={settings.quality} onChange={(value) => updateSetting("quality", value)} inputSize={files[0]?.size || 0} estimate={activeCompressionEstimate} />
            ) : tool.slug === "compress-image" ? (
              <ImageCompressionControls files={files} setting={settingsList.find((setting) => setting.key === "quality")} value={settings.quality} onChange={(value) => updateSetting("quality", value)} preview={imageCompressionPreview} />
            ) : tool.slug === "resize-image" ? (
              <ImageResizeControls files={files} setting={settingsList.find((setting) => setting.key === "width")} value={settings.width} onChange={(value) => updateSetting("width", value)} inspection={imageResizeInspection} plan={imageResizePlan} limits={limits} />
            ) : tool.slug === "upscale-image" ? (
              <ImageUpscaleControls files={files} setting={settingsList.find((setting) => setting.key === "scale")} value={settings.scale} onChange={(value) => updateSetting("scale", value)} inspection={imageUpscaleInspection} plan={imageUpscalePlan} limits={limits} />
            ) : tool.slug === "remove-image-background" ? (
              <BackgroundRemovalControls files={files} settings={settings} onChange={updateSetting} preview={backgroundRemovalPreview} />
            ) : tool.slug === "crop-image" ? (
              <ImageCropControls
                files={files}
                setting={settingsList.find((setting) => setting.key === "aspectRatio")}
                settings={settings}
                inspection={imageCropInspection}
                plan={imageCropPlan}
                onChange={updateSetting}
                onMove={(focusX, focusY) => updateSettings({ focusX, focusY })}
                onReset={() => updateSettings({ aspectRatio: "free", cropScale: 100, focusX: 50, focusY: 50 })}
              />
            ) : tool.slug === "convert-from-jpg" ? (
              <AnimatedGifControls
                files={files}
                setting={settingsList.find((setting) => setting.key === "delay")}
                settings={settings}
                inspection={animatedGifInspection}
                plan={animatedGifPlan}
                onChange={updateSetting}
              />
            ) : tool.slug === "photo-editor" ? (
              <PhotoEditorControls
                files={files}
                settings={settings}
                settingsList={settingsList}
                inspection={photoEditorInspection}
                plan={photoEditorPlan}
                onChange={updateSetting}
                onApply={updateSettings}
                onReset={() => updateSettings({
                  brightness: PHOTO_EDITOR_ADJUSTMENTS.brightness.default,
                  contrast: PHOTO_EDITOR_ADJUSTMENTS.contrast.default,
                  saturation: PHOTO_EDITOR_ADJUSTMENTS.saturation.default,
                  warmth: PHOTO_EDITOR_ADJUSTMENTS.warmth.default,
                  text: "",
                  textColor: PHOTO_EDITOR_TEXT_COLORS[0],
                })}
              />
            ) : tool.slug === "pdf-to-jpg" ? (
              <PdfJpgControls setting={settingsList.find((setting) => setting.key === "quality")} value={settings.quality} onChange={(value) => updateSetting("quality", value)} info={pageInfo} limits={limits} />
            ) : tool.slug === "pdf-to-word" ? (
              <PdfOfficeTextControls file={files[0]} preview={pdfOfficeTextPreview} format="docx" />
            ) : tool.slug === "pdf-to-powerpoint" ? (
              <PdfOfficeTextControls file={files[0]} preview={pdfOfficeTextPreview} format="pptx" />
            ) : tool.slug === "pdf-to-excel" ? (
              <PdfOfficeTextControls file={files[0]} preview={pdfOfficeTextPreview} format="xlsx" />
            ) : tool.slug === "pdf-to-pdfa" ? (
              <ArchivePdfControls file={files[0]} info={pageInfo} />
            ) : tool.slug === "convert-image" ? (
              <ImageFormatControls settings={settings} onChange={updateSetting} support={imageEncoderSupport} />
            ) : tool.slug === "pdf-forms" ? (
              <PdfFormControls file={files[0]} info={pdfFormInfo} settings={settings} limits={limits} plan={pdfFormPlan} onChange={updateSetting} />
            ) : tool.slug === "redact-pdf" ? (
              <RedactPdfControls settings={settings} onChange={updateSetting} info={pageInfo} plan={redactionPlan} limits={limits} />
            ) : tool.slug === "compare-pdf" ? (
              <ComparePdfControls files={files} result={results[0]} />
            ) : tool.slug === "repair-pdf" ? (
              <RepairPdfControls />
            ) : tool.slug === "word-to-pdf" ? (
              <WordPdfControls file={files[0]} preview={wordPreview} />
            ) : tool.slug === "powerpoint-to-pdf" ? (
              <PowerPointPdfControls file={files[0]} preview={powerpointPreview} />
            ) : tool.slug === "excel-to-pdf" ? (
              <SpreadsheetPdfControls
                file={files[0]}
                preview={spreadsheetPreview}
                orientationSetting={settingsList.find((setting) => setting.key === "orientation")}
                orientation={settings.orientation}
                onOrientationChange={(value) => updateSetting("orientation", value)}
              />
            ) : tool.slug === "html-to-pdf" ? (
              <HtmlPdfControls
                file={files[0]}
                preview={htmlPreview}
                pageSizeSetting={settingsList.find((setting) => setting.key === "pageSize")}
                pageSize={settings.pageSize}
                onPageSizeChange={(value) => updateSetting("pageSize", value)}
                htmlSetting={settingsList.find((setting) => setting.key === "html")}
                html={settings.html}
                onHtmlChange={(value) => updateSetting("html", value)}
              />
            ) : settingsList.length ? (
              <>
                {pdfSettingPreviewTools.has(tool.slug) && <PdfSettingPreview tool={tool} settings={settings} info={pageInfo} />}
                {settingsList.map((setting) => <SettingControl key={setting.key} setting={setting} value={settings[setting.key]} onChange={(value) => updateSetting(setting.key, value)} />)}
                {tool.slug === "summarize-pdf" && <SummaryPlan settings={settings} />}
              </>
            ) : <div className="no-settings"><CheckCircleIcon size={20} /><span><strong>Nothing to configure</strong>This tool uses sensible local defaults.</span></div>}

            {tool.maturity === "beta" && (
              <div className="beta-note"><SparkleIcon size={18} /><span><strong>Local beta</strong>Complex layouts, rare formats, and very large files may vary by browser.</span></div>
            )}

            <div className="output-summary">
              <span>Output</span>
              <strong>{tool.slug === "convert-image" ? `.${String(settings.format || "webp").toUpperCase()}` : tool.slug === "compare-pdf" ? "INLINE + .HTML" : tool.slug === "summarize-pdf" ? "INLINE + .TXT" : tool.output.join(" · ").toUpperCase()}</strong>
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
              {tool.slug === "organize-pdf" && organizePlan?.valid && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{organizePlan.order.length.toLocaleString()} {organizePlan.order.length === 1 ? "page" : "pages"} ready</strong>
              )}
              {tool.slug === "redact-pdf" && redactionPlan?.valid && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{redactionPlan.regionCount.toLocaleString()} {redactionPlan.regionCount === 1 ? "area" : "areas"} on {redactionPlan.affectedPageCount.toLocaleString()} {redactionPlan.affectedPageCount === 1 ? "page" : "pages"}</strong>
              )}
              {tool.slug === "pdf-to-jpg" && pdfJpgPlan && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{pdfJpgPlan.readyLabel}</strong>
              )}
              {tool.slug === "pdf-to-word" && pdfOfficeTextPreview.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{pdfOfficeTextPreview.pageCount.toLocaleString()} {pdfOfficeTextPreview.pageCount === 1 ? "section" : "sections"} ready</strong>
              )}
              {tool.slug === "pdf-to-powerpoint" && pdfOfficeTextPreview.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{pdfOfficeTextPreview.pageCount.toLocaleString()} {pdfOfficeTextPreview.pageCount === 1 ? "slide" : "slides"} ready</strong>
              )}
              {tool.slug === "pdf-to-excel" && pdfOfficeTextPreview.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{pdfOfficeTextPreview.pageCount.toLocaleString()} {pdfOfficeTextPreview.pageCount === 1 ? "sheet" : "sheets"} ready</strong>
              )}
              {tool.slug === "pdf-to-pdfa" && pageInfo.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{pageInfo.pageCount.toLocaleString()} {pageInfo.pageCount === 1 ? "page" : "pages"} ready to rewrite</strong>
              )}
              {tool.slug === "compress-image" && imageCompressionPreviewMatches && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{imageCompressionPreview.result.imageCompressionOutcome.status === "reduced" ? `${Math.round(Math.abs(imageCompressionPreview.result.imageCompressionOutcome.percent)).toLocaleString()}% smaller sample` : "Sample does not get smaller"}</strong>
              )}
              {tool.slug === "resize-image" && imageResizePlan.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{files.length.toLocaleString()} {files.length === 1 ? "image" : "images"} · {imageResizePlan.first.outputWidth.toLocaleString()} px wide</strong>
              )}
              {tool.slug === "upscale-image" && imageUpscalePlan.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{files.length.toLocaleString()} {files.length === 1 ? "image" : "images"} · {imageUpscalePlan.scale}× · {imageUpscalePlan.first.pixelMultiplier.toLocaleString()}× pixels</strong>
              )}
              {tool.slug === "remove-image-background" && backgroundRemovalPreviewMatches && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{files.length.toLocaleString()} {files.length === 1 ? "image" : "images"} · {getBackgroundRemovalProfile(settings.cleanup).label} · {getBackgroundRemovalBackground(settings.background).label}</strong>
              )}
              {tool.slug === "crop-image" && imageCropPlan.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{files.length.toLocaleString()} {files.length === 1 ? "image" : "images"} · {imageCropPlan.first.crop.retainedPercent.toLocaleString()}% retained</strong>
              )}
              {tool.slug === "convert-from-jpg" && animatedGifPlan.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{animatedGifPlan.frameCount.toLocaleString()} {animatedGifPlan.frameCount === 1 ? "frame" : "frames"} · {formatGifDuration(animatedGifPlan.durationMs)} per cycle</strong>
              )}
              {tool.slug === "photo-editor" && photoEditorPlan.state === "ready" && status !== "processing" && (
                <strong className="split-ready-count" aria-live="polite">{photoEditorPlan.plan.changed ? "Edited" : "Original look"} · {photoEditorPlan.plan.width.toLocaleString()} × {photoEditorPlan.plan.height.toLocaleString()} px</strong>
              )}
              {!((inlineReaderTools.has(tool.slug) || ["pdf-to-word", "pdf-to-powerpoint", "pdf-to-excel", "word-to-pdf", "powerpoint-to-pdf", "excel-to-pdf", "html-to-pdf"].includes(tool.slug)) && results.length) && (
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
