/** Abre la ubicación en Google Maps (web / app en móvil). */
export function urlGoogleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/** Mapa embebido sin API key (vista previa). */
export function urlGoogleMapsEmbed(lat: number, lng: number, zoom = 16): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&hl=es&output=embed`;
}

export function formatearCoordenadas(lat: number, lng: number, decimales = 6): string {
  return `${lat.toFixed(decimales)}, ${lng.toFixed(decimales)}`;
}

export function coordenadasValidas(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
