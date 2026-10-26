import { useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { LogoLaH, Signature } from './components/Brand';
import { Icon } from './components/Icons';
import { useProfile } from './hooks';
import { SYNC_LABEL, useSyncStatus } from './components/AccountForm';
import BatchView from './pages/BatchView';
import Batches from './pages/Batches';
import EquipmentPage from './pages/Equipment';
import Home from './pages/Home';
import Ingredients from './pages/Ingredients';
import Inventory from './pages/Inventory';
import RecipeEditor from './pages/RecipeEditor';
import Recipes from './pages/Recipes';
import SettingsPage from './pages/Settings';
import Styles from './pages/Styles';
import Tools from './pages/Tools';
import WaterPage from './pages/Water';

const NAV: [string, string, string][] = [
  ['/', 'inicio', 'Inicio'],
  ['/recetas', 'recetas', 'Recetas'],
  ['/lotes', 'lotes', 'Lotes'],
  ['/estilos', 'estilos', 'Estilos'],
  ['/herramientas', 'herramientas', 'Herramientas'],
];
const NAV_MORE: [string, string, string][] = [
  ['/ingredientes', 'ingredientes', 'Ingredientes'],
  ['/inventario', 'inventario', 'Inventario'],
  ['/agua', 'agua', 'Agua'],
  ['/equipos', 'equipos', 'Equipos'],
  ['/ajustes', 'ajustes', 'Ajustes'],
];

export default function App() {
  const profile = useProfile();
  const sync = useSyncStatus(!!profile?.uid);
  // Alto de la barra superior del celular: las barras fijas de cada página se pegan debajo.
  const top = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--mobile-top-h', `${el.offsetHeight}px`);
    const ro = new ResizeObserver(set);
    ro.observe(el);
    set();
    return () => ro.disconnect();
  }, []);
  const link = ([to, icon, label]: [string, string, string]) => (
    <NavLink key={to} to={to} end={to === '/'}>
      <span className="nav-icon" aria-hidden>
        <Icon name={icon} />
      </span>
      {label}
    </NavLink>
  );
  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="Inicio">
          <LogoLaH />
        </Link>
        <nav className="nav">
          {NAV.map(link)}
          <div className="nav-sep" />
          {NAV_MORE.map(link)}
        </nav>
        <div className="sidebar-foot">
          {profile && (
            <Link to="/ajustes" className="profile-chip" title="Perfil y sesión">
              {sync && <span className={`sync-dot sync-${sync.state}`} title={SYNC_LABEL[sync.state]} />}
              {profile.guest ? 'Sin registro' : profile.uid ? profile.email : `@${profile.username}`}
            </Link>
          )}
          <Signature />
        </div>
      </aside>
      <header className="mobile-top" ref={top}>
        <Link to="/" aria-label="Inicio">
          <LogoLaH />
        </Link>
        <Signature />
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/recetas" element={<Recipes />} />
          <Route path="/recetas/:id" element={<RecipeEditor />} />
          <Route path="/lotes" element={<Batches />} />
          <Route path="/lotes/:id" element={<BatchView />} />
          <Route path="/estilos" element={<Styles />} />
          <Route path="/herramientas" element={<Tools />} />
          <Route path="/ingredientes" element={<Ingredients />} />
          <Route path="/inventario" element={<Inventory />} />
          <Route path="/agua" element={<WaterPage />} />
          <Route path="/equipos" element={<EquipmentPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
        </Routes>
        <footer className="main-foot">
          <Signature size="lg" />
        </footer>
      </main>
      <nav className="bottom-nav">
        {NAV.slice(0, 4).map(link)}
        {link(['/ajustes', 'ajustes', 'Más'])}
      </nav>
    </div>
  );
}
