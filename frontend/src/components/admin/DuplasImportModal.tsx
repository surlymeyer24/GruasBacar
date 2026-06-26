import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  FileSpreadsheet,
  Plus,
  Trash2,
  Upload,
  Users,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { writeBatch, doc } from "firebase/firestore";
import {
  TipoFlota,
  TIPO_FLOTA_OPTIONS,
  Usuario,
  normalizeRoles,
  enganchadorDeDupla,
  matchesTipoFlotaFilter,
} from "@gruasbacar/shared";
import { isMock, db } from "../../firebase";
import { DuplaDoc, GruaDoc } from "../../services/adminCatalog.cache";
import { CustomSelect } from "../shared/CustomSelect";
import {
  ParsedDuplaRow,
  generateDuplaId,
  gruaIdFromExcelText,
  nextDuplaNumericSeed,
  parseDuplasExcelFile,
} from "../../utils/parseDuplasExcel";

const SIN_GRUA = "";

export interface DuplaImportRow {
  key: string;
  chofer: string;
  enganchador: string;
  tipo: TipoFlota;
  gruaId: string;
  included: boolean;
  gruaRaw?: string;
  warnings: string[];
  errors: string[];
}

interface DuplasImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  duplas: DuplaDoc[];
  gruas: GruaDoc[];
  usuarios: Usuario[];
  onDuplasChange: (next: DuplaDoc[]) => void;
}

function newRowKey(): string {
  return `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyImportRow(): Omit<DuplaImportRow, "warnings" | "errors"> {
  return {
    key: newRowKey(),
    chofer: "",
    enganchador: "",
    tipo: "TRANSITO",
    gruaId: SIN_GRUA,
    included: true,
  };
}

function resolveGruaDoc(gruas: GruaDoc[], gruaId?: string): GruaDoc | undefined {
  if (!gruaId?.trim()) return undefined;
  return gruas.find((g) => g.docId === gruaId || g.id === gruaId);
}

function gruasParaTipo(gruas: GruaDoc[], tipo: TipoFlota): GruaDoc[] {
  return gruas
    .filter((g) => g.activa && matchesTipoFlotaFilter(g.tipo, tipo))
    .sort((a, b) => a.patente.localeCompare(b.patente, "es"));
}

function gruaLabel(g: GruaDoc): string {
  const desc = g.descripcion?.trim();
  return desc ? `${g.patente} — ${desc}` : g.patente;
}

function parsedToImportRow(
  row: ParsedDuplaRow,
  gruas: GruaDoc[]
): Omit<DuplaImportRow, "warnings" | "errors"> {
  let gruaId = SIN_GRUA;
  if (row.gruaRaw) {
    const candidate = gruaIdFromExcelText(row.gruaRaw);
    const match = gruas.find((g) => g.docId === candidate || g.id === candidate);
    if (match) gruaId = match.docId;
  }

  return {
    key: newRowKey(),
    chofer: row.chofer,
    enganchador: row.enganchador,
    tipo: row.tipo,
    gruaId,
    included: true,
    ...(row.gruaRaw && gruaId === SIN_GRUA ? { gruaRaw: row.gruaRaw } : {}),
  };
}

function annotateRows(
  rows: Omit<DuplaImportRow, "warnings" | "errors">[],
  duplas: DuplaDoc[],
  gruas: GruaDoc[],
  usuarios: Usuario[]
): DuplaImportRow[] {
  const choferNames = new Set(
    usuarios
      .filter((u) => normalizeRoles(u.roles, u.rol).includes("CHOFER") && u.activo !== false)
      .map((u) => u.nombre.trim().toLowerCase())
  );
  const enganchadorNames = new Set(
    usuarios
      .filter((u) => normalizeRoles(u.roles, u.rol).includes("ENGANCHADOR") && u.activo !== false)
      .map((u) => u.nombre.trim().toLowerCase())
  );

  const existingPairs = new Set(
    duplas.map(
      (d) =>
        `${d.chofer.trim().toLowerCase()}|${enganchadorDeDupla(d).trim().toLowerCase()}`
    )
  );

  const pairCounts = new Map<string, number>();
  for (const row of rows) {
    if (!row.included) continue;
    const key = `${row.chofer.trim().toLowerCase()}|${row.enganchador.trim().toLowerCase()}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (row.included) {
      if (!row.chofer.trim() || !row.enganchador.trim()) {
        errors.push("Completá chofer y enganchador.");
      }

      const pairKey = `${row.chofer.trim().toLowerCase()}|${row.enganchador.trim().toLowerCase()}`;
      if (row.chofer.trim() && row.enganchador.trim() && (pairCounts.get(pairKey) ?? 0) > 1) {
        errors.push("Dupla duplicada en esta importación.");
      }

      if (!choferNames.has(row.chofer.trim().toLowerCase())) {
        warnings.push("Chofer no está en el catálogo de usuarios.");
      }
      if (!enganchadorNames.has(row.enganchador.trim().toLowerCase())) {
        warnings.push("Enganchador no está en el catálogo de usuarios.");
      }
      if (existingPairs.has(pairKey)) {
        warnings.push("Esta dupla ya existe en el catálogo.");
      }
    }

    if (row.gruaId && row.gruaId !== SIN_GRUA && !resolveGruaDoc(gruas, row.gruaId)) {
      warnings.push("La grúa seleccionada no existe en el catálogo.");
    }
    if (row.gruaRaw && row.gruaId === SIN_GRUA) {
      warnings.push(`Grúa "${row.gruaRaw}" no encontrada en el catálogo.`);
    }

    return { ...row, warnings, errors };
  });
}

