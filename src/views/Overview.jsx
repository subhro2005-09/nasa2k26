import { useMission } from '../context/MissionContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { lat, lon } from '../lib/fmt.js';
import { PageHead, Stat } from '../lib/ui.jsx';

const STEPS = [
  ['user', 'You are here', 'Astronaut position is the origin for every route, chart and life-support number.'],
  ['route', 'Route solver', 'A* from your position: safest, fastest, or science-weighted.'],
  ['shield', 'Decision engine', 'Backend scores terrain, hazards and consumables, then returns GO / CAUTION / NO-GO.'],
  ['alert', 'Closed loop', 'Move, burn PLSS, report a hazard, re-solve the path, and re-score the mission.']
];
const LIVE = [
  ['Real NASA data', 'Atlas imagery and elevation, science target names and spectral classes.'],
  ['Modelled', 'Local terrain used by the solver, suit consumables, line-of-sight to the habitat.'],
  ['Simulated', 'Crew telemetry, signal delay, wind, and the Mission Control validation step.']
];

export default function Overview() {
  const { mission: m, pois } = useMission();
  const { setView } = useUi();
  const top = [...pois].sort((a, b) => b.habitabilityScore - a.habitabilityScore).slice(0, 3);
  return (
    <div className="flex flex-col gap-4">
      <PageHead title={`${m.name} expedition`} sub={m.summary}>
        <button className="btn btn-pri" onClick={() => setView('explorer')}>Open surface explorer<Icon n="arrow" s={15} /></button>
      </PageHead>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Stat label="Mission" value={m.code} sub={m.subtitle} />
        <Stat label="Landing" value={m.landingDate} sub={`Sol ${m.activeSol}`} />
        <Stat label="Site" value={`${lat(m.coordinates.lat).replace('° ', '°')}`} sub={lon(m.coordinates.lon)} />
        <Stat label="Surface" value={`${m.tempRange.min}° to ${m.tempRange.max}°C`} sub={`${m.pressureAvg} Pa · τ ${m.dustTau}`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-[15px] row"><Icon n="target" className="text-ember2" />Science objectives</h2>
          {top.length ? top.map((p) => <div key={p.id} className="well p-3"><div className="font-semibold text-[13px]">{p.name}</div><div className="text-xs text-dust">{p.category} · biosignature potential {p.biosignaturePotential.toLowerCase()}</div></div>) : <p className="text-sm text-dust">No targets catalogued for this site yet.</p>}
        </section>
        <section className="card p-5 flex flex-col gap-3">
          <h2 className="font-semibold text-[15px] row"><Icon n="user" className="text-dusk" />EVA crew</h2>
          {[['Cmdr. Elena Vance', 'EVA-1 · Field geology lead'], ['Dr. Marcus Chen', 'EVA-2 · Astrobiologist']].map(([n, r]) => (
            <div key={n} className="well p-3 flex items-center justify-between gap-3"><div><div className="font-semibold text-[13px]">{n}</div><div className="text-xs text-dust">{r}</div></div><span className="tag tag-go">Nominal</span></div>
          ))}
        </section>
        <section className="card p-5 flex flex-col gap-2.5 text-[13px]">
          <h2 className="font-semibold text-[15px] row"><Icon n="radio" className="text-sol" />Deep Space Network</h2>
          {[['Ground station', 'DSS-14 Goldstone'], ['One-way delay', '14.2 min (sim)'], ['Downlink', '2.0 Mbps X-band'], ['Uplink lock', '99.8%']].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-line pb-2 last:border-0"><span className="text-dust">{k}</span><span className="num font-semibold">{v}</span></div>)}
        </section>
      </div>
      <section className="card p-5">
        <h2 className="font-semibold text-[15px]">How ARES gets a crew home</h2>
        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {STEPS.map(([ic, t, d], i) => <li key={t} className="well p-4"><div className="row text-dusk"><Icon n={ic} /><span className="font-semibold text-bone text-[13px]">{t}</span></div><p className="text-xs text-dust mt-2">{d}</p>{i < 3 && <span className="sr-only">then</span>}</li>)}
        </ol>
      </section>
      <section className="card p-5">
        <h2 className="font-semibold text-[15px]">What is real, modelled and simulated</h2>
        <dl className="grid md:grid-cols-3 gap-3 mt-4">{LIVE.map(([k, v]) => <div key={k} className="well p-4"><dt className="font-semibold text-[13px]">{k}</dt><dd className="text-xs text-dust mt-1">{v}</dd></div>)}</dl>
      </section>
    </div>
  );
}
