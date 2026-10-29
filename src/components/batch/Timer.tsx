import { useEffect, useRef, useState } from 'react';
import { alertRemainingMin, newAlert, newTimer } from '../../domain/timers';
import type { BrewTimer, TimerAlertDef } from '../../domain/types';
import { Info } from '../Info';
import { NumberInput } from '../ui';
import {
  ALARM_SOUND_LABEL,
  askNotifications,
  audioReady,
  isRinging,
  loadAlarmPrefs,
  notify,
  onRinging,
  ring,
  saveAlarmPrefs,
  stopAlarm,
  unlockAudio,
  type AlarmPrefs,
  type AlarmSound,
} from './alarm';

const DONE = 'fin';
const PREFIX = 'timer-';
/** Pasados 10 minutos del final, ya no se hace sonar (era de otra sesión). */
const STALE = 10 * 60_000;

interface SavedTimer extends RunState {
  label?: string;
  marks?: { uid: string; at: number; text: string }[];
}

/** Temporizadores con tarjeta en pantalla (esos avisan solos). */
const mounted = new Set<string>();

/**
 * Vigila los temporizadores en marcha desde cualquier pantalla de la app: si su tarjeta no está
 * a la vista (otra página u otra fase de la cocción), hace sonar los avisos igual.
 * Muestra además un botón para detener la alarma donde sea que esté sonando.
 */
