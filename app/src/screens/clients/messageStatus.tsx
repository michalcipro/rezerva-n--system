import type { Message, MessageStatus } from '../../domain/types';
import { MAX_DELIVERY_ATTEMPTS } from '../../engine/commands';
import { countLabel } from '../../engine/format';
import { Badge, type BadgeTone, type DotShape } from '../../ui';

/**
 * Stavy doručení zprávy: queued = čeká ve frontě na server (ostrý provoz), sent = odesláno,
 * failed = odeslání selhalo, skipped = neodesláno kvůli chybějícímu souhlasu či kontaktu.
 */
export const MESSAGE_STATUS: Record<MessageStatus, { label: string; short: string; tone: BadgeTone; dot: DotShape }> = {
  sent: { label: 'Odesláno', short: 'odesláno', tone: 'success', dot: 'circle' },
  queued: { label: 'Čeká na odeslání', short: 'čeká na odeslání', tone: 'info', dot: 'ring' },
  failed: { label: 'Neodesláno', short: 'neodesláno – chyba', tone: 'danger', dot: 'square' },
  skipped: { label: 'Neodesláno', short: 'neodesláno', tone: 'warning', dot: 'square' },
};

const metaOf = (status: MessageStatus) => MESSAGE_STATUS[status] ?? MESSAGE_STATUS.sent;

export const isUnsent = (m: Pick<Message, 'status'>): boolean => m.status === 'skipped' || m.status === 'failed';

export function MessageStatusBadge({ message }: { message: Pick<Message, 'status'> }): JSX.Element {
  const meta = metaOf(message.status);
  return (
    <Badge tone={meta.tone} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}

/** Krátký stav do souhrnů („odesláno“, „čeká na odeslání“…) a jeho barva. */
export function messageStatusShort(m: Pick<Message, 'status'>): { text: string; className?: string } {
  const meta = metaOf(m.status);
  const className = m.status === 'failed' ? 'text-danger' : m.status === 'skipped' ? 'text-warning' : m.status === 'queued' ? 'text-info' : undefined;
  return { text: meta.short, className };
}

/** Vysvětlení pod zprávou: důvod neodeslání, chyba poskytovatele nebo stav fronty. */
export function messageStatusDetail(m: Message): { text: string; tone: 'warning' | 'danger' | 'muted' } | null {
  switch (m.status) {
    case 'skipped':
      return m.skipReason ? { text: `Důvod: ${m.skipReason}`, tone: 'warning' } : null;
    case 'failed':
      return {
        text: `Chyba: ${m.error ?? 'Odeslání se nepodařilo.'}${m.attempts ? ` (${countLabel(m.attempts, ['pokus', 'pokusy', 'pokusů'])})` : ''}`,
        tone: 'danger',
      };
    case 'queued':
      return {
        text:
          m.attempts && m.error
            ? `Zatím se nepodařilo odeslat (${m.error}) – zkusíme znovu, pokus ${m.attempts + 1} z ${MAX_DELIVERY_ATTEMPTS}.`
            : 'Ve frontě – server zprávu odešle během několika minut.',
        tone: 'muted',
      };
    default:
      return null;
  }
}
