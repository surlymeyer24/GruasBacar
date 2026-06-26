import type { jsPDF as JsPDFType } from "jspdf";
import {
  Servicio,
  Evento,
  Foto,
  EstadoServicio,
  labelTipoFlota,
  enganchadorDeDuplaServicio,
  esGeoValida,
  ResumenDuracionActa,
  eventosParaVistaActa,
} from "@gruasbacar/shared";
import { formatFechaHora } from "./formatters";
import { formatearCoordenadas } from "./googleMapsUrl";
import {
  driveFileIdDeFoto,
  etiquetaFotoLegible,
  urlFotoDrive,
  urlFotoPreview,
} from "./driveUrl";
import { obtenerFotosParaPdf, obtenerUrlsPreviewFotos } from "../services/drive.service";

const PAGE_W = 210;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 12;
const BRAND_RED: [number, number, number] = [200, 30, 30];

const LOGO_MAX_W = 48;
const LOGO_MAX_H = 16;
const ANEXO_COL_GAP = 4;
const ANEXO_IMG_BOX_W = (CONTENT_W - ANEXO_COL_GAP) / 2;
const ANEXO_IMG_BOX_H = 55;
const ANEXO_LABEL_H = 6;
const ANEXO_CAPTION_H = 10;

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
}

export interface ExportActaPdfProgress {
  percent: number;
  label: string;
}

function reportProgress(
  onProgress: ExportActaPdfOptions["onProgress"],
  percent: number,
  label: string
) {
  onProgress?.({ percent: Math.min(100, Math.max(0, Math.round(percent))), label });
}

interface LogoAsset {
  dataUrl: string;
  width: number;
  height: number;
}

interface ImagenPdf {
  dataUrl?: string;
  element?: HTMLImageElement;
  format: "JPEG" | "PNG";
  aspect: number;
}

interface FotoAnexoItem {
  eventoTipo: string;
  eventoFecha: string;
  foto: Foto;
  fileId: string | null;
}

function labelEstado(estado: EstadoServicio): string {
  switch (estado) {
    case "ENGANCHADO":
      return "Enganchado";
    case "EN_TRASLADO":
      return "En traslado";
    case "DESENGANCHADO":
      return "Entregado (completado)";
    case "ANULADO":
      return "Anulado";
    default:
      return estado;
  }
}

async function crearPdf() {
  const { jsPDF } = await import("jspdf");
  return jsPDF;
}

function fitAspectInBox(aspect: number, maxW: number, maxH: number): { w: number; h: number } {
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

async function cargarLogoBacar(): Promise<LogoAsset | null> {
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
      const fitted = fitInBox(width, height, LOGO_MAX_W, LOGO_MAX_H);
      return { dataUrl, width: fitted.w, height: fitted.h };
    } catch {
      // intentar siguiente ruta
    }
  }
  return null;
}

async function cargarImagenParaPdf(src: string): Promise<ImagenPdf | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.referrerPolicy = "no-referrer";
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

function recolectarFotosAnexo(eventos: Evento[]): FotoAnexoItem[] {
  const items: FotoAnexoItem[] = [];
  for (const evento of eventos) {
    if (!evento.fotos?.length) continue;
    const eventoFecha = formatFechaHora(evento.timestamp);
    for (const foto of evento.fotos) {
      items.push({
        eventoTipo: evento.tipo,
        eventoFecha,
        foto,
        fileId: driveFileIdDeFoto(foto),
      });
    }
  }
  return items;
}

