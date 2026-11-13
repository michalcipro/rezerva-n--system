/// <reference types="vitest" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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
