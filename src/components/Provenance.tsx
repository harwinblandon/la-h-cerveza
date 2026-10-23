import { PROVENANCE } from '../domain/provenance';
import type { Provenance } from '../domain/types';
import type { ChangeReport } from '../domain/versioning';

/** Etiqueta pequeña que dice de dónde viene un dato. */
export function SourceTag({ source, note, compact }: { source?: Provenance; note?: string; compact?: boolean }) {
  if (!source) return null;
  const p = PROVENANCE[source];
  return (
    <span className={`src src-${source}`} title={`${p.label}: ${note ?? p.help}`}>
      {compact ? p.short : p.label}
    </span>
  );
}

/** Lo que cambia y lo que implica: números (cálculo) y efectos esperables (reglas). */
export function ChangeReportView({ report, emptyText = 'No hay diferencias.' }: { report: ChangeReport; emptyText?: string }) {
  const stats = report.stats.filter((s) => s.significant);
  if (!report.changes.length && !stats.length) return <p className="muted">{emptyText}</p>;
  return (
    <div className="stack">
      {stats.length > 0 && (
        <div>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>Efecto en los números</h3>
            <SourceTag source="calculo" />
          </div>
          <div className="delta-grid">
            {stats.map((s) => {
              const up = s.after > s.before;
              return (
                <div key={s.key} className="stat">
                  <div className="stat-label">{s.label}</div>
                  <div className="num" style={{ fontWeight: 700 }}>
                    {s.format(s.before)} → {s.format(s.after)}
                  </div>
                  <div className={`delta ${up ? 'delta-up' : 'delta-down'}`}>{up ? '▲' : '▼'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {report.changes.length > 0 && (
        <div>
          <div className="row-between" style={{ marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>Cambios y consecuencias</h3>
            <SourceTag source="regla" note="Efectos sensoriales generales; dependen de cantidades, proceso y levadura" />
          </div>
          {report.changes.map((c, i) => (
            <div key={i} className="change">
              <div className="change-title">{c.text}</div>
              {c.effects.length > 0 && (
                <ul className="effects">
                  {c.effects.map((e, j) => (
                    <li key={j} className={`eff eff-${e.sign === '+' ? 'up' : e.sign === '−' ? 'down' : 'warn'}`}>
                      <span className="eff-sign">{e.sign === '!' ? '⚠︎' : e.sign}</span> {e.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
