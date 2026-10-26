// Temporizadores del día de cocción propuestos según la receta. El cervecero los ajusta:
// minutos, avisos y la nota de qué espera en cada momento.

import { uid } from './calc/units';
import type { BrewTimer, Recipe, TimerAlertDef } from './types';

const n0 = (x: number) => Math.round(x).toLocaleString('es-CO');
const alert = (atMin: number, from: TimerAlertDef['from'], text: string, note?: string): TimerAlertDef => ({ uid: uid(), atMin, from, text, ...(note ? { note } : {}) });

function hopNote(time: number, boil: number): string {
  if (time >= boil - 1) return 'Amargor: revuelve para que no se acumule espuma.';
  if (time >= 30) return 'Amargor.';
  if (time >= 10) return 'Sabor y algo de amargor.';
  if (time > 0) return 'Aroma: queda poco tiempo de hervor.';
  return 'Al apagar el fuego.';
}

export function defaultTimers(r: Recipe): BrewTimer[] {
  const out: BrewTimer[] = [];
  r.mashSteps.forEach((s, i) => {
    const alerts: TimerAlertDef[] = [];
    if (i === 0 && s.timeMin >= 20) alerts.push(alert(15, 'inicio', 'Medir el pH', 'Muestra enfriada a temperatura ambiente; objetivo 5,2–5,6.'));
    if (s.timeMin >= 40) alerts.push(alert(Math.round(s.timeMin / 2), 'inicio', 'Revolver y revisar la temperatura', `Debe seguir cerca de ${s.tempC} °C.`));
    out.push({ uid: uid(), phase: 'macerado', label: `${s.name} · ${s.tempC} °C`, minutes: s.timeMin, alerts });
  });
  const boil = r.boilTimeMin;
  if (boil > 0) {
    const alerts: TimerAlertDef[] = [];
    for (const h of r.hops) {
      if (h.use === 'primer-mosto') continue;
      if (h.use === 'hervor') alerts.push(alert(Math.min(h.time, boil), 'faltan', `${n0(h.amountG)} g de ${h.name}`, hopNote(Math.min(h.time, boil), boil)));
    }
    for (const m of r.miscs) {
      if (m.use === 'hervor' && m.time !== undefined) alerts.push(alert(m.time, 'faltan', m.amount > 0 ? `${m.amount} ${m.unit} de ${m.name}` : m.name, m.notes));
    }
    for (const f of r.fermentables) {
      if (f.use === 'hervor' && f.timeMin !== undefined) alerts.push(alert(Math.min(f.timeMin, boil), 'faltan', `${n0(f.amountKg * 1000)} g de ${f.name}`, 'Disolver bien para que no se pegue al fondo.'));
    }
    if (boil >= 20) alerts.push(alert(15, 'faltan', 'Sanitizar el enfriador', 'Sumérgelo en el mosto hirviendo para que quede sanitizado.'));
    alerts.sort((a, b) => b.atMin - a.atMin);
    out.push({ uid: uid(), phase: 'hervor', label: 'Hervor', minutes: boil, note: 'Sin tapa: se evapora el DMS.', alerts });
  }
  const wp = r.hops.filter((h) => h.use === 'whirlpool');
  if (wp.length) {
    const minutes = Math.max(10, ...wp.map((h) => h.time || 0));
    const temp = wp.find((h) => h.tempC)?.tempC;
    out.push({
      uid: uid(),
      phase: 'whirlpool',
      label: `Whirlpool${temp ? ` · ${temp} °C` : ''}`,
      minutes,
      note: temp ? `Enfría hasta ${temp} °C antes de agregar los lúpulos.` : undefined,
      alerts: wp.map((h) => alert(0, 'inicio', `${n0(h.amountG)} g de ${h.name}`, 'Al iniciar el whirlpool.')),
    });
  }
  return out;
}

/** Minutos restantes en los que suena el aviso. */
export const alertRemainingMin = (t: Pick<BrewTimer, 'minutes'>, a: TimerAlertDef) => (a.from === 'faltan' ? a.atMin : t.minutes - a.atMin);

export const newTimer = (): BrewTimer => ({ uid: uid(), phase: 'otro', label: 'Temporizador', minutes: 10, alerts: [] });
export const newAlert = (): TimerAlertDef => alert(5, 'faltan', 'Aviso');
