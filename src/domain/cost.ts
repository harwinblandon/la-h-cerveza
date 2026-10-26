// Presupuesto de una receta: lo que cuesta lo que usa y lo que hay que comprar,
// con los precios de las tiendas o lo que el cervecero pagó (inventario).

import { DISTRINES_EQUIVALENTS } from '../data/distrines';
import { PRICES, PRICE_SOURCES, type PriceList, type PricePoint } from '../data/precios';
import { SALTS, acidMl, recipeAcid } from './calc/water';
import type { InventoryItem, Recipe, SaltId } from './types';

export type CostKind = 'malta' | 'lupulo' | 'levadura' | 'sal' | 'otro';
type Unit = PricePoint['unit'];

export interface PackChoice {
  label: string;
  count: number;
  price: number;
}

export interface CostOption {
  store: string;
  /** Total a pagar en esa tienda por lo que hay que comprar. */
  buyTotal: number;
  /** Parte de esa compra que se usa en la receta. */
  usedCost: number;
  packs: PackChoice[];
  outOfStock?: boolean;
  url?: string;
  /** Se cotizó un equivalente en la tienda (nombre del producto). */
  equivalent?: string;
}

export interface CostLine {
  uid: string;
  kind: CostKind;
  name: string;
  needed: number;
  unit: Unit;
  /** Cubierto por el inventario (con el precio que pagaste). */
  fromInventory?: { qty: number; cost: number };
  options: CostOption[];
  chosen?: CostOption;
  /** Costo anotado a mano por el cervecero (cuando ninguna tienda lo lista). */
  manual?: number;
  usedCost: number;
  buyTotal: number;
  missingPrice: boolean;
}