export const DuplasImportModal: React.FC<DuplasImportModalProps> = ({
  isOpen,
  onClose,
  duplas,
  gruas,
  usuarios,
  onDuplasChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Omit<DuplaImportRow, "warnings" | "errors">[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const choferes = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("CHOFER") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  const enganchadores = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("ENGANCHADOR") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  const validatedRows = useMemo(
    () => annotateRows(rows, duplas, gruas, usuarios),
    [rows, duplas, gruas, usuarios]
  );

  const includedRows = validatedRows.filter((r) => r.included);
  const canImport =
    includedRows.length > 0 && includedRows.every((r) => r.errors.length === 0) && !importing;

  const resetState = useCallback(() => {
    setRows([]);
    setFileName(null);
    setParseError(null);
    setImportError(null);
    setParsing(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setImportError(null);
    setParsing(true);
    setFileName(file.name);

    try {
      const parsed = await parseDuplasExcelFile(file);
      setRows(parsed.map((row) => parsedToImportRow(row, gruas)));
    } catch (err) {
      console.error(err);
      setRows([]);
      setParseError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (key: string, patch: Partial<Omit<DuplaImportRow, "warnings" | "errors">>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyImportRow()]);
  };

  const gruaOptionsForTipo = (tipo: TipoFlota) => [
    { value: SIN_GRUA, label: "Sin grúa" },
    ...gruasParaTipo(gruas, tipo).map((g) => ({
      value: g.docId,
      label: gruaLabel(g),
    })),
  ];

  const persistLocal = (next: DuplaDoc[]) => {
    localStorage.setItem(
      "duplas_bacar_asset_catalog",
      JSON.stringify(next.map(({ docId, ...rest }) => ({ ...rest, id: docId })))
    );
  };

  const handleImport = async () => {
    const toImport = validatedRows.filter((r) => r.included && r.errors.length === 0);
    if (toImport.length === 0) return;

    setImportError(null);
    setImporting(true);

    const usedIds = new Set(duplas.map((d) => d.docId));
    const counter = { value: nextDuplaNumericSeed(duplas) };
    const newDuplas: DuplaDoc[] = [];

    try {
      for (const row of toImport) {
        const id = generateDuplaId(row.chofer, row.enganchador, usedIds, counter);
        usedIds.add(id);
        const gruaId = row.gruaId.trim() || undefined;
        newDuplas.push({
          id,
          docId: id,
          chofer: row.chofer.trim(),
          enganchador: row.enganchador.trim(),
          activa: true,
          tipo: row.tipo,
          gruaId,
        });
      }

      if (!isMock && db) {
        const batch = writeBatch(db);
        for (const d of newDuplas) {
          batch.set(doc(db, "duplas", d.docId), {
            id: d.id,
            chofer: d.chofer,
            enganchador: d.enganchador,
            activa: true,
            tipo: d.tipo,
            ...(d.gruaId ? { gruaId: d.gruaId } : {}),
          });
        }
        await batch.commit();
      }

      const next = [...duplas, ...newDuplas].sort((a, b) => a.chofer.localeCompare(b.chofer, "es"));
      onDuplasChange(next);
      if (isMock) persistLocal(next);
      handleClose();
    } catch (err) {
      console.error(err);
      setImportError("No se pudieron importar las duplas. Intentá de nuevo.");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} aria-hidden />

      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-xl border border-brand-seashell z-10 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-brand-seashell flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-mono font-bold text-brand-cta uppercase tracking-wider">
              Importación masiva
            </p>
            <h3 className="text-base font-bold text-brand-purply mt-1 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-brand-cta" />
              Importar duplas desde Excel
            </h3>
            <p className="text-xs text-brand-pale mt-1 max-w-2xl">
              Se lee solo la <span className="font-semibold">columna A</span> (se ignora la fila 1).
              Cada celda debe tener el formato{" "}
              <span className="font-semibold font-mono">APELLIDO-APELLIDO</span> (ej.{" "}
              <span className="font-mono">PRANDI-LESCANO</span>). En la previsualización podés
              asignar el tipo (Tránsito / Transporte) y la grúa.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-brand-pale hover:bg-brand-bg cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-brand-seashell bg-brand-bg/50 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-white border border-brand-seashell hover:border-brand-cta text-brand-purply disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-brand-cta" />
              {parsing ? "Leyendo archivo..." : "Seleccionar Excel"}
            </button>
            {fileName && (
              <span className="text-xs text-brand-pale font-mono truncate max-w-xs">{fileName}</span>
            )}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-brand-cta hover:bg-brand-cta/10 cursor-pointer ml-auto"
            >
              <Plus className="w-4 h-4" />
              Agregar fila
            </button>
          </div>

          {(parseError || importError) && (
            <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-semibold">{parseError ?? importError}</span>
            </div>
          )}
        </div>

        <div className="overflow-auto flex-grow">
          {validatedRows.length === 0 ? (
            <p className="p-10 text-sm text-brand-pale text-center">
              Seleccioná un archivo Excel para ver la previsualización de las duplas a importar.
            </p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-bg sticky top-0 z-10">
                <tr className="text-[10px] uppercase tracking-wider text-brand-pale font-bold">
                  <th className="px-3 py-3 w-10">Inc.</th>
                  <th className="px-3 py-3 min-w-[140px]">Chofer</th>
                  <th className="px-3 py-3 min-w-[140px]">Enganchador</th>
                  <th className="px-3 py-3 min-w-[120px]">Tipo</th>
                  <th className="px-3 py-3 min-w-[140px]">Grúa</th>
                  <th className="px-3 py-3 min-w-[160px]">Estado</th>
                  <th className="px-3 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {validatedRows.map((row) => (
                  <tr
                    key={row.key}
                    className={`hover:bg-slate-50/60 ${!row.included ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-3 align-top">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(e) => updateRow(row.key, { included: e.target.checked })}
                        className="rounded border-brand-seashell"
                        aria-label="Incluir fila"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CustomSelect
                        value={row.chofer}
                        onChange={(v) => updateRow(row.key, { chofer: v })}
                        options={[
                          ...(row.chofer &&
                          !choferes.some((c) => c.nombre === row.chofer)
                            ? [{ value: row.chofer, label: `${row.chofer} (Excel)` }]
                            : []),
                          ...choferes.map((c) => ({ value: c.nombre, label: c.nombre })),
                        ]}
                        placeholder="Chofer"
                        icon={Users}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CustomSelect
                        value={row.enganchador}
                        onChange={(v) => updateRow(row.key, { enganchador: v })}
                        options={[
                          ...(row.enganchador &&
                          !enganchadores.some((e) => e.nombre === row.enganchador)
                            ? [{ value: row.enganchador, label: `${row.enganchador} (Excel)` }]
                            : []),
                          ...enganchadores.map((e) => ({ value: e.nombre, label: e.nombre })),
                        ]}
                        placeholder="Enganchador"
                        icon={Users}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CustomSelect
                        value={row.tipo}
                        onChange={(v) =>
                          updateRow(row.key, { tipo: v as TipoFlota, gruaId: SIN_GRUA })
                        }
                        options={TIPO_FLOTA_OPTIONS}
                        icon={Tag}
                        size="sm"
                        ariaLabel="Tipo de flota"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <CustomSelect
                        value={row.gruaId}
                        onChange={(v) => updateRow(row.key, { gruaId: v, gruaRaw: undefined })}
                        options={gruaOptionsForTipo(row.tipo)}
                        placeholder="Sin grúa"
                        icon={Truck}
                        size="sm"
                        ariaLabel="Grúa"
                      />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="space-y-1">
                        {row.errors.map((msg) => (
                          <p key={`e-${msg}`} className="text-[10px] font-semibold text-red-600">
                            {msg}
                          </p>
                        ))}
                        {row.warnings.map((msg) => (
                          <p key={`w-${msg}`} className="text-[10px] font-semibold text-amber-700">
                            {msg}
                          </p>
                        ))}
                        {row.errors.length === 0 && row.warnings.length === 0 && row.included && (
                          <p className="text-[10px] font-semibold text-emerald-700">Lista para importar</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        className="p-1.5 rounded-lg border border-brand-seashell hover:border-rose-500 text-brand-pale hover:text-rose-500 cursor-pointer"
                        title="Quitar fila"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-4 bg-brand-bg border-t border-brand-seashell flex items-center justify-between gap-3 shrink-0">
          <p className="text-xs text-brand-pale">
            {includedRows.length} dupla{includedRows.length === 1 ? "" : "s"} seleccionada
            {includedRows.length === 1 ? "" : "s"}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-bold border border-brand-seashell rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={!canImport}
              className="px-4 py-2 text-xs font-bold bg-brand-cta hover:bg-brand-cta/90 text-white rounded-xl disabled:opacity-40 cursor-pointer"
            >
              {importing ? "Importando..." : `Importar ${includedRows.length || ""} dupla${includedRows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplasImportModal;
