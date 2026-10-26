import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_EQUIPMENT } from './data/equipment';
import type { PriceList } from './data/precios';
import { DIRTY, REMOTE, SYNCED_TABLES, VERSION, stripSyncFields, syncMiddleware, type SyncedTable } from './sync/middleware';
import type { AcidChoice, Award, Batch, Equipment, Fermentable, Hop, InventoryItem, Recipe, RecipeVersion, SaltId, WaterProfile, Yeast } from './domain/types';
import { hasUnversionedChanges, makeVersion } from './domain/versioning';
import { SESSION } from './profiles';

export interface Settings {
  id: 'prefs';
  breweryName: string;
  brewerName: string;
  defaultEquipmentId: string;
  sourceWaterId: string;
  colorUnit: 'EBC' | 'SRM';
  grainTempC: number;
  nextBatchNumber: number;
  /** Sales que el cervecero tiene a mano: el cálculo automático solo usa estas. */
  availableSalts?: SaltId[];
  /** Tienda donde suele comprar: las recetas generadas prefieren sus insumos. */
  preferredStore?: string;
  /** Marcas de malta que consigue, en orden de preferencia. */
  maltsters?: string[];
  /** Ácido para ajustar el pH. */
  acid?: AcidChoice;
  /** Listas de precios privadas que una tienda le compartió al cervecero (solo en su perfil). */
  priceLists?: Record<string, PriceList>;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'prefs',
  breweryName: '',
  brewerName: '',
  defaultEquipmentId: 'eq-biab',
  sourceWaterId: 'destilada',
  colorUnit: 'EBC',
  grainTempC: 20,
  nextBatchNumber: 1,
  availableSalts: ['yeso', 'cloruroCalcio', 'epsom', 'sal', 'bicarbonato'],
  preferredStore: undefined,
  maltsters: [],
  acid: { type: 'lactico', pct: 88 },
};

/** Marca de borrado local pendiente de subir a la nube. */
export interface Tombstone {
  key: string;
  table: SyncedTable;
  id: string;
  _v: number;
}

export class LaHDb extends Dexie {
  recipes!: EntityTable<Recipe, 'id'>;
  recipeVersions!: EntityTable<RecipeVersion, 'id'>;
  batches!: EntityTable<Batch, 'id'>;
  equipment!: EntityTable<Equipment, 'id'>;
  waters!: EntityTable<WaterProfile, 'id'>;
  fermentables!: EntityTable<Fermentable, 'id'>;
  hops!: EntityTable<Hop, 'id'>;
  yeasts!: EntityTable<Yeast, 'id'>;
  inventory!: EntityTable<InventoryItem, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  awards!: EntityTable<Award, 'id'>;
  tombstones!: EntityTable<Tombstone, 'key'>;

  constructor(name: string) {
    super(name);
    // Sella versión y «pendiente de subir» en cada escritura; los borrados dejan una marca.
    this.use(
      syncMiddleware((table, ids) => {
        const now = Date.now();
        // Fuera de la transacción del borrado (que no incluye la tabla de marcas).
        setTimeout(() => void this.tombstones.bulkPut(ids.map((id) => ({ key: `${table}/${id}`, table, id, _v: now }))), 0);
      }),
    );
    this.version(1).stores({
      recipes: 'id, name, styleId, updatedAt',
      batches: 'id, number, recipeId, status, brewDate',
      equipment: 'id, name',
      waters: 'id, name',
      fermentables: 'id, name',
      hops: 'id, name',
      yeasts: 'id, name',
      inventory: 'id, kind, ingredientId',
      settings: 'id',
    });
    // v2: versiones inmutables de receta. Cada receta existente recibe su V1.
    this.version(2)
      .stores({ recipeVersions: 'id, recipeId, [recipeId+number], createdAt' })
      .upgrade(async (tx) => {
        const recipes = (await tx.table('recipes').toArray()) as Recipe[];
        for (const r of recipes) {
          await tx.table('recipeVersions').add(makeVersion(r, 1, 'migracion', 'V1'));
          await tx.table('recipes').update(r.id, { versionCount: 1 });
        }
      });
    // v3: agua de Armenia y Distrines como valores por defecto del cervecero
    // (solo si seguía con los valores iniciales).
    this.version(3).upgrade(async (tx) => {
      const s = (await tx.table('settings').get('prefs')) as Settings | undefined;
      if (!s) return;
      await tx.table('settings').put({
        ...s,
        sourceWaterId: s.sourceWaterId === 'destilada' ? 'armenia-epa' : s.sourceWaterId,
        availableSalts: s.availableSalts ?? DEFAULT_SETTINGS.availableSalts,
        preferredStore: s.preferredStore ?? 'Distrines',
      });
    });
    // v4: premios y resultados de competencia.
    this.version(4).stores({ awards: 'id, recipeId, batchId, result, year' });
    // v5: sincronización con la cuenta. Lo existente queda pendiente de subir con versión mínima,
    // para que, si la nube ya tiene ese registro, gane la versión de la nube.
    this.version(5)
      .stores({
        recipes: 'id, name, styleId, updatedAt, _dirty',
        recipeVersions: 'id, recipeId, [recipeId+number], createdAt, _dirty',
        batches: 'id, number, recipeId, status, brewDate, _dirty',
        awards: 'id, recipeId, batchId, result, year, _dirty',
        equipment: 'id, name, _dirty',
        waters: 'id, name, _dirty',
        fermentables: 'id, name, _dirty',
        hops: 'id, name, _dirty',
        yeasts: 'id, name, _dirty',
        inventory: 'id, kind, ingredientId, _dirty',
        settings: 'id, _dirty',
        tombstones: 'key',
      })
      .upgrade(async (tx) => {
        for (const t of SYNCED_TABLES) {
          await tx
            .table(t)
            .toCollection()
            .modify((v: Record<string, unknown>) => {
              v[VERSION] = 1;
              v[DIRTY] = 1;
              v[REMOTE] = true;
            });
        }
      });
    // Valores iniciales: versión mínima y sin pendiente, para no pisar lo que ya haya en la cuenta.
    const seed = <T extends object>(x: T) => ({ ...x, [VERSION]: 1, [DIRTY]: 0, [REMOTE]: true });
    this.on('populate', (tx) => {
      tx.table('equipment').bulkAdd(DEFAULT_EQUIPMENT.map(seed));
      tx.table('settings').add(seed(DEFAULT_SETTINGS));
    });
  }
}

