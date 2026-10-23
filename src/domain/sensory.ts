// Motor sensorial: estima un perfil 0–10 a partir de la receta. Cada variable
// combina varias causas técnicas (nunca una regla única) y devuelve sus
// contribuciones para poder explicarla. Procedencia: "estimación".
// Los pesos son heurísticos y se podrán calibrar con tus catas (fase 4).

import type { Catalog } from './catalog';
import { byId } from './catalog';
import type { RecipeStats } from './calc/recipeStats';
import type { Recipe } from './types';

export type SensoryKey =
  | 'dulzor'
  | 'cuerpo'
  | 'maltosidad'
  | 'tostado'
  | 'amargor'
  | 'lupulo'
  | 'esteres'
  | 'fenoles'
  | 'acidez'
  | 'alcohol'
  | 'carbonatacion';

export const SENSORY_KEYS: SensoryKey[] = ['dulzor', 'cuerpo', 'maltosidad', 'tostado', 'amargor', 'lupulo', 'esteres', 'fenoles', 'acidez', 'alcohol', 'carbonatacion'];

export const SENSORY_INFO: Record<SensoryKey, { label: string; low: string; high: string; help: string }> = {
  dulzor: { label: 'Dulzor', low: 'seca', high: 'dulce', help: 'Dulzor residual percibido al final.' },
  cuerpo: { label: 'Cuerpo', low: 'ligera', high: 'densa', help: 'Peso y sensación en boca.' },
  maltosidad: { label: 'Maltosidad', low: 'neutra', high: 'muy maltosa', help: 'Sabor a pan, galleta, caramelo, melanoidinas.' },
  tostado: { label: 'Tostado', low: 'nada', high: 'muy tostada', help: 'Café, chocolate amargo, tostado.' },
  amargor: { label: 'Amargor percibido', low: 'suave', high: 'muy amarga', help: 'Amargor como se siente, no solo IBU.' },
  lupulo: { label: 'Intensidad de lúpulo', low: 'discreta', high: 'explosiva', help: 'Aroma y sabor a lúpulo.' },
  esteres: { label: 'Ésteres (frutal)', low: 'limpia', high: 'muy frutal', help: 'Fruta de la fermentación: banano, pera, ciruela.' },
  fenoles: { label: 'Fenoles / especias', low: 'ninguno', high: 'muy especiada', help: 'Clavo, pimienta, humo, especias.' },
  acidez: { label: 'Acidez', low: 'nada', high: 'muy ácida', help: 'Acidez láctica o de fruta.' },
  alcohol: { label: 'Alcohol percibido', low: 'imperceptible', high: 'cálido', help: 'Calidez del alcohol en boca.' },
  carbonatacion: { label: 'Carbonatación', low: 'poco gas', high: 'efervescente', help: 'Gas percibido.' },
};

export type SensoryProfile = Record<SensoryKey, number>;

export interface Driver {
  label: string;
  delta: number;
}

export interface SensoryPrediction {
  values: SensoryProfile;
  /** ± de la estimación. */
  uncertainty: Record<SensoryKey, number>;
  drivers: Record<SensoryKey, Driver[]>;
}

/** Carácter típico de fermentación por familia de cepa (0–10). */
export const YEAST_CHARACTER: Record<string, { esters: number; phenols: number; acid?: number }> = {
  'americana-limpia': { esters: 2, phenols: 0 },
  inglesa: { esters: 4.5, phenols: 0 },
  'inglesa-limpia': { esters: 3, phenols: 0 },
  escocesa: { esters: 2.5, phenols: 0 },
  kolsch: { esters: 3, phenols: 0 },
  'lager-alemana': { esters: 1, phenols: 0 },
  'lager-checa': { esters: 1.5, phenols: 0 },
  'lager-california': { esters: 2, phenols: 0 },
  weizen: { esters: 7, phenols: 6 },
  wit: { esters: 5, phenols: 5 },
  'belga-abadia': { esters: 6.5, phenols: 4 },
  'belga-golden': { esters: 6, phenols: 4 },
  saison: { esters: 5, phenols: 6.5 },
  neipa: { esters: 6, phenols: 0 },
  kveik: { esters: 5, phenols: 0 },
  acida: { esters: 3, phenols: 0, acid: 7 },
  bacteria: { esters: 1, phenols: 0, acid: 8 },
  brett: { esters: 6, phenols: 4 },
  diastatica: { esters: 4, phenols: 1 },
  refermentacion: { esters: 1, phenols: 0 },
  'sin-alcohol': { esters: 3, phenols: 0 },
};

