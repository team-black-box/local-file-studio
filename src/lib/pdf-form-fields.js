// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  PDFButton,
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
} from "pdf-lib";
import {
  FileLimitError,
  assertPdfFormFieldCount,
  assertPdfFormMetadata,
  getTextSettingLimit,
  getToolLimits,
} from "./file-limits.js";

const FORM_TOOL = "pdf-forms";

function fieldType(field) {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "option-list";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFButton) return "button";
  if (field instanceof PDFSignature) return "signature";
  return "unsupported";
}

function fieldTypeLabel(type) {
  return ({
    text: "Text",
    checkbox: "Checkbox",
    dropdown: "Dropdown",
    "option-list": "Multi-select",
    radio: "Single choice",
    button: "Button",
    signature: "Signature",
    unsupported: "Unsupported",
  })[type];
}

function valueCharacters(value) {
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + item.length, 0);
  return typeof value === "string" ? value.length : 0;
}

function currentFieldValue(field, type) {
  if (type === "text") return field.getText?.() || "";
  if (type === "checkbox") return Boolean(field.isChecked?.());
  if (type === "dropdown") return field.getSelected?.()[0] ?? null;
  if (type === "option-list") return [...(field.getSelected?.() || [])];
  if (type === "radio") return field.getSelected?.() ?? null;
  return null;
}

function describeFormFields(form, limits, label) {
  const rawFields = form.getFields();
  assertPdfFormFieldCount(rawFields.length, limits, label);
  if (!rawFields.length) throw new Error("No fillable fields were found in this PDF.");

  const seen = new Set();
  let optionCount = 0;
  let metadataCharacters = 0;
  let maxFieldNameCharacters = 0;
  let maxFieldValueCharacters = 0;
  let maxOptionsPerField = 0;

  const fields = rawFields.map((field, index) => {
    const name = String(field.getName?.() || "");
    if (!name) throw new Error(`Form field ${index + 1} does not have a usable name.`);
    if (seen.has(name)) throw new Error(`The form contains more than one field named "${name}". Rename duplicate fields and try again.`);
    seen.add(name);

    const type = fieldType(field);
    const rawOptions = ["dropdown", "option-list", "radio"].includes(type)
      ? field.getOptions?.() || []
      : [];
    assertPdfFormMetadata({
      optionCount: optionCount + rawOptions.length,
      metadataCharacters,
      maxFieldNameCharacters: Math.max(maxFieldNameCharacters, name.length),
      maxFieldValueCharacters,
      maxOptionsPerField: Math.max(maxOptionsPerField, rawOptions.length),
    }, limits, label);
    const options = [];
    let optionCharacters = 0;
    let longestOption = 0;
    for (const rawOption of rawOptions) {
      const option = String(rawOption);
      options.push(option);
      optionCharacters += option.length;
      longestOption = Math.max(longestOption, option.length);
    }
    const currentValue = currentFieldValue(field, type);
    const currentCharacters = valueCharacters(currentValue);
    optionCount += options.length;
    metadataCharacters += name.length + optionCharacters + currentCharacters;
    maxFieldNameCharacters = Math.max(maxFieldNameCharacters, name.length);
    maxFieldValueCharacters = Math.max(maxFieldValueCharacters, currentCharacters, longestOption);
    maxOptionsPerField = Math.max(maxOptionsPerField, options.length);

    return {
      index,
      name,
      type,
      typeLabel: fieldTypeLabel(type),
      supported: ["text", "checkbox", "dropdown", "option-list", "radio"].includes(type),
      readOnly: Boolean(field.isReadOnly?.()),
      required: Boolean(field.isRequired?.()),
      multiline: type === "text" && Boolean(field.isMultiline?.()),
      maxLength: type === "text" ? field.getMaxLength?.() || null : null,
      options,
      currentValue,
      field,
    };
  });

  assertPdfFormMetadata({
    optionCount,
    metadataCharacters,
    maxFieldNameCharacters,
    maxFieldValueCharacters,
    maxOptionsPerField,
  }, limits, label);

  return fields;
}

