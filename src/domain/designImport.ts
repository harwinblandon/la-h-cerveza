// Lector de diseños escritos (texto pegado): reconoce parámetros, grano, adiciones, lúpulos, agua,
// macerado, hervor, fermentación por etapas, frutas, cacao, maduración y perfil sensorial, y arma la
// receta con su plan. Informa qué entendió y qué no, para que el cervecero lo revise antes de crearla.

import { isMashed } from './calc/gravity';
import { computeRecipeStats } from './calc/recipeStats';
import { uid } from './calc/units';
import { brandEquivalent, byId, type Catalog } from './catalog';
import { applyWaterTarget, fermentableFromCatalog, fitHopsToIbu, hopFromCatalog, newRecipe, yeastFromCatalog } from './recipeFactory';
import type { AcidChoice, DesignTargets, Equipment, PlanStep, Recipe, RecipeFermentable, RecipeMisc, SaltId, SensoryValues, WaterIons, WaterProfile } from './types';

export interface ReadItem {
  label: string;
  value: string;
}
export interface ReadSection {
  title: string;
  items: ReadItem[];
}
export interface DesignReading {
  recipe: Recipe;
  waters: WaterProfile[];
  sections: ReadSection[];
  /** Líneas con datos que no se reconocieron: revisarlas a mano. */
  unread: string[];
  warnings: string[];
}

