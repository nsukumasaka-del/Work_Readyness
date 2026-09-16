/**
 * Build the JSON body for /api/career/cv/parse-upload.
 * PDFs are read in-browser so we only send text (avoids Render/CF timeouts).
 */
import { extractPdfTextFromFile, isPdfFile } from "@/lib/extract-pdf-text";

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
    } catch (err) {
      throw new Error(
        `Could not read this PDF. ${(err as Error)?.message || "Parser failed."} Try a text-based PDF, Word (.docx), or paste the CV text.`,
      );
    }
    if (!text || text.trim().length < 10) {
      throw new Error(
        "No readable text was found in this PDF (it may be a scanned image). Please upload a text-based PDF, Word (.docx), or paste the CV text.",
      );
    }
    return { fileName: file.name, text };
  }

  onProgress?.("Uploading document for secure parsing…");
  const fileData = await readFileAsDataUrl(file);
  return { fileName: file.name, fileData };
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
