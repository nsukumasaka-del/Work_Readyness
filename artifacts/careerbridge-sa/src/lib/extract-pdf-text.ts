/**
 * Browser-side PDF text extraction via PDF.js.
 * Preserves line breaks so CV section parsers can find Experience / Education / Skills.
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { reconstructPdfTextFromItems, type PositionedPdfTextItem } from "../../../api-server/src/lib/pdf-layout-text";

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
    "Professional Summary|Executive Summary|Career Objective|About Me|" +
    "Key Impact|Key Achievements|Career Highlights|" +
    "Work Experience|Professional Experience|Employment History|Career History|Relevant Experience|Previous Employment|" +
    "Education and Qualifications|Academic History|Academic Background|" +
    "Professional Skills|Core Competencies|Technical Skills|Key Skills|Tools & Technologies|Tools and Technologies|" +
    "Key Projects|Notable Projects|Selected Projects|" +
    "Professional Certifications|" +
    "Language Skills|" +
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
  try {
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
      const positionedItems = (content.items || []).flatMap((raw): PositionedPdfTextItem[] => {
        if (!raw || typeof raw !== "object" || !("str" in raw)) return [];
        const item = raw as { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
        const transform = item.transform || [];
        if (typeof transform[4] !== "number" || typeof transform[5] !== "number") return [];
        return [{
          str: String(item.str || ""),
          x: transform[4],
          y: transform[5],
          width: typeof item.width === "number" ? item.width : 0,
          height: typeof item.height === "number" ? item.height : undefined,
          fontSize: typeof transform[0] === "number" ? Math.hypot(transform[0], transform[1] || 0) : undefined,
          hasEOL: Boolean(item.hasEOL),
        }];
      });
      const pageText = reconstructPdfTextFromItems([positionedItems]).trim();
      if (pageText) pages.push(pageText);
    }

    const raw = pages.join("\n\n").trim();
    const result = restoreCvSectionBreaks(raw);
    
    if (!result || result.length < 10) {
      throw new Error("Extracted PDF text is too short or empty");
    }
    
    return result;
  } catch (err) {
    console.error("Browser PDF extraction error:", err);
    throw new Error(`PDF extraction failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}
