import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { db } from '../../db';
import { MODE_INFO, styleCompatibility, type Route } from '../../domain/intent';
import { predictSensory, sensoryFit } from '../../domain/sensory';
import type { DesignMode, RecipeIntent } from '../../domain/types';
import { IntentDesigner } from '../IntentDesigner';
import { IndexCards, SensoryCompare, SensoryEditor } from '../Sensory';
import { Field, Modal, fmtDate } from '../ui';
import type { SectionProps } from './IngredientSections';

export function IntentTab({ recipe, stats, update, catalog, style, onRoute }: SectionProps & { onRoute: (route: Route, intent: RecipeIntent) => void }) {
  const [designing, setDesigning] = useState(false);
  const intent = recipe.intent;
  const prediction = predictSensory(recipe, stats, catalog);
  const compat = style ? styleCompatibility(stats, style) : undefined;
  const fit = intent ? sensoryFit(intent.target, prediction.values) : undefined;
  const evaluated = useLiveQuery(
    () => db.batches.where('recipeId').equals(recipe.id).filter((b) => !!b.evaluation).sortBy('brewDate'),
    [recipe.id],
  );
  const lastEval = evaluated?.[evaluated.length - 1];
  const setIntent = (patch: Partial<RecipeIntent>) => update((r) => ({ ...r, intent: { mode: 'tradicional', target: {}, ...r.intent, ...patch } }));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Intención</h2>
          <button className="btn btn-sm btn-primary" onClick={() => setDesigning(true)}>
            Buscar rutas para este objetivo
          </button>
        </div>
        {!intent && (
          <p className="muted">
            Esta receta todavía no tiene un objetivo sensorial. Defínelo abajo (activa las variables que te importan) o usa "Buscar rutas" para diseñarlo desde una frase.
          </p>
        )}
        <div className="grid grid-2">
          <Field label="¿Qué quieres lograr?">
            <textarea
              className="input"
              style={{ minHeight: 60 }}
              value={intent?.text ?? ''}
              placeholder="Ej. Tripel seca, compleja y muy bebible para competencia"
              onChange={(e) => setIntent({ text: e.target.value })}
            />
          </Field>
          <Field label="Modo de diseño" hint={MODE_INFO[intent?.mode ?? 'tradicional'].help}>
            <select className="input" value={intent?.mode ?? 'tradicional'} onChange={(e) => setIntent({ mode: e.target.value as DesignMode })}>
              {(Object.keys(MODE_INFO) as DesignMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_INFO[m].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <IndexCards compat={compat} fit={fit} styleName={style?.name} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Perfil objetivo</h2>
          <span className="faint" style={{ fontSize: '0.78rem' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--idea)', borderRadius: 2, verticalAlign: 'middle' }} /> predicción de la receta actual
          </span>
        </div>
        <SensoryEditor values={intent?.target ?? {}} onChange={(target) => setIntent({ target })} predicted={prediction.values} caps={intent?.caps} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Objetivo · Predicción · Resultado</h2>
          {lastEval ? (
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              Resultado del <Link to={`/lotes/${lastEval.id}`}>lote {lastEval.code ?? `#${lastEval.number}`}</Link> ({fmtDate(lastEval.evaluation!.at)})
            </span>
          ) : (
            <span className="faint" style={{ fontSize: '0.82rem' }}>El resultado aparece al evaluar un lote en su pestaña Cata.</span>
          )}
        </div>
        <SensoryCompare target={intent?.target} prediction={prediction} result={lastEval?.evaluation?.sensory} />
      </div>

      {designing && (
        <Modal title="Rutas para este objetivo" onClose={() => setDesigning(false)} wide>
          <IntentDesigner
            equipment={recipe.equipment}
            batchSizeL={recipe.batchSizeL}
            initial={{ mode: intent?.mode ?? 'tradicional', target: intent?.target ?? {}, caps: intent?.caps, aromas: intent?.aromas, constraints: intent?.constraints, text: intent?.text, styleId: recipe.styleId }}
            chooseLabel="Ver cambios y aplicar"
            onChoose={(route, newIntent) => {
              setDesigning(false);
              onRoute(route, newIntent);
            }}
          />
        </Modal>
      )}
    </>
  );
}

