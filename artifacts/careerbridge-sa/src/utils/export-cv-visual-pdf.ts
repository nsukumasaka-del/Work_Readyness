/** Opens the rendered CV in an isolated native print document. Browser print
 * output retains the template's CSS and selectable text instead of rasterizing it. */
export async function exportCvVisualPdf(previewNode: HTMLElement, filename: string): Promise<void> {
  const printFrame = document.createElement("iframe");
  printFrame.setAttribute("title", "CV print preview");
  Object.assign(printFrame.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: "210mm",
    height: "297mm",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(printFrame);

  const frameWindow = printFrame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    printFrame.remove();
    throw new Error("The browser could not create a print view.");
  }

  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>("style, link[rel='stylesheet']"))
    .filter((node) => !(node instanceof HTMLLinkElement) || !node.disabled)
    .map((node) => {
      if (node instanceof HTMLLinkElement) {
        const link = node.cloneNode(false) as HTMLLinkElement;
        link.href = node.href;
        link.media = "all";
        return link.outerHTML;
      }
      return node.outerHTML;
    }).join("\n");

  const clone = previewNode.cloneNode(true) as HTMLElement;
  clone.removeAttribute("inert");
  clone.querySelectorAll(".cv-a4-spacer, [data-a4-spacer], [data-preview-spacer='true']").forEach((spacer) => spacer.remove());
  clone.querySelectorAll<HTMLElement>(".page-container, .cv-editor-wrapper").forEach((container) => {
    Object.assign(container.style, { height: "auto", minHeight: "0", boxShadow: "none", margin: "0" });
  });
  clone.querySelectorAll(".no-print, [data-preview-only='true']").forEach((element) => element.remove());

  // outerHTML does not reliably contain the live value of controlled form fields.
  // Copy current values into the print clone so the printed CV matches the canvas.
  const sourceFields = previewNode.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  const clonedFields = clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select");
  sourceFields.forEach((source, index) => {
    const target = clonedFields[index];
    if (!target) return;
    if (source instanceof HTMLInputElement && target instanceof HTMLInputElement) {
      target.setAttribute("value", source.value);
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.textContent = source.value;
      target.removeAttribute("placeholder");
    } else if (source instanceof HTMLSelectElement && target instanceof HTMLSelectElement) {
      target.value = source.value;
      Array.from(target.options).forEach((option) => {
        if (option.value === source.value) option.setAttribute("selected", "selected");
        else option.removeAttribute("selected");
      });
    }
  });

  const waitForStyles = () => Promise.all(Array.from(frameDocument.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']"))
    .map((link) => new Promise<void>((resolve) => {
      if (link.sheet) return resolve();
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 5000);
    })));

  frameDocument.open();
  frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(filename)}.pdf</title>${styles}<style>
    @page { size: A4 portrait; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; width: 210mm; min-height: 297mm; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    #cv-preview-render { width: 210mm !important; min-height: 297mm !important; margin: 0 auto !important; box-sizing: border-box !important; }
    #cv-preview-render .cv-page-sheet, #cv-preview-render #bonlist-cv-document { width: 210mm !important; max-width: 210mm !important; min-height: 297mm !important; height: auto !important; box-sizing: border-box !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; transform: none !important; overflow: visible !important; }
    #cv-preview-render .cv-a4-spacer, #cv-preview-render [data-a4-spacer], #cv-preview-render [data-preview-spacer='true'], #cv-preview-render .no-print, #cv-preview-render [data-preview-only='true'] { display: none !important; }
    #cv-preview-render .cv-page-guides, #cv-preview-render .cv-page-guide, #cv-preview-render .cv-page-guide-label, #cv-preview-render .cv-page-badge { display: none !important; }
    #cv-preview-render .cv-page-sheet::before { display: none !important; }
    #cv-preview-render input, #cv-preview-render textarea, #cv-preview-render select { appearance: none !important; border: 0 !important; outline: 0 !important; box-shadow: none !important; background: transparent !important; color: inherit !important; -webkit-text-fill-color: currentColor !important; }
    #cv-preview-render textarea { resize: none !important; overflow: visible !important; white-space: pre-wrap !important; }
    #cv-preview-render .cv-section, #cv-preview-render .work-experience-item, #cv-preview-render .experience-item, #cv-preview-render .education-item, #cv-preview-render [data-a4-id], #cv-preview-render li { break-inside: avoid; page-break-inside: avoid; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  </style></head><body><div id="cv-preview-render">${clone.outerHTML}</div></body></html>`);
  frameDocument.documentElement.className = document.documentElement.className;
  frameDocument.documentElement.style.cssText = document.documentElement.style.cssText;
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) frameDocument.documentElement.setAttribute("data-theme", theme);
  frameDocument.body.className = document.body.className;
  frameDocument.body.style.cssText = document.body.style.cssText;
  frameDocument.close();

  try {
    await waitForStyles();
    await frameDocument.fonts?.ready;
    await Promise.all(Array.from(frameDocument.images).map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
        window.setTimeout(resolve, 3000);
      })));

    await new Promise<void>((resolve, reject) => {
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        frameWindow.removeEventListener("afterprint", cleanup);
        window.clearTimeout(fallbackTimer);
        printFrame.remove();
      };
      const fallbackTimer = window.setTimeout(cleanup, 60_000);
      frameWindow.addEventListener("afterprint", cleanup, { once: true });
      try {
        frameWindow.focus();
        frameWindow.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
  } catch (error) {
    printFrame.remove();
    throw error;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}
