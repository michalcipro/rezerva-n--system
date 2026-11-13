/**
 * HTML verze e-mailu z prostého textu zprávy.
 *
 * Jednoduchá a odolná šablona: tabulkové rozvržení, styly přímo u prvků (e-mailoví klienti často zahodí
 * <style>), šířka nejvýše 600 px, na telefonu přes celou šířku. Tmavý režim: barvy přes
 * `prefers-color-scheme` (Apple Mail, iOS) a `[data-ogsc]` (Outlook.com); ostatní klienti si barvy
 * převedou sami. Text se vždy escapuje, prázdný řádek odděluje odstavce, odkazy https:// jsou klikací.
 */

export interface EmailHtmlInput {
  clinicName: string;
  subject: string;
  /** Prostý text zprávy: prázdný řádek odděluje odstavce, jednotlivé konce řádků zůstanou zachované. */
  body: string;
  /** Text patičky pod názvem kliniky (adresa, telefon, web…). */
  footer?: string;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const COLORS = {
  page: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#1f2328',
  muted: '#59636e',
  link: '#0b5cad',
  dark: { page: '#121417', card: '#1c1f24', border: '#2c3138', text: '#e6e8eb', muted: '#a3abb5', link: '#8ab4f8' },
};

const TEXT_STYLE = `margin:0 0 16px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${COLORS.text};`;
const LINK_STYLE = `color:${COLORS.link};text-decoration:underline;word-break:break-all;`;

const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .page { background-color: ${COLORS.dark.page} !important; }
  .card { background-color: ${COLORS.dark.card} !important; border-color: ${COLORS.dark.border} !important; }
  .text { color: ${COLORS.dark.text} !important; }
  .muted { color: ${COLORS.dark.muted} !important; }
  .link { color: ${COLORS.dark.link} !important; }
}
[data-ogsb] .page { background-color: ${COLORS.dark.page} !important; }
[data-ogsb] .card { background-color: ${COLORS.dark.card} !important; }
[data-ogsc] .text { color: ${COLORS.dark.text} !important; }
[data-ogsc] .muted { color: ${COLORS.dark.muted} !important; }
[data-ogsc] .link { color: ${COLORS.dark.link} !important; }
`;

/** Odkazy https:// (bez mezer, uvozovek a lomených závorek). */
const URL_PATTERN = /https:\/\/[^\s<>"'\u{201c}-\u{201f}\xab\xbb]+/gu;

/** Interpunkce za odkazem („viz https://…/rezervace.“) do odkazu nepatří. */
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0) {
    const ch = url[end - 1];
    const head = url.slice(0, end);
    if ('.,;:!?\u{2026}'.includes(ch) || (ch === ')' && head.split('(').length < head.split(')').length)) end--;
    else break;
  }
  return url.slice(0, end);
}

/** Jeden řádek textu → HTML s klikacími odkazy. */
function inlineHtml(line: string): string {
  let out = '';
  let last = 0;
  for (const m of line.matchAll(URL_PATTERN)) {
    const start = m.index ?? 0;
    const url = trimUrl(m[0]);
    out += escapeHtml(line.slice(last, start));
    out +=
      url.length > 'https://'.length
        ? `<a href="${escapeHtml(url)}" class="link" style="${LINK_STYLE}">${escapeHtml(url)}</a>`
        : escapeHtml(url);
    last = start + url.length;
  }
  return out + escapeHtml(line.slice(last));
}

/** Text → odstavce (pole řádků); prázdný řádek (i jen s mezerami) odstavce odděluje. */
function paragraphs(text: string): string[][] {
  const result: string[][] = [];
  let current: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/u, '');
    if (line.trim()) {
      current.push(line);
    } else if (current.length) {
      result.push(current);
      current = [];
    }
  }
  if (current.length) result.push(current);
  return result;
}

const linesHtml = (lines: string[]): string => lines.map(inlineHtml).join('<br>\n');

/** Náhled v seznamu zpráv (skrytý text na začátku e-mailu). */
function preheader(body: string): string {
  const chars = Array.from(body.replace(/\s+/gu, ' ').trim()); // po znacích, aby se nerozdělilo emoji
  return chars.length > 140 ? chars.slice(0, 139).join('').trimEnd() + '…' : chars.join('');
}

export function renderEmailHtml(input: EmailHtmlInput): string {
  const clinic = escapeHtml(input.clinicName.trim());
  const body = paragraphs(input.body)
    .map((lines) => `<p class="text" style="${TEXT_STYLE}">${linesHtml(lines)}</p>`)
    .join('\n');
  const footerLines = paragraphs(input.footer ?? '').flat();
  const footer = footerLines.length ? `<br>\n${linesHtml(footerLines)}` : '';
  const cell = (style: string): string => `font-family:${FONT};${style}`;

  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.subject)}</title>
<style>${DARK_CSS}</style>
</head>
<body class="page" style="margin:0;padding:0;background-color:${COLORS.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader(input.body))}</div>
<table role="presentation" class="page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:${COLORS.card};border:1px solid ${COLORS.border};border-radius:8px;">
<tr><td class="muted" style="${cell(`padding:20px 24px 0 24px;font-size:14px;line-height:20px;font-weight:bold;color:${COLORS.muted};`)}">${clinic}</td></tr>
<tr><td class="text" style="${cell(`padding:16px 24px 8px 24px;font-size:16px;line-height:24px;color:${COLORS.text};word-break:break-word;`)}">
${body}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td class="muted" style="${cell(`padding:16px 24px;font-size:12px;line-height:18px;color:${COLORS.muted};`)}"><strong>${clinic}</strong>${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}
