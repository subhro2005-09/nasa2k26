import { useMission } from '../context/MissionContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { toast } from '../lib/toast.js';
import { Modal, Stat } from '../lib/ui.jsx';
import { CheckList } from './Panels.jsx';

export default function EvaBrief() {
  const { brief, setBrief } = useUi();
  const m = useMission();
  const { mission, metrics, assessment: a, stations, endPlss, hazards, routeMode, planVersion } = m;
  const modeName = { safe: 'Safe path', direct: 'Direct', science: 'Science max' }[routeMode];

  const data = () => ({
    mission: mission.name, code: mission.code, sol: mission.activeSol, generatedAt: new Date().toISOString(), routeMode, planVersion,
    decision: a.headline, metrics: { distanceKm: metrics.distanceKm, durationMin: metrics.estimatedTimeMin, maxSlopeDeg: +metrics.maxSlope.toFixed(1), ascentM: metrics.elevationGain, descentM: metrics.elevationLoss, o2AtReturnPct: endPlss.o2RemainingPercent },
    stations: stations.map((s) => ({ n: s.n, name: s.name, type: s.type, km: +s.km.toFixed(2), etaMin: s.etaMin, slopeDeg: +s.slope.toFixed(1), elevationM: s.elevation, o2Pct: s.o2 })),
    checks: a.checks.map(({ label, level, detail }) => ({ label, level, detail })),
    hazards: hazards.map((h) => ({ kind: h.kind, x: h.x, y: h.y, radiusPx: h.r, version: h.v, validated: h.validated }))
  });
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data(), null, 2)], { type: 'application/json' }));
    Object.assign(document.createElement('a'), { href: url, download: `ARES_EVA_${mission.id}_sol${mission.activeSol}_v${planVersion}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    const d = data();
    const text = [`ARES EVA brief · ${d.mission} · Sol ${d.sol} · plan v${d.planVersion} (${modeName})`, `Decision: ${d.decision}`,
      `${metrics.distanceKm} km · ${metrics.estimatedTimeFormatted} · max slope ${metrics.maxSlope.toFixed(1)}° · O2 at return ${endPlss.o2RemainingPercent}%`, '',
      ...stations.map((s) => `${s.n}. ${s.name}: ${s.km.toFixed(1)} km, ETA ${s.etaMin} min`), '', ...a.checks.map((c) => `[${c.level}] ${c.label}: ${c.detail}`)].join('\n');
    try { await navigator.clipboard.writeText(text); toast('Brief copied to the clipboard', 'ok'); } catch { toast('Clipboard is blocked here. Use Download instead.', 'warn'); }
  };

  return (
    <Modal open={brief} onClose={() => setBrief(false)} wide title="EVA brief" sub={`${mission.name} · Sol ${mission.activeSol} · plan v${planVersion} · ${modeName}`}
      footer={<><button className="btn" onClick={copy}><Icon n="copy" s={15} />Copy summary</button><button className="btn btn-pri" onClick={download}><Icon n="download" s={15} />Download JSON</button></>}>
      <div className="flex flex-col gap-5">
        <div className="well p-4 flex items-center gap-4">
          <div className={`display text-[40px] ${{ go: 'text-sol', caution: 'text-butter', hold: 'text-hazard' }[a.state]}`}>{a.state === 'hold' ? 'Hold' : 'Go'}</div>
          <p className="text-[13px] text-dust">{a.state === 'go' ? 'Every check passed.' : a.state === 'caution' ? `Cleared with ${a.advisories} advisor${a.advisories === 1 ? 'y' : 'ies'} the crew should acknowledge.` : 'Do not start this EVA until the failed checks are resolved.'}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <Stat label="Distance" value={`${metrics.distanceKm} km`} sub={`${stations.length} stations`} />
          <Stat label="Duration" value={metrics.estimatedTimeFormatted} sub="walking time" />
          <Stat label="Max slope" value={`${metrics.maxSlope.toFixed(1)}°`} sub="limit 15°" />
          <Stat label="O₂ at return" value={`${endPlss.o2RemainingPercent}%`} sub="45 min reserve" />
        </div>
        <div>
          <h3 className="font-semibold text-[13px] mb-2">Stations</h3>
          <div className="well divide-y divide-line">
            {stations.map((s) => (
              <div key={s.id} className="grid grid-cols-[28px_1fr_auto] gap-3 items-center px-3 py-2.5 text-[13px]">
                <span className="num text-dust">{s.type === 'hab' ? 'H' : s.n}</span><span className="font-semibold truncate">{s.name}</span><span className="num text-dust">{s.km.toFixed(1)} km · +{s.etaMin} min</span>
              </div>
            ))}
          </div>
        </div>
        <div><h3 className="font-semibold text-[13px] mb-3">Safety checks</h3><CheckList checks={a.checks} /></div>
      </div>
    </Modal>
  );
}
