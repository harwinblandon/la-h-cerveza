import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { BUILTIN_CATALOG as C, byId } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { fermentableFromCatalog, generateFromStyle } from './recipeFactory';
import type { Recipe, RecipeFermentable } from './types';

const agua = byId(C.waters, 'armenia-epa')!;
const base = (): Recipe => generateFromStyle({ style: STYLES.find((s) => s.id === 'american-wheat')!, equipment: DEFAULT_EQUIPMENT[0], batchSizeL: 20, catalog: C });
const add = (r: Recipe, id: string, kg: number, use: RecipeFermentable['use']): Recipe => ({ ...r, fermentables: [...r.fermentables, { ...fermentableFromCatalog(byId(C.fermentables, id)!, kg), use }] });

describe('el alcohol solo sale de lo que fermenta', () => {
  it('la lactosa y la maltodextrina suben la OG y la FG, pero no el alcohol', () => {
    const r = base();
    const s0 = computeRecipeStats(r);
    for (const id of ['lactose', 'maltodextrin']) {
      const s = computeRecipeStats(add(r, id, 0.6, 'hervor'));
      expect(s.og).toBeGreaterThan(s0.og + 0.005);
      expect(s.fg).toBeGreaterThan(s0.fg + 0.005);
      expect(Math.abs(s.abv - s0.abv)).toBeLessThan(0.05);
    }
  });

  it('la fruta en maduración da densidad y dulzor, no alcohol; en fermentación sí suma alcohol', () => {
    const r = base();
    const s0 = computeRecipeStats(r);
    const aging = computeRecipeStats(add(r, 'fruta-mango', 3, 'maduracion'));
    const ferm = computeRecipeStats(add(r, 'fruta-mango', 3, 'fermentador'));
    expect(aging.og).toBeCloseTo(s0.og, 4);
    expect(aging.fg).toBeGreaterThan(s0.fg + 0.005);
    expect(Math.abs(aging.abv - s0.abv)).toBeLessThan(0.05);
    expect(ferm.abv).toBeGreaterThan(s0.abv + 0.5);
  });
});

describe('en el macerado solo se sacarifican los granos', () => {
  it('un azúcar marcado en el macerado cuenta entero, sin eficiencia, y no ocupa lugar en el macerado', () => {
    const r = base();
    const boil = computeRecipeStats(add(r, 'dextrose', 0.5, 'hervor'), agua);
    const mash = computeRecipeStats(add(r, 'dextrose', 0.5, 'macerado'), agua);
    expect(mash.og).toBeCloseTo(boil.og, 4);
    expect(mash.water.grainKg).toBeCloseTo(boil.water.grainKg, 6);
    expect(mash.water.mashWaterL).toBeCloseTo(boil.water.mashWaterL, 4);
    expect(mash.mashPh!).toBeCloseTo(boil.mashPh!, 3);
  });
});
