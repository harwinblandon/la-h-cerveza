// Importación y exportación BeerXML 1.0, el formato estándar que exportan
// Brewfather, BeerSmith, Brewer's Friend y muchas webs de recetas.

import type { Catalog } from './catalog';
import { computeRecipeStats } from './calc/recipeStats';
import { ebcToLovibond, ebcToSrm, srmToEbc, uid } from './calc/units';
import { fermentationPlan, newRecipe } from './recipeFactory';
import type {
  Equipment,
  FermentableType,
  HopUse,
  MiscUse,
  Recipe,
  RecipeFermentable,
  RecipeHop,
  RecipeMisc,
  RecipeYeast,
  YeastType,
} from './types';

// ---------- XML mínimo ----------

export interface XmlNode {
  tag: string;
  children: XmlNode[];
  text: string;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Analizador XML sencillo (sin atributos): suficiente para BeerXML. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', children: [], text: '' };
  const stack: XmlNode[] = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w:.-]+)\s*>|<\s*([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      const tag = m[2].toUpperCase();
      // Cierra hasta encontrar la etiqueta (tolera XML mal anidado).
      const idx = stack.map((n) => n.tag).lastIndexOf(tag);
      if (idx > 0) stack.length = idx;
    } else if (m[3]) {
      const node: XmlNode = { tag: m[3].toUpperCase(), children: [], text: '' };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6]) top.text += decode(m[6]);
  }
  return root;
}

const child = (n: XmlNode | undefined, tag: string) => n?.children.find((c) => c.tag === tag);
const children = (n: XmlNode | undefined, tag: string) => n?.children.filter((c) => c.tag === tag) ?? [];
const txt = (n: XmlNode | undefined, tag: string) => child(n, tag)?.text.trim() ?? '';
const num = (n: XmlNode | undefined, tag: string) => {
  const v = parseFloat(txt(n, tag).replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
};
const bool = (n: XmlNode | undefined, tag: string) => /^(true|1|yes)$/i.test(txt(n, tag));

// ---------- Coincidencia con el catálogo ----------

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™()[\],/]/g, ' ')
    .replace(/[^a-z0-9 .-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !['malt', 'malta', 'de', 'the', 'type', 'tipo', 'us', 'ger', 'german'].includes(w))
    // Plurales simples: "Goldings" = "Golding".
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));

/** Similitud por palabras compartidas (0–1). */
function similarity(a: string, b: string): number {
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(A.size, B.size);
}

