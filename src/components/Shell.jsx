import { memo, useEffect, useState } from 'react';
import { MISSIONS, useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { useDecision } from '../context/DecisionContext.jsx';
import { ROLES, useUi } from '../context/UiContext.jsx';
import { useLmst, useOnline } from '../hooks/useClock.js';
import { Icon } from '../lib/icons.jsx';
import { Menu, MenuItem, Seg } from '../lib/ui.jsx';

export const VIEWS = [
  { id: 'overview', label: 'Mission brief', short: 'Brief', icon: 'globe' },
  { id: 'explorer', label: 'Surface explorer', short: 'Explore', icon: 'map' },
  { id: 'planner', label: 'Traverse planner', short: 'Plan', icon: 'route' },
  { id: 'science', label: 'Science targets', short: 'Science', icon: 'flask' },
  { id: 'environment', label: 'Environment', short: 'Weather', icon: 'thermo' },
  { id: 'catalogue', label: 'Data catalogue', short: 'Data', icon: 'db' }
];
const p2 = (n) => String(n).padStart(2, '0');

const Logo = () => (
  <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#e4613a" /><path d="M8 24 16 7l8 17h-4.2L16 15.6 12.2 24Z" fill="#0e0c12" /></svg>
);

const Clock = memo(function Clock({ lon }) {
  const t = useLmst(lon);
  return (
    <div className="hidden xl:flex items-center gap-2 text-[13px]" title="Local mean solar time at the site, computed from the real Mars clock">
      <Icon n="sun" s={15} className={t.day ? 'text-butter' : 'text-dusk'} />
      <span className="num font-semibold">{p2(t.h)}:{p2(t.m)}</span>
      <span className="text-dust hidden xl:inline">LMST · {t.day ? 'daylight' : 'night'}</span>
    </div>
  );
});

export function Header() {
  const { mission, missionId, setMissionId } = useMission();
  const n = useNavigation();
  const ret = n.safeReturn.status;
  const { role, setRole, setPalette } = useUi();
  const online = useOnline();
  return (
    <header className="h-14 shrink-0 flex items-center gap-1.5 sm:gap-3 px-2.5 sm:px-5 border-b border-line bg-basalt relative z-30 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 shrink-0"><Logo /><span className="display text-[20px] sm:text-[22px] font-semibold">ARES</span></div>
      <Menu trigger={({ toggle, open }) => (
        <button className="btn btn-ghost !px-2 min-w-0 max-w-[46vw] sm:max-w-none" onClick={toggle} aria-haspopup="menu" aria-expanded={open}>
          <span className="truncate">{mission.name}</span><span className="text-dust font-normal hidden sm:inline">Sol {mission.activeSol}</span><Icon n="chev" s={14} />
        </button>
      )}>
        {MISSIONS.map((m) => <MenuItem key={m.id} active={m.id === missionId} onClick={() => setMissionId(m.id)} hint={`${m.code} · ${m.subtitle}`}>{m.name}</MenuItem>)}
      </Menu>
      <div className="flex-1" />
      <Clock lon={mission.coordinates.lon} />
      <span className={`tag hidden xl:inline-flex ${ret === 'ponr' ? 'tag-hold' : ret === 'low' ? 'tag-caution' : 'tag-go'}`} title="Safe return uses the routing engine, not a circular radius">
        {ret === 'ponr' ? 'Point of no return' : ret === 'low' ? 'Return margin low' : 'Return nominal'}
      </span>
      {online
        ? <span className="tag tag-go shrink-0" title="Simulated one-way signal delay to Earth"><Icon n="signal" s={13} /><span className="hidden xl:inline">Link up · 14.2 min delay</span><span className="xl:hidden">Link</span></span>
        : <span className="tag tag-caution shrink-0" title="Plans and EVA briefs keep working offline"><Icon n="off" s={13} />Offline</span>}
      <div className="hidden xl:block"><Seg label="Console" value={role} onChange={setRole} options={ROLES.map((r) => ({ id: r.id, label: r.label, hint: r.hint }))} /></div>
      <button className="btn btn-ghost !px-2 shrink-0" onClick={() => setPalette(true)} aria-label="Open command palette">
        <Icon n="cmd" s={15} /><span className="hidden md:inline">Search</span>
      </button>
    </header>
  );
}

export function Nav() {
  const { view, setView } = useUi();
  const { assessment: a, planVersion, routeMode, hazards } = useMission();
  const d = useDecision();
  const tag = { go: 'tag-go', caution: 'tag-caution', hold: 'tag-hold' }[a.state];
  const engineTag = { GO: 'tag-go', CAUTION: 'tag-caution', NO_GO: 'tag-hold', REROUTE_REQUIRED: 'tag-caution' }[d?.decision] || (d?.engineOnline ? 'tag-info' : 'tag-caution');
  return (
    <>
      <aside className="hidden lg:flex w-56 shrink-0 flex-col justify-between p-3 border-r border-line bg-basalt">
        <nav aria-label="Workspace" className="flex flex-col gap-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => setView(v.id)} aria-current={view === v.id ? 'page' : undefined}
              className={`relative flex items-center gap-3 h-10 px-3 rounded-[10px] text-[13px] font-semibold text-left transition-colors ${view === v.id ? 'bg-white/[.07] text-bone' : 'text-dust hover:text-bone hover:bg-white/[.04]'}`}>
              {view === v.id && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-ember" />}
              <Icon n={v.icon} s={17} />{v.label}
            </button>
          ))}
        </nav>
        <div className="well p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between"><span className="label">Plan</span><span className={`tag ${tag}`}>{a.headline}</span></div>
          <div className="text-xs text-dust leading-relaxed">v{planVersion} · {routeMode === 'safe' ? 'Safe path' : routeMode === 'direct' ? 'Direct' : 'Science max'}<br />{hazards.length} reported hazard{hazards.length === 1 ? '' : 's'}</div>
          <div className="flex items-center justify-between pt-1 border-t border-line"><span className="label">Engine</span><span className={`tag ${engineTag}`}>{d?.decision ? String(d.decision).replace(/_/g, ' ') : d?.engineOnline ? 'Online' : 'Offline'}</span></div>
        </div>
      </aside>
      <nav aria-label="Workspace" className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-6 border-t border-line bg-basalt/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {VIEWS.map((v) => (
          <button key={v.id} onClick={() => setView(v.id)} aria-current={view === v.id ? 'page' : undefined} aria-label={v.label}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${view === v.id ? 'text-ember2' : 'text-dust'}`}>
            <Icon n={v.icon} s={19} /><span className="truncate max-w-full px-0.5">{v.short}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

// First-visit briefing: one orchestrated reveal, then out of the way.
export function Briefing({ onDone }) {
  const { mission } = useMission();
  const t = useLmst(mission.coordinates.lon);
  useEffect(() => {
    const k = (e) => (e.key === 'Enter' || e.key === 'Escape') && onDone();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const d = (n) => ({ animationDelay: `${n * 110}ms` });
  const facts = [
    ['3–22 min', 'one-way signal delay. Earth cannot steer a walk in real time.'],
    ['15°', 'slope limit. Every route is solved and checked against it.'],
    ['45 min', 'oxygen walk-back reserve held back on every plan.']
  ];
  return (
    <div role="dialog" aria-modal="true" aria-label="Mission briefing" className="fixed inset-0 z-[70] overflow-y-auto bg-void" style={{ background: 'radial-gradient(90% 60% at 50% 105%, rgb(228 97 58 / .38), transparent 70%), #08070b' }}>
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-[88vh] w-[190vw] h-[190vw] rounded-full"
        style={{ background: 'radial-gradient(circle at 50% 0%, #c4522c 0%, #8a3320 18%, #3a1620 42%, #14101a 62%)', boxShadow: '0 -2px 0 rgb(127 200 204 / .55), 0 -18px 70px rgb(127 200 204 / .28), 0 -60px 160px rgb(228 97 58 / .22)' }} />
      <div className="relative min-h-full flex flex-col justify-center max-w-[1040px] mx-auto px-6 sm:px-10 pt-16 pb-28">
        <p className="rise num text-[13px] text-dusk" style={d(0)}>{mission.name} · Sol {mission.activeSol} · LMST {p2(t.h)}:{p2(t.m)}</p>
        <h1 className="rise display text-[44px] sm:text-[68px] lg:text-[80px] font-medium mt-4 max-w-[17ch]" style={d(1)}>Plan the walk that gets everyone home.</h1>
        <p className="rise text-[17px] sm:text-[19px] text-dust max-w-[56ch] mt-5" style={d(2)}>ARES turns NASA orbital data into a Go/No-Go for every Mars EVA, and re-plans in seconds when the ground changes.</p>
        <dl className="rise grid sm:grid-cols-3 gap-x-8 gap-y-4 mt-10 max-w-[900px]" style={d(3)}>
          {facts.map(([k, v]) => (
            <div key={k} className="border-t border-line2 pt-3"><dt className="display text-[30px]">{k}</dt><dd className="text-[13px] text-dust mt-1">{v}</dd></div>
          ))}
        </dl>
        <div className="rise flex items-center gap-4 mt-10" style={d(4)}>
          <button autoFocus className="btn btn-pri !min-h-12 !px-6 !text-[15px]" onClick={onDone}>Start planning</button>
          <span className="text-xs text-dust hidden sm:inline">Press <span className="kbd">Enter</span> to skip</span>
        </div>
      </div>
    </div>
  );
}
