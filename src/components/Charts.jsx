import { useMemo } from 'react';
import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useTelemetry } from '../context/TelemetryContext.jsx';
import { hex } from '../lib/fmt.js';

const W = 1000, H = 100;

/** Elevation profile coloured by slope, with stations, hazards and a scrubbable astronaut marker. */
export function ProfileChart({ height = 150 }) {
  const { hazards } = useMission();
  const n = useNavigation();
  const { progress, setProgress, now } = useTelemetry();
  const points = n.points;
  const stations = n.stations;
  const metrics = n.metrics;

  const g = useMemo(() => {
    if (points.length < 2) return null;
    let lo = Infinity, hi = -Infinity;
    points.forEach((p) => { lo = Math.min(lo, p.elevation); hi = Math.max(hi, p.elevation); });
    const pad = Math.max(10, (hi - lo) * 0.15); lo -= pad; hi += pad;
    const X = (p) => (p.t * W).toFixed(1), Y = (p) => (H - ((p.elevation - lo) / (hi - lo)) * H).toFixed(1);
    const runs = ['', '', ''], cat = (p) => (p.slope > 15 ? 2 : p.slope > 8 ? 1 : 0);
    let prev = -1;
    points.forEach((p, i) => {
      if (!i) return;
      const c = cat(p), a = points[i - 1];
      runs[c] += `${c === prev ? 'L' : `M${X(a)} ${Y(a)}L`}${X(p)} ${Y(p)}`;
      prev = c;
    });
    const area = `M0 ${H}` + points.map((p) => `L${X(p)} ${Y(p)}`).join('') + `L${W} ${H}Z`;
    const band = (fn) => {
      const out = []; let s = null;
      points.forEach((p, i) => { const on = fn(p); if (on && s === null) s = p.t; if ((!on || i === points.length - 1) && s !== null) { out.push([s, on ? p.t : points[i - 1].t]); s = null; } });
      return out;
    };
    const rep = hazards.flatMap((h) => band((p) => Math.hypot(p.x - h.x, p.y - h.y) < h.r));
    return { runs, area, zones: band((p) => p.zone), rep, lo, hi, Yv: (p) => ((H - ((p.elevation - lo) / (hi - lo)) * H) / H) * 100 };
  }, [points, hazards]);

  if (!g) return <div className="well p-6 text-center text-dust" style={{ height }}>Add at least two checkpoints to see the elevation profile.</div>;
  const col = ['#6fd6a3', '#e8a53d', '#ff6b6b'];
  return (
    <div>
      <div className="chart-area" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
          <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc8cc" stop-opacity=".28" /><stop offset="1" stop-color="#7fc8cc" stop-opacity="0" /></linearGradient></defs>
          {[25, 50, 75].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="#fff" stroke-opacity=".06" vector-effect="non-scaling-stroke" />)}
          {g.zones.map(([a, b], i) => <rect key={`z${i}`} x={a * W} width={Math.max(4, (b - a) * W)} y="0" height={H} fill="#e8a53d" fill-opacity=".1" />)}
          {g.rep.map(([a, b], i) => <rect key={`r${i}`} x={a * W} width={Math.max(4, (b - a) * W)} y="0" height={H} fill="#ff6b6b" fill-opacity=".2" />)}
          <path d={g.area} fill="url(#pf)" />
          {g.runs.map((d, i) => d && <path key={i} d={d} fill="none" stroke={col[i]} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />)}
          <line x1={progress * W} x2={progress * W} y1="0" y2={H} stroke="#f4efe9" stroke-opacity=".55" vector-effect="non-scaling-stroke" />
        </svg>
        {stations.map((s, i) => (
          <span key={s.id || i} title={`${s.name || 'Station'} · ${(s.km || 0).toFixed(1)} km`} className="absolute bottom-1 -translate-x-1/2 grid place-items-center w-4.5 h-4.5 rounded-full text-[10px] font-bold text-void pointer-events-none" style={{ left: `${(s.t || 0) * 100}%`, background: s.type === 'hab' ? hex.sol : s.type === 'science' ? hex.dusk : '#a9a0ae', marginLeft: (s.t || 0) < 0.02 ? 9 : (s.t || 0) > 0.98 ? -9 : 0 }}>{s.type === 'hab' ? 'H' : s.n}</span>
        ))}
        {now && <span className="absolute w-3.5 h-3.5 rounded-full bg-bone border-[3px] border-ember -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_0_4px_rgb(228_97_58/.25)]" style={{ left: `${progress * 100}%`, top: `${g.Yv(now)}%` }} />}
        <input type="range" min="0" max="1000" value={Math.round(progress * 1000)} onInput={(e) => setProgress(e.target.value / 1000)} aria-label="Traverse position"
          aria-valuetext={now ? `${((metrics.distanceKm || 0) * progress).toFixed(1)} km, elevation ${now.elevation} m, slope ${(now.slope || 0).toFixed(1)} degrees` : ''} />
      </div>
      <div className="flex justify-between text-xs text-dust num mt-1.5"><span>0 km</span><span>peak {metrics.peakElevation} m · low {metrics.minElevation} m</span><span>{metrics.distanceKm} km</span></div>
    </div>
  );
}

