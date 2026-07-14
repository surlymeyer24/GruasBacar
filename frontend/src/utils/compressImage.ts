const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.55;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen para compresión"));
    img.src = src;
  });
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

/**
 * Compresses an image File/Blob: resizes to max 800px width, JPEG 0.55 quality.
 * Uses createObjectURL instead of readAsDataURL to avoid holding a multi-MB
 * base64 string in memory (prevents Chrome mobile "insufficient memory" errors).
 */
export const compressImage = async (fileOrBlob: File | Blob): Promise<Blob> => {
  const objectUrl = URL.createObjectURL(fileOrBlob);
  try {
    const img = await loadImage(objectUrl);

    let width = img.width;
    let height = img.height;

    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context from canvas");

    ctx.drawImage(img, 0, 0, width, height);

    // Release decoded image bitmap immediately
    img.src = "";

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);

    // Release canvas bitmap
    canvas.width = 0;
    canvas.height = 0;

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
