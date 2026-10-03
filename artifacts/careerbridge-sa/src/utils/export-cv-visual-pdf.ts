import { authFetch } from "@/lib/auth-session";

export type CvPdfExportStage = "preparing" | "rendering" | "downloading";

/** Generate a selectable-text PDF from Chromium's print layout on the Worker. */
export async function exportCvVisualPdf(
  previewElementId: string,
  filename: string,
  templateId: string,
  onStageChange?: (stage: CvPdfExportStage) => void,
): Promise<void> {
  onStageChange?.("preparing");
  const html = await createCvPdfSnapshot(previewElementId);
  const safeName = filename.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-") || "BonList-CV";
  onStageChange?.("rendering");
  const response = await authFetch("/api/career/cv/export-pdf", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html, filename: `${safeName}.pdf`, templateId }),
  });
  if (!response.ok) throw new Error(await readExportError(response));
  onStageChange?.("downloading");
  const pdf = await response.blob();
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a"); link.href = url; link.download = `${safeName}.pdf`; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Self-contained, screen-layout snapshot: application print rules never enter it. */
export async function createCvPdfSnapshot(previewElementId: string): Promise<string> {
  const original = document.getElementById(previewElementId);
  if (!(original instanceof HTMLElement)) {
    throw new Error(`CV preview element #${previewElementId} was not found.`);
  }

  await document.fonts?.ready;
  if (original.offsetWidth === 0) throw new Error("The CV preview must be visible before downloading.");
  const fontStyles = await captureFontStyles(original);
  const clone = original.cloneNode(true) as HTMLElement;
  await inlineComputedStyles(original, clone);
  expandScrollableContent(original, clone);
  clone.removeAttribute("inert");
  clone.classList.remove("cv-inline-edit-mode");
  clone.querySelectorAll("script, iframe, object, embed").forEach((element) => element.remove());
  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("tabindex");
    element.removeAttribute("draggable");
    element.style.setProperty("outline", "none");
    element.style.setProperty("box-shadow", "none");
    element.style.setProperty("transition", "none");
    element.style.setProperty("animation", "none");
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
  clone.querySelectorAll(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-badge").forEach(element => element.remove());

  // The editor is one continuous A4-width document with measured spacers.
  // Keep that exact layout intact and expose one A4-height slice per page.
  // Rebuilding its grid or pruning sections loses content at page boundaries.
  const pageCount = measureExpandedSnapshot(original, clone);
  const paginatedPages = captureA4PageFrames(original, clone, pageCount);

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fontStyles}
    <style>
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; color: #0f172a; color-scheme: only light; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
        position: absolute !important; top: 0 !important; left: 0 !important;
        width: var(--a4-capture-width) !important; max-width: var(--a4-capture-width) !important;
        margin: 0 !important; transform: translateY(var(--a4-capture-top)) !important;
        border-color: transparent !important; border-radius: 0 !important; box-shadow: none !important;
        background-color: var(--a4-capture-background-color) !important;
        background-image: var(--a4-capture-background-image) !important;
        height: auto !important; max-height: none !important;
        overflow: visible !important;
      }
      #bonlist-cv-document .no-print, #bonlist-cv-document [data-preview-only='true'],
      #bonlist-cv-document .cv-page-guides, #bonlist-cv-document .cv-page-badge { display: none !important; }
      #bonlist-cv-document h1, #bonlist-cv-document h2, #bonlist-cv-document h3,
      #bonlist-cv-document h4, #bonlist-cv-document .section-title {
        word-break: normal !important; overflow-wrap: normal !important; hyphens: manual !important;
      }
      #bonlist-cv-document * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    </style></head><body><main id="bonlist-cv-document" class="cv-export-document">${paginatedPages.map((page) => page.outerHTML).join("")}</main></body></html>`;

  return html;
}

/** Inline computed declarations so the Worker renderer retains the exact
 * responsive layout and Tailwind appearance even if it cannot fetch app CSS. */
