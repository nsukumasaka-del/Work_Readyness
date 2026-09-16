/**
 * Browser-side PDF text extraction via PDF.js.
 * Keeps CV uploads off the Render cold-start / Cloudflare 524 path.
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
    const line = content.items
      .map((item) => ("str" in item ? String(item.str || "") : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) pages.push(line);
  }

  return pages.join("\n\n").trim();
}
