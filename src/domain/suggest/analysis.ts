import type { Catalog } from '../catalog';
import { byId } from '../catalog';
import { hopIbu } from '../calc/bitterness';
import type { RecipeStats } from '../calc/recipeStats';
import { pitchAdvice } from '../yeastAdvice';
import { L_PER_GAL, LB_PER_KG, ebcToLovibond } from '../calc/units';
import { ACID_LABEL, acidForTargetPh, recipeAcid, withAcid } from '../calc/water';
import { applyWaterTarget, fitColor, fermentableFromCatalog, nearEdge, scaleToOg, yeastFromCatalog } from '../recipeFactory';
import type { AcidChoice, Recipe, SaltId, Style, WaterIons } from '../types';
import { hopsForStyle, yeastsForStyle } from './substitutes';

export type Severity = 'problema' | 'aviso' | 'idea';
export type Area = 'densidad' | 'amargor' | 'color' | 'levadura' | 'lupulo' | 'malta' | 'agua' | 'proceso' | 'volumen';

export interface Suggestion {
  id: string;
  /** Clave estable (área + título) para recordar decisiones del cervecero. */
  key: string;
  /** Viene de comparar con el estilo (sujeta al modo de diseño). */
  fromStyle?: boolean;
  /** Marcada por el cervecero como desviación intencional, con su motivo. */
  intentional?: string;
  severity: Severity;
  area: Area;
  title: string;
  detail: string;
  actions?: { label: string; apply: (r: Recipe) => Recipe }[];
}

export type FitLevel = 'dentro' | 'cerca' | 'fuera';

export function fit(value: number, [lo, hi]: [number, number], tolerance: number): FitLevel {
  if (value >= lo && value <= hi) return 'dentro';
  if (value >= lo - tolerance && value <= hi + tolerance) return 'cerca';
  return 'fuera';
}

const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const f3 = (n: number) => n.toFixed(3);
const f0 = (n: number) => Math.round(n).toString();

export interface AnalysisInput {
  recipe: Recipe;
  stats: RecipeStats;
  style?: Style;
  catalog: Catalog;
  sourceWater?: WaterIons;
  targetWater?: WaterIons;
  availableSalts?: SaltId[];
  /** Ácido que usa el cervecero. */
  acid?: AcidChoice;
}

