import { lazy, Suspense, useEffect, useState } from 'react';
import { MissionProvider } from './context/MissionContext.jsx';
import { NavigationProvider } from './context/NavigationContext.jsx';
import { TelemetryProvider } from './context/TelemetryContext.jsx';
import { DecisionProvider } from './context/DecisionContext.jsx';
import { UiProvider, useUi } from './context/UiContext.jsx';
import { Briefing, Header, Nav } from './components/Shell.jsx';
import Explorer from './views/Explorer.jsx';
import { Toaster } from './lib/ui.jsx';

// Secondary views, the palette and the brief are split out: the first paint only ships the explorer.
const views = { overview: lazy(() => import('./views/Overview.jsx')), planner: lazy(() => import('./views/Planner.jsx')), science: lazy(() => import('./views/Science.jsx')), environment: lazy(() => import('./views/Environment.jsx')), catalogue: lazy(() => import('./views/Catalogue.jsx')) };
const Palette = lazy(() => import('./components/Palette.jsx'));
const EvaBrief = lazy(() => import('./components/EvaBrief.jsx'));
const seen = () => { try { return sessionStorage.getItem('ares:briefed') === '1'; } catch { return false; } };

function Shell() {
  const { view, setPalette, palette, brief } = useUi();
  const [briefed, setBriefed] = useState(seen);
  const [paletteUsed, setPaletteUsed] = useState(false), [briefUsed, setBriefUsed] = useState(false);
  useEffect(() => { palette && setPaletteUsed(true); }, [palette]);
  useEffect(() => { brief && setBriefUsed(true); }, [brief]);
  useEffect(() => {
    const k = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if (e.key === '/' && !typing) { e.preventDefault(); setPalette(true); }
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);
  const View = views[view];
  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 min-h-0 flex">
        <Nav />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="max-w-[1500px] mx-auto p-3 sm:p-5 lg:p-6 pb-24 lg:pb-8">
            {/* The explorer stays mounted so the map is never reloaded when you switch views. */}
            <div hidden={view !== 'explorer'}><Explorer /></div>
            {View && <Suspense fallback={<div className="card h-64 animate-pulse" />}><View /></Suspense>}
            <p className="text-xs text-dim mt-8">Planning data is modelled and simulated for design review. Not for flight.</p>
          </div>
        </main>
      </div>
      <Toaster />
      <Suspense fallback={null}>{paletteUsed && <Palette />}{briefUsed && <EvaBrief />}</Suspense>
      {!briefed && <Briefing onDone={() => { try { sessionStorage.setItem('ares:briefed', '1'); } catch {} setBriefed(true); }} />}
    </div>
  );
}

export default function App() {
  return (
    <MissionProvider><NavigationProvider><TelemetryProvider><DecisionProvider><UiProvider><Shell /></UiProvider></DecisionProvider></TelemetryProvider></NavigationProvider></MissionProvider>
  );
}