async function inlineComputedStyles(sourceRoot: HTMLElement, cloneRoot: HTMLElement): Promise<void> {
  const resolveColor = createColorResolver();
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
      // Physical dimensions are the snapshot contract. Logical aliases can
      // override later height/top rules and freeze entire flowing columns.
      if (/^(?:(?:min|max)-)?(?:inline-size|block-size)$/.test(property) || /^inset-(?:block|inline)/.test(property)) continue;
      if (["animation", "transition", "outline", "box-shadow"].some(prefix => property.startsWith(prefix))) continue;
      // Used block heights/grid rows are not authored constraints: allow text to grow.
      if (property === "height" && source !== sourceRoot && ["DIV", "SECTION", "HEADER", "ARTICLE", "P", "LI", "UL", "SPAN", "H1", "H2", "H3", "H4", "H5", "H6"].includes(source.tagName) && !source.style.height && !/(^|\s)(?:\S+:)?h-/.test(source.className)) continue;
      if (property === "grid-template-rows" && !source.style.gridTemplateRows) continue;
      if (property && value) {
        target.style.setProperty(property, value.includes("url(") ? absolutizeCssUrls(value) : value);
      }
    }
    lockPaintStyles(computed, target, resolveColor);
    if (source instanceof HTMLImageElement && target instanceof HTMLImageElement) {
      target.src = source.currentSrc || source.src;
      target.removeAttribute("srcset");
      target.removeAttribute("sizes");
      target.loading = "eager";
    }
    if ((index + 1) % 32 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
}

/** Convert modern CSS colours to sRGB in the source browser, not in a canvas
 * screenshot. Chromium still prints selectable vector text and backgrounds. */
function createColorResolver(): (value: string) => string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const cache = new Map<string, string>();
  return value => {
    if (!context || !value || !CSS.supports("color", value)) return value;
    const saved = cache.get(value);
    if (saved) return saved;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    const result = alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
    cache.set(value, result);
    return result;
  };
}

function lockPaintStyles(computed: CSSStyleDeclaration, target: HTMLElement, resolve = createColorResolver()) {
  for (const property of ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color", "text-decoration-color", "-webkit-text-fill-color", "fill", "stroke"]) {
    const value = computed.getPropertyValue(property);
    if (value) target.style.setProperty(property, resolve(value === "currentcolor" ? computed.color : value), "important");
  }
  target.style.setProperty("-webkit-print-color-adjust", "exact", "important");
  target.style.setProperty("print-color-adjust", "exact", "important");
  target.style.setProperty("forced-color-adjust", "none", "important");
  target.style.setProperty("color-scheme", "only light");
}

/** Open only document scrollers, not deliberately clipped managed-page slices
 * or hidden sections. Never alter the user's live DOM or preview zoom. */
function expandScrollableContent(sourceRoot: HTMLElement, cloneRoot: HTMLElement) {
  const sources = [sourceRoot, ...sourceRoot.querySelectorAll<HTMLElement>("*")];
  const targets = [cloneRoot, ...cloneRoot.querySelectorAll<HTMLElement>("*")];
  sources.forEach((source, index) => {
    const target = targets[index];
    if (!target || source.closest("[data-managed-page], [data-managed-duplicate-page]")) return;
    const style = getComputedStyle(source);
    if (style.display === "none" || /^(INPUT|TEXTAREA|SELECT|IMG|SVG)$/.test(source.tagName)) return;
    if (source !== sourceRoot && !(source.scrollHeight > source.clientHeight + 1 && /hidden|auto|scroll|clip/.test(style.overflowY))) return;
    target.style.setProperty("height", "auto", "important");
    target.style.setProperty("max-height", "none", "important");
    target.style.setProperty("overflow", "visible", "important");
  });
}

