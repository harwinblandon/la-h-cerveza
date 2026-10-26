// Consejos de levadura: cuántas células hay frente a las que pide el mosto, qué hacer
// si no alcanzan, y por qué una cepa no es la típica de un estilo (sin prohibirla).

import { YEAST_FAMILY_LABEL } from '../data/yeasts';
import { pitchRate } from './calc/tools';
import type { RecipeYeast, Style } from './types';

export interface PitchAdvice {
  cellsNeededB: number;
  cellsAvailableB: number;
  /** Disponibles / necesarias. */
  ratio: number;
  /** Paquetes recomendados. */
  packs: number;
  level: 'ok' | 'justo' | 'bajo' | 'muy-bajo';
  summary: string;
  steps: string[];
  /** Starter sugerido (solo si hace falta multiplicar células). */
  starter?: { liters: number; dmeG: number; hours: number };
}

/** Dosis del fabricante cuando la ficha la da en g/hL (en lugar de la fórmula general de células). */
const MAKER_RATE: Record<string, { sachetG: number; normal: [number, number]; strong: [number, number]; strongPlato: number; source: string }> = {
  'philly-sour': { sachetG: 11, normal: [50, 100], strong: [100, 150], strongPlato: 14, source: 'ficha técnica de Lallemand (WildBrew Philly Sour)' },
};

const isLager = (y: Pick<RecipeYeast, 'type' | 'family'>) => y.type === 'lager' || y.family?.startsWith('lager');
const isKveik = (y: Pick<RecipeYeast, 'family'>) => y.family === 'kveik';

/**
 * Plan de inoculación con los paquetes que tiene el cervecero.
 * Starter: ~1,4 mil millones de células nuevas por gramo de extracto con agitación (Braukaiser),
 * mosto a 1.036 (100 g de extracto seco por litro).
 */
export function pitchAdvice(
  og: number,
  volumeL: number,
  y: Pick<RecipeYeast, 'type' | 'form' | 'family' | 'name'> & { ingredientId?: string },
  packsAvailable: number,
  ageDays = 0,
): PitchAdvice {
  const maker = y.ingredientId ? MAKER_RATE[y.ingredientId] : undefined;
  if (maker) return makerPitch(og, volumeL, y, packsAvailable, maker);
  const pr = pitchRate(og, volumeL, isLager(y) ? 'lager' : 'ale', y.form, ageDays);
  // La kveik tolera muy bien la inoculación baja: un cuarto de la tasa ale es suficiente.
  const needed = isKveik(y) ? pr.cellsNeededB / 3 : pr.cellsNeededB;
  const available = packsAvailable * pr.cellsPerPackB;
  const ratio = needed > 0 ? available / needed : 1;
  const packs = Math.max(1, Math.ceil(needed / pr.cellsPerPackB - 0.1));
  const steps: string[] = [];
  const dry = y.form === 'seca';
  const strong = og >= 1.07;
  const oxy = strong || isLager(y) ? 'Oxigena bien el mosto frío: oxígeno puro 60–90 s con piedra difusora, o agitar/bombear aire varios minutos (8–10 ppm).' : 'Airea el mosto frío: agítalo fuerte o salpícalo al pasar al fermentador.';

  let level: PitchAdvice['level'];
  let starter: PitchAdvice['starter'];
  if (ratio >= 0.95) {
    level = 'ok';
    if (dry) steps.push('Hidratar el sobre en 10 veces su peso de agua a 25–29 °C durante 15–30 min mejora la viabilidad (opcional en Fermentis; recomendado en lagers y mostos densos).');
    if (strong || isLager(y)) steps.push(oxy);
  } else {
    level = ratio >= 0.75 ? 'justo' : ratio >= 0.5 ? 'bajo' : 'muy-bajo';
    if (dry) steps.push('Hidrata los sobres en 10 veces su peso de agua a 25–29 °C durante 15–30 min antes de inocular: evita perder hasta la mitad de las células.');
    steps.push(oxy);
    steps.push('Agrega nutriente de levadura (zinc y aminoácidos) a 10 min del final del hervor, ~0,5 g por cada 10 L.');
    steps.push(
      isLager(y)
        ? 'Inocula en el extremo bajo del rango de temperatura y sube 1–2 °C cuando la fermentación arranque; espera una fase de latencia más larga.'
        : 'Inocula en el extremo bajo del rango de temperatura y deja subir 1–2 °C en los primeros días.',
    );
    if (level !== 'justo') {
      const missing = needed - available;
      const dmeG = Math.ceil((missing / 1.4) / 10) * 10;
      const liters = Math.max(0.5, Math.round((dmeG / 100) * 2) / 2);
      starter = { liters, dmeG: Math.round(liters * 100), hours: 24 };
      steps.push(
        dry
          ? `Lo más seguro es conseguir ${packs - packsAvailable} sobre(s) más. Si no puedes, un starter de ${liters} L (${starter.dmeG} g de extracto seco por litro de agua, 1.036) con agitación durante ~24 h multiplica las células; los fabricantes de levadura seca no lo recomiendan, pero funciona si eres muy limpio.`
          : `Haz un starter de ${liters} L a 1.036 (${starter.dmeG} g de extracto seco) con agitación durante 18–24 h y decántalo en frío.`,
      );
      steps.push(`Otra salida: cocina menos litros o baja la OG; con ${packsAvailable} paquete(s) alcanza para ~${Math.max(1, Math.floor(volumeL * ratio))} L a esta densidad.`);
    }
  }
  const summary =
    level === 'ok'
      ? `Con ${packsAvailable} ${dry ? 'sobre(s)' : 'paquete(s)'} tienes suficiente levadura.`
      : `Tienes ~${Math.round(ratio * 100)} % de las células que pide el mosto (${Math.round(available)} de ${Math.round(needed)} mil millones).`;
  return { cellsNeededB: needed, cellsAvailableB: available, ratio, packs, level, summary, steps, starter };
}

