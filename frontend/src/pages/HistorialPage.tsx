import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { 
  Search, 
  Filter, 
  Calendar, 
  Truck, 
  Camera, 
  FileText, 
  ChevronRight, 
  X, 
  Building2,
  Info,
  Clock,
  Pencil,
  Save,
  Tag,
  Users,
  Trash2,
  MapPin,
  FileDown,
  History,
} from "lucide-react";
import { formatFechaHora, fechaServicio, fechaDiaServicio } from "../utils/formatters";
import { isMock, db } from "../firebase";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { CORRALONES } from "../data/mockData";
import { Servicio, EstadoServicio, Evento, Grua, Usuario, TIPO_FLOTA_FILTER_OPTIONS, TIPO_FLOTA_OPTIONS, TipoFlota, matchesTipoFlotaFilter, labelTipoFlota, resumenDuracionActa, enganchadorDeDuplaServicio, puedeVerHistorialCompleto, puedeGestionarActas, esGeoValida, buildIdentificadorCompuesto, normalizeGruaId, normalizeTipoFlota, eventosParaVistaActa, VersionActa, labelTipoVersion } from "@gruasbacar/shared";
import { resolverPatenteGrua, tipoFlotaDeServicio } from "../utils/gruaDisplay";
import { nombreCorralon, CorralonCatalogo } from "../utils/corralonDisplay";
import { gruaService } from "../services/grua.service";
import { corralonService } from "../services/corralon.service";
import {
  driveFileIdDeFoto,
  etiquetaFotoLegible,
  urlFotoDrive,
  urlFotoPreview,
} from "../utils/driveUrl";
import { obtenerUrlsPreviewFotos } from "../services/drive.service";
import { actualizarServicio, anularServicio, agregarComentarioFoto } from "../services/servicio.service";
import { ensureAdminCatalog } from "../services/adminCatalog.cache";
import {
  adminServiciosScopeForUser,
  ensureAdminServicios,
  getAdminServiciosSnapshot,
  updateServicioInAdminCache,
} from "../services/adminServicios.cache";
import { Corralon } from "@gruasbacar/shared";
import MapaCoordenadasPreview from "../components/shared/MapaCoordenadasPreview";
import { CustomSelect } from "../components/shared/CustomSelect";
import { DateRangePicker } from "../components/shared/DateRangePicker";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import FotoComentariosPanel from "../components/shared/FotoComentariosPanel";
import EventoObservacionPanel from "../components/shared/EventoObservacionPanel";
import ExportActaPdfDialog from "../components/shared/ExportActaPdfDialog";
import { legajosDuplaServicio } from "../utils/legajoDisplay";

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "ENGANCHADO", label: "Enganchados" },
  { value: "EN_TRASLADO", label: "En Traslado" },
  { value: "DESENGANCHADO", label: "Entregados" },
] as const;

type HistorialTab = "general" | "anulados" | "activas";

const HISTORIAL_TABS: { id: HistorialTab; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Todas las actas, incluidas las anuladas." },
  { id: "activas", label: "Activas", description: "Todas las actas excepto las anuladas." },
  { id: "anulados", label: "Anulados", description: "Solo actas anuladas." },
];

function duplaKeyFromServicio(s: Servicio): string | null {
  const chofer = s.dupla?.chofer?.trim() ?? "";
  const enganchador = enganchadorDeDuplaServicio(s.dupla)?.trim() ?? "";
  if (!chofer && !enganchador) return null;
  return `${chofer}\0${enganchador}`;
}

function duplaLabelFromKey(key: string): string {
  const [chofer, enganchador] = key.split("\0");
  if (chofer && enganchador) return `${chofer} + ${enganchador}`;
  return chofer || enganchador;
}

function corralonKeysForServicio(
  corralonRaw: string | undefined,
  corralones: CorralonCatalogo[]
): string[] {
  if (!corralonRaw?.trim()) return [];
  const raw = corralonRaw.trim();
  const keys = new Set<string>([raw]);
  const found = corralones.find(
    (c) => c.id === raw || c.docId === raw || c.nombre === raw
  );
  if (found) {
    if (found.docId) keys.add(found.docId);
    keys.add(found.id);
    if (found.nombre?.trim()) keys.add(found.nombre.trim());
  }
  return [...keys];
}

