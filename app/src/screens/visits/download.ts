import { downloadBlob, type DownloadResult } from '../../store/files';

/**
 * Stažení vygenerovaného textového souboru (export CSV) přes `downloadBlob` ze store/files.ts: v artefaktu
 * capability `downloads` (uživatel stažení potvrdí v dialogu claude.ai), jinde <a download> s object URL.
 * Nevyhazuje – vrací důvod.
 */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): Promise<DownloadResult> {
  return downloadBlob(new Blob([content], { type: mime }), filename);
}
