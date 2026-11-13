// Supabase Edge Function „api“ – celý server rezervačního systému.
// Kód je v app/server; sem se sestaví příkazem `npm run build:edge` (soubor server.js).
// Nasazení: viz app/docs/DEPLOY.md.
import { createEdgeHandler } from './server.js';

const handler = createEdgeHandler(Deno.env.toObject());

Deno.serve(handler);
