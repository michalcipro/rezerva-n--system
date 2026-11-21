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
  /** Název platformy (správa platformy). */
  readonly VITE_PLATFORM_NAME?: string;
  /**
   * Podadresář webu (jen ostrý provoz a live), např. /rezerva-n--system/app/ – nastavuje Vite `base`.
   * V kódu se nečte přímo: adresy se počítají z import.meta.env.BASE_URL (BASE_PATH v api/config.ts).
   */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Písmo: v ostrém provozu z vlastního webu, v testovací verzi z odkazu v index.html (viz vite.config.ts). */
declare module 'app-fonts';
