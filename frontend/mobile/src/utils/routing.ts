const ORS_API_KEY = 'YOUR_OPENROUTESERVICE_API_KEY';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coords: LatLng[];
  durationSeconds: number;
  distanceMeters: number;
}

/** Real road/footpath route between two points via OpenRouteService — null if unreachable. */
export async function fetchORSRoute(start: LatLng, end: LatLng): Promise<RouteResult | null> {
  try {
    const url = `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${start.longitude},${start.latitude}&end=${end.longitude},${end.latitude}`;
    const res = await fetch(url);
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    const coords = feature.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ latitude: lat, longitude: lng }));
    const summary = feature.properties?.summary;
    return {
      coords,
      durationSeconds: summary?.duration ?? 0,
      distanceMeters: summary?.distance ?? 0,
    };
  } catch {
    return null;
  }
}

export function formatWalkDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min walk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}min walk` : `${h}h walk`;
}

export function formatWalkDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}
