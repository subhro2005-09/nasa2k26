import { memo, useEffect, useRef, useState } from 'react';
import { useOnline } from '../hooks/useClock.js';
import { Icon } from '../lib/icons.jsx';
import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { canvasToLatLon, isAresMessage, pointsToGeo, postToAtlas } from '../map/atlasBridge.js';
import { publishNav } from '../../mars-atlas-src/navSync.js';
import { toast } from '../lib/toast.js';
import { METERS_PER_PIXEL } from '../services/coordinates.js';
import { hazardsAlong } from '../routing/planetRoute.js';
import { GpsHud } from './GpsHud.jsx';

/**
 * Hosts the original Mars Atlas globe and overlays ARES navigation state.
 * The Cesium engine is unchanged; communication is a postMessage adapter.
 */
export const MapCard = memo(function MapCard() {
  const online = useOnline();
  const saver = !!navigator.connection?.saveData;
  const [armed, setArmed] = useState(!saver);
  const [flat, setFlatState] = useState(false);
  const iframe = useRef(null);
  const ready = useRef(false);
  const latest = useRef({});
  const m = useMission();
  const n = useNavigation();
  latest.current = { m, n };

  const payload = () => {
    const { m: M, n: N } = latest.current;
    const geo = (p) => {
      if (!p) return null;
      if (p.lat != null && p.lon != null) return p;
      return { ...p, ...canvasToLatLon(M.mission, p.x, p.y) };
    };
    const planetary = !!N.planetary;
    const packAlt = (id) => {
      const r = N.comparisons?.[id];
      if (!r?.points?.length) return { points: [] };
      return {
        points: pointsToGeo(M.mission, r.points),
        km: Number((r.eva?.remainingM != null ? r.eva.remainingM / 1000 : r.metrics?.distanceKm) || 0),
        min: r.eva?.remainingMin ?? r.metrics?.estimatedTimeMin ?? 0,
        o2: r.eva?.oxygenKg,
        slope: r.metrics?.maxSlope,
        risk: r.eva?.meanRisk
      };
    };
    return {
      cameraMode: N.cameraMode,
      planetary,
      astronaut: geo(N.astronaut),
      home: geo(N.home),
      destination: N.destination ? geo(N.destination) : null,
      route: pointsToGeo(M.mission, N.points),
      routeMode: M.routeMode,
      alts: N.comparisons ? {
        safe: packAlt('safe'),
        direct: packAlt('direct'),
        science: packAlt('science')
      } : null,
      proposed: pointsToGeo(M.mission, N.proposedPoints),
      blocked: pointsToGeo(M.mission, N.blockedPoints),
      returnRoute: planetary ? [] : pointsToGeo(M.mission, N.returnRoute.points),
      envelope: planetary ? [] : (N.envelope || []).map((p) => canvasToLatLon(M.mission, p.x, p.y)),
      hazards: planetary ? [] : M.hazards.map((h) => ({ ...canvasToLatLon(M.mission, h.x, h.y), rMeters: h.r * METERS_PER_PIXEL })),
      pois: planetary ? [] : M.pois.map((p) => ({ name: p.name, ...p.coordinates })),
      alerts: N.routeAlerts || [],
      routeHazards: hazardsAlong(N.points),
      following: !!N.following,
      progress: N.progress || 0,
      remainingKm: N.remainingKm || 0,
      instruction: N.instruction,
      upcoming: N.upcoming
    };
  };

  useEffect(() => {
    const onMsg = (e) => {
      if (!isAresMessage(e)) return;
      if (e.data.type === 'ares:ready') {
        ready.current = true;
        postToAtlas(iframe.current?.contentWindow, 'ares:state', payload());
        postToAtlas(iframe.current?.contentWindow, 'ares:locate');
      }
      if (e.data.type === 'ares:click' && e.data.payload) latest.current.n.handleMapClick(e.data.payload.lat, e.data.payload.lon, e.data.payload);
      if (e.data.type === 'ares:place' && e.data.payload) latest.current.n.handlePlaceSelect(e.data.payload);
      if (e.data.type === 'ares:hazard' && e.data.payload) {
        const h = e.data.payload;
        toast(h.label || 'Hazard on route', h.level === 'fail' ? 'bad' : 'warn', h.detail);
      }
    };
    addEventListener('message', onMsg);
    return () => removeEventListener('message', onMsg);
  }, []);

  const pushState = () => {
    const s = payload();
    postToAtlas(iframe.current?.contentWindow, 'ares:state', s);
    publishNav(s);
  };

  useEffect(() => {
    pushState();
  }, [n.cameraMode, n.destination, n.points, n.comparisons, n.rerouteOffer, m.routeMode, m.hazards, m.pois, m.missionId, n.home, n.following]);

  useEffect(() => {
    if (n.following) return;
    pushState();
  }, [n.returnRoute, n.envelope]);

  useEffect(() => {
    if (!n.following) return;
    const t = setTimeout(pushState, 900);
    return () => clearTimeout(t);
  }, [n.envelope, n.returnRoute, n.following]);

  const youRaf = useRef(0);
  useEffect(() => {
    if (!ready.current || !n.astronaut) return;
    if (youRaf.current) cancelAnimationFrame(youRaf.current);
    youRaf.current = requestAnimationFrame(() => {
      youRaf.current = 0;
      const geo = n.astronaut.lat != null ? n.astronaut : { ...n.astronaut, ...canvasToLatLon(m.mission, n.astronaut.x, n.astronaut.y) };
      postToAtlas(iframe.current?.contentWindow, 'ares:you', {
        ...geo,
        following: n.following,
        progress: n.progress || 0,
        remainingKm: n.remainingKm || 0,
        planetary: !!n.planetary,
        heading: n.astronaut.heading,
        upcoming: n.upcoming,
        cameraMode: n.cameraMode
      });
    });
    return () => { if (youRaf.current) cancelAnimationFrame(youRaf.current); };
  }, [n.astronaut.x, n.astronaut.y, n.astronaut.lat, n.astronaut.lon, n.astronaut.heading, n.cameraMode, n.following, n.progress, n.upcoming?.meters, m.mission]);

  useEffect(() => {
    if (!ready.current) return;
    postToAtlas(iframe.current?.contentWindow, 'ares:locate');
  }, [n.locatePulse]);

  useEffect(() => {
    if (!ready.current) return;
    postToAtlas(iframe.current?.contentWindow, 'ares:fit');
  }, [n.routeFitPulse]);

  const setFlat = (next) => {
    setFlatState(next);
    postToAtlas(iframe.current?.contentWindow, 'ares:morph', { flat: next });
  };

  const topAlert = (n.routeAlerts || []).find((a) => a.level === 'fail') || (n.routeAlerts || []).find((a) => a.level === 'warn');

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 border-b border-line shrink-0">
        <div className="min-w-0">
          <div className="font-semibold text-[13px] truncate">Surface · {m.mission.name}</div>
          <div className="text-xs text-dust truncate hidden sm:block">Click any point to solve three routes — Safest, Fastest, Science — with distance and EVA time.</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button className={`btn !px-2 ${flat ? 'btn-ghost' : 'btn-pri'}`} onClick={() => setFlat(false)} title="3D globe">3D</button>
          <button className={`btn !px-2 ${flat ? 'btn-pri' : 'btn-ghost'}`} onClick={() => setFlat(true)} title="2D map">2D</button>
          <button className="btn btn-ghost !px-2" onClick={() => n.setClickIntent(n.clickIntent === 'relocate' ? 'destination' : 'relocate')} title="Map click intent">
            <Icon n={n.clickIntent === 'relocate' ? 'user' : 'target'} s={14} /><span className="hidden sm:inline">{n.clickIntent === 'relocate' ? 'Place crew' : 'Set dest'}</span>
          </button>
          <a className="btn btn-ghost !px-2" href="/mars-atlas.html" target="_blank" rel="noopener" aria-label="Open the atlas full screen"><Icon n="ext" s={14} /><span className="hidden md:inline">Atlas</span></a>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden bg-[#07060a]">
        {armed && (
          <iframe ref={iframe} title="Mars Atlas interactive map" src="/mars-atlas.html" className="absolute inset-0 w-full h-full border-0" allow="fullscreen" loading="eager"
            onLoad={() => { ready.current = true; pushState(); postToAtlas(iframe.current?.contentWindow, 'ares:locate'); }} />
        )}
        {!armed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="max-w-sm">
              <Icon n="globe" s={28} className="mx-auto text-dusk" />
              <p className="mt-3 font-semibold">Data saver is on</p>
              <p className="text-sm text-dust mt-1">The 3D atlas streams NASA tiles. Load it when you need the globe.</p>
              <button className="btn btn-pri mt-4" onClick={() => setArmed(true)}>Load the map</button>
            </div>
          </div>
        )}
        <div className="absolute top-3 left-3 right-3 flex flex-col gap-1.5 pointer-events-none items-start">
          <div className="flex flex-wrap gap-1.5">
            <span className="tag tag-info pointer-events-auto">{flat ? '2D map' : n.cameraMode === 'astronaut' ? 'Astronaut camera' : 'Orbit camera'}</span>
            {n.planetary && <span className="tag tag-caution pointer-events-auto">Orbital traverse</span>}
            {n.destination?.name && <span className="tag tag-info pointer-events-auto">YOU → {n.destination.name}</span>}
          </div>
          {topAlert && (
            <div className="pointer-events-auto well p-2.5 max-w-md shadow-2xl">
              <div className="font-semibold text-[12px]">{topAlert.label}</div>
              <p className="text-[11px] text-dust mt-0.5 line-clamp-2">{topAlert.detail}</p>
            </div>
          )}
          {n.comparisons ? (
            <div className="pointer-events-auto well !py-1.5 !px-2 flex flex-col gap-1 shadow-2xl max-w-[min(100%,320px)]">
              {[['safe', 'Safest', '#6fd6a3'], ['direct', 'Fastest', '#5b9cff'], ['science', 'Science', '#c084fc']].map(([id, label, color]) => {
                const r = n.comparisons[id];
                const km = r?.eva?.remainingM != null ? r.eva.remainingM / 1000 : r?.metrics?.distanceKm;
                const min = Math.round(r?.eva?.remainingMin ?? r?.metrics?.estimatedTimeMin ?? 0);
                const on = m.routeMode === id;
                return (
                  <button key={id} type="button" className={`flex items-center gap-2 text-left text-[11px] rounded-md px-1.5 py-1 ${on ? 'bg-white/10' : ''}`} onClick={() => m.setRouteMode(id)}>
                    <i className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="font-semibold text-bone">{label}</span>
                    <span className="num text-dust ml-auto">{km != null ? `${Number(km).toFixed(2)} km` : '—'} · {min} min</span>
                  </button>
                );
              })}
            </div>
          ) : n.points?.length > 1 && (
            <div className="pointer-events-auto flex items-center gap-2 text-[11px] text-dust well !py-1.5 !px-2.5">
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#6fd6a3]" />Safe</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#e8a53d]" />Caution</span>
              <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-[#ff6b6b]" />Hazard</span>
            </div>
          )}
        </div>
        <GpsHud />
        {!online && (
          <div className="absolute inset-x-3 bottom-3 well p-3 flex items-start gap-3 shadow-2xl" role="status">
            <Icon n="off" className="text-butter mt-0.5" />
            <p className="text-[13px] text-dust"><span className="text-bone font-semibold">Map tiles need a connection.</span> Route, hazards and the EVA brief keep working from the tactical model.</p>
          </div>
        )}
      </div>
    </div>
  );
});
