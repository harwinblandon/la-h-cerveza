// Registro local de cambios para sincronizar con la nube (basado en el de la app de entreno de Red HB).
// Cada escritura en una tabla sincronizada sella su versión (_v, en ms) y la marca como pendiente
// (_dirty = 1); cada borrado deja una marca de borrado para subirla.

import type { DBCore, DBCoreMutateRequest, DBCoreMutateResponse, DBCoreTable, Middleware } from 'dexie';

/** Tablas de un perfil que se sincronizan. */
export const SYNCED_TABLES = ['recipes', 'recipeVersions', 'batches', 'awards', 'equipment', 'waters', 'fermentables', 'hops', 'yeasts', 'inventory', 'settings'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const VERSION = '_v';
export const DIRTY = '_dirty';
/**
 * Marca transitoria en un valor escrito por la propia sincronización (datos que llegan de la nube o
 * registros que se marcan como subidos): se escribe tal cual, sin sellar versión ni marcar pendiente.
 */
export const REMOTE = '__remote';

/** Borrados que llegan de la nube: no deben generar una marca de borrado local. */
const remoteDeletes = new Set<string>();
const keyOf = (table: string, id: unknown) => `${table}/${String(id)}`;

export function markRemoteDelete(table: SyncedTable, id: string) {
  remoteDeletes.add(keyOf(table, id));
}

type TombstoneHandler = (table: SyncedTable, ids: string[]) => void;

function stamp(value: Record<string, unknown>, now: number) {
  if (value && value[REMOTE]) {
    const { [REMOTE]: _ignored, ...rest } = value;
    return rest;
  }
  return { ...value, [VERSION]: now, [DIRTY]: 1 };
}

const stampSpec = (spec: Record<string, unknown> | undefined, now: number) => (spec ? { ...spec, [VERSION]: now, [DIRTY]: 1 } : spec);

function wrapTable(name: string, table: DBCoreTable, onDelete: TombstoneHandler): DBCoreTable {
  if (!(SYNCED_TABLES as readonly string[]).includes(name)) return table;
  const synced = name as SyncedTable;
  const recordDeletes = (keys: unknown[]) => {
    const local = keys.filter((k) => !remoteDeletes.delete(keyOf(synced, k))).map(String);
    if (local.length) onDelete(synced, local);
  };
  return {
    ...table,
    async mutate(req: DBCoreMutateRequest): Promise<DBCoreMutateResponse> {
      if (req.type === 'add' || req.type === 'put') {
        const now = Date.now();
        const fromRemote = req.values.length > 0 && req.values.every((v) => v && v[REMOTE]);
        const next = {
          ...req,
          values: req.values.map((v) => stamp(v, now)),
          ...(req.type === 'put' && !fromRemote
            ? {
                changeSpec: stampSpec(req.changeSpec, now),
                updates: req.updates && { keys: req.updates.keys, changeSpecs: req.updates.changeSpecs.map((s) => stampSpec(s, now)!) },
              }
            : {}),
        } as DBCoreMutateRequest;
        return table.mutate(next);
      }
      if (req.type === 'delete') {
        const res = await table.mutate(req);
        recordDeletes(req.keys);
        return res;
      }
      if (req.type === 'deleteRange') {
        const found = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } });
        const res = await table.mutate(req);
        recordDeletes(found.result);
        return res;
      }
      return table.mutate(req);
    },
  };
}

/** Middleware de Dexie para una base de perfil; `onDelete` registra las marcas de borrado. */
export function syncMiddleware(onDelete: TombstoneHandler): Middleware<DBCore> {
  return {
    stack: 'dbcore',
    name: 'sync',
    create(down) {
      return { ...down, table: (name: string) => wrapTable(name, down.table(name), onDelete) };
    },
  };
}

/** Quita los campos internos de sincronización antes de subir o exportar un registro. */
export function stripSyncFields<T extends Record<string, unknown>>(value: T): Omit<T, '_v' | '_dirty'> {
  const { [VERSION]: _v, [DIRTY]: _d, ...rest } = value;
  return rest as Omit<T, '_v' | '_dirty'>;
}

export type RemoteDecision = 'apply' | 'delete' | 'mark-clean' | 'keep-local' | 'ignore';

/**
 * Qué hacer con un registro que llega de la nube, comparando versiones (gana la más reciente).
 * «mark-clean»: la nube ya tiene exactamente la versión local (eco de la propia subida).
 */
export function decideRemote(local: { v?: number; dirty?: number } | undefined, remote: { v: number; deleted: boolean }): RemoteDecision {
  if (!local) return remote.deleted ? 'ignore' : 'apply';
  const lv = local.v ?? 0;
  if (remote.v > lv) return remote.deleted ? 'delete' : 'apply';
  if (remote.v === lv) return local.dirty ? (remote.deleted ? 'delete' : 'mark-clean') : 'ignore';
  return 'keep-local';
}
