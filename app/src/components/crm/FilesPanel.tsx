import { useMemo, useState, type FormEvent } from 'react';
import type { FileKind, FileRecord, Id } from '../../domain/types';
import { updateFileRecord } from '../../engine/commands';
import { FILE_CAPTION_MAX, FILE_KIND_LABEL, filesOfClient, getNote, NOTE_KIND_LABEL } from '../../engine/crm';
import { countLabel, formatClockDuration, formatDayShort, formatFileSize, formatNumber } from '../../engine/format';
import { downloadFile } from '../../store/files';
import { useClinic, useCommand, useNow } from '../../store/hooks';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Field,
  Icon,
  IconButton,
  Menu,
  Select,
  Segmented,
  Spinner,
  Textarea,
  cx,
  toast,
} from '../../ui';
import { AudioRecorderDialog } from './AudioRecorder';
import { FileUploadButton } from './FileUploadButton';
import { FileViewerDialog } from './FileViewerDialog';
import { deleteFileWithData, FILE_KIND_ICON, FILE_KIND_ORDER, FILE_KIND_PLURAL, useFileStorage, useFileUrl, useMatchMedia } from './shared';
import './crm.css';

export interface FilesPanelProps {
  clientId: Id;
  /** Přejít na poznámku, ke které soubor patří (např. přepnout na kartu Poznámky). */
  onOpenNote?: (noteId: Id) => void;
  className?: string;
}

type KindFilter = 'all' | FileKind;
const PAGE = 24;

