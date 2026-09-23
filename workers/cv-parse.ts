import { extractCvDataFromText } from "../artifacts/api-server/src/lib/cv-builder";
import { sanitizeExtractedCvText } from "../artifacts/api-server/src/lib/cv-text-sanitize";
import { extractEdgePdfText } from "../artifacts/api-server/src/lib/edge-pdf-text";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const MAX_FILE_BYTES = 10_000_000;
const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 8;

function decodeBase64File(fileData: string): Uint8Array {
  const comma = fileData.indexOf(",");
  const encoded = (fileData.startsWith("data:") && comma >= 0 ? fileData.slice(comma + 1) : fileData)
    .replace(/\s/g, "");
  if (!encoded || encoded.length > MAX_BASE64_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error("Invalid or oversized base64 file data.");
  }
  const binary = atob(encoded);
  if (binary.length > MAX_FILE_BYTES) throw new Error("The CV file exceeds the 10 MB limit.");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Extract the main document XML from a DOCX ZIP using only Worker Web APIs. */
async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdMin = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= eocdMin; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("The Word file is not a valid DOCX archive.");

  const entryCount = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) break;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if (name === "word/document.xml") {
      if (uncompressedSize > MAX_FILE_BYTES || localOffset + 30 > bytes.length) {
        throw new Error("The Word document content is invalid or too large.");
      }
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("The Word document content is invalid.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      if (compressed.length !== compressedSize) throw new Error("The Word document is truncated.");

      let xmlBytes: Uint8Array;
      if (method === 0) {
        xmlBytes = compressed;
      } else if (method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error("This Word document uses an unsupported compression method.");
      }
      if (xmlBytes.byteLength > MAX_FILE_BYTES) throw new Error("The Word document content is too large.");
      const xml = decoder.decode(xmlBytes);
      return decodeXmlEntities(
        xml
          .replace(/<\/w:p>/gi, "\n")
          .replace(/<w:tab\b[^/]*\/>/gi, "\t")
          .replace(/<w:br\b[^/]*\/>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]+\n/g, "\n")
          .trim(),
      );
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("This Word file is missing word/document.xml.");
}

function parseError(status: number, error: string, code: string): Response {
  return json(status, { success: false, error, code });
}

/** CV text is extracted in the browser, then structured at the edge. D1 is not needed here. */
export async function handleCvParseUpload(request: Request): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 14_000_000) {
    return json(413, { error: "The CV is too large. Please upload a file under 10MB." });
  }

  let body: { fileName?: unknown; text?: unknown; fileData?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid CV upload request." });
  }

  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 255) : undefined;
  let rawText = typeof body.text === "string" ? body.text : "";
  if (!rawText && typeof body.fileData === "string") {
    try {
      if (!fileName) return parseError(400, "A file name is required when sending file data.", "FILE_NAME_REQUIRED");
      const extension = fileName.toLowerCase().split(".").pop();
      const bytes = decodeBase64File(body.fileData);
      if (extension === "txt") {
        rawText = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/^\uFEFF/, "");
      } else if (extension === "docx") {
        rawText = await extractDocxText(bytes);
      } else if (extension === "pdf") {
        rawText = await extractEdgePdfText(bytes);
      } else if (extension === "doc") {
        return parseError(415, "Legacy .doc files are not supported by the CV reader. Save the document as .docx or PDF and upload it again.", "UNSUPPORTED_WORD_FORMAT");
      } else {
        return parseError(415, "Unsupported file type. Upload a PDF, Word (.docx), or text (.txt) CV.", "UNSUPPORTED_FILE_TYPE");
      }
    } catch (error) {
      console.warn("Edge CV file extraction failed", error);
      const message = error instanceof Error ? error.message : "Document extraction failed.";
      const isLarge = /too large|10 mb limit/i.test(message);
      return parseError(isLarge ? 413 : 400, isLarge ? "The CV file is too large. Please upload a file under 10MB." : `Unable to read text from ${fileName || "this file"}. Please upload a text-based PDF, DOCX, or TXT file.`, isLarge ? "FILE_TOO_LARGE" : "FILE_EXTRACTION_FAILED");
    }
  }
  if (!rawText) {
    return parseError(400, "No CV text was received. Please try the upload again or paste your CV text.", "CV_TEXT_REQUIRED");
  }
  if (rawText.length > 1_000_000) {
    return json(413, { error: "The CV text is too large. Please upload a smaller file." });
  }

  const text = sanitizeExtractedCvText(rawText);
  if (text.length < 10) {
    return parseError(400, "No readable CV text was found. If this PDF contains scanned pages, upload a text-based PDF, Word (.docx), or paste the CV text.", "NO_READABLE_CV_TEXT");
  }

  try {
    // Pass the original extracted text into the shared parser. It repairs PDF
    // replacement glyphs used for date separators and bullets before its own
    // sanitization step; passing `text` here would erase those markers first.
    return json(200, extractCvDataFromText(rawText, fileName));
  } catch (error) {
    console.error("CV parse failed", error);
    return json(500, { error: "Could not structure the CV text. Please try again." });
  }
}
