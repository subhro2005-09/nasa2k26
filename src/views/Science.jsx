import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { lat, lon } from '../lib/fmt.js';
import { PageHead } from '../lib/ui.jsx';
import { useUi } from '../context/UiContext.jsx';
import { SpectralChart } from '../components/Charts.jsx';

export default function Science() {
  const m = useMission();
  const n = useNavigation();
  const { setView } = useUi();
  const { pois, selectedPoiId, setSelectedPoiId, waypoints } = m;
  const p = pois.find((x) => x.id === selectedPoiId) || pois[0];
  const onRoute = p && waypoints.some((w) => w.id === p.id);
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Science targets" sub={`${pois.length} catalogued at ${m.mission.name}. Pick a target, read its spectrum, and add it to the traverse.`} />
      {!p ? <p className="card p-6 text-dust">No targets are catalogued for this site yet.</p> : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2 lg:max-h-[640px] scroll-y" role="listbox" aria-label="Targets">
            {pois.map((x) => (
              <button key={x.id} role="option" aria-selected={x.id === p.id} onClick={() => setSelectedPoiId(x.id)}
                className={`card p-3.5 text-left transition-colors ${x.id === p.id ? '!border-dusk/60 bg-panel2' : 'hover:bg-panel2'}`}>
                <div className="flex items-start justify-between gap-2"><span className="font-semibold text-[13px]">{x.name}</span>{waypoints.some((w) => w.id === x.id) && <span className="tag tag-info">On route</span>}</div>
                <div className="text-xs text-dust mt-0.5">{x.category}</div>
                <div className="text-xs mt-2 flex justify-between"><span className="text-dust">{x.tubeId}</span><span className="num text-sol font-semibold">{x.habitabilityScore} / 10</span></div>
              </button>
            ))}
          </div>
          <section className="card p-5 sm:p-6 flex flex-col gap-5 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><div className="text-xs text-dusk font-semibold">{p.category} · {p.tubeId}</div><h2 className="display text-[30px] font-medium mt-1">{p.name}</h2></div>
              <div className="flex gap-2">
                <button className="btn btn-pri" onClick={() => { n.setDestination(p); setView('explorer'); }}><Icon n="target" s={15} />Navigate here</button>
                <button className="btn" onClick={() => m.addPoiToRoute(p)} disabled={onRoute}><Icon n={onRoute ? 'check' : 'plus'} s={15} />{onRoute ? 'On the traverse' : 'Add to traverse'}</button>
              </div>
            </div>
            <p className="text-dust max-w-[70ch]">{p.description}</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="well p-4"><div className="label mb-1">Spectrum · CRISM</div><SpectralChart mineral={p.mineralComposition} /><p className="text-xs text-dust mt-1">{p.crismSignature}</p></div>
              <div className="flex flex-col gap-3">
                <div className="well p-4"><div className="label">Composition</div><div className="text-[13px] font-semibold mt-1">{p.mineralComposition}</div></div>
                <div className="well p-4"><div className="label">Biosignature potential</div><div className="text-[13px] font-semibold mt-1 text-sol row"><Icon n="flask" s={14} />{p.biosignaturePotential}</div></div>
                <div className="well p-4"><div className="label mb-2">Instruments</div><div className="flex flex-wrap gap-1.5">{p.instruments.map((i) => <span key={i} className="tag">{i}</span>)}</div></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-dust num border-t border-line pt-3"><span>{lat(p.coordinates.lat)}</span><span>{lon(p.coordinates.lon)}</span><span>{p.coordinates.elevation} m MOLA datum</span></div>
          </section>
        </div>
      )}
    </div>
  );
}
