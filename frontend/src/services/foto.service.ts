import { app, functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { getMockServices, updateMockService } from "../data/mockData";
import { getFirebaseErrorMessage } from "../utils/firebaseError";
import { EtiquetaFoto, Foto, TipoEvento } from "@gruasbacar/shared";
import { base64ToBlob } from "./fotoCache.service";
import { subirFotosViaStorage, ProgresoSubidaFotos } from "./fotoStorage.service";

export interface SubirFotoResponse {
  driveFileId: string;
  url: string;
}

export type { ProgresoSubidaFotos };

const MOCK_CAR_IMAGES: Record<EtiquetaFoto, string> = {
  DELANTERA: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=1000&auto=format&fit=crop&q=80",
  LADO_DERECHO: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1000&auto=format&fit=crop&q=80",
  LADO_IZQUIERDO: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1000&auto=format&fit=crop&q=80",
  TRASERA: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=1000&auto=format&fit=crop&q=80",
  OBSERVACION: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=1000&auto=format&fit=crop&q=80",
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

function blobsFromBase64(fotosBase64: string[]): Blob[] {
  return fotosBase64.map((b64) => base64ToBlob(b64));
}

export const fotoService = {
  blobToBase64,

  /** Sube fotos vía Firebase Storage → trigger → Drive. */
  async subirFotosEventoLote(
    servicioId: string,
    carpeta: "enganche" | "desenganche",
    fotosMeta: Omit<Foto, "url" | "driveFileId">[],
    fotosBase64: string[],
    onProgress?: (progreso: ProgresoSubidaFotos) => void
  ): Promise<Foto[]> {
    if (fotosBase64.length === 0) return [];

    if (app) {
      const blobs = blobsFromBase64(fotosBase64);
      try {
        return await subirFotosViaStorage(
          servicioId,
          carpeta,
          fotosMeta,
          blobs,
          onProgress
        );
      } catch (err) {
        const msg = getFirebaseErrorMessage(
          err,
          "No se pudieron subir las fotos. Revisá tu conexión e intentá de nuevo."
        );
        throw new Error(msg);
      }
    }

    return fotosMeta.map((f, i) => ({
      ...f,
      url: MOCK_CAR_IMAGES[f.etiqueta],
      driveFileId: `drv_sim_${i}`,
    }));
  },

  async registrarEventoEnganche(
    servicioId: string,
    fotos: Omit<Foto, "url" | "driveFileId">[],
    geo?: { lat: number; lng: number },
    fotosBase64?: string[],
    observacionGeneral?: string,
    fotosSubidas?: Foto[]
  ): Promise<any> {
    const base64List = fotosBase64 ?? [];
    const fotosConUrl =
      fotosSubidas ??
      (await this.subirFotosEventoLote(servicioId, "enganche", fotos, base64List));

    if (app) {
      const cloudFn = httpsCallable<
        {
          servicioId: string;
          fotos: Foto[];
          fotosBase64: string[];
          geo?: { lat: number; lng: number };
          observacionGeneral?: string;
        },
        unknown
      >(functions, "registrarEventoEnganche");
      try {
        return (
          await cloudFn({
            servicioId,
            fotos: fotosConUrl,
            fotosBase64: [],
            geo,
            observacionGeneral,
          })
        ).data;
      } catch (err) {
        const msg = getFirebaseErrorMessage(
          err,
          "No se pudo registrar el enganche. Revisá tu conexión e intentá de nuevo."
        );
        throw new Error(msg);
      }
    }

    const services = getMockServices();
    const found = services.find((s) => s.id === servicioId);
    if (found) {
      if (!found.eventos) found.eventos = [];
      const idx = found.eventos.findIndex((e) => e.tipo === "ENGANCHE");

      const newEvent = {
        tipo: "ENGANCHE" as TipoEvento,
        timestamp: new Date().toISOString(),
        geo,
        fotos: fotosConUrl,
        observacionGeneral: observacionGeneral?.trim() || "Enganche completado con auditoría de fotos.",
      };

      if (idx !== -1) {
        found.eventos[idx] = newEvent;
      } else {
        found.eventos.push(newEvent);
      }

      updateMockService(found);
    }
    return { success: true };
  },
};
