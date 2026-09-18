import { extractText } from "unpdf";

/** Independent PDF reader for Cloudflare when browser PDF.js cannot extract text. */
export async function extractEdgePdfText(data: Uint8Array): Promise<string> {
  const result = await Promise.race([
    extractText(data, { mergePages: true }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("PDF reading timed out")), 20_000),
    ),
  ]);
  return result.text;
}
