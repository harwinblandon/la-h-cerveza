// Intención → objetivos técnicos → rutas de diseño.
// El intérprete de texto es determinístico (palabras clave en español), no IA:
// muestra siempre qué frase entendió y cómo la tradujo, y el cervecero ajusta.

import type { Catalog } from './catalog';
import { byId, guidelineOf } from './catalog';
import type { RecipeStats } from './calc/recipeStats';
import { computeRecipeStats } from './calc/recipeStats';
import { generateFromStyle, type Tuning } from './recipeFactory';
import { SENSORY_KEYS, predictSensory, sensoryFit, type SensoryFit, type SensoryKey, type SensoryPrediction, type SensoryProfile } from './sensory';
import { yeastsForStyle } from './suggest/substitutes';
import type { DesignMode, Equipment, Recipe, SaltId, Style, StyleGuideline, WaterIons } from './types';

export type { DesignMode };

export const MODE_INFO: Record<DesignMode, { label: string; help: string }> = {
  competencia: { label: 'Competencia', help: 'Fidelidad estricta a la guía: salirse del rango se trata como problema.' },
  tradicional: { label: 'Estilo tradicional', help: 'Interpretación clásica del estilo; las desviaciones se avisan.' },
  moderna: { label: 'Interpretación moderna', help: 'Conserva la identidad del estilo pero acepta lúpulos, agua y procesos actuales. Las desviaciones son información.' },
  libre: { label: 'Diseño libre', help: 'Sin estilo obligatorio: manda el perfil sensorial.' },
};

export interface IntentConstraints {
  abv?: number;
  ibu?: number;
  srm?: [number, number];
}

export interface ParsedIntent {
  styleId?: string;
  mode: DesignMode;
  target: Partial<SensoryProfile>;
  /** Máximos pedidos ("sin ser empalagosa", "bebible"). */
  caps: Partial<SensoryProfile>;
  aromas: string[];
  constraints: IntentConstraints;
  wantsComplexity: boolean;
  matched: { phrase: string; meaning: string }[];
  /** Cosas mencionadas que todavía no se pueden modelar. */
  unsupported: string[];
}

