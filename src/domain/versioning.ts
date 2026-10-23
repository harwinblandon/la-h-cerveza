import { computeRecipeStats, type RecipeStats } from './calc/recipeStats';
import { mainMashTemp } from './calc/gravity';
import { uid } from './calc/units';
import { SALTS } from './calc/water';
import type { Recipe, RecipeVersion, VersionReason, WaterIons } from './types';

// ---------- Versiones ----------

/** Contenido técnico de la receta, sin metadatos que cambian solos. */
export function contentKey(r: Recipe): string {
  const content: Partial<Recipe> = { ...r };
  for (const k of ['id', 'createdAt', 'updatedAt', 'versionCount', 'archived'] as const) delete content[k];
  return JSON.stringify(content);
}

/** ¿La receta tiene cambios que no están en su última versión? */
export function hasUnversionedChanges(r: Recipe, last?: RecipeVersion): boolean {
  return !last || contentKey(last.snapshot) !== contentKey(r);
}

export function makeVersion(r: Recipe, number: number, reason: VersionReason, label?: string, note?: string): RecipeVersion {
  return {
    id: uid(),
    recipeId: r.id,
    number,
    label: label?.trim() || `V${number}`,
    note: note?.trim() || undefined,
    reason,
    snapshot: structuredClone({ ...r, versionCount: number }),
    createdAt: Date.now(),
  };
}

export const VERSION_REASON_LABEL: Record<VersionReason, string> = {
  manual: 'Guardada por ti',
  lote: 'Al cocinar un lote',
  importacion: 'Importación',
  restauracion: 'Antes de restaurar otra versión',
  migracion: 'Versión inicial',
};

// ---------- Diferencias ----------

export type ChangeKind =
  | 'malta-agregada'
  | 'malta-quitada'
  | 'malta-cantidad'
  | 'lupulo-agregado'
  | 'lupulo-quitado'
  | 'lupulo-cantidad'
  | 'lupulo-momento'
  | 'levadura'
  | 'otro-ingrediente'
  | 'macerado'
  | 'fermentacion'
  | 'hervor'
  | 'volumen'
  | 'eficiencia'
  | 'agua'
  | 'carbonatacion'
  | 'estilo'
  | 'nombre';

export interface Change {
  kind: ChangeKind;
  text: string;
  /** Categoría del ingrediente afectado (para las consecuencias). */
  category?: string;
  /** Magnitud con signo: positiva = más. */
  delta?: number;
  /** Datos extra para reglas (g/L de dry hop, % del grano…). */
  meta?: Record<string, number | string>;
}

const n = (x: number, d = 1) => x.toLocaleString('es-CO', { maximumFractionDigits: d });
const kg = (x: number) => (x < 1 ? `${n(x * 1000, 0)} g` : `${n(x, 2)} kg`);

function byUid<T extends { uid: string }>(list: T[]) {
  return new Map(list.map((x) => [x.uid, x]));
}

