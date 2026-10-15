import { useRef, useState, type ChangeEvent } from 'react';
import type { Id } from '../../domain/types';
import { countLabel, formatFileSize, prepZ } from '../../engine/format';
import { FILE_MAX_BYTES, fileMaxBytes } from '../../store/files';
import { useCommand } from '../../store/hooks';
import { Button, toast, type ButtonSize, type ButtonVariant, type IconName } from '../../ui';
import { recordStoredBlob, storeBlob, useFileStorage } from './shared';
import './crm.css';

export interface FileUploadButtonProps {
  clientId: Id;
  /** Připojit soubory k poznámce. */
  noteId?: Id | null;
  /** Atribut accept vstupu (např. 'audio/*,.mp3,.m4a'). */
  accept?: string;
  /** Více souborů najednou (výchozí ano). */
  multiple?: boolean;
  label?: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  /** Po nahrání (id nových záznamů souborů). */
  onUploaded?: (fileIds: Id[]) => void;
}

/**
 * Tlačítko pro nahrání souborů ke klientovi: uloží obsah (storeFile) a zapíše záznam (addFileRecord).
 * Když v tomto zobrazení nelze soubory ukládat, nic nevykreslí – důvod ukazuje panel souborů.
 */
export function FileUploadButton({
  clientId,
  noteId,
  accept,
  multiple = true,
  label = 'Nahrát soubory',
  icon = 'upload',
  variant = 'secondary',
  size = 'sm',
  className,
  onUploaded,
}: FileUploadButtonProps): JSX.Element | null {
  const run = useCommand();
  const storage = useFileStorage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  if (storage.status === 'unavailable') return null;

  const onChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    // FILE_MAX_BYTES platí všude; lokálně je limit vyšší (fileMaxBytes podle úložiště).
    const max = Math.max(FILE_MAX_BYTES, fileMaxBytes());
    const tooBig = files.filter((f) => f.size > max);
    const empty = files.filter((f) => f.size === 0);
    const ok = files.filter((f) => f.size > 0 && f.size <= max);
    for (const f of tooBig) toast.error(`Soubor „${f.name}“ má ${formatFileSize(f.size)}, nahrát lze nejvýše ${formatFileSize(max)}.`);
    for (const f of empty) toast.error(`Soubor „${f.name}“ je prázdný.`);
    if (!ok.length) return;

    setProgress({ done: 0, total: ok.length });
    const ids: Id[] = [];
    const failed: string[] = [];
    for (const [i, file] of ok.entries()) {
      try {
        const stored = await storeBlob(file, file.name);
        const id = recordStoredBlob(run, { clientId, noteId }, stored);
        if (id) ids.push(id);
        else failed.push(file.name);
      } catch (err) {
        failed.push(file.name);
        toast.error(`„${file.name}“ se nepodařilo nahrát.`, { description: err instanceof Error ? err.message : undefined });
      }
      setProgress({ done: i + 1, total: ok.length });
    }
    setProgress(null);
    if (ids.length) {
      toast.success(ids.length === 1 ? 'Soubor je nahraný' : `Nahráno: ${countLabel(ids.length, ['soubor', 'soubory', 'souborů'])}`, {
        description: failed.length ? `Nenahráno: ${failed.join(', ')}` : undefined,
      });
      onUploaded?.(ids);
    }
  };

  const busy = progress !== null;
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        multiple={multiple}
        onChange={(e) => void onChange(e)}
      />
      <Button
        variant={variant}
        size={size}
        icon={icon}
        className={className}
        loading={busy || storage.status === 'checking'}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (progress.total > 1 ? `Nahrávám ${progress.done + 1} ${prepZ(progress.total)} ${progress.total}…` : 'Nahrávám…') : label}
      </Button>
      {busy && (
        <span className="visually-hidden" role="status">
          Nahrávání souborů: hotovo {progress.done} {prepZ(progress.total)} {progress.total}.
        </span>
      )}
    </>
  );
}
