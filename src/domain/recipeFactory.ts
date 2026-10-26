import type { Catalog } from './catalog';
import { pitchAdvice } from './yeastAdvice';
import { STORE_EQUIVALENTS } from '../data/distrines';
import { brandEquivalent, byId, soldAt } from './catalog';
import { gramsForIbu, hopIbu } from './calc/bitterness';
import { recipeSrm } from './calc/color';
import { computeRecipeStats } from './calc/recipeStats';
import { L_PER_GAL, LB_PER_KG, ebcToLovibond, uid } from './calc/units';
import { acidForTargetPh, bicarbonateForTargetPh, recipeAcid, withAcid } from './calc/water';
import { optimizeSalts, splitSalts } from './waterOptimizer';
import type {
  AcidChoice,
  Available,
  Equipment,
  Fermentable,
  FermentationStep,
  Hop,
  MashStep,
  Recipe,
  RecipeFermentable,
  SaltId,
  RecipeHop,
  RecipeYeast,
  Style,
  WaterAdjustments,
  WaterIons,
  Yeast,
} from './types';

export const defaultWater = (sourceProfileId = 'destilada'): WaterAdjustments => ({
  sourceProfileId,
  dilution: 0,
  mashSalts: {},
  spargeSalts: {},
  lacticMl: 0,
  phosphoricMl: 0,
  lacticPct: 88,
  phosphoricPct: 10,
});

export function newRecipe(equipment: Equipment, sourceWaterId?: string): Recipe {
  const now = Date.now();
  return {
    id: uid(),
    name: 'Nueva receta',
    equipment: { ...equipment },
    equipmentId: equipment.id,
    batchSizeL: equipment.batchSizeL,
    boilTimeMin: equipment.boilTimeMin,
    efficiencyPct: equipment.efficiencyPct,
    fermentables: [],
    hops: [],
    yeasts: [],
    miscs: [],
    mashSteps: [{ uid: uid(), name: 'Sacarificación', tempC: 66, timeMin: 60 }],
    fermentation: [{ uid: uid(), name: 'Primaria', tempC: 19, days: 10 }],
    water: defaultWater(sourceWaterId),
    carbonation: { volumes: 2.4, method: 'priming', primingSugar: 'sacarosa' },
    versionCount: 0,
    origin: { kind: 'blanco' },
    createdAt: now,
    updatedAt: now,
  };
}

export function fermentableFromCatalog(f: Fermentable, amountKg: number): RecipeFermentable {
  const kettle = f.type === 'azucar' || f.type === 'no-fermentable' || f.type === 'extracto';
  return {
    uid: uid(),
    ingredientId: f.id,
    name: f.name,
    type: f.type,
    colorEBC: f.colorEBC,
    ppg: f.ppg,
    diPH: f.diPH,
    amountKg,
    use: kettle ? 'hervor' : 'macerado',
    source: f.source,
    sourceNote: f.sourceNote,
  };
}

export function hopFromCatalog(h: Hop, amountG: number, use: RecipeHop['use'], time: number, inventoryAlpha?: number): RecipeHop {
  return {
    uid: uid(),
    ingredientId: h.id,
    name: h.name,
    alpha: inventoryAlpha ?? h.alpha,
    source: inventoryAlpha !== undefined ? 'inventario' : h.source,
    sourceNote: inventoryAlpha !== undefined ? '% AA de la bolsa registrada en tu inventario' : h.sourceNote,
    form: 'pellet',
    amountG,
    use,
    time,
    tempC: use === 'whirlpool' ? 80 : undefined,
  };
}

export function yeastFromCatalog(y: Yeast, amount = 1): RecipeYeast {
  return {
    uid: uid(),
    ingredientId: y.id,
    name: y.name,
    lab: y.lab,
    code: y.code,
    type: y.type,
    form: y.form,
    attenuation: y.attenuation,
    tempRange: y.tempRange,
    family: y.family,
    amount,
    source: y.source,
    sourceNote: y.sourceNote,
  };
}

const isLagerish = (y?: Pick<Yeast, 'type'>) => y?.type === 'lager';

