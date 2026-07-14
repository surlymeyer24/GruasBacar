export type {
  ExportActaPdfVariant,
  ExportActaPdfOptions,
  ExportActaPdfProgress,
} from "./exportActaPdfShared";
export { nombreArchivoPdf, descargarPdfBlob } from "./exportActaPdfShared";

import type { ExportActaPdfOptions } from "./exportActaPdfShared";

export async function exportActaPdf(options: ExportActaPdfOptions): Promise<Blob | void> {
  const variant = options.variant ?? "operador";

  if (variant === "supervisor") {
    const { exportActaPdfSupervisor } = await import("./exportActaPdfSupervisor");
    return exportActaPdfSupervisor(options);
  }

  const { exportActaPdfOperador } = await import("./exportActaPdfOperador");
  return exportActaPdfOperador(options);
}
