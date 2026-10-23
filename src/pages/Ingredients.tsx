import { useState } from 'react';
import { Field, Modal, NumberInput, Tabs, fmt } from '../components/ui';
import { FERMENTABLE_TYPE_LABEL } from '../data/fermentables';
import { AROMA_LABEL } from '../data/hops';
import { YEAST_FAMILY_LABEL, YEAST_TYPE_LABEL } from '../data/yeasts';
import { db } from '../db';
import { srmToHex } from '../domain/calc/color';
import { ebcToSrm, uid } from '../domain/calc/units';
import type { Fermentable, FermentableType, Hop, Yeast, YeastType } from '../domain/types';
import { useCatalog } from '../hooks';
import { SourceTag } from '../components/Provenance';
import { StoreChip } from '../components/recipe/Pickers';

type Tab = 'maltas' | 'lupulos' | 'levaduras';

export default function Ingredients() {
  const catalog = useCatalog();
  const [tab, setTab] = useState<Tab>('maltas');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ kind: Tab; item?: Fermentable | Hop | Yeast } | null>(null);
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ingredientes</h1>
          <p className="muted">Catálogo de maltas, lúpulos y levaduras. Agrega los tuyos o corrige valores con la ficha técnica de tu compra.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ kind: tab })}>
          + Agregar propio
        </button>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          ['maltas', `Maltas y azúcares (${catalog.fermentables.length})`],
          ['lupulos', `Lúpulos (${catalog.hops.length})`],
          ['levaduras', `Levaduras (${catalog.yeasts.length})`],
        ]}
      />
      <div className="card">
        <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: '0.5rem' }} />
        <div className="table-wrap">
          {tab === 'maltas' && (
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th className="r">EBC</th>
                  <th className="r">PPG</th>
                  <th className="r">Máx.</th>
                  <th>Uso</th>
                </tr>
              </thead>
              <tbody>
                {catalog.fermentables
                  .filter((f) => match(`${f.name} ${f.maker} ${f.description}`))
                  .map((f) => (
                    <tr key={f.id} onClick={() => setEditing({ kind: 'maltas', item: f })} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="swatch" style={{ background: srmToHex(ebcToSrm(f.colorEBC)), width: 16, height: 22, display: 'inline-block' }} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {f.name} <SourceTag source={f.source} note={f.sourceNote} compact /> <StoreChip item={f} />
                        </div>
                        <div className="faint" style={{ fontSize: '0.78rem' }}>
                          {f.maker}
                        </div>
                      </td>
                      <td>{FERMENTABLE_TYPE_LABEL[f.type]}</td>
                      <td className="r num">{f.colorEBC}</td>
                      <td className="r num">{f.ppg}</td>
                      <td className="r num">{f.maxPct ? `${f.maxPct} %` : '—'}</td>
                      <td className="muted" style={{ fontSize: '0.85rem' }}>
                        {f.description}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {tab === 'lupulos' && (
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Origen</th>
                  <th className="r">% AA</th>
                  <th>Uso</th>
                  <th>Aroma</th>
                </tr>
              </thead>
              <tbody>
                {catalog.hops
                  .filter((h) => match(`${h.name} ${h.origin} ${h.aroma.join(' ')} ${h.description}`))
                  .map((h) => (
                    <tr key={h.id} onClick={() => setEditing({ kind: 'lupulos', item: h })} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {h.name} <SourceTag source={h.source} note={h.sourceNote} compact /> <StoreChip item={h} />
                        </div>
                        <div className="faint" style={{ fontSize: '0.78rem' }}>
                          {h.description}
                        </div>
                      </td>
                      <td>{h.origin}</td>
                      <td className="r num">
                        {fmt(h.alpha)}
                        {h.alphaRange && <div className="faint" style={{ fontSize: '0.75rem' }}>{h.alphaRange[0]}–{h.alphaRange[1]}</div>}
                      </td>
                      <td>{h.purpose}</td>
                      <td style={{ fontSize: '0.85rem' }}>{h.aroma.map((a) => AROMA_LABEL[a] ?? a).join(', ')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {tab === 'levaduras' && (
            <table className="table">
              <thead>
                <tr>
                  <th>Cepa</th>
                  <th>Familia</th>
                  <th className="r">Atenuación</th>
                  <th className="r">Temp.</th>
                  <th>Floculación</th>
                </tr>
              </thead>
              <tbody>
                {catalog.yeasts
                  .filter((y) => match(`${y.name} ${y.lab} ${y.code} ${y.description}`))
                  .map((y) => (
                    <tr key={y.id} onClick={() => setEditing({ kind: 'levaduras', item: y })} style={{ cursor: 'pointer' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {y.name} <SourceTag source={y.source} note={y.sourceNote} compact /> <StoreChip item={y} />
                        </div>
                        <div className="faint" style={{ fontSize: '0.78rem' }}>
                          {y.lab} · {y.form} {y.sta1 ? '· STA1+' : ''} — {y.description}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{YEAST_FAMILY_LABEL[y.family] ?? y.family}</td>
                      <td className="r num">{y.attenuation} %</td>
                      <td className="r num">
                        {y.tempRange[0]}–{y.tempRange[1]} °C
                      </td>
                      <td>{y.flocculation}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {editing && <IngredientForm kind={editing.kind} item={editing.item} onClose={() => setEditing(null)} />}
    </>
  );
}

function IngredientForm({ kind, item, onClose }: { kind: Tab; item?: Fermentable | Hop | Yeast; onClose: () => void }) {
  const isNew = !item;
  const [f, setF] = useState<Fermentable>(
    (kind === 'maltas' && (item as Fermentable)) || { id: '', name: '', maker: '', type: 'base', colorEBC: 5, ppg: 37, maxPct: 100, description: '' },
  );
  const [h, setH] = useState<Hop>((kind === 'lupulos' && (item as Hop)) || { id: '', name: '', origin: '', alpha: 10, purpose: 'doble', aroma: [], description: '' });
  const [y, setY] = useState<Yeast>(
    (kind === 'levaduras' && (item as Yeast)) || {
      id: '',
      name: '',
      lab: '',
      type: 'ale',
      form: 'seca',
      attenuation: 75,
      tempRange: [18, 22],
      flocculation: 'media',
      family: 'americana-limpia',
      description: '',
    },
  );

  // Editar un ingrediente integrado crea una versión propia con el mismo id, que lo reemplaza.
  const save = async () => {
    const id = item?.id ?? `custom-${uid()}`;
    const mine = { source: 'usuario' as const, sourceNote: item ? 'Valores ajustados por ti sobre el catálogo' : 'Ingrediente creado por ti' };
    if (kind === 'maltas') await db.fermentables.put({ ...f, ...mine, id });
    if (kind === 'lupulos') await db.hops.put({ ...h, ...mine, id });
    if (kind === 'levaduras') await db.yeasts.put({ ...y, ...mine, id });
    onClose();
  };
  const remove = async () => {
    if (!item) return;
    if (kind === 'maltas') await db.fermentables.delete(item.id);
    if (kind === 'lupulos') await db.hops.delete(item.id);
    if (kind === 'levaduras') await db.yeasts.delete(item.id);
    onClose();
  };

  return (
    <Modal title={isNew ? 'Nuevo ingrediente' : `Editar ${item!.name}`} onClose={onClose}>
      {!isNew && !item!.id.startsWith('custom-') && (
        <p className="callout" style={{ fontSize: '0.85rem' }}>
          Es un ingrediente del catálogo. Si lo guardas, tus valores lo reemplazan (por ejemplo, el % AA de tu cosecha). "Restaurar" vuelve a los valores originales.
        </p>
      )}
      <div className="grid grid-2">
        {kind === 'maltas' && (
          <>
            <Field label="Nombre">
              <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field label="Maltería / marca">
              <input className="input" value={f.maker} onChange={(e) => setF({ ...f, maker: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as FermentableType })}>
                {Object.entries(FERMENTABLE_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Color (EBC)">
              <NumberInput value={f.colorEBC} decimals={1} onChange={(n) => setF({ ...f, colorEBC: n })} />
            </Field>
            <Field label="PPG" hint="Rendimiento % × 0,4621 (ej. 80 % → 37)">
              <NumberInput value={f.ppg} decimals={1} onChange={(n) => setF({ ...f, ppg: n })} />
            </Field>
            <Field label="Máximo recomendado">
              <NumberInput value={f.maxPct} decimals={0} onChange={(n) => setF({ ...f, maxPct: n })} unit="%" />
            </Field>
            <Field label="Descripción">
              <input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </Field>
          </>
        )}
        {kind === 'lupulos' && (
          <>
            <Field label="Nombre">
              <input className="input" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
            </Field>
            <Field label="Origen">
              <input className="input" value={h.origin} onChange={(e) => setH({ ...h, origin: e.target.value })} />
            </Field>
            <Field label="Alfa ácidos">
              <NumberInput value={h.alpha} decimals={1} onChange={(n) => setH({ ...h, alpha: n })} unit="%" />
            </Field>
            <Field label="Uso">
              <select className="input" value={h.purpose} onChange={(e) => setH({ ...h, purpose: e.target.value as Hop['purpose'] })}>
                <option value="amargor">Amargor</option>
                <option value="aroma">Aroma</option>
                <option value="doble">Doble propósito</option>
              </select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <div className="stat-label" style={{ marginBottom: 4 }}>
                Aromas
              </div>
              <div className="row">
                {Object.entries(AROMA_LABEL).map(([k, v]) => (
                  <label key={k} className="chip" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" checked={h.aroma.includes(k)} onChange={(e) => setH({ ...h, aroma: e.target.checked ? [...h.aroma, k] : h.aroma.filter((a) => a !== k) })} /> {v}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Descripción">
              <input className="input" value={h.description} onChange={(e) => setH({ ...h, description: e.target.value })} />
            </Field>
          </>
        )}
        {kind === 'levaduras' && (
          <>
            <Field label="Nombre">
              <input className="input" value={y.name} onChange={(e) => setY({ ...y, name: e.target.value })} />
            </Field>
            <Field label="Laboratorio">
              <input className="input" value={y.lab} onChange={(e) => setY({ ...y, lab: e.target.value })} />
            </Field>
            <Field label="Tipo">
              <select className="input" value={y.type} onChange={(e) => setY({ ...y, type: e.target.value as YeastType })}>
                {Object.entries(YEAST_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Familia (para sustitutos)">
              <select className="input" value={y.family} onChange={(e) => setY({ ...y, family: e.target.value })}>
                {Object.entries(YEAST_FAMILY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Formato">
              <select className="input" value={y.form} onChange={(e) => setY({ ...y, form: e.target.value as Yeast['form'] })}>
                <option value="seca">Seca</option>
                <option value="liquida">Líquida</option>
              </select>
            </Field>
            <Field label="Atenuación">
              <NumberInput value={y.attenuation} decimals={0} onChange={(n) => setY({ ...y, attenuation: n })} unit="%" />
            </Field>
            <Field label="Temp. mínima">
              <NumberInput value={y.tempRange[0]} decimals={0} onChange={(n) => setY({ ...y, tempRange: [n, y.tempRange[1]] })} unit="°C" />
            </Field>
            <Field label="Temp. máxima">
              <NumberInput value={y.tempRange[1]} decimals={0} onChange={(n) => setY({ ...y, tempRange: [y.tempRange[0], n] })} unit="°C" />
            </Field>
            <Field label="Descripción">
              <input className="input" value={y.description} onChange={(e) => setY({ ...y, description: e.target.value })} />
            </Field>
          </>
        )}
      </div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={save}>
          Guardar
        </button>
        {item && (
          <button className="btn btn-danger" onClick={remove}>
            {item.id.startsWith('custom-') ? 'Eliminar' : 'Restaurar original'}
          </button>
        )}
      </div>
    </Modal>
  );
}
