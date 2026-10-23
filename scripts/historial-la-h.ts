// Genera historial-la-h.json: el historial inicial de La H Cerveza Artesanal,
// para importar en el perfil del cervecero (Ajustes → Restaurar copia / Importar historial).
//
// Reglas de integridad (pedidas por el cervecero):
// - Dato confirmado > medición real > registro de ejecución > planificado > estimación.
// - Lo no recuperado queda como "dato_no_recuperado": nunca se completa.
// - Un rango registrado se conserva como rango; el punto medio solo se usa para calcular y se marca como estimación.
// - Un premio solo se vincula a una receta/lote cuando el registro lo confirma.
//
// Uso: npx vite-node scripts/historial-la-h.ts

import { writeFileSync } from 'node:fs';
import { DEFAULT_EQUIPMENT } from '../src/data/equipment';
import { BUILTIN_CATALOG as C, byId } from '../src/domain/catalog';
import { createBatch } from '../src/domain/batch';
import { computeRecipeStats } from '../src/domain/calc/recipeStats';
import { fermentableFromCatalog, hopFromCatalog, newRecipe, yeastFromCatalog } from '../src/domain/recipeFactory';
import type {
  Award,
  Batch,
  BatchEvent,
  FermentationReading,
  HistoricalRecord,
  HistoricalValue,
  HopForm,
  HopUse,
  MiscUse,
  Recipe,
  RecipeFermentable,
  RecipeHop,
  RecipeMisc,
  RecipeVersion,
  RecipeYeast,
  WaterProfile,
} from '../src/domain/types';
import { makeVersion } from '../src/domain/versioning';

const IMPORTED_AT = Date.UTC(2026, 9, 23, 15, 0, 0);
const ORIGIN = 'Historial inicial de La H Cerveza Artesanal (importado el 23 de octubre de 2026)';
const NR = 'dato_no_recuperado';
const HOUR = 3_600_000;
let uidCounter = 0;
const uid = (p: string) => `hist-${p}-${(++uidCounter).toString(36)}`;

// ---------- Ayudantes ----------

const v = (label: string, value: string | undefined, kind: HistoricalValue['kind'], note?: string): HistoricalValue => ({ label, value: value ?? NR, kind: value ? kind : 'no-recuperado', note });

function record(status: HistoricalRecord['status'], values: HistoricalValue[], opts: Partial<HistoricalRecord> = {}): HistoricalRecord {
  return { status, origin: ORIGIN, importedAt: IMPORTED_AT, values, missing: [], warnings: [], notes: [], ...opts };
}

/** Fermentable del catálogo con la cantidad registrada (color y rendimiento son de referencia del catálogo). */
function F(id: string, kg: number, note?: string, use?: RecipeFermentable['use']): RecipeFermentable {
  const f = byId(C.fermentables, id);
  if (!f) throw new Error(`Fermentable desconocido: ${id}`);
  const rf = fermentableFromCatalog(f, kg);
  return { ...rf, uid: uid('f'), use: use ?? rf.use, sourceNote: `Cantidad registrada${note ? `; ${note}` : ''}. Color y rendimiento: ${f.sourceNote ?? 'referencia del catálogo'}.` };
}

/**
 * Lúpulo. Si el % AA está registrado se usa como tal; si no, se toma el típico del catálogo
 * solo para calcular IBU (procedencia "referencia") y el alfa real queda como no recuperado.
 */
function H(id: string, grams: number, use: HopUse, time: number, o: { alpha?: number; tempC?: number; form?: HopForm; note?: string; estimate?: string } = {}): RecipeHop {
  const h = byId(C.hops, id);
  if (!h) throw new Error(`Lúpulo desconocido: ${id}`);
  const rh = hopFromCatalog(h, grams, use, time);
  return {
    ...rh,
    uid: uid('h'),
    alpha: o.alpha ?? h.alpha,
    form: o.form ?? 'pellet',
    tempC: o.tempC ?? rh.tempC,
    source: o.estimate ? 'estimacion' : o.alpha ? 'registro' : 'referencia',
    sourceNote: [
      o.estimate ? `Rango registrado ${o.estimate}; el punto medio solo se usa para calcular` : 'Cantidad y momento registrados',
      o.alpha ? `% AA registrado (${o.alpha} %)` : `% AA no registrado: se usa el típico (${h.alpha} %) solo para calcular IBU`,
      o.note,
    ]
      .filter(Boolean)
      .join('. '),
  };
}

/** Lúpulo que no está en el catálogo: sin alfa registrado no aporta IBU al cálculo. */
function customHop(name: string, grams: number, use: HopUse, time: number, o: { tempC?: number; form?: HopForm; estimate?: string } = {}): RecipeHop {
  return {
    uid: uid('h'),
    name,
    alpha: 0,
    form: o.form ?? 'pellet',
    amountG: grams,
    use,
    time,
    tempC: o.tempC,
    source: o.estimate ? 'estimacion' : 'registro',
    sourceNote: `${o.estimate ? `Rango registrado ${o.estimate}; punto medio solo para calcular. ` : ''}Variedad fuera del catálogo y % AA no registrado: no se calcula su aporte de IBU.`,
  };
}

function Y(id: string, amount: number, note?: string): RecipeYeast {
  const y = byId(C.yeasts, id);
  if (!y) throw new Error(`Levadura desconocida: ${id}`);
  return { ...yeastFromCatalog(y, amount), uid: uid('y'), source: 'registro', sourceNote: `Levadura y cantidad registradas${note ? `; ${note}` : ''}` };
}

const M = (name: string, use: MiscUse, amount: number, unit: RecipeMisc['unit'], notes?: string, time?: number): RecipeMisc => ({ uid: uid('m'), name, use, amount, unit, notes, time });
const step = (name: string, tempC: number, timeMin: number) => ({ uid: uid('s'), name, tempC, timeMin });
const ferm = (name: string, tempC: number, days: number) => ({ uid: uid('t'), name, tempC, days });

