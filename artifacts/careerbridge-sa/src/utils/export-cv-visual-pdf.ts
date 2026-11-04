import { authFetch } from "@/lib/auth-session";
import type { TemplateDesign } from "../../../../shared/template-design";

export type CvPdfExportStage = "preparing" | "rendering" | "downloading";
type CvPdfSourceDocument = {
  fullName?: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  experiences?: Array<{ role?: string; company?: string; location?: string; startDate?: string; endDate?: string; bullets?: string[] }>;
  education?: Array<{ degree?: string; institution?: string; location?: string; graduationYear?: string; details?: string }>;
  skills?: string[];
  toolsAndSoftware?: string[];
  projects?: Array<{ title?: string; subtitle?: string; bullets?: string[] }>;
  certifications?: Array<{ name?: string; issuer?: string; year?: string }>;
  languages?: string[];
  references?: string[];
  sections?: Array<{ heading?: string; items?: string[] }>;
};
export type CvPdfAppearance = {
  templateId?: string;
  columnRatio?: number;
  sectionSpacing?: number;
  primaryColor: string;
  secondaryColor: string;
  borderColor: string;
  fontId: string;
  fontSize: number;
  marginSize: "compact" | "normal" | "wide";
  columns: "single" | "double";
  sectionOrder: readonly string[];
  visibleSections: Readonly<Record<string, boolean>>;
  templateDesign?: TemplateDesign | null;
};

const MAX_CV_PDF_PAYLOAD_BYTES = 512_000;

function boundedText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function boundedTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  return Array.isArray(value)
    ? value.slice(0, maxItems).map((item) => boundedText(item, maxLength)).filter((item) => item.trim())
    : [];
}

function compactCvDocument(cvDocument: CvPdfSourceDocument) {
  return {
    fullName: boundedText(cvDocument.fullName, 240),
    headline: boundedText(cvDocument.headline, 400),
    email: boundedText(cvDocument.email, 320),
    phone: boundedText(cvDocument.phone, 100),
    location: boundedText(cvDocument.location, 240),
    linkedin: boundedText(cvDocument.linkedin, 500),
    website: boundedText(cvDocument.website, 500),
    summary: boundedText(cvDocument.summary, 8_000),
    experiences: (Array.isArray(cvDocument.experiences) ? cvDocument.experiences : []).slice(0, 100).map((item) => ({
      role: boundedText(item.role, 240),
      company: boundedText(item.company, 240),
      location: boundedText(item.location, 240),
      startDate: boundedText(item.startDate, 80),
      endDate: boundedText(item.endDate, 80),
      bullets: boundedTextList(item.bullets, 30, 1_000),
    })),
    education: (Array.isArray(cvDocument.education) ? cvDocument.education : []).slice(0, 100).map((item) => ({
      degree: boundedText(item.degree, 300),
      institution: boundedText(item.institution, 300),
      location: boundedText(item.location, 240),
      graduationYear: boundedText(item.graduationYear, 80),
      details: boundedText(item.details, 1_000),
    })),
    skills: boundedTextList(cvDocument.skills, 300, 240),
    toolsAndSoftware: boundedTextList(cvDocument.toolsAndSoftware, 200, 240),
    projects: (Array.isArray(cvDocument.projects) ? cvDocument.projects : []).slice(0, 100).map((item) => ({
      title: boundedText(item.title, 300),
      subtitle: boundedText(item.subtitle, 300),
      bullets: boundedTextList(item.bullets, 30, 1_000),
    })),
    certifications: (Array.isArray(cvDocument.certifications) ? cvDocument.certifications : []).slice(0, 100).map((item) => ({
      name: boundedText(item.name, 300),
      issuer: boundedText(item.issuer, 300),
      year: boundedText(item.year, 80),
    })),
    languages: boundedTextList(cvDocument.languages, 100, 160),
    references: boundedTextList(cvDocument.references, 100, 1_000),
    sections: (Array.isArray(cvDocument.sections) ? cvDocument.sections : []).slice(0, 50).map((item) => ({
      heading: boundedText(item.heading, 200),
      items: boundedTextList(item.items, 50, 1_000),
    })),
  };
}

