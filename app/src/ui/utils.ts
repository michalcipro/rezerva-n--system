import type { CSSProperties, MutableRefObject, Ref, RefCallback } from 'react';
import type { Tone } from '../domain/types';

/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

/** Combine several refs (object or callback) into one callback ref. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value);
      else if (ref && typeof ref === 'object') (ref as MutableRefObject<T | null>).current = value;
    }
  };
}

/** All category tones in display order. */
export const TONES: readonly Tone[] = ['teal', 'sand', 'blue', 'violet', 'slate', 'rose', 'olive'];

export function isTone(value: string): value is Tone {
  return (TONES as readonly string[]).includes(value);
}

/** Czech number formatting with non-breaking thousands separators ("1 386"). */
export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('cs-CZ', { maximumFractionDigits }).format(value);
}

/** Inline style carrying CSS custom properties. */
export function cssVars(vars: Record<string, string | number | undefined>): CSSProperties {
  const style: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) style[key] = String(value);
  }
  return style as CSSProperties;
}

/** Initials from a full name, skipping academic titles ("Mgr. Tereza Malá" → "TM"). */
export function initialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w && !w.endsWith('.') && !w.includes(','));
  if (words.length === 0) return '';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toLocaleUpperCase('cs-CZ');
}
