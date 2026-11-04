import { toast } from '../../ui';

/**
 * Zkopíruje text do schránky. Když schránka není k dispozici (starší prohlížeč, artefakt bez oprávnění),
 * nic nespadne – ukáže se rada zkopírovat hodnotu ručně (hodnoty jsou v textu označitelné).
 */
export function copyToClipboard(text: string, done: string): void {
  const fallback = (): void => {
    toast.warning('Kopírování se nepodařilo', { description: 'Označte hodnotu a zkopírujte ji ručně.' });
  };
  try {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip || typeof clip.writeText !== 'function') {
      fallback();
      return;
    }
    clip.writeText(text).then(() => toast.success(done), fallback);
  } catch {
    fallback();
  }
}
