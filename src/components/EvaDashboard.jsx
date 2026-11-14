import { useNavigation } from '../context/NavigationContext.jsx';
import { useTween } from '../hooks/useTween.js';
import { hex } from '../lib/fmt.js';
import { Icon } from '../lib/icons.jsx';

const TONE = { go: hex.sol, caution: hex.butter, hold: hex.hazard, GREEN: hex.sol, YELLOW: hex.butter, RED: hex.hazard, HIGH: hex.hazard, MODERATE: hex.butter, LOW: hex.sol };

function Live({ value, digits = 0, snapBelow = 0.02 }) {
  const v = useTween(value, { snapBelow });
  return <span className="num">{Number(v).toFixed(digits)}</span>;
}

function Bar({ pct, color }) {
  const w = useTween(Math.max(0, Math.min(100, pct || 0)), { snapBelow: 0.35 });
  return (
    <div className="eva-bar" role="meter" aria-valuenow={Math.round(w)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function EvaDashboard() {
  const n = useNavigation();
  const e = n.eva;
  if (!e) return null;
  const o2c = TONE[e.plss.oxygenStatus?.code] || hex.dusk;
  const bc = TONE[e.plss.batteryStatus?.code] || hex.sol;
  const slope = e.terrainSlope || 0;
  const up = slope >= 0;
  const o2Tone = e.plss.oxygenStatus?.tone || 'go';
  return (
    <section className="card p-4 eva-dash" aria-live="polite" aria-label="EVA status">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-[15px]">EVA status</h2>
        <span className={`tag ${e.astronautStatus === 'MOVING' ? 'tag-info live' : 'tag-go'}`}>
          <Icon n="user" s={12} />{e.astronautStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="well p-2.5">
          <div className="label">Distance</div>
          <div className="num text-[18px] font-semibold">
            <Live value={e.distanceTravelled / 1000} digits={2} snapBelow={0.002} />
            <span className="text-dust text-[12px]"> / {(e.totalDistance / 1000).toFixed(2)} km</span>
          </div>
        </div>
        <div className="well p-2.5">
          <div className="label">Walk speed</div>
          <div className="num text-[18px] font-semibold">
            <Live value={e.walkingSpeed} digits={2} snapBelow={0.01} />
            <span className="text-dust text-[12px]"> m/s</span>
          </div>
        </div>
      </div>

      <div className="well p-2.5 mt-2">
        <div className="flex items-baseline justify-between">
          <span className="label">EVA time</span>
          <span className="text-[11px] text-dim">sim ×{e.simRate}</span>
        </div>
        <div className="num text-[15px] font-semibold mt-0.5">{e.elapsedHMS} / {e.totalHMS}</div>
        <div className="text-[11px] text-dust">Remaining {e.remainingHMS} · ETA {n.etaMin} min</div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="label">Oxygen</span>
          <span className="num font-semibold" style={{ color: o2c }}><Live value={e.oxygenPercent} digits={0} snapBelow={0.4} />%</span>
        </div>
        <Bar pct={e.oxygenPercent} color={o2c} />
        <div className="flex justify-between text-[11px] text-dust mt-1">
          <span><Live value={e.oxygenRemaining} digits={1} snapBelow={0.04} /> kg remaining</span>
          <span>{e.oxygenRate.toFixed(2)} kg/h</span>
        </div>
        <div className="text-[11px] text-dust mt-0.5">
          Needed to destination: <Live value={e.oxygenNeeded} digits={1} snapBelow={0.03} /> kg
          · reserve <Live value={e.oxygenReserve} digits={1} snapBelow={0.02} /> kg
        </div>
        <div className="text-[11px] text-dust">
          At destination: <Live value={Math.max(0, e.oxygenPercent - (e.oxygenNeeded / 25.6) * 100)} digits={0} snapBelow={0.4} />%
        </div>
        <div className={`text-[12px] font-semibold mt-1`} style={{ color: o2c }}>STATUS: {e.plss.oxygenStatus?.label || 'SAFE'}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="label">Battery</span>
          <span className="num font-semibold" style={{ color: bc }}><Live value={e.batteryRemaining} digits={0} snapBelow={0.4} />%</span>
        </div>
        <Bar pct={e.batteryRemaining} color={bc} />
        <div className="flex justify-between text-[11px] text-dust mt-1">
          <span>Need {e.batteryNeeded.toFixed(1)}% to finish</span>
          <span>{e.batteryRate.toFixed(1)} %/h</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="well p-2.5">
          <div className="label">Current terrain</div>
          <div className="text-[13px] font-semibold leading-tight mt-0.5">{e.terrainDifficulty}</div>
        </div>
        <div className="well p-2.5">
          <div className="label">Current slope</div>
          <div className="num text-[16px] font-semibold" style={{ color: Math.abs(slope) > 15 ? hex.hazard : Math.abs(slope) > 8 ? hex.butter : undefined }}>
            {up ? '↑' : '↓'} {Math.abs(slope).toFixed(1)}°
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <div className="well p-2.5">
          <div className="label">Fatigue</div>
          <div className="num font-semibold"><Live value={e.fatigue} digits={0} snapBelow={0.4} /> / 100</div>
        </div>
        <div className="well p-2.5">
          <div className="label">Risk</div>
          <div className="font-semibold text-[13px]" style={{ color: TONE[e.meanRiskLabel] || TONE[e.plss.oxygenStatus?.code] }}>
            ● {e.meanRiskLabel}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-dim mt-2 leading-relaxed">
        Burn follows the polyline: distance {((e.distanceTravelled) / 1000).toFixed(2)} km on {e.terrainDifficulty.toLowerCase()},
        slope {slope.toFixed(1)}°, speed {e.walkingSpeed.toFixed(2)} m/s.
      </p>
      <span className="sr-only">{o2Tone}</span>
    </section>
  );
}
