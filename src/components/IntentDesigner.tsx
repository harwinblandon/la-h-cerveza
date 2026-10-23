import { useMemo, useState } from 'react';
import { byId } from '../domain/catalog';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import { srmToHex } from '../domain/calc/color';
import { MODE_INFO, alternativeStyles, designRoutes, parseIntent, type ParsedIntent, type Route } from '../domain/intent';
import { generateFromStyle } from '../domain/recipeFactory';
import { SENSORY_INFO, predictSensory, type SensoryKey } from '../domain/sensory';
import type { DesignMode, Equipment, RecipeIntent, SensoryValues } from '../domain/types';
import { useBrewPrefs, useCatalog, useSettings } from '../hooks';
import { SourceTag } from './Provenance';
import { IndexCards, SensoryEditor } from './Sensory';
import { Field, NumberInput, fmt } from './ui';

const COLOR_OPTIONS: [string, [number, number] | undefined][] = [
  ['Cualquiera', undefined],
  ['Pálida (2–4 SRM)', [2, 4]],
  ['Dorada (3,5–6,5)', [3.5, 6.5]],
  ['Ámbar (9–15)', [9, 15]],
  ['Rojiza (11–17)', [11, 17]],
  ['Marrón (17–26)', [17, 26]],
  ['Negra (30–40)', [30, 40]],
];

const EXAMPLES = [
  'Quiero una Belgian Tripel seca, compleja, altamente bebible y apta para competencia.',
  'Quiero una Imperial Stout dulce, densa, con chocolate y café, pero sin ser empalagosa.',
  'Quiero una IPA tropical, suave, aromática y con poco amargor.',
  'Dorada, 7 % ABV, poco amarga, cuerpo medio, final ligeramente dulce y aroma tropical intenso.',
];

export interface IntentDesignerProps {
  equipment: Equipment;
  batchSizeL?: number;
  initial?: RecipeIntent & { styleId?: string };
  onChoose: (route: Route, intent: RecipeIntent) => void;
  chooseLabel?: string;
}

