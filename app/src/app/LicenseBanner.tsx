import { formatDate } from '../engine/format';
import { useStore } from '../store/hooks';
import { Icon } from '../ui';

/**
 * Upozornění na licenci provozovny (ostrý provoz). Majitel vidí podrobnosti a co dělat,
 * ostatní z týmu jen stručně; klient jen to, že online rezervace nejdou.
 */
export function LicenseBanner({ audience }: { audience: 'staff' | 'client' }): JSX.Element | null {
  const session = useStore((s) => s.session);
  const lic = session?.license;
  if (!lic || lic.state === 'ok') return null;
  const owner = session?.role === 'owner';
  let text: string | null = null;
  let danger = false;
  if (audience === 'client') {
    if (lic.state === 'readonly' || lic.state === 'blocked') {
      text = 'Online rezervace jsou teď nedostupné. Kontaktujte prosím provozovnu.';
      danger = true;
    }
  } else if (lic.state === 'expiring' && owner && lic.validUntil) {
    text = `Licence systému platí do ${formatDate(lic.validUntil)}. Prodlužte ji prosím včas u dodavatele.`;
  } else if (lic.state === 'grace') {
    danger = true;
    text = owner
      ? `Licence vypršela ${formatDate(lic.validUntil ?? '')}. Do ${formatDate(lic.graceUntil ?? '')} vše funguje, potom bude systém jen pro čtení. Kontaktujte prosím dodavatele.`
      : 'Licence systému vypršela – majitel ji musí prodloužit.';
  } else if (lic.state === 'readonly') {
    danger = true;
    text = owner
      ? 'Licence vypršela – systém je jen pro čtení. Data můžete prohlížet a exportovat; po prodloužení licence vše funguje dál.'
      : 'Systém je jen pro čtení (vypršela licence). Nové rezervace a změny teď nejdou.';
  }
  if (!text) return null;
  return (
    <div className={danger ? 'license-banner license-banner--danger' : 'license-banner'} role="status">
      <Icon name={danger ? 'alertCircle' : 'info'} size={16} />
      <span>{text}</span>
    </div>
  );
}
