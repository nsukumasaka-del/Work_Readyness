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

test("preserves Stylish branding, tag layout, columns, and page-break rules", () => {
  const html = buildCvPdfHtml({
    fullName: "Ada Lovelace",
    headline: "Engineer",
    skills: ["Systems Analysis"],
    languages: ["English (Fluent)", "French (Reading / Writing)"],
    experiences: [{ role: "Engineer", company: "Analytical Engines", bullets: ["Built a reliable system."] }],
    references: ["Grace Hopper · Director · Navy"],
  }, {
    templateId: "stylish",
    columns: "double",
    primaryColor: "#047857",
    secondaryColor: "#ecfdf5",
    borderColor: "#a7f3d0",
  });

  assert.match(html, /<body class="template-stylish">/);
  assert.match(html, /body\.template-stylish header[^}]*background:#047857/);
  assert.match(html, /body\.template-stylish main \{ display:grid !important/);
  assert.match(html, /grid-column:1;grid-row:1/);
  assert.match(html, /body\.template-stylish, body\.template-stylish \* \{ -webkit-print-color-adjust:exact; print-color-adjust:exact; \}/);
  assert.match(html, /data-template-section="references"[^}]*break-inside:avoid; page-break-inside:avoid/);
  assert.match(html, /body\.template-stylish \.skill \{[^}]*white-space:nowrap; break-inside:avoid; page-break-inside:avoid/);
  assert.match(html, /class="skill-list language-list"/);
  assert.match(html, /class="skill">French \(Reading \/ Writing\)<\/span>/);
  assert.match(html, /class="reference-item"/);
});
