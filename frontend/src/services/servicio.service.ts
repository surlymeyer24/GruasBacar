import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { isMock, app, functions, db } from "../firebase";
import { addMockService, getMockServices, updateMockService } from "../data/mockData";
import { fotoService } from "./foto.service";
import { getFirebaseErrorMessage } from "../utils/firebaseError";
import { patenteGruaParaServicio } from "../utils/gruaDisplay";
import {
  Servicio,
  Foto,
  EstadoServicio,
  ActualizarServicioPayload,
  AnularServicioPayload,
  AgregarComentarioFotoPayload,
  ComentarioFoto,
  CrearActaManualPayload,
  enganchadorDeDupla,
  GeoPoint,
  buildIdentificadorCompuesto,
  normalizeGruaId,
} from "@gruasbacar/shared";

export interface IniciarEngancheData {
  numeroInfraccion: string;
  patente: string;
  grua: string;
  gruaPatente?: string;
  dupla: string;
  duplaChofer: string;
  duplaEnganchador: string;
  inspector: string;
  legajoEnganchador?: string;
  geo?: GeoPoint;
}

export const servicioService = {
  async iniciarEnganche(data: IniciarEngancheData, userId: string, userDisplayName: string): Promise<{ servicioId: string }> {
    const gruaPatente = patenteGruaParaServicio(data.gruaPatente, data.grua);
    const geo = data.geo ?? { lat: 0, lng: 0 };

    if (!isMock && app) {
      const cloudFn = httpsCallable<
        {
          numeroInfraccion: string;
          patente: string;
          grua: string;
          dupla: { chofer: string; enganchador: string; inspector: string };
          geo: { lat: number; lng: number };
        },
        { servicioId: string }
      >(functions, "iniciarEnganche");
      const res = await cloudFn({
        numeroInfraccion: data.numeroInfraccion,
        patente: data.patente,
        grua: gruaPatente,
        dupla: {
          chofer: data.duplaChofer?.trim() || userDisplayName,
          enganchador: data.duplaEnganchador?.trim() || "—",
          inspector: data.inspector.trim(),
        },
        geo,
      });
      return res.data;
    }

    // Local / Simulation Flow
    const allDuplasSaved = localStorage.getItem("duplas_bacar_asset_catalog");
    let selectedDuplaObj = { chofer: "Chofer Simulado", enganchador: "Enganchador Simulado", inspector: data.inspector };
    
    if (allDuplasSaved) {
      try {
        const duplas = JSON.parse(allDuplasSaved);
        const match = duplas.find((d: { id: string }) => d.id === data.dupla);
        if (match) {
          selectedDuplaObj = {
            chofer: match.chofer,
            enganchador: enganchadorDeDupla(match),
            inspector: data.inspector
          };
        }
      } catch (e) {
        console.error("Error matching mock dupla:", e);
      }
    }

    const patente = data.patente.toUpperCase().trim();
    const numeroInfraccion = data.numeroInfraccion.toUpperCase().trim();
    const legajoChofer = data.legajoEnganchador?.trim() || "SIM";
    const gruaId = normalizeGruaId(patenteGruaParaServicio(data.gruaPatente, data.grua));
    const identificadorCompuesto = buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente);

    const mockServicio: Servicio = {
      id: identificadorCompuesto,
      patente,
      numeroInfraccion,
      identificadorCompuesto,
      estado: "ENGANCHADO",
      grua: gruaId,
      dupla: selectedDuplaObj,
      creadoPor: userId,
      legajoChofer,
      geoEnganche: geo,
      fechaCreacion: new Date().toISOString(),
      eventos: [
        {
          tipo: "ENGANCHE",
          timestamp: new Date().toISOString(),
          geo,
          observacionGeneral: `Enganche iniciado por ${userDisplayName}.`,
        },
      ],
    };

    addMockService(mockServicio);
    return { servicioId: identificadorCompuesto };
  },

  async tieneEventoEnganche(servicioId: string): Promise<boolean> {
    if (!isMock && db) {
      const evSnap = await getDocs(
        query(
          collection(db, `servicios/${servicioId}/eventos`),
          where("tipo", "==", "ENGANCHE"),
          limit(1)
        )
      );
      return !evSnap.empty;
    }

    const found = getMockServices().find((s) => s.id === servicioId);
    return Boolean(found?.eventos?.some((e) => e.tipo === "ENGANCHE" && (e.fotos?.length ?? 0) > 0));
  },

  async tieneEventoLlegadaCorralon(servicioId: string): Promise<boolean> {
    if (!isMock && db) {
      const evSnap = await getDocs(
        query(
          collection(db, `servicios/${servicioId}/eventos`),
          where("tipo", "==", "LLEGADA_CORRALON"),
          limit(1)
        )
      );
      return !evSnap.empty;
    }

    const found = getMockServices().find((s) => s.id === servicioId);
    return Boolean(found?.eventos?.some((e) => e.tipo === "LLEGADA_CORRALON"));
  },

  async obtenerEstadoServicio(servicioId: string): Promise<EstadoServicio | null> {
    if (!isMock && db) {
      const snap = await getDoc(doc(db, "servicios", servicioId));
      if (!snap.exists()) return null;
      return (snap.data() as Servicio).estado ?? null;
    }
    const found = getMockServices().find((s) => s.id === servicioId);
    return found?.estado ?? null;
  },

  async confirmarTraslado(servicioId: string): Promise<{ ok: true }> {
    if (!servicioId?.trim()) {
      throw new Error("No se encontró el servicio activo. Volvé al inicio e intentá de nuevo.");
    }

    const estadoActual = await this.obtenerEstadoServicio(servicioId);
    if (estadoActual === "EN_TRASLADO") {
      return { ok: true };
    }

    if (!isMock && app) {
      const cloudFn = httpsCallable<{ servicioId: string }, { ok: boolean }>(
        functions,
        "iniciarTraslado"
      );
      try {
        await cloudFn({ servicioId });
        return { ok: true };
      } catch (err) {
        const msg = getFirebaseErrorMessage(
          err,
          "No se pudo iniciar el traslado. Revisá tu conexión e intentá de nuevo."
        );
        if (
          msg.includes("ENGANCHADO") ||
          msg.includes("ya fue cerrado")
        ) {
          const estado = await this.obtenerEstadoServicio(servicioId);
          if (estado === "EN_TRASLADO") {
            return { ok: true };
          }
        }
        throw new Error(msg);
      }
    }

    // Local / Simulation Flow
    const services = getMockServices();
    const found = services.find((s) => s.id === servicioId);
    if (found) {
      found.estado = "EN_TRASLADO";
      if (!found.eventos) found.eventos = [];
      found.eventos.push({
        tipo: "TRASLADO",
        timestamp: new Date().toISOString(),
      });
      updateMockService(found);
    }
    return { ok: true };
  },

  async registrarLlegada(
    servicioId: string,
    corralon: string,
    encargadoDeposito: string,
    geo?: { lat: number; lng: number }
  ): Promise<{ ok: true; yaRegistrada?: boolean }> {
    if (!servicioId?.trim()) {
      throw new Error("No se encontró el servicio activo. Volvé al inicio e intentá de nuevo.");
    }

    const yaRegistrada = await this.tieneEventoLlegadaCorralon(servicioId);
    if (yaRegistrada) {
      return { ok: true, yaRegistrada: true };
    }

    if (!isMock && app) {
      const cloudFn = httpsCallable<
        {
          servicioId: string;
          corralon: string;
          encargadoDeposito: string;
          geo?: { lat: number; lng: number };
        },
        { ok: boolean; yaRegistrada?: boolean }
      >(functions, "registrarLlegadaCorralon");
      try {
        const res = await cloudFn({ servicioId, corralon, encargadoDeposito, geo });
        return { ok: true, yaRegistrada: res.data.yaRegistrada };
      } catch (err) {
        const msg = getFirebaseErrorMessage(
          err,
          "No se pudo registrar la llegada al corralón. Revisá tu conexión e intentá de nuevo."
        );
        if (msg.includes("ya fue registrada")) {
          return { ok: true, yaRegistrada: true };
        }
        throw new Error(msg);
      }
    }

    // Local / Simulation Flow
    const services = getMockServices();
    const found = services.find(s => s.id === servicioId);
    if (found) {
      found.corralon = corralon;
      found.encargadoDeposito = encargadoDeposito.trim();
      if (!found.eventos) found.eventos = [];
      if (!found.eventos.some((e) => e.tipo === "LLEGADA_CORRALON")) {
        found.eventos.push({
          tipo: "LLEGADA_CORRALON",
          timestamp: new Date().toISOString(),
          geo,
          corralon,
          encargadoDeposito: encargadoDeposito.trim(),
        });
      }
      updateMockService(found);
    }
    return { ok: true };
  },

  async confirmarDesenganche(
    servicioId: string,
    fotos: Omit<Foto, "url" | "driveFileId">[],
    observacionGeneral?: string,
    fotosBase64?: string[],
    fotosSubidas?: Foto[]
  ): Promise<any> {
    const base64List = fotosBase64 ?? [];
    const fotosConUrl =
      fotosSubidas ??
      (await fotoService.subirFotosEventoLote(servicioId, "desenganche", fotos, base64List));

    if (!isMock && app) {
      const cloudFn = httpsCallable<
        {
          servicioId: string;
          fotos: Foto[];
          fotosBase64: string[];
          observacionGeneral?: string;
        },
        unknown
      >(functions, "confirmarDesenganche");
      try {
        return (
          await cloudFn({
            servicioId,
            fotos: fotosConUrl,
            fotosBase64: [],
            observacionGeneral,
          })
        ).data;
      } catch (err) {
        const msg = getFirebaseErrorMessage(
          err,
          "No se pudo confirmar el desenganche. Revisá tu conexión e intentá de nuevo."
        );
        throw new Error(msg);
      }
    }

    // Local / Simulation Flow
    const services = getMockServices();
    const found = services.find(s => s.id === servicioId);
    if (found) {
      const ahora = new Date().toISOString();
      found.estado = "DESENGANCHADO";
      found.finalizadoEn = ahora;
      if (!found.eventos) found.eventos = [];
      const idx = found.eventos.findIndex(e => e.tipo === "DESENGANCHE");
      const fotosMock: Foto[] = fotosConUrl.length > 0 ? fotosConUrl : fotos.map((f, i) => ({
        ...f,
        url: `https://placeholder.local/foto-${i}`,
        driveFileId: `mock-${i}`,
      }));
      const llegada = found.eventos.find((e) => e.tipo === "LLEGADA_CORRALON");
      const updatedEvent = {
        tipo: "DESENGANCHE" as const,
        timestamp: ahora,
        fotos: fotosMock,
        observacionGeneral: observacionGeneral || "Desenganche completado.",
        ...(llegada?.geo ? { geo: llegada.geo } : {}),
        ...(found.corralon ? { corralon: found.corralon } : {}),
        ...(found.encargadoDeposito ? { encargadoDeposito: found.encargadoDeposito } : {}),
      };
      if (idx !== -1) {
        found.eventos[idx] = { ...found.eventos[idx], ...updatedEvent };
      } else {
        found.eventos.push(updatedEvent);
      }
      updateMockService(found);
    }
    return { success: true };
  }
};

