import { db } from "../firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Grua } from "@gruasbacar/shared";

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
};
