import React, { useState } from "react";
import { normalizarPatenteInput, PATENTE_SIN_NUMERO, esPatenteSinNumero } from "@gruasbacar/shared";
import { Car } from "lucide-react";

export function validatePatenteText(p: string): string | null {
  const clean = normalizarPatenteInput(p);
  if (!clean) return "La patente es obligatoria";
  if (clean === PATENTE_SIN_NUMERO) return null;

  const oldFormat = /^[A-Z]{3}\d{3}$/;
  const newFormat = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

  if (!oldFormat.test(clean) && !newFormat.test(clean)) {
    return "Formato inválido (Ejemplos válidos: AAA123, AA123BB o sin si no tiene patente)";
  }
  return null;
}

interface PatenteInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  onErrorChange?: (error: string | null) => void;
  descripcionVehiculo?: string;
  onDescripcionVehiculoChange?: (value: string) => void;
}

export const PatenteInput: React.FC<PatenteInputProps> = ({
  value,
  onChange,
  error: externalError,
  onErrorChange,
  descripcionVehiculo,
  onDescripcionVehiculoChange,
}) => {
  const [internalError, setInternalError] = useState<string | null>(null);
  const error = externalError ?? internalError;

  const handleChange = (val: string) => {
    const cleaned = val.toUpperCase();
    onChange(cleaned);

    if (cleaned.length >= 3) {
      const err = validatePatenteText(cleaned);
      setInternalError(err);
      onErrorChange?.(err);
    } else {
      setInternalError(null);
      onErrorChange?.(null);
    }
  };

  const showDescripcion = esPatenteSinNumero(normalizarPatenteInput(value));

  return (
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
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Ej: AA123BB o KLO098"
          maxLength={9}
          className={`w-full pl-11 pr-3 py-2.5 bg-brand-bg border rounded-xl font-mono text-xs font-bold uppercase tracking-widest ${
            error
              ? "border-red-500 focus:ring-1 focus:ring-red-500"
              : "border-gray-250"
          }`}
          required
        />
      </div>
      <p className="text-[10px] text-gray-400 font-medium">
        ¿El vehículo no tiene patente? Escribí <span className="font-mono font-bold">sin</span>.
      </p>
      {error && (
        <p className="text-[10px] text-red-500 font-medium">✓ {error}</p>
      )}

      {showDescripcion && onDescripcionVehiculoChange && (
        <div className="mt-3 space-y-1">
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
            <Car className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-brand-cta" />
            Descripción del vehículo (opcional)
          </label>
          <input
            type="text"
            value={descripcionVehiculo ?? ""}
            onChange={(e) => onDescripcionVehiculoChange(e.target.value)}
            placeholder="Ej: Fiat Palio rojo, Renault Clio gris"
            maxLength={200}
            className="w-full px-3 py-2.5 bg-brand-bg border border-gray-250 rounded-xl text-xs"
          />
          <p className="text-[10px] text-gray-400 font-medium">
            Marca, modelo, color u otro dato que identifique al vehículo.
          </p>
        </div>
      )}
    </div>
  );
};
