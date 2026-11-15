import type { Channel } from '../domain/types';

/*
 * Kanály zpráv klientům.
 *
 * Rozhodnutí majitele platformy: s klienty se komunikuje pouze e-mailem, SMS se nepoužívají.
 * Kód pro SMS (texty šablon, fronta zpráv, poskytovatel Brevo) zůstává pro případné pozdější použití,
 * ale je vypnutý tímto přepínačem, který čte engine, aplikace i server:
 *  - engine nezařazuje zprávy kanálem SMS a nezapisuje nové souhlasy se SMS,
 *  - aplikace nenabízí souhlasy, volby, filtry ani sloupce se SMS,
 *  - server SMS, která zůstala ve frontě ze starších dat, neodešle a označí ji důvodem `SMS_OFF_REASON`.
 * Starší souhlasy se SMS zůstávají v datech a v exportu osobních údajů (historie).
 *
 * Přepínač platí pro celou platformu – není to nastavení provozovny. Kdyby se SMS znovu zapínaly,
 * projděte i texty v aplikaci a dokumenty v docs/ (mluví už jen o e-mailu) a nastavte SMS_SENDER.
 */
export const SMS_ENABLED: boolean = false;

/** Proč se SMS neposílají – důvod u neodeslané zprávy i odpověď příkazů, které by SMS vytvořily. */
export const SMS_OFF_REASON = 'SMS se nepoužívají – zprávy klientům posíláme jen e-mailem.';

/** Smí se kanálem posílat zprávy? */
export function channelEnabled(channel: Channel): boolean {
  return channel !== 'sms' || SMS_ENABLED;
}

/** Kanály šablony, kterými zprávy opravdu odcházejí (bez vypnutých SMS). */
export function activeChannels(channels: readonly Channel[]): Channel[] {
  return channels.filter(channelEnabled);
}
