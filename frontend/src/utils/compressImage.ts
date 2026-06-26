/**
 * Compresses an image represented by a File or Blob.
 * It resizes the image down to a maximum width of 1200px (preserving aspect ratio)
 * and compresses it to JPEG format with 0.7 quality.
 */
export const compressImage = (fileOrBlob: File | Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Resize constraint: max 800px width (reduce callable payload size)
        const MAX_WIDTH = 800;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get 2D context from canvas"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert the canvas content to a JPEG blob with 0.55 quality
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error("Canvas export produced null blob"));
            }
          },
          "image/jpeg",
          0.55
        );
      };
      
      img.onerror = (err) => {
        reject(new Error("Failed to load image in compression stage"));
      };

      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error("FileReader produced blank result"));
      }
    };

    reader.onerror = (err) => {
      reject(new Error("FileReader failed reading the image."));
    };

    reader.readAsDataURL(fileOrBlob);
  });
};