function baseRecipe(id: string, name: string, styleId: string | undefined, batchSizeL: number, waterId: string): Recipe {
  const eq = { ...DEFAULT_EQUIPMENT[0], batchSizeL };
  const r = newRecipe(eq, waterId);
  return {
    ...r,
    id,
    name,
    styleId,
    batchSizeL,
    author: 'La H Cerveza Artesanal',
    origin: { kind: 'importacion', detail: 'Historial inicial de La H' },
    mashSteps: [],
    fermentation: [],
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
  };
}

/**
 * Eficiencia que reproduce la OG registrada con el grano registrado. No es una medición:
 * se marca como cálculo en el registro histórico.
 */
function fitEfficiency(r: Recipe, og: number, ogLabel: string): Recipe {
  const at = (eff: number) => (computeRecipeStats({ ...r, efficiencyPct: eff }).og - 1) * 1000;
  const p0 = at(0);
  const p100 = at(100);
  const eff = p100 > p0 ? ((og - 1) * 1000 - p0) / ((p100 - p0) / 100) : r.efficiencyPct;
  const rounded = Math.round(eff * 10) / 10;
  r.historical?.values.push(v('Eficiencia de sala', `${rounded.toLocaleString('es-CO')} %`, 'calculo', `Calculada para reproducir la ${ogLabel} con el grano registrado. No fue medida.`));
  return { ...r, efficiencyPct: rounded };
}

const recipes: Recipe[] = [];
const versions: RecipeVersion[] = [];
const batches: Batch[] = [];
const awards: Award[] = [];
const waters: WaterProfile[] = [];

function addRecipe(r: Recipe, versionDefs: { recipe: Recipe; label: string; note?: string }[] = [{ recipe: r, label: 'Histórico' }]) {
  versionDefs.forEach((d, i) => {
    const ver = makeVersion({ ...d.recipe, id: r.id }, i + 1, 'importacion', d.label, d.note);
    ver.id = `${r.id}-v${i + 1}`;
    ver.createdAt = IMPORTED_AT + i;
    versions.push(ver);
  });
  const last = versionDefs[versionDefs.length - 1].recipe;
  const draft = { ...last, id: r.id, versionCount: versionDefs.length };
  recipes.push(draft);
  return { recipe: draft, versionIds: versionDefs.map((_, i) => `${r.id}-v${i + 1}`) };
}

function addBatch(code: string, number: number, recipe: Recipe, versionId: string, versionNumber: number, o: Partial<Batch>): Batch {
  const b = createBatch(recipe, number);
  const batch: Batch = {
    ...b,
    id: `hist-lote-${code.toLowerCase()}`,
    code,
    recipeVersionId: versionId,
    recipeVersionNumber: versionNumber,
    status: 'historico',
    brewDate: IMPORTED_AT,
    brewDateUnknown: true,
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    ...o,
  };
  batches.push(batch);
  return batch;
}

const ev = (offsetH: number, kind: BatchEvent['kind'], text: string, extra: Partial<BatchEvent> = {}): BatchEvent => ({
  uid: uid('e'),
  at: IMPORTED_AT + offsetH * HOUR,
  kind,
  text,
  source: 'registro',
  ...extra,
});
const reading = (offsetH: number, sg: number, note?: string): FermentationReading => ({ uid: uid('r'), at: IMPORTED_AT + offsetH * HOUR, sg, source: 'medicion', note });

function award(id: string, a: Omit<Award, 'id' | 'source' | 'createdAt'>): Award {
  const x: Award = { id: `hist-premio-${id}`, source: 'registro', createdAt: IMPORTED_AT, ...a };
  awards.push(x);
  return x;
}

// ---------- 12. Agua base de Armenia (registro de La H) ----------

waters.push(
  {
    id: 'custom-hist-armenia',
    name: 'Armenia · registro histórico de La H',
    ca: 9,
    mg: 2,
    na: 5,
    so4: 7,
    cl: 8,
    hco3: 30,
    description: 'Perfil base usado históricamente por La H. pH aproximado 7,1.',
    custom: true,
    source: 'registro',
    sourceNote:
      'Valores aproximados del historial de La H. Difieren del promedio EPA de septiembre 2026 (sobre todo magnesio 2 frente a 10,9 y bicarbonato 30 frente a 63): conviene confirmarlo con un análisis de laboratorio.',
    report: { ph: 7.1 },
  },
  {
    id: 'custom-hist-hazy-oro',
    name: 'Hazy IPA Copa Raíces · perfil usado',
    ca: 127,
    mg: 9,
    na: 0,
    so4: 91,
    cl: 175,
    hco3: 0,
    description: 'Perfil aproximado de la Hazy IPA ganadora: Cl 172–178, SO₄ 90–92 (puntos medios para calcular). Bicarbonato no registrado.',
    custom: true,
    source: 'registro',
    sourceNote: 'Perfil aproximado registrado para la Hazy IPA (Oro, Copa Raíces). Rangos de Cl y SO₄ con punto medio; bicarbonato no recuperado.',
  },
  {
    id: 'custom-hist-wcipa',
    name: 'West Coast IPA · perfil objetivo de La H',
    ca: 110,
    mg: 6,
    na: 8,
    so4: 190,
    cl: 65,
    hco3: 30,
    description: 'Perfil objetivo aproximado de la West Coast IPA (pH de macerado objetivo ≈ 5,35).',
    custom: true,
    source: 'registro',
    sourceNote: 'Perfil objetivo registrado por La H para la West Coast IPA.',
  },
);
const AGUA = 'custom-hist-armenia';
const supuestoAgua = 'Agua de origen no registrada en la ficha: para calcular se usa el perfil histórico de Armenia de La H.';

