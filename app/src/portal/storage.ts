/**
 * Drobné pohodlí jednoho prohlížeče (localStorage) – např. kdy klient naposledy
 * otevřel zprávy. Nic důležitého; když úložiště nejde, portál funguje dál.
 */
const PREFIX = 'pohyb.portal.';

function read(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* úložiště není k dispozici */
  }
}

/** Čas poslední zprávy, kterou klient v tomto prohlížeči viděl. */
export function inboxSeen(clientId: string): string | null {
  return read('inboxSeen.' + clientId);
}

export function markInboxSeen(clientId: string, at: string): void {
  const prev = inboxSeen(clientId);
  if (!prev || at > prev) write('inboxSeen.' + clientId, at);
}
