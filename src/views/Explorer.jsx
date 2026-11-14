import { HAZARD_KINDS, useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useTelemetry } from '../context/TelemetryContext.jsx';
import { useDecision } from '../context/DecisionContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { Menu, MenuItem, PageHead, Seg, Stat } from '../lib/ui.jsx';
import { hex } from '../lib/fmt.js';
import { MapCard } from '../components/MapCard.jsx';
import { EvaDashboard } from '../components/EvaDashboard.jsx';
import { NavigationHUD, RouteAlerts, RouteComparison, RouteMap2D, SafeReturnPanel } from '../components/NavigationHUD.jsx';
import { RouteTimeline } from '../components/RouteTimeline.jsx';
import { PlacesPanel } from '../components/PlacesPanel.jsx';
import { TerrainAhead } from '../components/TerrainAhead.jsx';
import { HazardLog, Tracker, Verdict } from '../components/Panels.jsx';

const MODES = [
  { id: 'safe', label: 'Safest', icon: 'shield', hint: 'Low slope, avoid hazards, keep return margin' },
  { id: 'direct', label: 'Fastest', icon: 'bolt', hint: 'Shortest time; still penalises severe hazards' },
  { id: 'science', label: 'Science', icon: 'flask', hint: 'Detours through nearby high-value targets' }
];
const COPY = {
  safe: 'A* with high slope and hazard costs. The polyline bends around scarps, dunes and reported events.',
  direct: 'A* with cheaper terrain costs — still not a straight line. Faster, more slope exposure.',
  science: 'A* plus vias through nearby high-value targets, still blocked by extreme slope.'
};

function Glance() {
  const n = useNavigation();
  const d = useDecision();
  const score = d?.safetyScore;
  return (
    <section className="grid grid-cols-2 gap-2.5" aria-label="Route at a glance">
      <Stat label="Distance" value={`${n.metrics?.distanceKm ?? 0} km`} sub={`${n.stations?.length || 0} stations`} />
      <Stat label="Walking time" value={n.eva?.totalHMS || n.metrics?.estimatedTimeFormatted || '00:00:00'} sub={`${(n.traveledKm || 0).toFixed(2)} km walked`} />
      <Stat label="Max slope" value={`${(n.metrics?.maxSlope || 0).toFixed(1)}°`} sub="limit 15°" color={(n.metrics?.maxSlope || 0) > 15 ? hex.hazard : undefined} />
      <Stat label="O₂ now" value={`${n.plss.o2RemainingPercent}%`} sub={`${(n.eva?.oxygenRemaining ?? 0).toFixed(1)} kg · ${n.plss.o2EnduranceFormatted}`} color={n.plss.o2RemainingPercent < 25 ? hex.hazard : hex.sol} />
      {score != null && <Stat label="Safety score" value={`${score}`} sub={d.decision || 'decision engine'} color={d.decision === 'NO_GO' ? hex.hazard : d.decision === 'CAUTION' ? hex.butter : hex.sol} />}
    </section>
  );
}

function Target() {
  const { pois, selectedPoiId, addPoiToRoute, setSelectedPoiId, assessment } = useMission();
  const n = useNavigation();
  const { setView } = useUi();
  const poi = pois.find((p) => p.id === selectedPoiId) || pois[0];
  if (!poi) return null;
  return (
    <section className="card p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between"><h2 className="font-semibold text-[15px]">Science destination</h2><span className="tag tag-info">{assessment.scienceCount} of {pois.length} on route</span></div>
      <div><div className="display text-[22px] font-medium">{poi.name}</div><div className="text-xs text-dust">{poi.category} · {poi.tubeId}</div></div>
      <p className="text-[13px] text-dust line-clamp-3">{poi.description}</p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn" onClick={() => { setSelectedPoiId(poi.id); setView('science'); }}>Open record</button>
        <button className="btn btn-pri" onClick={() => n.setDestination(poi)}><Icon n="target" s={15} />Navigate here</button>
      </div>
      <button className="btn" onClick={() => addPoiToRoute(poi)}><Icon n="plus" s={15} />Add to planned traverse</button>
    </section>
  );
}

export default function Explorer() {
  const m = useMission(), tel = useTelemetry();
  const { role, setBrief } = useUi();
  return (
    <div className="flex flex-col gap-4">
      <PageHead title={`${m.mission.name} · you are here`} sub={COPY[m.routeMode]}>
        <Seg label="Route mode" value={m.routeMode} onChange={m.setRouteMode} options={MODES} />
        <Menu align="right" trigger={({ toggle, open }) => <button className="btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open}><Icon n="alert" s={15} className="text-butter" />Report hazard<Icon n="chev" s={14} /></button>}>
          {Object.entries(HAZARD_KINDS).map(([k, h]) => <MenuItem key={k} hint={h.hint} onClick={() => m.reportHazard(k, tel.progress)}>{h.label}</MenuItem>)}
        </Menu>
      </PageHead>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="h-[42dvh] min-h-[220px] max-h-[70dvh] sm:h-[52vh] sm:min-h-[340px] xl:sticky xl:top-20 xl:h-[calc(100dvh-6.5rem)] xl:max-h-none xl:min-h-[480px]"><MapCard /></div>
        <div className="flex flex-col gap-4">
          <NavigationHUD />
          <RouteComparison />
          <EvaDashboard />
          <RouteTimeline />
          <PlacesPanel />
          <RouteAlerts />
          <RouteMap2D />
          <SafeReturnPanel />
          <Verdict onBrief={() => setBrief(true)} />
          <Glance />
          {role !== 'crew' && <Target />}
        </div>
      </div>
      <section className="card p-4 sm:p-5">
        <TerrainAhead height={84} />
      </section>
      <Tracker />
      {(m.hazardLog.length > 0 || role === 'control') && <HazardLog />}
    </div>
  );
}
