const PATHS: Record<string, string> = {
  help: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-6.5v.5m0-3c0-2 3-2.2 3-4.5a3 3 0 0 0-6 0',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.4-2.1.9 1.6-1.8 3.1-1.8-.2a7 7 0 0 1-1.6.9l-.7 1.7h-3.6l-.7-1.7a7 7 0 0 1-1.6-.9l-1.8.2-1.8-3.1.9-1.6a7 7 0 0 1 0-1.8l-.9-1.6 1.8-3.1 1.8.2a7 7 0 0 1 1.6-.9l.7-1.7h3.6l.7 1.7a7 7 0 0 1 1.6.9l1.8-.2 1.8 3.1-.9 1.6a7 7 0 0 1 0 1.8z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm9 3-4.5-4.5',
  play: 'M7 5v14l11-7z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rocket: 'M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M14 4c3.5 0 6 2.5 6 6l-6 6-5-5 5-7zm1.5 4.5a1 1 0 1 0 0 .01M9 11l-3 1-2 3 4-1m2 4 1-3m4-2-1 3-3 2 1-4',
  target: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-5a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-14v4m0 12v4M2 12h4m12 0h4',
  chevron: 'm6 9 6 6 6-6',
  list: 'M4 6h16M4 12h16M4 18h10',
  reset: 'M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.5 2M18.5 9A7 7 0 0 0 6 7',
  skipBack: 'M6 5v14M18 5 8 12l10 7z',
  skipFwd: 'M18 5v14M6 5l10 7-10 7z',
  clock: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zm0-14v5l3 2',
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS | string; size?: number }) {
  const filled = name === 'play' || name === 'pause' || name === 'skipBack' || name === 'skipFwd';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}
