import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMission } from './MissionContext.jsx';
import { useNavigation } from './NavigationContext.jsx';
import { toast } from '../lib/toast.js';

const Ctx = createContext(null);

export function TelemetryProvider({ children }) {
  const { missionId } = useMission();
  const n = useNavigation();
  const [alerts, setAlerts] = useState([{ id: 0, tone: 'ok', text: 'Suit systems nominal. Locate yourself, pick a destination, then begin EVA.' }]);
  const push = (tone, text) => setAlerts((a) => [{ id: Date.now(), tone, text }, ...a.slice(0, 4)]);

  useEffect(() => { setAlerts((a) => a.slice(-1)); }, [missionId]);

  const lastObs = useRef('');
  useEffect(() => {
    if (!n.following || !n.alongPoint) return;
    if (n.alongPoint.slope > 15) push('bad', `Slope ${n.alongPoint.slope.toFixed(1)}°. Keep three points of contact.`);
    else if (n.alongPoint.zone) push('warn', 'Inside a mapped hazard zone. Slow down and follow the marked line.');
  }, [n.alongPoint?.slope > 15, n.alongPoint?.zone, n.following]);

  useEffect(() => {
    if (!n.following || !n.upcoming) return;
    const key = `${n.upcoming.name}:${n.alternate?.action || ''}`;
    if (lastObs.current === key) return;
    lastObs.current = key;
    push(n.upcoming.band === 'hazard' ? 'warn' : 'info', `${n.upcoming.name} in ${n.upcoming.meters} m.`);
    if (n.alternate) push('info', `${n.alternate.title}. ${n.alternate.label}.`);
  }, [n.following, n.upcoming?.name, n.alternate?.action]);

  useEffect(() => {
    if (n.safeReturn.status === 'ponr') push('bad', 'Point of no return. Oxygen no longer covers a safe walk-back.');
    else if (n.safeReturn.status === 'low') push('warn', 'Return margin low. Compute the habitat route before the next leg.');
  }, [n.safeReturn.status]);

  const hr = n.eva?.heartRate || (n.alongPoint ? Math.round(72 + n.alongPoint.slope * 2.15 + (n.fatigue || 0) * 0.32) : 70);

  const value = useMemo(() => ({
    progress: n.progress,
    setProgress: (p) => n.seekProgress(p),
    playing: n.following,
    speed: n.followSpeed,
    setSpeed: n.setFollowSpeed,
    now: n.alongPoint,
    idx: n.idx,
    plss: n.plss,
    hr,
    alerts,
    toggle: () => {
      if (!n.points.length) return toast('Choose a destination or keep the planned traverse', 'warn');
      if (!n.following && (n.progress || 0) < 0.02) n.beginTraverse();
      else n.toggleFollow();
    },
    reset: () => { n.setFollowing(false); n.resetCrew(); }
  }), [n, hr, alerts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useTelemetry = () => useContext(Ctx);
