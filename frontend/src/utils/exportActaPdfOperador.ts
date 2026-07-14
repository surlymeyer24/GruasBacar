import type { jsPDF as JsPDFType } from "jspdf";
import {
  Servicio,
  Evento,
  Foto,
  enganchadorDeDuplaServicio,
  esGeoValida,
  eventosParaVistaActa,
  displayPatente,
} from "@gruasbacar/shared";
import { formatFechaHora, fechaServicio } from "./formatters";
import { formatearCoordenadas, urlGoogleMaps } from "./googleMapsUrl";
import { etiquetaFotoLegible, urlFotoDrive } from "./driveUrl";
import {
  type ExportActaPdfOptions,
  type ImagenPdf,
  type LogoAsset,
  cargarImagenParaPdf,
  cargarImagenesFotos,
  cargarLogoBacar,
  crearPdf,
  fitAspectInBox,
  fotoKey,
  nombreArchivoPdf,
  recolectarFotosEventos,
  reportProgress,
} from "./exportActaPdfShared";

const PAGE_W = 210;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 10;
const GRAY_400: [number, number, number] = [156, 163, 175];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_900: [number, number, number] = [17, 24, 39];
const BG_BOX: [number, number, number] = [250, 250, 252];
const BORDER: [number, number, number] = [229, 231, 235];

const LOGO_MAX_W = 44;
const LOGO_MAX_H = 14;
const FOTO_COL_GAP = 4;
const FOTO_BOX_W = (CONTENT_W - FOTO_COL_GAP) / 2;
const FOTO_IMG_H = 42;
const FOTO_LABEL_H = 5;
const MAP_PREVIEW_H = 32;

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

