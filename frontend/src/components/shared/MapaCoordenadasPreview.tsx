import React from "react";
import { ExternalLink, MapPin } from "lucide-react";
import {
  coordenadasValidas,
  formatearCoordenadas,
  urlGoogleMaps,
  urlGoogleMapsEmbed,
} from "../../utils/googleMapsUrl";

interface MapaCoordenadasPreviewProps {
  lat: number;
  lng: number;
}

export const MapaCoordenadasPreview: React.FC<MapaCoordenadasPreviewProps> = ({ lat, lng }) => {
  if (!coordenadasValidas(lat, lng)) return null;

  return (
    <div className="space-y-2 pt-2 max-w-md">
      <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-800 bg-gray-100 dark:bg-zinc-950 shadow-sm">
        <iframe
          title={`Mapa ${formatearCoordenadas(lat, lng, 4)}`}
          src={urlGoogleMapsEmbed(lat, lng)}
          className="w-full h-40 sm:h-48 border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-mono text-gray-400">
        <MapPin className="w-3 h-3 text-red-400 shrink-0" />
        <span>Coordenadas GPS:</span>
        <a
          href={urlGoogleMaps(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-brand-pale hover:text-brand-orange underline underline-offset-2 transition-colors"
          title="Abrir en Google Maps"
        >
          {formatearCoordenadas(lat, lng)}
          <ExternalLink className="w-3 h-3 shrink-0" />
        </a>
      </div>
    </div>
  );
};

export default MapaCoordenadasPreview;
