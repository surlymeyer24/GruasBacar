import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Grua, EstadoServicio, patenteDesdeGruaId } from "@gruasbacar/shared";

export const gruaService = {
  async getGruasActivas(): Promise<Grua[]> {
    const q = query(collection(db, "gruas"), where("activa", "==", true));
    const querySnap = await getDocs(q);
    return querySnap.docs.map((docSnap) => ({
      ...(docSnap.data() as Grua),
      id: docSnap.id,
    }));
  },

  async getAllGruas(): Promise<Grua[]> {
    const querySnap = await getDocs(collection(db, "gruas"));
    return querySnap.docs.map((docSnap) => ({
      ...(docSnap.data() as Grua),
      id: docSnap.id,
    }));
  },

  async getGruasOcupadas(): Promise<Set<string>> {
    const estados: EstadoServicio[] = ['ENGANCHADO', 'EN_TRASLADO'];
    const q = query(
      collection(db, "servicios"),
      where("estado", "in", estados)
    );
    const snap = await getDocs(q);
    const ocupadas = new Set<string>();
    snap.docs.forEach((d) => {
      const grua = d.data().grua as string | undefined;
      if (grua) ocupadas.add(patenteDesdeGruaId(grua));
    });
    return ocupadas;
  },
};
