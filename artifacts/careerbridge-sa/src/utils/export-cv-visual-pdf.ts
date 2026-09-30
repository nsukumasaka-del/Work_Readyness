import { authFetch } from "@/lib/auth-session";

/** Generate a selectable-text PDF from Chromium's print layout on the Worker. */
export async function exportCvVisualPdf(previewElementId: string, filename: string): Promise<void> {
  const original = document.getElementById(previewElementId);
  if (!(original instanceof HTMLElement)) {
    throw new Error(`CV preview element #${previewElementId} was not found.`);
  }

  await document.fonts?.ready;
  const clone = original.cloneNode(true) as HTMLElement;
  clone.removeAttribute("inert");
  clone.querySelectorAll(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-guide, .cv-page-guide-label, .cv-page-badge")
    .forEach((element) => element.remove());
  clone.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  });

  // React-controlled form values are not reliably represented in outerHTML.
  const sourceFields = original.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const cloneFields = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  sourceFields.forEach((source, index) => {
    const target = cloneFields[index];
    if (!target) return;
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.setAttribute("value", source.value);
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.textContent = source.value;
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      Array.from(target.options).forEach((option, optionIndex) => option.toggleAttribute("selected", optionIndex === source.selectedIndex));
    }
  });

  // Keep the measured spacer heights: they encode the editor's column-aware
  // page placement. Chromium applies A4 pagination to the live grid as vector
  // text, without html2canvas slicing the grid into image bands.
  clone.querySelectorAll<HTMLElement>(".cv-a4-spacer, .a4-spacer, [data-a4-spacer], [data-preview-spacer='true']")
    .forEach((spacer) => spacer.setAttribute("aria-hidden", "true"));

  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link[rel='stylesheet']"))
    .map((element) => element.outerHTML)
    .join("\n");
  const safeName = filename.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "BonList-CV";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}
    <style>
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #0f172a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { width: 210mm; }
      #${previewElementId.replace(/[^a-zA-Z0-9_-]/g, "")} { width: 210mm !important; min-width: 210mm !important; max-width: 210mm !important; min-height: 297mm !important; height: auto !important; margin: 0 !important; box-sizing: border-box !important; overflow: visible !important; transform: none !important; box-shadow: none !important; border: 0 !important; }
      #${previewElementId.replace(/[^a-zA-Z0-9_-]/g, "")} input, #${previewElementId.replace(/[^a-zA-Z0-9_-]/g, "")} textarea, #${previewElementId.replace(/[^a-zA-Z0-9_-]/g, "")} select { appearance: none !important; resize: none !important; background: transparent !important; border: 0 !important; box-shadow: none !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
      #${previewElementId.replace(/[^a-zA-Z0-9_-]/g, "")} textarea { overflow: visible !important; white-space: pre-wrap !important; }
      .cv-a4-spacer, .a4-spacer, [data-a4-spacer], [data-preview-spacer='true'] { break-inside: auto !important; page-break-inside: auto !important; }
      .cv-a4-keep, .experience-item, .education-item, li, header { break-inside: avoid; page-break-inside: avoid; }
      .cv-section-heading, h2 { break-after: avoid; page-break-after: avoid; }
    </style></head><body>${clone.outerHTML}</body></html>`;

  const response = await authFetch("/api/career/cv/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename: `${safeName}.pdf` }),
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `PDF export failed (${response.status}).`);
  }
  const pdf = await response.blob();
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
