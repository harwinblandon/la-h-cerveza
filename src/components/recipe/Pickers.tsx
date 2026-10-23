import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { FERMENTABLE_TYPE_LABEL } from '../../data/fermentables';
import { AROMA_LABEL } from '../../data/hops';
import { YEAST_FAMILY_LABEL } from '../../data/yeasts';
import { db } from '../../db';
import { soldAt, storeIds, type Catalog } from '../../domain/catalog';
import { srmToHex } from '../../domain/calc/color';
import { ebcToSrm } from '../../domain/calc/units';
import { fermentableSubstitutes, hopSubstitutes, yeastSubstitutes } from '../../domain/suggest/substitutes';
import type { Available, Fermentable, Hop, RecipeFermentable, RecipeHop, RecipeYeast, Style, Yeast } from '../../domain/types';
import { useBrewPrefs } from '../../hooks';
import { Modal, fmt, fmtKg } from '../ui';

function useInventoryIds() {
  const inv = useLiveQuery(() => db.inventory.toArray(), []);
  return useMemo(() => new Set((inv ?? []).filter((i) => i.amount > 0 && i.ingredientId).map((i) => i.ingredientId!)), [inv]);
}

const InStock = ({ show }: { show: boolean }) => (show ? <span className="chip chip-accent">En inventario</span> : null);

/** Marca de tienda con enlace a la ficha del producto (y lo que publica la tienda). */
export function StoreChip({ item, store }: { item: Available; store?: string }) {
  const offer = item.stores?.find((o) => !store || o.store === store) ?? item.stores?.[0];
  if (!offer) return null;
  return (
    <a
      className="chip chip-store"
      href={offer.url}
      target="_blank"
      rel="noreferrer"
      title={offer.note ? `${offer.store}: ${offer.note}` : `Ver en ${offer.store}`}
      onClick={(e) => e.stopPropagation()}
    >
      {offer.store} ↗
    </a>
  );
}

/** Filtro "solo la tienda preferida". */
function useStoreFilter() {
  const { store } = useBrewPrefs();
  const [only, setOnly] = useState(false);
  const toggle = store ? (
    <label className="row" style={{ fontSize: '0.85rem' }}>
      <input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} /> Solo {store}
    </label>
  ) : null;
  return { store, keep: (x: Available) => !only || soldAt(x, store), toggle };
}

