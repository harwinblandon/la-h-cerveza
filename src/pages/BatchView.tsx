import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FermentationChart } from '../components/batch/FermentationChart';
import { TimerPlan } from '../components/batch/Timer';
import { defaultTimers } from '../domain/timers';
import { Field, NumberInput, Stat, Tabs, fmt, fmtDate, fmtDateTime, fmtKg } from '../components/ui';
import { db } from '../db';
import { SourceTag } from '../components/Provenance';
import { SensoryCompare, SensoryEditor } from '../components/Sensory';
import { predictSensory } from '../domain/sensory';
import {
  PHASE_LABEL,
  batchTimeline,
  brewDaySteps,
  plannedVsActual,
  brewhouseEfficiency,
  checkPreBoil,
  fermentationSchedule,
  fermentationStatus,
  readingSg,
  type BrewPhase,
} from '../domain/batch';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { PRIMING_SUGARS, kegPsi, primingSugarGrams } from '../domain/calc/tools';
import { fmtSg, psiToBar, uid } from '../domain/calc/units';
import type { Batch, BatchEvent, BatchStatus, BrewMeasureKey, Packaging, PrimingSugarId } from '../domain/types';
import { byId } from '../domain/catalog';
import { useCatalog } from '../hooks';
import { STATUS_LABEL } from './Batches';
import { HistoricalCard, batchDate, batchLabel, batchWhen, relDay } from '../components/Historical';

type Tab = 'registro' | 'coccion' | 'fermentacion' | 'envasado' | 'plan' | 'historia' | 'cata';