export async function actualizarServicio(data: ActualizarServicioPayload): Promise<void> {
  if (!isMock) {
    const fn = httpsCallable<ActualizarServicioPayload, { ok: boolean }>(functions, "actualizarServicio");
    await fn(data);
    return;
  }

  const services = getMockServices();
  const found = services.find((s) => s.id === data.servicioId);
  if (!found) throw new Error("Servicio no encontrado.");
  const patente = data.patente.toUpperCase().trim();
  const numeroInfraccion = data.numeroInfraccion.toUpperCase().trim();
  const legajoChofer = found.legajoChofer?.trim() || "SIM";
  const gruaId = normalizeGruaId(data.grua);
  Object.assign(found, {
    patente,
    numeroInfraccion,
    identificadorCompuesto: buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente),
    grua: gruaId,
    dupla: data.dupla,
    corralon: data.corralon ?? found.corralon,
    tipoFlota: data.tipoFlota ?? found.tipoFlota,
    encargadoDeposito:
      data.encargadoDeposito !== undefined
        ? data.encargadoDeposito?.trim() || undefined
        : found.encargadoDeposito,
  });
  updateMockService(found);
}

export async function agregarComentarioFoto(
  data: AgregarComentarioFotoPayload
): Promise<ComentarioFoto> {
  if (!isMock) {
    const fn = httpsCallable<AgregarComentarioFotoPayload, { comentario: ComentarioFoto }>(
      functions,
      "agregarComentarioFoto"
    );
    const res = await fn(data);
    return res.data.comentario;
  }

  const services = getMockServices();
  const found = services.find((s) => s.id === data.servicioId);
  if (!found?.eventos) throw new Error("Servicio o eventos no encontrados.");

  const evento = found.eventos.find((e) => e.id === data.eventoId);
  if (!evento?.fotos || data.fotoIndex < 0 || data.fotoIndex >= evento.fotos.length) {
    throw new Error("Foto no encontrada.");
  }

  const texto = data.texto.trim();
  if (!texto) throw new Error("El comentario no puede estar vacío.");

  const comentario: ComentarioFoto = {
    id: `mock-${Date.now()}`,
    texto,
    autorUid: "mock-admin",
    autorNombre: "Admin (mock)",
    creadoEn: new Date().toISOString(),
  };

  const foto = evento.fotos[data.fotoIndex];
  const previos = foto.comentarios ?? [];
  evento.fotos[data.fotoIndex] = { ...foto, comentarios: [...previos, comentario] };
  updateMockService(found);

  return comentario;
}