function measureExpandedSnapshot(source: HTMLElement, clone: HTMLElement): number {
  const savedId = clone.getAttribute("id");
  const savedStyle = clone.getAttribute("style");
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style";
  clone.id = "bonlist-cv-export-measure";
  clone.style.setProperty("width", getComputedStyle(source).width, "important");
  clone.style.setProperty("max-width", getComputedStyle(source).width, "important");
  clone.style.setProperty("position", "relative", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("margin", "0", "important");
  host.append(clone);
  document.body.append(host);
  try { return measureCvPages(clone).pageCount; }
  finally {
    clone.remove(); host.remove();
    if (savedId === null) clone.removeAttribute("id"); else clone.id = savedId;
    if (savedStyle === null) clone.removeAttribute("style"); else clone.setAttribute("style", savedStyle);
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
    "position", "top", "right", "bottom", "left", "transform", "transform-origin", "z-index",
    "text-decoration", "text-decoration-color", "text-decoration-thickness", "text-shadow", "background-color",
  ];
  copiedProperties.forEach((property) => {
    const value = computed.getPropertyValue(property);
    if (value) output.style.setProperty(property, value);
  });
  output.style.setProperty("white-space", source instanceof HTMLTextAreaElement ? "pre-wrap" : computed.whiteSpace || "pre-wrap");
  output.style.setProperty("word-break", "normal");
  output.style.setProperty("overflow-wrap", "break-word");
  output.style.setProperty("height", "auto");
  output.style.setProperty("min-height", computed.height);
  output.style.setProperty("max-height", "none");
  output.style.setProperty("overflow", "visible");
  output.style.setProperty("display", computed.display === "none" ? "none" : "inline-block");
  output.style.setProperty("border", computed.border);
  output.style.setProperty("border-color", "transparent");
  output.style.setProperty("outline", "0");
  output.style.setProperty("box-shadow", "none");
  if (source instanceof HTMLTextAreaElement && computed.display !== "none") {
    output.style.setProperty("display", "block");
  }
  lockPaintStyles(computed, output);
  return output;
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
function captureA4PageFrames(source: HTMLElement, cleanedClone: HTMLElement, pageCount: number): HTMLElement[] {
  // offsetWidth rounds to whole pixels; that drift cuts text on later pages.
  const sourceStyle = getComputedStyle(source);
  // Trailing paper padding is not another page of CV content. Explicit
  // managed blank pages remain part of scrollHeight and are still preserved.
  const pages: HTMLElement[] = [];

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
    pageContent.style.setProperty("--a4-capture-width", sourceStyle.width);
    pageContent.style.setProperty("--a4-capture-top", `-${pageIndex * 297}mm`);
    pageContent.style.setProperty("--a4-capture-background-color", sourceStyle.backgroundColor);
    pageContent.style.setProperty("--a4-capture-background-image", absolutizeCssUrls(sourceStyle.backgroundImage));
    page.append(pageContent);
    pages.push(page);
  }

  return pages;
}

/** Shared by the preview badge and export: no whole-pixel width rounding. */
export function measureCvPages(source: HTMLElement) {
  const style = getComputedStyle(source);
  const pageHeightPx = 297 * 96 / 25.4;
  const height = Math.max(source.scrollHeight, source.offsetHeight);
  const managedHeight = source.querySelector<HTMLElement>("[data-managed-pages-container]")?.offsetHeight || 0;
  const naturalHeight = Math.max(pageHeightPx, height - managedHeight - parseFloat(style.paddingBottom || "0"));
  const naturalPages = Math.max(1, Math.ceil((naturalHeight - 1) / pageHeightPx));
  const managedCount = source.querySelectorAll("[data-managed-page]").length;
  return { pageHeightPx, naturalHeight, naturalPages, pageCount: naturalPages + managedCount, height };
}

/** Measure in DOM order with temporary spacers so nested blocks and both
 * columns include earlier shifts. Restore the live canvas before returning. */
export function computeCvPageSpacers(root: HTMLElement): Record<string, number> {
  const pageH = measureCvPages(root).pageHeightPx;
  const styles = getComputedStyle(root);
  const padY = parseFloat(styles.paddingTop) || 0;
  const padBottom = parseFloat(styles.paddingBottom) || padY;
  const usable = Math.max(40, pageH - padY - padBottom);
  const edgeSafety = Math.max(padBottom + 16, pageH * 0.06, 52);
  const existing = Array.from(root.querySelectorAll<HTMLElement>("[data-a4-spacer]"));
  const saved = existing.map(el => el.getAttribute("style"));
  const temporary: HTMLElement[] = [];
  const result: Record<string, number> = {};
  try {
    existing.forEach(el => { el.style.height = "0px"; el.style.minHeight = "0px"; });
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-a4-id]"))) {
      if (el.closest(".no-print, [data-preview-only='true'], [data-managed-pages-container]") || el.offsetParent === null) continue;
      const id = el.dataset.a4Id;
      if (!id) continue;
      const rootRect = root.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      const scale = rootRect.width / parseFloat(styles.width) || 1;
      const top = (rect.top - rootRect.top) / scale;
      const height = rect.height / scale;
      if (height <= 1 || height > usable - 4) continue;
      const hardEnd = (Math.floor(top / pageH) + 1) * pageH;
      if (top + height <= hardEnd - edgeSafety) continue;
      const push = Math.ceil(hardEnd + padY - top);
      if (push <= 0 || push >= pageH) continue;
      result[id] = push;
      let spacer = existing.find(item => item.dataset.a4Spacer === id);
      if (!spacer) {
        spacer = document.createElement("div");
        spacer.style.cssText = "width:100%;flex-shrink:0;margin:0;padding:0;overflow:hidden";
        el.before(spacer); temporary.push(spacer);
      }
      spacer.style.height = push + "px"; spacer.style.minHeight = push + "px";
    }
  } finally {
    temporary.forEach(el => el.remove());
    existing.forEach((el, index) => { if (saved[index] == null) el.removeAttribute("style"); else el.setAttribute("style", saved[index]!); });
  }
  return result;
}

