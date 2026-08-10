// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const fixtureDir = new URL("../tests/fixtures/", import.meta.url);
await mkdir(fixtureDir, { recursive: true });

async function makePdf(name, title, color) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([420, 300]);
  page.drawRectangle({ x: 0, y: 0, width: 420, height: 300, color });
  page.drawText(title, { x: 36, y: 210, size: 26, font, color: rgb(1, 1, 1) });
  page.drawText("Local File Studio smoke fixture", { x: 36, y: 178, size: 12, font: body, color: rgb(1, 1, 1) });
  await writeFile(new URL(name, fixtureDir), await pdf.save());
}

await makePdf("sample-a.pdf", "Sample document A", rgb(0.36, 0.29, 0.86));
await makePdf("sample-b.pdf", "Sample document B", rgb(0.08, 0.47, 0.43));

await writeFile(
  new URL("sample-card.svg", fixtureDir),
  `<!--
  SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
  SPDX-License-Identifier: Apache-2.0
-->
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#5b4bdb"/><rect x="32" y="32" width="576" height="296" rx="24" fill="#ffffff"/><text x="72" y="155" font-family="Arial,sans-serif" font-size="42" font-weight="700" fill="#17171a">Local image test</text><text x="72" y="210" font-family="Arial,sans-serif" font-size="22" fill="#656771">Processed on this device</text></svg>`,
  "utf8",
);
