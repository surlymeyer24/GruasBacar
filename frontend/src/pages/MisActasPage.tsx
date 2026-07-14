import React, { useState, useEffect, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import {
  Search,
  Calendar,
  Truck,
  Camera,
  ChevronRight,
  X,
  Building2,
  Info,
  Users,
  MapPin,
  History,
  Link2,
  Anchor,
  PackageCheck,
  Share2,
  Download,
} from "lucide-react";
import { formatFechaHora, fechaServicio } from "../utils/formatters";
import { CORRALONES } from "../data/mockData";
import {
  Servicio,
  Evento,
  Grua,
  esOperador,
  esGeoValida,
  enganchadorDeDuplaServicio,
  eventosParaVistaActa,
  resumenDuracionActa,
  rutaInicioPorRoles,
  displayPatente,
} from "@gruasbacar/shared";
import { resolverPatenteGrua, resolverLabelGrua, tipoFlotaDeServicio } from "../utils/gruaDisplay";
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
import {
  adminServiciosScopeForUser,
  ensureAdminServicios,
  getAdminServiciosSnapshot,
} from "../services/adminServicios.cache";
import { ensureEventosServicio } from "../services/historialEventos.cache";
import MapaCoordenadasPreview from "../components/shared/MapaCoordenadasPreview";
import FotoComentariosPanel from "../components/shared/FotoComentariosPanel";
import EventoObservacionPanel from "../components/shared/EventoObservacionPanel";
import { useActaPdfCompartir } from "../hooks/useActaPdfCompartir";

/** Grilla de fotos de un evento, solo lectura, con comentarios visibles. */
const FotosEvento: React.FC<{
  evento: Evento;
  previewUrls: Record<string, string>;
}> = ({ evento, previewUrls }) => {
  if (!evento.fotos || evento.fotos.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">Sin fotos registradas.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {evento.fotos.map((img, idx) => {
        const fileId = driveFileIdDeFoto(img);
        const src = (fileId && previewUrls[fileId]) || urlFotoPreview(img);
        return (
          <div
            key={idx}
            className="border border-brand-seashell rounded-lg p-1.5 bg-brand-bg text-center"
          >
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
            <FotoComentariosPanel foto={img} puedeComentar={false} />
          </div>
        );
      })}
    </div>
  );
};

/** Lugar de un evento: mapa si hay geo válida y referencia en texto/link. */
const LugarEvento: React.FC<{ evento: Evento }> = ({ evento }) => {
  const tieneGeo = evento.geo && esGeoValida(evento.geo);
  const referencia = evento.ubicacionReferencia?.trim();

  if (!tieneGeo && !referencia) {
    return (
      <p className="text-xs text-gray-400 italic">Sin ubicación registrada.</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {tieneGeo && (
        <MapaCoordenadasPreview lat={evento.geo!.lat} lng={evento.geo!.lng} />
      )}
      {referencia && (
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
          {/^https?:\/\//i.test(referencia) ? (
            <a
              href={referencia}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-pale hover:text-brand-orange underline break-all"
            >
              {referencia}
            </a>
          ) : (
            <span>{referencia}</span>
          )}
        </p>
      )}
    </div>
  );
};

