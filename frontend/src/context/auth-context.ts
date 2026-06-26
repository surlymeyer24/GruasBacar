import { createContext } from "react";
import { Usuario, AsignacionDiaria, GuardarAsignacionDiariaPayload, ServicioActivoResumen } from "@gruasbacar/shared";
import { RegistrarCuentaPayload } from "../services/auth.service";

export interface AuthContextType {
  user: unknown;
  userData: Usuario | null;
  /** true hasta resolver la sesión Firebase (arranque / persistencia). */
  sessionLoading: boolean;
  /** true mientras se carga el documento usuarios/{uid}. */
  profileLoading: boolean;
  /** sessionLoading || profileLoading (compatibilidad). */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegistrarCuentaPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateServicioActivo: (
    servicioId: string | null,
    options?: { resumen?: ServicioActivoResumen; skipFetch?: boolean }
  ) => Promise<void>;
  refreshUserData: () => Promise<void>;
  guardarAsignacionDiaria: (data: GuardarAsignacionDiariaPayload) => Promise<AsignacionDiaria>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
