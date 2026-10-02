/** Decode one JSON object without accepting arrays, primitives, or trailing prose. */
export function parseGeminiJsonObject<T>(text: string): T {
  const cleaned = text.trim().replace(/^\uFEFF/, '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini returned an invalid JSON object.');
  }
  return parsed as T;
}
