// Modelo de datos de La H. Unidades métricas en todo el dominio:
// kg, g, L, °C, color en EBC, densidad como gravedad específica (1.050).

/**
 * Procedencia de un dato. Principio: nunca mezclar un dato oficial, un cálculo,
 * una medición y una estimación sin decir cuál es cuál.
 */
export type Provenance =
  | 'bjcp'
  | 'fabricante'
  | 'referencia'
  | 'calculo'
  | 'estimacion'
  | 'regla'
  | 'medicion'
  | 'usuario'
  | 'inventario'
  | 'importacion'
  | 'historial'
  | 'ia'
  | 'registro';

export interface Sourced {
  source?: Provenance;
  sourceNote?: string;
}

/** Dónde se consigue un ingrediente (tienda y enlace a su ficha). */
export interface StoreOffer {
  store: string;
  url?: string;
  /** Datos publicados por la tienda (rango de alfa, % de uso, sabor…). */
  note?: string;
}

export interface Available {
  stores?: StoreOffer[];
}

export type FermentableType =
  | 'base'
  | 'caramelo'
  | 'tostada'
  | 'especial'
  | 'adjunto'
  | 'azucar'
  | 'extracto'
  | 'no-fermentable'
  | 'acida';

export type FermentableUse = 'macerado' | 'hervor' | 'fermentador';

export interface Fermentable extends Sourced, Available {
  id: string;
  name: string;
  maker?: string;
  type: FermentableType;
  colorEBC: number;
  /** Puntos por libra por galón (PPG). Malta base ~37, sacarosa 46. */
  ppg: number;
  /** pH en agua destilada, para estimar pH de macerado. */
  diPH?: number;
  /** Máximo recomendado en el grano (%). */
  maxPct?: number;
  description?: string;
  /** Requiere macerarse (true) o puede ir directo al hervor. */
  needsMash?: boolean;
}

export interface RecipeFermentable extends Sourced {
  uid: string;
  ingredientId?: string;
  name: string;
  type: FermentableType;
  colorEBC: number;
  ppg: number;
  diPH?: number;
  amountKg: number;
  use: FermentableUse;
}

export type HopUse = 'macerado' | 'primer-mosto' | 'hervor' | 'whirlpool' | 'dry-hop';
export type HopForm = 'pellet' | 'flor' | 'cryo';
export type HopPurpose = 'amargor' | 'aroma' | 'doble';

export interface Hop extends Sourced, Available {
  id: string;
  name: string;
  origin: string;
  alpha: number;
  alphaRange?: [number, number];
  purpose: HopPurpose;
  /** Etiquetas de aroma/sabor: citrico, tropical, pino, resina, floral, herbal, especiado... */
  aroma: string[];
  substitutes?: string[];
  description?: string;
}

export interface RecipeHop extends Sourced {
  uid: string;
  ingredientId?: string;
  name: string;
  alpha: number;
  form: HopForm;
  amountG: number;
  use: HopUse;
  /** Minutos en hervor/whirlpool, o días para dry-hop. */
  time: number;
  /** Temperatura del whirlpool (°C). */
  tempC?: number;
}

export type YeastType = 'ale' | 'lager' | 'trigo' | 'belga' | 'saison' | 'kveik' | 'acida' | 'hibrida';
export type YeastForm = 'seca' | 'liquida';

export interface Yeast extends Sourced, Available {
  id: string;
  name: string;
  lab: string;
  code?: string;
  type: YeastType;
  form: YeastForm;
  /** Atenuación aparente típica (%). */
  attenuation: number;
  attenuationRange?: [number, number];
  tempRange: [number, number];
  flocculation: 'baja' | 'media' | 'alta' | 'muy alta';
  alcoholTolerance?: number;
  /** Familia de cepa para encontrar sustitutos equivalentes. */
  family: string;
  sta1?: boolean;
  description?: string;
}

export interface RecipeYeast extends Sourced {
  uid: string;
  ingredientId?: string;
  name: string;
  lab: string;
  code?: string;
  type: YeastType;
  form: YeastForm;
  attenuation: number;
  tempRange: [number, number];
  family?: string;
  /** Sobres (seca) o paquetes (líquida). */
  amount: number;
}

export type MiscUse = 'macerado' | 'hervor' | 'fermentador' | 'embotellado';

