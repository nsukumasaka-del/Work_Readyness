/**
 * Reliable text extraction from uploaded CV documents (PDF / DOCX / plain text).
 * Never returns raw binary PDF/DOCX bytes as "text" — that leaks artifacts like "1 0 obj".
 */

export class DocumentExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractionError";
  }
}

/** Classic PDF object / stream markers that must never appear in readable CV text. */
const PDF_BINARY_MARKERS = [
  /\/Type\s*\/Catalog/i,
  /\/Type\s*\/Pages/i,
  /\/Type\s*\/Page\b/i,
  /\/Type\s*\/Font\b/i,
  /\/Type\s*\/XObject/i,
  /\/Length\s+\d+/i,
  /\/Filter\s*\/FlateDecode/i,
  /\/Root\s+\d+\s+\d+\s+R/i,
  /endstream/i,
  /startxref/i,
  /%%EOF/i,
];

const PDF_LINE_JUNK =
  /^(?:\d+\s+\d+\s+obj|endobj|stream|endstream|xref|trailer|startxref|%%EOF|\/[A-Z][A-Za-z0-9]+(?:\s+\d+)?)\s*$/i;

/**
 * True when the string looks like raw PDF source rather than extracted human text.
 */
export function looksLikePdfBinary(text: string): boolean {
  if (!text || text.trim().length < 8) return false;
  const sample = text.slice(0, 4000);
  if (sample.startsWith("%PDF-")) return true;
  if (/\d+\s+\d+\s+obj/.test(sample) && /endobj|stream|xref/i.test(sample)) return true;
  let markerHits = 0;
  for (const re of PDF_BINARY_MARKERS) {
    if (re.test(sample)) markerHits += 1;
  }
  return markerHits >= 2;
}

/**
 * Strip PDF object lines, control chars, and replacement characters from extracted text.
 */
export function sanitizeExtractedCvText(raw: string): string {
  if (!raw) return "";

  let text = raw
    .replace(/\u0000/g, "")
    .replace(/[\uFFFD\uFFFE\uFFFF]+/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");

  // Drop entire PDF binary dumps early
  if (looksLikePdfBinary(text)) {
    return "";
  }

  const cleanedLines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (PDF_LINE_JUNK.test(line)) return false;
      if (/^\d+\s+\d+\s+R$/.test(line)) return false;
      if (/^<<.*>>$/.test(line) && line.includes("/")) return false;
      // Drop lines that are mostly non-printable / replacement garbage
      const printable = line.replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, "");
      if (printable.length < Math.min(3, line.length) && line.length > 2) return false;
      return true;
    })
    .map((line) =>
      line
        .replace(/\s{2,}/g, " ")
        .replace(/\b\d+\s+\d+\s+obj\b/gi, " ")
        .replace(/\bendobj\b/gi, " ")
        .trim(),
    )
    .filter(Boolean);

  text = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Final guard: if sanitization still left PDF markers, reject
  if (looksLikePdfBinary(text)) return "";

  return text;
}

function decodeDataUrlOrBase64(fileData: string): Buffer {
  const base64Data = fileData.includes(",") ? fileData.split(",")[1]! : fileData;
  return Buffer.from(base64Data, "base64");
}

/**
 * PDF text extraction via unpdf (serverless PDF.js) — no DOMMatrix/canvas required.
 * Avoids pdf-parse/@napi-rs/canvas crashes on Render.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const data = new Uint8Array(buffer);
  const extraction = extractText(data, { mergePages: true });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("PDF parsing timed out")), 25_000);
  });
  const result = await Promise.race([extraction, timeout]);
  const rawText = result.text as string | string[];
  const text = typeof rawText === "string" ? rawText : rawText.join("\n\n");
  return sanitizeExtractedCvText(text);
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  const extractRaw =
    mammoth.extractRawText ||
    (mammoth as unknown as { default?: { extractRawText?: typeof mammoth.extractRawText } }).default
      ?.extractRawText;
  if (typeof extractRaw !== "function") {
    throw new DocumentExtractionError("Word document parser is unavailable.");
  }
  const docxRes = await extractRaw({ buffer });
  return sanitizeExtractedCvText(docxRes?.value || "");
}

export type UploadedDocumentKind = "pdf" | "docx" | "txt" | "unknown";

export function detectDocumentKind(fileName?: string, fileData?: string): UploadedDocumentKind {
  const lower = (fileName || "").toLowerCase();
  if (lower.endsWith(".pdf") || fileData?.startsWith("data:application/pdf")) return "pdf";
  if (
    lower.endsWith(".docx") ||
    fileData?.startsWith("data:application/vnd.openxmlformats-officedocument.wordprocessingml.document")
  ) {
    return "docx";
  }
  if (lower.endsWith(".txt") || lower.endsWith(".text") || fileData?.startsWith("data:text/")) return "txt";
  return "unknown";
}

/**
 * Extract readable CV text from an uploaded file (base64 / data-URL) or plain pasted text.
 * Throws DocumentExtractionError when binary formats cannot be read as human text.
 */
export async function extractTextFromUpload(options: {
  text?: string;
  fileName?: string;
  fileData?: string;
}): Promise<{ text: string; kind: UploadedDocumentKind }> {
  const pasted = String(options.text || "").trim();
  if (pasted) {
    const sanitized = sanitizeExtractedCvText(pasted);
    if (!sanitized) {
      throw new DocumentExtractionError(
        "The pasted content looks like a corrupted PDF dump, not readable CV text. Please upload the original PDF/DOCX or paste plain text.",
      );
    }
    return { text: sanitized, kind: "txt" };
  }

  if (!options.fileData) {
    throw new DocumentExtractionError("Text or file data is required for extraction.");
  }

  const kind = detectDocumentKind(options.fileName, options.fileData);
  const buffer = decodeDataUrlOrBase64(options.fileData);

  if (kind === "pdf") {
    let text = "";
    try {
      text = await extractPdfText(buffer);
    } catch (err) {
      throw new DocumentExtractionError(
        `Could not read this PDF. ${(err as Error)?.message || "Parser failed."} Try re-exporting as PDF or upload a .docx / .txt copy.`,
      );
    }
    if (!text || text.length < 10) {
      throw new DocumentExtractionError(
        "No readable text was found in this PDF (it may be a scanned image). Please upload a text-based PDF, Word (.docx), or paste the CV text.",
      );
    }
    return { text, kind };
  }

  if (kind === "docx") {
    let text = "";
    try {
      text = await extractDocxText(buffer);
    } catch (err) {
      throw new DocumentExtractionError(
        `Could not read this Word document. ${(err as Error)?.message || "Parser failed."}`,
      );
    }
    if (!text || text.length < 20) {
      throw new DocumentExtractionError("No readable text was found in this Word document.");
    }
    return { text, kind };
  }

  // Plain text / unknown: only accept if it does not look like PDF binary
  const asUtf8 = sanitizeExtractedCvText(buffer.toString("utf-8"));
  if (!asUtf8 || looksLikePdfBinary(buffer.toString("utf-8"))) {
    throw new DocumentExtractionError(
      "Unsupported or unreadable file. Please upload a PDF, Word (.docx), or plain text (.txt) CV.",
    );
  }
  return { text: asUtf8, kind: kind === "txt" ? "txt" : "unknown" };
}
