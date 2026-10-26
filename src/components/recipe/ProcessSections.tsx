import { EQUIPMENT_TYPE_HELP, EQUIPMENT_TYPE_LABEL } from '../../data/equipment';
import { byId } from '../../domain/catalog';
import { useBrewPrefs } from '../../hooks';
import { PRIMING_SUGARS, kegPsi, primingSugarGrams } from '../../domain/calc/tools';
import { psiToBar, uid } from '../../domain/calc/units';
import { ACID_LABEL, ION_KEYS, ION_LABELS, SALTS, acidMl, balanceLabel, recipeAcid, spargeAcidMl, withAcid } from '../../domain/calc/water';
import { applyWaterTarget } from '../../domain/recipeFactory';
import type { FermentationStep, MashStep, PrimingSugarId, SaltId } from '../../domain/types';
import { Info } from '../Info';
import { SourceTag } from '../Provenance';
import { NumberInput, fmt } from '../ui';
import type { SectionProps } from './IngredientSections';

// ---------- Macerado y volúmenes ----------

export function MashSection({ recipe, stats, update }: SectionProps) {
  const w = stats.water;
  const eq = recipe.equipment;
  const setStep = (id: string, patch: Partial<MashStep>) =>
    update((r) => ({ ...r, mashSteps: r.mashSteps.map((s) => (s.uid === id ? { ...s, ...patch } : s)) }));
  const setEq = (patch: Partial<typeof eq>) => update((r) => ({ ...r, equipment: { ...r.equipment, ...patch } }));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Volúmenes · {EQUIPMENT_TYPE_LABEL[eq.type]}</h2>
        </div>
        <Info>{EQUIPMENT_TYPE_HELP[eq.type]}</Info>
        <div className="stats">
          <div className="stat">
            <div className="stat-label">Agua total</div>
            <div className="stat-value">{fmt(w.totalWaterL)} L</div>
          </div>
          <div className="stat">
            <div className="stat-label">Agua de macerado</div>
            <div className="stat-value">{fmt(w.mashWaterL)} L</div>
            <div className="stat-sub">{fmt(w.mashRatioLpkg)} L/kg</div>
          </div>
          {w.spargeWaterL > 0.05 && (
            <div className="stat">
              <div className="stat-label">Agua de lavado</div>
              <div className="stat-value">{fmt(w.spargeWaterL)} L</div>
              <div className="stat-sub">a 76–78 °C</div>
            </div>
          )}
          <div className="stat">
            <div className="stat-label">Volumen del macerado</div>
            <div className="stat-value">{fmt(w.mashVolumeL)} L</div>
            <div className="stat-sub">olla de {eq.kettleVolumeL} L</div>
          </div>
          <div className="stat">
            <div className="stat-label">Pre-hervor</div>
            <div className="stat-value">{fmt(w.preBoilL)} L</div>
            <div className="stat-sub">a {stats.preBoilSg.toFixed(3)}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Post-hervor</div>
            <div className="stat-value">{fmt(w.postBoilHotL)} L</div>
            <div className="stat-sub">caliente · evapora {fmt(w.boilOffL)} L</div>
          </div>
          <div className="stat">
            <div className="stat-label">Al fermentador</div>
            <div className="stat-value">{fmt(recipe.batchSizeL)} L</div>
            <div className="stat-sub">absorción grano {fmt(w.grainAbsorptionL)} L</div>
          </div>
        </div>
        <hr className="hr" />
        <h3>Ajustes del equipo para esta receta</h3>
        <div className="grid grid-4">
          {eq.type === 'biab-lavado' && (
            <label className="field">
              <span>Litros de lavado</span>
              <NumberInput value={eq.spargeL} decimals={1} onChange={(n) => setEq({ spargeL: n })} unit="L" />
            </label>
          )}
          {(eq.type === 'tres-ollas' || eq.type === 'todo-en-uno') && (
            <label className="field">
              <span>Relación agua/grano</span>
              <NumberInput value={eq.mashRatioLpkg} decimals={1} onChange={(n) => setEq({ mashRatioLpkg: n })} unit="L/kg" />
            </label>
          )}
          <label className="field">
            <span>Evaporación</span>
            <NumberInput value={eq.boilOffLph} decimals={1} onChange={(n) => setEq({ boilOffLph: n })} unit="L/h" />
          </label>
          <label className="field">
            <span>Absorción del grano</span>
            <NumberInput value={eq.grainAbsorptionLpkg} decimals={2} onChange={(n) => setEq({ grainAbsorptionLpkg: n })} unit="L/kg" />
          </label>
          <label className="field">
            <span>Pérdida en olla</span>
            <NumberInput value={eq.kettleLossL} decimals={1} onChange={(n) => setEq({ kettleLossL: n })} unit="L" />
          </label>
          <label className="field">
            <span>Capacidad de la olla</span>
            <NumberInput value={eq.kettleVolumeL} decimals={0} onChange={(n) => setEq({ kettleVolumeL: n })} unit="L" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Macerado</h2>
          <button
            className="btn btn-sm"
            onClick={() => update((r) => ({ ...r, mashSteps: [...r.mashSteps, { uid: uid(), name: 'Escalón', tempC: 72, timeMin: 15 }] }))}
          >
            + Escalón
          </button>
        </div>
        {recipe.mashSteps.map((s, i) => {
          const prev = recipe.mashSteps[i - 1];
          return (
            <div key={s.uid} className="row" style={{ marginBottom: '0.5rem' }}>
              <input className="input input-sm" style={{ flex: 1, minWidth: 140 }} value={s.name} onChange={(e) => setStep(s.uid, { name: e.target.value })} />
              <NumberInput value={s.tempC} decimals={1} onChange={(n) => setStep(s.uid, { tempC: n })} unit="°C" className="input-sm" />
              <NumberInput value={s.timeMin} decimals={0} onChange={(n) => setStep(s.uid, { timeMin: n })} unit="min" className="input-sm" />
              <span className="faint" style={{ fontSize: '0.8rem', minWidth: 120 }}>
                {i === 0 && stats.strikeTempC ? `Agua a ${fmt(stats.strikeTempC)} °C` : prev ? `Subir desde ${fmt(prev.tempC, 0)} °C` : ''}
              </span>
              <button
                className="btn btn-sm btn-ghost btn-danger"
                onClick={() => update((r) => ({ ...r, mashSteps: r.mashSteps.filter((x) => x.uid !== s.uid) }))}
              >
                ✕
              </button>
            </div>
          );
        })}
        <p className="faint" style={{ fontSize: '0.82rem' }}>
          62–64 °C: cerveza seca y muy fermentable · 65–67 °C: equilibrio · 68–70 °C: más cuerpo y dulzor. Mash out a 76 °C detiene las enzimas.
        </p>
      </div>
    </>
  );
}

