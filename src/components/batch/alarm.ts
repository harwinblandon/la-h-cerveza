// Alarma de los temporizadores: sonido fuerte y repetido hasta que se detiene, vibración
// y notificación del sistema (que usa el sonido de notificaciones elegido en el celular).

export type AlarmSound = 'alarma' | 'pitido' | 'sirena' | 'campana';

export interface AlarmPrefs {
  sound: AlarmSound;
  /** 0–1 sobre el volumen multimedia del celular. */
  volume: number;
  /** Segundos que suena si nadie la detiene. */
  seconds: number;
  /** Notificación del sistema además del sonido de la app. */
  notify: boolean;
}

export const ALARM_SOUND_LABEL: Record<AlarmSound, string> = {
  alarma: 'Alarma (dos tonos)',
  pitido: 'Pitido de reloj',
  sirena: 'Sirena',
  campana: 'Campana suave',
};

const KEY = 'la-h-alarma';
const DEFAULTS: AlarmPrefs = {
  sound: 'alarma',
  volume: 1,
  seconds: 30,
  notify: true,
};

export function loadAlarmPrefs(): AlarmPrefs {
  try {
    return {
      ...DEFAULTS,
      ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AlarmPrefs>),
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveAlarmPrefs(p: AlarmPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

// ---------- Audio ----------

let ctx: AudioContext | undefined;
let listening = false;

/** Habilita el audio. Los navegadores lo bloquean hasta que se toca la pantalla. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== 'running') void ctx.resume();
  } catch {
    /* sin audio */
  }
  // Cualquier toque posterior vuelve a habilitarlo (tras recargar, o si el sistema lo suspendió).
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    const again = () => {
      if (ctx && ctx.state !== 'running') void ctx.resume();
    };
    window.addEventListener('pointerdown', again, true);
    window.addEventListener('keydown', again, true);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && again());
  }
}

/** true si el audio está listo para sonar sin un toque más. */
export const audioReady = () => ctx?.state === 'running';

type Tone = {
  at: number;
  freq: number;
  to?: number;
  dur: number;
  wave: OscillatorType;
};

/** Un ciclo del sonido (segundos desde el inicio del ciclo). */
function pattern(sound: AlarmSound): { tones: Tone[]; cycle: number } {
  switch (sound) {
    case 'pitido':
      return {
        cycle: 1,
        tones: [0, 0.15, 0.3, 0.45].map((at) => ({
          at,
          freq: 2000,
          dur: 0.09,
          wave: 'square' as const,
        })),
      };
    case 'sirena':
      return {
        cycle: 1.2,
        tones: [
          { at: 0, freq: 650, to: 1300, dur: 0.6, wave: 'sawtooth' },
          { at: 0.6, freq: 1300, to: 650, dur: 0.6, wave: 'sawtooth' },
        ],
      };
    case 'campana':
      return {
        cycle: 1.6,
        tones: [
          { at: 0, freq: 880, dur: 0.9, wave: 'triangle' },
          { at: 0.3, freq: 1108.7, dur: 0.9, wave: 'triangle' },
        ],
      };
    default:
      return {
        cycle: 1,
        tones: [
          { at: 0, freq: 880, dur: 0.22, wave: 'square' },
          { at: 0.25, freq: 1320, dur: 0.22, wave: 'square' },
        ],
      };
  }
}

let stopCurrent: (() => void) | undefined;
let ringing = false;
const listeners = new Set<(r: boolean) => void>();
const setRinging = (r: boolean) => {
  ringing = r;
  listeners.forEach((l) => l(r));
};
export const isRinging = () => ringing;
export function onRinging(l: (r: boolean) => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/**
 * Hace sonar la alarma. Las notas se programan de una vez en el reloj de audio, así suenan
 * a tiempo aunque la página quede en segundo plano mientras el audio siga activo.
 */
export function ring(prefs: AlarmPrefs = loadAlarmPrefs(), seconds = prefs.seconds) {
  stopAlarm();
  unlockAudio();
  const vib = setInterval(() => {
    try {
      navigator.vibrate?.([400, 150, 400, 150, 400]);
    } catch {
      /* sin vibración */
    }
  }, 1800);
  try {
    navigator.vibrate?.([400, 150, 400, 150, 400]);
  } catch {
    /* sin vibración */
  }
  let master: GainNode | undefined;
  try {
    const c = ctx!;
    master = c.createGain();
    master.gain.value = Math.max(0.05, Math.min(1, prefs.volume));
    // El compresor permite subir el nivel sin distorsionar los parlantes del celular.
    const comp = c.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(c.destination);
    const { tones, cycle } = pattern(prefs.sound);
    const t0 = c.currentTime + 0.05;
    for (let k = 0; k * cycle < seconds; k++) {
      for (const t of tones) {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = t.wave;
        const s = t0 + k * cycle + t.at;
        o.frequency.setValueAtTime(t.freq, s);
        if (t.to) o.frequency.linearRampToValueAtTime(t.to, s + t.dur);
        g.gain.setValueAtTime(0.0001, s);
        g.gain.exponentialRampToValueAtTime(0.9, s + 0.01);
        g.gain.setValueAtTime(0.9, s + t.dur * (prefs.sound === 'campana' ? 0.1 : 0.85));
        g.gain.exponentialRampToValueAtTime(0.0001, s + t.dur);
        o.connect(g);
        g.connect(master);
        o.start(s);
        o.stop(s + t.dur + 0.02);
      }
    }
  } catch {
    /* sin audio */
  }
  const end = setTimeout(() => stopAlarm(), seconds * 1000 + 200);
  stopCurrent = () => {
    clearInterval(vib);
    clearTimeout(end);
    try {
      navigator.vibrate?.(0);
      master?.disconnect();
    } catch {
      /* nada */
    }
  };
  setRinging(true);
}

export function stopAlarm() {
  stopCurrent?.();
  stopCurrent = undefined;
  if (ringing) setRinging(false);
}

// ---------- Notificación del sistema ----------

/** Pide permiso de notificaciones (debe llamarse desde un toque). */
export function askNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') return Notification.requestPermission();
  } catch {
    /* sin notificaciones */
  }
  return Promise.resolve(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
}

/**
 * Notificación del sistema con el sonido de notificaciones del celular.
 * En Android solo funciona a través del service worker (new Notification falla).
 */
export async function notify(title: string, body: string, tag: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !loadAlarmPrefs().notify) return;
    const opts = {
      body,
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 400],
      icon: './marca/icono-192.png',
      badge: './marca/icono-192.png',
    };
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, opts as NotificationOptions);
    else new Notification(title, opts as NotificationOptions);
  } catch {
    /* sin notificaciones */
  }
}
