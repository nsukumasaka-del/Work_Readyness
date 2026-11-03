import { test } from "node:test";
import assert from "node:assert/strict";

import { parseTemplateDesign } from "../shared/template-design";

const commonDesign = {
  version: 1,
  columns: "single",
  sidebarSide: "right",
  headerAlignment: "center",
  accentColor: "#123456",
  backgroundColor: "#ffffff",
  textColor: "#334455",
  sidebarColor: "#f1f5f9",
  headingFont: "serif",
  headingTreatment: "uppercase",
  sectionStyle: "rule",
  density: "comfortable",
  primarySections: ["summary", "experience", "education"],
  sidebarSections: [],
};

test("accepts a supported single-column generated design", () => {
  assert.deepEqual(parseTemplateDesign(commonDesign), commonDesign);
});

test("accepts a two-column design with separate sidebar sections", () => {
  const design = {
    ...commonDesign,
    columns: "double",
    primarySections: ["summary", "experience"],
    sidebarSections: ["education", "skills"],
  };
  assert.deepEqual(parseTemplateDesign(design), design);
});

test("rejects unsafe values, overlapping columns, and malformed section lists", () => {
  assert.equal(parseTemplateDesign({ ...commonDesign, accentColor: "red; background:url(javascript:1)" }), null);
  assert.equal(parseTemplateDesign({ ...commonDesign, columns: "double", sidebarSections: ["experience"] }), null);
  assert.equal(parseTemplateDesign({ ...commonDesign, primarySections: ["summary", "summary"] }), null);
  assert.equal(parseTemplateDesign({ ...commonDesign, headingFont: "url(https://example.invalid)" }), null);
});