// ---------- Agua ----------

export function WaterSection({ recipe, stats, update, catalog }: SectionProps) {
  const prefs = useBrewPrefs();
  const wa = recipe.water;
  const source = byId(catalog.waters, wa.sourceProfileId);
  const target = byId(catalog.waters, wa.targetProfileId);
  const setW = (patch: Partial<typeof wa>) => update((r) => ({ ...r, water: { ...r.water, ...patch } }));
  const setSalt = (where: 'mashSalts' | 'spargeSalts', id: SaltId, g: number) =>
    update((r) => ({ ...r, water: { ...r.water, [where]: { ...r.water[where], [id]: g } } }));
  const hasSparge = stats.water.spargeWaterL > 0.05;
  const result = stats.kettleWater;
  const ratio = stats.so4ClRatio ?? 0;
  const phClass = stats.mashPh === undefined ? '' : stats.mashPh < 5.2 || stats.mashPh > 5.6 ? 'badge-warn' : 'badge-ok';
  const acid = recipeAcid(wa, prefs.acid);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Perfil de agua</h2>
          {source && target && (
            <button className="btn btn-sm btn-primary" onClick={() => update((r) => applyWaterTarget(r, source, target, 5.4, prefs.availableSalts, prefs.acid))}>
              Calcular sales y ácido
            </button>
          )}
        </div>
        <div className="grid grid-3">
          <label className="field">
            <span>Mi agua (origen)</span>
            <select className="input" value={wa.sourceProfileId} onChange={(e) => setW({ sourceProfileId: e.target.value })}>
              {catalog.waters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Perfil objetivo</span>
            <select className="input" value={wa.targetProfileId ?? ''} onChange={(e) => setW({ targetProfileId: e.target.value || undefined })}>
              <option value="">— Ninguno —</option>
              {catalog.waters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Dilución con agua destilada</span>
            <NumberInput value={wa.dilution * 100} decimals={0} min={0} max={100} onChange={(n) => setW({ dilution: n / 100 })} unit="%" />
          </label>
        </div>
        {target?.description && <p className="faint" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>{target.description}</p>}
      </div>

      <SaltRecipe recipe={recipe} mashL={stats.water.mashWaterL} spargeL={stats.water.spargeWaterL} available={prefs.availableSalts} />

      <div className="card">
        <h2>Sales (ajuste fino)</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Sal</th>
                <th className="r">Macerado ({fmt(stats.water.mashWaterL)} L)</th>
                {hasSparge && <th className="r">Lavado ({fmt(stats.water.spargeWaterL)} L)</th>}
              </tr>
            </thead>
            <tbody>
              {SALTS.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="faint" style={{ fontSize: '0.78rem' }}>
                      {s.formula}
                      {s.note ? ` · ${s.note}` : ''}
                    </div>
                  </td>
                  <td className="r">
                    <NumberInput value={wa.mashSalts[s.id] ?? 0} decimals={1} onChange={(n) => setSalt('mashSalts', s.id, n)} unit="g" className="input-sm" />
                  </td>
                  {hasSparge && (
                    <td className="r">
                      <NumberInput value={wa.spargeSalts[s.id] ?? 0} decimals={1} onChange={(n) => setSalt('spargeSalts', s.id, n)} unit="g" className="input-sm" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <hr className="hr" />
        <div className="grid grid-3">
          <label className="field">
            <span>Ácido (macerado)</span>
            <select
              className="input"
              value={acid.type}
              onChange={(e) => {
                const type = e.target.value as typeof acid.type;
                const pct = type === prefs.acid.type ? prefs.acid.pct : type === 'fosforico' ? 85 : 88;
                update((r) => ({ ...r, water: withAcid(r.water, { type, pct }, 0) }));
              }}
            >
              <option value="lactico">Láctico</option>
              <option value="fosforico">Fosfórico</option>
            </select>
          </label>
          <label className="field">
            <span>Cantidad</span>
            <NumberInput value={acidMl(wa)} decimals={1} onChange={(n) => setW(withAcid(wa, acid, n))} unit="mL" />
          </label>
          <label className="field">
            <span>Concentración</span>
            <NumberInput value={acid.pct} decimals={0} onChange={(n) => setW(withAcid(wa, { ...acid, pct: n }, acidMl(wa)))} unit="%" />
          </label>
        </div>
        {hasSparge && source && source.hco3 > 30 && (
          <p className="callout" style={{ marginTop: '0.75rem', fontSize: '0.88rem' }}>
            Tu agua tiene alcalinidad: acidifica el agua de lavado con ~{fmt(spargeAcidMl(source, stats.water.spargeWaterL * (1 - wa.dilution), acid), 1)} mL de{' '}
            {ACID_LABEL[acid.type].toLowerCase().replace('ácido ', '')} para evitar extraer taninos.
          </p>
        )}
      </div>

      {result && (
        <div className="card">
          <div className="card-head">
            <h2>Resultado</h2>
            <div className="row">
              <span className={`badge ${phClass}`}>pH macerado ≈ {fmt(stats.mashPh, 2)}</span>
              <span className="chip">
                SO₄/Cl {Number.isFinite(ratio) ? fmt(ratio, 2) : '∞'} · {balanceLabel(ratio)}
              </span>
              <span className="chip">AR {fmt(stats.ra, 0)} ppm</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ppm</th>
                  {ION_KEYS.map((k) => (
                    <th key={k} className="r">
                      {ION_LABELS[k]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {source && (
                  <tr>
                    <td className="muted">Mi agua</td>
                    {ION_KEYS.map((k) => (
                      <td key={k} className="r num">
                        {fmt(source[k], 0)}
                      </td>
                    ))}
                  </tr>
                )}
                <tr>
                  <td style={{ fontWeight: 600 }}>Con ajustes</td>
                  {ION_KEYS.map((k) => (
                    <td key={k} className="r num" style={{ fontWeight: 600 }}>
                      {fmt(result[k], 0)}
                    </td>
                  ))}
                </tr>
                {target && (
                  <tr>
                    <td className="muted">Objetivo</td>
                    {ION_KEYS.map((k) => (
                      <td key={k} className="r num muted">
                        {fmt(target[k], 0)}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
            El pH es una estimación (±0,1) a partir del color y tipo de cada malta y de la alcalinidad residual. Mídelo a los 15 minutos de macerado con la muestra a temperatura ambiente.
          </p>
        </div>
      )}
    </>
  );
}

// ---------- Fermentación y carbonatación ----------

export function FermentationSection({ recipe, update }: SectionProps) {
  const setStep = (id: string, patch: Partial<FermentationStep>) =>
    update((r) => ({ ...r, fermentation: r.fermentation.map((s) => (s.uid === id ? { ...s, ...patch } : s)) }));
  const c = recipe.carbonation;
  const setC = (patch: Partial<typeof c>) => update((r) => ({ ...r, carbonation: { ...r.carbonation, ...patch } }));
  const totalDays = recipe.fermentation.reduce((s, x) => s + x.days, 0);
  const lastTemp = Math.max(...recipe.fermentation.filter((s) => s.tempC > 5).map((s) => s.tempC), 18);
  const volume = recipe.batchSizeL - recipe.equipment.fermenterLossL;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Plan de fermentación</h2>
          <div className="row">
            <span className="muted">{totalDays} días en total</span>
            <button
              className="btn btn-sm"
              onClick={() => update((r) => ({ ...r, fermentation: [...r.fermentation, { uid: uid(), name: 'Etapa', tempC: 18, days: 3 }] }))}
            >
              + Etapa
            </button>
          </div>
        </div>
        {recipe.fermentation.map((s) => (
          <div key={s.uid} className="row" style={{ marginBottom: '0.5rem' }}>
            <input className="input input-sm" style={{ flex: 1, minWidth: 160 }} value={s.name} onChange={(e) => setStep(s.uid, { name: e.target.value })} />
            <NumberInput value={s.tempC} decimals={1} onChange={(n) => setStep(s.uid, { tempC: n })} unit="°C" className="input-sm" />
            <NumberInput value={s.days} decimals={0} onChange={(n) => setStep(s.uid, { days: n })} unit="días" className="input-sm" />
            <button
              className="btn btn-sm btn-ghost btn-danger"
              onClick={() => update((r) => ({ ...r, fermentation: r.fermentation.filter((x) => x.uid !== s.uid) }))}
            >
              ✕
            </button>
          </div>
        ))}
        <p className="faint" style={{ fontSize: '0.82rem' }}>
          Sin nevera con control de temperatura en clima cálido: considera una levadura kveik, o un baño de agua con botellas congeladas para mantener la primaria abajo de 20 °C los primeros 3 días.
        </p>
      </div>
      <div className="card">
        <h2>Carbonatación</h2>
        <div className="grid grid-3">
          <label className="field">
            <span>Volúmenes de CO₂</span>
            <NumberInput value={c.volumes} decimals={1} onChange={(n) => setC({ volumes: n })} unit="vol" />
          </label>
          <label className="field">
            <span>Método</span>
            <select className="input" value={c.method} onChange={(e) => setC({ method: e.target.value as 'priming' })}>
              <option value="priming">Azúcar en botella</option>
              <option value="forzado">Barril (forzado)</option>
            </select>
          </label>
          {c.method === 'priming' && (
            <label className="field">
              <span>Azúcar</span>
              <select className="input" value={c.primingSugar} onChange={(e) => setC({ primingSugar: e.target.value as PrimingSugarId })}>
                {Object.entries(PRIMING_SUGARS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="callout" style={{ marginTop: '0.75rem' }}>
          {c.method === 'priming' ? (
            <>
              Para ~{fmt(volume)} L con la cerveza a {fmt(lastTemp, 0)} °C: <strong>{fmt(primingSugarGrams(c.volumes, lastTemp, volume, c.primingSugar), 0)} g</strong> de{' '}
              {PRIMING_SUGARS[c.primingSugar].name.toLowerCase()}. Se recalcula con los datos reales al envasar.
            </>
          ) : (
            <>
              A 4 °C: <strong>{fmt(kegPsi(c.volumes, 4), 1)} PSI</strong> ({fmt(psiToBar(kegPsi(c.volumes, 4)), 2)} bar) por 7–10 días.
            </>
          )}
        </div>
      </div>
    </>
  );
}


/** Gramos de cada sal por agua, listos para pesar el día de cocción. */
function SaltRecipe({ recipe, mashL, spargeL, available }: { recipe: SectionProps['recipe']; mashL: number; spargeL: number; available?: SaltId[] }) {
  const w = recipe.water;
  const lines = (where: 'mashSalts' | 'spargeSalts') =>
    SALTS.filter((s) => (w[where][s.id] ?? 0) >= 0.05).map((s) => ({ salt: s, g: w[where][s.id]! }));
  const mash = lines('mashSalts');
  const sparge = lines('spargeSalts');
  const missing = [...mash, ...sparge].filter((l) => available && !available.includes(l.salt.id)).map((l) => l.salt.name);
  const Row = ({ title, liters, items, acid }: { title: string; liters: number; items: { salt: (typeof SALTS)[number]; g: number }[]; acid?: number }) => (
    <div className="salt-block">
      <div className="stat-label">
        {title} · {fmt(liters)} L
      </div>
      {items.length === 0 && !acid ? (
        <div className="faint">Sin sales</div>
      ) : (
        <ul className="salt-list">
          {items.map(({ salt, g }) => (
            <li key={salt.id}>
              <span className="salt-g num">{fmt(g, 1)} g</span>
              <span>
                {salt.name} <span className="faint">({fmt((g / liters) * 1000, 0)} mg/L)</span>
              </span>
            </li>
          ))}
          {acid ? (
            <li>
              <span className="salt-g num">{fmt(acid, 1)} mL</span>
              <span>
                {ACID_LABEL[recipeAcid(w).type]} al {recipeAcid(w).pct} %
              </span>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
  return (
    <div className="card">
      <div className="card-head">
        <h2>Receta de sales</h2>
        <SourceTag source="calculo" note="Gramos calculados para el volumen de agua de esta receta y tu equipo" />
      </div>
      <div className="grid grid-2">
        <Row title="Agua de macerado" liters={mashL} items={mash} acid={acidMl(w)} />
        {spargeL > 0.05 && <Row title="Agua de lavado" liters={spargeL} items={sparge} />}
      </div>
      {missing.length > 0 && (
        <p className="callout" style={{ marginTop: '0.75rem', fontSize: '0.88rem' }}>
          ⚠︎ Usa {[...new Set(missing)].join(', ')}, que no marcaste como disponible en Ajustes. Vuelve a "Calcular sales y ácido" para recalcular solo con las que tienes.
        </p>
      )}
      <Info>Pesa con balanza de 0,1 g. Disuelve las sales en el agua antes de calentar (o en el macerado al empastar) y mide el pH a los 15 minutos.</Info>
    </div>
  );
}
