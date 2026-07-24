export interface GeoCoords {
  lat: number;
  lng: number;
}

/** Convierte GPS en formato grados/minutos/segundos a decimal. */
function parseDMS(
  dms: unknown,
  ref: unknown
): number | null {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [d, m, s] = dms;
  if (typeof d !== "number" || typeof m !== "number" || typeof s !== "number") return null;
  if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  let decimal = d + m / 60 + s / 3600;
  if (ref === "S" || ref === "W") decimal = -decimal;
  if (!Number.isFinite(decimal)) return null;
  return decimal;
}

/**
 * Extrae coordenadas GPS del EXIF de un archivo de imagen.
 * Retorna null si no hay datos GPS o si falla la lectura.
 */
export async function extractGpsFromFile(
  file: File | Blob
): Promise<GeoCoords | null> {
  try {
    const exifr = await import("exifr");

    // 1) Intentar exifr.gps() directo (funciona bien con JPEG)
    const gps = await exifr.gps(file);
    if (
      gps &&
      typeof gps.latitude === "number" &&
      typeof gps.longitude === "number" &&
      Number.isFinite(gps.latitude) &&
      Number.isFinite(gps.longitude)
    ) {
      return { lat: gps.latitude, lng: gps.longitude };
    }

    // 2) Fallback: parse sin traducir valores (para HEIC de Samsung donde gps() da null)
    const raw = await exifr.parse(file, {
      gps: true,
      translateValues: false,
      reviveValues: false,
    });
    console.info("[extractGps] raw GPS:", {
      GPSLatitude: raw?.GPSLatitude,
      GPSLongitude: raw?.GPSLongitude,
      GPSLatitudeRef: raw?.GPSLatitudeRef,
      GPSLongitudeRef: raw?.GPSLongitudeRef,
    });
    if (raw) {
      const lat = parseDMS(raw.GPSLatitude, raw.GPSLatitudeRef);
      const lng = parseDMS(raw.GPSLongitude, raw.GPSLongitudeRef);
      if (lat !== null && lng !== null) {
        return { lat, lng };
      }
    }

    // 3) Último intento: leer desde ArrayBuffer
    const buf = await file.arrayBuffer();
    const gps2 = await exifr.gps(buf);
    console.info("[extractGps] gps desde buffer:", gps2);
    if (
      gps2 &&
      typeof gps2.latitude === "number" &&
      typeof gps2.longitude === "number" &&
      Number.isFinite(gps2.latitude) &&
      Number.isFinite(gps2.longitude)
    ) {
      return { lat: gps2.latitude, lng: gps2.longitude };
    }

    return null;
  } catch {
    return null;
  }
}
