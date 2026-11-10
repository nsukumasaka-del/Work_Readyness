import { authFetch } from "@/lib/auth-session";

export type CvPdfExportStage = "preparing" | "rendering" | "downloading";

function copyComputedStyles(source: HTMLElement, clone: HTMLElement): void {
  const styles = getComputedStyle(source);
  for (let index = 0; index < styles.length; index += 1) {
    const property = styles.item(index);
    clone.style.setProperty(property, styles.getPropertyValue(property), styles.getPropertyPriority(property));
  }
}

function createPdfPreviewClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  const omittedAttributes = new Set(["class", "style", "placeholder", "contenteditable", "value", "type", "name", "checked", "disabled", "readonly"]);

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    copyComputedStyles(sourceNode, cloneNode);
    if (sourceNode instanceof HTMLInputElement || sourceNode instanceof HTMLTextAreaElement) {
      const replacement = document.createElement("div");
      for (const attribute of Array.from(cloneNode.attributes)) {
        if (!omittedAttributes.has(attribute.name)) {
          replacement.setAttribute(attribute.name, attribute.value);
        }
      }
      replacement.className = cloneNode.className;
      replacement.style.cssText = cloneNode.style.cssText;
      replacement.textContent = sourceNode.value;
      cloneNode.replaceWith(replacement);
    }
  });

  clone.id = "bonlist-cv-document-export";
  clone.querySelectorAll(".no-print, .canvas-control, .cv-page-guides, .cv-page-badge, [data-preview-only='true'], [data-a4-spacer], button").forEach((element) => element.remove());
  clone.querySelectorAll("[contenteditable], [inert]").forEach((element) => {
    element.removeAttribute("contenteditable");
    element.removeAttribute("inert");
  });
  clone.style.setProperty("width", "210mm", "important");
  clone.style.setProperty("max-width", "210mm", "important");
  clone.style.setProperty("height", "auto", "important");
  clone.style.setProperty("min-height", "297mm", "important");
  clone.style.setProperty("margin", "0", "important");
  clone.style.setProperty("overflow", "visible", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("box-shadow", "none", "important");
  clone.querySelectorAll<HTMLElement>("section:not(.cv-section), [data-a4-id]:not(.cv-section)").forEach((element) => {
    element.style.setProperty("break-inside", "auto", "important");
    element.style.setProperty("page-break-inside", "auto", "important");
  });
  clone.querySelectorAll<HTMLElement>(
    "h1, h2, h3, .cv-section, .experience-item, .education-item, .skill-group, .cv-item, .experience-entry, .education-entry, .reference-entry, [data-cv-page-flow-item], [data-a4-id^='reference-'], [role='listitem'], li",
  ).forEach((element) => {
    element.style.setProperty("break-inside", "avoid", "important");
    element.style.setProperty("page-break-inside", "avoid", "important");
  });
  clone.querySelectorAll<HTMLElement>("h1, h2, h3, .section-title, .cv-section-heading").forEach((element) => {
    element.style.setProperty("break-after", "avoid", "important");
    element.style.setProperty("page-break-after", "avoid", "important");
  });
  return clone;
}

