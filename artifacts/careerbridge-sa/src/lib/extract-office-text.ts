/** Browser-side DOCX / TXT extraction for CV intake (no Node/SMTP). */

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function xmlToPlainText(xml: string): string {
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

export function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
}

export function isPlainTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".txt") || name.endsWith(".text") || file.type === "text/plain";
}

export async function extractPlainTextFromFile(file: File): Promise<string> {
  return (await file.text()).replace(/\u0000/g, "").trim();
}

/**
 * Read word/document.xml from a .docx zip without extra dependencies.
 */
export async function extractDocxTextFromFile(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("This Word file is missing document.xml and cannot be read.");
  }
  const xml = await docFile.async("string");
  const text = xmlToPlainText(xml);
  if (!text || text.length < 10) {
    throw new Error("No readable text was found in this Word document.");
  }
  return text;
}
