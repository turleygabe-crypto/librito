import assert from "node:assert/strict";
import { test } from "node:test";
import { escapeCsvCell } from "../lib/csv.js";

test("CSV cells quote and escape ordinary values", () => {
  assert.equal(escapeCsvCell('A "good" book'), '"A ""good"" book"');
  assert.equal(escapeCsvCell("line one\nline two"), '"line one\nline two"');
});

test("CSV cells neutralize spreadsheet formulas after leading controls or whitespace", () => {
  for (const prefix of ["", " ", "\t", "\r", "\n", "\u0000", "\uFEFF"]) {
    assert.equal(escapeCsvCell(`${prefix}=1+1`), `"\'${prefix}=1+1"`);
  }
  for (const formula of ["+SUM(A1:A2)", "-1+2", "@SUM(A1:A2)"]) {
    assert.equal(escapeCsvCell(` \t${formula}`), `"\' \t${formula}"`);
  }
});

test("CSV cells preserve safe values and empty cells", () => {
  assert.equal(escapeCsvCell("title"), '"title"');
  assert.equal(escapeCsvCell(0), '"0"');
  assert.equal(escapeCsvCell(null), '""');
});