export function analyzeRecipe({ recipe, stats, style, catalog, sourceWater, targetWater, availableSalts, acid: prefAcid }: AnalysisInput): Suggestion[] {
  const acid = recipeAcid(recipe.water, prefAcid);
  const out: Suggestion[] = [];
  const add = (s: Omit<Suggestion, 'id' | 'key'>) => out.push({ ...s, id: `${s.area}-${out.length}`, key: `${s.area}:${s.title}` });

  // ---------- Volúmenes y equipo ----------
  for (const w of stats.water.warnings) add({ severity: 'aviso', area: 'volumen', title: 'Volumen del equipo', detail: w });

  if (recipe.fermentables.length === 0) {
    add({ severity: 'problema', area: 'malta', title: 'Sin fermentables', detail: 'Agrega maltas o genera la receta desde el estilo.' });
    return out;
  }

  // ---------- Estilo ----------
  const styleStart = out.length;
  if (style) {
    // Lo que la guía no fija (rango abierto) no se revisa contra el estilo.
    const R = { ...style.ranges };
    for (const k of style.openRanges ?? []) R[k] = [-Infinity, Infinity];

    // Densidad original
    if (stats.og < R.og[0] || stats.og > R.og[1]) {
      const low = stats.og < R.og[0];
      add({
        severity: fit(stats.og, R.og, 0.004) === 'cerca' ? 'aviso' : 'problema',
        area: 'densidad',
        title: low ? 'Densidad original baja para el estilo' : 'Densidad original alta para el estilo',
        detail: `OG ${f3(stats.og)} y el estilo pide ${f3(R.og[0])}–${f3(R.og[1])}. ${
          low ? 'Sube la malta base' : 'Baja la malta base'
        } para llegar a ${f3(mid(R.og))}, sin tocar las maltas de carácter.`,
        actions: [{ label: `Ajustar malta base a OG ${f3(mid(R.og))}`, apply: (r) => roundRecipe(scaleToOg(r, mid(R.og), true)) }],
      });
    }

    // Densidad final y atenuación
    if (stats.fg > R.fg[1] + 0.001) {
      const yeasts = yeastsForStyle(style, catalog).filter((y) => y.attenuation > stats.attenuation + 2).slice(0, 3);
      const actions: Suggestion['actions'] = [];
      if (stats.mashTempC && stats.mashTempC > 63) {
        actions.push({ label: 'Bajar el macerado 2 °C', apply: (r) => shiftMash(r, -2) });
      }
      for (const y of yeasts) actions.push({ label: `Usar ${y.name}`, apply: (r) => replaceYeast(r, y.id, catalog) });
      add({
        severity: 'aviso',
        area: 'densidad',
        title: 'Quedará más dulce de lo que pide el estilo',
        detail: `FG estimada ${f3(stats.fg)} (estilo ${f3(R.fg[0])}–${f3(R.fg[1])}). Opciones: macerar más bajo (63–65 °C), una levadura más atenuante o reemplazar 5–10 % de la malta por azúcar.`,
        actions,
      });
    } else if (stats.fg < R.fg[0] - 0.001) {
      const actions: Suggestion['actions'] = [];
      if (stats.mashTempC && stats.mashTempC < 69) actions.push({ label: 'Subir el macerado 2 °C', apply: (r) => shiftMash(r, 2) });
      const yeasts = yeastsForStyle(style, catalog).filter((y) => y.attenuation < stats.attenuation - 2).slice(0, 2);
      for (const y of yeasts) actions.push({ label: `Usar ${y.name}`, apply: (r) => replaceYeast(r, y.id, catalog) });
      add({
        severity: 'aviso',
        area: 'densidad',
        title: 'Quedará más seca de lo que pide el estilo',
        detail: `FG estimada ${f3(stats.fg)} (estilo ${f3(R.fg[0])}–${f3(R.fg[1])}). Macera más alto (67–69 °C), agrega Carafoam o usa una levadura menos atenuante.`,
        actions,
      });
    }

    // Amargor
    if (stats.ibu < R.ibu[0] || stats.ibu > R.ibu[1]) {
      const bitter = [...recipe.hops]
        .filter((h) => h.use === 'hervor' || h.use === 'primer-mosto')
        .sort((a, b) => b.time - a.time)[0];
      const target = mid(R.ibu);
      const actions: Suggestion['actions'] = [];
      if (bitter) {
        const per = hopIbu({ ...bitter, amountG: 1 }, stats.boilGravity, stats.water.postBoilHotL, recipe.boilTimeMin);
        const others = stats.ibu - (stats.ibuByUid[bitter.uid] ?? 0);
        const grams = per > 0 ? Math.max(0, (target - others) / per) : 0;
        if (grams > 0) {
          actions.push({
            label: `${bitter.name} a ${f0(grams)} g (${f0(target)} IBU)`,
            apply: (r) => ({ ...r, hops: r.hops.map((h) => (h.uid === bitter.uid ? { ...h, amountG: Math.round(grams) } : h)) }),
          });
        }
      }
      const tooHigh = stats.ibu > R.ibu[1];
      add({
        severity: fit(stats.ibu, R.ibu, 5) === 'cerca' ? 'aviso' : 'problema',
        area: 'amargor',
        title: tooHigh ? 'Demasiado amarga para el estilo' : 'Le falta amargor para el estilo',
        detail: `${f0(stats.ibu)} IBU y el estilo pide ${R.ibu[0]}–${R.ibu[1]}. ${
          bitter
            ? `Ajusta la adición de amargor (${bitter.name}, ${bitter.time} min).`
            : 'Agrega una adición de amargor a 60 minutos.'
        }${tooHigh && !bitter ? ' Las adiciones de whirlpool también suman IBU.' : ''}`,
        actions,
      });
    }

    // Color
    if (stats.srm < R.srm[0] - 0.5 || stats.srm > R.srm[1] + 0.5) {
      const target = nearEdge(stats.srm, R.srm);
      const actions: Suggestion['actions'] = [];
      const hasColor = recipe.fermentables.some((f) => f.colorEBC >= 10 && f.type !== 'base' && f.type !== 'adjunto');
      if (hasColor) actions.push({ label: `Ajustar maltas de color a ${target.toFixed(1)} SRM`, apply: (r) => roundRecipe(fitColor(r, target)) });
      if (stats.srm < R.srm[0]) {
        const pick = target > 18 ? 'carafa-2' : target > 9 ? 'caramunich-2' : 'caramunich-1';
        const cand = byId(catalog.fermentables, pick);
        if (cand) {
          const kg = kgForSrm(recipe, stats, cand.colorEBC, target);
          if (kg > 0) {
            actions.push({
              label: `Agregar ${Math.round(kg * 1000)} g de ${cand.name}`,
              apply: (r) => roundRecipe(scaleToOg({ ...r, fermentables: [...r.fermentables, fermentableFromCatalog(cand, kg)] }, stats.og, true)),
            });
          }
        }
      }
      add({
        severity: 'aviso',
        area: 'color',
        title: stats.srm < R.srm[0] ? 'Más clara que el estilo' : 'Más oscura que el estilo',
        detail: `${stats.srm.toFixed(1)} SRM (${f0(stats.ebc)} EBC); el estilo pide ${R.srm[0]}–${R.srm[1]} SRM.${
          stats.srm < R.srm[0] && target > 18
            ? ' Para oscurecer sin agregar tostado áspero, usa Carafa Special (desamargada).'
            : ''
        }`,
        actions,
      });
    }

    // Levadura vs estilo
    const okFamilies = style.guide.yeastFamilies;
    const recommended = yeastsForStyle(style, catalog).slice(0, 4);
    if (recipe.yeasts.length === 0) {
      add({
        severity: 'problema',
        area: 'levadura',
        title: 'Falta la levadura',
        detail: `Para ${style.name} se recomiendan: ${recommended.map((y) => y.name).join(', ')}.`,
        actions: recommended.slice(0, 3).map((y) => ({ label: `Agregar ${y.name}`, apply: (r: Recipe) => replaceYeast(r, y.id, catalog) })),
      });
    } else {
      for (const y of recipe.yeasts) {
        if (y.family && !okFamilies.includes(y.family)) {
          add({
            severity: 'aviso',
            area: 'levadura',
            title: `${y.name} no es típica de ${style.name}`,
            detail: `El estilo pide un perfil de levadura distinto. Mejores opciones: ${recommended.map((r) => r.name).join(', ')}.`,
            actions: recommended.slice(0, 3).map((r) => ({ label: `Cambiar por ${r.name}`, apply: (rec: Recipe) => replaceYeast(rec, r.id, catalog, y.uid) })),
          });
        }
      }
    }

    // Lúpulos de aroma fuera del origen típico
    const lateHops = recipe.hops.filter((h) => h.use !== 'hervor' || h.time <= 20);
    const offOrigin = lateHops.filter((h) => {
      const hop = byId(catalog.hops, h.ingredientId);
      return hop && !style.guide.hopOrigins.includes(hop.origin);
    });
    if (offOrigin.length) {
      const alts = hopsForStyle(style, catalog, 5).map((h) => h.name);
      add({
        severity: 'idea',
        area: 'lupulo',
        title: 'Lúpulos de aroma poco tradicionales para el estilo',
        detail: `${[...new Set(offOrigin.map((h) => h.name))].join(', ')} no es del origen típico. Si buscas fidelidad al estilo prueba: ${alts.join(', ')}. Si es una versión moderna, ¡adelante!`,
      });
    }

    // Faltan lúpulos de aroma en estilos lupulados
    const hoppyStyle = ['american-pale-ale', 'american-ipa', 'hazy-ipa', 'double-ipa'].includes(style.id);
    const aromaG = recipe.hops.filter((h) => h.use === 'whirlpool' || h.use === 'dry-hop').reduce((s, h) => s + h.amountG, 0);
    if (hoppyStyle && aromaG / recipe.batchSizeL < 4) {
      add({
        severity: 'aviso',
        area: 'lupulo',
        title: 'Poco lúpulo de aroma para el estilo',
        detail: `Tienes ${(aromaG / recipe.batchSizeL).toFixed(1)} g/L entre whirlpool y dry-hop. Para ${style.name} se usan entre 6 y 15 g/L.`,
      });
    }
  }

  for (let i = styleStart; i < out.length; i++) out[i].fromStyle = true;

  // ---------- Grano ----------
  for (const f of recipe.fermentables) {
    const cat = byId(catalog.fermentables, f.ingredientId);
    const pct = stats.pctByUid[f.uid] ?? 0;
    // El máximo de la maltería es una recomendación conservadora: superarlo es información;
    // duplicarlo sí es un aviso (p. ej. una Irish Stout clásica lleva ~10 % de cebada tostada).
    if (cat?.maxPct && pct > cat.maxPct + 0.5) {
      const far = pct > cat.maxPct * 2;
      add({
        severity: far ? 'aviso' : 'idea',
        area: 'malta',
        title: `Mucho ${f.name}`,
        detail: `Está en ${pct.toFixed(0)} % del grano; ${cat.maker ? `${cat.maker} recomienda` : 'lo recomendado es'} hasta ${cat.maxPct} %.${far ? ' Al doble del máximo puede dominar la cerveza.' : ' Es común superarlo en estilos que buscan ese carácter.'}`,
      });
    }
  }
  const crystalPct = recipe.fermentables.filter((f) => f.type === 'caramelo').reduce((s, f) => s + (stats.pctByUid[f.uid] ?? 0), 0);
  if (crystalPct > 20) {
    add({ severity: 'aviso', area: 'malta', title: 'Exceso de maltas caramelo', detail: `${crystalPct.toFixed(0)} % del grano es caramelo; puede quedar empalagosa. Lo usual es menos de 15 %.` });
  }
  const pilsPct = recipe.fermentables
    .filter((f) => f.ingredientId?.startsWith('pilsner'))
    .reduce((s, f) => s + (stats.pctByUid[f.uid] ?? 0), 0);
  if (pilsPct > 50 && recipe.boilTimeMin < 75) {
    add({
      severity: 'idea',
      area: 'proceso',
      title: 'Considera hervir 90 minutos',
      detail: 'Con más de 50 % de malta Pilsner, un hervor de 90 minutos destapado reduce el riesgo de DMS (aroma a maíz cocido).',
      actions: [{ label: 'Hervor de 90 min', apply: (r) => ({ ...r, boilTimeMin: 90 }) }],
    });
  }

  // ---------- Levadura: cantidad y temperatura ----------
  for (const y of recipe.yeasts) {
    const pr = pitchAdvice(stats.og, recipe.batchSizeL, y, y.amount);
    if (y.amount < pr.packs) {
      add({
        severity: 'aviso',
        area: 'levadura',
        title: `Poca levadura: ${y.name}`,
        detail: pr.steps[0]?.startsWith('Según')
          ? pr.steps[0]
          : `Para ${recipe.batchSizeL} L a OG ${f3(stats.og)} necesitas unos ${f0(pr.cellsNeededB)} mil millones de células: ${pr.packs} ${
              y.form === 'seca' ? 'sobres de 11,5 g' : 'paquetes (o un starter)'
            }.`,
        actions: [{ label: `Usar ${pr.packs}`, apply: (r) => ({ ...r, yeasts: r.yeasts.map((x) => (x.uid === y.uid ? { ...x, amount: pr.packs } : x)) }) }],
      });
    }
    const primary = recipe.fermentation[0];
    if (primary && (primary.tempC < y.tempRange[0] - 1 || primary.tempC > y.tempRange[1] + 1)) {
      const t = Math.round((y.tempRange[0] + y.tempRange[1]) / 2);
      add({
        severity: 'aviso',
        area: 'levadura',
        title: 'Temperatura de fermentación fuera del rango de la levadura',
        detail: `${y.name} trabaja entre ${y.tempRange[0]} y ${y.tempRange[1]} °C y planeas ${primary.tempC} °C.`,
        actions: [{ label: `Primaria a ${t} °C`, apply: (r) => ({ ...r, fermentation: r.fermentation.map((s, i) => (i === 0 ? { ...s, tempC: t } : s)) }) }],
      });
    }
  }

  // ---------- Usos de los fermentables ----------
  for (const f of recipe.fermentables) {
    if (f.use === 'macerado' && ['azucar', 'no-fermentable', 'extracto'].includes(f.type)) {
      add({
        severity: 'idea',
        area: 'proceso',
        title: `${f.name} no se macera`,
        detail: 'Los azúcares, extractos y no fermentables no pasan por la sacarificación: se cuentan enteros, sin la eficiencia del macerado. Van en el hervor (o en el fermentador).',
        actions: [{ label: 'Pasar al hervor', apply: (r) => ({ ...r, fermentables: r.fermentables.map((x) => (x.uid === f.uid ? { ...x, use: 'hervor', timeMin: x.timeMin ?? 10 } : x)) }) }],
      });
    }
  }
  const aging = recipe.fermentables.filter((f) => f.use === 'maduracion');
  if (aging.length) {
    add({
      severity: 'idea',
      area: 'proceso',
      title: 'Adiciones en maduración (sin fermentar)',
      detail: `${aging.map((f) => f.name).join(', ')}: se calculan como dulzor y densidad final, sin alcohol. Solo es así si la levadura ya no trabaja: en barril frío funciona; en botella, el azúcar puede refermentar y sobrecarbonatar. Mantén en frío o estabiliza antes de envasar.`,
    });
  }

  // ---------- Agua ----------
  if (!sourceWater) {
    add({ severity: 'idea', area: 'agua', title: 'Configura tu agua', detail: 'Elige tu perfil de agua (o crea uno con el análisis de tu acueducto) para estimar el pH y ajustar sales.' });
  } else if (stats.mashWater && stats.mashPh !== undefined) {
    const ph = stats.mashPh;
    if (ph > 5.6 || ph < 5.2) {
      const actions: Suggestion['actions'] = [];
      if (ph > 5.6) {
        const ml = acidForTargetPh(
          {
            fermentables: recipe.fermentables,
            water: stats.mashWater,
            mashWaterL: stats.water.mashWaterL,
            lacticMl: 0,
            lacticPct: recipe.water.lacticPct,
            phosphoricMl: 0,
            phosphoricPct: recipe.water.phosphoricPct,
          },
          5.4,
          acid,
        );
        actions.push({ label: `${ACID_LABEL[acid.type]} ${ml.toFixed(1)} mL`, apply: (r) => ({ ...r, water: withAcid(r.water, acid, ml) }) });
      }
      add({
        severity: 'aviso',
        area: 'agua',
        title: ph > 5.6 ? 'pH de macerado alto' : 'pH de macerado bajo',
        detail: `pH estimado ${ph.toFixed(2)}; lo ideal es 5,2–5,6 (5,3–5,4 para cervezas claras y lupuladas). ${
          ph < 5.2 ? 'Quita ácido o agrega bicarbonato de sodio en el macerado (típico en cervezas muy oscuras).' : ''
        }`,
        actions,
      });
    }
    const w = stats.kettleWater ?? stats.mashWater;
    if (w.ca < 40) add({ severity: 'idea', area: 'agua', title: 'Calcio bajo', detail: `${f0(w.ca)} ppm. Entre 50 y 150 ppm ayuda a las enzimas, la claridad y la floculación.` });
    if (w.na > 150) add({ severity: 'aviso', area: 'agua', title: 'Sodio alto', detail: `${f0(w.na)} ppm puede dar sabor salado o metálico.` });
    if (w.mg > 40) add({ severity: 'aviso', area: 'agua', title: 'Magnesio alto', detail: `${f0(w.mg)} ppm puede dar amargor áspero.` });
    // Con agua casi sin sulfato ni cloruro la relación no significa nada: ya lo cubre "Calcio bajo".
    if (targetWater && w.so4 + w.cl >= 10) {
      const current = w.cl > 0 ? w.so4 / w.cl : 99;
      const want = targetWater.cl > 0 ? targetWater.so4 / targetWater.cl : 99;
      const far = Math.abs(Math.log((current + 0.01) / (want + 0.01))) > 0.7;
      if (far) {
        add({
          severity: 'idea',
          area: 'agua',
          title: 'El balance sulfato/cloruro no se parece al objetivo',
          detail: `Tienes ${current.toFixed(1)} y el perfil objetivo tiene ${want.toFixed(1)}.`,
          actions: [{ label: 'Calcular sales automáticamente', apply: (r) => applyWaterTarget(r, sourceWater, targetWater, 5.4, availableSalts, acid) }],
        });
      }
    }
  }

  return applyPolicy(out, recipe, style);
}

