import { AsignacionDiaria, asignacionCompleta, turnoSigueVigente } from "@gruasbacar/shared";
import { fechaHoyArgentina } from "./formatters";

const CONFIG_DIA_DISMISS_PREFIX = "gruas_config_dia_dismissed_";

export function configDiaDismissKey(): string {
  return `${CONFIG_DIA_DISMISS_PREFIX}${fechaHoyArgentina()}`;
}

export function configDiaFueOmitidaHoy(): boolean {
  try {
    return sessionStorage.getItem(configDiaDismissKey()) === "1";
  } catch {
    return false;
  }
}

export function marcarConfigDiaOmitidaHoy(): void {
  try {
    sessionStorage.setItem(configDiaDismissKey(), "1");
  } catch {
    // ignore
  }
}

export function limpiarConfigDiaOmitidaHoy(): void {
  try {
    sessionStorage.removeItem(configDiaDismissKey());
  } catch {
    // ignore
  }
}

export function asignacionDiariaVigente(
  asignacion?: AsignacionDiaria | null
): AsignacionDiaria | null {
  if (!asignacion) return null;
  if (asignacion.fecha !== fechaHoyArgentina()) return null;
  if (!asignacionCompleta(asignacion)) return null;
  if (!turnoSigueVigente(asignacion)) return null;
  return asignacion;
}
