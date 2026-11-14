import { useEffect, useMemo, useRef, useState } from 'react';
import { MISSIONS, useMission, HAZARD_KINDS } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useTelemetry } from '../context/TelemetryContext.jsx';
import { useUi } from '../context/UiContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { VIEWS } from './Shell.jsx';

export default function Palette() {
  const { palette, setPalette, setView, setBrief } = useUi();
  const m = useMission(), tel = useTelemetry(), n = useNavigation();
  const ref = useRef(), inp = useRef();
  const [q, setQ] = useState(''), [i, setI] = useState(0);

  const items = useMemo(() => [
    ...VIEWS.map((v) => ({ g: 'Go to', label: v.label, icon: v.icon, run: () => setView(v.id) })),
    ...MISSIONS.map((x) => ({ g: 'Mission', label: x.name, hint: `Sol ${x.activeSol}`, icon: 'target', run: () => m.setMissionId(x.id) })),
    ...[['safe', 'Safe path'], ['direct', 'Direct'], ['science', 'Science max']].map(([id, l]) => ({ g: 'Route', label: `Route: ${l}`, icon: 'route', run: () => m.setRouteMode(id) })),
    { g: 'Action', label: tel.playing ? 'Pause the walk' : 'Walk the plan', icon: tel.playing ? 'pause' : 'play', run: () => { setView('explorer'); tel.toggle(); } },
    { g: 'Nav', label: 'Locate astronaut', icon: 'target', run: () => { setView('explorer'); n.locateAstronaut(); } },
    { g: 'Nav', label: 'Return to base', icon: 'home', run: () => { setView('explorer'); n.returnToBase(); } },
    { g: 'Nav', label: 'Walk mode (WASD)', icon: 'user', run: () => { setView('explorer'); n.setControlMode('walk'); } },
    ...Object.entries(HAZARD_KINDS).map(([k, h]) => ({ g: 'Action', label: `Report hazard: ${h.label.toLowerCase()}`, icon: 'alert', run: () => { setView('explorer'); m.reportHazard(k, tel.progress); } })),
    { g: 'Action', label: 'Generate EVA brief', icon: 'file', run: () => setBrief(true) },
    { g: 'Action', label: 'Reset plan to mission baseline', icon: 'reset', run: m.resetRoute }
  ], [m, tel.playing, tel.progress, n]);

  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? items.filter((x) => `${x.g} ${x.label}`.toLowerCase().includes(s)) : items; }, [items, q]);
  useEffect(() => setI(0), [q]);
  useEffect(() => {
    const d = ref.current;
    if (palette && !d.open) { setQ(''); d.showModal(); inp.current?.focus(); }
    if (!palette && d.open) d.close();
  }, [palette]);
  const go = (x) => { setPalette(false); x && x.run(); };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((i + 1) % list.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setI((i - 1 + list.length) % list.length); }
    if (e.key === 'Enter') { e.preventDefault(); go(list[i]); }
  };
  useEffect(() => { document.getElementById(`pal-${i}`)?.scrollIntoView({ block: 'nearest' }); }, [i]);

  return (
    <dialog ref={ref} className="modal !m-0 !mx-auto !mt-[12vh]" style={{ width: 'min(600px, calc(100vw - 24px))', maxHeight: '70vh' }} aria-label="Command palette" onClose={() => setPalette(false)} onClick={(e) => e.target === ref.current && setPalette(false)}>
      <div className="flex items-center gap-3 px-4 border-b border-line">
        <Icon n="search" className="text-dust" />
        <input ref={inp} value={q} onInput={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Jump to a view, switch mission, run an action" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant={`pal-${i}`}
          className="flex-1 h-14 bg-transparent outline-none text-[15px] placeholder:text-dim" />
        <span className="kbd">Esc</span>
      </div>
      <div id="pal-list" role="listbox" className="scroll-y p-1.5">
        {list.length === 0 && <p className="p-4 text-dust text-sm">Nothing matches “{q}”.</p>}
        {list.map((x, n) => (
          <button key={x.g + x.label} id={`pal-${n}`} role="option" aria-selected={n === i} onMouseMove={() => setI(n)} onClick={() => go(x)}
            className={`w-full flex items-center gap-3 h-11 px-3 rounded-lg text-left text-[14px] ${n === i ? 'bg-white/[.08]' : ''}`}>
            <Icon n={x.icon} s={16} className="text-dust" /><span className="flex-1 truncate">{x.label}</span>
            {x.hint && <span className="text-xs text-dust">{x.hint}</span>}<span className="text-xs text-dim">{x.g}</span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
