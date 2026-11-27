import { getRuntimeConfig } from "../auth/RuntimeConfig";
import type AuthService from "../auth/AuthService";
import type ChatService from "./ChatService";
import { isUnauthorized } from "../util/errors";
import type { MediaKind } from "../util/mediaTools";

export interface UploadMeta {
    conversationId: string;
    kind: MediaKind;
    fileName: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
}

export type ProgressHandler = (fraction: number) => void;

const THUMBNAIL_MIME = "image/jpeg";
const SUCCESS_MIN = 200;
const SUCCESS_MAX = 299;
const NETWORK_STATUS = 0;

class MediaRequestError extends Error {

    public constructor(message: string, public readonly status: number) {
        super(message);
        this.name = "MediaRequestError";
    }

}

function abortError(): Error {
    return Object.assign(new Error("aborted"), { name: "AbortError" });
}

/**
 * Upload e avatar de mídia: a reserva do upload é uma action OData (ChatService); o binário vai por XHR
 * porque o OData V4 não envia corpo bruto com progresso. É o único lugar fora de auth/ com rede para isso.
 */
export default class MediaService {

    public constructor(private readonly chatService: ChatService, private readonly auth: AuthService) { }

    /** Reserva o upload, envia o binário com progresso e devolve o ID para SendMessage(Upload_ID). Cancelável por signal. */
    public async upload(body: Blob, meta: UploadMeta, onProgress: ProgressHandler, signal?: AbortSignal): Promise<string> {
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

    public uploadThumbnail(uploadId: string, thumbnail: Blob, signal?: AbortSignal): Promise<void> {
        return this.request("PUT", `Uploads(${uploadId})/Thumbnail`, thumbnail, THUMBNAIL_MIME, undefined, signal);
    }

    /** owner = "Me(<id>)" ou "Conversations(<id>)". O servidor recorta em 512 e incrementa AvatarVersion. */
    public putAvatar(owner: string, photo: Blob): Promise<void> {
        return this.request("PUT", `${owner}/Avatar`, photo, photo.type);
    }

    public deleteAvatar(owner: string): Promise<void> {
        return this.request("DELETE", `${owner}/Avatar`);
    }

    /** Repete uma vez após 401 (renovando a sessão), exceto se o envio já foi cancelado. */
    private async renewOnce<Result>(action: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
        try {
            return await action();
        } catch (error) {
            if (!isUnauthorized(error) || signal?.aborted || !await this.auth.handleUnauthorized()) {
                throw error;
            }

            return action();
        }
    }

    private request(method: string, resource: string, body?: Blob, contentType?: string, onProgress?: ProgressHandler, signal?: AbortSignal): Promise<void> {
        return this.renewOnce(() => this.send(method, resource, body, contentType, onProgress, signal), signal);
    }

    private send(method: string, resource: string, body?: Blob, contentType?: string, onProgress?: ProgressHandler, signal?: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(abortError());
                return;
            }

            const xhr = new XMLHttpRequest();
            const onAbort = (): void => xhr.abort();
            const settle = (action: () => void): void => {
                signal?.removeEventListener("abort", onAbort);
                action();
            };

            xhr.open(method, `${getRuntimeConfig().chatService}${resource}`);
            xhr.setRequestHeader("Authorization", `Bearer ${this.auth.getAccessToken() ?? ""}`);

            if (contentType) {
                xhr.setRequestHeader("Content-Type", contentType);
            }

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    onProgress?.(event.loaded / event.total);
                }
            };
            xhr.onload = () => settle(() => (xhr.status >= SUCCESS_MIN && xhr.status <= SUCCESS_MAX ? resolve() : reject(this.toError(xhr))));
            xhr.onerror = () => settle(() => reject(new MediaRequestError("", NETWORK_STATUS)));
            xhr.onabort = () => settle(() => reject(abortError()));
            signal?.addEventListener("abort", onAbort, { once: true });
            xhr.send(body ?? null);
        });
    }

    /** Mensagem de erro do servidor (JSON { error: { message } }), com o status para o 401 e o 413. */
    private toError(xhr: XMLHttpRequest): MediaRequestError {
        let message = "";

        try {
            message = (JSON.parse(xhr.responseText) as { error?: { message?: string } }).error?.message ?? "";
        } catch {
            message = "";
        }

        return new MediaRequestError(message, xhr.status);
    }

}
