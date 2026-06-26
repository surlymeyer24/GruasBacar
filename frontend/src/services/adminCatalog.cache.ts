import { collection, getDocs } from "firebase/firestore";
import { Corralon, Grua, Usuario, enganchadorDeDupla } from "@gruasbacar/shared";
import { db, isMock } from "../firebase";
import { listarUsuarios } from "./usuario.service";
import { DuplaAsset } from "./dupla.service";

export type GruaDoc = Grua & { docId: string };
export type CorralonDoc = Corralon & { docId: string };
export type DuplaDoc = DuplaAsset & { docId: string };

export interface AdminCatalogData {
  gruas: GruaDoc[];
  corralones: CorralonDoc[];
  duplas: DuplaDoc[];
  usuarios: Usuario[];
}

const cache: {
  data: AdminCatalogData | null;
  loading: Promise<AdminCatalogData> | null;
} = {
  data: null,
  loading: null,
};

function loadFromLocalStorage(): Pick<AdminCatalogData, "gruas" | "corralones" | "duplas"> {
  const savedG = localStorage.getItem("gruas_bacar_asset_catalog");
  const savedC = localStorage.getItem("corralones_bacar_asset_catalog");
  const savedD = localStorage.getItem("duplas_bacar_asset_catalog");

  return {
    gruas: savedG ? JSON.parse(savedG).map((g: Grua) => ({ ...g, docId: g.id })) : [],
    corralones: savedC ? JSON.parse(savedC).map((c: Corralon) => ({ ...c, docId: c.id })) : [],
    duplas: savedD
      ? JSON.parse(savedD).map((d: DuplaAsset) => ({
          ...d,
          docId: d.id,
          activa: d.activa !== false,
          enganchador: enganchadorDeDupla(d),
        }))
      : [],
  };
}

async function fetchCatalog(): Promise<AdminCatalogData> {
  if (!isMock && db) {
    const [gSnap, cSnap, dSnap, usuariosResult] = await Promise.all([
      getDocs(collection(db, "gruas")),
      getDocs(collection(db, "corralones")),
      getDocs(collection(db, "duplas")),
      listarUsuarios().catch(() => [] as Usuario[]),
    ]);
    const usuarios = usuariosResult;

    const gruas = gSnap.docs.map((d) => {
      const data = d.data() as Grua;
      return { ...data, docId: d.id, id: data.id ?? d.id };
    });

    const corralones = cSnap.docs.map((d) => {
      const data = d.data() as Corralon;
      return { ...data, docId: d.id, id: data.id ?? d.id };
    });

    const duplas = dSnap.docs.map((d) => {
      const data = d.data() as DuplaAsset;
      return {
        ...data,
        enganchador: enganchadorDeDupla(data),
        docId: d.id,
        id: data.id ?? d.id,
        activa: data.activa !== false,
      };
    });

    return {
      gruas,
      corralones,
      duplas: duplas.sort((a, b) => a.chofer.localeCompare(b.chofer, "es")),
      usuarios: usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    };
  }

  const local = loadFromLocalStorage();
  return { ...local, usuarios: [] };
}

export function getAdminCatalogSnapshot(): AdminCatalogData | null {
  return cache.data;
}

export async function ensureAdminCatalog(force = false): Promise<AdminCatalogData> {
  if (!force && cache.data) {
    return cache.data;
  }

  if (!force && cache.loading) {
    return cache.loading;
  }

  cache.loading = fetchCatalog()
    .then((data) => {
      cache.data = data;
      cache.loading = null;
      return data;
    })
    .catch((err) => {
      cache.loading = null;
      throw err;
    });

  return cache.loading;
}

export function patchAdminCatalog(patch: Partial<AdminCatalogData>): void {
  if (!cache.data) return;
  cache.data = { ...cache.data, ...patch };
}

export function invalidateAdminCatalog(): void {
  cache.data = null;
  cache.loading = null;
}
