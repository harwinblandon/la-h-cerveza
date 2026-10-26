import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { LaHDb } from '../db';
import { decideRemote, REMOTE } from './middleware';

const flush = () => new Promise((r) => setTimeout(r, 30));
let n = 0;
const freshDb = async () => {
  const d = new LaHDb(`prueba-sync-${++n}`);
  await d.open();
  return d;
};

describe('sincronización: registro local de cambios', () => {
  it('los valores iniciales no quedan pendientes (no pisan lo que haya en la cuenta)', async () => {
    const d = await freshDb();
    const s = (await d.settings.get('prefs')) as unknown as Record<string, number>;
    expect(s._v).toBe(1);
    expect(s._dirty).toBe(0);
    expect(await d.equipment.where('_dirty').equals(1).count()).toBe(0);
  });

  it('sella versión y marca como pendiente cada escritura', async () => {
    const d = await freshDb();
    await d.inventory.add({ id: 'i1', kind: 'lupulo', name: 'Citra', amount: 100, unit: 'g' });
    const a = (await d.inventory.get('i1')) as unknown as Record<string, number>;
    expect(a._dirty).toBe(1);
    expect(a._v).toBeGreaterThan(1);
    await flush();
    await d.inventory.update('i1', { amount: 50 });
    const b = (await d.inventory.get('i1')) as unknown as Record<string, number>;
    expect(b._v).toBeGreaterThan(a._v);
    // También los cambios hechos con modify (como el guardado de lotes).
    await flush();
    await d.inventory.where('id').equals('i1').modify((x) => void (x.amount = 20));
    const c = (await d.inventory.get('i1')) as unknown as Record<string, number>;
    expect(c._v).toBeGreaterThan(b._v);
    expect(c._dirty).toBe(1);
  });

  it('lo que llega de la nube se escribe sin quedar pendiente', async () => {
    const d = await freshDb();
    await d.inventory.put({ id: 'i2', kind: 'lupulo', name: 'Mosaic', amount: 1, unit: 'g', _v: 123, _dirty: 0, [REMOTE]: true } as never);
    const r = (await d.inventory.get('i2')) as unknown as Record<string, unknown>;
    expect(r._v).toBe(123);
    expect(r._dirty).toBe(0);
    expect(r[REMOTE]).toBeUndefined();
  });

  it('los borrados dejan una marca para subirla', async () => {
    const d = await freshDb();
    await d.inventory.bulkAdd([
      { id: 'a', kind: 'otro', name: 'a', amount: 1, unit: 'unidad' },
      { id: 'b', kind: 'otro', name: 'b', amount: 1, unit: 'unidad' },
    ]);
    await d.inventory.delete('a');
    await d.inventory.where('kind').equals('otro').delete();
    await flush();
    expect((await d.tombstones.toArray()).map((t) => t.key).sort()).toEqual(['inventory/a', 'inventory/b']);
  });
});

describe('sincronización: conflictos', () => {
  it('gana la versión más reciente', () => {
    expect(decideRemote(undefined, { v: 5, deleted: false })).toBe('apply');
    expect(decideRemote(undefined, { v: 5, deleted: true })).toBe('ignore');
    expect(decideRemote({ v: 3, dirty: 0 }, { v: 5, deleted: false })).toBe('apply');
    expect(decideRemote({ v: 3, dirty: 1 }, { v: 5, deleted: true })).toBe('delete');
    expect(decideRemote({ v: 9, dirty: 1 }, { v: 5, deleted: false })).toBe('keep-local');
    expect(decideRemote({ v: 5, dirty: 1 }, { v: 5, deleted: false })).toBe('mark-clean');
    expect(decideRemote({ v: 5, dirty: 0 }, { v: 5, deleted: false })).toBe('ignore');
  });
});
