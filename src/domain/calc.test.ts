import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { BUILTIN_CATALOG, byId } from './catalog';
import { hopIbu, tinsethUtilization } from './calc/bitterness';
import { abv, computeGravity } from './calc/gravity';
import { computeRecipeStats } from './calc/recipeStats';
import { hydrometerCorrection, kegPsi, primingSugarGrams, refractometerFg } from './calc/tools';
import { platoToSg, sgToPlato } from './calc/units';
import { strikeTemp } from './calc/volumes';
import { generateFromStyle, scaleRecipe } from './recipeFactory';
import { analyzeRecipe } from './suggest/analysis';
import { hopSubstitutes } from './suggest/substitutes';
import type { RecipeFermentable } from './types';

const biab = DEFAULT_EQUIPMENT[0];

describe('fórmulas básicas', () => {
  it('Tinseth a 1.050 y 60 min ≈ 0,231', () => {
    expect(tinsethUtilization(1.05, 60)).toBeCloseTo(0.2307, 3);
  });

  it('IBU: 28 g al 10 % en 20 L, 60 min ≈ 32', () => {
    const ibu = hopIbu({ uid: 'x', name: 'x', alpha: 10, form: 'pellet', amountG: 28, use: 'hervor', time: 60 }, 1.05, 20, 60);
    expect(ibu).toBeCloseTo(32.3, 0);
  });

  it('OG: 5 kg de malta (37 PPG) al 70 % en 20 L ≈ 1.054', () => {
    const f: RecipeFermentable = { uid: 'a', name: 'Pale', type: 'base', colorEBC: 6, ppg: 37, amountKg: 5, use: 'macerado' };
    const g = computeGravity([f], 70, 20, 22, 26, 4);
    expect(g.og).toBeCloseTo(1.054, 3);
  });

  it('ABV de 1.050 a 1.010 ≈ 5,3 %', () => {
    expect(abv(1.05, 1.01)).toBeCloseTo(5.3, 1);
  });

  it('Plato y SG son inversas', () => {
    expect(sgToPlato(1.048)).toBeCloseTo(11.9, 1);
    expect(platoToSg(12)).toBeCloseTo(1.0484, 3);
  });

  it('temperatura de empaste', () => {
    expect(strikeTemp(66, 20, 3)).toBeCloseTo(72.3, 1);
  });

  it('priming: 2,5 vol, 20 °C, 20 L de sacarosa ≈ 125 g', () => {
    expect(primingSugarGrams(2.5, 20, 20, 'sacarosa')).toBeCloseTo(125, -1);
  });

  it('barril: 2,5 vol a 4 °C ≈ 12 PSI', () => {
    expect(kegPsi(2.5, 4)).toBeGreaterThan(11);
    expect(kegPsi(2.5, 4)).toBeLessThan(13);
  });

  it('refractómetro durante fermentación', () => {
    expect(refractometerFg(12, 6)).toBeCloseTo(1.011, 2);
  });

  it('corrección del densímetro: 1.050 leído a 30 °C ≈ 1.053', () => {
    expect(hydrometerCorrection(1.05, 30, 20)).toBeCloseTo(1.0526, 3);
  });
});

describe('catálogo', () => {
  it('todos los ingredientes de las guías de estilo existen', () => {
    for (const s of STYLES) {
      for (const g of s.guide.grains) expect(byId(BUILTIN_CATALOG.fermentables, g.ingredientId), `${s.id}: ${g.ingredientId}`).toBeTruthy();
      for (const h of s.guide.hops) expect(byId(BUILTIN_CATALOG.hops, h.ingredientId), `${s.id}: ${h.ingredientId}`).toBeTruthy();
      expect(byId(BUILTIN_CATALOG.waters, s.guide.waterProfileId), `${s.id}: agua`).toBeTruthy();
      expect(BUILTIN_CATALOG.yeasts.some((y) => s.guide.yeastFamilies.includes(y.family)), `${s.id}: levadura`).toBe(true);
      const pct = s.guide.grains.reduce((a, g) => a + g.pct, 0);
      expect(pct, `${s.id}: suma de %`).toBe(100);
    }
  });
});

