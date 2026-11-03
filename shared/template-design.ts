export const TEMPLATE_SECTION_KEYS = [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "languages",
  "references",
  "custom",
] as const;

export type TemplateSectionKey = typeof TEMPLATE_SECTION_KEYS[number];

export type TemplateDesign = {
  version: 1;
  columns: "single" | "double";
  sidebarSide: "left" | "right";
  headerAlignment: "left" | "center";
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  sidebarColor: string;
  headingFont: "serif" | "sans";
  headingTreatment: "uppercase" | "title-case";
  sectionStyle: "rule" | "accent-bar" | "plain";
  density: "compact" | "comfortable";
  primarySections: TemplateSectionKey[];
  sidebarSections: TemplateSectionKey[];
};

const SECTION_KEYS = new Set<string>(TEMPLATE_SECTION_KEYS);
const isColor = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);

export function parseTemplateDesign(value: unknown): TemplateDesign | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const design = value as Record<string, unknown>;
  const isSectionList = (sections: unknown): sections is TemplateSectionKey[] =>
    Array.isArray(sections) && sections.length > 0 &&
    sections.every((section) => typeof section === "string" && SECTION_KEYS.has(section)) &&
    new Set(sections).size === sections.length;

  if (
    design.version !== 1 ||
    (design.columns !== "single" && design.columns !== "double") ||
    (design.sidebarSide !== "left" && design.sidebarSide !== "right") ||
    (design.headerAlignment !== "left" && design.headerAlignment !== "center") ||
    !isColor(design.accentColor) ||
    !isColor(design.backgroundColor) ||
    !isColor(design.textColor) ||
    !isColor(design.sidebarColor) ||
    (design.headingFont !== "serif" && design.headingFont !== "sans") ||
    (design.headingTreatment !== "uppercase" && design.headingTreatment !== "title-case") ||
    (design.sectionStyle !== "rule" && design.sectionStyle !== "accent-bar" && design.sectionStyle !== "plain") ||
    (design.density !== "compact" && design.density !== "comfortable") ||
    !isSectionList(design.primarySections) ||
    (design.columns === "double" && !isSectionList(design.sidebarSections)) ||
    (design.columns === "single" && design.sidebarSections !== undefined &&
      (!Array.isArray(design.sidebarSections) || design.sidebarSections.length !== 0))
  ) return null;

  const primarySections = design.primarySections as TemplateSectionKey[];
  const sidebarSections = design.columns === "double"
    ? design.sidebarSections as TemplateSectionKey[]
    : [];
  if (primarySections.some((section) => sidebarSections.includes(section))) return null;

  return {
    version: 1,
    columns: design.columns,
    sidebarSide: design.sidebarSide,
    headerAlignment: design.headerAlignment,
    accentColor: design.accentColor,
    backgroundColor: design.backgroundColor,
    textColor: design.textColor,
    sidebarColor: design.sidebarColor,
    headingFont: design.headingFont,
    headingTreatment: design.headingTreatment,
    sectionStyle: design.sectionStyle,
    density: design.density,
    primarySections,
    sidebarSections,
  };
}
