import { Servicio, Evento, Foto, ResumenDuracionActa } from "@gruasbacar/shared";
import { driveFileIdDeFoto, urlFotoPreview } from "./driveUrl";
import { obtenerFotosParaPdf, obtenerUrlsPreviewFotos } from "../services/drive.service";

export type ExportActaPdfVariant = "operador" | "supervisor";

export interface ExportActaPdfOptions {
  servicio: Servicio;
  eventos: Evento[];
  patenteGrua: string;
  tipoFlota?: string;
  corralonNombre?: string;
  duracion?: ResumenDuracionActa | null;
  /** URLs de vista previa ya resueltas en el modal (Drive). */
  previewUrls?: Record<string, string>;
  incluirFotos?: boolean;
  legajos?: { chofer: string; enganchador: string };
  onProgress?: (progress: ExportActaPdfProgress) => void;
  /** Retornar el PDF como Blob en vez de descargarlo. */
  returnBlob?: boolean;
  /** `operador`: vista Mis Actas. `supervisor`: informe formal con anexo. */
  variant?: ExportActaPdfVariant;
}

export interface ExportActaPdfProgress {
  percent: number;
  label: string;
}

export interface LogoAsset {
  dataUrl: string;
  width: number;
  height: number;
}

export interface ImagenPdf {
  dataUrl?: string;
  element?: HTMLImageElement;
  format: "JPEG" | "PNG";
  aspect: number;
}

export interface FotoPdfItem {
  foto: Foto;
  fileId: string | null;
}

export function nombreArchivoPdf(servicio: Pick<Servicio, "patente" | "numeroInfraccion">): string {
  const safePatente = servicio.patente.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeActa = (servicio.numeroInfraccion ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
  return `acta_${safePatente}${safeActa ? `_${safeActa}` : ""}.pdf`;
}

export type ParteActaSupervisor = "enganche" | "desenganche";

export function nombreArchivoPdfSupervisor(
  servicio: Pick<Servicio, "patente" | "numeroInfraccion">,
  parte: ParteActaSupervisor
): string {
  const base = nombreArchivoPdf(servicio).replace(/\.pdf$/i, "");
  return `${base}_${parte}.pdf`;
}

export function reportProgress(
  onProgress: ExportActaPdfOptions["onProgress"],
  percent: number,
  label: string
) {
  onProgress?.({ percent: Math.min(100, Math.max(0, Math.round(percent))), label });
}

export function fotoKey(foto: Foto): string {
  return driveFileIdDeFoto(foto) ?? foto.url ?? foto.etiqueta;
}

export async function crearPdf() {
  const { jsPDF } = await import("jspdf");
  return jsPDF;
}

export function fitAspectInBox(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) return { w: maxW, h: maxH };
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  return { w, h };
}

function fitInBox(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { w: number; h: number } {
  if (naturalW <= 0 || naturalH <= 0) return { w: maxW, h: maxH };
  return fitAspectInBox(naturalW / naturalH, maxW, maxH);
}

function medirDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("No se pudo medir la imagen"));
    img.src = dataUrl;
  });
}

function quitarFondoNegro(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r < 40 && g < 40 && b < 40) {
          data[i + 3] = 0;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("No se pudo procesar el logo"));
    img.src = dataUrl;
  });
}

export async function cargarLogoBacar(maxW: number, maxH: number): Promise<LogoAsset | null> {
  const rutas = ["/logo-bacar-horizontal.png", "/logo-bacar.png"];
  for (const ruta of rutas) {
    try {
      const res = await fetch(ruta);
      if (!res.ok) continue;
      const blob = await res.blob();
      const raw = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const dataUrl = await quitarFondoNegro(raw);
      const { width, height } = await medirDataUrl(dataUrl);
      const fitted = fitInBox(width, height, maxW, maxH);
      return { dataUrl, width: fitted.w, height: fitted.h };
    } catch {
      // intentar siguiente ruta
    }
  }
  return null;
}

export async function cargarImagenParaPdf(src: string): Promise<ImagenPdf | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      try {
        const maxPx = 1000;
        const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ element: img, format: "JPEG", aspect });
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ dataUrl, format: "JPEG", aspect: w / h });
      } catch {
        resolve({ element: img, format: "JPEG", aspect });
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function recolectarFotosEventos(eventos: Evento[]): FotoPdfItem[] {
  const items: FotoPdfItem[] = [];
  for (const evento of eventos) {
    if (!evento.fotos?.length) continue;
    for (const foto of evento.fotos) {
      items.push({ foto, fileId: driveFileIdDeFoto(foto) });
    }
  }
  return items;
}

export async function cargarImagenesFotos(
  items: FotoPdfItem[],
  previewUrls: Record<string, string> = {},
  onPhotoProgress?: (done: number, total: number) => void
): Promise<Map<string, ImagenPdf>> {
  const map = new Map<string, ImagenPdf>();
  const ids = [...new Set(items.map((i) => i.fileId).filter(Boolean))] as string[];

  let base64PorId: Record<string, string> = {};
  if (ids.length > 0) {
    try {
      base64PorId = await obtenerFotosParaPdf(ids);
    } catch (err) {
      console.warn("[exportActaPdf] obtenerFotosParaPdf falló, se intentará fallback", err);
    }
  }

  const faltantes = ids.filter((id) => !base64PorId[id]);
  let previewsApi: Record<string, string> = {};
  if (faltantes.length > 0) {
    try {
      previewsApi = await obtenerUrlsPreviewFotos(faltantes);
    } catch (err) {
      console.warn("[exportActaPdf] obtenerUrlsPreviewFotos falló", err);
    }
  }

  let procesadas = 0;
  const total = items.length;

  await Promise.all(
    items.map(async (item) => {
      const key = fotoKey(item.foto);
      if (map.has(key)) {
        procesadas += 1;
        onPhotoProgress?.(procesadas, total);
        return;
      }

      const candidatos: string[] = [];
      if (item.fileId && base64PorId[item.fileId]) {
        candidatos.push(base64PorId[item.fileId]);
      }
      if (item.fileId && previewUrls[item.fileId]) {
        candidatos.push(previewUrls[item.fileId]);
      }
      if (item.fileId && previewsApi[item.fileId]) {
        candidatos.push(previewsApi[item.fileId]);
      }
      if (item.fileId) candidatos.push(urlFotoPreview(item.foto));
      if (item.foto.url?.trim()) candidatos.push(item.foto.url.trim());

      for (const src of candidatos) {
        if (!src) continue;
        const cargada = await cargarImagenParaPdf(src);
        if (cargada) {
          map.set(key, cargada);
          break;
        }
      }

      procesadas += 1;
      onPhotoProgress?.(procesadas, total);
    })
  );

  return map;
}

export function descargarPdfBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Descarga varios PDFs con pausa entre cada uno (evita bloqueo del navegador). */
export async function descargarPdfsSecuencial(
  items: { blob: Blob; filename: string }[],
  pauseMs = 500
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
    descargarPdfBlob(items[i].blob, items[i].filename);
  }
}