const normalize = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9%.,\s-]/g, ' ')
    .replace(/\s+/g, ' ')} `;

interface Rule {
  re: RegExp;
  meaning: string;
  set?: Partial<SensoryProfile>;
  cap?: Partial<SensoryProfile>;
  aroma?: string;
  complexity?: boolean;
}

// Orden importa: lo más específico primero (lo que coincide se retira del texto).
const RULES: Rule[] = [
  { re: /(muy|extra|super|bien) sec[ao]/, meaning: 'dulzor 1/10', set: { dulzor: 1 } },
  { re: /semi ?sec[ao]/, meaning: 'dulzor 3,5/10', set: { dulzor: 3.5 } },
  { re: /final (ligeramente|levemente|algo|un poco) dulce/, meaning: 'dulzor 4,5/10', set: { dulzor: 4.5 } },
  { re: /(muy|bien) dulce/, meaning: 'dulzor 8/10', set: { dulzor: 8 } },
  { re: /sin (ser )?empalagos\w*|no empalagos\w*|sin empalagar/, meaning: 'dulzor máximo 6/10', cap: { dulzor: 6 } },
  { re: /\bsec[ao]\b/, meaning: 'dulzor 2/10', set: { dulzor: 2 } },
  { re: /\bdulce\b/, meaning: 'dulzor 6,5/10', set: { dulzor: 6.5 } },
  { re: /cuerpo (ligero|bajo|liviano)|\bligera\b|\bliviana\b/, meaning: 'cuerpo 2,5/10', set: { cuerpo: 2.5 } },
  { re: /cuerpo (medio|moderado)/, meaning: 'cuerpo 5/10', set: { cuerpo: 5 } },
  { re: /cuerpo (alto|lleno|completo|denso)|\bdensa\b|robusta|untuosa|sedosa/, meaning: 'cuerpo 7,5/10', set: { cuerpo: 7.5 } },
  { re: /cremos\w*/, meaning: 'cuerpo 6,5/10', set: { cuerpo: 6.5 } },
  { re: /(poco|baja en|bajo|sin mucho|suave en) amarg\w*|poco amargor|amargor (bajo|suave)|nada amarga/, meaning: 'amargor 2,5/10', set: { amargor: 2.5 } },
  { re: /amargor (medio|moderado)|moderadamente amarga/, meaning: 'amargor 5/10', set: { amargor: 5 } },
  { re: /muy amarga|amargor (alto|intenso|marcado|firme)/, meaning: 'amargor 8,5/10', set: { amargor: 8.5 } },
  { re: /\bamarga\b/, meaning: 'amargor 7/10', set: { amargor: 7 } },
  { re: /(aroma|lupulo)( \w+)? (muy )?(intens\w*|explosiv\w*)|muy aromatica|explosiv\w*|lupulada/, meaning: 'lúpulo 8,5/10', set: { lupulo: 8.5 } },
  { re: /tropical\w*/, meaning: 'aroma tropical', set: { lupulo: 7.5 }, aroma: 'tropical' },
  { re: /maracuya/, meaning: 'aroma a maracuyá', set: { lupulo: 7 }, aroma: 'maracuya' },
  { re: /\bmango\b/, meaning: 'aroma a mango', set: { lupulo: 7 }, aroma: 'mango' },
  { re: /\bpina\b/, meaning: 'aroma a piña', set: { lupulo: 7 }, aroma: 'pina' },
  { re: /citric\w*|\blima\b|limon/, meaning: 'aroma cítrico', set: { lupulo: 7 }, aroma: 'citrico' },
  { re: /toronja|pomelo/, meaning: 'aroma a toronja', set: { lupulo: 7 }, aroma: 'pomelo' },
  { re: /frutos rojos/, meaning: 'aroma a frutos rojos', aroma: 'frutos-rojos' },
  { re: /\bpino\b|resin\w*/, meaning: 'aroma a pino/resina', set: { lupulo: 7 }, aroma: 'pino' },
  { re: /\bfloral\b/, meaning: 'aroma floral', aroma: 'floral' },
  { re: /herbal|noble/, meaning: 'lúpulo herbal / noble', aroma: 'herbal' },
  { re: /aromatica/, meaning: 'lúpulo 6,5/10', set: { lupulo: 6.5 } },
  { re: /muy tostad\w*/, meaning: 'tostado 8,5/10', set: { tostado: 8.5 } },
  { re: /\bcafe\b|tostad\w*|chocolate|\bcacao\b/, meaning: 'tostado 6/10', set: { tostado: 6 } },
  { re: /\blimpia\b|neutra/, meaning: 'fermentación limpia (ésteres 1,5, fenoles 0,5)', set: { esteres: 1.5, fenoles: 0.5 } },
  { re: /(muy )?frutal|esteres|banano/, meaning: 'ésteres 6,5/10', set: { esteres: 6.5 } },
  { re: /especiad\w*|\bclavo\b|pimienta|fenol\w*/, meaning: 'fenoles 5,5/10', set: { fenoles: 5.5 } },
  { re: /(ligeramente|levemente|algo) acida|acidez (suave|ligera)/, meaning: 'acidez 4/10', set: { acidez: 4 } },
  { re: /(muy )?acida|\bsour\b|agria/, meaning: 'acidez 7,5/10', set: { acidez: 7.5 } },
  { re: /maltos[ao]/, meaning: 'maltosidad 7/10', set: { maltosidad: 7 } },
  { re: /galleta|\bpan\b|caramelo|toffee|tofe|melaza|panela/, meaning: 'maltosidad 6/10', set: { maltosidad: 6 } },
  { re: /compleja|complejidad|profundidad/, meaning: 'complejidad (favorece la ruta expresiva)', complexity: true },
  { re: /(altamente |muy )?(bebible|tomable|sesionable)|facil de tomar|refrescante/, meaning: 'tomable: alcohol ≤ 4, dulzor ≤ 4, cuerpo ≤ 5', cap: { alcohol: 4, dulzor: 4, cuerpo: 5 } },
  { re: /(muy )?fuerte|potente|calida|licorosa/, meaning: 'alcohol 6/10', set: { alcohol: 6 } },
  { re: /efervescente|muy carbonatada|burbujeante|chispeante/, meaning: 'carbonatación 7/10', set: { carbonatacion: 7 } },
  { re: /poco gas|baja carbonatacion|poco carbonatada/, meaning: 'carbonatación 2/10', set: { carbonatacion: 2 } },
];

const COLORS: [RegExp, [number, number], string][] = [
  [/(palida|muy clara)/, [2, 4], 'color pálido (2–4 SRM)'],
  [/(dorada|rubia|clara)/, [3.5, 6.5], 'color dorado (3,5–6,5 SRM)'],
  [/(ambar|cobriz\w*)/, [9, 15], 'color ámbar (9–15 SRM)'],
  [/(roja|rojiza)/, [11, 17], 'color rojizo (11–17 SRM)'],
  [/(marron|castan\w*)/, [17, 26], 'color marrón (17–26 SRM)'],
  [/(negra|oscura|azabache)/, [30, 40], 'color negro (30–40 SRM)'],
];

// Alias de estilo comunes que no coinciden exactamente con el nombre del catálogo.
const STYLE_ALIASES: [RegExp, string][] = [
  [/\b(hazy|neipa|new england)\b/, 'hazy-ipa'],
  [/\b(double|doble|imperial) ipa\b|\bdipa\b/, 'double-ipa'],
  [/\bipa inglesa\b|english ipa/, 'english-ipa'],
  [/\bwest coast\b|\bipa\b/, 'american-ipa'],
  [/\bapa\b|american pale|pale ale americana/, 'american-pale-ale'],
  // Imperial antes que "stout dulce": "Imperial Stout dulce" es una imperial.
  [/\b(imperial|russian) stout\b|stout imperial/, 'imperial-stout'],
  [/\b(milk|sweet) stout\b|stout (dulce|de leche)/, 'sweet-stout'],
  [/\boatmeal\b|stout de avena/, 'oatmeal-stout'],
  [/\bquad\w*\b|belgian dark strong|fuerte oscura belga/, 'belgian-dark-strong'],
  [/\bweizen\b|hefeweizen|trigo aleman/, 'weissbier'],
  [/\bpils\b|pilsner alemana/, 'german-pils'],
  [/\bpilsner\b|lager checa/, 'czech-premium-pale-lager'],
  [/\bhelles\b/, 'munich-helles'],
  [/\bkolsch\b/, 'kolsch'],
  [/\bblonde\b|\brubia americana\b/, 'blonde-ale'],
];

/** Nombres de estilos modernos que aún no están en el catálogo (fase 3). */
const MODERN_UNSUPPORTED: [RegExp, string][] = [
  [/smoothie/, 'Smoothie Sour'],
  [/pastry/, 'Pastry'],
  [/milkshake/, 'Milkshake IPA'],
  [/fruited sour|sour (de|con) fruta/, 'Fruited Sour'],
  [/\b(cafe|cacao|nibs|vainilla|coco|fruta\w*|mango|maracuya|lulo|guayaba|fresa|frambuesa|uchuva|feijoa)\b/, 'adjuntos (café, cacao, vainilla, fruta…): se modelan en la fase 3; por ahora el perfil se aproxima con maltas, lúpulos y levadura'],
];

export function parseIntent(text: string, catalog: Catalog): ParsedIntent {
  let t = normalize(text);
  const out: ParsedIntent = { mode: 'libre', target: {}, caps: {}, aromas: [], constraints: {}, wantsComplexity: false, matched: [], unsupported: [] };
  const take = (m: RegExpMatchArray) => {
    t = t.replace(m[0], ' '.repeat(m[0].length));
    return m[0].trim();
  };

  for (const [re, label] of MODERN_UNSUPPORTED) if (re.test(t)) out.unsupported.push(label);

  // Estilo: primero alias, luego nombres del catálogo (el más largo gana).
  let style: Style | undefined;
  for (const [re, id] of STYLE_ALIASES) {
    const m = t.match(re);
    if (!m) continue;
    style = byId(catalog.styles, id);
    out.matched.push({ phrase: take(m), meaning: `estilo ${style?.name}` });
    break;
  }
  if (!style) {
    let best: { s: Style; len: number; name: string } | undefined;
    for (const s of catalog.styles) {
      for (const name of [s.name, s.nameEn]) {
        const n = normalize(name).trim();
        if (n.length > 3 && t.includes(` ${n} `) && (!best || n.length > best.len)) best = { s, len: n.length, name: n };
      }
    }
    if (best) {
      style = best.s;
      t = t.replace(best.name, ' '.repeat(best.name.length));
      out.matched.push({ phrase: best.name, meaning: `estilo ${style.name}` });
    }
  }
  out.styleId = style?.id;

  // Modo
  const mode = t.match(/competencia|concurso|jueces|medalla/)
    ? 'competencia'
    : t.match(/modern[ao]|contemporane\w*|nueva escuela/)
      ? 'moderna'
      : t.match(/tradicional|clasica|historica|original/)
        ? 'tradicional'
        : undefined;
  out.mode = mode ?? (style ? 'tradicional' : 'libre');
  if (mode) out.matched.push({ phrase: mode, meaning: `modo ${MODE_INFO[mode].label}` });

  // Números
  const abv = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (abv) {
    out.constraints.abv = parseFloat(abv[1].replace(',', '.'));
    out.matched.push({ phrase: take(abv), meaning: `ABV ${out.constraints.abv} %` });
  }
  const ibu = t.match(/(\d+)\s*ibu/);
  if (ibu) {
    out.constraints.ibu = parseInt(ibu[1], 10);
    out.matched.push({ phrase: take(ibu), meaning: `${out.constraints.ibu} IBU` });
  }
  for (const [re, range, meaning] of COLORS) {
    const m = t.match(re);
    if (m) {
      out.constraints.srm = range;
      out.matched.push({ phrase: take(m), meaning });
      break;
    }
  }

  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    out.matched.push({ phrase: take(m), meaning: rule.meaning });
    if (rule.set) for (const [k, v] of Object.entries(rule.set) as [SensoryKey, number][]) out.target[k] = Math.max(out.target[k] ?? 0, v);
    if (rule.cap) for (const [k, v] of Object.entries(rule.cap) as [SensoryKey, number][]) out.caps[k] = Math.min(out.caps[k] ?? 10, v);
    if (rule.aroma && !out.aromas.includes(rule.aroma)) out.aromas.push(rule.aroma);
    if (rule.complexity) out.wantsComplexity = true;
  }
  // Un objetivo no puede superar su propio máximo.
  for (const [k, cap] of Object.entries(out.caps) as [SensoryKey, number][]) if ((out.target[k] ?? 0) > cap) out.target[k] = cap;
  return out;
}

// ---------- Compatibilidad con el estilo ----------

export interface StyleCompat {
  score: number;
  rows: { param: string; value: string; range: string; inside: boolean; penalty: number }[];
}

/**
 * 100 menos penalizaciones: cada parámetro fuera de rango resta hasta 20 puntos
 * (proporcional a cuánto se sale, medido en medias amplitudes del rango).
 */
export function styleCompatibility(stats: RecipeStats, style: Style): StyleCompat {
  const R = style.ranges;
  const sg = (x: number) => x.toFixed(3);
  const items: [string, number, [number, number], (x: number) => string][] = [
    ['OG', stats.og, R.og, sg],
    ['FG', stats.fg, R.fg, sg],
    ['ABV', stats.abv, R.abv, (x) => `${x.toFixed(1)} %`],
    ['IBU', stats.ibu, R.ibu, (x) => x.toFixed(0)],
    ['SRM', stats.srm, R.srm, (x) => x.toFixed(1)],
  ];
  const rows = items.map(([param, v, [lo, hi], f]) => {
    const half = Math.max(1e-6, (hi - lo) / 2);
    const out = v < lo ? lo - v : v > hi ? v - hi : 0;
    const penalty = Math.round(Math.min(20, (out / half) * 20));
    return { param, value: f(v), range: `${f(lo)}–${f(hi)}`, inside: out === 0, penalty };
  });
  return { score: Math.max(0, 100 - rows.reduce((s, r) => s + r.penalty, 0)), rows };
}

// ---------- Rutas ----------

export type RouteId = 'A' | 'B' | 'C';

export interface DesignInput {
  style?: Style;
  target: Partial<SensoryProfile>;
  caps?: Partial<SensoryProfile>;
  aromas?: string[];
  constraints?: IntentConstraints;
  wantsComplexity?: boolean;
  mode: DesignMode;
  equipment: Equipment;
  batchSizeL?: number;
  catalog: Catalog;
  sourceWater?: { id: string; ions: WaterIons };
  store?: string;
  availableSalts?: SaltId[];
  alphaOverrides?: Record<string, number>;
}

export interface Route {
  id: RouteId;
  name: string;
  summary: string;
  style: Style;
  tuning: Tuning;
  recipe: Recipe;
  stats: RecipeStats;
  prediction: SensoryPrediction;
  fit?: SensoryFit;
  compat: StyleCompat;
  /** Decisiones técnicas de la ruta y por qué. */
  levers: string[];
  /** Parámetros fuera del estilo (desviaciones intencionales de la ruta). */
  deviations: string[];
}

const ROUTE_META: Record<RouteId, { name: string; summary: string }> = {
  A: { name: 'Ruta A · Fiel y precisa', summary: 'La lectura más clásica del objetivo, dentro de los rangos del estilo.' },
  B: { name: 'Ruta B · Expresiva', summary: 'Más carácter de malta y fermentación; busca complejidad sin perder el objetivo.' },
  C: { name: 'Ruta C · Moderna', summary: 'Lúpulos y agua contemporáneos; acepta desviaciones del estilo si acercan el perfil.' },
};

const NEW_WORLD = ['EE. UU.', 'Australia', 'Nueva Zelanda'];

function waterFamily(id: string): string[] {
  if (/oscuro|dublin|london|munich/.test(id)) return ['obj-oscuro-seco', 'obj-oscuro-maltoso'];
  if (/ambar|vienna|edinburgh|dortmund|antwerp/.test(id)) return ['obj-ambar-equilibrado', 'obj-ambar-maltoso'];
  return ['obj-claro-suave', 'obj-claro-seco', 'obj-claro-equilibrado', 'obj-ipa', 'obj-neipa'];
}

/** Elige lúpulos de aroma según los aromas pedidos, dentro de los orígenes permitidos. */
function aromaSwap(style: Style, catalog: Catalog, aromas: string[], origins: string[]): Record<string, string> {
  if (!aromas.length) return {};
  const swap: Record<string, string> = {};
  const used = new Set<string>();
  for (const hh of style.guide.hops) {
    const late = hh.use === 'whirlpool' || hh.use === 'dry-hop' || (hh.use === 'hervor' && hh.time <= 20);
    if (!late || swap[hh.ingredientId]) continue;
    const ranked = catalog.hops
      .filter((h) => origins.includes(h.origin) && h.purpose !== 'amargor')
      .map((h) => ({ h, s: aromas.filter((a) => h.aroma.includes(a)).length + (used.has(h.id) ? -0.5 : 0) }))
      .sort((a, b) => b.s - a.s);
    if (ranked[0] && ranked[0].s > 0) {
      swap[hh.ingredientId] = ranked[0].h.id;
      used.add(ranked[0].h.id);
    }
  }
  return swap;
}

/**
 * Tope efectivo: en un estilo fuerte, "bebible" no puede significar 4 % de alcohol;
 * significa alcohol bien escondido para su categoría (un punto sobre el mínimo del estilo).
 */
function effectiveCap(k: SensoryKey, cap: number, style: Style, mode: DesignMode): number {
  if (k !== 'alcohol' || mode === 'libre') return cap;
  const atMinAbv = (style.ranges.abv[0] - 3.5) * 0.9;
  return Math.max(cap, atMinAbv + 1);
}

/** Penalización total de una variante (menor = mejor). */
function objective(route: RouteId, input: DesignInput, style: Style, stats: RecipeStats, pred: SensoryPrediction): number {
  let e = 0;
  for (const k of SENSORY_KEYS) {
    const t = input.target[k];
    if (t !== undefined) e += Math.max(0, Math.abs(pred.values[k] - t) - 0.5) ** 2 * 1.5;
    const cap = input.caps?.[k];
    if (cap !== undefined) {
      const c = effectiveCap(k, cap, style, input.mode);
      if (pred.values[k] > c) e += (pred.values[k] - c) ** 2 * 2;
    }
  }
  const c = input.constraints ?? {};
  if (c.abv !== undefined) e += ((stats.abv - c.abv) / 0.3) ** 2;
  if (c.ibu !== undefined) e += ((stats.ibu - c.ibu) / 4) ** 2;
  if (c.srm) {
    const out = stats.srm < c.srm[0] ? c.srm[0] - stats.srm : stats.srm > c.srm[1] ? stats.srm - c.srm[1] : 0;
    e += (out / 1.5) ** 2;
  }
  // Peso del estilo según ruta y modo.
  const compat = styleCompatibility(stats, style);
  const stylePenalty = 100 - compat.score;
  const styleWeight = input.mode === 'libre' ? 0.01 : route === 'C' ? 0.03 : input.mode === 'competencia' ? 0.5 : 0.15;
  e += stylePenalty * styleWeight;
  // B busca carácter (malta y fermentación) en lo que el objetivo no fija.
  if (route === 'B') {
    if (input.target.esteres === undefined) e -= pred.values.esteres * 0.25;
    if (input.target.maltosidad === undefined) e -= pred.values.maltosidad * 0.2;
    if (input.wantsComplexity) e -= (pred.values.esteres + pred.values.maltosidad + pred.values.fenoles) * 0.1;
  }
  // C prefiere más lúpulo expresivo si el objetivo no lo fija.
  if (route === 'C' && input.target.lupulo === undefined) e -= pred.values.lupulo * 0.15;
  return e;
}

interface Knob {
  key: keyof Tuning;
  options: (number | string)[];
}

function evaluate(route: RouteId, input: DesignInput, style: Style, tuning: Tuning) {
  const recipe = generateFromStyle({
    style,
    equipment: input.equipment,
    batchSizeL: input.batchSizeL,
    catalog: input.catalog,
    sourceWater: input.sourceWater,
    store: input.store,
    availableSalts: input.availableSalts,
    alphaOverrides: input.alphaOverrides,
    tuning,
  });
  const stats = computeRecipeStats(recipe, input.sourceWater?.ions);
  const prediction = predictSensory(recipe, stats, input.catalog);
  return { recipe, stats, prediction, score: objective(route, input, style, stats, prediction) };
}

/** Busca la mejor variante de una ruta moviendo una perilla a la vez (descenso por coordenadas). */
export function designRoute(route: RouteId, input: DesignInput, style: Style): Route {
  const { catalog } = input;
  const styleYeasts = yeastsForStyle(style, catalog, 8);
  let yeastOptions = styleYeasts.slice(0, route === 'A' ? 3 : 8).map((y) => y.id);
  if (route === 'C') {
    const types = new Set(styleYeasts.map((y) => y.type));
    const modern = catalog.yeasts.filter((y) => ['neipa', 'kveik', 'lager-california'].includes(y.family) && types.has(y.type)).map((y) => y.id);
    yeastOptions = [...new Set([...yeastOptions, ...modern])];
  }
  const origins = route === 'C' ? [...new Set([...NEW_WORLD, ...style.guide.hopOrigins])] : style.guide.hopOrigins;
  let swap = aromaSwap(style, catalog, input.aromas ?? [], origins);
  if (route === 'C' && !Object.keys(swap).length) {
    const own = style.guide.hops.map((h) => byId(catalog.hops, h.ingredientId)).flatMap((h) => h?.aroma ?? []);
    swap = aromaSwap(style, catalog, [...new Set(own)], NEW_WORLD);
  }
  const family = waterFamily(style.guide.waterProfileId);
  const hoppy = ['american-pale-ale', 'american-ipa', 'hazy-ipa', 'double-ipa', 'english-ipa'].includes(style.id);
  const waters = route === 'C' || hoppy ? family : [style.guide.waterProfileId, ...family.filter((w) => w !== style.guide.waterProfileId && w !== 'obj-ipa' && w !== 'obj-neipa')];
  const pos = [0.1, 0.3, 0.5, 0.7, 0.9];
  const wide = route === 'A' ? pos : [-0.2, ...pos, 1.2];

  const knobs: Knob[] = [
    { key: input.constraints?.abv !== undefined ? 'og' : 'ogPos', options: input.constraints?.abv !== undefined ? [] : wide },
    { key: 'fgPos', options: wide },
    { key: 'ibuPos', options: input.constraints?.ibu !== undefined ? [] : wide },
    { key: 'specialtyFactor', options: route === 'A' ? [0.6, 0.8, 1, 1.25] : route === 'B' ? [1, 1.3, 1.6, 2] : [0.5, 0.75, 1, 1.4] },
    { key: 'aromaFactor', options: route === 'A' ? [0.5, 1, 1.5] : route === 'C' ? [1, 1.5, 2.2, 3] : [0.5, 1, 1.5, 2.2] },
    { key: 'yeastId', options: yeastOptions },
    { key: 'waterProfileId', options: waters },
  ];

  const tuning: Tuning = {
    hopSwap: swap,
    yeastId: yeastOptions[0],
    ibu: input.constraints?.ibu,
    carbonation: input.target.carbonatacion !== undefined ? Math.round((1.5 + input.target.carbonatacion / 3.5) * 10) / 10 : undefined,
  };
  // OG para el ABV pedido: se ajusta por bisección sobre la OG.
  const fitAbv = (tu: Tuning) => {
    const abv = input.constraints?.abv;
    if (abv === undefined) return tu;
    let lo = 1.02;
    let hi = 1.13;
    for (let i = 0; i < 12; i++) {
      const og = (lo + hi) / 2;
      const s = evaluate(route, input, style, { ...tu, og }).stats;
      if (s.abv < abv) lo = og;
      else hi = og;
    }
    return { ...tu, og: Math.round(((lo + hi) / 2) * 1000) / 1000 };
  };

  let current = fitAbv(tuning);
  let best = evaluate(route, input, style, current);
  for (let pass = 0; pass < 2; pass++) {
    for (const knob of knobs) {
      for (const opt of knob.options) {
        const trial = { ...current, [knob.key]: opt } as Tuning;
        const res = evaluate(route, input, style, knob.key === 'fgPos' || knob.key === 'yeastId' ? fitAbv(trial) : trial);
        if (res.score < best.score - 1e-6) {
          best = res;
          current = trial;
        }
      }
    }
    current = fitAbv(current);
    best = evaluate(route, input, style, current);
  }

  const compat = styleCompatibility(best.stats, style);
  const fit = sensoryFit(input.target, best.prediction.values);
  return {
    id: route,
    ...ROUTE_META[route],
    style,
    tuning: current,
    recipe: { ...best.recipe, name: `${style.name} · ${ROUTE_META[route].name.split(' · ')[1]}` },
    stats: best.stats,
    prediction: best.prediction,
    fit,
    compat,
    levers: describeLevers(best.recipe, best.stats, current, style, catalog),
    deviations: compat.rows.filter((r) => !r.inside).map((r) => `${r.param} ${r.value} (estilo ${r.range})`),
  };
}

function describeLevers(r: Recipe, s: RecipeStats, t: Tuning, style: Style, catalog: Catalog): string[] {
  const out: string[] = [];
  const pct = (f: { uid: string }) => s.pctByUid[f.uid] ?? 0;
  const char = r.fermentables.filter((f) => f.type === 'caramelo' || f.type === 'especial').reduce((a, f) => a + pct(f), 0);
  const sugar = r.fermentables.filter((f) => f.type === 'azucar').reduce((a, f) => a + pct(f), 0);
  out.push(`OG ${s.og.toFixed(3)} → ${s.abv.toFixed(1)} % ABV`);
  out.push(`Macerado a ${s.mashTempC} °C y ${r.yeasts[0]?.name ?? 'levadura'} (${Math.round(s.attenuation)} % aten.) → FG ${s.fg.toFixed(3)}`);
  if (char > 0.5) out.push(`${char.toFixed(0)} % de maltas de carácter (caramelo/especiales)${t.specialtyFactor && t.specialtyFactor !== 1 ? ` (${t.specialtyFactor > 1 ? 'más' : 'menos'} que la guía)` : ''}`);
  if (sugar > 0.5) out.push(`${sugar.toFixed(0)} % de azúcar para secar el final`);
  out.push(`${Math.round(s.ibu)} IBU (BU:GU ${s.buGu.toFixed(2)})`);
  const aromaG = r.hops.filter((h) => h.use === 'whirlpool' || h.use === 'dry-hop').reduce((a, h) => a + h.amountG, 0);
  if (aromaG > 0) out.push(`${(aromaG / r.batchSizeL).toFixed(1)} g/L de lúpulo de aroma${Object.keys(t.hopSwap ?? {}).length ? `: ${[...new Set(Object.values(t.hopSwap!))].map((id) => byId(catalog.hops, id)?.name).join(', ')}` : ''}`);
  const w = byId(catalog.waters, t.waterProfileId ?? style.guide.waterProfileId);
  if (w) out.push(`Agua: ${w.name.replace('Objetivo · ', '')}`);
  out.push(`${r.carbonation.volumes.toFixed(1)} vol de CO₂`);
  return out;
}

/** Estilos cuyo perfil típico más se parece al objetivo (para diseño libre). */
export function closestStyles(input: Omit<DesignInput, 'style' | 'mode'>, n = 3, guide: StyleGuideline = 'bjcp'): Style[] {
  // Solo estilos de una guía: BJCP por omisión, o la del estilo elegido.
  const scored = input.catalog.styles.filter((s) => guidelineOf(s) === guide).map((style) => {
    const r = generateFromStyle({ style, equipment: input.equipment, catalog: input.catalog });
    const s = computeRecipeStats(r);
    const p = predictSensory(r, s, input.catalog);
    let d = 0;
    for (const k of SENSORY_KEYS) if (input.target[k] !== undefined) d += (p.values[k] - input.target[k]!) ** 2;
    const c = input.constraints ?? {};
    if (c.abv !== undefined) d += (c.abv < style.ranges.abv[0] ? style.ranges.abv[0] - c.abv : c.abv > style.ranges.abv[1] ? c.abv - style.ranges.abv[1] : 0) ** 2 * 3;
    if (c.srm) {
      const mid = (style.ranges.srm[0] + style.ranges.srm[1]) / 2;
      d += (mid < c.srm[0] ? c.srm[0] - mid : mid > c.srm[1] ? mid - c.srm[1] : 0) ** 2 * 0.5;
    }
    if (c.ibu !== undefined) d += ((c.ibu < style.ranges.ibu[0] ? style.ranges.ibu[0] - c.ibu : c.ibu > style.ranges.ibu[1] ? c.ibu - style.ranges.ibu[1] : 0) / 5) ** 2;
    return { style, d };
  });
  return scored.sort((a, b) => a.d - b.d).slice(0, n).map((x) => x.style);
}

/** Las tres rutas para una intención. En diseño libre, cada ruta parte de un estilo base distinto. */
export function designRoutes(input: DesignInput): Route[] {
  if (input.style && input.mode !== 'libre') {
    return (['A', 'B', 'C'] as RouteId[]).map((id) => designRoute(id, input, input.style!));
  }
  const bases = input.style ? [input.style, ...closestStyles(input, 3, guidelineOf(input.style)).filter((s) => s.id !== input.style!.id)].slice(0, 3) : closestStyles(input, 3);
  return bases.map((style, i) => {
    const r = designRoute((['A', 'B', 'C'] as RouteId[])[i], { ...input, mode: 'libre' }, style);
    return { ...r, name: `Ruta ${r.id} · Base ${style.name}`, summary: `Parte de la receta guía de ${style.name} y la ajusta a tu perfil.` };
  });
}

/**
 * Si ninguna ruta llega bien al objetivo dentro del estilo elegido, propone
 * estilos cuyo perfil típico encaja mejor (no cambia nada por sí solo).
 */
export function alternativeStyles(input: DesignInput, routes: Route[], n = 2): Style[] {
  const best = Math.max(...routes.map((r) => r.fit?.score ?? 100));
  if (best >= 92 || !input.style) return [];
  return closestStyles(input, n + 1, guidelineOf(input.style)).filter((s) => s.id !== input.style!.id).slice(0, n);
}
