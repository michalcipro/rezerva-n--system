import { useMemo } from 'react';
import { cx } from '../../ui';
import { QR_MARGIN, qrMatrix, qrPath } from './qrMatrix';
import './payments.css';

export interface QrCodeProps {
  /** Kódovaný text (u QR Platby řetězec SPAYD). */
  value: string;
  /** Strana v px (výchozí 208); na úzkém displeji se zmenší na šířku kontejneru. */
  size?: number;
  /** Přístupný název obrázku. */
  label?: string;
  className?: string;
}

/**
 * QR kód jako SVG (knihovna qrcode-generator, oprava chyb M, okraj 4 moduly). Barvy z tokenů --qr-fg / --qr-bg:
 * v obou motivech tmavé moduly na bílém, aby šel kód naskenovat i z tmavé obrazovky.
 */
export function QrCode({ value, size = 208, label = 'QR kód', className }: QrCodeProps): JSX.Element {
  const qr = useMemo(() => {
    try {
      const m = qrMatrix(value);
      return { dim: m.count + 2 * QR_MARGIN, path: qrPath(m) };
    } catch {
      return null;
    }
  }, [value]);

  if (!qr) {
    return (
      <div className={cx('pay-qr', 'pay-qr--error', className)} role="img" aria-label="QR kód se nepodařilo vytvořit" style={{ width: size, height: size }}>
        <span>QR kód se nepodařilo vytvořit – text je příliš dlouhý.</span>
      </div>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={cx('pay-qr', className)}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.dim} ${qr.dim}`}
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect className="pay-qr__bg" x="0" y="0" width={qr.dim} height={qr.dim} />
      <path className="pay-qr__fg" d={qr.path} />
    </svg>
  );
}
