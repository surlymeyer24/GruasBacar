import { useState, useEffect } from "react";

export interface GeoCoords {
  lat: number;
  lng: number;
}

export const useGeolocation = (watch = false) => {
  const [coordinates, setCoordinates] = useState<GeoCoords | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPosition = (position: GeolocationPosition) => {
    setCoordinates({
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    });
    setError(null);
    setLoading(false);
  };

  const applyGeoError = (err: GeolocationPositionError) => {
    let errorMsg = "Desconocido";
    switch (err.code) {
      case err.PERMISSION_DENIED:
        errorMsg = "Permiso de GPS denegado por el usuario.";
        break;
      case err.POSITION_UNAVAILABLE:
        errorMsg = "Señal de GPS no disponible.";
        break;
      case err.TIMEOUT:
        errorMsg = "Tiempo de espera agotado al conectar con el GPS.";
        break;
    }
    setError(errorMsg);
    setLoading(false);
  };

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by your browser");
      return;
    }

    setLoading(true);
    const opts: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 9000,
      maximumAge: watch ? 15000 : 0,
    };

    if (watch) {
      const watchId = navigator.geolocation.watchPosition(applyPosition, applyGeoError, opts);
      return () => navigator.geolocation.clearWatch(watchId);
    }

    navigator.geolocation.getCurrentPosition(applyPosition, applyGeoError, opts);
  }, [watch]);

  const getPosition = (): Promise<GeoCoords> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("La geolocalización no está soportada por el navegador"));
        return;
      }

      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCoordinates(coords);
          setError(null);
          setLoading(false);
          resolve(coords);
        },
        (err) => {
          let errorMsg = "Desconocido";
          switch (err.code) {
            case err.PERMISSION_DENIED:
              errorMsg = "Permiso de GPS denegado por el usuario.";
              break;
            case err.POSITION_UNAVAILABLE:
              errorMsg = "Señal de GPS no disponible.";
              break;
            case err.TIMEOUT:
              errorMsg = "Tiempo de espera agotado al conectar con el GPS.";
              break;
          }
          setError(errorMsg);
          setLoading(false);
          reject(new Error(errorMsg));
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 0 }
      );
    });
  };

  return { coordinates, loading, error, getPosition };
};
