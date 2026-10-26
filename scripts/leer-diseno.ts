// Prueba del lector de diseños: npx vite-node scripts/leer-diseno.ts <archivo>
import { readFileSync } from 'node:fs';
import { DEFAULT_EQUIPMENT } from '../src/data/equipment';
import { BUILTIN_CATALOG as C, byId } from '../src/domain/catalog';
import { computeRecipeStats } from '../src/domain/calc/recipeStats';
import { readDesign } from '../src/domain/designImport';
import { recipeCost } from '../src/domain/cost';
const text = readFileSync(process.argv[2] ?? 'src/domain/__fixtures__/smoothie-sour.txt', 'utf8');
const agua = byId(C.waters, 'armenia-epa')!;
const eq = DEFAULT_EQUIPMENT.find((e) => e.type === 'biab')!;
const res = readDesign(text, { catalog: C, equipment: { ...eq, batchSizeL: 40, kettleL: 70 }, sourceWater: { id: agua.id, ions: agua }, acid: { type: 'fosforico', pct: 85 }, maltsters: ['BestMalz'] });
const r = res.recipe;
for (const s of res.sections) {
  console.log(`\n## ${s.title}`);
  for (const i of s.items) console.log(`  · ${i.label}: ${i.value}`);
}
console.log('\n## Receta');
console.log(`  ${r.name} · ${r.batchSizeL} L · hervor ${r.boilTimeMin} · eficiencia ${r.efficiencyPct} %`);
for (const f of r.fermentables) console.log(`  ${f.amountKg} kg ${f.name} [${f.use}${f.timeMin !== undefined ? ` ${f.timeMin} min` : ''}] ${f.role ?? ''}`);
for (const h of r.hops) console.log(`  ${h.amountG} g ${h.name} ${h.alpha}% ${h.use} ${h.time}`);
for (const y of r.yeasts) console.log(`  ${y.amount} × ${y.name}`);
for (const m of r.miscs) console.log(`  ${m.amount} ${m.unit} ${m.name} [${m.use} ${m.time ?? ''}] ${m.notes ?? ''}`);
console.log('  Macerado:', r.mashSteps.map((s) => `${s.name} ${s.tempC}°C ${s.timeMin}min`).join(' → '));
console.log('  Fermentación:', r.fermentation.map((s) => `${s.name} ${s.tempC}°C ${s.days}d`).join(' | '));
console.log('  Agua:', JSON.stringify(r.water.mashSalts), 'ácido', r.water.phosphoricMl, 'mL fosfórico');
console.log('  Carbonatación', r.carbonation);
console.log('\n## Plan');
for (const p of r.plan ?? []) console.log(`  [${p.phase}] ${p.title} ${p.tempC ? `(${p.tempC.join('–')} °C)` : ''} ${JSON.stringify(p.conditions ?? [])} ${p.contactDays ? `contacto ${p.contactDays.join('–')} d` : ''} ${p.checkEveryH ? `cada ${p.checkEveryH} h` : ''}`);
console.log('\n## Diseño', JSON.stringify(r.design));
const s = computeRecipeStats(r, agua);
console.log(`\n## Calculado: OG mosto ${s.og.toFixed(3)} · OG total ${s.ogTotal.toFixed(3)} · FG ${s.fg.toFixed(3)} · ABV ${s.abv.toFixed(1)} · IBU ${s.ibu.toFixed(1)} · pH ${s.mashPh?.toFixed(2)} · agua ${(s.water.mashWaterL + s.water.spargeWaterL).toFixed(1)} L · pre-hervor ${s.water.preBoilL.toFixed(1)} L`);
console.log('Advertencias:', res.warnings);
console.log('\n## Sin leer'); for (const l of res.unread) console.log('  ?', l);
const c = recipeCost(r);
console.log(`\nCosto: ${Math.round(c.used)} · por litro ${Math.round(c.perLiter)} · sin precio: ${c.missing.join(', ')}`);
