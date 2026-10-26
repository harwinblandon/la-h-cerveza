import { Link } from 'react-router-dom';
import { Icon } from '../components/Icons';
import { Info } from '../components/Info';
import { ProfileCard } from '../components/ProfileCard';
import { AccountCard } from '../components/AccountCard';
import { Field, NumberInput, download } from '../components/ui';
import { exportBackup, importBackup, updateSettings } from '../db';
import { SALTS } from '../domain/calc/water';
import { maltsters as catalogMaltsters } from '../domain/catalog';
import type { SaltId } from '../domain/types';
import { useCatalog, useProfile, useSettings } from '../hooks';
import { useSyncStatus } from '../components/AccountForm';

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
  const profile = useProfile();
  const sync = useSyncStatus(!!profile?.uid);
  const catalog = useCatalog();
  const salts = s.availableSalts ?? OPTIMIZABLE;
  const brands = catalogMaltsters(catalog);
  const myBrands = s.maltsters ?? [];
  const acid = s.acid ?? { type: 'lactico' as const, pct: 88 };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ajustes</h1>
        </div>
      </div>
      <ProfileCard />
      <AccountCard />
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
          {sync?.isAdmin && (
            <Link className="btn" to="/admin">
              <Icon name="ajustes" /> Administración
            </Link>
          )}
        </div>
      </div>
      <div className="card">
        <h2>Cervecería</h2>
        <div className="grid grid-2">
          <Field label="Nombre de la cervecería">
            <input className="input" value={s.breweryName} onChange={(e) => updateSettings({ breweryName: e.target.value })} />
          </Field>
          <Field label="Cervecero (autor de las recetas)">
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
          <Field label="Agua de origen">
            <select className="input" value={s.sourceWaterId} onChange={(e) => updateSettings({ sourceWaterId: e.target.value })}>
              {catalog.waters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Ácido para el pH</h3>
        <div className="grid grid-2">
          <Field label="Ácido">
            <select className="input" value={acid.type} onChange={(e) => updateSettings({ acid: { type: e.target.value as 'lactico', pct: e.target.value === 'fosforico' ? 85 : 88 } })}>
              <option value="lactico">Láctico</option>
              <option value="fosforico">Fosfórico</option>
            </select>
          </Field>
          <Field label="Concentración">
            <NumberInput value={acid.pct} decimals={0} onChange={(n) => updateSettings({ acid: { ...acid, pct: n } })} unit="%" />
          </Field>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Marcas de malta</h3>
        <div className="row" style={{ gap: '0.4rem' }}>
          {brands.map((b) => {
            const i = myBrands.indexOf(b);
            return (
              <button
                key={b}
                className={`chip chip-toggle${i >= 0 ? ' chip-on' : ''}`}
                onClick={() => updateSettings({ maltsters: i >= 0 ? myBrands.filter((x) => x !== b) : [...myBrands, b] })}
              >
                {i >= 0 ? `${i + 1}. ` : ''}
                {b}
              </button>
            );
          })}
        </div>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
          Las marcas seleccionadas se usan al generar recetas, en el orden en que se marcan: si la primera no tiene una malta equivalente, se usa la siguiente.
        </p>
        <h3 style={{ marginTop: '1rem' }}>Sales disponibles</h3>
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
                <div className="faint" style={{ fontSize: '0.8rem' }}>{x.note}</div>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="card">
        <h2>Listas de precios</h2>
        {Object.values(s.priceLists ?? {}).map((l) => (
          <div key={l.store} className="list-item" style={{ cursor: 'default' }}>
            <div style={{ flex: 1 }}>
              <strong>{l.store}</strong> <span className="faint">· {l.prices.length} precios · {l.asOf}</span>
              <div className="faint" style={{ fontSize: '0.8rem' }}>{l.source}</div>
            </div>
            <button
              className="btn btn-sm btn-ghost btn-danger"
              onClick={() => {
                const next = { ...s.priceLists };
                delete next[l.store];
                updateSettings({ priceLists: next });
              }}
            >
              Quitar
            </button>
          </div>
        ))}
        <label className="btn" style={{ marginTop: '0.6rem' }}>
          Cargar lista de precios
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const d = JSON.parse(await f.text());
                if (d?.app !== 'la-h' || d.kind !== 'precios' || !d.store || !Array.isArray(d.prices)) throw new Error('El archivo no es una lista de precios de esta app.');
                updateSettings({ priceLists: { ...s.priceLists, [d.store]: { store: d.store, asOf: d.asOf, source: d.source, url: d.url, prices: d.prices } } });
                alert(`${d.store}: ${d.prices.length} precios cargados en tu perfil.`);
              } catch (err) {
                alert(err instanceof Error ? err.message : 'No se pudo cargar.');
              }
              e.target.value = '';
            }}
          />
        </label>
        <Info>
          La app ya trae precios informativos 2026 de Distrines, The Craft Drinks Lab y Pronalce. Si una tienda te comparte una lista más reciente, cárgala aquí: se guarda solo
          en tu perfil (y en tus copias de seguridad) y se suma a las demás.
        </Info>
      </div>
      <div className="card">
        <h2>Copia de seguridad</h2>
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