/**
 * El modo decide cómo pesa salirse del estilo:
 * competencia → más estricto; moderna → información; libre → el estilo es solo referencia.
 * Lo marcado como intencional nunca se muestra como problema.
 */
function applyPolicy(list: Suggestion[], recipe: Recipe, style?: Style): Suggestion[] {
  const mode = recipe.intent?.mode ?? 'tradicional';
  const stricter: Record<Severity, Severity> = { idea: 'aviso', aviso: 'problema', problema: 'problema' };
  let out = list.flatMap((sg): Suggestion[] => {
    if (!sg.fromStyle || sg.title === 'Falta la levadura') return [sg];
    if (mode === 'competencia') return [{ ...sg, severity: stricter[sg.severity] }];
    if (mode === 'moderna') {
      if (sg.area === 'lupulo' && sg.severity === 'idea') return [];
      return [{ ...sg, severity: 'idea', detail: `${sg.detail} En una interpretación moderna puede ser una desviación válida si acerca el perfil que buscas.` }];
    }
    if (mode === 'libre') return [];
    return [sg];
  });
  if (mode === 'libre' && style) {
    out.unshift({
      id: 'libre',
      key: 'estilo:libre',
      severity: 'idea',
      area: 'proceso',
      title: 'Diseño libre',
      detail: `${style.name} se usa solo como referencia: no se marcan desviaciones del estilo. Cambia el modo en la pestaña Intención si quieres que se evalúe.`,
    });
  }
  const dev = recipe.deviations ?? {};
  out = out.map((sg) => (dev[sg.key] !== undefined ? { ...sg, severity: 'idea' as const, intentional: dev[sg.key] || 'Sin motivo anotado' } : sg));
  // Primero lo pendiente, al final lo ya decidido.
  return [...out.filter((x) => !x.intentional), ...out.filter((x) => x.intentional)];
}

