import { parseTemplateDesign, TEMPLATE_SECTION_KEYS, type TemplateSectionKey } from "../shared/template-design";

type CvPdfDocument = {
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
  experiences: Array<{ role: string; company: string; location: string; startDate: string; endDate: string; bullets: string[] }>;
  education: Array<{ degree: string; institution: string; location: string; graduationYear: string; details: string }>;
  skills: string[];
  toolsAndSoftware: string[];
  projects: Array<{ title: string; subtitle: string; bullets: string[] }>;
  certifications: Array<{ name: string; issuer: string; year: string }>;
  languages: string[];
  references: string[];
  sections: Array<{ heading: string; items: string[] }>;
};

type CvPdfAppearance = {
  templateId?: unknown;
  columnRatio?: unknown;
  sectionSpacing?: unknown;
  primaryColor?: unknown;
  secondaryColor?: unknown;
  borderColor?: unknown;
  fontId?: unknown;
  fontSize?: unknown;
  marginSize?: unknown;
  columns?: unknown;
  sectionOrder?: unknown;
  visibleSections?: unknown;
  templateDesign?: unknown;
};

const SECTION_ORDER: TemplateSectionKey[] = [...TEMPLATE_SECTION_KEYS];
const DEFAULT_PRIMARY_SECTIONS = new Set<TemplateSectionKey>(["summary", "experience", "projects", "custom"]);
const FONT_FAMILIES: Record<string, string> = {
  inter: "Arial, Helvetica, sans-serif",
  roboto: "Arial, Helvetica, sans-serif",
  lato: "Arial, Helvetica, sans-serif",
  rubik: "Arial, Helvetica, sans-serif",
  sans: "Arial, Helvetica, sans-serif",
  merriweather: "Georgia, 'Times New Roman', serif",
  garamond: "Georgia, 'Times New Roman', serif",
  raleway: "Arial, Helvetica, sans-serif",
  playfair: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', monospace",
};
const STYLISH_FONT_FAMILIES: Record<string, string> = {
  inter: "Inter, var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  roboto: "Roboto, Arial, sans-serif",
  lato: "'Lato', sans-serif",
  rubik: "'Rubik', sans-serif",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  merriweather: "'Merriweather', Georgia, serif",
  garamond: "'EB Garamond', serif",
  raleway: "'Raleway', sans-serif",
  playfair: "'Playfair Display', Georgia, serif",
  mono: "'Roboto Mono', monospace",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function text(value: unknown, limit = 4_000): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function textList(value: unknown, maxItems = 200, maxLength = 1_000): string[] {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => text(item, maxLength)).filter((item) => item.trim().length > 0)
    : [];
}

