sap.ui.define(["sap/base/security/encodeXML", "../../model/formatter", "../../util/pickFile", "../../util/mediaTools", "../../util/errors"], function (encodeXML, __formatter, ____util_pickFile, ____util_mediaTools, ____util_errors) {
  "use strict";

  function _interopRequireDefault(obj) {
    return obj && obj.__esModule && typeof obj.default !== "undefined" ? obj.default : obj;
  }
  const formatter = _interopRequireDefault(__formatter);
  const pickFile = ____util_pickFile["pickFile"];
  const MEDIA_ACCEPT = ____util_mediaTools["MEDIA_ACCEPT"];
  const inspectVideo = ____util_mediaTools["inspectVideo"];
  const kindOf = ____util_mediaTools["kindOf"];
  const prepareImage = ____util_mediaTools["prepareImage"];
  const validateName = ____util_mediaTools["validateName"];
  const validateSize = ____util_mediaTools["validateSize"];
  const isAbortError = ____util_errors["isAbortError"];
  const isUnauthorized = ____util_errors["isUnauthorized"];
  const EMPTY_PREVIEW = {
    kind: "File",
    fileName: "",
    mimeType: "",
    size: 0,
    previewUrl: "",
    videoHtml: "",
    caption: "",
    uploading: false,
    progress: 0
  };

  /**
   * Anexos do composer: botão de anexo, colar imagem, arrastar e soltar sobre a área de mensagens, prévia com legenda
   * e envio (Upload -> miniatura do vídeo -> SendMessage com Upload_ID, cancelável) e visualizador em tela cheia.
   * O estado da prévia e do visualizador é JSONModel "compose" de cada diálogo (só UI).
   */
  class MediaSection {
    formatter = formatter;
    pending = null;
    constructor(controller) {
      this.controller = controller;
    }
    init() {
      this.inputDelegate = {
        onpaste: event => this.onPaste(event)
      };
      this.areaDelegate = {
        ondragover: event => this.onAreaDragOver(event),
        ondragleave: event => this.onAreaDragLeave(event),
        ondrop: event => this.onAreaDrop(event)
      };
      this.rootDelegate = {
        ondragover: event => this.preventFileNavigation(event),
        ondrop: event => this.preventFileNavigation(event)
      };
      this.getInput().addEventDelegate(this.inputDelegate);
      this.getMessagesPage().addEventDelegate(this.areaDelegate);
      this.getRoot().addEventDelegate(this.rootDelegate);
    }
    destroy() {
      this.abortUpload();
      this.discardPending();
      this.removeDelegates();
      this.previewDialog?.destroy();
      this.viewerDialog?.destroy();
    }
    onOpenAttachMenu = event => {
      this.controller.byId("attachMenu").openBy(event.getSource());
    };

    /** O seletor é aberto dentro do próprio gesto (sem await antes), senão o navegador bloqueia. */
    onPickMedia = () => {
      void this.pickAndPreview(MEDIA_ACCEPT);
    };
    onPickFile = () => {
      void this.pickAndPreview("");
    };

    /** Envio em etapas: upload, miniatura (se vídeo) e só então a mensagem. Cancelar aborta a partir de onde estiver. */
    onSend = async () => {
      const pending = this.pending;
      if (!pending) {
        return;
      }
      const abort = new AbortController();
      this.uploadAbort = abort;
      this.patchPreview({
        uploading: true,
        progress: 0
      });
      try {
        await this.upload(pending, this.previewCaption(), abort.signal);
        if (this.pending === pending) {
          this.previewDialog?.close();
        }
        this.controller.messages.refreshMessages();
        this.controller.conversations.refresh();
      } catch (error) {
        if (!isAbortError(error)) {
          this.patchPreview({
            uploading: false
          });
          await this.controller.handleError(error, "mediaSendError");
        }
      } finally {
        if (this.uploadAbort === abort) {
          this.uploadAbort = undefined;
        }
      }
    };
    onCancel = () => {
      this.abortUpload();
      this.previewDialog?.close();
    };
    onPreviewClosed = () => {
      this.abortUpload();
      this.discardPending();
      this.patchPreview({
        previewUrl: "",
        videoHtml: "",
        caption: "",
        uploading: false,
        progress: 0
      });
    };
    onOpenViewer = async event => {
      const attachment = this.attachmentOf(event.getSource().getBindingContext()?.getObject());
      const url = attachment ? formatter.attachmentUrl(attachment.ID, "Content", this.mediaToken()) : undefined;
      if (!attachment || !url) {
        return;
      }
      const viewer = await this.getViewerDialog();
      viewer.getModel("compose").setData({
        kind: attachment.Kind,
        fileName: attachment.FileName,
        imageUrl: attachment.Kind === "Video" ? "" : url,
        videoHtml: attachment.Kind === "Video" ? this.videoHtml(url, true) : "",
        downloadUrl: formatter.attachmentDownloadUrl(attachment.ID, this.mediaToken())
      });
      viewer.open();
    };
    onDownload = event => {
      const attachment = this.attachmentOf(event.getSource().getBindingContext()?.getObject());
      const url = attachment ? formatter.attachmentDownloadUrl(attachment.ID, this.mediaToken()) : undefined;
      if (attachment && url) {
        this.download(url, attachment.FileName);
      }
    };
    onDownloadViewed = () => {
      const model = this.viewerDialog?.getModel("compose");
      const url = model?.getProperty("/downloadUrl");
      if (url) {
        this.download(url, model?.getProperty("/fileName"));
      }
    };
    onCloseViewer = () => {
      this.viewerDialog?.close();
    };
    onViewerClosed = () => {
      this.patchViewer({
        imageUrl: "",
        videoHtml: ""
      });
    };
    onPaste(event) {
      const clipboard = event.originalEvent?.clipboardData;
      const hasText = !!clipboard?.getData("text/plain");
      const image = Array.from(clipboard?.files ?? []).find(file => file.type.startsWith("image/"));
      if (image && !hasText && this.canAttach()) {
        event.preventDefault();
        void this.openPreview(image);
      }
    }
    onAreaDragOver(event) {
      if (!this.hasFiles(event)) {
        return;
      }
      event.preventDefault();
      this.setDragging(this.canAttach());
    }
    onAreaDragLeave(event) {
      const related = event.originalEvent?.relatedTarget;
      if (!related || !this.getMessagesPage().getDomRef()?.contains(related)) {
        this.setDragging(false);
      }
    }
    onAreaDrop(event) {
      const file = Array.from(event.originalEvent?.dataTransfer?.files ?? [])[0];
      event.preventDefault();
      this.setDragging(false);
      if (file && this.canAttach()) {
        void this.openPreview(file);
      }
    }

    /** Soltar arquivo fora da área de mensagens não deve abrir o arquivo na aba. */
    preventFileNavigation(event) {
      if (this.hasFiles(event)) {
        event.preventDefault();
      }
    }
    async pickAndPreview(accept) {
      const file = await pickFile(accept);
      if (file) {
        await this.openPreview(file);
      }
    }

    /** Valida o nome, prepara (foto reduzida, vídeo com miniatura), valida o tamanho do que vai subir e abre a prévia. */
    async openPreview(file) {
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
    async prepare(file) {
      const kind = kindOf(file);
      if (kind === "Image") {
        const image = await prepareImage(file);
        return image ? {
          body: image.blob,
          mimeType: image.mimeType,
          kind,
          thumbnail: null,
          width: image.width,
          height: image.height
        } : null;
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
      return {
        body: file,
        mimeType: file.type || "application/octet-stream",
        kind,
        thumbnail: null
      };
    }
    async upload(pending, caption, signal) {
      const media = this.controller.getAppComponent().getMediaService();
      const uploadId = await media.upload(pending.body, {
        ...pending.meta,
        conversationId: pending.conversationId,
        size: pending.body.size
      }, fraction => this.patchPreview({
        progress: Math.round(fraction * 100)
      }), signal);
      if (pending.thumbnail) {
        await this.uploadThumbnail(media, uploadId, pending.thumbnail, signal);
      }
      if (signal.aborted) {
        throw new DOMException("aborted", "AbortError");
      }
      await this.controller.getChatService().sendMessage(pending.conversationId, caption || undefined, undefined, uploadId);
    }

    /** Sem miniatura o vídeo ainda é enviado; só cancelamento e sessão vencida interrompem o envio. */
    async uploadThumbnail(media, uploadId, thumbnail, signal) {
      try {
        await media.uploadThumbnail(uploadId, thumbnail, signal);
      } catch (error) {
        if (isAbortError(error) || isUnauthorized(error)) {
          throw error;
        }
      }
    }
    abortUpload() {
      this.uploadAbort?.abort();
      this.uploadAbort = undefined;
    }
    discardPending() {
      if (this.pending?.previewUrl) {
        URL.revokeObjectURL(this.pending.previewUrl);
      }
      this.pending = null;
    }
    download(url, fileName) {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.rel = "noopener";
      link.click();
    }
    attachmentOf(row) {
      return row?.Attachment ?? undefined;
    }
    previewCaption() {
      const caption = this.previewDialog?.getModel("compose")?.getProperty("/caption");
      return caption?.trim() ?? "";
    }
    patchPreview(patch) {
      this.patchModel(this.previewDialog, patch);
    }
    patchViewer(patch) {
      this.patchModel(this.viewerDialog, patch);
    }
    patchModel(dialog, patch) {
      const model = dialog?.getModel("compose");
      Object.entries(patch).forEach(([key, value]) => model?.setProperty(`/${key}`, value));
    }
    async getPreviewDialog() {
      this.previewDialog ??= await this.controller.loadDialog("MediaPreviewDialog", this, {
        ...EMPTY_PREVIEW
      });
      return this.previewDialog;
    }
    async getViewerDialog() {
      this.viewerDialog ??= await this.controller.loadDialog("MediaViewer", this, {
        kind: "File",
        fileName: "",
        imageUrl: "",
        videoHtml: "",
        downloadUrl: ""
      });
      return this.viewerDialog;
    }

    /** A URL vem de IDs e do token (já codificado); encodeXML evita que qualquer caractere quebre o atributo. */
    videoHtml(url, autoplay) {
      const playback = autoplay ? "autoplay" : "muted";
      return `<video class="rsVideoEl" controls playsinline ${playback} src="${encodeXML(url)}"></video>`;
    }

    /** Anexo só com conversa aberta e composer visível (canal "só admins publicam" para membro comum fica fora). */
    canAttach() {
      return !!this.controller.getOpenConversationId() && this.controller.byId("composer").getVisible();
    }
    hasFiles(event) {
      return Array.from(event.originalEvent?.dataTransfer?.types ?? []).includes("Files");
    }
    setDragging(dragging) {
      this.controller.getUiModel().setProperty("/dragging", dragging);
    }
    removeDelegates() {
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
    mediaToken() {
      return this.controller.getSessionModel().getProperty("/mediaToken");
    }
    getInput() {
      return this.controller.byId("composerInput");
    }
    getMessagesPage() {
      return this.controller.byId("messagesPage");
    }
    getRoot() {
      return this.controller.byId("chatPage");
    }
  }
  return MediaSection;
});
//# sourceMappingURL=MediaSection-dbg.js.map
