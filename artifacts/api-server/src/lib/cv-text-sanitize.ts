/** Keep CV text validation free of Node APIs so the parser can run on Workers. */
const PDF_MARKERS = [
  /\/Type\s*\/Catalog/i,
  /\/Type\s*\/Pages/i,
  /\/Type\s*\/Font\b/i,
  /\/Filter\s*\/FlateDecode/i,
  /endstream/i,
  /startxref/i,
  /%%EOF/i,
];

export function looksLikePdfBinary(text: string): boolean {
  const sample = text.slice(0, 4000);
  if (sample.startsWith("%PDF-")) return true;
  if (/\d+\s+\d+\s+obj/.test(sample) && /endobj|stream|xref/i.test(sample)) return true;
  return PDF_MARKERS.filter((marker) => marker.test(sample)).length >= 2;
}

export function collapseLetterSpacedText(text: string): string {
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
      return out
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
        .replace(/AND(?=QUALIFICATIONS)/i, "AND ")
        .replace(/\s+/g, " ")
        .trim();
    })
    .join("\n");
}

export function restoreCvSectionBreaks(text: string): string {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  if ((trimmed.match(/\n/g) || []).length >= 4 || trimmed.length <= 200) return trimmed;
  const headings =
    "Professional Summary|Executive Summary|Career Objective|About Me|" +
    "Key Impact|Key Achievements|Career Highlights|" +
    "Work Experience|Professional Experience|Employment History|Career History|Relevant Experience|Previous Employment|" +
    "Education and Qualifications|Academic History|Academic Background|" +
    "Professional Skills|Core Competencies|Technical Skills|Key Skills|Tools & Technologies|Tools and Technologies|" +
    "Key Projects|Notable Projects|Selected Projects|Professional Certifications|Language Skills|References|Referees";
  return trimmed
    .replace(new RegExp(`\\s+(?=(?:${headings})\\b)`, "gi"), "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function sanitizeExtractedCvText(raw: string, options: { preserveParagraphs?: boolean } = {}): string {
  if (!raw) return "";
  const collapsed = collapseLetterSpacedText(
      raw
        .replace(/\u0000/g, "")
        .replace(/[\uFFFD\uFFFE\uFFFF]+/g, " ")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " "),
    );
  let text = options.preserveParagraphs ? collapsed.trim() : restoreCvSectionBreaks(collapsed);
  if (looksLikePdfBinary(text)) return "";
  const cleanedLines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return options.preserveParagraphs;
      if (/^(?:\d+\s+\d+\s+obj|endobj|stream|endstream|xref|trailer|startxref|%%EOF|\/[A-Z][A-Za-z0-9]+(?:\s+\d+)?)\s*$/i.test(line)) return false;
      if (/^\d+\s+\d+\s+R$/.test(line)) return false;
      if (/^<<.*>>$/.test(line) && line.includes("/")) return false;
      const printable = line.replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, "");
      return printable.length >= Math.min(3, line.length) || line.length <= 2;
    })
    .map((line) => line ? line.replace(/\s{2,}/g, " ").replace(/\b\d+\s+\d+\s+obj\b/gi, " ").replace(/\bendobj\b/gi, " ").trim() : "");
  text = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return looksLikePdfBinary(text) ? "" : text;
}
