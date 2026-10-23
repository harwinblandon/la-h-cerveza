import {
  DISTRINES_FERMENTABLES,
  DISTRINES_FERMENTABLE_OFFERS,
  DISTRINES_HOPS,
  DISTRINES_HOP_OFFERS,
  DISTRINES_YEASTS,
  DISTRINES_YEAST_OFFERS,
} from '../data/distrines';
import { FERMENTABLES } from '../data/fermentables';
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
  fermentables: [...withOffers(FERMENTABLES, DISTRINES_FERMENTABLE_OFFERS), ...DISTRINES_FERMENTABLES],
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
