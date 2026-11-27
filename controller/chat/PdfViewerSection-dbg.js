sap.ui.define(["../../util/pdfjs", "../../util/download", "../../util/timeout"], function (____util_pdfjs, ____util_download, ____util_timeout) {
  "use strict";

  const loadPdfJs = ____util_pdfjs["loadPdfJs"];
  const downloadFile = ____util_download["downloadFile"];
  const withTimeout = ____util_timeout["withTimeout"];
  const LOAD_TIMEOUT_MS = 20_000;
  /** Páginas renderizadas além da faixa visível (cada lado); o resto é liberado para não estourar memória. */
  const RENDER_AHEAD = 3;
  const PAGE_INSET_PX = 16;
  const MIN_PAGE_WIDTH = 240;

  /**
   * Visualizador de PDF: o pdf.js busca a URL Content?mt= (o servidor responde attachment, nunca inline),
   * as páginas viram placeholders com a proporção da 1ª página e são rasterizadas em canvas sob demanda.
   * O estado (nome, página atual, erro) fica no JSONModel "compose" do diálogo (só UI).
   */
  class PdfViewerSection {
    url = "";
    ratio = 1.4142;
    pageCount = 0;
    session = 0;

    /** Página presente = renderizando (null) ou renderizada; ausente = liberada. */
    tasks = new Map();
    visible = new Set();
    scrollFrame = 0;
    constructor(controller) {
      this.controller = controller;
    }
    destroy() {
      this.close();
      this.dialog?.destroy();
    }
    async open(url, fileName, downloadUrl) {
      const dialog = await this.getDialog();
      this.close();
      this.url = new URL(url, window.location.href).href;
      this.patch({
        fileName,
        downloadUrl,
        pageLabel: "",
        error: false,
        loading: true
      });
      dialog.open();
    }
    onOpened = () => {
      void this.load();
    };
    onClosed = () => {
      this.close();
    };
    onClose = () => {
      this.dialog?.close();
    };
    onDownload = () => {
      const model = this.dialog?.getModel("compose");
      downloadFile(model?.getProperty("/downloadUrl"), model?.getProperty("/fileName"));
    };
    async load() {
      const session = this.session;
      try {
        const pdfjs = await loadPdfJs();
        const task = pdfjs.getDocument({
          url: this.url,
          isEvalSupported: false,
          disableRange: true,
          disableStream: true,
          disableAutoFetch: true
        });
        this.loadingTask = task;
        const pdf = await withTimeout(task.promise, LOAD_TIMEOUT_MS);
        if (session !== this.session) {
          void pdf.destroy();
          return;
        }
        this.document = pdf;
        await this.showPages(pdf, session);
      } catch {
        if (session === this.session) {
          this.patch({
            error: true,
            loading: false
          });
        }
      }
    }
    async showPages(pdf, session) {
      const first = await pdf.getPage(1);
      const base = first.getViewport({
        scale: 1
      });
      const host = this.host();
      first.cleanup();
      this.ratio = base.height / base.width;
      this.pageCount = pdf.numPages;
      if (!host) {
        throw new Error("pdf host unavailable");
      }
      if (session !== this.session) {
        return;
      }
      host.replaceChildren(...Array.from({
        length: pdf.numPages
      }, (_, index) => this.createPage(index + 1)));
      this.observer = new IntersectionObserver(entries => this.onIntersect(entries), {
        root: host,
        rootMargin: "200px 0px"
      });
      host.querySelectorAll(".rsPdfPage").forEach(page => this.observer?.observe(page));
      window.addEventListener("resize", this.onResize);
      host.addEventListener("scroll", this.onScroll, {
        passive: true
      });
      this.patch({
        loading: false,
        pageLabel: this.controller.getText("pdfPageOf", [1, pdf.numPages])
      });
    }
    onResize = () => {
      this.layoutPages();
      [...this.tasks.keys()].forEach(number => this.releasePage(number));
      this.refreshWindow();
      this.updatePageLabel();
    };

    /** Rolagem só atualiza o rótulo, no próximo frame; o observer continua decidindo o que renderizar. */
    onScroll = () => {
      if (this.scrollFrame) {
        return;
      }
      this.scrollFrame = window.requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.updatePageLabel();
      });
    };

    /** Página cujo retângulo contém o centro vertical do host (ou a mais próxima, se o centro cair numa fresta). */
    updatePageLabel() {
      const host = this.host();
      if (!host || !this.pageCount) {
        return;
      }
      const bounds = host.getBoundingClientRect();
      const center = bounds.top + bounds.height / 2;
      let current = 1;
      let bestDistance = Number.POSITIVE_INFINITY;
      host.querySelectorAll(".rsPdfPage").forEach(page => {
        const rect = page.getBoundingClientRect();
        const distance = center < rect.top ? rect.top - center : Math.max(0, center - rect.bottom);
        if (distance < bestDistance) {
          bestDistance = distance;
          current = Number(page.dataset.page);
        }
      });
      this.patch({
        pageLabel: this.controller.getText("pdfPageOf", [current, this.pageCount])
      });
    }
    onIntersect(entries) {
      entries.forEach(entry => {
        const number = Number(entry.target.dataset.page);
        if (entry.isIntersecting) {
          this.visible.add(number);
        } else {
          this.visible.delete(number);
        }
      });
      this.refreshWindow();
    }

    /** Renderiza a faixa visível mais RENDER_AHEAD de cada lado e libera o resto (o rótulo vem do scroll). */
    refreshWindow() {
      if (!this.document || this.visible.size === 0) {
        return;
      }
      const numbers = [...this.visible];
      const first = Math.min(...numbers);
      const last = Math.max(...numbers);
      for (let number = 1; number <= this.pageCount; number += 1) {
        if (number >= first - RENDER_AHEAD && number <= last + RENDER_AHEAD) {
          void this.renderPage(number);
        } else {
          this.releasePage(number);
        }
      }
    }
    async renderPage(number) {
      const pdf = this.document;
      if (!pdf || this.tasks.has(number)) {
        return;
      }
      const session = this.session;
      this.tasks.set(number, null);
      try {
        const page = await pdf.getPage(number);
        if (!this.isCurrent(pdf, session, number)) {
          page.cleanup();
          return;
        }
        const dpr = window.devicePixelRatio || 1;
        const width = this.pageWidth();
        const base = page.getViewport({
          scale: 1
        });
        const viewport = page.getViewport({
          scale: width / base.width * dpr
        });
        const canvas = this.canvasOf(number);
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
        const task = page.render({
          canvasContext: context,
          viewport
        });
        this.tasks.set(number, task);
        await task.promise;
        page.cleanup();
      } catch {
        // cancelado ao sair da janela ou ao fechar: releasePage/close já tratam o registro da página
      }
    }
    releasePage(number) {
      if (!this.tasks.has(number)) {
        return;
      }
      this.tasks.get(number)?.cancel();
      this.tasks.delete(number);
      const canvas = this.host()?.querySelector(`[data-page="${number}"] canvas`);
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    isCurrent(pdf, session, number) {
      return this.document === pdf && session === this.session && this.tasks.has(number);
    }

    /** Fecha tudo: cancela renderizações, desconecta o observer, destrói o documento e limpa as páginas. */
    close() {
      this.session += 1;
      this.observer?.disconnect();
      this.observer = undefined;
      window.removeEventListener("resize", this.onResize);
      this.host()?.removeEventListener("scroll", this.onScroll);
      window.cancelAnimationFrame(this.scrollFrame);
      this.scrollFrame = 0;
      this.tasks.forEach(task => task?.cancel());
      this.tasks.clear();
      this.visible.clear();
      void this.loadingTask?.destroy();
      this.loadingTask = undefined;
      void this.document?.destroy();
      this.document = undefined;
      this.host()?.replaceChildren();
    }
    layoutPages() {
      const width = this.pageWidth();
      this.host()?.querySelectorAll(".rsPdfPage").forEach(page => {
        page.style.width = `${width}px`;
        page.style.height = `${Math.round(width * this.ratio)}px`;
      });
    }
    createPage(number) {
      // eslint-disable-next-line fiori-custom/sap-no-element-creation -- contêiner de página do PDF, não há controle UI5 equivalente
      const page = document.createElement("div");
      const width = this.pageWidth();
      page.className = "rsPdfPage";
      page.setAttribute("data-page", String(number));
      page.style.width = `${width}px`;
      page.style.height = `${Math.round(width * this.ratio)}px`;
      return page;
    }
    canvasOf(number) {
      const page = this.host()?.querySelector(`[data-page="${number}"]`);
      const existing = page?.querySelector("canvas");
      if (existing) {
        return existing;
      }

      // eslint-disable-next-line fiori-custom/sap-no-element-creation -- canvas de uma página do PDF
      const canvas = document.createElement("canvas");
      page?.appendChild(canvas);
      return canvas;
    }
    pageWidth() {
      return Math.max(MIN_PAGE_WIDTH, (this.host()?.clientWidth ?? 0) - PAGE_INSET_PX * 2);
    }
    host() {
      // O core:HTML usa a raiz do conteúdo (<div class="rsPdfPages">) como o próprio DOM do controle.
      const dom = this.controller.getFragmentControl("pdfHost").getDomRef();
      return dom?.matches(".rsPdfPages") ? dom : dom?.querySelector(".rsPdfPages") ?? null;
    }
    patch(patch) {
      const model = this.dialog?.getModel("compose");
      Object.entries(patch).forEach(([key, value]) => model?.setProperty(`/${key}`, value));
    }
    async getDialog() {
      this.dialog ??= await this.controller.loadDialog("PdfViewer", this, {
        fileName: "",
        downloadUrl: "",
        pageLabel: "",
        error: false,
        loading: true
      });
      return this.dialog;
    }
  }
  return PdfViewerSection;
});
//# sourceMappingURL=PdfViewerSection-dbg.js.map
