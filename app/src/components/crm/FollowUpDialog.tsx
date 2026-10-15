import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { FollowUp, Id } from '../../domain/types';
import { addFollowUp, updateFollowUp } from '../../engine/commands';
import { FOLLOW_UP_TITLE_MAX } from '../../engine/crm';
import { clientName, getClient, therapistName } from '../../engine/selectors';
import { addDays, dateOf, isValidLocalDate } from '../../engine/time';
import { useActor, useClinic, useCommand, useNow } from '../../store/hooks';
import { Button, ChoiceChips, Dialog, Field, Input, Select, Textarea } from '../../ui';
import './crm.css';

interface Draft {
  clientId: Id;
  title: string;
  due: string;
  dueTime: string;
  assigneeId: string;
  note: string;
}

export interface FollowUpDialogProps {
  open: boolean;
  onClose: () => void;
  /** Klient nového follow-upu. Bez něj (a bez `followUp`) dialog nabídne výběr klienta. */
  clientId?: Id;
  /** Upravovaný follow-up (jinak se zakládá nový). */
  followUp?: FollowUp;
  /** Po uložení (id follow-upu). */
  onSaved?: (followUpId: Id) => void;
}

/** Založení nebo úprava follow-upu: co udělat, termín, volitelně čas, kdo a poznámka. */
export function FollowUpDialog({ open, onClose, clientId, followUp, onSaved }: FollowUpDialogProps): JSX.Element | null {
  const clinic = useClinic();
  const now = useNow();
  const actor = useActor();
  const run = useCommand();
  const formId = useId();
  const today = dateOf(now);

  const initial = (): Draft =>
    followUp
      ? {
          clientId: followUp.clientId,
          title: followUp.title,
          due: followUp.due,
          dueTime: followUp.dueTime ?? '',
          assigneeId: followUp.assigneeId ?? '',
          note: followUp.note,
        }
      : { clientId: clientId ?? '', title: '', due: addDays(today, 1), dueTime: '', assigneeId: actor.therapistId ?? '', note: '' };

  const [draft, setDraft] = useState<Draft>(initial);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(initial());
      setTouched(false);
    }
  }, [open, followUp?.id, clientId]);

  const pickClient = !followUp && !clientId;
  const clientOptions = useMemo(
    () =>
      pickClient
        ? [...clinic.clients]
            .sort((a, b) => a.lastName.localeCompare(b.lastName, 'cs') || a.firstName.localeCompare(b.firstName, 'cs'))
            .map((c) => ({ value: c.id, label: `${c.lastName} ${c.firstName}` }))
        : [],
    [clinic.clients, pickClient],
  );
  const therapistOptions = useMemo(
    () => [
      { value: '', label: 'Nikdo konkrétní' },
      ...[...clinic.therapists]
        .filter((t) => t.active || t.id === draft.assigneeId)
        .sort((a, b) => a.order - b.order)
        .map((t) => ({ value: t.id, label: therapistName(t) })),
    ],
    [clinic.therapists, draft.assigneeId],
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((d) => ({ ...d, [key]: value }));
  const errors = {
    clientId: draft.clientId ? undefined : 'Vyberte klienta.',
    title: !draft.title.trim() ? 'Napište, co je potřeba udělat.' : draft.title.trim().length > FOLLOW_UP_TITLE_MAX ? `Nejvýše ${FOLLOW_UP_TITLE_MAX} znaků.` : undefined,
    due: isValidLocalDate(draft.due) ? undefined : 'Zadejte termín.',
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (msg: string | undefined): string | undefined => (touched ? msg : undefined);

  const quick = [
    { value: today, label: 'Dnes' },
    { value: addDays(today, 1), label: 'Zítra' },
    { value: addDays(today, 7), label: 'Za týden' },
    { value: addDays(today, 14), label: 'Za 14 dní' },
  ];

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;
    const data = {
      title: draft.title,
      due: draft.due,
      dueTime: draft.dueTime || null,
      assigneeId: draft.assigneeId || null,
      note: draft.note,
    };
    if (followUp) {
      const r = run(updateFollowUp, { followUpId: followUp.id, patch: data }, { success: 'Follow-up je upravený' });
      if (r.ok) {
        onSaved?.(followUp.id);
        onClose();
      }
      return;
    }
    const r = run(addFollowUp, { clientId: draft.clientId, ...data }, { success: 'Follow-up je přidaný' });
    if (r.ok) {
      onSaved?.(r.value);
      onClose();
    }
  };

  const client = draft.clientId ? getClient(clinic, draft.clientId) : undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={followUp ? 'Upravit follow-up' : 'Nový follow-up'}
      description={!pickClient && client ? `Klient: ${clientName(client)}` : 'Úkol s termínem ke klientovi.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} icon="check">
            {followUp ? 'Uložit změny' : 'Přidat follow-up'}
          </Button>
        </>
      }
    >
      <form id={formId} className="crm-form" onSubmit={submit} noValidate>
        {pickClient && (
          <Field label="Klient" error={show(errors.clientId)}>
            <Select value={draft.clientId} placeholder="Vyberte klienta" options={clientOptions} onValueChange={(v) => set('clientId', v)} />
          </Field>
        )}
        <Field label="Co udělat" error={show(errors.title)}>
          <Input
            value={draft.title}
            maxLength={FOLLOW_UP_TITLE_MAX}
            placeholder="Např. zavolat po freetalku a domluvit diagnostiku"
            onValueChange={(v) => set('title', v)}
          />
        </Field>
        <div className="crm-form__row">
          <Field
            label="Termín"
            error={show(errors.due)}
            hint={!errors.due && draft.due < today ? 'Termín je v minulosti – úkol se zobrazí jako po termínu.' : undefined}
          >
            <Input type="date" value={draft.due} onValueChange={(v) => set('due', v)} />
          </Field>
          <Field label="Čas" optional>
            <Input type="time" value={draft.dueTime} step={300} onValueChange={(v) => set('dueTime', v)} />
          </Field>
        </div>
        <ChoiceChips
          aria-label="Rychlá volba termínu"
          options={quick}
          value={quick.some((q) => q.value === draft.due) ? draft.due : null}
          onChange={(v) => set('due', v)}
          className="crm-form__chips"
        />
        <Field label="Kdo se postará">
          <Select value={draft.assigneeId} options={therapistOptions} onValueChange={(v) => set('assigneeId', v)} />
        </Field>
        <Field label="Poznámka" optional>
          <Textarea rows={3} value={draft.note} onValueChange={(v) => set('note', v)} placeholder="Podrobnosti, na co nezapomenout…" />
        </Field>
      </form>
    </Dialog>
  );
}
