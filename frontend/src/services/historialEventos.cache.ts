import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { Evento } from "@gruasbacar/shared";
import { db, isMock } from "../firebase";

const byServicioId = new Map<string, Evento[]>();
const loading = new Map<string, Promise<Evento[]>>();

export function getEventosServicioSnapshot(servicioId: string): Evento[] | null {
  return byServicioId.get(servicioId) ?? null;
}

export async function ensureEventosServicio(
  servicioId: string,
  mockEventos?: Evento[]
): Promise<Evento[]> {
  const cached = byServicioId.get(servicioId);
  if (cached) return cached;

  const pending = loading.get(servicioId);
  if (pending) return pending;

  const promise = (async () => {
    let eventos: Evento[] = [];
    if (!isMock && db) {
      const evQ = query(
        collection(db, `servicios/${servicioId}/eventos`),
        orderBy("timestamp", "asc")
      );
      const evSnap = await getDocs(evQ);
      eventos = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Evento));
    } else if (mockEventos) {
      eventos = mockEventos.map((e, i) => ({
        ...e,
        id: e.id ?? `mock-ev-${servicioId}-${i}`,
      }));
    }
    byServicioId.set(servicioId, eventos);
    return eventos;
  })().finally(() => {
    loading.delete(servicioId);
  });

  loading.set(servicioId, promise);
  return promise;
}

export function invalidateEventosServicio(servicioId: string): void {
  byServicioId.delete(servicioId);
  loading.delete(servicioId);
}
