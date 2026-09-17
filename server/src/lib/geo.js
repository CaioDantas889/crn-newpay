// Calculo de distancia e ordenacao de rota (vizinho mais proximo).

const R = 6371; // km

export function haversine(a, b) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Ordena pontos pelo vizinho mais proximo a partir de `origin`.
 * Retorna { stops: [{...point, legKm}], totalKm }
 */
export function buildRoute(origin, points) {
  const pending = [...points];
  const stops = [];
  let current = origin;
  let totalKm = 0;

  while (pending.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    pending.forEach((p, i) => {
      const d = haversine(current, p);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const [next] = pending.splice(bestIdx, 1);
    totalKm += bestDist;
    stops.push({ ...next, legKm: Number(bestDist.toFixed(1)) });
    current = next;
  }

  return { stops, totalKm: Number(totalKm.toFixed(1)) };
}

/** Link do Google Maps com todos os pontos na ordem da rota */
export function mapsUrl(origin, stops) {
  const coords = [origin, ...stops].map((p) => `${p.lat},${p.lng}`);
  const destination = coords.pop();
  const waypoints = coords.slice(1);
  const params = new URLSearchParams({
    api: '1',
    origin: coords[0] ?? destination,
    destination,
    travelmode: 'driving',
  });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
