/**
 * Stažení souboru vytvořeného v prohlížeči. V artefaktu na claude.ai jde přes schopnost
 * `downloads` (prohlížeč artefaktů sám stahování nedovolí), jinde přes obyčejný odkaz.
 */

interface DownloadsApi {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

export type DownloadResult = 'saved' | 'declined' | 'busy' | 'unavailable';

let downloadsApi: Promise<DownloadsApi | null> | null = null;

function viewerDownloads(): Promise<DownloadsApi | null> {
  if (!downloadsApi) {
    const use = window.claude?.use;
    downloadsApi =
      typeof use === 'function'
        ? Promise.race([
            Promise.resolve(use.call(window.claude, 'downloads')).then((x) => (x as DownloadsApi | null) ?? null),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
          ]).catch(() => null)
        : Promise.resolve(null);
  }
  return downloadsApi;
}

/** Běží stránka uvnitř prohlížeče artefaktů na claude.ai? */
export const inClaudeViewer = (): boolean => typeof window !== 'undefined' && window.claude !== undefined;

export async function downloadFile(filename: string, data: string, mime: string): Promise<DownloadResult> {
  if (inClaudeViewer()) {
    const api = await viewerDownloads();
    if (!api) return 'unavailable';
    try {
      await api.save({ filename, data });
      return 'saved';
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'declined') return 'declined';
      if (code === 'rate_limited') return 'busy';
      return 'unavailable';
    }
  }
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

/** Text upozornění k výsledku stažení (null = není co hlásit). */
export function downloadNotice(result: DownloadResult): string | null {
  switch (result) {
    case 'busy':
      return 'Jedno stahování už čeká na potvrzení – zkuste to za chvíli.';
    case 'unavailable':
      return 'Stahování souborů tady není dostupné.';
    default:
      return null;
  }
}
