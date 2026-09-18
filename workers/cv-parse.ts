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
  if (!rawText && typeof body.fileData === "string" && fileName?.toLowerCase().endsWith(".pdf")) {
    try {
      const encoded = body.fileData.split(",", 2)[1];
      if (!encoded || encoded.length > 13_400_000) {
        return json(413, { error: "The PDF is too large. Please upload a file under 10MB." });
      }
      const binary = atob(encoded);
      if (binary.length > 10_000_000) {
        return json(413, { error: "The PDF is too large. Please upload a file under 10MB." });
      }
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      rawText = await extractEdgePdfText(bytes);
    } catch (error) {
      console.warn("Edge PDF extraction failed", error);
      return json(422, {
        error: "This PDF could not be read. Try re-exporting it as a text-based PDF, or upload a Word (.docx) or .txt copy.",
      });
    }
  }
  if (!rawText) {
    return json(422, { error: "No CV text was received. Please try the upload again or paste your CV text." });
  }
  if (rawText.length > 1_000_000) {
    return json(413, { error: "The CV text is too large. Please upload a smaller file." });
  }

  const text = sanitizeExtractedCvText(rawText);
  if (text.length < 10) {
    return json(422, {
      error: "No readable CV text was found. If this PDF contains scanned pages, upload a text-based PDF, Word (.docx), or paste the CV text.",
    });
  }

  try {
    return json(200, extractCvDataFromText(text, fileName));
  } catch (error) {
    console.error("CV parse failed", error);
    return json(500, { error: "Could not structure the CV text. Please try again." });
  }
}
