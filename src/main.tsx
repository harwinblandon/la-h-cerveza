import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { ProfileGate } from './components/ProfileGate';
import { SESSION, endSession, registry } from './profiles';
import './styles.css';

/** Sin sesión, o si el perfil de la sesión ya no existe, se muestra la pantalla de perfiles. */
function Root() {
  const [state, setState] = useState<'cargando' | 'app' | 'perfiles'>(SESSION ? 'cargando' : 'perfiles');
  useEffect(() => {
    if (!SESSION) return;
    registry.profiles.get(SESSION.profileId).then((p) => {
      if (p) setState('app');
      else {
        endSession();
        setState('perfiles');
      }
    });
  }, []);
  if (state === 'cargando') return null;
  if (state === 'perfiles') return <ProfileGate />;
  return (
    <HashRouter>
      <App />
    </HashRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}