export function FermentablePicker({ catalog, onPick, onClose }: { catalog: Catalog; onPick: (f: Fermentable) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const stock = useInventoryIds();
  const sf = useStoreFilter();
  const list = catalog.fermentables.filter(
    (f) => sf.keep(f) && (!type || f.type === type) && `${f.name} ${f.maker} ${f.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Modal title="Agregar fermentable" onClose={onClose}>
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} autoFocus placeholder="Buscar malta, azúcar…" value={q} onChange={(e) => setQ(e.target.value)} />
        {sf.toggle}
        <select className="input" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Todos</option>
          {Object.entries(FERMENTABLE_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {list.map((f) => (
        <div key={f.id} className="pick-item" onClick={() => onPick(f)}>
          <span className="swatch" style={{ background: srmToHex(ebcToSrm(f.colorEBC)), width: 18, height: 24 }} />
          <div className="pick-main">
            <div className="pick-title">
              {f.name} <span className="faint">· {f.maker}</span>
            </div>
            <div className="pick-sub">
              {FERMENTABLE_TYPE_LABEL[f.type]} · {f.colorEBC} EBC · {f.ppg} PPG{f.maxPct ? ` · máx. ${f.maxPct} %` : ''} — {f.description}
            </div>
          </div>
          <StoreChip item={f} store={sf.store} />
          <InStock show={stock.has(f.id)} />
        </div>
      ))}
    </Modal>
  );
}

export function HopPicker({ catalog, onPick, onClose }: { catalog: Catalog; onPick: (h: Hop) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [aroma, setAroma] = useState('');
  const stock = useInventoryIds();
  const sf = useStoreFilter();
  const list = catalog.hops.filter(
    (h) => sf.keep(h) && (!aroma || h.aroma.includes(aroma)) && `${h.name} ${h.origin} ${h.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Modal title="Agregar lúpulo" onClose={onClose}>
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} autoFocus placeholder="Buscar lúpulo u origen…" value={q} onChange={(e) => setQ(e.target.value)} />
        {sf.toggle}
        <select className="input" style={{ width: 'auto' }} value={aroma} onChange={(e) => setAroma(e.target.value)}>
          <option value="">Cualquier aroma</option>
          {Object.entries(AROMA_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {list.map((h) => (
        <div key={h.id} className="pick-item" onClick={() => onPick(h)}>
          <div className="pick-main">
            <div className="pick-title">
              {h.name} <span className="faint">· {h.origin} · {fmt(h.alpha)} % AA</span>
            </div>
            <div className="pick-sub">
              {h.aroma.map((a) => AROMA_LABEL[a] ?? a).join(', ')} — {h.description}
            </div>
          </div>
          <StoreChip item={h} store={sf.store} />
          <InStock show={stock.has(h.id)} />
        </div>
      ))}
    </Modal>
  );
}

export function YeastPicker({ catalog, style, onPick, onClose }: { catalog: Catalog; style?: Style; onPick: (y: Yeast) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [onlyStyle, setOnlyStyle] = useState(!!style);
  const stock = useInventoryIds();
  const sf = useStoreFilter();
  const list = catalog.yeasts.filter(
    (y) =>
      sf.keep(y) &&
      (!onlyStyle || !style || style.guide.yeastFamilies.includes(y.family)) &&
      `${y.name} ${y.lab} ${y.code} ${y.description}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Modal title="Agregar levadura" onClose={onClose}>
      <div className="row" style={{ marginBottom: '0.5rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 180 }} autoFocus placeholder="Buscar cepa o laboratorio…" value={q} onChange={(e) => setQ(e.target.value)} />
        {sf.toggle}
        {style && (
          <label className="row" style={{ fontSize: '0.85rem' }}>
            <input type="checkbox" checked={onlyStyle} onChange={(e) => setOnlyStyle(e.target.checked)} /> Solo para {style.name}
          </label>
        )}
      </div>
      {list.map((y) => (
        <div key={y.id} className="pick-item" onClick={() => onPick(y)}>
          <div className="pick-main">
            <div className="pick-title">
              {y.name} <span className="faint">· {y.lab} · {y.form}</span>
            </div>
            <div className="pick-sub">
              {YEAST_FAMILY_LABEL[y.family] ?? y.family} · {y.attenuation} % atenuación · {y.tempRange[0]}–{y.tempRange[1]} °C · floculación {y.flocculation}
              {y.sta1 ? ' · STA1+' : ''} — {y.description}
            </div>
          </div>
          <StoreChip item={y} store={sf.store} />
          <InStock show={stock.has(y.id)} />
        </div>
      ))}
    </Modal>
  );
}

type SubTarget =
  | { kind: 'fermentable'; item: RecipeFermentable }
  | { kind: 'hop'; item: RecipeHop }
  | { kind: 'yeast'; item: RecipeYeast };

interface SubstituteModalProps {
  target: SubTarget;
  catalog: Catalog;
  style?: Style;
  onReplace: (replacement: { id: string; amount: number }) => void;
  onClose: () => void;
}

/** "Si me falta…": propone equivalentes, priorizando lo que hay en inventario. */
export function SubstituteModal({ target, catalog, style, onReplace, onClose }: SubstituteModalProps) {
  const stock = useInventoryIds();
  const { store } = useBrewPrefs();
  const [onlyStock, setOnlyStock] = useState(false);
  const [onlyStore, setOnlyStore] = useState(false);
  const storeSet = useMemo(() => (store ? storeIds(catalog, store) : new Set<string>()), [catalog, store]);
  const avail = onlyStock ? stock : onlyStore ? storeSet : undefined;
  const rows =
    target.kind === 'fermentable'
      ? fermentableSubstitutes(target.item, catalog, avail).map((s) => ({
          id: s.item.id,
          title: `${s.item.name} · ${s.item.maker}`,
          sub: s.reason,
          amount: s.amount,
          amountLabel: fmtKg(s.amount),
          score: s.score,
        }))
      : target.kind === 'hop'
        ? hopSubstitutes(target.item, catalog, avail).map((s) => ({
            id: s.item.id,
            title: `${s.item.name} · ${s.item.origin} · ${fmt(s.item.alpha)} % AA`,
            sub: s.reason,
            amount: s.amount,
            amountLabel: `${s.amount} g`,
            score: s.score,
          }))
        : yeastSubstitutes(target.item, catalog, style, avail).map((s) => ({
            id: s.item.id,
            title: `${s.item.name} · ${s.item.lab}`,
            sub: s.reason,
            amount: target.item.amount,
            amountLabel: `${target.item.amount} u.`,
            score: s.score,
          }));
  return (
    <Modal title={`No tengo ${target.item.name}`} onClose={onClose}>
      <p className="muted">
        Estas son las alternativas más cercanas. La cantidad ya viene ajustada para conservar densidad, color o amargor.
      </p>
      <label className="row" style={{ fontSize: '0.88rem', marginBottom: '0.5rem' }}>
        <input type="checkbox" checked={onlyStock} onChange={(e) => (setOnlyStock(e.target.checked), setOnlyStore(false))} /> Solo lo que tengo en inventario
        {store && (
          <>
            <input type="checkbox" style={{ marginLeft: 12 }} checked={onlyStore} onChange={(e) => (setOnlyStore(e.target.checked), setOnlyStock(false))} /> Solo lo que vende {store}
          </>
        )}
      </label>
      {rows.length === 0 && <p className="faint">No encontré sustitutos{onlyStock ? ' en tu inventario' : ''}.</p>}
      {rows.map((r) => (
        <div key={r.id} className="pick-item" onClick={() => onReplace({ id: r.id, amount: r.amount })}>
          <div className="pick-main">
            <div className="pick-title">{r.title}</div>
            <div className="pick-sub">{r.sub}</div>
          </div>
          {storeSet.has(r.id) && <span className="chip chip-store">{store}</span>}
          <InStock show={stock.has(r.id)} />
          <span className="chip num">{r.amountLabel}</span>
          <span className="badge badge-ok">{Math.min(99, Math.round(r.score * 100))}%</span>
        </div>
      ))}
    </Modal>
  );
}
