import { Grua, TipoFlota, normalizeTipoFlota, normalizeGruaId } from "@gruasbacar/shared";

const PATENTE_VIEJA = /^[A-Z]{3}\d{3}$/;
const PATENTE_MERCOSUR = /^[A-Z]{2}\d{3}[A-Z]{2}$/;

export function esPatenteVehiculo(valor: string): boolean {
  const cleaned = valor.trim().toUpperCase().replace(/\s/g, "");
  return PATENTE_VIEJA.test(cleaned) || PATENTE_MERCOSUR.test(cleaned);
}

/** Devuelve la patente legible de la grúa (no el ID interno de Firestore). */
export function resolverPatenteGrua(
  gruaValor: string | undefined,
  gruas: Grua[] = []
): string {
  if (!gruaValor?.trim()) return "—";

  const val = gruaValor.trim();
  const upper = val.toUpperCase().replace(/\s/g, "");

  if (esPatenteVehiculo(upper)) return upper;

  if (upper.startsWith("G-") && upper.length > 2) {
    const maybePatente = upper.slice(2);
    if (esPatenteVehiculo(maybePatente)) return maybePatente;
  }

  const byDocId = gruas.find((g) => g.id === val);
  if (byDocId?.patente?.trim()) return byDocId.patente.trim().toUpperCase();

  const byPatente = gruas.find(
    (g) => g.patente?.trim().toUpperCase() === upper
  );
  if (byPatente?.patente?.trim()) return byPatente.patente.trim().toUpperCase();

  return val;
}

/** Tipo operativo del servicio: guardado en acta o inferido desde el catálogo de grúas. */
export function tipoFlotaDeServicio(
  servicio: { grua?: string; tipoFlota?: string },
  gruas: Grua[] = []
): TipoFlota {
  if (servicio.tipoFlota) return normalizeTipoFlota(servicio.tipoFlota);

  const val = servicio.grua?.trim();
  if (!val) return "TRANSITO";

  const byDocId = gruas.find((g) => g.id === val);
  if (byDocId?.tipo) return normalizeTipoFlota(byDocId.tipo);

  const patente = resolverPatenteGrua(val, gruas);
  const byPatente = gruas.find(
    (g) => g.patente?.trim().toUpperCase() === patente.toUpperCase()
  );
  if (byPatente?.tipo) return normalizeTipoFlota(byPatente.tipo);

  return "TRANSITO";
}

/** Id de grúa a persistir en el servicio (`G-{patente}`). */
export function gruaIdParaServicio(
  gruaPatente: string | undefined,
  gruaId: string | undefined
): string {
  const candidata = gruaPatente?.trim() || gruaId?.trim();
  if (!candidata) {
    throw new Error(
      "No se pudo determinar la grúa. Volvé al formulario y seleccioná la grúa nuevamente."
    );
  }
  return normalizeGruaId(candidata);
}

/** @deprecated Usar gruaIdParaServicio */
export function patenteGruaParaServicio(
  gruaPatente: string | undefined,
  gruaId: string | undefined
): string {
  return gruaIdParaServicio(gruaPatente, gruaId);
}