/** Aporte de sabor a malta por tipo (0–10 cuando es el 100 % del grano). */
const MALT_FLAVOR: Record<string, number> = {
  'pilsner-wey': 3.5,
  'pilsner-castle': 3.5,
  'pilsner-best': 3.5,
  'pale-2row': 2.5,
  'pale-ale-wey': 3.5,
  'pale-ale-castle': 4,
  'maris-otter': 4.5,
  'golden-promise': 4,
  'vienna-wey': 5,
  'munich-1-wey': 6.5,
  'munich-2-wey': 7.5,
  'wheat-wey': 3,
  'wheat-dark-wey': 5,
  'rye-wey': 4,
  'rauch-wey': 5,
  'abbey-castle': 7,
  melanoidin: 9,
  'aromatic-castle': 9,
  'biscuit-castle': 7,
  'brown-malt': 6,
  'honey-malt': 7,
};

const clamp10 = (x: number) => Math.min(10, Math.max(0, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface SensoryFeatures {
  fgPts: number;
  ogPts: number;
  abv: number;
  ibu: number;
  buGu: number;
  carb: number;
  crystalPct: number;
  roastIdx: number;
  darkCaramelIdx: number;
  unfermentPct: number;
  dextrinPct: number;
  maltBase: number;
  lateGpl: number;
  dryGpl: number;
  yeastFamily?: string;
  tempRel: number;
  tempOverMax: number;
  so4?: number;
  cl?: number;
  smokePct: number;
  acidMaltPct: number;
  spices: number;
  fruit: number;
}

export function sensoryFeatures(recipe: Recipe, stats: RecipeStats, catalog?: Catalog): SensoryFeatures {
  const pct = (f: { uid: string }) => stats.pctByUid[f.uid] ?? 0;
  const F = recipe.fermentables;
  const crystalPct = F.filter((f) => f.type === 'caramelo' && f.colorEBC > 10).reduce((s, f) => s + pct(f), 0);
  // Índice de tostado: % × color, más suave en maltas desamargadas (Carafa Special).
  const roastIdx = F.filter((f) => f.type === 'tostada').reduce((s, f) => s + pct(f) * (f.colorEBC / 1000) * (f.ingredientId?.startsWith('carafa') ? 0.5 : 1), 0);
  const darkCaramelIdx = F.filter((f) => (f.type === 'caramelo' || f.type === 'especial' || f.type === 'azucar') && f.colorEBC >= 150).reduce((s, f) => s + pct(f) * (f.colorEBC / 1000), 0);
  const unfermentPct = F.filter((f) => f.type === 'no-fermentable').reduce((s, f) => s + pct(f), 0);
  const dextrinPct = F.filter((f) => f.type === 'adjunto' && /oats|barley|wheat|avena|cebada|trigo/.test(`${f.ingredientId} ${f.name}`.toLowerCase())).reduce((s, f) => s + pct(f), 0)
    + F.filter((f) => f.ingredientId === 'carafoam').reduce((s, f) => s + pct(f), 0);
  let maltBase = 0;
  for (const f of F) {
    const flavor = (f.ingredientId ? MALT_FLAVOR[f.ingredientId] : undefined) ??(f.type === 'caramelo' ? 4 + Math.min(3, f.colorEBC / 80) : f.type === 'especial' ? 7 : f.type === 'base' ? 3 : f.type === 'tostada' ? 3 : 0.5);
    maltBase += (pct(f) / 100) * flavor;
  }
  const kettleHops = recipe.hops.filter((h) => h.use === 'whirlpool' || (h.use === 'hervor' && h.time <= 20));
  const lateGpl = kettleHops.reduce((s, h) => s + h.amountG * (h.use === 'hervor' ? Math.max(0.3, 1 - h.time / 30) : 1), 0) / recipe.batchSizeL;
  const dryGpl = recipe.hops.filter((h) => h.use === 'dry-hop').reduce((s, h) => s + h.amountG, 0) / recipe.batchSizeL;
  const y = recipe.yeasts[0];
  const family = y?.family ?? (y?.ingredientId && catalog ? byId(catalog.yeasts, y.ingredientId)?.family : undefined);
  const primary = recipe.fermentation[0]?.tempC ?? 19;
  const mid = y ? (y.tempRange[0] + y.tempRange[1]) / 2 : 19;
  const half = y ? Math.max(1.5, (y.tempRange[1] - y.tempRange[0]) / 2) : 2;
  const smokePct = F.filter((f) => f.ingredientId === 'rauch-wey' || /ahumad|smoke|rauch/i.test(f.name)).reduce((s, f) => s + pct(f), 0);
  const acidMaltPct = F.filter((f) => f.type === 'acida').reduce((s, f) => s + pct(f), 0);
  const spices = recipe.miscs.filter((m) => /cilantro|coriand|pimienta|pepper|especia|jengibre|ginger|canela|clavo/i.test(m.name)).length;
  const fruit = recipe.miscs.filter((m) => m.use === 'fermentador' && /fruta|pulpa|maracuy|lulo|mango|guayaba|fresa|frambuesa|uchuva|feijoa|pure|puré/i.test(m.name)).length;
  const w = stats.kettleWater;
  return {
    fgPts: (stats.fg - 1) * 1000,
    ogPts: (stats.og - 1) * 1000,
    abv: stats.abv,
    ibu: stats.ibu,
    buGu: stats.buGu,
    carb: recipe.carbonation.volumes,
    crystalPct,
    roastIdx,
    darkCaramelIdx,
    unfermentPct,
    dextrinPct,
    maltBase,
    lateGpl,
    dryGpl,
    yeastFamily: family,
    tempRel: (primary - mid) / half,
    tempOverMax: y ? Math.max(0, primary - y.tempRange[1]) : 0,
    so4: w?.so4,
    cl: w?.cl,
    smokePct,
    acidMaltPct,
    spices,
    fruit,
  };
}

/** Suma contribuciones y recorta a 0–10. */
function combine(parts: [string, number][]): { value: number; drivers: Driver[] } {
  const drivers = parts.filter(([, d]) => Math.abs(d) >= 0.05).map(([label, delta]) => ({ label, delta: r1(delta) }));
  return { value: r1(clamp10(parts.reduce((s, [, d]) => s + d, 0))), drivers: drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)) };
}

