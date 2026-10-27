import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChangeReportView, SourceTag } from '../components/Provenance';
import { FermentablesSection, HopsSection, YeastSection } from '../components/recipe/IngredientSections';
import { CostTab } from '../components/recipe/CostTab';
import { DesignTab } from '../components/recipe/DesignTab';
import { IntentTab } from '../components/recipe/IntentTab';
import { FermentationSection, MashSection, WaterSection } from '../components/recipe/ProcessSections';
import { SuggestionsPanel, SummaryPanel } from '../components/recipe/SummaryPanel';
import { HistoricalCard } from '../components/Historical';
import { Field, Modal, NumberInput, Tabs, download, fmt, fmtDateTime } from '../components/ui';
import { EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { AROMA_LABEL } from '../data/hops';
import { YEAST_FAMILY_LABEL } from '../data/yeasts';
import { db, saveVersion } from '../db';
import { createBatch } from '../domain/batch';
import { exportBeerXml } from '../domain/beerxml';
import { GUIDELINE_LABEL, byId, guidelineOf } from '../domain/catalog';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { fmtSg, uid } from '../domain/calc/units';
import { generateFromStyle, scaleRecipe } from '../domain/recipeFactory';
import { analyzeRecipe, type Suggestion } from '../domain/suggest/analysis';
import { styleCompatibility } from '../domain/intent';
import { predictSensory, sensoryFit } from '../domain/sensory';
import { hopsForStyle, yeastsForStyle } from '../domain/suggest/substitutes';
import type { Recipe, RecipeVersion } from '../domain/types';
import { VERSION_REASON_LABEL, changeReport, hasUnversionedChanges } from '../domain/versioning';
import { useBrewPrefs, useCatalog, useEquipment, useSettings } from '../hooks';
import { OpenRangesNote, StyleOptions, StyleRangeChips } from '../components/StyleOptions';

type Tab = 'diseno' | 'intencion' | 'ingredientes' | 'macerado' | 'agua' | 'fermentacion' | 'costo' | 'asistente' | 'historial' | 'notas';

/** Un cambio propuesto que se muestra con sus consecuencias antes de aplicarlo. */
interface PendingChange {
  title: string;
  next: Recipe;
  confirmLabel?: string;
  /** Se ejecuta antes de aplicar (por ejemplo, guardar una versión de respaldo). */
  before?: () => Promise<void>;
}

export default function RecipeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const catalog = useCatalog();
  const settings = useSettings();
  const prefs = useBrewPrefs();
  const equipment = useEquipment();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'diseno' ? 'diseno' : 'ingredientes');
  const [scaling, setScaling] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [pending, setPending] = useState<PendingChange | null>(null);
  const history = useRef<Recipe[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const versions = useLiveQuery(() => db.recipeVersions.where('recipeId').equals(id!).sortBy('number'), [id]) ?? [];
  const last = versions[versions.length - 1];

  useEffect(() => {
    db.recipes.get(id!).then((r) => setRecipe(r ?? null));
  }, [id]);

  // Guardado automático del borrador. Las versiones guardadas nunca se tocan.
  useEffect(() => {
    if (!recipe) return;
    const t = setTimeout(() => db.recipes.put(recipe), 350);
    return () => clearTimeout(t);
  }, [recipe]);

  const update = (fn: (r: Recipe) => Recipe, remember = false) =>
    setRecipe((r) => {
      if (!r) return r;
      if (remember) {
        history.current = [...history.current.slice(-29), r];
        setCanUndo(true);
      }
      return { ...fn(r), updatedAt: Date.now() };
    });

  const undo = () => {
    const prev = history.current.pop();
    if (prev) setRecipe(prev);
    setCanUndo(history.current.length > 0);
  };

  const source = byId(catalog.waters, recipe?.water.sourceProfileId);
  const target = byId(catalog.waters, recipe?.water.targetProfileId);
  const style = byId(catalog.styles, recipe?.styleId);
  const stats = useMemo(() => (recipe ? computeRecipeStats(recipe, source, settings.grainTempC) : undefined), [recipe, source, settings.grainTempC]);
  const suggestions = useMemo(
    () => (recipe && stats ? analyzeRecipe({ recipe, stats, style, catalog, sourceWater: source, targetWater: target, availableSalts: prefs.availableSalts, acid: prefs.acid }) : []),
    [recipe, stats, style, catalog, source, target, prefs.availableSalts],
  );

  if (recipe === undefined) return <p className="muted">Cargando…</p>;
  if (recipe === null || !stats)
    return (
      <div className="card">
        <p>No encontré esta receta.</p>
        <Link to="/recetas">Volver a recetas</Link>
      </div>
    );

  const dirty = hasUnversionedChanges(recipe, last);
  const indices = {
    style: style ? styleCompatibility(stats, style).score : undefined,
    sensory: recipe.intent ? sensoryFit(recipe.intent.target, predictSensory(recipe, stats, catalog).values)?.score : undefined,
  };
  const markIntentional = (s: Suggestion) => {
    const reason = prompt(`¿Por qué te apartas del estilo en "${s.title}"? (queda anotado en la receta)`, '');
    if (reason === null) return;
    update((r) => ({ ...r, deviations: { ...r.deviations, [s.key]: reason.trim() } }), true);
  };
  const reconsider = (s: Suggestion) =>
    update((r) => {
      const next = { ...r.deviations };
      delete next[s.key];
      return { ...r, deviations: next };
    }, true);
  const props = { recipe, stats, update: (fn: (r: Recipe) => Recipe) => update(fn), catalog, style };
  const propose = (title: string, next: Recipe, extra?: Partial<PendingChange>) => setPending({ title, next, ...extra });
  const proposeSuggestion = (si: number, ai: number) => {
    const s = suggestions[si];
    const a = s.actions![ai];
    propose(a.label, a.apply(recipe));
  };

  const brew = async () => {
    await db.recipes.put(recipe);
    const s = await db.settings.get('prefs');
    const number = s?.nextBatchNumber ?? 1;
    // Se cocina siempre una versión congelada: si hay cambios, se crea una nueva.
    const v = await saveVersion(recipe, 'lote');
    const batch = createBatch({ ...recipe, versionCount: v.number }, number, v);
    await db.batches.add(batch);
    await db.settings.update('prefs', { nextBatchNumber: number + 1 });
    navigate(`/lotes/${batch.id}`);
  };

  const duplicate = async (from: Recipe, label: string) => {
    const copy: Recipe = { ...structuredClone(from), id: uid(), name: `${from.name} (${label})`, versionCount: 0, archived: false, origin: { kind: 'copia', detail: `${recipe.name} ${label}` }, createdAt: Date.now(), updatedAt: Date.now() };
    await db.recipes.add(copy);
    navigate(`/recetas/${copy.id}`);
  };

  const archive = async () => {
    if (!confirm(`¿Archivar "${recipe.name}"? Se oculta de la lista, pero sus versiones y lotes se conservan. Puedes recuperarla cuando quieras.`)) return;
    await db.recipes.put({ ...recipe, archived: true });
    navigate('/recetas');
  };

  return (
    <>
      <div className="page-head">
        <div style={{ flex: 1, minWidth: 260 }}>
          <Link to="/recetas" className="faint no-print" style={{ fontSize: '0.85rem' }}>
            ← Recetas
          </Link>
          <input
            className="input"
            style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, border: 'none', background: 'transparent', padding: '0.1rem 0' }}
            value={recipe.name}
            onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
            aria-label="Nombre de la receta"
          />
          <div className="version-bar no-print">
            {last ? <span className="chip chip-accent">{last.label === `V${last.number}` ? last.label : `V${last.number} · ${last.label}`}</span> : <span className="chip">Sin versiones</span>}
            {dirty ? (
              <span className="muted">Borrador con cambios sin versionar</span>
            ) : (
              <span className="faint">Igual a la última versión</span>
            )}
            <button className="btn btn-sm" onClick={() => setSavingVersion(true)}>
              Guardar versión
            </button>
            {recipe.origin && (
              <span className="faint" style={{ fontSize: '0.8rem' }}>
                Origen: {recipe.origin.kind === 'estilo' ? recipe.origin.detail : recipe.origin.kind === 'intencion' ? `intención · ${recipe.origin.detail}` : recipe.origin.kind === 'importacion' ? `importada (${recipe.origin.detail})` : recipe.origin.kind === 'copia' ? `copia de ${recipe.origin.detail}` : 'en blanco'}
              </span>
            )}
          </div>
        </div>
        <div className="row no-print">
          {canUndo && (
            <button className="btn" onClick={undo}>
              ↶ Deshacer
            </button>
          )}
          <button className="btn btn-primary" onClick={brew} title="Crea un lote a partir de una versión congelada de esta receta">
            Cocinar este lote
          </button>
        </div>
      </div>

      {recipe.historical && (
        <div className="no-print" style={{ marginBottom: '1rem' }}>
          <HistoricalCard record={recipe.historical} />
        </div>
      )}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="grid grid-3">
          <Field label="Estilo">
            <select className="input" value={recipe.styleId ?? ''} onChange={(e) => update((r) => ({ ...r, styleId: e.target.value || undefined }))}>
              <option value="">— Sin estilo —</option>
              <StyleOptions styles={catalog.styles} />
            </select>
          </Field>
          <Field label="Equipo" hint={EQUIPMENT_TYPE_LABEL[recipe.equipment.type]}>
            <select
              className="input"
              value={recipe.equipmentId ?? ''}
              onChange={(e) => {
                const eq = equipment.find((x) => x.id === e.target.value);
                if (eq) propose(`Pasar la receta a ${eq.name}`, scaleRecipe(recipe, recipe.batchSizeL, eq));
              }}
            >
              {!equipment.some((e) => e.id === recipe.equipmentId) && <option value="">{recipe.equipment.name}</option>}
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hervor">
            <NumberInput value={recipe.boilTimeMin} decimals={0} onChange={(n) => update((r) => ({ ...r, boilTimeMin: n }))} unit="min" />
          </Field>
        </div>
      </div>

      <div className="editor-layout">
        <div className="editor-main">
          {/* Barra fija: pestañas y lo que más se ajusta (litros y eficiencia) siempre a mano. */}
          <div className="sticky-bar no-print">
            <Tabs<Tab>
              value={tab}
              onChange={setTab}
              tabs={[
                ...(recipe.design || recipe.plan ? [['diseno', 'Diseño'] as [Tab, string]] : []),
                ['intencion', 'Intención'],
                ['ingredientes', 'Ingredientes'],
                ['macerado', 'Agua y macerado'],
                ['agua', 'Agua'],
                ['fermentacion', 'Fermentación'],
                ['costo', 'Costo'],
                ['asistente', `Asistente${suggestions.length ? ` (${suggestions.length})` : ''}`],
                ['historial', `Versiones (${versions.length})`],
                ['notas', 'Notas'],
              ]}
            />
            <div className="quick-row">
              <label className="quick-field">
                <span>Litros</span>
                <NumberInput value={recipe.batchSizeL} decimals={1} onChange={(n) => update((r) => ({ ...r, batchSizeL: n }))} unit="L" ariaLabel="Litros al fermentador" />
                <button className="btn btn-sm" title="Escalar a otros litros conservando OG, IBU y color" onClick={() => setScaling(true)}>
                  Escalar
                </button>
              </label>
              <label className="quick-field">
                <span>Eficiencia</span>
                <NumberInput value={recipe.efficiencyPct} decimals={0} onChange={(n) => update((r) => ({ ...r, efficiencyPct: n }))} unit="%" ariaLabel="Eficiencia de sala" />
              </label>
              <span className="quick-stats num">
                {fmtSg(stats.og)} · {fmt(stats.ibu, 0)} IBU · {fmt(stats.abv)} % · agua {fmt(stats.water.mashWaterL + stats.water.spargeWaterL)} L
              </span>
            </div>
          </div>
          {tab === 'ingredientes' && (
            <>
              <FermentablesSection {...props} />
              <HopsSection {...props} />
              <YeastSection {...props} />
            </>
          )}
          {tab === 'intencion' && (
            <IntentTab
              {...props}
              onRoute={(route, intent) =>
                propose(`Aplicar ${route.name}`, {
                  ...route.recipe,
                  id: recipe.id,
                  name: recipe.name,
                  createdAt: recipe.createdAt,
                  versionCount: recipe.versionCount,
                  origin: recipe.origin,
                  deviations: recipe.deviations,
                  intent,
                }, { confirmLabel: 'Aplicar ruta' })
              }
            />
          )}
          {tab === 'macerado' && <MashSection {...props} />}
          {tab === 'agua' && <WaterSection {...props} />}
          {tab === 'fermentacion' && <FermentationSection {...props} />}
          {tab === 'asistente' && (
            <>
              <SuggestionsPanel suggestions={suggestions} onApply={(s, i) => proposeSuggestion(suggestions.indexOf(s), i)} onIntentional={markIntentional} onReconsider={reconsider} />
              {style && (
                <StyleGuideCard
                  styleId={style.id}
                  recipe={recipe}
                  onRegenerate={(r) => propose('Regenerar la receta desde la guía del estilo', r, { confirmLabel: 'Reemplazar receta' })}
                />
              )}
            </>
          )}
          {tab === 'historial' && (
            <VersionHistory
              recipe={recipe}
              versions={versions}
              dirty={dirty}
              onRestore={(v) =>
                propose(`Restaurar ${v.label}`, { ...structuredClone(v.snapshot), id: recipe.id, createdAt: recipe.createdAt, versionCount: recipe.versionCount }, {
                  confirmLabel: 'Restaurar como borrador',
                  before: async () => {
                    if (dirty) await saveVersion(recipe, 'restauracion', undefined, `Respaldo automático antes de restaurar ${v.label}`);
                  },
                })
              }
              onBranch={(v) => duplicate(v.snapshot, v.label)}
            />
          )}
          {tab === 'costo' && <CostTab {...props} />}
          {tab === 'diseno' && <DesignTab {...props} propose={(title, next) => propose(title, next)} />}
          {tab === 'notas' && (
            <div className="card">
              <h2>Notas</h2>
              <textarea
                className="input"
                style={{ minHeight: 220 }}
                value={recipe.notes ?? ''}
                placeholder="Ideas, cambios respecto al lote anterior, proveedores…"
                onChange={(e) => update((r) => ({ ...r, notes: e.target.value }))}
              />
              <div className="row no-print" style={{ marginTop: '1rem' }}>
                <button className="btn" onClick={() => duplicate(recipe, 'copia')}>
                  Duplicar
                </button>
                <button className="btn" onClick={() => download(`${recipe.name}.xml`, exportBeerXml([recipe], catalog), 'application/xml')}>
                  Exportar BeerXML
                </button>
                <button className="btn" onClick={() => download(`${recipe.name}.json`, JSON.stringify({ app: 'la-h', recipe, versions }, null, 2))}>
                  Exportar receta (con versiones)
                </button>
                <button className="btn" onClick={() => window.print()}>
                  Imprimir
                </button>
                <span className="spacer" />
                <button className="btn btn-danger" onClick={archive}>
                  Archivar receta
                </button>
              </div>
            </div>
          )}
          {/* Acciones también al final, para no volver arriba. */}
          <div className="action-bar no-print">
            {canUndo && (
              <button className="btn" onClick={undo}>
                ↶ Deshacer
              </button>
            )}
            <button className="btn" onClick={() => setSavingVersion(true)}>
              Guardar versión
            </button>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={brew}>
              Cocinar este lote
            </button>
          </div>
        </div>
        <aside className="editor-side">
          <SummaryPanel recipe={recipe} stats={stats} style={style} colorUnit={settings.colorUnit} indices={indices} />
          {tab !== 'asistente' && (
            <SuggestionsPanel compact suggestions={suggestions} onApply={(s, i) => proposeSuggestion(suggestions.indexOf(s), i)} onIntentional={markIntentional} />
          )}
        </aside>
      </div>

      {scaling && <ScaleModal recipe={recipe} onClose={() => setScaling(false)} onScale={(r) => (setScaling(false), propose('Escalar la receta', r))} />}
      {savingVersion && (
        <SaveVersionModal
          next={(last?.number ?? 0) + 1}
          last={last}
          recipe={recipe}
          onClose={() => setSavingVersion(false)}
          onSave={async (label, note) => {
            const v = await saveVersion(recipe, 'manual', label, note);
            setRecipe((r) => (r ? { ...r, versionCount: v.number } : r));
            setSavingVersion(false);
          }}
        />
      )}
      {pending && (
        <Modal title={pending.title} onClose={() => setPending(null)} wide>
          <ChangeReportView report={changeReport(recipe, pending.next, source)} emptyText="Este cambio no modifica la receta." />
          <div className="row" style={{ marginTop: '1rem' }}>
            <button
              className="btn btn-primary"
              onClick={async () => {
                await pending.before?.();
                const next = pending.next;
                update(() => next, true);
                setPending(null);
              }}
            >
              {pending.confirmLabel ?? 'Aplicar cambio'}
            </button>
            <button className="btn" onClick={() => setPending(null)}>
              Cancelar
            </button>
            <span className="faint" style={{ fontSize: '0.82rem' }}>
              Puedes deshacerlo después. Las versiones guardadas no se modifican.
            </span>
          </div>
        </Modal>
      )}
    </>
  );
}

