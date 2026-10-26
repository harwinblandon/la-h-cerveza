import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../../db';
import { uid } from '../../domain/calc/units';
import { allPrices, recipeCost, type CostLine } from '../../domain/cost';
import { useSettings } from '../../hooks';
import { Info } from '../Info';
import { NumberInput, Stat, fmt } from '../ui';
import type { SectionProps } from './IngredientSections';

export const fmtCOP = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

const qtyLabel = (l: CostLine) =>
  l.unit === 'kg' ? `${fmt(l.needed, 2)} kg` : l.unit === 'g' ? `${fmt(l.needed, l.needed < 10 ? 1 : 0)} g` : l.unit === 'ml' ? `${fmt(l.needed, 1)} mL` : `${fmt(l.needed, 0)}`;

const EXTRA_PRESETS = ['Gas', 'CO₂', 'Botellas y tapas', 'Etiquetas', 'Agua'];

/** Presupuesto de la receta con los precios de las tiendas y lo que pagaste. */
export function CostTab({ recipe, update }: SectionProps) {
  const inventory = useLiveQuery(() => db.inventory.toArray(), []) ?? [];
  const settings = useSettings();
  const lists = useMemo(() => Object.values(settings.priceLists ?? {}), [settings.priceLists]);
  const prices = useMemo(() => allPrices(lists), [lists]);
  const cost = useMemo(() => recipeCost(recipe, inventory, prices, lists), [recipe, inventory, prices, lists]);
  const prefs = recipe.costPrefs ?? {};
  const setPrefs = (patch: Partial<NonNullable<typeof recipe.costPrefs>>) => update((r) => ({ ...r, costPrefs: { ...r.costPrefs, ...patch } }));
  const extras = prefs.extras ?? [];

  return (
    <>
      <div className="card">
        <div className="stats">
          <Stat label="Costo de la receta" value={fmtCOP(cost.used)} sub={`${fmt(recipe.batchSizeL)} L`} />
          <Stat label="Por litro" value={fmtCOP(cost.perLiter)} />
          <Stat label="Por botella 330 mL" value={fmtCOP(cost.per330)} />
          <Stat label="A comprar en tiendas" value={fmtCOP(cost.buy)} sub="paquetes completos" />
        </div>
        {cost.missing.length > 0 && (
          <p className="callout callout-warn" style={{ fontSize: '0.85rem', marginTop: '0.75rem' }}>
            Sin precio: {cost.missing.join(', ')}. Anota cuánto te costó en la tabla o en el Inventario.
          </p>
        )}
        <Info>
          El costo de la receta cuenta solo lo que usa (por ejemplo 30 g de un paquete de 100 g). «A comprar» suma los paquetes completos que tendrías que pagar. Se elige la tienda más
          barata para cada insumo; puedes cambiarla. Si en el Inventario anotas lo que pagaste ($/kg en maltas, $/100 g en lúpulos, $/unidad en levaduras), ese precio manda.{' '}
          {cost.sources.map((s) => `${s.store}: ${s.source}, ${s.asOf}.`).join(' ')}
        </Info>
      </div>

      <div className="card">
        <h2>Insumos</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="r">Cantidad</th>
                <th>Dónde</th>
                <th>Compra</th>
                <th className="r">Costo</th>
              </tr>
            </thead>
            <tbody>
              {cost.lines.map((l) => (
                <tr key={l.uid}>
                  <td>
                    {l.name}
                    {l.chosen?.equivalent && <div className="faint" style={{ fontSize: '0.75rem' }}>cotizado: {l.chosen.equivalent}</div>}
                    {l.fromInventory && <div className="faint" style={{ fontSize: '0.75rem' }}>del inventario: {fmtCOP(l.fromInventory.cost)}</div>}
                  </td>
                  <td className="r num">{qtyLabel(l)}</td>
                  <td>
                    {l.options.length > 0 || l.manual !== undefined ? (
                      <select
                        className="input input-sm"
                        style={{ minWidth: '15rem' }}
                        value={l.manual !== undefined ? '__manual' : l.chosen?.store ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          const manual = { ...prefs.manual };
                          const lines = { ...prefs.lines };
                          if (v === '__manual') manual[l.uid] = Math.round(l.usedCost);
                          else {
                            delete manual[l.uid];
                            lines[l.uid] = v;
                          }
                          setPrefs({ manual, lines });
                        }}
                      >
                        {l.options.map((o) => (
                          <option key={o.store} value={o.store}>
                            {o.store} · {fmtCOP(o.buyTotal)}
                            {o.outOfStock ? ' (agotado)' : ''}
                          </option>
                        ))}
                        <option value="__manual">Precio manual</option>
                      </select>
                    ) : l.missingPrice ? (
                      <span className="faint">sin precio</span>
                    ) : (
                      <span className="faint">inventario</span>
                    )}
                  </td>
                  <td className="faint" style={{ fontSize: '0.82rem' }}>
                    {l.chosen
                      ? l.chosen.packs.map((p) => (p.label === 'kg' ? `${p.count} kg × ${fmtCOP(p.price)}` : `${p.count} × ${p.label}`)).join(' + ')
                      : ''}
                  </td>
                  <td className="r num">
                    {l.missingPrice || l.manual !== undefined ? (
                      <NumberInput
                        className="input-sm"
                        value={l.manual}
                        placeholder="$"
                        decimals={0}
                        onChange={(n) => setPrefs({ manual: { ...prefs.manual, [l.uid]: n } })}
                        ariaLabel={`Costo de ${l.name}`}
                      />
                    ) : (
                      fmtCOP(l.usedCost)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Otros costos del lote</h2>
          <span className="num">{fmtCOP(cost.extras)}</span>
        </div>
        {extras.map((e) => (
          <div key={e.uid} className="row" style={{ marginBottom: '0.4rem' }}>
            <input
              className="input"
              style={{ flex: 1 }}
              value={e.name}
              onChange={(ev) => setPrefs({ extras: extras.map((x) => (x.uid === e.uid ? { ...x, name: ev.target.value } : x)) })}
            />
            <NumberInput value={e.amount} decimals={0} unit="$" onChange={(n) => setPrefs({ extras: extras.map((x) => (x.uid === e.uid ? { ...x, amount: n } : x)) })} />
            <button className="btn btn-sm btn-ghost btn-danger" onClick={() => setPrefs({ extras: extras.filter((x) => x.uid !== e.uid) })}>
              ✕
            </button>
          </div>
        ))}
        <div className="row" style={{ gap: '0.4rem' }}>
          {EXTRA_PRESETS.filter((p) => !extras.some((e) => e.name === p)).map((p) => (
            <button key={p} className="btn btn-sm" onClick={() => setPrefs({ extras: [...extras, { uid: uid(), name: p, amount: 0 }] })}>
              + {p}
            </button>
          ))}
          <button className="btn btn-sm" onClick={() => setPrefs({ extras: [...extras, { uid: uid(), name: 'Otro', amount: 0 }] })}>
            + Otro
          </button>
        </div>
      </div>
      <p className="disclaimer">
        Precios de referencia 2026, solo informativos. Pueden cambiar sin aviso y no incluyen envío: confírmalos con cada tienda antes de comprar. La H no vende ni representa a
        ninguna tienda.
      </p>
    </>
  );
}
