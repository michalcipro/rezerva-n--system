import type { CSSProperties } from 'react';
import { cx } from './utils';

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  circle?: boolean;
  /** Render N text lines (last one shorter) instead of a single block. */
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/** Calm pulsing placeholder (no shimmer gradient; static under reduced motion). */
export function Skeleton({ width, height, radius, circle, lines, className, style }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <span className={cx('skeleton-text', className)} style={style} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="skeleton" style={{ height: height ?? 12 }} />
        ))}
      </span>
    );
  }
  return (
    <span
      className={cx('skeleton', circle && 'skeleton--circle', className)}
      style={{ width, height: circle ? (height ?? width) : height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  );
}
