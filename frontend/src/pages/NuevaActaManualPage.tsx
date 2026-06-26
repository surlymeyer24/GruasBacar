import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import Layout from "../components/shared/Layout";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { FotoLoteUpload, FotosLoteResult } from "../components/shared/FotoLoteUpload";
import { FlowBackButton } from "../components/shared/FlowBackButton";
import { gruaService } from "../services/grua.service";
import { corralonService } from "../services/corralon.service";
import { crearActaManual } from "../services/servicio.service";
import { getFirebaseErrorMessage } from "../utils/firebaseError";
import { db } from "../firebase";
import { Grua, Corralon, Usuario, normalizeRoles, puedeGestionarActas } from "@gruasbacar/shared";
import { useAuth } from "../context/AuthContext";
import { rutaInicioPorRoles } from "@gruasbacar/shared";
import { FilePlus, MapPin, CheckCircle2, Truck, Users, Building2 } from "lucide-react";
import { CustomSelect } from "../components/shared/CustomSelect";

export const NuevaActaManualPage: React.FC = () => {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const [gruas, setGruas] = useState<Grua[]>([]);
  const [corralones, setCorralones] = useState<Corralon[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [patente, setPatente] = useState("");
  const [numeroInfraccion, setNumeroInfraccion] = useState("");
  const [grua, setGrua] = useState("");
  const [legajo, setLegajo] = useState("");
  const [chofer, setChofer] = useState("");
  const [enganchador, setEnganchador] = useState("");
  const [inspector, setInspector] = useState("");
  const [corralon, setCorralon] = useState("");
  const [encargadoDeposito, setEncargadoDeposito] = useState("");
  const [ubicacionEnganche, setUbicacionEnganche] = useState("");
  const [ubicacionLlegada, setUbicacionLlegada] = useState("");
  const [observacion, setObservacion] = useState("");

  const [fotosEnganche, setFotosEnganche] = useState<FotosLoteResult | null>(null);
  const [fotosDesenganche, setFotosDesenganche] = useState<FotosLoteResult | null>(null);
  const [incluirDesenganche, setIncluirDesenganche] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homePath = userData ? rutaInicioPorRoles(userData.roles) : "/login";
  const esSupervisor = userData?.roles.includes("SUPERVISOR");

  const choferes = useMemo(
    () =>
      usuarios
        .filter((u) => normalizeRoles(u.roles, u.rol).includes("CHOFER") && u.activo !== false)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  const enganchadores = useMemo(
    () =>
      usuarios
        .filter(
          (u) =>
            normalizeRoles(u.roles, u.rol).includes("ENGANCHADOR") &&
            u.activo !== false &&
            u.legajo?.trim()
        )
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]
  );

  useEffect(() => {
    Promise.all([
      gruaService.getAllGruas(),
      corralonService.getAllCorralones(),
      getDocs(collection(db, "usuarios"))
        .then((snap) =>
          snap.docs.map((d) => ({ ...(d.data() as Usuario), uid: d.id }))
        )
        .catch((err) => {
          console.error("Error cargando usuarios:", err);
          return [] as Usuario[];
        }),
    ])
      .then(([g, c, u]) => {
        setGruas(g.filter((x) => x.activa !== false));
        setCorralones(c.filter((x) => x.activo !== false));
        setUsuarios(u);
        if (g.length > 0) setGrua(g[0].patente);
      })
      .catch((err) => console.error("Error cargando catálogos:", err))
      .finally(() => setLoadingCatalog(false));
  }, []);

  const handleEnganchadorChange = (nombre: string) => {
    setEnganchador(nombre);
    const selected = enganchadores.find((u) => u.nombre === nombre);
    setLegajo(selected?.legajo?.trim() ?? "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fotosEnganche) {
      setError("Completá las fotos de enganche antes de registrar la acta.");
      return;
    }
    if (!patente.trim() || !numeroInfraccion.trim() || !grua.trim()) {
      setError("Patente, número de acta y grúa son obligatorios.");
      return;
    }
    if (!chofer.trim() || !enganchador.trim() || !inspector.trim()) {
      setError("Completá los datos de la dupla e inspector.");
      return;
    }
    if (!legajo.trim()) {
      setError("Seleccioná un enganchador con legajo registrado.");
      return;
    }
    if (incluirDesenganche && !fotosDesenganche) {
      setError("Activaste fotos de desenganche pero no las cargaste.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await crearActaManual({
        patente: patente.trim(),
        numeroInfraccion: numeroInfraccion.trim(),
        grua: grua.trim(),
        legajoEnganchador: legajo.trim(),
        corralon: corralon.trim() || null,
        encargadoDeposito: encargadoDeposito.trim() || null,
        dupla: {
          chofer: chofer.trim(),
          enganchador: enganchador.trim(),
          inspector: inspector.trim(),
        },
        ubicacionEnganche: ubicacionEnganche.trim() || undefined,
        ubicacionLlegada: ubicacionLlegada.trim() || undefined,
        observacionGeneral: observacion.trim() || undefined,
        fotosEnganche: fotosEnganche.fotosMeta,
        fotosEngancheBase64: fotosEnganche.fotosBase64,
        fotosDesenganche: incluirDesenganche ? fotosDesenganche?.fotosMeta : undefined,
        fotosDesengancheBase64: incluirDesenganche ? fotosDesenganche?.fotosBase64 : undefined,
      });
      navigate("/historial", {
        replace: true,
        state: { successMsg: `Acta manual registrada (${res.servicioId.slice(0, 8)}…).` },
      });
    } catch (err) {
      console.error(err);
      setError(getFirebaseErrorMessage(err, "No se pudo registrar la acta manual."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!userData || !puedeGestionarActas(userData.roles)) {
    return <LoadingSpinner fullScreen message="Sin permisos..." />;
  }

  if (loadingCatalog) {
    return <LoadingSpinner fullScreen message="Cargando catálogos..." />;
  }

  return (
    <Layout>
      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-mono font-bold text-brand-orange uppercase tracking-widest">
              Respaldo operativo
            </p>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">Cargar acta manual</h1>
            <p className="text-sm text-brand-pale mt-1">
              Para cuando el enganchador no pudo completar el flujo en la app. La acta queda registrada como
              entregada.
            </p>
          </div>
          <FlowBackButton onClick={() => navigate(homePath)} label="Volver" />
        </div>

        {error && (
          <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 font-medium">
            {error}
          </div>
        )}

        <section className="bg-white rounded-2xl border border-brand-seashell p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Datos del acta</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Patente</label>
              <input
                value={patente}
                onChange={(e) => setPatente(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm font-mono uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Nº infracción / acta</label>
              <input
                value={numeroInfraccion}
                onChange={(e) => setNumeroInfraccion(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm font-mono uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Grúa</label>
              <CustomSelect
                value={grua}
                onChange={setGrua}
                options={gruas.map((g) => ({
                  value: g.patente,
                  label: `${g.patente}${g.descripcion ? ` — ${g.descripcion}` : ""}`,
                }))}
                placeholder="Seleccioná grúa"
                icon={Truck}
                ariaLabel="Grúa"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Chofer</label>
              <CustomSelect
                value={chofer}
                onChange={setChofer}
                options={choferes.map((u) => ({ value: u.nombre, label: u.nombre }))}
                placeholder="Seleccioná chofer"
                icon={Users}
                ariaLabel="Chofer"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Enganchador</label>
              <CustomSelect
                value={enganchador}
                onChange={handleEnganchadorChange}
                options={enganchadores.map((u) => ({
                  value: u.nombre,
                  label: `${u.nombre}${u.legajo?.trim() ? ` (${u.legajo.trim()})` : ""}`,
                }))}
                placeholder="Seleccioná enganchador"
                icon={Users}
                ariaLabel="Enganchador"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
                Legajo enganchador
              </label>
              <input
                value={legajo}
                readOnly
                placeholder="Se completa al elegir enganchador"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono text-gray-700 cursor-not-allowed"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Inspector</label>
              <input
                value={inspector}
                onChange={(e) => setInspector(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm"
                required
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-brand-seashell p-5 space-y-3 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-brand-orange" />
            Ubicación de enganche
          </h2>
          <p className="text-xs text-gray-500">
            Dirección en texto libre o pegá un link de Google Maps. Si es URL, el sistema intenta obtener las
            coordenadas.
          </p>
          <textarea
            value={ubicacionEnganche}
            onChange={(e) => setUbicacionEnganche(e.target.value)}
            rows={2}
            placeholder="Ej: Av. Colón 1200, Córdoba — o https://maps.app.goo.gl/..."
            className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm resize-none"
          />
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Fotos de enganche</h2>
            {fotosEnganche && (
              <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Listas
              </span>
            )}
          </div>
          <FotoLoteUpload
            titulo="Fotos del enganche"
            descripcion="Podés sacar fotos o subirlas desde la galería del dispositivo."
            comentarioId="comentario-manual-enganche"
            confirmLabel="Confirmar fotos de enganche"
            permitirGaleria
            limpiarCacheAlConfirmar={false}
            onConfirm={async (result) => {
              setFotosEnganche(result);
            }}
          />
        </section>

        <section className="bg-white rounded-2xl border border-brand-seashell p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-900">Corralón (opcional)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Corralón</label>
              <CustomSelect
                value={corralon}
                onChange={setCorralon}
                options={corralones.map((c) => ({ value: c.id, label: c.nombre }))}
                placeholder="Sin corralón"
                icon={Building2}
                ariaLabel="Corralón"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Encargado depósito</label>
              <input
                value={encargadoDeposito}
                onChange={(e) => setEncargadoDeposito(e.target.value)}
                className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">
              Ubicación de llegada (opcional)
            </label>
            <textarea
              value={ubicacionLlegada}
              onChange={(e) => setUbicacionLlegada(e.target.value)}
              rows={2}
              placeholder="Dirección del corralón o link de Maps"
              className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm resize-none"
            />
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-brand-seashell p-5 space-y-3 shadow-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirDesenganche}
              onChange={(e) => {
                setIncluirDesenganche(e.target.checked);
                if (!e.target.checked) setFotosDesenganche(null);
              }}
              className="rounded border-gray-300"
            />
            <span className="text-sm font-semibold text-gray-800">Incluir fotos de desenganche</span>
          </label>
          {incluirDesenganche && (
            <FotoLoteUpload
              titulo="Fotos del desenganche"
              descripcion="Opcional pero recomendado si el vehículo ya fue entregado."
              comentarioId="comentario-manual-desenganche"
              confirmLabel="Confirmar fotos de desenganche"
              permitirGaleria
              limpiarCacheAlConfirmar={false}
              onConfirm={async (result) => {
                setFotosDesenganche(result);
              }}
            />
          )}
        </section>

        <section className="bg-white rounded-2xl border border-brand-seashell p-5 shadow-sm">
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Observaciones</label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={3}
            placeholder="Motivo del carga manual, incidentes, etc."
            className="w-full px-3 py-2 bg-brand-bg border border-gray-200 rounded-lg text-sm resize-none"
          />
        </section>

        <button
          type="submit"
          disabled={submitting || !fotosEnganche}
          className="w-full py-4 bg-brand-orange hover:bg-brand-orange/90 disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Registrando acta...
            </>
          ) : (
            <>
              <FilePlus className="w-5 h-5" />
              Registrar acta manual
            </>
          )}
        </button>

        {esSupervisor && (
          <p className="text-center text-xs text-gray-400">
            También podés{" "}
            <Link to="/historial" className="text-brand-orange font-semibold hover:underline">
              consultar el historial
            </Link>
          </p>
        )}
      </form>
    </Layout>
  );
};

export default NuevaActaManualPage;
