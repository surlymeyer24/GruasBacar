import { useContext } from "react";
import { ServicioActivoContext } from "../context/servicio-activo-context";

/**
 * Servicio activo compartido (un solo onSnapshot en toda la app).
 * El parámetro `servicioActivoId` se ignora: el id viene del AuthContext vía provider.
 */
export const useServicioActivo = (_servicioActivoId?: string | null) => {
  const context = useContext(ServicioActivoContext);
  if (context === undefined) {
    throw new Error("useServicioActivo debe usarse dentro de ServicioActivoProvider");
  }
  return context;
};

export default useServicioActivo;
