import { useMemo, useState } from 'react';
import type { ActorRole } from '../domain/types';
import { setSimulatedNow } from '../engine/commands';
import { formatDayShort, formatTime } from '../engine/format';
import { clientName, therapistName } from '../engine/selectors';
import { addDays, addHours, isValidLocalDateTime, nowLocal } from '../engine/time';
import { useClinic, useCommand, useNow, useStore } from '../store/hooks';
import { setSession, useSession } from '../store/session';
import { loadDemoData, wipeAll } from '../store/store';
import { Button, ConfirmDialog, Icon, IconButton, Menu, Segmented, Select } from '../ui';
import { FeedbackButton } from './Feedback';

const ROLES: { value: ActorRole; label: string }[] = [
  { value: 'owner', label: 'Majitelka' },
  { value: 'reception', label: 'Recepce' },
  { value: 'therapist', label: 'Terapeut' },
  { value: 'client', label: 'Klient' },
];

/** Panel testovacího režimu: role, testovací hodiny, data. */
export function TestBar({ compact = false }: { compact?: boolean }): JSX.Element {
  const clinic = useClinic();
  const session = useSession();
  const now = useNow();
  const run = useCommand();
  const storage = useStore((s) => s.storage);
  const sync = useStore((s) => s.sync);
  const syncError = useStore((s) => s.error);
  const [confirm, setConfirm] = useState<null | 'demo' | 'wipe'>(null);
  const [clockInput, setClockInput] = useState('');
  const simulated = clinic.settings.simulatedNow;

  const clientOptions = useMemo(() => {
    const sorted = [...clinic.clients].sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName, 'cs'));
    return sorted.map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName}` }));
  }, [clinic.clients]);

  const therapistOptions = useMemo(
    () => clinic.therapists.filter((t) => t.active).map((t) => ({ value: t.id, label: therapistName(t) })),
    [clinic.therapists],
  );

  const ensureClient = (): string | null => {
    if (session.clientId && clinic.clients.some((c) => c.id === session.clientId)) return session.clientId;
    const martin = clinic.clients.find((c) => c.firstName === 'Martin' && c.lastName === 'Dvořák');
    return martin?.id ?? clinic.clients[0]?.id ?? null;
  };

  const setRole = (role: ActorRole): void => {
    if (role === 'client') {
      setSession({ role, clientId: ensureClient(), portalRoute: { name: 'domu' } });
    } else if (role === 'therapist') {
      setSession({ role, therapistId: session.therapistId ?? clinic.therapists[0]?.id ?? null });
    } else {
      setSession({ role, route: session.route.name === 'statistiky' || session.route.name === 'nastaveni' ? (role === 'owner' ? session.route : { name: 'kalendar' }) : session.route });
    }
  };

  const shift = (hours: number): void => {
    run(setSimulatedNow, { value: addHours(now, hours) });
  };

  const applyClock = (): void => {
    const v = clockInput.slice(0, 16);
    if (isValidLocalDateTime(v)) run(setSimulatedNow, { value: v }, { success: 'Testovací čas nastaven' });
  };

  const syncLabel =
    sync === 'saving' ? 'Ukládám…' : sync === 'error' ? 'Neuloženo' : storage === 'artifact' ? 'Sdílená data' : storage === 'local' ? 'Data v prohlížeči' : 'Data jen v paměti';

  if (!session.testBarOpen) {
    return (
      <div className="tb tb--collapsed">
        <FeedbackButton />
        <button type="button" className="tb__reopen" onClick={() => setSession({ testBarOpen: true })}>
          <Icon name="sliders" size={14} />
          Testovací režim
        </button>
      </div>
    );
  }

  const roleControl = compact ? (
    <Select
      aria-label="Testovací role"
      className="tb__select tb__select--role"
      value={session.role}
      options={ROLES}
      onChange={(e) => setRole(e.target.value as ActorRole)}
    />
  ) : (
    <Segmented size="sm" aria-label="Testovací role" options={ROLES} value={session.role} onChange={(v) => setRole(v as ActorRole)} />
  );

  const personControl =
    session.role === 'therapist' ? (
      <Select
        aria-label="Terapeut"
        className="tb__select"
        value={session.therapistId ?? ''}
        options={therapistOptions}
        onChange={(e) => setSession({ therapistId: e.target.value })}
      />
    ) : session.role === 'client' ? (
      <Select
        aria-label="Klient"
        className="tb__select"
        value={ensureClient() ?? ''}
        options={clientOptions}
        onChange={(e) => setSession({ clientId: e.target.value, portalRoute: { name: 'domu' } })}
      />
    ) : null;

  const clockControls = (
    <>
      <span className="tb__label">
        <Icon name="clock" size={14} />
        {compact ? null : simulated ? 'Testovací čas' : 'Čas'}
      </span>
      <span className="tb__now tnum" title={simulated ? 'Testovací čas kliniky' : 'Skutečný čas'}>
        {formatDayShort(now)} {formatTime(now)}
      </span>
      <Button size="sm" variant="ghost" onClick={() => shift(-1)} aria-label="Posunout čas o hodinu zpět">
        −1 h
      </Button>
      <Button size="sm" variant="ghost" onClick={() => shift(1)} aria-label="Posunout čas o hodinu dopředu">
        +1 h
      </Button>
      <Button size="sm" variant="ghost" onClick={() => run(setSimulatedNow, { value: addDays(now, 1) })} aria-label="Posunout čas o den dopředu">
        +1 den
      </Button>
      <Menu
        label="Nastavit testovací čas"
        trigger={
          <span className="tb__menu-trigger">
            <Icon name="edit" size={14} />
            {compact ? null : ' Nastavit'}
          </span>
        }
        items={[]}
        content={
          <form
            className="tb__clock-form"
            onSubmit={(e) => {
              e.preventDefault();
              applyClock();
            }}
          >
            <label htmlFor="tb-clock" className="tb__label">Datum a čas kliniky</label>
            <input id="tb-clock" type="datetime-local" step={900} value={clockInput || now} onChange={(e) => setClockInput(e.target.value)} className="tb__datetime" />
            <p className="tb__hint">Posun dopředu spustí automatiku: připomínky, docházku, propadání náhrad a nabídek. Posun zpět už provedené změny nevrací.</p>
            <Button type="submit" size="sm" variant="primary">Použít</Button>
          </form>
        }
      />
      {simulated && (
        <Button size="sm" variant="subtle" onClick={() => run(setSimulatedNow, { value: null }, { success: 'Zpět ve skutečném čase' })}>
          {compact ? 'Teď' : 'Skutečný čas'}
        </Button>
      )}
    </>
  );

  const dataControls = (
    <>
      {compact ? null : <FeedbackButton />}
      <span className={'tb__sync tb__sync--' + sync} title={syncError ?? syncLabel}>
        <span className="tb__sync-dot" aria-hidden="true" />
        {compact ? <span className="visually-hidden">{syncLabel}</span> : syncLabel}
      </span>
      <Menu
        label="Data a vzhled"
        trigger={<span className="tb__menu-trigger"><Icon name="more" size={16} /></span>}
        items={[
          { id: 'theme-system', label: 'Motiv podle systému', icon: 'refresh', onSelect: () => setSession({ theme: 'system' }) },
          { id: 'theme-light', label: 'Světlý motiv', icon: 'sun', onSelect: () => setSession({ theme: 'light' }) },
          { id: 'theme-dark', label: 'Tmavý motiv', icon: 'moon', onSelect: () => setSession({ theme: 'dark' }) },
          { id: 'demo', label: 'Znovu vygenerovat ukázková data', icon: 'repeat', onSelect: () => setConfirm('demo') },
          { id: 'wipe', label: 'Smazat všechna data', icon: 'trash', danger: true, onSelect: () => setConfirm('wipe') },
        ]}
      />
      <IconButton label="Skrýt testovací panel" icon="chevronUp" size="sm" variant="ghost" onClick={() => setSession({ testBarOpen: false })} />
    </>
  );

  return (
    <div className={'tb' + (compact ? ' tb--compact' : '')} role="region" aria-label="Testovací režim">
      {compact ? (
        <>
          <div className="tb__row">
            <span className="tb__badge">Test</span>
            {roleControl}
            {personControl}
            <FeedbackButton iconOnly />
          </div>
          <div className="tb__row">
            {clockControls}
            <span className="tb__spacer" />
            {dataControls}
          </div>
        </>
      ) : (
        <>
          <div className="tb__group tb__group--title">
            <span className="tb__badge">Test</span>
            <span className="tb__title">Zobrazit jako</span>
          </div>
          <div className="tb__group">
            {roleControl}
            {personControl}
          </div>
          <div className="tb__group tb__clock">{clockControls}</div>
          <div className="tb__group tb__data">{dataControls}</div>
        </>
      )}

      <ConfirmDialog
        open={confirm === 'demo'}
        title="Vygenerovat ukázková data znovu?"
        message="Současná data se nahradí novou simulací provozu (asi 11 týdnů). Změny, které jste provedli, se ztratí."
        confirmLabel="Vygenerovat"
        tone="primary"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void loadDemoData();
        }}
      />
      <ConfirmDialog
        open={confirm === 'wipe'}
        title="Smazat všechna data?"
        message={storage === 'artifact' ? 'Smažou se data ve sdíleném úložišti pro všechny, kdo mají odkaz. Akci nelze vrátit.' : 'Smažou se data v tomto prohlížeči. Akci nelze vrátit.'}
        confirmLabel="Smazat vše"
        tone="danger"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          void wipeAll();
        }}
      />
    </div>
  );
}

/** Jméno aktuálně zvolené testovací osoby (pro hlavičky). */
export function useTestPersonName(): string {
  const clinic = useClinic();
  const session = useSession();
  if (session.role === 'client') {
    const c = clinic.clients.find((x) => x.id === session.clientId);
    return c ? clientName(c) : 'Klient';
  }
  if (session.role === 'therapist') {
    const t = clinic.therapists.find((x) => x.id === session.therapistId);
    return therapistName(t);
  }
  return session.role === 'reception' ? 'Recepce' : 'Tereza Malá';
}

export const REAL_NOW = nowLocal;
