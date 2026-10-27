import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { IntentDesigner } from '../components/IntentDesigner';
import { DesignImportModal } from '../components/DesignImport';
import { StyleWizard } from '../components/StyleWizard';
import { STATUS_HIST } from '../components/Historical';
import { Empty, Field, Modal, NumberInput, Swatch, Tabs, fmt, fmtDate } from '../components/ui';
import { EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { confirmDeleteRecipe, db, saveVersion } from '../db';
import { importBeerXml } from '../domain/beerxml';
import { byId } from '../domain/catalog';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { fmtSg, uid } from '../domain/calc/units';
import type { Recipe, RecipeVersion } from '../domain/types';
import { useCatalog, useEquipment, useSettings } from '../hooks';

export default function Recipes() {
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().toArray(), []);
  const catalog = useCatalog();
  const [params] = useSearchParams();
  const [wizard, setWizard] = useState(params.get('nueva') !== null);
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [pasting, setPasting] = useState(false);
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
        </div>
        <div className="row">
          <ImportButton />
          <button className="btn" onClick={() => setPasting(true)}>
            Pegar un diseño
          </button>
          <button className="btn btn-primary" onClick={() => setWizard(true)}>
            + Nueva receta
          </button>
        </div>
      </div>

      {recipes && recipes.length === 0 ? (
        <div className="card">
          <Empty icon="recetas" title="Aún no tienes recetas">
            <p>Con un estilo se arma una receta base para el equipo, con maltas, lúpulos, levadura y agua.</p>
            <button className="btn btn-primary" onClick={() => setWizard(true)}>
              Crear la primera receta
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
      {pasting && <DesignImportModal onClose={() => setPasting(false)} />}
      {wizard && <NewRecipeWizard onClose={() => setWizard(false)} initialStyle={params.get('estilo') ?? undefined} />}
    </>
  );
}

function RecipeRow({ recipe }: { recipe: Recipe }) {
  const catalog = useCatalog();
  const stats = useMemo(() => computeRecipeStats(recipe), [recipe]);
  const style = byId(catalog.styles, recipe.styleId);
  return (
    <Link to={`/recetas/${recipe.id}`} className="list-item">
      <Swatch srm={stats.srm} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650, display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {recipe.name}
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
        <button
          className="btn btn-sm btn-ghost btn-danger"
          title="Eliminar la receta"
          onClick={(e) => {
            e.preventDefault();
            confirmDeleteRecipe(recipe);
          }}
        >
          Eliminar
        </button>
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
    <label className="btn" title="BeerXML (Brewfather, BeerSmith…) o receta exportada desde esta app">
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
            alert(err instanceof Error && err.message !== 'formato' ? err.message : 'No pude leer ese archivo. Usa un BeerXML (.xml) o una receta exportada desde esta app (.json).');
          }
        }}
      />
    </label>
  );
}

export function NewRecipeWizard({ onClose, initialStyle }: { onClose: () => void; initialStyle?: string }) {
  const [how, setHow] = useState<'estilo' | 'intencion'>(initialStyle ? 'estilo' : 'intencion');
  const equipment = useEquipment();
  const settings = useSettings();
  const navigate = useNavigate();
  const [eqId, setEqId] = useState(settings.defaultEquipmentId);
  const [batch, setBatch] = useState<number | undefined>();
  const [name, setName] = useState('');

  const eq = equipment.find((e) => e.id === eqId) ?? equipment[0];
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
      <Field label="¿Cuántos litros finales quieres?">
        <NumberInput value={batch} onChange={setBatch} unit="L" decimals={1} placeholder="Litros al fermentador" />
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
          {!batch && <p className="faint" style={{ fontSize: '0.85rem', margin: 0 }}>Indica los litros finales para diseñar la receta.</p>}
          {!!batch && <IntentDesigner
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
          />}
        </div>
      )}
      {how === 'estilo' && <StyleWizard initialStyle={initialStyle} />}
    </Modal>
  );
}
