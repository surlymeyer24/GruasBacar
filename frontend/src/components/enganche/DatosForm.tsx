import React, { useState, useEffect } from "react";
import { gruaService } from "../../services/grua.service";
import { duplaService } from "../../services/dupla.service";
import { useAuth } from "../../context/AuthContext";
import { Grua, Dupla, enganchadorDeDupla } from "@gruasbacar/shared";
import { asignacionDiariaVigente } from "../../utils/asignacionDiaria";
import { FileText, ChevronRight, Hash, AlertCircle, Lock } from "lucide-react";
import { FlowBackButton } from "../shared/FlowBackButton";

export interface DatosFormFields {
  numeroInfraccion: string;
  patente: string;
  grua: string;
  gruaPatente: string;
  gruaDescripcion: string;
  dupla: string;
  duplaChofer: string;
  duplaEnganchador: string;
  inspector: string;
}

interface DatosFormProps {
  values: DatosFormFields;
  onChange: (values: DatosFormFields) => void;
  onSubmit: (values: DatosFormFields) => void;
  onBack?: () => void;
  backLabel?: string;
}

export const DatosForm: React.FC<DatosFormProps> = ({
  values,
  onChange,
  onSubmit,
  onBack,
  backLabel = "Volver al inicio",
}) => {
  const { userData } = useAuth();
  const catalogPrefilledRef = React.useRef(false);
  const valuesRef = React.useRef(values);
  valuesRef.current = values;

  const patchValues = (partial: Partial<DatosFormFields>) => {
    onChange({ ...valuesRef.current, ...partial });
  };
  
  // Lists loading
  const [gruas, setGruas] = useState<Grua[]>([]);
  const [duplas, setDuplas] = useState<Dupla[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Field validation touches
  const [patentError, setPatentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      setLoading(true);
      try {
        const [activeGruas, activeDuplas] = await Promise.all([
          gruaService.getGruasActivas(),
          duplaService.getDuplasActivas(),
        ]);
        if (cancelled) return;

        setGruas(activeGruas);
        setDuplas(activeDuplas);

        if (catalogPrefilledRef.current) return;

        const turno = asignacionDiariaVigente(userData?.asignacionDiaria);
        const updates: Partial<DatosFormFields> = {};

        if (turno) {
          const grua = activeGruas.find((g) => g.patente === turno.gruaPatente);
          const dupla = activeDuplas.find((d) => d.id === turno.duplaId);

          if (grua && !values.grua) {
            updates.grua = grua.id;
            updates.gruaPatente = grua.patente;
            updates.gruaDescripcion = grua.descripcion;
          }
          if (dupla && !values.dupla) {
            updates.dupla = dupla.id;
            updates.duplaChofer = dupla.chofer;
            updates.duplaEnganchador = enganchadorDeDupla(dupla);
          }
          if (!values.inspector.trim()) {
            updates.inspector = turno.inspector;
          }
        } else {
          let matchingDupla = activeDuplas.find((d) => {
            const userNameClean = (userData?.nombre || "").toLowerCase().replace(/\s+/g, "").trim();
            const choferNameClean = d.chofer.toLowerCase().replace(/\s+/g, "").trim();
            return userNameClean.includes(choferNameClean) || choferNameClean.includes(userNameClean);
          });

          if (!matchingDupla && activeDuplas.length > 0) {
            matchingDupla = activeDuplas[0];
          }

          if (matchingDupla && !values.dupla) {
            updates.dupla = matchingDupla.id;
            updates.duplaChofer = matchingDupla.chofer;
            updates.duplaEnganchador = enganchadorDeDupla(matchingDupla);
          }

          if (!values.grua && activeGruas.length > 0) {
            const grua = activeGruas[0];
            updates.grua = grua.id;
            updates.gruaPatente = grua.patente;
            updates.gruaDescripcion = grua.descripcion;
          } else if (values.grua) {
            const grua = activeGruas.find((g) => g.id === values.grua);
            if (grua) {
              updates.gruaPatente = grua.patente;
              updates.gruaDescripcion = grua.descripcion;
            }
          }
        }

        if (Object.keys(updates).length > 0) {
          onChange({ ...valuesRef.current, ...updates });
        }
        catalogPrefilledRef.current = true;
      } catch (err) {
        console.error("Error loading forms assets:", err);
        if (!cancelled) setError("Error al cargar los datos del catálogo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [userData]);

  const validatePatenteText = (p: string) => {
    const clean = p.replace(/[\s-]/g, "").toUpperCase();
    if (!clean) return "La patente es obligatoria";
    
    // Argentine old (ex: AAA333) and new Mercosur (ex: AA444BB) format checks
    const oldFormat = /^[A-Z]{3}\d{3}$/;
    const newFormat = /^[A-Z]{2}\d{3}[A-Z]{2}$/;
    
    if (!oldFormat.test(clean) && !newFormat.test(clean)) {
      return "Formato inválido (Ejemplos válidos: AAA123 o AA123BB)";
    }
    return null;
  };

  const handlePatenteChange = (val: string) => {
    const cleaned = val.toUpperCase();
    patchValues({ patente: cleaned });

    if (cleaned.length >= 6) {
      setPatentError(validatePatenteText(cleaned));
    } else {
      setPatentError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const infErr = !values.numeroInfraccion.trim() ? "Nro de infracción obligatorio" : null;
    const patErr = validatePatenteText(values.patente);
    const grErr = !values.grua ? "Falta asignar un móvil de grúa" : null;
    const duErr = !values.dupla ? "Falta asignar el enganchador del turno" : null;
    const insErr = !values.inspector.trim() ? "Falta indicar el inspector actuante" : null;
    const turnoErr = !asignacionDiariaVigente(userData?.asignacionDiaria)
      ? "Configurá tu turno del día antes de registrar un servicio"
      : null;

    setPatentError(patErr);

    if (infErr || patErr || grErr || duErr || insErr || turnoErr) {
      setError(patErr || infErr || grErr || duErr || insErr || turnoErr || "Por favor, complete todos los campos requeridos.");
      return;
    }

    setError(null);
    onSubmit({
      ...values,
      patente: values.patente.replace(/[\s-]/g, "").toUpperCase(),
      numeroInfraccion: values.numeroInfraccion.toUpperCase().trim(),
      inspector: values.inspector.trim(),
      duplaChofer: userData?.nombre?.trim() || values.duplaChofer,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-brand-cta border-t-transparent animate-spin" />
        <span className="text-xs text-brand-pale">Cargando grúas y personal habilitado...</span>
      </div>
    );
  }

  // Get active selected objects to display in grayed-out summaries
  const selectedDupla = duplas.find((d) => d.id === values.dupla);
  const selectedGrua = gruas.find((g) => g.id === values.grua);

  return (
    <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 space-y-6 w-full min-w-0 overflow-hidden">
      
      <div>
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-cta" />
          Datos Iniciales del Secuestro
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          Ingrese la patente del infractor y complete el acta municipal correspondiente. Los recursos operativos de su turno se vinculan automáticamente.
        </p>
      </div>

      {error && !patentError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200/50 flex items-center gap-2 font-semibold">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Asignaciones del turno — solo lectura */}
      <div className="rounded-xl border border-brand-seashell/60 bg-brand-seashell/45 shadow-sm p-4 space-y-3 select-none">
        <div className="flex items-center justify-between gap-2 pb-1 border-b border-brand-seashell/50">
          <span className="text-[10px] font-mono tracking-wider font-extrabold text-slate-500 uppercase flex items-center gap-1.5">
            Asignaciones de Servicio
          </span>
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            <Lock className="w-3 h-3 shrink-0 opacity-70" />
            No editable
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Chofer Principal
            </span>
            <div
              aria-readonly="true"
              className="px-3 py-2.5 rounded-lg border border-slate-200/80 bg-slate-100/90 text-xs font-medium text-slate-400 truncate cursor-default"
            >
              {userData?.nombre || "Chofer no detectado"}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Enganchador
            </span>
            <div
              aria-readonly="true"
              className="px-3 py-2.5 rounded-lg border border-slate-200/80 bg-slate-100/90 text-xs font-medium text-slate-400 truncate cursor-default"
            >
              {enganchadorDeDupla(selectedDupla) || "—"}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Móvil de Grúa
            </span>
            <div
              aria-readonly="true"
              className="px-3 py-2.5 rounded-lg border border-slate-200/80 bg-slate-100/90 text-xs font-medium text-slate-400 truncate cursor-default"
            >
              {selectedGrua
                ? [selectedGrua.patente, selectedGrua.descripcion].filter(Boolean).join(" — ")
                : "Sin grúa asignada"}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Inspector Municipal
            </span>
            <div
              aria-readonly="true"
              className="px-3 py-2.5 rounded-lg border border-slate-200/80 bg-slate-100/90 text-xs font-medium text-slate-400 truncate cursor-default"
            >
              {values.inspector || "—"}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Nro Infraccion & Patente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Numero infraccion */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Acta de Infracción / Nro
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={values.numeroInfraccion}
                onChange={(e) => patchValues({ numeroInfraccion: e.target.value })}
                placeholder="Ej: INF-122938"
                className="w-full pl-9 pr-3 py-2.5 bg-brand-bg border border-gray-250 rounded-xl font-mono text-xs uppercase"
                required
              />
            </div>
          </div>

          {/* Patente */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Patente / Dominio
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 font-mono font-extrabold text-xs text-brand-cta border border-brand-cta/20 px-1 rounded bg-brand-cta/10">
                AR
              </span>
              <input
                type="text"
                value={values.patente}
                onChange={(e) => handlePatenteChange(e.target.value)}
                placeholder="Ej: AA123BB o KLO098"
                maxLength={9}
                className={`w-full pl-11 pr-3 py-2.5 bg-brand-bg border rounded-xl font-mono text-xs font-bold uppercase tracking-widest ${
                  patentError 
                    ? "border-red-500 focus:ring-1 focus:ring-red-500 bg-red-500/5Name" 
                    : "border-gray-250"
                }`}
                required
              />
            </div>
            {patentError && (
              <p className="text-[10px] text-red-500 font-medium">✓ {patentError}</p>
            )}
          </div>

        </div>

        {/* Action buttons */}
        <div className="pt-4 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
          {onBack && <FlowBackButton onClick={onBack} label={backLabel} />}
          <button
            type="submit"
            className="w-full sm:w-auto sm:ml-auto px-5 py-2.5 bg-brand-cta hover:bg-brand-cta-hover text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-brand-cta/15"
          >
            Siguiente Paso
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </form>
    </div>
  );
};

export default DatosForm;