// ---------- 1. Hazy IPA — Colab IPA Day (Oro, Copa Raíces) ----------
{
  let r = baseRecipe('hist-hazy-ipa-colab', 'Hazy IPA — Colab IPA Day', 'hazy-ipa', 30, AGUA);
  r.boilTimeMin = 90;
  r.fermentables = [F('best-pale-ale', 6.0), F('wheat-wey', 2.0, 'malta de trigo: marca no registrada'), F('oats-flaked', 1.2, 'avena: tipo (hojuelas o malteada) no registrado')];
  r.mashSteps = [step('Sacarificación', 67, 60)];
  r.hops = [
    H('citra', 20, 'hervor', 30),
    H('el-dorado', 25, 'hervor', 10),
    H('mosaic', 50, 'whirlpool', 0, { tempC: 71, note: 'Hopstand a 71 °C; tiempo de contacto no registrado (no se calcula su IBU)' }),
    H('el-dorado', 44, 'whirlpool', 0, { tempC: 71, estimate: '40–48 g', note: 'Hopstand a 71 °C; tiempo no registrado' }),
    H('citra', 20, 'whirlpool', 0, { tempC: 71, note: 'Hopstand a 71 °C; tiempo no registrado' }),
    { ...H('mosaic', 150, 'dry-hop', 0), source: 'registro', sourceNote: 'Cantidad PLANIFICADA (~150 g de Mosaic). La cantidad final ejecutada no se recuperó; días de contacto no registrados.' },
  ];
  r.miscs = [M('Servomyces', 'hervor', 3, 'g', 'Registrado en una versión de la receta')];
  r.water = { ...r.water, targetProfileId: 'custom-hist-hazy-oro', mashSalts: { cloruroCalcio: 14, epsom: 3.5, yeso: 3.2 }, spargeSalts: {} };
  r.fermentation = [ferm('Primaria', 18, 7), ferm('Final de fermentación', 20, 3)];
  r.carbonation = { ...r.carbonation, volumes: 2.4 };
  r.intent = { mode: 'moderna', text: 'Hazy IPA aromática, tropical, jugosa, de cuerpo suave, amargor moderado y alta tomabilidad.', target: {} };
  r.notes = 'Una de las recetas históricas exitosas de La H (Oro, Copa Raíces). Debe poder evolucionar: no es una receta "perfecta" congelada.';
  r.historical = record(
    'elaborada',
    [
      v('OG objetivo', '1.064', 'planificado'),
      v('FG objetivo', '1.013', 'planificado'),
      v('ABV objetivo', '≈ 6,7 %', 'planificado'),
      v('IBU', '≈ 32', 'planificado'),
      v('Color', '≈ 5,5 SRM', 'estimacion'),
      v('Carbonatación', '2,4 vol', 'planificado'),
      v('Grano total', '≈ 9,2 kg (Pale Ale 65,2 % · trigo 21,7 % · avena 13,0 %)', 'ejecucion'),
      v('Hopstand', '71 °C: Mosaic 50 g, El Dorado ~40–48 g, Citra 20 g', 'ejecucion', 'Tiempo de contacto no registrado'),
      v('Dry hop', '~150 g de Mosaic planificados; también Citra, El Dorado y/o Galaxy según la versión', 'planificado', 'Cantidad final exacta pendiente del registro original'),
      v('Perfil de agua', 'Ca 127 · Mg 9 · Na ~0 · Cl 172–178 · SO₄ 90–92 ppm', 'ejecucion'),
      v('Sales', 'CaCl₂ 14 g · MgSO₄ 3,5 g · CaSO₄ 3,2 g', 'ejecucion', 'Reparto entre macerado y lavado no registrado'),
      v('Levadura', 'London ESB y/o US-05; otro registro indica 2 sobres de US-05', 'ejecucion', 'PENDIENTE DE RECONCILIAR con la ficha definitiva del lote ganador'),
    ],
    {
      missing: ['Levadura definitiva del lote ganador', 'Cantidad final de dry hop y variedades', 'Tiempo de hopstand', 'Días de dry hop', 'Agua de origen', '% AA real de cada lúpulo'],
      warnings: ['La levadura no se carga en la receta hasta reconciliar London ESB / US-05.', supuestoAgua],
      notes: ['RECETA_PREMIADA = TRUE · PREMIO = ORO · COMPETENCIA = COPA RAÍCES'],
    },
  );
  r = fitEfficiency(r, 1.064, 'OG objetivo (1.064)');
  const { recipe, versionIds } = addRecipe(r, [{ recipe: r, label: 'Histórico · Oro Copa Raíces', note: 'Receta del lote premiado según el historial; levadura y dry hop finales por reconciliar.' }]);
  const b = addBatch('H-01', 9001, recipe, versionIds[0], 1, {
    name: 'Hazy IPA — Colab IPA Day',
    brewDay: { done: {}, ogMeasured: 1.065, fermenterVolumeL: 30 },
    events: [
      ev(0, 'correccion', 'Desviación real de proceso: hubo más agua de la prevista y el hervor duró cerca de 2 horas (planeado ~90 min). Más concentración y posiblemente más caramelización y color.'),
    ],
    historical: record('elaborada', [v('OG real', '≈ 1.065', 'medicion', 'Registrada como aproximada'), v('Volumen', '30 L', 'ejecucion'), v('Hervor real', '≈ 2 h', 'ejecucion')], {
      missing: ['Fecha de cocción', 'FG real', 'Volumen envasado'],
    }),
  });
  award('hazy-oro', {
    beerName: 'Hazy IPA — Colab IPA Day',
    competition: 'Copa Raíces',
    result: 'oro',
    recipeId: recipe.id,
    versionId: versionIds[0],
    batchId: b.id,
    link: 'confirmado',
    notes: 'Premio confirmado en el historial. Levadura y dry hop finales del lote por reconciliar.',
  });
}