export function fermentationPlan(style: Style | undefined, yeast?: Pick<Yeast, 'type' | 'tempRange'>): FermentationStep[] {
  const wanted = style?.guide.fermentTempC ?? (yeast ? Math.round((yeast.tempRange[0] + yeast.tempRange[1]) / 2) : 19);
  const t = yeast ? Math.min(yeast.tempRange[1], Math.max(yeast.tempRange[0], wanted)) : wanted;
  if (isLagerish(yeast)) {
    return [
      { uid: uid(), name: 'Primaria', tempC: t, days: 10 },
      { uid: uid(), name: 'Descanso de diacetilo', tempC: 18, days: 3 },
      { uid: uid(), name: 'Lagering (maduración en frío)', tempC: 2, days: 21 },
    ];
  }
  if (yeast?.type === 'saison' || yeast?.type === 'kveik') {
    return [
      { uid: uid(), name: 'Primaria', tempC: t, days: 4 },
      { uid: uid(), name: 'Subida libre para terminar', tempC: t + 3, days: 7 },
      { uid: uid(), name: 'Cold crash', tempC: 2, days: 2 },
    ];
  }
  return [
    { uid: uid(), name: 'Primaria', tempC: t, days: 7 },
    { uid: uid(), name: 'Final de fermentación (subir 2 °C)', tempC: t + 2, days: 3 },
    { uid: uid(), name: 'Cold crash', tempC: 2, days: 2 },
  ];
}

export function mashPlan(style: Style | undefined, eq: Equipment): MashStep[] {
  const steps: MashStep[] = [];
  if (style && (style.id === 'weissbier' || style.id === 'dunkles-weissbier' || style.id === 'weizenbock')) {
    steps.push({ uid: uid(), name: 'Descanso ferúlico (clavo)', tempC: 45, timeMin: 15 });
  }
  steps.push({ uid: uid(), name: 'Sacarificación', tempC: style?.guide.mashTempC ?? 66, timeMin: 60 });
  if (eq.type !== 'biab' && eq.type !== 'extracto') {
    steps.push({ uid: uid(), name: 'Mash out', tempC: 76, timeMin: 10 });
  }
  return steps;
}

/**
 * Escoge la levadura de las familias del estilo cuya atenuación se acerca más a
 * la que pide el estilo. Prefiere la primera familia y las secas (más fáciles de conseguir).
 */
export function pickYeast(families: string[], catalog: Catalog, neededAttenuation?: number, store?: string): Yeast | undefined {
  let best: { y: Yeast; score: number } | undefined;
  families.forEach((fam, i) => {
    // Las cepas diastáticas (STA1+) solo por defecto en saison: secan demasiado otros estilos.
    for (const y of catalog.yeasts.filter((x) => x.family === fam && (!x.sta1 || fam === 'saison'))) {
      const score =
        i * 6 + (y.form === 'seca' ? 0 : 3) + (neededAttenuation ? Math.abs(y.attenuation - neededAttenuation) * 0.5 : 0) + (store && !soldAt(y, store) ? 4 : 0);
      if (!best || score < best.score) best = { y, score };
    }
  });
  return best?.y;
}

/**
 * Temperatura de macerado para que la FG caiga dentro del rango del estilo.
 * Se aleja lo mínimo de la temperatura habitual del estilo (como lo haría un
 * cervecero); solo si ninguna sirve, toma la que deja la FG más cerca del centro.
 */
export function fitMashTemp(recipe: Recipe, fgRange: [number, number], preferredC: number): Recipe {
  const main = recipe.mashSteps.filter((s) => s.tempC >= 60 && s.tempC <= 73).sort((a, b) => b.timeMin - a.timeMin)[0];
  if (!main) return recipe;
  const withTemp = (t: number) => ({ ...recipe, mashSteps: recipe.mashSteps.map((s) => (s.uid === main.uid ? { ...s, tempC: t } : s)) });
  const margin = (fgRange[1] - fgRange[0]) * 0.15;
  const candidates: number[] = [];
  for (let t = 63; t <= 69; t += 0.5) candidates.push(t);
  candidates.sort((a, b) => Math.abs(a - preferredC) - Math.abs(b - preferredC));
  let closest = { t: preferredC, d: Infinity };
  const mid = (fgRange[0] + fgRange[1]) / 2;
  for (const t of candidates) {
    const fg = computeRecipeStats(withTemp(t)).fg;
    if (fg >= fgRange[0] + margin && fg <= fgRange[1] - margin) return withTemp(t);
    if (Math.abs(fg - mid) < closest.d) closest = { t, d: Math.abs(fg - mid) };
  }
  return withTemp(closest.t);
}

const pointsAt = (r: Recipe) => {
  const s = computeRecipeStats(r);
  return (s.og - 1) * 1000;
};