export function diffRecipes(a: Recipe, b: Recipe): Change[] {
  const out: Change[] = [];
  if (a.name !== b.name) out.push({ kind: 'nombre', text: `Nombre: "${a.name}" → "${b.name}"` });
  if (a.styleId !== b.styleId) out.push({ kind: 'estilo', text: 'Cambió el estilo objetivo' });
  if (Math.abs(a.batchSizeL - b.batchSizeL) > 0.05)
    out.push({ kind: 'volumen', text: `Volumen ${n(a.batchSizeL)} → ${n(b.batchSizeL)} L`, delta: b.batchSizeL - a.batchSizeL });
  if (a.boilTimeMin !== b.boilTimeMin)
    out.push({ kind: 'hervor', text: `Hervor ${a.boilTimeMin} → ${b.boilTimeMin} min`, delta: b.boilTimeMin - a.boilTimeMin });
  if (Math.abs(a.efficiencyPct - b.efficiencyPct) > 0.1)
    out.push({ kind: 'eficiencia', text: `Eficiencia ${n(a.efficiencyPct, 0)} → ${n(b.efficiencyPct, 0)} %`, delta: b.efficiencyPct - a.efficiencyPct });

  // Fermentables
  const totalB = b.fermentables.reduce((s, f) => s + f.amountKg, 0) || 1;
  const fa = byUid(a.fermentables);
  const fb = byUid(b.fermentables);
  for (const f of b.fermentables) {
    const prev = fa.get(f.uid);
    const pct = (f.amountKg / totalB) * 100;
    if (!prev) {
      out.push({ kind: 'malta-agregada', text: `Se agrega ${kg(f.amountKg)} de ${f.name}`, category: f.type, delta: f.amountKg, meta: { pct } });
    } else if (prev.ingredientId !== f.ingredientId) {
      out.push({ kind: 'malta-quitada', text: `Sale ${prev.name}`, category: prev.type, delta: -prev.amountKg });
      out.push({ kind: 'malta-agregada', text: `Entra ${kg(f.amountKg)} de ${f.name} en su lugar`, category: f.type, delta: f.amountKg, meta: { pct } });
    } else if (Math.abs(prev.amountKg - f.amountKg) > 0.0005) {
      out.push({
        kind: 'malta-cantidad',
        text: `${f.name}: ${kg(prev.amountKg)} → ${kg(f.amountKg)}`,
        category: f.type,
        delta: f.amountKg - prev.amountKg,
        meta: { pct },
      });
    }
  }
  for (const f of a.fermentables) if (!fb.has(f.uid)) out.push({ kind: 'malta-quitada', text: `Se quita ${f.name}`, category: f.type, delta: -f.amountKg });

  // Lúpulos
  const ha = byUid(a.hops);
  const hb = byUid(b.hops);
  const useCat = (u: string, t: number) => (u === 'dry-hop' ? 'dry-hop' : u === 'whirlpool' || (u === 'hervor' && t <= 20) ? 'aroma' : 'amargor');
  for (const h of b.hops) {
    const prev = ha.get(h.uid);
    const cat = useCat(h.use, h.time);
    const gpl = h.amountG / b.batchSizeL;
    if (!prev) {
      out.push({ kind: 'lupulo-agregado', text: `Se agrega ${n(h.amountG, 0)} g de ${h.name} (${cat})`, category: cat, delta: h.amountG, meta: { gpl } });
    } else if (prev.ingredientId !== h.ingredientId) {
      out.push({ kind: 'lupulo-agregado', text: `${prev.name} → ${h.name} (${n(h.amountG, 0)} g, ${cat})`, category: cat, delta: 0, meta: { gpl } });
    } else {
      if (Math.abs(prev.amountG - h.amountG) > 0.05)
        out.push({ kind: 'lupulo-cantidad', text: `${h.name} (${cat}): ${n(prev.amountG, 0)} → ${n(h.amountG, 0)} g`, category: cat, delta: h.amountG - prev.amountG, meta: { gpl } });
      if (prev.use !== h.use || prev.time !== h.time)
        out.push({ kind: 'lupulo-momento', text: `${h.name}: momento de adición cambió`, category: cat, delta: prev.use === h.use ? h.time - prev.time : 0, meta: { use: h.use } });
    }
  }
  for (const h of a.hops) if (!hb.has(h.uid)) out.push({ kind: 'lupulo-quitado', text: `Se quita ${h.name}`, category: useCat(h.use, h.time), delta: -h.amountG });

  // Levadura
  const ya = a.yeasts[0];
  const yb = b.yeasts[0];
  if ((ya?.ingredientId ?? ya?.name) !== (yb?.ingredientId ?? yb?.name) || (ya && yb && ya.attenuation !== yb.attenuation)) {
    out.push({
      kind: 'levadura',
      text: ya && yb ? `Levadura ${ya.name} (${ya.attenuation} %) → ${yb.name} (${yb.attenuation} %)` : yb ? `Se agrega ${yb.name}` : 'Se quita la levadura',
      delta: (yb?.attenuation ?? 0) - (ya?.attenuation ?? 0),
      meta: { familyChanged: ya?.family !== yb?.family ? 1 : 0 },
    });
  } else if (ya && yb && ya.amount !== yb.amount) {
    out.push({ kind: 'levadura', text: `${yb.name}: ${ya.amount} → ${yb.amount} unidades`, delta: 0, meta: { pitch: yb.amount - ya.amount } });
  }

  // Otros
  const ma = new Map(a.miscs.map((m) => [m.uid, m]));
  const mb = new Map(b.miscs.map((m) => [m.uid, m]));
  for (const m of b.miscs) {
    const prev = ma.get(m.uid);
    if (!prev) out.push({ kind: 'otro-ingrediente', text: `Se agrega ${n(m.amount)} ${m.unit} de ${m.name}` });
    else if (prev.amount !== m.amount || prev.name !== m.name) out.push({ kind: 'otro-ingrediente', text: `${m.name}: ${n(prev.amount)} → ${n(m.amount)} ${m.unit}` });
  }
  for (const m of a.miscs) if (!mb.has(m.uid)) out.push({ kind: 'otro-ingrediente', text: `Se quita ${m.name}` });

  // Proceso
  const ta = mainMashTemp(a.mashSteps);
  const tb = mainMashTemp(b.mashSteps);
  if (ta !== undefined && tb !== undefined && Math.abs(ta - tb) >= 0.25)
    out.push({ kind: 'macerado', text: `Macerado ${n(ta)} → ${n(tb)} °C`, delta: tb - ta });
  else if (JSON.stringify(a.mashSteps.map((s) => [s.tempC, s.timeMin])) !== JSON.stringify(b.mashSteps.map((s) => [s.tempC, s.timeMin])))
    out.push({ kind: 'macerado', text: 'Cambiaron los escalones de macerado', delta: 0 });
  const pa = a.fermentation[0]?.tempC;
  const pb = b.fermentation[0]?.tempC;
  if (pa !== undefined && pb !== undefined && pa !== pb) out.push({ kind: 'fermentacion', text: `Fermentación primaria ${n(pa)} → ${n(pb)} °C`, delta: pb - pa });

  // Agua
  for (const s of SALTS) {
    const ga = (a.water.mashSalts[s.id] ?? 0) + (a.water.spargeSalts[s.id] ?? 0);
    const gb = (b.water.mashSalts[s.id] ?? 0) + (b.water.spargeSalts[s.id] ?? 0);
    if (Math.abs(ga - gb) >= 0.05) out.push({ kind: 'agua', text: `${s.name}: ${n(ga)} → ${n(gb)} g`, category: s.id, delta: gb - ga });
  }
  if (Math.abs(a.water.lacticMl - b.water.lacticMl) >= 0.05)
    out.push({ kind: 'agua', text: `Ácido láctico: ${n(a.water.lacticMl)} → ${n(b.water.lacticMl)} mL`, category: 'acido', delta: b.water.lacticMl - a.water.lacticMl });
  if (a.water.sourceProfileId !== b.water.sourceProfileId || a.water.dilution !== b.water.dilution)
    out.push({ kind: 'agua', text: 'Cambió el agua de origen o la dilución', category: 'origen', delta: 0 });

  if (a.carbonation.volumes !== b.carbonation.volumes)
    out.push({ kind: 'carbonatacion', text: `Carbonatación ${n(a.carbonation.volumes)} → ${n(b.carbonation.volumes)} vol`, delta: b.carbonation.volumes - a.carbonation.volumes });
  return out;
}

