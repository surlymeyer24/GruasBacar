import { isMock, db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Dupla, enganchadorDeDupla, buildGruaId } from "@gruasbacar/shared";

export interface DuplaAsset extends Dupla {
  activa: boolean;
}

const DEFAULT_MOCK_DUPLAS: DuplaAsset[] = [
  { id: "D-101", chofer: "Pedro Gómez M.", enganchador: "Lautaro Martínez", activa: true, tipo: "TRANSITO", gruaId: buildGruaId("AB123CD") },
  { id: "D-102", chofer: "Marcelo Gallardo S.", enganchador: "Enzo Pérez", activa: true, tipo: "TRANSITO", gruaId: buildGruaId("EF456GH") },
  { id: "D-103", chofer: "Carlos Tévez P.", enganchador: "Julián Álvarez", activa: true, tipo: "TRANSPORTE", gruaId: buildGruaId("IJ789KL") },
  { id: "D-110", chofer: "Esteban Gomis", enganchador: "Mateo Díaz", activa: false, tipo: "TRANSPORTE" },
];

export const duplaService = {
  async getDuplasActivas(): Promise<Dupla[]> {
    if (!isMock && db) {
      try {
        const q = query(collection(db, "duplas"), where("activa", "==", true));
        const querySnap = await getDocs(q);
        const list: Dupla[] = [];
        querySnap.forEach((docSnap) => {
          const data = docSnap.data() as Dupla;
          list.push({
            ...data,
            id: docSnap.id,
            enganchador: enganchadorDeDupla(data),
          });
        });
        if (list.length > 0) {
          return list;
        }
      } catch (err) {
        console.error("Error fetching duplas from Firestore:", err);
      }
    }

    // LocalStorage / Mock fallback
    const saved = localStorage.getItem("duplas_bacar_asset_catalog");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed
          .filter((d: { activa?: boolean }) => d.activa !== false)
          .map((d: Dupla) => ({
            ...d,
            enganchador: enganchadorDeDupla(d),
          }));
      } catch (e) {
        return DEFAULT_MOCK_DUPLAS.filter(d => d.activa);
      }
    } else {
      localStorage.setItem("duplas_bacar_asset_catalog", JSON.stringify(DEFAULT_MOCK_DUPLAS));
    }
    return DEFAULT_MOCK_DUPLAS.filter((d) => d.activa);
  }
};
