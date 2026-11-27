import type Button from "sap/m/Button";
import type Dialog from "sap/m/Dialog";
import type HBox from "sap/m/HBox";
import type Menu from "sap/m/Menu";
import type TextArea from "sap/m/TextArea";
import type VBox from "sap/m/VBox";
import type JSONModel from "sap/ui/model/json/JSONModel";
import type { Button$PressEvent } from "sap/m/Button";
import type { Image$PressEvent } from "sap/m/Image";
import encodeXML from "sap/base/security/encodeXML";
import type Chat from "../Chat.controller";
import formatter from "../../model/formatter";
import { pickFile } from "../../util/pickFile";
import { MEDIA_ACCEPT, inspectVideo, kindOf, prepareImage, validateName, validateSize } from "../../util/mediaTools";
import type { MediaKind } from "../../util/mediaTools";
import { isAbortError, isUnauthorized } from "../../util/errors";
import type MediaService from "../../service/MediaService";
import type { UploadMeta } from "../../service/MediaService";

type DomEvent = JQuery.Event & { originalEvent?: Event };
type DelegateHandlers = Record<string, (event: DomEvent) => void>;

export interface AttachmentRow {
    ID: string;
    Kind: MediaKind;
    MimeType: string;
    FileName: string;
    Size: number;
    Width: number | null;
    Height: number | null;
    DurationSeconds: number | null;
    ThumbnailMimeType: string | null;
}

export interface MediaMessageRow {
    Attachment?: AttachmentRow | null;
}

interface PendingUpload {
    conversationId: string;
    body: Blob;
    meta: Omit<UploadMeta, "conversationId" | "size">;
    thumbnail: Blob | null;
    previewUrl: string | null;
}

interface PreparedFile {
    body: Blob;
    mimeType: string;
    kind: MediaKind;
    thumbnail: Blob | null;
    width?: number;
    height?: number;
    durationSeconds?: number;
}

const EMPTY_PREVIEW = { kind: "File", fileName: "", mimeType: "", size: 0, previewUrl: "", videoHtml: "", caption: "", uploading: false, progress: 0 };

/**
 * Anexos do composer: botão de anexo, colar imagem, arrastar e soltar sobre a área de mensagens, prévia com legenda
 * e envio (Upload -> miniatura do vídeo -> SendMessage com Upload_ID, cancelável) e visualizador em tela cheia.
 * O estado da prévia e do visualizador é JSONModel "compose" de cada diálogo (só UI).
 */
export default class MediaSection {

    public readonly formatter = formatter;

    private pending: PendingUpload | null = null;

    private uploadAbort?: AbortController;

    private previewDialog?: Dialog;

    private viewerDialog?: Dialog;

    private inputDelegate?: DelegateHandlers;

    private areaDelegate?: DelegateHandlers;

    private rootDelegate?: DelegateHandlers;

    public constructor(private readonly controller: Chat) { }

    public init(): void {
        this.inputDelegate = { onpaste: (event: DomEvent) => this.onPaste(event) };
        this.areaDelegate = {
            ondragover: (event: DomEvent) => this.onAreaDragOver(event),
            ondragleave: (event: DomEvent) => this.onAreaDragLeave(event),
            ondrop: (event: DomEvent) => this.onAreaDrop(event)
        };
        this.rootDelegate = {
            ondragover: (event: DomEvent) => this.preventFileNavigation(event),
            ondrop: (event: DomEvent) => this.preventFileNavigation(event)
        };
        this.getInput().addEventDelegate(this.inputDelegate);
        this.getMessagesPage().addEventDelegate(this.areaDelegate);
        this.getRoot().addEventDelegate(this.rootDelegate);
    }

    public destroy(): void {
        this.abortUpload();
        this.discardPending();
        this.removeDelegates();
        this.previewDialog?.destroy();
        this.viewerDialog?.destroy();
    }

    public onOpenAttachMenu = (event: Button$PressEvent): void => {
        (this.controller.byId("attachMenu") as Menu).openBy(event.getSource());
    };

