import { useState } from 'react';
import { downloadFile, downloadNotice } from '../../app/download';
import type { ClinicState } from '../../domain/types';
import { SMS_ENABLED } from '../../engine/channels';
import { toCsv } from '../../engine/importer';
import { clientName, getClient, getService, getTherapist, therapistName } from '../../engine/selectors';
import { pragueNow } from '../../engine/time';
import { useClinic } from '../../store/hooks';
import { Button, toast } from '../../ui';

/**
 * Export všech dat provozovny (přenositelnost a přechod k jinému poskytovateli – Data Act, licenční smlouva).
 * Kompletní JSON se strukturou a CSV hlavních evidencí pro Excel.
 */

const DESCRIPTION: Record<string, string> = {
  settings: 'nastavení provozovny (pravidla rezervací, storno podmínky, platby, vzhled, názvosloví, moduly, fakturační údaje)',
  categories: 'kategorie služeb',
  services: 'služby a ceník',
  rooms: 'místnosti',
  therapists: 'tým (kdo poskytuje služby) a pracovní doby',
  timeOff: 'nepřítomnosti a zavírací dny',
  groupTemplates: 'pravidelné skupinové lekce',
  cancelledSessions: 'zrušené termíny skupinových lekcí',
  packageTemplates: 'nabídka permanentek',
  clients: 'klienti (kontakty, souhlasy, poznámky)',
  bookings: 'rezervace (termín, stav, platba, storno)',
  packages: 'prodané permanentky',
  makeups: 'náhradní termíny',
  waitlist: 'čekací listina',
  ledger: 'pohyby kreditu',
  payments: 'přijaté platby',
  paymentRequests: 'QR platební výzvy',
  messages: 'odeslané a naplánované zprávy',
  templates: 'šablony automatických zpráv',
  campaigns: 'kampaně',
  audit: 'historie změn',
};

const stamp = (): string => pragueNow().replace('T', '_').replace(':', '-');

function csvFiles(s: ClinicState): { name: string; rows: (string | number)[][] }[] {
  const svc = (id: string): string => getService(s, id)?.name ?? id;
  const who = (id: string | null | undefined): string => {
    const c = id ? getClient(s, id) : undefined;
    return c ? clientName(c) : id ?? '';
  };
  // sloupec se souhlasem SMS jen se zapnutými SMS (starší souhlas je v JSON exportu a v exportu osobních údajů klienta)
  const sms = (value: string): string[] => (SMS_ENABLED ? [value] : []);
  return [
    {
      name: 'klienti',
      rows: [
        ['ID', 'Jméno', 'Příjmení', 'E-mail', 'Telefon', 'Datum narození', 'Štítky', 'Klientem od', 'Souhlas GDPR', 'Souhlas zdravotní', 'Souhlas e-mail marketing', ...sms('Souhlas SMS')],
        ...s.clients.map((c) => [
          c.id,
          c.firstName,
          c.lastName,
          c.email,
          c.phone,
          c.birthDate ?? '',
          c.tags.join(', '),
          c.createdAt,
          c.consents.gdpr?.at ?? '',
          c.consents.health?.at ?? '',
          c.consents.marketingEmail?.at ?? '',
          ...sms(c.consents.sms?.at ?? ''),
        ]),
      ],
    },
    {
      name: 'rezervace',
      rows: [
        ['ID', 'Začátek', 'Konec', 'Klient', 'Služba', 'Kdo', 'Stav', 'Cena', 'Způsob platby', 'Zaplaceno', 'Vytvořeno'],
        ...s.bookings.map((b) => {
          const t = getTherapist(s, b.therapistId);
          return [b.id, b.start, b.end, who(b.clientId), svc(b.serviceId), t ? therapistName(t) : b.therapistId, b.status, b.price, b.payment.method, b.payment.paid ? b.payment.paidAmount : 0, b.createdAt];
        }),
      ],
    },
    {
      name: 'platby',
      rows: [['ID', 'Kdy', 'Klient', 'Částka', 'Způsob', 'Účel', 'VS', 'Poznámka'], ...s.payments.map((p) => [p.id, p.at, who(p.clientId), p.amount, p.method, p.purpose, p.vs ?? '', p.note])],
    },
    {
      name: 'permanentky',
      rows: [
        ['ID', 'Klient', 'Název', 'Vstupů', 'Cena', 'Koupeno', 'Platí do', 'Zaplaceno', 'Zrušená'],
        ...s.packages.map((p) => [p.id, who(p.clientId), p.name, p.entriesTotal, p.priceCzk, p.purchasedAt, p.validUntil, p.paidBy, p.cancelled ? 'ano' : 'ne']),
      ],
    },
    {
      name: 'kredit',
      rows: [['ID', 'Kdy', 'Klient', 'Částka', 'Druh', 'Poznámka'], ...s.ledger.map((e) => [e.id, e.at, who(e.clientId), e.amount, e.kind, e.note])],
    },
  ];
}

export function ExportSection(): JSX.Element {
  const clinic = useClinic();
  const [busy, setBusy] = useState(false);

  const save = async (filename: string, data: string, mime: string): Promise<void> => {
    const r = await downloadFile(filename, data, mime);
    if (r === 'saved') toast(`Staženo: ${filename}`, { tone: 'success' });
    else {
      const notice = downloadNotice(r);
      if (notice) toast(notice, { tone: 'warning' });
    }
  };

  const exportJson = async (): Promise<void> => {
    setBusy(true);
    try {
      const doc = {
        format: 'rezervacni-platforma/export',
        verze: 1,
        exportovano: pragueNow(),
        provozovna: clinic.settings.clinicName,
        popis: DESCRIPTION,
        poznamka: 'Časy jsou místní (Europe/Prague) ve tvaru RRRR-MM-DDTHH:MM, částky v Kč. Identifikátory propojují záznamy (např. bookings[].clientId → clients[].id).',
        data: clinic,
      };
      await save(`export-${stamp()}.json`, JSON.stringify(doc, null, 2), 'application/json');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="set-brand">
      <p className="muted">
        Kompletní data provozovny ve strojově čitelné podobě – pro zálohu, účetnictví nebo přechod k jinému systému. Export obsahuje osobní údaje klientů:
        ukládejte ho bezpečně a nesdílejte.
      </p>
      <div className="set-brand__logo">
        <Button variant="primary" icon="download" loading={busy} onClick={() => void exportJson()}>
          Všechna data (JSON)
        </Button>
        {csvFiles(clinic).map((f) => (
          <Button key={f.name} variant="secondary" icon="download" onClick={() => void save(`${f.name}-${stamp()}.csv`, '﻿' + toCsv(f.rows), 'text/csv;charset=utf-8')}>
            {f.name[0].toUpperCase() + f.name.slice(1)} (CSV)
          </Button>
        ))}
      </div>
    </div>
  );
}
