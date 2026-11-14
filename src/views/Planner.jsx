import { useMission } from '../context/MissionContext.jsx';
import { useTelemetry } from '../context/TelemetryContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { hex, hm } from '../lib/fmt.js';
import { Meter, PageHead, Seg, Stat } from '../lib/ui.jsx';
import { ProfileChart } from '../components/Charts.jsx';
import { CheckList } from '../components/Panels.jsx';

const MODES = [{ id: 'safe', label: 'Safe path' }, { id: 'direct', label: 'Direct' }, { id: 'science', label: 'Science max' }];

function Reserve({ icon, label, pct, sub, color }) {
  return (
    <div className="well p-3"><div className="flex items-center justify-between text-[13px]"><span className="row !gap-1.5 text-dust"><Icon n={icon} s={14} style={{ color }} />{label}</span><span className="num font-semibold">{pct}%</span></div>
      <div className="mt-2"><Meter pct={pct} color={color} label={label} /></div><div className="text-xs text-dust mt-1.5">{sub}</div></div>
  );
}

export default function Planner() {
  const m = useMission(), { plss } = useTelemetry();
  const { metrics, stations, assessment: a } = m;
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Traverse planner" sub="Change the strategy, add targets from the Science view, and watch every number and check below recompute.">
        <Seg label="Route mode" value={m.routeMode} onChange={m.setRouteMode} options={MODES} />
      </PageHead>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4 min-w-0">
          <section className="card p-4 sm:p-5">
            <h2 className="font-semibold text-[15px]">Elevation profile</h2>
            <div className="mt-3"><ProfileChart height={190} /></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-4">
              <Stat label="Distance" value={`${metrics.distanceKm} km`} />
              <Stat label="Walking time" value={metrics.estimatedTimeFormatted} />
              <Stat label="Ascent / descent" value={`${metrics.elevationGain} / ${metrics.elevationLoss} m`} />
              <Stat label="Max slope" value={`${metrics.maxSlope.toFixed(1)}°`} color={metrics.maxSlope > 15 ? hex.hazard : metrics.maxSlope > 12 ? hex.butter : undefined} sub="limit 15°" />
            </div>
          </section>
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-[15px]">Stations and timeline</h2>
              <div className="flex gap-2"><button className="btn btn-ghost" onClick={m.addHabReturn}><Icon n="home" s={14} />Return to habitat</button><button className="btn btn-ghost" onClick={m.resetRoute}><Icon n="reset" s={14} />Reset</button></div>
            </div>
            {stations.length < 2 && <p className="well p-4 mt-3 text-sm text-dust">A traverse needs at least two stations. Add targets from the Science view.</p>}
            <div className="mt-3 flex flex-col gap-2">
              {stations.map((s) => (
                <div key={s.id} className="well p-3 grid grid-cols-[28px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center">
                  <span className={`grid place-items-center w-7 h-7 rounded-full text-xs font-bold text-void`} style={{ background: s.type === 'hab' ? hex.sol : s.type === 'science' ? hex.dusk : '#a9a0ae' }}>{s.type === 'hab' ? 'H' : s.n}</span>
                  <div className="min-w-0"><div className="font-semibold text-[13px] truncate">{s.name}</div><div className="text-xs text-dust num">{s.km.toFixed(1)} km · {s.elevation} m · slope {s.slope.toFixed(1)}° · O₂ {s.o2}%</div></div>
                  <div className="flex items-center gap-2"><span className="num text-[13px] font-semibold">{hm(s.etaMin)}</span>
                    <button className="icon-btn !w-8 !h-8" onClick={() => m.removeWaypoint(s.id)} aria-label={`Remove ${s.name}`}><Icon n="trash" s={14} /></button></div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <div className="flex flex-col gap-4">
          <section className="card p-5">
            <div className="flex items-center justify-between"><h2 className="font-semibold text-[15px]">Suit reserves</h2><span className={`tag ${plss.contingencyMet ? 'tag-go' : 'tag-hold'}`}>{plss.contingencyMet ? 'Margin met' : 'Margin low'}</span></div>
            <div className="flex flex-col gap-2.5 mt-3">
              <Reserve icon="wind" label="Oxygen" pct={plss.o2RemainingPercent} color={hex.dusk} sub={`${(plss.o2Kg ?? (plss.o2RemainingLiters * 25.6 / 1200)).toFixed(1)} kg · ${plss.o2EnduranceFormatted} at ${(plss.o2BurnRateKgH || 0.84).toFixed(2)} kg/h`} />
              <Reserve icon="bolt" label="Power" pct={plss.batteryRemainingPercent} color={hex.sol} sub={`${plss.batteryRemainingPercent}% · ${(plss.batteryDrainPctH || 8).toFixed(1)} %/h`} />
              <Reserve icon="drop" label="Cooling water" pct={plss.coolingWaterPercent} color="#8fb4ff" sub="Sublimator loop" />
            </div>
            <p className="text-xs text-dust mt-3">Consumables follow actual movement and terrain effort. Walk-back is a routed path, not this radius number.</p>
          </section>
          <section className="card p-5"><h2 className="font-semibold text-[15px] mb-3">Safety checks</h2><CheckList checks={a.checks} /></section>
        </div>
      </div>
    </div>
  );
}
