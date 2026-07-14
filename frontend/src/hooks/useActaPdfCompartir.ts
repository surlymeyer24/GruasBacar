import { useCallback, useState } from "react";
import { Servicio } from "@gruasbacar/shared";
import type { ExportActaPdfOptions, ExportActaPdfProgress } from "../utils/exportActaPdf";
import {
  canSharePdfFiles,
  compartirPdfBlob,
  descargarPdfBlob,
  generarActaPdfBlob,
} from "../utils/shareActaPdf";
import { nombreArchivoPdf } from "../utils/exportActaPdf";

type PdfListo = {
  blob: Blob;
  servicio: Pick<Servicio, "patente" | "numeroInfraccion">;
};

export function useActaPdfCompartir() {
  const [generando, setGenerando] = useState(false);
  const [pdfListo, setPdfListo] = useState<PdfListo | null>(null);
  const [progress, setProgress] = useState<ExportActaPdfProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reiniciar = useCallback(() => {
    setPdfListo(null);
    setError(null);
    setProgress(null);
  }, []);

  const generar = useCallback(async (options: Omit<ExportActaPdfOptions, "returnBlob">) => {
    setGenerando(true);
    setError(null);
    setPdfListo(null);
    setProgress({ percent: 0, label: "Preparando acta…" });

    try {
      const blob = await generarActaPdfBlob({ ...options, returnBlob: true }, setProgress);
      setPdfListo({ blob, servicio: options.servicio });
    } catch (err: unknown) {
      console.error("[useActaPdfCompartir] Error al generar PDF:", err);
      setError("No se pudo generar el PDF. Intentá de nuevo.");
    } finally {
      setGenerando(false);
      setProgress(null);
    }
  }, []);

  const compartir = useCallback(() => {
    if (!pdfListo) return;
    setError(null);

    void compartirPdfBlob(pdfListo.blob, pdfListo.servicio)
      .then((result) => {
        if (result === "unavailable") {
          descargarPdfBlob(pdfListo.blob, nombreArchivoPdf(pdfListo.servicio));
          return;
        }
        if (result === "not_allowed") {
          setError("No se pudo abrir el menú de compartir. Probá de nuevo o descargá el PDF.");
        }
      })
      .catch((err: unknown) => {
        console.error("[useActaPdfCompartir] Error al compartir PDF:", err);
        setError("No se pudo compartir el PDF. Probá descargarlo.");
      });
  }, [pdfListo]);

  const descargar = useCallback(() => {
    if (!pdfListo) return;
    descargarPdfBlob(pdfListo.blob, nombreArchivoPdf(pdfListo.servicio));
  }, [pdfListo]);

  return {
    generando,
    pdfListo: pdfListo != null,
    progress,
    error,
    generar,
    compartir,
    descargar,
    reiniciar,
    canShare: canSharePdfFiles,
  };
}
