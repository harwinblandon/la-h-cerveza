import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import type { SyncStatus } from '../sync/engine';
import { Field } from './ui';

const engine = () => import('../sync/engine');

/** Estado de la sincronización (carga Firebase solo si se usa). */
export function useSyncStatus(enabled: boolean): SyncStatus | undefined {
  const [status, setStatus] = useState<SyncStatus>();
  useEffect(() => {
    if (!enabled) return;
    let stop: (() => void) | undefined;
    let alive = true;
    void engine().then((m) => {
      if (alive) stop = m.subscribeStatus(setStatus);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [enabled]);
  return status;
}

export const SYNC_LABEL: Record<SyncStatus['state'], string> = {
  'sin-sesion': 'Sesión de la cuenta cerrada',
  sincronizando: 'Sincronizando…',
  sincronizado: 'Sincronizado',
  'sin-conexion': 'Sin conexión: se sube al volver internet',
  error: 'Error de sincronización',
};

/**
 * Entrar o crear una cuenta con correo y clave. `mode` "crear" pide repetir la clave.
 * Llama a `onDone` con el usuario de Firebase.
 */
export function AccountForm({
  mode: initialMode = 'entrar',
  email: initialEmail = '',
  submitLabel,
  allowCreate = true,
  onDone,
  onCancel,
  extra,
}: {
  mode?: 'entrar' | 'crear';
  email?: string;
  submitLabel?: string;
  allowCreate?: boolean;
  onDone: (user: User, created: boolean) => Promise<void> | void;
  onCancel?: () => void;
  extra?: React.ReactNode;
}) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (mode === 'crear' && password !== password2) return setError('Las claves no coinciden.');
    setBusy(true);
    try {
      const m = await engine();
      const user = mode === 'crear' ? await m.signUp(email, password) : await m.signIn(email, password);
      await onDone(user, mode === 'crear');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar.');
      setBusy(false);
    }
  };

  const reset = async () => {
    setError('');
    if (!email.trim()) return setError('Escribe el correo de la cuenta.');
    try {
      await (await engine()).resetPassword(email);
      setInfo(`Se envió un correo a ${email.trim()} para crear una clave nueva. Revisa también la carpeta de spam.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo.');
    }
  };

  return (
    <form className="stack" onSubmit={submit}>
      <Field label="Correo">
        <input className="input" type="email" autoComplete="email" autoFocus={!initialEmail} value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Clave" hint={mode === 'crear' ? 'Mínimo 6 caracteres' : undefined}>
        <input
          className="input"
          type="password"
          autoComplete={mode === 'crear' ? 'new-password' : 'current-password'}
          autoFocus={!!initialEmail}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>
      {mode === 'crear' && (
        <Field label="Repite la clave">
          <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </Field>
      )}
      {extra}
      {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
      {info && <p className="plan-ok" style={{ margin: 0 }}>{info}</p>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Un momento…' : submitLabel ?? (mode === 'crear' ? 'Crear cuenta' : 'Entrar')}
        </button>
        {onCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
      <div className="row" style={{ gap: '1rem', fontSize: '0.85rem' }}>
        {mode === 'entrar' && (
          <button type="button" className="link-btn" onClick={reset}>
            Olvidé la clave
          </button>
        )}
        {allowCreate && (
          <button type="button" className="link-btn" onClick={() => (setMode(mode === 'entrar' ? 'crear' : 'entrar'), setError(''), setInfo(''))}>
            {mode === 'entrar' ? 'Crear una cuenta nueva' : 'Ya hay una cuenta: entrar'}
          </button>
        )}
      </div>
    </form>
  );
}