export interface RecipeMisc {
  uid: string;
  name: string;
  use: MiscUse;
  amount: number;
  unit: 'g' | 'ml' | 'unidad' | 'kg';
  time?: number;
  notes?: string;
}

export interface MashStep {
  uid: string;
  name: string;
  tempC: number;
  timeMin: number;
}

export interface FermentationStep {
  uid: string;
  name: string;
  tempC: number;
  days: number;
}

export interface WaterIons {
  ca: number;
  mg: number;
  na: number;
  so4: number;
  cl: number;
  hco3: number;
}

export interface WaterProfile extends WaterIons, Sourced {
  id: string;
  name: string;
  description?: string;
  custom?: boolean;
  /** Informe original tal como se ingresó (para volver a editarlo). */
  report?: Record<string, unknown>;
}

export type SaltId = 'yeso' | 'cloruroCalcio' | 'epsom' | 'sal' | 'bicarbonato' | 'carbonatoCalcio' | 'calApagada' | 'cloruroMagnesio';

export interface WaterAdjustments {
  sourceProfileId: string;
  targetProfileId?: string;
  /** Fracción del agua fuente que es destilada/ósmosis (0-1). */
  dilution: number;
  /** Gramos de cada sal en el agua de macerado. */
  mashSalts: Partial<Record<SaltId, number>>;
  /** Gramos de cada sal en el agua de lavado. */
  spargeSalts: Partial<Record<SaltId, number>>;
  lacticMl: number;
  phosphoricMl: number;
  /** Concentración del ácido láctico (%), normalmente 80 u 88. */
  lacticPct: number;
  phosphoricPct: number;
}

export type EquipmentType = 'biab' | 'biab-lavado' | 'todo-en-uno' | 'tres-ollas' | 'extracto';

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  batchSizeL: number;
  boilTimeMin: number;
  kettleVolumeL: number;
  /** Litros evaporados por hora. */
  boilOffLph: number;
  /** Pérdida en la olla (trub + espacio muerto) al pasar al fermentador. */
  kettleLossL: number;
  /** Pérdida en el fermentador al envasar. */
  fermenterLossL: number;
  /** Espacio muerto bajo el falso fondo de la olla de macerado. */
  mashTunDeadspaceL: number;
  /** Absorción de agua por el grano (L/kg). BIAB exprimido ~0.6, tres ollas ~1.0. */
  grainAbsorptionLpkg: number;
  /** Absorción de mosto por el lúpulo (L por cada 100 g en olla). */
  hopAbsorptionLp100g: number;
  /** Contracción por enfriamiento (%). */
  coolingShrinkPct: number;
  /** Eficiencia de sala (al fermentador) en %. */
  efficiencyPct: number;
  /** Relación agua/grano del macerado (L/kg) en tres ollas. */
  mashRatioLpkg: number;
  /** Para BIAB con mini lavado: litros de lavado. */
  spargeL: number;
  notes?: string;
}

export interface Carbonation {
  volumes: number;
  method: 'priming' | 'forzado';
  primingSugar: PrimingSugarId;
}

export type PrimingSugarId = 'sacarosa' | 'dextrosa' | 'panela' | 'miel' | 'dme';

export interface Recipe {
  id: string;
  name: string;
  author?: string;
  styleId?: string;
  equipmentId?: string;
  /** Copia de los parámetros del equipo usados en esta receta. */
  equipment: Equipment;
  batchSizeL: number;
  boilTimeMin: number;
  efficiencyPct: number;
  fermentables: RecipeFermentable[];
  hops: RecipeHop[];
  yeasts: RecipeYeast[];
  miscs: RecipeMisc[];
  mashSteps: MashStep[];
  fermentation: FermentationStep[];
  water: WaterAdjustments;
  carbonation: Carbonation;
  notes?: string;
  /** Número de la última versión guardada (0 = ninguna). */
  versionCount?: number;
  /** Archivada: oculta de la lista pero con todo su historial intacto. */
  archived?: boolean;
  /** De dónde salió la receta. */
  origin?: { kind: 'estilo' | 'blanco' | 'importacion' | 'copia' | 'intencion'; detail?: string };
  /** Lo que se quiere lograr: el "objetivo" frente a la predicción y el resultado. */
  intent?: RecipeIntent;
  /** Desviaciones del estilo marcadas como intencionales (clave de la sugerencia → motivo). */
  deviations?: Record<string, string>;
  /** Registro histórico importado (lo que se sabe, con su procedencia, y lo que no). */
  historical?: HistoricalRecord;
  /** Presupuesto: tienda elegida por insumo (uid → tienda) y costos adicionales del lote. */
  costPrefs?: { lines?: Record<string, string>; manual?: Record<string, number>; extras?: { uid: string; name: string; amount: number }[] };
  createdAt: number;
  updatedAt: number;
}

