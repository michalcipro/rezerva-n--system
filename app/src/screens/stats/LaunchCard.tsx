import { useMemo } from 'react';
import { updateSettings } from '../../engine/commands';
import { launchChecklist, onlineOpen, type LaunchStep, type LaunchTarget } from '../../engine/launch';
import { useActor, useClinic, useCommand, useTerms } from '../../store/hooks';
import { navigate } from '../../store/session';
import { Badge, Button, Card, CardHeader, Icon, Progress, cx } from '../../ui';

/** Otevře místo, kde se krok doplní (sekce Nastavení, Služby a ceník, Tým a směny). */
function openTarget(target: LaunchTarget): void {
  if (target.screen === 'nastaveni') navigate({ name: 'nastaveni', section: target.section });
  else navigate({ name: target.screen });
}

/**
 * Přehled majitele: kontrolní seznam a spuštění online rezervací. Karta je vidět, dokud online rezervace
 * nejsou spuštěné (nová provozovna, nebo je majitel pozastavil v Nastavení → Rezervace online).
 */
export function LaunchCard(): JSX.Element | null {
  const clinic = useClinic();
  const actor = useActor();
  const run = useCommand();
  const words = useTerms();
  const steps = useMemo(() => launchChecklist(clinic), [clinic]);
  if (actor.role !== 'owner' || onlineOpen(clinic)) return null;
  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;
  const ready = done === required.length;

  return (
    <Card as="section" aria-label="Spuštění online rezervací" className="st-card st-launch">
      <CardHeader
        size="title"
        title="Spuštění online rezervací"
        subtitle={`Klienti si zatím online nerezervují – v portálu vidí „Online rezervace připravujeme“. Projděte kroky a spusťte rezervace, až bude ${words.business.nom} ${words.business.adj('připravený')}.`}
        meta={`${done} z ${required.length} hotovo`}
      />
      <Progress value={done} max={required.length} segments={required.length} label={`Hotovo ${done} z ${required.length} povinných kroků`} />
      <ol className="st-launch__steps">
        {steps.map((step) => (
          <LaunchRow key={step.id} step={step} />
        ))}
      </ol>
      <div className="st-launch__foot">
        <p className="st-muted-text">
          {ready
            ? 'Vše potřebné je připravené. Po spuštění si klienti rezervují sami; pozastavit to jde v Nastavení → Rezervace online.'
            : 'Tlačítko se zpřístupní, až budou hotové všechny povinné kroky. Personál mezitím rezervuje normálně.'}
        </p>
        <Button
          variant="primary"
          icon="play"
          disabled={!ready}
          onClick={() => run(updateSettings, { bookingRules: { onlineOpen: true } }, { success: 'Online rezervace jsou spuštěné' })}
        >
          Spustit online rezervace
        </Button>
      </div>
    </Card>
  );
}

function LaunchRow({ step }: { step: LaunchStep }): JSX.Element {
  return (
    <li className={cx('st-launch__step', step.done && 'is-done')}>
      <span className="st-launch__mark" aria-hidden="true">
        {step.done && <Icon name="check" size={14} strokeWidth={2.25} />}
      </span>
      <span className="st-launch__text">
        <span className="st-launch__title">
          {step.title}
          {step.optional && <Badge tone="neutral">nepovinné</Badge>}
          <span className="visually-hidden">{step.done ? ' – hotovo' : step.optional ? ' – zatím nenastaveno' : ' – chybí'}</span>
        </span>
        <span className="st-launch__hint">{step.hint}</span>
      </span>
      <Button size="sm" variant={step.done ? 'ghost' : 'secondary'} iconRight="arrowRight" onClick={() => openTarget(step.target)}>
        {step.done ? 'Upravit' : 'Doplnit'}
      </Button>
    </li>
  );
}
