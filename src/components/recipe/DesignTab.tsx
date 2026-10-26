import { byId } from '../../domain/catalog';
import { ACID_LABEL, SALTS, acidMl, recipeAcid } from '../../domain/calc/water';
import { fmtSg } from '../../domain/calc/units';
import { bitteringShares, efficiencyForOg, scaleMashToOg } from '../../domain/designImport';
import { conditionText } from '../../domain/plan';
import { fitHopsToIbu } from '../../domain/recipeFactory';
import type { DesignTargets, PlanStep, Recipe } from '../../domain/types';
import { pitchAdvice } from '../../domain/yeastAdvice';
import { Info } from '../Info';
import { fmt, fmtKg } from '../ui';
import type { SectionProps } from './IngredientSections';

type Range = [number, number];
const mid = (r: Range) => (r[0] + r[1]) / 2;
const rng = (r: Range | undefined, f: (x: number) => string, unit = '') => (!r ? '—' : r[0] === r[1] ? `${f(r[0])}${unit}` : `${f(r[0])}–${f(r[1])}${unit}`);
const within = (v: number, r?: Range, tol = 0) => !r || (v >= r[0] - tol && v <= r[1] + tol);

const PHASE: Record<PlanStep['phase'], string> = { fermentacion: 'Fermentación', adicion: 'Adición', maduracion: 'Maduración', envasado: 'Envasado' };

