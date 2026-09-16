/**
 * Browser-side PDF text extraction via PDF.js.
 * Preserves line breaks so CV section parsers can find Experience / Education / Skills.
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let workerConfigured = false;

function ensurePdfWorker() {
  if (workerConfigured) return;
  GlobalWorkerOptions.workerSrc = pdfWorker;
  workerConfigured = true;
}

export function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".pdf") || file.type === "application/pdf";
}

/**
 * Rebuild readable multi-line text from PDF.js text items using Y positions + hasEOL.
 * Collapsing every page into one space-joined string breaks CV section parsing.
 */
function textContentToLines(items: unknown[]): string[] {
  const rows: { y: number; parts: { x: number; text: string }[]; forceBreak: boolean }[] = [];
  const yTolerance = 3;

  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as { str?: string; transform?: number[]; hasEOL?: boolean };
    const text = String(item.str || "").replace(/\s+/g, " ").trim();
    const transform = item.transform || [];
    const x = typeof transform[4] === "number" ? transform[4] : 0;
    const y = typeof transform[5] === "number" ? transform[5] : 0;
    const forceBreak = Boolean(item.hasEOL);

    if (!text && !forceBreak) continue;

    let row = rows.find((r) => Math.abs(r.y - y) <= yTolerance);
    if (!row) {
      row = { y, parts: [], forceBreak: false };
      rows.push(row);
    }
    if (text) row.parts.push({ x, text });
    if (forceBreak) row.forceBreak = true;
  }

  // PDF Y grows upward — sort top-to-bottom, then left-to-right within a row
  rows.sort((a, b) => b.y - a.y || a.parts[0]?.x! - b.parts[0]?.x!);

  const lines: string[] = [];
  for (const row of rows) {
    row.parts.sort((a, b) => a.x - b.x);
    const line = row.parts
      .map((p) => p.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) lines.push(line);
    else if (row.forceBreak) lines.push("");
  }

  return lines;
}

/**
 * If extraction still produced almost no newlines, insert breaks before common CV headings.
 * Also collapses letter-spaced PDF headings (P R O F E S S I O N A L …).
 */
export function restoreCvSectionBreaks(text: string): string {
  const collapsed = collapseLetterSpacedLocal(text);
  const trimmed = collapsed.trim();
  if (!trimmed) return "";

  const newlineCount = (trimmed.match(/\n/g) || []).length;
  const looksFlattened = newlineCount < 4 && trimmed.length > 200;
  if (!looksFlattened) return trimmed;

  const headings =
    "Professional Summary|Summary|Profile|About Me|Executive Summary|Career Objective|" +
    "Key Impact|Key Achievements|Career Highlights|Highlights|" +
    "Work Experience|Professional Experience|Employment History|Employment|Experience|Career History|" +
    "Education(?: and Qualifications)?|Qualifications|Academic History|Academic Background|" +
    "Professional Skills|Core Competencies|Technical Skills|Key Skills|Skills(?: and Competencies)?|Competencies|Tools & Technologies|" +
    "Projects|Key Projects|Portfolio|Notable Projects|" +
    "Certifications|Certificates|Licenses|Courses|" +
    "Languages|Language Skills|" +
    "References|Referees";

  const re = new RegExp(`\\s+(?=(?:${headings})\\b)`, "gi");
  return trimmed.replace(re, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function collapseLetterSpacedLocal(text: string): string {
  return String(text || "")
    .split(/\r\n|\r|\n/)
    .map((line) => {
      let out = line.trim();
      if (!out) return "";
      let prev = "";
      do {
        prev = out;
        out = out.replace(/\b([A-Za-zÀ-ÿ])\s+(?=[A-Za-zÀ-ÿ]\b)/g, "$1");
      } while (out !== prev);
      out = out
        .replace(/PROFESSIONAL(?=SUMMARY|EXPERIENCE|SKILLS|STATEMENT)/i, "PROFESSIONAL ")
        .replace(/TECHNICAL(?=SKILLS)/i, "TECHNICAL ")
        .replace(/WORK(?=EXPERIENCE|HISTORY)/i, "WORK ")
        .replace(/CORE(?=COMPETENCIES|SKILLS)/i, "CORE ")
        .replace(/KEY(?=SKILLS|ACHIEVEMENTS|PROJECTS|IMPACT)/i, "KEY ")
        .replace(/CAREER(?=HISTORY|HIGHLIGHTS|OBJECTIVE)/i, "CAREER ")
        .replace(/EMPLOYMENT(?=HISTORY)/i, "EMPLOYMENT ")
        .replace(/ACADEMIC(?=HISTORY|BACKGROUND|QUALIFICATIONS)/i, "ACADEMIC ")
        .replace(/LANGUAGE(?=SKILLS)/i, "LANGUAGE ")
        .replace(/PERSONAL(?=DETAILS|INFORMATION|PROFILE)/i, "PERSONAL ")
        .replace(/CONTACT(?=INFORMATION|DETAILS)/i, "CONTACT ")
        .replace(/EDUCATION(?=AND)/i, "EDUCATION ")
        .replace(/AND(?=QUALIFICATIONS)/i, "AND ");
      return out.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}

export async function extractPdfTextFromFile(file: File): Promise<string> {
  ensurePdfWorker();

  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = textContentToLines(content.items || []);
    const pageText = lines.join("\n").trim();
    if (pageText) pages.push(pageText);
  }

  const raw = pages.join("\n\n").trim();
  return restoreCvSectionBreaks(raw);
}
