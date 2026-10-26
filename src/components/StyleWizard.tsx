import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { YEAST_FAMILY_LABEL } from '../data/yeasts';
import { db } from '../db';
import { byId, maltsters as catalogMaltsters } from '../domain/catalog';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { fmtSg } from '../domain/calc/units';
import { generateFromStyle, newRecipe, type Tuning } from '../domain/recipeFactory';
import { fermentableGroup, fermentableSubstitutes, hopSubstitutes, yeastsForStyle } from '../domain/suggest/substitutes';
import type { Recipe, Style } from '../domain/types';
import { pitchAdvice, yeastStyleFit } from '../domain/yeastAdvice';
import { useBrewPrefs, useCatalog, useEquipment, useSettings } from '../hooks';
import { Info } from './Info';
import { Field, NumberInput, Swatch, fmt, fmtKg } from './ui';

/** Receta desde un estilo: litros, eficiencia, agua por paso e insumos que tiene el cervecero. */
export function StyleWizard({ initialStyle }: { initialStyle?: string }) {
  const prefs = useBrewPrefs();
  const catalog = useCatalog();
  const equipment = useEquipment();
  const settings = useSettings();
  const navigate = useNavigate();
  const [styleId, setStyleId] = useState(initialStyle ?? '');
  const [q, setQ] = useState('');
  const [eqId, setEqId] = useState(settings.defaultEquipmentId);
  const [liters, setLiters] = useState<number>();
  const [eff, setEff] = useState<number>();
  const [saveEff, setSaveEff] = useState(false);
  const [brand, setBrand] = useState<string>('');
  const [name, setName] = useState('');
  const [tuning, setTuning] = useState<Tuning>({});
  const [packs, setPacks] = useState<number>();
  const [step, setStep] = useState<'datos' | 'insumos'>('datos');

  const eq = equipment.find((e) => e.id === eqId) ?? equipment[0];
  const style = byId(catalog.styles, styleId);
  const source = byId(catalog.waters, settings.sourceWaterId);
  const efficiency = eff ?? eq?.efficiencyPct ?? 70;
  const brands = catalogMaltsters(catalog);
  const maltsterPref = useMemo(() => (brand ? [brand] : prefs.maltsters), [brand, prefs.maltsters]);
  const ready = !!style && !!eq && !!liters && liters > 0;

  const recipe = useMemo<Recipe | undefined>(() => {
    if (!ready) return undefined;
    return generateFromStyle({
      style: style!,
      equipment: { ...eq!, efficiencyPct: efficiency },
      batchSizeL: liters,
      catalog,
      sourceWater: source ? { id: source.id, ions: source } : undefined,
      tuning,
      ...prefs,
      maltsters: maltsterPref,
    });
  }, [ready, style, eq, efficiency, liters, catalog, source, tuning, prefs, maltsterPref]);
  const stats = useMemo(() => (recipe ? computeRecipeStats(recipe, source) : undefined), [recipe, source]);

  const styles = catalog.styles.filter((s) => `${s.code} ${s.name} ${s.nameEn}`.toLowerCase().includes(q.toLowerCase()));

  const create = async (blank: boolean) => {
    if (!eq || !liters) return;
    let r: Recipe;
    if (blank || !recipe) {
      r = newRecipe({ ...eq, efficiencyPct: efficiency }, settings.sourceWaterId);
      r.batchSizeL = liters;
      if (style) r.styleId = style.id;
    } else {
      r = recipe;
      if (packs !== undefined && r.yeasts[0]) r = { ...r, yeasts: [{ ...r.yeasts[0], amount: packs }, ...r.yeasts.slice(1)] };
    }
    if (name.trim()) r.name = name.trim();
    if (settings.brewerName) r.author = settings.brewerName;
    if (saveEff && eff !== undefined && eq.id) await db.equipment.update(eq.id, { efficiencyPct: eff });
    await db.recipes.add(r);
    navigate(`/recetas/${r.id}`);
  };

  const w = stats?.water;
  const sparge = eq?.type === 'biab-lavado' ? 'Mini lavado' : eq?.type === 'tres-ollas' || eq?.type === 'todo-en-uno' ? 'Agua de lavado' : undefined;

  if (step === 'insumos' && recipe && stats && style) {
    return (
      <div className="stack">
        <div className="row-between">
          <button className="btn btn-sm" onClick={() => setStep('datos')}>
            ← Estilo y volumen
          </button>
          <span className="num faint" style={{ fontSize: '0.85rem' }}>
            {style.name} · {fmt(liters)} L · {fmtSg(stats.og)} · {fmt(stats.ibu, 0)} IBU · {fmt(stats.abv)} %
          </span>
        </div>
        <IngredientChoices recipe={recipe} style={style} tuning={tuning} setTuning={setTuning} />
        <YeastChoice recipe={recipe} style={style} og={stats.og} tuning={tuning} setTuning={setTuning} packs={packs} setPacks={setPacks} />
        <div className="action-bar">
          <button className="btn" onClick={() => setStep('datos')}>
            ← Volver
          </button>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={() => create(false)}>
            Crear receta
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-2">
      <div>
        <h3>1. Estilo</h3>
        <input className="input" placeholder="Buscar estilo (IPA, Stout, 21A…)" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: '0.5rem' }}>
          {styles.map((s) => (
            <div key={s.id} className="pick-item" style={s.id === styleId ? { background: 'var(--accent-soft)' } : undefined} onClick={() => setStyleId(s.id)}>
              <Swatch srm={(s.ranges.srm[0] + s.ranges.srm[1]) / 2} size={0.7} />
              <div className="pick-main">
                <div className="pick-title">
                  {s.code} · {s.name}
                </div>
                <div className="pick-sub">
                  {fmtSg(s.ranges.og[0])}–{fmtSg(s.ranges.og[1])} · {s.ranges.ibu[0]}–{s.ranges.ibu[1]} IBU · {s.ranges.abv[0]}–{s.ranges.abv[1]} %
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="stack">
        <h3>2. Equipo y volumen</h3>
        <Field label="Equipo">
          <select className="input" value={eqId} onChange={(e) => (setEqId(e.target.value), setEff(undefined))}>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} — {EQUIPMENT_TYPE_LABEL[e.type]}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-2">
          <Field label="¿Cuántos litros finales quieres?">
            <NumberInput value={liters} onChange={setLiters} unit="L" decimals={1} placeholder="Litros al fermentador" />
          </Field>
          <Field label="Eficiencia de tu equipo">
            <NumberInput value={efficiency} onChange={setEff} unit="%" decimals={0} />
          </Field>
        </div>
        {eff !== undefined && eq && eff !== eq.efficiencyPct && (
          <label className="row" style={{ fontSize: '0.85rem', gap: '0.4rem' }}>
            <input type="checkbox" checked={saveEff} onChange={(e) => setSaveEff(e.target.checked)} />
            Guardar {fmt(eff, 0)} % como la eficiencia de {eq.name}
          </label>
        )}
        <Info>
          La eficiencia de sala es la parte del azúcar del grano que llega al fermentador. La vas conociendo lote a lote: al registrar la OG y el volumen de cada cocción,
          La H calcula la real y puedes guardarla en tu equipo.
        </Info>
        {w && eq && (
          <div className="water-plan">
            <div className="stat-label">Agua para {fmt(liters)} L finales</div>
            <div className="water-plan-grid">
              <span>Agua total</span>
              <strong className="num">{fmt(w.mashWaterL + w.spargeWaterL)} L</strong>
              <span>Agua de macerado</span>
              <strong className="num">{fmt(w.mashWaterL)} L</strong>
              {sparge && w.spargeWaterL > 0.05 && (
                <>
                  <span>{sparge}</span>
                  <strong className="num">{fmt(w.spargeWaterL)} L</strong>
                </>
              )}
              <span>Antes del hervor</span>
              <strong className="num">{fmt(w.preBoilL)} L</strong>
              <span>Grano</span>
              <strong className="num">{fmtKg(w.grainKg)}</strong>
            </div>
            {w.warnings.map((x) => (
              <p key={x} className="callout" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
                {x}
              </p>
            ))}
          </div>
        )}
        <div className="grid grid-2">
          <Field label="Marca de malta">
            <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">{prefs.maltsters.length ? `Mis marcas (${prefs.maltsters.join(', ')})` : 'La recomendada para el estilo'}</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre (opcional)">
            <input className="input" value={name} placeholder={style ? `${style.name} de La H` : 'Mi receta'} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <button className="btn btn-primary" disabled={!ready} onClick={() => setStep('insumos')}>
            Revisar insumos →
          </button>
          <button className="btn" disabled={!ready} onClick={() => create(false)}>
            Crear con los recomendados
          </button>
          <button className="btn btn-ghost" disabled={!eq || !liters} onClick={() => create(true)}>
            En blanco
          </button>
        </div>
        {!liters && <p className="faint" style={{ fontSize: '0.82rem', margin: 0 }}>Indica los litros finales para calcular la receta y el agua.</p>}
      </div>
    </div>
  );
}

type ChoiceProps = { recipe: Recipe; style: Style; tuning: Tuning; setTuning: (t: Tuning) => void };

/** Maltas y lúpulos de la receta, cada uno con la opción de usar lo que se tiene. */
function IngredientChoices({ recipe, style, tuning, setTuning }: ChoiceProps) {
  const catalog = useCatalog();
  const grainIds = style.guide.grains.map((g) => g.ingredientId);
  const hopIds = style.guide.hops.map((h) => h.ingredientId);
  // El generador respeta el orden de la guía del estilo: cada fila sabe qué insumo de la guía reemplaza.
  const grainsAligned = recipe.fermentables.length === grainIds.length;
  const hopsAligned = recipe.hops.length === hopIds.length;

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Maltas</h2>
        {recipe.fermentables.map((f, i) => {
          const subs = fermentableSubstitutes(f, catalog, undefined, 8);
          const others = catalog.fermentables.filter((c) => c.id !== f.ingredientId && fermentableGroup(c.type) === fermentableGroup(f.type) && !subs.some((s) => s.item.id === c.id));
          return (
            <div key={f.uid} className="choice-row">
              <span className="num choice-amount">{fmtKg(f.amountKg)}</span>
              {grainsAligned ? (
                <select
                  className="input"
                  value={f.ingredientId}
                  onChange={(e) => setTuning({ ...tuning, grainSwap: { ...tuning.grainSwap, [grainIds[i]]: e.target.value } })}
                >
                  <option value={f.ingredientId}>
                    {f.name}
                    {byId(catalog.fermentables, f.ingredientId)?.maker ? ` · ${byId(catalog.fermentables, f.ingredientId)!.maker}` : ''} ({f.colorEBC} EBC)
                  </option>
                  <optgroup label="Equivalentes">
                    {subs.map((s) => (
                      <option key={s.item.id} value={s.item.id}>
                        {s.item.name} · {s.item.maker} ({s.item.colorEBC} EBC)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Otras">
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.maker} ({c.colorEBC} EBC)
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <span>{f.name}</span>
              )}
            </div>
          );
        })}
        <p className="faint" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          Al cambiar una malta, las cantidades se recalculan para mantener la densidad y el color del estilo.
        </p>
      </div>
      <div className="card">
        <h2>Lúpulos</h2>
        {recipe.hops.map((h, i) => {
          const subs = hopSubstitutes(h, catalog, undefined, 8);
          const others = catalog.hops.filter((c) => c.id !== h.ingredientId && !subs.some((s) => s.item.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
          return (
            <div key={h.uid} className="choice-row">
              <span className="num choice-amount">{fmt(h.amountG, 0)} g</span>
              {hopsAligned ? (
                <select className="input" value={h.ingredientId} onChange={(e) => setTuning({ ...tuning, hopSwap: { ...tuning.hopSwap, [hopIds[i]]: e.target.value } })}>
                  <option value={h.ingredientId}>
                    {h.name} ({h.alpha} % AA)
                  </option>
                  <optgroup label="Equivalentes">
                    {subs.map((s) => (
                      <option key={s.item.id} value={s.item.id}>
                        {s.item.name} ({s.item.alpha} % AA)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Otros">
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.alpha} % AA)
                      </option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <span>{h.name}</span>
              )}
              <span className="faint choice-use">{h.use === 'dry-hop' ? 'dry hop' : h.use === 'whirlpool' ? 'whirlpool' : `${h.time} min`}</span>
            </div>
          );
        })}
        <p className="faint" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
          Los gramos se ajustan al % AA del lúpulo que elijas para llegar al IBU del estilo. Si tienes el lúpulo en el inventario, se usa el % AA de tu bolsa.
        </p>
      </div>
    </div>
  );
}

/** Levadura: la recomendada o la que se tenga, con lo que pasa si no es del estilo o si no alcanza. */
function YeastChoice({ recipe, style, og, tuning, setTuning, packs, setPacks }: ChoiceProps & { og: number; packs?: number; setPacks: (n: number) => void }) {
  const catalog = useCatalog();
  const y = recipe.yeasts[0];
  if (!y) return null;
  const recommended = yeastsForStyle(style, catalog, 20);
  const others = catalog.yeasts.filter((c) => !recommended.some((r) => r.id === c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const have = packs ?? y.amount;
  const advice = pitchAdvice(og, recipe.batchSizeL, y, have);
  const fit = yeastStyleFit(y, style);
  const unit = y.form === 'seca' ? 'sobres' : 'paquetes';

  return (
    <div className="card">
      <h2>Levadura</h2>
      <div className="grid grid-2">
        <Field label="Levadura">
          <select className="input" value={y.ingredientId} onChange={(e) => setTuning({ ...tuning, yeastId: e.target.value })}>
            <optgroup label={`Recomendadas para ${style.name}`}>
              {recommended.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.lab} ({c.form})
                </option>
              ))}
            </optgroup>
            <optgroup label="Otras">
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.lab} ({c.form})
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label={`¿Cuántos ${unit} tienes?`}>
          <NumberInput value={have} onChange={setPacks} decimals={0} />
        </Field>
      </div>
      <p className="muted" style={{ fontSize: '0.85rem', margin: '0.4rem 0' }}>
        {y.family ? YEAST_FAMILY_LABEL[y.family] ?? y.family : y.type} · atenuación {y.attenuation} % · {y.tempRange[0]}–{y.tempRange[1]} °C · recomendado: {advice.packs} {unit}
      </p>
      {!fit.fits && fit.message && (
        <div className="callout callout-idea" style={{ fontSize: '0.88rem' }}>
          <strong>No es la levadura típica del estilo.</strong> {fit.message}
          {fit.tips.length > 0 && (
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
              {fit.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className={`callout ${advice.level === 'ok' ? '' : 'callout-warn'}`} style={{ fontSize: '0.88rem', marginTop: '0.6rem' }}>
        <strong>{advice.summary}</strong>
        {advice.steps.length > 0 && (
          <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem' }}>
            {advice.steps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
