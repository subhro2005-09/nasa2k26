import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMission } from './MissionContext.jsx';
import { canvasToMarsCoords, marsToCanvasCoords } from '../services/coordinates.js';
import { assessRoute } from '../services/assess.js';
import { fullTanks } from '../services/plssCalculator.js';
import { toast } from '../lib/toast.js';
import { composeEva, forecastPath } from '../lib/evaSimulation.js';
import { compareReroute } from '../lib/hazardEngine.js';
import { consumeStep } from '../lib/resourceCalculator.js';
import { formatClockMin } from '../lib/routeEngine.js';
import { rankRoutes } from '../lib/routeScoring.js';
import { effectiveSpeed } from '../lib/terrainEngine.js';
import { geoBearing, headingLabel } from '../navigation/heading.js';
import { advanceAlongPath, nearestIndex, pointAtDistance, sampleTerrain, snapToPath, walkStep } from '../navigation/movementEngine.js';
import { alternateAdvice, explainTerrainRoute, nextInstruction, safetyFromMetrics, terrainAhead, upcomingHazard } from '../analysis/routeAnalysis.js';
import { compareNavRoutes, generateReturnRoute, reachableEnvelope } from '../routing/returnRoute.js';
import { generatePlanetRoute } from '../routing/planetRoute.js';
import { destGeoOf, fallbackGeoTrack, finalizeRoute, inTacticalCanvas, stampPathGeo } from '../routing/geoPath.js';
function fmtGeo(lat, lon) {
  return {
    lat,
    lon,
    latStr: `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`,
    lonStr: `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`
  };
}

const Ctx = createContext(null);

function poseFrom(mission, missionId, x, y, heading, hazards) {
  const sampled = sampleTerrain(missionId, x, y, hazards);
  const geo = canvasToMarsCoords(mission, x, y);
  return { x, y, heading, status: 'nominal', speedMps: 0, ...sampled, ...geo };
}