// ---------- Consecuencias ----------

export interface Effect {
  sign: '+' | '−' | '!';
  text: string;
}

/**
 * Efectos sensoriales y de proceso esperables de un cambio. Son reglas cerveceras
 * generales (procedencia "regla"), no predicciones exactas.
 */
export function consequences(c: Change): Effect[] {
  const up = (c.delta ?? 0) > 0;
  const E = (sign: Effect['sign'], text: string): Effect => ({ sign, text });
  const flip = (e: Effect[]) => e.map((x) => (x.sign === '!' ? x : { ...x, sign: x.sign === '+' ? '−' : '+' }) as Effect);
  const dir = (e: Effect[]) => (up ? e : flip(e));

  switch (c.kind) {
    case 'malta-agregada':
    case 'malta-quitada':
    case 'malta-cantidad': {
      const pct = Number(c.meta?.pct ?? 0);
      switch (c.category) {
        case 'base':
        case 'extracto':
          return dir([E('+', 'densidad y alcohol'), E('+', 'cuerpo'), E('−', 'amargor percibido (BU:GU baja)')]);
        case 'caramelo': {
          const e = dir([E('+', 'caramelo y dulzor percibido'), E('+', 'color'), E('+', 'cuerpo'), E('−', 'fermentabilidad')]);
          if (up && pct > 15) e.push(E('!', `con ${n(pct, 0)} % de caramelo la tomabilidad puede bajar (empalagosa)`));
          return e;
        }
        case 'tostada': {
          const e = dir([E('+', 'tostado, café, chocolate'), E('+', 'color'), E('+', 'sequedad y acidez percibida'), E('−', 'pH del macerado')]);
          if (up && pct > 8) e.push(E('!', 'riesgo de astringencia o tostado acre'));
          return e;
        }
        case 'especial':
          return dir([E('+', 'maltosidad (pan, galleta, miel)'), E('+', 'color'), E('+', 'complejidad')]);
        case 'adjunto':
          return dir([E('+', 'cuerpo sedoso y espuma'), E('+', 'turbidez'), E('!', 'el lavado puede ser más lento')]);
        case 'azucar':
          return dir([E('+', 'alcohol'), E('+', 'fermentabilidad y sequedad'), E('−', 'cuerpo relativo')]);
        case 'no-fermentable':
          return dir([E('+', 'dulzor residual'), E('+', 'cuerpo'), E('+', 'FG')]);
        case 'acida':
          return dir([E('−', 'pH del macerado'), E('+', 'acidez sutil')]);
        default:
          return [];
      }
    }
    case 'lupulo-agregado':
    case 'lupulo-cantidad':
    case 'lupulo-quitado': {
      if (c.category === 'amargor') return dir([E('+', 'IBU y amargor percibido')]);
      if (c.category === 'aroma') return dir([E('+', 'aroma y sabor a lúpulo'), E('+', 'IBU (moderado)'), E('+', 'pérdida de mosto en la olla')]);
      const gpl = Number(c.meta?.gpl ?? 0);
      const e = dir([E('+', 'intensidad aromática'), E('+', 'pérdida de volumen en el fermentador')]);
      if (up && gpl > 12) e.push(E('!', `${n(gpl)} g/L: riesgo de hop burn (astringencia herbal) y saturación`));
      if (up && gpl > 8) e.push(E('!', 'puede reactivar la fermentación (hop creep): espera densidad estable antes de envasar'));
      if (up) e.push(E('!', 'más riesgo de oxidación: minimiza el oxígeno al abrir el fermentador'));
      return e;
    }
    case 'lupulo-momento':
      return [E('!', 'adiciones más tempranas suman amargor; más tardías suman aroma')];
    case 'levadura': {
      const e: Effect[] = [];
      if ((c.delta ?? 0) > 1) e.push(E('+', 'atenuación: final más seco, más alcohol'), E('−', 'cuerpo y dulzor'));
      if ((c.delta ?? 0) < -1) e.push(E('+', 'cuerpo y dulzor residual'), E('−', 'atenuación'));
      if (c.meta?.familyChanged) e.push(E('!', 'cambia el perfil de ésteres y fenoles de la fermentación'));
      if (c.meta?.pitch) e.push(E((c.meta.pitch as number) > 0 ? '+' : '−', 'células inoculadas: arranque más rápido y menos ésteres'));
      return e;
    }
    case 'macerado':
      if (!c.delta) return [E('!', 'cambia el perfil de fermentabilidad del mosto')];
      return dir([E('+', 'cuerpo y dextrinas'), E('+', 'FG'), E('−', 'fermentabilidad y alcohol')]);
    case 'fermentacion':
      return up
        ? [E('+', 'ésteres frutales y velocidad de fermentación'), E('!', 'por encima del rango de la levadura aparecen fuseles (alcohol solvente)')]
        : [E('−', 'ésteres: perfil más limpio'), E('!', 'por debajo del rango de la levadura la fermentación puede detenerse')];
    case 'hervor':
      return dir([E('+', 'evaporación: densidad más alta y menos volumen'), E('−', 'riesgo de DMS'), E('+', 'caramelización ligera')]);
    case 'volumen':
      return [E('!', 'con los mismos ingredientes cambia la densidad; usa "Escalar" para conservar OG e IBU')];
    case 'eficiencia':
      return dir([E('+', 'densidad estimada con el mismo grano')]);
    case 'agua':
      if (c.category === 'yeso' || c.category === 'epsom') return dir([E('+', 'sulfato: amargor más seco y definido')]);
      if (c.category === 'cloruroCalcio' || c.category === 'sal' || c.category === 'cloruroMagnesio') return dir([E('+', 'cloruro: sensación más redonda y llena')]);
      if (c.category === 'bicarbonato' || c.category === 'carbonatoCalcio' || c.category === 'calApagada') return dir([E('+', 'pH del macerado (útil en oscuras)')]);
      if (c.category === 'acido') return dir([E('−', 'pH del macerado'), E('+', 'acidez si se excede')]);
      return [E('!', 'cambia el perfil mineral; revisa el pH')];
    case 'carbonatacion':
      return dir([E('+', 'efervescencia y sensación de sequedad'), E('−', 'cuerpo percibido')]);
    default:
      return [];
  }
}

