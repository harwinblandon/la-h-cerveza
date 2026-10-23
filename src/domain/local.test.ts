import { describe, expect, it } from 'vitest';
import { DISTRINES } from '../data/distrines';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { BUILTIN_CATALOG, byId, soldAt } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { generateFromStyle } from './recipeFactory';
import { analyzeRecipe } from './suggest/analysis';
import type { SaltId } from './types';
import { optimizeSalts } from './waterOptimizer';

const C = BUILTIN_CATALOG;
const eq = DEFAULT_EQUIPMENT[0];
const armenia = byId(C.waters, 'armenia-epa')!;
const ALL: SaltId[] = ['yeso', 'cloruroCalcio', 'epsom', 'sal', 'bicarbonato'];
const SIN_CACL2: SaltId[] = ['yeso', 'epsom', 'sal', 'bicarbonato'];

describe('agua de Armenia (EPA)', () => {
  it('es blanda y con poco calcio', () => {
    expect(armenia.ca).toBeLessThan(10);
    expect(armenia.mg).toBeGreaterThan(armenia.ca);
    expect(armenia.sourceNote).toMatch(/EPA/);
  });

  it('el optimizador solo usa las sales disponibles', () => {
    const target = byId(C.waters, 'obj-neipa')!;
    const conTodo = optimizeSalts(armenia, target, 30, ALL);
    const sinCaCl2 = optimizeSalts(armenia, target, 30, SIN_CACL2);
    expect(conTodo.cloruroCalcio).toBeGreaterThan(0);
    expect(sinCaCl2.cloruroCalcio).toBeUndefined();
    // Sin cloruro de calcio, el cloruro tiene que venir de otra sal (sal de mesa).
    expect(sinCaCl2.sal ?? 0).toBeGreaterThan(0);
  });
});

describe('recetas con insumos de Distrines y agua de Armenia', () => {
  for (const [label, salts] of [
    ['todas las sales', ALL],
    ['sin cloruro de calcio', SIN_CACL2],
  ] as const) {
    it(`los 69 estilos siguen dentro del estilo (${label})`, () => {
      const problems: string[] = [];
      let fromStore = 0;
      let total = 0;
      for (const style of STYLES) {
        const r = generateFromStyle({ style, equipment: eq, catalog: C, store: DISTRINES, availableSalts: [...salts], sourceWater: { id: armenia.id, ions: armenia } });
        const s = computeRecipeStats(r, armenia);
        const R = style.ranges;
        const inside = (v: number, [lo, hi]: [number, number], tol: number) => v >= lo - tol && v <= hi + tol;
        if (!inside(s.og, R.og, 0.002) || !inside(s.ibu, R.ibu, 3) || !inside(s.srm, R.srm, 0.6)) problems.push(`${style.code} fuera de rango`);
        if (s.mashPh! < 5.15 || s.mashPh! > 5.65) problems.push(`${style.code} pH ${s.mashPh!.toFixed(2)}`);
        if (salts === SIN_CACL2 && (r.water.mashSalts.cloruroCalcio || r.water.spargeSalts.cloruroCalcio)) problems.push(`${style.code} usó cloruro de calcio`);
        const own = analyzeRecipe({ recipe: r, stats: s, style, catalog: C, sourceWater: armenia, targetWater: byId(C.waters, style.guide.waterProfileId) })
          .filter((x) => x.severity !== 'idea' && ['malta', 'color', 'densidad', 'amargor', 'levadura'].includes(x.area));
        for (const o of own) problems.push(`${style.code}: ${o.title}`);
        for (const f of r.fermentables) {
          total++;
          if (soldAt(byId(C.fermentables, f.ingredientId), DISTRINES)) fromStore++;
        }
      }
      expect(problems).toEqual([]);
      // La gran mayoría de las maltas deben ser de la tienda.
      expect(fromStore / total).toBeGreaterThan(0.85);
    });
  }

  it('el agua de Armenia recibe calcio en todas las recetas', () => {
    for (const style of STYLES) {
      const r = generateFromStyle({ style, equipment: eq, catalog: C, store: DISTRINES, sourceWater: { id: armenia.id, ions: armenia } });
      const s = computeRecipeStats(r, armenia);
      expect(s.kettleWater!.ca, style.code).toBeGreaterThan(20);
    }
  });
});

describe('lúpulo con el % AA real de la bolsa', () => {
  it('ajusta los gramos para conservar los IBU del estilo', () => {
    const style = STYLES.find((s) => s.id === 'american-pale-ale')!;
    const normal = generateFromStyle({ style, equipment: eq, catalog: C });
    const real = generateFromStyle({ style, equipment: eq, catalog: C, alphaOverrides: { magnum: 10.2 } });
    const a = computeRecipeStats(normal);
    const b = computeRecipeStats(real);
    const ga = normal.hops.find((h) => h.ingredientId === 'magnum')!;
    const gb = real.hops.find((h) => h.ingredientId === 'magnum')!;
    expect(gb.alpha).toBe(10.2);
    expect(gb.source).toBe('inventario');
    expect(gb.amountG).toBeGreaterThan(ga.amountG);
    expect(Math.abs(a.ibu - b.ibu)).toBeLessThan(1.5);
  });
});
