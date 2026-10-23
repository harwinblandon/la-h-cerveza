import type { WaterProfile } from '../domain/types';

type Row = [id: string, name: string, ca: number, mg: number, na: number, so4: number, cl: number, hco3: number, desc: string];

const rows: Row[] = [
  ['destilada', 'Destilada / ósmosis inversa', 0, 0, 0, 0, 0, 0, 'Lienzo en blanco: construye cualquier perfil con sales.'],
  // Perfiles objetivo por tipo de cerveza
  ['obj-claro-suave', 'Objetivo · Clara suave', 25, 3, 5, 25, 35, 0, 'Pilsner checa, Helles, Kölsch. Agua muy blanda.'],
  ['obj-claro-seco', 'Objetivo · Clara seca', 55, 7, 5, 110, 45, 0, 'German Pils, Blonde, APA ligera.'],
  ['obj-claro-equilibrado', 'Objetivo · Clara equilibrada', 50, 7, 5, 75, 60, 0, 'Lagers y ales claras en general, belgas claras.'],
  ['obj-ipa', 'Objetivo · IPA West Coast', 110, 18, 15, 275, 50, 0, 'Amargor seco y lúpulo nítido.'],
  ['obj-neipa', 'Objetivo · Hazy / NEIPA', 100, 10, 15, 75, 150, 0, 'Cuerpo suave y jugoso, cloruro alto.'],
  ['obj-ambar-equilibrado', 'Objetivo · Ámbar equilibrada', 55, 10, 15, 75, 65, 40, 'Amber, Märzen, Vienna, Bitter.'],
  ['obj-ambar-maltoso', 'Objetivo · Ámbar maltosa', 60, 10, 15, 50, 90, 70, 'Scottish, Irish Red, Bock, Dubbel.'],
  ['obj-oscuro-seco', 'Objetivo · Oscura seca', 60, 10, 25, 90, 60, 150, 'Irish Stout, American Stout, Schwarzbier.'],
  ['obj-oscuro-maltoso', 'Objetivo · Oscura maltosa', 60, 10, 30, 50, 100, 140, 'Porter, Sweet/Oatmeal Stout, Dunkel.'],
  // Ciudades cerveceras clásicas
  ['pilsen', 'Pilsen', 7, 2, 2, 5, 5, 15, 'Agua extremadamente blanda de la Pilsner original.'],
  ['munich', 'Múnich', 77, 17, 4, 18, 8, 295, 'Alcalina; históricamente asociada a Dunkel.'],
  ['dortmund', 'Dortmund', 225, 40, 60, 120, 60, 220, 'Dura y mineral. Dortmunder Export.'],
  ['vienna', 'Viena', 200, 60, 8, 125, 12, 120, 'Vienna Lager.'],
  ['burton', 'Burton upon Trent', 275, 40, 25, 610, 35, 270, 'Sulfato muy alto. Pale Ales e IPA inglesas.'],
  ['london', 'Londres', 52, 32, 86, 32, 34, 104, 'Porter y Milds.'],
  ['dublin', 'Dublín', 118, 4, 12, 55, 19, 319, 'Alcalina, ideal para maltas tostadas. Irish Stout.'],
  ['edinburgh', 'Edimburgo', 125, 25, 55, 140, 65, 225, 'Scottish Ales.'],
  ['antwerp', 'Amberes', 90, 11, 37, 84, 57, 76, 'Belgian Pale Ale.'],
];

export const WATER_PROFILES: WaterProfile[] = rows.map(([id, name, ca, mg, na, so4, cl, hco3, description]) => ({
  id,
  name,
  ca,
  mg,
  na,
  so4,
  cl,
  hco3,
  description,
  source: id.startsWith('obj-') ? ('regla' as const) : ('referencia' as const),
  sourceNote: id.startsWith('obj-') ? 'Perfil objetivo de diseño de La H' : id === 'destilada' ? undefined : 'Perfil histórico aproximado de literatura cervecera',
}));

/**
 * Agua de Armenia (Quindío) según los reportes IRCA fisicoquímicos de Empresas Públicas
 * de Armenia (red de distribución). Promedio de los valores diarios del mes.
 * Conversión: Ca = calcio (como CaCO₃) × 0,4004; Mg = (dureza total − cálcica) × 0,2428;
 * HCO₃ = alcalinidad × 1,22 (a pH 7,4–7,8). EPA no reporta sodio: se estima por balance de cargas.
 */
const EPA_URL = 'https://www.epa.gov.co/institucional/otras-publicaciones/calidad-de-agua';

export const ARMENIA_WATERS: WaterProfile[] = [
  {
    id: 'armenia-epa',
    name: 'Armenia · EPA (sept. 2026)',
    ca: 6.9,
    mg: 10.9,
    na: 7.3,
    so4: 17.1,
    cl: 5.1,
    hco3: 63.4,
    description: 'Muy blanda, con más magnesio que calcio. Alcalinidad 52 ± 4 mg/L CaCO₃, dureza 62 ± 4, pH 7,4–7,8. Casi siempre necesita calcio (yeso o cloruro de calcio).',
    source: 'referencia',
    sourceNote: `EPA Armenia, reporte IRCA fisicoquímico de septiembre de 2026 (30 días, laboratorio acreditado). Sodio estimado por balance iónico. ${EPA_URL}`,
  },
  {
    id: 'armenia-epa-jul',
    name: 'Armenia · EPA (jul. 2026)',
    ca: 5.6,
    mg: 9.2,
    na: 6.1,
    so4: 14.3,
    cl: 4.2,
    hco3: 52.1,
    description: 'Mes de referencia para ver la variación: alcalinidad 43 ± 4, dureza 52 ± 3. Algunos días bajó la alcalinidad a ~30.',
    source: 'referencia',
    sourceNote: `EPA Armenia, reporte IRCA fisicoquímico de julio de 2026 (31 días). Sodio estimado por balance iónico. ${EPA_URL}`,
  },
];

WATER_PROFILES.splice(1, 0, ...ARMENIA_WATERS);

/** Puntos de partida comunes además del agua de la llave. */
export const COMMON_WATERS: WaterProfile[] = [
  {
    id: 'osmosis',
    name: 'Ósmosis inversa (típica)',
    ca: 1,
    mg: 0.3,
    na: 2,
    so4: 1,
    cl: 2,
    hco3: 5,
    description: 'Permeado de un equipo doméstico en buen estado (TDS < 20 ppm). Prácticamente un lienzo en blanco: todo el perfil sale de las sales.',
    source: 'referencia',
    sourceNote: 'Valores típicos de ósmosis doméstica; mide el TDS de tu equipo: si supera ~30 ppm, revisa las membranas o carga tu propio análisis.',
  },
];

WATER_PROFILES.splice(1, 0, ...COMMON_WATERS);