export const MisActasPage: React.FC = () => {
  const { userData, loading } = useAuth();
  const [services, setServices] = useState<Servicio[]>([]);
  const [fetching, setFetching] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedService, setSelectedService] = useState<Servicio | null>(null);
  const [selectedEventos, setSelectedEventos] = useState<Evento[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});

  const [gruasCatalog, setGruasCatalog] = useState<Grua[]>([]);
  const [corralonesCatalog, setCorralonesCatalog] = useState<CorralonCatalogo[]>([]);

  const {
    generando: generandoPdf,
    pdfListo,
    progress: pdfProgress,
    error: pdfError,
    generar,
    compartir,
    descargar,
    reiniciar: reiniciarPdf,
    canShare,
  } = useActaPdfCompartir();

  useEffect(() => {
    if (!userData) return;

    const scope = adminServiciosScopeForUser(false, userData.uid);
    const snapshot = getAdminServiciosSnapshot(scope);

    if (snapshot?.servicios) {
      setServices(snapshot.servicios);
      if (snapshot.photoCounts !== undefined) {
        setPhotoCounts(snapshot.photoCounts);
      }
      setFetching(false);
    }

    let cancelled = false;

    (async () => {
      if (!snapshot?.servicios) setFetching(true);
      try {
        const data = await ensureAdminServicios(scope, {
          withPhotoCounts: true,
          force: true,
        });
        if (!cancelled) {
          setServices(data.servicios);
          if (data.photoCounts) {
            setPhotoCounts(data.photoCounts);
          }
        }
      } catch (err) {
        console.error("Error cargando mis actas", err);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userData]);

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

  const labelGruaDe = (servicio: Servicio) =>
    resolverLabelGrua(servicio.grua, gruasCatalog);
  const patenteGruaDe = (servicio: Servicio) =>
    resolverPatenteGrua(servicio.grua, gruasCatalog);

  const getCorralonName = (id?: string) =>
    nombreCorralon(id, corralonesCatalog, CORRALONES);

  // Solo actas propias vigentes (sin anuladas), más recientes primero.
  const misActas = useMemo(
    () => services.filter((s) => s.estado !== "ANULADO"),
    [services]
  );

  const filteredServices = misActas.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.patente.toLowerCase().includes(q) ||
      patenteGruaDe(s).toLowerCase().includes(q)
    );
  });

  const handleSelectService = async (service: Servicio) => {
    reiniciarPdf();
    setSelectedService(service);
    setSelectedEventos([]);
    setPreviewUrls({});
    setLoadingEventos(true);

    try {
      const eventos = await ensureEventosServicio(service.id, service.eventos);
      setSelectedEventos(eventos);
      setLoadingEventos(false);

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
          setPreviewUrls((prev) => ({ ...prev, ...previews }));
        } catch (previewErr) {
          console.warn("[MisActasPage] No se pudieron resolver previews de Drive", previewErr);
        }
      }
    } catch (err) {
      console.error("Error cargando eventos del servicio", err);
      setLoadingEventos(false);
    }
  };

  const closeModal = () => {
    setSelectedService(null);
    setSelectedEventos([]);
    setPreviewUrls({});
    reiniciarPdf();
  };

  const handleGenerarPdf = async () => {
    if (!selectedService || selectedService.estado !== "DESENGANCHADO") return;

    const eventos =
      selectedEventos.length > 0
        ? selectedEventos
        : await ensureEventosServicio(selectedService.id, selectedService.eventos);

    const duracion = resumenDuracionActa(selectedService, eventos);

    await generar({
      servicio: selectedService,
      eventos,
      patenteGrua: labelGruaDe(selectedService),
      tipoFlota: tipoFlotaDeServicio(selectedService, gruasCatalog) ?? undefined,
      corralonNombre: selectedService.corralon
        ? getCorralonName(selectedService.corralon)
        : undefined,
      duracion,
      previewUrls,
      incluirFotos: true,
    });
  };

  const sharePdfLabel = canShare ? "Compartir PDF" : "Descargar PDF";
  const SharePdfIcon = canShare ? Share2 : Download;

  const eventosVista = useMemo(
    () =>
      selectedService
        ? eventosParaVistaActa(selectedEventos, selectedService)
        : [],
    [selectedEventos, selectedService]
  );

  const eventoEnganche = eventosVista.find((e) => e.tipo === "ENGANCHE");
  const eventoDesenganche = eventosVista.find((e) => e.tipo === "DESENGANCHE");

  if (!loading && userData && !esOperador(userData.roles)) {
    return <Navigate to={rutaInicioPorRoles(userData.roles)} replace />;
  }

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Page Head */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <History className="w-7 h-7 text-brand-cta" />
            Mis Actas
          </h1>
          <p className="text-sm text-brand-pale mt-0.5">
            Tus servicios registrados de enganche y entrega.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por patente del vehículo o de la grúa..."
            className="w-full pl-7 pr-3 py-2 bg-white border border-gray-250 rounded-xl text-[13px] leading-tight font-mono text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-cta/25 focus:border-brand-cta/40 transition-shadow"
          />
        </div>

        {/* List */}
        {fetching ? (
          <LoadingSpinner message="Cargando tus actas..." />
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-brand-seashell">
            <Info className="w-10 h-10 text-gray-350 mx-auto mb-3" />
            <h3 className="font-bold text-gray-700">No se encontraron actas</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
              {searchQuery
                ? "Ninguna de tus actas coincide con la búsqueda."
                : "Todavía no registraste servicios. Cuando completes un enganche vas a verlo acá."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-brand-seashell overflow-hidden divide-y divide-gray-100 shadow-sm">
            {filteredServices.map((service) => {
              const formattedDate = formatFechaHora(fechaServicio(service));
              const photoCount = service.totalFotos ?? photoCounts[service.id] ?? 0;
              const entregada = service.estado === "DESENGANCHADO";

              return (
                <div
                  key={service.id}
                  onClick={() => handleSelectService(service)}
                  className="p-4 transition-colors cursor-pointer flex items-center gap-3 group hover:bg-slate-50/50"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold tracking-wide text-gray-900">
                        {displayPatente(service.patente)}
                      </span>
                      {entregada ? (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-250 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
                          ENTREGADA
                        </span>
                      ) : (
                        <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2.5 py-0.5 rounded-md uppercase tracking-wide inline-block font-mono">
                          EN CURSO
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-x-6 gap-y-1 text-xs text-brand-pale">
                      <p className="flex items-center gap-1 min-w-0">
                        <Truck className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        Grúa: {labelGruaDe(service)}
                      </p>
                      <p className="flex items-center gap-1 min-w-0">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        {formattedDate}
                      </p>
                    </div>

                    {service.corralon && (
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        Entregado en:{" "}
                        <span className="font-medium text-gray-650">
                          {getCorralonName(service.corralon)}
                        </span>
                      </p>
                    )}

                    {photoCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-cta/10 text-red-600 border border-brand-cta/20">
                        <Camera className="w-3 h-3" />
                        {photoCount} fotos
                      </span>
                    )}
                  </div>

                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-cta transition-colors shrink-0" />
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Modal */}
        {selectedService && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl border border-gray-100 flex flex-col animate-in fade-in zoom-in-95 duration-150 my-auto">
              {/* Modal Header */}
              <div className="flex justify-between items-center px-5 py-4 sm:px-6 border-b border-gray-100 bg-brand-bg rounded-t-2xl shrink-0">
                <div>
                  <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest leading-none">
                    Acta de servicio
                  </span>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-bold font-mono text-gray-900">
                      {displayPatente(selectedService.patente)}
                    </h2>
                  </div>
                  <p className="text-xs text-brand-pale mt-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    Creada el {formatFechaHora(fechaServicio(selectedService))}
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="p-1 rounded-lg hover:bg-brand-seashell text-gray-400 transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto space-y-6 text-sm">
                {/* Datos generales */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 sm:p-5 rounded-xl font-mono text-xs text-gray-600 bg-brand-bg border border-gray-100">
                  <div>
                    <span className="text-gray-400 block mb-0.5">Grúa</span>
                    <span className="font-bold text-gray-900 uppercase text-sm">
                      {labelGruaDe(selectedService)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Corralón</span>
                    <span className="font-bold text-gray-900 text-sm">
                      {selectedService.corralon
                        ? getCorralonName(selectedService.corralon)
                        : "—"}
                    </span>
                  </div>
                  <div className="sm:col-span-2 pt-2 border-t border-brand-seashell">
                    <span className="text-gray-400 mb-1 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      Dupla
                    </span>
                    <p className="font-sans font-semibold text-gray-800 text-xs">
                      Chofer:{" "}
                      <span className="font-normal">
                        {selectedService.dupla?.chofer || "—"}
                      </span>{" "}
                      • Enganchador:{" "}
                      <span className="font-normal">
                        {enganchadorDeDuplaServicio(selectedService.dupla) || "—"}
                      </span>
                    </p>
                  </div>
                </div>

                {loadingEventos ? (
                  <LoadingSpinner message="Cargando fotos y ubicaciones..." />
                ) : (
                  <>
                    {/* Enganche */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-gray-900 border-b border-gray-100 pb-1 flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-brand-cta" />
                        Enganche
                        {eventoEnganche && (
                          <span className="text-[10px] text-gray-400 font-mono font-normal ml-auto">
                            {formatFechaHora(eventoEnganche.timestamp)}
                          </span>
                        )}
                      </h4>
                      {eventoEnganche ? (
                        <div className="space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                              Lugar de enganche
                            </p>
                            <LugarEvento evento={eventoEnganche} />
                          </div>
                          {eventoEnganche.observacionGeneral?.trim() && (
                            <EventoObservacionPanel
                              observacion={eventoEnganche.observacionGeneral}
                            />
                          )}
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                              Fotos del enganche
                            </p>
                            <FotosEvento
                              evento={eventoEnganche}
                              previewUrls={previewUrls}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">
                          Sin datos de enganche registrados.
                        </p>
                      )}
                    </div>

                    {/* Desenganche */}
                    <div className="space-y-3">
                      <h4 className="font-bold text-gray-900 border-b border-gray-100 pb-1 flex items-center gap-1.5">
                        <PackageCheck className="w-4 h-4 text-brand-cta" />
                        Desenganche
                        {eventoDesenganche && (
                          <span className="text-[10px] text-gray-400 font-mono font-normal ml-auto">
                            {formatFechaHora(eventoDesenganche.timestamp)}
                          </span>
                        )}
                      </h4>
                      {eventoDesenganche ? (
                        <div className="space-y-3">
                          {eventoDesenganche.corralon && (
                            <p className="text-xs text-gray-600 flex items-start gap-1.5">
                              <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                              <span>
                                Corralón:{" "}
                                <span className="font-semibold">
                                  {getCorralonName(eventoDesenganche.corralon)}
                                </span>
                              </span>
                            </p>
                          )}
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                              Lugar de desenganche
                            </p>
                            <LugarEvento evento={eventoDesenganche} />
                          </div>
                          {eventoDesenganche.observacionGeneral?.trim() && (
                            <EventoObservacionPanel
                              observacion={eventoDesenganche.observacionGeneral}
                            />
                          )}
                          <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                              Fotos del desenganche
                            </p>
                            <FotosEvento
                              evento={eventoDesenganche}
                              previewUrls={previewUrls}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
                          <Anchor className="w-3.5 h-3.5 shrink-0" />
                          El vehículo todavía no fue entregado en el corralón.
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {pdfError && (
                <div className="mx-5 sm:mx-6 mb-0 p-3 bg-red-50 text-red-700 rounded-xl border border-red-200 text-xs font-semibold shrink-0">
                  {pdfError}
                </div>
              )}

              {generandoPdf && pdfProgress && (
                <div className="mx-5 sm:mx-6 mb-0 space-y-1.5 shrink-0">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-brand-pale">
                    <span className="truncate">{pdfProgress.label}</span>
                    <span className="shrink-0 text-brand-orange">{pdfProgress.percent}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-brand-bg border border-brand-seashell overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-orange transition-[width] duration-300 ease-out"
                      style={{ width: `${pdfProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="px-5 py-3 sm:px-6 border-t border-gray-100 bg-brand-bg rounded-b-2xl shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  onClick={closeModal}
                  disabled={generandoPdf}
                  className="py-2 px-5 bg-white hover:bg-brand-seashell/40 disabled:opacity-60 text-brand-purply font-bold text-xs rounded-xl border border-brand-seashell transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                {selectedService.estado === "DESENGANCHADO" && (
                  pdfListo ? (
                    <>
                      {canShare && (
                        <button
                          type="button"
                          onClick={compartir}
                          className="py-2 px-5 bg-brand-orange hover:bg-brand-orange/90 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                        >
                          <Share2 className="w-4 h-4 shrink-0" />
                          Compartir por WhatsApp, etc.
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={descargar}
                        className={`py-2 px-5 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          canShare
                            ? "bg-white hover:bg-brand-seashell/40 text-brand-purply border border-brand-seashell"
                            : "bg-brand-orange hover:bg-brand-orange/90 text-white shadow-sm"
                        }`}
                      >
                        <Download className="w-4 h-4 shrink-0" />
                        Descargar PDF
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerarPdf}
                      disabled={generandoPdf || loadingEventos}
                      className="py-2 px-5 bg-brand-orange hover:bg-brand-orange/90 disabled:bg-brand-orange/60 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      {generandoPdf ? (
                        <>
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin shrink-0" />
                          Generando PDF...
                        </>
                      ) : (
                        <>
                          <SharePdfIcon className="w-4 h-4 shrink-0" />
                          {sharePdfLabel}
                        </>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default MisActasPage;