export function IntentDesigner({ equipment, batchSizeL, initial, onChoose, chooseLabel = 'Crear receta con esta ruta' }: IntentDesignerProps) {
  const catalog = useCatalog();
  const settings = useSettings();
  const prefs = useBrewPrefs();
  const [text, setText] = useState(initial?.text ?? '');
  const [parsed, setParsed] = useState<ParsedIntent | null>(null);
  const [styleId, setStyleId] = useState(initial?.styleId ?? '');
  const [mode, setMode] = useState<DesignMode>(initial?.mode ?? 'tradicional');
  const [target, setTarget] = useState<SensoryValues>(initial?.target ?? {});
  const [caps, setCaps] = useState<SensoryValues>(initial?.caps ?? {});
  const [aromas, setAromas] = useState<string[]>(initial?.aromas ?? []);
  const [abv, setAbv] = useState<number | undefined>(initial?.constraints?.abv);
  const [ibu, setIbu] = useState<number | undefined>(initial?.constraints?.ibu);
  const [srm, setSrm] = useState<[number, number] | undefined>(initial?.constraints?.srm);
  const [complex, setComplex] = useState(false);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const style = byId(catalog.styles, styleId);
  const source = byId(catalog.waters, settings.sourceWaterId);

  // Perfil típico del estilo (receta guía) como referencia en los deslizadores.
  const typical = useMemo(() => {
    if (!style) return undefined;
    const r = generateFromStyle({ style, equipment, catalog, store: prefs.store });
    return predictSensory(r, computeRecipeStats(r), catalog).values;
  }, [style, equipment, catalog, prefs.store]);

  const interpret = () => {
    const p = parseIntent(text, catalog);
    setParsed(p);
    setStyleId(p.styleId ?? '');
    setMode(p.mode);
    setTarget(p.target);
    setCaps(p.caps);
    setAromas(p.aromas);
    setAbv(p.constraints.abv);
    setIbu(p.constraints.ibu);
    setSrm(p.constraints.srm);
    setComplex(p.wantsComplexity);
    setRoutes(null);
  };

  const design = (overrideStyleId?: string) => {
    setBusy(true);
    setRoutes(null);
    const sid = overrideStyleId ?? styleId;
    if (overrideStyleId !== undefined) setStyleId(overrideStyleId);
    // Deja pintar el "Calculando…" antes de la búsqueda.
    setTimeout(() => {
      const input = {
        style: byId(catalog.styles, sid),
        target,
        caps,
        aromas,
        constraints: { abv, ibu, srm },
        wantsComplexity: complex,
        mode: sid ? mode : ('libre' as const),
        equipment,
        batchSizeL,
        catalog,
        sourceWater: source ? { id: source.id, ions: source } : undefined,
        ...prefs,
      };
      const rs = designRoutes(input);
      setRoutes(rs);
      setAlternatives(alternativeStyles(input, rs).map((s) => s.id));
      setBusy(false);
    }, 30);
  };

  // La ruta moderna es, por definición, una interpretación moderna (salvo en competencia).
  const modeFor = (route: Route): DesignMode => (!styleId ? 'libre' : route.id === 'C' && mode === 'tradicional' ? 'moderna' : mode);
  const intentOf = (route: Route): RecipeIntent => ({
    text: text || undefined,
    mode: modeFor(route),
    target,
    caps,
    aromas,
    constraints: { abv, ibu, srm },
    route: route.id,
  });

  const bestId = routes ? [...routes].sort((a, b) => (b.fit?.score ?? 0) - (a.fit?.score ?? 0))[0]?.id : undefined;

  return (
    <div className="stack">
      <div className="card" style={{ marginTop: 0 }}>
        <h3>1. ¿Qué cerveza quieres?</h3>
        <textarea
          className="input"
          style={{ minHeight: 70 }}
          value={text}
          placeholder="Ej. Quiero una Belgian Tripel seca, compleja, altamente bebible y apta para competencia."
          onChange={(e) => setText(e.target.value)}
        />
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <button className="btn btn-primary" disabled={!text.trim()} onClick={interpret}>
            Interpretar
          </button>
          <span className="faint" style={{ fontSize: '0.8rem' }}>Ejemplos:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="btn btn-sm btn-ghost" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setText(ex)}>
              {ex.replace('Quiero una ', '').slice(0, 38)}…
            </button>
          ))}
        </div>
        {parsed && (
          <div style={{ marginTop: '0.75rem' }}>
            <div className="row-between">
              <span className="stat-label">Lo que entendí</span>
              <SourceTag source="regla" note="Intérprete de palabras clave en español (no es IA): ajusta lo que no coincida" />
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              {parsed.matched.length === 0 && <span className="muted">No reconocí términos. Define el perfil con los deslizadores.</span>}
              {parsed.matched.map((m, i) => (
                <span key={i} className="chip chip-match">
                  “{m.phrase}” → {m.meaning}
                </span>
              ))}
            </div>
            {parsed.unsupported.map((u) => (
              <p key={u} className="callout" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                ⚠︎ {u.includes('adjuntos') ? `Mencionas ${u}.` : `${u} todavía no está en el catálogo de estilos (llega en la fase 3); se diseña en modo libre aproximando el perfil.`}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 0 }}>
        <h3>2. Ajusta el objetivo</h3>
        <div className="grid grid-3">
          <Field label="Estilo base">
            <select className="input" value={styleId} onChange={(e) => setStyleId(e.target.value)}>
              <option value="">— Sin estilo (diseño libre) —</option>
              {catalog.styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modo" hint={MODE_INFO[styleId ? mode : 'libre'].help}>
            <select className="input" value={styleId ? mode : 'libre'} disabled={!styleId} onChange={(e) => setMode(e.target.value as DesignMode)}>
              {(Object.keys(MODE_INFO) as DesignMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_INFO[m].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Color">
            <select className="input" value={COLOR_OPTIONS.findIndex(([, r]) => JSON.stringify(r) === JSON.stringify(srm))} onChange={(e) => setSrm(COLOR_OPTIONS[Number(e.target.value)][1])}>
              {COLOR_OPTIONS.map(([label], i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ABV (opcional)">
            <NumberInput value={abv} decimals={1} onChange={setAbv} unit="%" />
          </Field>
          <Field label="IBU (opcional)">
            <NumberInput value={ibu} decimals={0} onChange={setIbu} />
          </Field>
          <label className="row" style={{ fontSize: '0.88rem', alignSelf: 'end' }}>
            <input type="checkbox" checked={complex} onChange={(e) => setComplex(e.target.checked)} /> Busco complejidad
          </label>
        </div>
        <div className="row-between" style={{ margin: '0.9rem 0 0.4rem' }}>
          <span className="stat-label">Perfil sensorial objetivo (0–10)</span>
          {typical && (
            <span className="faint" style={{ fontSize: '0.78rem' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--idea)', borderRadius: 2, verticalAlign: 'middle' }} /> perfil típico de {style!.name}
              {Object.keys(caps).length > 0 && (
                <>
                  {' · '}
                  <span style={{ display: 'inline-block', width: 2, height: 10, background: 'var(--bad)', verticalAlign: 'middle' }} /> máximo pedido
                </>
              )}
            </span>
          )}
        </div>
        <SensoryEditor values={target} onChange={setTarget} predicted={typical} caps={caps} />
        {aromas.length > 0 && (
          <p className="faint" style={{ fontSize: '0.82rem', marginTop: '0.5rem' }}>
            Aromas de lúpulo buscados: {aromas.join(', ')}
          </p>
        )}
        <button className="btn btn-primary" style={{ marginTop: '0.8rem' }} disabled={busy || (!Object.keys(target).length && !styleId)} onClick={() => design()}>
          {busy ? 'Calculando rutas…' : '3. Diseñar rutas'}
        </button>
      </div>

      {routes && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="row-between">
            <h3 style={{ margin: 0 }}>3. Rutas posibles</h3>
            <SourceTag source="calculo" note="Búsqueda determinística: varía OG, FG, IBU, maltas de carácter, lúpulo, levadura y agua, y compara el perfil predicho con tu objetivo" />
          </div>
          {alternatives.length > 0 && (
            <div className="callout callout-idea" style={{ margin: '0.6rem 0', fontSize: '0.88rem' }}>
              Tu objetivo no cabe del todo en {style?.name}. Encaja mejor en:{' '}
              {alternatives.map((id) => (
                <button key={id} className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => design(id)}>
                  {byId(catalog.styles, id)?.name}
                </button>
              ))}
            </div>
          )}
          <div className="route-grid" style={{ marginTop: '0.6rem' }}>
            {routes.map((r) => (
              <div key={r.id} className={`route ${r.id === bestId ? 'best' : ''}`}>
                <div className="row-between">
                  <strong>{r.name}</strong>
                  <span className="swatch" style={{ background: srmToHex(r.stats.srm), width: 18, height: 24 }} />
                </div>
                <div className="muted" style={{ fontSize: '0.84rem' }}>{r.summary}</div>
                <div className="num" style={{ fontSize: '0.88rem' }}>
                  OG {r.stats.og.toFixed(3)} · FG {r.stats.fg.toFixed(3)} · {fmt(r.stats.abv)} % · {fmt(r.stats.ibu, 0)} IBU · {fmt(r.stats.ebc, 0)} EBC
                </div>
                <IndexCards compat={r.compat} fit={r.fit} styleName={r.style.name} />
                <details>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Decisiones técnicas</summary>
                  <ul>
                    {r.levers.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </details>
                {r.fit && (
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Objetivo frente a predicción</summary>
                    <ul>
                      {r.fit.rows.map((row) => (
                        <li key={row.key}>
                          {SENSORY_INFO[row.key as SensoryKey].label}: {fmt(row.target, 1)} → {fmt(row.predicted, 1)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {r.deviations.length > 0 && (
                  <div style={{ fontSize: '0.8rem' }}>
                    <span className="badge badge-warn">desviación intencional</span> {r.deviations.join('; ')}
                  </div>
                )}
                <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => onChoose(r, intentOf(r))}>
                  {chooseLabel}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
