import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { PRICES, type PriceList } from '../data/precios';
import { BUILTIN_CATALOG as C, brandEquivalent, byId } from './catalog';
import { allPrices, recipeCost } from './cost';
import { fermentableFromCatalog, hopFromCatalog, newRecipe, yeastFromCatalog } from './recipeFactory';
import type { InventoryItem, Recipe } from './types';

const base = (): Recipe => ({ ...newRecipe(DEFAULT_EQUIPMENT[0]), batchSizeL: 20 });

// Lista privada de ejemplo, con la forma de la de Distrines (precio por kg por tramos, paquetes y sobres).
const lista: PriceList = {
  store: 'Tienda privada',
  asOf: '2026-10-26',
  source: 'lista de prueba',
  prices: [
    { store: '', kind: 'malta', name: 'Pilsen', ingredientId: 'best-pilsen', qty: 1, unit: 'kg', price: 8000, minQty: 1, maxQty: 24 },
    { store: '', kind: 'malta', name: 'Pilsen', ingredientId: 'best-pilsen', qty: 1, unit: 'kg', price: 7500, minQty: 25, maxQty: 499 },
    { store: '', kind: 'lupulo', name: 'Citra', ingredientId: 'citra', qty: 100, unit: 'g', price: 20000 },
    { store: '', kind: 'levadura', name: 'US-05', ingredientId: 'us-05', qty: 1, unit: 'unidad', price: 15000 },
  ],
};
const precios = allPrices([lista]);

describe('precios de las tiendas', () => {
  it('los precios públicos no incluyen listas privadas', () => {
    expect(PRICES.some((p) => p.store === 'Distrines')).toBe(false);
    expect(precios.filter((p) => p.store === 'Tienda privada')).toHaveLength(4);
  });

  it('las maltas de The Craft Drinks Lab entran al catálogo con su marca', () => {
    const swaen = C.fermentables.filter((f) => f.maker === 'The Swaen');
    expect(swaen.length).toBeGreaterThan(10);
    expect(byId(C.fermentables, 'swaen-pilsner')?.colorEBC).toBeCloseTo(3.75, 1);
  });
});

describe('costo de una receta', () => {
  it('malta por kilo, lúpulo por paquete y levadura por sobre', () => {
    const r = base();
    r.fermentables = [fermentableFromCatalog(byId(C.fermentables, 'best-pilsen')!, 4.5)];
    r.hops = [hopFromCatalog(byId(C.hops, 'citra')!, 30, 'hervor', 60)];
    r.yeasts = [yeastFromCatalog(byId(C.yeasts, 'us-05')!, 2)];
    const c = recipeCost(r, [], precios, [lista]);
    const malt = c.lines.find((l) => l.kind === 'malta')!;
    expect(malt.chosen?.store).toBe('Tienda privada');
    expect(malt.usedCost).toBeCloseTo(4.5 * 8000);
    expect(malt.buyTotal).toBe(5 * 8000);
    const hop = c.lines.find((l) => l.kind === 'lupulo')!;
    expect(hop.buyTotal).toBeGreaterThan(0);
    expect(hop.usedCost).toBeLessThan(hop.buyTotal);
    expect(c.lines.find((l) => l.kind === 'levadura')!.usedCost).toBe(2 * 15000);
    expect(c.perLiter).toBeCloseTo(c.used / 20);
  });

  it('lo que pagaste (inventario) manda sobre la tienda', () => {
    const r = base();
    r.fermentables = [fermentableFromCatalog(byId(C.fermentables, 'best-pilsen')!, 4)];
    const inv: InventoryItem[] = [{ id: 'i1', kind: 'fermentable', ingredientId: 'best-pilsen', name: 'Pilsen', amount: 25, unit: 'kg', costCOP: 6000 }];
    const l = recipeCost(r, inv, precios).lines[0];
    expect(l.fromInventory?.cost).toBe(24000);
    expect(l.buyTotal).toBe(0);
  });

  it('lo que ninguna tienda lista se puede anotar a mano', () => {
    const r = base();
    r.water = { ...r.water, mashSalts: { cloruroCalcio: 3 } };
    expect(recipeCost(r).missing).toContain('Cloruro de calcio');
    r.costPrefs = { manual: { 'sal-cloruroCalcio': 500 } };
    const c = recipeCost(r);
    expect(c.missing).toHaveLength(0);
    expect(c.used).toBe(500);
  });

  it('suma los otros costos del lote', () => {
    const r = base();
    r.costPrefs = { extras: [{ uid: 'a', name: 'Gas', amount: 8000 }] };
    expect(recipeCost(r).used).toBe(8000);
  });
});

describe('Agrária (Pronalce)', () => {
  it('se puede elegir como marca y tiene precio por saco', () => {
    expect(brandEquivalent(byId(C.fermentables, 'pilsner-wey')!, C, ['Agrária']).id).toBe('agraria-pilsen');
    expect(brandEquivalent(byId(C.fermentables, 'munich-1-wey')!, C, ['Agrária']).id).toBe('agraria-munique');
    const r = base();
    r.fermentables = [fermentableFromCatalog(byId(C.fermentables, 'agraria-pilsen')!, 4)];
    const l = recipeCost(r).lines[0];
    expect(l.chosen?.store).toBe('Pronalce');
    expect(l.buyTotal).toBe(125000);
    expect(l.usedCost).toBeCloseTo((125000 * 4) / 25);
  });
});
