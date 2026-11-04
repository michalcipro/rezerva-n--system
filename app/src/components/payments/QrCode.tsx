import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { isQrAlphanumeric } from '../../engine/qr';

export interface QrCodeProps {
  /** Text zakódovaný v QR (u QR Platby řetězec SPAYD). */
  value: string;
  /** Velikost v px (čtverec). */
  size?: number;
  /** Přístupný popis obrázku. */
  label?: string;
  className?: string;
}

/**
 * QR kód jako SVG: tmavé moduly na bílém podkladu s tichou zónou 4 moduly – i v tmavém motivu,
 * aby ho bankovní aplikace spolehlivě načetly. Úroveň opravy chyb M (doporučená pro QR Platbu).
 */
export function QrCode({ value, size = 200, label = 'QR kód', className }: QrCodeProps): JSX.Element {
  const { dim, path } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value, isQrAlphanumeric(value) ? 'Alphanumeric' : 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 4;
    let d = '';
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.isDark(r, c)) {
          c++;
          continue;
        }
        let run = 1;
        while (c + run < n && qr.isDark(r, c + run)) run++;
        d += `M${c + quiet} ${r + quiet}h${run}v1h-${run}z`;
        c += run;
      }
    }
    return { dim: n + quiet * 2, path: d };
  }, [value]);

  return (
    <svg
      className={['qr-code', className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${dim} ${dim}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={dim} height={dim} fill="#ffffff" />
      <path d={path} fill="#111111" />
    </svg>
  );
}
