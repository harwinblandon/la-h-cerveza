import type { Batch, HistoricalKind, HistoricalRecord } from '../domain/types';
import { fmt, fmtDate, fmtDateTime } from './ui';

export const KIND_LABEL: Record<HistoricalKind, { label: string; help: string }> = {
  confirmado: { label: 'Confirmado', help: 'Dato confirmado por el cervecero.' },
  medicion: { label: 'Medición', help: 'Medido durante el lote.' },
  ejecucion: { label: 'Ejecución', help: 'Registrado al ejecutar el lote.' },
  planificado: { label: 'Planificado', help: 'Lo que la receta planeaba; puede diferir de lo ejecutado.' },
  estimacion: { label: 'Estimación', help: 'Valor aproximado del registro histórico.' },
  calculo: { label: 'Cálculo', help: 'Calculado a partir de otros datos registrados; no fue medido.' },
  'no-recuperado': { label: 'No recuperado', help: 'dato_no_recuperado: no se completa con estimaciones.' },
};

export const STATUS_HIST: Record<HistoricalRecord['status'], string> = {
  elaborada: 'Receta elaborada',
  planificada: 'Receta planificada',
  experimental: 'Desarrollo experimental',
  asociada: 'Receta histórica asociada',
};

/** Código visible de un lote: "H-01" para históricos, "#12" para el resto. */
export const batchLabel = (b: Batch) => b.code ?? `#${b.number}`;

/** Fecha de cocción tal como se conoce. */
export const batchDate = (b: Batch) => (b.brewDateUnknown ? (b.brewDateText ? `${b.brewDateText} (fecha exacta no recuperada)` : 'Fecha no recuperada') : fmtDate(b.brewDate));

/** Día relativo al inicio del lote (para lotes sin fecha real). */
export const relDay = (b: Batch, t: number) => `Día ${fmt((t - b.brewDate) / 86_400_000, 1)}`;

/** Fecha y hora de un registro del lote; si la fecha real no se conoce, solo el día relativo. */
export const batchWhen = (b: Batch, t: number) => (b.brewDateUnknown ? `${relDay(b, t)} (relativo)` : fmtDateTime(t));

export function HistoricalCard({ record, title = 'Registro histórico' }: { record: HistoricalRecord; title?: string }) {
  return (
    <div className="card hist-card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="chip">{STATUS_HIST[record.status]}</span>
      </div>
      {record.incomplete && (
        <p className="hist-banner">
          Receta incompleta: los cálculos no representan este lote. Solo se muestran los datos que se conocen; lo demás queda como <code>dato_no_recuperado</code>.
        </p>
      )}
      {record.warnings.map((w) => (
        <p key={w} className="hist-warning">
          {w}
        </p>
      ))}
      {record.values.length > 0 && (
        <table className="table">
          <tbody>
            {record.values.map((v, i) => (
              <tr key={i}>
                <td className="muted">{v.label}</td>
                <td>
                  {v.value}
                  {v.note && (
                    <div className="faint" style={{ fontSize: '0.78rem' }}>
                      {v.note}
                    </div>
                  )}
                </td>
                <td className="r">
                  <span className={`src src-hist-${v.kind}`} title={KIND_LABEL[v.kind].help}>
                    {KIND_LABEL[v.kind].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {record.missing.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <div className="stat-label">Datos no recuperados</div>
          <div className="row" style={{ gap: '0.35rem', marginTop: '0.3rem' }}>
            {record.missing.map((m) => (
              <span key={m} className="chip chip-missing" title="dato_no_recuperado">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
      {record.notes.length > 0 && (
        <ul className="hist-notes">
          {record.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="faint" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
        {record.origin}. Orden de confianza: confirmado › medición › ejecución › planificado › estimación.
      </p>
    </div>
  );
}