/** Escala todos los fermentables de macerado/hervor para llegar a una OG. */
export function scaleToOg(recipe: Recipe, targetOg: number, onlyBase = false): Recipe {
  const current = pointsAt(recipe);
  const target = (targetOg - 1) * 1000;
  if (current <= 0) return recipe;
  if (!onlyBase) {
    const k = target / current;
    return { ...recipe, fermentables: recipe.fermentables.map((f) => ({ ...f, amountKg: f.amountKg * k })) };
  }
  const isBase = (f: RecipeFermentable) => f.type === 'base' || f.type === 'extracto';
  const baseOnly = { ...recipe, fermentables: recipe.fermentables.filter(isBase) };
  const basePts = pointsAt(baseOnly);
  if (basePts <= 0) return scaleToOg(recipe, targetOg, false);
  const k = Math.max(0, (basePts + (target - current)) / basePts);
  return { ...recipe, fermentables: recipe.fermentables.map((f) => (isBase(f) ? { ...f, amountKg: f.amountKg * k } : f)) };
}

/** Ajusta las maltas de color para acercar el SRM al objetivo y reequilibra con la base. */
export function adjustColor(recipe: Recipe, targetSrm: number): Recipe {
  const vol = computeRecipeStats(recipe).water.postBoilColdL;
  const gal = vol / L_PER_GAL;
  const mcuOf = (fs: RecipeFermentable[]) =>
    fs.reduce((s, f) => s + (f.amountKg * LB_PER_KG * ebcToLovibond(f.colorEBC)) / gal, 0);
  // Maltas de especialidad, bases oscuras (Munich) y azúcares con color (candi oscuro, panela).
  const isColor = (f: RecipeFermentable) =>
    f.colorEBC >= 10 &&
    (f.type === 'caramelo' || f.type === 'especial' || f.type === 'tostada' || (f.type === 'base' && f.colorEBC >= 12) || (f.type === 'azucar' && f.colorEBC >= 40));
  const colorMcu = mcuOf(recipe.fermentables.filter(isColor));
  const otherMcu = mcuOf(recipe.fermentables.filter((f) => !isColor(f)));
  if (colorMcu <= 0) return recipe;
  const targetMcu = (targetSrm / 1.4922) ** (1 / 0.6859);
  let k = Math.min(3, Math.max(0.2, (targetMcu - otherMcu) / colorMcu));
  // No pasar del máximo razonable de cada tipo; si no alcanza, el asistente sugiere una malta más oscura.
  const CAP: Partial<Record<RecipeFermentable['type'], number>> = { caramelo: 0.12, especial: 0.15, tostada: 0.08, azucar: 0.2, base: 0.3 };
  const totalKg = recipe.fermentables.reduce((s, f) => s + f.amountKg, 0);
  for (const f of recipe.fermentables.filter(isColor)) {
    const cap = CAP[f.type];
    if (cap && k > 1 && f.amountKg > 0) k = Math.max(1, Math.min(k, (cap * totalKg) / f.amountKg));
  }
  const og = computeRecipeStats(recipe).og;
  const adjusted: Recipe = {
    ...recipe,
    fermentables: recipe.fermentables.map((f) => (isColor(f) ? { ...f, amountKg: f.amountKg * k } : f)),
  };
  return scaleToOg(adjusted, og, true);
}

/** Repite el ajuste de color: reequilibrar la base también mueve el color. */
export function fitColor(recipe: Recipe, targetSrm: number, passes = 4): Recipe {
  let r = recipe;
  for (let i = 0; i < passes; i++) {
    const srm = recipeSrm(r.fermentables, computeRecipeStats(r).water.postBoilColdL);
    if (Math.abs(srm - targetSrm) < 0.3) break;
    r = adjustColor(r, targetSrm);
  }
  return r;
}

const roundKg = (kg: number) => (kg >= 1 ? Math.round(kg * 100) / 100 : Math.round(kg * 1000) / 1000);
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;

/** Valor objetivo para volver a entrar al rango sin irse al centro (cambio mínimo). */
export function nearEdge(value: number, [lo, hi]: [number, number], inset = 0.2): number {
  if (value < lo) return lo + (hi - lo) * inset;
  if (value > hi) return hi - (hi - lo) * inset;
  return value;
}