function SaveVersionModal({ next, last, recipe, onClose, onSave }: { next: number; last?: RecipeVersion; recipe: Recipe; onClose: () => void; onSave: (label: string, note: string) => void }) {
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const catalog = useCatalog();
  const source = byId(catalog.waters, recipe.water.sourceProfileId);
  return (
    <Modal title={`Guardar versión V${next}`} onClose={onClose} wide>
      <p className="muted">Una versión es una foto que nunca se modifica. Sirve para comparar, volver atrás y saber exactamente qué cocinaste.</p>
      <div className="grid grid-2">
        <Field label="Nombre (opcional)" hint={`Si lo dejas vacío se llamará V${next}`}>
          <input className="input" value={label} placeholder="Ej. Competencia 2027" onChange={(e) => setLabel(e.target.value)} />
        </Field>
        <Field label="¿Qué cambió y por qué?">
          <input className="input" value={note} placeholder="Ej. Menos crystal: el lote anterior quedó dulce" onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {last && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Cambios desde {last.label}</h3>
          <ChangeReportView report={changeReport(last.snapshot, recipe, source)} emptyText="Sin cambios técnicos respecto a la versión anterior." />
        </div>
      )}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={() => onSave(label, note)}>
          Guardar V{next}
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

function VersionHistory({
  recipe,
  versions,
  dirty,
  onRestore,
  onBranch,
}: {
  recipe: Recipe;
  versions: RecipeVersion[];
  dirty: boolean;
  onRestore: (v: RecipeVersion) => void;
  onBranch: (v: RecipeVersion) => void;
}) {
  const catalog = useCatalog();
  const source = byId(catalog.waters, recipe.water.sourceProfileId);
  const batches = useLiveQuery(() => db.batches.where('recipeId').equals(recipe.id).toArray(), [recipe.id]) ?? [];
  const [compare, setCompare] = useState<{ title: string; a: Recipe; b: Recipe } | null>(null);
  const list = [...versions].reverse();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Versiones</h2>
        {dirty && versions.length > 0 && (
          <button className="btn btn-sm" onClick={() => setCompare({ title: `Borrador actual frente a ${versions[versions.length - 1].label}`, a: versions[versions.length - 1].snapshot, b: recipe })}>
            ¿Qué cambié desde la última?
          </button>
        )}
      </div>
      {list.length === 0 && <p className="muted">Aún no hay versiones. Se crea una automáticamente al cocinar un lote, o guárdala tú con "Guardar versión".</p>}
      {list.map((v) => {
        const prev = versions.find((x) => x.number === v.number - 1);
        const cooked = batches.filter((b) => b.recipeVersionId === v.id);
        const s = computeRecipeStats(v.snapshot);
        return (
          <div key={v.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <span className="chip chip-accent">V{v.number}</span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 650 }}>{v.label}</div>
              <div className="faint" style={{ fontSize: '0.8rem' }}>
                {fmtDateTime(v.createdAt)} · {VERSION_REASON_LABEL[v.reason]} · {fmtSg(s.og)} · {fmt(s.ibu, 0)} IBU · {fmt(s.abv)} %
              </div>
              {v.note && <div style={{ fontSize: '0.88rem', marginTop: 2 }}>{v.note}</div>}
              {cooked.length > 0 && (
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  Cocinada en:{' '}
                  {cooked.map((b) => (
                    <Link key={b.id} to={`/lotes/${b.id}`} style={{ marginRight: 8 }}>
                      Lote {b.code ?? `#${b.number}`}
                    </Link>
                  ))}
                </div>
              )}
            </div>
            <div className="row">
              {prev && (
                <button className="btn btn-sm" onClick={() => setCompare({ title: `${prev.label} → ${v.label}`, a: prev.snapshot, b: v.snapshot })}>
                  Qué cambió
                </button>
              )}
              <button className="btn btn-sm" onClick={() => setCompare({ title: `${v.label} frente al borrador actual`, a: v.snapshot, b: recipe })}>
                Comparar con actual
              </button>
              <button className="btn btn-sm" onClick={() => onRestore(v)}>
                Restaurar
              </button>
              <button className="btn btn-sm btn-ghost" title="Crear una receta nueva a partir de esta versión" onClick={() => onBranch(v)}>
                Nueva receta
              </button>
            </div>
          </div>
        );
      })}
      {compare && (
        <Modal title={compare.title} onClose={() => setCompare(null)} wide>
          <ChangeReportView report={changeReport(compare.a, compare.b, source)} />
        </Modal>
      )}
    </div>
  );
}

