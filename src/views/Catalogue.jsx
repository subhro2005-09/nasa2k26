import { SCIENCE_LAYERS } from '../data/layersData.js';
import { PageHead } from '../lib/ui.jsx';

const host = (u) => { try { return new URL(u).host; } catch { return 'rover telemetry'; } };
export default function Catalogue() {
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Data catalogue" sub="The orbital and surface datasets behind the atlas and the planner. The atlas streams imagery from NASA Mars Trek directly. ARES stores none of it." />
      <div className="grid md:grid-cols-2 gap-3">
        {SCIENCE_LAYERS.map((l) => (
          <article key={l.id} className="card p-5 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-[15px]">{l.name}</h2><span className="tag tag-info num">{l.resolution}</span></div>
            <div className="text-xs text-ember2 font-semibold">{l.mission}</div>
            <p className="text-[13px] text-dust">{l.description}</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-dust border-t border-line pt-3 mt-auto"><span>{l.spectralBand}</span><span className="num">{host(l.tileEndpoint)}</span></div>
          </article>
        ))}
      </div>
    </div>
  );
}
