// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  createPdfFormPlan,
  fillPdfFormFields,
  inspectPdfForm,
  parsePdfFormValues,
} from "../src/lib/pdf-form-fields.js";
import { processPdfTool } from "../src/lib/pdf-processors.js";

async function createFormPdf({ optionCount = 3 } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const form = pdf.getForm();

  const name = form.createTextField("Person.Full_Name");
  name.setText("Original name");
  name.setMaxLength(80);
  name.addToPage(page, { x: 40, y: 700, width: 220, height: 28 });

  const notes = form.createTextField("Notes");
  notes.enableMultiline();
  notes.setText("Keep this note");
  notes.addToPage(page, { x: 40, y: 610, width: 300, height: 72 });

  const agree = form.createCheckBox("Agree");
  agree.check();
  agree.addToPage(page, { x: 40, y: 570, width: 18, height: 18 });

  const country = form.createDropdown("Country");
  country.addOptions(Array.from({ length: optionCount }, (_, index) => `Country ${index + 1}`));
  country.select("Country 1");
  country.addToPage(page, { x: 40, y: 520, width: 180, height: 28 });

  const interests = form.createOptionList("Interests");
  interests.addOptions(["Design", "Engineering", "Research"]);
  interests.select(["Design"]);
  interests.addToPage(page, { x: 40, y: 420, width: 180, height: 82 });

  const plan = form.createRadioGroup("Plan");
  plan.addOptionToPage("Basic", page, { x: 40, y: 380, width: 18, height: 18 });
  plan.addOptionToPage("Pro", page, { x: 100, y: 380, width: 18, height: 18 });
  plan.select("Basic");

  const locked = form.createTextField("Locked reference");
  locked.setText("Read only");
  locked.enableReadOnly();
  locked.addToPage(page, { x: 40, y: 330, width: 180, height: 28 });

  const button = form.createButton("Submit button");
  button.addToPage("Submit", page, { x: 40, y: 280, width: 100, height: 28 });

  return await pdf.save();
}

test("PDF form inspection exposes bounded, typed fields and their existing values", async () => {
  const info = await inspectPdfForm(await createFormPdf());
  assert.equal(info.fieldCount, 8);
  assert.deepEqual(info.fields.map(({ name, type }) => [name, type]), [
    ["Person.Full_Name", "text"],
    ["Notes", "text"],
    ["Agree", "checkbox"],
    ["Country", "dropdown"],
    ["Interests", "option-list"],
    ["Plan", "radio"],
    ["Locked reference", "text"],
    ["Submit button", "button"],
  ]);
  assert.equal(info.fields[0].currentValue, "Original name");
  assert.equal(info.fields[0].maxLength, 80);
  assert.equal(info.fields[1].multiline, true);
  assert.equal(info.fields[2].currentValue, true);
  assert.deepEqual(info.fields[3].options, ["Country 1", "Country 2", "Country 3"]);
  assert.deepEqual(info.fields[4].currentValue, ["Design"]);
  assert.equal(info.fields[6].readOnly, true);
  assert.equal(info.fields[7].supported, false);
});

test("PDF form plan changes only named fields and explains invalid or flatten-only jobs", async () => {
  const { fields } = await inspectPdfForm(await createFormPdf());
  assert.match(createPdfFormPlan("", fields, false).message, /Fill or clear at least one field/);
  assert.deepEqual(createPdfFormPlan("", fields, true), {
    valid: true,
    values: {},
    changeCount: 0,
    message: "The current form fields will be flattened without changing their values.",
  });
  assert.match(createPdfFormPlan('{"Missing":"value"}', fields, false).message, /Missing: This field was not found/);
  assert.match(createPdfFormPlan('{"Locked reference":"changed"}', fields, false).message, /read-only/);
  assert.match(createPdfFormPlan('{"Submit button":"go"}', fields, false).message, /Button fields cannot be filled/);
  assert.match(createPdfFormPlan('{"Agree":"yes"}', fields, false).message, /Checkboxes need true, false, or null/);
  assert.match(createPdfFormPlan('{"Country":"Nowhere"}', fields, false).message, /not an available choice/);
  const valid = createPdfFormPlan('{"Person.Full_Name":"Asha","Agree":false,"Interests":["Engineering","Research"]}', fields, false);
  assert.equal(valid.valid, true);
  assert.equal(valid.changeCount, 3);
});

test("PDF form fill preserves untouched fields and optionally flattens every output field", async () => {
  const source = await createFormPdf();
  const editable = await fillPdfFormFields(source, {
    "Person.Full_Name": "Asha Rao",
    Agree: false,
    Country: "Country 2",
    Interests: ["Engineering", "Research"],
    Plan: null,
  });
  assert.equal(editable.changeCount, 5);
  assert.equal(editable.flattened, false);

  const editablePdf = await PDFDocument.load(editable.bytes);
  const editableForm = editablePdf.getForm();
  assert.equal(editableForm.getTextField("Person.Full_Name").getText(), "Asha Rao");
  assert.equal(editableForm.getTextField("Notes").getText(), "Keep this note");
  assert.equal(editableForm.getCheckBox("Agree").isChecked(), false);
  assert.deepEqual(editableForm.getDropdown("Country").getSelected(), ["Country 2"]);
  assert.deepEqual(editableForm.getOptionList("Interests").getSelected(), ["Engineering", "Research"]);
  assert.equal(editableForm.getRadioGroup("Plan").getSelected(), undefined);

  const flattened = await fillPdfFormFields(source, "", { flatten: true });
  const flattenedPdf = await PDFDocument.load(flattened.bytes);
  assert.equal(flattened.changeCount, 0);
  assert.equal(flattened.flattened, true);
  assert.equal(flattenedPdf.getForm().getFields().length, 0);
});

test("PDF form values and choice metadata fail at their exact central bounds", async () => {
  assert.equal(parsePdfFormValues(JSON.stringify({ Name: "x".repeat(10_000) })).Name.length, 10_000);
  assert.throws(
    () => parsePdfFormValues(JSON.stringify({ Name: "x".repeat(10_001) })),
    (error) => error.code === "pdf-form-field-value-limit" && /10,001 characters.*10,000/.test(error.message),
  );
  assert.equal(parsePdfFormValues({ Interests: Array(500).fill("") }).Interests.length, 500);
  assert.throws(
    () => parsePdfFormValues({ Interests: Array(501).fill("") }),
    (error) => error.code === "pdf-form-options-per-field-limit" && /501 choices.*500 choices per field/.test(error.message),
  );
  assert.throws(() => parsePdfFormValues("{"), /Advanced field JSON is not valid/);
  const tooManyChoices = await createFormPdf({ optionCount: 501 });
  await assert.rejects(
    () => inspectPdfForm(tooManyChoices),
    (error) => error.code === "pdf-form-options-per-field-limit" && /501 choices.*500 choices per field/.test(error.message),
  );
});

test("PDF Forms processor returns a previewable PDF with only explicit changes", async () => {
  const source = await createFormPdf();
  const file = new File([source], "application-form.pdf", { type: "application/pdf" });
  const [result] = await processPdfTool("pdf-forms", [file], {
    values: JSON.stringify({ "Person.Full_Name": "Local user" }),
    flatten: false,
  });
  assert.equal(result.name, "application-form-filled.pdf");
  assert.equal(result.blob.type, "application/pdf");
  assert.match(result.details, /1 field updated; form remains editable/);
  const output = await PDFDocument.load(await result.blob.arrayBuffer());
  assert.equal(output.getForm().getTextField("Person.Full_Name").getText(), "Local user");
  assert.equal(output.getForm().getTextField("Notes").getText(), "Keep this note");
});