function ScaleModal({ recipe, onClose, onScale }: { recipe: Recipe; onClose: () => void; onScale: (r: Recipe) => void }) {
  const equipment = useEquipment();
  const [vol, setVol] = useState(recipe.batchSizeL);
  const [eqId, setEqId] = useState(recipe.equipmentId ?? '');
  const eq = equipment.find((e) => e.id === eqId);
  return (
    <Modal title="Escalar receta" onClose={onClose}>
      <p className="muted">Ajusta cantidades para otro volumen o equipo, manteniendo la densidad, el amargor y el color.</p>
      <div className="grid grid-2">
        <Field label="Nuevo volumen al fermentador">
          <NumberInput value={vol} decimals={1} onChange={setVol} unit="L" />
        </Field>
        <Field label="Equipo">
          <select className="input" value={eqId} onChange={(e) => setEqId(e.target.value)}>
            {equipment.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={() => onScale(scaleRecipe(recipe, vol, eq))}>
          Ver cambios
        </button>
        <button className="btn" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

function StyleGuideCard({ styleId, recipe, onRegenerate }: { styleId: string; recipe: Recipe; onRegenerate: (r: Recipe) => void }) {
  const catalog = useCatalog();
  const prefs = useBrewPrefs();
  const style = byId(catalog.styles, styleId)!;
  const source = byId(catalog.waters, recipe.water.sourceProfileId);
  const yeasts = yeastsForStyle(style, catalog, 6);
  const hops = hopsForStyle(style, catalog, 8);
  const water = byId(catalog.waters, style.guide.waterProfileId);
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          {style.code} · {style.name}
        </h2>
        <button
          className="btn btn-sm"
          onClick={() => {
            const fresh = generateFromStyle({
              style,
              equipment: recipe.equipment,
              batchSizeL: recipe.batchSizeL,
              catalog,
              sourceWater: source ? { id: source.id, ions: source } : undefined,
              name: recipe.name,
              ...prefs,
            });
            onRegenerate({ ...fresh, id: recipe.id, createdAt: recipe.createdAt, equipmentId: recipe.equipmentId, versionCount: recipe.versionCount });
          }}
        >
          Regenerar desde el estilo
        </button>
      </div>
      <p>{style.description}</p>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <SourceTag source={guidelineOf(style)} />
        <StyleRangeChips style={style} fg />
      </div>
      <OpenRangesNote style={style} base={byId(catalog.styles, style.baseStyleId)} />
      <div className="row-between">
        <h3 style={{ margin: 0 }}>Recomendaciones</h3>
        <SourceTag source="regla" note={`Receta guía y selección de ingredientes propias de la app, no forman parte de la guía ${GUIDELINE_LABEL[guidelineOf(style)]}`} />
      </div>
      <div className="grid grid-2" style={{ marginTop: '0.5rem' }}>
        <div>
          <h3>Levaduras</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
            {yeasts.map((y) => (
              <li key={y.id}>
                {y.name} <span className="faint">({y.lab}, {YEAST_FAMILY_LABEL[y.family]})</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Lúpulos</h3>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.9rem' }}>
            {hops.map((h) => (
              <li key={h.id}>
                {h.name} <span className="faint">— {h.aroma.slice(0, 3).map((a) => AROMA_LABEL[a] ?? a).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <hr className="hr" />
      <div className="kv">
        <dt>Agua sugerida</dt>
        <dd>{water?.name}</dd>
        <dt>Macerado</dt>
        <dd>{style.guide.mashTempC} °C</dd>
        <dt>Fermentación</dt>
        <dd>{style.guide.fermentTempC} °C</dd>
        <dt>Carbonatación</dt>
        <dd>{fmt(style.guide.carbonation)} vol</dd>
      </div>
      {style.guide.notes && <p className="callout" style={{ marginTop: '0.75rem' }}>{style.guide.notes}</p>}
    </div>
  );
}

