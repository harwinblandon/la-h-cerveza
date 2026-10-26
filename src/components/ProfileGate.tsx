import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { DEFAULT_EQUIPMENT, EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { initProfileDb } from '../db';
import { accountProfile, checkPassword, createProfile, guestProfile, legacyDataExists, normalizeUsername, registry, reloadApp, startSession, touchLogin, type Profile } from '../profiles';
import { LogoLaH, NetCanvas, Signature } from './Brand';
import { Field } from './ui';
import { AccountForm } from './AccountForm';

const WATER_CHOICES: [string, string, string][] = [
  ['armenia-epa', 'Agua de la llave de Armenia (EPA)', 'Perfil promedio de los reportes de Empresas Públicas de Armenia.'],
  ['osmosis', 'Ósmosis inversa', 'Casi sin minerales: construyes el perfil con sales.'],
  ['destilada', 'Destilada', 'Sin minerales.'],
  ['propia', 'Otra (de la ciudad, embotellada o de laboratorio)', 'La cargas después en Agua con los datos del informe o la etiqueta.'],
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
  const [view, setView] = useState<'lista' | 'crear' | 'cuenta'>('lista');
  const [selected, setSelected] = useState<Profile | null>(null);

  useEffect(() => {
    legacyDataExists().then(setLegacy);
  }, []);

  /** Perfil con cuenta: entra si la sesión de esa cuenta sigue abierta en este navegador; si no, pide la clave. */
  const openProfile = async (p: Profile) => {
    if (p.uid) {
      const u = await (await import('../sync/engine')).currentUser();
      if (u?.uid === p.uid) return enter(p, true);
      return setSelected(p);
    }
    return p.passHash ? setSelected(p) : enter(p, true);
  };
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
                  <button key={p.id} className="gate-profile" onClick={() => void openProfile(p)}>
                    <span className="gate-avatar">{(p.displayName || p.username).slice(0, 1).toUpperCase()}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <strong>{p.displayName}</strong>
                      <span className="faint mono"> {p.uid ? p.email : `@${p.username}`}</span>
                    </span>
                    {p.uid ? <span className="gate-tag">cuenta</span> : p.passHash && <span className="gate-tag">clave</span>}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: '1rem' }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setView('cuenta')}>
                  Entrar con correo
                </button>
                <button className="btn" style={{ flex: 1 }} onClick={() => setView('crear')}>
                  Crear perfil
                </button>
              </div>
            </>
          )}
          {selected && (selected.uid ? <AccountLogin profile={selected} onBack={() => setSelected(null)} /> : <Login profile={selected} onBack={() => setSelected(null)} />)}
          {view === 'crear' && !selected && <CreateProfile legacy={legacy} canCancel={!!profiles?.length} onCancel={() => setView('lista')} />}
          {view === 'cuenta' && !selected && (
            <div className="stack">
              <h2>Entrar con correo</h2>
              <AccountForm
                allowCreate={false}
                onDone={async (user) => {
                  const { profile } = await accountProfile(user);
                  await enter(profile, true);
                }}
                onCancel={() => setView(profiles?.length ? 'lista' : 'crear')}
              />
              <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>
                ¿Sin cuenta todavía? Créala en{' '}
                <button type="button" className="link-btn" onClick={() => setView('crear')}>
                  Crear perfil
                </button>
                .
              </p>
            </div>
          )}
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

