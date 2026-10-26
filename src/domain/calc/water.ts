import { isMashed } from './gravity';
import type { AcidChoice, WaterAdjustments, RecipeFermentable, SaltId, WaterIons } from '../types';

export interface SaltInfo {
  id: SaltId;
  name: string;
  formula: string;
  /** ppm aportados por 1 g disuelto en 1 L. */
  ppmPerGL: Partial<WaterIons>;
  note?: string;
}

export const SALTS: SaltInfo[] = [
  { id: 'yeso', name: 'Yeso (sulfato de calcio)', formula: 'CaSO₄·2H₂O', ppmPerGL: { ca: 232.8, so4: 557.9 }, note: 'Resalta el amargor seco y el lúpulo.' },
  { id: 'cloruroCalcio', name: 'Cloruro de calcio', formula: 'CaCl₂·2H₂O', ppmPerGL: { ca: 272.6, cl: 482.3 }, note: 'Redondea, da cuerpo y dulzor de malta.' },
  { id: 'epsom', name: 'Sal de Epsom (sulfato de magnesio)', formula: 'MgSO₄·7H₂O', ppmPerGL: { mg: 98.6, so4: 389.7 }, note: 'Úsala con moderación (Mg < 30 ppm).' },
  { id: 'sal', name: 'Sal de mesa sin yodo', formula: 'NaCl', ppmPerGL: { na: 393.4, cl: 606.6 }, note: 'Sodio < 100 ppm; útil en Gose.' },
  { id: 'bicarbonato', name: 'Bicarbonato de sodio', formula: 'NaHCO₃', ppmPerGL: { na: 273.7, hco3: 726.4 }, note: 'Sube el pH en cervezas oscuras.' },
  { id: 'carbonatoCalcio', name: 'Carbonato de calcio (tiza)', formula: 'CaCO₃', ppmPerGL: { ca: 400.4, hco3: 1219.2 }, note: 'Se disuelve mal; su efecto real suele ser menor.' },
  { id: 'calApagada', name: 'Cal apagada', formula: 'Ca(OH)₂', ppmPerGL: { ca: 540.9, hco3: 1647 }, note: 'Muy potente para subir pH. Dosifica en décimas de gramo.' },
  { id: 'cloruroMagnesio', name: 'Cloruro de magnesio', formula: 'MgCl₂·6H₂O', ppmPerGL: { mg: 119.5, cl: 348.8 } },
];

export const ION_KEYS: (keyof WaterIons)[] = ['ca', 'mg', 'na', 'so4', 'cl', 'hco3'];

export const ION_LABELS: Record<keyof WaterIons, string> = {
  ca: 'Calcio',
  mg: 'Magnesio',
  na: 'Sodio',
  so4: 'Sulfato',
  cl: 'Cloruro',
  hco3: 'Bicarbonato',
};

export function dilute(water: WaterIons, roFraction: number): WaterIons {
  const k = 1 - roFraction;
  return {
    ca: water.ca * k,
    mg: water.mg * k,
    na: water.na * k,
    so4: water.so4 * k,
    cl: water.cl * k,
    hco3: water.hco3 * k,
  };
}

export function addSalts(water: WaterIons, salts: Partial<Record<SaltId, number>>, volumeL: number): WaterIons {
  const out = { ...water };
  if (volumeL <= 0) return out;
  for (const s of SALTS) {
    const g = salts[s.id] ?? 0;
    if (!g) continue;
    for (const k of ION_KEYS) out[k] += ((s.ppmPerGL[k] ?? 0) * g) / volumeL;
  }
  return out;
}

/** Mezcla dos aguas por volumen. */
export function mixWaters(a: WaterIons, va: number, b: WaterIons, vb: number): WaterIons {
  const t = va + vb;
  if (t <= 0) return a;
  const out = {} as WaterIons;
  for (const k of ION_KEYS) out[k] = (a[k] * va + b[k] * vb) / t;
  return out;
}

/** Alcalinidad residual de Kolbach en ppm como CaCO₃. */
export function residualAlkalinity(w: WaterIons): number {
  const alk = (w.hco3 / 61.02) * 50.04;
  return alk - (w.ca / 1.4 + w.mg / 1.7);
}

/** Alcalinidad residual en mEq/L. */
export function residualAlkalinityMeq(w: WaterIons): number {
  return w.hco3 / 61.02 - w.ca / 20.04 / 3.5 - w.mg / 12.15 / 7;
}

export function sulfateChlorideRatio(w: WaterIons): number {
  return w.cl > 0 ? w.so4 / w.cl : w.so4 > 0 ? Infinity : 0;
}

export function balanceLabel(ratio: number): string {
  if (!Number.isFinite(ratio)) return 'Muy amargo';
  if (ratio < 0.4) return 'Muy maltoso';
  if (ratio < 0.8) return 'Maltoso';
  if (ratio < 1.5) return 'Equilibrado';
  if (ratio < 3) return 'Amargo';
  return 'Muy amargo';
}

/** pH en agua destilada estimado según el tipo y color de la malta. */
export function defaultDiPH(f: Pick<RecipeFermentable, 'type' | 'colorEBC' | 'diPH'>): number {
  if (f.diPH) return f.diPH;
  const lov = (f.colorEBC * 0.508 + 0.76) / 1.3546;
  switch (f.type) {
    case 'base':
      return lov < 4 ? 5.72 : lov < 8 ? 5.55 : 5.45;
    case 'caramelo':
      return Math.max(4.4, 5.22 - 0.00504 * lov);
    case 'tostada':
      return 4.6;
    case 'especial':
      return 5.25;
    case 'adjunto':
      return 5.95;
    default:
      return 5.7;
  }
}

