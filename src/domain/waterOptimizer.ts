import type { SaltId, WaterIons } from './types';
import { ION_KEYS, addSalts } from './calc/water';

// La alcalinidad (bicarbonato) no se persigue aquí: se ajusta según el pH de macerado.
const OPT_SALTS: SaltId[] = ['yeso', 'cloruroCalcio', 'epsom', 'sal'];

function error(w: WaterIons, t: WaterIons): number {
  let e = 0;
  for (const k of ION_KEYS) {
    const d = w[k] - t[k];
    if (k === 'hco3') continue;
    if (k === 'na' || k === 'mg') {
      e += d > 0 ? d * d * 1.5 : d * d * 0.3;
    } else {
      e += d * d;
    }
  }
  return e;
}

/**
 * Busca gramos de sales para acercar el agua al perfil objetivo
 * (descenso por coordenadas con pasos decrecientes, sin cantidades negativas).
 */
export function optimizeSalts(source: WaterIons, target: WaterIons, volumeL: number, allowed?: SaltId[]): Partial<Record<SaltId, number>> {
  const usable = OPT_SALTS.filter((s) => !allowed || allowed.includes(s));
  const salts: Partial<Record<SaltId, number>> = {};
  if (volumeL <= 0) return salts;
  let best = error(source, target);
  for (const step of [2, 1, 0.5, 0.2, 0.1]) {
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 200) {
      improved = false;
      for (const s of usable) {
        for (const dir of [1, -1]) {
          const next = Math.max(0, (salts[s] ?? 0) + dir * step);
          if (next === (salts[s] ?? 0)) continue;
          const trial = { ...salts, [s]: next };
          const e = error(addSalts(source, trial, volumeL), target);
          if (e < best - 1e-6) {
            best = e;
            salts[s] = next;
            improved = true;
          }
        }
      }
    }
  }
  for (const s of OPT_SALTS) {
    const v = salts[s];
    if (v !== undefined) salts[s] = Math.round(v * 10) / 10;
    if (!salts[s]) delete salts[s];
  }
  return salts;
}

/** Reparte las sales entre macerado y lavado en proporción a los volúmenes. */
export function splitSalts(
  salts: Partial<Record<SaltId, number>>,
  mashL: number,
  spargeL: number,
): { mash: Partial<Record<SaltId, number>>; sparge: Partial<Record<SaltId, number>> } {
  const total = mashL + spargeL;
  const mash: Partial<Record<SaltId, number>> = {};
  const sparge: Partial<Record<SaltId, number>> = {};
  for (const [k, v] of Object.entries(salts) as [SaltId, number][]) {
    // El bicarbonato solo tiene sentido en el macerado.
    const f = k === 'bicarbonato' || total <= 0 ? 1 : mashL / total;
    mash[k] = Math.round(v * f * 10) / 10;
    const rest = Math.round((v - mash[k]!) * 10) / 10;
    if (rest > 0) sparge[k] = rest;
  }
  return { mash, sparge };
}
