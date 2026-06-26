import React, { useState, useEffect } from "react";
import { AuthContext } from "./auth-context";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc,
} from "firebase/firestore";
import { auth, db, isMock, functions } from "../firebase";
import { Usuario, RolUsuario, normalizeRoles, AsignacionDiaria, GuardarAsignacionDiariaPayload, Servicio, ServicioActivoResumen, servicioActivoVigente } from "@gruasbacar/shared";
import { registrarCuenta as registrarCuentaFn, RegistrarCuentaPayload } from "../services/auth.service";
import { guardarAsignacionDiaria as guardarAsignacionDiariaFn } from "../services/usuario.service";
import { httpsCallable } from "firebase/functions";
import { fechaHoyArgentina } from "../utils/formatters";
import { invalidateAdminCatalog } from "../services/adminCatalog.cache";
import { invalidateAdminServicios } from "../services/adminServicios.cache";
import { clearEngancheDraft } from "../services/engancheDraft.cache";

// Initial mock databases stored in localStorage for simulated engine
const MOCK_USERS_KEY = "gruas_bacar_mock_usuarios";
const defaultMockUsers: Record<string, Usuario & { email: string; pass: string }> = {
  "admin-uid": {
    uid: "admin-uid",
    nombre: "Administrador General",
    roles: ["ADMIN"],
    servicioActivoId: null,
    email: "admin@bacar.com",
    pass: "123456"
  },
  "enganchador-uid-1": {
    uid: "enganchador-uid-1",
    nombre: "Juan Carlos Enganchador",
    roles: ["ENGANCHADOR"],
    servicioActivoId: null,
    email: "chofer@bacar.com",
    pass: "123456"
  },
  "enganchador-uid-2": {
    uid: "enganchador-uid-2",
    nombre: "Miguel Ángel Enganchador (Activo)",
    roles: ["ENGANCHADOR"],
    servicioActivoId: "INF-881273-89383-KLO-981",
    servicioActivoResumen: {
      id: "INF-881273-89383-KLO-981",
      estado: "EN_TRASLADO",
      patente: "ABC123",
      numeroInfraccion: "12345",
    },
    email: "chofer_activo@bacar.com",
    pass: "123456"
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<Usuario | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const loading = sessionLoading || profileLoading;

  const getMockUsers = () => {
    const saved = localStorage.getItem(MOCK_USERS_KEY);
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return defaultMockUsers; }
    }
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(defaultMockUsers));
    return defaultMockUsers;
  };

  const saveMockUsers = (users: any) => {
    localStorage.setItem(MOCK_USERS_KEY, JSON.stringify(users));
  };

  const mapUserProfile = (profile: Partial<Usuario> & { uid: string }): Usuario => ({
    uid: profile.uid,
    nombre: profile.nombre || "Usuario Sin Nombre",
    roles: normalizeRoles(profile.roles, profile.rol),
    servicioActivoId: profile.servicioActivoId ?? null,
    servicioActivoResumen: profile.servicioActivoResumen ?? null,
    email: profile.email,
    legajo: profile.legajo,
    activo: profile.activo,
    asignacionDiaria: profile.asignacionDiaria,
  });

  const syncServicioActivoFromDoc = async (profile: Usuario): Promise<Usuario> => {
    if (!profile.servicioActivoId || servicioActivoVigente(profile.servicioActivoResumen)) {
      return profile;
    }

    if (!db) return profile;

    try {
      const servSnap = await getDoc(doc(db, "servicios", profile.servicioActivoId));
      if (!servSnap.exists()) {
        return { ...profile, servicioActivoId: null, servicioActivoResumen: null };
      }
      const servicio = servSnap.data() as Servicio;
      if (servicio.estado === "DESENGANCHADO" || servicio.estado === "ANULADO") {
        return { ...profile, servicioActivoId: null, servicioActivoResumen: null };
      }
      return {
        ...profile,
        servicioActivoResumen: {
          id: profile.servicioActivoId,
          estado: servicio.estado,
          patente: servicio.patente,
          numeroInfraccion: servicio.numeroInfraccion,
        },
      };
    } catch (err) {
      console.warn("No se pudo validar servicio activo en segundo plano:", err);
      return profile;
    }
  };

  useEffect(() => {
    if (!isMock && auth && db) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        setSessionLoading(false);
        if (firebaseUser) {
          setUser(firebaseUser);
          await fetchRealUserData(firebaseUser.uid);
        } else {
          setUser(null);
          setUserData(null);
          setProfileLoading(false);
        }
      });
      return unsubscribe;
    } else {
      const loggedUid = localStorage.getItem("gruas_bacar_logged_uid");
      if (loggedUid) {
        const users = getMockUsers();
        if (users[loggedUid]) {
          const profile = users[loggedUid];
          setUser({ uid: profile.uid, email: profile.email });
          setUserData(mapUserProfile({
            uid: profile.uid,
            nombre: profile.nombre,
            roles: profile.roles,
            rol: profile.rol,
            servicioActivoId: profile.servicioActivoId,
            servicioActivoResumen: profile.servicioActivoResumen,
            email: profile.email,
            legajo: profile.legajo,
            asignacionDiaria: profile.asignacionDiaria,
          }));
        }
      }
      setSessionLoading(false);
    }
  }, []);

  const fetchRealUserData = async (uid: string) => {
    setProfileLoading(true);
    try {
      const userRef = doc(db, "usuarios", uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data() as Usuario;
        const profile = mapUserProfile({
          uid: data.uid || uid,
          nombre: data.nombre,
          roles: data.roles,
          rol: data.rol,
          servicioActivoId: data.servicioActivoId,
          servicioActivoResumen: data.servicioActivoResumen,
          email: data.email,
          legajo: data.legajo,
          activo: data.activo,
          asignacionDiaria: data.asignacionDiaria,
        });
        const synced = await syncServicioActivoFromDoc(profile);
        setUserData(synced);
      } else {
        const defaultProfile: Usuario = {
          uid,
          nombre: auth.currentUser?.email?.split('@')[0] || "Trabajador Bácar",
          roles: ["ENGANCHADOR"],
          servicioActivoId: null,
          servicioActivoResumen: null,
        };
        await setDoc(userRef, defaultProfile);
        setUserData(defaultProfile);
      }
    } catch (err) {
      console.error("Error fetching real user data from Firestore", err);
    } finally {
      setProfileLoading(false);
    }
  };

  const refreshUserData = async () => {
    if (!isMock && user) {
      await fetchRealUserData(user.uid);
    } else if (isMock && user) {
      const users = getMockUsers();
      const profile = users[user.uid];
      if (profile) {
        setUserData(mapUserProfile({
          uid: profile.uid,
          nombre: profile.nombre,
          roles: profile.roles,
          rol: profile.rol,
          servicioActivoId: profile.servicioActivoId,
          servicioActivoResumen: profile.servicioActivoResumen,
          email: profile.email,
          legajo: profile.legajo,
          asignacionDiaria: profile.asignacionDiaria,
        }));
      }
    }
  };

  const guardarAsignacionDiaria = async (
    data: GuardarAsignacionDiariaPayload
  ): Promise<AsignacionDiaria> => {
    if (!user) {
      throw new Error("No hay sesión activa.");
    }

    const asignacion: AsignacionDiaria = {
      fecha: fechaHoyArgentina(),
      gruaPatente: data.gruaPatente.trim(),
      duplaId: data.duplaId.trim(),
      duplaChofer: data.duplaChofer.trim(),
      duplaEnganchador: data.duplaEnganchador.trim(),
      inspector: data.inspector.trim(),
    };

    if (!isMock) {
      const saved = await guardarAsignacionDiariaFn(data);
      setUserData((prev) => (prev ? { ...prev, asignacionDiaria: saved } : null));
      return saved;
    }

    const users = getMockUsers();
    if (users[user.uid]) {
      users[user.uid].asignacionDiaria = asignacion;
      saveMockUsers(users);
    }
    setUserData((prev) => (prev ? { ...prev, asignacionDiaria: asignacion } : null));
    return asignacion;
  };

  const login = async (email: string, pass: string) => {
    try {
      if (!isMock && auth) {
        await signInWithEmailAndPassword(auth, email, pass);
      } else {
        const users = getMockUsers();
        const foundKey = Object.keys(users).find(
          (k) => users[k].email.toLowerCase() === email.trim().toLowerCase() && users[k].pass === pass
        );

        if (foundKey) {
          const profile = users[foundKey];
          localStorage.setItem("gruas_bacar_logged_uid", profile.uid);
          setUser({ uid: profile.uid, email: profile.email });
          setUserData(mapUserProfile({
            uid: profile.uid,
            nombre: profile.nombre,
            roles: profile.roles,
            rol: profile.rol,
            servicioActivoId: profile.servicioActivoId,
            servicioActivoResumen: profile.servicioActivoResumen,
            email: profile.email,
            legajo: profile.legajo,
            asignacionDiaria: profile.asignacionDiaria,
          }));
        } else {
          const isCheckAdmin = email.includes("admin");
          const customUid = `dynamo-${Date.now()}`;
          const newProfile = {
            uid: customUid,
            nombre: email.split("@")[0].toUpperCase(),
            roles: [(isCheckAdmin ? "ADMIN" : "ENGANCHADOR") as RolUsuario],
            servicioActivoId: null,
            servicioActivoResumen: null,
            email: email,
            pass: pass
          };
          const allMocks = { ...users, [customUid]: newProfile };
          saveMockUsers(allMocks);

          localStorage.setItem("gruas_bacar_logged_uid", customUid);
          setUser({ uid: customUid, email });
          setUserData({
            uid: customUid,
            nombre: newProfile.nombre,
            roles: newProfile.roles,
            servicioActivoId: null,
            servicioActivoResumen: null,
          });
        }
      }
    } catch (err) {
      throw err;
    }
  };

  const register = async (data: RegistrarCuentaPayload): Promise<void> => {
    setProfileLoading(true);
    try {
      if (!isMock) {
        await registrarCuentaFn(data);
        return;
      }
      const users = getMockUsers();
      const customUid = `dynamo-${Date.now()}`;
      const newProfile = {
        uid: customUid,
        nombre: data.nombre,
        roles: ["ENGANCHADOR"] as RolUsuario[],
        servicioActivoId: null,
        servicioActivoResumen: null,
        email: data.email,
        pass: data.password,
        legajo: data.legajo,
      };
      saveMockUsers({ ...users, [customUid]: newProfile });
    } catch (err) {
      setProfileLoading(false);
      throw err;
    } finally {
      setProfileLoading(false);
    }
  };

  const logout = async () => {
    setProfileLoading(true);
    try {
      invalidateAdminCatalog();
      invalidateAdminServicios();
      clearEngancheDraft();
      if (!isMock && auth) {
        await signOut(auth);
      } else {
        localStorage.removeItem("gruas_bacar_logged_uid");
        setUser(null);
        setUserData(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  const updateServicioActivo = async (
    servicioId: string | null,
    options?: { resumen?: ServicioActivoResumen; skipFetch?: boolean }
  ) => {
    if (!user) return;
    try {
      if (!isMock && db) {
        if (servicioId === null) {
          setUserData((prev) =>
            prev ? { ...prev, servicioActivoId: null, servicioActivoResumen: null } : null
          );
          try {
            const fn = httpsCallable<void, { liberado: boolean }>(
              functions,
              "liberarServicioActivoSiHuerfano"
            );
            await fn();
          } catch (err) {
            console.warn("liberarServicioActivoSiHuerfano no disponible, estado local limpiado:", err);
          }
          await fetchRealUserData(user.uid);

          const userSnap = await getDoc(doc(db, "usuarios", user.uid));
          const remainingId = userSnap.data()?.servicioActivoId as string | null | undefined;
          if (remainingId) {
            const servSnap = await getDoc(doc(db, "servicios", remainingId));
            const estado = servSnap.data()?.estado as string | undefined;
            if (!servSnap.exists() || estado === "DESENGANCHADO" || estado === "ANULADO") {
              setUserData((prev) =>
                prev ? { ...prev, servicioActivoId: null, servicioActivoResumen: null } : null
              );
            }
          }
          return;
        }
        setUserData((prev) =>
          prev
            ? {
                ...prev,
                servicioActivoId: servicioId,
                servicioActivoResumen: options?.resumen ?? prev.servicioActivoResumen,
              }
            : null
        );
        if (options?.skipFetch) return;
        await fetchRealUserData(user.uid);
      } else {
        const users = getMockUsers();
        if (users[user.uid]) {
          users[user.uid].servicioActivoId = servicioId;
          if (options?.resumen) {
            users[user.uid].servicioActivoResumen = options.resumen;
          }
          saveMockUsers(users);
          setUserData((prev) =>
            prev
              ? {
                  ...prev,
                  servicioActivoId: servicioId,
                  servicioActivoResumen: options?.resumen ?? prev.servicioActivoResumen,
                }
              : null
          );
        }
      }
    } catch (err) {
      console.error("Error setting active service", err);
      if (servicioId === null) {
        setUserData((prev) =>
          prev ? { ...prev, servicioActivoId: null, servicioActivoResumen: null } : null
        );
        return;
      }
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        sessionLoading,
        profileLoading,
        loading,
        login,
        register,
        logout,
        updateServicioActivo,
        refreshUserData,
        guardarAsignacionDiaria,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export { useAuth } from "../hooks/useAuth";
