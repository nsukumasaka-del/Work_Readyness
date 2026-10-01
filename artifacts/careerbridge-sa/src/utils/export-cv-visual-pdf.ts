import { authFetch } from "@/lib/auth-session";

export type CvPdfExportStage = "preparing" | "rendering" | "downloading";

/** Generate a selectable-text PDF from Chromium's print layout on the Worker. */
export async function exportCvVisualPdf(
  previewElementId: string,
  filename: string,
  onStageChange?: (stage: CvPdfExportStage) => void,
): Promise<void> {
  onStageChange?.("preparing");
  const original = document.getElementById(previewElementId);
  if (!(original instanceof HTMLElement)) {
    throw new Error(`CV preview element #${previewElementId} was not found.`);
  }

  await document.fonts?.ready;
  const clone = original.cloneNode(true) as HTMLElement;
  await inlineComputedStyles(original, clone);
  clone.removeAttribute("inert");
  clone.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
  });

  // Replace live controls with styled text before pagination. That keeps the
  // exported DOM selectable and prevents browser form chrome from changing the
  // dimensions of narrow CV columns.
  const sourceFields = original.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const cloneFields = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  sourceFields.forEach((source, index) => {
    const target = cloneFields[index];
    if (!target) return;
    const text = source instanceof HTMLSelectElement
      ? source.selectedOptions[0]?.textContent || ""
      : source.value;
    const staticText = createStaticTextControl(source, text);
    target.replaceWith(staticText);
  });

  // The editor is one continuous A4-width document with measured spacers.
  // Keep that exact layout intact and expose one A4-height slice per page.
  // Rebuilding its grid or pruning sections loses content at page boundaries.
  const paginatedPages = captureA4PageFrames(original, clone);

  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link[rel='stylesheet']"))
    .map((element) => {
      if (!(element instanceof HTMLLinkElement)) return element.outerHTML;
      const link = element.cloneNode(false) as HTMLLinkElement;
      const href = element.getAttribute("href");
      if (href) link.href = new URL(href, document.baseURI).href;
      return link.outerHTML;
    })
    .join("\n");
  const baseHref = escapeHtmlAttribute(document.baseURI);
  const safeName = filename.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "BonList-CV";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${baseHref}">${styles}
    <style>
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #0f172a; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { width: 210mm; }
      #bonlist-cv-document {
        display: block !important; position: static !important;
        width: 210mm !important; max-width: 210mm !important;
        margin: 0 !important; padding: 0 !important;
        border: 0 !important; box-shadow: none !important; overflow: visible !important;
      }
      #bonlist-cv-document .a4-page-frame {
        display: block !important; position: relative !important;
        width: 210mm !important; min-width: 210mm !important; max-width: 210mm !important;
        height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important;
        box-sizing: border-box !important; border: 0 !important; box-shadow: none !important;
        break-inside: avoid !important; page-break-inside: avoid !important;
        break-after: page !important; page-break-after: always !important;
      }
      #bonlist-cv-document .a4-page-frame:last-child { break-after: auto !important; page-break-after: auto !important; }
      #bonlist-cv-document .a4-page-frame .a4-capture-source {
        position: absolute !important; top: var(--a4-capture-top) !important; left: 0 !important;
        width: 210mm !important; max-width: 210mm !important;
        margin: 0 !important; transform: none !important;
        border: 0 !important; border-radius: 0 !important; box-shadow: none !important;
        background-color: var(--a4-capture-background-color) !important;
        background-image: var(--a4-capture-background-image) !important;
        overflow: visible !important;
      }
      #bonlist-cv-document .no-print, #bonlist-cv-document [data-preview-only='true'],
      #bonlist-cv-document .cv-page-guides, #bonlist-cv-document .cv-page-badge { display: none !important; }
    </style></head><body><main id="bonlist-cv-document" class="cv-export-document">${paginatedPages.map((page) => page.outerHTML).join("")}</main></body></html>`;

  onStageChange?.("rendering");
  const response = await authFetch("/api/career/cv/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename: `${safeName}.pdf` }),
  });
  if (!response.ok) {
    throw new Error(await readExportError(response));
  }
  onStageChange?.("downloading");
  const pdf = await response.blob();
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}.pdf`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Inline computed declarations so the Worker renderer retains the exact
 * responsive layout and Tailwind appearance even if it cannot fetch app CSS. */