export default function BatchView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const batch = useLiveQuery(() => db.batches.get(id!), [id]);
  const [tab, setTab] = useState<Tab | null>(null);

  if (batch === undefined) return <p className="muted">Cargando…</p>;
  if (!batch) return <p>No encontré este lote.</p>;

  const save = (patch: Partial<Batch>) => db.batches.update(batch.id, { ...patch, updatedAt: Date.now() });
  // Cambios que dependen del valor anterior: se aplican sobre lo que hay en la base,
  // no sobre la copia en pantalla (evita que un cambio rápido pise a otro).
  const mutate = (fn: (b: Batch) => void) =>
    db.batches
      .where('id')
      .equals(batch.id)
      .modify((b) => {
        fn(b);
        b.updatedAt = Date.now();
      });
  const changeStatus = (status: BatchStatus) =>
    mutate((b) => {
      b.status = status;
      b.events = [...(b.events ?? []), { uid: uid(), at: Date.now(), kind: 'estado', text: `Estado: ${STATUS_LABEL[status]}`, source: 'usuario' }];
    });
  const NEXT: Partial<Record<BatchStatus, [BatchStatus, string, Tab]>> = {
    planificado: ['coccion', 'Empezar la cocción', 'coccion'],
    coccion: ['fermentando', 'Pasar a fermentación', 'fermentacion'],
    fermentando: ['maduracion', 'Pasar a maduración', 'fermentacion'],
    maduracion: ['envasado', 'Envasar', 'envasado'],
    envasado: ['terminado', 'Marcar como terminado', 'cata'],
  };
  const next = NEXT[batch.status];
  const current: Tab = tab ?? (batch.historical ? 'registro' : batch.status === 'fermentando' || batch.status === 'maduracion' ? 'fermentacion' : batch.status === 'envasado' || batch.status === 'terminado' ? 'envasado' : 'coccion');

  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/lotes" className="faint" style={{ fontSize: '0.85rem' }}>
            ← Lotes
          </Link>
          <h1>
            {batchLabel(batch)} · {batch.name}
          </h1>
          <p className="muted">
            Receta: <Link to={`/recetas/${batch.recipeId}`}>{batch.recipe.name}</Link>
            {batch.recipeVersionNumber ? <span className="chip chip-accent" style={{ marginLeft: 6 }}>V{batch.recipeVersionNumber}</span> : null} · {fmt(batch.recipe.batchSizeL)} L
          </p>
        </div>
        <div className="row">
          <Field label="Fecha de cocción">
            {batch.brewDateUnknown ? (
              <div className="row" style={{ gap: '0.4rem' }}>
                <span className="chip chip-missing" title="dato_no_recuperado">
                  {batchDate(batch)}
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const d = prompt('Fecha real de cocción (AAAA-MM-DD). Los días de las lecturas se cuentan desde ella.');
                    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
                    mutate((b) => {
                      const shift = new Date(`${d}T08:00`).getTime() - b.brewDate;
                      b.brewDate += shift;
                      b.brewDateUnknown = false;
                      b.readings = b.readings.map((r) => ({ ...r, at: r.at + shift }));
                      b.events = (b.events ?? []).map((e) => ({ ...e, at: e.at + shift }));
                    });
                  }}
                >
                  Fijar fecha
                </button>
              </div>
            ) : (
            <input
              type="date"
              className="input"
              value={new Date(batch.brewDate - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
              onChange={(e) => e.target.value && save({ brewDate: new Date(`${e.target.value}T08:00`).getTime() })}
            />
            )}
          </Field>
          <Field label="Estado">
            <select className="input" value={batch.status} onChange={(e) => changeStatus(e.target.value as BatchStatus)}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <div className="sticky-bar no-print">
      <Tabs<Tab>
        value={current}
        onChange={setTab}
        tabs={[
          ...(batch.historical ? [['registro', 'Registro histórico'] as [Tab, string]] : []),
          ['coccion', 'Día de cocción'],
          ['fermentacion', 'Fermentación'],
          ['envasado', 'Envasado'],
          ['plan', 'Plan vs real'],
          ['historia', 'Línea de tiempo'],
          ['cata', 'Cata'],
        ]}
      />
      </div>
      {current === 'registro' && batch.historical && (
        <>
          <HistoricalCard record={batch.historical} title="Registro histórico del lote" />
          {batch.recipe.historical && <HistoricalCard record={batch.recipe.historical} title="Registro de la receta usada" />}
          {batch.brewDateUnknown && (
            <p className="faint" style={{ fontSize: '0.85rem' }}>
              La fecha de cocción no se recuperó: en las lecturas y la línea de tiempo los días se cuentan de forma relativa al inicio del lote.
            </p>
          )}
        </>
      )}
      {current === 'coccion' && <BrewDay batch={batch} save={save} mutate={mutate} />}
      {current === 'fermentacion' && <Fermentation batch={batch} save={save} mutate={mutate} />}
      {current === 'envasado' && <PackagingTab batch={batch} save={save} mutate={mutate} />}
      {current === 'plan' && <PlanVsActual batch={batch} />}
      {current === 'historia' && <TimelineTab batch={batch} save={save} mutate={mutate} />}
      {current === 'cata' && (
        <div className="card">
          <h2>Cata y conclusiones</h2>
          <TastingProfile batch={batch} save={save} mutate={mutate} />
          <Field label="Calificación">
            <div className="row">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className="btn btn-ghost" style={{ fontSize: '1.5rem', padding: '0 0.2rem' }} onClick={() => save({ rating: n })}>
                  {(batch.rating ?? 0) >= n ? '★' : '☆'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Notas de cata (aroma, apariencia, sabor, cuerpo, impresión general)">
            <textarea className="input" style={{ minHeight: 200 }} value={batch.tastingNotes ?? ''} onChange={(e) => save({ tastingNotes: e.target.value })} />
          </Field>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm('¿Eliminar este lote y todas sus mediciones?')) return;
                await db.batches.delete(batch.id);
                navigate('/lotes');
              }}
            >
              Eliminar lote
            </button>
          </div>
        </div>
      )}
      <div className="action-bar no-print">
        <Link className="btn" to={`/recetas/${batch.recipeId}`}>
          Ver receta
        </Link>
        <select className="input" style={{ width: 'auto' }} value={batch.status} onChange={(e) => changeStatus(e.target.value as BatchStatus)} aria-label="Estado del lote">
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span className="spacer" />
        {next && (
          <button
            className="btn btn-primary"
            onClick={() => {
              changeStatus(next[0]);
              setTab(next[2]);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            {next[1]}
          </button>
        )}
      </div>
    </>
  );
}

const localNowStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/** Si el usuario no cambió la hora sugerida, usa el instante exacto (los minutos del campo pierden los segundos). */
const atFrom = (when: string) => (!when || when === localNowStr() ? Date.now() : new Date(when).getTime());

interface TabProps {
  batch: Batch;
  save: (patch: Partial<Batch>) => void;
  mutate: (fn: (b: Batch) => void) => void;
}

