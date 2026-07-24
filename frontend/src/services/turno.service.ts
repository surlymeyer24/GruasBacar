import { db } from "../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import type { RegistroTurno } from "@gruasbacar/shared";

export interface TurnosFiltros {
  fechaDesde?: string; // YYYY-MM-DD
  fechaHasta?: string; // YYYY-MM-DD
  operadorNombre?: string;
  gruaPatente?: string;
}

export interface TurnosPage {
  turnos: (RegistroTurno & { id: string })[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hayMas: boolean;
}

const PAGE_SIZE = 30;

export async function consultarTurnos(
  filtros: TurnosFiltros,
  cursor?: QueryDocumentSnapshot<DocumentData> | null,
): Promise<TurnosPage> {
  const col = collection(db, "turnos");
  const constraints = [];

  if (filtros.fechaDesde) {
    constraints.push(where("fecha", ">=", filtros.fechaDesde));
  }
  if (filtros.fechaHasta) {
    constraints.push(where("fecha", "<=", filtros.fechaHasta));
  }
  if (filtros.gruaPatente) {
    constraints.push(where("gruaPatente", "==", filtros.gruaPatente));
  }

  constraints.push(orderBy("fecha", "desc"), orderBy("creadoEn", "desc"));
  constraints.push(limit(PAGE_SIZE + 1));

  if (cursor) {
    constraints.push(startAfter(cursor));
  }

  const q = query(col, ...constraints);
  const snap = await getDocs(q);

  let docs = snap.docs;
  const hayMas = docs.length > PAGE_SIZE;
  if (hayMas) docs = docs.slice(0, PAGE_SIZE);

  const turnos = docs.map((d) => ({ id: d.id, ...(d.data() as RegistroTurno) }));

  if (filtros.operadorNombre) {
    const buscar = filtros.operadorNombre.toLowerCase();
    const filtered = turnos.filter((t) =>
      t.duplaChofer.toLowerCase().includes(buscar) ||
      t.duplaEnganchador.toLowerCase().includes(buscar),
    );
    return {
      turnos: filtered,
      lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
      hayMas,
    };
  }

  return {
    turnos,
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
    hayMas,
  };
}