/** Send only bounded CV fields; the Worker builds a small printable document. */
export async function exportCvVisualPdf(
  cvDocument: CvPdfSourceDocument,
  filename: string,
  templateId: string,
  appearance: CvPdfAppearance,
  onStageChange?: (stage: CvPdfExportStage) => void,
): Promise<void> {
  onStageChange?.("preparing");
  const safeName = filename.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-") || "BonList-CV";
  const body = JSON.stringify({
    document: compactCvDocument(cvDocument),
    templateId,
    filename: `${safeName}.pdf`,
    appearance: {
      ...appearance,
      templateId,
      sectionOrder: appearance.sectionOrder.slice(0, 20),
      visibleSections: appearance.visibleSections,
    },
  });
  if (new TextEncoder().encode(body).length > MAX_CV_PDF_PAYLOAD_BYTES) {
    throw new Error("This CV is too large to export. Please shorten unusually long entries and try again.");
  }
  onStageChange?.("rendering");
  const response = await authFetch("/api/career/cv/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!response.ok) {
    const message = await readExportError(response);
    console.error("[CV PDF rendering failed]", { status: response.status, message });
    throw new Error(message);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/pdf") {
    throw new Error("The PDF service returned an invalid document. Please try again.");
  }
  onStageChange?.("downloading");
  const pdf = await response.blob();
  if (!pdf.size) throw new Error("The PDF service returned an empty document. Please try again.");
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function readExportError(response: Response): Promise<string> {
  const responseText = await response.text().catch(() => "");
  if (responseText) {
    try {
      const payload: unknown = JSON.parse(responseText);
      if (payload && typeof payload === "object") {
        const error = (payload as Record<string, unknown>).error;
        if (typeof error === "string" && error.trim()) return error.trim();
        const message = (payload as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim()) return message.trim();
      }
    } catch {
      return responseText;
    }
  }
  return `PDF export failed (${response.status}).`;
}

function hasManualPosition(element: HTMLElement, root: HTMLElement): boolean {
  for (let parent: HTMLElement | null = element; parent && parent !== root; parent = parent.parentElement) {
    const transform = getComputedStyle(parent).transform;
    if (transform === "none") continue;
    const matrix = new DOMMatrixReadOnly(transform);
    if (Math.abs(matrix.m41) > 0.01 || Math.abs(matrix.m42) > 0.01) return true;
  }
  return false;
}

export function measureCvPages(source: HTMLElement) {
  const style = getComputedStyle(source);
  const pageHeightPx = 297 * 96 / 25.4;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const height = Math.max(source.scrollHeight, source.offsetHeight);
  const managedHeight = source.querySelector<HTMLElement>("[data-managed-pages-container]")?.offsetHeight || 0;
  // Translated/positioned blocks can extend into the trailing paper padding.
  // scrollHeight includes those bounds, but subtracting padding from it can
  // discard the final lines. Measure painted content independently of flow.
  const rootRect = source.getBoundingClientRect();
  const scale = rootRect.width / parseFloat(style.width) || 1;
  let contentBottom = 0;
  for (const element of source.querySelectorAll<HTMLElement>("*")) {
    if (element.closest(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-badge, [data-managed-pages-container], [data-a4-spacer]")) continue;
    // Container backgrounds stretch with the paper; only leaf content and
    // editable fields establish the last visible CV line.
    if (element.childElementCount && !element.matches("input, textarea, select")) continue;
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    if (!rect.width || !rect.height || computed.visibility === "hidden" || computed.display === "none") continue;
    contentBottom = Math.max(contentBottom, (rect.bottom - rootRect.top) / scale);
  }
  const contentHeight = Math.max(contentBottom, height - managedHeight - paddingBottom);
  const naturalHeight = Math.max(pageHeightPx, contentHeight);
  // The final content block must finish before the page's bottom padding, not
  // merely before the physical edge of the A4 sheet.
  const naturalPages = Math.max(1, Math.ceil((contentHeight + paddingBottom - 1) / pageHeightPx));
  const managedCount = source.querySelectorAll("[data-managed-page]").length;
  return { pageHeightPx, naturalHeight, naturalPages, pageCount: naturalPages + managedCount, height };
}

/** Measure in DOM order with temporary spacers so nested blocks and both
 * columns include earlier shifts. Restore the live canvas before returning. */
export function computeCvPageSpacers(root: HTMLElement, includePositionedBlocks = false): Record<string, number> {
  const pageH = measureCvPages(root).pageHeightPx;
  const styles = getComputedStyle(root);
  const padY = parseFloat(styles.paddingTop) || 0;
  const padBottom = parseFloat(styles.paddingBottom) || padY;
  const usable = Math.max(40, pageH - padY - padBottom);
  const edgeSafety = Math.max(padBottom + 16, pageH * 0.06, 52);
  const existing = Array.from(root.querySelectorAll<HTMLElement>("[data-a4-spacer]"));
  const saved = existing.map((el) => el.getAttribute("style"));
  const temporary: HTMLElement[] = [];
  const result: Record<string, number> = {};
  try {
    existing.forEach((el) => { el.style.height = "0px"; el.style.minHeight = "0px"; });
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-a4-id]"))) {
      // Flowing sections paginate their entry children, not the entire list.
      if (el.dataset.a4Flow === "auto") continue;
      if (el.closest(".no-print, [data-preview-only='true'], [data-managed-pages-container]") || el.offsetParent === null) continue;
      // Free-positioned cards own their placement. Adding an automatic spacer
      // based on the translated bounds moves them a second time after a drag.
      if (!includePositionedBlocks && hasManualPosition(el, root)) continue;
      const id = el.dataset.a4Id;
      if (!id) continue;
      const rootRect = root.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const scale = rootRect.width / parseFloat(styles.width) || 1;
      const top = (rect.top - rootRect.top) / scale;
      const height = rect.height / scale;
      if (height <= 1 || height > usable - 4) continue;
      const hardEnd = (Math.floor(top / pageH) + 1) * pageH;
      if (top + height <= hardEnd - edgeSafety) continue;
      const push = Math.ceil(hardEnd + padY - top);
      if (push <= 0 || push >= pageH) continue;
      result[id] = push;
      let spacer = existing.find((item) => item.dataset.a4Spacer === id);
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.style.cssText = "width:100%;flex-shrink:0;margin:0;padding:0;overflow:hidden";
        el.before(spacer);
        temporary.push(spacer);
      }
      spacer.style.height = `${push}px`;
      spacer.style.minHeight = `${push}px`;
    }
  } finally {
    temporary.forEach((el) => el.remove());
    existing.forEach((el, index) => {
      if (saved[index] == null) el.removeAttribute("style");
      else el.setAttribute("style", saved[index]!);
    });
  }
  return result;
}
