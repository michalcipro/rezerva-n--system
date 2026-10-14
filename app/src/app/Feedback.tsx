import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ClinicState } from '../domain/types';
import { formatDateTimeShort } from '../engine/format';
import { clientName, therapistName } from '../engine/selectors';
import { useNow, useStore } from '../store/hooks';
import { useSession, type Session } from '../store/session';
import { Button, Dialog, Field, Icon, IconButton, Input, Textarea, toast } from '../ui';

/**
 * Připomínky testerů k testovací verzi. Každá poznámka si nese kontext (obrazovka, role,
 * testovací čas, zařízení). Ukládají se jen v tomto prohlížeči, dokud je tester neodešle
 * e-mailem, nezkopíruje nebo nestáhne.
 */

export interface FeedbackNote {
  id: string;
  /** Skutečný čas zápisu (ISO). */
  at: string;
  context: string;
  text: string;
}

const NOTES_KEY = 'pohyb.feedback.v1';
const NAME_KEY = 'pohyb.feedback.name';

/* ------------------------------------------------------------------ */
/* Úložiště poznámek (sdílené mezi tlačítkem a dialogem)               */
/* ------------------------------------------------------------------ */

let notesCache: FeedbackNote[] | null = null;
const listeners = new Set<() => void>();

function readNotes(): FeedbackNote[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((n): n is FeedbackNote => !!n && typeof n.id === 'string' && typeof n.text === 'string')
      : [];
  } catch {
    return [];
  }
}

function getNotes(): FeedbackNote[] {
  if (!notesCache) notesCache = readNotes();
  return notesCache;
}

function setNotes(next: FeedbackNote[]): void {
  notesCache = next;
  try {
    localStorage.setItem(NOTES_KEY, JSON.stringify(next));
  } catch {
    // bez úložiště zůstanou poznámky jen do obnovení stránky
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFeedbackNotes(): FeedbackNote[] {
  return useSyncExternalStore(subscribe, getNotes, getNotes);
}

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // jen pohodlí
  }
}

/* ------------------------------------------------------------------ */
/* Kontext a text e-mailu                                              */
/* ------------------------------------------------------------------ */

const ADMIN_SCREEN: Record<Session['route']['name'], string> = {
  prehled: 'Přehled',
  kalendar: 'Kalendář',
  klienti: 'Klienti',
  klient: 'Detail klienta',
  permanentky: 'Permanentky a kredity',
  sluzby: 'Služby a ceník',
  tym: 'Tým a směny',
  komunikace: 'Komunikace',
  statistiky: 'Statistiky',
  nastaveni: 'Nastavení',
};

const PORTAL_SCREEN: Record<Session['portalRoute']['name'], string> = {
  domu: 'Domů',
  rezervace: 'Rezervace',
  moje: 'Moje termíny',
  termin: 'Detail termínu',
  ucet: 'Účet',
};

const ROLE_LABEL: Record<Session['role'], string> = {
  owner: 'Majitelka',
  reception: 'Recepce',
  therapist: 'Terapeut',
  client: 'Klient',
};

/** „Kalendář (týden) · Recepce · test. čas St 14. 10. 9:00 · počítač“ */
export function describeContext(
  session: Session,
  clinic: ClinicState | null,
  now: string,
  device: 'mobil' | 'počítač',
): string {
  const parts: string[] = [];
  if (!clinic) {
    parts.push('Úvodní obrazovka');
  } else if (session.role === 'client') {
    const c = clinic.clients.find((x) => x.id === session.clientId);
    parts.push('Klientský portál – ' + PORTAL_SCREEN[session.portalRoute.name]);
    if (c) parts.push('klient ' + clientName(c));
  } else {
    const route = session.route;
    let screen = ADMIN_SCREEN[route.name];
    if (route.name === 'klient') {
      const c = clinic.clients.find((x) => x.id === route.clientId);
      if (c) screen += ' ' + clientName(c);
    }
    if (route.name === 'kalendar') screen += session.calendarView === 'week' ? ' (týden)' : ' (den)';
    parts.push(screen);
    if (session.role === 'therapist') {
      parts.push(ROLE_LABEL.therapist + ' ' + therapistName(clinic.therapists.find((t) => t.id === session.therapistId)));
    } else {
      parts.push(ROLE_LABEL[session.role]);
    }
  }
  if (clinic) parts.push('test. čas ' + formatDateTimeShort(now));
  parts.push(device);
  return parts.join(' · ');
}

