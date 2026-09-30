type Html2CanvasCloneOptions = {
  onclone: (clonedDocument: Document) => void;
};

/** Create a direct PDF download from the styled CV DOM without opening print UI. */
export async function exportCvVisualPdf(previewElementId: string, filename: string): Promise<void> {
  const original = document.getElementById(previewElementId);
  if (!(original instanceof HTMLElement)) {
    throw new Error(`CV preview element #${previewElementId} was not found.`);
  }

  const clone = original.cloneNode(true) as HTMLElement;
  clone.removeAttribute("inert");
  Object.assign(clone.style, {
    display: "block",
    position: "static",
    width: "210mm",
    minWidth: "210mm",
    maxWidth: "210mm",
    minHeight: "297mm",
    height: "auto",
    boxSizing: "border-box",
    margin: "0",
    transform: "none",
    overflow: "visible",
    boxShadow: "none",
  });

  const spacerIds = new Set<string>();
  clone.querySelectorAll<HTMLElement>(".cv-a4-spacer, .a4-spacer, [data-a4-spacer], [data-preview-spacer='true']")
    .forEach((spacer) => {
      const id = spacer.getAttribute("data-a4-spacer") || spacer.getAttribute("data-a4-id") || "";
      if (id) spacerIds.add(id);
      const marker = document.createElement("div");
      marker.className = "html2pdf__page-break force-page-break";
      marker.setAttribute("aria-hidden", "true");
      marker.style.cssText = "display:block!important;width:100%!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;clear:both!important;break-before:page!important;page-break-before:always!important;";
      spacer.parentNode?.insertBefore(marker, spacer);
      spacer.remove();
    });

  clone.querySelectorAll<HTMLElement>("[data-page-break='true']").forEach((element) => {
    const id = element.getAttribute("data-a4-id") || "";
    element.removeAttribute("data-page-break");
    if (id && spacerIds.has(id)) return;
    element.classList.add("html2pdf__page-break", "force-page-break");
  });

  clone.querySelectorAll<HTMLElement>(".page-container, .cv-editor-wrapper").forEach((container) => {
    Object.assign(container.style, { height: "auto", minHeight: "0", boxShadow: "none", margin: "0" });
  });
  clone.querySelectorAll(".no-print, [data-preview-only='true'], .cv-page-guides, .cv-page-guide, .cv-page-guide-label, .cv-page-badge")
    .forEach((element) => element.remove());

  // Copy the editor's live values into the clone. React-controlled inputs do not
  // consistently serialize their current value into outerHTML.
  const originalFields = original.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const clonedFields = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  originalFields.forEach((source, index) => {
    const target = clonedFields[index];
    if (!target) return;
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.setAttribute("value", source.value);
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.textContent = source.value;
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      Array.from(target.options).forEach((option, optionIndex) => {
        option.toggleAttribute("selected", optionIndex === source.selectedIndex);
      });
    }
  });

  const filenameWithExtension = `${filename.replace(/\.pdf$/i, "")}.pdf`;
  const html2pdf = (await import("html2pdf.js")).default;
  const options = {
    margin: 0,
    filename: filenameWithExtension,
    image: { type: "jpeg" as const, quality: 0.98 },
    html2canvas: {
      scale: 3,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: 1024,
      backgroundColor: "#ffffff",
      onclone: (clonedDocument: Document) => sanitizeClone(clonedDocument, previewElementId),
    } satisfies Html2CanvasCloneOptions & Record<string, unknown>,
    jsPDF: { unit: "mm" as const, format: "a4", orientation: "portrait" as const },
    pagebreak: {
      mode: ["css", "legacy"],
      before: ".html2pdf__page-break",
      avoid: [".experience-item", ".education-item", "li"],
    },
  };

  await document.fonts?.ready;
  await html2pdf().set(options).from(clone).save();
}

function sanitizeClone(clonedDocument: Document, previewElementId: string): void {
  const view = clonedDocument.defaultView;
  if (!view) return;
  const colorProperties = [
    "color", "background-color", "border-color", "border-top-color", "border-right-color",
    "border-bottom-color", "border-left-color", "outline-color", "text-decoration-color",
  ];
  clonedDocument.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const computed = view.getComputedStyle(element);
    colorProperties.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (!/(?:oklab|oklch|color-mix)\s*\(/i.test(value)) return;
      const fallback = property === "color" ? "#0f172a" : property === "background-color" ? "#ffffff" : "#cbd5e1";
      element.style.setProperty(property, colorToRgba(value, fallback), "important");
    });
  });

  const root = clonedDocument.getElementById(previewElementId);
  if (root) Object.assign((root as HTMLElement).style, {
    boxShadow: "none", border: "none", transform: "none", margin: "0",
    width: "210mm", minWidth: "210mm", maxWidth: "210mm", height: "auto", overflow: "visible",
  });
  clonedDocument.querySelectorAll<HTMLElement>(".html2pdf__page-break").forEach((marker) => {
    marker.style.setProperty("break-before", "page", "important");
    marker.style.setProperty("page-break-before", "always", "important");
    marker.style.setProperty("height", "0", "important");
    marker.style.setProperty("margin", "0", "important");
    marker.style.setProperty("padding", "0", "important");
  });
}

function colorToRgba(value: string, fallback: string): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    const marker = "#010203";
    context.fillStyle = marker;
    context.fillStyle = value;
    if (context.fillStyle === marker) return fallback;
    context.fillRect(0, 0, 1, 1);
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
    return `rgba(${red}, ${green}, ${blue}, ${(alpha / 255).toFixed(3)})`;
  } catch {
    return fallback;
  }
}
