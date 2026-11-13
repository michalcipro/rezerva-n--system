import { createApi } from './api';
import { supabaseAuth } from './auth';
import { bankJob, deliveryJob } from './cron';
import { createBrevoMessenger } from './providers';
import { createRestStore } from './store/rest';

/**
 * Sestavení serveru z proměnných prostředí Supabase Edge Function (viz docs/DEPLOY.md).
 *
 * Automaticky dostupné v Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Vlastní tajné hodnoty (supabase secrets set …):
 *   CRON_SECRET          tajemství pro /api/cron (volá ho plánovač v databázi)
 *   ADMIN_SECRET         tajemství pro první založení kliniky (/api/admin/bootstrap), pak lze smazat
 *   ALLOWED_ORIGINS      adresy aplikace oddělené čárkou, např. https://rezervace.klinika.cz
 *   PUBLIC_API_URL       veřejná adresa API (odkazy pro odhlášení z novinek)
 *   UNSUBSCRIBE_SECRET   podpis odkazů pro odhlášení (jinak se použije CRON_SECRET)
 *   BREVO_API_KEY, MAIL_FROM, SMS_SENDER   odesílání e-mailů a SMS (bez klíče se nic neodesílá)
 *   FIO_TOKEN            párování QR plateb z účtu u Fio banky (nepovinné)
 *   APP_ANON_KEY, APP_SERVICE_KEY          nové klíče Supabase (sb_publishable_…, sb_secret_…), pokud se nepoužívají starší
 *   CLINIC_ID            klinika pro registraci klientů (jinak první založená)
 */

export type Env = Record<string, string | undefined>;

function misconfigured(message: string): (req: Request) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify({ error: 'Server není nastavený.', code: 'server_error', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

export function createEdgeHandler(env: Env): (req: Request) => Promise<Response> {
  const url = env.SUPABASE_URL;
  const anonKey = env.APP_ANON_KEY || env.SUPABASE_ANON_KEY;
  const serviceKey = env.APP_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return misconfigured('Chybí SUPABASE_URL nebo klíče projektu.');

  const log = (message: string, detail?: Record<string, unknown>): void => console.log(JSON.stringify({ message, ...detail }));
  const store = createRestStore({ url, serviceKey });
  const auth = supabaseAuth({ url, anonKey, serviceKey, store });
  const unsubscribeSecret = env.UNSUBSCRIBE_SECRET || env.CRON_SECRET;
  const cronJobs = [];
  if (env.BREVO_API_KEY && env.MAIL_FROM) {
    cronJobs.push(
      deliveryJob({
        messenger: createBrevoMessenger({
          apiKey: env.BREVO_API_KEY,
          senderEmail: env.MAIL_FROM,
          senderName: env.MAIL_FROM_NAME ?? '',
          smsSender: env.SMS_SENDER ?? '',
        }),
        publicApiUrl: env.PUBLIC_API_URL,
        unsubscribeSecret,
        log,
      }),
    );
  }
  if (env.FIO_TOKEN) cronJobs.push(bankJob({ token: env.FIO_TOKEN, log }));

  return createApi({
    store,
    auth,
    cronSecret: env.CRON_SECRET,
    adminSecret: env.ADMIN_SECRET,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
    defaultClinicId: env.CLINIC_ID || undefined,
    unsubscribeSecret,
    cronJobs,
    log,
  });
}
