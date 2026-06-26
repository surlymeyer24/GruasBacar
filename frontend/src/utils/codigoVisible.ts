/** Oculta IDs autogenerados de Firestore; solo muestra códigos internos legibles. */
export function codigoInternoVisible(id: string | undefined, docId: string): string | null {
  if (!id || id === docId) return null;
  if (/^[a-zA-Z0-9]{18,}$/.test(id)) return null;
  return id;
}