export function feedbackText(notes: FeedbackNote[], name: string, pageUrl: string | null): string {
  const lines = ['Připomínky k testovací verzi rezervačního systému', ''];
  if (name.trim()) lines.push('Od: ' + name.trim());
  if (pageUrl) lines.push('Odkaz: ' + pageUrl);
  if (name.trim() || pageUrl) lines.push('');
  notes.forEach((n, i) => {
    lines.push(`${i + 1}. [${n.context}]`, n.text.trim(), '');
  });
  return lines.join('\n');
}

export function feedbackMailto(to: string, notes: FeedbackNote[], body: string): string {
  const subject = `Připomínky k rezervačnímu systému (${notes.length})`;
  // RFC 6068: konce řádků v těle jako CRLF
  return (
    'mailto:' +
    encodeURIComponent(to).replace(/%40/g, '@') +
    '?subject=' +
    encodeURIComponent(subject) +
    '&body=' +
    encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))
  );
}

/** Adresa pro připomínky: <meta name="feedback-to" content="…"> v index.html (nepovinné). */
function feedbackRecipient(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector<HTMLMetaElement>('meta[name="feedback-to"]')?.content.trim() ?? '';
}

function pageUrl(): string | null {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  if (location.hostname === 'localhost' || location.hostname.endsWith('.claudeusercontent.com')) return null;
  return location.origin + location.pathname;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function downloadText(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pripominky-rezervacni-system.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useDevice(): 'mobil' | 'počítač' {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 720);
  useEffect(() => {
    const onResize = (): void => setMobile(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile ? 'mobil' : 'počítač';
}

/* ------------------------------------------------------------------ */
/* Tlačítko a dialog                                                   */
/* ------------------------------------------------------------------ */

/** Tlačítko do testovacího panelu; s počtem uložených připomínek. */
export function FeedbackButton({ iconOnly = false }: { iconOnly?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const count = useFeedbackNotes().length;
  const label = count ? `Připomínky (${count})` : 'Připomínka';
  return (
    <>
      <button
        type="button"
        className={'tb__feedback' + (iconOnly ? ' tb__feedback--icon' : '')}
        onClick={() => setOpen(true)}
        aria-label={label}
        title="Napsat připomínku k této obrazovce"
      >
        <Icon name="message" size={14} />
        {!iconOnly && <span className="tb__feedback-label">{label}</span>}
        {count > 0 && (
          <span className={'tb__feedback-count' + (iconOnly ? '' : ' tb__feedback-count--narrow')} aria-hidden="true">
            {count}
          </span>
        )}
      </button>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const notes = useFeedbackNotes();
  const session = useSession();
  const clinic = useStore((s) => s.clinic);
  const storage = useStore((s) => s.storage);
  const now = useNow();
  const device = useDevice();
  const [text, setText] = useState('');
  const [name, setName] = useState(readName);
  const [confirmClear, setConfirmClear] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const context = useMemo(() => describeContext(session, clinic, now, device), [session, clinic, now, device]);
  const body = useMemo(() => feedbackText(notes, name, pageUrl()), [notes, name]);
  const recipient = feedbackRecipient();
  const mailto = feedbackMailto(recipient, notes, body);

  useEffect(() => {
    if (!confirmClear) return undefined;
    const id = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(id);
  }, [confirmClear]);

  const add = (): void => {
    const t = text.trim();
    if (!t) {
      textRef.current?.focus();
      return;
    }
    const note: FeedbackNote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: new Date().toISOString(),
      context,
      text: t,
    };
    setNotes([...getNotes(), note]);
    setText('');
    toast.success('Připomínka uložena', { description: 'Až budete hotovi, pošlete všechny najednou.' });
    textRef.current?.focus();
  };

  const remove = (id: string): void => setNotes(getNotes().filter((n) => n.id !== id));

  const copy = async (): Promise<void> => {
    if (await copyText(body)) toast.success('Připomínky zkopírovány', { description: 'Vložte je do e-mailu nebo zprávy.' });
    else toast.error('Kopírování se nepovedlo', { description: 'Zkuste připomínky stáhnout jako soubor.' });
  };

  const footer = (
    <>
      <Button variant="secondary" icon="copy" onClick={() => void copy()} disabled={!notes.length}>
        Zkopírovat
      </Button>
      {storage !== 'artifact' && (
        <Button variant="secondary" icon="download" onClick={() => downloadText(body)} disabled={!notes.length}>
          Stáhnout
        </Button>
      )}
      {notes.length ? (
        <a
          className="btn btn--primary btn--md btn--icon-start"
          href={mailto}
          onClick={() => toast.info('Otevírám e-mail…', { description: 'Pokud se nic neotevřelo, použijte Zkopírovat.' })}
        >
          <Icon name="send" size={16} />
          <span className="btn__label">Odeslat e-mailem</span>
        </a>
      ) : (
        <Button variant="primary" icon="send" disabled>
          Odeslat e-mailem
        </Button>
      )}
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Připomínky k testovací verzi"
      description="Napište, co by se mělo změnit, co chybí nebo co nefunguje. K poznámce se sama přidá obrazovka, na které jste."
      footer={footer}
      initialFocus={textRef}
    >
      <div className="fb">
        <Field label="Nová připomínka">
          <Textarea
            ref={textRef}
            rows={4}
            value={text}
            onValueChange={setText}
            placeholder="Např. V detailu rezervace bych chtěla vidět i telefon klienta."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                add();
              }
            }}
          />
        </Field>
        <div className="fb__add">
          <span className="fb__context">
            <Icon name="info" size={14} />
            <span>
              Přiloží se: <span className="fb__context-value">{context}</span>
            </span>
          </span>
          <Button variant="primary" size="sm" icon="plus" onClick={add}>
            Uložit připomínku
          </Button>
        </div>

        <div className="fb__list-head">
          <h3 className="fb__list-title">Uložené připomínky{notes.length ? ` (${notes.length})` : ''}</h3>
          {notes.length > 0 && (
            <Button
              variant={confirmClear ? 'danger' : 'ghost'}
              size="sm"
              icon="trash"
              onClick={() => {
                if (confirmClear) {
                  setNotes([]);
                  setConfirmClear(false);
                  toast('Seznam připomínek je prázdný');
                } else {
                  setConfirmClear(true);
                }
              }}
            >
              {confirmClear ? 'Opravdu smazat vše?' : 'Smazat vše'}
            </Button>
          )}
        </div>
        {notes.length ? (
          <ol className="fb__list">
            {notes.map((n) => (
              <li key={n.id} className="fb__item">
                <div className="fb__item-body">
                  <p className="fb__item-context">{n.context}</p>
                  <p className="fb__item-text">{n.text}</p>
                </div>
                <IconButton label="Smazat připomínku" icon="trash" size="sm" variant="ghost" onClick={() => remove(n.id)} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="fb__empty">
            Zatím tu nic není. Připomínky se ukládají jen v tomto prohlížeči, dokud je neodešlete – klidně jich nasbírejte
            víc a pošlete je najednou.
          </p>
        )}

        {notes.length > 0 && (
          <Field label="Vaše jméno" optional hint={recipient ? undefined : 'E-mail se otevře bez adresáta – doplňte adresu, kam připomínky posíláte.'}>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                saveName(e.target.value);
              }}
              placeholder="Aby bylo jasné, od koho připomínky jsou"
              autoComplete="name"
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