/** El diseño leído como una ficha: lo que se busca frente a lo que la receta calcula, con ajustes de un toque. */
export function DesignTab({ recipe, stats, catalog, propose }: SectionProps & { propose: (title: string, next: Recipe) => void }) {
  const d: DesignTargets = recipe.design ?? {};
  const plan = recipe.plan ?? [];
  const target = byId(catalog.waters, recipe.water.targetProfileId);
  const yeast = recipe.yeasts[0];
  const pitch = yeast ? pitchAdvice(stats.og, recipe.batchSizeL, yeast, yeast.amount) : undefined;
  const malt = recipe.fermentables.filter((f) => f.use === 'macerado');
  const maltKg = malt.reduce((s, f) => s + f.amountKg, 0);
  const boilAdds = recipe.fermentables.filter((f) => f.use === 'hervor');
  const fermAdds = recipe.fermentables.filter((f) => f.use === 'fermentador');
  const effNeeded = d.og ? efficiencyForOg(recipe, mid(d.og)) : undefined;

  const rows: { label: string; want: string; got: string; ok: boolean; fix?: { label: string; apply: () => void }[]; note?: string }[] = [];
  if (d.og) {
    rows.push({
      label: 'OG del mosto',
      want: rng(d.og, fmtSg),
      got: fmtSg(stats.og),
      ok: within(stats.og, d.og, 0.001),
      note: 'Antes de agregar la fruta.',
      fix: within(stats.og, d.og, 0.001)
        ? undefined
        : [
            ...(effNeeded ? [{ label: `Usar eficiencia ${Math.round(effNeeded)} %`, apply: () => propose(`Eficiencia de ${Math.round(effNeeded)} % para la OG del diseño`, { ...recipe, efficiencyPct: Math.round(effNeeded) }) }] : []),
            { label: `Ajustar el grano a ${fmtSg(mid(d.og))}`, apply: () => propose(`Grano ajustado a OG ${fmtSg(mid(d.og!))}`, scaleMashToOg(recipe, mid(d.og!))) },
          ],
    });
  }
  if (stats.ogTotal - stats.og > 0.0005) rows.push({ label: 'OG equivalente total', want: '—', got: fmtSg(stats.ogTotal), ok: true, note: 'Con los azúcares de la fruta y lo que se agrega en el fermentador.' });
  rows.push({ label: 'FG estimada', want: rng(d.fg, fmtSg), got: fmtSg(stats.fg), ok: within(stats.fg, d.fg, 0.002) });
  rows.push({ label: 'Alcohol', want: rng(d.abv, (x) => fmt(x), ' %'), got: `${fmt(stats.abv)} %`, ok: within(stats.abv, d.abv, 0.2) });
  if (d.ibu || stats.ibu > 0)
    rows.push({
      label: 'Amargor',
      want: rng(d.ibu, (x) => fmt(x, 0), ' IBU'),
      got: `${fmt(stats.ibu, 0)} IBU`,
      ok: within(stats.ibu, d.ibu, 0.5),
      fix: d.ibu && !within(stats.ibu, d.ibu, 0.5) ? [{ label: `Ajustar el lúpulo a ${fmt(mid(d.ibu), 0)} IBU`, apply: () => propose(`Lúpulo a ${mid(d.ibu!)} IBU`, fitHopsToIbu(recipe, mid(d.ibu!), bitteringShares(recipe))) }] : undefined,
    });
  if (d.phFinal) rows.push({ label: 'pH final', want: rng(d.phFinal, (x) => fmt(x, 1)), got: 'en el lote', ok: true, note: 'Se mide durante la fermentación: el plan lo usa para decidir las adiciones.' });
  if (d.carbonation) rows.push({ label: 'Carbonatación', want: rng(d.carbonation, (x) => fmt(x, 1), ' vol'), got: `${fmt(recipe.carbonation.volumes, 2)} vol`, ok: within(recipe.carbonation.volumes, d.carbonation) });
  rows.push({ label: 'Volumen al fermentador', want: d.finalVolumeL ? `final ${rng(d.finalVolumeL, (x) => fmt(x, 0), ' L')}` : '—', got: `${fmt(recipe.batchSizeL, 0)} L`, ok: true, note: fermAdds.length ? 'La fruta y los sólidos reducen el volumen que se envasa.' : undefined });
  if (d.fermentTempC && yeast)
    rows.push({
      label: 'Fermentación',
      want: rng(d.fermentTempC, (x) => fmt(x, 0), ' °C'),
      got: `${yeast.name} · ${yeast.tempRange[0]}–${yeast.tempRange[1]} °C`,
      ok: d.fermentTempC[0] >= yeast.tempRange[0] - 1 && d.fermentTempC[1] <= yeast.tempRange[1] + 1,
    });

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>{d.styleName ?? 'Diseño'}</h2>
          {d.profile && <span className="faint" style={{ fontSize: '0.85rem' }}>{d.profile}</span>}
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Parámetro</th>
                <th>Diseño</th>
                <th>Receta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>
                    {r.label}
                    {r.note && <div className="faint" style={{ fontSize: '0.75rem' }}>{r.note}</div>}
                  </td>
                  <td className="num">{r.want}</td>
                  <td className="num">{r.got}</td>
                  <td>
                    {r.ok ? (
                      <span className="badge badge-ok">ok</span>
                    ) : (
                      <div className="row" style={{ gap: '0.3rem' }}>
                        <span className="badge badge-warn">ajustar</span>
                        {r.fix?.map((f) => (
                          <button key={f.label} className="btn btn-sm" onClick={f.apply}>
                            {f.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {d.notes && d.notes.length > 0 && (
          <ul className="hist-notes">
            {d.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Grano · {fmtKg(maltKg)}</h2>
          {malt.map((f) => (
            <div key={f.uid} className="design-line">
              <span className="num">{fmtKg(f.amountKg)}</span>
              <span>
                <strong>{f.name}</strong> <span className="faint">{fmt((f.amountKg / maltKg) * 100, 0)} %</span>
                {f.role && <div className="faint">{f.role}</div>}
              </span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Adiciones</h2>
          {boilAdds.map((f) => (
            <div key={f.uid} className="design-line">
              <span className="num">{fmtKg(f.amountKg)}</span>
              <span>
                <strong>{f.name}</strong> <span className="faint">hervor{f.timeMin !== undefined ? `, a ${f.timeMin} min del final` : ''}</span>
              </span>
            </div>
          ))}
          {recipe.hops.map((h) => (
            <div key={h.uid} className="design-line">
              <span className="num">{fmt(h.amountG, 0)} g</span>
              <span>
                <strong>{h.name}</strong> <span className="faint">{h.alpha} % AA · {h.use === 'hervor' ? `${h.time} min` : h.use}</span>
              </span>
            </div>
          ))}
          {fermAdds.map((f) => (
            <div key={f.uid} className="design-line">
              <span className="num">{fmtKg(f.amountKg)}</span>
              <span>
                <strong>{f.name}</strong> <span className="faint">fermentador</span>
                {f.role && <div className="faint">{f.role}</div>}
              </span>
            </div>
          ))}
          {recipe.miscs.map((m) => (
            <div key={m.uid} className="design-line">
              <span className="num">{m.amount > 0 ? `${fmt(m.amount, 0)} ${m.unit}` : '—'}</span>
              <span>
                <strong>{m.name}</strong> <span className="faint">{m.use}{m.time !== undefined ? `, ${m.time} min` : ''}</span>
                {m.notes && <div className="faint">{m.notes}</div>}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Agua</h2>
          {target && stats.kettleWater ? (
            <table className="table">
              <thead>
                <tr>
                  <th>ppm (mg/L)</th>
                  <th className="r">Objetivo</th>
                  <th className="r">Con ajustes</th>
                </tr>
              </thead>
              <tbody>
                {(['ca', 'mg', 'na', 'cl', 'so4'] as const).map((k) => (
                  <tr key={k}>
                    <td>{{ ca: 'Calcio', mg: 'Magnesio', na: 'Sodio', cl: 'Cloruro', so4: 'Sulfato' }[k]}</td>
                    <td className="r num">{fmt(target[k], 0)}</td>
                    <td className="r num">{fmt(stats.kettleWater![k], 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="faint">Configura el agua de origen para calcular las sales.</p>
          )}
          <p style={{ fontSize: '0.88rem', margin: '0.6rem 0 0' }}>
            {SALTS.filter((s) => (recipe.water.mashSalts[s.id] ?? 0) + (recipe.water.spargeSalts[s.id] ?? 0) >= 0.05)
              .map((s) => `${s.name}: ${fmt((recipe.water.mashSalts[s.id] ?? 0) + (recipe.water.spargeSalts[s.id] ?? 0), 1)} g`)
              .join(' · ') || 'Sin sales'}
            {acidMl(recipe.water) > 0 && ` · ${ACID_LABEL[recipeAcid(recipe.water).type]} ${recipeAcid(recipe.water).pct} %: ${fmt(acidMl(recipe.water), 1)} mL`}
            {stats.mashPh !== undefined && ` · pH de macerado estimado ${stats.mashPh.toFixed(2)}`}
          </p>
        </div>
        <div className="card">
          <h2>Proceso</h2>
          {recipe.mashSteps.map((s) => (
            <div key={s.uid} className="design-line">
              <span className="num">{s.tempC} °C</span>
              <span>
                <strong>{s.name}</strong> <span className="faint">{s.timeMin} min</span>
              </span>
            </div>
          ))}
          <div className="design-line">
            <span className="num">{recipe.boilTimeMin} min</span>
            <span>
              <strong>Hervor</strong>
            </span>
          </div>
          {yeast && pitch && (
            <div className="design-line">
              <span className="num">{yeast.amount} sobres</span>
              <span>
                <strong>{yeast.name}</strong>
                <div className="faint">{pitch.summary}</div>
              </span>
            </div>
          )}
          {pitch && <Info>{pitch.steps.join(' ')}</Info>}
        </div>
      </div>

      {plan.length > 0 && (
        <div className="card">
          <h2>Plan de fermentación y adiciones</h2>
          <ol className="plan-list">
            {plan.map((p) => (
              <li key={p.uid}>
                <div className="row-between">
                  <strong>{p.title}</strong>
                  <span className="chip">{PHASE[p.phase]}</span>
                </div>
                <div className="faint" style={{ fontSize: '0.84rem' }}>
                  {[p.tempC && rng(p.tempC, (x) => fmt(x, 0), ' °C'), p.contactDays && `contacto ${rng(p.contactDays, (x) => fmt(x, 0), ' días')}`, p.checkEveryH && `probar cada ${p.checkEveryH} h`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {p.conditions && p.conditions.length > 0 && <div style={{ fontSize: '0.84rem' }}>Cuando: {p.conditions.map((c) => conditionText(c, plan)).join(' y ')}</div>}
                {p.detail && <div className="plan-detail">{p.detail}</div>}
              </li>
            ))}
          </ol>
          <Info>En el lote, la pestaña Fermentación revisa las lecturas de densidad y pH y avisa cuándo se cumple cada condición.</Info>
        </div>
      )}

      {recipe.notes && (
        <details className="card">
          <summary style={{ cursor: 'pointer' }}>Texto original del diseño</summary>
          <pre className="design-original">{recipe.notes}</pre>
        </details>
      )}
    </>
  );
}