    /** O seletor é aberto dentro do próprio gesto (sem await antes), senão o navegador bloqueia. */
    public onPickMedia = (): void => {
        void this.pickAndPreview(MEDIA_ACCEPT);
    };

    public onPickFile = (): void => {
        void this.pickAndPreview("");
    };

    /** Envio em etapas: upload, miniatura (se vídeo) e só então a mensagem. Cancelar aborta a partir de onde estiver. */
    public onSend = async (): Promise<void> => {
        const pending = this.pending;

        if (!pending) {
            return;
        }

        const abort = new AbortController();

        this.uploadAbort = abort;
        this.patchPreview({ uploading: true, progress: 0 });

        try {
            await this.upload(pending, this.previewCaption(), abort.signal);

            if (this.pending === pending) {
                this.previewDialog?.close();
            }

            this.controller.messages.refreshMessages();
            this.controller.conversations.refresh();
        } catch (error) {
            if (!isAbortError(error)) {
                this.patchPreview({ uploading: false });
                await this.controller.handleError(error, "mediaSendError");
            }
        } finally {
            if (this.uploadAbort === abort) {
                this.uploadAbort = undefined;
            }
        }
    };

    public onCancel = (): void => {
        this.abortUpload();
        this.previewDialog?.close();
    };

    public onPreviewClosed = (): void => {
        this.abortUpload();
        this.discardPending();
        this.patchPreview({ previewUrl: "", videoHtml: "", caption: "", uploading: false, progress: 0 });
    };

    public onOpenViewer = async (event: Image$PressEvent): Promise<void> => {
        const attachment = this.attachmentOf(event.getSource().getBindingContext()?.getObject());
        const url = attachment ? formatter.attachmentUrl(attachment.ID, "Content", this.mediaToken()) : undefined;

        if (!attachment || !url) {
            return;
        }

        const viewer = await this.getViewerDialog();

        (viewer.getModel("compose") as JSONModel).setData({
            kind: attachment.Kind,
            fileName: attachment.FileName,
            imageUrl: attachment.Kind === "Video" ? "" : url,
            videoHtml: attachment.Kind === "Video" ? this.videoHtml(url, true) : "",
            downloadUrl: formatter.attachmentDownloadUrl(attachment.ID, this.mediaToken())
        });
        viewer.open();
    };

    public onDownload = (event: Button$PressEvent): void => {
        const attachment = this.attachmentOf(event.getSource<Button>().getBindingContext()?.getObject());
        const url = attachment ? formatter.attachmentDownloadUrl(attachment.ID, this.mediaToken()) : undefined;

        if (attachment && url) {
            this.download(url, attachment.FileName);
        }
    };

    public onDownloadViewed = (): void => {
        const model = this.viewerDialog?.getModel("compose") as JSONModel | undefined;
        const url = model?.getProperty("/downloadUrl") as string | undefined;

        if (url) {
            this.download(url, model?.getProperty("/fileName") as string);
        }
    };

    public onCloseViewer = (): void => {
        this.viewerDialog?.close();
    };

    public onViewerClosed = (): void => {
        this.patchViewer({ imageUrl: "", videoHtml: "" });
    };

    private onPaste(event: DomEvent): void {
        const clipboard = (event.originalEvent as ClipboardEvent | undefined)?.clipboardData;
        const hasText = !!clipboard?.getData("text/plain");
        const image = Array.from(clipboard?.files ?? []).find((file) => file.type.startsWith("image/"));

        if (image && !hasText && this.canAttach()) {
            event.preventDefault();
            void this.openPreview(image);
        }
    }

    private onAreaDragOver(event: DomEvent): void {
        if (!this.hasFiles(event)) {
            return;
        }

        event.preventDefault();
        this.setDragging(this.canAttach());
    }

