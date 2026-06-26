import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Servicio, ServicioActivoResumen, servicioActivoVigente } from "@gruasbacar/shared";
import { db, isMock } from "../firebase";
import { getMockServices } from "../data/mockData";
import { useAuth } from "../hooks/useAuth";
import { ServicioActivoContext } from "./servicio-activo-context";

function servicioDesdeResumen(resumen: ServicioActivoResumen): Servicio {
  return {
    id: resumen.id,
    patente: resumen.patente,
    numeroInfraccion: resumen.numeroInfraccion,
    estado: resumen.estado,
  } as Servicio;
}

export const ServicioActivoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { userData } = useAuth();
  const servicioActivoId = userData?.servicioActivoId ?? null;

  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const listenedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!servicioActivoId) {
      listenedIdRef.current = null;
      setServicio(null);
      setLoading(false);
      setError(null);
      return;
    }

    const resumen = userData?.servicioActivoResumen;
    const resumenValido =
      resumen?.id === servicioActivoId && servicioActivoVigente(resumen);

    if (resumenValido) {
      setServicio(servicioDesdeResumen(resumen));
      setLoading(false);
    } else if (listenedIdRef.current !== servicioActivoId) {
      setServicio(null);
      setLoading(true);
    }

    listenedIdRef.current = servicioActivoId;
    setError(null);

    if (!isMock && db) {
      const docRef = doc(db, "servicios", servicioActivoId);
      const unsubscribe = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            setServicio({ ...snap.data(), id: snap.id } as Servicio);
          } else {
            setServicio(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error("Error listening to active service:", err);
          setError(err);
          setLoading(false);
        }
      );
      return unsubscribe;
    }

    const fetchLocalSim = () => {
      const found = getMockServices().find((s) => s.id === servicioActivoId);
      setServicio(found ?? null);
      setLoading(false);
    };

    fetchLocalSim();

    const handleStorageUpdate = () => fetchLocalSim();
    window.addEventListener("storage", handleStorageUpdate);
    window.addEventListener("local_services_updated", handleStorageUpdate);
    const idx = setInterval(fetchLocalSim, 800);

    return () => {
      window.removeEventListener("storage", handleStorageUpdate);
      window.removeEventListener("local_services_updated", handleStorageUpdate);
      clearInterval(idx);
    };
  }, [servicioActivoId, userData?.servicioActivoResumen]);

  return (
    <ServicioActivoContext.Provider
      value={{ servicioActivoId, servicio, loading, error }}
    >
      {children}
    </ServicioActivoContext.Provider>
  );
};
