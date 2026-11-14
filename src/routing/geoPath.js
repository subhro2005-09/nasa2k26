import { canvasToMarsCoords } from '../services/coordinates.js';
import { interpolate } from './planetRoute.js';

export function inTacticalCanvas(x, y, pad = 8) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= -pad && y >= -pad && x <= 800 + pad && y <= 600 + pad;
}

export function destGeoOf(dest) {
  if (!dest) return null;
  if (dest.lat != null && dest.lon != null) return { lat: dest.lat, lon: dest.lon };
  if (dest.coordinates?.lat != null) return { lat: dest.coordinates.lat, lon: dest.coordinates.lon };
  return null;
}

export function stampPathGeo(mission, points) {
  if (!points?.length || !mission) return points || [];
  return points.map((p) => {
    if (p.lat != null && p.lon != null) return p;
    const g = canvasToMarsCoords(mission, p.x, p.y);
    return { ...p, lat: g.lat, lon: g.lon, latStr: g.latStr, lonStr: g.lonStr };
  });
}

export function pinRouteEnds(points, origin, dest) {
  if (!points?.length) return points || [];
  const out = points.map((p) => ({ ...p }));
  if (origin) {
    out[0] = {
      ...out[0],
      x: origin.x ?? out[0].x,
      y: origin.y ?? out[0].y,
      lat: origin.lat ?? out[0].lat,
      lon: origin.lon ?? out[0].lon
    };
  }
  if (dest && out.length > 1) {
    const i = out.length - 1;
    out[i] = {
      ...out[i],
      x: dest.x ?? out[i].x,
      y: dest.y ?? out[i].y,
      lat: dest.lat ?? out[i].lat,
      lon: dest.lon ?? out[i].lon
    };
  }
  return out;
}

export function finalizeRoute(mission, route, origin, dest) {
  if (!route) return route;
  const stamped = stampPathGeo(mission, route.points || []);
  const points = pinRouteEnds(stamped, origin, dest);
  return { ...route, points };
}

/** Last-resort connected track in lat/lon so A and B never sit unlinked. */
export function fallbackGeoTrack(from, dest, n = 36) {
  if (!from || !dest || from.lat == null || dest.lat == null) return [];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const p = interpolate(from, dest, i / n);
    out.push({
      ...p,
      x: from.x + ((dest.x - from.x) * i) / n,
      y: from.y + ((dest.y - from.y) * i) / n,
      elevation: from.elevation || 0,
      slope: 0,
      band: 'caution',
      d: i,
      t: i / n
    });
  }
  return out;
}