    private onAreaDragLeave(event: DomEvent): void {
        const related = (event.originalEvent as DragEvent | undefined)?.relatedTarget as Node | null | undefined;

        if (!related || !this.getMessagesPage().getDomRef()?.contains(related)) {
            this.setDragging(false);
        }
    }

    private onAreaDrop(event: DomEvent): void {
        const file = Array.from((event.originalEvent as DragEvent | undefined)?.dataTransfer?.files ?? [])[0];

        event.preventDefault();
        this.setDragging(false);

        if (file && this.canAttach()) {
            void this.openPreview(file);
        }
    }

    /** Soltar arquivo fora da área de mensagens não deve abrir o arquivo na aba. */
    private preventFileNavigation(event: DomEvent): void {
        if (this.hasFiles(event)) {
            event.preventDefault();
        }
    }

    private async pickAndPreview(accept: string): Promise<void> {
        const file = await pickFile(accept);

        if (file) {
            await this.openPreview(file);
        }
    }

    /** Valida o nome, prepara (foto reduzida, vídeo com miniatura), valida o tamanho do que vai subir e abre a prévia. */
    private async openPreview(file: File): Promise<void> {
        const nameIssue = validateName(file.name);

        if (nameIssue) {
            this.controller.showToast(nameIssue.key, nameIssue.parameters);
            return;
        }

        const prepared = await this.prepare(file);

        if (!prepared) {
            this.controller.showToast("mediaProcessError");
            return;
        }

        const sizeIssue = validateSize(prepared.kind, prepared.body.size);

        if (sizeIssue) {
            this.controller.showToast(sizeIssue.key, sizeIssue.parameters);
            return;
        }

        const previewUrl = prepared.kind === "File" ? null : URL.createObjectURL(prepared.body);

        this.discardPending();
        this.pending = {
            conversationId: this.controller.getOpenConversationId(),
            body: prepared.body,
            meta: {
                kind: prepared.kind,
                fileName: file.name,
                mimeType: prepared.mimeType,
                width: prepared.width,
                height: prepared.height,
                durationSeconds: prepared.durationSeconds
            },
            thumbnail: prepared.thumbnail,
            previewUrl
        };

        const dialog = await this.getPreviewDialog();

        this.patchPreview({
            kind: prepared.kind,
            fileName: file.name,
            mimeType: prepared.mimeType,
            size: prepared.body.size,
            previewUrl: previewUrl ?? "",
            videoHtml: prepared.kind === "Video" && previewUrl ? this.videoHtml(previewUrl, false) : "",
            caption: "",
            uploading: false,
            progress: 0
        });
        dialog.open();
    }

    private async prepare(file: File): Promise<PreparedFile | null> {
        const kind = kindOf(file);

        if (kind === "Image") {
            const image = await prepareImage(file);

            return image ? { body: image.blob, mimeType: image.mimeType, kind, thumbnail: null, width: image.width, height: image.height } : null;
        }

        if (kind === "Video") {
            const video = await inspectVideo(file);

            return {
                body: file,
                mimeType: file.type,
                kind,
                thumbnail: video.thumbnail,
                width: video.width,
                height: video.height,
                durationSeconds: video.durationSeconds
            };
        }

        return { body: file, mimeType: file.type || "application/octet-stream", kind, thumbnail: null };
    }

    private async upload(pending: PendingUpload, caption: string, signal: AbortSignal): Promise<void> {
        const media = this.controller.getAppComponent().getMediaService();
        const uploadId = await media.upload(pending.body, {
            ...pending.meta,
            conversationId: pending.conversationId,
            size: pending.body.size
        }, (fraction) => this.patchPreview({ progress: Math.round(fraction * 100) }), signal);

        if (pending.thumbnail) {
            await this.uploadThumbnail(media, uploadId, pending.thumbnail, signal);
        }

        if (signal.aborted) {
            throw new DOMException("aborted", "AbortError");
        }

        await this.controller.getChatService().sendMessage(pending.conversationId, caption || undefined, undefined, uploadId);
    }

