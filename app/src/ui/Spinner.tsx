import { cx } from './utils';

export interface SpinnerProps {
  size?: number;
  /** Announced text, e.g. „Načítání…“. Without it the spinner is decorative. */
  label?: string;
  className?: string;
}

export function Spinner({ size = 16, label, className }: SpinnerProps) {
  const svg = (
    <svg
      className={cx('spinner', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle className="spinner__track" cx="12" cy="12" r="9" />
      <path className="spinner__arc" d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="row row-sm">
      {svg}
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