export const HistorialPage: React.FC = () => {
  const { userData, loading } = useAuth();
  const [services, setServices] = useState<Servicio[]>([]);
  const [fetching, setFetching] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [tipoFilter, setTipoFilter] = useState<string>("ALL");
  const [duplaFilter, setDuplaFilter] = useState<string>("ALL");
  const [corralonFilter, setCorralonFilter] = useState<string>("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [historyTab, setHistoryTab] = useState<HistorialTab>("activas");

  // Detail Modal selection
  const [selectedService, setSelectedService] = useState<Servicio | null>(null);
  const [selectedEventos, setSelectedEventos] = useState<Evento[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});

  const [editingActa, setEditingActa] = useState(false);
  const [savingActa, setSavingActa] = useState(false);
  const [actaError, setActaError] = useState<string | null>(null);
  const [corralonesCatalog, setCorralonesCatalog] = useState<CorralonCatalogo[]>([]);
  const [gruasCatalog, setGruasCatalog] = useState<Grua[]>([]);

  const [editPatente, setEditPatente] = useState("");
  const [editInfraccion, setEditInfraccion] = useState("");
  const [editGrua, setEditGrua] = useState("");
  const [editCorralon, setEditCorralon] = useState("");
  const [editChofer, setEditChofer] = useState("");
  const [editEnganchador, setEditEnganchador] = useState("");
  const [editInspector, setEditInspector] = useState("");
  const [editTipoFlota, setEditTipoFlota] = useState<TipoFlota>("TRANSITO");
  const [editEncargado, setEditEncargado] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [versionesActa, setVersionesActa] = useState<VersionActa[]>([]);
  const [loadingVersiones, setLoadingVersiones] = useState(false);
  const [showAnularDialog, setShowAnularDialog] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [showExportPdfDialog, setShowExportPdfDialog] = useState(false);
  const [exportPdfProgress, setExportPdfProgress] = useState<{ percent: number; label: string } | null>(null);

  const puedeGestionar = userData ? puedeGestionarActas(userData.roles) : false;
  const historialCompleto = userData ? puedeVerHistorialCompleto(userData.roles) : false;

  useEffect(() => {
    if (!userData) return;

    const scope = adminServiciosScopeForUser(historialCompleto, userData.uid);
    const snapshot = getAdminServiciosSnapshot(scope);

    if (snapshot?.servicios) {
      setServices(snapshot.servicios);
      if (snapshot.photoCounts !== undefined) {
        setPhotoCounts(snapshot.photoCounts);
        setFetching(false);
        return;
      }
      setFetching(false);
    }

    let cancelled = false;

    (async () => {
      if (!snapshot?.servicios) setFetching(true);
      try {
        const data = await ensureAdminServicios(scope, { withPhotoCounts: true });
        if (!cancelled) {
          setServices(data.servicios);
          setPhotoCounts(data.photoCounts ?? {});
        }
      } catch (err) {
        console.error("Error reading history logs", err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userData, historialCompleto]);

  useEffect(() => {
    gruaService
      .getAllGruas()
      .then(setGruasCatalog)
      .catch((err) => console.error("Error cargando catálogo de grúas:", err));

    corralonService
      .getAllCorralones()
      .then(setCorralonesCatalog)
      .catch((err) => console.error("Error cargando catálogo de corralones:", err));
  }, []);

  useEffect(() => {
    if (!puedeGestionar) return;
    ensureAdminCatalog()
      .then((catalog) => {
        setCorralonesCatalog(
        catalog.corralones.map((c) => ({
          id: c.docId,
          docId: c.docId,
          nombre: c.nombre,
          direccion: c.direccion,
          activo: c.activo,
        }))
      );
        if (catalog.gruas.length > 0) {
          setGruasCatalog(
            catalog.gruas.map((g) => ({
              id: g.docId,
              patente: g.patente,
              descripcion: g.descripcion,
              activa: g.activa,
              tipo: g.tipo,
            }))
          );
        }
        if (catalog.corralones.length > 0) {
          setCorralonesCatalog(
            catalog.corralones.map((c) => ({
              id: c.docId,
              docId: c.docId,
              nombre: c.nombre,
              direccion: c.direccion,
              activo: c.activo,
            }))
          );
        }
      })
      .catch(() => setCorralonesCatalog(CORRALONES));
  }, [puedeGestionar]);

  const patenteGruaDe = (servicio: Servicio) =>
    resolverPatenteGrua(servicio.grua, gruasCatalog);

  const duplaFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of services) {
      const key = duplaKeyFromServicio(s);
      if (key) map.set(key, duplaLabelFromKey(key));
    }
    return [
      { value: "ALL", label: "Todas las duplas" },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [services]);

  const corralonFilterOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of corralonesCatalog) {
      map.set(c.docId ?? c.id, c.nombre);
    }
    for (const s of services) {
      const raw = s.corralon?.trim();
      if (!raw) continue;
      const found = corralonesCatalog.find(
        (c) => c.id === raw || c.docId === raw || c.nombre === raw
      );
      if (found) {
        map.set(found.docId ?? found.id, found.nombre);
      } else if (!map.has(raw)) {
        map.set(raw, nombreCorralon(raw, corralonesCatalog, CORRALONES));
      }
    }
    return [
      { value: "ALL", label: "Todos los corralones" },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es"))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [services, corralonesCatalog]);

  const getStatusBadge = (estado: EstadoServicio) => {
    switch (estado) {
      case "ENGANCHADO":
        return (
          <span className="text-[10px] bg-brand-cta/15 text-brand-cta border border-brand-cta/30 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
            ENGANCHADO
          </span>
        );
      case "EN_TRASLADO":
        return (
          <span className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
            EN TRASLADO
          </span>
        );
      case "DESENGANCHADO":
        return (
          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-250 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
            ENTREGADO (COMPLETADO)
          </span>
        );
      case "ANULADO":
        return (
          <span className="text-[10px] bg-gray-100 text-gray-500 border border-gray-200 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
            ANULADO
          </span>
        );
    }
  };

  const tabCounts = useMemo(
    () => ({
      general: services.length,
      anulados: services.filter((s) => s.estado === "ANULADO").length,
      activas: services.filter((s) => s.estado !== "ANULADO").length,
    }),
    [services]
  );

  const servicesForTab = useMemo(() => {
    if (historyTab === "anulados") return services.filter((s) => s.estado === "ANULADO");
    if (historyTab === "activas") return services.filter((s) => s.estado !== "ANULADO");
    return services;
  }, [services, historyTab]);

  const handleHistoryTabChange = (tab: HistorialTab) => {
    setHistoryTab(tab);
    if (tab === "activas" && statusFilter === "ANULADO") {
      setStatusFilter("ALL");
    }
  };

  // Filter list based on inputs
  const filteredServices = servicesForTab.filter((s) => {
    const matchesSearch = 
      s.patente.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.numeroInfraccion.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.grua.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patenteGruaDe(s).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "ALL" || s.estado === statusFilter;

    const matchesTipo =
      matchesTipoFlotaFilter(tipoFlotaDeServicio(s, gruasCatalog), tipoFilter);

    const duplaKey = duplaKeyFromServicio(s);
    const matchesDupla =
      duplaFilter === "ALL" || (duplaKey !== null && duplaKey === duplaFilter);

    const matchesCorralon =
      corralonFilter === "ALL" ||
      corralonKeysForServicio(s.corralon, corralonesCatalog).includes(corralonFilter);

    const dia = fechaDiaServicio(s);
    const matchesDateFrom = !dateFrom || (dia !== null && dia >= dateFrom);
    const matchesDateTo = !dateTo || (dia !== null && dia <= dateTo);

    return (
      matchesSearch &&
      matchesStatus &&
      matchesTipo &&
      matchesDupla &&
      matchesCorralon &&
      matchesDateFrom &&
      matchesDateTo
    );
  });

  const hasTipoFilter = tipoFilter !== "ALL";
  const hasDuplaFilter = duplaFilter !== "ALL";
  const hasCorralonFilter = corralonFilter !== "ALL";

  const handleSelectService = async (service: Servicio) => {
    setSelectedService(service);
    setSelectedEventos([]);
    setPreviewUrls({});
    setVersionesActa([]);
    setLoadingEventos(true);
    setLoadingVersiones(historialCompleto);

    const loadVersiones = async (servicioId: string) => {
      if (!historialCompleto || isMock || !db) {
        setVersionesActa([]);
        setLoadingVersiones(false);
        return;
      }
      try {
        const verQ = query(
          collection(db, `servicios/${servicioId}/versiones`),
          orderBy("version", "desc")
        );
        const verSnap = await getDocs(verQ);
        setVersionesActa(
          verSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VersionActa))
        );
      } catch (err) {
        console.error("Error cargando versiones del acta", err);
        setVersionesActa([]);
      } finally {
        setLoadingVersiones(false);
      }
    };

    try {
      let eventos: Evento[] = [];
      if (!isMock && db) {
        const evQ = query(
          collection(db, `servicios/${service.id}/eventos`),
          orderBy("timestamp", "asc")
        );
        const evSnap = await getDocs(evQ);
        eventos = evSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Evento));
      } else {
        eventos = (service.eventos ?? []).map((e, i) => ({
          ...e,
          id: e.id ?? `mock-ev-${service.id}-${i}`,
        }));
      }
      setSelectedEventos(eventos);

      await loadVersiones(service.id);

      const ids = new Set<string>();
      for (const ev of eventos) {
        for (const f of ev.fotos ?? []) {
          const id = driveFileIdDeFoto(f);
          if (id) ids.add(id);
        }
      }
      if (ids.size > 0) {
        try {
          const previews = await obtenerUrlsPreviewFotos([...ids]);
          setPreviewUrls(previews);
        } catch (previewErr) {
          console.warn("[HistorialPage] No se pudieron resolver previews de Drive", previewErr);
        }
      }
    } catch (err) {
      console.error("Error cargando eventos del servicio", err);
    } finally {
      setLoadingEventos(false);
    }
  };

  const closeModal = () => {
    setSelectedService(null);
    setSelectedEventos([]);
    setPreviewUrls({});
    setVersionesActa([]);
    setEditingActa(false);
    setEditMotivo("");
    setActaError(null);
  };

  const startEditActa = async () => {
    if (!selectedService || !puedeGestionar) return;
    setEditPatente(selectedService.patente);
    setEditInfraccion(selectedService.numeroInfraccion);
    setEditGrua(patenteGruaDe(selectedService));
    setEditCorralon(selectedService.corralon ?? "");
    setEditChofer(selectedService.dupla?.chofer ?? "");
    setEditEnganchador(enganchadorDeDuplaServicio(selectedService.dupla) ?? "");
    setEditInspector(selectedService.dupla?.inspector ?? "");
    setEditTipoFlota(tipoFlotaDeServicio(selectedService, gruasCatalog));
    setEditEncargado(selectedService.encargadoDeposito ?? "");
    setEditMotivo("");
    setActaError(null);
    setEditingActa(true);

    try {
      const catalog = await ensureAdminCatalog();
      setCorralonesCatalog(
        catalog.corralones.map((c) => ({
          id: c.docId,
          docId: c.docId,
          nombre: c.nombre,
          direccion: c.direccion,
          activo: c.activo,
        }))
      );
      if (catalog.gruas.length > 0) {
        setGruasCatalog(
          catalog.gruas.map((g) => ({
            id: g.docId,
            patente: g.patente,
            descripcion: g.descripcion,
            activa: g.activa,
            tipo: g.tipo,
          }))
        );
      }
    } catch {
      setCorralonesCatalog(CORRALONES);
    }
  };

  const cancelEditActa = () => {
    setEditingActa(false);
    setActaError(null);
  };

  const reloadVersionesActa = async (servicioId: string): Promise<VersionActa[]> => {
    if (!historialCompleto || isMock || !db) return [];
    setLoadingVersiones(true);
    try {
      const verQ = query(
        collection(db, `servicios/${servicioId}/versiones`),
        orderBy("version", "desc")
      );
      const verSnap = await getDocs(verQ);
      const list = verSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VersionActa));
      setVersionesActa(list);
      return list;
    } catch (err) {
      console.error("Error recargando versiones del acta", err);
      return [];
    } finally {
      setLoadingVersiones(false);
    }
  };

  const saveEditActa = async () => {
    if (!selectedService || !puedeGestionar) return;
    if (!editPatente.trim() || !editInfraccion.trim() || !editGrua.trim()) {
      setActaError("Patente, acta y grúa son obligatorios.");
      return;
    }
    if (!editChofer.trim() || !editEnganchador.trim() || !editInspector.trim()) {
      setActaError("Completá los datos de la dupla e inspector.");
      return;
    }

    setSavingActa(true);
    setActaError(null);
    try {
      await actualizarServicio({
        servicioId: selectedService.id,
        patente: editPatente.trim(),
        numeroInfraccion: editInfraccion.trim(),
        grua: normalizeGruaId(editGrua.trim()),
        corralon: editCorralon.trim() || null,
        tipoFlota: editTipoFlota,
        encargadoDeposito: editEncargado.trim() || null,
        motivo: editMotivo.trim() || null,
        dupla: {
          chofer: editChofer.trim(),
          enganchador: editEnganchador.trim(),
          inspector: editInspector.trim(),
        },
      });

      const patente = editPatente.toUpperCase().trim();
      const numeroInfraccion = editInfraccion.toUpperCase().trim();
      const legajoChofer = selectedService.legajoChofer?.trim() || "SIN_LEGAJO";
      const encargadoDeposito = editEncargado.trim() || undefined;

      const updated: Servicio = {
        ...selectedService,
        patente,
        numeroInfraccion,
        identificadorCompuesto: buildIdentificadorCompuesto(numeroInfraccion, legajoChofer, patente),
        grua: normalizeGruaId(editGrua.trim()),
        corralon: editCorralon.trim() || undefined,
        tipoFlota: editTipoFlota,
        encargadoDeposito,
        dupla: {
          chofer: editChofer.trim(),
          enganchador: editEnganchador.trim(),
          inspector: editInspector.trim(),
        },
      };

      const versiones = await reloadVersionesActa(updated.id);
      const versionCount = versiones[0]?.version ?? updated.versionCount;
      const withVersion = { ...updated, versionCount };

      setSelectedService(withVersion);
      setServices((prev) => prev.map((s) => (s.id === withVersion.id ? withVersion : s)));
      updateServicioInAdminCache(withVersion);
      setEditingActa(false);
      setEditMotivo("");
    } catch (err) {
      console.error(err);
      setActaError(err instanceof Error ? err.message : "No se pudo guardar la acta.");
    } finally {
      setSavingActa(false);
    }
  };

  const handleAgregarComentarioFoto = async (
    eventoId: string,
    fotoIndex: number,
    texto: string
  ) => {
    if (!selectedService || !puedeGestionar) return;

    const comentario = await agregarComentarioFoto({
      servicioId: selectedService.id,
      eventoId,
      fotoIndex,
      texto,
    });

    setSelectedEventos((prev) =>
      prev.map((ev) => {
        if (ev.id !== eventoId || !ev.fotos) return ev;
        const fotos = [...ev.fotos];
        const foto = fotos[fotoIndex];
        if (!foto) return ev;
        fotos[fotoIndex] = {
          ...foto,
          comentarios: [...(foto.comentarios ?? []), comentario],
        };
        return { ...ev, fotos };
      })
    );
  };

  const handleAnularActa = async () => {
    if (!selectedService || !puedeGestionar || anulando) return;
    setAnulando(true);
    setActaError(null);
    try {
      await anularServicio({ servicioId: selectedService.id });
      const updated: Servicio = { ...selectedService, estado: "ANULADO" };
      const versiones = await reloadVersionesActa(updated.id);
      const withVersion = {
        ...updated,
        versionCount: versiones[0]?.version ?? updated.versionCount,
      };
      setSelectedService(withVersion);
      setServices((prev) => prev.map((s) => (s.id === withVersion.id ? withVersion : s)));
      updateServicioInAdminCache(withVersion);
    } catch (err) {
      console.error(err);
      setActaError(err instanceof Error ? err.message : "No se pudo anular la acta.");
    } finally {
      setAnulando(false);
    }
  };

  const getCorralonName = (id?: string) =>
    nombreCorralon(id, corralonesCatalog, CORRALONES);

  const selectedServiceTipo = useMemo(
    () =>
      selectedService
        ? tipoFlotaDeServicio(selectedService, gruasCatalog)
        : null,
    [selectedService, gruasCatalog]
  );

  const tipoFlotaModal = useMemo(() => {
    if (!selectedService) return null;
    if (editingActa) return editTipoFlota;
    return selectedServiceTipo;
  }, [selectedService, editingActa, editTipoFlota, selectedServiceTipo]);

  const selectedDuracion = useMemo(
    () =>
      selectedService
        ? resumenDuracionActa(selectedService, selectedEventos)
        : null,
    [selectedService, selectedEventos]
  );

  const fotosEnActa = useMemo(() => {
    let total = 0;
    for (const ev of selectedEventos) {
      total += ev.fotos?.length ?? 0;
    }
    return total;
  }, [selectedEventos]);

  const eventosVista = useMemo(
    () =>
      selectedService
        ? eventosParaVistaActa(selectedEventos, selectedService)
        : [],
    [selectedEventos, selectedService]
  );

  const handleExportPdf = async (incluirFotos: boolean) => {
    if (!selectedService || exportandoPdf || loadingEventos) return;
    setExportandoPdf(true);
    setExportPdfProgress({ percent: 0, label: "Iniciando exportación…" });
    setActaError(null);
    try {
      let usuariosLegajo: Usuario[] = [];
      if (historialCompleto && db) {
        try {
          setExportPdfProgress({ percent: 8, label: "Cargando legajos del personal…" });
          const snap = await getDocs(collection(db, "usuarios"));
          usuariosLegajo = snap.docs.map((d) => ({ ...(d.data() as Usuario), uid: d.id }));
        } catch (err) {
          console.warn("[HistorialPage] No se pudo cargar usuarios para legajos", err);
        }
      }

      const { exportActaPdf } = await import("../utils/exportActaPdf");
      await exportActaPdf({
        servicio: selectedService,
        eventos: selectedEventos,
        patenteGrua: patenteGruaDe(selectedService),
        tipoFlota: selectedServiceTipo ?? undefined,
        corralonNombre: selectedService.corralon
          ? getCorralonName(selectedService.corralon)
          : undefined,
        duracion: selectedDuracion,
        previewUrls,
        incluirFotos,
        legajos: legajosDuplaServicio(selectedService, usuariosLegajo),
        onProgress: setExportPdfProgress,
      });
      setShowExportPdfDialog(false);
    } catch (err) {
      console.error(err);
      setActaError(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setExportandoPdf(false);
      setExportPdfProgress(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        
        {/* Page Head */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Historial de Operaciones
          </h1>
          <p className="text-sm text-brand-pale mt-0.5">
            {historialCompleto
              ? "Viendo el historial completo de la flota."
              : "Tus servicios registrados de enganche, traslado y entrega."}
          </p>
        </div>

        {/* Solapas de vista */}
        <div className="border border-brand-seashell rounded-2xl shadow-sm overflow-hidden bg-white">
          <div className="bg-gray-100/80 px-2 pt-2">
            <nav
              className="grid grid-cols-3 gap-0.5"
              role="tablist"
              aria-label="Vistas del historial"
            >
              {HISTORIAL_TABS.map((tab) => {
                const selected = historyTab === tab.id;
                const count = tabCounts[tab.id];
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleHistoryTabChange(tab.id)}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border border-b-0 transition-colors cursor-pointer min-w-0 ${
                      selected
                        ? "bg-white text-red-700 border-brand-seashell shadow-sm relative z-10 -mb-px"
                        : "bg-transparent text-brand-pale border-transparent hover:text-gray-700 hover:bg-white/50"
                    }`}
                  >
                    <span className="truncate">{tab.label}</span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                        selected
                          ? "bg-red-50 text-red-700"
                          : "bg-white/60 text-gray-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>

          <p className="px-4 py-2.5 text-[11px] text-brand-pale border-b border-brand-seashell bg-white">
            {HISTORIAL_TABS.find((t) => t.id === historyTab)?.description}
          </p>

          {/* Filter Toolbar */}
          <div className="p-3 space-y-2.5 bg-white">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por Patente, Acta o Grúa..."
                className="w-full pl-7 pr-3 py-2 bg-brand-bg border border-gray-250 rounded-xl text-[13px] leading-tight font-mono text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-cta/25 focus:border-brand-cta/40 transition-shadow"
              />
            </div>

            <CustomSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[...STATUS_OPTIONS]}
              ariaLabel="Filtrar por estado"
              icon={Filter}
              size="filter"
              className="w-full sm:w-52 shrink-0"
            />

            <CustomSelect
              value={tipoFilter}
              onChange={setTipoFilter}
              options={TIPO_FLOTA_FILTER_OPTIONS}
              ariaLabel="Filtrar por tipo"
              icon={Tag}
              size="filter"
              className="w-full sm:w-52 shrink-0"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2.5 pt-1 border-t border-brand-seashell/80">
            <CustomSelect
              value={duplaFilter}
              onChange={setDuplaFilter}
              options={duplaFilterOptions}
              ariaLabel="Filtrar por dupla"
              icon={Users}
              size="filter"
              className="w-full sm:w-52 shrink-0"
            />
            <CustomSelect
              value={corralonFilter}
              onChange={setCorralonFilter}
              options={corralonFilterOptions}
              ariaLabel="Filtrar por corralón"
              icon={Building2}
              size="filter"
              className="w-full sm:w-52 shrink-0"
            />
            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(from, to) => {
                setDateFrom(from);
                setDateTo(to);
              }}
              className="w-full sm:w-60 shrink-0"
            />
            {hasTipoFilter && (
              <button
                type="button"
                onClick={() => setTipoFilter("ALL")}
                className="shrink-0 px-3 py-2 text-[11px] font-bold text-brand-pale hover:text-brand-purply border border-gray-250 rounded-xl hover:bg-brand-bg transition-colors"
              >
                Limpiar tipo
              </button>
            )}
            {hasDuplaFilter && (
              <button
                type="button"
                onClick={() => setDuplaFilter("ALL")}
                className="shrink-0 px-3 py-2 text-[11px] font-bold text-brand-pale hover:text-brand-purply border border-gray-250 rounded-xl hover:bg-brand-bg transition-colors"
              >
                Limpiar dupla
              </button>
            )}
            {hasCorralonFilter && (
              <button
                type="button"
                onClick={() => setCorralonFilter("ALL")}
                className="shrink-0 px-3 py-2 text-[11px] font-bold text-brand-pale hover:text-brand-purply border border-gray-250 rounded-xl hover:bg-brand-bg transition-colors"
              >
                Limpiar corralón
              </button>
            )}
          </div>
        </div>
        </div>

        {/* Main List */}
        {fetching ? (
          <LoadingSpinner message="Consultando base de servicios..." />
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-brand-seashell">
            <Info className="w-10 h-10 text-gray-350 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700">No se encontraron actas</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              {historyTab === "anulados"
                ? "No hay actas anuladas que coincidan con los filtros aplicados."
                : historyTab === "activas"
                  ? "No hay actas activas que coincidan con los criterios de búsqueda."
                  : "No existen operaciones registradas que coincidan con los criterios de búsqueda elegidos."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-seashell overflow-hidden divide-y divide-gray-100 shadow-sm">
            {filteredServices.map((service) => {
              const formattedDate = formatFechaHora(fechaServicio(service));
              const photoCount = photoCounts[service.id] ?? 0;
              const tipoServicio = tipoFlotaDeServicio(service, gruasCatalog);
              const esTransporte = tipoServicio === "TRANSPORTE";
              const esAnulado = service.estado === "ANULADO";

              return (
                <div 
                  key={service.id} 
                  onClick={() => handleSelectService(service)}
                  className={`p-4 transition-colors cursor-pointer grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_5rem_1.25rem] items-center gap-x-3 sm:gap-x-4 gap-y-2 group ${
                    esAnulado
                      ? "bg-gray-50/90 hover:bg-gray-100/80 opacity-80"
                      : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="min-w-0 space-y-1 col-span-2 sm:col-span-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-mono text-base font-bold tracking-wide ${
                          esAnulado ? "text-gray-500" : "text-gray-900"
                        }`}
                      >
                        {service.patente}
                      </span>
                      {getStatusBadge(service.estado)}
                    </div>

                    <div
                      className={`flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-6 gap-y-1 text-xs ${
                        esAnulado ? "text-gray-400" : "text-brand-pale"
                      }`}
                    >
                      <p className="font-mono flex items-center gap-1 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        Acta: {service.numeroInfraccion}
                      </p>
                      <p className="flex items-center gap-1 min-w-0">
                        <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        Grúa: {patenteGruaDe(service)}
                      </p>
                    </div>

                    {service.corralon && (
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        Entregado en: <span className="font-medium text-gray-650">{getCorralonName(service.corralon)}</span>
                      </p>
                    )}

                    <p className={`flex items-center gap-1 text-xs sm:hidden ${esAnulado ? "text-gray-400" : "text-brand-pale"}`}>
                      <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      {formattedDate}
                      <span
                        className={`ml-2 text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                          esAnulado
                            ? "bg-gray-100 text-gray-500 border-gray-200"
                            : esTransporte
                              ? "bg-blue-50 text-blue-700 border-blue-200/50"
                              : "bg-amber-50 text-amber-700 border-amber-200/50"
                        }`}
                      >
                        {labelTipoFlota(tipoServicio)}
                      </span>
                      {photoCount > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-cta/10 text-red-600 border border-brand-cta/20">
                          <Camera className="w-3 h-3" />
                          {photoCount}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="hidden sm:flex items-center justify-center">
                    <span
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                        esAnulado
                          ? "bg-gray-100 text-gray-500 border-gray-200"
                          : esTransporte
                            ? "bg-blue-50 text-blue-700 border-blue-200/50"
                            : "bg-amber-50 text-amber-700 border-amber-200/50"
                      }`}
                    >
                      {labelTipoFlota(tipoServicio)}
                    </span>
                  </div>

                  <p
                    className={`hidden sm:flex items-center justify-end gap-1 text-xs tabular-nums ${
                      esAnulado ? "text-gray-400" : "text-brand-pale"
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-right leading-tight">{formattedDate}</span>
                  </p>

                  <div className="hidden sm:flex items-center justify-center">
                    {photoCount > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-mono bg-brand-cta/10 text-red-700 border border-brand-cta/25 whitespace-nowrap">
                        <Camera className="w-3 h-3 shrink-0" />
                        {photoCount} fotos
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400 font-mono select-none">—</span>
                    )}
                  </div>

                  <ChevronRight
                    className={`w-5 h-5 transition-colors shrink-0 justify-self-end sm:justify-self-auto ${
                      esAnulado
                        ? "text-gray-300 group-hover:text-gray-400"
                        : "text-gray-300 group-hover:text-brand-cta"
                    }`}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* Detailed Audit Modal */}
        {selectedService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-[min(90rem,calc(100vw-2rem))] min-h-[min(720px,92vh)] max-h-[95vh] rounded-2xl shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto">
              
              {/* Modal Header */}
              <div className="flex justify-between items-center px-6 py-5 sm:px-8 border-b border-gray-100 bg-brand-bg rounded-t-2xl shrink-0">
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest leading-none">Acta Digital de Secuestro</span>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {editingActa ? (
                      <input
                        value={editPatente}
                        onChange={(e) => setEditPatente(e.target.value)}
                        className="text-xl sm:text-2xl font-bold font-mono text-gray-900 uppercase bg-white border border-brand-orange/30 rounded-lg px-2.5 py-1 w-full max-w-[220px] focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                        aria-label="Patente del vehículo"
                      />
                    ) : (
                      <h2 className="text-xl sm:text-2xl font-bold font-mono text-gray-900">{selectedService.patente}</h2>
                    )}
                    {getStatusBadge(selectedService.estado)}
                    {tipoFlotaModal && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${
                          tipoFlotaModal === "TRANSPORTE"
                            ? "bg-blue-50 text-blue-700 border-blue-200/50"
                            : "bg-amber-50 text-amber-700 border-amber-200/50"
                        }`}
                      >
                        {labelTipoFlota(tipoFlotaModal ?? undefined)}
                      </span>
                    )}
                    {selectedService.origenManual && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-violet-50 text-violet-700 border-violet-200/50">
                        CARGA MANUAL
                      </span>
                    )}
                    {(selectedService.versionCount ?? versionesActa.length) > 0 && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border bg-slate-50 text-slate-600 border-slate-200/50">
                        EDITADA
                      </span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={closeModal}
                  className="p-1 rounded-lg hover:bg-brand-seashell text-gray-400 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body (Scrollable) */}
              <div className="flex-1 min-h-0 p-6 sm:p-8 overflow-y-auto space-y-6 text-sm">
                
                {actaError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold">
                    {actaError}
                  </div>
                )}

                {editingActa && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200/70 text-xs font-semibold">
                      <Pencil className="w-4 h-4 shrink-0 text-brand-cta" />
                      Modo edición — los campos resaltados son editables. Los eventos y fotos se mantienen visibles abajo.
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                        Motivo de la corrección (opcional)
                      </label>
                      <textarea
                        value={editMotivo}
                        onChange={(e) => setEditMotivo(e.target.value)}
                        rows={2}
                        placeholder="Ej: error de tipeo en patente, cambio de dupla asignada..."
                        className="w-full px-3 py-2 bg-white border border-brand-orange/25 rounded-lg text-sm resize-none focus:outline-none focus:ring-1 focus:ring-brand-orange/30"
                      />
                    </div>
                  </div>
                )}

                {/* Info parameters */}
                <div
                  className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5 sm:p-6 rounded-xl font-mono text-xs text-gray-600 border ${
                    editingActa
                      ? "bg-orange-50/20 border-brand-orange/25"
                      : "bg-brand-bg border-gray-100"
                  }`}
                >
                  <div>
                    <span className="text-gray-400 block mb-0.5">Nro de Infracción</span>
                    {editingActa ? (
                      <input
                        value={editInfraccion}
                        onChange={(e) => setEditInfraccion(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-brand-orange/30 rounded-lg text-sm font-bold font-mono uppercase text-gray-900 focus:outline-none focus:ring-1 focus:ring-brand-orange/40"
                      />
                    ) : (
                      <span className="font-bold text-gray-900 uppercase text-sm">{selectedService.numeroInfraccion}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Grúa Patente</span>
                    {editingActa ? (
                      <CustomSelect
                        value={editGrua}
                        onChange={setEditGrua}
                        options={[
                          ...gruasCatalog.map((g) => ({
                            value: g.patente,
                            label: `${g.patente}${g.descripcion ? ` — ${g.descripcion}` : ""}`,
                          })),
                          ...(!gruasCatalog.some((g) => g.patente === editGrua) && editGrua
                            ? [{ value: editGrua, label: editGrua }]
                            : []),
                        ]}
                        icon={Truck}
                        ariaLabel="Grúa patente"
                        size="sm"
                      />
                    ) : (
                      <span className="font-bold text-gray-900 uppercase text-sm">
                        {patenteGruaDe(selectedService)}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Tipo de operación</span>
                    {editingActa ? (
                      <CustomSelect
                        value={editTipoFlota}
                        onChange={(v) => setEditTipoFlota(normalizeTipoFlota(v))}
                        options={TIPO_FLOTA_OPTIONS}
                        icon={Tag}
                        ariaLabel="Tipo de operación"
                        size="sm"
                      />
                    ) : (
                      <span
                        className={`inline-flex font-bold text-sm px-2.5 py-0.5 rounded-lg border ${
                          tipoFlotaModal === "TRANSPORTE"
                            ? "bg-blue-50 text-blue-700 border-blue-200/50"
                            : "bg-amber-50 text-amber-700 border-amber-200/50"
                        }`}
                      >
                        {labelTipoFlota(tipoFlotaModal ?? undefined)}
                      </span>
                    )}
                  </div>
                  {selectedDuracion && (
                    <>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Inicio del servicio</span>
                        <span className="font-bold text-gray-900 text-sm">
                          {formatFechaHora(selectedDuracion.inicio)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">
                          {selectedDuracion.enCurso ? "Tiempo transcurrido" : "Finalización"}
                        </span>
                        <span className="font-bold text-gray-900 text-sm">
                          {selectedDuracion.enCurso
                            ? selectedDuracion.etiqueta
                            : formatFechaHora(selectedDuracion.fin)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-0.5">Duración total</span>
                        <span
                          className={`inline-flex font-bold text-sm px-2.5 py-0.5 rounded-lg border ${
                            selectedDuracion.enCurso
                              ? "bg-amber-50 text-amber-700 border-amber-200/50"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                          }`}
                        >
                          {selectedDuracion.etiqueta}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-brand-seashell">
                    <span className="text-gray-400 block mb-1">Personal de la Dupla</span>
                    {editingActa ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-sans">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Chofer</label>
                          <input
                            value={editChofer}
                            onChange={(e) => setEditChofer(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-brand-orange/30 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-orange/40"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Enganchador</label>
                          <input
                            value={editEnganchador}
                            onChange={(e) => setEditEnganchador(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-brand-orange/30 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-orange/40"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Inspector</label>
                          <input
                            value={editInspector}
                            onChange={(e) => setEditInspector(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-brand-orange/30 rounded-lg text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-orange/40"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-sans font-semibold text-gray-800 text-xs">
                          Chofer: <span className="font-normal">{selectedService.dupla?.chofer}</span> • Enganchador: <span className="font-normal">{enganchadorDeDuplaServicio(selectedService.dupla)}</span>
                        </p>
                        <p className="font-sans font-semibold text-gray-800 text-xs mt-0.5">
                          Inspector Actuante: <span className="font-normal">{selectedService.dupla?.inspector}</span>
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Timeline Events */}
                <div className="space-y-4">
                  <h4 className="font-bold text-gray-900 border-b border-gray-100 pb-1 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-brand-cta" />
                    Pasos Registrados en Ruta
                  </h4>

                  {loadingEventos ? (
                    <LoadingSpinner message="Cargando eventos y fotos..." />
                  ) : eventosVista.length === 0 ? (
                    <p className="text-sm text-brand-pale text-center py-4">No hay eventos registrados para esta acta.</p>
                  ) : (
                  <div className="relative pl-6 border-l border-brand-seashell space-y-5">
                    {eventosVista.map((evento, i) => {
                      const formattedEvTime = formatFechaHora(evento.timestamp);
                      const corralonEvento =
                        evento.tipo === "DESENGANCHE" && evento.corralon
                          ? getCorralonName(evento.corralon)
                          : null;

                      return (
                        <div key={evento.id ?? i} className="relative">
                          {/* Circle dot on list */}
                          <span className="absolute -left-[30px] top-1.5 w-4.5 h-4.5 rounded-full bg-white border-2 border-brand-cta flex items-center justify-center font-bold text-[8px]" />
                          
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-red-600 font-mono tracking-wider">
                                EVENTO: {evento.tipo}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono">{formattedEvTime}</span>
                            </div>

                            {corralonEvento && (
                              <p className="text-xs text-gray-600 flex items-start gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                <span>
                                  Corralón: <span className="font-semibold">{corralonEvento}</span>
                                  {evento.encargadoDeposito?.trim() && (
                                    <>
                                      {" "}
                                      · Encargado:{" "}
                                      <span className="font-semibold">{evento.encargadoDeposito.trim()}</span>
                                    </>
                                  )}
                                </span>
                              </p>
                            )}

                            {evento.observacionGeneral?.trim() && (
                              <EventoObservacionPanel observacion={evento.observacionGeneral} />
                            )}

                            {evento.geo && esGeoValida(evento.geo) && (
                              <MapaCoordenadasPreview lat={evento.geo.lat} lng={evento.geo.lng} />
                            )}

                            {evento.ubicacionReferencia?.trim() && (
                              <p className="text-xs text-gray-600 flex items-start gap-1.5 mt-1">
                                <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                                {/^https?:\/\//i.test(evento.ubicacionReferencia) ? (
                                  <a
                                    href={evento.ubicacionReferencia}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-brand-pale hover:text-brand-orange underline break-all"
                                  >
                                    {evento.ubicacionReferencia}
                                  </a>
                                ) : (
                                  <span>{evento.ubicacionReferencia}</span>
                                )}
                              </p>
                            )}

                            {/* Event specific photo rolls */}
                            {evento.fotos && evento.fotos.length > 0 && (
                              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 pt-2">
                                {evento.fotos.map((img, idx) => {
                                  const fileId = driveFileIdDeFoto(img);
                                  const src = (fileId && previewUrls[fileId]) || urlFotoPreview(img);
                                  const eventoId = evento.id;
                                  return (
                                  <div key={idx} className="border border-brand-seashell rounded-lg p-1.5 bg-brand-bg text-center">
                                    <a href={urlFotoDrive(img)} target="_blank" rel="noopener noreferrer">
                                      <img 
                                        src={src}
                                        alt={img.etiqueta} 
                                        className="rounded w-full aspect-video object-cover bg-black"
                                        referrerPolicy="no-referrer"
                                        loading="lazy"
                                      />
                                    </a>
                                    <p className="text-[9px] font-bold text-gray-750 mt-1 uppercase">
                                      {etiquetaFotoLegible(img.etiqueta)}
                                    </p>
                                    <FotoComentariosPanel
                                      foto={img}
                                      puedeComentar={puedeGestionar && Boolean(eventoId)}
                                      onAgregarComentario={
                                        eventoId
                                          ? (texto) => handleAgregarComentarioFoto(eventoId, idx, texto)
                                          : undefined
                                      }
                                    />
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>

                {(editingActa || selectedService.corralon || selectedService.encargadoDeposito?.trim()) && (
                  <div
                    className={`p-4 border rounded-xl flex items-start gap-3 ${
                      editingActa
                        ? "border-brand-orange/25 bg-orange-50/15"
                        : "border-emerald-150 bg-emerald-50/10"
                    }`}
                  >
                    <Building2 className={`w-5 h-5 shrink-0 mt-0.5 ${editingActa ? "text-brand-orange" : "text-emerald-500"}`} />
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-xs font-bold uppercase tracking-widest leading-none ${editingActa ? "text-brand-orange" : "text-emerald-800"}`}>
                        Estadía del Vehículo
                      </h4>
                      {editingActa ? (
                        <div className="mt-2 space-y-2">
                          <CustomSelect
                            value={editCorralon}
                            onChange={setEditCorralon}
                            options={corralonesCatalog.map((c) => ({
                              value: c.docId ?? c.id,
                              label: c.nombre,
                            }))}
                            placeholder="Sin corralón"
                            icon={Building2}
                            ariaLabel="Corralón"
                            size="sm"
                            className="max-w-md"
                          />
                          <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">
                              Encargado de depósito
                            </label>
                            <input
                              value={editEncargado}
                              onChange={(e) => setEditEncargado(e.target.value)}
                              placeholder="Nombre del encargado"
                              className="w-full max-w-md px-2.5 py-1.5 bg-white border border-brand-orange/30 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-brand-orange/40"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-gray-800 mt-1">
                            {getCorralonName(selectedService.corralon)}
                          </p>
                          {selectedService.encargadoDeposito?.trim() && (
                            <p className="text-xs text-gray-600 mt-1">
                              Encargado: <span className="font-semibold">{selectedService.encargadoDeposito}</span>
                            </p>
                          )}
                        </>
                      )}
                      {!editingActa && (
                        <p className="text-xs text-gray-400">
                          El remolque se completó de forma segura y el auto fue resguardado en la playa elegida.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {historialCompleto && (
                  <div className="p-5 rounded-xl border border-gray-100 bg-white shadow-sm space-y-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-brand-pale" />
                      <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest">
                        Historial de cambios
                      </h3>
                    </div>
                    {loadingVersiones ? (
                      <p className="text-xs text-brand-pale text-center py-3">Cargando revisiones...</p>
                    ) : versionesActa.length === 0 ? (
                      <p className="text-xs text-brand-pale text-center py-4 bg-brand-bg rounded-xl border border-brand-seashell border-dashed">
                        Sin revisiones registradas.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {versionesActa.map((version) => (
                          <div
                            key={version.id ?? `v-${version.version}`}
                            className="p-3 rounded-xl border border-brand-seashell bg-brand-bg/60 text-xs"
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="font-semibold text-gray-900">
                                {version.editadoPorNombre}
                                <span className="text-gray-400 font-normal ml-1.5">
                                  ({version.editadoPorRol === "ADMIN" ? "Admin" : version.editadoPorRol === "SUPERVISOR" ? "Supervisor" : "Operador"})
                                </span>
                              </p>
                              <span className="text-[10px] font-bold uppercase tracking-wide text-brand-pale">
                                {labelTipoVersion(version.tipo)} · v{version.version}
                              </span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                              {formatFechaHora(version.editadoEn)}
                            </p>
                            {version.motivo?.trim() && (
                              <p className="text-[11px] text-gray-600 mt-1.5 italic">
                                Motivo: {version.motivo.trim()}
                              </p>
                            )}
                            <ul className="mt-2 space-y-1">
                              {version.cambios.map((cambio) => (
                                <li key={`${version.version}-${cambio.campo}`} className="text-[11px] text-gray-700">
                                  <span className="font-semibold text-gray-800">{cambio.etiqueta}:</span>{" "}
                                  <span className="text-gray-500">{cambio.valorAnterior ?? "—"}</span>
                                  {" → "}
                                  <span className="font-medium text-gray-900">{cambio.valorNuevo ?? "—"}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 sm:px-8 border-t border-brand-seashell justify-end flex flex-wrap gap-2.5 shrink-0">
                {puedeGestionar && selectedService.estado !== "ANULADO" && (
                  editingActa ? (
                    <>
                      <button
                        type="button"
                        onClick={cancelEditActa}
                        disabled={savingActa}
                        className="px-4 py-2 border border-gray-250 rounded-xl text-xs font-bold hover:bg-brand-bg text-gray-600 cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveEditActa}
                        disabled={savingActa}
                        className="px-4 py-2 bg-brand-cta hover:bg-red-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {savingActa ? "Guardando..." : "Guardar cambios"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={startEditActa}
                        disabled={anulando}
                        className="px-4 py-2 border border-brand-cta/40 text-red-700 rounded-xl text-xs font-bold hover:bg-red-50 flex items-center gap-1.5 cursor-pointer mr-auto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar acta
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAnularDialog(true)}
                        disabled={anulando}
                        className="px-4 py-2 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Anular acta
                      </button>
                    </>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setShowExportPdfDialog(true)}
                  disabled={exportandoPdf || loadingEventos || editingActa}
                  className="px-4 py-2 border border-brand-orange/40 text-brand-orange rounded-xl text-xs font-bold hover:bg-orange-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  {exportandoPdf ? "Generando PDF..." : "Exportar PDF"}
                </button>
                <button 
                  onClick={closeModal}
                  className="px-4 py-2 border border-gray-250 rounded-xl text-xs font-bold hover:bg-brand-bg text-gray-600 cursor-pointer"
                >
                  Cerrar Acta
                </button>
              </div>

              {exportandoPdf && exportPdfProgress && !showExportPdfDialog && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-brand-pale">
                    <span className="truncate">{exportPdfProgress.label}</span>
                    <span className="shrink-0 text-brand-orange">{exportPdfProgress.percent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-brand-bg border border-brand-seashell overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-orange transition-[width] duration-300 ease-out"
                      style={{ width: `${exportPdfProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        <ConfirmDialog
          isOpen={showAnularDialog}
          onClose={() => setShowAnularDialog(false)}
          onConfirm={handleAnularActa}
          title="Anular acta"
          message={`¿Confirmás la anulación del acta ${selectedService?.patente} (N° ${selectedService?.numeroInfraccion})? El servicio quedará marcado como anulado.`}
          confirmText={anulando ? "Anulando..." : "Anular acta"}
          danger
        />

        <ExportActaPdfDialog
          isOpen={showExportPdfDialog}
          onClose={() => setShowExportPdfDialog(false)}
          onConfirm={handleExportPdf}
          cantidadFotos={fotosEnActa}
          exportando={exportandoPdf}
          exportProgress={exportPdfProgress}
        />

      </div>
    </Layout>
  );
};

export default HistorialPage;
