import { useEffect, useState } from 'react';
import type { FileRecord } from '../../domain/types';
import { FILE_KIND_LABEL } from '../../engine/crm';
import { formatClockDuration, formatDate, formatFileSize, formatTime } from '../../engine/format';
import { downloadFile, fileErrorMessage, readFileText } from '../../store/files';
import { Button, Callout, Dialog, EmptyState, Icon, Spinner, toast } from '../../ui';
import { FILE_KIND_ICON, useFileUrl } from './shared';
import './crm.css';

export interface FileViewerDialogProps {
  /** Zobrazený soubor; null = dialog je zavřený. */
  file: FileRecord | null;
  onClose: () => void;
}

/** Náhled souboru: obrázek, přehrávač audia/videa, text, PDF (se stažením jako zálohou). */
export function FileViewerDialog({ file, onClose }: FileViewerDialogProps): JSX.Element | null {
  const [downloading, setDownloading] = useState(false);
  if (!file) return null;

  const download = async (): Promise<void> => {
    setDownloading(true);
    const r = await downloadFile(file, file.name);
    setDownloading(false);
    if (!r.ok && !r.cancelled) toast.error(r.reason);
  };

  const meta = [
    FILE_KIND_LABEL[file.kind],
    formatFileSize(file.size),
    file.durationSec ? formatClockDuration(file.durationSec) : null,
    `${formatDate(file.at)} ${formatTime(file.at)}`,
    file.uploadedBy || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog
      open
      onClose={onClose}
      title={<span className="crm-viewer__title">{file.name}</span>}
      description={meta}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Zavřít
          </Button>
          <Button variant="primary" icon="download" loading={downloading} onClick={() => void download()}>
            Stáhnout
          </Button>
        </>
      }
    >
      <div className="crm-viewer">
        <ViewerBody file={file} onDownload={() => void download()} />
        {file.caption && <p className="crm-viewer__caption">{file.caption}</p>}
      </div>
    </Dialog>
  );
}

function ViewerBody({ file, onDownload }: { file: FileRecord; onDownload: () => void }): JSX.Element {
  const needsUrl = file.kind === 'image' || file.kind === 'audio' || file.kind === 'video' || file.kind === 'pdf';
  const { url, error, loading } = useFileUrl(file, needsUrl);
  // Obrázek, který prohlížeč neumí dekódovat (např. HEIC z iPhonu).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  if (file.kind === 'text') return <TextViewer file={file} />;

  if (file.kind === 'other') {
    return (
      <EmptyState
        compact
        icon={FILE_KIND_ICON.other}
        title="Náhled tohoto souboru tu není k dispozici"
        text="Soubor si stáhněte a otevřete v aplikaci, která ho umí zobrazit."
        action={
          <Button size="sm" icon="download" onClick={onDownload}>
            Stáhnout soubor
          </Button>
        }
      />
    );
  }
  if (loading) {
    return (
      <div className="crm-viewer__loading">
        <Spinner size={20} label="Načítám soubor…" />
      </div>
    );
  }
  if (error || !url) {
    return (
      <Callout tone="danger" title="Soubor se nepodařilo otevřít">
        {error ?? 'Soubor se nepodařilo načíst.'}
      </Callout>
    );
  }
  switch (file.kind) {
    case 'image':
      if (brokenUrl === url) {
        return (
          <EmptyState
            compact
            icon={FILE_KIND_ICON.image}
            title="Tento obrázek prohlížeč neumí zobrazit"
            text="Formát obrázku (např. HEIC z iPhonu) tady nejde zobrazit. Soubor si stáhněte a otevřete v aplikaci, která ho umí zobrazit."
            action={
              <Button size="sm" icon="download" onClick={onDownload}>
                Stáhnout soubor
              </Button>
            }
          />
        );
      }
      return (
        <div className="crm-viewer__stage">
          <img className="crm-viewer__img" src={url} alt={file.caption || file.name} onError={() => setBrokenUrl(url)} />
        </div>
      );
    case 'audio':
      return (
        <div className="crm-viewer__audio">
          <span className="crm-viewer__audioicon" aria-hidden="true">
            <Icon name="activity" size={28} />
          </span>
          <audio className="crm-viewer__player" controls preload="metadata" src={url}>
            Prohlížeč nepřehraje tento zvukový formát – soubor si stáhněte.
          </audio>
        </div>
      );
    case 'video':
      return (
        <div className="crm-viewer__stage">
          <video className="crm-viewer__video" controls preload="metadata" src={url}>
            Prohlížeč nepřehraje tento formát videa – soubor si stáhněte.
          </video>
        </div>
      );
    default:
      return (
        <div className="crm-viewer__pdfwrap">
          <object className="crm-viewer__pdf" data={url} type="application/pdf" aria-label={`Náhled PDF ${file.name}`}>
            <EmptyState
              compact
              icon="file"
              title="Náhled PDF se tu nezobrazí"
              text="Prohlížeč neumí PDF vložit do stránky. Soubor si stáhněte a otevřete."
              action={
                <Button size="sm" icon="download" onClick={onDownload}>
                  Stáhnout PDF
                </Button>
              }
            />
          </object>
        </div>
      );
  }
}

function TextViewer({ file }: { file: FileRecord }): JSX.Element {
  const [state, setState] = useState<{ text: string | null; error: string | null }>({ text: null, error: null });
  useEffect(() => {
    let alive = true;
    setState({ text: null, error: null });
    readFileText(file).then(
      (text) => {
        if (alive) setState({ text, error: null });
      },
      (e) => {
        if (alive) setState({ text: null, error: fileErrorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [file.ref, file.storage, file.mime]);

  if (state.error) {
    return (
      <Callout tone="danger" title="Text se nepodařilo načíst">
        {state.error}
      </Callout>
    );
  }
  if (state.text === null) {
    return (
      <div className="crm-viewer__loading">
        <Spinner size={20} label="Načítám text…" />
      </div>
    );
  }
  if (!state.text.trim()) return <EmptyState compact icon="list" title="Soubor je prázdný" />;
  return (
    <pre className="crm-viewer__text" tabIndex={0} aria-label={`Obsah souboru ${file.name}`}>
      {state.text}
    </pre>
  );
}
