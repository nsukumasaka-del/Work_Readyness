import assert from "node:assert/strict";
import test from "node:test";
import { buildCvPdfHtml } from "./cv-pdf-render";

test("builds a printable CV containing every optional section", () => {
  const html = buildCvPdfHtml({
    fullName: "Ada Lovelace",
    headline: "Engineer",
    email: "ada@example.com",
    summary: "A concise profile.",
    experiences: [{ role: "Engineer", company: "Analytical Engines", bullets: ["Built a <safe> system."] }],
    education: [{ degree: "BSc", institution: "University", graduationYear: "1843" }],
    skills: ["TypeScript"],
    toolsAndSoftware: ["Cloudflare"],
    languages: ["English"],
    references: ["Available on request."],
    projects: [{ title: "Project A", bullets: ["Delivered."] }],
    certifications: [{ name: "Certificate A", issuer: "Institute", year: "2025" }],
    sections: [{ heading: "Community", items: ["Mentored students."] }],
  }, { columns: "single" });

  for (const text of [
    "Ada Lovelace", "Professional Summary", "Work Experience", "Education", "Professional Skills",
    "Systems &amp; Software", "Languages", "References", "Key Projects", "Certifications", "Community",
  ]) {
    assert.ok(html.includes(text), `Expected generated PDF HTML to include ${text}`);
  }
  assert.ok(html.includes("Built a &lt;safe&gt; system."));
  assert.ok(!html.includes("<safe>"));
  assert.ok(!html.includes("<script"));
});

test("rejects a missing document", () => {
  assert.throws(() => buildCvPdfHtml(null, {}), /CV document is required/);
});

test("respects hidden section preferences in the generated PDF", () => {
  const html = buildCvPdfHtml({
    fullName: "Ada Lovelace",
    skills: ["Hidden skill"],
  }, { visibleSections: { skills: false } });

  assert.ok(!html.includes("Hidden skill"));
  assert.ok(!html.includes("Professional Skills"));
});
