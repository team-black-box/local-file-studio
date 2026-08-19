// SPDX-FileCopyrightText: 2026 TeamBlackBox Private Limited
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import test from "node:test";
import { getToolLimits } from "../src/lib/file-limits.js";
import { MIN_REDACTION_REGION_PERCENT, clampRedactionRegion, createRedactionPlan, parseRedactionRegions, serializeRedactionRegions } from "../src/lib/pdf-redactions.js";

test("redaction plans preserve exact per-page regions and affected-page counts", () => {
  const value = JSON.stringify([
    { page: 2, x: 10.126, y: 20.124, width: 30.555, height: 12.499 },
    { page: 1, x: 0, y: 0, width: 100, height: 5 },
    { page: 2, x: 50, y: 60, width: 25, height: 20 },
  ]);
  const plan = createRedactionPlan(value, 3);
  assert.deepEqual(plan.regions, [
    { page: 2, x: 10.13, y: 20.12, width: 30.56, height: 12.5 },
    { page: 1, x: 0, y: 0, width: 100, height: 5 },
    { page: 2, x: 50, y: 60, width: 25, height: 20 },
  ]);
  assert.deepEqual(plan.affectedPages, [1, 2]);
  assert.equal(plan.regionCount, 3);
  assert.equal(plan.affectedPageCount, 2);
  assert.equal(plan.byPage[2].length, 2);
});

test("redaction geometry rejects invalid pages, undersized areas, and page overflow", () => {
  assert.throws(() => parseRedactionRegions('[{"page":0,"x":0,"y":0,"width":10,"height":10}]', 2), /page from 1 to 2/i);
  assert.throws(() => parseRedactionRegions('[{"page":3,"x":0,"y":0,"width":10,"height":10}]', 2), /page from 1 to 2/i);
  assert.throws(() => parseRedactionRegions(`[{
    "page":1,"x":0,"y":0,"width":${MIN_REDACTION_REGION_PERCENT - 0.01},"height":10
  }]`, 2), /at least 0.5%/i);
  assert.throws(() => parseRedactionRegions('[{"page":1,"x":90,"y":0,"width":11,"height":10}]', 2), /stay inside page 1/i);
  assert.throws(() => parseRedactionRegions('[{"page":1,"x":0,"y":95,"width":10,"height":6}]', 2), /stay inside page 1/i);
});

test("redaction settings enforce exact total, per-page, and serialized limits", () => {
  const limits = getToolLimits("redact-pdf");
  const exact = Array.from({ length: limits.maxRedactionRegions }, (_, index) => ({
    page: Math.floor(index / limits.maxRedactionRegionsPerPage) + 1,
    x: index % 2 ? 50 : 0,
    y: (index % limits.maxRedactionRegionsPerPage) * 2,
    width: 10,
    height: 1,
  }));
  assert.equal(parseRedactionRegions(exact, 100).length, limits.maxRedactionRegions);
  assert.throws(() => parseRedactionRegions([...exact, exact[0]], 100), /at most 200/i);
  const onePageOverflow = Array.from({ length: limits.maxRedactionRegionsPerPage + 1 }, (_, index) => ({ page: 1, x: 0, y: index, width: 1, height: 0.5 }));
  assert.throws(() => parseRedactionRegions(onePageOverflow, 100), /more than 50/i);
  assert.throws(() => parseRedactionRegions(" ".repeat(limits.maxRedactionSettingsCharacters + 1), 1), /65,536-character/i);
});

test("redaction serialization normalizes coordinates and rejects an empty execution plan", () => {
  assert.equal(
    serializeRedactionRegions([{ page: 1, x: 1.234, y: 2.345, width: 30, height: 10 }], 1),
    '[{"page":1,"x":1.23,"y":2.35,"width":30,"height":10}]',
  );
  assert.throws(() => createRedactionPlan("[]", 1), /at least one area/i);
});

test("redaction UI clamping keeps areas within the page", () => {
  assert.deepEqual(clampRedactionRegion({ page: 2, x: 98, y: -5, width: 20, height: 150 }), {
    page: 2,
    x: 80,
    y: 0,
    width: 20,
    height: 100,
  });
});
