/**
 * Build the JSON body for /api/career/cv/parse-upload.
 * PDFs are read in-browser so we only send text (avoids Render/CF timeouts).
 */
import { extractPdfTextFromFile, isPdfFile } from "@/lib/extract-pdf-text";
import {
  extractDocxTextFromFile,
  extractPlainTextFromFile,
  isDocxFile,
  isPlainTextFile,
} from "@/lib/extract-office-text";

export async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export type ParseUploadBody = {
  fileName: string;
  text?: string;
  fileData?: string;
};

export async function buildParseUploadBody(
  file: File,
  onProgress?: (message: string) => void,
): Promise<ParseUploadBody> {
  if (isPdfFile(file)) {
    onProgress?.("Reading PDF text in your browser…");
    let text = "";
    try {
      text = await extractPdfTextFromFile(file);
    } catch {
      // Some valid PDFs use features that PDF.js in a browser cannot decode.
      // Send the original file to the API, which has an independent parser.
      onProgress?.("Browser extraction was unavailable; trying the secure CV reader…");
    }

    // Always send the original file as well. This lets the API retry extraction
    // when the browser returns no selectable text or cannot parse a valid PDF.
    const fileData = await readFileAsDataUrl(file);
    if (text.trim().length >= 10) {
      return { fileName: file.name, text, fileData };
    }
    return { fileName: file.name, fileData };
  }

  if (isDocxFile(file)) {
    onProgress?.("Reading Word document securely in your browser…");
    return { fileName: file.name, text: await extractDocxTextFromFile(file) };
  }

  if (isPlainTextFile(file)) {
    onProgress?.("Reading CV text…");
    const text = await extractPlainTextFromFile(file);
    if (text.length < 10) throw new Error("No readable text was found in this file.");
    return { fileName: file.name, text };
  }

  throw new Error("Unsupported file type. Please upload a PDF, Word (.docx), or .txt CV.");
}

export function parseUploadErrorMessage(
  status: number,
  errBody: { error?: string } | null,
): string {
  if (status === 502 || status === 503 || status === 520 || status === 522 || status === 524) {
    return "The CV reading service is starting up or temporarily unavailable. Wait a few seconds and try again, or paste your CV text / use Enter Information Manually.";
  }
  return (
    errBody?.error ||
    "Unable to read this document. Please upload a text-based PDF, Word (.docx), or .txt file."
  );
}