/** Soubory a fotky klienta: mřížka náhledů, přehrávání, popisky, stažení a mazání. */
export function FilesPanel({ clientId, onOpenNote, className }: FilesPanelProps): JSX.Element {
  const clinic = useClinic();
  const storage = useFileStorage();
  const compact = useMatchMedia('(max-width: 640px)');
  const files = filesOfClient(clinic, clientId);
  const [filter, setFilter] = useState<KindFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [viewing, setViewing] = useState<FileRecord | null>(null);
  const [editing, setEditing] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState<FileRecord | null>(null);
  const [recording, setRecording] = useState(false);
  const run = useCommand();

  const counts = useMemo(() => {
    const c = new Map<FileKind, number>();
    for (const f of files) c.set(f.kind, (c.get(f.kind) ?? 0) + 1);
    return c;
  }, [files]);
  const kinds = FILE_KIND_ORDER.filter((k) => counts.has(k));
  const current: KindFilter = filter !== 'all' && !counts.has(filter) ? 'all' : filter;
  const list = current === 'all' ? files : files.filter((f) => f.kind === current);
  const shown = list.slice(0, limit);
  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const options = [
    { value: 'all' as KindFilter, label: `Vše (${formatNumber(files.length)})` },
    ...kinds.map((k) => ({ value: k as KindFilter, label: `${FILE_KIND_PLURAL[k]} (${formatNumber(counts.get(k) ?? 0)})` })),
  ];
  const canUpload = storage.status !== 'unavailable';
  // Viewer drží aktuální verzi záznamu (popisek se mohl změnit).
  const viewed = viewing ? files.find((f) => f.id === viewing.id) ?? null : null;

  const actions = canUpload ? (
    <>
      <Button size="sm" variant="ghost" icon="activity" onClick={() => setRecording(true)}>
        Nahrát audio
      </Button>
      <FileUploadButton clientId={clientId} variant="secondary" label="Nahrát soubory" />
    </>
  ) : undefined;

  return (
    <Card padding="none" as="section" aria-label="Soubory a fotky" className={cx('crm-files', className)}>
      <CardHeader
        divided
        title="Soubory a fotky"
        meta={files.length ? `${countLabel(files.length, ['soubor', 'soubory', 'souborů'])} · ${formatFileSize(totalSize)}` : undefined}
        actions={actions}
      />
      {storage.status === 'unavailable' && (
        <div className="crm-files__notice">
          <Callout tone="info" title="Nahrávání není dostupné">
            {storage.reason}
          </Callout>
        </div>
      )}
      {files.length > 0 && kinds.length > 1 && (
        <div className="crm-toolbar">
          {compact ? (
            <Select aria-label="Druh souborů" size="sm" value={current} onValueChange={(v) => setFilter(v as KindFilter)} options={options} />
          ) : (
            <Segmented aria-label="Druh souborů" size="sm" value={current} onChange={setFilter} options={options} />
          )}
        </div>
      )}
      {files.length === 0 ? (
        <EmptyState
          icon="layers"
          title="Zatím žádné soubory"
          text={
            canUpload
              ? 'Nahrajte fotky, PDF, přepisy nebo audio ze sezení. Vidí je jen tým, klient ne.'
              : 'Soubory klienta se zobrazí tady, jakmile je někdo nahraje.'
          }
          action={canUpload ? <FileUploadButton clientId={clientId} variant="primary" size="md" label="Nahrát první soubor" /> : undefined}
        />
      ) : (
        <>
          <ul className="crm-files__grid">
            {shown.map((f) => (
              <FileTile
                key={f.id}
                file={f}
                onOpen={() => setViewing(f)}
                onEdit={() => setEditing(f)}
                onDelete={() => setDeleting(f)}
                onOpenNote={onOpenNote}
                canEdit={canUpload}
              />
            ))}
          </ul>
          {list.length > shown.length && (
            <div className="crm-more">
              <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Zobrazit další ({formatNumber(list.length - shown.length)})
              </Button>
            </div>
          )}
        </>
      )}

      <FileViewerDialog file={viewed} onClose={() => setViewing(null)} />
      {editing && <CaptionDialog file={editing} onClose={() => setEditing(null)} />}
      {recording && <AudioRecorderDialog open clientId={clientId} onClose={() => setRecording(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="danger"
        title="Smazat soubor?"
        message={
          deleting
            ? `Soubor „${deleting.name}“ se trvale smaže${deleting.noteId ? ' i z poznámky, ke které patří' : ''}. Tuto akci nelze vrátit.`
            : undefined
        }
        confirmLabel="Smazat soubor"
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await deleteFileWithData(run, deleting.id);
          if (!ok) throw new Error('fail');
          if (viewing?.id === deleting.id) setViewing(null);
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Dlaždice souboru                                                    */
/* ------------------------------------------------------------------ */

function FileTile({
  file: f,
  onOpen,
  onEdit,
  onDelete,
  onOpenNote,
  canEdit,
}: {
  file: FileRecord;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenNote?: (noteId: Id) => void;
  canEdit: boolean;
}): JSX.Element {
  const clinic = useClinic();
  const now = useNow();
  const [downloading, setDownloading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const note = f.noteId ? getNote(clinic, f.noteId) : undefined;
  const year = f.at.slice(0, 4) !== now.slice(0, 4) ? ' ' + f.at.slice(0, 4) : '';

  const download = async (): Promise<void> => {
    setDownloading(true);
    const r = await downloadFile(f, f.name);
    setDownloading(false);
    if (!r.ok && !r.cancelled) toast.error(r.reason);
  };

  return (
    <li className={cx('crm-tile', `crm-tile--${f.kind}`)}>
      {f.kind === 'audio' && playing ? (
        <div className="crm-tile__preview crm-tile__preview--player">
          <InlineAudio file={f} onClose={() => setPlaying(false)} />
        </div>
      ) : (
        <button
          type="button"
          className="crm-tile__preview"
          onClick={f.kind === 'audio' ? () => setPlaying(true) : onOpen}
          aria-label={f.kind === 'audio' ? `Přehrát ${f.name}` : `Otevřít ${FILE_KIND_LABEL[f.kind].toLocaleLowerCase('cs')} ${f.name}`}
        >
          <TilePreview file={f} />
        </button>
      )}
      <div className="crm-tile__body">
        <div className="crm-tile__top">
          <button type="button" className="crm-tile__name" onClick={onOpen} title={f.name}>
            {f.name}
          </button>
          <Menu
            align="end"
            label={`Akce se souborem ${f.name}`}
            trigger={<IconButton icon="more" size="sm" label={`Akce se souborem ${f.name}`} />}
            items={[
              { id: 'open', label: 'Otevřít', icon: 'eye', onSelect: onOpen },
              { id: 'download', label: downloading ? 'Stahuji…' : 'Stáhnout', icon: 'download', disabled: downloading, onSelect: () => void download() },
              ...(canEdit
                ? [
                    { id: 'caption', label: f.caption ? 'Upravit popisek' : 'Přidat popisek', icon: 'edit' as const, onSelect: onEdit },
                    { type: 'separator' as const, id: 'sep' },
                    { id: 'delete', label: 'Smazat', icon: 'trash' as const, danger: true, onSelect: onDelete },
                  ]
                : []),
            ]}
          />
        </div>
        <span className="crm-tile__meta tnum">
          {formatFileSize(f.size)}
          {f.durationSec ? ` · ${formatClockDuration(f.durationSec)}` : ''} · {formatDayShort(f.at)}
          {year}
        </span>
        {f.caption ? (
          <p className="crm-tile__caption">{f.caption}</p>
        ) : canEdit ? (
          <button type="button" className="link crm-tile__addcap" onClick={onEdit}>
            Přidat popisek
          </button>
        ) : null}
        {note && (
          <span className="crm-tile__note">
            <Icon name="link" size={12} />
            {onOpenNote ? (
              <button type="button" className="link" onClick={() => onOpenNote(note.id)}>
                {note.title || NOTE_KIND_LABEL[note.kind]}
              </button>
            ) : (
              <span className="truncate">{note.title || NOTE_KIND_LABEL[note.kind]}</span>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function TilePreview({ file: f }: { file: FileRecord }): JSX.Element {
  const isImage = f.kind === 'image';
  const { url, error, loading } = useFileUrl(f, isImage);
  // Obrázek, který prohlížeč neumí dekódovat (např. HEIC z iPhonu) – místo rozbitého obrázku ikona.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = !!url && brokenUrl === url;
  if (isImage) {
    if (url && !broken) return <img className="crm-tile__img" src={url} alt={f.caption || f.name} loading="lazy" onError={() => setBrokenUrl(url)} />;
    return (
      <span className="crm-tile__icon">
        {loading ? <Spinner size={18} /> : <Icon name={FILE_KIND_ICON.image} size={24} />}
        {broken ? (
          <span className="crm-tile__kind">{extOf(f.name) || FILE_KIND_LABEL.image} · bez náhledu</span>
        ) : (
          error && <span className="crm-tile__err">Náhled se nenačetl</span>
        )}
      </span>
    );
  }
  return (
    <span className="crm-tile__icon">
      <Icon name={f.kind === 'audio' || f.kind === 'video' ? 'play' : FILE_KIND_ICON[f.kind]} size={24} />
      <span className="crm-tile__kind">{f.kind === 'other' ? extOf(f.name) || FILE_KIND_LABEL.other : FILE_KIND_LABEL[f.kind]}</span>
    </span>
  );
}

/** Přehrávač audia přímo v dlaždici (adresa se načte až po kliknutí na Přehrát). */
function InlineAudio({ file: f, onClose }: { file: FileRecord; onClose: () => void }): JSX.Element {
  const { url, error, loading } = useFileUrl(f, true);
  return (
    <span className="crm-tile__player">
      {loading ? (
        <Spinner size={18} label="Načítám nahrávku…" />
      ) : error || !url ? (
        <span className="crm-error">{error ?? 'Nahrávku se nepodařilo načíst.'}</span>
      ) : (
        <audio controls autoPlay preload="metadata" src={url} aria-label={`Přehrávač: ${f.name}`} className="crm-tile__audio" />
      )}
      <Button size="sm" variant="ghost" icon="x" onClick={onClose}>
        Zavřít přehrávač
      </Button>
    </span>
  );
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase().slice(0, 6) : '';
}

/* ------------------------------------------------------------------ */
/* Popisek                                                             */
/* ------------------------------------------------------------------ */

function CaptionDialog({ file, onClose }: { file: FileRecord; onClose: () => void }): JSX.Element {
  const run = useCommand();
  const [caption, setCaption] = useState(file.caption);
  const formId = `crm-caption-${file.id}`;
  const tooLong = caption.trim().length > FILE_CAPTION_MAX;
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (tooLong) return;
    const r = run(updateFileRecord, { fileId: file.id, patch: { caption } }, { success: 'Popisek je uložený' });
    if (r.ok) onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Popisek souboru"
      description={file.name}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zpět
          </Button>
          <Button variant="primary" type="submit" form={formId} disabled={tooLong}>
            Uložit popisek
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="crm-form">
        <Field
          label="Popisek"
          hint={`${formatNumber(caption.trim().length)} / ${formatNumber(FILE_CAPTION_MAX)} znaků`}
          error={tooLong ? `Popisek může mít nejvýše ${formatNumber(FILE_CAPTION_MAX)} znaků.` : undefined}
        >
          <Textarea rows={3} value={caption} onValueChange={setCaption} placeholder="Např. výsledky diagnostiky, fotka z flipchartu…" />
        </Field>
      </form>
    </Dialog>
  );
}
