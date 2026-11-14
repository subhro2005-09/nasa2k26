import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMission } from './MissionContext.jsx';
import { useNavigation } from './NavigationContext.jsx';
import { canvasToMarsCoords, pixelsToMeters } from '../services/coordinates.js';
import { analyzeMission, compareRoutes, createMission, getHealth, reportHazard, updateTelemetry } from '../services/aresApi.js';
import { toast } from '../lib/toast.js';

const Ctx = createContext(null);
const MODE = { safe: 'SAFE', direct: 'DIRECT', science: 'SCIENCE' };
const SEVERITY = { boulders: 'HIGH', slope: 'HIGH', dust: 'MEDIUM' };

function sampleWaypoints(points, mission, max = 24) {
  if (!points?.length || !mission) return [];
  const step = Math.max(1, Math.ceil(points.length / max));
  return points
    .filter((_, i) => i % step === 0 || i === points.length - 1)
    .map((p) => {
      const geo = p.lat != null ? { lat: p.lat, lon: p.lon } : canvasToMarsCoords(mission, p.x, p.y);
      return { latitude: geo.lat, longitude: geo.lon, elevation: p.elevation, slope: p.slope };
    });
}

export function DecisionProvider({ children }) {
  const m = useMission();
  const n = useNavigation();
  const [engineOnline, setEngineOnline] = useState(false);
  const [record, setRecord] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [hazardAlert, setHazardAlert] = useState(null);
  const [live, setLive] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const identity = useRef('');
  const hzCount = useRef(0);
  const pose = useRef({});
  pose.current = { n, m, record };

  useEffect(() => {
    let on = true;
    const ping = async () => {
      const h = await getHealth();
      if (on) setEngineOnline(!!h && h.status === 'online');
    };
    ping();
    const id = setInterval(ping, 20000);
    return () => { on = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    setRecord(null);
    setAnalysis(null);
    setComparison(null);
    setHazardAlert(null);
    setLive(null);
    identity.current = '';
    hzCount.current = 0;
  }, [m.missionId]);

  useEffect(() => {
    const dest = n.destination;
    const origin = n.routeOrigin;
    if (!engineOnline || !dest || !origin) return;
    const key = `${m.missionId}:${dest.id || dest.name}:${origin.lat}:${origin.lon}:${dest.lat}:${dest.lon}`;
    if (identity.current === key && record) return;
    identity.current = key;
    let cancelled = false;
    (async () => {
      const created = await createMission({
        mission_name: `${m.mission.name} → ${dest.name}`,
        astronaut_id: 'ASTRO-01',
        start: { latitude: origin.lat ?? n.astronaut.lat, longitude: origin.lon ?? n.astronaut.lon },
        destination: { latitude: dest.lat, longitude: dest.lon },
        mission_type: MODE[m.routeMode] || 'SAFE'
      });
      if (!cancelled && created?.mission_id) setRecord(created);
    })();
    return () => { cancelled = true; };
  }, [engineOnline, n.destination?.id, n.destination?.lat, n.destination?.lon, n.routeOrigin, m.missionId, m.mission.name, m.routeMode]);

  useEffect(() => {
    if (!engineOnline || !record?.mission_id || !n.destination || !n.routeOrigin) return;
    const dest = n.destination;
    const origin = n.routeOrigin;
    let cancelled = false;
    setAnalyzing(true);
    const t = setTimeout(async () => {
      const metrics = n.metrics || {};
      const body = await analyzeMission({
        mission_id: record.mission_id,
        start: { latitude: origin.lat ?? n.astronaut.lat, longitude: origin.lon ?? n.astronaut.lon },
        destination: { latitude: dest.lat, longitude: dest.lon },
        mode: MODE[m.routeMode] || 'SAFE',
        metrics: {
          distance_km: metrics.distanceKm,
          estimated_duration_minutes: metrics.estimatedTimeMin,
          max_slope: metrics.maxSlope,
          average_slope: metrics.avgSlope,
          elevation_gain: metrics.elevationGain,
          elevation_loss: metrics.elevationLoss,
          hazard_segments: metrics.hazardSegmentsCount,
          zone_samples: metrics.zoneSamples
        },
        resources: {
          oxygen_remaining: n.plss.o2RemainingPercent,
          battery_remaining: n.plss.batteryRemainingPercent,
          elapsed_time_minutes: n.elapsedMin,
          dust_tau: m.mission.dustTau
        },
        waypoints: sampleWaypoints(n.points, m.mission),
        hazard_count: (m.routing || []).length
      });
      if (!cancelled) {
        setAnalysis(body);
        setAnalyzing(false);
      }
      if (body && n.comparisons) {
        const rows = ['safe', 'direct', 'science'].map((id) => {
          const r = n.comparisons[id];
          const met = r?.metrics || {};
          return {
            type: MODE[id],
            distance_km: met.distanceKm || 0,
            duration_minutes: met.estimatedTimeMin || 0,
            hazards: met.hazardSegmentsCount || met.zoneSamples ? 1 : 0,
            max_slope: met.maxSlope,
            average_slope: met.avgSlope
          };
        });
        const cmp = await compareRoutes({
          mission_id: record.mission_id,
          start: { latitude: origin.lat ?? n.astronaut.lat, longitude: origin.lon ?? n.astronaut.lon },
          destination: { latitude: dest.lat, longitude: dest.lon },
          routes: rows,
          resources: {
            oxygen_remaining: n.plss.o2RemainingPercent,
            battery_remaining: n.plss.batteryRemainingPercent,
            dust_tau: m.mission.dustTau
          }
        });
        if (!cancelled) setComparison(cmp);
      }
    }, 280);
    return () => { cancelled = true; clearTimeout(t); setAnalyzing(false); };
  }, [
    engineOnline, record?.mission_id, m.routeMode, m.routing?.length,
    n.metrics?.distanceKm, n.metrics?.maxSlope, n.destination?.id, n.points?.length
  ]);

  useEffect(() => {
    const routing = m.routing || [];
    if (!engineOnline || !record?.mission_id) {
      hzCount.current = routing.length;
      return;
    }
    if (routing.length <= hzCount.current) {
      hzCount.current = routing.length;
      return;
    }
    const h = routing[routing.length - 1];
    hzCount.current = routing.length;
    const geo = canvasToMarsCoords(m.mission, h.x, h.y);
    (async () => {
      const res = await reportHazard({
        mission_id: record.mission_id,
        hazard: {
          latitude: geo.lat,
          longitude: geo.lon,
          radius: pixelsToMeters(h.r || 40),
          severity: SEVERITY[h.kind] || 'HIGH'
        }
      });
      if (!res) return;
      setHazardAlert(res);
      if (res.route_affected) {
        toast(res.message || 'Reroute required', 'warn', 'Accept the terrain-aware alternate on the map.');
      }
    })();
  }, [engineOnline, record?.mission_id, m.routing?.length]);

  useEffect(() => {
    if (!engineOnline || !record?.mission_id || !n.following) return;
    const id = setInterval(async () => {
      const { n: nav, record: rec } = pose.current;
      if (!rec?.mission_id || !nav.following) return;
      const body = await updateTelemetry({
        mission_id: rec.mission_id,
        position: { latitude: nav.astronaut.lat, longitude: nav.astronaut.lon },
        oxygen: nav.plss.o2RemainingPercent,
        battery: nav.plss.batteryRemainingPercent,
        elapsed_time_minutes: +nav.elapsedMin.toFixed(2)
      });
      if (body) {
        setLive(body);
        if (body.decision === 'NO_GO') toast(body.reasons?.[0] || 'NO-GO from decision engine', 'bad');
      }
    }, 2500);
    return () => clearInterval(id);
  }, [engineOnline, record?.mission_id, n.following]);

  const value = useMemo(() => ({
    engineOnline,
    analyzing,
    missionId: record?.mission_id || null,
    analysis,
    comparison,
    hazardAlert,
    telemetry: live,
    decision: live?.decision || analysis?.decision?.status || null,
    safetyScore: analysis?.decision?.safety_score ?? null
  }), [engineOnline, analyzing, record, analysis, comparison, hazardAlert, live]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDecision = () => useContext(Ctx);
