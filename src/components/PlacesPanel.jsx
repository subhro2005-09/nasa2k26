import { useMemo, useState } from 'react';
import { HIGHLIGHTS, CATEGORY_META } from '../../mars-atlas-src/data/highlights.js';
import { useNavigation } from '../context/NavigationContext.jsx';
import { haversineKm } from '../routing/planetRoute.js';

export function PlacesPanel() {
  const n = useNavigation();
  const [q, setQ] = useState('');
  const you = n.astronaut;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return HIGHLIGHTS
      .map((p) => ({ ...p, km: you?.lat != null ? haversineKm(you, p) : 0 }))
      .filter((p) => !s || p.name.toLowerCase().includes(s) || (CATEGORY_META[p.category]?.label || '').toLowerCase().includes(s))
      .sort((a, b) => a.km - b.km);
  }, [q, you?.lat, you?.lon]);

  return (
    <section className="card p-4 flex flex-col gap-2 min-h-0">
      <div>
        <h2 className="font-semibold text-[15px]">Navigate to a place</h2>
        <p className="text-xs text-dust">Routes start from you. Same list as the globe Explore panel.</p>
      </div>
      <input value={q} onInput={(e) => setQ(e.target.value)} placeholder="Olympus, Valles Marineris, Jezero…"
        className="h-9 px-3 rounded-[10px] bg-void border border-line2 text-[13px] outline-none focus:border-dusk" />
      <div className="scroll-y max-h-64 flex flex-col gap-0.5">
        {list.slice(0, 24).map((p) => {
          const meta = CATEGORY_META[p.category] || CATEGORY_META.region;
          const on = n.destination?.name === p.name;
          return (
            <button key={p.name} onClick={() => n.handlePlaceSelect(p)}
              className={`flex items-center gap-2 h-9 px-2 rounded-lg text-left text-[13px] ${on ? 'bg-white/[.08]' : 'hover:bg-white/[.05]'}`}>
              <i className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
              <span className="flex-1 truncate font-semibold">{p.name}</span>
              <span className="num text-xs text-dim">{p.km >= 100 ? `${Math.round(p.km)} km` : `${p.km.toFixed(1)} km`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
