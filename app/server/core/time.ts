import type { LocalDateTime } from '../../src/domain/types';

const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Prague',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Místní čas kliniky (Europe/Prague) ve formátu enginu 'YYYY-MM-DDTHH:mm' – server běží v UTC. */
export function pragueNow(date: Date = new Date()): LocalDateTime {
  const parts = Object.fromEntries(FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
