import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { MemberView, StaffRole } from '../../api/protocol';
import { therapistName } from '../../engine/selectors';
import { useClinic, useStore } from '../../store/hooks';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, Dialog, EmptyState, Field, IconButton, Input, Select, Spinner, toast } from '../../ui';

/**
 * Ostrý provoz: kdo z týmu se smí přihlásit a s jakou rolí (spravuje jen majitel).
 * Přihlášení je kódem z e-mailu – stačí zadat e-mail, nic se neposílá.
 */

const ROLE_LABEL: Record<StaffRole, string> = { owner: 'Majitel', reception: 'Recepce', therapist: 'Terapeut' };
const ROLE_HINT: Record<StaffRole, string> = {
  owner: 'Vše včetně nastavení, statistik a přístupů.',
  reception: 'Kalendář, klienti, platby, komunikace. Bez statistik a nastavení.',
  therapist: 'Svůj kalendář, klienti a vstupy. Bez plateb a nastavení.',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function message(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Něco se nepovedlo. Zkuste to prosím znovu.';
}

export function StaffAccessCard(): JSX.Element {
  const clinic = useClinic();
  const me = useStore((s) => s.session?.user.id ?? null);
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<MemberView | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setMembers(await api<MemberView[]>('GET', '/members'));
      setError(null);
    } catch (e) {
      setError(message(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (m: MemberView): Promise<void> => {
    try {
      setMembers(await api<MemberView[]>('DELETE', `/members?userId=${encodeURIComponent(m.userId)}`));
      toast(`${m.displayName || m.email} se už nepřihlásí`, { tone: 'success' });
    } catch (e) {
      toast(message(e), { tone: 'danger' });
    }
  };

  const therapistOf = (id: string | null): string | null => {
    if (!id) return null;
    const t = clinic.therapists.find((x) => x.id === id);
    return t ? therapistName(t) : null;
  };

  return (
    <Card padding="none" as="section" aria-label="Přístupy do systému">
      <CardHeader
        divided
        title="Přístupy do systému"
        subtitle="Kdo z týmu se může přihlásit a co uvidí"
        actions={
          <Button size="sm" variant="secondary" icon="userPlus" onClick={() => setAdding(true)}>
            Přidat přístup
          </Button>
        }
      />
      <div className="card__body set-stack set-stack--sm">
        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}{' '}
            <Button size="sm" variant="ghost" onClick={() => void load()}>
              Zkusit znovu
            </Button>
          </Callout>
        )}
        {!members && !error && <Spinner />}
        {members && members.length === 0 && <EmptyState compact icon="users" title="Zatím nikdo" />}
        {members && members.length > 0 && (
          <ul className="set-access" aria-label="Přístupy">
            {members.map((m) => (
              <li key={m.userId} className="set-access__row">
                <div className="set-access__who">
                  <span className="set-access__name">
                    {m.displayName || m.email}
                    {m.userId === me && <span className="set-access__me"> (vy)</span>}
                  </span>
                  <span className="set-access__email">{m.email || 'e-mail neuveden'}</span>
                  {therapistOf(m.therapistId) && <span className="set-access__email">Kalendář: {therapistOf(m.therapistId)}</span>}
                </div>
                <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
                {m.userId !== me ? (
                  <IconButton icon="trash" size="sm" variant="ghost" label={`Odebrat přístup – ${m.displayName || m.email}`} onClick={() => setRemoving(m)} />
                ) : (
                  <span className="set-access__spacer" aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="set-access__note">
          Přihlášení je jednorázovým kódem z e-mailu. Po přidání dejte kolegovi vědět, ať se přihlásí svým e-mailem – pozvánku systém neposílá.
        </p>
      </div>
      {adding && (
        <AddMemberDialog
          onClose={() => setAdding(false)}
          onSaved={(list) => {
            setMembers(list);
            setAdding(false);
          }}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Odebrat přístup?"
        message={removing ? `${removing.displayName || removing.email} se už do systému nepřihlásí. Záznamy a historie zůstanou.` : undefined}
        confirmLabel="Odebrat přístup"
        tone="danger"
        onConfirm={async () => {
          if (removing) await remove(removing);
          setRemoving(null);
        }}
      />
    </Card>
  );
}

function AddMemberDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (list: MemberView[]) => void }): JSX.Element {
  const clinic = useClinic();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffRole>('reception');
  const [therapistId, setTherapistId] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const therapists = useMemo(() => clinic.therapists.filter((t) => t.active).sort((a, b) => a.order - b.order), [clinic.therapists]);

  const errors = {
    email: !EMAIL_RE.test(email.trim()) ? 'Zadejte platný e-mail.' : undefined,
    name: !name.trim() ? 'Vyplňte jméno.' : undefined,
    therapist: role === 'therapist' && !therapistId ? 'Vyberte, čí kalendář terapeut uvidí.' : undefined,
  };
  const valid = !errors.email && !errors.name && !errors.therapist;

  const pickTherapist = (id: string): void => {
    setTherapistId(id);
    const t = therapists.find((x) => x.id === id);
    if (t && !name.trim()) setName(therapistName(t));
  };

  const save = async (): Promise<void> => {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const list = await api<MemberView[]>('POST', '/members', {
        email: email.trim().toLowerCase(),
        role,
        displayName: name.trim(),
        therapistId: therapistId || null,
      });
      toast('Přístup přidán', { tone: 'success', description: `${name.trim()} se může přihlásit e-mailem ${email.trim().toLowerCase()}.` });
      onSaved(list);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Přidat přístup"
      description="Kolega se přihlásí svým e-mailem – pošleme mu jednorázový kód."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Zpět
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy}>
            Přidat přístup
          </Button>
        </>
      }
    >
      <div className="set-stack set-stack--sm">
        <Field label="Role" hint={ROLE_HINT[role]}>
          <Select
            value={role}
            onValueChange={(v) => setRole(v as StaffRole)}
            options={[
              { value: 'reception', label: ROLE_LABEL.reception },
              { value: 'therapist', label: ROLE_LABEL.therapist },
              { value: 'owner', label: ROLE_LABEL.owner },
            ]}
          />
        </Field>
        {(role === 'therapist' || role === 'owner') && (
          <Field label="Kalendář terapeuta" optional={role === 'owner'} error={touched ? errors.therapist : undefined}>
            <Select
              value={therapistId}
              placeholder="Vyberte terapeuta"
              onValueChange={pickTherapist}
              options={[...(role === 'owner' ? [{ value: '', label: 'Bez vlastního kalendáře' }] : []), ...therapists.map((t) => ({ value: t.id, label: therapistName(t) }))]}
            />
          </Field>
        )}
        <Field label="Jméno" error={touched ? errors.name : undefined}>
          <Input value={name} onValueChange={setName} autoComplete="off" />
        </Field>
        <Field label="E-mail pro přihlášení" error={touched ? errors.email : undefined}>
          <Input type="email" inputMode="email" value={email} onValueChange={setEmail} autoComplete="off" />
        </Field>
        {error && (
          <Callout tone="danger" icon="alertCircle">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
