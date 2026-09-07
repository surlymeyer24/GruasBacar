/**
 * Captura un frame de cámara con orientación correcta sin forzar un ángulo fijo.
 *
 * Orden:
 * 1) ImageCapture.takePhoto() → JPEG con EXIF del driver (por dispositivo)
 * 2) VideoFrame (MediaStreamTrackProcessor) → drawImage respeta display size/rotation
 * 3) Canvas desde <video> sin rotación inventada (último recurso)
 *
 * compressImage se encarga de bakear EXIF a píxeles.
 * El botón "Girar" en revisión cubre dispositivos raros.
 */

export type CaptureRotationDegrees = 0 | 90 | 180 | 270;

function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Canvas toBlob devolvió null")),
      "image/jpeg",
      quality
    );
  });
}

function disposeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

function sizedCanvasForRotation(
  srcW: number,
  srcH: number,
  rotation: CaptureRotationDegrees
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  if (rotation === 90 || rotation === 270) {
    canvas.width = srcH;
    canvas.height = srcW;
  } else {
    canvas.width = srcW;
    canvas.height = srcH;
  }
  return canvas;
}

function drawRotated(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  rotation: CaptureRotationDegrees
): void {
  switch (rotation) {
    case 90:
      ctx.translate(srcH, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(source, 0, 0, srcW, srcH);
      break;
    case 180:
      ctx.translate(srcW, srcH);
      ctx.rotate(Math.PI);
      ctx.drawImage(source, 0, 0, srcW, srcH);
      break;
    case 270:
      ctx.translate(0, srcW);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(source, 0, 0, srcW, srcH);
      break;
    default:
      ctx.drawImage(source, 0, 0, srcW, srcH);
  }
}

export async function rotateBlob(
  blob: Blob,
  rotation: CaptureRotationDegrees
): Promise<Blob> {
  if (rotation === 0) return blob;
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = sizedCanvasForRotation(bmp.width, bmp.height, rotation);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2d context");
    drawRotated(ctx, bmp, bmp.width, bmp.height, rotation);
    try {
      return await canvasToJpeg(canvas);
    } finally {
      disposeCanvas(canvas);
    }
  } finally {
    bmp.close();
  }
}

/** Rota 90° CW — para el botón manual "Girar" en revisión. */
export async function rotateBlob90Cw(blob: Blob): Promise<Blob> {
  return rotateBlob(blob, 90);
}

async function captureViaImageCapture(
  track: MediaStreamTrack
): Promise<Blob | null> {
  type ImageCaptureCtor = new (t: MediaStreamTrack) => {
    takePhoto(): Promise<Blob>;
  };
  const IC = (globalThis as unknown as { ImageCapture?: ImageCaptureCtor })
    .ImageCapture;
  if (!IC) return null;

  try {
    const ic = new IC(track);
    const blob = await ic.takePhoto();
    if (blob && blob.size > 0) return blob;
  } catch {
    /* no disponible / falló */
  }
  return null;
}

async function captureViaVideoFrame(
  track: MediaStreamTrack
): Promise<Blob | null> {
  const Processor = (
    globalThis as unknown as {
      MediaStreamTrackProcessor?: new (init: {
        track: MediaStreamTrack;
      }) => { readable: ReadableStream };
    }
  ).MediaStreamTrackProcessor;

  if (!Processor) return null;

  const processor = new Processor({ track });
  const reader = processor.readable.getReader();

  try {
    const result = await reader.read();
    const frame = result.value as
      | {
          displayWidth: number;
          displayHeight: number;
          close: () => void;
        }
      | undefined;

    if (!frame?.displayWidth || !frame.displayHeight) return null;

    try {
      // Al dibujar VideoFrame, el browser aplica la rotación del sensor.
      const canvas = document.createElement("canvas");
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(
        frame as unknown as CanvasImageSource,
        0,
        0,
        canvas.width,
        canvas.height
      );
      try {
        return await canvasToJpeg(canvas);
      } finally {
        disposeCanvas(canvas);
      }
    } finally {
      frame.close();
    }
  } catch {
    return null;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
    reader.releaseLock();
  }
}

async function captureViaVideoElement(
  video: HTMLVideoElement
): Promise<Blob> {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error("Video sin dimensiones");

  // Sin rotación inventada: lo que entregue el frame.
  // Si queda mal, el usuario usa "Girar" en revisión.
  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2d context");
  ctx.drawImage(video, 0, 0, vw, vh);

  try {
    return await canvasToJpeg(canvas);
  } finally {
    disposeCanvas(canvas);
  }
}

/**
 * Captura JPEG. Preferir fuentes que traen orientación del dispositivo
 * (EXIF / VideoFrame); nunca forzar 90/270 fijos.
 */
export async function captureOrientedPhoto(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("Sin track de video");

  const fromPhoto = await captureViaImageCapture(track);
  if (fromPhoto) return fromPhoto;

  const fromFrame = await captureViaVideoFrame(track);
  if (fromFrame) return fromFrame;

  return captureViaVideoElement(video);
}