// ---------- 2. American Barleywine — Mosaic + Voss Kveik ----------
{
  const amber = { ...F('caraamber', 0.26), ingredientId: undefined, name: 'Amber Malt', type: 'especial' as const, colorEBC: 60, ppg: 32, sourceNote: 'Cantidad registrada. Amber Malt no está en el catálogo: color (~60 EBC) y rendimiento típicos solo para calcular.' };
  let r = baseRecipe('hist-barleywine-mosaic-kveik', 'American Barleywine — Mosaic + Voss Kveik', 'american-barleywine', 30, AGUA);
  r.fermentables = [
    F('maris-otter', 13.0, 'marca no registrada'),
    F('munich-1-wey', 1.73, 'Munich I: marca no registrada'),
    F('munich-2-wey', 0.34, 'Munich II: marca no registrada'),
    amber,
    F('dextrose', 0.9, 'glucosa/dextrosa añadida de forma DIFERIDA, después de iniciada la fermentación', 'fermentador'),
  ];
  r.hops = [
    H('mosaic', 55, 'hervor', 60, { alpha: 13.6 }),
    H('mosaic', 20, 'hervor', 10, { alpha: 13.6 }),
    H('mosaic', 50, 'whirlpool', 20, { alpha: 13.6, tempC: 80 }),
    H('mosaic', 85, 'dry-hop', 2, { alpha: 13.6, note: 'Contacto aproximado 48 horas' }),
  ];
  r.yeasts = [Y('voss', 2)];
  r.fermentation = [ferm('Inicio', 35, 0), ferm('Continuación', 32, 0), ferm('Cold crash', 2, 0)];
  r.carbonation = { ...r.carbonation, volumes: 2.2 };
  r.intent = {
    mode: 'moderna',
    text: 'American Barleywine moderno: muy maltoso, alcohol alto, complejo y lupulado; Mosaic como único lúpulo; alcohol perceptible pero no áspero; buena integración; bebible para su graduación.',
    target: {},
  };
  r.historical = record(
    'elaborada',
    [
      v('OG del mosto', '≈ 1.100', 'medicion', 'Antes de considerar la glucosa diferida'),
      v('OG equivalente total', '≈ 1.107–1.108', 'estimacion', 'Incluyendo la glucosa diferida'),
      v('ABV', '≈ 10,8 %', 'estimacion', 'Posible 11,0–11,2 % si la densidad siguió bajando'),
      v('Carbonatación objetivo', '2,1–2,3 vol', 'planificado'),
      v('Maduración', 'Mejora de integración esperada a las 4–12 semanas', 'planificado'),
    ],
    {
      missing: ['Temperatura y tiempo de macerado', 'Tiempo de hervor', 'Duración de cada etapa de fermentación', 'Agua y sales', 'Eficiencia medida'],
      warnings: ['No registrar como ganador mientras no exista resultado de competencia confirmado.', supuestoAgua],
      notes: ['Parte de las botellas se destinó a experimentación con Brettanomyces bruxellensis: no mezclar esas botellas con el perfil de la cerveza base.'],
    },
  );
  r = fitEfficiency(r, 1.1, 'OG del mosto registrada (≈ 1.100, sin la glucosa diferida, que se calcula aparte)');
  const { recipe, versionIds } = addRecipe(r);
  addBatch('H-02', 9002, recipe, versionIds[0], 1, {
    name: 'American Barleywine — Mosaic + Voss Kveik',
    brewDateText: 'agosto/septiembre de 2026',
    brewDay: { done: {}, ogMeasured: 1.1, fermenterVolumeL: 30 },
    readings: [reading(24, 1.03, '≈ 24 h'), reading(72, 1.026, '≈ 72 h; lectura histórica alrededor de 1.026')],
    events: [
      ev(1, 'estado', 'Inicio de fermentación con Voss Kveik (2 sobres) a ≈ 35 °C; luego ≈ 32 °C.', { tempC: 35 }),
      ev(30, 'adicion', 'Adición diferida de 900 g de glucosa/dextrosa, después de iniciada la fermentación.'),
      ev(96, 'nota', 'FG corregida aproximada ≈ 1.028 (cálculo/corrección; la lectura medida fue ≈ 1.026).', { source: 'calculo' }),
      ev(100, 'nota', 'Cold crash a ≈ 2 °C.', { tempC: 2 }),
      ev(120, 'nota', 'Parte de las botellas se destinó a experimentación con Brettanomyces bruxellensis (no mezclar con la cerveza base).'),
    ],
    historical: record('elaborada', [v('Fecha', 'agosto/septiembre de 2026', 'ejecucion'), v('Volumen final', '≈ 30 L', 'ejecucion'), v('FG medida', '≈ 1.026', 'medicion'), v('FG corregida', '≈ 1.028', 'calculo')], {
      missing: ['Fecha exacta', 'Estado actual del lote'],
    }),
  });
}

// ---------- 3. Vienna Lager con café ----------
{
  let r = baseRecipe('hist-vienna-lager-cafe', 'Vienna Lager con café', 'vienna-lager', 40, AGUA);
  r.fermentables = [F('vienna-wey', 7.9, 'marca no registrada'), F('munich-1-wey', 1.0), F('pilsner-wey', 0.9, 'marca no registrada'), F('caramunich-2', 0.1)];
  r.hops = [H('magnum', 38, 'hervor', 60), { ...H('hallertau-mittelfruh', 35, 'hervor', 15), name: 'Hallertau (variedad no especificada)', sourceNote: 'Cantidad y momento registrados. Variedad exacta de Hallertau no registrada; % AA típico solo para calcular.' }];
  r.yeasts = [Y('w-34-70', 3)];
  r.fermentation = [ferm('Primaria presurizada', 15.5, 0)];
  r.miscs = [
    M('Café especial Sidra Natural (grano entero)', 'fermentador', 200, 'g', 'Solo en la porción de ≈ 18 L, directo en barril Cornelius. Planeado 16–18 h; límite considerado 24 h.'),
    M('Cloruro de calcio (porción con café)', 'fermentador', 0.8, 'g', 'Ajuste mineral solo para ≈ 18 L con café'),
    M('Sal (NaCl) (porción con café)', 'fermentador', 0.4, 'g', 'Ajuste mineral solo para ≈ 18 L con café; sin sulfato ni bicarbonato adicional'),
  ];
  r.historical = record(
    'elaborada',
    [
      v('OG objetivo', '1.052', 'planificado'),
      v('FG objetivo', '1.011–1.012', 'planificado'),
      v('ABV', '≈ 5,3 %', 'estimacion'),
      v('Grano total', '≈ 9,9 kg', 'ejecucion'),
      v('Fermentación', '≈ 15,5 °C, presurizada', 'ejecucion'),
    ],
    {
      missing: ['Macerado', 'Tiempo de hervor', 'Duración de la fermentación', 'Agua y sales de la base', 'Carbonatación'],
      warnings: [supuestoAgua],
      notes: [
        'Decisión histórica: se evaluó que para competencia podía ser más defendible declarar una base tipo Märzen que Vienna Lager por la percepción final. No se cambia retrospectivamente el estilo original del lote.',
      ],
    },
  );
  r = fitEfficiency(r, 1.052, 'OG objetivo (1.052)');
  const { recipe, versionIds } = addRecipe(r);
  addBatch('H-03', 9003, recipe, versionIds[0], 1, {
    name: 'Vienna Lager con café',
    brewDay: { done: {}, fermenterVolumeL: 40 },
    events: [
      ev(0, 'nota', 'Fermentación presurizada a ≈ 15,5 °C con W-34/70 (3 sobres).', { tempC: 15.5 }),
      ev(48, 'correccion', 'Reinoculación con BRY-97 durante la evolución del lote (evento de bitácora, no parte de la formulación original).'),
      ev(200, 'adicion', 'División: ≈ 18 L destinados a café. Café Sidra Natural 200 g en grano entero en Cornelius (16–18 h planeado, límite 24 h). Ajuste: CaCl₂ 0,8 g + NaCl 0,4 g.', { volumeL: 18 }),
    ],
    tastingNotes:
      'Porción con café: dulce y seca a la vez en la percepción; café muy aromático e integrado; sin carácter quemado dominante. (Descripción del historial; sin escala numérica.)',
    historical: record('elaborada', [v('Volumen base', '≈ 40 L', 'ejecucion'), v('Porción con café', '≈ 18 L', 'ejecucion')], { missing: ['Fecha', 'OG y FG reales'] }),
  });
}

