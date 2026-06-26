import { useState } from "react";

export type CameraStatus = "idle" | "capturing" | "preview" | "uploading";

export const useCamera = () => {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");

  const startPhotoSession = () => {
    setStatus("capturing");
    setPhoto(null);
    setPhotoUrl(null);
  };

  const setCapturedPhoto = (blob: Blob) => {
    setPhoto(blob);
    const url = URL.createObjectURL(blob);
    setPhotoUrl(url);
    setStatus("preview");
  };

  const setUploading = () => {
    setStatus("uploading");
  };

  const reset = () => {
    if (photoUrl) {
      URL.revokeObjectURL(photoUrl);
    }
    setPhoto(null);
    setPhotoUrl(null);
    setStatus("idle");
  };

  return {
    status,
    photo,
    photoUrl,
    startPhotoSession,
    setCapturedPhoto,
    setUploading,
    reset,
    setStatus
  };
};
