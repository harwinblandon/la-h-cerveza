import {
  DISTRINES_FERMENTABLES,
  DISTRINES_FERMENTABLE_OFFERS,
  DISTRINES_HOPS,
  DISTRINES_HOP_OFFERS,
  DISTRINES_YEASTS,
  DISTRINES_YEAST_OFFERS,
} from '../data/distrines';
import { FERMENTABLES } from '../data/fermentables';
import { STORE_FERMENTABLES } from '../data/precios';
import { HOPS } from '../data/hops';
import { STYLES } from '../data/styles';
import { WATER_PROFILES } from '../data/water';
import { YEASTS } from '../data/yeasts';
import type { Available, Fermentable, Hop, StoreOffer, Style, WaterProfile, Yeast } from './types';

export interface Catalog {
  fermentables: Fermentable[];
  hops: Hop[];
  yeasts: Yeast[];
  styles: Style[];
  waters: WaterProfile[];
}

/** Agrega la oferta de una tienda a los ingredientes que ya están en el catálogo. */
function withOffers<T extends { id: string } & Available>(list: T[], offers: Record<string, StoreOffer>): T[] {
  return list.map((x) => (offers[x.id] ? { ...x, stores: [...(x.stores ?? []), offers[x.id]] } : x));
}

export const BUILTIN_CATALOG: Catalog = {
  fermentables: [...withOffers(FERMENTABLES, DISTRINES_FERMENTABLE_OFFERS), ...DISTRINES_FERMENTABLES, ...STORE_FERMENTABLES],
  hops: [...withOffers(HOPS, DISTRINES_HOP_OFFERS), ...DISTRINES_HOPS],
  yeasts: [...withOffers(YEASTS, DISTRINES_YEAST_OFFERS), ...DISTRINES_YEASTS],
  styles: STYLES,
  waters: WATER_PROFILES,
};

/** Une el catálogo integrado con los ingredientes propios (los propios reemplazan por id). */
export function mergeCatalog(custom: Partial<Catalog>): Catalog {
  const merge = <T extends { id: string }>(base: T[], extra: T[] = []) => {
    const ids = new Set(extra.map((e) => e.id));
    return [...base.filter((b) => !ids.has(b.id)), ...extra];
  };
  return {
    fermentables: merge(BUILTIN_CATALOG.fermentables, custom.fermentables),
    hops: merge(BUILTIN_CATALOG.hops, custom.hops),
    yeasts: merge(BUILTIN_CATALOG.yeasts, custom.yeasts),
    styles: STYLES,
    waters: merge(WATER_PROFILES, custom.waters),
  };
}

export const byId = <T extends { id: string }>(list: T[], id?: string) =>
  id ? list.find((x) => x.id === id) : undefined;

/** ¿Se vende en esa tienda? */
export const soldAt = (item: Available | undefined, store?: string) => !!store && !!item?.stores?.some((s) => s.store === store);

/** Ids de lo que vende una tienda (para priorizar en sustitutos y generación). */
export function storeIds(catalog: Catalog, store: string): Set<string> {
  const ids = new Set<string>();
  for (const list of [catalog.fermentables, catalog.hops, catalog.yeasts] as Available[][]) {
    for (const x of list as (Available & { id: string })[]) if (soldAt(x, store)) ids.add(x.id);
  }
  return ids;
}

/** Marcas (malterías) del catálogo, para elegir con cuáles trabaja el cervecero. */
export function maltsters(catalog: Catalog): string[] {
  const count = new Map<string, number>();
  for (const f of catalog.fermentables) {
    if (!f.maker || f.maker === 'Genérica' || !['base', 'caramelo', 'especial', 'tostada'].includes(f.type)) continue;
    count.set(f.maker, (count.get(f.maker) ?? 0) + 1);
  }
  return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([m]) => m);
}

const SYNONYMS: [RegExp, string][] = [
  [/pilsen|pilsner|pils/, 'pils'],
  [/trigo|wheat|weizen|blanc/, 'trigo'],
  [/munich|münchen|munchen/, 'munich'],
  [/viena|vienna/, 'vienna'],
  [/pale ale|pale/, 'pale'],
  [/caramunich|cara ?munich|caramel®? munich/, 'caramunich'],
  [/carapils|carafoam|cara ?pils|caramel®? pils|dextrin/, 'carapils'],
  [/caraaroma|cara aroma/, 'caraaroma'],
  [/carared|cara red|red/, 'red'],
  [/chocolate|choc/, 'chocolate'],
  [/negra|black|carafa/, 'negra'],
  [/tostad|roast/, 'tostada'],
  [/ahumad|smoked|rauch/, 'ahumada'],
  [/acid/, 'acida'],
  [/biscuit|galleta/, 'biscuit'],
  [/melanoid/, 'melanoidina'],
  [/abbey|abad/, 'abadia'],
  [/special ?b/, 'specialb'],
  [/centeno|rye|roggen/, 'centeno'],
  [/avena|oat/, 'avena'],
  [/crystal|cristal|caramel|cara/, 'caramelo'],
];
const tokens = (name: string) => {
  const n = name.toLowerCase();
  const out = new Set<string>();
  for (const [re, t] of SYNONYMS) if (re.test(n)) out.add(t);
  const roman = n.match(/(i{1,3}|1|2|3)/);
  if (roman) out.add(`#${roman[1].replace('iii', '3').replace('ii', '2').replace(/^i$/, '1')}`);
  return out;
};

/**
 * Misma malta de otra marca: mismo tipo, nombre equivalente y color parecido.
 * Si ninguna de las marcas tiene una equivalente razonable, se deja la original.
 */
export function brandEquivalent(f: Fermentable, catalog: Catalog, makers: string[]): Fermentable {
  if (!makers.length || (f.maker && makers.includes(f.maker))) return f;
  if (!['base', 'caramelo', 'especial', 'tostada'].includes(f.type)) return f;
  const ft = tokens(f.name);
  for (const maker of makers) {
    let best: Fermentable | undefined;
    let bestScore = 0;
    for (const c of catalog.fermentables) {
      if (c.maker !== maker || c.type !== f.type) continue;
      const ct = tokens(c.name);
      const shared = [...ft].filter((t) => ct.has(t) && !t.startsWith('#')).length;
      const ref = Math.max(6, f.colorEBC);
      const colorDiff = Math.abs(c.colorEBC - f.colorEBC) / ref;
      if (colorDiff > 0.5) continue;
      const numMatch = [...ft].some((t) => t.startsWith('#') && ct.has(t)) ? 0.3 : 0;
      // A igualdad, la que se consigue en una tienda.
      const score = shared * 1 + numMatch + (1 - colorDiff) + (c.stores?.length ? 0.2 : 0);
      if (shared === 0 && colorDiff > 0.25) continue;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return best;
  }
  return f;
}