export interface DesignOptions {
  catalog: Catalog;
  equipment: Equipment;
  sourceWater?: { id: string; ions: WaterIons };
  acid?: AcidChoice;
  availableSalts?: SaltId[];
  maltsters?: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

/** Números de un texto; acepta coma o punto decimal ("9,0", "1.070", "67.5"). */
function nums(s: string): number[] {
  return [...s.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => {
    const t = m[1];
    // 1,070 como densidad: coma decimal con 3 cifras tras un 1 → 1.070.
    return Number(t.replace(',', '.'));
  });
}
const range = (s: string): [number, number] | undefined => {
  const n = nums(s);
  if (!n.length) return undefined;
  return /–|-|\ba\b/.test(s) && n.length >= 2 ? [n[0], n[1]] : [n[0], n[0]];
};
const mid = (r: [number, number]) => (r[0] + r[1]) / 2;
const fmt = (r?: [number, number], unit = '') => (!r ? '—' : r[0] === r[1] ? `${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`);

/** Cantidad en kg (de "9.00 kg", "700 g"). */
function kgOf(s: string): number | undefined {
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?)\b/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(',', '.'));
  return /^k/i.test(m[2]) ? n : n / 1000;
}
const gramsOf = (s: string) => {
  const k = kgOf(s);
  if (k !== undefined) return k * 1000;
  const r = s.match(/(\d+(?:[.,]\d+)?)\s*(?:–|-)\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  return r ? (Number(r[1].replace(',', '.')) + Number(r[2].replace(',', '.'))) / 2 : undefined;
};
const cols = (line: string) => line.split(/\t+|\s{2,}/).map((c) => c.trim()).filter(Boolean);

/** Malta o azúcar del catálogo por nombre (español o inglés). */
const FERMENTABLE_NAMES: [RegExp, string][] = [
  [/banan/, 'fruta-banano'],
  [/mango/, 'fruta-mango'],
  [/guanabana/, 'fruta-guanabana'],
  [/maracuya|passion/, 'fruta-maracuya'],
  [/pina\b|pineapple/, 'fruta-pina'],
  [/uchuva/, 'fruta-uchuva'],
  [/\bmora\b|blackberr/, 'fruta-mora'],
  [/fresa|strawberr/, 'fruta-fresa'],
  [/\blulo\b/, 'fruta-lulo'],
  [/avena (en )?hojuel|hojuelas de avena|copos de avena|flaked oat/, 'oats-flaked'],
  [/avena malteada|malta de avena|malted oat/, 'oats-malted'],
  [/carapils|carafoam|dextrin/, 'carafoam'],
  [/munich (i|1)\b|munich tipo i\b/, 'munich-1-wey'],
  [/munich (ii|2)\b|munich tipo ii\b/, 'munich-2-wey'],
  [/munich/, 'munich-1-wey'],
  [/vien+a/, 'vienna-wey'],
  [/trigo|wheat/, 'wheat-wey'],
  [/pilsen|pilsner|pils\b/, 'pilsner-wey'],
  [/maris otter/, 'maris-otter'],
  [/pale ale|pale\b/, 'pale-ale-wey'],
  [/centeno|rye/, 'rye-wey'],
  [/caramunich (iii|3)/, 'caramunich-3'],
  [/caramunich (ii|2)/, 'caramunich-2'],
  [/caramunich/, 'caramunich-1'],
  [/chocolate/, 'chocolate'],
  [/cebada tostada|roasted barley/, 'roasted-barley'],
  [/acidulada|acid malt/, 'acidulated'],
  [/dextrosa|glucosa|azucar de maiz|cerelose/, 'dextrose'],
  [/lactosa|lactose/, 'lactose'],
  [/maltodextrin/, 'maltodextrin'],
  [/panela/, 'panela'],
  [/\bmiel\b|honey/, 'honey'],
  [/candi.*(oscur|dark)/, 'candi-dark'],
  [/candi/, 'candi-clear'],
  [/azucar|sacarosa/, 'sucrose'],
];
const fermentableId = (name: string) => FERMENTABLE_NAMES.find(([re]) => re.test(norm(name)))?.[1];

function hopId(name: string, catalog: Catalog): string | undefined {
  const n = norm(name.replace(/,.*$/, '').replace(/\d+(?:[.,]\d+)?\s*%.*$/, ''));
  const hit = catalog.hops.find((h) => norm(h.name) === n) ?? catalog.hops.find((h) => n.includes(norm(h.name)) || norm(h.name).includes(n));
  return hit?.id;
}

function yeastId(name: string, catalog: Catalog): string | undefined {
  const n = norm(name);
  return catalog.yeasts.find((y) => n.includes(norm(y.name)) || (y.code && n.includes(norm(y.code))))?.id;
}

const SECTION_RX: [RegExp, string][] = [
  [/parametros|objetivos/, 'parametros'],
  [/grist|malta|grano/, 'grist'],
  [/ingredientes adicionales|adjuntos|adiciones/, 'adicionales'],
  [/lupulo/, 'lupulo'],
  [/agua|mineral/, 'agua'],
  [/proceso|elaboracion/, 'proceso'],
  [/fermentacion|levadura/, 'fermentacion'],
  [/nibs|cacao/, 'cacao'],
  [/banano|fruta/, 'fruta'],
  [/maduracion|carbonatacion|envasado/, 'maduracion'],
  [/perfil sensorial|sensorial/, 'sensorial'],
];

/** Lúpulos de amargor (hervor de 30 min o más) con el mismo peso en el ajuste de IBU. */
export function bitteringShares(r: Recipe): Record<string, number> {
  const bitter = r.hops.filter((h) => (h.use === 'hervor' && h.time >= 30) || h.use === 'primer-mosto');
  const list = bitter.length ? bitter : r.hops.filter((h) => h.use === 'hervor');
  return Object.fromEntries(list.map((h) => [h.uid, 1 / list.length]));
}

/** Eficiencia con la que el grano de la receta llega a la OG del mosto indicada. */
export function efficiencyForOg(r: Recipe, og: number): number | undefined {
  const at = (eff: number) => computeRecipeStats({ ...r, efficiencyPct: eff }).og;
  const lo = at(0);
  const hi = at(100);
  if (hi <= lo) return undefined;
  const eff = ((og - lo) / (hi - lo)) * 100;
  return eff > 0 && eff <= 100 ? eff : undefined;
}

export function readDesign(text: string, o: DesignOptions): DesignReading {
  const { catalog } = o;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const used = new Set<number>();
  const sections: ReadSection[] = [];
  const read = (title: string, label: string, value: string) => {
    let s = sections.find((x) => x.title === title);
    if (!s) sections.push((s = { title, items: [] }));
    s.items.push({ label, value });
  };
  const warnings: string[] = [];
  const design: DesignTargets = { notes: [] };
  const r = newRecipe(o.equipment, o.sourceWater?.id);
  r.origin = { kind: 'importacion', detail: 'diseño pegado' };
  r.mashSteps = [];
  r.fermentation = [];
  r.hops = [];
  r.yeasts = [];
  r.miscs = [];
  r.fermentables = [];
  const plan: PlanStep[] = [];
  const target: Partial<WaterIons> = {};
  let mashPhTarget: [number, number] | undefined;
  let yeastName: string | undefined;
  let sachets: number | undefined;
  let fruitRows = 0;
  const firstLine = lines.findIndex((l) => l.trim());
  if (firstLine >= 0) {
    r.name = lines[firstLine].trim().replace(/\s+/g, ' ');
    if (r.name === r.name.toUpperCase()) r.name = r.name.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
    used.add(firstLine);
  }

  let section = '';
  let sub = '';
  let lastHeading = 0;
  const fruitAdds: { uid: string; kg: number; when: string; ordinal: number }[] = [];
  const prose: Record<'fruta' | 'cacao', string[]> = { fruta: [], cacao: [] };
  const boilTimes: { re: RegExp; minutes: number; text: string }[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const n = norm(line);
    // Encabezados "1. Parámetros de diseño", "Etapa A. Maceración"…
    const heading = line.match(/^(\d+)\.\s+(.+)$/) || line.match(/^etapa\s+\w+\.\s*(.+)$/i);
    const hit = heading ? SECTION_RX.find(([re]) => re.test(norm(heading[heading.length - 1]))) : undefined;
    // Un título numerado de sección tiene que seguir la numeración (1, 2, 3…); una lista dentro de una sección vuelve a empezar.
    const num = heading && /^\d/.test(line) ? Number(heading[1]) : undefined;
    const isTitle = heading && line.length < 60 && !/\t/.test(line) && (/^etapa/i.test(line) || (hit && (num === undefined || num > lastHeading)));
    if (isTitle) {
      if (num !== undefined) lastHeading = num;
      const h = norm(heading[heading.length - 1]);
      if (/^etapa/i.test(line)) sub = h;
      else {
        section = hit?.[1] ?? section;
        sub = '';
      }
      used.add(i);
      return;
    }
    const c = cols(line);

    // ---------- Parámetros ----------
    if (section === 'parametros' && c.length >= 2) {
      const [k, v] = [norm(c[0]), c.slice(1).join(' ')];
      used.add(i);
      if (k.startsWith('estilo')) design.styleName = v;
      else if (k.includes('volumen al fermentador')) r.batchSizeL = nums(v)[0] ?? r.batchSizeL;
      else if (k.includes('volumen final')) design.finalVolumeL = range(v);
      else if (k.includes('alcohol') || k === 'abv') design.abv = range(v);
      else if (k.startsWith('og')) design.og = range(v);
      else if (k.startsWith('fg')) {
        if (nums(v).length) design.fg = range(v);
        else design.notes!.push(`FG: ${v}`);
      } else if (k.includes('amargor') || k === 'ibu') design.ibu = range(v);
      else if (k.includes('ph final')) design.phFinal = range(v);
      else if (k.includes('carbonatacion')) design.carbonation = range(v);
      else if (k.startsWith('levadura')) yeastName = v;
      else if (k.startsWith('fermentacion')) design.fermentTempC = range(v);
      else if (k.includes('fruta') || k.includes('complemento')) read('Parámetros', c[0], v);
      else if (k.startsWith('perfil')) design.profile = v;
      else if (k === 'parametro') return;
      else used.delete(i);
      return;
    }
    if (/^importante/i.test(line)) {
      design.notes!.push(line.replace(/^importante:\s*/i, ''));
      used.add(i);
      return;
    }

    // ---------- Grano y adiciones (tablas con cantidades) ----------
    if ((section === 'grist' || section === 'adicionales') && c.length >= 2 && !/^total/i.test(c[0]) && !/^ingrediente/i.test(n)) {
      const name = c[0];
      const qty = c.slice(1).join(' ');
      const kg = kgOf(qty);
      const optional = /opcional/i.test(qty);
      const fid = fermentableId(name);
      if (optional) {
        design.notes!.push(`${name}: ${qty} (no se agrega a la receta hasta evaluarlo).`);
        read('Adiciones', name, `${qty} — opcional, no se agrega`);
        used.add(i);
        return;
      }
      if (fid && kg !== undefined) {
        const f = byId(catalog.fermentables, fid);
        if (f) {
          const isFruit = f.id.startsWith('fruta-');
          const chosen = o.maltsters?.length ? brandEquivalent(f, catalog, o.maltsters) : f;
          if (isFruit) {
            // Las adiciones por tandas se arman con la sección de la fruta; si no hay, una sola.
            r.fermentables.push({ ...fermentableFromCatalog(chosen, kg), uid: uid(), use: 'fermentador', role: `fruta (${name})` });
          } else {
            const sugar = f.type === 'azucar' || f.type === 'no-fermentable';
            r.fermentables.push({ ...fermentableFromCatalog(chosen, kg), uid: uid(), use: sugar ? 'hervor' : 'macerado' });
          }
          read(section === 'grist' ? 'Grano' : 'Adiciones', name, `${qty} → ${chosen.name}${chosen.maker && chosen.maker !== 'Genérica' ? ` (${chosen.maker})` : ''}`);
          used.add(i);
          return;
        }
      }
      // Misceláneos: nibs, vainilla, nutriente, especias…
      if (/nib|cacao|vainilla|nutriente|clarific|whirlfloc|canela|cafe|coco|especia|cascara/i.test(n)) {
        const g = gramsOf(qty);
        if (/vainilla/.test(n) && !g) {
          design.notes!.push(`${name}: ${qty}.`);
          read('Adiciones', name, `${qty} — se decide después`);
        } else {
          const nutrient = /nutriente/.test(n);
          const m: RecipeMisc = {
            uid: uid(),
            name,
            use: nutrient ? 'hervor' : /nib|cacao|vainilla|cafe|coco/.test(n) ? 'fermentador' : 'hervor',
            amount: g ?? 0,
            unit: 'g',
            ...(nutrient ? { time: 10, notes: qty } : {}),
          };
          r.miscs.push(m);
          read('Adiciones', name, g ? `${g} g` : qty);
        }
        used.add(i);
        return;
      }
    }
    // Función de cada ingrediente: "Avena: aporta beta-glucanos…"
    if (section === 'grist' && /^[^:]{2,30}:\s/.test(line)) {
      const [name, role] = [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 1).trim()];
      const fid = fermentableId(name);
      const f = r.fermentables.find((x) => fermentableId(x.name) === fid || (fid && x.ingredientId === fid) || norm(x.name).includes(norm(name)));
      if (f) {
        f.role = role;
        used.add(i);
        return;
      }
    }

    // ---------- Lúpulos ----------
    if (section === 'lupulo' && c.length >= 2 && !/^ingrediente/i.test(n)) {
      const id = hopId(c[0], catalog);
      const g = gramsOf(c[1] ?? '');
      if (id && g) {
        const h = byId(catalog.hops, id)!;
        const alpha = c[0].match(/(\d+(?:[.,]\d+)?)\s*%/);
        const time = nums(c[2] ?? '')[0] ?? 60;
        const use = /whirlpool|hopstand/i.test(c[2] ?? '') ? 'whirlpool' : /dry/i.test(c[2] ?? '') ? 'dry-hop' : 'hervor';
        r.hops.push({ ...hopFromCatalog(h, g, use, time, alpha ? Number(alpha[1].replace(',', '.')) : undefined), uid: uid() });
        read('Lúpulo', c[0], `${c[1]} a ${time} min`);
        used.add(i);
        return;
      }
    }
    if (section === 'lupulo' && /^objetivo/i.test(line)) {
      design.ibu ??= range(line);
      used.add(i);
      return;
    }

    // ---------- Agua ----------
    if (section === 'agua' && c.length >= 2) {
      const k = norm(c[0]);
      const v = range(c[1]);
      const ion: [RegExp, keyof WaterIons][] = [
        [/^calcio/, 'ca'],
        [/^magnesio/, 'mg'],
        [/^sodio/, 'na'],
        [/^cloruro/, 'cl'],
        [/^sulfato/, 'so4'],
        [/^bicarbonato/, 'hco3'],
      ];
      const hit = ion.find(([re]) => re.test(k));
      if (hit && v) {
        target[hit[1]] = mid(v);
        read('Agua', c[0], `${fmt(v)} ppm`);
        used.add(i);
        return;
      }
      if (/ph del macerado/.test(k) && v) {
        mashPhTarget = v;
        read('Agua', 'pH del macerado', fmt(v));
        used.add(i);
        return;
      }
      if (/relacion/.test(k)) {
        used.add(i);
        return;
      }
    }

    // ---------- Proceso: macerado y hervor ----------
    if (section === 'proceso' || /maceracion|hervor/.test(sub)) {
      if (/maceracion/.test(sub) && c.length >= 2) {
        const k = norm(c[0]);
        const v = range(c[1]);
        if (v) {
          const t = Math.round(mid(v) * 2) / 2;
          if (k === 'temperatura') r.mashSteps.unshift({ uid: uid(), name: 'Sacarificación', tempC: t, timeMin: 60 });
          else if (k === 'duracion' && r.mashSteps[0]) r.mashSteps[0].timeMin = v[0];
          else if (k === 'mash-out' || k === 'mash out') r.mashSteps.push({ uid: uid(), name: 'Mash out', tempC: t, timeMin: 10 });
          else if (k.includes('duracion mash')) {
            const mo = r.mashSteps.find((s) => s.name === 'Mash out');
            if (mo) mo.timeMin = v[0];
          } else return;
          used.add(i);
          return;
        }
      }
      if (/hervor/.test(sub) || section === 'proceso') {
        const dur = line.match(/^duraci[oó]n:\s*(\d+)/i);
        if (dur) {
          r.boilTimeMin = Number(dur[1]);
          read('Proceso', 'Hervor', `${dur[1]} min`);
          used.add(i);
          return;
        }
        // "- Últimos 10 minutos: lactosa." · "- Dextrosa: últimos 5–10 minutos." · "- Minuto 0: Magnum."
        const b = line.replace(/^[-•·]\s*/, '');
        const last = b.match(/[uú]ltimos\s+(\d+)(?:\s*[–-]\s*(\d+))?\s*min/i);
        const start = b.match(/minuto\s+0/i);
        if (last || start) {
          const minutes = start ? r.boilTimeMin : Number(last![2] ?? last![1]);
          const what = norm(b.replace(/[uú]ltimos.*?minutos?\.?:?/i, '').replace(/minuto\s+0:?/i, '').replace(/[:.]/g, ' '));
          boilTimes.push({ re: new RegExp(what.split(/\s+/).filter((w) => w.length > 3)[0] ?? '§'), minutes, text: b });
          used.add(i);
          return;
        }
        const cool = b.match(/enfriar hasta\s+(\d+(?:[.,]\d+)?)\s*°?\s*c/i);
        if (cool) {
          read('Proceso', 'Enfriar', `${cool[1]} °C`);
          used.add(i);
          return;
        }
      }
    }

    // ---------- Fermentación ----------
    if (section === 'fermentacion') {
      const s = line.match(/utilizar\s+(\d+)\s+sobres/i);
      if (s) {
        sachets = Number(s[1]);
        used.add(i);
        return;
      }
      if (c.length >= 2 && /°\s*c/i.test(c[1]) && !/^etapa/i.test(n)) {
        const t = range(c[1]);
        if (t) {
          plan.push({ uid: uid(), phase: 'fermentacion', title: c[0], tempC: t, detail: c.slice(2).join(' ') || undefined });
          used.add(i);
          return;
        }
      }
      if (/^sobres|^\d+\t/.test(line) || (c.length === 3 && /g\/hl/i.test(c[2]))) {
        used.add(i);
        return;
      }
    }

    // ---------- Fruta por tandas ----------
    if (section === 'fruta' && c.length >= 3 && kgOf(c[1]) !== undefined && !/^total|^adicion/i.test(n)) {
      fruitRows++;
      fruitAdds.push({ uid: uid(), kg: kgOf(c[1])!, when: c.slice(2).join(' '), ordinal: fruitRows });
      used.add(i);
      return;
    }

    // ---------- Cacao ----------
    if (section === 'cacao' && c.length >= 2) {
      const k = norm(c[0]);
      if (k === 'temperatura') {
        const p = plan.find((x) => x.uid === 'cacao-temp');
        if (p) p.tempC = range(c[1]);
        else plan.push({ uid: 'cacao-temp', phase: 'adicion', title: '', tempC: range(c[1]) });
        used.add(i);
        return;
      }
      if (k.includes('contacto inicial') || k.includes('contacto maximo') || k.includes('evaluacion') || k === 'cantidad') {
        const p = plan.find((x) => x.uid === 'cacao-temp') ?? (plan.push({ uid: 'cacao-temp', phase: 'adicion', title: '' }), plan[plan.length - 1]);
        const d = nums(c[1])[0];
        if (k.includes('contacto inicial')) p.contactDays = [d, p.contactDays?.[1] ?? d];
        if (k.includes('contacto maximo')) p.contactDays = [p.contactDays?.[0] ?? d, d];
        if (k.includes('evaluacion')) p.checkEveryH = nums(c[1])[0] ?? 24;
        used.add(i);
        return;
      }
    }

    // ---------- Maduración ----------
    if (section === 'maduracion') {
      const step = line.match(/^\d+\.\s*(.+)$/);
      if (step) {
        plan.push({ uid: uid(), phase: /carbonatar|barril|trasvas/i.test(step[1]) ? 'envasado' : 'maduracion', title: step[1].replace(/\.$/, '') });
        const carb = step[1].match(/carbonatar a\s+(.+?)\s*vol/i);
        if (carb) design.carbonation ??= range(carb[1]);
        const cold = step[1].match(/cold crash a\s+(.+?)\s*°\s*c/i);
        if (cold) r.fermentation.push({ uid: uid(), name: 'Cold crash', tempC: Math.round(mid(range(cold[1])!)), days: 2 });
        used.add(i);
        return;
      }
    }

    // Instrucciones escritas de la fruta y el cacao: se muestran en su paso del plan.
    if ((section === 'fruta' || section === 'cacao') && c.length === 1 && line.length > 25 && !/^cantidad/i.test(n)) {
      prose[section].push(line);
      used.add(i);
      return;
    }

    // ---------- Perfil sensorial ----------
    if (section === 'sensorial' && c.length >= 2 && !/^atributo/i.test(n)) {
      read('Perfil sensorial', c[0], c.slice(1).join(' '));
      used.add(i);
      return;
    }
  });

  // ---------- Armar lo leído ----------
  r.name ||= design.styleName ?? 'Receta importada';
  if (design.carbonation) r.carbonation = { ...r.carbonation, volumes: Math.round(mid(design.carbonation) * 100) / 100, method: /barril/i.test(text) ? 'forzado' : r.carbonation.method };
  // Tiempos del hervor para lúpulos, azúcares y nutriente.
  for (const bt of boilTimes) {
    const hop = r.hops.find((h) => bt.re.test(norm(h.name)));
    if (hop) hop.time = bt.minutes;
    const f = r.fermentables.find((x) => x.use === 'hervor' && bt.re.test(norm(x.name)));
    if (f) f.timeMin = bt.minutes;
    const m = r.miscs.find((x) => x.use === 'hervor' && bt.re.test(norm(x.name)));
    if (m) m.time = bt.minutes;
    read('Proceso', bt.text.replace(/\.$/, ''), `a ${bt.minutes} min del final`);
  }
  // Fruta en tandas: se reparte la fruta según la tabla de adiciones.
  const fruit = r.fermentables.find((f) => f.use === 'fermentador' && f.ingredientId?.startsWith('fruta-'));
  if (fruit && fruitAdds.length) {
    r.fermentables = r.fermentables.filter((f) => f !== fruit);
    for (const a of fruitAdds) {
      const aging = /madur|despues de (la )?fermentacion|al final|fermentacion terminada|en frio/.test(norm(a.when));
      const nf: RecipeFermentable = { ...fruit, uid: a.uid, amountKg: a.kg, use: aging ? 'maduracion' : 'fermentador', role: `${a.ordinal === 1 ? 'Primera' : a.ordinal === 2 ? 'Segunda' : `${a.ordinal}.ª`} adición: ${a.when}` };
      r.fermentables.push(nf);
    }
    const total = fruitAdds.reduce((s, a) => s + a.kg, 0);
    if (Math.abs(total - fruit.amountKg) > 0.05) warnings.push(`Las tandas de fruta suman ${total} kg y la lista de ingredientes dice ${fruit.amountKg} kg: revisa las cantidades.`);
  }
  // Plan: fruta y cacao con condiciones medibles (pH y densidad), no con días fijos.
  const phHi = design.phFinal?.[1] ?? 3.7;
  fruitAdds.forEach((a, k) => {
    plan.push({
      uid: `fruta-${k + 1}`,
      phase: 'adicion',
      title: `${k === 0 ? 'Primera' : k === 1 ? 'Segunda' : `${k + 1}.ª`} adición de ${fruit?.name.toLowerCase() ?? 'fruta'}: ${a.kg} kg`,
      detail: [a.when, ...(k === 0 ? prose.fruta : [])].join('\n'),
      items: [a.uid],
      conditions: /madur|despues de (la )?fermentacion|al final|fermentacion terminada|en frio/.test(norm(a.when))
        ? [{ kind: 'sg-stable', days: 2 }]
        : k === 0
          ? [{ kind: 'ph-max', value: Math.round((phHi + 0.2) * 10) / 10 }, { kind: 'sg-drop', points: 10 }]
          : [{ kind: 'days-after', step: `fruta-${k}`, days: 2 }, { kind: 'sg-dropping' }],
    });
  });
  const cacaoMisc = r.miscs.find((m) => /nib|cacao/i.test(m.name));
  const cacao = plan.find((p) => p.uid === 'cacao-temp');
  if (cacaoMisc) {
    const step: PlanStep = {
      ...(cacao ?? { phase: 'adicion' as const }),
      uid: 'cacao',
      phase: 'adicion',
      title: `${cacaoMisc.name}: ${cacaoMisc.amount} g`,
      items: [cacaoMisc.uid],
      detail: prose.cacao.length ? prose.cacao.join('\n') : 'Cuando la fermentación de la fruta esté prácticamente terminada. Probar cada día: buscar chocolate aromático, no cacao amargo.',
      conditions: [{ kind: 'sg-stable', days: 2 }],
    };
    if (cacao) plan.splice(plan.indexOf(cacao), 1, step);
    else plan.push(step);
    cacaoMisc.notes = `Contacto ${step.contactDays ? `${step.contactDays[0]}–${step.contactDays[1]} días` : 'según cata'}${step.checkEveryH ? `, evaluar cada ${step.checkEveryH} h` : ''}.`;
  } else if (cacao) plan.splice(plan.indexOf(cacao), 1);
  // Final de la fermentación: densidad estable y pH en el objetivo (se usa la etapa "Finalización" si el diseño la trae).
  const finConditions = [{ kind: 'sg-stable' as const, days: 3 }, ...(design.phFinal ? [{ kind: 'ph-max' as const, value: design.phFinal[1] }] : [])];
  const finStage = plan.find((p) => p.phase === 'fermentacion' && /finaliz|final de la fermentacion|estabilidad/.test(norm(p.title)));
  if (finStage) finStage.conditions = finConditions;
  else if (plan.some((p) => p.phase === 'adicion')) {
    plan.push({ uid: 'fin', phase: 'fermentacion', title: 'Confirmar el final de la fermentación', detail: 'Densidad estable varios días y pH en el objetivo antes de enfriar o envasar.', conditions: finConditions });
  }
  // Etapa de acidificación (48–72 h): al menos 2 días después de inocular.
  const inoc = plan.find((p) => p.phase === 'fermentacion' && /inocul/.test(norm(p.title)));
  const acid = plan.find((p) => p.phase === 'fermentacion' && /48|72|acidif/.test(norm(p.title)));
  if (inoc && acid) acid.conditions = [{ kind: 'days-after', step: inoc.uid, days: 2 }];
  // Orden real del proceso: las adiciones van intercaladas con las etapas de fermentación.
  const rank = (p: PlanStep) => {
    const t = norm(p.title);
    if (p.phase === 'maduracion' || p.phase === 'envasado') return 9;
    if (p.uid === 'cacao') return 6;
    if (p.uid.startsWith('fruta-')) return 4 + Number(p.uid.slice(6)) / 10;
    if (p.phase === 'adicion') return 6.5;
    if (p === finStage || p.uid === 'fin') return 8;
    if (/inocul/.test(t)) return 0;
    if (/48|72|acidif/.test(t)) return 1;
    if (/alcoh|primaria/.test(t)) return 2;
    if (/fruta|banano/.test(t)) return 5;
    return 3;
  };
  plan.sort((a, b) => rank(a) - rank(b));

  // Etapas de fermentación de la receta (para el calendario) a partir del plan.
  const fermSteps = plan.filter((p) => p.phase === 'fermentacion' && p.tempC && p.uid !== 'fin');
  r.fermentation = [
    ...fermSteps.map((p) => ({ uid: uid(), name: p.title, tempC: Math.round(mid(p.tempC!) * 2) / 2, days: /72\s*h/.test(p.title) ? 3 : 0 })),
    ...r.fermentation,
  ];
  if (!r.fermentation.length && design.fermentTempC) r.fermentation = [{ uid: uid(), name: 'Primaria', tempC: mid(design.fermentTempC), days: 10 }];

  // Levadura.
  if (yeastName) {
    const yid = yeastId(yeastName, catalog);
    const y = yid ? byId(catalog.yeasts, yid) : undefined;
    if (y) {
      r.yeasts = [{ ...yeastFromCatalog(y, sachets ?? 1), uid: uid() }];
      read('Fermentación', 'Levadura', `${y.name}${sachets ? ` · ${sachets} sobres` : ''}`);
    } else warnings.push(`No encontré la levadura «${yeastName}» en el catálogo: agrégala a mano.`);
  }
  for (const p of plan.filter((x) => x.phase === 'fermentacion' && x.tempC)) read('Fermentación', p.title, `${fmt(p.tempC, ' °C')}${p.detail ? ` · ${p.detail}` : ''}`);
  for (const p of plan.filter((x) => x.phase === 'adicion')) read('Adiciones en el fermentador', p.title, p.detail ?? '');
  for (const p of plan.filter((x) => x.phase === 'maduracion' || x.phase === 'envasado')) read('Maduración y envasado', p.title, '');
  for (const s of r.mashSteps) read('Proceso', `Macerado: ${s.name}`, `${s.tempC} °C · ${s.timeMin} min`);

  // Lúpulo: los gramos se recalculan con el % AA para el IBU del diseño.
  if (design.og) {
    const eff = efficiencyForOg(r, mid(design.og));
    const now = computeRecipeStats(r).og;
    if (eff !== undefined && Math.abs(now - mid(design.og)) > 0.004) {
      design.notes!.push(
        `Con ${r.efficiencyPct} % de eficiencia este grano da OG ${now.toFixed(3)}; el diseño pide ${fmt(design.og)}. Para esa OG la eficiencia tendría que ser ~${Math.round(eff)} %, o hay que ajustar el grano.`,
      );
      warnings.push(`OG: el grano del diseño con tu eficiencia (${r.efficiencyPct} %) da ${now.toFixed(3)} y el diseño pide ${fmt(design.og)}. La pestaña Diseño ofrece ajustar la eficiencia (~${Math.round(eff)} %) o el grano.`);
    }
  }
  if (design.ibu && r.hops.length) {
    const before = r.hops.map((h) => h.amountG);
    Object.assign(r, fitHopsToIbu(r, mid(design.ibu), bitteringShares(r)));
    r.hops.forEach((h, k) => {
      if (Math.round(h.amountG) !== Math.round(before[k])) read('Lúpulo', `${h.name} recalculado`, `${Math.round(h.amountG)} g para ${mid(design.ibu!)} IBU`);
    });
  }

  // Agua: perfil objetivo del diseño y sales/ácido calculados para el agua de origen.
  const waters: WaterProfile[] = [];
  if (Object.keys(target).length >= 3) {
    const w: WaterProfile = {
      id: `custom-${uid()}`,
      name: `${r.name} · perfil del diseño`,
      ca: target.ca ?? 0,
      mg: target.mg ?? 0,
      na: target.na ?? 0,
      so4: target.so4 ?? 0,
      cl: target.cl ?? 0,
      hco3: target.hco3 ?? 0,
      custom: true,
      source: 'importacion',
      sourceNote: 'Puntos medios de los rangos del diseño.',
    };
    waters.push(w);
    r.water = { ...r.water, targetProfileId: w.id };
    if (o.sourceWater) Object.assign(r, applyWaterTarget(r, o.sourceWater.ions, w, mashPhTarget ? mid(mashPhTarget) : 5.4, o.availableSalts, o.acid));
    else warnings.push('Sin agua de origen configurada: las sales se calculan cuando elijas tu agua.');
  }

  // Intención y notas.
  const sensory = sections.find((s) => s.title === 'Perfil sensorial');
  r.intent = {
    mode: 'libre',
    text: [design.profile, ...(sensory?.items.map((x) => `${x.label}: ${x.value}`) ?? [])].filter(Boolean).join('. '),
    target: {} as SensoryValues,
  };
  r.design = design;
  r.plan = plan;
  r.notes = text.trim();
  if (design.og) read('Parámetros', 'OG del mosto', fmt(design.og));
  if (design.abv) read('Parámetros', 'Alcohol', fmt(design.abv, ' %'));
  if (design.ibu) read('Parámetros', 'Amargor', fmt(design.ibu, ' IBU'));
  if (design.phFinal) read('Parámetros', 'pH final', fmt(design.phFinal));
  if (design.carbonation) read('Parámetros', 'Carbonatación', fmt(design.carbonation, ' vol'));
  if (design.finalVolumeL) read('Parámetros', 'Volumen final', fmt(design.finalVolumeL, ' L'));
  read('Parámetros', 'Volumen al fermentador', `${r.batchSizeL} L`);
  if (design.styleName) read('Parámetros', 'Estilo', design.styleName);

  // Lo que tiene datos (cantidades, temperaturas, tiempos) y no se usó.
  const unread = lines
    .map((l, i) => ({ l: l.trim(), i }))
    .filter(({ l, i }) => l && !used.has(i) && /\d/.test(l) && /(kg|\bg\b|°|min|ppm|%|\bL\b|vol|ibu|ph)/i.test(l) && l.length < 160)
    .map(({ l }) => l);
  return { recipe: r, waters, sections, unread, warnings };
}

/** Escala solo el grano del macerado (mismos porcentajes) para llegar a la OG del mosto indicada. */
export function scaleMashToOg(r: Recipe, og: number): Recipe {
  const at = (k: number) => {
    const next = { ...r, fermentables: r.fermentables.map((f) => (isMashed(f) ? { ...f, amountKg: f.amountKg * k } : f)) };
    return { next, og: computeRecipeStats(next).og };
  };
  let lo = 0.2;
  let hi = 3;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (at(m).og < og) lo = m;
    else hi = m;
  }
  const { next } = at((lo + hi) / 2);
  return { ...next, fermentables: next.fermentables.map((f) => (isMashed(f) ? { ...f, amountKg: Math.round(f.amountKg * 100) / 100 } : f)) };
}
