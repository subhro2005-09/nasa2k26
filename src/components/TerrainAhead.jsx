import { useNavigation } from '../context/NavigationContext.jsx';

const COL = { safe: '#6fd6a3', caution: '#e8a53d', hazard: '#ff6b6b' };

/** Slope/hazard strip for the ground the astronaut is about to walk. */
export function TerrainAhead({ height = 72 }) {
  const { ahead, instruction } = useNavigation();
  if (ahead.length < 2) return <div className="well p-4 text-sm text-dust">Solve a route from your position to see terrain ahead.</div>;
  const maxM = Math.max(1, ahead[ahead.length - 1].m);
  const W = 1000, H = 40;
  let d = '';
  ahead.forEach((p, i) => {
    const x = (p.m / maxM) * W;
    const y = H - Math.min(H, (p.slope / 25) * H);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-[15px]">Terrain ahead</h2>
        <span className="text-xs text-dust">{instruction.caution || 'Clear for the next few hundred metres'}</span>
      </div>
      <div className="relative" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden="true">
          {ahead.map((p, i) => {
            const n = ahead[i + 1] || p;
            const x = (p.m / maxM) * W;
            const w = Math.max(2, ((n.m - p.m) / maxM) * W);
            return <rect key={i} x={x} y="0" width={w} height={H} fill={COL[p.band]} fill-opacity=".22" />;
          })}
          <path d={d} fill="none" stroke="#f4efe9" stroke-width="2" vector-effect="non-scaling-stroke" />
        </svg>
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-ember border-2 border-bone" title="You" />
      </div>
      <div className="flex justify-between text-xs text-dust num mt-1"><span>You</span><span>{(maxM / 1000).toFixed(2)} km ahead</span></div>
    </div>
  );
}
