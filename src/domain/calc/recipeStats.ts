import type { Recipe, WaterIons } from '../types';
import { totalIbu } from './bitterness';
import { recipeSrm, srmToHex } from './color';
import { abv, calories355, computeFg, computeGravity, expectedAttenuation, mainMashTemp } from './gravity';
import { srmToEbc } from './units';
import { planWater, strikeTemp, type WaterPlan } from './volumes';
import { addSalts, dilute, estimateMashPh, mixWaters, residualAlkalinity, sulfateChlorideRatio } from './water';

export interface RecipeStats {
  /** OG del mosto, antes de lo que se agrega en el fermentador. */
  og: number;
  /** OG equivalente con fruta y azúcares del fermentador (para ABV). */
  ogTotal: number;
  fg: number;
  abv: number;
  ibu: number;
  srm: number;
  ebc: number;
  colorHex: string;
  buGu: number;
  attenuation: number;
  preBoilSg: number;
  boilGravity: number;
  mashEfficiencyPct: number;
  calories: number;
  water: WaterPlan;
  strikeTempC?: number;
  mashTempC?: number;
  /** Porcentaje de cada fermentable por peso. */
  pctByUid: Record<string, number>;
  ibuByUid: Record<string, number>;
  totalGrainKg: number;
  totalHopsG: number;
  mashWater?: WaterIons;
  /** Agua total resultante (macerado + lavado) que llega a la olla. */
  kettleWater?: WaterIons;
  mashPh?: number;
  ra?: number;
  so4ClRatio?: number;
}

export function computeRecipeStats(recipe: Recipe, sourceWater?: WaterIons, grainTempC = 20): RecipeStats {
  const eq = recipe.equipment;
  const water = planWater(eq, recipe.batchSizeL, recipe.boilTimeMin, recipe.fermentables, recipe.hops);
  const grav = computeGravity(
    recipe.fermentables,
    recipe.efficiencyPct,
    recipe.batchSizeL,
    water.postBoilColdL,
    water.preBoilL,
    eq.coolingShrinkPct,
  );
  const mashTempC = mainMashTemp(recipe.mashSteps);
  const attenuation = expectedAttenuation(recipe.yeasts, mashTempC);
  const fg = computeFg(recipe.fermentables, grav.pointsByUid, attenuation);
  const boilGravity = (grav.preBoilSg + grav.og) / 2;

  const ibuByUid: Record<string, number> = {};
  for (const h of recipe.hops) {
    ibuByUid[h.uid] = totalIbu([h], boilGravity, water.postBoilHotL, recipe.boilTimeMin);
  }
  const ibu = Object.values(ibuByUid).reduce((a, b) => a + b, 0);
  const srm = recipeSrm(recipe.fermentables, water.postBoilColdL);

  const totalKg = recipe.fermentables.reduce((s, f) => s + f.amountKg, 0);
  const pctByUid: Record<string, number> = {};
  for (const f of recipe.fermentables) pctByUid[f.uid] = totalKg > 0 ? (f.amountKg / totalKg) * 100 : 0;

  const firstStep = recipe.mashSteps[0];
  const strike =
    firstStep && water.mashRatioLpkg > 0 ? strikeTemp(firstStep.tempC, grainTempC, water.mashRatioLpkg) : undefined;

  let mashWater: WaterIons | undefined;
  let kettleWater: WaterIons | undefined;
  let mashPh: number | undefined;
  if (sourceWater) {
    const base = dilute(sourceWater, recipe.water.dilution);
    mashWater = addSalts(base, recipe.water.mashSalts, water.mashWaterL);
    const sparge = addSalts(base, recipe.water.spargeSalts, water.spargeWaterL);
    kettleWater = mixWaters(mashWater, water.mashWaterL, sparge, water.spargeWaterL);
    mashPh = estimateMashPh({
      fermentables: recipe.fermentables,
      water: mashWater,
      mashWaterL: water.mashWaterL,
      lacticMl: recipe.water.lacticMl,
      lacticPct: recipe.water.lacticPct,
      phosphoricMl: recipe.water.phosphoricMl,
      phosphoricPct: recipe.water.phosphoricPct,
    });
  }

  const og = grav.og;
  const ogTotal = grav.ogTotal;
  return {
    og,
    ogTotal,
    fg,
    abv: abv(ogTotal, fg),
    ibu,
    srm,
    ebc: srmToEbc(srm),
    colorHex: srmToHex(srm),
    buGu: og > 1 ? ibu / ((og - 1) * 1000) : 0,
    attenuation,
    preBoilSg: grav.preBoilSg,
    boilGravity,
    mashEfficiencyPct: grav.mashEfficiencyPct,
    calories: calories355(ogTotal, fg),
    water,
    strikeTempC: strike,
    mashTempC,
    pctByUid,
    ibuByUid,
    totalGrainKg: totalKg,
    totalHopsG: recipe.hops.reduce((s, h) => s + h.amountG, 0),
    mashWater,
    kettleWater,
    mashPh,
    ra: mashWater ? residualAlkalinity(mashWater) : undefined,
    so4ClRatio: kettleWater ? sulfateChlorideRatio(kettleWater) : undefined,
  };
}
