import type { MashStep, RecipeFermentable, RecipeYeast } from '../types';
import { L_PER_GAL, LB_PER_KG, clamp } from './units';

const pointsOf = (f: RecipeFermentable) => f.amountKg * LB_PER_KG * f.ppg;

/** Fracción de los puntos que la levadura puede consumir. */
function fermentability(f: RecipeFermentable): 'normal' | 'total' | 'nula' {
  if (f.type === 'no-fermentable') return 'nula';
  if (f.type === 'azucar') return 'total';
  return 'normal';
}

export interface GravityResult {
  /** OG del mosto (macerado y hervor): la que se mide al llenar el fermentador. */
  og: number;
  /** OG equivalente con lo que se agrega en el fermentador (fruta, azúcares): base del ABV. */
  ogTotal: number;
  preBoilSg: number;
  /** Puntos aportados por cada fermentable (para porcentajes por extracto). */
  pointsByUid: Record<string, number>;
  mashEfficiencyPct: number;
}

export function computeGravity(
  fermentables: RecipeFermentable[],
  efficiencyPct: number,
  batchSizeL: number,
  postBoilColdL: number,
  preBoilL: number,
  coolingShrinkPct: number,
): GravityResult {
  const eff = efficiencyPct / 100;
  const batchGal = batchSizeL / L_PER_GAL;
  const postGal = postBoilColdL / L_PER_GAL;
  const pointsByUid: Record<string, number> = {};
  let mashedPts = 0;
  let total = 0;
  let wort = 0;

  for (const f of fermentables) {
    let pts = 0;
    if (f.use === 'macerado') {
      pts = (pointsOf(f) * eff) / batchGal;
      mashedPts += pts;
    } else if (f.use === 'hervor') {
      pts = pointsOf(f) / postGal;
    } else {
      pts = pointsOf(f) / batchGal;
    }
    pointsByUid[f.uid] = pts;
    total += pts;
    if (f.use !== 'fermentador') wort += pts;
  }

  // En la olla antes de hervir solo está lo macerado, en un volumen mayor.
  const preBoilColdL = preBoilL * (1 - coolingShrinkPct / 100);
  const preBoilPts = preBoilColdL > 0 ? (mashedPts * postBoilColdL) / preBoilColdL : 0;

  return {
    og: 1 + wort / 1000,
    ogTotal: 1 + total / 1000,
    preBoilSg: 1 + preBoilPts / 1000,
    pointsByUid,
    mashEfficiencyPct: batchSizeL > 0 ? (efficiencyPct * postBoilColdL) / batchSizeL : 0,
  };
}

/** Temperatura del paso principal de sacarificación. */
export function mainMashTemp(steps: MashStep[]): number | undefined {
  const sacc = steps.filter((s) => s.tempC >= 60 && s.tempC <= 73);
  if (sacc.length === 0) return steps[0]?.tempC;
  return sacc.reduce((a, b) => (b.timeMin > a.timeMin ? b : a)).tempC;
}

/**
 * Atenuación aparente esperada. Parte de la de la levadura y la corrige por
 * la temperatura de macerado (macerado alto = mosto menos fermentable).
 */
export function expectedAttenuation(yeasts: RecipeYeast[], mashTempC?: number): number {
  const base = yeasts.length ? Math.max(...yeasts.map((y) => y.attenuation)) : 75;
  if (mashTempC === undefined) return base;
  return clamp(base + clamp((66.5 - mashTempC) * 1.2, -7, 5), 50, 98);
}

export function computeFg(
  fermentables: RecipeFermentable[],
  pointsByUid: Record<string, number>,
  attenuationPct: number,
): number {
  const att = attenuationPct / 100;
  let remaining = 0;
  for (const f of fermentables) {
    const pts = pointsByUid[f.uid] ?? 0;
    const kind = fermentability(f);
    if (kind === 'nula') remaining += pts;
    else if (kind === 'normal') remaining += pts * (1 - att);
  }
  return 1 + remaining / 1000;
}

/** ABV con la fórmula de alta precisión (válida también para cervezas fuertes). */
export function abv(og: number, fg: number): number {
  if (og <= fg) return 0;
  return ((76.08 * (og - fg)) / (1.775 - og)) * (fg / 0.794);
}

export const apparentAttenuation = (og: number, sg: number) =>
  og > 1 ? ((og - sg) / (og - 1)) * 100 : 0;

/** Calorías por 355 ml (fórmula estándar ASBC). */
export function calories355(og: number, fg: number): number {
  const re = 0.1808 * platoOf(og) + 0.8192 * platoOf(fg);
  const abw = (0.79 * abv(og, fg)) / fg / 100;
  return (6.9 * abw * 100 + 4.0 * (re - 0.1)) * fg * 3.55;
}

function platoOf(sg: number) {
  return -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;
}