export type DesignMode = 'competencia' | 'tradicional' | 'moderna' | 'libre';

/** Perfil sensorial 0–10 (ver domain/sensory.ts para el significado de cada clave). */
export type SensoryValues = Partial<
  Record<'dulzor' | 'cuerpo' | 'maltosidad' | 'tostado' | 'amargor' | 'lupulo' | 'esteres' | 'fenoles' | 'acidez' | 'alcohol' | 'carbonatacion', number>
>;

export interface RecipeIntent {
  text?: string;
  mode: DesignMode;
  target: SensoryValues;
  caps?: SensoryValues;
  aromas?: string[];
  constraints?: { abv?: number; ibu?: number; srm?: [number, number] };
  /** Ruta elegida al diseñar (A/B/C). */
  route?: string;
}

export type VersionReason = 'manual' | 'lote' | 'importacion' | 'restauracion' | 'migracion';

/** Foto inmutable de una receta. Nunca se edita ni se borra. */
export interface RecipeVersion {
  id: string;
  recipeId: string;
  number: number;
  label: string;
  note?: string;
  reason: VersionReason;
  snapshot: Recipe;
  createdAt: number;
}

export interface StyleRanges {
  og: [number, number];
  fg: [number, number];
  ibu: [number, number];
  /** Color en SRM (como lo publica el BJCP). */
  srm: [number, number];
  abv: [number, number];
}

export interface StyleGrainHint {
  ingredientId: string;
  pct: number;
}

export interface StyleHopHint {
  ingredientId: string;
  use: HopUse;
  /** Para hervor: minutos. Para dry-hop: días. */
  time: number;
  /** Fracción del IBU total que aporta (para adiciones de amargor/sabor). */
  ibuShare?: number;
  /** g/L para whirlpool o dry-hop. */
  gPerL?: number;
}

export interface Style {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  category: string;
  ranges: StyleRanges;
  description: string;
  /** Guía para generar una receta base. */
  guide: {
    grains: StyleGrainHint[];
    hops: StyleHopHint[];
    yeastFamilies: string[];
    hopOrigins: string[];
    hopAroma?: string[];
    miscs?: { name: string; use: MiscUse; gPerL: number; time?: number; notes?: string }[];
    waterProfileId: string;
    mashTempC: number;
    fermentTempC: number;
    carbonation: number;
    notes?: string;
  };
}

export type BatchStatus = 'planificado' | 'coccion' | 'fermentando' | 'maduracion' | 'envasado' | 'terminado' | 'historico';

/**
 * Procedencia de un dato histórico. Orden de confianza:
 * confirmado > medición > registro de ejecución > planificado > estimación.
 */
/** Ácido que usa el cervecero para bajar el pH (y su concentración en %). */
export interface AcidChoice {
  type: 'lactico' | 'fosforico';
  pct: number;
}

export type HistoricalKind = 'confirmado' | 'medicion' | 'ejecucion' | 'planificado' | 'estimacion' | 'calculo' | 'no-recuperado';

export interface HistoricalValue {
  label: string;
  /** Valor tal como se registró (texto: puede ser un rango "40–48 g"). */
  value?: string;
  kind: HistoricalKind;
  note?: string;
}

export interface HistoricalRecord {
  status: 'elaborada' | 'planificada' | 'experimental' | 'asociada';
  /** De dónde viene el registro y cuándo se importó. */
  origin: string;
  importedAt: number;
  values: HistoricalValue[];
  /** Campos marcados "dato_no_recuperado": nunca se completan con estimaciones. */
  missing: string[];
  warnings: string[];
  notes: string[];
  /** La receta no tiene datos suficientes para que los cálculos representen el lote. */
  incomplete?: boolean;
}

export type AwardResult = 'oro' | 'plata' | 'bronce' | 'primer-puesto' | 'segundo-puesto' | 'tercer-puesto' | 'mencion' | 'inscrita';