function records(value: unknown, maxItems = 100): Record<string, unknown>[] {
  return Array.isArray(value) ? value.slice(0, maxItems).filter(isRecord) : [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function renderText(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeDocument(value: unknown): CvPdfDocument {
  if (!isRecord(value)) throw new Error("A CV document is required.");
  const experiences = records(value.experiences).map((item) => ({
    role: text(item.role, 240),
    company: text(item.company, 240),
    location: text(item.location, 240),
    startDate: text(item.startDate, 80),
    endDate: text(item.endDate, 80),
    bullets: textList(item.bullets, 30, 1_000),
  }));
  const education = records(value.education).map((item) => ({
    degree: text(item.degree, 300),
    institution: text(item.institution, 300),
    location: text(item.location, 240),
    graduationYear: text(item.graduationYear, 80),
    details: text(item.details, 1_000),
  }));
  const projects = records(value.projects).map((item) => ({
    title: text(item.title, 300),
    subtitle: text(item.subtitle, 300),
    bullets: textList(item.bullets, 30, 1_000),
  }));
  const certifications = records(value.certifications).map((item) => ({
    name: text(item.name, 300),
    issuer: text(item.issuer, 300),
    year: text(item.year, 80),
  }));
  const sections = records(value.sections, 50).map((item) => ({
    heading: text(item.heading, 200),
    items: textList(item.items, 50, 1_000),
  }));

  return {
    fullName: text(value.fullName, 240),
    headline: text(value.headline, 400),
    email: text(value.email, 320),
    phone: text(value.phone, 100),
    location: text(value.location, 240),
    linkedin: text(value.linkedin, 500),
    website: text(value.website, 500),
    summary: text(value.summary, 8_000),
    experiences,
    education,
    skills: textList(value.skills, 300, 240),
    toolsAndSoftware: textList(value.toolsAndSoftware, 200, 240),
    projects,
    certifications,
    languages: textList(value.languages, 100, 160),
    references: textList(value.references, 100, 1_000),
    sections,
  };
}

function normalizeSectionOrder(value: unknown): TemplateSectionKey[] {
  const requested = Array.isArray(value)
    ? value.filter((key): key is TemplateSectionKey => typeof key === "string" && SECTION_ORDER.includes(key as TemplateSectionKey))
    : [];
  return [...new Set(requested), ...SECTION_ORDER.filter((key) => !requested.includes(key))];
}

export function buildCvPdfHtml(documentValue: unknown, appearanceValue: unknown): string {
  const document = normalizeDocument(documentValue);
  const appearance = isRecord(appearanceValue) ? appearanceValue as CvPdfAppearance : {};
  const design = parseTemplateDesign(appearance.templateDesign);
  const primaryColor = safeColor(design?.accentColor || appearance.primaryColor, "#1e3a8a");
  const secondaryColor = safeColor(appearance.secondaryColor, "#eff6ff");
  const borderColor = safeColor(appearance.borderColor, "#bfdbfe");
  const textColor = design?.textColor || "#1e293b";
  const backgroundColor = design?.backgroundColor || "#ffffff";
  const isStylish = appearance.templateId === "stylish";
  const fontFamilies = isStylish ? STYLISH_FONT_FAMILIES : FONT_FAMILIES;
  const fontFamily = typeof appearance.fontId === "string" ? fontFamilies[appearance.fontId] || fontFamilies.inter : fontFamilies.inter;
  const fontSize = typeof appearance.fontSize === "number" && Number.isFinite(appearance.fontSize)
    ? Math.max(8, Math.min(16, appearance.fontSize))
    : 10.5;
  const margins = appearance.marginSize === "compact" ? ["12mm", "14mm"]
    : appearance.marginSize === "wide" ? ["20mm", "22mm"]
      : ["16mm", "18mm"];
  const order = normalizeSectionOrder(appearance.sectionOrder);
  const isDouble = design ? design.columns === "double" : appearance.columns === "double";
  const sidebarSide = design?.sidebarSide || "right";
  const requestedColumnRatio = typeof appearance.columnRatio === "number" && Number.isFinite(appearance.columnRatio)
    ? Math.max(35, Math.min(72, appearance.columnRatio))
    : 62;
  const leftColumnRatio = sidebarSide === "left" ? 100 - requestedColumnRatio : requestedColumnRatio;
  const columns = `minmax(0, ${leftColumnRatio}fr) minmax(0, ${100 - leftColumnRatio}fr)`;
  const sectionSpacing = typeof appearance.sectionSpacing === "number" && Number.isFinite(appearance.sectionSpacing)
    ? Math.max(8, Math.min(48, appearance.sectionSpacing))
    : 24;
  const primaryKeys = new Set<TemplateSectionKey>(
    design
      ? [...design.primarySections, ...SECTION_ORDER.filter((key) => !design.primarySections.includes(key) && !design.sidebarSections.includes(key))]
      : SECTION_ORDER.filter((key) => DEFAULT_PRIMARY_SECTIONS.has(key)),
  );
  const sidebarKeys = new Set<TemplateSectionKey>(design?.sidebarSections || (isDouble ? SECTION_ORDER.filter((key) => !primaryKeys.has(key)) : []));
  const list = (items: string[]) => items.length
    ? `<ul>${items.map((item) => `<li>${renderText(item)}</li>`).join("")}</ul>`
    : "";
  const visibleSections = isRecord(appearance.visibleSections) ? appearance.visibleSections : {};
  const sections = new Map<TemplateSectionKey, string[]>();
  const addSection = (key: TemplateSectionKey, heading: string, content: string) => {
    if (!content || visibleSections[key] === false) return;
    const rendered = `<section data-template-section="${key}">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ""}${content}</section>`;
    sections.set(key, [...(sections.get(key) || []), rendered]);
  };

  addSection("summary", "Professional Summary", document.summary ? `<p>${renderText(document.summary)}</p>` : "");
  addSection("experience", "Work Experience", document.experiences.map((item) => `
    <article class="experience-item">
      <div class="item-heading"><strong>${renderText(item.role)}</strong><span>${renderText([item.startDate, item.endDate].filter(Boolean).join(" – "))}</span></div>
      <div class="muted">${renderText([item.company, item.location].filter(Boolean).join(" · "))}</div>
      ${list(item.bullets)}
    </article>`).join(""));
  addSection("education", "Education", document.education.map((item) => `
    <article class="education-item">
      <div class="item-heading"><strong>${renderText(item.degree)}</strong><span>${renderText(item.graduationYear)}</span></div>
      <div class="muted">${renderText([item.institution, item.location].filter(Boolean).join(" · "))}</div>
      ${item.details ? `<p>${renderText(item.details)}</p>` : ""}
    </article>`).join(""));
  addSection("skills", "Professional Skills", document.skills.length
    ? `<div class="skill-list">${document.skills.map((skill) => `<span class="skill">${renderText(skill)}</span>`).join("")}</div>`
    : "");
  addSection("skills", "Systems & Software", document.toolsAndSoftware.length
    ? `<div class="skill-list">${document.toolsAndSoftware.map((skill) => `<span class="skill">${renderText(skill)}</span>`).join("")}</div>`
    : "");
  addSection("projects", "Key Projects", document.projects.map((item) => `
    <article class="experience-item">
      <strong>${renderText(item.title)}</strong>${item.subtitle ? `<div class="muted">${renderText(item.subtitle)}</div>` : ""}
      ${list(item.bullets)}
    </article>`).join(""));
  addSection("certifications", "Certifications", document.certifications.map((item) => `
    <article class="education-item">
      <div class="item-heading"><strong>${renderText(item.name)}</strong><span>${renderText(item.year)}</span></div>
      <div class="muted">${renderText(item.issuer)}</div>
    </article>`).join(""));
  addSection("languages", "Languages", isStylish
    ? `<div class="skill-list language-list">${document.languages.map((language) => `<span class="skill">${renderText(language)}</span>`).join("")}</div>`
    : document.languages.map(renderText).join(" · "));
  addSection("references", "References", document.references.map((reference) => `<p class="reference-item">${renderText(reference)}</p>`).join(""));
  addSection("custom", "", document.sections.map((item) => `
    <div class="custom-section"><h2>${renderText(item.heading)}</h2>${list(item.items)}</div>`).join(""));

  const headerContacts = [document.email, document.phone, document.location, document.linkedin, document.website]
    .filter(Boolean).map(renderText).join(" <span aria-hidden=\"true\">·</span> ");
  const orderedSections = order.flatMap((key) => {
    const html = sections.get(key);
    if (html) sections.delete(key);
    return html || [];
  }).concat([...sections.values()].flat());
  const layoutSections = isDouble && isStylish
    ? (() => {
      const primarySections: string[] = [];
      const sidebarSections: string[] = [];
      for (const sectionHtml of orderedSections) {
        const key = sectionHtml.match(/<section data-template-section="([^"]+)"/)?.[1] as TemplateSectionKey | undefined;
        (key && sidebarKeys.has(key) ? sidebarSections : primarySections).push(sectionHtml);
      }
      const leftSections = sidebarSide === "left" ? sidebarSections : primarySections;
      const rightSections = sidebarSide === "left" ? primarySections : sidebarSections;
      const sidebarStyle = ` style="background:${design?.sidebarColor || "#f8fafc"};padding:8px"`;
      const leftStyle = design ? (sidebarSide === "left" ? sidebarStyle : "") : "";
      const rightStyle = design ? (sidebarSide === "right" ? sidebarStyle : "") : "";
      return `<div class="cv-pdf-columns"><div class="cv-pdf-column"${leftStyle}>${leftSections.join("")}</div><div class="cv-pdf-column"${rightStyle}>${rightSections.join("")}</div></div>`;
    })()
    : isDouble
      ? (() => {
        const nextRows = new Map<number, number>();
        return orderedSections.map((sectionHtml) => {
          const key = sectionHtml.match(/<section data-template-section="([^"]+)"/)?.[1] as TemplateSectionKey | undefined;
          if (!key) return sectionHtml;
          const column = sidebarKeys.has(key) ? (sidebarSide === "left" ? 1 : 2) : (sidebarSide === "left" ? 2 : 1);
          const row = (nextRows.get(column) || 0) + 1;
          nextRows.set(column, row);
          const sidebarStyle = design && sidebarKeys.has(key)
            ? `background:${design.sidebarColor};padding:8px;`
            : "";
          return sectionHtml.replace(
            "<section ",
            `<section style="grid-column:${column};grid-row:${row};${sidebarStyle}" `,
          );
        }).join("");
      })()
      : orderedSections.join("");
  const designHeadingFont = design?.headingFont === "serif" ? "Georgia, 'Times New Roman', serif" : fontFamily;
  const headingTreatment = design?.headingTreatment === "uppercase" ? "uppercase" : "none";
  const headingStyle = design?.sectionStyle === "accent-bar"
    ? `border-left:3px solid ${primaryColor};padding-left:6px;border-bottom:0;`
    : design?.sectionStyle === "plain" ? "border-bottom:0;" : `border-bottom:1px solid ${borderColor};`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(document.fullName || "CV")}</title>
    <style>
      @page { size:A4 portrait; margin:${margins[0]} ${margins[1]}; }
      * { box-sizing:border-box; }
      html, body { margin:0; padding:0; color:${textColor}; background:${backgroundColor}; }
      body { font-family:${fontFamily}; font-size:${fontSize}pt; line-height:1.45; overflow-wrap:anywhere; }
      header { text-align:${design?.headerAlignment || "left"}; border-bottom:1px solid ${borderColor}; padding-bottom:10px; margin-bottom:10px; }
      h1 { margin:0; color:${primaryColor}; font-family:${designHeadingFont}; font-size:22pt; line-height:1.15; }
      .headline { margin-top:4px; color:#475569; font-size:11pt; font-weight:600; }
      .contact { margin-top:7px; color:#64748b; font-size:9pt; overflow-wrap:anywhere; }
      main { display:${isDouble && !isStylish ? "grid" : "block"}; grid-template-columns:${columns}; gap:${design?.density === "compact" ? "10px 18px" : "16px 24px"}; align-items:start; }
      main > section { min-width:0; margin:0 0 12px; }
      .cv-pdf-columns { display:grid; grid-template-columns:${columns}; gap:${design?.density === "compact" ? "20px" : "32px"}; align-items:start; }
      .cv-pdf-column { display:flex; flex-direction:column; gap:${sectionSpacing}px; min-width:0; break-inside:auto; page-break-inside:auto; }
      .cv-pdf-column > section { min-width:0; margin:0; }
      h2 { margin:0 0 6px; padding:0 0 4px; color:${primaryColor}; font-family:${designHeadingFont}; font-size:10pt; font-weight:700; letter-spacing:.08em; text-transform:${headingTreatment}; ${headingStyle} break-after:avoid; page-break-after:avoid; }
      p { margin:4px 0; }
      ul { margin:4px 0; padding-left:18px; }
      li { margin:2px 0; }
      .experience-item, .education-item { margin-bottom:9px; break-inside:avoid; page-break-inside:avoid; }
      .item-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:2px 10px; }
      .item-heading span { color:#475569; font-size:9pt; font-weight:600; }
      .muted { color:#475569; font-size:9.5pt; }
      .skill-list { display:flex; flex-wrap:wrap; gap:4px; }
      .skill { display:inline-block; max-width:100%; padding:2px 7px; border:1px solid ${borderColor}; border-radius:4px; background:${secondaryColor}; color:${primaryColor}; font-size:9pt; break-inside:avoid; }
      ${isStylish ? `
      body.template-stylish, body.template-stylish * { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      body.template-stylish header { color:#ffffff; background:${primaryColor}; border:0; border-radius:2px; padding:16px 18px; margin-bottom:14px; break-inside:avoid; page-break-inside:avoid; }
      body.template-stylish header h1 { color:#ffffff; }
      body.template-stylish header .headline, body.template-stylish header .contact { color:#ffffff; }
      body.template-stylish .cv-pdf-columns { display:grid; grid-template-columns:${columns}; align-items:start; }
      body.template-stylish .cv-pdf-column { display:flex; flex-direction:column; gap:${sectionSpacing}px; min-width:0; break-inside:auto; page-break-inside:auto; }
      body.template-stylish .cv-pdf-column > section { min-width:0; margin:0; }
      body.template-stylish .cv-pdf-column > section[data-template-section="summary"],
      body.template-stylish .cv-pdf-column > section[data-template-section="education"],
      body.template-stylish .cv-pdf-column > section[data-template-section="skills"],
      body.template-stylish .cv-pdf-column > section[data-template-section="projects"],
      body.template-stylish .cv-pdf-column > section[data-template-section="certifications"],
      body.template-stylish .cv-pdf-column > section[data-template-section="custom"],
      body.template-stylish .cv-pdf-column > section[data-template-section="languages"],
      body.template-stylish .cv-pdf-column > section[data-template-section="references"] { break-inside:avoid; page-break-inside:avoid; }
      body.template-stylish .experience-item,
      body.template-stylish .education-item,
      body.template-stylish .reference-item,
      body.template-stylish li { break-inside:avoid; page-break-inside:avoid; }
      body.template-stylish .skill-list { display:flex; flex-wrap:wrap; gap:6px; align-items:flex-start; }
      body.template-stylish .skill { display:inline-flex; flex:0 1 auto; align-items:center; max-width:100%; border-radius:999px; white-space:nowrap; break-inside:avoid; page-break-inside:avoid; }
      ` : ""}
      .custom-section { margin:0 0 12px; }
    </style></head><body${isStylish ? ' class="template-stylish"' : ""}><header><h1>${renderText(document.fullName || "Candidate Name")}</h1>
      ${document.headline ? `<div class="headline">${renderText(document.headline)}</div>` : ""}
      ${headerContacts ? `<div class="contact">${headerContacts}</div>` : ""}
    </header><main>${layoutSections}</main></body></html>`;
}
