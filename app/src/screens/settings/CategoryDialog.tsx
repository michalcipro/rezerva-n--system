import { useState } from 'react';
import type { Category } from '../../domain/types';
import { upsertCategory } from '../../engine/commands';
import { countLabel } from '../../engine/format';
import { useClinic, useCommand } from '../../store/hooks';
import { Badge, Button, Callout, Dialog, Field, Input } from '../../ui';
import { toneLabel } from './helpers';
import { TonePicker } from './shared';

export function CategoryDialog({ initial, onClose }: { initial: Category; onClose: () => void }): JSX.Element {
  const clinic = useClinic();
  const run = useCommand();
  const [name, setName] = useState(initial.name);
  const [tone, setTone] = useState(initial.tone);
  const [submitted, setSubmitted] = useState(false);
  const isNew = !initial.id;
  const trimmed = name.trim();
  const error = !trimmed ? 'Zadejte název kategorie.' : undefined;
  const duplicate = clinic.categories.some((c) => c.id !== initial.id && c.name.trim().toLowerCase() === trimmed.toLowerCase());
  const services = clinic.services.filter((s) => s.categoryId === initial.id).length;
  const dirty = isNew || trimmed !== initial.name || tone !== initial.tone;

  const save = (): void => {
    setSubmitted(true);
    if (error) {
      document.getElementById('set-cat-name')?.focus();
      return;
    }
    const r = run(upsertCategory, { ...initial, name: trimmed, tone }, { success: isNew ? `Kategorie „${trimmed}" přidána` : 'Kategorie uložena' });
    if (r.ok) onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={isNew ? 'Nová kategorie' : 'Upravit kategorii'}
      description={
        isNew
          ? 'Kategorie seskupují služby v ceníku, kalendáři i online rezervaci.'
          : `V kategorii ${services === 1 ? 'je' : services > 1 && services < 5 ? 'jsou' : 'je'} ${countLabel(services, ['služba', 'služby', 'služeb'])}.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" onClick={save} disabled={!dirty}>
            {isNew ? 'Přidat kategorii' : 'Uložit'}
          </Button>
        </>
      }
    >
      <div className="set-form set-form--tight">
        <Field label="Název" error={submitted ? error : undefined}>
          <Input
            id="set-cat-name"
            value={name}
            maxLength={40}
            placeholder="např. Koučink"
            onValueChange={setName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </Field>
        {duplicate && <Callout tone="warning" icon="alert">Kategorie se stejným názvem už existuje.</Callout>}
        <TonePicker legend="Barva v kalendáři" value={tone} onChange={setTone} hint={`Vybraná barva: ${toneLabel(tone)}`} />
        <div className="set-cat-preview" aria-hidden="true">
          <span className="set-cat-preview__label">Náhled</span>
          <Badge tone={tone} size="md">
            {trimmed || 'Název kategorie'}
          </Badge>
          <span className={`set-cat-preview__event set-tone-bg--${tone}`}>
            <strong>9:00–9:45</strong> {trimmed || 'Služba'}
          </span>
        </div>
      </div>
    </Dialog>
  );
}
