import * as XLSX from "xlsx";
import { normalizeGruaId, normalizeTipoFlota, TipoFlota } from "@gruasbacar/shared";

export interface ParsedDuplaRow {
  chofer: string;
  enganchador: string;
  tipo: TipoFlota;
  gruaRaw: string;
}

type ColumnKey = "chofer" | "enganchador" | "tipo" | "grua";

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const HEADER_ALIASES: Record<string, ColumnKey> = {
  chofer: "chofer",
  conductor: "chofer",
  enganchador: "enganchador",
  ayudante: "enganchador",
  tipo: "tipo",
  "tipo flota": "tipo",
  "tipo de flota": "tipo",
  flota: "tipo",
  grua: "grua",
  "grua asignada": "grua",
  patente: "grua",
  "grua patente": "grua",
};

function parseTipoCell(value: unknown): TipoFlota {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!raw) return "TRANSITO";
  if (raw.includes("transport")) return "TRANSPORTE";
  return normalizeTipoFlota(raw.toUpperCase());
}

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function detectColumnMap(headerRow: unknown[]): Partial<Record<ColumnKey, number>> {
  const map: Partial<Record<ColumnKey, number>> = {};
  headerRow.forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cell)];
    if (key && map[key] === undefined) {
      map[key] = index;
    }
  });
  return map;
}

function looksLikeHeaderRow(row: unknown[]): boolean {
  return row.some((cell) => {
    const normalized = normalizeHeader(cell);
    return normalized in HEADER_ALIASES;
  });
}

function rowFromArray(
  cells: unknown[],
  columnMap: Partial<Record<ColumnKey, number>>,
  positional: boolean
): ParsedDuplaRow | null {
  const chofer = positional
    ? cellText(cells[0])
    : cellText(cells[columnMap.chofer ?? -1]);
  const enganchador = positional
    ? cellText(cells[1])
    : cellText(cells[columnMap.enganchador ?? -1]);

  if (!chofer && !enganchador) return null;
  if (!chofer || !enganchador) return null;

  const tipo = positional
    ? parseTipoCell(cells[2])
    : parseTipoCell(cells[columnMap.tipo ?? -1]);
  const gruaRaw = positional
    ? cellText(cells[3])
    : cellText(cells[columnMap.grua ?? -1]);

  return { chofer, enganchador, tipo, gruaRaw };
}

/** Formato columna A: `APELLIDO-APELLIDO` (ej. PRANDI-LESCANO). */
function parseDuplaPairCell(value: string): { chofer: string; enganchador: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dashIndex = trimmed.indexOf("-");
  if (dashIndex <= 0) return null;

  const chofer = trimmed.slice(0, dashIndex).trim();
  const enganchador = trimmed.slice(dashIndex + 1).trim();
  if (!chofer || !enganchador) return null;

  return { chofer, enganchador };
}

/** Lee solo columna A, salta la fila 1 (encabezado) y parsea pares APELLIDO-APELLIDO. */
function parseColumnADuplas(rows: unknown[][]): ParsedDuplaRow[] {
  const parsed: ParsedDuplaRow[] = [];

  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const pair = parseDuplaPairCell(cellText(row[0]));
    if (!pair) continue;

    parsed.push({
      chofer: pair.chofer,
      enganchador: pair.enganchador,
      tipo: "TRANSITO",
      gruaRaw: "",
    });
  }

  return parsed;
}

function parseMultiColumnDuplas(rows: unknown[][]): ParsedDuplaRow[] {
  const firstRow = rows[0] ?? [];
  const hasHeader = looksLikeHeaderRow(firstRow);
  const columnMap = hasHeader ? detectColumnMap(firstRow) : {};
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const parsed: ParsedDuplaRow[] = [];
  for (const row of dataRows) {
    if (!Array.isArray(row)) continue;
    const item = rowFromArray(row, columnMap, !hasHeader);
    if (item) parsed.push(item);
  }

  return parsed;
}

export async function parseDuplasExcelFile(file: File): Promise<ParsedDuplaRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo no contiene hojas de cálculo.");
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  }) as unknown[][];

  if (rows.length === 0) {
    throw new Error("La hoja está vacía.");
  }

  const parsed = parseColumnADuplas(rows);
  const finalRows = parsed.length > 0 ? parsed : parseMultiColumnDuplas(rows);

  if (finalRows.length === 0) {
    throw new Error(
      "No se encontraron duplas en la columna A. Usá el formato APELLIDO-APELLIDO (ej. PRANDI-LESCANO) desde la fila 2."
    );
  }

  return finalRows;
}

/** Resuelve patente o id de grúa desde texto del Excel. */
export function gruaIdFromExcelText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return normalizeGruaId(trimmed);
}

export function getDuplaPrefix(name: string): string {
  if (!name) return "";
  const words = name.trim().split(" ");
  const surname = words.length > 1 ? words[words.length - 1] : words[0];
  return surname.substring(0, 2).toUpperCase();
}

export function nextDuplaNumericSeed(existingDuplas: { id?: string; docId?: string }[]): number {
  let max = 0;
  for (const d of existingDuplas) {
    const code = d.id ?? d.docId ?? "";
    const match = /^D(\d+)/i.exec(code);
    if (match) {
      max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return max + 1;
}

export function generateDuplaId(
  chofer: string,
  enganchador: string,
  usedIds: Set<string>,
  counter: { value: number }
): string {
  for (let attempt = 0; attempt < 500; attempt++) {
    const nextNum = counter.value.toString().padStart(3, "0");
    const id = `D${nextNum}-${getDuplaPrefix(chofer)}${getDuplaPrefix(enganchador)}`;
    counter.value += 1;
    if (!usedIds.has(id)) return id;
  }
  throw new Error("No se pudo generar un código único para la dupla.");
}
