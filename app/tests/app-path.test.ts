import { describe, expect, it } from 'vitest';
import { BASE_PATH, basePathOf, PRIVACY_URL, staticUrl, TERMS_URL } from '../src/api/config';
import { parseAppPath } from '../src/api/tenant';

/** Adresy aplikace v kořeni domény i v podadresáři (GitHub Pages: /rezerva-n--system/app/). */

const SUB = '/rezerva-n--system/app/';

describe('rozbor adresy aplikace (parseAppPath)', () => {
  it('kořen domény: provozovna z prvního segmentu, správa platformy, bez provozovny', () => {
    expect(parseAppPath('/', '/')).toEqual({ kind: 'none' });
    expect(parseAppPath('', '/')).toEqual({ kind: 'none' });
    expect(parseAppPath('/pohyb', '/')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/pohyb/', '/')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/Pohyb/cokoli/dal', '/')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/platforma', '/')).toEqual({ kind: 'platform' });
    expect(parseAppPath('/platforma/', '/')).toEqual({ kind: 'platform' });
    // vyhrazené cesty a neplatný tvar nejsou provozovna – rozhodne server (doména, jediná provozovna)
    expect(parseAppPath('/assets/index.js', '/')).toEqual({ kind: 'none' });
    expect(parseAppPath('/app', '/')).toEqual({ kind: 'none' });
    expect(parseAppPath('/index.html', '/')).toEqual({ kind: 'none' });
    expect(parseAppPath('/%C5%A1patne', '/')).toEqual({ kind: 'none' });
  });

  it('podadresář: provozovna a správa platformy až za base, base i bez koncového lomítka', () => {
    expect(parseAppPath('/rezerva-n--system/app/', SUB)).toEqual({ kind: 'none' });
    expect(parseAppPath('/rezerva-n--system/app', SUB)).toEqual({ kind: 'none' });
    expect(parseAppPath('/rezerva-n--system/app/index.html', SUB)).toEqual({ kind: 'none' });
    expect(parseAppPath('/rezerva-n--system/app/pohyb', SUB)).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/rezerva-n--system/app/pohyb/', SUB)).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/rezerva-n--system/app/platforma', SUB)).toEqual({ kind: 'platform' });
    // „app“ je v kořeni vyhrazené, v podadresáři je to jen část base
    expect(parseAppPath('/rezerva-n--system/app/app', SUB)).toEqual({ kind: 'none' });
    // base bez koncového lomítka a jiná velikost písmen v adrese
    expect(parseAppPath('/rezerva-n--system/app/pohyb', '/rezerva-n--system/app')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/Rezerva-n--system/App/Platforma', SUB)).toEqual({ kind: 'platform' });
  });

  it('neznámá cesta mimo base je mimo aplikaci (provozovna nenalezena), i s ?provozovna=', () => {
    expect(parseAppPath('/rezerva-n--system/', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/rezerva-n--system/neco', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/rezerva-n--system/404.html', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/rezerva-n--system/application/pohyb', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/pohyb', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/platforma', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/', SUB)).toEqual({ kind: 'outside' });
    expect(parseAppPath('/rezerva-n--system/neco', SUB, '?provozovna=pohyb')).toEqual({ kind: 'outside' });
  });

  it('?provozovna= určí provozovnu, když ji cesta neurčuje (v kořeni i v podadresáři)', () => {
    expect(parseAppPath('/', '/', '?provozovna=pohyb')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/rezerva-n--system/app/', SUB, '?provozovna=pohyb')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/rezerva-n--system/app/index.html', SUB, '?x=1&provozovna=Studio-Jana')).toEqual({ kind: 'tenant', slug: 'studio-jana' });
    // cesta má přednost před parametrem
    expect(parseAppPath('/rezerva-n--system/app/pohyb', SUB, '?provozovna=jina')).toEqual({ kind: 'tenant', slug: 'pohyb' });
    expect(parseAppPath('/rezerva-n--system/app/platforma', SUB, '?provozovna=pohyb')).toEqual({ kind: 'platform' });
    // neplatná nebo vyhrazená hodnota se nepoužije
    expect(parseAppPath('/rezerva-n--system/app/', SUB, '?provozovna=%C5%A1patn%C3%A1')).toEqual({ kind: 'none' });
    expect(parseAppPath('/rezerva-n--system/app/', SUB, '?provozovna=platforma')).toEqual({ kind: 'none' });
    expect(parseAppPath('/rezerva-n--system/app/', SUB, '?provozovna=')).toEqual({ kind: 'none' });
  });
});

describe('statické soubory a právní stránky (BASE_PATH)', () => {
  it('podadresář z Vite BASE_URL; relativní base testovací verze v jednom souboru („./“) = kořen jako dřív', () => {
    expect(basePathOf('/rezerva-n--system/app/')).toBe('/rezerva-n--system/app/');
    expect(basePathOf('/rezerva-n--system/app')).toBe('/rezerva-n--system/app/');
    expect(basePathOf('/')).toBe('/');
    expect(basePathOf('./')).toBe('/');
    expect(basePathOf('')).toBe('/');
    expect(basePathOf(undefined)).toBe('/');
  });

  it('v testech běží aplikace z kořene', () => {
    expect(BASE_PATH).toBe('/');
    expect(PRIVACY_URL).toBe('/ochrana-osobnich-udaju.html');
    expect(TERMS_URL).toBe('/obchodni-podminky.html');
  });

  it('relativní i absolutní cesty dostanou base, plné adresy zůstanou', () => {
    expect(staticUrl('obchodni-podminky.html')).toBe('/obchodni-podminky.html');
    expect(staticUrl('/obchodni-podminky.html')).toBe('/obchodni-podminky.html');
    expect(staticUrl('obchodni-podminky.html', SUB)).toBe('/rezerva-n--system/app/obchodni-podminky.html');
    expect(staticUrl('/ochrana-osobnich-udaju.html', SUB)).toBe('/rezerva-n--system/app/ochrana-osobnich-udaju.html');
    expect(staticUrl('https://example.cz/podminky', SUB)).toBe('https://example.cz/podminky');
    expect(staticUrl('//cdn.example.cz/a.pdf', SUB)).toBe('//cdn.example.cz/a.pdf');
    expect(staticUrl('mailto:info@example.cz', SUB)).toBe('mailto:info@example.cz');
  });
});
