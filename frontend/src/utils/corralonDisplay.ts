import { Corralon } from "@gruasbacar/shared";

export type CorralonCatalogo = Corralon & { docId?: string };

/** Resuelve el id del corralón SEM en el catálogo (por id, docId o nombre). */
export function resolverIdCorralonSem(corralones: CorralonCatalogo[]): string {
  const match = corralones.find((c) => {
    const id = (c.id ?? "").trim().toUpperCase();
    const docId = (c.docId ?? "").trim().toUpperCase();
    const nombre = (c.nombre ?? "").trim().toUpperCase();
    return (
      id === "SEM" ||
      docId === "SEM" ||
      nombre === "SEM" ||
      /\bSEM\b/.test(nombre)
    );
  });
  if (!match) return "";
  return match.docId ?? match.id;
}

/** Resuelve el nombre legible del corralón (no el ID de Firestore). */
export function nombreCorralon(
  valor: string | undefined,
  corralones: CorralonCatalogo[] = [],
  fallbackMock: Corralon[] = []
): string {
  if (!valor?.trim()) return "No asignado";

  const key = valor.trim();
  const found = corralones.find(
    (c) => c.id === key || c.docId === key || c.nombre === key
  );
  if (found?.nombre?.trim()) return found.nombre.trim();

  const fromMock = fallbackMock.find((c) => c.id === key || c.nombre === key);
  if (fromMock?.nombre?.trim()) return fromMock.nombre.trim();

  return key;
}
