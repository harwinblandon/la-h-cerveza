import { useState } from 'react';
import { useProfile } from '../hooks';
import { checkPassword, deleteProfile, endSession, reloadApp, setPassword } from '../profiles';
import { Field } from './ui';

/** Perfil activo: sesión, clave y borrado. */
export function ProfileCard() {
  const profile = useProfile();
  const [mode, setMode] = useState<'ver' | 'clave' | 'borrar'>('ver');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState('');
  if (!profile) return null;

  const reset = () => {
    setMode('ver');
    setCurrent('');
    setNext('');
    setNext2('');
    setConfirmText('');
  };

  const saveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.passHash && !(await checkPassword(profile, current))) return setMsg('La clave actual no coincide.');
    if (next !== next2) return setMsg('Las claves nuevas no coinciden.');
    await setPassword(profile.id, next || undefined);
    setMsg(next ? 'Clave guardada.' : 'Clave quitada: el perfil se abre sin clave.');
    reset();
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Perfil</h2>
        <button
          className="btn btn-sm"
          onClick={() => {
            endSession();
            reloadApp('#/');
          }}
        >
          Cambiar de perfil
        </button>
      </div>
      <p style={{ margin: 0 }}>
        <strong>{profile.displayName}</strong> <span className="faint mono">@{profile.username}</span>
        <span className="faint"> · {profile.passHash ? 'con clave' : 'sin clave'}</span>
      </p>
      {msg && <p className="muted" style={{ fontSize: '0.88rem', margin: '0.5rem 0 0' }}>{msg}</p>}
      {mode === 'ver' && (
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button className="btn btn-sm" onClick={() => (setMsg(''), setMode('clave'))}>
            {profile.passHash ? 'Cambiar o quitar la clave' : 'Poner clave'}
          </button>
          <span className="spacer" />
          <button className="btn btn-sm btn-danger" onClick={() => (setMsg(''), setMode('borrar'))}>
            Eliminar este perfil
          </button>
        </div>
      )}
      {mode === 'clave' && (
        <form className="grid grid-3" style={{ marginTop: '0.8rem' }} onSubmit={saveKey}>
          {profile.passHash && (
            <Field label="Clave actual">
              <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          )}
          <Field label="Clave nueva" hint="Vacía = sin clave">
            <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label="Repite la clave nueva">
            <input className="input" type="password" autoComplete="new-password" value={next2} onChange={(e) => setNext2(e.target.value)} />
          </Field>
          <div className="row">
            <button className="btn btn-primary btn-sm" type="submit">
              Guardar
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={reset}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {mode === 'borrar' && (
        <div className="callout" style={{ marginTop: '0.8rem' }}>
          <p style={{ marginTop: 0 }}>
            Esto borra de este navegador todas las recetas, versiones, lotes, inventario y ajustes de <strong>@{profile.username}</strong>. No se puede deshacer. Si quieres
            conservar algo, descarga antes una copia de seguridad.
          </p>
          <Field label={`Escribe ${profile.username} para confirmar`}>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <button
              className="btn btn-danger"
              disabled={confirmText.trim() !== profile.username}
              onClick={async () => {
                await deleteProfile(profile);
                endSession();
                reloadApp('#/');
              }}
            >
              Eliminar definitivamente
            </button>
            <button className="btn btn-ghost" onClick={reset}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
