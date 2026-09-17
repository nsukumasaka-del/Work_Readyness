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
    let browserExtractionFailed = false;
    
    try {
      text = await extractPdfTextFromFile(file);
      onProgress?.("Browser PDF extraction completed successfully");
    } catch (err) {
      browserExtractionFailed = true;
      console.warn("Browser PDF extraction failed:", err);
      // Some valid PDFs use features that PDF.js in a browser cannot decode.
      // Send the original file to the API, which has an independent parser.
      onProgress?.("Browser extraction was unavailable; trying the secure CV reader…");
    }

    if (!browserExtractionFailed && text.trim().length >= 10) {
      // Browser extraction succeeded. Do not send the binary PDF as well: the
      // legacy API may fail while re-parsing an otherwise readable document.
      return { fileName: file.name, text };
    }
    
    // Browser extraction was unavailable or failed, so let the server's independent
    // parser make the final attempt.
    onProgress?.("Sending file to server for advanced processing…");
    const fileData = await readFileAsDataUrl(file);
    return { fileName: file.name, fileData };
  }

  if (isDocxFile(file)) {
    onProgress?.("Reading Word document securely in your browser…");
    try {
      const text = await extractDocxTextFromFile(file);
      return { fileName: file.name, text };
    } catch (err) {
      console.error("DOCX extraction failed:", err);
      throw new Error(`Could not read Word document: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (isPlainTextFile(file)) {
    onProgress?.("Reading CV text…");
    try {
      const text = await extractPlainTextFromFile(file);
      if (text.length < 10) throw new Error("No readable text was found in this file.");
      return { fileName: file.name, text };
    } catch (err) {
      console.error("Text file extraction failed:", err);
      throw new Error(`Could not read text file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
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
  
  if (status === 413) {
    return "The file is too large. Please upload a smaller CV file (under 10MB) or paste the text directly.";
  }
  
  if (status === 415) {
    return "Unsupported file format. Please upload a PDF, Word (.docx), or plain text (.txt) file.";
  }
  
  if (status === 400) {
    return errBody?.error || "Unable to read this document. Please upload a text-based PDF, Word (.docx), or .txt file.";
  }
  
  if (status === 500) {
    return "An error occurred while processing your CV. Please try again or paste your CV text directly.";
  }
  
  return (
    errBody?.error ||
    "Unable to read this document. Please upload a text-based PDF, Word (.docx), or .txt file."
  );
}
