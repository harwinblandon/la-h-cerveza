import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { batchTimeline, brewDaySteps, createBatch, plannedVsActual } from './batch';
import { exportBeerXml, importBeerXml, parseXml } from './beerxml';
import { BUILTIN_CATALOG } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { fermentableFromCatalog, generateFromStyle } from './recipeFactory';
import type { Recipe } from './types';
import { changeReport, contentKey, hasUnversionedChanges, makeVersion } from './versioning';

const eq = DEFAULT_EQUIPMENT[0];
const gen = (id: string) => generateFromStyle({ style: STYLES.find((s) => s.id === id)!, equipment: eq, catalog: BUILTIN_CATALOG });

describe('versionado', () => {
  it('la clave de contenido ignora metadatos', () => {
    const r = gen('american-ipa');
    expect(contentKey({ ...r, updatedAt: r.updatedAt + 5000, versionCount: 3 })).toBe(contentKey(r));
    expect(contentKey({ ...r, boilTimeMin: 90 })).not.toBe(contentKey(r));
  });

  it('una versión es una foto inmutable', () => {
    const r = gen('american-ipa');
    const v = makeVersion(r, 1, 'manual');
    expect(hasUnversionedChanges(r, v)).toBe(false);
    r.fermentables[0].amountKg += 1;
    expect(v.snapshot.fermentables[0].amountKg).not.toBe(r.fermentables[0].amountKg);
    expect(hasUnversionedChanges(r, v)).toBe(true);
    expect(v.label).toBe('V1');
  });
});

describe('consecuencias de los cambios', () => {
  const water = BUILTIN_CATALOG.waters.find((w) => w.id === 'destilada')!;

  it('subir el macerado: más cuerpo y FG, menos fermentabilidad', () => {
    const a = gen('american-pale-ale');
    const b: Recipe = { ...a, mashSteps: a.mashSteps.map((s) => (s.tempC > 60 && s.tempC < 73 ? { ...s, tempC: s.tempC + 3 } : s)) };
    const rep = changeReport(a, b, water);
    const mash = rep.changes.find((c) => c.kind === 'macerado')!;
    expect(mash.effects.map((e) => `${e.sign}${e.text}`)).toEqual(expect.arrayContaining(['+cuerpo y dextrinas', '+FG', '−fermentabilidad y alcohol']));
    const fg = rep.stats.find((s) => s.key === 'fg')!;
    expect(fg.after).toBeGreaterThan(fg.before);
  });

  it('bajar el macerado invierte los efectos', () => {
    const a = gen('american-pale-ale');
    const b: Recipe = { ...a, mashSteps: a.mashSteps.map((s) => (s.tempC > 60 && s.tempC < 73 ? { ...s, tempC: s.tempC - 2 } : s)) };
    const mash = changeReport(a, b).changes.find((c) => c.kind === 'macerado')!;
    expect(mash.effects[0]).toEqual({ sign: '−', text: 'cuerpo y dextrinas' });
  });

  it('mucho caramelo advierte por tomabilidad', () => {
    const a = gen('blonde-ale');
    const crystal = BUILTIN_CATALOG.fermentables.find((f) => f.id === 'crystal-60')!;
    const b: Recipe = { ...a, fermentables: [...a.fermentables, fermentableFromCatalog(crystal, 1.2)] };
    const add = changeReport(a, b).changes.find((c) => c.kind === 'malta-agregada')!;
    expect(add.effects.some((e) => e.sign === '!' && e.text.includes('tomabilidad'))).toBe(true);
  });

  it('dry hop alto advierte hop burn y hop creep', () => {
    const a = gen('hazy-ipa');
    const dh = a.hops.find((h) => h.use === 'dry-hop')!;
    const b: Recipe = { ...a, hops: a.hops.map((h) => (h.uid === dh.uid ? { ...h, amountG: 300 } : h)) };
    const c = changeReport(a, b).changes.find((x) => x.kind === 'lupulo-cantidad')!;
    const warnings = c.effects.filter((e) => e.sign === '!').map((e) => e.text).join(' ');
    expect(warnings).toMatch(/hop burn/);
    expect(warnings).toMatch(/hop creep/);
  });

  it('sin cambios no reporta nada', () => {
    const a = gen('saison');
    const rep = changeReport(a, structuredClone(a));
    expect(rep.changes).toEqual([]);
    expect(rep.stats.every((s) => !s.significant)).toBe(true);
  });
});

