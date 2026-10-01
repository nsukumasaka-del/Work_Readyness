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

  const paginatedPages = buildExplicitA4Pages(original, clone);

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
      #bonlist-cv-document { display: block; width: 210mm; margin: 0 auto; }
      .a4-page-frame { width: 210mm !important; min-width: 210mm !important; max-width: 210mm !important; min-height: 297mm !important; height: 297mm !important; max-height: 297mm !important; margin: 0 auto !important; box-sizing: border-box !important; overflow: hidden !important; break-inside: avoid !important; page-break-inside: avoid !important; transform: none !important; box-shadow: none !important; border: 0 !important; }
      .a4-page-frame input, .a4-page-frame textarea, .a4-page-frame select { appearance: none !important; resize: none !important; background: transparent !important; border: 0 !important; box-shadow: none !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
      .a4-page-frame textarea { overflow: visible !important; white-space: pre-wrap !important; }
      .a4-page-frame .cv-a4-spacer, .a4-page-frame .a4-spacer, .a4-page-frame [data-a4-spacer], .a4-page-frame [data-preview-spacer='true'] { display: none !important; }
      .a4-page-frame, .a4-page-frame * { break-before: auto !important; page-break-before: auto !important; break-after: auto !important; page-break-after: auto !important; break-inside: auto !important; page-break-inside: auto !important; }
      .a4-page-frame { break-after: page !important; page-break-after: always !important; }
      .a4-page-frame { position: relative; width: 210mm !important; height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important; margin: 0 auto !important; padding: var(--cv-a4-pad-y, 12mm) var(--cv-a4-pad-x, 15mm) !important; box-sizing: border-box !important; overflow: hidden !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; break-after: page !important; page-break-after: always !important; }
      .a4-page-frame:last-child { break-after: auto !important; page-break-after: auto !important; }
      .a4-page-frame .a4-page-columns { display: grid !important; align-items: start !important; align-content: start !important; min-height: 0 !important; max-height: none !important; height: auto !important; break-inside: avoid !important; page-break-inside: avoid !important; }
      .a4-page-frame .a4-page-column { align-self: start !important; justify-self: stretch !important; min-width: 0 !important; min-height: 0 !important; max-height: none !important; height: auto !important; margin-top: 0 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
      .a4-page-frame .experience-item, .a4-page-frame .education-item, .a4-page-frame section, .a4-page-frame [data-a4-id] { min-height: 0 !important; max-height: none !important; height: auto !important; break-inside: avoid !important; page-break-inside: avoid !important; }
      #bonlist-cv-document .cv-skill-chip, #bonlist-cv-document [data-a4-id="languages"] .flex.flex-wrap > span { display: inline-flex !important; align-items: center !important; white-space: nowrap !important; word-break: keep-all !important; flex-shrink: 0 !important; }
      .a4-page-frame input, .a4-page-frame textarea, .a4-page-frame select { appearance: none !important; resize: none !important; background: transparent !important; border: 0 !important; box-shadow: none !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
      .a4-page-frame textarea { overflow: visible !important; white-space: pre-wrap !important; }
      .a4-page-frame:last-child { break-after: auto !important; page-break-after: auto !important; }
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
      if (
        property &&
        value &&
        property !== "height" &&
        property !== "min-height" &&
        property !== "max-height"
      ) {
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
    "display", "box-sizing", "width", "min-width", "max-width",
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
  output.style.setProperty("height", "auto");
  output.style.setProperty("min-height", "0");
  output.style.setProperty("max-height", "none");
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

/** Split the rendered columns at the editor's measured page positions. Each
 * resulting sheet owns a fresh dual-column grid; page breaks only occur between
 * complete sheet wrappers, never between siblings in one shared grid. */
function buildExplicitA4Pages(source: HTMLElement, cleanedClone: HTMLElement): HTMLElement[] {
  const sourceChildren = Array.from(source.children);
  const cloneChildren = Array.from(cleanedClone.children);
  const sourceBody = sourceChildren.find((child) => child.classList.contains("grid") && child.children.length >= 2)
    || sourceChildren.find((child) => child.tagName !== "HEADER" && child.tagName !== "FOOTER" && child.querySelector("[data-a4-id]"));
  const bodyIndex = sourceBody ? sourceChildren.indexOf(sourceBody) : -1;
  const cloneBody = cloneChildren.find((child) => child.classList.contains("grid") && child.children.length >= 2)
    || cloneChildren.find((child) => child.tagName !== "HEADER" && child.tagName !== "FOOTER" && child.querySelector("[data-a4-id]"));
  if (!(sourceBody instanceof HTMLElement) || !(cloneBody instanceof HTMLElement)) {
    cleanedClone.classList.add("a4-page-frame");
    cleanedClone.removeAttribute("id");
    cleanedClone.id = "cv-page-container-1";
    return [cleanedClone];
  }

  const spacerElements = Array.from(source.querySelectorAll<HTMLElement>("[data-a4-spacer]"));
  const spacerStyles = spacerElements.map((spacer) => spacer.getAttribute("style"));
  const measuredPages = new Map<Element, number>();
  const pageOf = (element: Element) => measuredPages.get(element) ?? 0;
  const markerPages = new Map<string, number>();
  let pageCount = 1;
  try {
    spacerElements.forEach((spacer) => {
      spacer.style.setProperty("height", "0px", "important");
      spacer.style.setProperty("min-height", "0px", "important");
      spacer.style.setProperty("margin", "0", "important");
      spacer.style.setProperty("padding", "0", "important");
      spacer.style.setProperty("overflow", "hidden", "important");
    });

    const pageHeight = source.offsetWidth * 297 / 210;
    const sourceRect = source.getBoundingClientRect();
    const sourceTop = sourceRect.top;
    const renderScale = source.offsetWidth > 0 ? sourceRect.width / source.offsetWidth : 1;
    source.querySelectorAll<HTMLElement>("*").forEach((element) => {
      measuredPages.set(element, Math.max(0, Math.floor(
        (element.getBoundingClientRect().top - sourceTop + 1) / Math.max(1, pageHeight * renderScale),
      )));
    });
    source.querySelectorAll<HTMLElement>("[data-a4-id]").forEach((element) => {
      const id = element.getAttribute("data-a4-id");
      if (id) markerPages.set(id, pageOf(element));
    });
    pageCount = Math.max(
      1,
      Math.ceil(Math.max(0, source.scrollHeight - 8) / pageHeight),
      ...Array.from(markerPages.values(), (page) => page + 1),
    );
  } finally {
    spacerElements.forEach((spacer, index) => {
      const previousStyle = spacerStyles[index];
      if (previousStyle == null || previousStyle === "") spacer.removeAttribute("style");
      else spacer.setAttribute("style", previousStyle);
    });
  }
  const cloneHeader = cloneChildren.find((child) => child.tagName === "HEADER");
  const isSplitColumns = sourceBody.classList.contains("grid");
  const sourceColumns = isSplitColumns
    ? Array.from(sourceBody.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    : [sourceBody];
  const cloneColumns = isSplitColumns
    ? Array.from(cloneBody.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
    : [cloneBody];
  if (!sourceColumns.length || !cloneColumns.length) return [cleanedClone];

  const pages: HTMLElement[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = document.createElement("article");
    page.id = `cv-page-container-${pageIndex + 1}`;
    page.className = `a4-page-frame cv-page-sheet ${Array.from(cleanedClone.classList).filter((name) => name !== "cv-page-sheet").join(" ")}`;
    page.style.cssText = cleanedClone.style.cssText;
    page.style.width = "210mm";
    page.style.height = "297mm";
    page.style.minHeight = "297mm";
    page.style.maxHeight = "297mm";
    page.style.boxSizing = "border-box";
    page.style.overflow = "hidden";
    page.dataset.page = String(pageIndex + 1);

    if (pageIndex === 0 && cloneHeader) page.append(cloneHeader.cloneNode(true));

    const grid = document.createElement("div");
    grid.className = `${cloneBody.className} a4-page-columns`;
    grid.style.cssText = cloneBody.style.cssText;
    const gridStyle = getComputedStyle(sourceBody);
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = isSplitColumns ? gridStyle.gridTemplateColumns : "minmax(0, 1fr)";
    grid.style.columnGap = isSplitColumns ? gridStyle.columnGap : "0";
    grid.style.rowGap = isSplitColumns ? gridStyle.rowGap : "0";
    grid.style.alignItems = "start";
    grid.style.alignContent = "start";
    grid.style.gridAutoFlow = "row";
    grid.style.height = "auto";
    grid.style.minHeight = "0";
    grid.style.maxHeight = "none";

    for (let columnIndex = 0; columnIndex < sourceColumns.length; columnIndex += 1) {
      const sourceColumn = sourceColumns[columnIndex]!;
      const cloneColumn = cloneColumns[columnIndex]!;
      const column = document.createElement("div");
      column.className = `${cloneColumn.className} a4-page-column`;
      column.style.cssText = cloneColumn.style.cssText;
      column.style.gridColumn = String(columnIndex + 1);
      column.style.gridRow = "1";
      column.style.alignSelf = "start";
      column.style.justifySelf = "stretch";
      column.style.minWidth = "0";
      column.style.marginTop = "0";
      column.style.height = "auto";
      column.style.minHeight = "0";
      column.style.maxHeight = "none";

      const sourceItems = Array.from(sourceColumn.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const cloneItems = Array.from(cloneColumn.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      sourceItems.forEach((item, itemIndex) => {
        if (item.matches(".cv-a4-spacer, .a4-spacer, [data-a4-spacer], [data-preview-spacer='true']")) return;
        const itemClone = cloneItems[itemIndex]?.cloneNode(true) as HTMLElement | undefined;
        if (!itemClone) return;
        const markers = Array.from(item.querySelectorAll<HTMLElement>("[data-a4-id]"));
        const itemPages = markers.length
          ? Array.from(new Set(markers.map((marker) => markerPages.get(marker.dataset.a4Id || "") ?? pageOf(marker))))
          : [pageOf(item)];
        if (!itemPages.includes(pageIndex)) return;
        pruneToPage(item, itemClone, pageIndex, markerPages);
        resetContentFlowHeights(itemClone);
        column.append(itemClone);
      });
      grid.append(column);
    }
    page.append(grid);

    // Custom sections render full-width after the columns in the editor. Keep
    // each section on the page where its measured top edge appears.
    sourceChildren.forEach((child, childIndex) => {
      if (childIndex <= bodyIndex || child.tagName === "FOOTER" || child.tagName === "HEADER") return;
      if (pageOf(child) !== pageIndex) return;
      const customClone = cloneChildren[childIndex]?.cloneNode(true);
      if (customClone instanceof HTMLElement) {
        resetContentFlowHeights(customClone);
        page.append(customClone);
      }
    });
    if (pageIndex === pageCount - 1) {
      const footerIndex = sourceChildren.findIndex((child) => child.tagName === "FOOTER");
      const footerClone = footerIndex >= 0 ? cloneChildren[footerIndex]?.cloneNode(true) : undefined;
      if (footerClone instanceof HTMLElement) page.append(footerClone);
    }
    page.querySelectorAll(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-guide, .cv-page-guide-label, .cv-page-badge")
      .forEach((element) => element.remove());
    pages.push(page);
  }
  return pages;
}

function pruneToPage(
  source: HTMLElement,
  clone: HTMLElement,
  pageIndex: number,
  markerPages: Map<string, number>,
): void {
  const sourceMarkers = Array.from(source.querySelectorAll<HTMLElement>("[data-a4-id]"));
  const cloneMarkers = Array.from(clone.querySelectorAll<HTMLElement>("[data-a4-id]"));
  sourceMarkers.forEach((marker, index) => {
    const markerClone = cloneMarkers[index];
    if (!markerClone) return;
    const id = marker.dataset.a4Id || "";
    if ((markerPages.get(id) ?? pageIndex) === pageIndex) return;
    const hasContentForThisPage = Array.from(marker.querySelectorAll<HTMLElement>("[data-a4-id]"))
      .some((child) => (markerPages.get(child.dataset.a4Id || "") ?? pageIndex) === pageIndex);
    if (hasContentForThisPage) markerClone.removeAttribute("data-a4-id");
    else markerClone.remove();
  });
  clone.querySelectorAll(".cv-a4-spacer, .a4-spacer, [data-a4-spacer], [data-preview-spacer='true']")
    .forEach((spacer) => spacer.remove());
}

/** Content wrappers shrink after their markers are split between A4 pages.
 * The page frame itself keeps its physical 297 mm height. */
function resetContentFlowHeights(root: HTMLElement): void {
  const reset = (element: HTMLElement) => {
    element.style.height = "auto";
    element.style.minHeight = "0";
    element.style.maxHeight = "none";
  };
  reset(root);
  root.querySelectorAll<HTMLElement>("section, .cv-a4-keep, .experience-item, .education-item, [data-a4-id]")
    .forEach(reset);
}
