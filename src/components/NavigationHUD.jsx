import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useDecision } from '../context/DecisionContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { hm, hex } from '../lib/fmt.js';
import { riskLabel } from '../lib/terrainEngine.js';
import { Meter, Seg } from '../lib/ui.jsx';
import { toast } from '../lib/toast.js';
import { hazardCopy } from '../routing/planetRoute.js';

const MODES = [
  { id: 'observe', label: 'Observe', hint: 'Inspect terrain without moving' },
  { id: 'walk', label: 'Walk', hint: 'WASD or the stick to move from where you stand' },
  { id: 'navigate', label: 'Navigate', hint: 'Follow the solved route from your position' }
];
const CAM = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'astronaut', label: 'Astronaut' }
];

export function NavigationHUD() {
  const m = useMission();
  const n = useNavigation();
  const { setView } = useUi();
  const a = n.astronaut;
  const o2 = n.plss.o2RemainingPercent;
  const destName = n.destination?.name || (n.points.length ? 'Planned traverse' : 'None');
  return (
    <section className="card p-4 flex flex-col gap-3" aria-label="ARES navigation">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label">ARES navigation</div>
          <div className="font-semibold text-[15px] mt-0.5">You</div>
        </div>
        <span className="tag tag-info">{n.headingText}</span>
      </div>
      <div className="well p-3">
        <div className="num text-[15px] font-semibold">{a.latStr}, {a.lonStr}</div>
        <div className="text-xs text-dust mt-1">Elevation {a.elevation} m · slope {(a.slope || 0).toFixed(1)}°</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="compass" aria-hidden="true">
          <i style={{ transform: `rotate(${a.heading}deg)` }} />
          <span>N</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="label">Next action</div>
          <div className="font-semibold text-[13px]">{n.instruction.text}</div>
          {n.instruction.caution && <div className="text-xs text-butter mt-0.5">{n.instruction.caution}</div>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="well p-2.5"><div className="label">Destination</div><div className="font-semibold truncate">{destName}</div></div>
        <div className="well p-2.5"><div className="label">Remaining</div><div className="num font-semibold">{(n.remainingKm || 0).toFixed(2)} km</div></div>
        <div className="well p-2.5"><div className="label">ETA</div><div className="num font-semibold">{n.etaMin} min</div></div>
        <div className="well p-2.5"><div className="label">O₂</div><div className="num font-semibold" style={{ color: o2 < 25 ? hex.hazard : hex.dusk }}>{o2}% · {(n.eva?.oxygenRemaining ?? 0).toFixed(1)} kg</div><Meter pct={o2} color={o2 < 25 ? hex.hazard : hex.dusk} label="Oxygen" /></div>
      </div>
      <div className="min-w-0 overflow-x-auto"><Seg label="Control mode" value={n.controlMode} onChange={n.setControlMode} options={MODES} /></div>
      <div className="min-w-0 overflow-x-auto"><Seg label="Camera" value={n.cameraMode} onChange={n.setCameraMode} options={CAM} /></div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={n.locateAstronaut}><Icon n="target" s={14} /><span className="truncate">Locate</span></button>
        <button className="btn" onClick={n.returnToBase}><Icon n="home" s={14} /><span className="truncate">Return</span></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-pri" onClick={n.beginTraverse}><Icon n={n.following ? 'pause' : 'play'} s={14} fill={!n.following} /><span className="truncate">{n.following ? 'Pause EVA' : 'Begin EVA'}</span></button>
        <button className="btn" onClick={() => setView('science')}><Icon n="flask" s={14} /><span className="truncate">Science</span></button>
      </div>
      {n.controlMode === 'walk' && <WalkStick value={n.stick} onChange={n.setStick} />}
      <p className="text-xs text-dust">{n.controlMode === 'walk' ? 'W/S walk · A/D turn. Speed drops on slope and hazards.' : n.controlMode === 'navigate' ? `Following the ${m.routeMode} route from your last fix.` : 'Click any point on the map. Three routes appear with distance and EVA time.'}</p>
    </section>
  );
}

function WalkStick({ value, onChange }) {
  const set = (forward, turn) => onChange({ forward, turn });
  return (
    <div className="well p-3 flex items-center justify-between gap-3">
      <div className="text-xs text-dust">Stick</div>
      <div className="flex flex-col items-center gap-1">
        <button className="icon-btn !w-9 !h-9" onPointerDown={() => set(1, 0)} onPointerUp={() => set(0, 0)} onPointerLeave={() => set(0, 0)} aria-label="Forward">W</button>
        <div className="flex gap-1">
          <button className="icon-btn !w-9 !h-9" onPointerDown={() => set(0, -1)} onPointerUp={() => set(0, 0)} onPointerLeave={() => set(0, 0)} aria-label="Turn left">A</button>
          <button className="icon-btn !w-9 !h-9" onPointerDown={() => set(-0.55, 0)} onPointerUp={() => set(0, 0)} onPointerLeave={() => set(0, 0)} aria-label="Back">S</button>
          <button className="icon-btn !w-9 !h-9" onPointerDown={() => set(0, 1)} onPointerUp={() => set(0, 0)} onPointerLeave={() => set(0, 0)} aria-label="Turn right">D</button>
        </div>
      </div>
      <div className="num text-xs text-dim w-10">{value.forward ? 'MOV' : 'IDL'}</div>
    </div>
  );
}

const ROUTE_TONE = {
  safe: { label: 'Safest', color: '#6fd6a3', hint: 'Low slope, avoid hazards, keep return margin' },
  direct: { label: 'Fastest', color: '#5b9cff', hint: 'Cheapest time; still not a straight line' },
  science: { label: 'Science', color: '#c084fc', hint: 'Detours through nearby high-value targets' }
};
const EVA_LIMIT_MIN = 480;

function routeStats(r) {
  const km = r?.eva?.remainingM != null ? r.eva.remainingM / 1000 : r?.metrics?.distanceKm;
  const min = r?.eva?.remainingMin ?? r?.metrics?.estimatedTimeMin ?? 0;
  const over = min > EVA_LIMIT_MIN;
  return {
    km: km != null ? Number(km) : null,
    min: Math.round(min),
    time: hm(min),
    limit: over ? 'Over 8h suit limit' : 'Inside 8h suit limit',
    over,
    o2: r?.eva?.oxygenKg,
    batt: r?.eva?.batteryPct,
    slope: r?.metrics?.maxSlope || 0,
    climb: r?.eva?.climbM ?? r?.metrics?.elevationGain ?? 0,
    risk: riskLabel(r?.eva?.meanRisk || 0),
    speed: r?.eva?.meanSpeed || 0,
    fatigue: r?.eva?.fatigueEnd || 0,
    trav: r?.metrics?.avgTraversability
  };
}

export function RouteComparison() {
  const m = useMission();
  const n = useNavigation();
  const d = useDecision();
  if (!n.destination) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold text-[15px]">Three routes</h2>
        <p className="text-xs text-dust mt-1">Click any point on the map. ARES solves Safest, Fastest and Science from your position, each with distance, walking time, O₂, battery and risk.</p>
      </section>
    );
  }
  if (!n.comparisons) return null;
  const scored = Object.fromEntries((d?.comparison?.routes || []).map((r) => [r.type, r]));
  const rec = d?.comparison?.recommended_route;
  const why = n.routeExplain;
  return (
    <section className="card p-4" aria-label="Three solved routes">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-semibold text-[15px]">Three routes to {n.destination.name}</h2>
        <span className="text-xs text-dust">{n.routeRank?.recommended ? `${ROUTE_TONE[n.routeRank.recommended]?.label || n.routeRank.recommended} lowest cost` : rec ? `engine: ${rec}` : 'A* from you'}</span>
      </div>
      <div className="flex flex-col gap-2">
        {['safe', 'direct', 'science'].map((id) => {
          const meta = ROUTE_TONE[id];
          const r = n.comparisons[id];
          const st = routeStats(r);
          const on = m.routeMode === id;
          const s = scored[id.toUpperCase()] || scored[id === 'direct' ? 'DIRECT' : id.toUpperCase()];
          return (
            <button key={id} type="button" onClick={() => m.setRouteMode(id)} className={`well p-3 text-left ${on ? '!border-dusk/50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[13px] flex items-center gap-2">
                  <i className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                  {meta.label}{on ? ' · selected' : ''}{n.routeRank?.recommended === id ? ' · rec' : ''}
                </span>
                <span className={`tag ${st.over ? 'tag-hold' : 'tag-go'}`}>{st.over ? 'Over 8h' : '≤ 8h'}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[12px]">
                <div><span className="text-dust">Distance</span> <span className="num font-semibold">{st.km != null ? `${st.km.toFixed(2)} km` : '—'}</span></div>
                <div><span className="text-dust">Time</span> <span className="num font-semibold">{st.time}</span></div>
                <div><span className="text-dust">O₂</span> <span className="num font-semibold">{st.o2 != null ? `${st.o2.toFixed(1)} kg` : '—'}</span></div>
                <div><span className="text-dust">Battery</span> <span className="num font-semibold">{st.batt == null ? '—' : st.batt > 100 ? '>100%' : `${st.batt.toFixed(0)}%`}</span></div>
                <div><span className="text-dust">Max slope</span> <span className="num font-semibold" style={{ color: st.slope > 15 ? hex.hazard : undefined }}>{st.slope.toFixed(1)}°</span></div>
                <div><span className="text-dust">Climb</span> <span className="num font-semibold">{Math.round(st.climb)} m</span></div>
                <div><span className="text-dust">Risk</span> <span className="font-semibold">{st.risk}</span></div>
                <div><span className="text-dust">Speed</span> <span className="num font-semibold">{st.speed.toFixed(2)} m/s</span></div>
              </div>
              <div className="text-[11px] text-dust mt-2">{meta.hint} · fatigue {Math.round(st.fatigue)}{s ? ` · score ${s.safety_score}` : ''}{st.trav != null ? ` · trav ${st.trav}%` : ''}</div>
            </button>
          );
        })}
      </div>
      {why && <p className="text-[12px] text-dust mt-3 leading-relaxed">{why.text}</p>}
    </section>
  );
}

export function SafeReturnPanel() {
  const n = useNavigation();
  const s = n.safeReturn;
  const tone = s.status === 'ponr' ? 'tag-hold' : s.status === 'low' ? 'tag-caution' : 'tag-go';
  const title = s.status === 'ponr' ? 'Point of no return' : s.status === 'low' ? 'Return margin low' : 'Safe return: nominal';
  const detail = s.status === 'ponr'
    ? `Walk-back needs ${s.needKg ?? ((s.needLiters || 0) * 25.6 / 1200).toFixed(1)} kg O₂ (20% reserve included). You no longer have it.`
    : `Return ${s.returnKm} km · ${s.returnMin} min · ${s.needKg ?? '—'} kg O₂. Margin ${s.marginMin} min including the 20% reserve.`;
  return (
    <section className="card p-4 flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[15px]">Safe return</h2>
        <span className={`tag ${tone}`}>{title}</span>
      </div>
      <p className="text-[13px] text-dust">{detail}</p>
      <div className="grid grid-cols-3 gap-2">
        <Mini k="O₂" v={`${n.plss.o2RemainingPercent}%`} />
        <Mini k="Battery" v={`${n.plss.batteryRemainingPercent}%`} />
        <Mini k="Cooling" v={`${n.plss.coolingWaterPercent}%`} />
      </div>
      {s.status !== 'nominal' && <button className="btn btn-pri" onClick={n.returnToBase}><Icon n="home" s={14} />Compute return route</button>}
    </section>
  );
}

const Mini = ({ k, v }) => <div className="well p-2"><div className="label">{k}</div><div className="num font-semibold">{v}</div></div>;

const LV = { pass: 'tag-go', warn: 'tag-caution', fail: 'tag-hold' };

export function RouteAlerts() {
  const m = useMission();
  const n = useNavigation();
  const alerts = n.routeAlerts || [];
  const live = n.upcoming;
  const alt = n.alternate;
  if (!alerts.length && !live) return null;
  return (
    <section className="card p-4 flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[15px]">Route warnings</h2>
        <span className="text-xs text-dust">{n.destination?.name}</span>
      </div>
      {live && (
        <div className="well p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[13px]">{live.name} in {live.meters} m</span>
            <span className={`tag ${live.band === 'hazard' ? 'tag-hold' : 'tag-caution'}`}>Ahead</span>
          </div>
          <p className="text-xs text-dust mt-1">
            {alt ? alt.text : 'Stay on the marked GPS line. Slow on slope and keep the 45 min return reserve.'}
          </p>
          {alt && (
            <button type="button" className="btn btn-pri mt-2 !min-h-9" onClick={() => alt.action === 'safe' ? m.setRouteMode('safe') : n.returnToBase()}>
              <Icon n={alt.action === 'safe' ? 'shield' : 'home'} s={14} />{alt.label}
            </button>
          )}
        </div>
      )}
      {alerts.map((a) => (
        <button key={a.id} type="button" className="well p-3 text-left" onClick={() => toast(a.label, a.level === 'fail' ? 'bad' : a.level === 'warn' ? 'warn' : 'ok', a.detail)}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-[13px]">{a.label}</span>
            <span className={`tag ${LV[a.level] || 'tag-info'}`}>{a.level === 'fail' ? 'Alert' : a.level === 'warn' ? 'Caution' : 'OK'}</span>
          </div>
          <p className="text-xs text-dust mt-1">{a.detail}</p>
        </button>
      ))}
    </section>
  );
}

const BAND_STROKE = { safe: '#6fd6a3', caution: '#e8a53d', hazard: '#ff6b6b' };

function unwrapPts(pts) {
  const out = pts.map((p) => ({ ...p, lon: Number(p.lon), lat: Number(p.lat) }));
  for (let i = 1; i < out.length; i++) {
    let d = out[i].lon - out[i - 1].lon;
    while (d > 180) { out[i].lon -= 360; d -= 360; }
    while (d < -180) { out[i].lon += 360; d += 360; }
  }
  return out;
}

/** Equirectangular 2D plot of the three solved routes, you, and destination. */
export function RouteMap2D() {
  const m = useMission();
  const n = useNavigation();
  const pts = n.points || [];
  const altPaths = ['safe', 'direct', 'science'].map((id) => {
    const raw = n.comparisons?.[id]?.points || [];
    const withGeo = raw.filter((p) => p.lat != null);
    return { id, pts: withGeo.length > 1 ? unwrapPts(withGeo) : [] };
  }).filter((a) => a.pts.length > 1);
  if ((pts.length < 2 || pts[0].lat == null) && !altPaths.length) {
    return (
      <section className="card p-4">
        <h2 className="font-semibold text-[15px]">2D route</h2>
        <p className="text-xs text-dust mt-2">Click a place on the globe. All three paths plot here with the 3D overlay.</p>
      </section>
    );
  }
  const un = pts.length > 1 && pts[0].lat != null ? unwrapPts(pts) : (altPaths[0]?.pts || []);
  const you = n.astronaut;
  const dest = n.destination;
  const snapLon = (lon) => {
    let x = Number(lon);
    let d = x - un[0].lon;
    while (d > 180) { x -= 360; d -= 360; }
    while (d < -180) { x += 360; d += 360; }
    return x;
  };
  const youLon = you?.lon != null ? snapLon(you.lon) : un[0].lon;
  const destLon = dest?.lon != null ? snapLon(dest.lon) : un[un.length - 1].lon;
  const destLat = dest?.lat != null ? Number(dest.lat) : un[un.length - 1].lat;
  const lons = un.map((p) => p.lon).concat(youLon, destLon, ...altPaths.flatMap((a) => a.pts.map((p) => p.lon)));
  const lats = un.map((p) => p.lat).concat(Number(you?.lat ?? un[0].lat), destLat, ...altPaths.flatMap((a) => a.pts.map((p) => p.lat)));
  const spanLon = Math.max(0.002, Math.max(...lons) - Math.min(...lons));
  const spanLat = Math.max(0.002, Math.max(...lats) - Math.min(...lats));
  const padLon = Math.max(spanLon * 0.16, 0.006);
  const padLat = Math.max(spanLat * 0.16, 0.006);
  const minLon = Math.min(...lons) - padLon, maxLon = Math.max(...lons) + padLon;
  const minLat = Math.min(...lats) - padLat, maxLat = Math.max(...lats) + padLat;
  const W = 360, H = 180;
  const X = (lon) => ((lon - minLon) / Math.max(0.01, maxLon - minLon)) * W;
  const Y = (lat) => ((maxLat - lat) / Math.max(0.01, maxLat - minLat)) * H;
  const hazards = un.filter((p, i) => p.hazardName && (i === 0 || un[i - 1].hazardName !== p.hazardName) && (p.isHazard || p.band === 'hazard' || p.band === 'caution'));
  const segs = [];
  let run = [un[0]];
  let band = un[0].band || 'safe';
  const flush = () => {
    if (run.length < 2) return;
    segs.push({ band, d: run.map((p, i) => `${i ? 'L' : 'M'}${X(p.lon).toFixed(1)} ${Y(p.lat).toFixed(1)}`).join(' ') });
  };
  for (let i = 1; i < un.length; i++) {
    const next = un[i].band || 'safe';
    if (next !== band) {
      run.push(un[i]);
      flush();
      run = [un[i]];
      band = next;
    } else run.push(un[i]);
  }
  flush();
  return (
    <section className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-[15px]">2D route</h2>
        <span className="text-xs text-dust">{n.metrics?.distanceKm ?? '—'} km · three A* paths</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-lg bg-void border border-line" role="img" aria-label="2D map of the three solved routes">
        <rect width={W} height={H} fill="#120e16" />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line key={`v${t}`} x1={t * W} x2={t * W} y1="0" y2={H} stroke="#fff" strokeOpacity=".06" />
        ))}
        {[0, 0.5, 1].map((t) => (
          <line key={`h${t}`} y1={t * H} y2={t * H} x1="0" x2={W} stroke="#fff" strokeOpacity=".06" />
        ))}
        {altPaths.map((a) => {
          const col = ROUTE_TONE[a.id]?.color || '#7fc8cc';
          const d = a.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.lon).toFixed(1)} ${Y(p.lat).toFixed(1)}`).join(' ');
          const on = m.routeMode === a.id;
          return <path key={a.id} d={d} fill="none" stroke={col} strokeWidth={on ? 3.4 : 2} strokeOpacity={on ? 1 : 0.72} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {segs.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={BAND_STROKE[s.band] || BAND_STROKE.safe} strokeWidth={s.band === 'hazard' ? 4 : 2.6} strokeLinejoin="round" strokeLinecap="round"
            className={s.band === 'hazard' || s.band === 'caution' ? 'cursor-pointer' : undefined}
            onClick={() => {
              const p = hazards.find((h) => (s.band === 'hazard' ? h.isHazard || h.band === 'hazard' : h.band === s.band));
              if (!p) return;
              const h = hazardCopy(p);
              toast(h.label, h.level === 'fail' ? 'bad' : 'warn', h.detail);
            }} />
        ))}
        {hazards.map((p) => {
          const h = hazardCopy(p);
          const hot = h.level === 'fail';
          return (
            <g key={p.hazardName} className="cursor-pointer" role="button" tabIndex={0}
              onClick={() => toast(h.label, hot ? 'bad' : 'warn', h.detail)}
              onKeyDown={(e) => e.key === 'Enter' && toast(h.label, hot ? 'bad' : 'warn', h.detail)}>
              <circle cx={X(p.lon)} cy={Y(p.lat)} r="9" fill={hot ? '#ff6b6b' : '#e8a53d'} fillOpacity="0.22" />
              <circle cx={X(p.lon)} cy={Y(p.lat)} r="5" fill={hot ? '#ff6b6b' : '#e8a53d'} stroke="#fff" strokeWidth="1" />
              <text x={X(p.lon) + 8} y={Y(p.lat) + 3} fontSize="7" fill="#ffb4b4">{p.hazardName}</text>
            </g>
          );
        })}
        <circle cx={X(youLon)} cy={Y(Number(you.lat))} r="4.5" fill="#e4613a" stroke="#fff" strokeWidth="1.5" />
        <text x={X(youLon) + 6} y={Y(Number(you.lat)) - 4} fontSize="8" fill="#f4efe9">YOU</text>
        <circle cx={X(destLon)} cy={Y(destLat)} r="4" fill="#7fc8cc" stroke="#fff" strokeWidth="1.2" />
        <text x={X(destLon) + 6} y={Y(destLat) - 4} fontSize="8" fill="#7fc8cc">{dest?.name || 'DEST'}</text>
      </svg>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-dust">
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#6fd6a3]" />Safest</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#5b9cff]" />Fastest</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#c084fc]" />Science</span>
        <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#ff6b6b]" />Hazard</span>
      </div>
    </section>
  );
}