/** Dosis por g/hL del fabricante (p. ej. Philly Sour: más levadura en mostos de más de 14 °P). */
function makerPitch(
  og: number,
  volumeL: number,
  _y: Pick<RecipeYeast, 'name' | 'form'>,
  packs: number,
  m: (typeof MAKER_RATE)[string],
): PitchAdvice {
  const plato = 259 - 259 / og;
  const strong = plato > m.strongPlato;
  const [lo, hi] = strong ? m.strong : m.normal;
  const hl = volumeL / 100;
  const needG = lo * hl;
  const haveG = packs * m.sachetG;
  const recommended = Math.max(1, Math.ceil(needG / m.sachetG - 0.05));
  const ratio = needG > 0 ? haveG / needG : 1;
  const level: PitchAdvice['level'] = ratio >= 0.95 ? 'ok' : ratio >= 0.75 ? 'justo' : ratio >= 0.5 ? 'bajo' : 'muy-bajo';
  const dose = (haveG / hl).toFixed(0);
  const steps: string[] = [
    `Según la ${m.source}: ${lo}–${hi} g/hL ${strong ? `para mostos de más de ${m.strongPlato} °P` : ''} → ${Math.round(lo * hl)}–${Math.round(hi * hl)} g para ${volumeL} L (${recommended} sobres de ${m.sachetG} g como mínimo).`,
  ];
  if (level !== 'ok') {
    steps.push(`Con ${packs} sobre(s) quedarías en ${dose} g/hL: puede fermentar, pero por debajo de lo que pide el fabricante; trátalo como una prueba, no como un resultado garantizado.`);
    steps.push(`Si no consigues más sobres, reduce el volumen: con ${packs} alcanzan unos ${Math.floor((haveG / lo) * 100)} L a esta densidad.`);
    steps.push('Hidrata los sobres, agrega nutriente a 10 min del final del hervor e inocula a la temperatura baja del rango.');
  }
  return {
    cellsNeededB: needG * 10,
    cellsAvailableB: haveG * 10,
    ratio,
    packs: recommended,
    level,
    summary: level === 'ok' ? `${packs} sobres (${dose} g/hL): dentro de la dosis del fabricante.` : `${packs} sobre(s) = ${dose} g/hL; el fabricante pide ${lo}–${hi} g/hL.`,
    steps,
  };
}

