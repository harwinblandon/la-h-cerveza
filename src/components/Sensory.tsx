import type { StyleCompat } from '../domain/intent';
import { SENSORY_INFO, SENSORY_KEYS, type SensoryFit, type SensoryKey, type SensoryPrediction } from '../domain/sensory';
import type { SensoryValues } from '../domain/types';
import { SourceTag } from './Provenance';
import { fmt } from './ui';

/** Deslizadores 0–10. Cada variable puede quedar "sin definir" (no se usa como objetivo). */
export function SensoryEditor({
  values,
  onChange,
  predicted,
  caps,
  optional = true,
}: {
  values: SensoryValues;
  onChange: (v: SensoryValues) => void;
  predicted?: SensoryValues;
  caps?: SensoryValues;
  optional?: boolean;
}) {
  return (
    <div className="sens-grid">
      {SENSORY_KEYS.map((k) => {
        const info = SENSORY_INFO[k];
        const v = values[k];
        const on = v !== undefined;
        const set = (n: number | undefined) => {
          const next = { ...values };
          if (n === undefined) delete next[k];
          else next[k] = n;
          onChange(next);
        };
        return (
          <div key={k} className={`sens-row ${on ? '' : 'sens-off'}`} title={info.help}>
            <label className="sens-label">
              {optional && <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked ? Math.round((predicted?.[k] ?? 5) * 2) / 2 : undefined)} />}
              {info.label}
            </label>
            <div className="sens-track">
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={v ?? predicted?.[k] ?? 5}
                disabled={!on}
                onChange={(e) => set(Number(e.target.value))}
                aria-label={info.label}
              />
              {predicted?.[k] !== undefined && <span className="sens-pred" style={{ left: `${predicted[k]! * 10}%` }} title={`Predicción: ${fmt(predicted[k], 1)}`} />}
              {caps?.[k] !== undefined && <span className="sens-cap" style={{ left: `${caps[k]! * 10}%` }} title={`Máximo: ${fmt(caps[k], 1)}`} />}
              <div className="sens-ends">
                <span>{info.low}</span>
                <span>{info.high}</span>
              </div>
            </div>
            <span className="sens-value num">{on ? fmt(v, 1) : '—'}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Objetivo · Predicción · Resultado, con las causas de cada predicción. */
export function SensoryCompare({ target, prediction, result }: { target?: SensoryValues; prediction: SensoryPrediction; result?: SensoryValues }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Variable</th>
            <th className="r">
              Objetivo <SourceTag source="usuario" compact />
            </th>
            <th className="r">
              Predicción <SourceTag source="estimacion" compact />
            </th>
            <th className="r">
              Resultado <SourceTag source="medicion" note="Tu evaluación sensorial del lote" compact />
            </th>
          </tr>
        </thead>
        <tbody>
          {SENSORY_KEYS.map((k) => {
            const t = target?.[k];
            const p = prediction.values[k];
            const res = result?.[k];
            const far = t !== undefined && Math.abs(p - t) > 1.5;
            return (
              <tr key={k}>
                <td>
                  <details>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{SENSORY_INFO[k].label}</summary>
                    <ul className="drivers">
                      {prediction.drivers[k].map((d) => (
                        <li key={d.label}>
                          <span className={d.delta >= 0 ? 'plan-ok' : 'plan-desvio'}>
                            {d.delta >= 0 ? '+' : '−'}
                            {fmt(Math.abs(d.delta), 1)}
                          </span>{' '}
                          {d.label}
                        </li>
                      ))}
                    </ul>
                  </details>
                </td>
                <td className="r num">{t !== undefined ? fmt(t, 1) : <span className="faint">—</span>}</td>
                <td className={`r num ${far ? 'plan-desvio' : ''}`}>
                  {fmt(p, 1)} <span className="faint">±{fmt(prediction.uncertainty[k], 1)}</span>
                </td>
                <td className="r num">{res !== undefined ? fmt(res, 1) : <span className="faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="faint" style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>
        Toca una variable para ver qué la produce. La predicción es un modelo aproximado: tus catas servirán para calibrarlo.
      </p>
    </div>
  );
}

/** Índices separados (nunca una sola nota global), con su fórmula a la vista. */
export function IndexCards({ compat, fit, styleName }: { compat?: StyleCompat; fit?: SensoryFit; styleName?: string }) {
  const interpretation = (() => {
    if (!compat || !fit) return undefined;
    const okStyle = compat.score >= 85;
    const okFit = fit.score >= 85;
    if (okStyle && okFit) return 'Coherente con el estilo y cerca del perfil que buscas.';
    if (okStyle) return 'La receta representa bien el estilo, pero se aleja del perfil particular que definiste.';
    if (okFit) return 'Se aparta del estilo, pero es coherente con el perfil sensorial que definiste.';
    return 'Lejos del estilo y del perfil: revisa los objetivos o prueba las rutas de diseño.';
  })();
  const worst = fit?.rows.filter((r) => Math.abs(r.diff) > 0.5).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 3);
  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.6rem' }}>
        {compat && (
          <div className="stat" title="100 menos hasta 20 puntos por cada parámetro (OG, FG, ABV, IBU, SRM) fuera del rango, según cuánto se sale">
            <div className="stat-label">Compatibilidad con {styleName ?? 'el estilo'}</div>
            <div className="stat-value">{compat.score} %</div>
            <div className="stat-sub">{compat.rows.filter((r) => !r.inside).map((r) => `${r.param} −${r.penalty}`).join(' · ') || 'todo dentro del rango'}</div>
          </div>
        )}
        {fit && (
          <div className="stat" title="100 menos la diferencia media con el objetivo (medio punto de tolerancia por la incertidumbre del modelo)">
            <div className="stat-label">Compatibilidad sensorial</div>
            <div className="stat-value">{fit.score} %</div>
            <div className="stat-sub">
              {worst?.length ? worst.map((r) => `${SENSORY_INFO[r.key as SensoryKey].label.toLowerCase()} ${r.diff > 0 ? '+' : '−'}${fmt(Math.abs(r.diff), 1)}`).join(' · ') : 'cerca del objetivo'}
            </div>
          </div>
        )}
      </div>
      {interpretation && <p className="callout" style={{ fontSize: '0.88rem', margin: 0 }}>{interpretation}</p>}
    </div>
  );
}
