import { createApi, type CronContext } from './api';
import { supabaseAuth } from './auth';
import { decryptSecret } from './core/secrets';
import { bankJob, deliveryJob } from './cron';
import { createBrevoMessenger } from './providers';
import { createRestStore } from './store/rest';

/**
 * Sestavení serveru platformy z proměnných prostředí Supabase Edge Function (viz docs/DEPLOY.md).
 *
 * Automaticky dostupné v Supabase: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
 * Vlastní tajné hodnoty (Edge Functions → Secrets):
 *   PLATFORM_ADMIN_EMAILS  e-maily vlastníků platformy (správa provozoven a licencí), oddělené čárkou
 *   SECRETS_KEY            klíč pro šifrování tajných údajů provozoven (aspoň 32 znaků)
 *   CRON_SECRET            tajemství pro /api/cron (volá ho plánovač v databázi)
 *   ALLOWED_ORIGINS        adresy aplikace a vlastní domény provozoven, oddělené čárkou
 *   PUBLIC_API_URL         veřejná adresa API (odkazy pro odhlášení z novinek)
 *   UNSUBSCRIBE_SECRET     podpis odkazů pro odhlášení (jinak se použije CRON_SECRET)
 *   BREVO_API_KEY, MAIL_FROM, MAIL_FROM_NAME, SMS_SENDER   odesílání e-mailů a SMS
 *   APP_ANON_KEY, APP_SERVICE_KEY  nové klíče Supabase (sb_publishable_…, sb_secret_…), pokud se nepoužívají starší
 *   CLINIC_ID              provozovna pro adresu bez /<slug> (jinak jen když je na platformě jediná)
 *   FIO_TOKEN              jen pro instalaci s jedinou provozovnou – jinak se token zadává v konzoli platformy
 */

export type Env = Record<string, string | undefined>;

function misconfigured(message: string): (req: Request) => Promise<Response> {
  return async () =>
    new Response(JSON.stringify({ error: 'Server není nastavený.', code: 'server_error', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

const list = (v: string | undefined): string[] =>
  (v ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

export function createEdgeHandler(env: Env): (req: Request) => Promise<Response> {
  const url = env.SUPABASE_URL;
  const anonKey = env.APP_ANON_KEY || env.SUPABASE_ANON_KEY;
  const serviceKey = env.APP_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return misconfigured('Chybí SUPABASE_URL nebo klíče projektu.');

  const log = (message: string, detail?: Record<string, unknown>): void => console.log(JSON.stringify({ message, ...detail }));
  const store = createRestStore({ url, serviceKey });
  const auth = supabaseAuth({ url, anonKey, serviceKey, store });
  const unsubscribeSecret = env.UNSUBSCRIBE_SECRET || env.CRON_SECRET;
  const secretsKey = env.SECRETS_KEY || undefined;
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
  // párování plateb: každá provozovna má vlastní účet a token (šifrovaně v databázi)
  const tokenFor = async ({ clinicId }: CronContext): Promise<string | null> => {
    const secrets = await store.getClinicSecrets(clinicId);
    if (secrets.fio_token && secretsKey) {
      try {
        return await decryptSecret(secretsKey, secrets.fio_token);
      } catch {
        log('Token Fio provozovny nejde rozšifrovat (změněný SECRETS_KEY?)', { clinicId });
        return null;
      }
    }
    if (env.FIO_TOKEN && (await store.listClinics()).length === 1) return env.FIO_TOKEN;
    return null;
  };
  cronJobs.push(bankJob({ tokenFor, log }));

  return createApi({
    store,
    auth,
    cronSecret: env.CRON_SECRET,
    allowedOrigins: list(env.ALLOWED_ORIGINS).map((o) => o.replace(/\/$/, '')),
    defaultClinicId: env.CLINIC_ID || undefined,
    platformAdmins: list(env.PLATFORM_ADMIN_EMAILS),
    secretsKey,
    unsubscribeSecret,
    cronJobs,
    log,
  });
}
