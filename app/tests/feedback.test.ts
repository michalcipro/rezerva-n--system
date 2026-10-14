import { describe, expect, it } from 'vitest';
import { describeContext, feedbackMailto, feedbackText, type FeedbackNote } from '../src/app/Feedback';
import { generateDemoState } from '../src/engine/seed';
import type { Session } from '../src/store/session';

const session: Session = {
  role: 'reception',
  clientId: null,
  therapistId: null,
  route: { name: 'kalendar' },
  portalRoute: { name: 'domu' },
  calendarDate: null,
  calendarView: 'week',
  calendarTherapist: 'all',
  theme: 'system',
  testBarOpen: true,
};

const notes: FeedbackNote[] = [
  { id: 'a', at: '2026-10-14T19:00:00.000Z', context: 'Kalendář (den) · Recepce', text: 'Chci vidět telefon.\nI v týdnu.' },
  { id: 'b', at: '2026-10-14T19:05:00.000Z', context: 'Statistiky · Majitelka', text: '  Tržby & storna?  ' },
];

describe('připomínky', () => {
  it('popíše obrazovku, roli, testovací čas a zařízení', () => {
    const clinic = generateDemoState('2026-10-14T09:00', { clients: 40, weeksBack: 1, daysAhead: 3 });
    expect(describeContext(session, clinic, '2026-10-14T09:00', 'počítač')).toBe(
      'Kalendář (týden) · Recepce · test. čas St 14. 10. 9:00 · počítač',
    );
    const client = clinic.clients[0];
    const portal = describeContext({ ...session, role: 'client', clientId: client.id, portalRoute: { name: 'moje' } }, clinic, '2026-10-14T09:00', 'mobil');
    expect(portal).toContain('Klientský portál – Moje termíny · klient ' + client.firstName);
    expect(describeContext(session, null, '2026-10-14T09:00', 'mobil')).toBe('Úvodní obrazovka · mobil');
  });

  it('sestaví čitelný text a mailto s CRLF', () => {
    const text = feedbackText(notes, ' Jana ', 'https://example.github.io/demo/');
    expect(text).toContain('Od: Jana\nOdkaz: https://example.github.io/demo/\n\n1. [Kalendář (den) · Recepce]\nChci vidět telefon.\nI v týdnu.');
    expect(text).toContain('2. [Statistiky · Majitelka]\nTržby & storna?\n');
    const href = feedbackMailto('recepce@example.cz', notes, text);
    expect(href.startsWith('mailto:recepce@example.cz?subject=')).toBe(true);
    expect(href).toContain('%0D%0A');
    expect(href.split('&')).toHaveLength(2); // „&“ z textu je zakódovaný
    const body = decodeURIComponent(href.split('&body=')[1]);
    expect(body).toBe(text.replace(/\n/g, '\r\n'));
    expect(feedbackMailto('', notes, text).startsWith('mailto:?subject=')).toBe(true);
  });
});
