import { isMashed } from './calc/gravity';
import { apparentAttenuation, abv } from './calc/gravity';
import { computeRecipeStats, type RecipeStats } from './calc/recipeStats';
import { dilutionVolume, dmeForGravity, refractometerFg } from './calc/tools';
import { L_PER_GAL, LB_PER_KG, sgToPlato, uid } from './calc/units';
import { SALTS } from './calc/water';
import { mainMashTemp } from './calc/gravity';
import type { Batch, BatchEvent, BrewMeasureKey, FermentationReading, Provenance, Recipe, RecipeVersion, WaterIons } from './types';

const DAY = 86_400_000;

export function createBatch(recipe: Recipe, number: number, version?: RecipeVersion): Batch {
  const now = Date.now();
  return {
    id: uid(),
    number,
    name: recipe.name,
    recipeId: recipe.id,
    recipeVersionId: version?.id,
    recipeVersionNumber: version?.number,
    events: [],
    recipe: structuredClone(recipe),
    status: 'planificado',
    brewDate: now,
    brewDay: { done: {} },
    readings: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- Día de cocción ----------

export type BrewPhase = 'preparacion' | 'macerado' | 'hervor' | 'enfriado';

export interface BrewStep {
  id: string;
  phase: BrewPhase;
  title: string;
  detail?: string;
  timerMin?: number;
}

export const PHASE_LABEL: Record<BrewPhase, string> = {
  preparacion: 'Preparación',
  macerado: 'Macerado',
  hervor: 'Hervor',
  enfriado: 'Enfriado e inoculación',
};

const n1 = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 });
const kgTxt = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${n1(kg)} kg`);

function saltsText(salts: Partial<Record<string, number>>) {
  return SALTS.filter((s) => (salts[s.id] ?? 0) > 0)
    .map((s) => `${n1(salts[s.id]!)} g de ${s.name.toLowerCase()}`)
    .join(', ');
}

export function brewDaySteps(recipe: Recipe, stats: RecipeStats): BrewStep[] {
  const eq = recipe.equipment;
  const w = stats.water;
  const steps: BrewStep[] = [];
  const add = (s: Omit<BrewStep, 'id'>) => steps.push({ ...s, id: `${s.phase}-${steps.length}` });
  const isBiab = eq.type === 'biab' || eq.type === 'biab-lavado';

  // Preparación
  add({ phase: 'preparacion', title: 'Limpia y sanitiza', detail: 'Fermentador, tapa, airlock, enfriador, mangueras, cucharas y densímetro.' });
  const grains = recipe.fermentables.filter(isMashed);
  if (grains.length) {
    add({
      phase: 'preparacion',
      title: `Pesa y muele ${kgTxt(w.grainKg)} de grano`,
      detail: grains.map((f) => `${kgTxt(f.amountKg)} ${f.name}`).join(' · ') + (isBiab ? '. En BIAB puedes moler más fino.' : ''),
    });
  }
  const mashSalts = saltsText(recipe.water.mashSalts);
  add({
    phase: 'preparacion',
    title: w.spargeWaterL > 0.05 ? `Prepara ${n1(w.mashWaterL)} L para macerar y ${n1(w.spargeWaterL)} L para lavar` : `Prepara ${n1(w.totalWaterL)} L de agua`,
    detail:
      [mashSalts && `Al agua de macerado: ${mashSalts}.`, recipe.water.lacticMl > 0 && `Ácido láctico: ${n1(recipe.water.lacticMl)} mL.`, saltsText(recipe.water.spargeSalts) && `Al agua de lavado: ${saltsText(recipe.water.spargeSalts)}.`]
        .filter(Boolean)
        .join(' ') || 'Sin ajustes de sales.',
  });

  // Macerado
  if (eq.type !== 'extracto' && recipe.mashSteps.length) {
    const first = recipe.mashSteps[0];
    add({
      phase: 'macerado',
      title: `Calienta el agua a ${n1(stats.strikeTempC ?? first.tempC)} °C`,
      detail: `Para quedar en ${n1(first.tempC)} °C al mezclar con el grano a temperatura ambiente.`,
    });
    add({
      phase: 'macerado',
      title: isBiab ? 'Pon la bolsa y empasta' : 'Empasta',
      detail: 'Agrega el grano poco a poco revolviendo para que no queden grumos. Verifica la temperatura en varios puntos.',
    });
    for (const s of recipe.mashSteps) {
      add({ phase: 'macerado', title: `${s.name}: ${n1(s.tempC)} °C por ${s.timeMin} min`, timerMin: s.timeMin, detail: s === first ? 'Tapa la olla y revuelve cada 15–20 minutos.' : 'Sube la temperatura con fuego suave revolviendo constantemente.' });
    }
    add({ phase: 'macerado', title: 'Mide el pH a los 15 minutos', detail: `Estimado ${stats.mashPh ? stats.mashPh.toFixed(2) : '—'}. Objetivo 5,2–5,6 (muestra enfriada).` });
    if (eq.type === 'biab') {
      add({ phase: 'macerado', title: 'Retira la bolsa', detail: 'Déjala escurrir sobre la olla y exprímela con cuidado (con guantes).' });
    } else if (eq.type === 'biab-lavado') {
      add({ phase: 'macerado', title: `Lava la bolsa con ${n1(w.spargeWaterL)} L a 76 °C`, detail: 'Sube la bolsa a un balde o colador, riega el agua despacio y escurre todo a la olla.' });
    } else {
      add({ phase: 'macerado', title: 'Recircula hasta que salga claro (vorlauf)', detail: 'Unos 2–4 L o 10 minutos de recirculación.' });
      add({ phase: 'macerado', title: `Lava con ${n1(w.spargeWaterL)} L a 76–78 °C`, detail: 'Lento y sin compactar la cama de grano. Detén el lavado si la densidad baja de 1.010.' });
    }
  }
  add({
    phase: 'macerado',
    title: `Mide pre-hervor: ${n1(w.preBoilL)} L a ${stats.preBoilSg.toFixed(3)}`,
    detail: 'Anota volumen y densidad en "Mediciones" y la app indica si hay que corregir.',
  });

  // Hervor
  add({ phase: 'hervor', title: `Hierve ${recipe.boilTimeMin} minutos`, detail: 'Sin tapa. Cuidado con el primer hervor (espuma). ', timerMin: recipe.boilTimeMin });
  const fwh = recipe.hops.filter((h) => h.use === 'primer-mosto');
  for (const h of fwh) add({ phase: 'hervor', title: `Primer mosto: ${n1(h.amountG)} g de ${h.name}`, detail: 'Agrégalo al mosto mientras calienta, antes del hervor.' });
  const boilAdds = recipe.hops
    .filter((h) => h.use === 'hervor')
    .map((h) => ({ time: Math.min(h.time, recipe.boilTimeMin), text: `${n1(h.amountG)} g de ${h.name}` }))
    .concat(recipe.miscs.filter((m) => m.use === 'hervor').map((m) => ({ time: m.time ?? 10, text: `${n1(m.amount)} ${m.unit} de ${m.name}` })))
    .concat(recipe.fermentables.filter((f) => f.use === 'hervor').map((f) => ({ time: 10, text: `${kgTxt(f.amountKg)} de ${f.name} (disuélvelo fuera del fuego)` })));
  const byTime = new Map<number, string[]>();
  for (const a of boilAdds) byTime.set(a.time, [...(byTime.get(a.time) ?? []), a.text]);
  for (const [t, items] of [...byTime.entries()].sort((a, b) => b[0] - a[0])) {
    add({
      phase: 'hervor',
      title: t === 0 ? `Al apagar: ${items.join(' + ')}` : `Faltando ${t} min: ${items.join(' + ')}`,
      detail: t >= recipe.boilTimeMin ? 'Al inicio del hervor.' : undefined,
    });
  }
  const wp = recipe.hops.filter((h) => h.use === 'whirlpool');
  if (wp.length) {
    const temp = wp[0].tempC ?? 80;
    const time = Math.max(...wp.map((h) => h.time));
    add({
      phase: 'hervor',
      title: `Whirlpool a ${temp} °C: ${wp.map((h) => `${n1(h.amountG)} g ${h.name}`).join(' + ')}`,
      detail: `Enfría hasta ${temp} °C, agrega el lúpulo, revuelve en círculo y deja reposar ${time} min tapado.`,
      timerMin: time,
    });
  }

  // Enfriado
  const pitch = recipe.fermentation[0]?.tempC ?? 19;
  add({ phase: 'enfriado', title: `Enfría a ${n1(pitch - 1)} °C`, detail: 'Rápido y tapado para evitar contaminación. Inocular un poco por debajo de la temperatura de fermentación reduce ésteres y alcoholes superiores.' });
  add({ phase: 'enfriado', title: `Mide la OG: objetivo ${stats.og.toFixed(3)}`, detail: 'Anótala en Mediciones. Si quedó alta, puedes agregar agua hervida y fría.' });
  add({ phase: 'enfriado', title: `Trasvasa ${n1(recipe.batchSizeL)} L al fermentador`, detail: 'Deja atrás el trub. Oxigena agitando fuerte 1–2 minutos o con piedra difusora.' });
  for (const y of recipe.yeasts) {
    add({
      phase: 'enfriado',
      title: `Inocula ${y.amount} ${y.form === 'seca' ? 'sobre(s)' : 'paquete(s)'} de ${y.name}`,
      detail: y.form === 'seca' ? 'Rehidrata en 10× su peso de agua hervida a 25–30 °C por 15 min, o espolvorea directo.' : 'Deja que el paquete llegue a temperatura ambiente. Para densidades altas, haz un starter.',
    });
  }
  return steps;
}

// ---------- Correcciones con mediciones ----------

export interface PreBoilCheck {
  predictedOg: number;
  targetOg: number;
  /** Puntos de diferencia en OG (positivo = sobra). */
  deltaPoints: number;
  options: string[];
  mashEfficiencyPct?: number;
}

export function checkPreBoil(recipe: Recipe, measuredSg: number, measuredL: number): PreBoilCheck {
  const stats = computeRecipeStats(recipe);
  const shrink = 1 - recipe.equipment.coolingShrinkPct / 100;
  const pts = (measuredSg - 1) * 1000 * measuredL * shrink;
  const kettleExtra = recipe.fermentables
    .filter((f) => f.use === 'hervor')
    .reduce((s, f) => s + f.amountKg * LB_PER_KG * f.ppg * L_PER_GAL, 0);
  const boilOff = (recipe.equipment.boilOffLph * recipe.boilTimeMin) / 60;
  const postCold = (measuredL - boilOff) * shrink;
  const predictedOg = 1 + (pts + kettleExtra) / postCold / 1000;
  const targetOg = stats.og;
  const deltaPoints = (predictedOg - targetOg) * 1000;
  const options: string[] = [];
  const potential = recipe.fermentables
    .filter(isMashed)
    .reduce((s, f) => s + f.amountKg * LB_PER_KG * f.ppg * L_PER_GAL, 0);
  const mashEfficiencyPct = potential > 0 ? (pts / potential) * 100 : undefined;

  if (deltaPoints < -2) {
    const neededPost = (pts + kettleExtra) / ((targetOg - 1) * 1000) / shrink;
    const extraEvap = measuredL - boilOff - neededPost;
    const extraMin = (extraEvap / recipe.equipment.boilOffLph) * 60;
    if (extraMin > 0 && extraMin < 90) {
      options.push(`Hervir ${Math.round(extraMin)} min más (empieza a contar las adiciones de lúpulo después). Terminarás con ~${n1(neededPost * shrink)} L.`);
    }
    const dme = dmeForGravity(predictedOg, targetOg, postCold);
    options.push(`Agregar ${Math.round(dme)} g de extracto seco de malta (DME) durante el hervor.`);
    options.push('O aceptar una cerveza algo más ligera: el amargor se sentirá un poco más alto.');
  } else if (deltaPoints > 2) {
    const finalL = dilutionVolume(predictedOg, postCold, targetOg);
    options.push(`Agregar ~${n1(finalL - postCold)} L de agua hervida al final del hervor o en el fermentador para llegar a ${targetOg.toFixed(3)}. Tendrás más cerveza.`);
    options.push('O dejarla así: saldrá más fuerte y con el amargor algo más bajo en proporción.');
  } else {
    options.push('¡Vas en el objetivo! Sigue con el plan.');
  }
  return { predictedOg, targetOg, deltaPoints, options, mashEfficiencyPct };
}

/** Eficiencia de sala real con la OG y el volumen que llegaron al fermentador. */
export function brewhouseEfficiency(recipe: Recipe, og: number, fermenterL: number): number | undefined {
  const potential = recipe.fermentables.filter(isMashed).reduce((s, f) => s + f.amountKg * LB_PER_KG * f.ppg, 0);
  const nonMashed = recipe.fermentables.filter((f) => f.use !== 'macerado').reduce((s, f) => s + f.amountKg * LB_PER_KG * f.ppg, 0);
  if (potential <= 0) return undefined;
  const pts = (og - 1) * 1000 * (fermenterL / L_PER_GAL) - nonMashed;
  return (pts / potential) * 100;
}

// ---------- Fermentación ----------

export interface ScheduleItem {
  title: string;
  at: number;
  detail?: string;
}

export function fermentationSchedule(batch: Batch): ScheduleItem[] {
  const r = batch.recipe;
  const out: ScheduleItem[] = [];
  let t = batch.brewDate;
  const coldIdx = r.fermentation.findIndex((s) => s.tempC <= 5);
  const daysBeforeCold = r.fermentation.slice(0, coldIdx < 0 ? undefined : coldIdx).reduce((s, x) => s + x.days, 0);
  for (const s of r.fermentation) {
    out.push({ title: `${s.name} a ${n1(s.tempC)} °C`, at: t, detail: `${s.days} días` });
    t += s.days * DAY;
  }
  for (const h of r.hops.filter((x) => x.use === 'dry-hop')) {
    const day = Math.max(1, daysBeforeCold - h.time);
    out.push({ title: `Dry hop: ${n1(h.amountG)} g de ${h.name}`, at: batch.brewDate + day * DAY, detail: `${h.time} días de contacto` });
  }
  const inPlan = new Set((r.plan ?? []).flatMap((p) => p.items ?? []));
  for (const m of r.miscs.filter((x) => x.use === 'fermentador' && !inPlan.has(x.uid))) {
    out.push({ title: `Agregar ${n1(m.amount)} ${m.unit} de ${m.name}`, at: batch.brewDate + Math.max(3, daysBeforeCold - (m.time ?? 4)) * DAY, detail: m.notes });
  }
  out.push({ title: 'Listo para envasar', at: t });
  return out.sort((a, b) => a.at - b.at);
}

/** Densidad real de una lectura (convierte Brix si hace falta). */
export function readingSg(reading: FermentationReading, og: number, wcf = 1.04): number | undefined {
  if (reading.sg) return reading.sg;
  if (reading.brix !== undefined) {
    const ob = sgToPlato(og) * wcf;
    return refractometerFg(ob, reading.brix, wcf);
  }
  return undefined;
}

export interface FermentationStatus {
  og: number;
  expectedFg: number;
  currentSg?: number;
  attenuation?: number;
  abvNow?: number;
  progressPct?: number;
  stable: boolean;
  verdict: 'sin-datos' | 'activa' | 'terminada' | 'estancada' | 'lista';
  advice: string[];
}

export function fermentationStatus(batch: Batch): FermentationStatus {
  const stats = computeRecipeStats(batch.recipe);
  const og = batch.brewDay.ogMeasured ?? stats.og;
  // Lo que se agrega en el fermentador (fruta, azúcares) suma densidad equivalente.
  const extra = stats.ogTotal - stats.og;
  const expectedFg = og === stats.og ? stats.fg : stats.fg + (og - stats.og) * (1 - stats.attenuation / 100);
  const pts = batch.readings
    .map((r) => ({ at: r.at, sg: readingSg(r, og), temp: r.tempC }))
    .filter((r): r is { at: number; sg: number; temp: number | undefined } => r.sg !== undefined)
    .sort((a, b) => a.at - b.at);
  const advice: string[] = [];
  const yeast = batch.recipe.yeasts[0];

  const lastTemp = [...batch.readings].sort((a, b) => b.at - a.at).find((r) => r.tempC !== undefined)?.tempC;
  if (yeast && lastTemp !== undefined) {
    if (lastTemp > yeast.tempRange[1] + 1) advice.push(`La temperatura (${n1(lastTemp)} °C) está por encima del rango de ${yeast.name} (${yeast.tempRange[0]}–${yeast.tempRange[1]} °C): riesgo de alcoholes fusel y ésteres excesivos.`);
    if (lastTemp < yeast.tempRange[0] - 1) advice.push(`La temperatura (${n1(lastTemp)} °C) está por debajo del rango de ${yeast.name}: la fermentación puede detenerse.`);
  }

  if (pts.length === 0) {
    return { og, expectedFg, stable: false, verdict: 'sin-datos', advice: ['Registra la densidad cada 2–3 días para seguir la fermentación.', ...advice] };
  }
  const last = pts[pts.length - 1];
  const attenuation = apparentAttenuation(og, last.sg);
  const progressPct = Math.min(100, Math.max(0, ((og - last.sg) / (og - expectedFg)) * 100));
  const recent = pts.filter((p) => p.at >= last.at - 3 * DAY);
  const stable = recent.length >= 2 && last.at - recent[0].at >= 2 * DAY && Math.max(...recent.map((p) => p.sg)) - Math.min(...recent.map((p) => p.sg)) <= 0.001;

  let verdict: FermentationStatus['verdict'] = 'activa';
  if (stable && last.sg <= expectedFg + 0.003) {
    verdict = 'terminada';
    advice.push('Densidad estable y en el objetivo: puedes pasar al siguiente paso (dry hop, cold crash o envasado).');
  } else if (stable) {
    verdict = 'estancada';
    advice.push(
      `La densidad no baja y está ${Math.round((last.sg - expectedFg) * 1000)} puntos por encima de lo esperado.`,
      'Sube 2–3 °C la temperatura y agita suavemente el fermentador para resuspender la levadura.',
      'Si en 3 días no cambia, considera inocular una levadura muy atenuante y neutra (US-05 o Nottingham rehidratada).',
    );
  } else {
    advice.push(`Va al ${Math.round(progressPct)} % del camino hacia la FG esperada (${expectedFg.toFixed(3)}).`);
    if (progressPct > 70 && yeast?.type !== 'lager') advice.push('En la recta final: subir 1–2 °C ayuda a limpiar diacetilo y terminar la atenuación.');
    if (progressPct > 60 && yeast?.type === 'lager') advice.push('Momento del descanso de diacetilo: sube a 16–18 °C por 2–3 días.');
  }
  return { og, expectedFg, currentSg: last.sg, attenuation, abvNow: abv(og + extra - stats.unfermentedWortPts / 1000, last.sg - stats.unfermentedWortPts / 1000), progressPct, stable, verdict, advice: [...advice] };
}

// ---------- Planeado vs real ----------

export interface PlanRow {
  key: string;
  label: string;
  planned?: number;
  actual?: number;
  format: (x: number) => string;
  /** Diferencia aceptable antes de marcar desvío. */
  tolerance: number;
  status: 'ok' | 'desvio' | 'pendiente';
  plannedSource: Provenance;
  actualSource: Provenance;
  hint?: string;
}

const f1 = (x: number) => x.toLocaleString('es-CO', { maximumFractionDigits: 1 });
const sg3 = (x: number) => x.toFixed(3);

export function plannedVsActual(batch: Batch, water?: WaterIons): PlanRow[] {
  const r = batch.recipe;
  const stats = computeRecipeStats(r, water);
  const bd = batch.brewDay;
  const fs = fermentationStatus(batch);
  const done = fs.verdict === 'terminada';
  const eff = bd.ogMeasured && bd.fermenterVolumeL ? brewhouseEfficiency(r, bd.ogMeasured, bd.fermenterVolumeL) : undefined;
  const rows: Omit<PlanRow, 'status'>[] = [
    { key: 'strike', label: 'Agua de empaste', planned: stats.strikeTempC, actual: bd.strikeTempC, format: (x) => `${f1(x)} °C`, tolerance: 1.5, plannedSource: 'calculo', actualSource: 'medicion' },
    {
      key: 'mash',
      label: 'Temperatura de macerado',
      planned: mainMashTemp(r.mashSteps),
      actual: bd.mashTempC,
      format: (x) => `${f1(x)} °C`,
      tolerance: 1,
      plannedSource: 'usuario',
      actualSource: 'medicion',
      hint: 'Cada °C de diferencia mueve la atenuación ~1 punto.',
    },
    { key: 'ph', label: 'pH de macerado', planned: stats.mashPh, actual: bd.mashPH, format: (x) => x.toFixed(2), tolerance: 0.1, plannedSource: 'estimacion', actualSource: 'medicion' },
    { key: 'prevol', label: 'Volumen pre-hervor', planned: stats.water.preBoilL, actual: bd.preBoilVolumeL, format: (x) => `${f1(x)} L`, tolerance: 1, plannedSource: 'calculo', actualSource: 'medicion' },
    { key: 'presg', label: 'Densidad pre-hervor', planned: stats.preBoilSg, actual: bd.preBoilSg, format: sg3, tolerance: 0.003, plannedSource: 'calculo', actualSource: 'medicion' },
    {
      key: 'postvol',
      label: 'Volumen post-hervor',
      planned: stats.water.postBoilHotL,
      actual: bd.postBoilVolumeL,
      format: (x) => `${f1(x)} L`,
      tolerance: 1,
      plannedSource: 'calculo',
      actualSource: 'medicion',
      hint: 'Si sobra o falta, ajusta la evaporación de tu equipo.',
    },
    { key: 'og', label: 'OG', planned: stats.og, actual: bd.ogMeasured, format: sg3, tolerance: 0.003, plannedSource: 'calculo', actualSource: 'medicion' },
    { key: 'fermvol', label: 'Litros al fermentador', planned: r.batchSizeL, actual: bd.fermenterVolumeL, format: (x) => `${f1(x)} L`, tolerance: 1, plannedSource: 'usuario', actualSource: 'medicion' },
    {
      key: 'eff',
      label: 'Eficiencia de sala',
      planned: r.efficiencyPct,
      actual: eff,
      format: (x) => `${f1(x)} %`,
      tolerance: 3,
      plannedSource: 'usuario',
      actualSource: 'calculo',
      hint: 'Calculada con la OG y los litros medidos.',
    },
    { key: 'fg', label: done ? 'FG' : 'Densidad actual', planned: stats.fg, actual: fs.currentSg, format: sg3, tolerance: 0.003, plannedSource: 'estimacion', actualSource: 'medicion' },
    { key: 'att', label: 'Atenuación aparente', planned: stats.attenuation, actual: done ? fs.attenuation : undefined, format: (x) => `${f1(x)} %`, tolerance: 3, plannedSource: 'estimacion', actualSource: 'calculo' },
    { key: 'abv', label: 'ABV', planned: stats.abv, actual: done ? fs.abvNow : undefined, format: (x) => `${f1(x)} %`, tolerance: 0.3, plannedSource: 'calculo', actualSource: 'calculo' },
    {
      key: 'pkg',
      label: 'Volumen envasado',
      planned: r.batchSizeL - r.equipment.fermenterLossL,
      actual: batch.packaging?.date ? batch.packaging.volumeL : undefined,
      format: (x) => `${f1(x)} L`,
      tolerance: 1,
      plannedSource: 'calculo',
      actualSource: 'medicion',
    },
  ];
  return rows.map((row) => ({
    ...row,
    status:
      row.actual === undefined || row.planned === undefined
        ? 'pendiente'
        : Math.abs(row.actual - row.planned) <= row.tolerance + 1e-9
          ? 'ok'
          : 'desvio',
  }));
}

// ---------- Línea de tiempo ----------

export const MEASURE_LABEL: Record<BrewMeasureKey, string> = {
  strikeTempC: 'Agua de empaste',
  mashTempC: 'Temperatura de macerado',
  mashPH: 'pH de macerado',
  preBoilVolumeL: 'Volumen pre-hervor',
  preBoilSg: 'Densidad pre-hervor',
  postBoilVolumeL: 'Volumen post-hervor',
  ogMeasured: 'OG',
  fermenterVolumeL: 'Litros al fermentador',
};

const MEASURE_FMT: Record<BrewMeasureKey, (x: number) => string> = {
  strikeTempC: (x) => `${f1(x)} °C`,
  mashTempC: (x) => `${f1(x)} °C`,
  mashPH: (x) => x.toFixed(2),
  preBoilVolumeL: (x) => `${f1(x)} L`,
  preBoilSg: sg3,
  postBoilVolumeL: (x) => `${f1(x)} L`,
  ogMeasured: sg3,
  fermenterVolumeL: (x) => `${f1(x)} L`,
};

export type TimelineKind = 'paso' | 'lectura' | BatchEvent['kind'];

export interface TimelineItem {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  detail?: string;
  source: Provenance;
  /** uid del evento manual (se puede borrar). */
  eventUid?: string;
}

export function batchTimeline(batch: Batch, steps: BrewStep[]): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: 'creado',
      at: batch.createdAt,
      kind: 'estado',
      title: batch.historical
        ? `Lote importado del historial${batch.recipeVersionNumber ? ` (receta V${batch.recipeVersionNumber})` : ''}`
        : `Lote creado${batch.recipeVersionNumber ? ` desde la versión V${batch.recipeVersionNumber}` : ''}`,
      source: batch.historical ? 'registro' : 'usuario',
    },
  ];
  for (const st of steps) {
    const at = batch.brewDay.done[st.id];
    if (typeof at === 'number') items.push({ id: `paso-${st.id}`, at, kind: 'paso', title: st.title, source: 'usuario' });
  }
  for (const [k, at] of Object.entries(batch.brewDay.measuredAt ?? {}) as [BrewMeasureKey, number][]) {
    const v = batch.brewDay[k];
    if (typeof v === 'number') items.push({ id: `med-${k}`, at, kind: 'medicion', title: `${MEASURE_LABEL[k]}: ${MEASURE_FMT[k](v)}`, source: 'medicion' });
  }
  const og = batch.brewDay.ogMeasured ?? computeRecipeStats(batch.recipe).og;
  for (const rd of batch.readings) {
    const sg = readingSg(rd, og);
    const parts = [
      sg !== undefined && `${sg.toFixed(3)}${rd.brix !== undefined ? ` (${f1(rd.brix)} °Bx)` : ''}`,
      rd.tempC !== undefined && `${f1(rd.tempC)} °C`,
      rd.pressurePsi !== undefined && `${f1(rd.pressurePsi)} PSI`,
      rd.ph !== undefined && `pH ${rd.ph.toFixed(2)}`,
    ].filter(Boolean);
    items.push({ id: `lec-${rd.uid}`, at: rd.at, kind: 'lectura', title: `Lectura: ${parts.join(' · ') || 'sin valores'}`, detail: rd.note, source: 'medicion' });
  }
  for (const ev of batch.events ?? []) {
    const parts = [
      ev.tempC !== undefined && `${f1(ev.tempC)} °C`,
      ev.volumeL !== undefined && `${f1(ev.volumeL)} L`,
      ev.sg !== undefined && ev.sg.toFixed(3),
      ev.ph !== undefined && `pH ${ev.ph.toFixed(2)}`,
    ].filter(Boolean);
    items.push({ id: `ev-${ev.uid}`, at: ev.at, kind: ev.kind, title: ev.text, detail: parts.join(' · ') || undefined, source: ev.source ?? 'usuario', eventUid: ev.uid });
  }
  if (batch.packaging?.date) {
    const p = batch.packaging;
    items.push({
      id: 'envasado',
      at: p.date!,
      kind: 'estado',
      title: `Envasado en ${p.method === 'botella' ? 'botella' : 'barril'}${p.volumeL ? `: ${f1(p.volumeL)} L` : ''}`,
      detail: p.method === 'botella' && p.sugarG ? `${f1(p.sugarG)} g de azúcar` : p.psi ? `${f1(p.psi)} PSI` : undefined,
      source: 'medicion',
    });
  }
  return items.sort((a, b) => a.at - b.at);
}
