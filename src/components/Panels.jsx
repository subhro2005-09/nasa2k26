import { useState } from 'react';
import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useTelemetry } from '../context/TelemetryContext.jsx';
import { useDecision } from '../context/DecisionContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { hm, hex } from '../lib/fmt.js';
import { Meter, Seg, Stat } from '../lib/ui.jsx';
import { ProfileChart } from './Charts.jsx';

const LV = { pass: ['check', 'text-sol'], warn: ['alert', 'text-butter'], fail: ['x', 'text-hazard'] };
export const CheckList = ({ checks }) => (
  <ul className="flex flex-col gap-2.5">
    {checks.map((c) => (
      <li key={c.id} className="flex gap-2.5"><Icon n={LV[c.level][0]} s={16} className={`${LV[c.level][1]} mt-0.5`} />
        <div className="min-w-0"><div className="font-semibold text-[13px]">{c.label}</div><div className="text-xs text-dust">{c.detail}</div></div></li>
    ))}
  </ul>
);

/** The hero: a live Go / No-Go derived from the route, the suit model and every reported hazard. */
export function Verdict({ onBrief }) {
  const { revalidating, planVersion, routeMode, setRouteMode, savePlan, assessment: planA } = useMission();
  const n = useNavigation();
  const a = n.destination ? n.assessment : planA;
  const [all, setAll] = useState(false);
  const color = { go: 'text-sol', caution: 'text-butter', hold: 'text-hazard' }[a.state];
  const needs = a.checks.filter((c) => c.level !== 'pass'), ok = a.checks.filter((c) => c.level === 'pass');
  const sub = a.state === 'go' ? `All ${a.checks.length} checks passed` : a.state === 'caution' ? `with ${a.advisories} advisor${a.advisories === 1 ? 'y' : 'ies'}` : `${a.failures} check${a.failures === 1 ? '' : 's'} failed`;
  return (
    <section className="card p-5 flex flex-col gap-4" aria-live="polite" aria-label="Go or No-Go assessment">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label">Go / No-Go</div>
          <div className={`display text-[64px] font-medium transition-colors ${color}`}>{a.state === 'hold' ? 'Hold' : 'Go'}</div>
          <div className="text-[13px] text-dust -mt-0.5">{sub}</div>
        </div>
        <div className="flex flex-col items-end gap-2"><span className="tag tag-info">Plan v{planVersion}</span>{revalidating && <span className="tag tag-caution live">Revalidating</span>}</div>
      </div>
      <MissionAnalysis />
      {needs.length > 0 && <CheckList checks={needs} />}
      {a.state === 'hold' && routeMode === 'direct' && <button className="btn" onClick={() => setRouteMode('safe')}><Icon n="shield" />Switch to Safe path</button>}
      {ok.length > 0 && (
        <div>
          <button className="row text-[13px] text-dust hover:text-bone font-semibold" onClick={() => setAll(!all)} aria-expanded={all}>
            <Icon n="check" s={15} className="text-sol" />{ok.length} checks passed<Icon n="chev" s={14} className={all ? 'rotate-180' : ''} />
          </button>
          {all && <div className="mt-3"><CheckList checks={ok} /></div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mt-auto">
        <button className="btn" onClick={savePlan}><Icon n="save" s={15} />Save plan</button>
        <button className="btn btn-pri" onClick={onBrief}><Icon n="file" s={15} />EVA brief</button>
      </div>
    </section>
  );
}

const DEC = { GO: 'tag-go', CAUTION: 'tag-caution', NO_GO: 'tag-hold', REROUTE_REQUIRED: 'tag-caution' };

function MissionAnalysis() {
  const d = useDecision();
  const n = useNavigation();
  const a = d?.analysis;
  if (!d?.engineOnline && !a) {
    return <p className="text-xs text-dim">Decision engine offline. Local Go/No-Go still applies.</p>;
  }
  if (!a) {
    return <p className="text-xs text-dust">{d?.analyzing ? 'Scoring the live route…' : n.destination ? 'Waiting for mission analysis.' : 'Pick a destination to run mission analysis.'}</p>;
  }
  const dec = a.decision || {};
  const status = d.hazardAlert?.route_affected ? 'REROUTE_REQUIRED' : (d.telemetry?.decision || dec.status);
  const reasons = d.hazardAlert?.route_affected ? [d.hazardAlert.message, ...(d.hazardAlert.reasons || [])] : (dec.reason || []);
  return (
    <div className="well p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="label">Mission analysis</div>
        <span className={`tag ${DEC[status] || 'tag-info'}`}>{String(status).replace(/_/g, ' ')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <div><div className="text-dust text-xs">Distance</div><div className="num font-semibold">{a.route.distance_km} km</div></div>
        <div><div className="text-dust text-xs">Estimated time</div><div className="num font-semibold">{a.route.estimated_duration_minutes} min</div></div>
        <div><div className="text-dust text-xs">Hazards</div><div className="num font-semibold">{a.hazards.count}</div></div>
        <div><div className="text-dust text-xs">Max slope</div><div className="num font-semibold">{a.terrain.max_slope}°</div></div>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-dust">Safety score</span>
        <span className="num font-semibold">{dec.safety_score}/100</span>
      </div>
      <ul className="flex flex-col gap-1">
        {reasons.slice(0, 4).map((r) => (
          <li key={r} className="text-xs text-dust">· {r}</li>
        ))}
      </ul>
      {d.missionId && <div className="text-[11px] text-dim num">{d.missionId}{d.telemetry ? ` · O₂ ${d.telemetry.oxygen}%` : ''}</div>}
    </div>
  );
}

const SPEEDS = [1, 2, 5, 10].map((s) => ({ id: s, label: `${s}×` }));
export function Tracker() {
  const { metrics, endPlss } = useMission();
  const t = useTelemetry();
  const n = useNavigation();
  const done = (n.eva?.distanceTravelled || 0) / 1000;
  const el = n.elapsedMin || 0;
  const o2 = t.plss.o2RemainingPercent, last = t.alerts[0];
  const lc = { ok: 'text-sol', info: 'text-dusk', warn: 'text-butter', bad: 'text-hazard' }[last.tone];
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold text-[15px]">Traverse tracker</h2><p className="text-xs text-dust">The marker is you. Play follows the solved route; drag the profile to jump.</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn btn-pri min-w-40" onClick={t.toggle}><Icon n={t.playing ? 'pause' : 'play'} fill={!t.playing} s={15} />{t.playing ? 'Pause' : t.progress >= 1 ? 'Walk again' : 'Walk the plan'}</button>
          <button className="btn !px-3" onClick={t.reset} aria-label="Reset traverse"><Icon n="reset" s={15} /></button>
          <Seg label="Playback speed" value={t.speed} onChange={t.setSpeed} options={SPEEDS} />
        </div>
      </div>
      <div className="mt-4"><ProfileChart height={150} /></div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-dust mt-3">
        {[['#6fd6a3', 'Under 8°'], ['#e8a53d', '8° to 15°'], ['#ff6b6b', 'Over 15°']].map(([c, l]) => <span key={l} className="row !gap-1.5"><i className="w-4 h-[3px] rounded" style={{ background: c }} />{l}</span>)}
        <span className="row !gap-1.5"><i className="w-3 h-3 rounded-sm bg-butter/25" />Mapped hazard zone</span>
        <span className="row !gap-1.5"><i className="w-3 h-3 rounded-sm bg-hazard/40" />Reported hazard</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4">
        <Stat label="Distance" value={`${done.toFixed(2)} km`} sub={`of ${((n.eva?.totalDistance || metrics.distanceKm * 1000) / 1000).toFixed(2)} km`} />
        <Stat label="Elapsed" value={n.eva?.elapsedHMS || hm(el)} sub={`of ${n.eva?.totalHMS || metrics.estimatedTimeFormatted}`} />
        <Stat label="Slope here" value={`${(n.eva?.terrainSlope ?? t.now?.slope ?? 0).toFixed(1)}°`} sub={`${t.now?.elevation ?? 0} m`} color={(n.eva?.terrainSlope ?? 0) > 15 ? hex.hazard : undefined} />
        <div className="well p-3"><div className="label">Oxygen</div><div className="num text-[22px] font-semibold">{o2}%</div><div className="text-[11px] text-dust">{(n.eva?.oxygenRemaining ?? 0).toFixed(1)} kg</div><Meter pct={o2} label="Oxygen remaining" color={o2 < 25 ? hex.hazard : hex.dusk} /></div>
        <Stat label="Heart rate" value={`${t.hr} bpm`} sub={t.hr > 130 ? 'Elevated' : 'Steady'} color={t.hr > 130 ? hex.butter : undefined} />
        <Stat label="Walk-back reserve" value={t.plss.contingencyMet ? 'Met' : 'At risk'} sub={`${(n.eva?.oxygenNeeded ?? 0).toFixed(1)} kg to dest · end ${endPlss.o2RemainingPercent}%`} color={t.plss.contingencyMet ? hex.sol : hex.hazard} />
      </div>
      <p className={`text-[13px] mt-3 row ${lc}`} role="status"><span className="dot" />{last.text}</p>
    </section>
  );
}

const STEP = { ok: 'text-sol', info: 'text-dusk', warn: 'text-butter' };
export function HazardLog() {
  const { hazardLog, hazards, clearHazards } = useMission();
  const { role } = useUi();
  if (!hazardLog.length && role !== 'control') return null;
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-semibold text-[15px]">Hazard re-planning</h2><p className="text-xs text-dust">Report, validate, publish, replace. The same loop the backend runs, shown step by step.</p></div>
        {hazards.length > 0 && <button className="btn btn-ghost" onClick={clearHazards}><Icon n="trash" s={14} />Clear</button>}
      </div>
      {hazardLog.length === 0
        ? <p className="well p-4 mt-3 text-sm text-dust">No reports yet. Use <span className="text-bone font-semibold">Report hazard</span> above to send one and watch the route re-plan.</p>
        : <ol className="mt-4 flex flex-col gap-3">
            {hazardLog.map((e) => (
              <li key={e.id} className="flex gap-3"><span className={`grid place-items-center w-6 h-6 rounded-full border border-line2 num text-xs font-bold ${STEP[e.tone]}`}>{e.n}</span>
                <div className="min-w-0 flex-1"><div className="font-semibold text-[13px]">{e.title}</div><div className="text-xs text-dust">{e.detail}</div></div>
                <span className="num text-xs text-dim">+{(e.at / 1000).toFixed(1)}s</span></li>
            ))}
          </ol>}
    </section>
  );
}

