import React, { useState, useEffect } from "react";
import { Servicio, Grua, enganchadorDeDuplaServicio, geoEngancheDeServicio } from "@gruasbacar/shared";
import { Users, User, FileText, Compass, Clock, ArrowRight, MapPin } from "lucide-react";
import { fechaServicio, formatFechaCorta, formatHora } from "../../utils/formatters";
import { gruaService } from "../../services/grua.service";
import { resolverPatenteGrua } from "../../utils/gruaDisplay";
import { MapaCoordenadasPreview } from "../shared/MapaCoordenadasPreview";

interface PantallaTrasladoProps {
  servicio: Servicio;
  onDesengancheClick: () => void;
}

export const PantallaTraslado: React.FC<PantallaTrasladoProps> = ({
  servicio,
  onDesengancheClick,
}) => {
  const trasladoEvent = servicio.eventos?.find((e) => e.tipo === "TRASLADO");
  const refFecha = trasladoEvent?.timestamp ?? fechaServicio(servicio);
  const timestampStr = formatHora(refFecha);
  const dateStr = formatFechaCorta(refFecha);
  const [gruasCatalog, setGruasCatalog] = useState<Grua[]>([]);

  useEffect(() => {
    gruaService.getAllGruas().then(setGruasCatalog).catch(console.error);
  }, []);

  const patenteGrua = resolverPatenteGrua(servicio.grua, gruasCatalog);
  const geoEnganche = geoEngancheDeServicio(servicio);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      
      {/* Animated Route/Transit Card */}
      <div className="bg-zinc-950 text-white rounded-2xl border border-zinc-850 p-6 shadow-2xl relative overflow-hidden animate-in fade-in duration-200">
        
        {/* Background glow effects */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand-cta/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-zinc-800/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-5">
          <div className="flex justify-between items-center bg-zinc-90 w-fit">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-cta/15 text-brand-cta font-extrabold text-[10px] rounded-lg border border-brand-cta/30 uppercase font-mono tracking-wider animate-pulse">
              <Compass className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: "3s" }} />
              Bajo Custodia (En Traslado)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Patente Infractor</span>
              <span className="font-mono font-extrabold text-2xl text-white tracking-widest">{servicio.patente}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block font-sans">Acta de Infracción</span>
              <span className="font-mono font-bold text-lg text-brand-cta tracking-wider">{servicio.numeroInfraccion}</span>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800/70 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Iniciado</span>
              <span className="font-medium text-zinc-300 flex items-center gap-1 mt-0.5">
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                {timestampStr} hs
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Fecha</span>
              <span className="font-medium text-zinc-300 block mt-0.5">{dateStr}</span>
            </div>
            <div className="col-span-2">
              <span className="text-[10px] text-zinc-500 uppercase font-bold block">Grúa Activa</span>
              <span className="font-mono font-medium text-zinc-300 block truncate mt-0.5">
                Móvil: {patenteGrua}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail breakdown Card */}
      <div className="bg-white border border-brand-seashell rounded-2xl shadow-sm p-5 space-y-4">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-gray-100">
          <FileText className="w-4 h-4 text-gray-400" />
          Personal y Recursos Asignados
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 text-xs text-gray-700">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-brand-bg w-fit rounded-lg border border-gray-100">
              <Users className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-450 uppercase block">Dupla de Chofer y Enganchador</span>
              <span className="font-semibold text-gray-850">{servicio.dupla.chofer}</span>
              <span className="block text-[10px] text-gray-400">Enganchador: {enganchadorDeDuplaServicio(servicio.dupla)}</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-brand-bg w-fit rounded-lg border border-gray-100">
              <User className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-450 uppercase block">Inspector Municipal Actuante</span>
              <span className="font-semibold text-gray-855">{servicio.dupla.inspector}</span>
              <span className="block text-[10px] text-gray-400">Oficial de Tránsito firmante</span>
            </div>
          </div>
        </div>
      </div>

      {/* Ubicación de origen (enganche) */}
      <div className="bg-white border border-brand-seashell rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-brand-cta shrink-0" />
          <h3 className="text-xs font-bold text-brand-purply uppercase tracking-widest">
            Ubicación del enganche
          </h3>
        </div>
        <p className="text-xs text-brand-pale">
          El traslado toma como origen el punto GPS registrado al iniciar el enganche.
        </p>
        {geoEnganche ? (
          <MapaCoordenadasPreview lat={geoEnganche.lat} lng={geoEnganche.lng} />
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/60 rounded-xl p-3">
            Aún no hay coordenadas del enganche. Completá las fotos del enganche para registrar la ubicación.
          </p>
        )}

        <div className="relative flex items-center justify-between text-xs px-2 pt-2">
          <span className="absolute left-[10%] right-[10%] top-6 border-t-2 border-dashed border-zinc-250 -z-10" />

          <div className="flex flex-col items-center">
            <span className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center font-bold text-xs border border-emerald-100 shadow-sm">✓</span>
            <span className="text-[10px] font-sans font-bold text-gray-400 mt-1.5">1. Enganche</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-brand-cta text-white flex items-center justify-center text-sm shadow-md shadow-brand-cta/20 border-2 border-white animate-bounce">
              🚚
            </div>
            <span className="text-[10px] font-sans font-extrabold text-brand-cta mt-1.5 animate-pulse">2. En tránsito</span>
          </div>

          <div className="flex flex-col items-center opacity-45">
            <span className="w-8 h-8 rounded-full bg-zinc-100 text-zinc-500 flex items-center justify-center font-bold text-xs border border-zinc-200">🏁</span>
            <span className="text-[10px] font-sans font-bold text-gray-400 mt-1.5">3. Corralón</span>
          </div>
        </div>
      </div>

      {/* Big prominent Action Button Card */}
      <div className="bg-white border border-brand-seashell rounded-2xl p-6 sm:p-8 shadow-sm space-y-5 text-center">
        
        <div className="space-y-1 max-w-sm mx-auto">
          <h4 className="text-base font-extrabold text-gray-900">¿Ha llegado al corralón de destino?</h4>
        </div>

        <div>
          <button
            onClick={onDesengancheClick}
            className="w-full sm:w-auto px-10 py-5 bg-brand-cta hover:bg-brand-cta-hover focus:ring-4 focus:ring-brand-cta text-white font-black text-sm uppercase rounded-2xl flex items-center justify-center gap-2.5 transition-all shadow-xl shadow-brand-cta/15 cursor-pointer hover:-translate-y-0.5 active:translate-y-0 hover:scale-[1.01]"
          >
            Proceder al Desenganche
            <ArrowRight className="w-5 h-5 text-white stroke-[2.5]" />
          </button>
        </div>

        <p className="text-[10px] text-gray-450 uppercase font-mono tracking-widest">
          Estacionar grúa antes de iniciar el registro fotográfico
        </p>

      </div>

    </div>
  );
};

export default PantallaTraslado;
