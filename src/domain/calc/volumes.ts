import { isMashed } from './gravity';
import type { Equipment, RecipeFermentable, RecipeHop } from '../types';

/** Desplazamiento del grano en el macerado (L/kg). */
export const GRAIN_DISPLACEMENT_LPKG = 0.67;

export interface WaterPlan {
  /** Volumen frío que sale de la olla al final del hervor (lote + pérdidas). */
  postBoilColdL: number;
  postBoilHotL: number;
  preBoilL: number;
  boilOffL: number;
  grainKg: number;
  grainAbsorptionL: number;
  hopAbsorptionL: number;
  totalWaterL: number;
  mashWaterL: number;
  spargeWaterL: number;
  /** Volumen total ocupado en el macerado (agua + grano). */
  mashVolumeL: number;
  /** Relación agua/grano efectiva (L/kg). */
  mashRatioLpkg: number;
  warnings: string[];
}

export function planWater(
  eq: Equipment,
  batchSizeL: number,
  boilTimeMin: number,
  fermentables: RecipeFermentable[],
  hops: RecipeHop[],
): WaterPlan {
  const warnings: string[] = [];
  const grainKg = fermentables
    .filter(isMashed)
    .reduce((s, f) => s + f.amountKg, 0);
  const kettleHopsG = hops
    .filter((h) => h.use !== 'dry-hop' && h.use !== 'macerado')
    .reduce((s, h) => s + h.amountG, 0);
  const hopAbsorptionL = (kettleHopsG / 100) * eq.hopAbsorptionLp100g;

  const postBoilColdL = batchSizeL + eq.kettleLossL + hopAbsorptionL;
  const shrink = 1 - eq.coolingShrinkPct / 100;
  const postBoilHotL = postBoilColdL / shrink;
  const boilOffL = (eq.boilOffLph * boilTimeMin) / 60;
  const preBoilL = postBoilHotL + boilOffL;

  const grainAbsorptionL = grainKg * eq.grainAbsorptionLpkg;
  const deadspace = eq.type === 'tres-ollas' || eq.type === 'todo-en-uno' ? eq.mashTunDeadspaceL : 0;
  const totalWaterL = eq.type === 'extracto' ? preBoilL : preBoilL + grainAbsorptionL + deadspace;

  let mashWaterL: number;
  switch (eq.type) {
    case 'biab':
      mashWaterL = totalWaterL;
      break;
    case 'biab-lavado':
      mashWaterL = Math.max(0, totalWaterL - eq.spargeL);
      break;
    case 'extracto':
      mashWaterL = 0;
      break;
    default:
      mashWaterL = Math.min(totalWaterL, grainKg * eq.mashRatioLpkg + deadspace);
  }
  const spargeWaterL = Math.max(0, totalWaterL - mashWaterL);
  const mashVolumeL = mashWaterL + grainKg * GRAIN_DISPLACEMENT_LPKG;
  const mashRatioLpkg = grainKg > 0 ? mashWaterL / grainKg : 0;

  if (eq.type !== 'extracto' && eq.type !== 'tres-ollas' && mashVolumeL > eq.kettleVolumeL) {
    warnings.push(
      `El macerado ocupa ${mashVolumeL.toFixed(1)} L y la olla es de ${eq.kettleVolumeL} L. ` +
        'Usa mini lavado (BIAB con lavado) o reduce el lote.',
    );
  }
  if (preBoilL > eq.kettleVolumeL * 0.92) {
    warnings.push(
      `El volumen pre-hervor (${preBoilL.toFixed(1)} L) deja poco espacio en una olla de ${eq.kettleVolumeL} L; vigila los derrames.`,
    );
  }
  if (grainKg > 0 && mashRatioLpkg > 0 && mashRatioLpkg < 2.3 && eq.type !== 'extracto') {
    warnings.push(`Macerado muy espeso (${mashRatioLpkg.toFixed(1)} L/kg). Lo ideal es 2,5–4 L/kg.`);
  }

  return {
    postBoilColdL,
    postBoilHotL,
    preBoilL,
    boilOffL,
    grainKg,
    grainAbsorptionL,
    hopAbsorptionL,
    totalWaterL,
    mashWaterL,
    spargeWaterL,
    mashVolumeL,
    mashRatioLpkg,
    warnings,
  };
}

/** Temperatura del agua de empaste para llegar a la temperatura de macerado. */
export function strikeTemp(targetC: number, grainTempC: number, ratioLpkg: number): number {
  if (ratioLpkg <= 0) return targetC;
  return targetC + (0.41 / ratioLpkg) * (targetC - grainTempC);
}
