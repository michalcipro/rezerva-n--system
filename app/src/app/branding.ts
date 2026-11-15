import type { BrandingSettings } from '../domain/types';

/**
 * Vzhled provozovny (white-label): barva značky pro světlý i tmavý motiv, název v záložce a ikona.
 * Odstíny se odvozují z jedné barvy přes color-mix (stejně jako tepelná mapa v tokens.css); text na barvě
 * a „barevný text“ se volí podle kontrastu (WCAG 4,5 : 1).
 */

const STYLE_ID = 'tenant-branding';
const HEX_RE = /^#[0-9a-f]{6}$/i;

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

function mixHex(a: string, b: string, weightA: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => Math.round(((pa >> shift) & 255) * weightA + ((pb >> shift) & 255) * (1 - weightA));
  return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('');
}

/** Ztmaví barvu, dokud nemá na bílé kontrast aspoň `min` (pro barevný text a odkazy). */
function readableOnWhite(hex: string, min = 4.5): string {
  let c = hex;
  for (let i = 0; i < 20 && contrast(c, '#ffffff') < min; i++) c = mixHex(c, '#000000', 0.9);
  return c;
}

const DARK_BG = '#0d181b';

/** CSS proměnné barvy značky pro oba motivy. */
export function brandingCss(accent: string): string {
  const base = accent.toLowerCase();
  const onAccent = contrast(base, '#ffffff') >= 4.5 ? '#ffffff' : '#111a1c';
  const fg = readableOnWhite(base);
  const light = `
  --accent: ${base};
  --accent-strong: color-mix(in oklab, ${base} 82%, black);
  --accent-soft: color-mix(in oklab, ${base} 11%, white);
  --accent-subtle: color-mix(in oklab, ${base} 7%, white);
  --accent-border: color-mix(in oklab, ${base} 32%, white);
  --accent-fg: ${fg};
  --on-accent: ${onAccent};
  --focus-ring: ${fg};`;
  const darkAccent = mixHex(base, '#ffffff', 0.72);
  const darkFg = mixHex(base, '#ffffff', 0.62);
  const dark = `
  --accent: ${darkAccent};
  --accent-strong: color-mix(in oklab, ${darkAccent} 80%, white);
  --accent-soft: color-mix(in oklab, ${base} 24%, ${DARK_BG});
  --accent-subtle: color-mix(in oklab, ${base} 16%, ${DARK_BG});
  --accent-border: color-mix(in oklab, ${base} 42%, ${DARK_BG});
  --accent-fg: ${darkFg};
  --on-accent: ${contrast(darkAccent, '#0b1416') >= 4.5 ? '#0b1416' : '#ffffff'};
  --focus-ring: ${darkFg};`;
  return `:root {${light}\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {${dark}\n  }\n}\n:root[data-theme="dark"] {${dark}\n}\n`;
}

function setFavicon(href: string): void {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = href;
}

function letterIcon(name: string, color: string): string {
  const letter = (name.trim()[0] ?? 'R').toUpperCase().replace(/[<&>"]/g, '');
  const fg = contrast(color, '#ffffff') >= 3 ? '#ffffff' : '#111a1c';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color}"/><text x="32" y="45" font-family="Arial,sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="${fg}">${letter}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

/** Použije vzhled provozovny na celou stránku (barva, název v záložce, ikona). */
export function applyBranding(branding: BrandingSettings | null | undefined, name: string): void {
  if (typeof document === 'undefined') return;
  const accent = branding?.accent && HEX_RE.test(branding.accent) ? branding.accent : null;
  let style = document.getElementById(STYLE_ID);
  if (accent) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = brandingCss(accent);
  } else {
    style?.remove();
  }
  if (name) document.title = `${name} · online rezervace`;
  setFavicon(branding?.logo ?? letterIcon(name || 'R', accent ?? '#0B6E6E'));
}
