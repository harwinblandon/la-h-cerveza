// Convierte un informe de agua tal como venga (acueducto, laboratorio, etiqueta de
// agua embotellada) a los iones que usa la app, y verifica su consistencia.

import type { WaterIons } from './types';

/** Factores de conversión: mg/L "como CaCO₃" → mg/L del ion. */
export const CA_FROM_CACO3 = 40.078 / 100.087; // 0,4004
export const MG_FROM_CACO3 = 24.305 / 100.087; // 0,2428
/** Alcalinidad como CaCO₃ → bicarbonato (válido a pH < 8,3, el caso de casi toda agua potable). */
export const HCO3_FROM_ALK = (2 * 61.017) / 100.087; // 1,2193

export type AsUnit = 'ion' | 'caco3';

export interface WaterReport {
  ca?: number;
  caUnit?: AsUnit;
  mg?: number;
  mgUnit?: AsUnit;
  /** Dureza total como CaCO₃: si falta el magnesio, se deduce de aquí. */
  hardness?: number;
  na?: number;
  so4?: number;
  cl?: number;
  /** Bicarbonato como ion… */
  hco3?: number;
  /** …o alcalinidad total como CaCO₃ (lo que suelen reportar los acueductos). */
  alkalinity?: number;
  ph?: number;
}

export interface ReportResult {
  ions: WaterIons;
  /** Qué se dedujo y cómo, para mostrarlo al cervecero. */
  derived: string[];
  balance: IonBalance;
}

export interface IonBalance {
  cationsMeq: number;
  anionsMeq: number;
  /** Error de balance en %, (cationes − aniones) / (cationes + aniones). */
  errorPct: number;
  quality: 'bueno' | 'aceptable' | 'revisar' | 'sin-datos';
  /** Sodio que cerraría el balance (si faltan cationes). */
  naToBalance: number;
}

const f1 = (x: number) => x.toLocaleString('es-CO', { maximumFractionDigits: 1 });

export function ionBalance(w: WaterIons): IonBalance {
  const cationsMeq = w.ca / 20.04 + w.mg / 12.153 + w.na / 22.99;
  const anionsMeq = w.hco3 / 61.017 + w.so4 / 48.03 + w.cl / 35.453;
  const total = cationsMeq + anionsMeq;
  const errorPct = total > 0 ? ((cationsMeq - anionsMeq) / total) * 100 : 0;
  const abs = Math.abs(errorPct);
  return {
    cationsMeq,
    anionsMeq,
    errorPct,
    // Con aguas muy blandas (< 1 meq/L) los errores relativos crecen sin que el informe esté mal.
    quality: total < 0.2 ? 'sin-datos' : abs <= 5 || total < 1 ? 'bueno' : abs <= 10 ? 'aceptable' : 'revisar',
    naToBalance: Math.max(0, (anionsMeq - cationsMeq) * 22.99),
  };
}

export function fromReport(r: WaterReport, estimateSodium = false): ReportResult {
  const derived: string[] = [];
  const caAsCaCO3 = r.ca === undefined ? undefined : r.caUnit === 'caco3' ? r.ca : r.ca / CA_FROM_CACO3;
  const ca = caAsCaCO3 === undefined ? 0 : caAsCaCO3 * CA_FROM_CACO3;
  if (r.ca !== undefined && r.caUnit === 'caco3') derived.push(`Calcio: ${f1(r.ca)} como CaCO₃ × 0,4004 = ${f1(ca)} mg/L`);

  let mg = 0;
  if (r.mg !== undefined) {
    mg = r.mgUnit === 'caco3' ? r.mg * MG_FROM_CACO3 : r.mg;
    if (r.mgUnit === 'caco3') derived.push(`Magnesio: ${f1(r.mg)} como CaCO₃ × 0,2428 = ${f1(mg)} mg/L`);
  } else if (r.hardness !== undefined && caAsCaCO3 !== undefined) {
    mg = Math.max(0, (r.hardness - caAsCaCO3) * MG_FROM_CACO3);
    derived.push(`Magnesio deducido de la dureza: (${f1(r.hardness)} − ${f1(caAsCaCO3)}) × 0,2428 = ${f1(mg)} mg/L`);
  }

  let hco3 = r.hco3 ?? 0;
  if (r.hco3 === undefined && r.alkalinity !== undefined) {
    hco3 = r.alkalinity * HCO3_FROM_ALK;
    derived.push(`Bicarbonato: alcalinidad ${f1(r.alkalinity)} × 1,22 = ${f1(hco3)} mg/L`);
    if (r.ph !== undefined && r.ph >= 8.3) derived.push('⚠︎ Con pH ≥ 8,3 parte de la alcalinidad es carbonato: el bicarbonato real es algo menor.');
  }

  const base: WaterIons = { ca, mg, na: r.na ?? 0, so4: r.so4 ?? 0, cl: r.cl ?? 0, hco3 };
  if (r.na === undefined && estimateSodium) {
    const b = ionBalance(base);
    base.na = b.naToBalance;
    derived.push(`Sodio estimado por balance de cargas: ${f1(base.na)} mg/L (no venía en el informe)`);
  }
  return { ions: base, derived, balance: ionBalance(base) };
}

/** Mezcla de dos aguas por proporción (p. ej. 70 % ósmosis + 30 % grifo). */
export function blend(a: WaterIons, b: WaterIons, fractionA: number): WaterIons {
  const k = Math.min(1, Math.max(0, fractionA));
  const out = {} as WaterIons;
  for (const key of ['ca', 'mg', 'na', 'so4', 'cl', 'hco3'] as const) out[key] = a[key] * k + b[key] * (1 - k);
  return out;
}
