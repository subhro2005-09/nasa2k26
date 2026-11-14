import { useState } from 'preact/hooks';
import { useMission } from '../context/MissionContext.jsx';
import { useNavigation } from '../context/NavigationContext.jsx';
import { Icon } from '../lib/icons.jsx';
import { hex } from '../lib/fmt.js';

/** Heading-up GPS ribbon drawn over the globe while the crew is walking the path. */
export function GpsHud() {
  const [showMeters, setShowMeters] = useState(true);
  const [showHazard, setShowHazard] = useState(true);
  const [showAdvisory, setShowAdvisory] = useState(true);

  const m = useMission();
  const n = useNavigation();

  if (!n.following && n.controlMode !== 'navigate') return null;

  const inst = n.instruction || {};
  const dest = n.destination?.name || 'Planned traverse';
  const o2 = n.plss.o2RemainingPercent;
  const upcoming = n.upcoming;
  const alt = n.alternate;
  const turn = inst.bearing != null
    ? ((inst.bearing - (n.astronaut.heading || 0) + 540) % 360) - 180
    : 0;
  const hot = upcoming?.band === 'hazard';

  return (
    <div className="gps-hud" role="status" aria-live="polite">
      <div className="gps-panel">
        <div className="gps-dir" aria-hidden="true">
          <span className="gps-chevron" style={{ transform: `rotate(${turn}deg)` }}>↑</span>
          <div>
            <div className="gps-next">{inst.text || 'Hold heading'}</div>
            <div className="gps-sub">
              {dest} · {(n.remainingKm || 0).toFixed(2)} km · {n.etaMin} min
            </div>
          </div>
        </div>

        {showMeters && (
          <div className="gps-meters">
            <button
              type="button"
              className="gps-close"
              onClick={() => setShowMeters(false)}
              aria-label="Close resource summary"
              title="Close resource summary"
            >
              ×
            </button>
            <span>
              O₂{' '}
              <b style={{ color: o2 < 25 ? hex.hazard : hex.dusk }}>
                {o2}% · {(n.eva?.oxygenRemaining ?? 0).toFixed(1)} kg
              </b>
            </span>
            <span>
              COMM{' '}
              <b>{n.assessment?.los != null ? `${n.assessment.los}%` : '—'}</b>
            </span>
            <span className="num">{m.routeMode}</span>
          </div>
        )}
      </div>

      {showHazard && upcoming && (
        <div className={`gps-alert ${hot ? 'fail' : 'warn'}`}>
          <button
            type="button"
            className="gps-close"
            onClick={() => setShowHazard(false)}
            aria-label="Close hazard warning"
            title="Close hazard warning"
          >
            ×
          </button>
          <div className="gps-alert-title">
            ⚠ {upcoming.name} in {upcoming.meters} m
          </div>
          {upcoming.slope > 8 && (
            <p>Slope {upcoming.slope.toFixed(1)}° on the current line.</p>
          )}
        </div>
      )}

      {n.rerouteOffer && (
        <div className="gps-alert fail">
          <div className="gps-alert-title">
            ⚠ HAZARD DETECTED {n.rerouteOffer.metersAhead} m AHEAD
          </div>
          {n.rerouteOffer.comparison ? (
            <div className="gps-compare">
              <p>
                <b>Current route:</b> {n.rerouteOffer.comparison.current.distanceKm} km · O₂{' '}
                {n.rerouteOffer.comparison.current.o2Kg} kg · risk{' '}
                {n.rerouteOffer.comparison.current.risk}
              </p>
              <p>
                <b>Suggested reroute:</b> {n.rerouteOffer.comparison.suggested.distanceKm} km · O₂{' '}
                {n.rerouteOffer.comparison.suggested.o2Kg} kg · risk{' '}
                {n.rerouteOffer.comparison.suggested.risk}
              </p>
              <p>WHY: {n.rerouteOffer.reason}</p>
            </div>
          ) : (
            <p>
              {n.rerouteOffer.reason}<br />
              Current safety {n.rerouteOffer.oldSafety}% → alternate {n.rerouteOffer.newSafety}% ·
              {n.rerouteOffer.extraM >= 0 ? ' +' : ' '}{n.rerouteOffer.extraM} m ·
              {n.rerouteOffer.extraMin >= 0 ? ' +' : ' '}{n.rerouteOffer.extraMin} min
            </p>
          )}
          <button
            type="button"
            className="btn btn-pri min-h-9! text-[12px]! mt-2"
            onClick={n.acceptReroute}
          >
            <Icon n="route" s={14} />Accept reroute
          </button>
        </div>
      )}

      {showAdvisory && alt && upcoming && !n.rerouteOffer && (
        <div className="gps-alert alt">
          <button
            type="button"
            className="gps-close"
            onClick={() => setShowAdvisory(false)}
            aria-label="Close route advisory"
            title="Close route advisory"
          >
            ×
          </button>
          <div className="gps-alert-title">{alt.title}</div>
          <p>{alt.text}</p>
          <button
            type="button"
            className="btn btn-pri min-h-9! text-[12px]! mt-2"
            onClick={() => {
              if (alt.action === 'safe') m.setRouteMode('safe');
              else n.returnToBase();
            }}
          >
            <Icon n={alt.action === 'safe' ? 'shield' : 'home'} s={14} />
            {alt.label}
          </button>
        </div>
      )}
    </div>
  );
}