export async function anularServicio(data: AnularServicioPayload): Promise<void> {
  if (!isMock) {
    const fn = httpsCallable<AnularServicioPayload, { ok: boolean }>(functions, "anularServicio");
    await fn(data);
    return;
  }

  const services = getMockServices();
  const found = services.find((s) => s.id === data.servicioId);
  if (!found) throw new Error("Servicio no encontrado.");
  found.estado = "ANULADO";
  found.motivoAnulacion = data.motivo ?? null;
  updateMockService(found);
}

export async function crearActaManual(data: CrearActaManualPayload): Promise<{ servicioId: string }> {
  if (!isMock) {
    const fn = httpsCallable<CrearActaManualPayload, { servicioId: string }>(
      functions,
      "crearActaManual"
    );
    const res = await fn(data);
    return res.data;
  }

  const patente = data.patente.toUpperCase().trim();
  const numeroInfraccion = data.numeroInfraccion.toUpperCase().trim();
  const legajoChofer = data.legajoEnganchador.trim();
  if (!legajoChofer) throw new Error("El legajo del enganchador es obligatorio.");
  const gruaId = normalizeGruaId(data.grua);
  const identificadorCompuesto = buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente);
  addMockService({
    id: identificadorCompuesto,
    patente,
    numeroInfraccion,
    identificadorCompuesto,
    estado: "DESENGANCHADO",
    grua: gruaId,
    corralon: data.corralon ?? undefined,
    encargadoDeposito: data.encargadoDeposito ?? undefined,
    creadoPor: "mock-supervisor",
    legajoChofer,
    dupla: data.dupla,
    origenManual: true,
    creadoEn: new Date().toISOString(),
    finalizadoEn: new Date().toISOString(),
    eventos: [],
  } as Servicio);
  return { servicioId: identificadorCompuesto };
}
