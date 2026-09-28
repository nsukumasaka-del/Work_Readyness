import { extractText, extractTextItems } from "unpdf";
import { reconstructPdfTextFromItems, type PositionedPdfTextItem } from "./pdf-layout-text";

/** Independent PDF reader for Cloudflare when browser PDF.js cannot extract text. */
export async function extractEdgePdfText(data: Uint8Array): Promise<string> {
  const result = await Promise.race([
    Promise.all([extractText(data, { mergePages: true }), extractTextItems(data)]),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF reading timed out")), 20_000),
    ),
  ]);
  const [plain, positioned] = result;
  const plainText = plain.text;
  const layoutText = reconstructPdfTextFromItems(positioned.items as PositionedPdfTextItem[][]);
  const structureScore = (text: string) =>
    ((text.match(/\b(?:professional summary|work experience|employment history|education|skills|competencies|certifications|languages|references)\b/gi) || []).length * 4) +
    Math.min(2, (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+\d{1,3}|0)\s?\d[\d ()-]{7,}/gi) || []).length) * 2 +
    Math.min(text.length / 500, 5);
  return layoutText && structureScore(layoutText) > structureScore(plainText) ? layoutText : plainText;
}
