import { useState } from 'react';
import { useProfile } from '../hooks';
import { deleteProfile, endSession, linkProfile, reloadApp } from '../profiles';
import { AccountForm, SYNC_LABEL, useSyncStatus } from './AccountForm';
import { Info } from './Info';
import { Field, fmtDateTime } from './ui';

const engine = () => import('../sync/engine');

/** Cuenta con correo del perfil: estado de la sincronización, clave, cierre de sesión y borrado. */
export function AccountCard() {
  const profile = useProfile();
  const status = useSyncStatus(!!profile?.uid);
  const [mode, setMode] = useState<'ver' | 'vincular' | 'entrar' | 'eliminar'>('ver');
  const [confirmText, setConfirmText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  // Perfil local o sin registro: se puede pasar a una cuenta.
  if (!profile.uid)
    return (
      <div className="card">
        <h2>Cuenta</h2>
        {mode === 'vincular' ? (
          <AccountForm
            mode="crear"
            submitLabel="Pasar a la cuenta"
            onDone={async (user) => {
              await linkProfile(profile.id, user);
              reloadApp('#/ajustes');
            }}
            onCancel={() => setMode('ver')}
          />
        ) : (
          <>
            <p style={{ margin: 0 }}>Este perfil está solo en este navegador.</p>
            <div className="row" style={{ marginTop: '0.8rem' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setMode('vincular')}>
                Pasar a una cuenta con correo
              </button>
            </div>
            <Info>
              Con una cuenta, las recetas, lotes, inventario y ajustes se guardan en la nube y se ven en cualquier equipo donde se entre con el mismo correo. Todo lo que ya
              tiene este perfil se sube a la cuenta. La app sigue funcionando sin internet: los cambios se suben al volver la conexión.
            </Info>
          </>
        )}
      </div>
    );

  const signedOut = status?.state === 'sin-sesion';

  const signOut = async () => {
    setBusy(true);
    try {
      const m = await engine();
      if (navigator.onLine) await m.syncNow();
      const pending = await m.pendingChanges();
      if (pending > 0 && !confirm(`Hay ${pending} cambios sin subir a la cuenta. Si cierras sesión ahora se pierden. ¿Cerrar sesión igual?`)) return setBusy(false);
      await m.signOutAccount();
      // Los datos siguen en la nube: se borra la copia de este navegador.
      await deleteProfile(profile);
      endSession();
      reloadApp('#/');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo cerrar la sesión.');
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Cuenta</h2>
        {status && <span className={`badge ${status.state === 'sincronizado' ? 'badge-ok' : status.state === 'error' ? 'badge-bad' : 'badge-warn'}`}>{SYNC_LABEL[status.state]}</span>}
      </div>
      <p style={{ margin: 0 }}>
        <strong>{profile.email}</strong>
        {status?.lastSyncedAt && <span className="faint"> · última sincronización {fmtDateTime(status.lastSyncedAt)}</span>}
        {status && status.pending > 0 && <span className="faint"> · {status.pending} cambios por subir</span>}
      </p>
      {status?.error && <p className="plan-desvio" style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>{status.error}</p>}
      {msg && <p className="muted" style={{ margin: '0.4rem 0 0', fontSize: '0.88rem' }}>{msg}</p>}

      {signedOut && mode !== 'entrar' && (
        <p className="callout callout-warn" style={{ fontSize: '0.86rem', marginTop: '0.6rem' }}>
          La sesión de la cuenta está cerrada en este navegador: los cambios se guardan aquí y se suben al volver a entrar.{' '}
          <button className="link-btn" onClick={() => setMode('entrar')}>
            Entrar
          </button>
        </p>
      )}
      {mode === 'entrar' && (
        <div style={{ marginTop: '0.8rem' }}>
          <AccountForm
            email={profile.email}
            allowCreate={false}
            onDone={async (user) => {
              if (user.uid !== profile.uid) {
                setMsg('Ese correo es de otra cuenta.');
                return;
              }
              reloadApp('#/ajustes');
            }}
            onCancel={() => setMode('ver')}
          />
        </div>
      )}

      {mode === 'ver' && (
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button className="btn btn-sm" disabled={signedOut} onClick={async () => (await engine()).syncNow()}>
            Sincronizar ahora
          </button>
          <button
            className="btn btn-sm"
            onClick={async () => {
              try {
                await (await engine()).resetPassword(profile.email!);
                setMsg(`Se envió un correo a ${profile.email} para cambiar la clave.`);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : 'No se pudo enviar el correo.');
              }
            }}
          >
            Cambiar la clave
          </button>
          <button className="btn btn-sm" disabled={busy} onClick={signOut}>
            Cerrar sesión
          </button>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost btn-danger" onClick={() => (setMsg(''), setMode('eliminar'))}>
            Eliminar la cuenta
          </button>
        </div>
      )}
      {mode === 'ver' && (
        <Info>
          Cerrar sesión borra la copia de este navegador; los datos siguen en la cuenta y vuelven a bajar al entrar de nuevo. En un equipo propio no hace falta cerrarla.
        </Info>
      )}

      {mode === 'eliminar' && (
        <div className="callout" style={{ marginTop: '0.8rem' }}>
          <p style={{ marginTop: 0 }}>
            Esto borra la cuenta y <strong>todos sus datos en la nube</strong> (recetas, versiones, lotes, inventario y ajustes), y la copia de este navegador. No se puede
            deshacer. Si quieres conservar algo, descarga antes una copia de seguridad.
          </p>
          <Field label={`Escribe ${profile.email} para confirmar`}>
            <input className="input" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </Field>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <button
              className="btn btn-danger"
              disabled={busy || confirmText.trim().toLowerCase() !== profile.email}
              onClick={async () => {
                setBusy(true);
                try {
                  await (await engine()).deleteAccountAndData();
                  await deleteProfile(profile);
                  endSession();
                  reloadApp('#/');
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta.');
                  setBusy(false);
                }
              }}
            >
              Eliminar definitivamente
            </button>
            <button className="btn btn-ghost" onClick={() => (setMode('ver'), setConfirmText(''))}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
