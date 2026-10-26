import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, saveVersion } from '../db';
import { byId } from '../domain/catalog';
import { readDesign } from '../domain/designImport';
import { useBrewPrefs, useCatalog, useEquipment, useSettings } from '../hooks';
import { Modal } from './ui';

/** Pegar un diseño escrito: la app muestra lo que entendió y lo que no, y crea la receta con su plan. */
export function DesignImportModal({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const equipment = useEquipment();
  const settings = useSettings();
  const prefs = useBrewPrefs();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [eqId, setEqId] = useState(settings.defaultEquipmentId);
  const [step, setStep] = useState<'pegar' | 'lectura'>('pegar');
  const eq = equipment.find((e) => e.id === eqId) ?? equipment[0];
  const source = byId(catalog.waters, settings.sourceWaterId);

  const reading = useMemo(
    () =>
      step === 'lectura' && eq
        ? readDesign(text, {
            catalog,
            equipment: eq,
            sourceWater: source ? { id: source.id, ions: source } : undefined,
            acid: prefs.acid,
            availableSalts: prefs.availableSalts,
            maltsters: prefs.maltsters,
          })
        : undefined,
    [step, text, eq, catalog, source, prefs],
  );

  const create = async () => {
    if (!reading) return;
    const r = { ...reading.recipe, author: settings.brewerName || undefined };
    for (const w of reading.waters) await db.waters.put(w);
    await db.recipes.add(r);
    await saveVersion(r, 'importacion', 'Diseño original');
    navigate(`/recetas/${r.id}?tab=diseno`);
  };

  return (
    <Modal title="Pegar un diseño" onClose={onClose} wide>
      {step === 'pegar' ? (
        <div className="stack">
          <textarea
            className="input"
            style={{ minHeight: 320, fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}
            placeholder="Pega aquí el diseño completo (parámetros, grano, lúpulos, agua, proceso, fermentación, adiciones…)."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row">
            <label className="field" style={{ minWidth: 220 }}>
              <span>Equipo</span>
              <select className="input" value={eqId} onChange={(e) => setEqId(e.target.value)}>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="spacer" />
            <button className="btn btn-primary" disabled={text.trim().length < 40} onClick={() => setStep('lectura')}>
              Leer el diseño
            </button>
          </div>
        </div>
      ) : (
        reading && (
          <div className="stack">
            <p style={{ margin: 0 }}>
              <strong>{reading.recipe.name}</strong>
              {reading.recipe.design?.styleName ? ` · ${reading.recipe.design.styleName}` : ''} · {reading.recipe.batchSizeL} L
            </p>
            {reading.warnings.map((w) => (
              <p key={w} className="callout callout-warn" style={{ margin: 0, fontSize: '0.88rem' }}>
                {w}
              </p>
            ))}
            <div className="design-read">
              {reading.sections.map((s) => (
                <div key={s.title} className="design-read-section">
                  <div className="stat-label">{s.title}</div>
                  <ul>
                    {s.items.map((i, k) => (
                      <li key={k}>
                        <span className="faint">{i.label}</span> {i.value && <>· {i.value}</>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {reading.unread.length > 0 && (
              <details>
                <summary className="faint" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                  {reading.unread.length} líneas con datos que no se usaron (quedan en el texto original de la receta)
                </summary>
                <ul style={{ fontSize: '0.82rem' }}>
                  {reading.unread.map((l, k) => (
                    <li key={k}>{l}</li>
                  ))}
                </ul>
              </details>
            )}
            <div className="action-bar">
              <button className="btn" onClick={() => setStep('pegar')}>
                ← Editar el texto
              </button>
              <span className="spacer" />
              <button className="btn btn-primary" onClick={create}>
                Crear la receta
              </button>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}
