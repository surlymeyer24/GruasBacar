import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { Evento, Servicio } from "@gruasbacar/shared";
import { db, isMock } from "../firebase";
import { getMockServices } from "../data/mockData";
import { fechaServicio } from "../utils/formatters";

export type AdminServiciosScope = "full" | `personal:${string}`;

export interface AdminServiciosData {
  servicios: Servicio[];
  photoCounts?: Record<string, number>;
}

type ScopeEntry = {
  data: AdminServiciosData | null;
  loading: Promise<AdminServiciosData> | null;
};

const byScope = new Map<AdminServiciosScope, ScopeEntry>();

function getEntry(scope: AdminServiciosScope): ScopeEntry {
  let entry = byScope.get(scope);
  if (!entry) {
    entry = { data: null, loading: null };
    byScope.set(scope, entry);
  }
  return entry;
}

export function adminServiciosScopeForUser(
  historialCompleto: boolean,
  uid: string
): AdminServiciosScope {
  return historialCompleto ? "full" : `personal:${uid}`;
}

async function fetchServiciosList(scope: AdminServiciosScope): Promise<Servicio[]> {
  if (!isMock && db) {
    const servicesRef = collection(db, "servicios");
    const q =
      scope === "full"
        ? query(servicesRef, orderBy("creadoEn", "desc"))
        : query(servicesRef, where("creadoPor", "==", scope.slice("personal:".length)));

    const querySnap = await getDocs(q);
    const list: Servicio[] = [];
    querySnap.forEach((docSnap) => {
      list.push({ ...(docSnap.data() as Servicio), id: docSnap.id });
    });
    list.sort(
      (a, b) =>
        (fechaServicio(b)?.getTime() ?? 0) - (fechaServicio(a)?.getTime() ?? 0)
    );
    return list;
  }

  const allServices = getMockServices();
  if (scope === "full") return allServices;
  const uid = scope.slice("personal:".length);
  return allServices.filter((s) => s.creadoPor === uid);
}

async function fetchPhotoCounts(servicios: Servicio[]): Promise<Record<string, number>> {
  if (!isMock && db) {
    const counts: Record<string, number> = {};
    await Promise.all(
      servicios.map(async (s) => {
        try {
          const evSnap = await getDocs(collection(db, `servicios/${s.id}/eventos`));
          let count = 0;
          evSnap.forEach((evDoc) => {
            const fotos = evDoc.data().fotos as Evento["fotos"];
            if (fotos?.length) count += fotos.length;
          });
          counts[s.id] = count;
        } catch {
          counts[s.id] = 0;
        }
      })
    );
    return counts;
  }

  const counts: Record<string, number> = {};
  for (const s of servicios) {
    let count = 0;
    for (const ev of s.eventos ?? []) {
      count += ev.fotos?.length ?? 0;
    }
    counts[s.id] = count;
  }
  return counts;
}

export function getAdminServiciosSnapshot(scope: AdminServiciosScope): AdminServiciosData | null {
  return byScope.get(scope)?.data ?? null;
}

export async function ensureAdminServicios(
  scope: AdminServiciosScope,
  options: { withPhotoCounts?: boolean; force?: boolean } = {}
): Promise<AdminServiciosData> {
  const { withPhotoCounts = false, force = false } = options;
  const entry = getEntry(scope);

  if (!force && entry.data) {
    if (!withPhotoCounts || entry.data.photoCounts !== undefined) {
      return entry.data;
    }

    if (entry.loading) return entry.loading;

    entry.loading = fetchPhotoCounts(entry.data.servicios)
      .then((photoCounts) => {
        entry.data = { ...entry.data!, photoCounts };
        entry.loading = null;
        return entry.data;
      })
      .catch((err) => {
        entry.loading = null;
        throw err;
      });

    return entry.loading;
  }

  if (!force && entry.loading) {
    return entry.loading;
  }

  entry.loading = (async () => {
    const servicios = await fetchServiciosList(scope);
    const photoCounts = withPhotoCounts ? await fetchPhotoCounts(servicios) : undefined;
    const data: AdminServiciosData = { servicios, photoCounts };
    entry.data = data;
    entry.loading = null;
    return data;
  })().catch((err) => {
    entry.loading = null;
    throw err;
  });

  return entry.loading;
}

export function patchAdminServicios(
  scope: AdminServiciosScope,
  updater: (prev: AdminServiciosData) => AdminServiciosData
): void {
  const entry = getEntry(scope);
  if (!entry.data) return;
  entry.data = updater(entry.data);
}

export function updateServicioInAdminCache(servicio: Servicio): void {
  for (const entry of byScope.values()) {
    if (!entry.data) continue;
    const idx = entry.data.servicios.findIndex((s) => s.id === servicio.id);
    if (idx < 0) continue;
    const servicios = [...entry.data.servicios];
    servicios[idx] = servicio;
    entry.data = { ...entry.data, servicios };
  }
}

export function invalidateAdminServicios(): void {
  byScope.clear();
}