function AccountLogin({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [error, setError] = useState('');
  return (
    <div className="stack">
      <h2>Hola, {profile.displayName}</h2>
      <AccountForm
        email={profile.email}
        allowCreate={false}
        onDone={async (user) => {
          if (user.uid !== profile.uid) {
            setError('Ese correo es de otra cuenta.');
            return;
          }
          await enter(profile, true);
        }}
        onCancel={onBack}
      />
      {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
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
  const [kind, setKind] = useState<'cuenta' | 'local'>('cuenta');
  const [accountP, setAccountP] = useState<Profile>();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [keepLegacy, setKeepLegacy] = useState(true);
  const [water, setWater] = useState('destilada');
  const [acid, setAcid] = useState<'lactico' | 'fosforico'>('lactico');
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
      const p = accountP ?? (await createProfile({ username: user, displayName, password: password || undefined, useLegacyData: useLegacy }));
      if (useLegacy) {
        // Tus datos de antes se conservan tal cual; solo se pone tu nombre si no lo tenía.
        await initProfileDb(p.dbName, {});
      } else {
        await initProfileDb(p.dbName, {
          brewerName: displayName.trim(),
          breweryName: brewery.trim(),
          sourceWaterId: water === 'propia' ? 'destilada' : water,
          acid: { type: acid, pct: acid === 'fosforico' ? 85 : 88 },
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
        <h2>Forma de cocinar</h2>
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
          <Field label="¿Qué ácido usas para el pH?">
            <select className="input" value={acid} onChange={(e) => setAcid(e.target.value as 'lactico')}>
              <option value="lactico">Láctico</option>
              <option value="fosforico">Fosfórico</option>
            </select>
          </Field>
          <Field label="Equipo principal">
            <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
              {DEFAULT_EQUIPMENT.map((e) => (
                <option key={e.id} value={e.id}>
                  {EQUIPMENT_TYPE_LABEL[e.type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre de la cervecería (opcional)">
            <input className="input" value={brewery} onChange={(e) => setBrewery(e.target.value)} />
          </Field>
        </div>
        {error && <p className="plan-desvio" style={{ margin: 0 }}>{error}</p>}
        <div className="row">
          <button className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? 'Creando…' : 'Crear perfil y entrar'}
          </button>
          {!accountP && (
            <button className="btn btn-ghost" onClick={() => setStep(1)}>
              Atrás
            </button>
          )}
        </div>
      </div>
    );

  const kindPicker = (
    <div className="row" style={{ gap: '0.4rem' }}>
      <button type="button" className={`chip chip-toggle${kind === 'cuenta' ? ' chip-on' : ''}`} onClick={() => setKind('cuenta')}>
        Cuenta con correo
      </button>
      <button type="button" className={`chip chip-toggle${kind === 'local' ? ' chip-on' : ''}`} onClick={() => setKind('local')}>
        Perfil local
      </button>
    </div>
  );

  if (kind === 'cuenta')
    return (
      <div className="stack">
        <h2>Perfil nuevo</h2>
        {kindPicker}
        <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>
          Recetas, lotes y ajustes guardados en la cuenta: disponibles en cualquier equipo, con copia en la nube y clave recuperable por correo.
        </p>
        <AccountForm
          mode="crear"
          submitLabel="Siguiente"
          extra={
            <Field label="Nombre">
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nombre" />
            </Field>
          }
          onDone={async (u, created) => {
            const { profile, created: isNewHere } = await accountProfile(u, displayName);
            // Cuenta que ya existía: sus datos bajan de la nube, no hay nada que configurar.
            if (!created) return enter(profile, true);
            setAccountP(profile);
            if (isNewHere) setStep(2);
          }}
          onCancel={canCancel ? onCancel : undefined}
        />
      </div>
    );

  return (
    <form onSubmit={next} className="stack">
      <h2>Perfil nuevo</h2>
      {kindPicker}
      <p className="faint" style={{ fontSize: '0.8rem', margin: 0 }}>Los datos quedan solo en este navegador.</p>
      {legacy && (
        <div className="callout" style={{ fontSize: '0.88rem' }}>
          Encontré recetas y lotes guardados en este navegador antes de que existieran los perfiles.
          <label className="row" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={keepLegacy} onChange={(e) => setKeepLegacy(e.target.checked)} /> Este perfil es el dueño de esos datos
          </label>
        </div>
      )}
      <Field label="Nombre">
        <input className="input" autoFocus value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Nombre" />
      </Field>
      <Field label="Usuario (para entrar)" hint={user ? `Se guardará como @${user}` : 'Letras, números, punto o guion; sin espacios'}>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={normalizeUsername(displayName) || 'usuario'} autoComplete="username" />
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
