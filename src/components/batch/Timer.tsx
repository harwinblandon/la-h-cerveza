import { useEffect, useRef, useState } from 'react';
import { alertRemainingMin, newAlert, newTimer } from '../../domain/timers';
import type { BrewTimer, TimerAlertDef } from '../../domain/types';
import { NumberInput } from '../ui';

// Un solo contexto de audio, habilitado al tocar «Iniciar» (los navegadores bloquean el sonido sin un toque).
let audio: AudioContext | undefined;
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    /* sin audio */
  }
}

/** Timbre suave y neutro: dos notas senoidales con entrada y salida graduales. */
function chime(times = 1) {
  try {
    unlockAudio();
    const ctx = audio!;
    for (let i = 0; i < times; i++) {
      [523.25, 659.25].forEach((freq, k) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        o.connect(g);
        g.connect(ctx.destination);
        const t = ctx.currentTime + i * 1.1 + k * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t);
        o.stop(t + 0.95);
      });
    }
  } catch {
    /* sin audio */
  }
  try {
    navigator.vibrate?.([200, 120, 200]);
  } catch {
    /* sin vibración */
  }
}

function notify(text: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('Recetas', { body: text });
  } catch {
    /* sin notificaciones */
  }
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`;
};

interface RunState {
  endsAt?: number;
  remainingMs: number;
  /** Avisos que ya sonaron (uid). */
  fired: string[];
  /** Duración con la que se guardó (para ajustarse si se edita antes de arrancar). */
  total?: number;
}

/** Mantiene la pantalla encendida mientras corre un temporizador (si el navegador lo permite). */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | undefined;
    let cancelled = false;
    const request = () =>
      (navigator as Navigator & { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request('screen')
        .then((l) => (cancelled ? void l.release() : (lock = l)))
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}

/**
 * Temporizador que sobrevive a recargas (guarda la hora de fin) y avisa en cada momento programado.
 * Si el celular estuvo bloqueado o la pestaña en segundo plano, los avisos pendientes suenan al volver.
 */
export function TimerCard({ storageKey, timer, onEdit }: { storageKey: string; timer: BrewTimer; onEdit?: () => void }) {
  const total = timer.minutes * 60_000;
  const load = (): RunState => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw) as Partial<RunState>;
        const untouched = !s.endsAt && (s.fired ?? []).length === 0 && s.remainingMs === s.total;
        if (untouched && s.total !== total) return { remainingMs: total, fired: [], total };
        return { remainingMs: s.remainingMs ?? total, endsAt: s.endsAt, fired: s.fired ?? [], total: s.total ?? total };
      }
    } catch {
      /* almacenamiento no disponible */
    }
    return { remainingMs: total, fired: [], total };
  };
  const [state, setState] = useState<RunState>(load);
  const [now, setNow] = useState(Date.now());
  const doneFired = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...state, total }));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state, storageKey]);

  // Si se editan los minutos y el temporizador no ha arrancado, se ajusta.
  const prevTotal = useRef(total);
  useEffect(() => {
    if (prevTotal.current === total) return;
    const before = prevTotal.current;
    prevTotal.current = total;
    setState((s) => (!s.endsAt && s.remainingMs === before ? { ...s, remainingMs: total, total } : s));
  }, [total]);

  useEffect(() => {
    if (!state.endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.endsAt]);

  const remaining = state.endsAt ? state.endsAt - now : state.remainingMs;
  const running = !!state.endsAt && remaining > 0;
  useWakeLock(running);

  const marks = timer.alerts.map((a) => ({ a, at: alertRemainingMin(timer, a) * 60_000 })).sort((x, y) => y.at - x.at);

  useEffect(() => {
    if (!state.endsAt) return;
    const due = marks.filter((m) => remaining <= m.at && !state.fired.includes(m.a.uid));
    if (due.length) {
      setState((s) => ({ ...s, fired: [...s.fired, ...due.map((m) => m.a.uid)] }));
      chime(1);
      notify(due.map((m) => `${m.a.text}${m.a.note ? ` — ${m.a.note}` : ''}`).join(' · '));
    }
    if (remaining <= 0 && !doneFired.current) {
      doneFired.current = true;
      chime(2);
      notify(`${timer.label}: ¡tiempo cumplido!`);
    }
  }, [remaining, marks, state.endsAt, state.fired, timer.label]);

  const next = marks.find((m) => m.at < remaining && !state.fired.includes(m.a.uid));
  const start = () => {
    unlockAudio();
    try {
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission();
    } catch {
      /* sin notificaciones */
    }
    doneFired.current = remaining <= 0;
    setNow(Date.now());
    setState((s) => ({ ...s, endsAt: Date.now() + remaining }));
  };

  return (
    <div className="timer-card">
      <div className="row-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="stat-label">{timer.label}</div>
          <div className="timer" style={{ color: remaining <= 0 ? 'var(--ok)' : undefined }}>
            {remaining <= 0 ? '¡Listo!' : mmss(remaining)}
          </div>
          {timer.note && <div className="faint" style={{ fontSize: '0.82rem' }}>{timer.note}</div>}
          {next && running && (
            <div className="muted" style={{ fontSize: '0.88rem', marginTop: '0.2rem' }}>
              Próximo: <strong>{next.a.text}</strong> en {mmss(remaining - next.at)}
            </div>
          )}
        </div>
        <div className="row">
          {running ? (
            <button className="btn" onClick={() => setState((s) => ({ ...s, endsAt: undefined, remainingMs: remaining }))}>
              Pausar
            </button>
          ) : (
            <button className="btn btn-primary" disabled={remaining <= 0} onClick={start}>
              {remaining < total && remaining > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
          )}
          <button
            className="btn btn-ghost"
            title="Un minuto más"
            onClick={() => setState((s) => (s.endsAt ? { ...s, endsAt: Math.max(Date.now(), s.endsAt) + 60_000 } : { ...s, remainingMs: Math.max(0, s.remainingMs) + 60_000 }))}
          >
            +1
          </button>
          <button
            className="btn btn-ghost"
            title="Reiniciar"
            onClick={() => {
              if (running && !confirm(`¿Reiniciar «${timer.label}»?`)) return;
              doneFired.current = false;
              setState({ remainingMs: total, fired: [], total });
            }}
          >
            ↺
          </button>
          {onEdit && (
            <button className="btn btn-ghost" title="Editar tiempos y avisos" onClick={onEdit}>
              ✎
            </button>
          )}
        </div>
      </div>
      {marks.length > 0 && (
        <ul className="timer-marks">
          {marks.map(({ a, at }) => {
            const passed = state.fired.includes(a.uid);
            return (
              <li key={a.uid} className={passed ? 'passed' : next?.a.uid === a.uid && running ? 'next' : ''}>
                <span className="num timer-mark-at">{a.from === 'faltan' ? `faltan ${a.atMin}` : `a los ${a.atMin}`} min</span>
                <span>
                  {passed ? '✓ ' : ''}
                  {a.text}
                  {a.note && <span className="faint"> · {a.note}</span>}
                </span>
                <span className="faint num">{at > total ? '' : mmss(total - at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Editor de un temporizador: nombre, minutos, nota y avisos (cuándo, qué y qué se espera). */
function TimerEditor({ timer, onChange, onDelete, onDone }: { timer: BrewTimer; onChange: (t: BrewTimer) => void; onDelete: () => void; onDone: () => void }) {
  const setAlert = (id: string, patch: Partial<TimerAlertDef>) => onChange({ ...timer, alerts: timer.alerts.map((a) => (a.uid === id ? { ...a, ...patch } : a)) });
  return (
    <div className="timer-card timer-edit">
      <div className="grid grid-3">
        <label className="field">
          <span>Nombre</span>
          <input className="input" value={timer.label} onChange={(e) => onChange({ ...timer, label: e.target.value })} />
        </label>
        <label className="field">
          <span>Duración</span>
          <NumberInput value={timer.minutes} decimals={0} unit="min" onChange={(n) => onChange({ ...timer, minutes: Math.max(1, n) })} />
        </label>
        <label className="field">
          <span>Nota</span>
          <input className="input" value={timer.note ?? ''} placeholder="Qué se espera" onChange={(e) => onChange({ ...timer, note: e.target.value || undefined })} />
        </label>
      </div>
      <div className="stat-label" style={{ margin: '0.8rem 0 0.3rem' }}>
        Avisos
      </div>
      {timer.alerts.map((a) => (
        <div key={a.uid} className="timer-alert-row">
          <select className="input input-sm" value={a.from} onChange={(e) => setAlert(a.uid, { from: e.target.value as TimerAlertDef['from'] })} aria-label="Cuándo">
            <option value="faltan">Faltan</option>
            <option value="inicio">A los</option>
          </select>
          <NumberInput className="input-sm" value={a.atMin} decimals={0} unit="min" onChange={(n) => setAlert(a.uid, { atMin: Math.max(0, n) })} ariaLabel="Minutos" />
          <input className="input input-sm" value={a.text} placeholder="Qué hacer (ej. 1 Whirlfloc)" onChange={(e) => setAlert(a.uid, { text: e.target.value })} aria-label="Qué hacer" />
          <input className="input input-sm" value={a.note ?? ''} placeholder="Qué se espera" onChange={(e) => setAlert(a.uid, { note: e.target.value || undefined })} aria-label="Nota" />
          <button className="btn btn-sm btn-ghost btn-danger" title="Quitar aviso" onClick={() => onChange({ ...timer, alerts: timer.alerts.filter((x) => x.uid !== a.uid) })}>
            ✕
          </button>
        </div>
      ))}
      <div className="row" style={{ marginTop: '0.6rem' }}>
        <button className="btn btn-sm" onClick={() => onChange({ ...timer, alerts: [...timer.alerts, newAlert()] })}>
          + Aviso
        </button>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost btn-danger" onClick={onDelete}>
          Quitar temporizador
        </button>
        <button className="btn btn-sm btn-primary" onClick={onDone}>
          Listo
        </button>
      </div>
    </div>
  );
}

/** Lista de temporizadores editable (día de cocción o herramienta libre). */
export function TimerPlan({
  timers,
  onChange,
  storagePrefix,
  onReset,
  phase,
}: {
  timers: BrewTimer[];
  onChange: (t: BrewTimer[]) => void;
  storagePrefix: string;
  onReset?: () => void;
  phase?: BrewTimer['phase'][];
}) {
  const [editing, setEditing] = useState<string>();
  const shown = phase ? timers.filter((t) => phase.includes(t.phase)) : timers;
  return (
    <div className="stack" style={{ gap: '0.6rem', marginBottom: '0.8rem' }}>
      {shown.map((t) =>
        editing === t.uid ? (
          <TimerEditor
            key={t.uid}
            timer={t}
            onChange={(n) => onChange(timers.map((x) => (x.uid === t.uid ? n : x)))}
            onDelete={() => (onChange(timers.filter((x) => x.uid !== t.uid)), setEditing(undefined))}
            onDone={() => setEditing(undefined)}
          />
        ) : (
          <TimerCard key={t.uid} storageKey={`${storagePrefix}-${t.uid}`} timer={t} onEdit={() => setEditing(t.uid)} />
        ),
      )}
      <div className="row">
        <button
          className="btn btn-sm"
          onClick={() => {
            const t = { ...newTimer(), phase: phase?.[0] ?? 'otro' };
            onChange([...timers, t]);
            setEditing(t.uid);
          }}
        >
          + Temporizador
        </button>
        {onReset && (
          <button className="btn btn-sm btn-ghost" onClick={() => confirm('¿Volver a los temporizadores propuestos según la receta? Se pierden los cambios.') && onReset()}>
            Restablecer según la receta
          </button>
        )}
      </div>
    </div>
  );
}
