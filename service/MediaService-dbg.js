sap.ui.define(["../auth/RuntimeConfig", "../util/errors"], function (___auth_RuntimeConfig, ___util_errors) {
  "use strict";

  const getRuntimeConfig = ___auth_RuntimeConfig["getRuntimeConfig"];
  const isUnauthorized = ___util_errors["isUnauthorized"];
  const THUMBNAIL_MIME = "image/jpeg";
  const SUCCESS_MIN = 200;
  const SUCCESS_MAX = 299;
  const NETWORK_STATUS = 0;
  class MediaRequestError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
      this.name = "MediaRequestError";
    }
  }
  function abortError() {
    return Object.assign(new Error("aborted"), {
      name: "AbortError"
    });
  }

  /**
   * Upload e avatar de mídia: a reserva do upload é uma action OData (ChatService); o binário vai por XHR
   * porque o OData V4 não envia corpo bruto com progresso. É o único lugar fora de auth/ com rede para isso.
   */
  class MediaService {
    constructor(chatService, auth) {
      this.chatService = chatService;
      this.auth = auth;
    }

    /** Reserva o upload, envia o binário com progresso e devolve o ID para SendMessage(Upload_ID). Cancelável por signal. */
    async upload(body, meta, onProgress, signal) {
      const uploadId = await this.renewOnce(() => this.chatService.createUpload({
        ConversationId: meta.conversationId,
        Kind: meta.kind,
        MimeType: meta.mimeType,
        FileName: meta.fileName,
        Size: meta.size,
        Width: meta.width,
        Height: meta.height,
        DurationSeconds: meta.durationSeconds
      }), signal);
      await this.request("PUT", `Uploads(${uploadId})/Content`, body, meta.mimeType, onProgress, signal);
      return uploadId;
    }
    uploadThumbnail(uploadId, thumbnail, signal) {
      return this.request("PUT", `Uploads(${uploadId})/Thumbnail`, thumbnail, THUMBNAIL_MIME, undefined, signal);
    }

    /** owner = "Me(<id>)" ou "Conversations(<id>)". O servidor recorta em 512 e incrementa AvatarVersion. */
    putAvatar(owner, photo) {
      return this.request("PUT", `${owner}/Avatar`, photo, photo.type);
    }
    deleteAvatar(owner) {
      return this.request("DELETE", `${owner}/Avatar`);
    }

    /** Repete uma vez após 401 (renovando a sessão), exceto se o envio já foi cancelado. */
    async renewOnce(action, signal) {
      try {
        return await action();
      } catch (error) {
        if (!isUnauthorized(error) || signal?.aborted || !(await this.auth.handleUnauthorized())) {
          throw error;
        }
        return action();
      }
    }
    request(method, resource, body, contentType, onProgress, signal) {
      return this.renewOnce(() => this.send(method, resource, body, contentType, onProgress, signal), signal);
    }
    send(method, resource, body, contentType, onProgress, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        const xhr = new XMLHttpRequest();
        const onAbort = () => xhr.abort();
        const settle = action => {
          signal?.removeEventListener("abort", onAbort);
          action();
        };
        xhr.open(method, `${getRuntimeConfig().chatService}${resource}`);
        xhr.setRequestHeader("Authorization", `Bearer ${this.auth.getAccessToken() ?? ""}`);
        if (contentType) {
          xhr.setRequestHeader("Content-Type", contentType);
        }
        xhr.upload.onprogress = event => {
          if (event.lengthComputable) {
            onProgress?.(event.loaded / event.total);
          }
        };
        xhr.onload = () => settle(() => xhr.status >= SUCCESS_MIN && xhr.status <= SUCCESS_MAX ? resolve() : reject(this.toError(xhr)));
        xhr.onerror = () => settle(() => reject(new MediaRequestError("", NETWORK_STATUS)));
        xhr.onabort = () => settle(() => reject(abortError()));
        signal?.addEventListener("abort", onAbort, {
          once: true
        });
        xhr.send(body ?? null);
      });
    }

    /** Mensagem de erro do servidor (JSON { error: { message } }), com o status para o 401 e o 413. */
    toError(xhr) {
      let message = "";
      try {
        message = JSON.parse(xhr.responseText).error?.message ?? "";
      } catch {
        message = "";
      }
      return new MediaRequestError(message, xhr.status);
    }
  }
  return MediaService;
});
//# sourceMappingURL=MediaService-dbg.js.map