describe('BeerXML', () => {
  it('ida y vuelta conserva la receta en todos los estilos', () => {
    for (const style of STYLES) {
      const r = generateFromStyle({ style, equipment: eq, catalog: BUILTIN_CATALOG });
      const xml = exportBeerXml([r], BUILTIN_CATALOG);
      const { recipes } = importBeerXml(xml, BUILTIN_CATALOG, eq);
      const back = recipes[0];
      const a = computeRecipeStats(r);
      const b = computeRecipeStats(back);
      expect(back.styleId, style.id).toBe(r.styleId);
      expect(Math.abs(b.og - a.og), `${style.id} OG`).toBeLessThan(0.0015);
      expect(Math.abs(b.ibu - a.ibu), `${style.id} IBU`).toBeLessThan(1.5);
      expect(Math.abs(b.srm - a.srm), `${style.id} SRM`).toBeLessThan(0.5);
      expect(back.fermentables.map((f) => f.ingredientId), `${style.id} maltas`).toEqual(r.fermentables.map((f) => f.ingredientId));
      expect(back.hops.map((h) => [h.ingredientId, h.use, h.time]), `${style.id} lúpulos`).toEqual(r.hops.map((h) => [h.ingredientId, h.use, h.time]));
      expect(back.yeasts[0].ingredientId, `${style.id} levadura`).toBe(r.yeasts[0].ingredientId);
    }
  });

  it('lee un archivo típico de BeerSmith / Brewfather', () => {
    const xml = `<?xml version="1.0" encoding="ISO-8859-1"?>
<RECIPES><RECIPE>
  <NAME>Mi IPA &amp; amigos</NAME><VERSION>1</VERSION><TYPE>All Grain</TYPE><BREWER>Harwin</BREWER>
  <BATCH_SIZE>20.0</BATCH_SIZE><BOIL_TIME>60</BOIL_TIME><EFFICIENCY>72</EFFICIENCY>
  <STYLE><NAME>American IPA</NAME><CATEGORY_NUMBER>21</CATEGORY_NUMBER><STYLE_LETTER>A</STYLE_LETTER></STYLE>
  <HOPS>
    <HOP><NAME>Magnum</NAME><ALPHA>12.5</ALPHA><AMOUNT>0.025</AMOUNT><USE>Boil</USE><TIME>60</TIME><FORM>Pellet</FORM></HOP>
    <HOP><NAME>Citra</NAME><ALPHA>13</ALPHA><AMOUNT>0.08</AMOUNT><USE>Dry Hop</USE><TIME>4320</TIME></HOP>
    <HOP><NAME>Mosaic</NAME><ALPHA>12</ALPHA><AMOUNT>0.05</AMOUNT><USE>Aroma</USE><TIME>20</TIME></HOP>
  </HOPS>
  <FERMENTABLES>
    <FERMENTABLE><NAME>Pale Malt (2 Row) US</NAME><TYPE>Grain</TYPE><AMOUNT>5.5</AMOUNT><YIELD>79</YIELD><COLOR>2</COLOR></FERMENTABLE>
    <FERMENTABLE><NAME>Caramel/Crystal Malt - 60L</NAME><TYPE>Grain</TYPE><AMOUNT>0.3</AMOUNT><YIELD>74</YIELD><COLOR>60</COLOR></FERMENTABLE>
    <FERMENTABLE><NAME>Corn Sugar (Dextrose)</NAME><TYPE>Sugar</TYPE><AMOUNT>0.25</AMOUNT><YIELD>100</YIELD><COLOR>0</COLOR></FERMENTABLE>
  </FERMENTABLES>
  <YEASTS><YEAST><NAME>Safale American</NAME><TYPE>Ale</TYPE><FORM>Dry</FORM><LABORATORY>Fermentis</LABORATORY><PRODUCT_ID>US-05</PRODUCT_ID><ATTENUATION>77</ATTENUATION></YEAST></YEASTS>
  <MISCS><MISC><NAME>Whirlfloc</NAME><USE>Boil</USE><TIME>15</TIME><AMOUNT>0.001</AMOUNT><AMOUNT_IS_WEIGHT>TRUE</AMOUNT_IS_WEIGHT></MISC></MISCS>
  <MASH><MASH_STEPS><MASH_STEP><NAME>Saccharification</NAME><STEP_TEMP>66</STEP_TEMP><STEP_TIME>60</STEP_TIME></MASH_STEP></MASH_STEPS></MASH>
  <PRIMARY_AGE>10</PRIMARY_AGE><PRIMARY_TEMP>19</PRIMARY_TEMP><CARBONATION>2.5</CARBONATION>
  <NOTES><![CDATA[Receta <favorita>]]></NOTES>
</RECIPE></RECIPES>`;
    const { recipes, notes } = importBeerXml(xml, BUILTIN_CATALOG, eq);
    const r = recipes[0];
    expect(r.name).toBe('Mi IPA & amigos');
    expect(r.styleId).toBe('american-ipa');
    expect(r.efficiencyPct).toBe(72);
    expect(r.hops.map((h) => [h.ingredientId, h.use, h.time])).toEqual([
      ['magnum', 'hervor', 60],
      ['citra', 'dry-hop', 3],
      ['mosaic', 'whirlpool', 20],
    ]);
    expect(r.hops[0].amountG).toBe(25);
    expect(r.fermentables.map((f) => f.type)).toEqual(['base', 'caramelo', 'azucar']);
    expect(r.fermentables[1].colorEBC).toBeCloseTo(158, -1);
    expect(r.fermentables[2].use).toBe('hervor');
    expect(r.yeasts[0].ingredientId).toBe('us-05');
    expect(r.yeasts[0].attenuation).toBe(77);
    expect(r.miscs[0]).toMatchObject({ name: 'Whirlfloc', amount: 1, unit: 'g' });
    expect(r.notes).toBe('Receta <favorita>');
    expect(r.fermentation[0]).toMatchObject({ tempC: 19, days: 10 });
    expect(r.hops.every((h) => h.source === 'importacion')).toBe(true);
    expect(Array.isArray(notes)).toBe(true);
  });

  it('reconoce nombres en inglés de BeerSmith y Brewfather', () => {
    const f = (n: string) => `<FERMENTABLE><NAME>${n}</NAME><TYPE>Grain</TYPE><AMOUNT>1</AMOUNT><YIELD>75</YIELD><COLOR>2</COLOR></FERMENTABLE>`;
    const h = (n: string) => `<HOP><NAME>${n}</NAME><ALPHA>5</ALPHA><AMOUNT>0.01</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP>`;
    const xml = `<RECIPES><RECIPE><NAME>x</NAME><FERMENTABLES>${['Candi Sugar, Clear', 'Flaked Oats', 'Roasted Barley', 'Corn Sugar (Dextrose)', 'Carapils', 'Maris Otter (Crisp)', 'Lactose'].map(f).join('')}</FERMENTABLES><HOPS>${['Styrian Goldings', 'East Kent Goldings', 'CTZ', 'Hallertauer Mittelfrueh'].map(h).join('')}</HOPS></RECIPE></RECIPES>`;
    const { recipes, notes } = importBeerXml(xml, BUILTIN_CATALOG, eq);
    expect(recipes[0].fermentables.map((x) => x.ingredientId)).toEqual(['candi-clear', 'oats-flaked', 'roasted-barley', 'dextrose', 'carafoam', 'maris-otter', 'lactose']);
    expect(recipes[0].hops.map((x) => x.ingredientId)).toEqual(['styrian-golding', 'ekg', 'columbus', 'hallertau-mittelfruh']);
    expect(notes).toEqual([]);
  });

  it('rechaza archivos sin recetas', () => {
    expect(() => importBeerXml('<HOLA></HOLA>', BUILTIN_CATALOG, eq)).toThrow(/No encontré recetas/);
  });

  it('el analizador tolera etiquetas vacías y comentarios', () => {
    const t = parseXml('<A><!-- x --><B/><C>1</C></A>');
    expect(t.children[0].children.map((c) => c.tag)).toEqual(['B', 'C']);
  });
});

