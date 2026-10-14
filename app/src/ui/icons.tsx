import type { ReactElement } from 'react';

/*
 * Stroke icon set on a 24 px grid (rendered with stroke-width 1.75, round caps
 * and joins, currentColor). Glyphs marked "design" are copied verbatim from the
 * approved Klinik artboards; the rest are drawn to the same geometry.
 */

const calendarFrame = (
  <>
    <rect x="3" y="4.5" width="18" height="16" rx="2" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </>
);

const personWithShoulder = (
  <>
    <circle cx="9.5" cy="8" r="3.5" />
    <path d="M3 20c0-3.6 2.9-6 6.5-6 1.4 0 2.7.4 3.7 1" />
  </>
);

export const ICONS = {
  /* Navigation */
  home: (
    <>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9v10a1.5 1.5 0 0 0 1.5 1.5H10v-5.5h4v5.5h2.5A1.5 1.5 0 0 0 18 19V9" />
    </>
  ),
  // design: "Přehled"
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  // design
  calendar: calendarFrame,
  calendarPlus: (
    <>
      {calendarFrame}
      <path d="M12 12.5v5M9.5 15h5" />
    </>
  ),
  calendarCheck: (
    <>
      {calendarFrame}
      <path d="m9.5 15 2 2 3.5-3.5" />
    </>
  ),
  calendarX: (
    <>
      {calendarFrame}
      <path d="m10 13 4 4M14 13l-4 4" />
    </>
  ),
  // design: "Klienti"
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.1.6 3.5 2.6 3.5 5.7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    </>
  ),
  userPlus: (
    <>
      {personWithShoulder}
      <path d="M18.5 13v6M15.5 16h6" />
    </>
  ),
  userCheck: (
    <>
      {personWithShoulder}
      <path d="m15 17.5 2 2 4-4.5" />
    </>
  ),
  userX: (
    <>
      {personWithShoulder}
      <path d="m16 14 5 5M21 14l-5 5" />
    </>
  ),
  // design: "Permanentky a kredity"
  ticket: (
    <>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14.5 6.5v11" strokeDasharray="2 2.5" />
    </>
  ),
  // design: "Služby a ceník"
  tag: (
    <>
      <path d="M3.5 12.5v-8a1 1 0 0 1 1-1h8l8 8-9 9z" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3.5" y="6" width="17" height="13.5" rx="2" />
      <path d="M20.5 10.5h-4a2 2 0 0 0 0 4h4" />
      <path d="m6 6 9.2-2.4a1 1 0 0 1 1.3 1V6" />
    </>
  ),
  // design: "Statistiky"
  chart: (
    <>
      <path d="M4 20h16" />
      <path d="M7 16v-5M12 16V6M17 16v-8" />
    </>
  ),
  // design: "Komunikace"
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </>
  ),
  message: (
    <path d="M4 6a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 6v9.5a1.5 1.5 0 0 1-1.5 1.5H9.5L5.4 20a.8.8 0 0 1-1.4-.6z" />
  ),
  send: (
    <>
      <path d="M20.5 3.5 10.5 13.5" />
      <path d="M20.5 3.5 14 20.5l-3.5-7-7-3.5z" />
    </>
  ),
  settings: (
    <>
      <path d="M10.02 5.08 10.35 2.64h3.3l.33 2.44L17 6.82l2.28-.93 1.65 2.86-1.94 1.51v3.48l1.94 1.51-1.65 2.86L17 17.18l-3.02 1.74-.33 2.44h-3.3l-.33-2.44L7 17.18l-2.28.93-1.65-2.86 1.94-1.51v-3.48L3.07 8.75l1.65-2.86L7 6.82z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // design: "Nastavení"
  sliders: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: (
    <>
      <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
      <path d="M9.5 16.5 5 12l4.5-4.5" />
      <path d="M5 12h10" />
    </>
  ),

  /* Actions */
  // design
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  // design
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  // design
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  // design
  x: <path d="M6 6l12 12M18 6 6 18" />,
  // design
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  edit: (
    <>
      <path d="M4.5 19.5 5.3 15.6 15.8 5.1a2.1 2.1 0 0 1 3 3L8.4 18.6z" />
      <path d="m13.8 7.1 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
      <path d="m6.5 7 .8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V5A1.5 1.5 0 0 0 14 3.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h3.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10 5.7a9.6 9.6 0 0 1 2-.2c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3.5 3.5 17 17" />
    </>
  ),
  // design: "Filtr" (segment rule)
  filter: <path d="M4 5h16l-6 7.5V19l-4-1.5v-5z" />,
  // design: "Export CSV"
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 0 1-13 5.1" />
      <path d="M4.5 12a7.5 7.5 0 0 1 13-5.1" />
      <path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4" />
    </>
  ),
  repeat: (
    <>
      <path d="m17 3.5 3 3-3 3" />
      <path d="M20 6.5H8a4 4 0 0 0-4 4v1" />
      <path d="m7 20.5-3-3 3-3" />
      <path d="M4 17.5h12a4 4 0 0 0 4-4v-1" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14.5 4.5 10 9 5.5" />
      <path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-3" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 6 .4l2.5-2.5a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10a4 4 0 0 0-6-.4l-2.5 2.5a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  external: (
    <>
      <path d="M13.5 4.5h6v6" />
      <path d="M19.5 4.5 11 13" />
      <path d="M17.5 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4.5" />
    </>
  ),
  play: <path d="M7.5 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8a.8.8 0 0 0-1.2.7z" />,
  pause: (
    <>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" />
    </>
  ),

  /* Direction */
  // design
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  // design
  chevronRight: <path d="m9 18 6-6-6-6" />,
  // design
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronsUpDown: <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />,
  // design: mobile back
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6" />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" />,
  // design: KPI delta
  arrowUpRight: <path d="M7 17 17 7M8 7h9v9" />,
  arrowDownRight: <path d="M7 7l10 10M17 8v9H8" />,

  /* Status & feedback */
  // design
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M8 3.5c0 4.5 4 5.4 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5.4-4 8.5s4 4 4 8.5" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.75h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.4 4.3 2.8 17.6a1.9 1.9 0 0 0 1.7 2.9h15a1.9 1.9 0 0 0 1.7-2.9L13.6 4.3a1.85 1.85 0 0 0-3.2 0z" />
      <path d="M12 9.5V14M12 17h.01" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m6 6 12 12" />
    </>
  ),
  // design
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  // design: clinical note
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  shield: <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />,
  shieldCheck: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" />
      <path d="m9 12 2 2 4-4.5" />
    </>
  ),

  /* Contact & channels */
  // design
  phone: (
    <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A16 16 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z" />
  ),
  smartphone: (
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20h7M12 16.5V20" />
    </>
  ),
  // design: online consultation
  video: (
    <>
      <rect x="3" y="6.5" width="13" height="11" rx="2" />
      <path d="m16 10.5 5-3v9l-5-3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5S9.7 5.9 12 3.5z" />
    </>
  ),
  building: (
    <>
      <path d="M4 20.5h16M5.5 20.5V9.5M18.5 20.5V9.5" />
      <path d="M3.5 9.5 12 4l8.5 5.5z" />
      <path d="M9.5 20.5v-6h5v6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 20.5s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z" />
      <circle cx="12" cy="9.5" r="2.25" />
    </>
  ),

  /* Layout & content */
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  layers: (
    <>
      <path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="m3.5 12 8.5 4.5 8.5-4.5" />
      <path d="m3.5 16 8.5 4.5 8.5-4.5" />
    </>
  ),
  file: (
    <>
      <path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
      <path d="M13.5 3.5v5h5M9 13h6M9 16.5h4" />
    </>
  ),
  clipboard: (
    <>
      <path d="M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V6a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="3.5" rx="1" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18" />
    </>
  ),
  sparkline: <path d="M3 16.5 7.5 11l4 3 5-7 4.5 4.5" />,
  activity: <path d="M3 12h4l2.5-6.5 5 13 2.5-6.5h4" />,

  /* Money */
  coins: (
    <>
      <ellipse cx="12" cy="6.5" rx="7" ry="2.5" />
      <path d="M5 6.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" />
      <path d="M5 11.5v5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-1.2-1-1.2 1-2.4-1.5L6 20.5z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 10h18M7 14.5h3" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 9.5h.01M17.5 14.5h.01" />
    </>
  ),
  percent: (
    <>
      <path d="M18.5 5.5 5.5 18.5" />
      <circle cx="7" cy="7" r="2.25" />
      <circle cx="17" cy="17" r="2.25" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="4" rx="1" />
      <path d="M5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7M12 8v12.5" />
      <path d="M12 8H8.8a2.3 2.3 0 1 1 0-4.5C11 3.5 12 8 12 8zM12 8h3.2a2.3 2.3 0 1 0 0-4.5C13 3.5 12 8 12 8z" />
    </>
  ),

  /* Clinic */
  heart: <path d="M12 19.5S3.5 14.8 3.5 9a4.5 4.5 0 0 1 8.5-2 4.5 4.5 0 0 1 8.5 2c0 5.8-8.5 10.5-8.5 10.5z" />,
  dumbbell: <path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  zap: <path d="M13 3.5 5.5 13.5h6l-1 7 7.5-10h-6z" />,

  /* Theme */
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z" />,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
