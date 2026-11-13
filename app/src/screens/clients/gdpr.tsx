import { useEffect, useMemo, useState } from 'react';
import type { Client } from '../../domain/types';
import { downloadFile, downloadNotice } from '../../app/download';
import { formatDate } from '../../engine/format';
import { anonymizationCheck, anonymizeClient, anonymizedAt, clientDataExport, clientDataExportFilename, logClientDataExport } from '../../engine/gdpr';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import { Callout, Checkbox, ConfirmDialog, toast } from '../../ui';

/**
 * Stáhne export osobních údajů klienta (JSON, čl. 15 a 20 GDPR) a zapíše stažení do historie změn.
 * Zdravotní dokumentaci přidá jen roli, která ji smí vidět.
 */
export function useClientExport(client: Client, includeClinicalNotes: boolean): () => Promise<void> {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  return async () => {
    const data = clientDataExport(clinic, client.id, { now, includeClinicalNotes });
    if (!data) return;
    const result = await downloadFile(clientDataExportFilename(client, now), JSON.stringify(data, null, 2), 'application/json');
    const notice = downloadNotice(result);
    if (notice) {
      toast(notice, { tone: 'warning' });
      return;
    }
    if (result === 'saved') {
      run(logClientDataExport, { clientId: client.id }, { quiet: true });
      toast.success('Export údajů stažen', { description: 'Soubor JSON obsahuje všechny údaje, které o klientovi vedeme.' });
    }
  };
}

/** Potvrzení anonymizace: co brání, co zůstane v evidenci, výslovné „rozumím“. */
export function AnonymizeDialog({ client, open, onClose, onExport }: { client: Client; open: boolean; onClose: () => void; onExport: () => void }): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const run = useCommand();
  const [understood, setUnderstood] = useState(false);
  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);
  const check = useMemo(() => (open ? anonymizationCheck(clinic, client.id, now) : { blockers: [], notes: [] }), [open, clinic, client.id, now]);
  const blocked = check.blockers.length > 0;

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      tone="danger"
      title={`Anonymizovat klienta ${client.firstName} ${client.lastName}?`}
      message="Nevratně odstraníme jméno, e-mail, telefon, datum narození, štítky, poznámky, klinickou dokumentaci, souhlasy a texty zpráv. Rezervace, platby a pohyby kreditu zůstanou kvůli účetnictví – bez osobních údajů."
      confirmLabel="Anonymizovat"
      confirmDisabled={blocked || !understood}
      onConfirm={() => {
        const r = run(anonymizeClient, { clientId: client.id }, { success: 'Klient je anonymizovaný' });
        if (!r.ok) throw new Error(r.error);
      }}
    >
      <div className="cli-anon">
        {blocked && (
          <Callout tone="danger" title="Nejdřív je potřeba vyřešit">
            <ul className="cli-anon__list">
              {check.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Callout>
        )}
        {!blocked && check.notes.length > 0 && (
          <Callout tone="warning" title="Před anonymizací zkontrolujte" icon="alert">
            <ul className="cli-anon__list">
              {check.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Callout>
        )}
        <p className="cli-anon__export">
          Chce klient kopii svých údajů, nebo je musíte archivovat?{' '}
          <button type="button" className="link" onClick={onExport}>
            Stáhnout export údajů
          </button>{' '}
          ještě před anonymizací.
        </p>
        {!blocked && <Checkbox label="Rozumím, že anonymizaci nelze vrátit zpět" checked={understood} onChange={setUnderstood} />}
      </div>
    </ConfirmDialog>
  );
}

export function AnonymizedNotice({ client }: { client: Client }): JSX.Element {
  const at = anonymizedAt(client);
  return (
    <Callout tone="neutral" icon="userX" title="Anonymizovaný klient">
      Osobní údaje byly odstraněny{at ? ` ${formatDate(at)}` : ''} (GDPR). Rezervace, platby a pohyby kreditu zůstávají v evidenci bez vazby na osobu; nové
      rezervace ani zprávy už pro tohoto klienta nevytvářejte.
    </Callout>
  );
}
