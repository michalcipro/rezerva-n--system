import { useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type RefObject } from 'react';

/**
 * Šířka prvku (px, 0 = ještě nezměřeno). Měří se před vykreslením a pak při každé změně velikosti,
 * takže karta může volit mezi tabulkou a kartičkami podle místa, které opravdu má.
 */
export function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = (): void => {
      const w = Math.round(el.getBoundingClientRect().width);
      setWidth((prev) => (prev === w ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Odpovídá mediální dotaz (např. telefon)? */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Telefon: období ve výběru místo přepínače, ostatní filtry schované pod tlačítkem „Filtry“. */
export const PHONE_QUERY = '(max-width: 640px)';

/** Klik v řádku tabulky přišel z tlačítka / odkazu uvnitř (ty mají vlastní akci)? */
export function fromControl(e: MouseEvent<HTMLElement>): boolean {
  const target = e.target as HTMLElement | null;
  const control = target?.closest('button, a, input, select, textarea, label');
  return !!control && e.currentTarget.contains(control);
}
