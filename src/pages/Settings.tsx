import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { ProfileCard } from '../components/ProfileCard';
import { Field, NumberInput, download } from '../components/ui';
import { exportBackup, importBackup, updateSettings } from '../db';
import { DISTRINES, DISTRINES_SALTS, DISTRINES_URL } from '../data/distrines';
import { SALTS } from '../domain/calc/water';
import type { SaltId } from '../domain/types';
import { useCatalog, useSettings } from '../hooks';

type Tema = 'oscuro' | 'claro' | 'sistema';
const readTheme = (): Tema => {
  try {
    return (localStorage.getItem('la-h-tema') as Tema) || 'oscuro';
  } catch {
    return 'oscuro';
  }
};
const applyTheme = (t: Tema) => {
  document.documentElement.dataset.theme = t === 'claro' ? 'light' : t === 'sistema' ? 'sistema' : 'oscuro';
  try {
    localStorage.setItem('la-h-tema', t);
  } catch {
    /* sin almacenamiento: solo aplica en esta sesión */
  }
};

const OPTIMIZABLE: SaltId[] = ['yeso', 'cloruroCalcio', 'epsom', 'sal', 'bicarbonato'];

export default function SettingsPage() {
  const s = useSettings();
  const catalog = useCatalog();
  const salts = s.availableSalts ?? OPTIMIZABLE;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
        </div>
      </div>
      <ProfileCard />
      <div className="card more-links">
        <h2>Más secciones</h2>
        <div className="grid grid-4">
          <Link className="btn" to="/ingredientes">
            <Icon name="ingredientes" /> Ingredientes
          </Link>
          <Link className="btn" to="/inventario">
            <Icon name="inventario" /> Inventario
          </Link>
          <Link className="btn" to="/agua">
            <Icon name="agua" /> Agua
          </Link>
          <Link className="btn" to="/equipos">
            <Icon name="equipos" /> Equipos
          </Link>
          <Link className="btn" to="/herramientas">
            <Icon name="herramientas" /> Herramientas
          </Link>
        </div>
      </div>
      <div className="card">
        <h2>Cervecería</h2>
        <div className="grid grid-2">
          <Field label="Nombre de la cervecería">
            <input className="input" value={s.breweryName} onChange={(e) => updateSettings({ breweryName: e.target.value })} />
          </Field>
          <Field label="Tu nombre (autor de las recetas)">
            <input className="input" value={s.brewerName} onChange={(e) => updateSettings({ brewerName: e.target.value })} />
          </Field>
          <Field label="Unidad de color">
            <select className="input" value={s.colorUnit} onChange={(e) => updateSettings({ colorUnit: e.target.value as 'EBC' })}>
              <option value="EBC">EBC (europea)</option>
              <option value="SRM">SRM (americana)</option>
            </select>
          </Field>
          <Field label="Tema (en este dispositivo)">
            <select className="input" defaultValue={readTheme()} onChange={(e) => applyTheme(e.target.value as Tema)}>
              <option value="oscuro">Oscuro (Red HB)</option>
              <option value="claro">Claro (para cocinar al sol)</option>
              <option value="sistema">Según el sistema</option>
            </select>
          </Field>
          <Field label="Temperatura del grano" hint="Para calcular la temperatura de empaste">
            <NumberInput value={s.grainTempC} decimals={0} onChange={(n) => updateSettings({ grainTempC: n })} unit="°C" />
          </Field>
        </div>
      </div>
      <div className="card">
        <h2>Insumos y agua</h2>
        <div className="grid grid-2">
          <Field label="Tienda donde compro" hint="Las recetas generadas usan sus maltas, lúpulos y levaduras cuando hay un equivalente real">
            <select className="input" value={s.preferredStore ?? ''} onChange={(e) => updateSettings({ preferredStore: e.target.value || undefined })}>
              <option value={DISTRINES}>Distrines</option>
              <option value="">Ninguna en particular</option>
            </select>
          </Field>
          <Field label="Mi agua">
            <select className="input" value={s.sourceWaterId} onChange={(e) => updateSettings({ sourceWaterId: e.target.value })}>
              {catalog.waters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Sales que tengo a mano</h3>
        <p className="muted" style={{ fontSize: '0.88rem' }}>
          El cálculo automático de sales solo usa las que marques y entrega los gramos exactos para tu volumen de agua.
        </p>
        <div className="grid grid-2">
          {SALTS.filter((x) => OPTIMIZABLE.includes(x.id)).map((x) => (
            <label key={x.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <input
                type="checkbox"
                style={{ marginTop: 4 }}
                checked={salts.includes(x.id)}
                onChange={(e) => updateSettings({ availableSalts: e.target.checked ? [...salts, x.id] : salts.filter((y) => y !== x.id) })}
              />
              <span>
                <strong>{x.name}</strong> <span className="faint">{x.formula}</span>
                {(DISTRINES_SALTS as readonly string[]).includes(x.id) && <span className="chip" style={{ marginLeft: 6 }}>en Distrines</span>}
                <div className="faint" style={{ fontSize: '0.8rem' }}>{x.note}</div>
              </span>
            </label>
          ))}
        </div>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.6rem' }}>
          <a href={DISTRINES_URL} target="_blank" rel="noreferrer">
            Distrines
          </a>{' '}
          vende yeso, sulfato de magnesio y carbonato de calcio. El cloruro de calcio se consigue en otras tiendas cerveceras o en proveedores de químicos (grado alimenticio).
        </p>
      </div>
      <div className="card">
        <h2>Copia de seguridad</h2>
        <p className="muted">
          Tus recetas y lotes se guardan en este navegador. Descarga una copia de vez en cuando y úsala para pasar tus datos a otro equipo o al celular.
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={async () => download(`la-h-respaldo-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup())}>
            Descargar copia
          </button>
          <label className="btn">
            Restaurar copia
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const { title, counts: c } = await importBackup(await f.text());
                  const parts = [
                    c.recipes && `${c.recipes} recetas`,
                    c.recipeVersions && `${c.recipeVersions} versiones`,
                    c.batches && `${c.batches} lotes`,
                    c.awards && `${c.awards} resultados de competencia`,
                    c.waters && `${c.waters} perfiles de agua`,
                  ].filter(Boolean);
                  alert(`${title ?? 'Copia restaurada'}.
${parts.length ? `Importado: ${parts.join(', ')}.` : ''}`);
                } catch (err) {
                  alert(err instanceof Error ? err.message : 'No se pudo restaurar.');
                }
              }}
            />
          </label>
        </div>
      </div>
      <div className="card">
        <h2>Acerca de</h2>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Rangos de estilos según la guía BJCP 2021. IBU por Tinseth, color por Morey, ABV con la fórmula de alta precisión, refractómetro por Terrill. Los valores de maltas, lúpulos y levaduras son
          típicos de ficha técnica: ajústalos con los datos de tu compra.
        </p>
      </div>
    </>
  );
}
