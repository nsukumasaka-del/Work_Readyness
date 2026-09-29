declare module "html2pdf.js" {
  interface Html2PdfWorker {
    set(options: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement): Html2PdfWorker;
    save(): Promise<unknown>;
  }

  interface Html2PdfFactory {
    (): Html2PdfWorker;
    (element: HTMLElement): Html2PdfWorker;
  }

  const html2pdf: Html2PdfFactory & {
    (): Html2PdfWorker;
  };

  export default html2pdf;
}
