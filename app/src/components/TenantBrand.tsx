import { useStore } from '../store/hooks';

/** Logo nebo název provozovny (white-label) – v bočním panelu administrace. */
export function TenantBrand(): JSX.Element {
  const clinic = useStore((s) => s.clinic);
  const tenant = useStore((s) => s.tenant);
  const name = clinic?.settings.clinicName || tenant?.name || '';
  const tagline = clinic?.settings.clinicTagline ?? tenant?.tagline ?? '';
  const logo = clinic?.settings.branding?.logo ?? tenant?.branding.logo ?? null;
  return (
    <div className="shell__brand tbrand">
      {logo ? (
        <img src={logo} alt={name} className="tbrand__logo" />
      ) : (
        <span className="wordmark">
          {name}
          <span className="wordmark__dot">.</span>
        </span>
      )}
      {tagline && <span className="shell__tagline">{tagline}</span>}
    </div>
  );
}
