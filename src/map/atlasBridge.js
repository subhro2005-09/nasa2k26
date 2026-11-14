export const ARES_CHANNEL = 'ares';

export function postToAtlas(win, type, payload) {
  if (!win) return;
  win.postMessage({ channel: ARES_CHANNEL, type, payload }, '*');
}

export function isAresMessage(event) {
  return event.data && event.data.channel === ARES_CHANNEL;
}

export function pointsToGeo(mission, points) {
  if (!points?.length) return [];
  const cap = 220;
  const step = Math.max(1, Math.ceil(points.length / cap));
  const out = [];
  const asGeo = (p) => {
    if (p.lat != null && p.lon != null) {
      return { lat: p.lat, lon: p.lon, slope: p.slope, hazard: p.isHazard || p.zone, isHazard: !!p.isHazard, band: p.band, hazardName: p.hazardName, hazardCategory: p.hazardCategory, turn: !!p.turn, heading: p.heading };
    }
    const g = canvasToLatLon(mission, p.x, p.y);
    return { ...g, slope: p.slope, hazard: p.isHazard || p.zone, isHazard: !!p.isHazard, band: p.band || (p.isHazard ? 'hazard' : p.zone ? 'caution' : 'safe'), turn: !!p.turn, heading: p.heading };
  };
  out.push(asGeo(points[0]));
  for (let i = step; i < points.length - 1; i += step) out.push(asGeo(points[i]));
  const last = asGeo(points[points.length - 1]);
  const prev = out[out.length - 1];
  if (!prev || prev.lat !== last.lat || prev.lon !== last.lon) out.push(last);
  return out;
}

export function canvasToLatLon(mission, x, y) {
  const lonSpan = 0.08, latSpan = 0.06;
  const minLon = mission.coordinates.lon - lonSpan / 2;
  const maxLat = mission.coordinates.lat + latSpan / 2;
  return {
    lat: maxLat - (y / 600) * latSpan,
    lon: minLon + (x / 800) * lonSpan
  };
}