// ---------- 4. Scottish con café (Bronce) ----------
{
  const r = baseRecipe('hist-scottish-cafe', 'Scottish con café', 'scottish-export', 20, AGUA);
  r.carbonation = { ...r.carbonation, volumes: 2.15 };
  r.miscs = [M('Café especial Wush Wush Natural', 'fermentador', 0, 'g', 'Cantidad, método y tiempo: dato_no_recuperado')];
  r.historical = record(
    'elaborada',
    [
      v('Estilo', 'Scottish; manejada después como Scottish Export / Scottish con café', 'ejecucion'),
      v('Maltas conocidas', 'BestMalz Pilsen, Munich y Caramunich II, entre otras', 'ejecucion', 'Cantidades exactas: dato_no_recuperado'),
      v('Macerado', '≈ 72 °C → 68 °C', 'medicion'),
      v('pH de macerado', '≈ 5,3', 'medicion'),
      v('FG', '≈ 1.018', 'medicion'),
      v('Carbonatación objetivo', '2,1–2,2 vol', 'planificado'),
      v('Carbonatación en barril', '0,95 bar a 4 °C', 'ejecucion'),
      v('Café', 'Wush Wush Natural, elegido buscando integración (evitar cafés quemados)', 'ejecucion'),
    ],
    {
      incomplete: true,
      missing: ['OG', 'ABV', 'Cantidades de malta', 'Lúpulos', 'Levadura', 'Agua y sales', 'Volumen', 'Dosis y método del café'],
      notes: [
        'RECETA_PREMIADA = TRUE · PREMIO_CONFIRMADO = BRONCE',
        'Aprendizaje: en café especial, evitar perfiles excesivamente tostados, evitar que el café se perciba separado, priorizar la integración y evaluar variedad, proceso y perfil sensorial del café.',
        'El café se percibió integrado y no como una adición artificial separada (atributo positivo).',
      ],
    },
  );
  const { recipe, versionIds } = addRecipe(r, [{ recipe: r, label: 'Histórico · Bronce', note: 'Receta incompleta: solo se conocen algunas maltas y datos de proceso.' }]);
  const b = addBatch('H-04', 9004, recipe, versionIds[0], 1, {
    name: 'Scottish con café',
    brewDay: { done: {}, mashPH: 5.3 },
    readings: [reading(240, 1.018, 'FG ≈ 1.018')],
    packaging: { method: 'barril', beerTempC: 4, psi: 13.8, notes: '0,95 bar a 4 °C durante acondicionamiento/carbonatación (registro histórico).' },
    events: [ev(0, 'medicion', 'Macerado: evolucionó de ≈ 72 °C a 68 °C; pH ≈ 5,3.', { ph: 5.3, tempC: 72 })],
    tastingNotes: 'Café integrado, no percibido como adición artificial separada. (Descripción del historial.)',
    historical: record('elaborada', [], { missing: ['Fecha', 'OG', 'Volumen'] }),
  });
  award('scottish-bronce', {
    beerName: 'Scottish con café',
    result: 'bronce',
    recipeId: recipe.id,
    versionId: versionIds[0],
    batchId: b.id,
    link: 'confirmado',
    notes: 'Bronce confirmado. Competencia: dato_no_recuperado. Existen también registros de plata/bronce para otras cervezas con café de La H.',
  });
}

