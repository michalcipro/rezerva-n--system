import { useEffect, useState, type ReactNode } from 'react';
import { API_URL, PRIVACY_URL, TERMS_URL } from '../api/config';
import type { LegalDocument } from '../api/protocol';
import { tenantHeaders } from '../api/tenant';
import { Markdown } from '../components/Markdown';
import { formatDate } from '../engine/format';
import { useStore } from '../store/hooks';
import { Dialog, Spinner } from '../ui';

/**
 * Obchodní podmínky a informace o zpracování osobních údajů provozovny. Má-li provozovna vlastní texty
 * (Nastavení → Právní texty), ukážou se v okně; jinak odkaz na obecnou stránku platformy.
 */

type Doc = 'terms' | 'privacy';
const TITLE: Record<Doc, string> = { terms: 'Obchodní podmínky', privacy: 'Informace o zpracování osobních údajů' };

function useLegalText(doc: Doc): string | null {
  const clinic = useStore((s) => s.clinic);
  if (!clinic?.settings.legal) return null;
  const text = doc === 'terms' ? clinic.settings.legal.terms : clinic.settings.legal.privacy;
  return text.trim() ? text : null;
}

export function LegalLink({ doc, children }: { doc: Doc; children: ReactNode }): JSX.Element {
  const tenant = useStore((s) => s.tenant);
  const fromState = useLegalText(doc);
  const [open, setOpen] = useState(false);
  const available = !!fromState || !!tenant?.legal[doc];
  if (!available) {
    return (
      <a href={doc === 'terms' ? TERMS_URL : PRIVACY_URL} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <>
      <button type="button" className="link" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <LegalDialog doc={doc} initial={fromState} onClose={() => setOpen(false)} />}
    </>
  );
}

function LegalDialog({ doc, initial, onClose }: { doc: Doc; initial: string | null; onClose: () => void }): JSX.Element {
  const [data, setData] = useState<LegalDocument | null>(initial ? { doc, title: TITLE[doc], text: initial, updatedAt: null } : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) return;
    void fetch(`${API_URL}/legal?doc=${doc}`, { headers: tenantHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setData((await r.json()) as LegalDocument);
      })
      .catch(() => setError('Dokument se nepodařilo načíst. Zkuste to prosím znovu.'));
  }, [doc, initial]);
  return (
    <Dialog open onClose={onClose} size="lg" title={TITLE[doc]} description={data?.updatedAt ? `Aktualizováno ${formatDate(data.updatedAt.slice(0, 10))}` : undefined}>
      {error ? <p>{error}</p> : data ? <Markdown text={data.text} /> : <Spinner />}
    </Dialog>
  );
}
