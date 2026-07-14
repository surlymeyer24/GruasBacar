import { Servicio, displayPatente } from "@gruasbacar/shared";
import type { ExportActaPdfOptions } from "./exportActaPdf";
import { nombreArchivoPdf } from "./exportActaPdf";

export { descargarPdfBlob } from "./exportActaPdfShared";

/** Web Share API con soporte para archivos PDF (móvil / algunos navegadores). */
export const canSharePdfFiles = (() => {
  if (typeof navigator === "undefined" || !navigator.share || !navigator.canShare) return false;
  try {
    const testFile = new File(["test"], "test.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
})();

export type CompartirPdfResult = "shared" | "aborted" | "not_allowed" | "unavailable";

/** Debe llamarse directamente desde un click/tap del usuario (no tras await largo). */
export async function compartirPdfBlob(
  blob: Blob,
  servicio: Pick<Servicio, "patente" | "numeroInfraccion">
): Promise<CompartirPdfResult> {
  const filename = nombreArchivoPdf(servicio);
  const file = new File([blob], filename, { type: "application/pdf" });

  if (!canSharePdfFiles) return "unavailable";

  try {
    await navigator.share({
      title: `Acta ${displayPatente(servicio.patente)}`,
      text: `Acta de servicio — Patente ${displayPatente(servicio.patente)}`,
      files: [file],
    });
    return "shared";
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") return "aborted";
    if (err instanceof DOMException && err.name === "NotAllowedError") return "not_allowed";
    throw err;
  }
}

export async function generarActaPdfBlob(
  options: ExportActaPdfOptions,
  onProgress?: ExportActaPdfOptions["onProgress"]
): Promise<Blob> {
  const { exportActaPdf } = await import("./exportActaPdf");
  const blob = await exportActaPdf({
    ...options,
    variant: options.variant ?? "operador",
    returnBlob: true,
    onProgress,
  });

  if (!blob) throw new Error("No se pudo generar el PDF");
  return blob;
}
