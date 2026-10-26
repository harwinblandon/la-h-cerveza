import type { RecipeStats } from '../../domain/calc/recipeStats';
import type { Recipe } from '../../domain/types';
import { fmt } from '../ui';

const spargeLabel = (t: Recipe['equipment']['type']) => (t === 'biab-lavado' ? 'Mini lavado' : t === 'tres-ollas' || t === 'todo-en-uno' ? 'Lavado' : undefined);

/** Resumen del agua de cocción: lo que hay que preparar y a qué temperatura (panel lateral). */
export function WaterSummary({ recipe, stats }: { recipe: Recipe; stats: RecipeStats }) {
  const w = stats.water;
  const sparge = spargeLabel(recipe.equipment.type);
  return (
    <div className="water-summary">
      <div className="stat-label">Agua de cocción</div>
      <div className="water-summary-grid">
        <span>Total</span>
        <strong className="num">{fmt(w.totalWaterL)} L</strong>
        <span>Macerado</span>
        <strong className="num">
          {fmt(w.mashWaterL)} L{stats.strikeTempC ? <span className="faint"> a {fmt(stats.strikeTempC)} °C</span> : null}
        </strong>
        {sparge && w.spargeWaterL > 0.05 && (
          <>
            <span>{sparge}</span>
            <strong className="num">
              {fmt(w.spargeWaterL)} L<span className="faint"> a 76 °C</span>
            </strong>
          </>
        )}
        <span>Antes del hervor</span>
        <strong className="num">{fmt(w.preBoilL)} L</strong>
      </div>
    </div>
  );
}

/** El agua paso a paso, en el orden de la cocción, con lo que se pierde en cada uno. */
export function WaterFlow({ recipe, stats }: { recipe: Recipe; stats: RecipeStats }) {
  const w = stats.water;
  const eq = recipe.equipment;
  const sparge = spargeLabel(eq.type);
  const fermAdds = recipe.fermentables.filter((f) => f.use === 'fermentador').reduce((s, f) => s + f.amountKg, 0);
  const rows: { n: string; label: string; liters: number; detail?: string; strong?: boolean }[] = [
    { n: '1', label: 'Agua total a preparar', liters: w.totalWaterL, detail: 'Con las sales de la pestaña Agua.', strong: true },
    {
      n: '2',
      label: eq.type === 'biab' ? 'Agua de macerado (toda el agua, BIAB)' : 'Agua de macerado',
      liters: w.mashWaterL,
      detail: [stats.strikeTempC ? `calentar a ${fmt(stats.strikeTempC)} °C para quedar en ${fmt(stats.mashTempC ?? 0)} °C` : undefined, `${fmt(w.mashRatioLpkg)} L por kg de grano`].filter(Boolean).join(' · '),
    },
  ];
  if (sparge && w.spargeWaterL > 0.05) rows.push({ n: '3', label: sparge, liters: w.spargeWaterL, detail: 'a 76–78 °C' });
  rows.push(
    { n: String(rows.length + 1), label: 'Antes del hervor', liters: w.preBoilL, detail: `el grano retiene ${fmt(w.grainAbsorptionL)} L · densidad ${stats.preBoilSg.toFixed(3)}` },
    { n: String(rows.length + 2), label: 'Al final del hervor (caliente)', liters: w.postBoilHotL, detail: `se evaporan ${fmt(w.boilOffL)} L en ${recipe.boilTimeMin} min` },
    {
      n: String(rows.length + 3),
      label: 'Al fermentador',
      liters: recipe.batchSizeL,
      detail: `quedan ${fmt(eq.kettleLossL)} L en la olla (trub)${fermAdds > 0 ? ` · luego se agregan ${fmt(fermAdds, 1)} kg en el fermentador` : ''}`,
      strong: true,
    },
  );
  const tight = w.mashVolumeL > eq.kettleVolumeL * 0.95;
  return (
    <>
      <ol className="water-flow">
        {rows.map((r) => (
          <li key={r.label} className={r.strong ? 'strong' : ''}>
            <span className="water-flow-n">{r.n}</span>
            <span>
              {r.label}
              {r.detail && <div className="faint">{r.detail}</div>}
            </span>
            <span className="num water-flow-l">{fmt(r.liters)} L</span>
          </li>
        ))}
      </ol>
      <p className={tight ? 'callout callout-warn' : 'faint'} style={{ fontSize: '0.84rem', marginTop: '0.6rem' }}>
        Agua y grano juntos ocupan {fmt(w.mashVolumeL)} L de una olla de {eq.kettleVolumeL} L{tight ? ': no cabe con margen. Usa más lavado, una olla mayor o menos litros.' : '.'}
      </p>
    </>
  );
}