async function bytesFromSource(source) {
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (ArrayBuffer.isView(source)) return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  if (source?.arrayBuffer) return new Uint8Array(await source.arrayBuffer());
  throw new TypeError("PDF form data must be a local File, Blob, ArrayBuffer, or typed-array view.");
}

function assertValueLength(value, limits, fieldName) {
  const length = valueCharacters(value);
  if (length > limits.maxPdfFormValueCharacters) {
    throw new FileLimitError(
      "pdf-form-field-value-limit",
      `The value for "${fieldName}" contains ${length.toLocaleString()} characters; PDF Forms supports ${limits.maxPdfFormValueCharacters.toLocaleString()} characters per field. Shorten it and try again.`,
    );
  }
}

export function parsePdfFormValues(rawValues, limitsOrTool = FORM_TOOL) {
  const limits = typeof limitsOrTool === "object" && "maxPdfFormFields" in limitsOrTool
    ? limitsOrTool
    : getToolLimits(limitsOrTool);
  const maxPayload = getTextSettingLimit(FORM_TOOL, "values");
  let values = rawValues;

  if (values === undefined || values === null || values === "") return {};
  if (typeof values === "string") {
    if (values.length > maxPayload) {
      throw new FileLimitError(
        "text-setting-too-long",
        `Advanced field JSON contains ${values.length.toLocaleString()} characters; the safe limit is ${maxPayload.toLocaleString()}. Shorten it and try again.`,
      );
    }
    try {
      values = JSON.parse(values);
    } catch {
      throw new Error("Advanced field JSON is not valid. Fix it or use Reset JSON to return to the visual fields.");
    }
  }

  if (!values || typeof values !== "object" || Array.isArray(values)) {
    throw new Error("Form values must be a JSON object whose keys are exact PDF field names.");
  }

  if (typeof rawValues !== "string") {
    const serialized = JSON.stringify(values);
    if (serialized.length > maxPayload) {
      throw new FileLimitError(
        "text-setting-too-long",
        `Advanced field values contain ${serialized.length.toLocaleString()} serialized characters; the safe limit is ${maxPayload.toLocaleString()}. Shorten them and try again.`,
      );
    }
  }

  const entries = Object.entries(values);
  assertPdfFormFieldCount(entries.length, limits, "These form values");
  let selectedChoiceCount = 0;
  for (const [name, value] of entries) {
    if (!name) throw new Error("Form values cannot contain an empty field name.");
    if (name.length > limits.maxPdfFormFieldNameCharacters) {
      throw new FileLimitError(
        "pdf-form-field-name-limit",
        `A form value uses a ${name.length.toLocaleString()}-character field name; the safe limit is ${limits.maxPdfFormFieldNameCharacters.toLocaleString()}.`,
      );
    }
    const supported = value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (Array.isArray(value) && value.every((item) => typeof item === "string"));
    if (!supported) {
      throw new Error(`The value for "${name}" must be text, true/false, a list of text choices, or null.`);
    }
    if (Array.isArray(value)) {
      if (value.length > limits.maxPdfFormOptionsPerField) {
        throw new FileLimitError(
          "pdf-form-options-per-field-limit",
          `The value for "${name}" selects ${value.length.toLocaleString()} choices; PDF Forms supports ${limits.maxPdfFormOptionsPerField.toLocaleString()} choices per field.`,
        );
      }
      selectedChoiceCount += value.length;
      if (selectedChoiceCount > limits.maxPdfFormOptionsTotal) {
        throw new FileLimitError(
          "pdf-form-option-limit",
          `These form values select ${selectedChoiceCount.toLocaleString()} choices; PDF Forms supports ${limits.maxPdfFormOptionsTotal.toLocaleString()} choices in one job.`,
        );
      }
    }
    assertValueLength(value, limits, name);
  }
  return values;
}

