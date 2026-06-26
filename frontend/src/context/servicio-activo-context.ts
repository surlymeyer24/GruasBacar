import { createContext } from "react";
import { Servicio } from "@gruasbacar/shared";

export interface ServicioActivoContextType {
  servicioActivoId: string | null;
  servicio: Servicio | null;
  /** true solo si hay id activo y aún no hay servicio en cache (ni resumen ni snapshot). */
  loading: boolean;
  error: unknown;
}

export const ServicioActivoContext = createContext<ServicioActivoContextType | undefined>(
  undefined
);
