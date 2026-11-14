/** Share the active ARES route with every same-origin atlas (iframe, new tab, other window). */
export const NAV_KEY = 'ares:nav-overlay';
export const NAV_CH = 'ares-nav';

export function publishNav(state) {
  if (!state) return;
  const packed = { ...state, t: Date.now() };
  try { localStorage.setItem(NAV_KEY, JSON.stringify(packed)); } catch { /* quota / private mode */ }
  try {
    const ch = new BroadcastChannel(NAV_CH);
    ch.postMessage(packed);
    ch.close();
  } catch { /* older browsers */ }
}

export function readNav() {
  try { return JSON.parse(localStorage.getItem(NAV_KEY) || 'null'); } catch { return null; }
}

export function subscribeNav(fn) {
  const onStorage = (e) => {
    if (e.key !== NAV_KEY || !e.newValue) return;
    try { fn(JSON.parse(e.newValue)); } catch { /* ignore */ }
  };
  addEventListener('storage', onStorage);
  let ch = null;
  try {
    ch = new BroadcastChannel(NAV_CH);
    ch.onmessage = (e) => { if (e.data) fn(e.data); };
  } catch { /* ignore */ }
  return () => {
    removeEventListener('storage', onStorage);
    try { ch?.close(); } catch { /* ignore */ }
  };
}
