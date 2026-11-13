/**
 * Vývojový „poskytovatel“: zprávy jen vypíše a ohlásí jako odeslané. Nic neposílá do sítě.
 */

import { normalizeCzechPhone } from './phone';
import type { Messenger, OutgoingEmail, OutgoingSms, SendResult } from './types';

export function createConsoleMessenger(log: (line: string) => void = (line) => console.log(line)): Messenger {
  let counter = 0;
  const logBody = (text: string): void => {
    for (const line of text.replace(/\r\n?/g, '\n').split('\n')) log('  ' + line);
  };

  return {
    async sendEmail(m: OutgoingEmail): Promise<SendResult> {
      const providerId = `console-${++counter}`;
      const to = m.toName ? `${m.toName} <${m.to}>` : m.to;
      const extra = [m.replyTo ? `odpověď na ${m.replyTo}` : '', m.html ? 's HTML' : ''].filter(Boolean).join(' · ');
      log(`[e-mail ${providerId}] ${to} · ${m.subject}${extra ? ' · ' + extra : ''}`);
      logBody(m.text);
      return { ok: true, providerId };
    },

    async sendSms(m: OutgoingSms): Promise<SendResult> {
      const providerId = `console-${++counter}`;
      const phone = normalizeCzechPhone(m.to);
      log(`[sms ${providerId}] ${m.to} (${phone ?? 'neplatné číslo'}) · ${m.text.length} zn.`);
      logBody(m.text);
      return { ok: true, providerId };
    },
  };
}