// ---------- 5. Imperial Stout / Tropical Stout (2 platas) ----------
{
  const id = 'hist-imperial-stout-cafe';
  const advert = 'RECETA_ASOCIADA_HISTORICA; confirmar si corresponde exactamente al lote ganador';
  let v1 = baseRecipe(id, 'Imperial Stout de La H (con café)', 'imperial-stout', 30, AGUA);
  v1.fermentables = [F('best-pale-ale', 6.0, 'Pale Ale: marca no registrada'), F('caramunich-2', 1.2), F('carafoam', 0.5, 'Carapils'), F('black-malt', 0.8, 'malta negra: marca no registrada'), F('chocolate', 0.8, 'marca no registrada')];
  v1.hops = [H('ekg', 50, 'hervor', 60), H('ekg', 25, 'hervor', 15)];
  v1.yeasts = [Y('us-05', 2)];
  v1.miscs = [M('Café Bourbon Rosado Natural (cold brew)', 'fermentador', 300, 'g', 'Método propuesto: cold brew con ≈ 1,5 L de agua, 12–16 h; adición durante la maduración.')];
  v1.historical = record(
    'asociada',
    [v('OG', '≈ 1.080', 'estimacion'), v('FG', '≈ 1.020', 'estimacion'), v('ABV', '≈ 7,5–8,0 %', 'estimacion'), v('Volumen', '≈ 30 L', 'planificado')],
    { warnings: [advert, supuestoAgua], missing: ['Macerado', 'Fermentación', 'Agua y sales'], notes: ['Primera versión documentada (Imperial Sweet/Oatmeal Stout).'] },
  );
  v1 = fitEfficiency(v1, 1.08, 'OG estimada de la primera versión (≈ 1.080)');

  let v2 = baseRecipe(id, 'Imperial Stout de La H (con café)', 'imperial-stout', 30, AGUA);
  v2.fermentables = [
    F('best-pale-ale', 7.0, 'Pale Ale: marca no registrada'),
    F('carafoam', 0.5, 'Carapils'),
    F('caramunich-2', 0.6),
    F('oats-flaked', 1.0, 'avena: tipo no registrado'),
    F('lactose', 0.75),
    F('chocolate', 0.6, 'marca no registrada'),
    F('black-malt', 0.3, 'malta negra: marca no registrada'),
  ];
  v2.hops = [H('ekg', 40, 'hervor', 60), H('ekg', 20, 'hervor', 15)];
  v2.yeasts = [Y('us-05', 1, 'cantidad de sobres de esta versión no registrada; se muestra 1 solo como referencia')];
  v2.miscs = [M('Café Bourbon Rosado Natural (molienda gruesa)', 'fermentador', 175, 'g', 'Registrado 150–200 g (punto medio solo para calcular); contacto 12–24 h.')];
  v2.water = { ...v2.water, mashSalts: { cloruroCalcio: 4, yeso: 1.5, bicarbonato: 3, sal: 1, epsom: 0.5 }, spargeSalts: {} };
  v2.historical = record(
    'asociada',
    [v('OG', '≈ 1.090', 'estimacion'), v('FG', '≈ 1.030', 'estimacion'), v('ABV', '≈ 8 %', 'estimacion'), v('Sales documentadas', 'CaCl₂ 4 g · CaSO₄ 1,5 g · NaHCO₃ 3 g · NaCl 1 g · MgSO₄ 0,5 g', 'planificado')],
    {
      warnings: [advert, supuestoAgua],
      missing: ['Volumen de esta versión', 'Sobres de US-05 en esta versión', 'Macerado', 'Fermentación'],
      notes: ['Segunda formulación histórica (versión posterior). No se fusiona con la primera.'],
    },
  );
  v2 = fitEfficiency(v2, 1.09, 'OG estimada de la segunda versión (≈ 1.090)');
  const shared = [
    'RECETA_PREMIADA = TRUE · MEDALLAS_PLATA = 2',
    'La versión premiada original fue la cerveza SIN Brett. En algunas botellas o versiones posteriores se experimentó con Brettanomyces bruxellensis: no es parte de la base premiada.',
    'En otra competencia se inscribió como Tropical Stout porque sensorialmente se percibía más ligera que una Imperial Stout tradicional.',
  ];
  v1.historical!.notes.push(...shared);
  v2.historical!.notes.push(...shared);
  const { recipe, versionIds } = addRecipe(v1, [
    { recipe: v1, label: 'Histórica 1 · versión documentada', note: advert },
    { recipe: v2, label: 'Histórica 2 · versión posterior', note: advert },
  ]);
  award('imperial-plata-cusco', {
    beerName: 'Imperial Stout de La H',
    competition: 'Encuentro Latinoamericano / Copa de los Andes',
    location: 'Cusco, Perú',
    result: 'plata',
    recipeId: recipe.id,
    link: 'por-confirmar',
    candidates: versionIds,
    notes: 'Versión exacta (histórica 1 o 2) por confirmar. Base sin Brett.',
  });
  award('imperial-plata-tropical', {
    beerName: 'Imperial Stout de La H',
    enteredAs: 'Tropical Stout',
    result: 'plata',
    recipeId: recipe.id,
    link: 'por-confirmar',
    candidates: versionIds,
    notes: 'Competencia: dato_no_recuperado. Inscrita como Tropical Stout. Versión exacta por confirmar.',
  });
}

// ---------- 6. Weizenbock — Tres Tristes Tigres ----------
{
  let r = baseRecipe('hist-weizenbock-tres-tristes-tigres', 'Tres Tristes Tigres toman Cerveza en un Trigal', 'weizenbock', 25, AGUA);
  r.boilTimeMin = 90;
  r.fermentables = [
    F('wheat-wey', 4.8, 'malta de trigo: marca no registrada'),
    F('munich-1-wey', 2.2),
    F('vienna-wey', 0.8),
    F('munich-2-wey', 0.4),
    F('caramunich-2', 0.35),
    F('caraaroma', 0.25),
  ];
  r.hops = [{ ...H('hallertau-mittelfruh', 55, 'hervor', 60), name: 'Hallertau (variedad no especificada)', sourceNote: 'Cantidad y momento registrados. Variedad de Hallertau y % AA no registrados; alfa típico solo para calcular.' }];
  r.yeasts = [Y('w-68', 2, '2 sobres como mínimo en la formulación documentada')];
  r.mashSteps = [
    step('Descanso proteico', 52, 15),
    step('Beta-amilasa', 63, 25),
    step('Decocción (30–35 % espeso): 65 °C 10 min, 72 °C 10 min, hervir 20–25 min; retornar', 67.5, 30),
    step('Mash out', 76, 10),
  ];
  r.historical = record(
    'asociada',
    [
      v('OG', '≈ 1.080', 'estimacion'),
      v('FG', '≈ 1.018', 'estimacion'),
      v('ABV', '≈ 8 %', 'estimacion'),
      v('IBU', '≈ 20', 'estimacion'),
      v('Grano total', '≈ 8,8 kg', 'planificado'),
      v('Decocción', 'Retirar 30–35 % espeso; 65 °C 10 min → 72 °C 10 min → hervir 20–25 min → retornar hasta 67–68 °C y mantener ~30 min', 'planificado', 'La temperatura de retorno (67–68 °C) se carga con su punto medio solo para calcular'),
    ],
    {
      warnings: ['RECETA_HISTORICA_ASOCIADA: no asumir que es idéntica al lote ganador.', supuestoAgua],
      missing: ['Fermentación (temperatura y días)', 'Agua y sales', 'Carbonatación'],
      notes: ['RECETA_PREMIADA = TRUE (familia Weizenbock): Bronce y Primer puesto en Maestros del Trigo 2026. No atribuir ambos premios al mismo lote sin confirmación.'],
    },
  );
  r = fitEfficiency(r, 1.08, 'OG documentada (≈ 1.080)');
  const { recipe, versionIds } = addRecipe(r, [{ recipe: r, label: 'Histórica asociada · 25 L' }]);
  award('weizenbock-bronce', {
    beerName: 'Tres Tristes Tigres toman Cerveza en un Trigal',
    result: 'bronce',
    recipeId: recipe.id,
    link: 'por-confirmar',
    candidates: versionIds,
    notes: 'Bronce confirmado en una competencia anterior (competencia: dato_no_recuperado). Falta confirmar que la receta asociada corresponde al lote premiado.',
  });
  award('weizenbock-maestros-trigo', {
    beerName: 'Weizenbock colaborativa',
    competition: 'Maestros del Trigo',
    year: 2026,
    result: 'primer-puesto',
    prize: 'FermZilla 55 L',
    link: 'por-confirmar',
    candidates: [recipe.id],
    notes: 'Versión colaborativa: distinguir si es el mismo lote/versión de "Tres Tristes Tigres" o una versión posterior.',
  });
}