    /** Sem miniatura o vídeo ainda é enviado; só cancelamento e sessão vencida interrompem o envio. */
    private async uploadThumbnail(media: MediaService, uploadId: string, thumbnail: Blob, signal: AbortSignal): Promise<void> {
        try {
            await media.uploadThumbnail(uploadId, thumbnail, signal);
        } catch (error) {
            if (isAbortError(error) || isUnauthorized(error)) {
                throw error;
            }
        }
    }

    private abortUpload(): void {
        this.uploadAbort?.abort();
        this.uploadAbort = undefined;
    }

    private discardPending(): void {
        if (this.pending?.previewUrl) {
            URL.revokeObjectURL(this.pending.previewUrl);
        }

        this.pending = null;
    }

    private download(url: string, fileName: string): void {
        const link = document.createElement("a");

        link.href = url;
        link.download = fileName;
        link.rel = "noopener";
        link.click();
    }

    private attachmentOf(row: unknown): AttachmentRow | undefined {
        return (row as MediaMessageRow | undefined)?.Attachment ?? undefined;
    }

    private previewCaption(): string {
        const caption = (this.previewDialog?.getModel("compose") as JSONModel | undefined)?.getProperty("/caption") as string | undefined;

        return caption?.trim() ?? "";
    }

    private patchPreview(patch: Record<string, unknown>): void {
        this.patchModel(this.previewDialog, patch);
    }

    private patchViewer(patch: Record<string, unknown>): void {
        this.patchModel(this.viewerDialog, patch);
    }

    private patchModel(dialog: Dialog | undefined, patch: Record<string, unknown>): void {
        const model = dialog?.getModel("compose") as JSONModel | undefined;

        Object.entries(patch).forEach(([key, value]) => model?.setProperty(`/${key}`, value));
    }

    private async getPreviewDialog(): Promise<Dialog> {
        this.previewDialog ??= await this.controller.loadDialog("MediaPreviewDialog", this, { ...EMPTY_PREVIEW });

        return this.previewDialog;
    }

    private async getViewerDialog(): Promise<Dialog> {
        this.viewerDialog ??= await this.controller.loadDialog("MediaViewer", this, { kind: "File", fileName: "", imageUrl: "", videoHtml: "", downloadUrl: "" });

        return this.viewerDialog;
    }

    /** A URL vem de IDs e do token (já codificado); encodeXML evita que qualquer caractere quebre o atributo. */
    private videoHtml(url: string, autoplay: boolean): string {
        const playback = autoplay ? "autoplay" : "muted";

        return `<video class="rsVideoEl" controls playsinline ${playback} src="${encodeXML(url)}"></video>`;
    }

    /** Anexo só com conversa aberta e composer visível (canal "só admins publicam" para membro comum fica fora). */
    private canAttach(): boolean {
        return !!this.controller.getOpenConversationId() && (this.controller.byId("composer") as HBox).getVisible();
    }

    private hasFiles(event: DomEvent): boolean {
        return Array.from((event.originalEvent as DragEvent | undefined)?.dataTransfer?.types ?? []).includes("Files");
    }

    private setDragging(dragging: boolean): void {
        this.controller.getUiModel().setProperty("/dragging", dragging);
    }

    private removeDelegates(): void {
        if (this.inputDelegate) {
            this.getInput().removeEventDelegate(this.inputDelegate);
        }

        if (this.areaDelegate) {
            this.getMessagesPage().removeEventDelegate(this.areaDelegate);
        }

        if (this.rootDelegate) {
            this.getRoot().removeEventDelegate(this.rootDelegate);
        }
    }

    private mediaToken(): string {
        return this.controller.getSessionModel().getProperty("/mediaToken") as string;
    }

    private getInput(): TextArea {
        return this.controller.byId("composerInput") as TextArea;
    }

    private getMessagesPage(): VBox {
        return this.controller.byId("messagesPage") as VBox;
    }

    private getRoot(): HBox {
        return this.controller.byId("chatPage") as HBox;
    }

}