/** Define los gramos de lúpulo para alcanzar un IBU, respetando el reparto entre adiciones. */
export function fitHopsToIbu(recipe: Recipe, targetIbu: number, shares?: Record<string, number>): Recipe {
  const stats = computeRecipeStats(recipe);
  const fixed = recipe.hops.filter((h) => !shares || !(h.uid in shares));
  const fixedIbu = fixed.reduce(
    (s, h) => s + hopIbu(h, stats.boilGravity, stats.water.postBoilHotL, recipe.boilTimeMin),
    0,
  );
  const remaining = Math.max(0, targetIbu - fixedIbu);
  return {
    ...recipe,
    hops: recipe.hops.map((h) => {
      const share = shares?.[h.uid];
      if (share === undefined) return h;
      const g = gramsForIbu(remaining * share, h.alpha, h.use, h.time, stats.boilGravity, stats.water.postBoilHotL, recipe.boilTimeMin, h.tempC);
      return { ...h, amountG: Math.max(1, Math.round(g)) };
    }),
  };
}

/**
 * Perillas para variar la receta guía sin salir del motor probado.
 * Las posiciones (0–1) se miden dentro del rango del estilo.
 */
export interface Tuning {
  ogPos?: number;
  /** OG exacta (prioridad sobre ogPos), p. ej. para un ABV pedido. */
  og?: number;
  fgPos?: number;
  ibuPos?: number;
  ibu?: number;
  srmPos?: number;
  /** Multiplicador de maltas de carácter (caramelo y especiales). */
  specialtyFactor?: number;
  /** Multiplicador del lúpulo de whirlpool y dry hop. */
  aromaFactor?: number;
  yeastId?: string;
  /** Reemplazos de lúpulo por id (p. ej. noble → moderno). */
  hopSwap?: Record<string, string>;
  /** Reemplazos de malta por id (lo que tiene el cervecero): la OG se conserva. */
  grainSwap?: Record<string, string>;
  waterProfileId?: string;
  carbonation?: number;
}

export interface GenerateOptions {
  style: Style;
  equipment: Equipment;
  batchSizeL?: number;
  sourceWater?: { id: string; ions: WaterIons };
  catalog: Catalog;
  name?: string;
  tuning?: Tuning;
  /** Tienda preferida: se usan sus insumos equivalentes. */
  store?: string;
  /** % AA real de las bolsas del inventario (id de lúpulo → alfa). */
  alphaOverrides?: Record<string, number>;
  /** Sales que tiene el cervecero. */
  availableSalts?: SaltId[];
  /** Marcas de malta que consigue, en orden de preferencia. */
  maltsters?: string[];
  /** Ácido que usa para el pH. */
  acid?: AcidChoice;
}

/**
 * Equivalente en la tienda preferida según la tabla de equivalencias (criterio cervecero).
 * Si no hay equivalente definido, se deja el original: mejor un insumo de otra tienda
 * que un reemplazo que cambie el carácter de la cerveza.
 */
function storeEquivalent<T extends { id: string }>(item: T, list: T[], store?: string): T {
  if (!store || soldAt(item as Available, store)) return item;
  const eqId = STORE_EQUIVALENTS[store]?.[item.id];
  return (eqId && byId(list, eqId)) || item;
}

export const storeFermentable = (f: Fermentable, catalog: Catalog, store?: string) => storeEquivalent(f, catalog.fermentables, store);
export const storeHop = (h: Hop, catalog: Catalog, store?: string) => storeEquivalent(h, catalog.hops, store);

const atPos = ([lo, hi]: [number, number], pos: number) => lo + (hi - lo) * Math.min(1, Math.max(0, pos));