function bestMatch<T extends { id: string; name: string }>(name: string, list: T[], extra?: (t: T) => string): { item: T; score: number } | undefined {
  let best: { item: T; score: number } | undefined;
  for (const item of list) {
    const names = withAliases(item.id, item.name);
    if (extra) names.push(extra(item));
    const score = Math.max(...names.map((nm) => similarity(name, nm)));
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 0.5 ? best : undefined;
}

/**
 * Nombres en inglés (como vienen en BeerXML de Brewfather/BeerSmith) para
 * ingredientes que en el catálogo están en español.
 */
const ALIASES: Record<string, string[]> = {
  'pale-2row': ['pale malt 2 row', 'pale 2 row', 'two row', '2-row'],
  'wheat-wey': ['wheat malt', 'pale wheat', 'white wheat'],
  'wheat-dark-wey': ['dark wheat'],
  'rye-wey': ['rye malt'],
  'rauch-wey': ['smoked malt', 'rauch malt', 'beech smoked'],
  'munich-1-wey': ['munich', 'munich light', 'munich i'],
  'munich-2-wey': ['munich ii', 'munich dark'],
  'vienna-wey': ['vienna'],
  'oats-flaked': ['flaked oats', 'oat flakes', 'rolled oats'],
  'oats-malted': ['malted oats', 'oat malt'],
  'barley-flaked': ['flaked barley'],
  'wheat-flaked': ['flaked wheat'],
  'wheat-raw': ['raw wheat', 'unmalted wheat', 'torrified wheat'],
  'corn-flaked': ['flaked corn', 'flaked maize', 'corn flakes'],
  'rice-flaked': ['flaked rice', 'rice hulls'],
  'roasted-barley': ['roasted barley', 'roast barley'],
  'black-malt': ['black patent', 'black malt'],
  chocolate: ['chocolate malt', 'pale chocolate'],
  'chocolate-wheat': ['chocolate wheat'],
  acidulated: ['acidulated malt', 'acid malt', 'sauermalz'],
  'candi-clear': ['candi sugar clear', 'clear candi', 'belgian candi sugar clear'],
  'candi-dark': ['candi syrup dark', 'dark candi', 'candi sugar dark', 'belgian dark candi'],
  sucrose: ['table sugar', 'cane sugar', 'white sugar', 'sucrose'],
  dextrose: ['corn sugar', 'dextrose', 'glucose'],
  honey: ['honey'],
  lactose: ['lactose', 'milk sugar'],
  maltodextrin: ['maltodextrin'],
  'dme-light': ['dry malt extract light', 'light dme', 'dme', 'spraymalt'],
  'lme-light': ['liquid malt extract', 'light lme', 'lme'],
  carafoam: ['carapils', 'cara-pils', 'dextrine malt'],
  'crystal-60': ['crystal 60', 'caramel 60', 'caramel crystal 60l', 'c60'],
  'crystal-120': ['crystal 120', 'caramel 120', 'c120'],
  'golden-promise': ['golden promise'],
  'maris-otter': ['maris otter', 'pale ale maris otter'],
  magnum: ['magnum'],
  ekg: ['ekg', 'east kent golding', 'kent golding'],
  'hallertau-mittelfruh': ['hallertauer mittelfrueh', 'hallertau', 'hallertauer'],
  columbus: ['ctz', 'tomahawk', 'zeus'],
};

const withAliases = (id: string, base: string) => [base, ...(ALIASES[id] ?? [])];

// ---------- Importación ----------

function fermentableType(xmlType: string, name: string, ebc: number): FermentableType {
  const t = xmlType.toLowerCase();
  const nm = name.toLowerCase();
  if (/lactos|maltodextrin/.test(nm)) return 'no-fermentable';
  if (t.includes('sugar')) return 'azucar';
  if (t.includes('extract')) return 'extracto';
  if (/acid|sauer/.test(nm)) return 'acida';
  if (/flake|hojuela|oat|avena|rice|arroz|corn|maiz|maíz|raw|torrified/.test(nm) || t === 'adjunct') return 'adjunto';
  if (/roast|chocolate|black|carafa|tostad|negr/.test(nm) || ebc >= 400) return 'tostada';
  if (/crystal|caramel|cara|cristal|special b/.test(nm)) return 'caramelo';
  if (ebc > 40) return 'especial';
  return 'base';
}

function yeastType(xmlType: string, name: string): YeastType {
  const t = `${xmlType} ${name}`.toLowerCase();
  if (/saison|farmhouse/.test(t)) return 'saison';
  if (/kveik/.test(t)) return 'kveik';
  if (/lager/.test(t)) return 'lager';
  if (/wheat|weizen|wit/.test(t)) return 'trigo';
  if (/belg|abbey|trappist/.test(t)) return 'belga';
  return 'ale';
}

function hopUse(xmlUse: string): HopUse {
  const u = xmlUse.toLowerCase();
  if (u.includes('dry')) return 'dry-hop';
  if (u.includes('first')) return 'primer-mosto';
  if (u.includes('mash')) return 'macerado';
  if (u.includes('aroma') || u.includes('whirlpool')) return 'whirlpool';
  return 'hervor';
}

function miscUse(xmlUse: string): MiscUse {
  const u = xmlUse.toLowerCase();
  if (u.includes('mash')) return 'macerado';
  if (u.includes('bottl')) return 'embotellado';
  if (u.includes('primary') || u.includes('secondary')) return 'fermentador';
  return 'hervor';
}

export interface ImportResult {
  recipes: Recipe[];
  /** Avisos por receta: ingredientes sin coincidencia en el catálogo, datos faltantes. */
  notes: string[];
}

export function importBeerXml(xml: string, catalog: Catalog, equipment: Equipment): ImportResult {
  const root = parseXml(xml);
  const recipesNode = child(root, 'RECIPES');
  const nodes = recipesNode ? children(recipesNode, 'RECIPE') : children(root, 'RECIPE');
  if (!nodes.length) throw new Error('No encontré recetas en el archivo. ¿Es un BeerXML (.xml)?');
  const notes: string[] = [];
  const recipes = nodes.map((rn) => {
    const r = newRecipe(equipment);
    const name = txt(rn, 'NAME') || 'Receta importada';
    r.name = name;
    r.author = txt(rn, 'BREWER') || undefined;
    r.batchSizeL = num(rn, 'BATCH_SIZE') ?? equipment.batchSizeL;
    r.boilTimeMin = Math.round(num(rn, 'BOIL_TIME') ?? equipment.boilTimeMin);
    r.efficiencyPct = num(rn, 'EFFICIENCY') ?? equipment.efficiencyPct;
    r.notes = [txt(rn, 'NOTES'), txt(rn, 'TASTE_NOTES')].filter(Boolean).join('\n\n') || undefined;
    r.origin = { kind: 'importacion', detail: 'BeerXML' };
    const unmatched: string[] = [];

    // Estilo
    const st = child(rn, 'STYLE');
    if (st) {
      const code = `${txt(st, 'CATEGORY_NUMBER')}${txt(st, 'STYLE_LETTER')}`.toUpperCase();
      // Se busca en la guía que declare el archivo (BJCP por omisión).
      const guide = /brewers|ba/i.test(txt(st, 'STYLE_GUIDE') ?? '') ? 'ba' : 'bjcp';
      const pool = catalog.styles.filter((s) => (s.guideline ?? 'bjcp') === guide);
      const byCode = guide === 'bjcp' ? pool.find((s) => s.code === code) : undefined;
      const byName = bestMatch(txt(st, 'NAME'), pool, (s) => s.nameEn);
      r.styleId = (byName && byName.score >= 0.8 ? byName.item : byCode ?? byName?.item)?.id;
      if (!r.styleId && txt(st, 'NAME')) unmatched.push(`estilo "${txt(st, 'NAME')}"`);
    }

    // Fermentables
    r.fermentables = children(child(rn, 'FERMENTABLES'), 'FERMENTABLE').map((fn): RecipeFermentable => {
      const fname = txt(fn, 'NAME');
      const lov = num(fn, 'COLOR') ?? 2;
      const ebc = Math.max(0, srmToEbc(Math.max(0, 1.3546 * lov - 0.76)));
      const type = fermentableType(txt(fn, 'TYPE'), fname, ebc);
      const match = bestMatch(fname, catalog.fermentables, (f) => `${f.maker} ${f.name}`);
      if (!match) unmatched.push(fname);
      const kettle = type === 'azucar' || type === 'extracto' || type === 'no-fermentable';
      return {
        uid: uid(),
        ingredientId: match?.item.id,
        name: fname,
        type,
        colorEBC: Math.round(ebc * 10) / 10,
        ppg: Math.round((num(fn, 'YIELD') ?? 78) * 0.46214 * 10) / 10,
        amountKg: num(fn, 'AMOUNT') ?? 0,
        use: bool(fn, 'ADD_AFTER_BOIL') ? 'fermentador' : kettle ? 'hervor' : 'macerado',
        source: 'importacion',
        sourceNote: 'Color y rendimiento del archivo importado',
      };
    });

    // Lúpulos
    r.hops = children(child(rn, 'HOPS'), 'HOP').map((hn): RecipeHop => {
      const hname = txt(hn, 'NAME');
      const use = hopUse(txt(hn, 'USE'));
      const time = num(hn, 'TIME') ?? 0;
      const match = bestMatch(hname, catalog.hops);
      if (!match) unmatched.push(hname);
      const form = txt(hn, 'FORM').toLowerCase();
      return {
        uid: uid(),
        ingredientId: match?.item.id,
        name: hname,
        alpha: num(hn, 'ALPHA') ?? match?.item.alpha ?? 5,
        form: form.includes('leaf') || form.includes('plug') ? 'flor' : 'pellet',
        amountG: Math.round((num(hn, 'AMOUNT') ?? 0) * 1000 * 10) / 10,
        use,
        // En BeerXML el dry hop viene en minutos; aquí se guarda en días.
        time: use === 'dry-hop' ? Math.max(1, Math.round(time / 1440)) : Math.round(time),
        tempC: use === 'whirlpool' ? 80 : undefined,
        source: 'importacion',
        sourceNote: '% AA del archivo importado',
      };
    });

    // Levaduras
    r.yeasts = children(child(rn, 'YEASTS'), 'YEAST').map((yn): RecipeYeast => {
      const yname = txt(yn, 'NAME');
      const code = txt(yn, 'PRODUCT_ID').toUpperCase().replace(/\s/g, '');
      const match =
        (code && catalog.yeasts.find((y) => (y.code ?? '').toUpperCase().replace(/\s/g, '') === code)) ||
        bestMatch(`${txt(yn, 'LABORATORY')} ${yname}`, catalog.yeasts, (y) => `${y.lab} ${y.name} ${y.code ?? ''}`)?.item;
      if (!match) unmatched.push(yname);
      const form = txt(yn, 'FORM').toLowerCase().includes('dry') ? 'seca' : 'liquida';
      return {
        uid: uid(),
        ingredientId: match?.id,
        name: yname || match?.name || 'Levadura',
        lab: txt(yn, 'LABORATORY') || match?.lab || '',
        code: txt(yn, 'PRODUCT_ID') || match?.code,
        type: match?.type ?? yeastType(txt(yn, 'TYPE'), yname),
        form: match?.form ?? form,
        attenuation: num(yn, 'ATTENUATION') ?? match?.attenuation ?? 75,
        tempRange: [num(yn, 'MIN_TEMPERATURE') ?? match?.tempRange[0] ?? 16, num(yn, 'MAX_TEMPERATURE') ?? match?.tempRange[1] ?? 22],
        family: match?.family,
        amount: 1,
        source: 'importacion',
      };
    });

    // Otros
    r.miscs = children(child(rn, 'MISCS'), 'MISC').map((mn): RecipeMisc => {
      const weight = bool(mn, 'AMOUNT_IS_WEIGHT');
      return {
        uid: uid(),
        name: txt(mn, 'NAME'),
        use: miscUse(txt(mn, 'USE')),
        amount: Math.round((num(mn, 'AMOUNT') ?? 0) * 1000 * 10) / 10,
        unit: weight ? 'g' : 'ml',
        time: num(mn, 'TIME'),
      };
    });

    // Macerado
    const steps = children(child(child(rn, 'MASH'), 'MASH_STEPS'), 'MASH_STEP');
    if (steps.length) {
      r.mashSteps = steps.map((sn) => ({
        uid: uid(),
        name: txt(sn, 'NAME') || 'Escalón',
        tempC: num(sn, 'STEP_TEMP') ?? 66,
        timeMin: Math.round(num(sn, 'STEP_TIME') ?? 60),
      }));
    }

    // Fermentación
    const primaryT = num(rn, 'PRIMARY_TEMP');
    if (primaryT !== undefined) {
      r.fermentation = [{ uid: uid(), name: 'Primaria', tempC: primaryT, days: Math.round(num(rn, 'PRIMARY_AGE') ?? 10) }];
      const secT = num(rn, 'SECONDARY_TEMP');
      if (secT !== undefined && (num(rn, 'SECONDARY_AGE') ?? 0) > 0)
        r.fermentation.push({ uid: uid(), name: 'Secundaria', tempC: secT, days: Math.round(num(rn, 'SECONDARY_AGE')!) });
    } else if (r.yeasts[0]) {
      r.fermentation = fermentationPlan(catalog.styles.find((s) => s.id === r.styleId), r.yeasts[0]);
    }
    const carb = num(rn, 'CARBONATION');
    if (carb) r.carbonation = { ...r.carbonation, volumes: carb };

    if (unmatched.length)
      notes.push(`"${name}": sin equivalente en el catálogo (se conservaron los datos del archivo, pero no habrá sustitutos automáticos): ${unmatched.join(', ')}.`);
    return r;
  });
  return { recipes, notes };
}

// ---------- Exportación ----------

const HOP_USE_XML: Record<HopUse, string> = {
  hervor: 'Boil',
  'primer-mosto': 'First Wort',
  macerado: 'Mash',
  whirlpool: 'Aroma',
  'dry-hop': 'Dry Hop',
};

const FERM_TYPE_XML: Record<FermentableType, string> = {
  base: 'Grain',
  caramelo: 'Grain',
  tostada: 'Grain',
  especial: 'Grain',
  acida: 'Grain',
  adjunto: 'Adjunct',
  azucar: 'Sugar',
  'no-fermentable': 'Sugar',
  extracto: 'Dry Extract',
};

const MISC_USE_XML: Record<MiscUse, string> = { macerado: 'Mash', hervor: 'Boil', fermentador: 'Secondary', embotellado: 'Bottling' };

function el(tag: string, value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return '';
  const v = typeof value === 'number' ? String(Math.round(value * 10000) / 10000) : typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : escape(value);
  return `<${tag}>${v}</${tag}>`;
}

export function exportBeerXml(recipes: Recipe[], catalog: Catalog): string {
  const body = recipes
    .map((r) => {
      const s = computeRecipeStats(r);
      const style = catalog.styles.find((x) => x.id === r.styleId);
      const ba = style?.guideline === 'ba';
      const m = ba ? null : style?.code.match(/^(\d+|X)(\w*)$/);
      const styleXml = style
        ? `<STYLE>${el('NAME', style.nameEn)}${el('VERSION', 1)}${el('CATEGORY', style.category)}${el('CATEGORY_NUMBER', m?.[1])}${el('STYLE_LETTER', m?.[2])}${el('STYLE_GUIDE', ba ? 'Brewers Association 2026' : 'BJCP 2021')}${el('TYPE', 'Ale')}${el('OG_MIN', style.ranges.og[0])}${el('OG_MAX', style.ranges.og[1])}${el('FG_MIN', style.ranges.fg[0])}${el('FG_MAX', style.ranges.fg[1])}${el('IBU_MIN', style.ranges.ibu[0])}${el('IBU_MAX', style.ranges.ibu[1])}${el('COLOR_MIN', style.ranges.srm[0])}${el('COLOR_MAX', style.ranges.srm[1])}${el('ABV_MIN', style.ranges.abv[0])}${el('ABV_MAX', style.ranges.abv[1])}</STYLE>`
        : '';
      const ferms = r.fermentables
        .map(
          (f) =>
            `<FERMENTABLE>${el('NAME', f.name)}${el('VERSION', 1)}${el('TYPE', FERM_TYPE_XML[f.type])}${el('AMOUNT', f.amountKg)}${el('YIELD', f.ppg / 0.46214)}${el('COLOR', ebcToLovibond(f.colorEBC))}${el('ADD_AFTER_BOIL', f.use === 'fermentador' || f.use === 'maduracion')}</FERMENTABLE>`,
        )
        .join('');
      const hops = r.hops
        .map(
          (h) =>
            `<HOP>${el('NAME', h.name)}${el('VERSION', 1)}${el('ALPHA', h.alpha)}${el('AMOUNT', h.amountG / 1000)}${el('USE', HOP_USE_XML[h.use])}${el('TIME', h.use === 'dry-hop' ? h.time * 1440 : h.use === 'primer-mosto' ? r.boilTimeMin : h.time)}${el('FORM', h.form === 'flor' ? 'Leaf' : 'Pellet')}</HOP>`,
        )
        .join('');
      const yeasts = r.yeasts
        .map(
          (y) =>
            `<YEAST>${el('NAME', y.name)}${el('VERSION', 1)}${el('TYPE', y.type === 'lager' ? 'Lager' : y.type === 'trigo' ? 'Wheat' : 'Ale')}${el('FORM', y.form === 'seca' ? 'Dry' : 'Liquid')}${el('AMOUNT', y.form === 'seca' ? y.amount * 0.0115 : y.amount * 0.125)}${el('AMOUNT_IS_WEIGHT', y.form === 'seca')}${el('LABORATORY', y.lab)}${el('PRODUCT_ID', y.code)}${el('ATTENUATION', y.attenuation)}${el('MIN_TEMPERATURE', y.tempRange[0])}${el('MAX_TEMPERATURE', y.tempRange[1])}</YEAST>`,
        )
        .join('');
      const miscs = r.miscs
        .map(
          (x) =>
            `<MISC>${el('NAME', x.name)}${el('VERSION', 1)}${el('TYPE', 'Other')}${el('USE', MISC_USE_XML[x.use])}${el('TIME', x.time ?? 0)}${el('AMOUNT', x.unit === 'kg' ? x.amount : x.amount / 1000)}${el('AMOUNT_IS_WEIGHT', x.unit !== 'ml')}</MISC>`,
        )
        .join('');
      const mash = `<MASH>${el('NAME', 'Macerado')}${el('VERSION', 1)}${el('GRAIN_TEMP', 20)}<MASH_STEPS>${r.mashSteps
        .map((st) => `<MASH_STEP>${el('NAME', st.name)}${el('VERSION', 1)}${el('TYPE', 'Infusion')}${el('STEP_TEMP', st.tempC)}${el('STEP_TIME', st.timeMin)}</MASH_STEP>`)
        .join('')}</MASH_STEPS></MASH>`;
      const [p1, p2] = r.fermentation;
      return `<RECIPE>${el('NAME', r.name)}${el('VERSION', 1)}${el('TYPE', r.fermentables.some((f) => f.type === 'extracto') ? 'Partial Mash' : 'All Grain')}${el('BREWER', r.author ?? '')}${styleXml}${el('BATCH_SIZE', r.batchSizeL)}${el('BOIL_SIZE', s.water.preBoilL)}${el('BOIL_TIME', r.boilTimeMin)}${el('EFFICIENCY', r.efficiencyPct)}<HOPS>${hops}</HOPS><FERMENTABLES>${ferms}</FERMENTABLES><MISCS>${miscs}</MISCS><YEASTS>${yeasts}</YEASTS><WATERS></WATERS>${mash}${el('NOTES', r.notes)}${el('OG', s.og)}${el('FG', s.fg)}${el('FERMENTATION_STAGES', r.fermentation.length)}${el('PRIMARY_AGE', p1?.days)}${el('PRIMARY_TEMP', p1?.tempC)}${el('SECONDARY_AGE', p2?.days)}${el('SECONDARY_TEMP', p2?.tempC)}${el('CARBONATION', r.carbonation.volumes)}${el('EST_OG', s.og)}${el('EST_FG', s.fg)}${el('EST_COLOR', ebcToSrm(s.ebc))}${el('IBU', s.ibu)}${el('IBU_METHOD', 'Tinseth')}${el('EST_ABV', s.abv)}</RECIPE>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<RECIPES>\n${body}\n</RECIPES>\n`;
}
