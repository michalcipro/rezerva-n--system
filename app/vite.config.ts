/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Režimy sestavení:
 *  - výchozí (npm run dev / build): testovací verze, data v prohlížeči, jeden HTML soubor pro artefakt
 *  - live (npm run dev:live):       aplikace proti lokálnímu vývojovému serveru (npm run dev:server)
 *  - prod (npm run build:prod):     ostrý provoz se serverem, běžné soubory pro hosting (dist-prod)
 */
const fontsFile = (selfHosted: boolean): string =>
  fileURLToPath(new URL(selfHosted ? './src/styles/fonts-selfhosted.css' : './src/styles/fonts-none.css', import.meta.url));

/**
 * Podadresář webu, ve kterém běží ostrý provoz a live (VITE_BASE, výchozí „/“), např. /rezerva-n--system/app/
 * na GitHub Pages. Aplikace z něj počítá adresy provozoven, správy platformy i statických souborů
 * (import.meta.env.BASE_URL). Testovací verze (jeden soubor) běží vždy z kořene.
 */
function appBase(raw: string | undefined): string {
  const segments = (raw ?? '').trim().split('/').filter(Boolean);
  if (segments.some((s) => s === '.' || s === '..' || !/^[A-Za-z0-9._~-]+$/.test(s)))
    throw new Error(`VITE_BASE musí být cesta na webu, např. /rezerva-n--system/app/ (zadáno „${raw}“).`);
  return segments.length ? `/${segments.join('/')}/` : '/';
}

/** V ostrém provozu bez Google Fonts – písmo se načítá z vlastního webu (žádné IP adresy návštěvníků třetím stranám). */
function selfHostedFonts(): Plugin {
  return {
    name: 'self-hosted-fonts',
    transformIndexHtml: (html) => html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, ''),
  };
}

export default defineConfig(({ mode }) => {
  const server = mode === 'prod' || mode === 'live';
  return {
    base: server ? appBase(loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), 'VITE_').VITE_BASE) : '/',
    plugins: server ? [react(), selfHostedFonts()] : [react(), viteSingleFile()],
    resolve: { alias: [{ find: /^app-fonts$/, replacement: fontsFile(server) }] },
    publicDir: server ? 'public-prod' : false,
    build: server
      ? { target: 'es2020', outDir: 'dist-prod', sourcemap: false }
      : { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100_000_000 },
    server: { proxy: { '/api': 'http://localhost:8787' } },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