function BrewDay({ batch, mutate }: TabProps) {
  const r = batch.recipe;
  const catalog = useCatalog();
  const source = byId(catalog.waters, r.water.sourceProfileId);
  const stats = useMemo(() => computeRecipeStats(r, source), [r, source]);
  const steps = useMemo(() => brewDaySteps(r, stats), [r, stats]);
  const bd = batch.brewDay;
  // Cada medición guarda también la hora en que se tomó (para la línea de tiempo).
  const measure = (key: BrewMeasureKey) => (n: number) =>
    mutate((b) => void (b.brewDay = { ...b.brewDay, [key]: n, measuredAt: { ...b.brewDay.measuredAt, [key]: Date.now() } }));
  const logEvent = (ev: Omit<BatchEvent, 'uid' | 'at'>) => mutate((b) => void (b.events = [...(b.events ?? []), { ...ev, uid: uid(), at: Date.now() }]));
  const done = steps.filter((s) => bd.done[s.id]).length;
  const pre = bd.preBoilSg && bd.preBoilVolumeL ? checkPreBoil(r, bd.preBoilSg, bd.preBoilVolumeL) : undefined;
  const eff = bd.ogMeasured && bd.fermenterVolumeL ? brewhouseEfficiency(r, bd.ogMeasured, bd.fermenterVolumeL) : undefined;

  // Temporizadores del lote: se guardan la primera vez para que sobrevivan a recargas y se sincronicen.
  useEffect(() => {
    if (!batch.timers) mutate((b) => void (b.timers ??= defaultTimers(b.recipe)));
  }, [batch.timers, mutate]);
  const timers = batch.timers ?? [];
  const setTimers = (t: typeof timers) => mutate((b) => void (b.timers = t));
  const resetTimers = () => mutate((b) => void (b.timers = defaultTimers(b.recipe)));

  return (
    <div className="editor-layout">
      <div>
        {(['preparacion', 'macerado', 'hervor', 'enfriado'] as BrewPhase[]).map((phase) => {
          const items = steps.filter((s) => s.phase === phase);
          if (!items.length) return null;
          return (
            <div className="card" key={phase}>
              <h2>{PHASE_LABEL[phase]}</h2>
              {phase === 'macerado' && <TimerPlan timers={timers} onChange={setTimers} storagePrefix={`timer-${batch.id}`} phase={['macerado']} />}
              {phase === 'hervor' && (
                <TimerPlan timers={timers} onChange={setTimers} storagePrefix={`timer-${batch.id}`} phase={['hervor', 'whirlpool', 'otro']} onReset={resetTimers} />
              )}
              {items.map((s) => (
                <label key={s.id} className={`check ${bd.done[s.id] ? 'done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!bd.done[s.id]}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      mutate((b) => {
                        const nextDone = { ...b.brewDay.done };
                        if (checked) nextDone[s.id] = Date.now();
                        else delete nextDone[s.id];
                        b.brewDay = { ...b.brewDay, done: nextDone };
                        if (checked && b.status === 'planificado') b.status = 'coccion';
                      });
                    }}
                  />
                  <div>
                    <div className="check-title">
                      {s.title}
                      {typeof bd.done[s.id] === 'number' && (
                        <span className="faint" style={{ fontWeight: 400, fontSize: '0.78rem' }}>
                          {' '}
                          · {new Date(bd.done[s.id] as number).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {s.detail && <div className="check-detail">{s.detail}</div>}
                  </div>
                </label>
              ))}
            </div>
          );
        })}
      </div>
      <aside className="editor-side">
        <div className="card">
          <div className="card-head">
            <h3>Progreso</h3>
            <span className="muted">
              {done}/{steps.length}
            </span>
          </div>
          <div className="range-track" style={{ height: 8 }}>
            <div className="range-zone" style={{ left: 0, width: `${(done / steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="card">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>Mediciones</h3>
            <SourceTag source="medicion" />
          </div>
          <p className="faint" style={{ fontSize: '0.78rem', margin: '0.25rem 0 0.5rem' }}>
            En gris, el valor planeado. Se guarda la hora de cada medición.
          </p>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Agua de empaste">
              <NumberInput value={bd.strikeTempC} decimals={1} onChange={measure('strikeTempC')} placeholder={stats.strikeTempC?.toFixed(1)} unit="°C" />
            </Field>
            <Field label="Temp. macerado">
              <NumberInput value={bd.mashTempC} decimals={1} onChange={measure('mashTempC')} placeholder={stats.mashTempC?.toFixed(1)} unit="°C" />
            </Field>
            <Field label="pH macerado">
              <NumberInput value={bd.mashPH} decimals={2} onChange={measure('mashPH')} placeholder={stats.mashPh?.toFixed(2)} />
            </Field>
            <span />
            <Field label="Vol. pre-hervor">
              <NumberInput value={bd.preBoilVolumeL} decimals={1} onChange={measure('preBoilVolumeL')} placeholder={stats.water.preBoilL.toFixed(1)} unit="L" />
            </Field>
            <Field label="Densidad pre-hervor">
              <NumberInput value={bd.preBoilSg} decimals={3} onChange={measure('preBoilSg')} placeholder={stats.preBoilSg.toFixed(3)} />
            </Field>
            <Field label="Vol. post-hervor">
              <NumberInput value={bd.postBoilVolumeL} decimals={1} onChange={measure('postBoilVolumeL')} placeholder={stats.water.postBoilHotL.toFixed(1)} unit="L" />
            </Field>
            <Field label="OG medida">
              <NumberInput value={bd.ogMeasured} decimals={3} onChange={measure('ogMeasured')} placeholder={stats.og.toFixed(3)} />
            </Field>
            <Field label="Litros al fermentador">
              <NumberInput value={bd.fermenterVolumeL} decimals={1} onChange={measure('fermenterVolumeL')} placeholder={r.batchSizeL.toFixed(1)} unit="L" />
            </Field>
          </div>
          {bd.mashPH !== undefined && (bd.mashPH < 5.2 || bd.mashPH > 5.6) && (
            <p className="callout" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              {bd.mashPH > 5.6 ? 'pH alto: agrega ácido láctico de a 1 mL, revuelve y vuelve a medir a los 5 minutos.' : 'pH bajo: agrega bicarbonato de sodio de a 1 g y vuelve a medir.'}
            </p>
          )}
          {pre && (
            <div className={`sug ${Math.abs(pre.deltaPoints) > 2 ? 'sug-aviso' : 'sug-idea'}`} style={{ marginTop: '0.75rem' }}>
              <div className="sug-title">
                OG proyectada {fmtSg(pre.predictedOg)} (objetivo {fmtSg(pre.targetOg)})
              </div>
              <div className="sug-detail">
                {pre.mashEfficiencyPct !== undefined && <div>Eficiencia de macerado: {fmt(pre.mashEfficiencyPct, 0)} %</div>}
                <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                  {pre.options.map((o) => (
                    <li key={o} style={{ marginBottom: 4 }}>
                      {o}
                      {Math.abs(pre.deltaPoints) > 2 && (
                        <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => logEvent({ kind: 'correccion', phase: 'coccion', text: `Corrección elegida: ${o}`, sg: bd.preBoilSg, volumeL: bd.preBoilVolumeL, source: 'usuario' })}>
                          Lo hice
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {(batch.events ?? []).filter((e) => e.kind === 'correccion').map((e) => (
                  <div key={e.uid} className="faint" style={{ fontSize: '0.8rem' }}>
                    ✓ {fmtDateTime(e.at)} · {e.text}
                  </div>
                ))}
              </div>
            </div>
          )}
          {eff !== undefined && (
            <div className="sug sug-idea" style={{ marginTop: '0.75rem' }}>
              <div className="sug-title">Eficiencia de sala real: {fmt(eff, 0)} %</div>
              <div className="sug-detail">
                Planeada: {r.efficiencyPct} %. {Math.abs(eff - r.efficiencyPct) > 3 ? 'Actualiza la eficiencia de tu equipo en Equipos para que la próxima receta sea más precisa.' : 'Tu equipo está bien calibrado.'}
              </div>
            </div>
          )}
          {bd.ogMeasured && batch.status !== 'fermentando' && (
            <button
              className="btn btn-primary"
              style={{ marginTop: '0.75rem', width: '100%' }}
              onClick={() =>
                mutate((b) => {
                  b.status = 'fermentando';
                  b.events = [...(b.events ?? []), { uid: uid(), at: Date.now(), kind: 'estado', text: 'Inicio de fermentación', source: 'usuario' }];
                })
              }
            >
              Pasar a fermentación →
            </button>
          )}
        </div>
        <div className="card">
          <h3>Receta</h3>
          <div style={{ fontSize: '0.88rem' }}>
            {r.fermentables.map((f) => (
              <div key={f.uid} className="row-between">
                <span>{f.name}</span>
                <span className="num">{fmtKg(f.amountKg)}</span>
              </div>
            ))}
            <hr className="hr" />
            {r.hops.map((h) => (
              <div key={h.uid} className="row-between">
                <span>
                  {h.name} <span className="faint">({h.use === 'dry-hop' ? `DH ${h.time} d` : h.use === 'whirlpool' ? 'WP' : `${h.time} min`})</span>
                </span>
                <span className="num">{fmt(h.amountG, 0)} g</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function Fermentation({ batch, mutate }: TabProps) {
  const status = fermentationStatus(batch);
  // Un lote histórico no tiene tareas pendientes ni consejos de un lote en curso.
  const historic = batch.status === 'historico';
  const schedule = historic ? [] : fermentationSchedule(batch);
  const [sg, setSg] = useState<number>();
  const [brix, setBrix] = useState<number>();
  const [temp, setTemp] = useState<number>();
  const [psi, setPsi] = useState<number>();
  const [ph, setPh] = useState<number>();
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'sg' | 'brix'>('sg');
  const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [when, setWhen] = useState(localNow);
  const DAY = 86_400_000;
  const points = batch.readings.map((r) => ({ day: (r.at - batch.brewDate) / DAY, sg: readingSg(r, status.og), tempC: r.tempC }));

  const addReading = () => {
    if (sg === undefined && brix === undefined && temp === undefined && psi === undefined && ph === undefined && !note) return;
    const reading = { uid: uid(), at: atFrom(when), sg: mode === 'sg' ? sg : undefined, brix: mode === 'brix' ? brix : undefined, tempC: temp, pressurePsi: psi, ph, source: 'medicion' as const, note: note || undefined };
    mutate((b) => void (b.readings = [...b.readings, reading]));
    setSg(undefined);
    setBrix(undefined);
    setPsi(undefined);
    setPh(undefined);
    setNote('');
    setWhen(localNow());
  };

  const verdictBadge: Record<typeof status.verdict, [string, string]> = {
    'sin-datos': ['badge-idea', 'Sin datos'],
    activa: ['badge-warn', 'Activa'],
    terminada: ['badge-ok', 'Terminada'],
    estancada: ['badge-bad', 'Posiblemente estancada'],
    lista: ['badge-ok', 'Lista'],
  };

  return (
    <div className="editor-layout">
      <div>
        <div className="card">
          <div className="card-head">
            <h2>Seguimiento</h2>
            {historic ? <span className="badge badge-idea">Histórico</span> : <span className={`badge ${verdictBadge[status.verdict][0]}`}>{verdictBadge[status.verdict][1]}</span>}
          </div>
          <div className="stats" style={{ marginBottom: '1rem' }}>
            <Stat label="OG" value={fmtSg(status.og)} />
            <Stat label="Actual" value={status.currentSg ? fmtSg(status.currentSg) : '—'} />
            <Stat label="FG esperada" value={fmtSg(status.expectedFg)} />
            <Stat label="Atenuación" value={status.attenuation ? `${fmt(status.attenuation, 0)} %` : '—'} />
            <Stat label="ABV actual" value={status.abvNow ? `${fmt(status.abvNow)} %` : '—'} />
          </div>
          <FermentationChart points={points} og={status.og} expectedFg={status.expectedFg} />
          {!historic && status.advice.map((a) => (
            <div key={a} className="sug sug-idea" style={{ marginTop: '0.5rem' }}>
              <div className="sug-detail">{a}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2>Lecturas</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="r">Día</th>
                  <th className="r">Densidad</th>
                  <th className="r">Temp.</th>
                  <th className="r">Presión / pH</th>
                  <th>Nota</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...batch.readings]
                  .sort((a, b) => b.at - a.at)
                  .map((r) => (
                    <tr key={r.uid}>
                      <td>{batchWhen(batch, r.at)}</td>
                      <td className="r num">{fmt((r.at - batch.brewDate) / DAY, 1)}</td>
                      <td className="r num">
                        {readingSg(r, status.og)?.toFixed(3) ?? '—'}
                        {r.brix !== undefined && <span className="faint"> ({fmt(r.brix)} °Bx)</span>}
                      </td>
                      <td className="r num">{r.tempC !== undefined ? `${fmt(r.tempC)} °C` : '—'}</td>
                      <td className="r num">
                        {[r.pressurePsi !== undefined && `${fmt(r.pressurePsi)} PSI`, r.ph !== undefined && `pH ${fmt(r.ph, 2)}`].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td>{r.note}</td>
                      <td className="r">
                        <button className="btn btn-sm btn-ghost btn-danger" onClick={() => mutate((b) => void (b.readings = b.readings.filter((x) => x.uid !== r.uid)))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {batch.readings.length === 0 && <p className="faint">Aún no hay lecturas.</p>}
        </div>
      </div>
      <aside className="editor-side">
        <div className="card">
          <h3>Nueva lectura</h3>
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <button className={`btn btn-sm ${mode === 'sg' ? 'btn-primary' : ''}`} onClick={() => setMode('sg')}>
              Densímetro
            </button>
            <button className={`btn btn-sm ${mode === 'brix' ? 'btn-primary' : ''}`} onClick={() => setMode('brix')}>
              Refractómetro
            </button>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {mode === 'sg' ? (
              <Field label="Densidad">
                <NumberInput value={sg} decimals={3} onChange={setSg} placeholder="1.020" />
              </Field>
            ) : (
              <Field label="Brix" hint="Se corrige por alcohol">
                <NumberInput value={brix} decimals={1} onChange={setBrix} placeholder="7,5" />
              </Field>
            )}
            <Field label="Temperatura">
              <NumberInput value={temp} decimals={1} onChange={setTemp} unit="°C" />
            </Field>
            <Field label="Presión (opcional)">
              <NumberInput value={psi} decimals={1} onChange={setPsi} unit="PSI" />
            </Field>
            <Field label="pH (opcional)">
              <NumberInput value={ph} decimals={2} onChange={setPh} />
            </Field>
          </div>
          <Field label="Fecha y hora">
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Nota">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Krausen alto, olor a azufre…" />
          </Field>
          <button className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={addReading}>
            Guardar lectura
          </button>
        </div>
        {schedule.length > 0 && <div className="card">
          <h3>Calendario</h3>
          {schedule.map((s) => {
            const past = s.at < Date.now();
            const isAddition = /^(Dry hop|Agregar)/.test(s.title);
            const doneEv = (batch.events ?? []).find((e) => e.kind === 'adicion' && e.text === s.title);
            return (
              <div key={s.title + s.at} className="row-between" style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border)', opacity: past && !isAddition ? 0.6 : 1 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{s.title}</div>
                  {s.detail && <div className="faint" style={{ fontSize: '0.8rem' }}>{s.detail}</div>}
                  {doneEv && <div className="plan-ok" style={{ fontSize: '0.8rem' }}>✓ Hecho el {fmtDateTime(doneEv.at)}</div>}
                </div>
                <div className="row">
                  <span className="chip">{fmtDate(s.at)}</span>
                  {isAddition && !doneEv && (
                    <button
                      className="btn btn-sm"
                      onClick={() => mutate((b) => void (b.events = [...(b.events ?? []), { uid: uid(), at: Date.now(), kind: 'adicion', phase: 'fermentacion', text: s.title, source: 'usuario' }]))}
                    >
                      Hecho
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>}
      </aside>
    </div>
  );
}

function PackagingTab({ batch, mutate }: TabProps) {
  const status = fermentationStatus(batch);
  const r = batch.recipe;
  const p: Packaging = batch.packaging ?? {
    method: r.carbonation.method === 'forzado' ? 'barril' : 'botella',
    volumeL: (batch.brewDay.fermenterVolumeL ?? r.batchSizeL) - r.equipment.fermenterLossL,
    beerTempC: Math.max(...r.fermentation.filter((s) => s.tempC > 5).map((s) => s.tempC), 18),
    volumes: r.carbonation.volumes,
    sugar: r.carbonation.primingSugar,
  };
  const set = (patch: Partial<Packaging>) => mutate((b) => void (b.packaging = { ...p, ...b.packaging, ...patch }));
  const sugarG = primingSugarGrams(p.volumes ?? 2.4, p.beerTempC ?? 18, p.volumeL ?? 0, p.sugar ?? 'sacarosa');
  const psi = kegPsi(p.volumes ?? 2.4, 4);
  const bottles330 = Math.floor(((p.volumeL ?? 0) * 1000) / 330);

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Envasado</h2>
        {status.verdict !== 'terminada' && status.currentSg && (
          <p className="callout" style={{ fontSize: '0.88rem' }}>
            ⚠︎ La fermentación no parece terminada ({fmtSg(status.currentSg)} frente a {fmtSg(status.expectedFg)} esperada). Embotellar antes de tiempo puede causar exceso de gas o botellas que explotan.
          </p>
        )}
        <div className="grid grid-2">
          <Field label="Método">
            <select className="input" value={p.method} onChange={(e) => set({ method: e.target.value as 'botella' })}>
              <option value="botella">Botella (priming)</option>
              <option value="barril">Barril (forzado)</option>
            </select>
          </Field>
          <Field label="Litros a envasar">
            <NumberInput value={p.volumeL} decimals={1} onChange={(n) => set({ volumeL: n })} unit="L" />
          </Field>
          <Field label="Volúmenes de CO₂">
            <NumberInput value={p.volumes} decimals={1} onChange={(n) => set({ volumes: n })} unit="vol" />
          </Field>
          {p.method === 'botella' && (
            <>
              <Field label="Temp. máxima tras fermentar" hint="Define el CO₂ que ya tiene la cerveza">
                <NumberInput value={p.beerTempC} decimals={1} onChange={(n) => set({ beerTempC: n })} unit="°C" />
              </Field>
              <Field label="Azúcar">
                <select className="input" value={p.sugar} onChange={(e) => set({ sugar: e.target.value as PrimingSugarId })}>
                  {Object.entries(PRIMING_SUGARS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
        <div className="callout" style={{ marginTop: '1rem' }}>
          {p.method === 'botella' ? (
            <>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{fmt(sugarG, 0)} g de {PRIMING_SUGARS[p.sugar ?? 'sacarosa'].name.toLowerCase()}</div>
              Disuélvelos en ~{fmt(Math.max(150, sugarG * 2), 0)} mL de agua hervida, enfría y mezcla suavemente con la cerveza en el balde de embotellado. Rinde ~{bottles330} botellas de 330 mL. Deja 2 semanas a 20–24 °C.
            </>
          ) : (
            <>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                {fmt(psi, 1)} PSI ({fmt(psiToBar(psi), 2)} bar) a 4 °C
              </div>
              Conecta el CO₂ a esa presión y espera 7–10 días. Para servir, baja a 8–12 PSI según tu línea.
            </>
          )}
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button
            className="btn btn-primary"
            onClick={() =>
              mutate((b) => {
                b.status = 'envasado';
                b.packaging = { ...p, ...b.packaging, date: Date.now(), sugarG: p.method === 'botella' ? sugarG : undefined, psi: p.method === 'barril' ? psi : undefined };
              })
            }
          >
            Marcar como envasado
          </button>
          {p.date && <span className="muted">Envasado el {fmtDate(p.date)}</span>}
        </div>
      </div>
      <div className="card">
        <h2>Resumen del lote</h2>
        <dl className="kv">
          <dt>OG</dt>
          <dd>{fmtSg(status.og)}</dd>
          <dt>FG</dt>
          <dd>{status.currentSg ? fmtSg(status.currentSg) : '—'}</dd>
          <dt>ABV</dt>
          <dd>{status.abvNow ? `${fmt(status.abvNow)} %` : '—'}</dd>
          <dt>Atenuación</dt>
          <dd>{status.attenuation ? `${fmt(status.attenuation, 0)} %` : '—'}</dd>
          <dt>Litros al fermentador</dt>
          <dd>{batch.brewDay.fermenterVolumeL ? `${fmt(batch.brewDay.fermenterVolumeL)} L` : '—'}</dd>
        </dl>
        <Field label="Notas de envasado">
          <textarea className="input" value={p.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

function PlanVsActual({ batch }: { batch: Batch }) {
  const catalog = useCatalog();
  const source = byId(catalog.waters, batch.recipe.water.sourceProfileId);
  const rows = plannedVsActual(batch, source);
  const measured = rows.filter((r) => r.status !== 'pendiente');
  const deviations = rows.filter((r) => r.status === 'desvio');
  return (
    <div className="card">
      <div className="card-head">
        <h2>Planeado frente a real</h2>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {measured.length} de {rows.length} medidos · {deviations.length} desvío{deviations.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Parámetro</th>
              <th className="r">Plan</th>
              <th className="r">Real</th>
              <th className="r">Diferencia</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.label}</div>
                  {r.status === 'desvio' && r.hint && <div className="faint" style={{ fontSize: '0.78rem' }}>{r.hint}</div>}
                </td>
                <td className="r num">
                  {r.planned !== undefined ? r.format(r.planned) : '—'} <SourceTag source={r.plannedSource} compact />
                </td>
                <td className="r num">
                  {r.actual !== undefined ? (
                    <>
                      {r.format(r.actual)} <SourceTag source={r.actualSource} compact />
                    </>
                  ) : (
                    <span className="faint">pendiente</span>
                  )}
                </td>
                <td className={`r num plan-${r.status}`}>
                  {r.actual !== undefined && r.planned !== undefined ? `${r.actual - r.planned >= 0 ? '+' : '−'}${r.format(Math.abs(r.actual - r.planned))}` : ''}
                </td>
                <td>{r.status === 'ok' ? <span className="badge badge-ok">ok</span> : r.status === 'desvio' ? <span className="badge badge-warn">desvío</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
        Un desvío no es un error: es información. Con varios lotes, La H podrá usar estas diferencias para calibrar tu equipo.
      </p>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  paso: 'Paso',
  medicion: 'Medición',
  lectura: 'Lectura',
  adicion: 'Adición',
  correccion: 'Corrección',
  nota: 'Nota',
  estado: 'Estado',
};

function TimelineTab({ batch, mutate }: TabProps) {
  const catalog = useCatalog();
  const source = byId(catalog.waters, batch.recipe.water.sourceProfileId);
  const stats = useMemo(() => computeRecipeStats(batch.recipe, source), [batch.recipe, source]);
  const items = batchTimeline(batch, brewDaySteps(batch.recipe, stats));
  const localNow = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [kind, setKind] = useState<BatchEvent['kind']>('nota');
  const [text, setText] = useState('');
  const [when, setWhen] = useState(localNow);
  const [tempC, setTempC] = useState<number>();
  const [volumeL, setVolumeL] = useState<number>();
  const [sg, setSg] = useState<number>();
  const [ph, setPh] = useState<number>();

  const add = () => {
    if (!text.trim()) return;
    const ev: BatchEvent = {
      uid: uid(),
      at: atFrom(when),
      kind,
      text: text.trim(),
      tempC,
      volumeL,
      sg,
      ph,
      source: tempC !== undefined || volumeL !== undefined || sg !== undefined || ph !== undefined ? 'medicion' : 'usuario',
    };
    mutate((b) => void (b.events = [...(b.events ?? []), ev]));
    setText('');
    setTempC(undefined);
    setVolumeL(undefined);
    setSg(undefined);
    setPh(undefined);
    setWhen(localNow());
  };

  let lastDay = '';
  return (
    <div className="editor-layout">
      <div className="card">
        <h2>Línea de tiempo</h2>
        <p className="faint" style={{ fontSize: '0.82rem' }}>
          Todo lo que pasó en el lote: pasos marcados, mediciones, correcciones, adiciones y lecturas, en orden.
        </p>
        <div className="timeline">
          {items.map((it) => {
            const day = batch.brewDateUnknown ? `${relDay(batch, it.at).replace(/,\d+$/, '')} (fecha real no recuperada)` : new Date(it.at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={it.id}>
                {showDay && <div className="stat-label" style={{ margin: '0.6rem 0 0.2rem -0.4rem' }}>{day}</div>}
                <div className={`tl-item tl-${it.kind}`}>
                  <div className="tl-time">
                    {batch.brewDateUnknown ? relDay(batch, it.at) : new Date(it.at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {KIND_LABEL[it.kind]} <SourceTag source={it.source} compact />
                  </div>
                  <div className="row-between">
                    <div className="tl-title">{it.title}</div>
                    {it.eventUid && (
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        title="Borrar este evento"
                        onClick={() => confirm('¿Borrar este evento?') && mutate((b) => void (b.events = (b.events ?? []).filter((e) => e.uid !== it.eventUid)))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {it.detail && <div className="tl-detail">{it.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <aside className="editor-side">
        <div className="card">
          <h3>Registrar evento</h3>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Tipo">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as BatchEvent['kind'])}>
                <option value="nota">Nota / observación</option>
                <option value="medicion">Medición</option>
                <option value="adicion">Adición</option>
                <option value="correccion">Corrección</option>
              </select>
            </Field>
            <Field label="Fecha y hora">
              <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
          </div>
          <Field label="Qué pasó">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ej. Agregué 2 g de yeso al macerado" />
          </Field>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: '0.5rem' }}>
            <Field label="Temperatura">
              <NumberInput value={tempC} decimals={1} onChange={setTempC} unit="°C" />
            </Field>
            <Field label="Volumen">
              <NumberInput value={volumeL} decimals={1} onChange={setVolumeL} unit="L" />
            </Field>
            <Field label="Densidad">
              <NumberInput value={sg} decimals={3} onChange={setSg} />
            </Field>
            <Field label="pH">
              <NumberInput value={ph} decimals={2} onChange={setPh} />
            </Field>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={add} disabled={!text.trim()}>
            Agregar a la línea de tiempo
          </button>
        </div>
      </aside>
    </div>
  );
}

/** Resultado sensorial del lote con la misma escala del objetivo. */
function TastingProfile({ batch, mutate }: TabProps) {
  const catalog = useCatalog();
  const source = byId(catalog.waters, batch.recipe.water.sourceProfileId);
  const stats = useMemo(() => computeRecipeStats(batch.recipe, source), [batch.recipe, source]);
  const prediction = useMemo(() => predictSensory(batch.recipe, stats, catalog), [batch.recipe, stats, catalog]);
  // Estado local inmediato: guardar en la base es asíncrono y no debe pisar cambios seguidos.
  const [values, setValues] = useState(batch.evaluation?.sensory ?? {});
  const change = (sensory: typeof values) => {
    setValues(sensory);
    mutate((b) => void (b.evaluation = { ...b.evaluation, sensory, at: Date.now() }));
  };
  return (
    <div className="stack" style={{ marginBottom: '1rem' }}>
      <div>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Perfil sensorial del resultado</h3>
          <SourceTag source="medicion" note="Tu evaluación al probar la cerveza terminada" />
        </div>
        <p className="faint" style={{ fontSize: '0.82rem', margin: '0.25rem 0 0.5rem' }}>
          Evalúa la cerveza terminada con la misma escala del objetivo (activa las variables que puedas juzgar). La línea azul es lo que predijo La H.
        </p>
        <SensoryEditor values={values} predicted={prediction.values} onChange={change} />
      </div>
      {Object.keys(values).length > 0 && (
        <div>
          <h3>Objetivo · Predicción · Resultado</h3>
          <SensoryCompare target={batch.recipe.intent?.target} prediction={prediction} result={values} />
        </div>
      )}
    </div>
  );
}