function shiftMash(r: Recipe, delta: number): Recipe {
  const main = r.mashSteps.filter((s) => s.tempC >= 60 && s.tempC <= 73).sort((a, b) => b.timeMin - a.timeMin)[0];
  if (!main) return r;
  return { ...r, mashSteps: r.mashSteps.map((s) => (s.uid === main.uid ? { ...s, tempC: s.tempC + delta } : s)) };
}

function replaceYeast(r: Recipe, yeastId: string, catalog: Catalog, replaceUid?: string): Recipe {
  const y = byId(catalog.yeasts, yeastId);
  if (!y) return r;
  const ny = yeastFromCatalog(y, r.yeasts.find((x) => x.uid === replaceUid)?.amount ?? 1);
  const yeasts = replaceUid ? r.yeasts.map((x) => (x.uid === replaceUid ? ny : x)) : [ny];
  return { ...r, yeasts };
}

function kgForSrm(recipe: Recipe, stats: RecipeStats, ebc: number, targetSrm: number): number {
  const gal = stats.water.postBoilColdL / L_PER_GAL;
  const currentMcu = recipe.fermentables.reduce((s, f) => s + (f.amountKg * LB_PER_KG * ebcToLovibond(f.colorEBC)) / gal, 0);
  const targetMcu = (targetSrm / 1.4922) ** (1 / 0.6859);
  const lb = ((targetMcu - currentMcu) * gal) / ebcToLovibond(ebc);
  return Math.max(0, Math.round((lb / LB_PER_KG) * 1000) / 1000);
}

function roundRecipe(r: Recipe): Recipe {
  return {
    ...r,
    fermentables: r.fermentables.map((f) => ({
      ...f,
      amountKg: f.amountKg >= 1 ? Math.round(f.amountKg * 100) / 100 : Math.round(f.amountKg * 1000) / 1000,
    })),
  };
}

