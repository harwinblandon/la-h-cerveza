import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { BUILTIN_CATALOG, byId } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { designRoutes, parseIntent, styleCompatibility } from './intent';
import { generateFromStyle } from './recipeFactory';
import { predictSensory, sensoryFit } from './sensory';

const eq = DEFAULT_EQUIPMENT[0];
const C = BUILTIN_CATALOG;
const water = byId(C.waters, 'destilada')!;
const src = { id: water.id, ions: water };
const style = (id: string) => STYLES.find((s) => s.id === id)!;

describe('modelo sensorial', () => {
  const p = (id: string) => {
    const r = generateFromStyle({ style: style(id), equipment: eq, catalog: C, sourceWater: src });
    return predictSensory(r, computeRecipeStats(r, water), C).values;
  };

  it('ordena los estilos como lo haría un cervecero', () => {
    expect(p('irish-stout').tostado).toBeGreaterThan(p('american-porter').tostado - 1);
    expect(p('american-ipa').amargor).toBeGreaterThan(p('munich-helles').amargor + 3);
    expect(p('wee-heavy').dulzor).toBeGreaterThan(p('saison').dulzor + 5);
    expect(p('weissbier').fenoles).toBeGreaterThan(p('blonde-ale').fenoles + 4);
    expect(p('berliner-weisse').acidez).toBeGreaterThan(6);
    expect(p('hazy-ipa').lupulo).toBeGreaterThan(p('english-ipa').lupulo);
    expect(p('weissbier').carbonatacion).toBeGreaterThan(p('ordinary-bitter').carbonatacion + 4);
  });

  it('explica cada valor con sus causas', () => {
    const r = generateFromStyle({ style: style('american-ipa'), equipment: eq, catalog: C });
    const pred = predictSensory(r, computeRecipeStats(r), C);
    expect(pred.drivers.amargor.some((d) => d.label.startsWith('IBU'))).toBe(true);
    expect(pred.drivers.dulzor.length).toBeGreaterThan(2);
  });

  it('compatibilidad sensorial: tolera la incertidumbre, penaliza lo demás', () => {
    const base = { dulzor: 3, cuerpo: 4 } as const;
    expect(sensoryFit(base, { ...p('blonde-ale'), dulzor: 3.5, cuerpo: 4.5 })!.score).toBe(100);
    expect(sensoryFit(base, { ...p('blonde-ale'), dulzor: 3.8, cuerpo: 4.5 })!.score).toBeGreaterThanOrEqual(97);
    expect(sensoryFit(base, { ...p('blonde-ale'), dulzor: 8, cuerpo: 9 })!.score).toBeLessThan(40);
  });

  it('sugiere otro estilo cuando el objetivo no cabe en el elegido', async () => {
    const { alternativeStyles } = await import('./intent');
    const i = parseIntent('IPA tropical, aromática y con poco amargor', C);
    const input = { style: byId(C.styles, i.styleId), target: i.target, caps: i.caps, aromas: i.aromas, constraints: i.constraints, mode: i.mode, equipment: eq, catalog: C, sourceWater: src };
    const alt = alternativeStyles(input, designRoutes(input));
    expect(alt.map((s) => s.id)).toContain('hazy-ipa');
  });
});

describe('intérprete de intención', () => {
  it('Tripel seca, compleja, bebible, de competencia', () => {
    const i = parseIntent('Quiero una Belgian Tripel seca, compleja, altamente bebible y apta para competencia.', C);
    expect(i.styleId).toBe('tripel');
    expect(i.mode).toBe('competencia');
    expect(i.target.dulzor).toBe(2);
    expect(i.caps.alcohol).toBe(4);
    expect(i.wantsComplexity).toBe(true);
  });

  it('Imperial Stout dulce, densa, chocolate y café, sin empalagar', () => {
    const i = parseIntent('Quiero una Imperial Stout dulce, densa, con chocolate y café, pero sin ser empalagosa.', C);
    expect(i.styleId).toBe('imperial-stout');
    expect(i.target.dulzor).toBe(6);
    expect(i.caps.dulzor).toBe(6);
    expect(i.target.cuerpo).toBe(7.5);
    expect(i.target.tostado).toBe(6);
    expect(i.unsupported.join(' ')).toMatch(/adjuntos/);
  });

  it('IPA tropical con poco amargor', () => {
    const i = parseIntent('Quiero una IPA tropical, suave, aromática y con poco amargor.', C);
    expect(i.styleId).toBe('american-ipa');
    expect(i.aromas).toContain('tropical');
    expect(i.target.amargor).toBe(2.5);
    expect(i.target.lupulo).toBe(7.5);
  });

  it('diseño libre con números y color', () => {
    const i = parseIntent('Dorada, 7 % ABV, poco amarga, cuerpo medio, final ligeramente dulce y aroma tropical intenso.', C);
    expect(i.styleId).toBeUndefined();
    expect(i.mode).toBe('libre');
    expect(i.constraints).toMatchObject({ abv: 7, srm: [3.5, 6.5] });
    expect(i.target).toMatchObject({ amargor: 2.5, cuerpo: 5, dulzor: 4.5, lupulo: 8.5 });
  });

  it('avisa lo que aún no modela', () => {
    expect(parseIntent('Una Smoothie Sour de mango y maracuyá, dulce, cremosa y ácida', C).unsupported).toContain('Smoothie Sour');
  });
});

