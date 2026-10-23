import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, DEFAULT_SETTINGS, type Settings } from './db';
import { byId, mergeCatalog, type Catalog } from './domain/catalog';
import { SESSION, registry, type Profile } from './profiles';
import type { SaltId, WaterProfile } from './domain/types';

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get('prefs'), []) ?? DEFAULT_SETTINGS;
}

export function useCatalog(): Catalog {
  const fermentables = useLiveQuery(() => db.fermentables.toArray(), []);
  const hops = useLiveQuery(() => db.hops.toArray(), []);
  const yeasts = useLiveQuery(() => db.yeasts.toArray(), []);
  const waters = useLiveQuery(() => db.waters.toArray(), []);
  return useMemo(() => mergeCatalog({ fermentables, hops, yeasts, waters }), [fermentables, hops, yeasts, waters]);
}

export function useEquipment() {
  return useLiveQuery(() => db.equipment.toArray(), []) ?? [];
}

/** Lo que el cervecero tiene y usa: tienda preferida, sales a mano y % AA real de sus lúpulos. */
export interface BrewPrefs {
  store?: string;
  availableSalts?: SaltId[];
  alphaOverrides: Record<string, number>;
}

export function useBrewPrefs(): BrewPrefs {
  const settings = useSettings();
  const inventory = useLiveQuery(() => db.inventory.where('kind').equals('lupulo').toArray(), []);
  return useMemo(() => {
    const alphaOverrides: Record<string, number> = {};
    for (const i of inventory ?? []) if (i.ingredientId && i.alpha && i.amount > 0) alphaOverrides[i.ingredientId] = i.alpha;
    return { store: settings.preferredStore || undefined, availableSalts: settings.availableSalts, alphaOverrides };
  }, [inventory, settings.preferredStore, settings.availableSalts]);
}

/** Perfil con la sesión abierta. */
export function useProfile(): Profile | undefined {
  return useLiveQuery(() => (SESSION ? registry.profiles.get(SESSION.profileId) : undefined), []);
}

export function useWater(catalog: Catalog, id?: string): WaterProfile | undefined {
  return byId(catalog.waters, id);
}
