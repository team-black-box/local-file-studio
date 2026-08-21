// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { FileLimitError } from "./file-limits.js";

export const PDF_TRANSLATION_LANGUAGES = Object.freeze([
  Object.freeze({ value: "hi", label: "Hindi" }),
  Object.freeze({ value: "es", label: "Spanish" }),
  Object.freeze({ value: "de", label: "German" }),
  Object.freeze({ value: "fr", label: "French" }),
]);

const languageByCode = new Map(PDF_TRANSLATION_LANGUAGES.map((language) => [language.value, language]));

const BASIC_GLOSSARIES = Object.freeze({
  es: Object.freeze({ document: "documento", page: "página", private: "privado", local: "local", file: "archivo", image: "imagen", text: "texto", with: "con", and: "y", the: "el" }),
  fr: Object.freeze({ document: "document", page: "page", private: "privé", local: "local", file: "fichier", image: "image", text: "texte", with: "avec", and: "et", the: "le" }),
  de: Object.freeze({ document: "Dokument", page: "Seite", private: "privat", local: "lokal", file: "Datei", image: "Bild", text: "Text", with: "mit", and: "und", the: "die" }),
  hi: Object.freeze({ document: "दस्तावेज़", page: "पृष्ठ", private: "निजी", local: "स्थानीय", file: "फ़ाइल", image: "छवि", text: "पाठ", with: "के साथ", and: "और", the: "यह" }),
});

const availabilityStates = Object.freeze({
  available: "available",
  readily: "available",
  downloadable: "downloadable",
  "after-download": "downloadable",
  downloading: "downloading",
  unavailable: "unavailable",
  no: "unavailable",
});

export function getPdfTranslationLanguage(value) {
  return languageByCode.get(String(value || "").toLowerCase()) || languageByCode.get("es");
}

export function getPdfTranslationMode(value) {
  return value === "full" ? "full" : "glossary";
}

export function getBasicTranslationGlossary(targetLanguage) {
  return BASIC_GLOSSARIES[getPdfTranslationLanguage(targetLanguage).value];
}

export function applyBasicTranslationGlossary(text, targetLanguage) {
  const language = getPdfTranslationLanguage(targetLanguage);
  const glossary = getBasicTranslationGlossary(language.value);
  let replacementCount = 0;
  const body = String(text || "").replace(/\b[a-z]+\b/gi, (word) => {
    const replacement = glossary[word.toLowerCase()];
    if (!replacement) return word;
    replacementCount += 1;
    return replacement;
  });
  const glossarySize = Object.keys(glossary).length;
  return Object.freeze({
    mode: "glossary",
    sourceLanguage: "en",
    targetLanguage: language.value,
    targetLabel: language.label,
    glossarySize,
    replacementCount,
    body,
    text: `BASIC ${language.label.toUpperCase()} GLOSSARY — NOT A FULL TRANSLATION\n${glossarySize.toLocaleString()} common English terms can be replaced; all other text stays unchanged.\n\n${body}`,
  });
}

export function getBrowserTranslatorApi(scope = globalThis) {
  const api = scope?.Translator || scope?.ai?.translator;
  return api && typeof api.create === "function" ? api : null;
}

export async function inspectBrowserTranslator(targetLanguage, api = getBrowserTranslatorApi()) {
  const language = getPdfTranslationLanguage(targetLanguage);
  const base = {
    sourceLanguage: "en",
    targetLanguage: language.value,
    targetLabel: language.label,
  };
  if (!api) return Object.freeze({ ...base, state: "unsupported", canPrepare: false, rawState: "unsupported" });

  try {
    let rawState = "unknown";
    if (typeof api.availability === "function") {
      rawState = await api.availability({ sourceLanguage: "en", targetLanguage: language.value });
    } else if (typeof api.capabilities === "function") {
      const capabilities = await api.capabilities();
      rawState = typeof capabilities?.languagePairAvailable === "function"
        ? capabilities.languagePairAvailable("en", language.value)
        : "unknown";
    }
    const state = availabilityStates[String(rawState)] || "unknown";
    return Object.freeze({ ...base, state, canPrepare: state !== "unavailable", rawState: String(rawState) });
  } catch (error) {
    return Object.freeze({
      ...base,
      state: "unknown",
      canPrepare: true,
      rawState: "check-failed",
      message: error?.message || "This browser could not report its translation model status.",
    });
  }
}

export async function createBrowserTranslator(targetLanguage, onDownloadProgress, api = getBrowserTranslatorApi()) {
  const language = getPdfTranslationLanguage(targetLanguage);
  if (!api) {
    throw new FileLimitError(
      "translation-model-unsupported",
      "Full on-device translation is unavailable in this browser. Choose the Basic glossary option to continue without a model.",
    );
  }

  const translator = await api.create({
    sourceLanguage: "en",
    targetLanguage: language.value,
    monitor(monitor) {
      monitor?.addEventListener?.("downloadprogress", (event) => {
        const loaded = Number(event?.loaded);
        if (Number.isFinite(loaded)) onDownloadProgress?.(Math.max(0, Math.min(1, loaded)));
      });
    },
  });
  if (!translator || typeof translator.translate !== "function") {
    await translator?.destroy?.();
    throw new FileLimitError(
      "translation-model-invalid",
      `This browser did not provide a usable English-to-${language.label} translator. Choose the Basic glossary option or try a supported desktop browser.`,
    );
  }
  return translator;
}

export function createTranslationSessionLease(translator) {
  if (!translator || typeof translator.translate !== "function") {
    throw new FileLimitError(
      "translation-model-invalid",
      "The prepared browser translator is no longer usable. Prepare full translation again.",
    );
  }
  let released = false;
  return Object.freeze({
    translate(text) {
      if (released) throw new FileLimitError("translation-model-released", "Prepare full translation again before processing another PDF.");
      return translator.translate(text);
    },
    async destroy() {
      if (released) return;
      released = true;
      await translator.destroy?.();
    },
  });
}

export function splitTranslationText(text, maxCharacters = 3_500) {
  const value = String(text || "");
  if (!value) return [];
  const size = Number.isInteger(maxCharacters) && maxCharacters > 0 ? maxCharacters : 3_500;
  const chunks = [];
  let offset = 0;
  while (offset < value.length) {
    let end = Math.min(value.length, offset + size);
    if (end < value.length && end > offset + 1 && /[\uD800-\uDBFF]/.test(value[end - 1])) end -= 1;
    chunks.push(value.slice(offset, end));
    offset = end;
  }
  return chunks;
}
