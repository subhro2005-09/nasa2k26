import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { onToast } from './toast.js';

export const Seg = ({ value, onChange, options, label }) => (
  <div className="seg" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.id} type="button" aria-pressed={value === o.id} title={o.hint} onClick={() => onChange(o.id)}>
        {o.icon && <Icon n={o.icon} s={14} />}{o.label}
      </button>
    ))}
  </div>
);

export const Meter = ({ pct, color, label }) => (
  <div className="meter" role="meter" aria-label={label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
  </div>
);

export const Stat = ({ label, value, sub, color }) => (
  <div className="well p-3 min-w-0">
    <div className="label">{label}</div>
    <div className="num text-[22px] font-semibold leading-tight mt-0.5 truncate" style={{ color }}>{value}</div>
    {sub && <div className="text-xs text-dust mt-0.5 truncate">{sub}</div>}
  </div>
);

export const PageHead = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="display text-[22px] sm:text-[28px] md:text-[34px] font-medium leading-tight">{title}</h1>
      {sub && <p className="text-dust mt-1.5 max-w-[68ch] text-[13px] sm:text-[14px]">{sub}</p>}
    </div>
    {children && <div className="flex items-center gap-2 flex-wrap min-w-0">{children}</div>}
  </div>
);

export function Modal({ open, onClose, title, sub, children, footer, wide }) {
  const ref = useRef();
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={id} style={wide ? { width: 'min(900px, calc(100vw - 24px))' } : undefined} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      {open && (
        <>
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-line">
            <div className="min-w-0">
              <h2 id={id} className="display text-[22px] font-medium">{title}</h2>
              {sub && <p className="text-dust text-[13px] mt-0.5">{sub}</p>}
            </div>
            <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close"><Icon n="x" /></button>
          </div>
          <div className="scroll-y p-5 flex-1">{children}</div>
          {footer && <div className="px-5 py-3 border-t border-line flex flex-wrap gap-2 justify-end bg-basalt/60">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

export function Menu({ trigger, children, align = 'left' }) {
  const [o, setO] = useState(false);
  const r = useRef();
  useEffect(() => {
    if (!o) return;
    const away = (e) => !r.current?.contains(e.target) && setO(false);
    const esc = (e) => e.key === 'Escape' && setO(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('pointerdown', away); removeEventListener('keydown', esc); };
  }, [o]);
  return (
    <div ref={r} className="relative">
      {trigger({ open: o, toggle: () => setO(!o) })}
      {o && <div role="menu" onClick={() => setO(false)} className={`absolute z-40 mt-2 min-w-60 card p-1.5 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'}`}>{children}</div>}
    </div>
  );
}
export const MenuItem = ({ onClick, active, children, hint }) => (
  <button role="menuitem" onClick={onClick} className={`w-full text-left px-3 py-2 rounded-lg hover:bg-white/[.07] flex flex-col ${active ? 'bg-white/[.05]' : ''}`}>
    <span className="font-semibold text-[13px]">{children}</span>
    {hint && <span className="text-xs text-dust">{hint}</span>}
  </button>
);

export function Toaster() {
  const [list, setList] = useState([]);
  useEffect(() => onToast((t) => { setList((l) => [...l.slice(-2), t]); setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), t.tone === 'bad' ? 5600 : 3600); }), []);
  const col = { info: 'text-dusk', ok: 'text-sol', warn: 'text-butter', bad: 'text-hazard' };
  return (
    <div aria-live="assertive" className="fixed z-[60] left-1/2 -translate-x-1/2 bottom-20 lg:bottom-6 flex flex-col gap-2 items-center pointer-events-none w-[calc(100vw-24px)] max-w-md">
      {list.map((t) => (
        <div key={t.id} className="card shadow-2xl px-4 py-2.5 flex items-start gap-2.5 text-[13px] font-medium pointer-events-auto">
          <span className={`dot mt-1.5 ${col[t.tone]}`} />
          <div className="min-w-0">
            <div>{t.msg}</div>
            {t.detail && <div className="text-xs text-dust font-normal mt-0.5 leading-snug">{t.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