// ---------- Efecto numérico ----------

export interface StatDelta {
  key: string;
  label: string;
  before: number;
  after: number;
  format: (x: number) => string;
  /** Cambio relevante (supera el umbral de la variable). */
  significant: boolean;
}

export function statDeltas(before: RecipeStats, after: RecipeStats): StatDelta[] {
  const sg = (x: number) => x.toFixed(3);
  const rows: [string, string, number, number, (x: number) => string, number][] = [
    ['og', 'OG', before.og, after.og, sg, 0.0005],
    ['fg', 'FG', before.fg, after.fg, sg, 0.0005],
    ['abv', 'ABV', before.abv, after.abv, (x) => `${n(x)} %`, 0.05],
    ['ibu', 'IBU', before.ibu, after.ibu, (x) => n(x, 0), 0.5],
    ['ebc', 'Color', before.ebc, after.ebc, (x) => `${n(x, 0)} EBC`, 0.5],
    ['bugu', 'BU:GU', before.buGu, after.buGu, (x) => n(x, 2), 0.01],
    ['att', 'Atenuación', before.attenuation, after.attenuation, (x) => `${n(x, 0)} %`, 0.5],
    ['ph', 'pH macerado', before.mashPh ?? NaN, after.mashPh ?? NaN, (x) => n(x, 2), 0.01],
    ['water', 'Agua total', before.water.totalWaterL, after.water.totalWaterL, (x) => `${n(x)} L`, 0.1],
  ];
  return rows
    .filter(([, , b, a]) => Number.isFinite(b) && Number.isFinite(a))
    .map(([key, label, b, a, format, thr]) => ({ key, label, before: b, after: a, format, significant: Math.abs(a - b) >= thr }));
}

export interface ChangeReport {
  changes: (Change & { effects: Effect[] })[];
  stats: StatDelta[];
}

/** Todo lo que implica pasar de la receta A a la B. */
export function changeReport(a: Recipe, b: Recipe, water?: WaterIons): ChangeReport {
  return {
    changes: diffRecipes(a, b).map((c) => ({ ...c, effects: consequences(c) })),
    stats: statDeltas(computeRecipeStats(a, water), computeRecipeStats(b, water)),
  };
}

