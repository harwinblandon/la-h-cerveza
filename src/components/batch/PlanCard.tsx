import { uid } from '../../domain/calc/units';
import { nextStep, planStatus } from '../../domain/plan';
import type { Batch } from '../../domain/types';
import { fmt, fmtDateTime } from '../ui';

/** Plan del lote por condiciones: qué toca, qué falta según las lecturas, y lo ya hecho. */
export function PlanCard({ batch, mutate }: { batch: Batch; mutate: (fn: (b: Batch) => void) => void }) {
  const status = planStatus(batch);
  if (!status.length) return null;
  const next = nextStep(status);
  const markDone = (uidStep: string, title: string, phase: string, force: boolean) => {
    if (force && !confirm('Todavía no se cumplen todas las condiciones. ¿Marcarlo como hecho igual?')) return;
    mutate((b) => {
      b.planDone = { ...b.planDone, [uidStep]: Date.now() };
      b.events = [...(b.events ?? []), { uid: uid(), at: Date.now(), kind: phase === 'adicion' ? 'adicion' : 'estado', phase: 'fermentacion', text: title, source: 'usuario' }];
    });
  };
  const undo = (uidStep: string) =>
    mutate((b) => {
      const d = { ...b.planDone };
      delete d[uidStep];
      b.planDone = d;
    });

  return (
    <div className="card">
      <div className="card-head">
        <h2>Plan</h2>
        <span className="faint num">
          {status.filter((s) => s.done).length}/{status.length}
        </span>
      </div>
      <ol className="plan-run">
        {status.map((s) => {
          const isNext = s.step.uid === next?.step.uid;
          return (
            <li key={s.step.uid} className={s.done ? 'done' : isNext ? 'next' : ''}>
              <div className="row-between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <strong>
                    {s.done ? '✓ ' : ''}
                    {s.step.title}
                  </strong>
                  {s.step.tempC && (
                    <span className="faint">
                      {' '}
                      · {s.step.tempC[0] === s.step.tempC[1] ? s.step.tempC[0] : `${s.step.tempC[0]}–${s.step.tempC[1]}`} °C
                    </span>
                  )}
                  {s.done && <div className="faint" style={{ fontSize: '0.78rem' }}>Hecho {fmtDateTime(s.done)}</div>}
                </div>
                {!s.done && isNext && (
                  <button className={`btn btn-sm ${s.ready ? 'btn-primary' : ''}`} onClick={() => markDone(s.step.uid, s.step.title, s.step.phase, !s.ready)}>
                    {s.step.phase === 'adicion' ? 'Agregado' : 'Hecho'}
                  </button>
                )}
                {s.done && (
                  <button className="btn btn-sm btn-ghost" title="Deshacer" onClick={() => undo(s.step.uid)}>
                    ↶
                  </button>
                )}
              </div>
              {!s.done && (isNext || s.checks.length > 0) && s.checks.length > 0 && (
                <ul className="plan-checks">
                  {s.checks.map((c) => (
                    <li key={c.text} className={c.ok ? 'ok' : ''}>
                      {c.ok ? '✓' : '○'} {c.text}
                    </li>
                  ))}
                </ul>
              )}
              {s.contact && (
                <div className={`callout ${s.contact.state === 'pasado' ? 'callout-warn' : ''}`} style={{ fontSize: '0.84rem', marginTop: '0.4rem' }}>
                  Día {fmt(s.contact.days, 1)} de contacto (ventana {s.contact.min}–{s.contact.max} días).{' '}
                  {s.contact.state === 'antes'
                    ? s.step.checkEveryH
                      ? `Probar cada ${s.step.checkEveryH} h.`
                      : ''
                    : s.contact.state === 'ventana'
                      ? 'Ya se puede retirar si el sabor está donde lo buscas.'
                      : 'Pasó el máximo orientativo: retíralo para no extraer astringencia.'}
                </div>
              )}
              {isNext && s.step.detail && <div className="plan-detail">{s.step.detail}</div>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
