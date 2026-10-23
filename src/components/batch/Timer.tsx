import { useEffect, useRef, useState } from 'react';

function beep(times = 3) {
  try {
    const ctx = new AudioContext();
    for (let i = 0; i < times; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    }
  } catch {
    /* sin audio */
  }
  try {
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* sin vibración */
  }
}

function notify(text: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') new Notification('La H', { body: text });
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

interface TimerState {
  endsAt?: number;
  remainingMs: number;
}

export interface TimerAlert {
  /** Minutos restantes en los que se dispara la alerta. */
  atMin: number;
  text: string;
}

/** Temporizador que sobrevive a recargas (guarda la hora de fin) y avisa en cada adición. */
export function Timer({ storageKey, minutes, label, alerts = [] }: { storageKey: string; minutes: number; label: string; alerts?: TimerAlert[] }) {
  const load = (): TimerState => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      /* almacenamiento no disponible */
    }
    return { remainingMs: minutes * 60_000 };
  };
  const [state, setState] = useState<TimerState>(load);
  const [now, setNow] = useState(Date.now());
  const fired = useRef<Set<number>>(new Set());

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state, storageKey]);

  useEffect(() => {
    if (!state.endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [state.endsAt]);

  const remaining = state.endsAt ? state.endsAt - now : state.remainingMs;
  const running = !!state.endsAt && remaining > 0;

  useEffect(() => {
    if (!state.endsAt) return;
    for (const a of alerts) {
      const key = a.atMin;
      if (!fired.current.has(key) && remaining <= a.atMin * 60_000 && remaining > a.atMin * 60_000 - 5000) {
        fired.current.add(key);
        beep(2);
        notify(a.text);
      }
    }
    if (remaining <= 0 && !fired.current.has(-1)) {
      fired.current.add(-1);
      beep(4);
      notify(`${label}: ¡tiempo cumplido!`);
    }
  }, [remaining, alerts, label, state.endsAt]);

  const next = alerts.filter((a) => a.atMin * 60_000 < remaining).sort((a, b) => b.atMin - a.atMin)[0];

  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="row-between">
        <div>
          <div className="stat-label">{label}</div>
          <div className="timer" style={{ color: remaining <= 0 ? 'var(--ok)' : undefined }}>
            {remaining <= 0 ? '¡Listo!' : mmss(remaining)}
          </div>
          {next && running && (
            <div className="muted" style={{ fontSize: '0.88rem' }}>
              Próximo: <strong>{next.text}</strong> en {mmss(remaining - next.atMin * 60_000)}
            </div>
          )}
        </div>
        <div className="row">
          {running ? (
            <button className="btn" onClick={() => setState({ remainingMs: remaining })}>
              Pausar
            </button>
          ) : (
            <button
              className="btn btn-primary"
              disabled={remaining <= 0}
              onClick={() => {
                try {
                  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
                } catch {
                  /* sin notificaciones */
                }
                setNow(Date.now());
                setState({ endsAt: Date.now() + remaining, remainingMs: remaining });
              }}
            >
              Iniciar
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              fired.current.clear();
              setState({ remainingMs: minutes * 60_000 });
            }}
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}