describe('generador de recetas por estilo', () => {
  const source = byId(BUILTIN_CATALOG.waters, 'destilada')!;
  for (const style of STYLES) {
    it(`${style.code} ${style.name} queda dentro del estilo`, () => {
      const r = generateFromStyle({ style, equipment: biab, catalog: BUILTIN_CATALOG, sourceWater: { id: source.id, ions: source } });
      const s = computeRecipeStats(r, source);
      const R = style.ranges;
      expect(s.og, 'OG').toBeGreaterThanOrEqual(R.og[0] - 0.002);
      expect(s.og, 'OG').toBeLessThanOrEqual(R.og[1] + 0.002);
      expect(s.ibu, 'IBU').toBeGreaterThanOrEqual(R.ibu[0] - 3);
      expect(s.ibu, 'IBU').toBeLessThanOrEqual(R.ibu[1] + 3);
      expect(s.srm, 'SRM').toBeGreaterThanOrEqual(R.srm[0] - 0.6);
      expect(s.srm, 'SRM').toBeLessThanOrEqual(R.srm[1] + 0.6);
      expect(r.yeasts.length).toBe(1);
      expect(s.mashPh!, 'pH').toBeGreaterThan(5.1);
      expect(s.mashPh!, 'pH').toBeLessThan(5.7);
      // La receta generada no debe disparar avisos de su propio asistente.
      const own = analyzeRecipe({ recipe: r, stats: s, style, catalog: BUILTIN_CATALOG, sourceWater: source, targetWater: byId(BUILTIN_CATALOG.waters, style.guide.waterProfileId) })
        .filter((x) => x.severity !== 'idea' && ['malta', 'color', 'densidad', 'amargor', 'levadura'].includes(x.area))
        .map((x) => `${x.title}: ${x.detail}`);
      expect(own, 'avisos propios').toEqual([]);
    });
  }
});

describe('escalado y sugerencias', () => {
  it('escalar conserva OG e IBU', () => {
    const style = STYLES.find((s) => s.id === 'american-ipa')!;
    const r = generateFromStyle({ style, equipment: biab, catalog: BUILTIN_CATALOG });
    const before = computeRecipeStats(r);
    const scaled = scaleRecipe(r, 40, DEFAULT_EQUIPMENT[3]);
    const after = computeRecipeStats(scaled);
    expect(after.og).toBeCloseTo(before.og, 2);
    expect(Math.abs(after.ibu - before.ibu)).toBeLessThan(2);
  });

  it('detecta OG baja y la corrige', () => {
    const style = STYLES.find((s) => s.id === 'american-pale-ale')!;
    const r = generateFromStyle({ style, equipment: biab, catalog: BUILTIN_CATALOG });
    const weak = { ...r, fermentables: r.fermentables.map((f) => ({ ...f, amountKg: f.amountKg * 0.7 })) };
    const stats = computeRecipeStats(weak);
    const sugs = analyzeRecipe({ recipe: weak, stats, style, catalog: BUILTIN_CATALOG });
    const og = sugs.find((x) => x.area === 'densidad' && x.actions?.length);
    expect(og).toBeTruthy();
    const fixed = og!.actions![0].apply(weak);
    const s2 = computeRecipeStats(fixed);
    expect(s2.og).toBeGreaterThanOrEqual(style.ranges.og[0]);
  });

  it('sustituto de Citra incluye Galaxy o Mosaic', () => {
    const subs = hopSubstitutes({ uid: 'x', ingredientId: 'citra', name: 'Citra', alpha: 12.5, form: 'pellet', amountG: 50, use: 'dry-hop', time: 3 }, BUILTIN_CATALOG);
    expect(subs.slice(0, 3).some((s) => s.item.id === 'galaxy' || s.item.id === 'mosaic')).toBe(true);
  });
});