function validateFieldValue(field, value) {
  if (!field) return "This field was not found in the selected PDF.";
  if (field.readOnly) return "This field is read-only in the selected PDF.";
  if (!field.supported) return `${field.typeLabel} fields cannot be filled by this tool.`;
  if (value === null) return "";
  if (field.type === "text" && typeof value !== "string") return "Text fields need a text value or null.";
  if (field.type === "checkbox" && typeof value !== "boolean") return "Checkboxes need true, false, or null.";
  if (["dropdown", "radio"].includes(field.type) && typeof value !== "string") return "Choice fields need one text choice or null.";
  if (field.type === "option-list" && !(typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string")))) {
    return "Multi-select fields need one text choice, a list of text choices, or null.";
  }
  const selections = Array.isArray(value) ? value : [value];
  if (["dropdown", "radio", "option-list"].includes(field.type)) {
    const unknown = selections.find((selection) => !field.options.includes(selection));
    if (unknown !== undefined) return `"${unknown}" is not an available choice for this field.`;
  }
  if (field.type === "text" && field.maxLength && value.length > field.maxLength) {
    return `This PDF limits the field to ${field.maxLength.toLocaleString()} characters.`;
  }
  return "";
}

export function createPdfFormPlan(rawValues, fields, flatten = false, limitsOrTool = FORM_TOOL) {
  try {
    const values = parsePdfFormValues(rawValues, limitsOrTool);
    const byName = new Map(fields.map((field) => [field.name, field]));
    for (const [name, value] of Object.entries(values)) {
      const error = validateFieldValue(byName.get(name), value);
      if (error) return { valid: false, values, changeCount: 0, message: `${name}: ${error}` };
    }
    const changeCount = Object.keys(values).length;
    if (!changeCount && !flatten) {
      return { valid: false, values, changeCount, message: "Fill or clear at least one field, or choose a flattened export." };
    }
    return {
      valid: true,
      values,
      changeCount,
      message: changeCount
        ? `${changeCount.toLocaleString()} ${changeCount === 1 ? "field change" : "field changes"} ready${flatten ? "; fields will be flattened" : ""}.`
        : "The current form fields will be flattened without changing their values.",
    };
  } catch (error) {
    return { valid: false, values: {}, changeCount: 0, message: error?.message || "The form values are not valid." };
  }
}

export async function inspectPdfForm(source, limitsOrTool = FORM_TOOL, label = "This PDF") {
  const limits = typeof limitsOrTool === "object" && "maxPdfFormFields" in limitsOrTool
    ? limitsOrTool
    : getToolLimits(limitsOrTool);
  const bytes = await bytesFromSource(source);
  const pdf = await PDFDocument.load(bytes);
  const fields = describeFormFields(pdf.getForm(), limits, label).map(({ field, ...descriptor }) => descriptor);
  return { fieldCount: fields.length, fields };
}

function applyValue(field, type, value) {
  if (type === "text") field.setText(value === null ? "" : value);
  else if (type === "checkbox") (value === null || value === false) ? field.uncheck() : field.check();
  else if (type === "dropdown" || type === "radio") value === null ? field.clear() : field.select(value);
  else if (type === "option-list") value === null ? field.clear() : field.select(Array.isArray(value) ? value : [value]);
}

export async function fillPdfFormFields(source, rawValues, { flatten = false, limitsOrTool = FORM_TOOL, label = "This PDF" } = {}) {
  const limits = typeof limitsOrTool === "object" && "maxPdfFormFields" in limitsOrTool
    ? limitsOrTool
    : getToolLimits(limitsOrTool);
  const bytes = await bytesFromSource(source);
  const pdf = await PDFDocument.load(bytes);
  const described = describeFormFields(pdf.getForm(), limits, label);
  const descriptors = described.map(({ field, ...descriptor }) => descriptor);
  const plan = createPdfFormPlan(rawValues, descriptors, flatten, limits);
  if (!plan.valid) throw new Error(plan.message);

  const fieldsByName = new Map(described.map((descriptor) => [descriptor.name, descriptor]));
  for (const [name, value] of Object.entries(plan.values)) {
    const descriptor = fieldsByName.get(name);
    applyValue(descriptor.field, descriptor.type, value);
  }
  if (flatten) pdf.getForm().flatten();
  const output = await pdf.save();
  return {
    bytes: output,
    fieldCount: described.length,
    changeCount: plan.changeCount,
    flattened: Boolean(flatten),
  };
}
