import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import type { ClientConsents, ConsentRecord, LocalDateTime } from '../../domain/types';
import { formatDate, formatNumber, formatSignedMoney, WEEKDAY_SHORT } from '../../engine/format';
import { weekdayOf } from '../../engine/time';
import { useSession } from '../../store/session';
import { Icon, IconButton, cx } from '../../ui';
import type { StornoChip } from './model';
import './clients.css';

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

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

export interface Permissions {
  /** Kredit, platby, útrata, permanentky (ne terapeut). */
  finance: boolean;
  /** Klinické poznámky (majitelka-terapeutka a terapeuti, ne recepce). */
  clinical: boolean;
  /** Komunikace s klientem a změny údajů. */
  manage: boolean;
}

export function usePermissions(): Permissions {
  const role = useSession().role;
  return {
    finance: role === 'owner' || role === 'reception',
    clinical: role === 'owner' || role === 'therapist',
    manage: role === 'owner' || role === 'reception',
  };
}

/** Posune nejbližší rolovací kontejner na začátek (detail se otevírá bez změny položky menu). */
export function scrollContainerToTop(el: HTMLElement | null): void {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: 0 });
      return;
    }
    node = node.parentElement;
  }
  window.scrollTo?.({ top: 0 });
}

/** Stránkování pole (stránky od 0). */
export function usePaged<T>(items: T[], pageSize: number, resetKey: unknown): { page: number; setPage: (p: number) => void; pageItems: T[]; pageCount: number } {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(page, pageCount - 1);
  return { page: safe, setPage, pageItems: items.slice(safe * pageSize, safe * pageSize + pageSize), pageCount };
}

/* ------------------------------------------------------------------ */
/* Malé komponenty                                                     */
/* ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
  label = 'Stránkování',
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  label?: string;
}): JSX.Element | null {
  if (total <= pageSize) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, from + pageSize - 1);
  return (
    <nav className="cli-pager" aria-label={label}>
      <span className="cli-pager__info tnum">
        {formatNumber(from)}–{formatNumber(to)} z {formatNumber(total)}
      </span>
      <span className="cli-pager__controls">
        <IconButton icon="chevronLeft" label="Předchozí stránka" variant="secondary" size="sm" disabled={page <= 0} onClick={() => onChange(page - 1)} />
        <span className="cli-pager__page tnum" aria-live="polite">
          Strana {page + 1} z {pageCount}
        </span>
        <IconButton icon="chevronRight" label="Další stránka" variant="secondary" size="sm" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)} />
      </span>
    </nav>
  );
}

/** Přepínací filtr (lze zapnout více najednou). */
export function FilterChip({
  pressed,
  onToggle,
  children,
  count,
  tone,
}: {
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
  count?: number;
  tone?: 'danger' | 'warning';
}): JSX.Element {
  return (
    <button type="button" className={cx('cli-fchip', tone && `cli-fchip--${tone}`)} aria-pressed={pressed} onClick={onToggle}>
      {pressed && <Icon name="check" size={14} />}
      <span>{children}</span>
      {count != null && <span className="cli-fchip__count tnum">{formatNumber(count)}</span>}
    </button>
  );
}

/** Štítky klienta: čipy + pole pro přidání (Enter / čárka), návrhy z existujících štítků. */
export function TagInput({
  value,
  onChange,
  suggestions,
  id,
  placeholder = 'Přidat štítek…',
  'aria-describedby': describedBy,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
  id?: string;
  placeholder?: string;
  'aria-describedby'?: string;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const listId = (id ?? 'cli-tags') + '-list';
  const add = (raw: string): void => {
    const tag = raw.trim().replace(/,+$/, '').trim();
    if (!tag) return;
    if (!value.some((t) => t.toLocaleLowerCase('cs') === tag.toLocaleLowerCase('cs'))) onChange([...value, tag]);
    setDraft('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const free = suggestions.filter((s) => !value.includes(s));
  return (
    <div className="cli-tags">
      {value.length > 0 && (
        <ul className="cli-tags__list" aria-label="Štítky">
          {value.map((t) => (
            <li key={t} className="cli-tag">
              <span>{t}</span>
              <button type="button" className="cli-tag__remove" aria-label={`Odebrat štítek ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
                <Icon name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="cli-tags__add">
        <input
          id={id}
          className="cli-tags__input"
          value={draft}
          list={listId}
          placeholder={placeholder}
          aria-describedby={describedBy}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            // výběr z nabídky prohlížeče vloží celý štítek najednou
            if (free.includes(v)) add(v);
            else setDraft(v);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
        />
        <datalist id={listId}>
          {free.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

/** Datum jako „Čt / 15. 10.“ pro řádky termínů. */
export function DateBlock({ start }: { start: LocalDateTime }): JSX.Element {
  const d = Number(start.slice(8, 10));
  const m = Number(start.slice(5, 7));
  return (
    <span className="cli-dateblock tnum" aria-hidden="true">
      <span className="cli-dateblock__dow">{WEEKDAY_SHORT[weekdayOf(start)]}</span>
      <span className="cli-dateblock__day">
        {d}.&nbsp;{m}.
      </span>
    </span>
  );
}

export function StornoChipView({ chip }: { chip: StornoChip }): JSX.Element {
  return (
    <span className={cx('cli-storno', `cli-storno--${chip.tone}`, chip.emphasis && 'cli-storno--pill')}>
      {!chip.emphasis && <span className="cli-storno__dot" aria-hidden="true" />}
      {chip.text}
    </span>
  );
}

export function SignedMoney({ amount, className }: { amount: number; className?: string }): JSX.Element {
  return <span className={cx('cli-money tnum', amount > 0 && 'cli-money--plus', amount < 0 && 'cli-money--minus', className)}>{formatSignedMoney(amount)}</span>;
}

export const CONSENT_META: { key: keyof ClientConsents; label: string; description: string }[] = [
  { key: 'gdpr', label: 'Zpracování osobních údajů', description: 'Nutné pro vedení klienta, rezervace a vyúčtování. Nelze odebrat – výmaz řeší klinika na žádost klienta.' },
  { key: 'health', label: 'Zdravotní dokumentace', description: 'Vedení klinických poznámek, anamnézy a průběhu terapie.' },
  { key: 'marketingEmail', label: 'Obchodní sdělení e-mailem', description: 'Novinky, nabídky a kampaně kliniky. Lze kdykoli odvolat.' },
  { key: 'sms', label: 'SMS připomínky a zprávy', description: 'Připomínky termínů a provozní zprávy přes SMS.' },
];

export function ConsentState({ record }: { record: ConsentRecord | null }): JSX.Element {
  return record ? (
    <span className="cli-consent cli-consent--yes">
      <Icon name="checkCircle" size={16} title="Uděleno" />
    </span>
  ) : (
    <span className="cli-consent cli-consent--no">
      <Icon name="xCircle" size={16} title="Neuděleno" />
    </span>
  );
}

export function consentDate(record: ConsentRecord | null): string {
  return record ? formatDate(record.at) : '';
}

/** Malý sekční popisek ve stylu 11 px verzálek. */
export function Eyebrow({ children, as = 'span', id }: { children: ReactNode; as?: 'span' | 'h2' | 'h3'; id?: string }): JSX.Element {
  const Tag = as;
  return (
    <Tag className="cli-eyebrow" id={id}>
      {children}
    </Tag>
  );
}
