// Plan de fermentación por condiciones: con las lecturas del lote (densidad y pH) dice si un paso
// ya se puede hacer, qué falta y, para los pasos con tiempo de contacto, cuánto lleva.

import { readingSg } from './batch';
import { computeRecipeStats } from './calc/recipeStats';
import type { Batch, PlanCondition, PlanStep } from './types';

const DAY = 86_400_000;
const f3 = (x: number) => x.toFixed(3);
const f1 = (x: number) => x.toFixed(1).replace('.', ',');

export interface ConditionCheck {
  ok: boolean;
  text: string;
}

export interface StepStatus {
  step: PlanStep;
  done?: number;
  ready: boolean;
  checks: ConditionCheck[];
  /** Pasos con contacto (cacao): días que lleva y si ya está en la ventana. */
  contact?: { days: number; min: number; max: number; state: 'antes' | 'ventana' | 'pasado' };
}

function points(batch: Batch) {
  const stats = computeRecipeStats(batch.recipe);
  const og = batch.brewDay.ogMeasured ?? stats.og;
  const sg = batch.readings
    .map((r) => ({ at: r.at, sg: readingSg(r, og) }))
    .filter((r): r is { at: number; sg: number } => r.sg !== undefined)
    .sort((a, b) => a.at - b.at);
  const ph = batch.readings.filter((r) => r.ph !== undefined).sort((a, b) => a.at - b.at);
  return { og, sg, ph };
}

export function checkCondition(c: PlanCondition, batch: Batch, now = Date.now()): ConditionCheck {
  const { og, sg, ph } = points(batch);
  const lastSg = sg[sg.length - 1];
  switch (c.kind) {
    case 'ph-max': {
      const last = ph[ph.length - 1];
      return { ok: !!last && last.ph! <= c.value, text: `pH ≤ ${f1(c.value)}${last ? ` (último: ${f1(last.ph!)})` : ' — registra el pH'}` };
    }
    case 'sg-drop': {
      const drop = lastSg ? (og - lastSg.sg) * 1000 : 0;
      return { ok: drop >= c.points, text: `Densidad ${c.points} puntos por debajo de la OG${lastSg ? ` (bajó ${Math.round(drop)}: ${f3(lastSg.sg)})` : ' — registra la densidad'}` };
    }
    case 'sg-dropping': {
      const prev = [...sg].reverse().find((p) => lastSg && p.at <= lastSg.at - 0.75 * DAY);
      const ok = !!(lastSg && prev && prev.sg - lastSg.sg >= 0.002);
      return { ok, text: `La densidad sigue bajando${lastSg && prev ? ` (${f3(prev.sg)} → ${f3(lastSg.sg)})` : ' — dos lecturas separadas al menos un día'}` };
    }
    case 'sg-stable': {
      const recent = lastSg ? sg.filter((p) => p.at >= lastSg.at - c.days * DAY) : [];
      const span = recent.length >= 2 ? (lastSg.at - recent[0].at) / DAY : 0;
      const delta = recent.length ? Math.max(...recent.map((p) => p.sg)) - Math.min(...recent.map((p) => p.sg)) : 1;
      const ok = recent.length >= 2 && span >= c.days - 0.25 && delta <= 0.001;
      return { ok, text: `Densidad estable ${c.days} días${recent.length >= 2 ? ` (variación ${Math.round(delta * 1000)} puntos en ${f1(span)} días)` : ' — lecturas de varios días'}` };
    }
    case 'days-after': {
      const t = batch.planDone?.[c.step];
      const days = t ? (now - t) / DAY : 0;
      return { ok: !!t && days >= c.days, text: t ? `${c.days} días después del paso anterior (van ${f1(days)})` : `Después del paso anterior + ${c.days} días` };
    }
  }
}

/** Estado de cada paso del plan con las lecturas del lote. */
export function planStatus(batch: Batch, now = Date.now()): StepStatus[] {
  const plan = batch.recipe.plan ?? [];
  return plan.map((step) => {
    const done = batch.planDone?.[step.uid];
    const checks = (step.conditions ?? []).map((c) => checkCondition(c, batch, now));
    const st: StepStatus = { step, done, ready: checks.every((c) => c.ok), checks };
    if (done && step.contactDays) {
      const days = (now - done) / DAY;
      const [min, max] = step.contactDays;
      st.contact = { days, min, max, state: days < min ? 'antes' : days <= max ? 'ventana' : 'pasado' };
    }
    return st;
  });
}

/** Primer paso sin hacer (el que toca). */
export const nextStep = (s: StepStatus[]) => s.find((x) => !x.done);

/** Condición en palabras (para la ficha del diseño). */
export function conditionText(c: PlanCondition, plan: PlanStep[] = []): string {
  switch (c.kind) {
    case 'ph-max':
      return `pH ≤ ${f1(c.value)}`;
    case 'sg-drop':
      return `densidad ${c.points} puntos por debajo de la OG (fermentación activa)`;
    case 'sg-dropping':
      return 'la densidad sigue bajando';
    case 'sg-stable':
      return `densidad estable ${c.days} días`;
    case 'days-after':
      return `${c.days} días después de «${plan.find((p) => p.uid === c.step)?.title ?? 'el paso anterior'}»`;
  }
}