const BANDS = {
  smectite: [[1.41, 0.05, 0.09], [1.92, 0.06, 0.12], [2.3, 0.05, 0.08]],
  sulfate: [[1.45, 0.05, 0.06], [1.94, 0.06, 0.1], [2.1, 0.04, 0.07], [2.4, 0.05, 0.07]],
  olivine: [[1.05, 0.2, 0.14]],
  carbonate: [[2.3, 0.04, 0.09], [2.5, 0.04, 0.1]],
  hematite: [[0.86, 0.1, 0.07], [0.53, 0.05, 0.05]]
};
const pickBands = (m = '') => { const s = m.toLowerCase(); return /smectite|clay/.test(s) ? 'smectite' : s.includes('sulfate') ? 'sulfate' : s.includes('carbonate') ? 'carbonate' : s.includes('olivine') ? 'olivine' : /hematite|iron oxide/.test(s) ? 'hematite' : 'smectite'; };

/** Representative CRISM reflectance curve for the target's dominant mineral class. */
export function SpectralChart({ mineral }) {
  const kind = pickBands(mineral), bands = BANDS[kind];
  const pts = [];
  for (let w = 0.5; w <= 2.6; w += 0.03) {
    let r = 0.22 + 0.15 * Math.log(w + 0.5);
    bands.forEach(([c, s, d]) => (r -= Math.exp(-(((w - c) / s) ** 2)) * d));
    pts.push([w, Math.max(0.05, r + Math.sin(w * 70) * 0.004)]);
  }
  const X = (w) => 36 + ((w - 0.5) / 2.1) * 300, Y = (r) => 130 - ((r - 0.1) / 0.3) * 110;
  return (
    <svg viewBox="0 0 360 160" className="w-full h-auto" role="img" aria-label={`Representative ${kind} spectrum with absorption bands at ${bands.map((b) => b[0]).join(', ')} micrometres`}>
      {[0.15, 0.25, 0.35].map((r) => <g key={r}><line x1="36" x2="336" y1={Y(r)} y2={Y(r)} stroke="#fff" stroke-opacity=".07" /><text x="30" y={Y(r) + 3} text-anchor="end" font-size="9" fill="#7d7483">{r}</text></g>)}
      <path d={pts.map(([w, r], i) => `${i ? 'L' : 'M'}${X(w).toFixed(1)} ${Y(r).toFixed(1)}`).join('')} fill="none" stroke="#7fc8cc" stroke-width="2" stroke-linejoin="round" />
      {bands.map(([c]) => <g key={c}><line x1={X(c)} x2={X(c)} y1="20" y2="130" stroke="#e4613a" stroke-dasharray="3 3" stroke-opacity=".7" /><text x={X(c)} y="14" text-anchor="middle" font-size="9" fill="#e4613a">{c}</text></g>)}
      {[0.5, 1, 1.5, 2, 2.5].map((w) => <text key={w} x={X(w)} y="148" text-anchor="middle" font-size="9" fill="#7d7483">{w}</text>)}
      <text x="336" y="158" text-anchor="end" font-size="9" fill="#a9a0ae">wavelength (µm)</text>
    </svg>
  );
}

// Diurnal temperature shape, hour -> 0..1 between the mission's min and max ground temperature.
const SHAPE = [[0, 0.03], [3, 0], [6, 0.11], [9, 0.49], [12, 0.97], [14, 1], [16, 0.8], [18, 0.46], [21, 0.17], [24, 0.06]];
export const tempAt = (h, lo, hi) => {
  let k = 1; while (k < SHAPE.length - 1 && SHAPE[k][0] < h) k++;
  const [h0, a] = SHAPE[k - 1], [h1, b] = SHAPE[k];
  return lo + (hi - lo) * (a + ((b - a) * (h - h0)) / (h1 - h0 || 1));
};

export function DiurnalChart({ lo, hi, hour }) {
  const X = (h) => 38 + (h / 24) * 410, Y = (t) => 12 + (1 - (t - lo) / (hi - lo)) * 100;
  const d = Array.from({ length: 49 }, (_, i) => `${i ? 'L' : 'M'}${X(i / 2).toFixed(1)} ${Y(tempAt(i / 2, lo, hi)).toFixed(1)}`).join('');
  const nowT = tempAt(hour, lo, hi);
  return (
    <svg viewBox="0 0 460 140" className="w-full h-auto" role="img" aria-label={`Ground temperature over a Martian day, ${Math.round(nowT)} degrees Celsius now`}>
      {[0, 0.5, 1].map((f) => { const t = lo + (hi - lo) * f; return <g key={f}><line x1="38" x2="448" y1={Y(t)} y2={Y(t)} stroke="#fff" stroke-opacity=".07" /><text x="32" y={Y(t) + 3} text-anchor="end" font-size="10" fill="#7d7483">{Math.round(t)}°</text></g>; })}
      <path d={d + `L${X(24)} 112L${X(0)} 112Z`} fill="#e4613a" fill-opacity=".1" />
      <path d={d} fill="none" stroke="#e4613a" stroke-width="2.2" stroke-linejoin="round" />
      <line x1={X(hour)} x2={X(hour)} y1="12" y2="112" stroke="#f4efe9" stroke-opacity=".5" stroke-dasharray="3 3" />
      <circle cx={X(hour)} cy={Y(nowT)} r="5" fill="#f4efe9" stroke="#e4613a" stroke-width="3" />
      {[0, 6, 12, 18, 24].map((h) => <text key={h} x={X(h)} y="130" text-anchor="middle" font-size="10" fill="#7d7483">{String(h).padStart(2, '0')}:00</text>)}
    </svg>
  );
}
