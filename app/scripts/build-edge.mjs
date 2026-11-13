// Sestaví server (app/server/edge.ts) do jednoho souboru pro Supabase Edge Function.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['server/edge.ts'],
  outfile: '../supabase/functions/api/server.js',
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  conditions: ['import', 'default'],
  legalComments: 'none',
  // knihovny čtou process.env.NODE_ENV – v Deno nemusí existovat
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: '// Vygenerováno z app/server/edge.ts příkazem `npm run build:edge` – needitujte ručně.' },
  logLevel: 'info',
});
