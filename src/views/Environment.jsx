import { useMission } from '../context/MissionContext.jsx';
import { useLmst } from '../hooks/useClock.js';
import { Icon } from '../lib/icons.jsx';
import { PageHead } from '../lib/ui.jsx';
import { DiurnalChart, tempAt } from '../components/Charts.jsx';

const GAS = [['Carbon dioxide', 95.32, '#e4613a'], ['Nitrogen', 2.6, '#7fc8cc'], ['Argon', 1.9, '#e8a53d'], ['Oxygen', 0.16, '#6fd6a3']];

export default function Environment() {
  const { mission: m } = useMission();
  const t = useLmst(m.coordinates.lon), hour = t.h + t.m / 60;
  const now = Math.round(tempAt(hour, m.tempRange.min, m.tempRange.max));
  const sky = m.dustTau > 0.6 ? 'Dusty' : m.dustTau > 0.5 ? 'Hazy' : 'Clear';
  const cards = [
    ['thermo', 'Ground temperature', `${now}°C`, `Daily swing ${m.tempRange.min}° to ${m.tempRange.max}°C`, 'text-ember2'],
    ['gauge', 'Pressure', `${m.pressureAvg} Pa`, `${(m.pressureAvg / 100).toFixed(1)} mbar, under 1% of Earth`, 'text-dusk'],
    ['sun', 'Dust opacity', `τ ${m.dustTau}`, `${sky} sky`, 'text-butter'],
    ['wind', 'Wind', '8.4 m/s', 'From the north-west, gusts to 14 m/s', 'text-sol']
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageHead title="Environment" sub={`Conditions at ${m.name} for planning. The temperature marker follows the real local Mars time at the site.`}><span className="tag">Representative values, not live telemetry</span></PageHead>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {cards.map(([ic, l, v, s, c]) => <div key={l} className="card p-4"><div className="row label"><Icon n={ic} s={15} className={c} />{l}</div><div className="num text-[26px] font-semibold mt-1.5">{v}</div><div className="text-xs text-dust mt-0.5">{s}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2"><div className="flex justify-between items-center"><h2 className="font-semibold text-[15px]">Ground temperature across a sol</h2><span className="text-xs text-dust num">{String(t.h).padStart(2, '0')}:{String(t.m).padStart(2, '0')} LMST now</span></div><div className="mt-3"><DiurnalChart lo={m.tempRange.min} hi={m.tempRange.max} hour={hour} /></div></section>
        <section className="card p-5"><h2 className="font-semibold text-[15px]">Atmosphere</h2>
          <div className="flex flex-col gap-3.5 mt-4">{GAS.map(([n, v, c]) => <div key={n}><div className="flex justify-between text-[13px] mb-1.5"><span className="text-dust">{n}</span><span className="num font-semibold">{v}%</span></div><div className="meter"><i style={{ width: `${Math.max(v, 1.2)}%`, background: c }} /></div></div>)}</div></section>
      </div>
    </div>
  );
}