async function cargarImagenesAnexo(
  items: FotoAnexoItem[],
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
      const key = item.fileId ?? item.foto.url ?? item.foto.etiqueta;
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

function pageBottom(doc: JsPDFType): number {
  return doc.internal.pageSize.getHeight() - FOOTER_H;
}

function ensureSpace(doc: JsPDFType, y: number, needed: number): number {
  if (y + needed > pageBottom(doc)) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function strokeRect(doc: JsPDFType, x: number, y: number, w: number, h: number, lw = 0.25) {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h);
}

function drawFormSectionTitle(doc: JsPDFType, title: string, y: number): number {
  y = ensureSpace(doc, y, 9);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(MARGIN, y, CONTENT_W, 7, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(title.toUpperCase(), PAGE_W / 2, y + 4.8, { align: "center" });
  return y + 7;
}

function drawFormField(
  doc: JsPDFType,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height = 13
): void {
  strokeRect(doc, x, y, width, height);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(70, 70, 70);
  doc.text(label.toUpperCase(), x + 1.5, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(value || "—", width - 3);
  doc.text(lines.slice(0, 2), x + 1.5, y + 8.5);
}

function drawFieldRow(
  doc: JsPDFType,
  fields: { label: string; value: string; span?: number }[],
  y: number,
  cols = 3
): number {
  const totalSpan = fields.reduce((acc, f) => acc + (f.span ?? 1), 0);
  const effectiveCols = Math.min(cols, totalSpan);
  const colW = CONTENT_W / effectiveCols;
  const rowH = 13;

  y = ensureSpace(doc, y, rowH + 1);

  let colCursor = 0;
  fields.forEach((field) => {
    const span = field.span ?? 1;
    const x = MARGIN + colCursor * colW;
    const w = colW * span;
    drawFormField(doc, x, y, w, field.label, field.value, rowH);
    colCursor += span;
  });

  return y + rowH;
}

function drawTextBlock(
  doc: JsPDFType,
  label: string,
  text: string,
  y: number,
  minHeight = 22
): number {
  y = ensureSpace(doc, y, minHeight + 4);
  strokeRect(doc, MARGIN, y, CONTENT_W, minHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(70, 70, 70);
  doc.text(label.toUpperCase(), MARGIN + 1.5, y + 3.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(text || "—", CONTENT_W - 4);
  doc.text(lines, MARGIN + 1.5, y + 8);
  return y + minHeight + 2;
}

function drawHeader(doc: JsPDFType, logo: LogoAsset | null, servicio: Servicio): number {
  let y = MARGIN;
  const headerH = 26;

  strokeRect(doc, MARGIN, y, CONTENT_W, headerH, 0.35);

  if (logo) {
    const logoX = MARGIN + 4;
    const logoY = y + (headerH - logo.height) / 2;
    doc.addImage(logo.dataUrl, "PNG", logoX, logoY, logo.width, logo.height);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND_RED);
    doc.text("Grupo BACAR", MARGIN + 4, y + 14);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("GRÚAS BACAR", PAGE_W - MARGIN - 4, y + 8, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Municipio de Córdoba — Seguridad Vial", PAGE_W - MARGIN - 4, y + 12.5, { align: "right" });

  const boxW = 46;
  const boxX = PAGE_W - MARGIN - boxW - 2;
  strokeRect(doc, boxX, y + 15, boxW, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(70, 70, 70);
  doc.text("N° ACTA / INFRACCIÓN", boxX + 2, y + 18.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(servicio.numeroInfraccion, boxX + 2, y + 22.5);

  y += headerH + 2;

  doc.setFillColor(255, 255, 255);
  strokeRect(doc, MARGIN, y, CONTENT_W, 10, 0.45);
  doc.rect(MARGIN, y, CONTENT_W, 10, "F");
  strokeRect(doc, MARGIN, y, CONTENT_W, 10, 0.45);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_RED);
  doc.text("INFORME DE SERVICIO DE GRÚA", PAGE_W / 2, y + 7, { align: "center" });

  y += 12;

  const fechaRef = servicio.finalizadoEn ?? servicio.creadoEn ?? servicio.fechaCreacion ?? new Date();
  y = drawFieldRow(
    doc,
    [
      { label: "Provincia", value: "Córdoba" },
      { label: "Municipio", value: "Córdoba" },
      { label: "Fecha y hora", value: formatFechaHora(fechaRef) },
    ],
    y,
    3
  );

  return y + 2;
}

function drawNotaFotosAlFinal(doc: JsPDFType, y: number): number {
  y = ensureSpace(doc, y, 10);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(
    "Las fotografías del acta se encuentran al final del documento.",
    MARGIN + 1.5,
    y + 4
  );
  return y + 8;
}

function alturaCeldaAnexo(item: FotoAnexoItem): number {
  let captionH = ANEXO_CAPTION_H;
  if (item.foto.observacion?.trim()) captionH += 4;
  if (item.foto.comentarios?.length) captionH += item.foto.comentarios.length * 3.5;
  return ANEXO_LABEL_H + ANEXO_IMG_BOX_H + captionH + 3;
}

function drawFotoAnexoCelda(
  doc: JsPDFType,
  item: FotoAnexoItem,
  x: number,
  y: number,
  imagen: ImagenPdf | undefined
): void {
  const cellH = alturaCeldaAnexo(item);

  strokeRect(doc, x, y, ANEXO_IMG_BOX_W, cellH, 0.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND_RED);
  doc.text(`${item.eventoTipo} — ${etiquetaFotoLegible(item.foto.etiqueta)}`, x + 1.5, y + 4);

  const imgBoxY = y + ANEXO_LABEL_H;
  strokeRect(doc, x + 1, imgBoxY, ANEXO_IMG_BOX_W - 2, ANEXO_IMG_BOX_H, 0.15);

  if (imagen) {
    const fitted = fitAspectInBox(imagen.aspect, ANEXO_IMG_BOX_W - 4, ANEXO_IMG_BOX_H - 2);
    const drawW = fitted.w;
    const drawH = fitted.h;
    const imgX = x + 1 + (ANEXO_IMG_BOX_W - 2 - drawW) / 2;
    const imgY = imgBoxY + (ANEXO_IMG_BOX_H - drawH) / 2;
    if (imagen.dataUrl) {
      doc.addImage(imagen.dataUrl, imagen.format, imgX, imgY, drawW, drawH);
    } else if (imagen.element) {
      doc.addImage(imagen.element, imagen.format, imgX, imgY, drawW, drawH);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Imagen no disponible", x + ANEXO_IMG_BOX_W / 2, imgBoxY + ANEXO_IMG_BOX_H / 2, {
      align: "center",
    });
    const driveUrl = urlFotoDrive(item.foto);
    if (driveUrl && driveUrl !== "#") {
      doc.setTextColor(37, 99, 235);
      doc.textWithLink("Ver en Drive", x + ANEXO_IMG_BOX_W / 2, imgBoxY + ANEXO_IMG_BOX_H / 2 + 4, {
        align: "center",
        url: driveUrl,
      });
    }
  }

  let captionY = imgBoxY + ANEXO_IMG_BOX_H + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  doc.text(item.eventoFecha, x + 1.5, captionY);
  captionY += 3.5;

  if (item.foto.observacion?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(70, 70, 70);
    const obs = doc.splitTextToSize(`Operador: ${item.foto.observacion.trim()}`, ANEXO_IMG_BOX_W - 3);
    doc.text(obs.slice(0, 2), x + 1.5, captionY);
    captionY += obs.length * 3;
  }

  if (item.foto.comentarios?.length) {
    for (const c of item.foto.comentarios) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 120);
      const linea = doc.splitTextToSize(`${c.autorNombre}: ${c.texto.trim()}`, ANEXO_IMG_BOX_W - 3);
      doc.text(linea.slice(0, 2), x + 1.5, captionY);
      captionY += linea.length * 3;
    }
  }
}

function drawAnexoFotografico(
  doc: JsPDFType,
  items: FotoAnexoItem[],
  imagenes: Map<string, ImagenPdf>
): void {
  if (items.length === 0) return;

  doc.addPage();
  let y = MARGIN;

  y = drawFormSectionTitle(doc, "Anexo — documentación fotográfica", y);
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const intro = doc.splitTextToSize(
    `Se adjuntan ${items.length} fotografía(s) registradas durante los eventos del acta.`,
    CONTENT_W
  );
  doc.text(intro, MARGIN, y + 4);
  y += intro.length * 3.5 + 4;

  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1];
    const rowH = Math.max(alturaCeldaAnexo(left), right ? alturaCeldaAnexo(right) : 0);

    y = ensureSpace(doc, y, rowH + 2);

    const leftKey = left.fileId ?? left.foto.url ?? left.foto.etiqueta;
    drawFotoAnexoCelda(doc, left, MARGIN, y, imagenes.get(leftKey));

    if (right) {
      const rightKey = right.fileId ?? right.foto.url ?? right.foto.etiqueta;
      drawFotoAnexoCelda(
        doc,
        right,
        MARGIN + ANEXO_IMG_BOX_W + ANEXO_COL_GAP,
        y,
        imagenes.get(rightKey)
      );
    }

    y += rowH + 4;
  }
}

function drawFooters(doc: JsPDFType): void {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Generado el ${formatFechaHora(new Date())} — Grupo Bacar / Grúas Bacar — Pág. ${p}/${totalPages}`,
      PAGE_W / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: "center" }
    );
  }
}

export async function exportActaPdf(options: ExportActaPdfOptions): Promise<void> {
  const {
    servicio,
    eventos,
    patenteGrua,
    tipoFlota,
    corralonNombre,
    duracion,
    previewUrls,
    incluirFotos = true,
    legajos,
    onProgress,
  } = options;

  reportProgress(onProgress, 5, "Preparando exportación…");

  const fotosAnexo = incluirFotos ? recolectarFotosAnexo(eventos) : [];
  const eventosVista = eventosParaVistaActa(eventos, servicio);

  reportProgress(onProgress, 12, "Cargando recursos del documento…");
  const [JsPDF, logo] = await Promise.all([crearPdf(), cargarLogoBacar()]);

  let imagenesAnexo = new Map<string, ImagenPdf>();
  if (fotosAnexo.length > 0) {
    reportProgress(onProgress, 20, `Descargando fotografías (0/${fotosAnexo.length})…`);
    imagenesAnexo = await cargarImagenesAnexo(fotosAnexo, previewUrls ?? {}, (done, total) => {
      const fotoPercent = 20 + (done / Math.max(total, 1)) * 55;
      reportProgress(onProgress, fotoPercent, `Descargando fotografías (${done}/${total})…`);
    });
  } else {
    reportProgress(onProgress, 40, "Sin fotografías en el anexo…");
  }

  reportProgress(onProgress, 78, "Generando páginas del informe…");

  const doc = new JsPDF({ unit: "mm", format: "a4" });
  let y = drawHeader(doc, logo, servicio);

  y = drawFormSectionTitle(doc, "Vehículo", y);
  y = drawFieldRow(
    doc,
    [
      { label: "N° dominio (patente)", value: servicio.patente },
      { label: "Estado del acta", value: labelEstado(servicio.estado) },
      { label: "Código / ID compuesto", value: servicio.identificadorCompuesto },
    ],
    y,
    3
  );
  y = drawFieldRow(
    doc,
    [
      { label: "Grúa remolcadora", value: patenteGrua },
      { label: "Tipo de operación", value: labelTipoFlota(tipoFlota) },
      {
        label: "Origen",
        value: servicio.origenManual ? "Carga manual (supervisor/admin)" : "Flujo operativo",
      },
    ],
    y,
    3
  );

  if (duracion) {
    y = drawFieldRow(
      doc,
      [
        { label: "Inicio del servicio", value: formatFechaHora(duracion.inicio) },
        {
          label: duracion.enCurso ? "Tiempo transcurrido" : "Finalización",
          value: duracion.enCurso ? duracion.etiqueta : formatFechaHora(duracion.fin),
        },
        { label: "Duración total", value: duracion.etiqueta },
      ],
      y,
      3
    );
  }

  y = drawFormSectionTitle(doc, "Personal de la dupla", y);
  y = drawFieldRow(
    doc,
    [
      { label: "Chofer", value: servicio.dupla?.chofer ?? "—" },
      { label: "Enganchador", value: enganchadorDeDuplaServicio(servicio.dupla) || "—" },
      { label: "Inspector actuante", value: servicio.dupla?.inspector ?? "—" },
    ],
    y,
    3
  );
  y = drawFieldRow(
    doc,
    [
      { label: "Legajo chofer", value: legajos?.chofer ?? "—" },
      { label: "Legajo enganchador", value: legajos?.enganchador ?? servicio.legajoChofer?.trim() ?? "—" },
    ],
    y,
    2
  );

  if (corralonNombre || servicio.encargadoDeposito?.trim()) {
    y = drawFormSectionTitle(doc, "Estadía del vehículo", y);
    y = drawFieldRow(
      doc,
      [
        { label: "Corralón", value: corralonNombre ?? "—" },
        { label: "Encargado de depósito", value: servicio.encargadoDeposito?.trim() ?? "—", span: 2 },
      ],
      y,
      3
    );
  }

  y = drawFormSectionTitle(doc, "Registro de eventos en ruta", y);

  if (eventosVista.length === 0) {
    y = drawTextBlock(doc, "Observaciones", "Sin eventos registrados.", y, 14);
  }

  for (const evento of eventosVista) {
    y = ensureSpace(doc, y, 18);

    strokeRect(doc, MARGIN, y, CONTENT_W, 7, 0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND_RED);
    doc.text(`EVENTO: ${evento.tipo}`, MARGIN + 2, y + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(formatFechaHora(evento.timestamp), PAGE_W - MARGIN - 2, y + 4.5, { align: "right" });
    y += 8;

    if (evento.observacionGeneral?.trim()) {
      y = drawTextBlock(doc, "Descripción / observaciones", evento.observacionGeneral.trim(), y, 16);
    }

    if (evento.tipo === "DESENGANCHE" && (corralonNombre || evento.corralon?.trim())) {
      const encargado = evento.encargadoDeposito?.trim();
      const corralonTexto = [
        corralonNombre ?? evento.corralon?.trim(),
        encargado ? `Encargado: ${encargado}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      y = drawTextBlock(doc, "Corralón de entrega", corralonTexto, y, 12);
    }

    if (evento.geo && esGeoValida(evento.geo)) {
      y = ensureSpace(doc, y, 10);
      const coords = formatearCoordenadas(evento.geo.lat, evento.geo.lng);
      const mapsUrl = `https://www.google.com/maps?q=${evento.geo.lat},${evento.geo.lng}`;
      strokeRect(doc, MARGIN, y, CONTENT_W, 9);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(70, 70, 70);
      doc.text("UBICACIÓN GPS", MARGIN + 1.5, y + 3.5);
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(coords, MARGIN + 1.5, y + 7);
      doc.setTextColor(37, 99, 235);
      doc.textWithLink("Google Maps", PAGE_W - MARGIN - 3, y + 7, { align: "right", url: mapsUrl });
      y += 10;
    }

    if (evento.ubicacionReferencia?.trim()) {
      y = drawTextBlock(doc, "Lugar (dirección / referencia)", evento.ubicacionReferencia.trim(), y, 12);
    }

    y += 3;
  }

  y = drawFormSectionTitle(doc, "Observaciones / prueba documental", y);
  const resumenObs = eventosVista
    .map((e) => e.observacionGeneral?.trim())
    .filter(Boolean)
    .join("\n");
  y = drawTextBlock(
    doc,
    "Resumen",
    resumenObs || "Sin observaciones adicionales.",
    y,
    20
  );

  if (fotosAnexo.length > 0) {
    y = drawNotaFotosAlFinal(doc, y);
    reportProgress(onProgress, 90, "Agregando anexo fotográfico…");
    drawAnexoFotografico(doc, fotosAnexo, imagenesAnexo);
  }

  drawFooters(doc);

  reportProgress(onProgress, 96, "Guardando archivo PDF…");
  const safePatente = servicio.patente.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeActa = servicio.numeroInfraccion.replace(/[^a-zA-Z0-9_-]/g, "_");
  doc.save(`acta_${safePatente}_${safeActa}.pdf`);
  reportProgress(onProgress, 100, "PDF listo");
}