export interface RecipeCost {
  lines: CostLine[];
  extras: number;
  /** Costo de lo que usa la receta (más los costos adicionales). */
  used: number;
  /** Lo que hay que pagar en tiendas (más los adicionales). */
  buy: number;
  perLiter: number;
  per330: number;
  missing: string[];
  sources: { store: string; asOf: string; source: string }[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Precios de un insumo por id; para azúcares y otros, por nombre. */
function candidates(ingredientId: string | undefined, name: string, prices: PricePoint[]): PricePoint[] {
  if (ingredientId) {
    const byIdHit = prices.filter((p) => p.ingredientId === ingredientId);
    if (byIdHit.length) return byIdHit;
  }
  const n = norm(name);
  const rules: [RegExp, RegExp][] = [
    [/dextrosa|glucosa|azucar de maiz/, /dextrosa|cerelose/],
    [/candi.*(clar|blanc)|candi clara/, /candi clara/],
    [/candi.*(oscur|dark)/, /candi oscura/],
    [/maltodextrin/, /maltodextrina/],
    [/whirlfloc|protafloc|compac/, /whirlfloc/],
    [/servomyces/, /servomyces/],
    [/nutriente/, /nutriente/],
    [/nibs de cacao|cacao/, /nibs de cacao/],
    [/coco/, /chips de coco/],
    [/roble/, /roble/],
    [/cilantro|coriandro/, /cilantro/],
    [/naranja.*amarga/, /naranja amarga/],
    [/naranja/, /naranja dulce/],
    [/fermcap|antiespumante/, /fermcap/],
  ];
  for (const [mine, theirs] of rules) if (mine.test(n)) return prices.filter((p) => p.kind === 'otro' && theirs.test(norm(p.name)));
  return [];
}

/** Lo más barato para cubrir `need` en una tienda (paquetes enteros o precio por kilo). */
function bestBuy(need: number, unit: Unit, list: PricePoint[]): Omit<CostOption, 'store'> | undefined {
  const usable = list.filter((p) => p.unit === unit && (p.minQty === undefined || need >= p.minQty || p.qty === 1));
  if (!usable.length) return undefined;
  const outOfStock = usable.every((p) => p.inStock === false);
  const stocked = usable.filter((p) => p.inStock !== false);
  const pool = stocked.length ? stocked : usable;
  // Precio por kilo con tramos (Distrines): se compra por kilos enteros.
  const tiered = pool.filter((p) => p.unit === 'kg' && p.qty === 1 && p.minQty !== undefined);
  let best: Omit<CostOption, 'store'> | undefined;
  if (tiered.length) {
    const kg = Math.max(1, Math.ceil(need - 1e-9));
    const tier = tiered.filter((p) => kg >= (p.minQty ?? 1) && (p.maxQty === undefined || kg <= p.maxQty)).sort((a, b) => a.price - b.price)[0] ?? tiered.sort((a, b) => a.price - b.price)[0];
    best = { buyTotal: kg * tier.price, usedCost: need * tier.price, packs: [{ label: 'kg', count: kg, price: tier.price }], url: tier.url };
  }
  // Paquetes: se prueban combinaciones de hasta dos tamaños.
  const packs = pool.filter((p) => !(p.unit === 'kg' && p.qty === 1 && p.minQty !== undefined));
  for (let i = 0; i < packs.length; i++) {
    for (let j = i; j < packs.length; j++) {
      const a = packs[i];
      const b = packs[j];
      const maxA = Math.ceil(need / a.qty);
      for (let na = 0; na <= maxA; na++) {
        const rest = need - na * a.qty;
        const nb = i === j ? 0 : Math.max(0, Math.ceil(rest / b.qty - 1e-9));
        if (na * a.qty + nb * b.qty + 1e-9 < need) continue;
        if (na + nb === 0) continue;
        const total = na * a.price + nb * b.price;
        if (!best || total < best.buyTotal) {
          const bought = na * a.qty + nb * b.qty;
          const chosen: PackChoice[] = [];
          if (na) chosen.push({ label: packLabel(a), count: na, price: a.price });
          if (nb) chosen.push({ label: packLabel(b), count: nb, price: b.price });
          best = { buyTotal: total, usedCost: (total * need) / bought, packs: chosen, url: a.url };
        }
      }
    }
  }
  return best && { ...best, outOfStock };
}

function packLabel(p: PricePoint): string {
  if (p.unit === 'unidad') return p.note ?? 'unidad';
  if (p.unit === 'g') return p.qty >= 1000 ? `${p.qty / 1000} kg` : `${p.qty} g`;
  if (p.unit === 'kg') return `${p.qty} kg`;
  return p.qty >= 1000 ? `${p.qty / 1000} L` : `${p.qty} mL`;
}

/** Precio que pagó el cervecero según su inventario: $/kg en maltas, $/100 g en lúpulos, $/unidad en el resto. */
function inventoryPrice(kind: CostKind, unit: Unit, item: InventoryItem): number | undefined {
  if (!item.costCOP || item.costCOP <= 0) return undefined;
  if (kind === 'malta' && unit === 'kg') return item.costCOP;
  if (kind === 'lupulo' && unit === 'g') return item.costCOP / 100;
  return item.costCOP;
}

interface Need {
  uid: string;
  kind: CostKind;
  name: string;
  ingredientId?: string;
  needed: number;
  unit: Unit;
}

function needsOf(r: Recipe): Need[] {
  const out: Need[] = [];
  for (const f of r.fermentables) {
    const sugar = f.type === 'azucar' || f.type === 'no-fermentable';
    out.push({ uid: f.uid, kind: sugar ? 'otro' : 'malta', name: f.name, ingredientId: f.ingredientId, needed: sugar ? f.amountKg * 1000 : f.amountKg, unit: sugar ? 'g' : 'kg' });
  }
  for (const h of r.hops) {
    const prev = out.find((x) => x.kind === 'lupulo' && x.ingredientId && x.ingredientId === h.ingredientId);
    if (prev) prev.needed += h.amountG;
    else out.push({ uid: h.uid, kind: 'lupulo', name: h.name, ingredientId: h.ingredientId, needed: h.amountG, unit: 'g' });
  }
  for (const y of r.yeasts) out.push({ uid: y.uid, kind: 'levadura', name: y.name, ingredientId: y.ingredientId, needed: y.amount, unit: 'unidad' });
  const salts: Partial<Record<SaltId, number>> = {};
  for (const where of ['mashSalts', 'spargeSalts'] as const) for (const [k, g] of Object.entries(r.water[where])) salts[k as SaltId] = (salts[k as SaltId] ?? 0) + (g ?? 0);
  for (const s of SALTS) {
    const g = salts[s.id] ?? 0;
    if (g >= 0.05) out.push({ uid: `sal-${s.id}`, kind: 'sal', name: s.name, ingredientId: s.id, needed: g, unit: 'g' });
  }
  const ml = acidMl(r.water);
  if (ml > 0) {
    const a = recipeAcid(r.water);
    out.push({ uid: 'acido', kind: 'otro', name: `Ácido ${a.type === 'fosforico' ? 'fosfórico' : 'láctico'} ${a.pct} %`, needed: ml, unit: 'ml' });
  }
  for (const m of r.miscs) {
    if (m.amount <= 0) continue;
    out.push({ uid: m.uid, kind: 'otro', name: m.name, needed: m.amount, unit: m.unit === 'ml' ? 'ml' : m.unit === 'g' ? 'g' : 'unidad' });
  }
  return out;
}

/** Precios públicos más las listas privadas del cervecero. */
export function allPrices(lists: PriceList[] = []): PricePoint[] {
  return [...PRICES, ...lists.flatMap((l) => l.prices.map((p) => ({ ...p, store: l.store })))];
}

export function recipeCost(r: Recipe, inventory: InventoryItem[] = [], prices: PricePoint[] = PRICES, lists: PriceList[] = []): RecipeCost {
  const sourceOf = (store: string) => PRICE_SOURCES[store] ?? lists.find((l) => l.store === store);
  const choice = r.costPrefs?.lines ?? {};
  const lines: CostLine[] = needsOf(r).map((n) => {
    const inv = inventory.find((i) => (n.ingredientId && i.ingredientId === n.ingredientId) || (!n.ingredientId && norm(i.name) === norm(n.name)));
    const invPrice = inv && inventoryPrice(n.kind, n.unit, inv);
    let need = n.needed;
    let fromInventory: CostLine['fromInventory'];
    if (inv && invPrice !== undefined) {
      const invQty = Math.min(need, inv.unit === n.unit ? inv.amount : n.unit === 'g' && inv.unit === 'kg' ? inv.amount * 1000 : inv.amount);
      if (invQty > 0) {
        fromInventory = { qty: invQty, cost: invQty * invPrice };
        need -= invQty;
      }
    }
    let cands = candidates(n.ingredientId, n.name, prices);
    let equivalent: string | undefined;
    // Malta genérica sin precio: se cotiza su equivalente en tienda.
    if (!cands.length && n.kind === 'malta' && n.ingredientId && DISTRINES_EQUIVALENTS[n.ingredientId]) {
      cands = candidates(DISTRINES_EQUIVALENTS[n.ingredientId], '', prices);
      equivalent = cands[0]?.name;
    }
    const stores = [...new Set(cands.map((c) => c.store))];
    const options: CostOption[] =
      need > 1e-9
        ? stores
            .map((store) => {
              const list = cands.filter((c) => c.store === store);
              let b = bestBuy(need, n.unit, list);
              // Levadura que solo se vende a granel: sobres de 11,5 g convertidos a gramos.
              if (!b && n.kind === 'levadura' && n.unit === 'unidad') b = bestBuy(need * 11.5, 'g', list);
              return b ? { store, ...b, ...(equivalent ? { equivalent } : {}) } : undefined;
            })
            .filter((x): x is CostOption => !!x)
            .sort((a, b) => a.buyTotal - b.buyTotal)
        : [];
    const manual = r.costPrefs?.manual?.[n.uid];
    const chosen = need > 1e-9 && manual === undefined ? options.find((o) => o.store === choice[n.uid]) ?? options[0] : undefined;
    const usedCost = (fromInventory?.cost ?? 0) + (chosen?.usedCost ?? 0) + (manual ?? 0);
    const missingPrice = need > 1e-9 && !chosen && manual === undefined;
    return { uid: n.uid, kind: n.kind, name: n.name, needed: n.needed, unit: n.unit, fromInventory, options, chosen, manual, usedCost, buyTotal: (chosen?.buyTotal ?? 0) + (manual ?? 0), missingPrice };
  });
  const extras = (r.costPrefs?.extras ?? []).reduce((s, e) => s + (e.amount || 0), 0);
  const used = lines.reduce((s, l) => s + l.usedCost, 0) + extras;
  const buy = lines.reduce((s, l) => s + l.buyTotal, 0) + extras;
  const liters = r.batchSizeL > 0 ? r.batchSizeL : 1;
  const usedStores = new Set(lines.map((l) => l.chosen?.store).filter(Boolean) as string[]);
  return {
    lines,
    extras,
    used,
    buy,
    perLiter: used / liters,
    per330: (used / liters) * 0.33,
    missing: lines.filter((l) => l.missingPrice).map((l) => l.name),
    sources: [...usedStores].map((store) => ({ store, asOf: sourceOf(store)?.asOf ?? '', source: sourceOf(store)?.source ?? '' })),
  };
}
