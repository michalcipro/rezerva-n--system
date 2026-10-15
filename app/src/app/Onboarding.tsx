import { Button, Icon } from '../ui';
import { BRAND } from '../ui/brand';
import { useStore } from '../store/hooks';
import { loadDemoData, startEmpty } from '../store/store';

/** Úvodní volba, když je úložiště prázdné. */
export function Onboarding(): JSX.Element {
  const storage = useStore((s) => s.storage);
  const busy = useStore((s) => s.busy);
  return (
    <main className="onb">
      <div className="onb__inner">
        <div className="onb__brand">
          {BRAND.logo ? (
            <img className="onb__logo" src={BRAND.logo} alt={BRAND.name} />
          ) : (
            <span className="onb__wordmark">{BRAND.name}</span>
          )}
          <span className="onb__tagline">{BRAND.tagline}</span>
        </div>
        <h1 className="onb__title">Rezervační systém – testovací verze</h1>
        <p className="onb__lead">
          Vyberte, s jakými daty chcete systém vyzkoušet. Kdykoli později je můžete v testovacím panelu smazat a začít znovu.
          Co by se mělo změnit, zapisujte tlačítkem <strong>Připomínka</strong> v tmavém testovacím panelu nahoře.
        </p>
        <div className="onb__choices">
          <section className="onb__card onb__card--primary" aria-labelledby="onb-demo">
            <div className="onb__card-icon" aria-hidden="true">
              <Icon name="calendar" size={22} />
            </div>
            <h2 id="onb-demo" className="onb__card-title">Ukázkový provoz</h2>
            <p className="onb__card-text">
              Vymyšlená klinika s pěti terapeuty, 600 ukázkovými klienty a zhruba jedenácti týdny rezervací – včetně
              permanentek, kreditů, omluvenek, náhrad, pozdních storen a čekací listiny. Statistiky tak hned ukazují
              realistická čísla.
            </p>
            <Button variant="primary" size="lg" icon="play" onClick={() => void loadDemoData()} loading={!!busy}>
              Načíst ukázková data
            </Button>
          </section>
          <section className="onb__card" aria-labelledby="onb-empty">
            <div className="onb__card-icon" aria-hidden="true">
              <Icon name="plus" size={22} />
            </div>
            <h2 id="onb-empty" className="onb__card-title">Prázdná klinika</h2>
            <p className="onb__card-text">
              Jen výchozí služby, terapeuti, permanentky a storno podmínky. Klienty a rezervace si založíte sami.
            </p>
            <Button variant="secondary" size="lg" onClick={() => void startEmpty()} disabled={!!busy}>
              Začít s prázdnou klinikou
            </Button>
          </section>
        </div>
        <p className="onb__note">
          <Icon name="info" size={16} />
          {storage === 'artifact'
            ? 'Data se ukládají do sdíleného úložiště tohoto artefaktu – uvidí je každý, kdo má k odkazu přístup, a změny se projeví na všech zařízeních.'
            : 'Data se ukládají jen v tomto prohlížeči.'}{' '}
          Všechna jména a kontakty v ukázce jsou smyšlené.
        </p>
      </div>
    </main>
  );
}
