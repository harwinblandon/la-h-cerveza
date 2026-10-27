import type { Catalog } from '../catalog';
import { byId } from '../catalog';
import type { Fermentable, Hop, RecipeFermentable, RecipeHop, RecipeYeast, Style, Yeast } from '../types';

export interface Substitute<T> {
  item: T;
  score: number;
  reason: string;
  /** Cantidad sugerida en las unidades del ingrediente (kg, g o unidades). */
  amount: number;
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 0;
};

const GROUPS: Record<string, string> = {
  base: 'grano',
  adjunto: 'grano',
  especial: 'color',
  caramelo: 'color',
  tostada: 'tostado',
  azucar: 'azucar',
  extracto: 'grano',
  'no-fermentable': 'no-fermentable',
  acida: 'acida',
};

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Búsqueda libre: con texto se lista cualquier insumo que coincida, aunque no sea equivalente. */
const matches = (query: string | undefined, ...fields: (string | undefined)[]) =>
  !query || norm(query).split(/\s+/).every((w) => norm(fields.filter(Boolean).join(' ')).includes(w));

/** Grupo de un fermentable: grano base/adjunto, malta de color, azúcar… (para listar reemplazos posibles). */
export const fermentableGroup = (type: string) => GROUPS[type] ?? type;

/** Maltas equivalentes por tipo y color; la cantidad conserva los puntos de densidad. */
export function fermentableSubstitutes(
  f: RecipeFermentable,
  catalog: Catalog,
  available?: Set<string>,
  limit = 6,
  query?: string,
): Substitute<Fermentable>[] {
  const out: Substitute<Fermentable>[] = [];
  for (const c of catalog.fermentables) {
    if (c.id === f.ingredientId) continue;
    if (available && !available.has(c.id)) continue;
    if (!matches(query, c.name, c.maker)) continue;
    const sameType = c.type === f.type;
    const sameGroup = GROUPS[c.type] === GROUPS[f.type];
    if (!sameGroup && !query) continue;
    const colorRef = Math.max(5, f.colorEBC);
    const colorDiff = Math.abs(c.colorEBC - f.colorEBC) / colorRef;
    let score = (sameType ? 1 : sameGroup ? 0.6 : 0.2) * Math.max(0, 1 - colorDiff);
    if (score <= 0.15 && !query) continue;
    // Conservar el aporte de color cuando la sustituta es más clara/oscura (solo maltas de color).
    let amount = (f.amountKg * f.ppg) / c.ppg;
    let reason = `${c.colorEBC} EBC frente a ${f.colorEBC} EBC`;
    if (GROUPS[c.type] !== 'grano' && c.colorEBC > 0 && f.colorEBC > 0) {
      const colorAmount = (f.amountKg * f.colorEBC) / c.colorEBC;
      if (colorAmount / amount < 1.5 && colorAmount / amount > 0.66) {
        amount = colorAmount;
        reason += '; cantidad ajustada para conservar el color';
      } else {
        score *= 0.8;
      }
    }
    out.push({ item: c, score, reason, amount: Math.round(amount * 1000) / 1000 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Lúpulos sustitutos: lista explícita + similitud de aromas. Los de amargor conservan IBU. */
export function hopSubstitutes(h: RecipeHop, catalog: Catalog, available?: Set<string>, limit = 6, query?: string): Substitute<Hop>[] {
  const ref = byId(catalog.hops, h.ingredientId) ?? catalog.hops.find((x) => x.name === h.name);
  const isBittering = (h.use === 'hervor' && h.time >= 30) || h.use === 'primer-mosto';
  const out: Substitute<Hop>[] = [];
  for (const c of catalog.hops) {
    if (c.id === ref?.id) continue;
    if (available && !available.has(c.id)) continue;
    if (!matches(query, c.name, c.origin)) continue;
    const explicit = ref?.substitutes?.includes(c.id) ? 0.5 : 0;
    const aroma = ref ? jaccard(ref.aroma, c.aroma) : 0;
    const origin = ref && ref.origin === c.origin ? 0.1 : 0;
    let score = explicit + aroma * 0.6 + origin;
    if (isBittering) {
      // Para amargor importa poco el aroma: alfa alto y limpio.
      score = 0.4 + (c.purpose !== 'aroma' ? 0.3 : 0) + (c.aroma.includes('neutro') ? 0.2 : 0) + explicit * 0.4;
    }
    if (score < 0.25 && !query) continue;
    const amount = isBittering ? (h.amountG * h.alpha) / c.alpha : h.amountG;
    const shared = ref ? c.aroma.filter((a) => ref.aroma.includes(a)) : [];
    const reason = isBittering
      ? `Amargor equivalente con ${c.alpha} % AA`
      : explicit
        ? `Sustituto clásico${shared.length ? `; comparte: ${shared.join(', ')}` : ''}`
        : `Comparte: ${shared.join(', ') || 'perfil similar'}`;
    out.push({ item: c, score, reason, amount: Math.round(amount) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Levaduras equivalentes: misma familia, luego mismo tipo con atenuación y temperatura parecidas. */
export function yeastSubstitutes(
  y: Pick<RecipeYeast, 'ingredientId' | 'type' | 'attenuation' | 'tempRange' | 'family'>,
  catalog: Catalog,
  style?: Style,
  available?: Set<string>,
  limit = 6,
  query?: string,
): Substitute<Yeast>[] {
  const out: Substitute<Yeast>[] = [];
  for (const c of catalog.yeasts) {
    if (c.id === y.ingredientId) continue;
    if (available && !available.has(c.id)) continue;
    if (!matches(query, c.name, c.lab, c.code)) continue;
    const sameFamily = y.family && c.family === y.family;
    const inStyle = style?.guide.yeastFamilies.includes(c.family);
    const attDiff = Math.abs(c.attenuation - y.attenuation) / 10;
    const tempMid = (r: [number, number]) => (r[0] + r[1]) / 2;
    const tempDiff = Math.abs(tempMid(c.tempRange) - tempMid(y.tempRange)) / 10;
    let score = (sameFamily ? 0.6 : c.type === y.type ? 0.3 : 0) + (inStyle ? 0.3 : 0) - attDiff * 0.2 - tempDiff * 0.2;
    if (c.form === 'seca') score += 0.05;
    if (score < 0.2 && !query) continue;
    const reason = [
      sameFamily ? 'Misma familia de cepa' : c.type === y.type ? 'Mismo tipo' : 'Recomendada para el estilo',
      `atenuación ${c.attenuation} %`,
      `${c.tempRange[0]}–${c.tempRange[1]} °C`,
    ].join(' · ');
    out.push({ item: c, score, reason, amount: 1 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Levaduras recomendadas para un estilo, ordenadas por la familia preferida. */
export function yeastsForStyle(style: Style, catalog: Catalog, limit = 8): Yeast[] {
  const rank = (y: Yeast) => {
    const i = style.guide.yeastFamilies.indexOf(y.family);
    return i < 0 ? 99 : i * 2 + (y.form === 'seca' ? 0 : 1);
  };
  return catalog.yeasts
    .filter((y) => style.guide.yeastFamilies.includes(y.family))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

/** Lúpulos que encajan con el estilo por origen y aromas. */
export function hopsForStyle(style: Style, catalog: Catalog, limit = 10): Hop[] {
  const aroma = style.guide.hopAroma ?? [];
  return catalog.hops
    .map((h) => ({
      h,
      s: (style.guide.hopOrigins.includes(h.origin) ? 1 : 0) + (aroma.length ? jaccard(aroma, h.aroma) : 0),
    }))
    .filter((x) => x.s > 0.5)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.h);
}