/** Genera una receta base completa para un estilo y un equipo. */
export function generateFromStyle(o: GenerateOptions): Recipe {
  const { style, equipment, catalog } = o;
  const t = o.tuning ?? {};
  let r = newRecipe(equipment, o.sourceWater?.id);
  r.name = o.name ?? style.name;
  r.styleId = style.id;
  r.origin = { kind: 'estilo', detail: `${style.code} ${style.name} · receta guía` };
  if (o.batchSizeL) r.batchSizeL = o.batchSizeL;
  if (style.ranges.og[1] >= 1.075 || style.id === 'czech-premium-pale-lager' || style.id === 'german-pils' || style.id === 'munich-helles') {
    // Cervezas con mucha Pilsner o muy densas: hervor largo para eliminar DMS y concentrar.
    r.boilTimeMin = 90;
  }

  // 1. Fermentables con 1 kg total, luego se escala a la OG objetivo.
  const charFactor = t.specialtyFactor ?? 1;
  r.fermentables = style.guide.grains.flatMap((gh) => {
    const chosen = t.grainSwap?.[gh.ingredientId];
    const raw = byId(catalog.fermentables, chosen ?? gh.ingredientId);
    const inStore = raw && (chosen ? raw : storeFermentable(raw, catalog, o.store));
    const f = inStore && (!chosen && o.maltsters?.length ? brandEquivalent(raw, catalog, o.maltsters) : inStore);
    const k = f && (f.type === 'caramelo' || f.type === 'especial') ? charFactor : 1;
    return f ? [fermentableFromCatalog(f, (gh.pct / 100) * k)] : [];
  });
  r = scaleToOg(r, t.og ?? (t.ogPos !== undefined ? atPos(style.ranges.og, t.ogPos) : mid(style.ranges.og)));

  // 2. Color: a la posición pedida, o al borde del rango si se sale.
  const srm = recipeSrm(r.fermentables, computeRecipeStats(r).water.postBoilColdL);
  if (t.srmPos !== undefined) r = fitColor(r, atPos(style.ranges.srm, t.srmPos));
  else if (srm < style.ranges.srm[0] || srm > style.ranges.srm[1]) r = fitColor(r, nearEdge(srm, style.ranges.srm));
  r.fermentables = r.fermentables.map((f) => ({ ...f, amountKg: roundKg(f.amountKg) }));

  // 3. Levadura y macerado (afectan la FG).
  const ogMid = mid(style.ranges.og);
  const needed = ((ogMid - mid(style.ranges.fg)) / (ogMid - 1)) * 100;
  const yeast = (t.yeastId && byId(catalog.yeasts, t.yeastId)) || pickYeast(style.guide.yeastFamilies, catalog, needed, o.store);
  r.mashSteps = mashPlan(style, equipment);
  r.fermentation = fermentationPlan(style, yeast);

  // 4. Lúpulos: primero los de aroma por g/L, luego el amargor reparte el IBU restante.
  const shares: Record<string, number> = {};
  r.hops = style.guide.hops.flatMap((hh) => {
    const swapped = t.hopSwap?.[hh.ingredientId];
    const rawHop = byId(catalog.hops, swapped ?? hh.ingredientId);
    const hop = rawHop && (swapped ? rawHop : storeHop(rawHop, catalog, o.store));
    if (!hop) return [];
    const grams = hh.gPerL ? Math.max(1, Math.round(hh.gPerL * (t.aromaFactor ?? 1) * r.batchSizeL)) : 1;
    const rh = hopFromCatalog(hop, grams, hh.use, hh.time, o.alphaOverrides?.[hop.id]);
    if (hh.ibuShare !== undefined) shares[rh.uid] = hh.ibuShare;
    return [rh];
  });
  r = fitHopsToIbu(r, t.ibu ?? (t.ibuPos !== undefined ? atPos(style.ranges.ibu, t.ibuPos) : mid(style.ranges.ibu)), shares);

  // 5. Levadura con la cantidad recomendada y macerado para llegar a la FG del estilo.
  if (yeast) {
    const og = computeRecipeStats(r).og;
    const pr = pitchAdvice(og, r.batchSizeL, { ...yeast, ingredientId: yeast.id, type: isLagerish(yeast) ? 'lager' : yeast.type }, 0);
    r.yeasts = [yeastFromCatalog(yeast, pr.packs)];
    if (t.fgPos !== undefined) {
      const fgT = atPos(style.ranges.fg, t.fgPos);
      r = fitMashTemp(r, [fgT - 0.002, fgT + 0.002], style.guide.mashTempC);
    } else r = fitMashTemp(r, style.ranges.fg, style.guide.mashTempC);
  }

  // 6. Otros ingredientes del estilo.
  r.miscs = (style.guide.miscs ?? []).map((mm) => ({
    uid: uid(),
    name: mm.name,
    use: mm.use,
    amount: Math.round(mm.gPerL * r.batchSizeL),
    unit: 'g' as const,
    time: mm.time,
    notes: mm.notes,
  }));

  // 7. Agua: sales hacia el perfil objetivo y ácido para pH 5,4.
  const target = byId(catalog.waters, t.waterProfileId ?? style.guide.waterProfileId);
  r.water.targetProfileId = target?.id;
  if (o.sourceWater && target) {
    r = applyWaterTarget(r, o.sourceWater.ions, target, 5.4, o.availableSalts, o.acid);
  }

  r.carbonation = { ...r.carbonation, volumes: t.carbonation ?? style.guide.carbonation };
  r.notes = style.guide.notes;
  return r;
}

