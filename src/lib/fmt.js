const c = (v, p, n) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? p : n}`;
export const lat = (v) => c(v, 'N', 'S');
export const lon = (v) => c(v, 'E', 'W');
export const hm = (min) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
export const tone = { go: 'sol', caution: 'butter', hold: 'hazard', pass: 'sol', warn: 'butter', fail: 'hazard' };
export const hex = { sol: '#6fd6a3', butter: '#e8a53d', hazard: '#ff6b6b', dusk: '#7fc8cc', ember: '#e4613a' };
