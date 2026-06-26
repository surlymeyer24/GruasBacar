import { GeoPoint } from "@gruasbacar/shared";

function mapsApiKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const apiKey = mapsApiKey();
  const trimmed = address.trim();
  if (!apiKey || !trimmed) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", trimmed);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("language", "es");
    url.searchParams.set("region", "ar");

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = (await response.json()) as {
      status?: string;
      results?: { geometry?: { location?: { lat?: number; lng?: number } } }[];
    };

    if (data.status !== "OK" || !data.results?.length) return null;

    const location = data.results[0]?.geometry?.location;
    if (
      typeof location?.lat !== "number" ||
      typeof location?.lng !== "number" ||
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng)
    ) {
      return null;
    }

    return { lat: location.lat, lng: location.lng };
  } catch (error) {
    console.error("Error geocoding address:", error);
    return null;
  }
}

export async function resolveMapsLink(url: string): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!url.includes("google.com/maps") && !url.includes("maps.app.goo.gl") && !url.includes("g.page")) {
      return null;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });

    const finalUrl = response.url;
    
    // Attempt 1: Extract from /@lat,lng
    const atMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch && atMatch.length >= 3) {
      return {
        lat: parseFloat(atMatch[1]),
        lng: parseFloat(atMatch[2]),
      };
    }

    // Attempt 2: Extract from query params like ?q=lat,lng or &ll=lat,lng
    const urlObj = new URL(finalUrl);
    const qParam = urlObj.searchParams.get("q") || urlObj.searchParams.get("ll");
    if (qParam) {
      const qMatch = qParam.match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch && qMatch.length >= 3) {
        return {
          lat: parseFloat(qMatch[1]),
          lng: parseFloat(qMatch[2]),
        };
      }
    }

    // Attempt 3: The HTML body
    const html = await response.text();
    const metaMatch = html.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || html.match(/center=(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (metaMatch && metaMatch.length >= 3) {
      return {
        lat: parseFloat(metaMatch[1]),
        lng: parseFloat(metaMatch[2]),
      };
    }

    // Attempt 4: Any lat/lng pair in the HTML that looks like valid coordinates
    // Google Maps usually embeds the location in various meta tags or JS variables.
    // E.g. [null,null,-31.42,-64.18]
    const genericMatch = html.match(/(-?[1-8]?\d(?:\.\d+)?),(-?1?[0-7]?\d(?:\.\d+)?)/);
    if (genericMatch && genericMatch.length >= 3) {
      const lat = parseFloat(genericMatch[1]);
      const lng = parseFloat(genericMatch[2]);
      // Basic validation for valid lat/lng ranges
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    return null;
  } catch (error) {
    console.error("Error resolving maps link:", error);
    return null;
  }
}
