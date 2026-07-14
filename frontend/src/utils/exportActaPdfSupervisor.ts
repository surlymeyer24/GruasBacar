import type { jsPDF as JsPDFType } from "jspdf";
import {
  Servicio,
  Evento,
  Foto,
  EstadoServicio,
  labelTipoFlota,
  enganchadorDeDuplaServicio,
  esGeoValida,
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
import {
  type ExportActaPdfOptions,
  type ImagenPdf,
  type LogoAsset,
  crearPdf,
  cargarLogoBacar,
  cargarImagenParaPdf,
  fitAspectInBox,
  nombreArchivoPdfSupervisor,
  reportProgress,
  fotoKey,
  descargarPdfsSecuencial,
} from "./exportActaPdfShared";

const PAGE_W = 210;
const MARGIN = 12;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 12;
const BRAND_RED: [number, number, number] = [200, 30, 30];
const LOGO_MAX_W = 48;
const LOGO_MAX_H = 16;

const ANEXO_COLS = 2;
const ANEXO_COL_GAP = 4;
const ANEXO_CELL_W = (CONTENT_W - ANEXO_COL_GAP) / ANEXO_COLS;
const ANEXO_LABEL_H = 6;
const ANEXO_IMG_H = 55;

const EMPTY = "—";

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

function valor(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || EMPTY;
  }
  if (value === null || value === undefined) return EMPTY;
  const asString = String(value).trim();
  return asString || EMPTY;
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

function strokeRect(doc: JsPDFType, x: number, y: number, w: number, h: number, lineWidth = 0.25): void {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(lineWidth);
  doc.rect(x, y, w, h);
}

function drawSectionTitle(doc: JsPDFType, y: number, title: string): number {
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

function drawField(
  doc: JsPDFType,
  x: number,
  y: number,
  width: number,
  label: string,
  fieldValue: string,
  height = 13
): void {
  strokeRect(doc, x, y, width, height);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(70, 70, 70);
  doc.text(label.toUpperCase(), x + 1.5, y + 3.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(valor(fieldValue), width - 3);
  doc.text(lines.slice(0, 2), x + 1.5, y + 8.5);
}

function drawFieldRow(
  doc: JsPDFType,
  y: number,
  fields: { label: string; value: string; span?: number }[],
  cols = 3
): number {
  const totalSpan = fields.reduce((acc, field) => acc + (field.span ?? 1), 0);
  const effectiveCols = Math.min(cols, totalSpan);
  const colW = CONTENT_W / effectiveCols;
  const rowH = 13;
  y = ensureSpace(doc, y, rowH + 1);

  let colCursor = 0;
  for (const field of fields) {
    const span = field.span ?? 1;
    const x = MARGIN + colCursor * colW;
    const width = colW * span;
    drawField(doc, x, y, width, field.label, field.value, rowH);
    colCursor += span;
  }

  return y + rowH;
}

function drawTextBlock(doc: JsPDFType, y: number, label: string, text: string, minHeight = 18): number {
  y = ensureSpace(doc, y, minHeight + 2);
  strokeRect(doc, MARGIN, y, CONTENT_W, minHeight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(70, 70, 70);
  doc.text(label.toUpperCase(), MARGIN + 1.5, y + 3.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  const lines = doc.splitTextToSize(valor(text), CONTENT_W - 4);
  doc.text(lines, MARGIN + 1.5, y + 8);
  return y + minHeight + 2;
}

function drawHeader(
  doc: JsPDFType,
  logo: LogoAsset | null,
  servicio: Servicio,
  parte: "ENGANCHE" | "DESENGANCHE"
): number {
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
  doc.text("Municipio Córdoba", PAGE_W - MARGIN - 4, y + 12.5, { align: "right" });

  const boxW = 46;
  const boxX = PAGE_W - MARGIN - boxW - 2;
  strokeRect(doc, boxX, y + 15, boxW, 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(70, 70, 70);
  doc.text("N° ACTA", boxX + 2, y + 18.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(valor(servicio.numeroInfraccion), boxX + 2, y + 22.5);

  y += headerH + 2;

  strokeRect(doc, MARGIN, y, CONTENT_W, 10, 0.45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND_RED);
  doc.text(`INFORME DE SERVICIO DE GRÚA — ${parte}`, PAGE_W / 2, y + 7, { align: "center" });
  y += 12;

  const fechaRef = servicio.finalizadoEn ?? servicio.creadoEn ?? servicio.fechaCreacion ?? new Date();
  y = drawFieldRow(
    doc,
    y,
    [
      { label: "Provincia", value: "Córdoba" },
      { label: "Municipio", value: "Córdoba" },
      { label: "Fecha y hora", value: formatFechaHora(fechaRef) },
    ],
    3
  );

  return y + 2;
}

function encargadoDepositoDeEvento(evento: Evento | undefined): string {
  if (!evento) return "";
  const raw = (evento as Evento & { encargadoDeposito?: string }).encargadoDeposito;
  return typeof raw === "string" ? raw.trim() : "";
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
  const ids = [...new Set(items.map((item) => item.fileId).filter(Boolean))] as string[];

  let base64PorId: Record<string, string> = {};
  if (ids.length > 0) {
    try {
      base64PorId = await obtenerFotosParaPdf(ids);
    } catch (err) {
      console.warn("[exportActaPdfSupervisor] obtenerFotosParaPdf falló, se usa fallback", err);
    }
  }

  const faltantes = ids.filter((id) => !base64PorId[id]);
  let previewsApi: Record<string, string> = {};
  if (faltantes.length > 0) {
    try {
      previewsApi = await obtenerUrlsPreviewFotos(faltantes);
    } catch (err) {
      console.warn("[exportActaPdfSupervisor] obtenerUrlsPreviewFotos falló", err);
    }
  }

  let done = 0;
  const total = items.length;

  await Promise.all(
    items.map(async (item) => {
      const key = fotoKey(item.foto);
      if (map.has(key)) {
        done += 1;
        onPhotoProgress?.(done, total);
        return;
      }

      const candidatos: string[] = [];
      if (item.fileId && base64PorId[item.fileId]) candidatos.push(base64PorId[item.fileId]);
      if (item.fileId && previewUrls[item.fileId]) candidatos.push(previewUrls[item.fileId]);
      if (item.fileId && previewsApi[item.fileId]) candidatos.push(previewsApi[item.fileId]);
      if (item.fileId) candidatos.push(urlFotoPreview(item.foto));
      if (item.foto.url?.trim()) candidatos.push(item.foto.url.trim());

      for (const src of candidatos) {
        if (!src) continue;
        const image = await cargarImagenParaPdf(src);
        if (image) {
          map.set(key, image);
          break;
        }
      }

      done += 1;
      onPhotoProgress?.(done, total);
    })
  );

  return map;
}

function alturaCeldaAnexo(item: FotoAnexoItem, doc: JsPDFType): number {
  let h = ANEXO_LABEL_H + ANEXO_IMG_H + 8;
  if (item.foto.observacion?.trim()) {
    const obsLines = doc.splitTextToSize(`Operador: ${item.foto.observacion.trim()}`, ANEXO_CELL_W - 3);
    h += Math.min(obsLines.length, 2) * 3;
  }
  if (item.foto.comentarios?.length) {
    for (const comentario of item.foto.comentarios) {
      const cLines = doc.splitTextToSize(
        `${comentario.autorNombre}: ${comentario.texto.trim()}`,
        ANEXO_CELL_W - 3
      );
      h += Math.min(cLines.length, 2) * 3;
    }
  }
  return h;
}

function drawAnexoCell(
  doc: JsPDFType,
  item: FotoAnexoItem,
  x: number,
  y: number,
  image: ImagenPdf | undefined
): void {
  const cellH = alturaCeldaAnexo(item, doc);
  strokeRect(doc, x, y, ANEXO_CELL_W, cellH, 0.2);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.4);
  doc.setTextColor(...BRAND_RED);
  const headerLabel = `${item.eventoTipo} — ${etiquetaFotoLegible(item.foto.etiqueta)}`;
  doc.text(doc.splitTextToSize(headerLabel, ANEXO_CELL_W - 3).slice(0, 1), x + 1.5, y + 4);

  const imgY = y + ANEXO_LABEL_H;
  strokeRect(doc, x + 1, imgY, ANEXO_CELL_W - 2, ANEXO_IMG_H, 0.15);

  if (image) {
    const fitted = fitAspectInBox(image.aspect, ANEXO_CELL_W - 4, ANEXO_IMG_H - 2);
    const drawX = x + 1 + (ANEXO_CELL_W - 2 - fitted.w) / 2;
    const drawY = imgY + (ANEXO_IMG_H - fitted.h) / 2;
    if (image.dataUrl) {
      doc.addImage(image.dataUrl, image.format, drawX, drawY, fitted.w, fitted.h);
    } else if (image.element) {
      doc.addImage(image.element, image.format, drawX, drawY, fitted.w, fitted.h);
    }
    const driveUrl = urlFotoDrive(item.foto);
    if (driveUrl && driveUrl !== "#") {
      doc.link(drawX, drawY, fitted.w, fitted.h, { url: driveUrl });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Imagen no disponible", x + ANEXO_CELL_W / 2, imgY + ANEXO_IMG_H / 2, { align: "center" });

    const driveUrl = urlFotoDrive(item.foto);
    if (driveUrl && driveUrl !== "#") {
      doc.setTextColor(37, 99, 235);
      doc.textWithLink("Ver en Drive", x + ANEXO_CELL_W / 2, imgY + ANEXO_IMG_H / 2 + 4, {
        align: "center",
        url: driveUrl,
      });
    }
  }

  let textY = imgY + ANEXO_IMG_H + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(90, 90, 90);
  doc.text(item.eventoFecha, x + 1.5, textY);
  textY += 3.5;

  if (item.foto.observacion?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6);
    doc.setTextColor(70, 70, 70);
    const obs = doc.splitTextToSize(`Operador: ${item.foto.observacion.trim()}`, ANEXO_CELL_W - 3);
    doc.text(obs.slice(0, 2), x + 1.5, textY);
    textY += Math.min(obs.length, 2) * 3;
  }

  if (item.foto.comentarios?.length) {
    for (const comentario of item.foto.comentarios) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(80, 80, 120);
      const lines = doc.splitTextToSize(
        `${comentario.autorNombre}: ${comentario.texto.trim()}`,
        ANEXO_CELL_W - 3
      );
      doc.text(lines.slice(0, 2), x + 1.5, textY);
      textY += Math.min(lines.length, 2) * 3;
    }
  }
}

function drawAnexoFotografico(
  doc: JsPDFType,
  items: FotoAnexoItem[],
  images: Map<string, ImagenPdf>,
  parteLabel: string
): void {
  if (items.length === 0) return;

  doc.addPage();
  let y = MARGIN;

  y = drawSectionTitle(doc, y, `Anexo fotográfico — ${parteLabel}`);
  y += 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  const intro = doc.splitTextToSize(
    `Se adjuntan ${items.length} fotografía(s) del ${parteLabel.toLowerCase()}.`,
    CONTENT_W
  );
  doc.text(intro, MARGIN, y + 4);
  y += intro.length * 3.5 + 4;

  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1];
    const rowHeight = Math.max(
      alturaCeldaAnexo(left, doc),
      right ? alturaCeldaAnexo(right, doc) : 0
    );

    y = ensureSpace(doc, y, rowHeight + 2);
    drawAnexoCell(doc, left, MARGIN, y, images.get(fotoKey(left.foto)));

    if (right) {
      drawAnexoCell(
        doc,
        right,
        MARGIN + ANEXO_CELL_W + ANEXO_COL_GAP,
        y,
        images.get(fotoKey(right.foto))
      );
    }

    y += rowHeight + 4;
  }
}

interface SupervisorPdfContext {
  servicio: Servicio;
  patenteGrua: string;
  tipoFlota?: string;
  corralonNombre?: string;
  duracion?: ExportActaPdfOptions["duracion"];
  legajos?: ExportActaPdfOptions["legajos"];
  eventoDesenganche?: Evento;
}

function drawEventoDetalle(doc: JsPDFType, y: number, evento: Evento): number {
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
    y = drawTextBlock(doc, y, "Observación", evento.observacionGeneral.trim(), 14);
  }

  if (evento.tipo === "DESENGANCHE" && (evento.corralon?.trim() || encargadoDepositoDeEvento(evento))) {
    const corralonBlock = [
      evento.corralon?.trim() ? `Corralón: ${evento.corralon.trim()}` : null,
      encargadoDepositoDeEvento(evento) ? `Encargado: ${encargadoDepositoDeEvento(evento)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    y = drawTextBlock(doc, y, "Entrega en corralón", corralonBlock, 12);
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
    y = drawTextBlock(doc, y, "Ubicación de referencia", evento.ubicacionReferencia.trim(), 12);
  }

  return y + 3;
}

function drawSeccionesComunes(
  doc: JsPDFType,
  y: number,
  ctx: SupervisorPdfContext,
  parte: "ENGANCHE" | "DESENGANCHE"
): number {
  const { servicio, patenteGrua, tipoFlota, corralonNombre, duracion, legajos, eventoDesenganche } =
    ctx;

  y = drawSectionTitle(doc, y, "Vehículo");
  y = drawFieldRow(
    doc,
    y,
    [
      { label: "Patente", value: valor(servicio.patente) },
      { label: "Estado", value: labelEstado(servicio.estado) },
      { label: "ID compuesto", value: valor(servicio.identificadorCompuesto) },
    ],
    3
  );
  y = drawFieldRow(
    doc,
    y,
    [
      { label: "Grúa", value: valor(patenteGrua) },
      { label: "Tipo flota", value: labelTipoFlota(tipoFlota) },
      { label: "Origen", value: servicio.origenManual ? "Carga manual (supervisor/admin)" : "Flujo operativo" },
    ],
    3
  );

  if (duracion) {
    y = drawFieldRow(
      doc,
      y,
      [
        { label: "Inicio del servicio", value: formatFechaHora(duracion.inicio) },
        {
          label: duracion.enCurso ? "Tiempo transcurrido" : "Finalización",
          value: duracion.enCurso ? duracion.etiqueta : formatFechaHora(duracion.fin),
        },
        { label: "Duración total", value: valor(duracion.etiqueta) },
      ],
      3
    );
  }

  y = drawSectionTitle(doc, y, "Personal dupla");
  y = drawFieldRow(
    doc,
    y,
    [
      { label: "Chofer", value: valor(servicio.dupla?.chofer) },
      { label: "Enganchador", value: valor(enganchadorDeDuplaServicio(servicio.dupla)) },
      { label: "Inspector actuante", value: valor(servicio.dupla?.inspector) },
    ],
    3
  );
  y = drawFieldRow(
    doc,
    y,
    [
      { label: "Legajo chofer", value: valor(legajos?.chofer) },
      { label: "Legajo enganchador", value: valor(legajos?.enganchador ?? servicio.legajoChofer) },
    ],
    2
  );

  if (parte === "DESENGANCHE") {
    const encargadoDeposito = encargadoDepositoDeEvento(eventoDesenganche);
    const corralonEstadia = corralonNombre ?? eventoDesenganche?.corralon?.trim() ?? servicio.corralon;
    if (corralonEstadia || encargadoDeposito) {
      y = drawSectionTitle(doc, y, "Estadía");
      y = drawFieldRow(
        doc,
        y,
        [
          { label: "Corralón", value: valor(corralonEstadia) },
          { label: "Encargado depósito", value: valor(encargadoDeposito), span: 2 },
        ],
        3
      );
    }
  }

  return y;
}

function buildPdfSupervisor(
  JsPDF: Awaited<ReturnType<typeof crearPdf>>,
  logo: LogoAsset | null,
  ctx: SupervisorPdfContext,
  parte: "ENGANCHE" | "DESENGANCHE",
  eventosParte: Evento[],
  fotosAnexo: FotoAnexoItem[],
  imagenesAnexo: Map<string, ImagenPdf>
): JsPDFType {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  let y = drawHeader(doc, logo, ctx.servicio, parte);
  y = drawSeccionesComunes(doc, y, ctx, parte);

  y = drawSectionTitle(doc, y, `Registro ${parte === "ENGANCHE" ? "enganche" : "desenganche"}`);
  if (eventosParte.length === 0) {
    y = drawTextBlock(
      doc,
      y,
      "Detalle",
      parte === "ENGANCHE"
        ? "Sin datos de enganche registrados."
        : "Sin datos de desenganche registrados.",
      14
    );
  }

  for (const evento of eventosParte) {
    y = drawEventoDetalle(doc, y, evento);
  }

  y = drawSectionTitle(doc, y, "Observaciones resumen");
  const observacionesResumen = eventosParte
    .map((evento) => {
      const observacion = evento.observacionGeneral?.trim();
      return observacion ? `${evento.tipo}: ${observacion}` : "";
    })
    .filter(Boolean)
    .join("\n");
  y = drawTextBlock(doc, y, "Resumen", observacionesResumen || "Sin observaciones adicionales.", 20);

  if (fotosAnexo.length > 0) {
    y = ensureSpace(doc, y, 9);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(
      `Las fotografías del ${parte.toLowerCase()} se adjuntan en el anexo al final del documento.`,
      MARGIN + 1.5,
      y + 4
    );
    drawAnexoFotografico(doc, fotosAnexo, imagenesAnexo, parte === "ENGANCHE" ? "Enganche" : "Desenganche");
  }

  drawFooters(doc);
  return doc;
}

function filtrarFotosAnexo(items: FotoAnexoItem[], tipo: "ENGANCHE" | "DESENGANCHE"): FotoAnexoItem[] {
  return items.filter((item) => item.eventoTipo === tipo);
}

function drawFooters(doc: JsPDFType): void {
  const totalPages = doc.getNumberOfPages();
  const generatedLabel = `Generado el ${formatFechaHora(new Date())} — Grupo Bacar / Grúas Bacar`;
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`${generatedLabel} — Pág. ${page}/${totalPages}`, PAGE_W / 2, doc.internal.pageSize.getHeight() - 5, {
      align: "center",
    });
  }
}

export async function exportActaPdfSupervisor(options: ExportActaPdfOptions): Promise<Blob | void> {
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
    returnBlob = false,
  } = options;

  reportProgress(onProgress, 5, "Preparando exportación…");

  const eventosVista = eventosParaVistaActa(eventos, servicio);
  const eventoEnganche = eventosVista.find((evento) => evento.tipo === "ENGANCHE");
  const eventoDesenganche = eventosVista.find((evento) => evento.tipo === "DESENGANCHE");
  const fotosAnexo = incluirFotos ? recolectarFotosAnexo(eventosVista) : [];

  reportProgress(onProgress, 12, "Cargando recursos del documento…");
  const [JsPDF, logo] = await Promise.all([crearPdf(), cargarLogoBacar(LOGO_MAX_W, LOGO_MAX_H)]);

  let imagenesAnexo = new Map<string, ImagenPdf>();
  if (fotosAnexo.length > 0) {
    reportProgress(onProgress, 20, `Descargando fotografías (0/${fotosAnexo.length})…`);
    imagenesAnexo = await cargarImagenesAnexo(fotosAnexo, previewUrls ?? {}, (done, total) => {
      const photoProgress = 20 + (done / Math.max(total, 1)) * 50;
      reportProgress(onProgress, photoProgress, `Descargando fotografías (${done}/${total})…`);
    });
  } else {
    reportProgress(onProgress, 45, "Sin fotografías para anexo…");
  }

  const ctx: SupervisorPdfContext = {
    servicio,
    patenteGrua,
    tipoFlota,
    corralonNombre,
    duracion,
    legajos,
    eventoDesenganche,
  };

  reportProgress(onProgress, 72, "Generando PDF de enganche…");
  const docEnganche = buildPdfSupervisor(
    JsPDF,
    logo,
    ctx,
    "ENGANCHE",
    eventoEnganche ? [eventoEnganche] : [],
    filtrarFotosAnexo(fotosAnexo, "ENGANCHE"),
    imagenesAnexo
  );

  reportProgress(onProgress, 84, "Generando PDF de desenganche…");
  const docDesenganche = buildPdfSupervisor(
    JsPDF,
    logo,
    ctx,
    "DESENGANCHE",
    eventoDesenganche ? [eventoDesenganche] : [],
    filtrarFotosAnexo(fotosAnexo, "DESENGANCHE"),
    imagenesAnexo
  );

  reportProgress(onProgress, 96, "Guardando archivos PDF…");

  const blobEnganche = docEnganche.output("blob");
  const blobDesenganche = docDesenganche.output("blob");

  if (returnBlob) {
    reportProgress(onProgress, 100, "PDFs listos");
    return blobEnganche;
  }

  await descargarPdfsSecuencial([
    { blob: blobEnganche, filename: nombreArchivoPdfSupervisor(servicio, "enganche") },
    { blob: blobDesenganche, filename: nombreArchivoPdfSupervisor(servicio, "desenganche") },
  ]);
  reportProgress(onProgress, 100, "PDFs listos");
}
