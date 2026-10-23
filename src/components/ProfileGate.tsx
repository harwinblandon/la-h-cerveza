import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { DISTRINES } from '../data/distrines';
import { DEFAULT_EQUIPMENT, EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { initProfileDb } from '../db';
import { checkPassword, createProfile, guestProfile, legacyDataExists, normalizeUsername, registry, reloadApp, startSession, touchLogin, type Profile } from '../profiles';
import { LogoLaH, NetCanvas, Signature } from './Brand';
import { Field } from './ui';

const WATER_CHOICES: [string, string, string][] = [
  ['armenia-epa', 'Agua de la llave de Armenia (EPA)', 'Perfil promedio de los reportes de Empresas Públicas de Armenia.'],
  ['osmosis', 'Ósmosis inversa', 'Casi sin minerales: construyes el perfil con sales.'],
  ['destilada', 'Destilada', 'Sin minerales.'],
  ['propia', 'Otra (mi ciudad, embotellada o de laboratorio)', 'La cargas después en Agua con los datos del informe o la etiqueta.'],
];

async function enterAsGuest() {
  const { profile, created } = await guestProfile();
  if (created) await initProfileDb(profile.dbName, {});
  await enter(profile, true);
}

async function enter(p: Profile, remember: boolean) {
  startSession(p, remember);
  await touchLogin(p.id);
  reloadApp('#/');
}

export function ProfileGate() {
  // El espacio sin registro tiene su propio botón: no se lista como perfil.
  const profiles = useLiveQuery(() => registry.profiles.orderBy('lastLoginAt').reverse().filter((p) => !p.guest).toArray(), []);
  const [legacy, setLegacy] = useState(false);
  const [view, setView] = useState<'lista' | 'crear'>('lista');
  const [selected, setSelected] = useState<Profile | null>(null);

  useEffect(() => {
    legacyDataExists().then(setLegacy);
  }, []);
  useEffect(() => {
    if (profiles && profiles.length === 0) setView('crear');
  }, [profiles]);

  return (
    <div className="gate">
      <NetCanvas />
      <div className="gate-inner">
        <LogoLaH className="gate-logo" />
        <div className="gate-card">
          {view === 'lista' && profiles && profiles.length > 0 && !selected && (
            <>
              <h2>¿Quién cocina hoy?</h2>
              <div className="stack">
                {profiles.map((p) => (
                  <button key={p.id} className="gate-profile" onClick={() => (p.passHash ? setSelected(p) : enter(p, true))}>
                    <span className="gate-avatar">{(p.displayName || p.username).slice(0, 1).toUpperCase()}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <strong>{p.displayName}</strong>
                      <span className="faint mono"> @{p.username}</span>
                    </span>
                    {p.passHash && <span className="faint mono">clave</span>}
                  </button>
                ))}
              </div>
              <button className="btn" style={{ marginTop: '1rem', width: '100%' }} onClick={() => setView('crear')}>
                Crear otro perfil
              </button>
            </>
          )}
          {selected && <Login profile={selected} onBack={() => setSelected(null)} />}
          {view === 'crear' && <CreateProfile legacy={legacy} canCancel={!!profiles?.length} onCancel={() => setView('lista')} />}
        </div>
        {!selected && (
          <button className="btn gate-guest" onClick={enterAsGuest}>
            Usar sin registro →
          </button>
        )}
        <p className="faint" style={{ fontSize: '0.78rem', maxWidth: 440, textAlign: 'center' }}>
          Sin registro, tus datos quedan solo en este navegador. Puedes crear un perfil cuando quieras.
        </p>
        <Signature size="lg" />
      </div>
    </div>
  );
}

function Login({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await checkPassword(profile, password)) await enter(profile, remember);
    else setError('Clave incorrecta.');
  };
  return (
    <form onSubmit={submit} className="stack">
      <h2>Hola, {profile.displayName}</h2>
      <Field label="Clave">
        <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => (setPassword(e.target.value), setError(''))} />
      </Field>
      {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
      <label className="row" style={{ fontSize: '0.88rem' }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Recordarme en este dispositivo
      </label>
      <div className="row">
        <button className="btn btn-primary" type="submit">
          Entrar
        </button>
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          Volver
        </button>
      </div>
    </form>
  );
}

function CreateProfile({ legacy, canCancel, onCancel }: { legacy: boolean; canCancel: boolean; onCancel: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [keepLegacy, setKeepLegacy] = useState(true);
  const [water, setWater] = useState('destilada');
  const [store, setStore] = useState<string>('');
  const [equipmentId, setEquipmentId] = useState(DEFAULT_EQUIPMENT[0].id);
  const [brewery, setBrewery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const user = normalizeUsername(username || displayName);
  const useLegacy = legacy && keepLegacy;

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    if (user.length < 2) return setError('Escribe un usuario de al menos 2 letras o números.');
    if (password && password !== password2) return setError('Las claves no coinciden.');
    setError('');
    if (useLegacy) return create();
    setStep(2);
  };

  const create = async () => {
    setBusy(true);
    try {
      const p = await createProfile({ username: user, displayName, password: password || undefined, useLegacyData: useLegacy });
      if (useLegacy) {
        // Tus datos de antes se conservan tal cual; solo se pone tu nombre si no lo tenía.
        await initProfileDb(p.dbName, {});
      } else {
        await initProfileDb(p.dbName, {
          brewerName: displayName.trim(),
          breweryName: brewery.trim(),
          sourceWaterId: water === 'propia' ? 'destilada' : water,
          preferredStore: store || undefined,
          defaultEquipmentId: equipmentId,
        });
      }
      await enter(p, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el perfil.');
      setBusy(false);
    }
  };

  if (step === 2)
    return (
      <div className="stack">
        <h2>Tu forma de cocinar</h2>
        <p className="muted" style={{ fontSize: '0.88rem', margin: 0 }}>
          Nada de esto es definitivo: todo se cambia después en Ajustes, Agua y Equipos.
        </p>
        <div>
          <div className="stat-label" style={{ marginBottom: 6 }}>
            ¿Con qué agua cocinas?
          </div>
          {WATER_CHOICES.map(([id, label, help]) => (
            <label key={id} className="gate-option">
              <input type="radio" name="agua" checked={water === id} onChange={() => setWater(id)} />
              <span>
                <strong>{label}</strong>
                <span className="faint" style={{ display: 'block', fontSize: '0.8rem' }}>
                  {help}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="grid grid-2">
          <Field label="¿Dónde compras insumos?" hint="Con una tienda elegida, las recetas usan sus maltas y lúpulos cuando hay un equivalente real">
            <select className="input" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">En varias / ninguna en particular</option>
              <option value={DISTRINES}>Distrines</option>
            </select>
          </Field>
          <Field label="Tu equipo principal">
            <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              {DEFAULT_EQUIPMENT.map((e) => (
                <option key={e.id} value={e.id}>
                  {EQUIPMENT_TYPE_LABEL[e.type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre de tu cervecería (opcional)">
            <input className="input" value={brewery} onChange={(e) => setBrewery(e.target.value)} />
          </Field>
        </div>
        {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? 'Creando…' : 'Crear perfil y entrar'}
          </button>
          <button className="btn btn-ghost" onClick={() => setStep(1)}>
            Atrás
          </button>
        </div>
      </div>
    );

  return (
    <form onSubmit={next} className="stack">
      <h2>{useLegacy ? 'Crea tu perfil' : 'Perfil nuevo'}</h2>
      {legacy && (
        <div className="callout" style={{ fontSize: '0.88rem' }}>
          Encontré recetas y lotes guardados en este navegador antes de que existieran los perfiles.
          <label className="row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={keepLegacy} onChange={(e) => setKeepLegacy(e.target.checked)} /> Este perfil es el dueño de esos datos
          </label>
        </div>
      )}
      <Field label="Tu nombre">
        <input className="input" autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ej. Harwin" />
      </Field>
      <Field label="Usuario (para entrar)" hint={user ? `Se guardará como @${user}` : 'Letras, números, punto o guion; sin espacios'}>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={normalizeUsername(displayName) || 'harwin'} autoComplete="username" />
      </Field>
      <div className="grid grid-2">
        <Field label="Clave (opcional)">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repite la clave">
          <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" disabled={!password} />
        </Field>
      </div>
      <p className="faint" style={{ fontSize: '0.78rem', margin: 0 }}>
        La clave no se puede recuperar: si la olvidas, el perfil queda bloqueado en la app (tus copias de seguridad siguen sirviendo).
      </p>
      {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {useLegacy ? (busy ? 'Entrando…' : 'Crear perfil y entrar') : 'Siguiente'}
        </button>
        {canCancel && (
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
