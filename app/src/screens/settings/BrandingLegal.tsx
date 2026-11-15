import { useEffect, useRef, useState } from 'react';
import { contrast } from '../../app/branding';
import { Markdown } from '../../components/Markdown';
import { MAX_LEGAL_LENGTH, updateSettings } from '../../engine/commands';
import { formatDateTimeShort } from '../../engine/format';
import { useClinic, useCommand } from '../../store/hooks';
import { Button, Callout, Card, Field, Input, Segmented, Textarea } from '../../ui';

/**
 * Vzhled provozovny (barva značky, logo) a její právní texty – každá provozovna na platformě má vlastní.
 * Ukládají se samostatně (mimo koncept ostatních nastavení).
 */

const DEFAULT_ACCENT = '#0b6e6e';
const LOGO_TYPES = ['image/png', 'image/svg+xml', 'image/webp', 'image/jpeg'];
const MAX_LOGO_BYTES = 200 * 1024;

export function BrandingSection({ headingId }: { headingId: string }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const saved = clinic.settings.branding ?? { accent: null, logo: null };
  const [accent, setAccent] = useState(saved.accent ?? '');
  const [logo, setLogo] = useState<string | null>(saved.logo);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAccent(saved.accent ?? '');
    setLogo(saved.logo);
  }, [saved.accent, saved.logo]);

  const hex = /^#[0-9a-f]{6}$/i.test(accent) ? accent : null;
  const dirty = (hex ?? null) !== (saved.accent ?? null) || logo !== saved.logo;
  const weak = hex ? contrast(hex, '#ffffff') < 3 : false;

  const pickLogo = (file: File | undefined): void => {
    setError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Logo musí být obrázek PNG, SVG, WebP nebo JPEG.');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('Logo je větší než 200 kB – zmenšete ho prosím (stačí šířka kolem 400 px).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.onerror = () => setError('Soubor se nepodařilo načíst.');
    reader.readAsDataURL(file);
  };

  const save = (): void => {
    if (accent && !hex) {
      setError('Barva musí být ve tvaru #RRGGBB.');
      return;
    }
    run(updateSettings, { branding: { accent: hex, logo } }, { success: 'Vzhled uložen' });
  };

  return (
    <Card className="set-section-card">
      <div className="set-section-heading">
        <h2 id={headingId} className="set-section-heading__title" tabIndex={-1}>
          Vzhled
        </h2>
        <p className="set-section-heading__subtitle">Barva a logo provozovny – v aplikaci, klientském portálu, na přihlášení i v ikoně záložky.</p>
      </div>
      <div className="set-brand">
        <Field label="Barva značky" hint={weak ? 'Světlá barva – texty na ní budou tmavé, aby byly čitelné.' : 'Tlačítka, odkazy a zvýraznění.'}>
          <div className="set-brand__color">
            <input
              type="color"
              className="set-brand__swatch"
              value={hex ?? DEFAULT_ACCENT}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Vybrat barvu"
            />
            <Input value={accent} onValueChange={setAccent} placeholder="výchozí" className="set-brand__hex" aria-label="Barva v zápisu #RRGGBB" />
            {accent && (
              <Button size="sm" variant="ghost" onClick={() => setAccent('')}>
                Výchozí
              </Button>
            )}
          </div>
        </Field>
        <Field label="Logo" optional hint="PNG, SVG, WebP nebo JPEG do 200 kB, ideálně na průhledném pozadí. Bez loga se ukazuje název.">
          <div className="set-brand__logo">
            {logo ? <img src={logo} alt="Logo provozovny" className="set-brand__preview" /> : <span className="set-brand__none">{clinic.settings.clinicName}</span>}
            <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
            <Button size="sm" variant="secondary" icon="upload" onClick={() => fileRef.current?.click()}>
              {logo ? 'Změnit logo' : 'Nahrát logo'}
            </Button>
            {logo && (
              <Button size="sm" variant="ghost" icon="trash" onClick={() => setLogo(null)}>
                Odebrat
              </Button>
            )}
          </div>
        </Field>
        {hex && (
          <div className="set-brand__sample" style={{ ['--sample' as string]: hex }} aria-hidden="true">
            <span className="set-brand__sample-btn" style={{ color: contrast(hex, '#ffffff') >= 4.5 ? '#fff' : '#111a1c' }}>
              Rezervovat termín
            </span>
            <span className="set-brand__sample-link">Odkaz v textu</span>
          </div>
        )}
        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}
          </Callout>
        )}
        <div className="set-brand__actions">
          <Button variant="primary" icon="check" onClick={save} disabled={!dirty}>
            Uložit vzhled
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function LegalTextsSection({ headingId }: { headingId: string }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const saved = clinic.settings.legal ?? { terms: '', privacy: '', updatedAt: null };
  const [doc, setDoc] = useState<'terms' | 'privacy'>('terms');
  const [terms, setTerms] = useState(saved.terms);
  const [privacy, setPrivacy] = useState(saved.privacy);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setTerms(saved.terms);
    setPrivacy(saved.privacy);
  }, [saved.terms, saved.privacy]);

  const dirty = terms !== saved.terms || privacy !== saved.privacy;
  const value = doc === 'terms' ? terms : privacy;
  const setValue = doc === 'terms' ? setTerms : setPrivacy;

  return (
    <Card className="set-section-card">
      <div className="set-section-heading">
        <h2 id={headingId} className="set-section-heading__title" tabIndex={-1}>
          Právní texty
        </h2>
        <p className="set-section-heading__subtitle">
          Obchodní podmínky a informace o zpracování osobních údajů vaší provozovny. Klienti je uvidí při registraci, přihlášení a v účtu.
        </p>
      </div>
      <div className="set-legal">
        <Callout tone="info" icon="info">
          Vložte texty zkontrolované advokátem (šablony dodá dodavatel systému). Formátování: řádek začínající # je nadpis, - odrážka, **tučně**.
          Dokud tu text není, klienti uvidí obecnou stránku platformy.
        </Callout>
        <div className="set-legal__bar">
          <Segmented
            aria-label="Dokument"
            size="sm"
            value={doc}
            onChange={(v) => setDoc(v as 'terms' | 'privacy')}
            options={[
              { value: 'terms', label: 'Obchodní podmínky' },
              { value: 'privacy', label: 'Ochrana osobních údajů' },
            ]}
          />
          <Segmented
            aria-label="Zobrazení"
            size="sm"
            value={preview ? 'preview' : 'edit'}
            onChange={(v) => setPreview(v === 'preview')}
            options={[
              { value: 'edit', label: 'Upravit' },
              { value: 'preview', label: 'Náhled' },
            ]}
          />
        </div>
        {preview ? (
          <div className="set-legal__preview">{value.trim() ? <Markdown text={value} /> : <p className="muted">Zatím prázdné.</p>}</div>
        ) : (
          <Field label={doc === 'terms' ? 'Obchodní podmínky' : 'Informace o zpracování osobních údajů'} hint={`${value.length.toLocaleString('cs-CZ')} / ${MAX_LEGAL_LENGTH.toLocaleString('cs-CZ')} znaků`}>
            <Textarea rows={14} value={value} onValueChange={setValue} className="set-legal__text" />
          </Field>
        )}
        <div className="set-brand__actions">
          {saved.updatedAt && <span className="muted">Naposledy uloženo {formatDateTimeShort(saved.updatedAt)}</span>}
          <Button variant="primary" icon="check" disabled={!dirty} onClick={() => run(updateSettings, { legal: { terms, privacy } }, { success: 'Právní texty uloženy' })}>
            Uložit texty
          </Button>
        </div>
      </div>
    </Card>
  );
}
