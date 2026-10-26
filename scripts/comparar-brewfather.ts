// Genera una receta guía en La H y la recalcula con las fórmulas de Brewfather,
// para ver dónde coinciden y dónde difieren. Exporta además el BeerXML para importarlo en Brewfather.
//
// Uso: npx vite-node scripts/comparar-brewfather.ts [estilo] [litros]

import { writeFileSync } from 'node:fs';
import { DEFAULT_EQUIPMENT } from '../src/data/equipment';
import { ARMENIA_WATERS } from '../src/data/water';
import { exportBeerXml } from '../src/domain/beerxml';
import { tinsethUtilization } from '../src/domain/calc/bitterness';
import { abv } from '../src/domain/calc/gravity';
import { computeRecipeStats } from '../src/domain/calc/recipeStats';
import { L_PER_GAL, LB_PER_KG, ebcToLovibond } from '../src/domain/calc/units';
import { BUILTIN_CATALOG, byId } from '../src/domain/catalog';
import { generateFromStyle } from '../src/domain/recipeFactory';

const styleId = process.argv[2] ?? 'american-lager';
const litros = Number(process.argv[3] ?? 20);
const style = byId(BUILTIN_CATALOG.styles, styleId)!;
const agua = ARMENIA_WATERS[0];
const equipment = DEFAULT_EQUIPMENT.find((e) => e.type === 'biab') ?? DEFAULT_EQUIPMENT[0];
const r = generateFromStyle({ style, equipment, batchSizeL: litros, sourceWater: { id: agua.id, ions: agua }, catalog: BUILTIN_CATALOG, store: 'Distrines' });
const s = computeRecipeStats(r, agua);

// ---- Recálculo "a la Brewfather" ----
const gal = (l: number) => l / L_PER_GAL;
const batchGal = gal(r.batchSizeL);
let pts = 0;
let ferm = 0;
for (const f of r.fermentables) {
  const p = (f.amountKg * LB_PER_KG * f.ppg * (f.use === 'macerado' ? r.efficiencyPct / 100 : 1)) / batchGal;
  pts += p;
  if (f.type !== 'no-fermentable') ferm += p;
}
const ogBF = 1 + pts / 1000;
const yeast = r.yeasts[0];
const yCat = byId(BUILTIN_CATALOG.yeasts, yeast?.ingredientId);
// Brewfather "Normal": atenuación máxima del laboratorio, sin corregir por temperatura de macerado.
const attMax = yCat?.attenuationRange?.[1] ?? yeast?.attenuation ?? 75;
const fgBF = 1 + (pts - ferm * (attMax / 100)) / 1000;
const abvStd = (o: number, f: number) => (o - f) * 131.25;

const postHotL = s.water.postBoilHotL;
const ibuWith = (grav: number, volL: number) =>
  r.hops.reduce((sum, h) => {
    if (h.use !== 'hervor' && h.use !== 'primer-mosto') return sum;
    const mgL = ((h.alpha / 100) * h.amountG * 1000) / volL;
    return sum + tinsethUtilization(grav, h.use === 'primer-mosto' ? r.boilTimeMin : Math.min(h.time, r.boilTimeMin)) * mgL;
  }, 0);
const mcu = (volL: number) => r.fermentables.reduce((m, f) => m + (f.amountKg * LB_PER_KG * ebcToLovibond(f.colorEBC)) / gal(volL), 0);
const srmBF = 1.49 * mcu(r.batchSizeL) ** 0.69;

const f3 = (x: number) => x.toFixed(3);
const f1 = (x: number) => x.toFixed(1);
console.log(`\n${r.name} · ${r.batchSizeL} L al fermentador · ${equipment.name} · eficiencia ${r.efficiencyPct} % · hervor ${r.boilTimeMin} min`);
console.log('\nRECETA');
for (const f of r.fermentables) console.log(`  ${f.amountKg.toFixed(2)} kg  ${f.name} (${f.colorEBC} EBC, ${f.ppg} PPG) · ${f.use}`);
for (const h of r.hops) console.log(`  ${h.amountG.toFixed(0)} g  ${h.name} ${h.alpha} % AA · ${h.use} ${h.time} min`);
for (const y of r.yeasts) console.log(`  ${y.amount} × ${y.name} (atenuación ${y.attenuation} %, máx. lab ${attMax} %)`);
console.log(`  Macerado: ${r.mashSteps.map((m) => `${m.tempC} °C ${m.timeMin} min`).join(' → ')}`);
console.log(`  Sales (g): ${JSON.stringify(r.water.mashSalts)} · ácido láctico ${r.water.lacticMl ?? 0} mL`);

console.log('\nCOMPARACIÓN                 La H        Brewfather (variantes)');
console.log(`  OG                        ${f3(s.og)}       ${f3(ogBF)}`);
console.log(`  FG                        ${f3(s.fg)}       ${f3(fgBF)}  (atenuación máx. ${attMax} %)`);
console.log(`  ABV                       ${f1(s.abv)} %       ${f1(abvStd(ogBF, fgBF))} % estándar · ${f1(abv(ogBF, fgBF))} % alta precisión`);
console.log(`  IBU                       ${f1(s.ibu)}        ${f1(ibuWith(ogBF, postHotL))} (OG, vol. caliente) · ${f1(ibuWith(s.boilGravity, postHotL))} (densidad media) · ${f1(ibuWith(ogBF, r.batchSizeL))} (OG, vol. fermentador)`);
console.log(`  Color (SRM)               ${f1(s.srm)}         ${f1(srmBF)}`);
console.log(`  Densidad pre-hervor       ${f3(s.preBoilSg)}`);
console.log(`  Volúmenes                 pre-hervor ${f1(s.water.preBoilL)} L · post-hervor caliente ${f1(postHotL)} L · agua total ${f1(s.water.mashWaterL + s.water.spargeWaterL)} L`);
console.log(`  pH de macerado (est.)     ${s.mashPh?.toFixed(2)}`);

writeFileSync(`${styleId}-la-h.xml`, exportBeerXml([r], BUILTIN_CATALOG), 'utf-8');
console.log(`\nBeerXML: ${styleId}-la-h.xml (para importar en Brewfather)`);
