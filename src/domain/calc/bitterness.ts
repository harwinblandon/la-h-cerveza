import type { RecipeHop } from '../types';

/** Utilización de Tinseth. */
export function tinsethUtilization(boilGravity: number, minutes: number): number {
  if (minutes <= 0) return 0;
  const bigness = 1.65 * 0.000125 ** (boilGravity - 1);
  const time = (1 - Math.exp(-0.04 * minutes)) / 4.15;
  return bigness * time;
}

/**
 * Factor relativo de isomerización a una temperatura dada frente a 100 °C
 * (modelo de Malowicki usado en mIBU). 80 °C ≈ 0,23.
 */
export function isomerizationFactor(tempC: number): number {
  return Math.min(1, 2.39e11 * Math.exp(-9773 / (tempC + 273.15)));
}

const formFactor = (h: RecipeHop) => (h.form === 'flor' ? 0.9 : h.form === 'cryo' ? 1.0 : 1.0);

/** IBU de una adición individual. */
export function hopIbu(h: RecipeHop, boilGravity: number, postBoilL: number, boilTimeMin: number): number {
  if (postBoilL <= 0 || h.amountG <= 0) return 0;
  const mgPerL = ((h.alpha / 100) * h.amountG * 1000) / postBoilL;
  let util = 0;
  switch (h.use) {
    case 'hervor':
      util = tinsethUtilization(boilGravity, Math.min(h.time, boilTimeMin));
      break;
    case 'primer-mosto':
      // Se comporta como hervor completo con un ~10 % extra de amargor percibido.
      util = tinsethUtilization(boilGravity, boilTimeMin) * 1.1;
      break;
    case 'whirlpool':
      util = tinsethUtilization(boilGravity, h.time) * isomerizationFactor(h.tempC ?? 80);
      break;
    case 'macerado':
      util = tinsethUtilization(boilGravity, boilTimeMin) * 0.2;
      break;
    case 'dry-hop':
      util = 0;
  }
  return util * mgPerL * formFactor(h);
}

export function totalIbu(hops: RecipeHop[], boilGravity: number, postBoilL: number, boilTimeMin: number) {
  return hops.reduce((s, h) => s + hopIbu(h, boilGravity, postBoilL, boilTimeMin), 0);
}

/** Gramos necesarios de un lúpulo para aportar cierto IBU. */
export function gramsForIbu(
  ibu: number,
  alpha: number,
  use: RecipeHop['use'],
  time: number,
  boilGravity: number,
  postBoilL: number,
  boilTimeMin: number,
  tempC?: number,
): number {
  const probe: RecipeHop = { uid: '', name: '', alpha, form: 'pellet', amountG: 1, use, time, tempC };
  const per = hopIbu(probe, boilGravity, postBoilL, boilTimeMin);
  return per > 0 ? ibu / per : 0;
}
