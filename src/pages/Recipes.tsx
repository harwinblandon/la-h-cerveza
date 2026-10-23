import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IntentDesigner } from '../components/IntentDesigner';
import { AwardChip, STATUS_HIST } from '../components/Historical';
import { Empty, Field, Modal, NumberInput, Swatch, Tabs, fmt, fmtDate } from '../components/ui';
import { EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { db, saveVersion } from '../db';
import { importBeerXml } from '../domain/beerxml';
import { byId } from '../domain/catalog';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { fmtSg, uid } from '../domain/calc/units';
import { generateFromStyle, newRecipe } from '../domain/recipeFactory';
import type { Recipe, RecipeVersion } from '../domain/types';
import { useBrewPrefs, useCatalog, useEquipment, useSettings } from '../hooks';

export default function Recipes() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), []);
  const catalog = useCatalog();
  const [params] = useSearchParams();
  const [wizard, setWizard] = useState(params.get('nueva') !== null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = (recipes ?? []).filter((r) => r.archived).length;

  const filtered = (recipes ?? []).filter((r) => {
    if (!!r.archived !== showArchived) return false;
    const style = byId(catalog.styles, r.styleId);
    return `${r.name} ${style?.name ?? ''}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recetas</h1>
          <p className="muted">Planifica, ajusta al estilo y lleva cada receta a la olla.</p>
        </div>
        <div className="row">
          <ImportButton />
          <button className="btn btn-primary" onClick={() => setWizard(true)}>
            + Nueva receta
          </button>
        </div>
      </div>

      {recipes && recipes.length === 0 ? (
        <div className="card">
          <Empty icon="recetas" title="Aún no tienes recetas">
            <p>Elige un estilo y La H te arma una receta base para tu equipo, con maltas, lúpulos, levadura y agua.</p>
            <button className="btn btn-primary" onClick={() => setWizard(true)}>
              Crear mi primera receta
            </button>
          </Empty>
        </div>
      ) : (
        <div className="card">
          <div className="row" style={{ marginBottom: '0.5rem' }}>
            <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar por nombre o estilo…" value={q} onChange={(e) => setQ(e.target.value)} />
            {(archivedCount > 0 || showArchived) && (
              <button className="btn btn-sm" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? '← Recetas activas' : `Archivadas (${archivedCount})`}
              </button>
            )}
          </div>
          {filtered.map((r) => (
            <RecipeRow key={r.id} recipe={r} />
          ))}
        </div>
      )}
      {wizard && <NewRecipeWizard onClose={() => setWizard(false)} initialStyle={params.get('estilo') ?? undefined} />}
    </>
  );
}

function RecipeRow({ recipe }: { recipe: Recipe }) {
  const catalog = useCatalog();
  const awards = useLiveQuery(() => db.awards.where('recipeId').equals(recipe.id).filter((a) => a.result !== 'inscrita').toArray(), [recipe.id]) ?? [];
  const stats = useMemo(() => computeRecipeStats(recipe), [recipe]);
  const style = byId(catalog.styles, recipe.styleId);
  return (
    <Link to={`/recetas/${recipe.id}`} className="list-item">
      <Swatch srm={stats.srm} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {recipe.name}
          {awards.map((a) => (
            <AwardChip key={a.id} award={a} />
          ))}
          {recipe.historical && <span className="chip">{STATUS_HIST[recipe.historical.status]}</span>}
        </div>
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          {style ? `${style.code} · ${style.name}` : 'Sin estilo'} · {fmt(recipe.batchSizeL, 0)} L · {EQUIPMENT_TYPE_LABEL[recipe.equipment.type].split(' (')[0]}
        </div>
      </div>
      <div className="num" style={{ textAlign: 'right', fontSize: '0.85rem' }}>
        <div>
          {fmtSg(stats.og)} · {fmt(stats.abv)} % · {fmt(stats.ibu, 0)} IBU
        </div>
        <div className="faint">
          {recipe.versionCount ? `V${recipe.versionCount} · ` : ''}
          {fmtDate(recipe.updatedAt)}
        </div>
        {recipe.archived && (
          <button
            className="btn btn-sm"
            onClick={(e) => {
              e.preventDefault();
              db.recipes.update(recipe.id, { archived: false });
            }}
          >
            Desarchivar
          </button>
        )}
      </div>
    </Link>
  );
}

function ImportButton() {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const equipment = useEquipment();
  const settings = useSettings();
  const eq = equipment.find((e) => e.id === settings.defaultEquipmentId) ?? equipment[0];

  const importFile = async (file: File) => {
    const text = await file.text();
    const added: Recipe[] = [];
    if (/^\s*</.test(text)) {
      // BeerXML: Brewfather, BeerSmith, Brewer's Friend…
      const { recipes, notes } = importBeerXml(text, catalog, eq);
      for (const r of recipes) {
        r.water.sourceProfileId = settings.sourceWaterId;
        await db.recipes.add(r);
        await saveVersion(r, 'importacion', 'V1 importada', `Importada de ${file.name}`);
        added.push(r);
      }
      alert(
        `Importé ${recipes.length} receta${recipes.length === 1 ? '' : 's'} usando tu equipo "${eq.name}".` +
          (notes.length ? `\n\n${notes.join('\n\n')}` : '') +
          '\n\nRevisa volúmenes y eficiencia: BeerXML no trae todos los datos de tu equipo.',
      );
    } else {
      const data = JSON.parse(text);
      const r: Recipe = data.recipe ?? data;
      if (!r.fermentables || !r.equipment) throw new Error('formato');
      const newId = uid();
      const copy: Recipe = { ...r, id: newId, archived: false, createdAt: Date.now(), updatedAt: Date.now() };
      await db.recipes.add(copy);
      // Conserva el historial de versiones del archivo (con ids nuevos).
      const versions: RecipeVersion[] = Array.isArray(data.versions) ? data.versions : [];
      for (const v of versions) await db.recipeVersions.add({ ...v, id: uid(), recipeId: newId, snapshot: { ...v.snapshot, id: newId } });
      if (!versions.length) await saveVersion(copy, 'importacion', 'V1 importada', `Importada de ${file.name}`);
      added.push(copy);
    }
    if (added.length === 1) navigate(`/recetas/${added[0].id}`);
  };

  return (
    <label className="btn" title="BeerXML (Brewfather, BeerSmith…) o archivo de La H">
      Importar
      <input
        type="file"
        accept=".xml,.json,application/xml,text/xml,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            await importFile(file);
          } catch (err) {
            alert(err instanceof Error && err.message !== 'formato' ? err.message : 'No pude leer ese archivo. Usa un BeerXML (.xml) o una receta exportada desde La H (.json).');
          }
        }}
      />
    </label>
  );
}

export function NewRecipeWizard({ onClose, initialStyle }: { onClose: () => void; initialStyle?: string }) {
  const [how, setHow] = useState<'estilo' | 'intencion'>(initialStyle ? 'estilo' : 'intencion');
  const prefs = useBrewPrefs();
  const catalog = useCatalog();
  const equipment = useEquipment();
  const settings = useSettings();
  const navigate = useNavigate();
  const [styleId, setStyleId] = useState(initialStyle ?? '');
  const [eqId, setEqId] = useState(settings.defaultEquipmentId);
  const [batch, setBatch] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [q, setQ] = useState('');

  const eq = equipment.find((e) => e.id === eqId) ?? equipment[0];
  const style = byId(catalog.styles, styleId);
  const source = byId(catalog.waters, settings.sourceWaterId);

  const styles = catalog.styles.filter((s) => `${s.code} ${s.name} ${s.nameEn}`.toLowerCase().includes(q.toLowerCase()));

  const create = async (blank: boolean) => {
    if (!eq) return;
    let r: Recipe;
    if (blank || !style) {
      r = newRecipe(eq, settings.sourceWaterId);
      if (style) r.styleId = style.id;
      if (batch) r.batchSizeL = batch;
    } else {
      r = generateFromStyle({
        style,
        equipment: eq,
        batchSizeL: batch,
        catalog,
        sourceWater: source ? { id: source.id, ions: source } : undefined,
        ...prefs,
      });
    }
    if (name.trim()) r.name = name.trim();
    if (settings.brewerName) r.author = settings.brewerName;
    await db.recipes.add(r);
    navigate(`/recetas/${r.id}`);
  };

  const equipmentPicker = (
    <div className="grid grid-3">
      <Field label="Equipo">
        <select className="input" value={eqId} onChange={(e) => setEqId(e.target.value)}>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} — {EQUIPMENT_TYPE_LABEL[e.type]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Litros al fermentador">
        <NumberInput value={batch ?? eq?.batchSizeL} onChange={setBatch} unit="L" decimals={1} />
      </Field>
      <Field label="Nombre (opcional)">
        <input className="input" value={name} placeholder="Se propone según la ruta" onChange={(e) => setName(e.target.value)} />
      </Field>
    </div>
  );

  return (
    <Modal title="Nueva receta" onClose={onClose} wide>
      <Tabs<'estilo' | 'intencion'>
        value={how}
        onChange={setHow}
        tabs={[
          ['intencion', 'Desde una intención'],
          ['estilo', 'Desde un estilo'],
        ]}
      />
      {how === 'intencion' && eq && (
        <div className="stack">
          {equipmentPicker}
          <IntentDesigner
            equipment={eq}
            batchSizeL={batch}
            onChoose={async (route, intent) => {
              const r: Recipe = {
                ...route.recipe,
                name: name.trim() || route.recipe.name,
                author: settings.brewerName || undefined,
                intent,
                origin: { kind: 'intencion', detail: `${route.name} (${route.style.name})` },
              };
              await db.recipes.add(r);
              navigate(`/recetas/${r.id}`);
            }}
          />
        </div>
      )}
      {how === 'estilo' && (
      <div className="grid grid-2">
        <div>
          <h3>1. Estilo</h3>
          <input className="input" placeholder="Buscar estilo (ej. IPA, Stout, 21A)…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ maxHeight: 330, overflowY: 'auto', marginTop: '0.5rem' }}>
            {styles.map((s) => (
              <div
                key={s.id}
                className="pick-item"
                style={s.id === styleId ? { background: 'var(--accent-soft)' } : undefined}
                onClick={() => setStyleId(s.id)}
              >
                <Swatch srm={(s.ranges.srm[0] + s.ranges.srm[1]) / 2} size={0.7} />
                <div className="pick-main">
                  <div className="pick-title">
                    {s.code} · {s.name}
                  </div>
                  <div className="pick-sub">
                    {fmtSg(s.ranges.og[0])}–{fmtSg(s.ranges.og[1])} · {s.ranges.ibu[0]}–{s.ranges.ibu[1]} IBU · {s.ranges.abv[0]}–{s.ranges.abv[1]} %
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="stack">
          <h3>2. Equipo y volumen</h3>
          <Field label="Equipo">
            <select className="input" value={eqId} onChange={(e) => setEqId(e.target.value)}>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} — {EQUIPMENT_TYPE_LABEL[e.type]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Litros al fermentador">
            <NumberInput value={batch ?? eq?.batchSizeL} onChange={setBatch} unit="L" decimals={1} />
          </Field>
          <Field label="Nombre (opcional)">
            <input className="input" value={name} placeholder={style ? `${style.name} de La H` : 'Mi receta'} onChange={(e) => setName(e.target.value)} />
          </Field>
          {style && (
            <div className="callout">
              <strong>{style.name}</strong>
              <div style={{ fontSize: '0.88rem', marginTop: '0.25rem' }}>{style.description}</div>
            </div>
          )}
          <div className="callout callout-idea" style={{ fontSize: '0.85rem' }}>
            Agua de origen: <strong>{source?.name ?? 'sin definir'}</strong>. Puedes cambiarla en <Link to="/agua">Agua</Link>.
          </div>
          <div className="row">
            <button className="btn btn-primary" disabled={!style || !eq} onClick={() => create(false)}>
              Generar receta del estilo
            </button>
            <button className="btn" disabled={!eq} onClick={() => create(true)}>
              Empezar en blanco
            </button>
          </div>
        </div>
      </div>
      )}
    </Modal>
  );
}
