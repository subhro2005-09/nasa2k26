import { useNavigation } from '../context/NavigationContext.jsx';

const KIND_COLOR = {
  start: 'var(--color-sol)',
  end: 'var(--color-dusk)',
  hazard: 'var(--color-hazard)',
  climb: 'var(--color-butter)',
  rocky: '#e8a53d',
  sand: '#c084fc',
  difficult: 'var(--color-hazard)',
  flat: 'var(--color-sol)',
  regolith: 'var(--color-dusk)'
};

export function RouteTimeline() {
  const n = useNavigation();
  const events = n.eva?.timeline || [];
  if (events.length < 2 || !n.points?.length) return null;
  const here = n.eva.distanceTravelled || 0;
  return (
    <section className="card p-4" aria-label="Route timeline">
      <h2 className="font-semibold text-[15px]">Route timeline</h2>
      <p className="text-xs text-dust mt-0.5">Events come from slope, surface, and hazards on the solved polyline.</p>
      <ol className="eva-timeline mt-3">
        {events.map((ev, i) => {
          const current = here >= ev.atM - 40 && (i === events.length - 1 ? here >= ev.atM - 80 : here < (events[i + 1]?.atM ?? Infinity));
          const done = here > ev.atM + 20 && !current;
          return (
            <li key={`${ev.kind}-${ev.atM}-${i}`} className={`eva-tl-item${current ? ' is-now' : ''}${done ? ' is-done' : ''}`}>
              <i className="eva-tl-dot" style={{ background: KIND_COLOR[ev.kind] || 'var(--color-dusk)' }} />
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-[13px]">{ev.title}</span>
                  <span className="num text-[11px] text-dim">{ev.km ? `${ev.km.toFixed(1)} km` : '0.0 km'}</span>
                </div>
                {ev.extra && <div className="text-[11px] text-dust">{ev.extra}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
