import heic2any from "heic2any";
import exifr from "exifr";

const MAX_WIDTH = 800;
const FALLBACK_WIDTH = 400;
const JPEG_QUALITY = 0.55;

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

function isHeic(file: File | Blob): boolean {
  if (HEIC_TYPES.has(file.type)) return true;
  if (file instanceof File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    return ext === "heic" || ext === "heif";
  }
  return false;
}

async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  const result = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export produced null blob"))),
      type,
      quality
    );
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para compresión"));
    img.src = src;
  });
}

function swapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

async function readExifOrientation(blob: Blob): Promise<number> {
  try {
    const orientation = await exifr.orientation(blob);
    return typeof orientation === "number" && orientation >= 1 && orientation <= 8
      ? orientation
      : 1;
  } catch {
    return 1;
  }
}

function isMemoryError(err: unknown): boolean {
  return (
    err instanceof RangeError ||
    (err instanceof Error && /memory|allocation|out of memory/i.test(err.message))
  );
}

function clampSize(w: number, h: number, maxW: number): { width: number; height: number } {
  if (w <= maxW) return { width: w, height: h };
  return { width: maxW, height: Math.round((h * maxW) / w) };
}

/**
 * Redimensiona y deja la orientación bakeada en píxeles (sin tag EXIF Orientation).
 * Prioriza createImageBitmap({ imageOrientation: "from-image" }) para fotos
 * de cámara nativa; si falla, aplica EXIF a mano.
 */
async function resizeBakeOrientation(blob: Blob, maxWidth: number): Promise<Blob> {
  // 1) Ideal: el browser bakea EXIF al decodificar
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob, {
        imageOrientation: "from-image",
        resizeWidth: maxWidth,
        resizeQuality: "medium",
      } as ImageBitmapOptions);
      try {
        const { width, height } = clampSize(bmp.width, bmp.height, maxWidth);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D context");
        ctx.drawImage(bmp, 0, 0, width, height);
        try {
          return await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        bmp.close();
      }
    } catch {
      /* continuar con path manual */
    }

    try {
      const bmp = await createImageBitmap(blob, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      try {
        const { width, height } = clampSize(bmp.width, bmp.height, maxWidth);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get 2D context");
        ctx.drawImage(bmp, 0, 0, width, height);
        try {
          return await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
      } finally {
        bmp.close();
      }
    } catch {
      /* continuar */
    }
  }

  // 2) Manual con EXIF + píxeles crudos
  const orientation = await readExifOrientation(blob);
  let bitmap: ImageBitmap | null = null;
  let imgEl: HTMLImageElement | null = null;
  let objectUrl: string | null = null;

  try {
    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(blob, {
          imageOrientation: "none",
        } as ImageBitmapOptions);
      } catch {
        try {
          bitmap = await createImageBitmap(blob);
        } catch {
          bitmap = null;
        }
      }
    }

    if (!bitmap) {
      objectUrl = URL.createObjectURL(blob);
      imgEl = await loadImageElement(objectUrl);
    }

    const srcW = bitmap ? bitmap.width : imgEl!.naturalWidth;
    const srcH = bitmap ? bitmap.height : imgEl!.naturalHeight;
    const source: CanvasImageSource = bitmap ?? imgEl!;

    let effective = orientation;
    if (swapsAxes(orientation) && srcH >= srcW) {
      effective = 1;
    } else if (
      imgEl &&
      typeof CSS !== "undefined" &&
      CSS.supports("image-orientation", "from-image")
    ) {
      // <img> + drawImage modernos ya aplican EXIF
      effective = 1;
    }

    const visualW = swapsAxes(effective) ? srcH : srcW;
    const visualH = swapsAxes(effective) ? srcW : srcH;
    const { width, height } = clampSize(visualW, visualH, maxWidth);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context from canvas");

    switch (effective) {
      case 2:
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, width, height);
        break;
      case 3:
        ctx.translate(width, height);
        ctx.rotate(Math.PI);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, width, height);
        break;
      case 4:
        ctx.translate(0, height);
        ctx.scale(1, -1);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, width, height);
        break;
      case 5:
        ctx.rotate(0.5 * Math.PI);
        ctx.scale(1, -1);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, height, width);
        break;
      case 6:
        ctx.rotate(0.5 * Math.PI);
        ctx.translate(0, -width);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, height, width);
        break;
      case 7:
        ctx.rotate(0.5 * Math.PI);
        ctx.translate(height, -width);
        ctx.scale(-1, 1);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, height, width);
        break;
      case 8:
        ctx.rotate(-0.5 * Math.PI);
        ctx.translate(-height, 0);
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, height, width);
        break;
      default:
        ctx.drawImage(source, 0, 0, srcW, srcH, 0, 0, width, height);
    }

    try {
      return await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

export const compressImage = async (fileOrBlob: File | Blob): Promise<Blob> => {
  let source: Blob = fileOrBlob;
  if (isHeic(fileOrBlob)) {
    source = await convertHeicToJpeg(fileOrBlob);
  }

  try {
    return await resizeBakeOrientation(source, MAX_WIDTH);
  } catch (err) {
    if (isMemoryError(err)) {
      return await resizeBakeOrientation(source, FALLBACK_WIDTH);
    }
    throw err;
  }
};