function bufferCapacity(f: Pick<RecipeFermentable, 'type'>): number {
  switch (f.type) {
    case 'caramelo':
      return 50;
    case 'tostada':
      return 55;
    case 'adjunto':
      return 25;
    default:
      return 38;
  }
}

/** mEq de ácido por mL según concentración. */
export const lacticMeqPerMl = (pct: number) => (pct / 88) * 11.4;
export const phosphoricMeqPerMl = (pct: number) => {
  // Densidad aproximada interpolada entre 10 % (1,05) y 85 % (1,685).
  const density = 1.0 + (pct / 100) * 0.806;
  return ((density * pct) / 100 / 98.0) * 1000;
};
/** mEq por mL del ácido elegido por el cervecero. */
export const acidMeqPerMl = (acid: AcidChoice) => (acid.type === 'fosforico' ? phosphoricMeqPerMl(acid.pct) : lacticMeqPerMl(acid.pct));

export const ACID_LABEL: Record<AcidChoice['type'], string> = { lactico: 'Ácido láctico', fosforico: 'Ácido fosfórico' };

/** Malta acidulada: ~2,5 % de ácido láctico. */
const ACID_MALT_MEQ_PER_KG = 278;

export interface MashPhInput {
  fermentables: RecipeFermentable[];
  water: WaterIons;
  mashWaterL: number;
  lacticMl: number;
  lacticPct: number;
  phosphoricMl: number;
  phosphoricPct: number;
}

/**
 * Estimación del pH de macerado por balance de cargas: cada malta empuja hacia
 * su pH en agua destilada con cierta capacidad tampón; el agua (alcalinidad
 * residual) y los ácidos lo desplazan. Precisión típica ±0,1.
 */
export function estimateMashPh(i: MashPhInput): number | undefined {
  const mashed = i.fermentables.filter((f) => isMashed(f) && f.amountKg > 0);
  let bufSum = 0;
  let weighted = 0;
  let acid = 0;
  for (const f of mashed) {
    if (f.type === 'acida') {
      acid += f.amountKg * ACID_MALT_MEQ_PER_KG;
      continue;
    }
    const b = bufferCapacity(f) * f.amountKg;
    bufSum += b;
    weighted += b * defaultDiPH(f);
  }
  if (bufSum <= 0) return undefined;
  acid += i.lacticMl * lacticMeqPerMl(i.lacticPct) + i.phosphoricMl * phosphoricMeqPerMl(i.phosphoricPct);
  const alkalinity = residualAlkalinityMeq(i.water) * i.mashWaterL;
  return (weighted + alkalinity - acid) / bufSum;
}

/** mL de ácido láctico para llevar el macerado a un pH objetivo. */
/** mL del ácido elegido para llevar el macerado al pH objetivo. */
export function acidForTargetPh(i: MashPhInput, targetPh: number, acid: AcidChoice): number {
  const current = estimateMashPh({ ...i, lacticMl: 0, phosphoricMl: 0 });
  if (current === undefined) return 0;
  const bufSum = i.fermentables
    .filter((f) => isMashed(f) && f.type !== 'acida')
    .reduce((s, f) => s + bufferCapacity(f) * f.amountKg, 0);
  const meq = (current - targetPh) * bufSum;
  return meq > 0 ? meq / acidMeqPerMl(acid) : 0;
}

export const lacticForTargetPh = (i: MashPhInput, targetPh: number) => acidForTargetPh(i, targetPh, { type: 'lactico', pct: i.lacticPct });

/** Gramos de bicarbonato de sodio en el macerado para subir el pH a un objetivo. */
export function bicarbonateForTargetPh(i: MashPhInput, targetPh: number): number {
  const current = estimateMashPh(i);
  if (current === undefined) return 0;
  const bufSum = i.fermentables
    .filter((f) => isMashed(f) && f.type !== 'acida')
    .reduce((s, f) => s + bufferCapacity(f) * f.amountKg, 0);
  const meq = (targetPh - current) * bufSum;
  // 1 g de NaHCO₃ = 11,9 mEq de alcalinidad.
  return meq > 0 ? meq / 11.9 : 0;
}

/** mL de ácido para neutralizar ~90 % de la alcalinidad del agua de lavado. */
export function spargeAcidMl(water: WaterIons, volumeL: number, acid: AcidChoice): number {
  const meq = (water.hco3 / 61.02) * volumeL * 0.9;
  return meq / acidMeqPerMl(acid);
}

/** Ácido de la receta: el que ya tiene cargado, o el preferido del cervecero. */
export function recipeAcid(w: WaterAdjustments, pref?: AcidChoice): AcidChoice {
  if (w.phosphoricMl > 0) return { type: 'fosforico', pct: w.phosphoricPct };
  if (w.lacticMl > 0) return { type: 'lactico', pct: w.lacticPct };
  if (pref) return pref;
  return { type: 'lactico', pct: w.lacticPct };
}

/** mL de ácido de la receta (del tipo que use). */
export const acidMl = (w: WaterAdjustments) => (w.phosphoricMl > 0 ? w.phosphoricMl : w.lacticMl);

/** Carga una dosis de ácido en el agua de la receta; el otro ácido queda en cero. */
export function withAcid(w: WaterAdjustments, acid: AcidChoice, ml: number): WaterAdjustments {
  const v = Math.round(ml * 10) / 10;
  return acid.type === 'fosforico'
    ? { ...w, phosphoricMl: v, phosphoricPct: acid.pct, lacticMl: 0 }
    : { ...w, lacticMl: v, lacticPct: acid.pct, phosphoricMl: 0 };
}