/** Calcula sales y ácido para acercarse a un perfil objetivo. */
export function applyWaterTarget(recipe: Recipe, source: WaterIons, target: WaterIons, targetPh = 5.4, allowed?: SaltId[], prefAcid?: AcidChoice): Recipe {
  const acid = recipeAcid(recipe.water, prefAcid);
  const stats = computeRecipeStats(recipe, source);
  const total = stats.water.mashWaterL + stats.water.spargeWaterL;
  const base = {
    ca: source.ca * (1 - recipe.water.dilution),
    mg: source.mg * (1 - recipe.water.dilution),
    na: source.na * (1 - recipe.water.dilution),
    so4: source.so4 * (1 - recipe.water.dilution),
    cl: source.cl * (1 - recipe.water.dilution),
    hco3: source.hco3 * (1 - recipe.water.dilution),
  };
  const salts = optimizeSalts(base, target, total, allowed);
  const split = splitSalts(salts, stats.water.mashWaterL, stats.water.spargeWaterL);
  let r: Recipe = { ...recipe, water: { ...withAcid(recipe.water, acid, 0), mashSalts: split.mash, spargeSalts: split.sparge } };
  const s2 = computeRecipeStats(r, source);
  if (!s2.mashWater || s2.mashPh === undefined) return r;
  const phInput = {
    fermentables: r.fermentables,
    water: s2.mashWater,
    mashWaterL: s2.water.mashWaterL,
    lacticMl: 0,
    lacticPct: r.water.lacticPct,
    phosphoricMl: 0,
    phosphoricPct: r.water.phosphoricPct,
  };
  if (s2.mashPh > targetPh + 0.05) {
    r = { ...r, water: withAcid(r.water, acid, acidForTargetPh(phInput, targetPh, acid)) };
  } else if (s2.mashPh < targetPh - 0.1) {
    // Cervezas oscuras con agua blanda: subir el pH con bicarbonato en el macerado.
    const g = !allowed || allowed.includes('bicarbonato') ? bicarbonateForTargetPh(phInput, targetPh - 0.05) : 0;
    if (g >= 0.1) {
      r = { ...r, water: { ...r.water, mashSalts: { ...r.water.mashSalts, bicarbonato: Math.round(g * 10) / 10 } } };
    }
  }
  return r;
}

/**
 * Escala una receta a otro volumen y/o equipo conservando OG, IBU y color.
 */
export function scaleRecipe(recipe: Recipe, batchSizeL: number, equipment?: Equipment): Recipe {
  const before = computeRecipeStats(recipe);
  const ratio = batchSizeL / recipe.batchSizeL;
  let r: Recipe = {
    ...recipe,
    batchSizeL,
    equipment: equipment ? { ...equipment } : recipe.equipment,
    equipmentId: equipment?.id ?? recipe.equipmentId,
    efficiencyPct: equipment?.efficiencyPct ?? recipe.efficiencyPct,
    fermentables: recipe.fermentables.map((f) => ({ ...f, amountKg: f.amountKg * ratio })),
    hops: recipe.hops.map((h) => ({ ...h, amountG: h.amountG * ratio })),
    miscs: recipe.miscs.map((m) => ({ ...m, amount: Math.round(m.amount * ratio * 10) / 10 })),
  };
  r = scaleToOg(r, before.og);
  r.fermentables = r.fermentables.map((f) => ({ ...f, amountKg: roundKg(f.amountKg) }));
  const boilShares: Record<string, number> = {};
  const boilIbu = r.hops.filter((h) => h.use === 'hervor' || h.use === 'primer-mosto');
  const totalBoil = boilIbu.reduce((s, h) => s + (before.ibuByUid[h.uid] ?? 0), 0);
  for (const h of boilIbu) boilShares[h.uid] = totalBoil > 0 ? (before.ibuByUid[h.uid] ?? 0) / totalBoil : 1 / boilIbu.length;
  r = fitHopsToIbu(
    { ...r, hops: r.hops.map((h) => (h.uid in boilShares ? h : { ...h, amountG: Math.round(h.amountG) })) },
    before.ibu,
    boilShares,
  );
  return r;
}