export function predictSensory(recipe: Recipe, stats: RecipeStats, catalog?: Catalog): SensoryPrediction {
  const f = sensoryFeatures(recipe, stats, catalog);
  const yc = (f.yeastFamily && YEAST_CHARACTER[f.yeastFamily]) || { esters: 3, phenols: 0 };
  const hasWater = f.so4 !== undefined && f.cl !== undefined;
  const acidBase = (yc.acid ?? 0) + f.acidMaltPct * 0.4 + f.fruit * 1.5;
  const out = {} as Record<SensoryKey, { value: number; drivers: Driver[] }>;

  out.dulzor = combine([
    [`Extracto residual (FG ${(1 + f.fgPts / 1000).toFixed(3)})`, 9 * (1 - Math.exp(-Math.max(0, f.fgPts - 3) / 15))],
    ['Maltas caramelo', f.crystalPct * 0.08],
    ['Lactosa (dulzor propio)', f.unfermentPct * 0.08],
    ['Balance con el amargor (BU:GU)', -(f.buGu - 0.5) * 3],
    ['Tostado (seca la boca)', -Math.min(1.5, f.roastIdx * 0.1)],
    ['Acidez', -acidBase * 0.35],
    ['Carbonatación', -(f.carb - 2.4) * 0.6],
    ...(hasWater ? [['Cloruro frente a sulfato', ((f.cl! - f.so4!) / 100) * 0.5] as [string, number]] : []),
  ]);

  out.cuerpo = combine([
    ['Base', 1],
    [`Extracto residual (FG ${(1 + f.fgPts / 1000).toFixed(3)})`, 8 * (1 - Math.exp(-Math.max(0, f.fgPts - 2) / 16))],
    ['Avena, cebada o trigo en hojuelas / Carafoam', f.dextrinPct * 0.045],
    ['Lactosa / maltodextrina', f.unfermentPct * 0.05],
    ['Alcohol y glicerol', (f.abv - 5) * 0.2],
    ['Carbonatación', -(f.carb - 2.4) * 0.6],
    ...(hasWater ? [['Cloruro', (f.cl! / 100) * 0.5] as [string, number]] : []),
  ]);

  out.maltosidad = combine([
    ['Base', 0.5],
    ['Sabor de las maltas × densidad', f.maltBase * (f.ogPts / 48) * 0.9],
    ['Maltas caramelo', f.crystalPct * 0.05],
    ['Balance con el amargor (BU:GU)', -(f.buGu - 0.6) * 1.5],
  ]);

  out.tostado = combine([
    ['Maltas tostadas (según concentración)', 4.6 * Math.log(1 + f.roastIdx * (f.ogPts / 48) * 0.4)],
    ['Caramelos y azúcares muy oscuros', f.darkCaramelIdx * 0.3],
    ['El dulzor lo redondea', -Math.max(0, f.fgPts - 12) * 0.2 * (f.roastIdx > 0 ? 1 : 0)],
  ]);

  out.amargor = combine([
    [`IBU calculados (${Math.round(f.ibu)})`, f.ibu > 0 ? f.ibu ** 0.85 / 4.2 : 0],
    ['Dulzor residual lo enmascara', -Math.max(0, f.fgPts - 10) * 0.15],
    ['Tostado suma amargor', f.roastIdx * 0.08],
    ...(hasWater ? [['Sulfato lo resalta y seca', Math.max(-1.2, Math.min(1.2, (f.so4! - 100) / 150))] as [string, number]] : []),
  ]);

  out.lupulo = combine([
    ['Lúpulo tardío y whirlpool (g/L)', f.lateGpl * 0.9],
    ['Dry hop (g/L)', f.dryGpl * 0.8],
  ]);

  const kveik = f.yeastFamily === 'kveik';
  out.esteres = combine([
    ['Levadura', yc.esters],
    ['Temperatura de fermentación', f.tempRel * (kveik ? 0.5 : 1.5)],
    ['Densidad alta', Math.max(0, f.ogPts - 60) * 0.05],
    ...(f.tempOverMax > 0 ? [['Sobre el máximo de la levadura', f.tempOverMax * 0.8] as [string, number]] : []),
  ]);

  out.fenoles = combine([
    ['Levadura', yc.phenols],
    ...(f.yeastFamily === 'weizen' ? [['Más calor: más banano, menos clavo', -f.tempRel * 0.5] as [string, number]] : []),
    ['Malta ahumada', f.smokePct * 0.08],
    ['Especias', f.spices * 1.5],
  ]);

  out.acidez = combine([
    ['Acidez base de la cerveza', 1],
    ['Levadura ácida', yc.acid ?? 0],
    ['Malta acidulada', f.acidMaltPct * 0.4],
    ['Fruta en fermentador', f.fruit * 1.5],
    ['Maltas tostadas', f.roastIdx * 0.08],
  ]);

  out.alcohol = combine([
    [`ABV ${f.abv.toFixed(1)} %`, (f.abv - 3.5) * 0.9],
    ['Cuerpo dulce lo integra', f.fgPts > 15 ? -0.5 : 0],
    ['Fermentación caliente (alcoholes superiores)', f.tempOverMax * 0.7],
  ]);

  out.carbonatacion = combine([[`${f.carb.toFixed(1)} volúmenes de CO₂`, (f.carb - 1.5) * 3.5]]);

  const values = {} as SensoryProfile;
  const drivers = {} as Record<SensoryKey, Driver[]>;
  const uncertainty = {} as Record<SensoryKey, number>;
  for (const k of SENSORY_KEYS) {
    values[k] = out[k].value;
    drivers[k] = out[k].drivers;
    // Lo que depende de la levadura y del agua es más incierto que lo que sale de la densidad.
    uncertainty[k] = k === 'esteres' || k === 'fenoles' ? 2 : k === 'carbonatacion' ? 0.5 : k === 'tostado' ? 1 : 1.5;
  }
  return { values, uncertainty, drivers };
}

// ---------- Compatibilidad ----------

export interface SensoryFit {
  /** 0–100 (100 = idéntico al objetivo en las variables definidas). */
  score: number;
  rows: { key: SensoryKey; target: number; predicted: number; diff: number }[];
}

/** Compatibilidad entre el objetivo (solo variables definidas) y la predicción. */
export function sensoryFit(target: Partial<SensoryProfile>, predicted: SensoryProfile): SensoryFit | undefined {
  const rows = (Object.keys(target) as SensoryKey[])
    .filter((k) => target[k] !== undefined)
    .map((k) => ({ key: k, target: target[k]!, predicted: predicted[k], diff: r1(predicted[k] - target[k]!) }));
  if (!rows.length) return undefined;
  // Medio punto de diferencia no penaliza (incertidumbre del modelo); lo demás crece más que lineal.
  const penalty = rows.reduce((s, r) => s + Math.max(0, Math.abs(r.diff) - 0.5) ** 1.5, 0) / rows.length;
  return { score: Math.round(Math.max(0, 100 - penalty * 20)), rows };
}