export function TimerWatcher() {
  const ringingNow = useRinging();
  useEffect(() => {
    const tick = () => {
      let keys: string[] = [];
      try {
        keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
      } catch {
        return;
      }
      const now = Date.now();
      for (const key of keys) {
        if (mounted.has(key)) continue;
        try {
          const t = JSON.parse(localStorage.getItem(key) ?? '{}') as SavedTimer;
          if (!t.endsAt || !Array.isArray(t.fired)) continue;
          const remaining = t.endsAt - now;
          const due = (t.marks ?? []).filter((m) => remaining <= m.at && !t.fired.includes(m.uid));
          const done = remaining <= 0 && !t.fired.includes(DONE);
          if (!due.length && !done) continue;
          t.fired = [...t.fired, ...due.map((m) => m.uid), ...(done ? [DONE] : [])];
          localStorage.setItem(key, JSON.stringify(t));
          if (remaining < -STALE) continue;
          ring();
          const text = [...due.map((m) => m.text), ...(done ? ['¡Tiempo cumplido!'] : [])].join(' · ');
          void notify(t.label ?? 'Temporizador', text, key);
        } catch {
          /* registro dañado: se ignora */
        }
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);
  if (!ringingNow) return null;
  return (
    <button className="btn btn-primary alarm-stop-floating" onClick={stopAlarm}>
      Detener alarma
    </button>
  );
}

function useRinging() {
  const [r, setR] = useState(isRinging());
  useEffect(() => onRinging(setR), []);
  return r;
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
  const alarmOn = useRinging();
  const [, force] = useState(0);

  const marks = timer.alerts.map((a) => ({ a, at: alertRemainingMin(timer, a) * 60_000 })).sort((x, y) => y.at - x.at);

  // Se guarda también el nombre y los avisos: así el vigilante global avisa aunque esta tarjeta no esté en pantalla.
  useEffect(() => {
    try {
      const saved: SavedTimer = {
        ...state,
        total,
        label: timer.label,
        marks: marks.map((m) => ({ uid: m.a.uid, at: m.at, text: `${m.a.text}${m.a.note ? ` — ${m.a.note}` : ''}` })),
      };
      localStorage.setItem(storageKey, JSON.stringify(saved));
    } catch {
      /* almacenamiento no disponible */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, storageKey, timer]);

  useEffect(() => {
    mounted.add(storageKey);
    return () => void mounted.delete(storageKey);
  }, [storageKey]);

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

  useEffect(() => {
    if (!state.endsAt) return;
    const due = marks.filter((m) => remaining <= m.at && !state.fired.includes(m.a.uid));
    // Lo que ya sonó queda guardado (también el final): no se repite al recargar.
    // Un temporizador vencido hace rato (cocción anterior) se da por avisado sin sonar.
    const stale = remaining < -STALE;
    if (due.length) {
      setState((s) => ({ ...s, fired: [...s.fired, ...due.map((m) => m.a.uid)] }));
      if (!stale) {
        ring();
        void notify(timer.label, due.map((m) => `${m.a.text}${m.a.note ? ` — ${m.a.note}` : ''}`).join(' · '), storageKey);
      }
    }
    if (remaining <= 0 && !state.fired.includes(DONE)) {
      setState((s) => ({ ...s, fired: [...s.fired, DONE] }));
      if (stale) return;
      ring();
      void notify(timer.label, '¡Tiempo cumplido!', storageKey);
    }
  }, [remaining, marks, state.endsAt, state.fired, timer.label, storageKey]);

  const next = marks.find((m) => m.at < remaining && !state.fired.includes(m.a.uid));
  const start = () => {
    unlockAudio();
    void askNotifications();
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
      {alarmOn && state.fired.length > 0 && (
        <button className="btn btn-primary timer-stop" onClick={stopAlarm}>
          Detener alarma
        </button>
      )}
      {running && !audioReady() && (
        <button className="callout callout-warn timer-audio" onClick={() => (unlockAudio(), setTimeout(() => force((n) => n + 1), 300))}>
          El navegador bloqueó el sonido. Toca aquí para activarlo.
        </button>
      )}
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
      <AlarmSettings />
    </div>
  );
}

/** Sonido de la alarma en este dispositivo: tipo, volumen, duración, prueba y notificaciones. */
export function AlarmSettings() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<AlarmPrefs>(loadAlarmPrefs);
  const [perm, setPerm] = useState<NotificationPermission>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'denied'));
  const ringingNow = useRinging();
  const set = (patch: Partial<AlarmPrefs>) => {
    const n = { ...p, ...patch };
    setP(n);
    saveAlarmPrefs(n);
  };
  if (!open) {
    return (
      <div>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
          Sonido de la alarma: {ALARM_SOUND_LABEL[p.sound]} · {Math.round(p.volume * 100)} %
        </button>
      </div>
    );
  }
  return (
    <div className="timer-card">
      <div className="row-between">
        <div className="stat-label">Sonido de la alarma en este dispositivo</div>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Cerrar
        </button>
      </div>
      <div className="grid grid-3" style={{ marginTop: '0.5rem' }}>
        <label className="field">
          <span>Sonido</span>
          <select className="input" value={p.sound} onChange={(e) => set({ sound: e.target.value as AlarmSound })}>
            {(Object.keys(ALARM_SOUND_LABEL) as AlarmSound[]).map((k) => (
              <option key={k} value={k}>
                {ALARM_SOUND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Volumen {Math.round(p.volume * 100)} %</span>
          <input type="range" min={10} max={100} step={5} value={Math.round(p.volume * 100)} onChange={(e) => set({ volume: Number(e.target.value) / 100 })} />
        </label>
        <label className="field">
          <span>Suena durante</span>
          <select className="input" value={p.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })}>
            {[10, 30, 60, 120].map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} s` : `${n / 60} min`} o hasta detenerla
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: '0.6rem' }}>
        {ringingNow ? (
          <button className="btn btn-primary" onClick={stopAlarm}>
            Detener
          </button>
        ) : (
          <button className="btn" onClick={() => ring(p, 4)}>
            Probar sonido
          </button>
        )}
        <label className="row" style={{ fontSize: '0.88rem' }}>
          <input type="checkbox" checked={p.notify} onChange={(e) => set({ notify: e.target.checked })} /> Notificación del sistema
        </label>
        {p.notify && perm === 'default' && (
          <button className="btn btn-sm" onClick={() => void askNotifications().then((r) => setPerm(r))}>
            Permitir notificaciones
          </button>
        )}
        {p.notify && perm === 'denied' && <span className="faint" style={{ fontSize: '0.82rem' }}>Notificaciones bloqueadas en el navegador.</span>}
        {p.notify && perm === 'granted' && (
          <button className="btn btn-sm btn-ghost" onClick={() => void notify('Recetas', 'Aviso de prueba del temporizador.', 'prueba')}>
            Probar notificación
          </button>
        )}
      </div>
      <Info>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          <li>
            El sonido de la app sale con el <strong>volumen multimedia</strong> del celular (el de música y videos), no con el del timbre. En iPhone, el modo silencio lo apaga.
          </li>
          <li>Con la app abierta en pantalla suena siempre; mientras corre un temporizador la pantalla se mantiene encendida.</li>
          <li>
            Con el celular bloqueado o en otra app, el navegador pausa la página: el aviso llega por la <strong>notificación del sistema</strong> y puede demorar hasta un
            minuto. El sonido de esa notificación se elige en el celular: Ajustes → Apps → Chrome (o Recetas, si está instalada) → Notificaciones.
          </li>
          <li>Después de recargar la página, el navegador pide un toque en la pantalla antes de volver a sonar.</li>
        </ul>
      </Info>
    </div>
  );
}