/** Embed only font-face declarations, not responsive/print application CSS. */
async function captureFontStyles(root: HTMLElement): Promise<string> {
  const families = new Set([root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
    .flatMap(el => getComputedStyle(el).fontFamily.split(",").map(f => f.trim().replace(/['"]/g, "").toLowerCase())));
  const seen = new Set<string>();
  const faces: string[] = [];
  async function readSheet(css: string, base: string, depth = 0): Promise<void> {
    if (depth > 3) return;
    for (const match of css.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)?[^;]*;/gi)) {
      const href = new URL(match[1] || match[2] || match[3], base).href;
      if (seen.has(href)) continue;
      seen.add(href);
      const response = await fetch(href, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("CV fonts could not be loaded. Reconnect and try again.");
      await readSheet(await response.text(), href, depth + 1);
    }
    for (const match of css.matchAll(/@font-face\s*\{[^}]*\}/gi)) {
      const family = /font-family\s*:\s*([^;]+)/i.exec(match[0])?.[1].trim().replace(/['"]/g, "").toLowerCase();
      if (family && families.has(family)) faces.push(absolutizeFontUrls(match[0], base));
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try { await readSheet(Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n"), sheet.href || document.baseURI); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === "SecurityError")) throw error;
      if (!sheet.href) continue;
      const response = await fetch(sheet.href, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("CV font styles could not be loaded.");
      await readSheet(await response.text(), sheet.href);
    }
  }
  const files = new Map<string, string>();
  let bytes = 0;
  let css = [...new Set(faces)].join("\n");
  for (const match of css.matchAll(/url\(["']?(https?:[^"')]+)["']?\)/gi)) {
    const href = match[1];
    if (files.has(href)) continue;
    if (files.size >= 96) throw new Error("Too many font files in the CV.");
    const response = await fetch(href, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error("A CV font could not be loaded.");
    const blob = await response.blob(); bytes += blob.size;
    if (bytes > 8_000_000) throw new Error("CV font files are too large.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob);
    });
    files.set(href, data);
  }
  files.forEach((data, href) => { css = css.split(href).join(data); });
  return "<style>" + css.replace(/<\/style/gi, "") + "</style>";
}
function absolutizeFontUrls(css: string, base: string) {
  return css.replace(/url\((["']?)([^)"']+)\1\)/gi, (_match, _quote, path) => 'url("' + new URL(path, base).href + '")');
}
