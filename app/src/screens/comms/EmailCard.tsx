import { useId, useMemo, useState } from 'react';
import type { CampaignBlock, Client, ClinicState, Id } from '../../domain/types';
import type { TemplateVars } from '../../engine/messages';
import { getClient } from '../../engine/selectors';
import { Button, Card, Icon, Segmented, Select } from '../../ui';
import { BlockEditor, type BlockList } from './BlockEditor';
import { cleanBlocks } from './lib';
import { EmailFrame, MarketingFooter, Paragraphs, Personalized, type Device } from './shared';

export type EditorMode = 'preview' | 'edit';

/** Vykreslení bloků kampaně tak, jak je uvidí příjemce. */
export function PreviewBlocks({ blocks, vars }: { blocks: CampaignBlock[]; vars: TemplateVars }): JSX.Element {
  const visible = cleanBlocks(blocks);
  if (!visible.length) return <p className="com-email__placeholder">Obsah e-mailu je zatím prázdný.</p>;
  return (
    <>
      {visible.map((b, i) => {
        switch (b.type) {
          case 'heading':
            return (
              <h2 key={i} className="com-email__h">
                <Personalized text={b.text} vars={vars} />
              </h2>
            );
          case 'text':
            return (
              <div key={i} className="com-email__text">
                <Paragraphs text={b.text} vars={vars} className="com-email__p" />
              </div>
            );
          case 'list':
            return (
              <ol key={i} className="com-email__list">
                {b.items.map((item, j) => {
                  const [title, ...rest] = item.split(' · ');
                  return (
                    <li key={j} className="com-email__li">
                      <span className="com-email__num" aria-hidden="true">
                        {j + 1}
                      </span>
                      <span className="com-email__li-title">
                        <Personalized text={title} vars={vars} />
                      </span>
                      {rest.length > 0 && (
                        <span className="com-email__li-detail">
                          <Personalized text={rest.join(' · ')} vars={vars} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            );
          case 'button':
            return (
              <div key={i} className="com-email__btnrow">
                <span className="com-email__btn" title={b.url.trim() ? `Odkaz: ${b.url}` : 'Bez odkazu – povede na rezervace kliniky'}>
                  {b.label}
                </span>
              </div>
            );
          default:
            return <hr key={i} className="com-email__hr" />;
        }
      })}
    </>
  );
}

interface EmailCardProps {
  clinic: ClinicState;
  subject: string;
  preheader: string;
  value: BlockList;
  onBlocksChange: (update: (prev: BlockList) => BlockList) => void;
  readOnly: boolean;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  device: Device;
  onDeviceChange: (device: Device) => void;
  recipients: Id[];
}

const DEVICE_OPTIONS = [
  { value: 'desktop' as const, label: 'Desktop', icon: 'monitor' as const },
  { value: 'mobile' as const, label: 'Mobil', icon: 'smartphone' as const },
];

/** Prostřední sloupec: náhled e-mailu (s obálkou) nebo úprava bloků. */
export function EmailCard({
  clinic,
  subject,
  preheader,
  value,
  onBlocksChange,
  readOnly,
  mode,
  onModeChange,
  device,
  onDeviceChange,
  recipients,
}: EmailCardProps): JSX.Element {
  const editing = !readOnly && mode === 'edit';
  const selectId = useId();
  const titleId = useId();
  const samples = useMemo(
    () => recipients.slice(0, 40).map((id) => getClient(clinic, id)).filter((c): c is Client => !!c),
    [recipients, clinic],
  );
  const [sampleId, setSampleId] = useState<Id>('');
  const sample = samples.find((c) => c.id === sampleId) ?? samples[0];
  const firstName = sample?.firstName ?? 'Jano';
  const bodyVars: TemplateVars = { jméno: firstName, klinika: clinic.settings.clinicName };
  const subjectVars: TemplateVars = { jméno: firstName };

  return (
    <Card padding="none" as="section" className="com-mail" aria-labelledby={titleId}>
      <div className="com-mail__bar">
        <h3 id={titleId} className="com-mail__title">
          {editing ? 'Úprava obsahu' : 'Náhled e-mailu'}
        </h3>
        <span className="spacer" />
        <Segmented size="sm" aria-label="Šířka náhledu" options={DEVICE_OPTIONS} value={device} onChange={onDeviceChange} />
        {!readOnly &&
          (editing ? (
            <Button size="sm" variant="primary" icon="check" onClick={() => onModeChange('preview')}>
              Hotovo
            </Button>
          ) : (
            <Button size="sm" icon="edit" onClick={() => onModeChange('edit')}>
              Upravit obsah
            </Button>
          ))}
      </div>

      {!editing && (
        <dl className="com-env">
          <div className="com-env__row">
            <dt>Od</dt>
            <dd>
              <span className="com-env__strong">{clinic.settings.senderName}</span>{' '}
              <span className="com-env__addr">&lt;{clinic.settings.senderEmail}&gt;</span>
            </dd>
          </div>
          <div className="com-env__row">
            <dt>
              <label htmlFor={selectId}>Komu</label>
            </dt>
            <dd>
              {samples.length > 0 ? (
                <>
                  <Select
                    id={selectId}
                    size="sm"
                    inline
                    value={sample?.id ?? ''}
                    onValueChange={setSampleId}
                    options={samples.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` }))}
                  />
                  <span className="com-env__addr">{sample?.email}</span>
                </>
              ) : (
                <span className="com-env__addr" id={selectId}>
                  Ukázkový příjemce – segmentu teď nikdo neodpovídá
                </span>
              )}
            </dd>
          </div>
          <div className="com-env__row">
            <dt>Předmět</dt>
            <dd className="com-env__subject">
              {subject.trim() ? <Personalized text={subject} vars={subjectVars} /> : <span className="com-env__missing">Bez předmětu</span>}
              {preheader.trim() && (
                <span className="com-env__pre">
                  {' – '}
                  <Personalized text={preheader} vars={subjectVars} />
                </span>
              )}
            </dd>
          </div>
        </dl>
      )}

      <div className="com-stage">
        <EmailFrame
          clinic={clinic}
          device={device}
          hero
          label={editing ? 'Upravovaný e-mail' : `Náhled e-mailu pro ${firstName}`}
          footer={<MarketingFooter clinic={clinic} />}
        >
          {editing ? <BlockEditor value={value} onChange={onBlocksChange} /> : <PreviewBlocks blocks={value.blocks} vars={bodyVars} />}
        </EmailFrame>
        {editing && (
          <p className="com-stage__note">
            <Icon name="lock" size={14} />
            Patičku s odkazem na odhlášení přidáváme ke každé kampani automaticky – nelze ji odebrat.
          </p>
        )}
      </div>
    </Card>
  );
}