/** Render the actual styled preview DOM, avoiding a second, divergent template renderer. */
export async function exportCvVisualPdf(
  previewElement: HTMLElement,
  filename: string,
  templateId: string,
  onStageChange?: (stage: CvPdfExportStage) => void,
): Promise<void> {
  onStageChange?.("preparing");
  const safeName = filename.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "-") || "BonList-CV";
  const response = await authFetch("/api/career/cv/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorizeOnly: true, templateId }),
  });
  if (!response.ok) {
    const message = await readExportError(response);
    console.error("[CV PDF rendering failed]", { status: response.status, message });
    throw new Error(message);
  }

  await document.fonts?.ready;
  const clone = createPdfPreviewClone(previewElement);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:210mm;z-index:-1;pointer-events:none";
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    onStageChange?.("rendering");
    const { default: html2pdf } = await import("html2pdf.js");
    const exportScale = Math.min(2, 30_000 / Math.max(clone.scrollHeight, clone.offsetHeight, 1));
    const pdfOptions = {
      margin: 0,
      image: { type: "png" as const },
      pagebreak: {
        mode: ["css", "legacy"],
        avoid: [
          ".cv-item",
          ".experience-entry",
          ".education-entry",
          ".reference-entry",
          ".cv-section",
          ".skill-group",
          ".experience-item",
          ".education-item",
          "[data-cv-page-flow-item]",
          "[role='listitem']",
          "li",
          "h1",
          "h2",
          "h3",
        ],
      },
      html2canvas: {
        scale: exportScale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDocument: Document) => {
          const clonedRoot = clonedDocument.getElementById("bonlist-cv-document-export");
          if (!clonedRoot) throw new Error("Could not find the CV document in the PDF export clone.");
          clonedRoot.style.setProperty("width", "210mm", "important");
          clonedRoot.style.setProperty("max-width", "210mm", "important");
          clonedRoot.style.setProperty("min-height", "297mm", "important");
          clonedRoot.style.setProperty("height", "auto", "important");
          const clonedWindow = clonedDocument.defaultView;
          const colorCanvas = clonedDocument.createElement("canvas");
          colorCanvas.width = 1;
          colorCanvas.height = 1;
          const colorContext = colorCanvas.getContext("2d", { willReadFrequently: true });
          const toRgb = (color: string): string => {
            if (!color.toLowerCase().includes("oklch")) return color;
            if (!colorContext) throw new Error("Could not initialize the PDF color converter.");
            colorContext.fillStyle = "#010203";
            colorContext.fillStyle = color;
            if (clonedWindow?.CSS.supports("color", color) === false
              || (clonedWindow?.CSS.supports("color", color) !== true && colorContext.fillStyle === "#010203")) {
              throw new Error(`Could not convert CSS color for PDF export: ${color}`);
            }
            colorContext.clearRect(0, 0, 1, 1);
            colorContext.fillRect(0, 0, 1, 1);
            const [red, green, blue, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
            return alpha === 255
              ? `rgb(${red}, ${green}, ${blue})`
              : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
          };
          const cvElements = [clonedRoot, ...Array.from(clonedRoot.querySelectorAll<HTMLElement>("*"))];
          cvElements.forEach((element) => {
            const computed = clonedWindow?.getComputedStyle(element);
            if (!computed) return;
            if (computed.backgroundColor.toLowerCase().includes("oklch")) {
              element.style.setProperty("background-color", toRgb(computed.backgroundColor), "important");
            }
            if (computed.color.toLowerCase().includes("oklch")) {
              element.style.setProperty("color", toRgb(computed.color), "important");
            }
          });
          const printRules = clonedDocument.createElement("style");
          printRules.textContent = `
            @page { size: A4 portrait; margin: 0; }
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            #bonlist-cv-document-export, #bonlist-cv-document-export * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #bonlist-cv-document-export { break-after: auto !important; page-break-after: auto !important; }
            #bonlist-cv-document-export section:not(.cv-section),
            #bonlist-cv-document-export [data-a4-id]:not(.cv-section) {
              break-inside: auto !important;
              page-break-inside: auto !important;
            }
            #bonlist-cv-document-export .cv-section,
            #bonlist-cv-document-export .experience-item,
            #bonlist-cv-document-export .education-item,
            #bonlist-cv-document-export .skill-group {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            #bonlist-cv-document-export h1,
            #bonlist-cv-document-export h2,
            #bonlist-cv-document-export h3,
            #bonlist-cv-document-export .cv-item,
            #bonlist-cv-document-export .experience-entry,
            #bonlist-cv-document-export .education-entry,
            #bonlist-cv-document-export .reference-entry,
            #bonlist-cv-document-export [data-cv-page-flow-item],
            #bonlist-cv-document-export .experience-item,
            #bonlist-cv-document-export .education-item,
            #bonlist-cv-document-export [data-a4-id^="reference-"],
            #bonlist-cv-document-export [role="listitem"],
            #bonlist-cv-document-export li {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
            #bonlist-cv-document-export h1,
            #bonlist-cv-document-export h2,
            #bonlist-cv-document-export h3,
            #bonlist-cv-document-export .section-title,
            #bonlist-cv-document-export .cv-section-heading {
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
          `;
          clonedDocument.head.appendChild(printRules);
        },
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
    };
    const pdf = await html2pdf().set(pdfOptions).from(clone).outputPdf("blob");
    if (!pdf.size) throw new Error("The PDF renderer returned an empty document.");
    onStageChange?.("downloading");
    const url = URL.createObjectURL(pdf);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } finally {
    host.remove();
  }
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

export function measureCvPages(source: HTMLElement) {
  const style = getComputedStyle(source);
  const pageHeightPx = 297 * 96 / 25.4;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const height = Math.max(source.scrollHeight, source.offsetHeight);
  const managedHeight = source.querySelector<HTMLElement>("[data-managed-pages-container]")?.offsetHeight || 0;
  // Translated/positioned blocks can extend into the trailing paper padding.
  // scrollHeight includes those bounds, but subtracting padding from it can
  // discard the final lines. Measure painted content independently of flow.
  const rootRect = source.getBoundingClientRect();
  const scale = rootRect.width / parseFloat(style.width) || 1;
  let contentBottom = 0;
  for (const element of source.querySelectorAll<HTMLElement>("*")) {
    if (element.closest(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-badge, [data-managed-pages-container], [data-a4-spacer]")) continue;
    // Container backgrounds stretch with the paper; only leaf content and
    // editable fields establish the last visible CV line.
    if (element.childElementCount && !element.matches("input, textarea, select")) continue;
    const rect = element.getBoundingClientRect();
    const computed = getComputedStyle(element);
    if (!rect.width || !rect.height || computed.visibility === "hidden" || computed.display === "none") continue;
    contentBottom = Math.max(contentBottom, (rect.bottom - rootRect.top) / scale);
  }
  const contentHeight = Math.max(contentBottom, height - managedHeight - paddingBottom);
  const naturalHeight = Math.max(pageHeightPx, contentHeight);
  // The final content block must finish before the page's bottom padding, not
  // merely before the physical edge of the A4 sheet.
  const naturalPages = Math.max(1, Math.ceil((contentHeight + paddingBottom - 1) / pageHeightPx));
  const managedCount = source.querySelectorAll("[data-managed-page]").length;
  return { pageHeightPx, naturalHeight, naturalPages, pageCount: naturalPages + managedCount, height };
}