/** Resultado externo en una competencia. El vínculo con una receta/lote solo se da por confirmado si el cervecero lo confirma. */
export interface Award {
  id: string;
  beerName: string;
  competition?: string;
  location?: string;
  year?: number;
  category?: string;
  /** Estilo con el que se inscribió (puede diferir del estilo de diseño). */
  enteredAs?: string;
  result: AwardResult;
  prize?: string;
  judges?: string;
  recipeId?: string;
  versionId?: string;
  batchId?: string;
  link: 'confirmado' | 'por-confirmar' | 'sin-receta';
  /** Recetas candidatas cuando el vínculo está por confirmar. */
  candidates?: string[];
  notes?: string;
  source: Provenance;
  createdAt: number;
}

export interface FermentationReading {
  uid: string;
  at: number;
  /** Densidad (SG). Si viene de refractómetro se guarda ya convertida. */
  sg?: number;
  brix?: number;
  tempC?: number;
  ph?: number;
  /** Presión del fermentador (PSI), para fermentación presurizada o spunding. */
  pressurePsi?: number;
  source?: Provenance;
  note?: string;
}

export interface BrewDayLog {
  /** Pasos completados del checklist: hora en que se marcó (true en lotes antiguos). */
  done: Record<string, number | boolean>;
  /** Hora de la última edición de cada medición clave. */
  measuredAt?: Partial<Record<BrewMeasureKey, number>>;
  strikeTempC?: number;
  mashTempC?: number;
  mashPH?: number;
  preBoilVolumeL?: number;
  preBoilSg?: number;
  postBoilVolumeL?: number;
  ogMeasured?: number;
  fermenterVolumeL?: number;
  notes?: string;
}

export type BrewMeasureKey =
  | 'strikeTempC'
  | 'mashTempC'
  | 'mashPH'
  | 'preBoilVolumeL'
  | 'preBoilSg'
  | 'postBoilVolumeL'
  | 'ogMeasured'
  | 'fermenterVolumeL';

export type BatchEventKind = 'medicion' | 'adicion' | 'correccion' | 'nota' | 'estado';

/** Algo que pasó en el lote, con su hora. El lote es la memoria de lo ocurrido. */
export interface BatchEvent {
  uid: string;
  at: number;
  kind: BatchEventKind;
  phase?: 'coccion' | 'fermentacion' | 'envasado';
  text: string;
  tempC?: number;
  volumeL?: number;
  sg?: number;
  ph?: number;
  source?: Provenance;
}

export interface Packaging {
  method: 'botella' | 'barril';
  date?: number;
  volumeL?: number;
  beerTempC?: number;
  volumes?: number;
  sugar?: PrimingSugarId;
  sugarG?: number;
  psi?: number;
  bottles?: number;
  notes?: string;
}

export interface Batch {
  id: string;
  number: number;
  /** Código visible para lotes históricos (p. ej. "H-01"). */
  code?: string;
  name: string;
  recipeId: string;
  /** Versión de la receta que se cocinó. */
  recipeVersionId?: string;
  recipeVersionNumber?: number;
  /** Copia congelada de la receta al momento de crear el lote. */
  recipe: Recipe;
  status: BatchStatus;
  brewDate: number;
  /** La fecha real no se recuperó: brewDate es solo referencia para contar días. */
  brewDateUnknown?: boolean;
  /** Texto de la fecha tal como se registró (p. ej. "agosto/septiembre 2026"). */
  brewDateText?: string;
  brewDay: BrewDayLog;
  readings: FermentationReading[];
  events?: BatchEvent[];
  packaging?: Packaging;
  /** Evaluación sensorial del producto terminado (el "resultado"). */
  evaluation?: { sensory: SensoryValues; at: number; notes?: string };
  historical?: HistoricalRecord;
  rating?: number;
  tastingNotes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface InventoryItem {
  id: string;
  kind: 'fermentable' | 'lupulo' | 'levadura' | 'otro';
  ingredientId?: string;
  name: string;
  /** kg para fermentables, g para lúpulos, unidades para levaduras. */
  amount: number;
  unit: 'kg' | 'g' | 'unidad';
  /** Alfa ácidos reales del lote comprado. */
  alpha?: number;
  bestBefore?: string;
  store?: string;
  costCOP?: number;
  notes?: string;
}
