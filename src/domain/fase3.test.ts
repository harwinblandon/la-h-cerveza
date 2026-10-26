import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { STYLES } from '../data/styles';
import { BUILTIN_CATALOG, brandEquivalent, byId, maltsters } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { acidMl, recipeAcid } from './calc/water';
import { generateFromStyle } from './recipeFactory';
import type { AcidChoice } from './types';
import { pitchAdvice, yeastStyleFit } from './yeastAdvice';

const C = BUILTIN_CATALOG;
const eq = DEFAULT_EQUIPMENT[0];
const armenia = byId(C.waters, 'armenia-epa')!;
const style = (id: string) => STYLES.find((s) => s.id === id)!;
const F = (id: string) => byId(C.fermentables, id)!;

describe('marcas de malta', () => {
  it('lista las malterías del catálogo', () => {
    const m = maltsters(C);
    expect(m).toEqual(expect.arrayContaining(['BestMalz', 'Castle Malting', 'Weyermann']));
  });

  it('cambia cada malta por la equivalente de la marca elegida', () => {
    expect(brandEquivalent(F('pilsner-wey'), C, ['BestMalz']).id).toBe('best-pilsen');
    expect(brandEquivalent(F('pilsner-wey'), C, ['Castle Malting']).id).toBe('castle-pilsen');
    expect(brandEquivalent(F('caramunich-2'), C, ['BestMalz']).id).toBe('best-caramel-munich-2');
    // Si la marca no tiene una equivalente razonable, se deja la original.
    expect(brandEquivalent(F('caraaroma'), C, ['Fuglsang']).id).toBe('caraaroma');
  });

  it('el generador respeta la marca y conserva la OG', () => {
    const base = generateFromStyle({ style: style('german-pils'), equipment: eq, batchSizeL: 20, catalog: C });
    const best = generateFromStyle({ style: style('german-pils'), equipment: eq, batchSizeL: 20, catalog: C, maltsters: ['BestMalz'] });
    expect(best.fermentables.some((f) => f.ingredientId?.startsWith('best-'))).toBe(true);
    expect(Math.abs(computeRecipeStats(best).og - computeRecipeStats(base).og)).toBeLessThan(0.002);
  });
});

describe('insumos que tiene el cervecero', () => {
  it('reemplazar una malta conserva la OG del estilo', () => {
    const s = style('american-ipa');
    const base = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C });
    const swapped = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C, tuning: { grainSwap: { [s.guide.grains[0].ingredientId]: 'maris-otter' } } });
    expect(swapped.fermentables[0].ingredientId).toBe('maris-otter');
    expect(Math.abs(computeRecipeStats(swapped).og - computeRecipeStats(base).og)).toBeLessThan(0.002);
  });

  it('reemplazar el lúpulo de amargor mantiene el IBU', () => {
    const s = style('american-lager');
    const base = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C });
    const swapped = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C, tuning: { hopSwap: { magnum: 'cascade' } } });
    expect(swapped.hops[0].name).toMatch(/Cascade/);
    expect(Math.abs(computeRecipeStats(swapped).ibu - computeRecipeStats(base).ibu)).toBeLessThan(1.5);
  });
});

describe('ácido fosfórico', () => {
  const fosforico: AcidChoice = { type: 'fosforico', pct: 85 };
  it('el generador usa el ácido del cervecero', () => {
    const r = generateFromStyle({ style: style('german-pils'), equipment: eq, batchSizeL: 20, catalog: C, sourceWater: { id: armenia.id, ions: armenia }, acid: fosforico });
    const stats = computeRecipeStats(r, armenia);
    expect(r.water.lacticMl).toBe(0);
    if (acidMl(r.water) > 0) {
      expect(recipeAcid(r.water).type).toBe('fosforico');
      expect(stats.mashPh!).toBeGreaterThan(5.3);
      expect(stats.mashPh!).toBeLessThan(5.5);
    }
  });

  it('al 85 % se necesita mucho menos volumen que de láctico al 88 %', () => {
    const s = style('german-pils');
    const lac = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C, sourceWater: { id: armenia.id, ions: armenia } });
    const fos = generateFromStyle({ style: s, equipment: eq, batchSizeL: 20, catalog: C, sourceWater: { id: armenia.id, ions: armenia }, acid: fosforico });
    if (lac.water.lacticMl > 0.5) expect(fos.water.phosphoricMl).toBeLessThan(lac.water.lacticMl);
  });
});

describe('levadura', () => {
  const us05 = { name: 'US-05', type: 'ale' as const, form: 'seca' as const, family: 'americana-limpia', tempRange: [18, 22] as [number, number], attenuation: 80 };
  it('con suficiente levadura no pide más', () => {
    const a = pitchAdvice(1.05, 20, us05, 2);
    expect(a.level).toBe('ok');
  });

  it('con pocos sobres recomienda hidratar, oxigenar, nutriente y más células', () => {
    const a = pitchAdvice(1.08, 25, us05, 1);
    expect(a.level === 'bajo' || a.level === 'muy-bajo').toBe(true);
    const text = a.steps.join(' ');
    expect(text).toMatch(/[Hh]idrata/);
    expect(text).toMatch(/[Oo]xigena/);
    expect(text).toMatch(/nutriente/);
    expect(text).toMatch(/starter|sobre\(s\) más/);
  });

  it('la kveik tolera inocular poco', () => {
    const voss = { ...us05, name: 'Voss', family: 'kveik', tempRange: [30, 40] as [number, number] };
    expect(pitchAdvice(1.06, 20, voss, 1).level).toBe('ok');
  });

  it('una levadura fuera del estilo explica por qué, sin prohibirla', () => {
    const fit = yeastStyleFit({ ...us05, name: 'WB-06', family: 'weizen' }, style('german-pils'));
    expect(fit.fits).toBe(false);
    expect(fit.message).toMatch(/banano|clavo/);
    expect(fit.message).toMatch(/Puedes usarla/);
    expect(yeastStyleFit(us05, style('american-ipa')).fits).toBe(true);
  });
});

describe('temporizadores del día de cocción', () => {
  it('propone macerado por paso, hervor con cada lúpulo y whirlpool', async () => {
    const { defaultTimers, alertRemainingMin } = await import('./timers');
    const r = generateFromStyle({ style: style('american-ipa'), equipment: eq, batchSizeL: 20, catalog: C });
    const t = defaultTimers(r);
    expect(t.filter((x) => x.phase === 'macerado')).toHaveLength(r.mashSteps.length);
    const boil = t.find((x) => x.phase === 'hervor')!;
    expect(boil.minutes).toBe(r.boilTimeMin);
    for (const h of r.hops.filter((h) => h.use === 'hervor')) expect(boil.alerts.some((a) => a.text.includes(h.name))).toBe(true);
    expect(boil.alerts.some((a) => /enfriador/i.test(a.text))).toBe(true);
    if (r.hops.some((h) => h.use === 'whirlpool')) expect(t.some((x) => x.phase === 'whirlpool')).toBe(true);
    // "a los 15 min" de un macerado de 60 suena cuando faltan 45.
    expect(alertRemainingMin({ minutes: 60 }, { uid: 'x', atMin: 15, from: 'inicio', text: 'pH' })).toBe(45);
    expect(alertRemainingMin({ minutes: 60 }, { uid: 'x', atMin: 10, from: 'faltan', text: 'lúpulo' })).toBe(10);
  });
});