export function NavigationProvider({ children }) {
  const m = useMission();
  const { mission, missionId, path, metrics, routeMode, hazards, pois } = m;
  const routing = m.routing || (hazards || []).filter((h) => h.validated);

  const [astronaut, setAstronaut] = useState(() => poseFrom(mission, missionId, mission.habSite.x, mission.habSite.y, 42, []));
  const [destination, setDestinationState] = useState(null);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [cameraMode, setCameraMode] = useState('orbit');
  const [controlMode, setControlMode] = useState('observe');
  const [clickIntent, setClickIntent] = useState('destination');
  const [following, setFollowing] = useState(false);
  const [followSpeed, setFollowSpeed] = useState(5);
  const [alongPx, setAlongPx] = useState(0);
  const [traveledM, setTraveledM] = useState(0);
  const [elapsedMin, setElapsedMin] = useState(0);
  const [locatePulse, setLocatePulse] = useState(0);
  const [stick, setStick] = useState({ forward: 0, turn: 0 });
  const [tanks, setTanks] = useState(() => fullTanks());
  const [fatigue, setFatigue] = useState(0);
  const [envelope, setEnvelope] = useState([]);
  const [routeFitPulse, setRouteFitPulse] = useState(0);
  const [rerouteOffer, setRerouteOffer] = useState(null);
  const keys = useRef({ f: 0, t: 0 });
  const hzSeen = useRef(0);
  const pathHold = useRef(null);
  const lastReturnAt = useRef(0);
  const live = useRef({});

  const home = useMemo(() => {
    const h = mission.habSite;
    const geo = canvasToMarsCoords(mission, h.x, h.y);
    return { ...h, ...geo };
  }, [mission]);

  useEffect(() => {
    setAstronaut(poseFrom(mission, missionId, mission.habSite.x, mission.habSite.y, 42, []));
    setDestinationState(null);
    setRouteOrigin(null);
    setFollowing(false);
    setAlongPx(0);
    setTraveledM(0);
    setElapsedMin(0);
    setTanks(fullTanks());
    setFatigue(0);
    setEnvelope([]);
    setControlMode('observe');
    setCameraMode('orbit');
    setRerouteOffer(null);
    hzSeen.current = 0;
    setLocatePulse((n) => n + 1);
  }, [missionId]);

  const originGeo = useMemo(() => {
    if (!routeOrigin) return null;
    if (routeOrigin.lat != null && routeOrigin.lon != null) return routeOrigin;
    return { ...routeOrigin, ...canvasToMarsCoords(mission, routeOrigin.x, routeOrigin.y) };
  }, [routeOrigin, mission]);

  const comparisons = useMemo(() => {
    if (!destination || !routeOrigin) return null;
    const from = {
      ...originGeo,
      x: routeOrigin.x ?? astronaut.x,
      y: routeOrigin.y ?? astronaut.y,
      lat: originGeo.lat ?? astronaut.lat,
      lon: originGeo.lon ?? astronaut.lon,
      elevation: astronaut.elevation
    };
    const extra = destGeoOf(destination) || canvasToMarsCoords(mission, destination.x, destination.y);
    const destGeo = { ...destination, ...extra };
    const onGrid = inTacticalCanvas(destination.x, destination.y);
    const pack = onGrid
      ? compareNavRoutes(from, destGeo, missionId, routing)
      : {
        safe: generatePlanetRoute(from, destGeo, 'safe', from.elevation),
        direct: generatePlanetRoute(from, destGeo, 'direct', from.elevation),
        science: generatePlanetRoute(from, destGeo, 'science', from.elevation)
      };
    const tagged = {};
    for (const id of ['safe', 'direct', 'science']) {
      tagged[id] = finalizeRoute(mission, pack[id], from, destGeo);
      if ((tagged[id]?.points?.length || 0) < 2 && extra.lat != null) {
        tagged[id] = { ...(tagged[id] || {}), points: fallbackGeoTrack(from, destGeo), planetary: !onGrid };
      }
      tagged[id].eva = forecastPath(tagged[id].points || [], 0, { fatigue: 0, dustTau: mission.dustTau });
    }
    return tagged;
  }, [destination, routeOrigin, missionId, routing, originGeo, mission]);

  const liveRouted = destination && comparisons ? comparisons[routeMode] : null;
  const livePoints = useMemo(() => {
    const raw = liveRouted?.points?.length > 1 ? liveRouted.points : (destination ? [] : (path?.points || []));
    return stampPathGeo(mission, raw);
  }, [liveRouted, destination, path, mission]);
  const liveMetrics = liveRouted?.metrics || metrics;
  const routed = liveRouted;
  const holding = !!rerouteOffer?.previous?.points?.length;
  const activePoints = holding ? rerouteOffer.previous.points : livePoints;
  const activeMetrics = holding ? rerouteOffer.previous.metrics : liveMetrics;
  const rawStations = routed?.stations?.length ? routed.stations : (path?.stations || []);
  const activeStations = useMemo(() => rawStations.map((s, i) => {
    const wp = s.wp || s;
    const p = activePoints[s.index] || {};
    return {
      ...wp,
      n: i,
      t: p.t || 0,
      km: (activeMetrics.distanceKm || 0) * (p.t || 0),
      etaMin: Math.round((activeMetrics.estimatedTimeMin || 0) * (p.t || 0)),
      slope: p.slope || 0,
      elevation: p.elevation || 0
    };
  }), [rawStations, activePoints, activeMetrics]);

  const idx = useMemo(() => {
    if (following && activePoints.length > 1) {
      const p = pointAtDistance(activePoints, alongPx);
      return p?.idx ?? nearestIndex(activePoints, astronaut.x, astronaut.y);
    }
    return nearestIndex(activePoints, astronaut.x, astronaut.y);
  }, [following, alongPx, activePoints, astronaut.x, astronaut.y]);
  const progress = activePoints.length ? Math.min(1, (alongPx / (activePoints[activePoints.length - 1].d || 1))) : 0;
  const alongPoint = activePoints[idx] || null;

  const geoAstro = useMemo(() => {
    if (routed?.planetary && astronaut.lat != null && astronaut.lon != null) {
      return { ...astronaut, ...fmtGeo(astronaut.lat, astronaut.lon) };
    }
    return { ...astronaut, ...canvasToMarsCoords(mission, astronaut.x, astronaut.y) };
  }, [astronaut, mission, routed]);

  const instruction = useMemo(
    () => nextInstruction(activePoints, idx, geoAstro.heading),
    [activePoints, idx, geoAstro.heading]
  );
  const ahead = useMemo(() => terrainAhead(activePoints, idx), [activePoints, idx]);
  const upcoming = useMemo(() => upcomingHazard(activePoints, idx), [activePoints, idx]);
  const alternate = useMemo(
    () => alternateAdvice({ comparisons, routeMode, obstacle: upcoming, planetary: !!routed?.planetary }),
    [comparisons, routeMode, upcoming, routed?.planetary]
  );
  const routeExplain = useMemo(() => explainTerrainRoute(comparisons, routeMode), [comparisons, routeMode]);

  const hereSample = useMemo(() => ({
    slope: geoAstro.slope || 0,
    zone: !!geoAstro.zone,
    reported: !!geoAstro.reported,
    isHazard: !!geoAstro.isHazard,
    dh: 0,
    dist: 1,
    elevation: geoAstro.elevation || 0
  }), [geoAstro.slope, geoAstro.zone, geoAstro.reported, geoAstro.isHazard, geoAstro.elevation]);

  const forecast = useMemo(
    () => forecastPath(activePoints, alongPx, { fatigue, dustTau: mission.dustTau }),
    [activePoints, alongPx, fatigue, mission.dustTau]
  );

  const eva = useMemo(() => composeEva({
    tanks,
    fatigue,
    forecast,
    elapsedMin,
    traveledM,
    sample: hereSample,
    following,
    moving: following || controlMode === 'walk',
    speedMps: geoAstro.speedMps || 0,
    dustTau: mission.dustTau,
    followSpeed
  }), [tanks, fatigue, forecast, elapsedMin, traveledM, hereSample, following, controlMode, geoAstro.speedMps, mission.dustTau, followSpeed]);

  const tanksSnap = eva.plss;
  const routeRank = useMemo(() => (comparisons ? rankRoutes(comparisons) : null), [comparisons]);
  const evaMetrics = useMemo(() => ({
    ...activeMetrics,
    estimatedTimeMin: Math.round((elapsedMin || 0) + (forecast.remainingMin || 0)),
    estimatedTimeFormatted: formatClockMin((elapsedMin || 0) + (forecast.remainingMin || 0))
  }), [activeMetrics, elapsedMin, forecast.remainingMin]);

  const returnSnap = useRef({ from: null, path: { points: [], metrics: activeMetrics } });
  const returnRoute = useMemo(() => {
    if (routed?.planetary) return returnSnap.current.path || { points: [], metrics: activeMetrics };
    if (following && returnSnap.current.path?.points?.length) return returnSnap.current.path;
    const bin = following ? 40 : 8;
    const key = `${missionId}:${Math.round(geoAstro.x / bin)}:${Math.round(geoAstro.y / bin)}:${routing?.length || 0}`;
    if (returnSnap.current.from === key) return returnSnap.current.path;
    const pathR = generateReturnRoute(geoAstro, home, missionId, routing);
    returnSnap.current = { from: key, path: pathR };
    return pathR;
  }, [geoAstro.x, geoAstro.y, home, missionId, routing, following, routed?.planetary, activeMetrics]);

  const returnForecast = useMemo(
    () => forecastPath(returnRoute.points || [], 0, { fatigue, dustTau: mission.dustTau }),
    [returnRoute.points, fatigue, mission.dustTau]
  );
  const safeReturn = useMemo(() => {
    const o2Kg = tanksSnap.o2Kg ?? 25.6;
    const need = returnForecast.oxygenKg || 0;
    const rate = tanksSnap.o2BurnRateKgH || 0.84;
    const remainingMin = rate > 0 ? (o2Kg / rate) * 60 : 0;
    const returnMin = returnForecast.remainingMin || returnRoute.metrics?.estimatedTimeMin || 0;
    const marginMin = remainingMin - returnMin;
    let status = 'nominal';
    if (o2Kg <= need) status = 'ponr';
    else if (o2Kg < need * 1.2) status = 'low';
    const budgetMeters = Math.max(0, (remainingMin - 45) / 60) * (eva.walkingSpeed || 0.8) * 3600 * 0.45;
    return {
      status,
      marginMin: Math.round(marginMin),
      needLiters: Math.round((need / 25.6) * 1200),
      needKg: Number(need.toFixed(2)),
      returnKm: Number((((returnForecast.remainingM || (returnRoute.metrics?.distanceKm || 0) * 1000)) / 1000).toFixed(2)),
      returnMin: Math.round(returnMin),
      budgetMeters
    };
  }, [tanksSnap, returnForecast, returnRoute.metrics, eva.walkingSpeed]);
  const plss = useMemo(() => ({
    ...tanksSnap,
    isPointOfNoReturnExceeded: safeReturn.status === 'ponr',
    contingencyMet: safeReturn.status !== 'ponr'
  }), [tanksSnap, safeReturn.status]);

  const assessment = useMemo(
    () => assessRoute({ metrics: activeMetrics, points: activePoints, hazards, mission, endPlss: plss, pois }),
    [activeMetrics, activePoints, hazards, mission, plss, pois]
  );

  useEffect(() => {
    const nHz = routing?.length || 0;
    if (nHz > hzSeen.current && pathHold.current?.points?.length > 2) {
      const prev = pathHold.current;
      const h = routing[routing.length - 1];
      let metersAhead = 320;
      if (h && prev.points?.length) {
        let best = prev.points[0];
        for (const p of prev.points) {
          if (Math.hypot(p.x - h.x, p.y - h.y) < Math.hypot(best.x - h.x, best.y - h.y)) best = p;
        }
        metersAhead = Math.max(40, Math.round(((best.d || 0) - (live.current.alongPx || prev.points[0].d || 0)) * 5.875));
      }
      const blocked = (prev.points || []).filter((p) => h && Math.hypot(p.x - h.x, p.y - h.y) < (h.r || 40) + 18);
      const comparison = compareReroute(prev.points, livePoints, live.current.alongPx || 0, {
        fatigue: live.current.fatigue || 0,
        dustTau: live.current.dustTau || mission.dustTau
      });
      setRerouteOffer({
        previous: prev,
        proposed: { points: livePoints, metrics: liveMetrics },
        extraM: comparison.extraM,
        extraMin: comparison.extraMin,
        oldSafety: safetyFromMetrics(prev.metrics),
        newSafety: safetyFromMetrics(liveMetrics),
        metersAhead,
        hazardKind: h?.kind || 'hazard',
        blocked,
        reason: comparison.why,
        comparison
      });
      toast('Hazard on route. Review the alternate path.', 'warn');
      hzSeen.current = nHz;
      return;
    }
    hzSeen.current = nHz;
    if (!rerouteOffer) pathHold.current = { points: livePoints, metrics: liveMetrics };
  }, [routing?.length, livePoints, liveMetrics, rerouteOffer]);

  useEffect(() => {
    if (routed?.planetary || following) { if (routed?.planetary) setEnvelope([]); return; }
    const budget = safeReturn.budgetMeters;
    const key = `${Math.round(geoAstro.x / 16)}:${Math.round(geoAstro.y / 16)}:${Math.round(budget / 80)}:${routing?.length || 0}`;
    if (lastReturnAt.current === key) return;
    lastReturnAt.current = key;
    setEnvelope(reachableEnvelope(missionId, geoAstro, budget, routing));
  }, [geoAstro.x, geoAstro.y, safeReturn.budgetMeters, missionId, routing, routed?.planetary, following]);

  live.current = {
    mission, missionId, routing, astronaut, following, followSpeed, controlMode, stick,
    activePoints, alongPx, planetary: !!routed?.planetary,
    fatigue, dustTau: mission.dustTau, idx, tanks
  };

  const applyPose = useCallback((next, movedM = 0) => {
    const geo = (live.current.planetary && next.lat != null && next.lon != null)
      ? fmtGeo(next.lat, next.lon)
      : canvasToMarsCoords(mission, next.x, next.y);
    setAstronaut((prev) => ({ ...prev, ...next, ...geo }));
    if (movedM > 0) setTraveledM((d) => d + movedM);
  }, [mission]);

  const burn = useCallback((dtMin, moving, sample = {}, distM = 0) => {
    const next = consumeStep({
      tanks: live.current.tanks,
      fatigue: live.current.fatigue || 0,
      dtHour: dtMin / 60,
      distM,
      sample,
      moving,
      dustTau: live.current.dustTau ?? 0.3
    });
    live.current.tanks = next.tanks;
    live.current.fatigue = next.fatigue;
    setTanks(next.tanks);
    setFatigue(next.fatigue);
    setElapsedMin((e) => e + dtMin);
  }, []);

  useEffect(() => {
    const down = (e) => {
      if (controlMode !== 'walk') return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
      const k = e.key.toLowerCase();
      if (['w', 'arrowup'].includes(k)) { keys.current.f = 1; e.preventDefault(); }
      if (['s', 'arrowdown'].includes(k)) { keys.current.f = -0.55; e.preventDefault(); }
      if (['a', 'arrowleft'].includes(k)) { keys.current.t = -1; e.preventDefault(); }
      if (['d', 'arrowright'].includes(k)) { keys.current.t = 1; e.preventDefault(); }
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (['w', 'arrowup', 's', 'arrowdown'].includes(k)) keys.current.f = 0;
      if (['a', 'arrowleft', 'd', 'arrowright'].includes(k)) keys.current.t = 0;
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, [controlMode]);

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (document.hidden) return;
      const L = live.current;
      if (!L.astronaut) return;

      if (L.following && L.activePoints.length > 1) {
        const sample = sampleTerrain(L.missionId, L.astronaut.x, L.astronaut.y, L.routing);
        const trueSpeed = effectiveSpeed(sample, L.fatigue || 0, L.dustTau);
        const meters = trueSpeed * Math.max(1, L.followSpeed) * dt;
        const stepped = advanceAlongPath(L.activePoints, L.alongPx, meters, L.missionId, L.routing);
        if (stepped) {
          const dh = (stepped.pose.elevation ?? 0) - (L.astronaut.elevation ?? 0);
          applyPose({ ...stepped.pose, speedMps: trueSpeed }, meters);
          setAlongPx(stepped.alongPx);
          burn((dt / 60) * L.followSpeed, true, { ...stepped.pose, dh, dist: meters }, meters);
          if (stepped.progress >= 0.999) {
            setFollowing(false);
            toast('Arrived. Check safe return before the next leg.', 'ok');
          }
        }
        return;
      }

      const forward = L.stick.forward || keys.current.f;
      const turn = L.stick.turn || keys.current.t;
      if (L.controlMode === 'walk' && (forward || turn)) {
        const next = walkStep(L.astronaut, {
          forward, turn, dt, missionId: L.missionId, hazards: L.routing,
          fatigue: L.fatigue || 0, dustTau: L.dustTau
        });
        applyPose(next, next.movedM);
        setAlongPx(snapToPath(L.activePoints, next.x, next.y).alongPx);
        burn(dt / 60, next.movedM > 0.01, { ...next, dist: next.movedM }, next.movedM);
        return;
      }

      burn(dt / 60, false, L.astronaut, 0);
    }, 80);
    return () => clearInterval(id);
  }, [applyPose, burn]);

  useEffect(() => {
    if (!activePoints.length || routed?.planetary) return;
    const snap = snapToPath(activePoints, astronaut.x, astronaut.y);
    setAlongPx(snap.alongPx);
    if (!following) return;
    const pt = pointAtDistance(activePoints, snap.alongPx);
    if (pt) applyPose({ ...pt, heading: pt.heading }, 0);
  }, [routeMode]);

  const locateAstronaut = () => setLocatePulse((n) => n + 1);

  const acceptReroute = () => {
    const next = rerouteOffer?.proposed;
    setRerouteOffer(null);
    if (next?.points?.length) {
      const snap = snapToPath(next.points, astronaut.x, astronaut.y);
      setAlongPx(snap.alongPx);
      const pt = next.points[snap.idx];
      if (pt) applyPose({ ...pt, heading: pt.heading || geoBearing(pt, next.points[Math.min(next.points.length - 1, snap.idx + 1)]) }, 0);
    }
    toast('Route updated. Following the terrain-aware alternate.', 'ok');
  };

  const relocateTo = (x, y, heading, keepFollow = false) => {
    const pose = poseFrom(mission, missionId, x, y, heading ?? astronaut.heading, routing);
    applyPose(pose, 0);
    setAlongPx(snapToPath(activePoints, x, y).alongPx);
    if (!keepFollow) setFollowing(false);
  };

  const setDestination = (dest) => {
    if (!dest) {
      setDestinationState(null);
      setRouteOrigin(null);
      return;
    }
    const canvas = dest.mapPos || (dest.x != null && dest.y != null ? dest : null);
    const nested = destGeoOf(dest);
    const geo = nested || (canvas ? canvasToMarsCoords(mission, canvas.x, canvas.y) : null);
    const projected = geo ? marsToCanvasCoords(mission, geo.lat, geo.lon) : { x: canvas?.x, y: canvas?.y };
    const x = Number.isFinite(canvas?.x) ? canvas.x : projected.x;
    const y = Number.isFinite(canvas?.y) ? canvas.y : projected.y;
    const onGrid = inTacticalCanvas(x, y);
    const point = {
      id: dest.id || `place-${Date.now()}`,
      name: dest.name || 'Map pin',
      type: dest.type || dest.category || 'place',
      category: dest.category,
      diameter: dest.diameter,
      planetary: !!dest.planetary || !onGrid,
      x,
      y,
      ...geo
    };
    setRouteOrigin({ x: astronaut.x, y: astronaut.y, lat: astronaut.lat, lon: astronaut.lon });
    setDestinationState(point);
    setControlMode('navigate');
    setAlongPx(0);
    setFollowing(false);
    setRerouteOffer(null);
    setRouteFitPulse((n) => n + 1);
    toast(`Routing from your position to ${point.name}`, 'ok');
  };

  const returnToBase = () => {
    if (Math.hypot(astronaut.x - home.x, astronaut.y - home.y) < 18) {
      toast('Already at the habitat', 'info');
      return;
    }
    setDestination({ id: 'home', name: home.name, type: 'hab', x: home.x, y: home.y });
    m.setRouteMode('safe');
    toast('Safe return route computed from your position', 'ok');
  };

  const handlePlaceSelect = (place) => {
    if (!place || place.lat == null) return;
    const { x, y } = marsToCanvasCoords(mission, place.lat, place.lon);
    setDestination({
      id: place.id || place.name,
      name: place.name,
      type: 'place',
      category: place.category,
      diameter: place.diameter,
      planetary: !inTacticalCanvas(x, y),
      x,
      y,
      lat: place.lat,
      lon: place.lon
    });
  };

  const handleMapClick = (lat, lon, extra = {}) => {
    const { x, y } = marsToCanvasCoords(mission, lat, lon);
    const onGrid = inTacticalCanvas(x, y);
    if (clickIntent === 'relocate') {
      if (!onGrid) {
        toast('Crew relocate stays inside this site’s tactical box. Use a nearby pin.', 'warn');
        return;
      }
      relocateTo(x, y);
      toast('Crew relocated to map pin', 'info');
      return;
    }
    setDestination({
      id: extra.id || `pin-${Date.now()}`,
      name: extra.name || 'Map pin',
      type: extra.name ? 'place' : 'waypoint',
      category: extra.category,
      diameter: extra.diameter,
      planetary: !onGrid,
      x,
      y,
      lat,
      lon
    });
  };

  const beginTraverse = () => {
    if (activePoints.length < 2) return toast('Choose a destination first', 'warn');
    const start = activePoints[0];
    const next = activePoints[1];
    if (routed?.planetary) {
      applyPose({
        ...astronaut,
        x: start.x,
        y: start.y,
        lat: start.lat,
        lon: start.lon,
        heading: next ? geoBearing(start, next) : astronaut.heading,
        elevation: start.elevation,
        slope: start.slope || 0
      }, 0);
      if (activeMetrics.distanceKm > 12) toast('Preview only: this destination is beyond suited EVA range.', 'warn');
    } else {
      relocateTo(start.x, start.y, geoBearing(start, next), true);
    }
    setAlongPx(0);
    setControlMode('navigate');
    const longHaul = !!routed?.planetary && (activeMetrics.distanceKm || 0) > 12;
    setCameraMode(longHaul ? 'orbit' : 'astronaut');
    setFollowing(true);
    toast('Walking the solved path. Heading-up GPS follow is on.', 'ok');
  };

  const seekProgress = (p) => {
    if (!activePoints.length) return;
    const max = activePoints[activePoints.length - 1].d || 1;
    const pt = pointAtDistance(activePoints, Math.max(0, Math.min(1, p)) * max);
    if (!pt) return;
    const pose = poseFrom(mission, missionId, pt.x, pt.y, pt.heading, routing);
    applyPose(pose, 0);
    setAlongPx(pt.d);
    setFollowing(false);
  };

  const resetCrew = () => {
    relocateTo(home.x, home.y, 42);
    setDestinationState(null);
    setRouteOrigin(null);
    setTanks(fullTanks());
    setFatigue(0);
    setTraveledM(0);
    setElapsedMin(0);
    setFollowing(false);
    setAlongPx(0);
  };

  const toggleFollow = () => {
    if (!activePoints.length) return;
    if (following) {
      setFollowing(false);
      return;
    }
    if (progress >= 0.999) {
      const start = activePoints[0];
      const next = activePoints[1] || start;
      if (routed?.planetary) {
        applyPose({
          ...astronaut,
          x: start.x, y: start.y, lat: start.lat, lon: start.lon,
          heading: geoBearing(start, next),
          elevation: start.elevation, slope: start.slope || 0
        }, 0);
      } else {
        relocateTo(start.x, start.y, geoBearing(start, next), true);
      }
      setAlongPx(0);
    } else if (!routed?.planetary) {
      const snap = snapToPath(activePoints, astronaut.x, astronaut.y);
      const target = activePoints[snap.idx];
      if (target && Math.hypot(astronaut.x - target.x, astronaut.y - target.y) > 24) {
        relocateTo(target.x, target.y, target.heading || geoBearing(target, activePoints[Math.min(activePoints.length - 1, snap.idx + 1)]), true);
        setAlongPx(snap.alongPx);
      }
    }
    setControlMode('navigate');
    const longHaul = !!routed?.planetary && (activeMetrics.distanceKm || 0) > 12;
    setCameraMode(longHaul ? 'orbit' : 'astronaut');
    setFollowing(true);
    toast('GPS follow on. You should see yourself moving along the path.', 'info');
  };

  const value = {
    astronaut: geoAstro,
    home,
    destination,
    routeOrigin,
    cameraMode, setCameraMode,
    controlMode, setControlMode,
    clickIntent, setClickIntent,
    following, setFollowing, toggleFollow, beginTraverse,
    followSpeed, setFollowSpeed,
    alongPx, progress, idx, alongPoint,
    traveledM, traveledKm: traveledM / 1000, elapsedMin, fatigue,
    locatePulse, locateAstronaut, routeFitPulse,
    points: activePoints, stations: activeStations, metrics: evaMetrics,
    comparisons, routeRank, instruction, ahead, upcoming, alternate, routeExplain, plss, eva, assessment,
    returnRoute, safeReturn, envelope,
    headingText: headingLabel(geoAstro.heading),
    stick, setStick,
    setDestination, returnToBase, relocateTo, handleMapClick, handlePlaceSelect, resetCrew, seekProgress,
    rerouteOffer, acceptReroute, dismissReroute: () => setRerouteOffer(null),
    proposedPoints: rerouteOffer?.proposed?.points || [],
    blockedPoints: rerouteOffer?.blocked || [],
    routeAlerts: routed?.alerts || [],
    planetary: !!routed?.planetary,
    remainingKm: (forecast.remainingM || 0) / 1000,
    etaMin: Math.max(0, Math.round(forecast.remainingMin || 0))
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNavigation = () => useContext(Ctx);
