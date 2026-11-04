import qrcode from 'qrcode-generator';

/**
 * Matice QR kódu z knihovny qrcode-generator (bez Reactu – používá ji komponenta QrCode a dá se ověřit
 * dekodérem). Úroveň opravy chyb M, okraj (quiet zone) 4 moduly.
 */

/** Okraj kolem kódu v modulech (norma QR vyžaduje aspoň 4). */
export const QR_MARGIN = 4;

/** Znaky alfanumerického režimu QR (SPAYD velkými písmeny se do něj vejde – menší a čitelnější kód). */
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

export interface QrMatrix {
  /** Počet modulů na straně (bez okraje). */
  count: number;
  isDark(row: number, col: number): boolean;
}

/** Převede text na „binární řetězec“ UTF-8 bajtů (výchozí stringToBytes knihovny bere znak & 0xff). */
function utf8Binary(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** Sestaví QR kód (automatická verze, oprava chyb M). Vyhodí chybu, když se text do QR nevejde. */
export function qrMatrix(value: string): QrMatrix {
  const qr = qrcode(0, 'M');
  if (ALPHANUMERIC.test(value)) qr.addData(value, 'Alphanumeric');
  else qr.addData(utf8Binary(value), 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  return { count, isDark: (row, col) => qr.isDark(row, col) };
}

/**
 * Cesta SVG pro tmavé moduly (souřadnice v modulech, včetně okraje `margin`): souvislé úseky v řádku
 * jako jeden obdélník – kratší cesta a žádné mezery mezi moduly.
 */
export function qrPath(m: QrMatrix, margin = QR_MARGIN): string {
  const parts: string[] = [];
  for (let r = 0; r < m.count; r++) {
    let c = 0;
    while (c < m.count) {
      if (!m.isDark(r, c)) {
        c++;
        continue;
      }
      let len = 1;
      while (c + len < m.count && m.isDark(r, c + len)) len++;
      parts.push(`M${c + margin} ${r + margin}h${len}v1h-${len}z`);
      c += len;
    }
  }
  return parts.join('');
}