/** Lo que aporta cada familia de levadura (para explicar diferencias con el estilo). */
const FAMILY_TRAIT: Record<string, string> = {
  'americana-limpia': 'es limpia y neutra, deja al frente la malta y el lúpulo',
  inglesa: 'da ésteres frutales y suele atenuar menos, dejando más cuerpo',
  'inglesa-limpia': 'es inglesa pero bastante limpia',
  escocesa: 'es limpia y maltosa, pensada para fermentar fría',
  kolsch: 'es limpia y fina, ligeramente afrutada',
  'lager-alemana': 'es muy limpia pero necesita 9–14 °C y una maduración en frío',
  'lager-checa': 'es lager limpia con algo más de cuerpo y diacetilo leve',
  'lager-california': 'es lager pero tolera 15–20 °C sin desviarse mucho',
  weizen: 'produce banano (ésteres) y clavo (fenoles)',
  wit: 'da notas especiadas y cítricas con fenoles suaves',
  'belga-abadia': 'aporta frutas maduras, especias y fenoles belgas',
  'belga-golden': 'es muy atenuante, afrutada y especiada',
  saison: 'es muy seca y especiada; las STA1 pueden seguir fermentando en la botella',
  neipa: 'resalta frutas tropicales y la biotransformación del lúpulo',
  kveik: 'fermenta caliente (30–40 °C) y rápido, con ésteres tropicales o neutra según la cepa',
  acida: 'produce ácido láctico: la cerveza queda ácida',
  bacteria: 'es una bacteria para agriar, no fermenta alcohol por sí sola',
  brett: 'da notas rústicas (cuero, establo, fruta) y seca mucho con el tiempo',
  diastatica: 'tiene enzima que consume dextrinas: seca muchísimo y puede sobrecarbonatar botellas',
  refermentacion: 'está pensada para refermentar en botella, no para la fermentación principal',
  'sin-alcohol': 'casi no produce alcohol',
};

export interface StyleFit {
  fits: boolean;
  message?: string;
  tips: string[];
}

/** ¿La levadura es típica del estilo? Si no, explica por qué y cómo acercarse. No la prohíbe. */
export function yeastStyleFit(y: Pick<RecipeYeast, 'name' | 'family' | 'tempRange' | 'attenuation' | 'type'>, style?: Style): StyleFit {
  if (!style || !y.family || style.guide.yeastFamilies.includes(y.family)) return { fits: true, tips: [] };
  const want = style.guide.yeastFamilies.map((f) => YEAST_FAMILY_LABEL[f] ?? f).join(' o ');
  const trait = FAMILY_TRAIT[y.family] ?? 'tiene un carácter distinto';
  const wantTraits = [...new Set(style.guide.yeastFamilies.map((f) => FAMILY_TRAIT[f]).filter(Boolean))][0];
  const tips: string[] = [];
  const styleLager = style.guide.yeastFamilies.some((f) => f.startsWith('lager'));
  const yLager = y.family.startsWith('lager');
  if (styleLager && !yLager) {
    tips.push(`Fermenta en el extremo frío de su rango (${y.tempRange[0]}–${y.tempRange[0] + 2} °C) y madura en frío varias semanas para acercarte al perfil limpio de una lager.`);
  } else if (!styleLager && yLager) {
    tips.push(`Si la fermentas cálida tendrá más ésteres y azufre; a ${y.tempRange[0]}–${y.tempRange[1]} °C quedará más limpia y seca de lo típico.`);
  }
  if (['weizen', 'belga-abadia', 'belga-golden', 'saison', 'wit'].includes(y.family) && !style.guide.yeastFamilies.some((f) => ['weizen', 'belga-abadia', 'belga-golden', 'saison', 'wit'].includes(f))) {
    tips.push('Fermentarla en el extremo bajo de su rango reduce los fenoles y ésteres.');
  }
  if (y.family === 'kveik') tips.push('Las kveik a 20–25 °C quedan mucho más neutras; algunas cepas (Lutra, Voss en frío) sirven para cervezas limpias.');
  if (y.family === 'diastatica' || (y.family === 'saison' && style.id !== 'saison')) tips.push('Si envasas en botella, espera a que la densidad esté estable varios días: es una cepa que puede seguir fermentando.');
  return {
    fits: false,
    message: `${y.name} ${trait}. El estilo ${style.name} se hace normalmente con levadura ${want}${wantTraits ? `, que ${wantTraits}` : ''}. Puedes usarla: la cerveza tendrá ese carácter y se alejará un poco del estilo, lo que importa más si es para competencia.`,
    tips,
  };
}