describe('modos de diseño y desviaciones intencionales', () => {
  const setup = (mode?: 'competencia' | 'tradicional' | 'moderna' | 'libre') => {
    const st = style('american-ipa');
    const r = generateFromStyle({ style: st, equipment: eq, catalog: C });
    const low = { ...r, intent: mode ? { mode, target: {} } : undefined, hops: r.hops.map((h) => (h.use === 'hervor' && h.time >= 60 ? { ...h, amountG: 5 } : h)) };
    return { st, low };
  };
  const run = async (mode?: 'competencia' | 'tradicional' | 'moderna' | 'libre', deviations?: Record<string, string>) => {
    const { analyzeRecipe } = await import('./suggest/analysis');
    const { st, low } = setup(mode);
    const recipe = { ...low, deviations };
    return analyzeRecipe({ recipe, stats: computeRecipeStats(recipe), style: st, catalog: C }).find((x) => x.area === 'amargor');
  };

  it('el mismo desvío pesa distinto según el modo', async () => {
    expect((await run('tradicional'))!.severity).toBe('problema');
    expect((await run('competencia'))!.severity).toBe('problema');
    expect((await run('moderna'))!.severity).toBe('idea');
    expect(await run('libre')).toBeUndefined();
  });

  it('una desviación marcada como intencional deja de ser problema y guarda el motivo', async () => {
    const key = (await run('tradicional'))!.key;
    const s = (await run('tradicional', { [key]: 'Quiero una IPA suave para el calor' }))!;
    expect(s.severity).toBe('idea');
    expect(s.intentional).toBe('Quiero una IPA suave para el calor');
  });
});

describe('rutas de diseño', () => {
  it('Tripel de competencia: tres rutas, la A dentro del estilo', () => {
    const i = parseIntent('Belgian Tripel seca, compleja, altamente bebible y apta para competencia', C);
    const t0 = Date.now();
    const routes = designRoutes({ style: byId(C.styles, i.styleId), target: i.target, caps: i.caps, aromas: i.aromas, constraints: i.constraints, wantsComplexity: i.wantsComplexity, mode: i.mode, equipment: eq, catalog: C, sourceWater: src });
    const ms = Date.now() - t0;
    expect(routes.map((r) => r.id)).toEqual(['A', 'B', 'C']);
    const a = routes[0];
    expect(a.compat.score).toBeGreaterThanOrEqual(95);
    expect(a.prediction.values.dulzor).toBeLessThanOrEqual(3.5);
    expect(a.levers.length).toBeGreaterThan(4);
    expect(ms).toBeLessThan(15000);
  });

  it('IPA con poco amargor: la ruta moderna se acerca más al objetivo', () => {
    const i = parseIntent('IPA tropical, aromática y con poco amargor', C);
    const routes = designRoutes({ style: byId(C.styles, i.styleId), target: i.target, caps: i.caps, aromas: i.aromas, constraints: i.constraints, mode: 'moderna', equipment: eq, catalog: C, sourceWater: src });
    const [a, , c] = routes;
    expect(c.prediction.values.amargor).toBeLessThanOrEqual(a.prediction.values.amargor);
    // Los lúpulos de aroma se eligen por el aroma pedido.
    const aromaHops = c.recipe.hops.filter((h) => h.use === 'whirlpool' || h.use === 'dry-hop').map((h) => byId(C.hops, h.ingredientId)!);
    expect(aromaHops.some((h) => h.aroma.includes('tropical'))).toBe(true);
  });

  it('diseño libre: tres bases distintas que respetan ABV y color', () => {
    const i = parseIntent('Dorada, 7 % ABV, poco amarga, cuerpo medio, final ligeramente dulce y aroma tropical intenso.', C);
    const routes = designRoutes({ target: i.target, caps: i.caps, aromas: i.aromas, constraints: i.constraints, mode: 'libre', equipment: eq, catalog: C, sourceWater: src });
    expect(new Set(routes.map((r) => r.style.id)).size).toBe(3);
    for (const r of routes) {
      expect(Math.abs(r.stats.abv - 7), r.name).toBeLessThan(0.4);
      expect(r.stats.srm, r.name).toBeLessThan(8);
    }
  });

  it('compatibilidad con el estilo: fórmula explícita', () => {
    const r = generateFromStyle({ style: style('american-ipa'), equipment: eq, catalog: C });
    const s = computeRecipeStats(r);
    expect(styleCompatibility(s, style('american-ipa')).score).toBe(100);
    const off = styleCompatibility({ ...s, ibu: 20 }, style('american-ipa'));
    expect(off.score).toBe(80);
    expect(off.rows.find((x) => x.param === 'IBU')!.penalty).toBe(20);
  });
});
