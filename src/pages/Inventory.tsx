import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FermentablePicker, HopPicker, YeastPicker } from '../components/recipe/Pickers';
import { Empty, NumberInput, fmt } from '../components/ui';
import { db } from '../db';
import { uid } from '../domain/calc/units';
import type { InventoryItem, Recipe } from '../domain/types';
import { useCatalog } from '../hooks';

const KIND_LABEL: Record<InventoryItem['kind'], string> = { fermentable: 'Maltas y azúcares', lupulo: 'Lúpulos', levadura: 'Levaduras', otro: 'Otros' };

export default function Inventory() {
  const catalog = useCatalog();
  const items = useLiveQuery(() => db.inventory.toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const [picker, setPicker] = useState<InventoryItem['kind'] | null>(null);
  const set = (id: string, patch: Partial<InventoryItem>) => db.inventory.update(id, patch);
  const add = (it: Omit<InventoryItem, 'id'>) => db.inventory.add({ ...it, id: uid() });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inventario</h1>
          <p className="muted">Lo que tienes en la bodega. Las sugerencias de sustitutos priorizan estos ingredientes.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPicker('fermentable')}>
            + Malta
          </button>
          <button className="btn" onClick={() => setPicker('lupulo')}>
            + Lúpulo
          </button>
          <button className="btn" onClick={() => setPicker('levadura')}>
            + Levadura
          </button>
          <button className="btn" onClick={() => add({ kind: 'otro', name: 'Otro', amount: 1, unit: 'unidad' })}>
            + Otro
          </button>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="card">
          <Empty icon="inventario" title="Inventario vacío">
            <p>Registra tus maltas, lúpulos y levaduras para saber qué recetas puedes cocinar ya.</p>
          </Empty>
        </div>
      ) : (
        (['fermentable', 'lupulo', 'levadura', 'otro'] as const).map((kind) => {
          const list = items.filter((i) => i.kind === kind);
          if (!list.length) return null;
          return (
            <div key={kind} className="card">
              <h2>{KIND_LABEL[kind]}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ingrediente</th>
                      <th className="r">Cantidad</th>
                      {kind === 'lupulo' && <th className="r">% AA real</th>}
                      <th>Vence</th>
                      <th>Tienda</th>
                      <th className="r">Costo (COP)</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((i) => (
                      <tr key={i.id}>
                        <td>
                          <input className="input input-sm" value={i.name} onChange={(e) => set(i.id, { name: e.target.value })} />
                        </td>
                        <td className="r">
                          <NumberInput value={i.amount} decimals={3} onChange={(n) => set(i.id, { amount: n })} unit={i.unit} className="input-sm" />
                        </td>
                        {kind === 'lupulo' && (
                          <td className="r">
                            <NumberInput value={i.alpha} decimals={1} onChange={(n) => set(i.id, { alpha: n })} className="input-sm" />
                          </td>
                        )}
                        <td>
                          <input type="date" className="input input-sm" value={i.bestBefore ?? ''} onChange={(e) => set(i.id, { bestBefore: e.target.value })} />
                        </td>
                        <td>
                          <input className="input input-sm" value={i.store ?? ''} placeholder="Tienda" onChange={(e) => set(i.id, { store: e.target.value })} />
                        </td>
                        <td className="r">
                          <NumberInput value={i.costCOP} decimals={0} onChange={(n) => set(i.id, { costCOP: n })} className="input-sm" />
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => db.inventory.delete(i.id)}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}

      {recipes.length > 0 && items.length > 0 && <WhatCanIBrew recipes={recipes} items={items} />}

      {picker === 'fermentable' && (
        <FermentablePicker
          catalog={catalog}
          onClose={() => setPicker(null)}
          onPick={(f) => {
            add({ kind: 'fermentable', ingredientId: f.id, name: f.name, amount: 1, unit: 'kg' });
            setPicker(null);
          }}
        />
      )}
      {picker === 'lupulo' && (
        <HopPicker
          catalog={catalog}
          onClose={() => setPicker(null)}
          onPick={(h) => {
            add({ kind: 'lupulo', ingredientId: h.id, name: h.name, amount: 100, unit: 'g', alpha: h.alpha });
            setPicker(null);
          }}
        />
      )}
      {picker === 'levadura' && (
        <YeastPicker
          catalog={catalog}
          onClose={() => setPicker(null)}
          onPick={(y) => {
            add({ kind: 'levadura', ingredientId: y.id, name: y.name, amount: 1, unit: 'unidad' });
            setPicker(null);
          }}
        />
      )}
    </>
  );
}

interface Shortage {
  name: string;
  need: string;
  have: string;
}

function shortages(r: Recipe, items: InventoryItem[]): Shortage[] {
  const out: Shortage[] = [];
  const have = (id?: string) => items.filter((i) => i.ingredientId && i.ingredientId === id).reduce((s, i) => s + i.amount, 0);
  const grouped = new Map<string, { name: string; amount: number }>();
  for (const f of r.fermentables) {
    const k = f.ingredientId ?? f.name;
    grouped.set(k, { name: f.name, amount: (grouped.get(k)?.amount ?? 0) + f.amountKg });
  }
  for (const [id, g] of grouped) {
    const h = have(id);
    if (h + 1e-6 < g.amount) out.push({ name: g.name, need: `${fmt(g.amount, 2)} kg`, have: `${fmt(h, 2)} kg` });
  }
  const hops = new Map<string, { name: string; amount: number }>();
  for (const x of r.hops) {
    const k = x.ingredientId ?? x.name;
    hops.set(k, { name: x.name, amount: (hops.get(k)?.amount ?? 0) + x.amountG });
  }
  for (const [id, g] of hops) {
    const h = have(id);
    if (h + 1e-6 < g.amount) out.push({ name: g.name, need: `${fmt(g.amount, 0)} g`, have: `${fmt(h, 0)} g` });
  }
  for (const y of r.yeasts) {
    const h = have(y.ingredientId);
    if (h < y.amount) out.push({ name: y.name, need: `${y.amount} u.`, have: `${h} u.` });
  }
  return out;
}

function WhatCanIBrew({ recipes, items }: { recipes: Recipe[]; items: InventoryItem[] }) {
  const rows = recipes.map((r) => ({ r, miss: shortages(r, items) })).sort((a, b) => a.miss.length - b.miss.length);
  return (
    <div className="card">
      <h2>¿Qué puedo cocinar?</h2>
      {rows.map(({ r, miss }) => (
        <div key={r.id} className="list-item" style={{ alignItems: 'flex-start' }}>
          <span className={`badge ${miss.length === 0 ? 'badge-ok' : miss.length <= 2 ? 'badge-warn' : 'badge-bad'}`}>
            {miss.length === 0 ? 'Listo' : `Faltan ${miss.length}`}
          </span>
          <div style={{ flex: 1 }}>
            <Link to={`/recetas/${r.id}`} style={{ fontWeight: 600 }}>
              {r.name}
            </Link>
            {miss.length > 0 && (
              <div className="muted" style={{ fontSize: '0.84rem' }}>
                {miss.map((m) => `${m.name} (necesitas ${m.need}, tienes ${m.have})`).join(' · ')}
              </div>
            )}
            {miss.length > 0 && <div className="faint" style={{ fontSize: '0.8rem' }}>En la receta usa ⇄ en cada ingrediente para ver sustitutos de tu inventario.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
