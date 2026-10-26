import { useState } from 'react';
import { FERMENTABLE_TYPE_LABEL } from '../../data/fermentables';
import { YEAST_FAMILY_LABEL } from '../../data/yeasts';
import { pitchAdvice, yeastStyleFit } from '../../domain/yeastAdvice';
import { Info } from '../Info';
import { byId, type Catalog } from '../../domain/catalog';
import type { RecipeStats } from '../../domain/calc/recipeStats';
import { hopIbu } from '../../domain/calc/bitterness';
import { pitchRate } from '../../domain/calc/tools';
import { uid } from '../../domain/calc/units';
import { fermentableFromCatalog, hopFromCatalog, yeastFromCatalog } from '../../domain/recipeFactory';
import type { FermentableUse, HopForm, HopUse, MiscUse, Recipe, RecipeFermentable, RecipeHop, RecipeYeast, Style } from '../../domain/types';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import { SourceTag } from '../Provenance';
import { NumberInput, fmt } from '../ui';
import { FermentablePicker, HopPicker, SubstituteModal, YeastPicker } from './Pickers';

export interface SectionProps {
  recipe: Recipe;
  stats: RecipeStats;
  update: (fn: (r: Recipe) => Recipe) => void;
  catalog: Catalog;
  style?: Style;
}

const replaceAt = <T extends { uid: string }>(list: T[], id: string, patch: Partial<T>) =>
  list.map((x) => (x.uid === id ? { ...x, ...patch } : x));

// ---------- Fermentables ----------

export function FermentablesSection({ recipe, stats, update, catalog, style }: SectionProps) {
  const [picking, setPicking] = useState(false);
  const [sub, setSub] = useState<RecipeFermentable | null>(null);
  const set = (id: string, patch: Partial<RecipeFermentable>) => update((r) => ({ ...r, fermentables: replaceAt(r.fermentables, id, patch) }));
  const total = stats.totalGrainKg;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Fermentables</h2>
        <div className="row">
          <span className="muted num">{fmt(total, 2)} kg en total</span>
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(true)}>
            + Agregar
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Ingrediente</th>
              <th className="r">Cantidad</th>
              <th className="r">%</th>
              <th className="r">EBC</th>
              <th>Uso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recipe.fermentables.map((f) => (
              <tr key={f.uid}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.name}</div>
                  <div className="faint" style={{ fontSize: '0.78rem' }}>
                    {FERMENTABLE_TYPE_LABEL[f.type]} · {f.ppg} PPG <SourceTag source={f.source} note={f.sourceNote} compact />
                  </div>
                </td>
                <td className="r">
                  <NumberInput value={f.amountKg} decimals={3} onChange={(n) => set(f.uid, { amountKg: n })} unit="kg" className="input-sm" />
                </td>
                <td className="r num">{fmt(stats.pctByUid[f.uid], 1)}</td>
                <td className="r">
                  <NumberInput value={f.colorEBC} decimals={0} onChange={(n) => set(f.uid, { colorEBC: n, source: 'usuario', sourceNote: 'Color ajustado por ti' })} className="input-sm" />
                </td>
                <td>
                  <select className="input input-sm" value={f.use} onChange={(e) => set(f.uid, { use: e.target.value as FermentableUse })}>
                    {/* Solo los granos se maceran; azúcares y extractos van al hervor o después. */}
                    {!['azucar', 'no-fermentable', 'extracto'].includes(f.type) && <option value="macerado">Macerado</option>}
                    <option value="hervor">Hervor</option>
                    <option value="fermentador">Fermentación</option>
                    <option value="maduracion">Maduración (sin fermentar)</option>
                  </select>
                </td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" title="Buscar sustituto" onClick={() => setSub(f)}>
                    ⇄
                  </button>
                  <button
                    className="btn btn-sm btn-ghost btn-danger"
                    title="Quitar"
                    onClick={() => update((r) => ({ ...r, fermentables: r.fermentables.filter((x) => x.uid !== f.uid) }))}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recipe.fermentables.length === 0 && <p className="faint">Agrega maltas o genera la receta desde un estilo.</p>}
      {picking && (
        <FermentablePicker
          catalog={catalog}
          onClose={() => setPicking(false)}
          onPick={(f) => {
            const kg = f.type === 'base' ? 4 : f.type === 'tostada' ? 0.15 : 0.3;
            update((r) => ({ ...r, fermentables: [...r.fermentables, fermentableFromCatalog(f, kg)] }));
            setPicking(false);
          }}
        />
      )}
      {sub && (
        <SubstituteModal
          target={{ kind: 'fermentable', item: sub }}
          catalog={catalog}
          style={style}
          onClose={() => setSub(null)}
          onReplace={({ id, amount }) => {
            const f = byId(catalog.fermentables, id);
            if (f) {
              const nf = { ...fermentableFromCatalog(f, amount), uid: sub.uid, use: sub.use };
              update((r) => ({ ...r, fermentables: r.fermentables.map((x) => (x.uid === sub.uid ? nf : x)) }));
            }
            setSub(null);
          }}
        />
      )}
    </div>
  );
}

