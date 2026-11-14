import { useEffect, useState } from 'react';

// Real Mars Coordinated Time (Allison & McEwen) -> local mean solar time at the site longitude.
// Pauses while the tab is hidden so a background tab never wakes the CPU.
export function useLmst(lonE) {
  const calc = () => {
    const msd = (Date.now() / 86400000 + 2440587.5 + 69.184 / 86400 - 2405522.0028779) / 1.0274912517;
    const h = (((msd % 1) * 24 + lonE / 15) % 24 + 24) % 24;
    return { h: Math.floor(h), m: Math.floor((h % 1) * 60), day: h >= 6 && h < 18 };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    setT(calc());
    const id = setInterval(() => !document.hidden && setT(calc()), 15000);
    return () => clearInterval(id);
  }, [lonE]);
  return t;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    addEventListener('online', u); addEventListener('offline', d);
    return () => { removeEventListener('online', u); removeEventListener('offline', d); };
  }, []);
  return on;
}