// ---------- 7. Belgian Dubbel ----------
{
  const r = baseRecipe('hist-dubbel', 'Belgian Dubbel', 'dubbel', 20, AGUA);
  r.historical = record('elaborada', [v('Resultado general', 'Considerado muy bueno; inscrito en competencia', 'ejecucion')], {
    incomplete: true,
    missing: ['Maltas', 'Azúcar', 'Lúpulos', 'Levadura', 'Perfil de agua', 'Volumen', 'Macerado', 'Fermentación'],
    notes: ['Sin premio confirmado en el historial recuperado.'],
  });
  const { recipe, versionIds } = addRecipe(r, [{ recipe: r, label: 'Histórico · receta no recuperada' }]);
  addBatch('H-05', 9005, recipe, versionIds[0], 1, {
    name: 'Belgian Dubbel',
    readings: [reading(336, 1.022, 'FG REAL 1.022: terminó más densa de lo inicialmente esperado')],
    tastingNotes:
      'Maltosa, compleja; caramelo oscuro, frutas maduras, carácter licoroso leve; cuerpo sedoso; carbonatación viva; dulzor residual; ésteres belgas; final cálido y redondeado. (Descripción del historial; sin escala numérica.)',
    historical: record(
      'elaborada',
      [v('OG', '≈ 1.076–1.077', 'medicion', 'Registrada como aproximada'), v('FG real', '1.022', 'medicion'), v('ABV', '≈ 7,1 % (rango 7,0–7,3 %)', 'calculo')],
      {
        missing: ['Fecha', 'Volumen'],
        notes: ['Relación clave para calibrar el motor sensorial: OG ≈ 1.076–1.077, FG real 1.022, ABV ≈ 7,1 %, con dulzor residual y cuerpo sedoso percibidos.'],
      },
    ),
  });
  award('dubbel-inscrita', {
    beerName: 'Belgian Dubbel',
    result: 'inscrita',
    recipeId: recipe.id,
    link: 'confirmado',
    notes: 'Inscrita en competencia; sin premio confirmado. Competencia: dato_no_recuperado.',
  });
}

// ---------- 8. Belgian Tripel (en planificación) ----------
{
  const r = baseRecipe('hist-tripel-reto', 'Belgian Tripel — reto Fermentis', 'tripel', 20, AGUA);
  r.intent = {
    mode: 'moderna',
    text: 'Tripel compleja, muy bebible y de alta tomabilidad; interpretación moderna pero claramente belga; seca; alcohol elevado pero integrado.',
    target: {},
  };
  r.historical = record(
    'planificada',
    [
      v('Volumen objetivo', '20 L finales en barril', 'planificado'),
      v('Restricción de levadura del reto', 'Fermentis: BE-256 / referencia del reto "BE-156" según el registro original; BE-134; T-58', 'planificado', 'Se conserva la referencia original "BE-156" sin sustituirla'),
    ],
    { incomplete: true, missing: ['Receta detallada definitiva'], notes: ['RECETA_PLANIFICADA = TRUE. No registrar como elaborada ni premiada.'] },
  );
  addRecipe(r, [{ recipe: r, label: 'Planificación inicial' }]);
}

// ---------- 9. Catharina Sour (Bronce del lote histórico) + formulación de 50 L ----------
{
  let r = baseRecipe('hist-catharina-50l', 'Catharina Sour — formulación 50 L', 'catharina-sour', 50, AGUA);
  r.fermentables = [F('pilsner-wey', 5.0, 'marca no registrada'), F('wheat-wey', 5.0, 'trigo: marca no registrada'), F('oats-flaked', 0.5, 'avena: tipo no registrado'), F('carafoam', 0.35, 'Carapils')];
  r.mashSteps = [step('Sacarificación', 65, 60), step('Mash out', 75, 10)];
  r.hops = [H('el-dorado', 7.5, 'hervor', 15, { estimate: '5–10 g', note: 'Momento exacto no registrado' })];
  r.yeasts = [Y('voss', 2, '≈ 22 g registrados')];
  r.miscs = [M('Cultivo de yogur (kettle sour)', 'hervor', 500, 'g', 'Registrado 400–600 g (punto medio solo para calcular). Agriar en la olla a 36–40 °C hasta pH 3,4–3,6, antes del hervor.')];
  r.fermentation = [ferm('Cold crash', 1, 0)];
  r.carbonation = { ...r.carbonation, volumes: 2.9 };
  r.historical = record(
    'planificada',
    [
      v('Agua de macerado', '≈ 43 L', 'planificado'),
      v('Reserva / lavado', '≈ 19 L', 'planificado'),
      v('Whirlpool opcional', 'El Dorado 10–15 g', 'planificado'),
      v('pH objetivo del agriado', '3,4–3,6', 'planificado'),
      v('FG objetivo', '1.006–1.008', 'planificado'),
      v('Cold crash', '0–2 °C', 'planificado'),
      v('Carbonatación', '2,8–3,0 vol', 'planificado'),
      v('Perfil mineral sugerido', 'Ca 50–70 · Cl 80–120 · SO₄ < 50 ppm · Mg bajo', 'planificado'),
    ],
    {
      warnings: ['Esta formulación NO se etiqueta como la Catharina Sour premiada: la receta del lote premiado no se recuperó.', supuestoAgua],
      notes: ['Historial de sours de La H: Catharina Sour con mora, Berliner Weisse con lulo y desarrollos posteriores con banano.'],
    },
  );
  r = fitEfficiency({ ...r }, computeRecipeStats(r).og, 'eficiencia de referencia del equipo (sin OG registrada)');
  r.historical!.values.pop();
  r.historical!.missing.push('OG (la formulación no la registra: los cálculos usan la eficiencia de referencia del equipo)');
  addRecipe(r, [{ recipe: r, label: 'Formulación técnica 50 L' }]);
  award('catharina-bronce', {
    beerName: 'Catharina Sour (histórica)',
    result: 'bronce',
    link: 'sin-receta',
    notes: 'Bronce confirmado. Receta exacta del lote premiado: dato_no_recuperado. No vincular a la formulación de 50 L por similitud de estilo.',
  });
}

