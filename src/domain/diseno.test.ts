import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT } from '../data/equipment';
import { createBatch } from './batch';
import { BUILTIN_CATALOG as C, byId } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { efficiencyForOg, readDesign, scaleMashToOg } from './designImport';
import { planStatus } from './plan';
import type { Batch } from './types';
import { pitchAdvice } from './yeastAdvice';

const text = readFileSync(new URL('./__fixtures__/smoothie-sour.txt', import.meta.url), 'utf8');
const agua = byId(C.waters, 'armenia-epa')!;
const eq = { ...DEFAULT_EQUIPMENT.find((e) => e.type === 'biab')!, kettleL: 70 };
const leer = () => readDesign(text, { catalog: C, equipment: eq, sourceWater: { id: agua.id, ions: agua }, acid: { type: 'fosforico', pct: 85 } });

describe('lectura de un diseño escrito (Imperial Banana & Cacao Smoothie Sour)', () => {
  const { recipe: r, waters, warnings } = leer();

  it('parámetros y objetivos', () => {
    expect(r.name).toBe('Imperial Banana & Cacao Smoothie Sour');
    expect(r.batchSizeL).toBe(40);
    expect(r.design?.styleName).toBe('Imperial Smoothie Sour');
    expect(r.design?.og).toEqual([1.07, 1.075]);
    expect(r.design?.abv).toEqual([7, 8]);
    expect(r.design?.ibu).toEqual([8, 10]);
    expect(r.design?.phFinal).toEqual([3.4, 3.7]);
    expect(r.carbonation.volumes).toBeCloseTo(2.05);
  });

  it('grano, azúcares al hervor con su minuto y banano en dos tandas', () => {
    const mash = r.fermentables.filter((f) => f.use === 'macerado');
    expect(mash.reduce((s, f) => s + f.amountKg, 0)).toBeCloseTo(18);
    expect(mash.find((f) => f.ingredientId === 'oats-flaked')?.role).toMatch(/beta-glucanos/);
    expect(r.fermentables.find((f) => f.ingredientId === 'lactose')).toMatchObject({ use: 'hervor', timeMin: 10, amountKg: 0.6 });
    expect(r.fermentables.find((f) => f.ingredientId === 'dextrose')).toMatchObject({ use: 'hervor', amountKg: 0.7 });
    const banana = r.fermentables.filter((f) => f.ingredientId === 'fruta-banano');
    expect(banana.map((f) => f.amountKg)).toEqual([6, 3]);
    expect(banana.every((f) => f.use === 'fermentador')).toBe(true);
    // La maltodextrina es opcional: queda como nota, no en la receta.
    expect(r.fermentables.some((f) => f.ingredientId === 'maltodextrin')).toBe(false);
    expect(r.design?.notes?.some((n) => /Maltodextrina/.test(n))).toBe(true);
  });

  it('lúpulo ajustado al IBU del diseño, macerado, hervor y levadura', () => {
    const stats = computeRecipeStats(r, agua);
    expect(r.hops[0].name).toMatch(/Magnum/);
    expect(r.hops[0].alpha).toBe(12);
    expect(stats.ibu).toBeGreaterThan(8);
    expect(stats.ibu).toBeLessThan(10);
    expect(r.mashSteps.map((s) => [s.tempC, s.timeMin])).toEqual([
      [68, 70],
      [75.5, 10],
    ]);
    expect(r.boilTimeMin).toBe(60);
    expect(r.yeasts[0]).toMatchObject({ ingredientId: 'philly-sour', amount: 4 });
  });

  it('agua del diseño con sales y ácido fosfórico', () => {
    expect(waters[0]).toMatchObject({ ca: 70, mg: 10, na: 17.5, cl: 115, so4: 50 });
    expect(r.water.phosphoricMl).toBeGreaterThan(0);
    expect(computeRecipeStats(r, agua).mashPh!).toBeGreaterThan(5.25);
  });

  it('la OG del mosto no incluye la fruta, el ABV sí', () => {
    const s = computeRecipeStats(r);
    expect(s.ogTotal).toBeGreaterThan(s.og + 0.008);
  });

  it('avisa que el grano no cuadra con la OG del diseño y ofrece corregirlo', () => {
    expect(warnings.some((w) => /OG/.test(w))).toBe(true);
    const eff = efficiencyForOg(r, 1.0725)!;
    expect(computeRecipeStats({ ...r, efficiencyPct: eff }).og).toBeCloseTo(1.0725, 3);
    expect(computeRecipeStats(scaleMashToOg(r, 1.0725)).og).toBeCloseTo(1.0725, 2);
  });

  it('plan por condiciones: fermentación, banano, cacao, final y maduración', () => {
    const titles = (r.plan ?? []).map((p) => p.title);
    expect(titles[0]).toBe('Inoculación');
    const i1 = titles.findIndex((t) => /Primera adición/.test(t));
    const i2 = titles.findIndex((t) => /Segunda adición/.test(t));
    const ic = titles.findIndex((t) => /Nibs/.test(t));
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(ic).toBeGreaterThan(i2);
    expect(r.plan![ic].contactDays).toEqual([4, 7]);
    expect(titles.some((t) => /cold crash/i.test(t))).toBe(true);
    expect(r.plan![i1].detail).toMatch(/puré/i);
  });

  it('Philly Sour: dosis del fabricante para mostos de más de 14 °P', () => {
    const a = pitchAdvice(1.0725, 40, { name: 'Philly Sour', type: 'ale', form: 'seca', family: 'acida', ingredientId: 'philly-sour' }, 2);
    expect(a.packs).toBe(4);
    expect(a.level).not.toBe('ok');
    expect(pitchAdvice(1.0725, 40, { name: 'Philly Sour', type: 'ale', form: 'seca', family: 'acida', ingredientId: 'philly-sour' }, 4).level).toBe('ok');
  });

  it('en el lote, las condiciones se evalúan con las lecturas', () => {
    const b: Batch = { ...createBatch(r, 1), brewDay: { done: {}, ogMeasured: 1.072 } };
    const DAY = 86_400_000;
    const t0 = b.brewDate;
    const firstFruit = () => planStatus(b, t0 + 5 * DAY).find((s) => /Primera adición/.test(s.step.title))!;
    expect(firstFruit().ready).toBe(false);
    b.readings = [
      { uid: 'a', at: t0 + 2 * DAY, sg: 1.068, ph: 4.2 },
      { uid: 'b', at: t0 + 4 * DAY, sg: 1.055, ph: 3.7 },
    ];
    expect(firstFruit().ready).toBe(true);
  });
});
