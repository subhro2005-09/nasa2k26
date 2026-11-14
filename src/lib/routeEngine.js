/** Polyline distance, remaining length, and route-timeline events. */
import { METERS_PER_PIXEL } from '../services/coordinates.js';
import { haversineKm } from '../routing/planetRoute.js';
import { classifySurface, slopeFromDelta } from './terrainEngine.js';

export function segmentDistance(a, b) {
  if (a?.lat != null && b?.lat != null && a?.lon != null && b?.lon != null) {
    return haversineKm(a, b) * 1000;
  }
  if (a?.x != null && b?.x != null) {
    return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0)) * METERS_PER_PIXEL;
  }
  return 0;
}

export function buildSegments(points = []) {
  const segs = [];
  let acc = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dist = Math.max(0.05, segmentDistance(a, b));
    const dh = (b.elevation ?? a.elevation ?? 0) - (a.elevation ?? 0);
    const geom = slopeFromDelta(dh, dist);
    const slopeDeg = b.slope != null ? Math.sign(dh || 1) * Math.abs(b.slope) : geom.slopeDeg;
    const sample = {
      slope: slopeDeg,
      zone: !!(b.zone || a.zone),
      reported: !!(b.reported || a.reported),
      isHazard: !!(b.isHazard || a.isHazard),
      dh,
      dist,
      elevation: b.elevation ?? a.elevation ?? 0
    };
    acc += dist;
    segs.push({
      i,
      a,
      b,
      dist,
      dh,
      horiz: geom.horiz,
      slopeDeg,
      startM: acc - dist,
      endM: acc,
      sample
    });
  }
  return segs;
}

export function totalRouteDistance(points = []) {
  return buildSegments(points).reduce((sum, g) => sum + g.dist, 0);
}

export function alongMeters(points = [], alongPx = 0) {
  if (!points.length) return 0;
  const maxD = points[points.length - 1].d || 0;
  const totalM = totalRouteDistance(points);
  if (maxD > 0) return Math.min(totalM, Math.max(0, (alongPx / maxD) * totalM));
  return Math.min(totalM, Math.max(0, alongPx * METERS_PER_PIXEL));
}

export function splitAtAlong(points = [], alongPx = 0) {
  const segs = buildSegments(points);
  const totalM = segs.reduce((sum, g) => sum + g.dist, 0);
  const travelledM = alongMeters(points, alongPx);
  const remaining = [];
  for (const g of segs) {
    if (g.endM <= travelledM + 0.01) continue;
    if (g.startM >= travelledM) remaining.push(g);
    else remaining.push({ ...g, dist: g.endM - travelledM, startM: travelledM, sample: { ...g.sample, dist: g.endM - travelledM } });
  }
  const idx = remaining[0]?.i ?? Math.max(0, segs.length - 1);
  return {
    segs,
    totalM,
    travelledM,
    remainingM: Math.max(0, totalM - travelledM),
    remaining,
    idx,
    frac: totalM > 0 ? travelledM / totalM : 0
  };
}

export function buildTimeline(points = []) {
  const segs = buildSegments(points);
  const events = [{ kind: 'start', atM: 0, km: 0, title: 'START', extra: 'EVA origin' }];
  let lastKind = 'start';
  let lastAt = 0;
  for (const g of segs) {
    const surface = classifySurface(g.sample);
    const slope = Math.abs(g.sample.slope || 0);
    let kind = surface.id;
    let title = surface.label;
    let extra = 'Normal consumption';
    if (g.sample.reported || g.sample.isHazard) {
      kind = 'hazard';
      title = 'Hazard zone detected';
      extra = 'Reroute recommended';
    } else if (slope > 10 && (g.dh || 0) > 0) {
      kind = 'climb';
      title = `${slope.toFixed(0)}° uphill slope`;
      extra = 'Speed decreases · O₂ up';
    } else if (surface.id === 'rocky') {
      extra = 'O₂ consumption +15%';
    } else if (surface.id === 'sand') {
      extra = 'Loose soil · higher effort';
    } else if (surface.id === 'difficult') {
      extra = 'High-effort terrain';
    }
    if (kind !== lastKind && g.startM - lastAt > 160) {
      events.push({
        kind,
        atM: g.startM,
        km: g.startM / 1000,
        title,
        extra,
        slope,
        surface: surface.label
      });
      lastKind = kind;
      lastAt = g.startM;
    }
  }
  const endM = segs.length ? segs[segs.length - 1].endM : 0;
  events.push({ kind: 'end', atM: endM, km: endM / 1000, title: 'DESTINATION', extra: '' });
  return events;
}

export function formatHMS(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatClockMin(min) {
  return formatHMS((min || 0) * 60);
}