/**
 * Base del perfil activo. Sin sesión apunta a una base que la app no usa:
 * la pantalla de perfiles se muestra antes de cualquier consulta.
 */
export const db = new LaHDb(SESSION?.dbName ?? 'la-h-sin-sesion');

/** Prepara la base de un perfil nuevo con lo que eligió el cervecero. */
export async function initProfileDb(dbName: string, patch: Partial<Settings>, waters: WaterProfile[] = []) {
  const d = new LaHDb(dbName);
  await d.open();
  const current = (await d.settings.get('prefs')) ?? DEFAULT_SETTINGS;
  await d.settings.put({ ...current, ...patch, id: 'prefs' });
  if (waters.length) await d.waters.bulkPut(waters);
  d.close();
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('prefs')) ?? DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>) {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'prefs' });
}

export async function lastVersion(recipeId: string): Promise<RecipeVersion | undefined> {
  return db.recipeVersions.where('[recipeId+number]').between([recipeId, -Infinity], [recipeId, Infinity]).last();
}

/**
 * Congela el estado actual de la receta como nueva versión. Si no hay cambios
 * desde la última, devuelve esa misma (no duplica). Las versiones nunca se editan.
 */
export async function saveVersion(recipe: Recipe, reason: RecipeVersion['reason'], label?: string, note?: string): Promise<RecipeVersion> {
  return db.transaction('rw', db.recipes, db.recipeVersions, async () => {
    const last = await lastVersion(recipe.id);
    if (last && !hasUnversionedChanges(recipe, last) && !label && !note) return last;
    const number = (last?.number ?? 0) + 1;
    const v = makeVersion(recipe, number, reason, label, note);
    await db.recipeVersions.add(v);
    await db.recipes.put({ ...recipe, versionCount: number });
    return v;
  });
}

const TABLES = ['recipes', 'recipeVersions', 'batches', 'awards', 'equipment', 'waters', 'fermentables', 'hops', 'yeasts', 'inventory', 'settings'] as const;

export async function exportBackup(): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = (await db.table(t).toArray()).map((x: Record<string, unknown>) => stripSyncFields(x));
  return JSON.stringify({ app: 'la-h', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Restaura una copia o un historial (fusiona por id). Devuelve cuántos registros trajo cada tabla. */
export async function importBackup(json: string): Promise<{ title?: string; counts: Partial<Record<(typeof TABLES)[number], number>> }> {
  const parsed = JSON.parse(json);
  if (parsed?.app !== 'la-h' || !parsed.data) throw new Error('El archivo no es una copia de seguridad de esta app.');
  const counts: Partial<Record<(typeof TABLES)[number], number>> = {};
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      const rows = parsed.data[t];
      if (Array.isArray(rows)) {
        await db.table(t).bulkPut(rows);
        counts[t] = rows.length;
      }
    }
  });
  return { title: typeof parsed.title === 'string' ? parsed.title : undefined, counts };
}
