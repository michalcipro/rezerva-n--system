/** SQL migrace v pořadí (lokální vývojový server a testy; v Supabase se spouští `supabase db push`). */
import INIT from '../../../supabase/migrations/20261113000000_init.sql?raw';
import PLATFORM from '../../../supabase/migrations/20261115000000_platform.sql?raw';

export const MIGRATIONS: readonly string[] = [INIT, PLATFORM];
