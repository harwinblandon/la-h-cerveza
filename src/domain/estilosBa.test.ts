import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { BA_STYLES } from '../data/stylesBa';
import { exportBeerXml, importBeerXml } from './beerxml';
import { BUILTIN_CATALOG as C, byId } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { generateFromStyle } from './recipeFactory';

const ba = (id: string) => byId(C.styles, id)!;

describe('guía de estilos Brewers Association 2026', () => {
  it('trae todos los estilos de la guía, con ids únicos', () => {
    expect(BA_STYLES).toHaveLength(169);
    expect(new Set(C.styles.map((s) => s.id)).size).toBe(C.styles.length);
    expect(BA_STYLES.every((s) => s.guideline === 'ba' && s.baseStyleId && s.ranges.og[0] < s.ranges.og[1])).toBe(true);
  });

  it('usa los rangos de la guía BA, no los del BJCP', () => {
    const wc = ba('ba-west-coast-ipa');
    expect(wc.ranges.og).toEqual([1.055, 1.07]);
    expect(wc.ranges.ibu).toEqual([50, 75]);
    expect(wc.ranges.srm).toEqual([2, 6]);
    expect(wc.openRanges).toBeUndefined();
  });

  it('marca como abiertos los rangos que la guía no fija', () => {
    const coffee = ba('ba-coffee-beer');
    expect(coffee.openRanges).toEqual(['og', 'fg', 'ibu', 'srm', 'abv']);
    expect(coffee.ranges).toEqual(ba(coffee.baseStyleId!).ranges);
    expect(ba('ba-eisbock').openRanges).toEqual(['fg']);
  });

  it('genera una receta dentro del rango de OG del estilo BA', () => {
    const style = ba('ba-west-coast-ipa');
    const r = generateFromStyle({ style, equipment: DEFAULT_EQUIPMENT[0], batchSizeL: 20, catalog: C });
    const s = computeRecipeStats(r);
    expect(r.styleId).toBe('ba-west-coast-ipa');
    expect(s.og).toBeGreaterThanOrEqual(style.ranges.og[0] - 0.002);
    expect(s.og).toBeLessThanOrEqual(style.ranges.og[1] + 0.002);
  });

  it('BeerXML conserva la guía BA al exportar e importar', () => {
    const r = generateFromStyle({ style: ba('ba-hazy-ipa'), equipment: DEFAULT_EQUIPMENT[0], batchSizeL: 20, catalog: C });
    const xml = exportBeerXml([r], C);
    expect(xml).toContain('<STYLE_GUIDE>Brewers Association 2026</STYLE_GUIDE>');
    const back = importBeerXml(xml, C, DEFAULT_EQUIPMENT[0]);
    expect(back.recipes[0].styleId).toBe('ba-hazy-ipa');
  });
});