// ---------- 10. Sour / Smoothie de banano con Philly Sour (experimental) ----------
{
  const r = baseRecipe('hist-smoothie-banano', 'Sour Smoothie de banano — Philly Sour', undefined, 40, AGUA);
  r.fermentables = [
    F('pilsner-wey', 9.0, 'aproximado; marca no registrada'),
    F('wheat-wey', 4.5, 'aproximado'),
    F('oats-flaked', 2.7, 'aproximado; tipo de avena no registrado'),
    F('carafoam', 0.9, 'Carapils, aproximado'),
    F('munich-1-wey', 0.9, 'aproximado'),
    F('dextrose', 0.7, 'aproximado; momento de adición no registrado'),
  ];
  r.yeasts = [{ ...Y('philly-sour', 0), sourceNote: 'Levadura registrada. Cantidad de sobres: se evaluó por costo, dato_no_recuperado (se muestra 0).' }];
  r.miscs = [M('Banano', 'fermentador', 9, 'kg', 'Aproximado. El azúcar de la fruta aún no se modela en la densidad (fase de adjuntos).'), M('Nibs de cacao', 'fermentador', 200, 'g', 'Aproximado')];
  r.intent = { mode: 'libre', text: 'Sour intensa con banano, perfil moderno tipo fruited / pastry / smoothie.', target: {} };
  r.historical = record(
    'experimental',
    [v('Volumen previsto', '≈ 40 L; rendimiento final esperado 30–35 L por la carga de fruta', 'planificado'), v('Grano total', '≈ 18 kg', 'planificado')],
    {
      missing: ['Sobres de Philly Sour', 'Lúpulos', 'Macerado', 'Agua y sales', 'Momento de la fruta y del cacao'],
      warnings: ['DESARROLLO_EXPERIMENTAL: no registrar como premiado.', supuestoAgua],
      notes: ['Se comparó conceptualmente Philly Sour frente a Kveik.'],
    },
  );
  addRecipe(r, [{ recipe: r, label: 'Desarrollo experimental' }]);
}

// ---------- 11. West Coast IPA ----------
{
  let r = baseRecipe('hist-west-coast-ipa', 'West Coast IPA', 'american-ipa', 40, AGUA);
  r.fermentables = [F('best-pale-ale', 12.0, 'Pale Ale: marca no registrada'), F('best-munich', 1.0, 'Munich: marca y tipo no registrados'), F('carafoam', 0.5, 'Carapils')];
  r.hops = [
    H('bravo', 30, 'hervor', 60),
    customHop('Solaris', 140, 'whirlpool', 0, { estimate: '120–160 g' }),
    H('simcoe', 15, 'whirlpool', 0, { form: 'cryo', note: 'Simcoe Cryo: el alfa típico del catálogo es del pellet (el Cryo tiene más); tiempo de whirlpool no registrado' }),
    H('simcoe', 75, 'dry-hop', 0, { form: 'cryo', note: 'Simcoe Cryo; días de contacto no registrados' }),
  ];
  r.yeasts = [Y('bry-97', 3)];
  r.fermentation = [ferm('Primaria', 18.5, 0), ferm('Final', 20.5, 0)];
  r.water = { ...r.water, targetProfileId: 'custom-hist-wcipa' };
  r.historical = record(
    'elaborada',
    [
      v('OG', '≈ 1.064', 'estimacion'),
      v('FG', '≈ 1.010', 'estimacion'),
      v('ABV', '≈ 7 %', 'estimacion'),
      v('Fermentación', '18–19 °C al inicio; luego 20–21 °C', 'ejecucion', 'Puntos medios solo para calcular'),
      v('Agua objetivo', 'Ca 110 · Mg 6 · Na 8 · Cl 65 · SO₄ 190 · HCO₃ 30 ppm', 'planificado'),
      v('pH de macerado objetivo', '≈ 5,35', 'planificado'),
    ],
    {
      missing: ['Macerado', 'Tiempo de hervor', 'Tiempo de whirlpool', 'Días de dry hop', '% AA de Bravo, Solaris y Simcoe Cryo', 'Sales usadas'],
      warnings: [supuestoAgua],
      notes: ['Receta desarrollada; sin premio confirmado en el historial.'],
    },
  );
  r = fitEfficiency(r, 1.064, 'OG registrada (≈ 1.064)');
  addRecipe(r);
}

// ---------- Salida ----------
const out = {
  app: 'la-h',
  version: 1,
  kind: 'historial',
  title: 'Historial inicial de La H Cerveza Artesanal',
  exportedAt: new Date(IMPORTED_AT).toISOString(),
  data: { recipes, recipeVersions: versions, batches, awards, waters },
};
writeFileSync('historial-la-h.json', JSON.stringify(out, null, 1), 'utf-8');
console.log(`historial-la-h.json: ${recipes.length} recetas, ${versions.length} versiones, ${batches.length} lotes, ${awards.length} resultados de competencia, ${waters.length} perfiles de agua`);
for (const r of recipes) {
  const s = computeRecipeStats(r);
  console.log(`  ${r.name.padEnd(52)} ${r.historical?.status.padEnd(12)} ef ${String(r.efficiencyPct).padStart(5)} % · OG calc ${s.og.toFixed(3)} · IBU ${s.ibu.toFixed(0)}`);
}
