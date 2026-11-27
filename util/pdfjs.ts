import { withTimeout } from "./timeout";

/** Subconjunto da API do pdf.js (v4) usado pelo app; o módulo vem do CDN, não entra no bundle. */
export interface PdfViewport {
    width: number;
    height: number;
}

export interface PdfRenderTask {
    promise: Promise<void>;
    cancel(): void;
}

export interface PdfPage {
    getViewport(parameters: { scale: number }): PdfViewport;
    render(parameters: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): PdfRenderTask;
    cleanup(): boolean;
}

export interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
    destroy(): Promise<void>;
}

export interface PdfLoadingTask {
    promise: Promise<PdfDocument>;
    destroy(): Promise<void>;
}

export interface PdfJs {
    GlobalWorkerOptions: { workerSrc: string };
    getDocument(source: Record<string, unknown>): PdfLoadingTask;
}

// eslint-disable-next-line fiori-custom/sap-no-hardcoded-url -- CDN fixo pedido para o pdf.js (versão travada)
const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
// eslint-disable-next-line fiori-custom/sap-no-hardcoded-url -- worker do mesmo CDN e versão
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
const READY_EVENT = "rs-pdfjs-ready";
const LOAD_TIMEOUT_MS = 15_000;

let loading: Promise<PdfJs> | undefined;

/** Carrega o pdf.js uma única vez: um module script importa o módulo e publica a API num evento. */
export function loadPdfJs(): Promise<PdfJs> {
    loading ??= injectModule().catch((error: unknown) => {
        loading = undefined;
        throw error;
    });

    return loading;
}

function injectModule(): Promise<PdfJs> {
    const ready = new Promise<PdfJs>((resolve) => {
        window.addEventListener(READY_EVENT, (event) => resolve((event as CustomEvent<PdfJs>).detail), { once: true });
        // eslint-disable-next-line fiori-custom/sap-no-element-creation -- script de módulo para importar o pdf.js do CDN
        const script = document.createElement("script");

        script.type = "module";
        script.textContent = `import * as pdfjs from "${PDFJS_MODULE_URL}"; window.dispatchEvent(new CustomEvent("${READY_EVENT}", { detail: pdfjs }));`;
        document.head.appendChild(script);
    });

    return withTimeout(ready, LOAD_TIMEOUT_MS).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;

        return pdfjs;
    });
}