async function inlineComputedStyles(sourceRoot: HTMLElement, cloneRoot: HTMLElement): Promise<void> {
  const sourceElements = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll<HTMLElement>("*"))];
  const cloneElements = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>("*"))];
  for (let index = 0; index < sourceElements.length; index += 1) {
    const source = sourceElements[index];
    const target = cloneElements[index];
    if (!source || !target) continue;
    const computed = window.getComputedStyle(source);
    for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
      const property = computed.item(propertyIndex);
      const value = computed.getPropertyValue(property);
      if (property && value) {
        target.style.setProperty(property, value.includes("url(") ? absolutizeCssUrls(value) : value);
      }
    }
    if ((index + 1) % 32 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
}

function absolutizeCssUrls(value: string): string {
  return value.replace(/url\((['"]?)(?!data:|https?:|\/\/|#)([^)'\"]+)\1\)/gi, (_match, quote: string, path: string) => {
    try {
      return `url(${quote}${new URL(path, document.baseURI).href}${quote})`;
    } catch {
      return `url(${quote}${path}${quote})`;
    }
  });
}

function createStaticTextControl(source: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, text: string): HTMLElement {
  const computed = window.getComputedStyle(source);
  const output = document.createElement(source instanceof HTMLTextAreaElement ? "div" : "span");
  output.className = source.className;
  output.textContent = text;
  output.setAttribute("data-export-text-control", "true");

  const copiedProperties = [
    "display", "box-sizing", "width", "min-width", "max-width", "height", "min-height", "max-height",
    "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "font-family", "font-size", "font-style", "font-weight", "font-variant", "line-height", "letter-spacing",
    "color", "text-align", "text-transform", "text-indent", "vertical-align", "white-space", "overflow-wrap", "word-break",
    "flex", "flex-basis", "flex-grow", "flex-shrink", "align-self",
  ];
  copiedProperties.forEach((property) => {
    const value = computed.getPropertyValue(property);
    if (value) output.style.setProperty(property, value);
  });
  output.style.setProperty("white-space", source instanceof HTMLTextAreaElement ? "pre-wrap" : computed.whiteSpace || "pre-wrap");
  output.style.setProperty("word-break", "break-word");
  output.style.setProperty("overflow-wrap", "anywhere");
  output.style.setProperty("border", "0");
  output.style.setProperty("outline", "0");
  output.style.setProperty("background", "transparent");
  output.style.setProperty("box-shadow", "none");
  if (source instanceof HTMLTextAreaElement) {
    output.style.setProperty("display", "block");
  }
  return output;
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function readExportError(response: Response): Promise<string> {
  const responseText = await response.text().catch(() => "");
  if (responseText) {
    try {
      const payload: unknown = JSON.parse(responseText);
      if (payload && typeof payload === "object") {
        const error = (payload as Record<string, unknown>).error;
        if (typeof error === "string" && error.trim()) return error.trim();
        const message = (payload as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim()) return message.trim();
      }
    } catch {
      return responseText;
    }
  }
  return `PDF export failed (${response.status}).`;
}

/** Keep the editor's single continuous grid and its measured A4 spacers.
 * Each fixed page clips a full copy at the corresponding 297 mm interval, so
 * neither column is rebuilt and no trailing sections can be pruned away. */
function captureA4PageFrames(source: HTMLElement, cleanedClone: HTMLElement): HTMLElement[] {
  const pageHeightPx = source.offsetWidth * 297 / 210;
  const pageCount = Math.max(1, Math.ceil((source.scrollHeight - 1) / pageHeightPx));
  const pages: HTMLElement[] = [];
  const sourceStyle = getComputedStyle(source);

  cleanedClone.removeAttribute("id");
  cleanedClone.querySelectorAll(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-badge")
    .forEach((element) => element.remove());

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.createElement("section");
    page.id = `cv-page-container-${pageIndex + 1}`;
    page.className = "a4-page-frame";
    page.dataset.pageIndex = String(pageIndex);

    const pageContent = cleanedClone.cloneNode(true) as HTMLElement;
    pageContent.classList.add("a4-capture-source");
    pageContent.style.setProperty("--a4-capture-top", `-${pageIndex * 297}mm`);
    pageContent.style.setProperty("--a4-capture-background-color", sourceStyle.backgroundColor);
    pageContent.style.setProperty("--a4-capture-background-image", absolutizeCssUrls(sourceStyle.backgroundImage));
    page.append(pageContent);
    pages.push(page);
  }

  return pages;
}