function urlMapaEstatico(lat: number, lng: number): string {
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x150&markers=${lat},${lng}`;
}

function drawOperadorHeader(doc: JsPDFType, logo: LogoAsset | null, servicio: Servicio): number {
  let y = MARGIN;

  if (logo) {
    doc.addImage(logo.dataUrl, "PNG", MARGIN, y, logo.width, logo.height);
    y += logo.height + 4;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY_400);
  doc.text("ACTA DE SERVICIO", MARGIN, y);
  y += 6;

  doc.setFontSize(20);
  doc.setTextColor(...GRAY_900);
  doc.text(displayPatente(servicio.patente), MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY_600);
  doc.text(`Creada el ${formatFechaHora(fechaServicio(servicio))}`, MARGIN, y);
  y += 6;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 6;
}

function drawDatosGenerales(
  doc: JsPDFType,
  y: number,
  patenteGrua: string,
  corralonNombre: string | undefined,
  servicio: Servicio
): number {
  const chofer = servicio.dupla?.chofer || "—";
  const enganchador = enganchadorDeDuplaServicio(servicio.dupla) || "—";
  const duplaTexto = `Chofer: ${chofer}  •  Enganchador: ${enganchador}`;
  const duplaLines = doc.splitTextToSize(duplaTexto, CONTENT_W - 10);
  const boxH = 26 + Math.max(0, duplaLines.length - 1) * 4;

  y = ensureSpace(doc, y, boxH + 2);

  doc.setFillColor(...BG_BOX);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 2, 2, "FD");

  const colW = CONTENT_W / 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_400);
  doc.text("Grúa", MARGIN + 5, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_900);
  doc.text(patenteGrua.toUpperCase(), MARGIN + 5, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_400);
  doc.text("Corralón", MARGIN + colW + 5, y + 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...GRAY_900);
  doc.text(corralonNombre || "—", MARGIN + colW + 5, y + 12);

  doc.setDrawColor(...BORDER);
  doc.line(MARGIN + 5, y + 16, PAGE_W - MARGIN - 5, y + 16);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_400);
  doc.text("Dupla", MARGIN + 5, y + 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(31, 41, 55);
  doc.text(duplaLines, MARGIN + 5, y + 26);

  return y + boxH + 8;
}

function drawSectionTitle(
  doc: JsPDFType,
  y: number,
  title: string,
  timestamp?: unknown
): number {
  y = ensureSpace(doc, y, 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...GRAY_900);
  doc.text(title, MARGIN, y + 4);

  if (timestamp) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_400);
    doc.text(formatFechaHora(timestamp), PAGE_W - MARGIN, y + 4, { align: "right" });
  }

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, y + 7, PAGE_W - MARGIN, y + 7);
  return y + 11;
}

function drawSubLabel(doc: JsPDFType, y: number, label: string): number {
  y = ensureSpace(doc, y, 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY_400);
  doc.text(label.toUpperCase(), MARGIN, y + 3);
  return y + 5;
}

async function drawMapaPreview(
  doc: JsPDFType,
  y: number,
  lat: number,
  lng: number
): Promise<number> {
  y = ensureSpace(doc, y, MAP_PREVIEW_H + 8);
  const mapa = await cargarImagenParaPdf(urlMapaEstatico(lat, lng));

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, MAP_PREVIEW_H, 1.5, 1.5);

  if (mapa) {
    const fitted = fitAspectInBox(mapa.aspect, CONTENT_W - 2, MAP_PREVIEW_H - 2);
    const imgX = MARGIN + 1 + (CONTENT_W - 2 - fitted.w) / 2;
    const imgY = y + 1 + (MAP_PREVIEW_H - 2 - fitted.h) / 2;
    if (mapa.dataUrl) {
      doc.addImage(mapa.dataUrl, mapa.format, imgX, imgY, fitted.w, fitted.h);
    } else if (mapa.element) {
      doc.addImage(mapa.element, mapa.format, imgX, imgY, fitted.w, fitted.h);
    }
  }

  y += MAP_PREVIEW_H + 3;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRAY_600);
  doc.text("Coordenadas GPS:", MARGIN, y);
  const coords = formatearCoordenadas(lat, lng);
  doc.setTextColor(37, 99, 235);
  doc.textWithLink(coords, MARGIN + 28, y, { url: urlGoogleMaps(lat, lng) });
  return y + 5;
}

async function drawLugarEvento(doc: JsPDFType, y: number, evento: Evento): Promise<number> {
  const tieneGeo = evento.geo && esGeoValida(evento.geo);
  const referencia = evento.ubicacionReferencia?.trim();

  if (!tieneGeo && !referencia) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_400);
    doc.text("Sin ubicación registrada.", MARGIN, y + 3);
    return y + 6;
  }

  if (tieneGeo) {
    y = await drawMapaPreview(doc, y, evento.geo!.lat, evento.geo!.lng);
  }

  if (referencia) {
    y = ensureSpace(doc, y, 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_600);
    const refLines = doc.splitTextToSize(referencia, CONTENT_W - 4);
    if (/^https?:\/\//i.test(referencia)) {
      doc.setTextColor(37, 99, 235);
      doc.textWithLink(refLines[0], MARGIN, y + 3, { url: referencia });
    } else {
      doc.text(refLines, MARGIN, y + 3);
    }
    y += refLines.length * 4 + 2;
  }

  return y;
}

function drawObservacionOperador(doc: JsPDFType, y: number, observacion: string): number {
  const texto = observacion.trim();
  if (!texto) return y;

  const body = `"${texto}"`;
  const lines = doc.splitTextToSize(body, CONTENT_W - 12);
  const boxH = 10 + lines.length * 4;

  y = ensureSpace(doc, y, boxH + 2);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 1.5, 1.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(100, 80, 120);
  doc.text("OBSERVACIÓN DEL OPERADOR", MARGIN + 4, y + 5);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_600);
  doc.text(lines, MARGIN + 4, y + 10);
  return y + boxH + 4;
}

function alturaFotoCelda(foto: Foto): number {
  let extra = 0;
  if (foto.observacion?.trim()) extra += 4;
  if (foto.comentarios?.length) extra += foto.comentarios.length * 3.5;
  return FOTO_LABEL_H + FOTO_IMG_H + 4 + extra;
}

function drawFotoCelda(
  doc: JsPDFType,
  foto: Foto,
  x: number,
  y: number,
  imagen: ImagenPdf | undefined
): void {
  const cellH = alturaFotoCelda(foto);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.15);
  doc.roundedRect(x, y, FOTO_BOX_W, cellH, 1, 1);

  const imgY = y + 2;
  doc.setDrawColor(230, 230, 230);
  doc.roundedRect(x + 1.5, imgY, FOTO_BOX_W - 3, FOTO_IMG_H, 0.5, 0.5);

  if (imagen) {
    const fitted = fitAspectInBox(imagen.aspect, FOTO_BOX_W - 5, FOTO_IMG_H - 2);
    const imgX = x + 1.5 + (FOTO_BOX_W - 3 - fitted.w) / 2;
    const drawY = imgY + (FOTO_IMG_H - fitted.h) / 2;
    if (imagen.dataUrl) {
      doc.addImage(imagen.dataUrl, imagen.format, imgX, drawY, fitted.w, fitted.h);
    } else if (imagen.element) {
      doc.addImage(imagen.element, imagen.format, imgX, drawY, fitted.w, fitted.h);
    }
    const driveUrl = urlFotoDrive(foto);
    if (driveUrl && driveUrl !== "#") {
      doc.link(imgX, drawY, fitted.w, fitted.h, { url: driveUrl });
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY_400);
    doc.text("Imagen no disponible", x + FOTO_BOX_W / 2, imgY + FOTO_IMG_H / 2, {
      align: "center",
    });
    const driveUrl = urlFotoDrive(foto);
    if (driveUrl && driveUrl !== "#") {
      doc.setTextColor(37, 99, 235);
      doc.textWithLink("Ver en Drive", x + FOTO_BOX_W / 2, imgY + FOTO_IMG_H / 2 + 4, {
        align: "center",
        url: driveUrl,
      });
    }
  }

  let captionY = imgY + FOTO_IMG_H + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...GRAY_600);
  doc.text(etiquetaFotoLegible(foto.etiqueta).toUpperCase(), x + FOTO_BOX_W / 2, captionY, {
    align: "center",
  });
  captionY += 3.5;

  if (foto.observacion?.trim()) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(5.5);
    doc.setTextColor(...GRAY_600);
    const obs = doc.splitTextToSize(foto.observacion.trim(), FOTO_BOX_W - 4);
    doc.text(obs.slice(0, 2), x + 2, captionY);
    captionY += obs.length * 3;
  }

  if (foto.comentarios?.length) {
    for (const c of foto.comentarios) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(5.5);
      doc.setTextColor(80, 80, 120);
      const linea = doc.splitTextToSize(`${c.autorNombre}: ${c.texto.trim()}`, FOTO_BOX_W - 4);
      doc.text(linea.slice(0, 2), x + 2, captionY);
      captionY += linea.length * 3;
    }
  }
}

function drawFotosEvento(
  doc: JsPDFType,
  y: number,
  fotos: Foto[],
  imagenes: Map<string, ImagenPdf>
): number {
  if (fotos.length === 0) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_400);
    doc.text("Sin fotos registradas.", MARGIN, y + 3);
    return y + 6;
  }

  for (let i = 0; i < fotos.length; i += 2) {
    const left = fotos[i];
    const right = fotos[i + 1];
    const rowH = Math.max(alturaFotoCelda(left), right ? alturaFotoCelda(right) : 0);

    y = ensureSpace(doc, y, rowH + 3);
    drawFotoCelda(doc, left, MARGIN, y, imagenes.get(fotoKey(left)));

    if (right) {
      drawFotoCelda(doc, right, MARGIN + FOTO_BOX_W + FOTO_COL_GAP, y, imagenes.get(fotoKey(right)));
    }

    y += rowH + 3;
  }

  return y;
}

async function drawSeccionEvento(
  doc: JsPDFType,
  y: number,
  titulo: string,
  evento: Evento | undefined,
  opts: {
    corralonNombre?: string;
    incluirFotos: boolean;
    imagenes: Map<string, ImagenPdf>;
    sinEventoMensaje: string;
    lugarLabel: string;
    fotosLabel: string;
  }
): Promise<number> {
  y = drawSectionTitle(doc, y, titulo, evento?.timestamp);

  if (!evento) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_400);
    doc.text(opts.sinEventoMensaje, MARGIN, y + 3);
    return y + 10;
  }

  if (evento.tipo === "DESENGANCHE" && (opts.corralonNombre || evento.corralon?.trim())) {
    y = ensureSpace(doc, y, 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_600);
    doc.text(
      `Corralón: ${opts.corralonNombre ?? evento.corralon?.trim() ?? "—"}`,
      MARGIN,
      y + 3
    );
    y += 7;
  }

  y = drawSubLabel(doc, y, opts.lugarLabel);
  y = await drawLugarEvento(doc, y, evento);

  if (evento.observacionGeneral?.trim()) {
    y = drawObservacionOperador(doc, y, evento.observacionGeneral);
  }

  if (opts.incluirFotos) {
    y = drawSubLabel(doc, y, opts.fotosLabel);
    y = drawFotosEvento(doc, y, evento.fotos ?? [], opts.imagenes);
  }

  return y + 6;
}

function drawFooters(doc: JsPDFType): void {
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY_400);
    doc.text(
      `Generado el ${formatFechaHora(new Date())} — Grúas Bacar — Pág. ${p}/${totalPages}`,
      PAGE_W / 2,
      doc.internal.pageSize.getHeight() - 4,
      { align: "center" }
    );
  }
}

export async function exportActaPdfOperador(options: ExportActaPdfOptions): Promise<Blob | void> {
  const {
    servicio,
    eventos,
    patenteGrua,
    corralonNombre,
    previewUrls,
    incluirFotos = true,
    onProgress,
    returnBlob = false,
  } = options;

  reportProgress(onProgress, 5, "Preparando exportación…");

  const eventosVista = eventosParaVistaActa(eventos, servicio);
  const eventoEnganche = eventosVista.find((e) => e.tipo === "ENGANCHE");
  const eventoDesenganche = eventosVista.find((e) => e.tipo === "DESENGANCHE");

  const fotosItems = incluirFotos ? recolectarFotosEventos(eventosVista) : [];

  reportProgress(onProgress, 12, "Cargando recursos del documento…");
  const [JsPDF, logo] = await Promise.all([
    crearPdf(),
    cargarLogoBacar(LOGO_MAX_W, LOGO_MAX_H),
  ]);

  let imagenes = new Map<string, ImagenPdf>();
  if (fotosItems.length > 0) {
    reportProgress(onProgress, 20, `Descargando fotografías (0/${fotosItems.length})…`);
    imagenes = await cargarImagenesFotos(fotosItems, previewUrls ?? {}, (done, total) => {
      const fotoPercent = 20 + (done / Math.max(total, 1)) * 55;
      reportProgress(onProgress, fotoPercent, `Descargando fotografías (${done}/${total})…`);
    });
  } else {
    reportProgress(onProgress, 40, "Sin fotografías…");
  }

  reportProgress(onProgress, 78, "Generando acta…");

  const doc = new JsPDF({ unit: "mm", format: "a4" });
  let y = drawOperadorHeader(doc, logo, servicio);
  y = drawDatosGenerales(doc, y, patenteGrua, corralonNombre, servicio);

  y = await drawSeccionEvento(doc, y, "Enganche", eventoEnganche, {
    incluirFotos,
    imagenes,
    sinEventoMensaje: "Sin datos de enganche registrados.",
    lugarLabel: "Lugar de enganche",
    fotosLabel: "Fotos del enganche",
  });

  y = await drawSeccionEvento(doc, y, "Desenganche", eventoDesenganche, {
    corralonNombre,
    incluirFotos,
    imagenes,
    sinEventoMensaje: "El vehículo todavía no fue entregado en el corralón.",
    lugarLabel: "Lugar de desenganche",
    fotosLabel: "Fotos del desenganche",
  });

  drawFooters(doc);

  reportProgress(onProgress, 96, "Guardando archivo PDF…");
  const filename = nombreArchivoPdf(servicio);

  if (returnBlob) {
    reportProgress(onProgress, 100, "PDF listo");
    return doc.output("blob");
  }

  doc.save(filename);
  reportProgress(onProgress, 100, "PDF listo");
}
