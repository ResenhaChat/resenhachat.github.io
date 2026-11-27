sap.ui.define(["./pickFile", "./pdfjs", "./timeout"], function (___pickFile, ___pdfjs, ___timeout) {
  "use strict";

  const pickFile = ___pickFile["pickFile"];
  const loadPdfJs = ___pdfjs["loadPdfJs"];
  const withTimeout = ___timeout["withTimeout"];
  /** Medidas sem o que não puder ser lido; thumbnail null quando o frame não pôde ser capturado. */
  const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
  const MEDIA_ACCEPT = `${IMAGE_ACCEPT},video/mp4,video/webm,video/quicktime`;
  const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";
  const MB = 1024 * 1024;
  const LIMITS = {
    Image: 10 * MB,
    Video: 25 * MB,
    File: 25 * MB
  };
  const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
  /** Espelho da regra do servidor (que é a referência): executáveis, scripts e páginas são recusados. */
  const BLOCKED_EXTENSIONS = ["exe", "bat", "cmd", "com", "msi", "msix", "appx", "scr", "js", "mjs", "vbs", "ps1", "sh", "apk", "jar", "dll", "html", "htm", "xhtml", "svg", "lnk", "hta", "wsf", "reg", "pif", "cpl"];
  const EXTENSION_PATTERN = /\.([^.]+)$/;
  const TRAILING_NOISE = /[.\s]+$/;
  const RESIZE_MAX_SIDE = 1600;
  const RESIZE_QUALITY = 0.9;
  const AVATAR_SIZE = 512;
  const AVATAR_QUALITY = 0.9;
  const THUMBNAIL_MAX_SIDE = 400;
  const THUMBNAIL_SECONDS = 0.5;
  const THUMBNAIL_MAX_BYTES = 300 * 1024;
  const THUMBNAIL_ATTEMPTS = [{
    scale: 1,
    quality: 0.7
  }, {
    scale: 1,
    quality: 0.5
  }, {
    scale: 0.75,
    quality: 0.5
  }, {
    scale: 0.5,
    quality: 0.5
  }];
  const MEDIA_STEP_TIMEOUT_MS = 8000;
  const PDF_THUMBNAIL_MAX_WIDTH = 400;
  const PDF_THUMBNAIL_TIMEOUT_MS = 10_000;
  async function decode(file) {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
  function onceEvent(target, type) {
    return new Promise((resolve, reject) => {
      target.addEventListener(type, () => resolve(), {
        once: true
      });
      target.addEventListener("error", () => reject(new Error(type)), {
        once: true
      });
    });
  }
  function renderBlob(options) {
    // eslint-disable-next-line fiori-custom/sap-no-element-creation -- canvas de renderização, não é controle UI5
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const {
      sourceRect: rect
    } = options;
    canvas.width = options.width;
    canvas.height = options.height;
    context?.drawImage(options.source, rect.x, rect.y, rect.width, rect.height, 0, 0, options.width, options.height);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), options.mimeType, options.quality));
  }

  /** Tenta qualidade e depois dimensão até a miniatura caber em 300 KB; se nada couber, devolve a última tentativa. */
  async function renderThumbnail(source, sourceRect, width, height) {
    let blob = null;
    for (const attempt of THUMBNAIL_ATTEMPTS) {
      blob = await renderBlob({
        source,
        sourceRect,
        width: Math.round(width * attempt.scale),
        height: Math.round(height * attempt.scale),
        mimeType: "image/jpeg",
        quality: attempt.quality
      });
      if (blob && blob.size <= THUMBNAIL_MAX_BYTES) {
        return blob;
      }
    }
    return blob;
  }

  /** Frame em ~0,5 s (ou o primeiro, se o vídeo for mais curto) reduzido a 400 px no maior lado. */
  async function captureFrame(video) {
    const {
      videoWidth: width,
      videoHeight: height,
      duration
    } = video;
    const target = Math.min(THUMBNAIL_SECONDS, duration / 2 || 0);
    if (target > 0) {
      video.currentTime = target;
      await withTimeout(onceEvent(video, "seeked"), MEDIA_STEP_TIMEOUT_MS);
    }
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(width, height));
    return renderThumbnail(video, {
      x: 0,
      y: 0,
      width,
      height
    }, Math.round(width * scale), Math.round(height * scale));
  }
  function normalizeName(fileName) {
    return fileName.trim().replace(TRAILING_NOISE, "");
  }
  function kindOf(file) {
    if (PHOTO_TYPES.includes(file.type)) {
      return "Image";
    }
    return VIDEO_TYPES.includes(file.type) ? "Video" : "File";
  }

  /** Extensão executável ou de script: recusada antes de qualquer preparo. Devolve a chave i18n do aviso ou null. */
  function validateName(fileName) {
    const extension = EXTENSION_PATTERN.exec(normalizeName(fileName))?.[1]?.toLowerCase() ?? "";
    return BLOCKED_EXTENSIONS.includes(extension) ? {
      key: "errorFileNotAllowed"
    } : null;
  }

  /** Limite por tipo, aplicado ao que vai subir (a foto já reduzida). */
  function validateSize(kind, size) {
    return size > LIMITS[kind] ? {
      key: "errorFileTooLarge",
      parameters: [`${LIMITS[kind] / MB} MB`]
    } : null;
  }

  /** Foto grande vira no máximo 1600 px no maior lado (GIF e imagens pequenas seguem como estão). */
  async function prepareImage(file) {
    const bitmap = await decode(file);
    if (!bitmap) {
      return null;
    }
    const {
      width,
      height
    } = bitmap;
    const scale = Math.min(1, RESIZE_MAX_SIDE / Math.max(width, height));
    if (file.type === "image/gif" || scale === 1) {
      bitmap.close();
      return {
        blob: file,
        mimeType: file.type,
        width,
        height
      };
    }
    const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const target = {
      width: Math.round(width * scale),
      height: Math.round(height * scale)
    };
    const blob = await renderBlob({
      source: bitmap,
      sourceRect: {
        x: 0,
        y: 0,
        width,
        height
      },
      ...target,
      mimeType,
      quality: RESIZE_QUALITY
    });
    bitmap.close();
    return blob ? {
      blob,
      mimeType,
      ...target
    } : null;
  }

  /** Recorte quadrado central em 512 px para foto de perfil e de grupo. */
  async function cropAvatar(file) {
    const bitmap = await decode(file);
    if (!bitmap) {
      return null;
    }
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceRect = {
      x: (bitmap.width - side) / 2,
      y: (bitmap.height - side) / 2,
      width: side,
      height: side
    };
    const blob = await renderBlob({
      source: bitmap,
      sourceRect,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      mimeType: "image/jpeg",
      quality: AVATAR_QUALITY
    });
    bitmap.close();
    return blob;
  }

  /** Lê dimensões, duração e miniatura de um vídeo local. Falhas viram campos ausentes, não impedem o envio. */
  async function inspectVideo(file) {
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line fiori-custom/sap-no-element-creation -- elemento de mídia para ler o frame do vídeo local
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    try {
      await withTimeout(onceEvent(video, "loadeddata"), MEDIA_STEP_TIMEOUT_MS);
      return {
        width: video.videoWidth || undefined,
        height: video.videoHeight || undefined,
        durationSeconds: Number.isFinite(video.duration) ? Math.round(video.duration) : undefined,
        thumbnail: await captureFrame(video).catch(() => null)
      };
    } catch {
      return {
        thumbnail: null
      };
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  /** Seletor de foto de perfil já recortada em quadrado; null se cancelado ou não for possível ler a imagem. */
  async function pickAvatar() {
    const file = await pickFile(AVATAR_ACCEPT);
    return file ? cropAvatar(file) : null;
  }

  /** Primeira página do PDF em até 400 px de largura (jpeg, até 300 KB). Falha ou timeout: thumbnail null, o PDF segue. */
  async function renderPdfThumbnail(file) {
    try {
      return await withTimeout(buildPdfThumbnail(file), PDF_THUMBNAIL_TIMEOUT_MS);
    } catch {
      return {
        thumbnail: null
      };
    }
  }
  async function withDocument(pdf, action) {
    try {
      return await action(pdf);
    } finally {
      await pdf.destroy();
    }
  }
  async function buildPdfThumbnail(file) {
    const pdfjs = await loadPdfJs();
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true
    });
    return withDocument(await task.promise, async pdf => {
      const page = await pdf.getPage(1);
      const base = page.getViewport({
        scale: 1
      });
      const viewport = page.getViewport({
        scale: Math.min(1, PDF_THUMBNAIL_MAX_WIDTH / base.width)
      });
      const width = Math.round(viewport.width);
      const height = Math.round(viewport.height);

      // eslint-disable-next-line fiori-custom/sap-no-element-creation -- canvas para rasterizar a página do PDF
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport
      }).promise;
      page.cleanup();
      return {
        thumbnail: await renderThumbnail(canvas, {
          x: 0,
          y: 0,
          width,
          height
        }, width, height),
        pages: pdf.numPages
      };
    });
  }
  var __exports = {
    __esModule: true
  };
  __exports.IMAGE_ACCEPT = IMAGE_ACCEPT;
  __exports.MEDIA_ACCEPT = MEDIA_ACCEPT;
  __exports.AVATAR_ACCEPT = AVATAR_ACCEPT;
  __exports.kindOf = kindOf;
  __exports.validateName = validateName;
  __exports.validateSize = validateSize;
  __exports.prepareImage = prepareImage;
  __exports.cropAvatar = cropAvatar;
  __exports.inspectVideo = inspectVideo;
  __exports.pickAvatar = pickAvatar;
  __exports.renderPdfThumbnail = renderPdfThumbnail;
  return __exports;
});
//# sourceMappingURL=mediaTools-dbg.js.map
