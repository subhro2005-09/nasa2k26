// One-path icon set (~3 KB) replaces the lucide-react dependency.
const P = {
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z',
  map: 'M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4ZM9 4v13.5M15 6.5V20',
  route: 'M6 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM18 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM8.5 17.5H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5',
  flask: 'M9 3h6M10 3v6.2L4.6 18.6A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.4L14 9.2V3M7.5 15h9',
  thermo: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z',
  db: 'M12 8c4.4 0 8-1.1 8-2.5S16.4 3 12 3 4 4.1 4 5.5 7.6 8 12 8ZM4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
  play: 'M7 4.5v15l12-7.5Z', pause: 'M8 5v14M16 5v14',
  reset: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v5h5',
  alert: 'M12 3.5 2.5 20h19L12 3.5ZM12 10v4.5M12 17.6v.1',
  check: 'm5 12.5 4.5 4.5L19 7.5', x: 'M6 6l12 12M18 6 6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM21 21l-5-5',
  signal: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.1', off: 'M3 3l18 18',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 20h14',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  cmd: 'M9 9H6a3 3 0 1 1 3-3v12a3 3 0 1 1-3-3h12a3 3 0 1 1-3 3V6a3 3 0 1 1 3 3H9Z',
  user: 'M16.5 20v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  plus: 'M12 5v14M5 12h14', arrow: 'M5 12h14m-6-6 6 6-6 6',
  heart: 'M12 20s-7.5-4.5-7.5-10A4.2 4.2 0 0 1 12 7.6 4.2 4.2 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 12v.1',
  gauge: 'M12 14l4-4M3.3 18a10 10 0 1 1 17.4 0',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  wind: 'M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  ext: 'M7 17 17 7M8 7h9v9', chev: 'm6 9 6 6 6-6',
  shield: 'M12 3 4.5 6v6c0 4.4 3.2 7.8 7.5 9 4.3-1.2 7.5-4.6 7.5-9V6L12 3Z',
  radio: 'M5.5 12a6.5 6.5 0 0 1 13 0M8.5 12a3.5 3.5 0 0 1 7 0M12 12v8',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4Z', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  bolt: 'M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z', drop: 'M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z',
  copy: 'M9 9h11v11H9zM5 15V4h11'
};
export const Icon = ({ n, s = 16, className, fill }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" className={className} style={{ flex: 'none' }}>
    <path d={P[n]} />
  </svg>
);