// ---------- Lúpulos ----------

const HOP_USE_LABEL: Record<HopUse, string> = {
  macerado: 'Macerado',
  'primer-mosto': 'Primer mosto',
  hervor: 'Hervor',
  whirlpool: 'Whirlpool',
  'dry-hop': 'Dry hop',
};

export function HopsSection({ recipe, stats, update, catalog, style }: SectionProps) {
  const [picking, setPicking] = useState(false);
  const [sub, setSub] = useState<RecipeHop | null>(null);
  const inventory = useLiveQuery(() => db.inventory.where('kind').equals('lupulo').toArray(), []) ?? [];
  // % AA real de la bolsa, si el lúpulo está en el inventario con ese dato.
  const invAlpha = (hopId: string) => inventory.find((i) => i.ingredientId === hopId && i.alpha && i.amount > 0)?.alpha;
  const set = (id: string, patch: Partial<RecipeHop>) => update((r) => ({ ...r, hops: replaceAt(r.hops, id, patch) }));
  const [keepIbu, setKeepIbu] = useState(true);
  // En las adiciones de amargor, cambiar el % AA ajusta los gramos para conservar los IBU.
  // En las tardías (aroma) se conservan los gramos: ahí importa la cantidad de aceites.
  const isBittering = (h: RecipeHop) => h.use === 'primer-mosto' || h.use === 'macerado' || (h.use === 'hervor' && h.time > 20);
  const setAlpha = (h: RecipeHop, alpha: number) =>
    update((r) => ({
      ...r,
      hops: r.hops.map((x) => {
        if (x.uid !== h.uid) return x;
        const scale = keepIbu && isBittering(x) && alpha >= 1 && x.alpha >= 1 ? x.alpha / alpha : 1;
        return { ...x, alpha, amountG: x.amountG * scale, source: 'usuario' as const, sourceNote: '% AA ingresado por ti' };
      }),
    }));
  // IBU objetivo: el que pediste en la intención o el centro del rango del estilo.
  const targetIbu = recipe.intent?.constraints?.ibu ?? (style ? (style.ranges.ibu[0] + style.ranges.ibu[1]) / 2 : undefined);
  const mainBitter = [...recipe.hops].filter(isBittering).sort((a, b) => b.time - a.time)[0];
  const fitToTarget = () => {
    if (!mainBitter || targetIbu === undefined) return;
    const per = hopIbu({ ...mainBitter, amountG: 1 }, stats.boilGravity, stats.water.postBoilHotL, recipe.boilTimeMin);
    const others = stats.ibu - (stats.ibuByUid[mainBitter.uid] ?? 0);
    const g = per > 0 ? Math.max(0, (targetIbu - others) / per) : mainBitter.amountG;
    set(mainBitter.uid, { amountG: Math.round(g * 10) / 10 });
  };
  const order: Record<HopUse, number> = { macerado: 0, 'primer-mosto': 1, hervor: 2, whirlpool: 3, 'dry-hop': 4 };
  const sorted = [...recipe.hops].sort((a, b) => order[a.use] - order[b.use] || (a.use === 'hervor' ? b.time - a.time : a.time - b.time));
  const aromaGpl = recipe.hops.filter((h) => h.use === 'whirlpool' || h.use === 'dry-hop').reduce((s, h) => s + h.amountG, 0) / recipe.batchSizeL;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Lúpulos</h2>
        <div className="row">
          <span className="muted num">
            {fmt(stats.totalHopsG, 0)} g · {fmt(stats.ibu, 0)} IBU · aroma {fmt(aromaGpl, 1)} g/L
          </span>
          {targetIbu !== undefined && mainBitter && Math.abs(stats.ibu - targetIbu) >= 1 && (
            <button className="btn btn-sm" title={`Recalcula los gramos de ${mainBitter.name} con su % AA actual`} onClick={fitToTarget}>
              Ajustar a {fmt(targetIbu, 0)} IBU
            </button>
          )}
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(true)}>
            + Agregar
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Lúpulo</th>
              <th className="r">g</th>
              <th className="r">% AA</th>
              <th>Uso</th>
              <th className="r">Tiempo</th>
              <th className="r">IBU</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.uid}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    {h.name} <SourceTag source={h.source} note={h.sourceNote} compact />
                  </div>
                  <select className="input input-sm" style={{ width: 'auto', marginTop: 2 }} value={h.form} onChange={(e) => set(h.uid, { form: e.target.value as HopForm })}>
                    <option value="pellet">Pellet</option>
                    <option value="flor">Flor</option>
                    <option value="cryo">Cryo / lupulina</option>
                  </select>
                </td>
                <td className="r">
                  <NumberInput value={h.amountG} decimals={1} onChange={(n) => set(h.uid, { amountG: n })} className="input-sm" />
                </td>
                <td className="r">
                  <NumberInput value={h.alpha} decimals={1} onChange={(n) => setAlpha(h, n)} className="input-sm" />
                </td>
                <td>
                  <select
                    className="input input-sm"
                    value={h.use}
                    onChange={(e) => {
                      const use = e.target.value as HopUse;
                      set(h.uid, { use, time: use === 'dry-hop' ? 3 : use === 'whirlpool' ? 20 : h.time, tempC: use === 'whirlpool' ? h.tempC ?? 80 : undefined });
                    }}
                  >
                    {Object.entries(HOP_USE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {h.use === 'whirlpool' && (
                    <div className="input-group" style={{ marginTop: 2 }}>
                      <NumberInput value={h.tempC ?? 80} decimals={0} onChange={(n) => set(h.uid, { tempC: n })} className="input-sm" unit="°C" />
                    </div>
                  )}
                </td>
                <td className="r">
                  {h.use === 'primer-mosto' || h.use === 'macerado' ? (
                    <span className="faint">—</span>
                  ) : (
                    <NumberInput value={h.time} decimals={0} onChange={(n) => set(h.uid, { time: n })} className="input-sm" unit={h.use === 'dry-hop' ? 'días' : 'min'} />
                  )}
                </td>
                <td className="r num">{fmt(stats.ibuByUid[h.uid], 1)}</td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn btn-sm btn-ghost" title="Buscar sustituto" onClick={() => setSub(h)}>
                    ⇄
                  </button>
                  <button className="btn btn-sm btn-ghost btn-danger" title="Quitar" onClick={() => update((r) => ({ ...r, hops: r.hops.filter((x) => x.uid !== h.uid) }))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
        IBU por Tinseth. El whirlpool suma amargor según la temperatura (a 80 °C ≈ 23 % de la isomerización del hervor). Usa el % AA real de tu bolsa.
      </p>
      <label className="row" style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
        <input type="checkbox" checked={keepIbu} onChange={(e) => setKeepIbu(e.target.checked)} />
        Al cambiar el % AA de una adición de amargor, recalcular los gramos para mantener sus IBU
      </label>
      <p className="faint" style={{ fontSize: '0.78rem', margin: '0.2rem 0 0' }}>
        Las adiciones tardías, de whirlpool y dry hop conservan sus gramos: ahí manda el aroma, no el amargor.
      </p>
      {picking && (
        <HopPicker
          catalog={catalog}
          onClose={() => setPicking(false)}
          onPick={(hop) => {
            const isBitter = hop.purpose === 'amargor';
            update((r) => ({ ...r, hops: [...r.hops, hopFromCatalog(hop, isBitter ? 20 : 30, isBitter ? 'hervor' : 'whirlpool', isBitter ? 60 : 20, invAlpha(hop.id))] }));
            setPicking(false);
          }}
        />
      )}
      {sub && (
        <SubstituteModal
          target={{ kind: 'hop', item: sub }}
          catalog={catalog}
          style={style}
          onClose={() => setSub(null)}
          onReplace={({ id, amount }) => {
            const hop = byId(catalog.hops, id);
            if (hop) {
              const nh = { ...hopFromCatalog(hop, amount, sub.use, sub.time, invAlpha(hop.id)), uid: sub.uid, tempC: sub.tempC, form: sub.form };
              update((r) => ({ ...r, hops: r.hops.map((x) => (x.uid === sub.uid ? nh : x)) }));
            }
            setSub(null);
          }}
        />
      )}
    </div>
  );
}

// ---------- Levadura y otros ----------

export function YeastSection({ recipe, stats, update, catalog, style }: SectionProps) {
  const [picking, setPicking] = useState(false);
  const [sub, setSub] = useState<RecipeYeast | null>(null);
  const set = (id: string, patch: Partial<RecipeYeast>) => update((r) => ({ ...r, yeasts: replaceAt(r.yeasts, id, patch) }));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Levadura</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setPicking(true)}>
            + Agregar
          </button>
        </div>
        {recipe.yeasts.length === 0 && <p className="faint">Sin levadura todavía.</p>}
        {recipe.yeasts.map((y) => {
          const advice = pitchAdvice(stats.og, recipe.batchSizeL, y, y.amount);
          const fit = yeastStyleFit(y, style);
          const fits = fit.fits;
          return (
            <div key={y.uid} className="stack" style={{ paddingBottom: '0.5rem' }}>
              <div className="row-between">
                <div>
                  <div style={{ fontWeight: 650, fontSize: '1.05rem' }}>
                    {y.name} <span className="faint">· {y.lab}</span> <SourceTag source={y.source} note={y.sourceNote} compact />
                  </div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {y.family ? YEAST_FAMILY_LABEL[y.family] ?? y.family : y.type} · {y.form} · {y.tempRange[0]}–{y.tempRange[1]} °C{' '}
                    {style && <span className={`badge ${fits ? 'badge-ok' : 'badge-warn'}`}>{fits ? 'apta para el estilo' : 'poco típica'}</span>}
                  </div>
                </div>
                <div className="row">
                  <button className="btn btn-sm" onClick={() => setSub(y)}>
                    ⇄ Sustituir
                  </button>
                  <button className="btn btn-sm btn-ghost btn-danger" onClick={() => update((r) => ({ ...r, yeasts: r.yeasts.filter((x) => x.uid !== y.uid) }))}>
                    ✕
                  </button>
                </div>
              </div>
              <div className="row">
                <label className="field">
                  <span>Atenuación</span>
                  <NumberInput value={y.attenuation} decimals={0} onChange={(n) => set(y.uid, { attenuation: n, source: 'usuario', sourceNote: 'Atenuación ajustada por ti' })} unit="%" />
                </label>
                <label className="field">
                  <span>{y.form === 'seca' ? 'Sobres' : 'Paquetes'}</span>
                  <NumberInput value={y.amount} decimals={0} onChange={(n) => set(y.uid, { amount: n })} />
                </label>
                <div className="callout" style={{ flex: 1, minWidth: 220, fontSize: '0.85rem' }}>
                  Necesitas ~{fmt(advice.cellsNeededB, 0)} mil millones de células → <strong>{advice.packs}</strong> {y.form === 'seca' ? 'sobre(s) de 11,5 g' : 'paquete(s) frescos o un starter'}.
                  Atenuación esperada con tu macerado: <strong>{fmt(stats.attenuation, 0)} %</strong>.
                  <Info>
                    La atenuación parte de la de la levadura ({fmt(y.attenuation, 0)} %) y se corrige 1,2 puntos por cada °C que el macerado se aleja de 66,5 °C (entre −7 y +5
                    puntos): un macerado más frío deja un mosto más fermentable y una cerveza más seca; uno más caliente deja más cuerpo.
                    {stats.mashTempC !== undefined && ` Con tu macerado a ${fmt(stats.mashTempC, 1)} °C queda en ${fmt(stats.attenuation, 0)} %.`} Las células se calculan a 0,75 millones por mL y
                    °Plato en ales y 1,5 en lagers (×1,3 sobre 1.060); un sobre seco de 11,5 g trae ~115 mil millones.
                  </Info>
                </div>
              </div>
              {advice.level !== 'ok' && (
                <div className="callout callout-warn" style={{ fontSize: '0.86rem' }}>
                  <strong>{advice.summary}</strong>
                  <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                    {advice.steps.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {!fit.fits && fit.message && (
                <div className="callout callout-idea" style={{ fontSize: '0.86rem' }}>
                  {fit.message}
                  {fit.tips.length > 0 && (
                    <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
                      {fit.tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MiscSection recipe={recipe} stats={stats} update={update} catalog={catalog} style={style} />
      {picking && (
        <YeastPicker
          catalog={catalog}
          style={style}
          onClose={() => setPicking(false)}
          onPick={(y) => {
            const pr = pitchRate(stats.og, recipe.batchSizeL, y.type === 'lager' ? 'lager' : 'ale', y.form);
            update((r) => ({ ...r, yeasts: [...r.yeasts, yeastFromCatalog(y, pr.packs)] }));
            setPicking(false);
          }}
        />
      )}
      {sub && (
        <SubstituteModal
          target={{ kind: 'yeast', item: sub }}
          catalog={catalog}
          style={style}
          onClose={() => setSub(null)}
          onReplace={({ id }) => {
            const y = byId(catalog.yeasts, id);
            if (y) {
              const pr = pitchRate(stats.og, recipe.batchSizeL, y.type === 'lager' ? 'lager' : 'ale', y.form);
              update((r) => ({ ...r, yeasts: r.yeasts.map((x) => (x.uid === sub.uid ? { ...yeastFromCatalog(y, pr.packs), uid: sub.uid } : x)) }));
            }
            setSub(null);
          }}
        />
      )}
    </>
  );
}

const MISC_PRESETS: { name: string; use: MiscUse; amount: number; unit: 'g' | 'ml' | 'unidad'; time?: number }[] = [
  { name: 'Whirlfloc / Protafloc (clarificante)', use: 'hervor', amount: 1, unit: 'unidad', time: 10 },
  { name: 'Nutriente de levadura', use: 'hervor', amount: 2, unit: 'g', time: 10 },
  { name: 'Musgo irlandés', use: 'hervor', amount: 5, unit: 'g', time: 15 },
  { name: 'Gelatina (clarificar en frío)', use: 'fermentador', amount: 5, unit: 'g' },
  { name: 'Cáscara de naranja', use: 'hervor', amount: 15, unit: 'g', time: 5 },
  { name: 'Semillas de cilantro', use: 'hervor', amount: 15, unit: 'g', time: 5 },
  { name: 'Cacao nibs', use: 'fermentador', amount: 100, unit: 'g' },
  { name: 'Café en grano (cold brew)', use: 'fermentador', amount: 60, unit: 'g' },
  { name: 'Vainilla en vaina', use: 'fermentador', amount: 2, unit: 'unidad' },
];

function MiscSection({ recipe, update }: SectionProps) {
  const set = (id: string, patch: Partial<Recipe['miscs'][number]>) => update((r) => ({ ...r, miscs: replaceAt(r.miscs, id, patch) }));
  return (
    <div className="card">
      <div className="card-head">
        <h2>Otros ingredientes</h2>
        <select
          className="input input-sm"
          style={{ width: 'auto' }}
          value=""
          onChange={(e) => {
            const p = MISC_PRESETS.find((x) => x.name === e.target.value);
            const base = p ?? { name: 'Ingrediente', use: 'hervor' as MiscUse, amount: 1, unit: 'g' as const };
            update((r) => ({ ...r, miscs: [...r.miscs, { uid: uid(), ...base }] }));
          }}
        >
          <option value="">+ Agregar…</option>
          {MISC_PRESETS.map((p) => (
            <option key={p.name}>{p.name}</option>
          ))}
          <option value="otro">Otro (personalizado)</option>
        </select>
      </div>
      {recipe.miscs.length === 0 && <p className="faint">Clarificantes, especias, frutas, café, cacao…</p>}
      {recipe.miscs.map((m) => (
        <div key={m.uid} className="row" style={{ marginBottom: '0.4rem' }}>
          <input className="input input-sm" style={{ flex: 2, minWidth: 160 }} value={m.name} onChange={(e) => set(m.uid, { name: e.target.value })} />
          <NumberInput value={m.amount} decimals={1} onChange={(n) => set(m.uid, { amount: n })} className="input-sm" />
          <select className="input input-sm" style={{ width: 'auto' }} value={m.unit} onChange={(e) => set(m.uid, { unit: e.target.value as 'g' })}>
            <option value="g">g</option>
            <option value="kg">kg</option>
            <option value="ml">mL</option>
            <option value="unidad">unidad</option>
          </select>
          <select className="input input-sm" style={{ width: 'auto' }} value={m.use} onChange={(e) => set(m.uid, { use: e.target.value as MiscUse })}>
            <option value="macerado">Macerado</option>
            <option value="hervor">Hervor</option>
            <option value="fermentador">Fermentador</option>
            <option value="embotellado">Envasado</option>
          </select>
          {m.use === 'hervor' && <NumberInput value={m.time} decimals={0} onChange={(n) => set(m.uid, { time: n })} className="input-sm" unit="min" />}
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => update((r) => ({ ...r, miscs: r.miscs.filter((x) => x.uid !== m.uid) }))}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
