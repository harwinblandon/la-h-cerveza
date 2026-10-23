import type { PrimingSugarId } from '../types';
import { cToF, platoToSg, sgToPlato } from './units';

// ---------- Refractómetro ----------

export const brixToSg = (brix: number, wcf = 1.04) => platoToSg(brix / wcf);

/**
 * Densidad real durante/después de la fermentación a partir de Brix
 * original y actual (ecuación cúbica de Sean Terrill).
 */
export function refractometerFg(originalBrix: number, currentBrix: number, wcf = 1.04): number {
  const ob = originalBrix / wcf;
  const fb = currentBrix / wcf;
  return (
    1.0 -
    0.0044993 * ob +
    0.011774 * fb +
    0.00027581 * ob ** 2 -
    0.0012717 * fb ** 2 -
    0.0000072800 * ob ** 3 +
    0.000063293 * fb ** 3
  );
}

// ---------- Densímetro ----------

function densityFactor(f: number) {
  return 1.00130346 - 0.000134722124 * f + 0.00000204052596 * f ** 2 - 0.00000000232820948 * f ** 3;
}

/** Corrige la lectura del densímetro por temperatura de la muestra. */
export function hydrometerCorrection(readSg: number, sampleC: number, calibrationC = 20): number {
  return readSg * (densityFactor(cToF(sampleC)) / densityFactor(cToF(calibrationC)));
}

// ---------- Dilución / concentración ----------

/** Volumen final necesario para pasar de una densidad a otra (G1·V1 = G2·V2). */
export function dilutionVolume(currentSg: number, currentL: number, targetSg: number): number {
  if (targetSg <= 1) return currentL;
  return ((currentSg - 1) * currentL) / (targetSg - 1);
}

/** Gramos de extracto seco de malta (DME) para subir la densidad. */
export function dmeForGravity(currentSg: number, targetSg: number, volumeL: number): number {
  const ptsNeeded = (targetSg - currentSg) * 1000 * (volumeL / 3.78541);
  return ptsNeeded > 0 ? (ptsNeeded / 44 / 2.20462) * 1000 : 0;
}

// ---------- Carbonatación ----------

/** CO₂ que queda disuelto en la cerveza según la temperatura máxima alcanzada tras fermentar. */
export function residualCo2(beerTempC: number): number {
  const f = cToF(beerTempC);
  return 3.0378 - 0.050062 * f + 0.00026555 * f ** 2;
}

export const PRIMING_SUGARS: Record<PrimingSugarId, { name: string; gPerLPerVol: number }> = {
  sacarosa: { name: 'Azúcar blanca (sacarosa)', gPerLPerVol: 3.82 },
  dextrosa: { name: 'Dextrosa (azúcar de maíz)', gPerLPerVol: 4.2 },
  panela: { name: 'Panela', gPerLPerVol: 4.6 },
  miel: { name: 'Miel', gPerLPerVol: 4.9 },
  dme: { name: 'Extracto de malta seco', gPerLPerVol: 5.5 },
};

export function primingSugarGrams(
  targetVolumes: number,
  beerTempC: number,
  volumeL: number,
  sugar: PrimingSugarId,
): number {
  const needed = targetVolumes - residualCo2(beerTempC);
  return needed > 0 ? needed * volumeL * PRIMING_SUGARS[sugar].gPerLPerVol : 0;
}

/** Presión de regulador (PSI) para carbonatar en barril a cierta temperatura. */
export function kegPsi(targetVolumes: number, beerTempC: number): number {
  const t = cToF(beerTempC);
  const v = targetVolumes;
  const psi =
    -16.6999 - 0.0101059 * t + 0.00116512 * t ** 2 + 0.173354 * t * v + 4.24267 * v - 0.0684226 * v ** 2;
  return Math.max(0, psi);
}

// ---------- Levadura ----------

export interface PitchResult {
  cellsNeededB: number;
  cellsPerPackB: number;
  packs: number;
  viabilityPct: number;
}

/**
 * Células necesarias: 0,75 M/mL/°P para ale, 1,5 para lager (x1,3 sobre 1.060).
 * Seca: ~10 mil millones por gramo (sobre de 11,5 g). Líquida: 100 mil millones
 * por paquete, pierde ~0,7 % de viabilidad por día.
 */
export function pitchRate(
  og: number,
  volumeL: number,
  kind: 'ale' | 'lager',
  form: 'seca' | 'liquida',
  ageDays = 0,
): PitchResult {
  const plato = sgToPlato(og);
  let rate = kind === 'lager' ? 1.5 : 0.75;
  if (og > 1.06) rate *= 1.3;
  const cellsNeededB = (rate * 1e6 * volumeL * 1000 * plato) / 1e9;
  const viabilityPct = form === 'seca' ? 100 : Math.max(10, 100 - ageDays * 0.7);
  const cellsPerPackB = form === 'seca' ? 115 : (100 * viabilityPct) / 100;
  return {
    cellsNeededB,
    cellsPerPackB,
    packs: Math.max(1, Math.ceil(cellsNeededB / cellsPerPackB - 0.1)),
    viabilityPct,
  };
}