describe('lote: planeado vs real y línea de tiempo', () => {
  it('marca desvíos solo con datos medidos', () => {
    const r = gen('american-pale-ale');
    const b = createBatch(r, 1);
    const stats = computeRecipeStats(r);
    let rows = plannedVsActual(b);
    expect(rows.every((x) => x.status === 'pendiente')).toBe(true);
    b.brewDay = { ...b.brewDay, ogMeasured: stats.og - 0.009, fermenterVolumeL: r.batchSizeL, mashTempC: rows.find((x) => x.key === 'mash')!.planned! + 0.5 };
    rows = plannedVsActual(b);
    expect(rows.find((x) => x.key === 'og')!.status).toBe('desvio');
    expect(rows.find((x) => x.key === 'mash')!.status).toBe('ok');
    expect(rows.find((x) => x.key === 'eff')!.actual).toBeLessThan(r.efficiencyPct);
  });

  it('ordena pasos, mediciones, eventos y lecturas por hora', () => {
    const r = gen('american-pale-ale');
    const b = createBatch(r, 1);
    const steps = brewDaySteps(r, computeRecipeStats(r));
    const t0 = b.createdAt;
    b.brewDay = { done: { [steps[0].id]: t0 + 1000, [steps[1].id]: true }, ogMeasured: 1.052, measuredAt: { ogMeasured: t0 + 5000 } };
    b.events = [{ uid: 'e1', at: t0 + 3000, kind: 'correccion', text: 'Se agregaron 200 g de DME', source: 'usuario' }];
    b.readings = [{ uid: 'r1', at: t0 + 9000, sg: 1.02, tempC: 19, pressurePsi: 5 }];
    const tl = batchTimeline(b, steps);
    expect(tl.map((x) => x.kind)).toEqual(['estado', 'paso', 'correccion', 'medicion', 'lectura']);
    expect(tl[3].title).toBe('OG: 1.052');
    expect(tl[4].title).toContain('5 PSI');
  });
});
