/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'server' = ostrý provoz se serverem; jinak testovací verze s daty v prohlížeči. */
  readonly VITE_BACKEND?: string;
  /** Adresa API (výchozí /api). V Supabase: https://<projekt>.supabase.co/functions/v1/api */
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  /** Veřejný klíč projektu (anon / publishable) – smí být v prohlížeči. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** '1' = vývojové přihlášení bez e-mailu (jen lokální vývojový server). */
  readonly VITE_DEV_LOGIN?: string;
  /** Odkaz na zásady ochrany osobních údajů. */
  readonly VITE_PRIVACY_URL?: string;
  /** Odkaz na obchodní podmínky. */
  readonly VITE_TERMS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
