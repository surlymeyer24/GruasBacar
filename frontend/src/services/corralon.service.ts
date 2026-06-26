import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Corralon } from "@gruasbacar/shared";
import { CorralonCatalogo } from "../utils/corralonDisplay";

export const corralonService = {
  async getCorralonesActivos(): Promise<CorralonCatalogo[]> {
    const q = query(collection(db, "corralones"), where("activo", "==", true));
    const querySnap = await getDocs(q);
    return querySnap.docs.map((docSnap) => ({
      ...(docSnap.data() as Corralon),
      docId: docSnap.id,
      id: docSnap.id,
    }));
  },

  async getAllCorralones(): Promise<CorralonCatalogo[]> {
    const querySnap = await getDocs(collection(db, "corralones"));
    return querySnap.docs.map((docSnap) => ({
      ...(docSnap.data() as Corralon),
      docId: docSnap.id,
      id: docSnap.id,
    }));
  },
};
