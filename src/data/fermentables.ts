import type { Fermentable, FermentableType } from '../domain/types';

// Valores típicos de fichas técnicas (color en EBC, PPG a partir del rendimiento
// en laboratorio). Cada lote de malta varía: ajústalos con la ficha de tu compra.
type Row = [id: string, name: string, maker: string, type: FermentableType, ebc: number, ppg: number, maxPct: number, desc: string];

const rows: Row[] = [
  // Base
  ['pilsner-wey', 'Pilsner', 'Weyermann', 'base', 3.5, 37, 100, 'Base clara y limpia, sabor a grano dulce. Lagers, Kölsch, belgas.'],
  ['pilsner-castle', 'Château Pilsen 2RS', 'Castle Malting', 'base', 3.5, 37, 100, 'Pilsner belga, ideal para belgas y lagers.'],
  ['pilsner-best', 'Pilsen Malt', 'BestMalz', 'base', 3.5, 37, 100, 'Pilsner alemana de BestMalz.'],
  ['pale-ale-wey', 'Pale Ale', 'Weyermann', 'base', 6.5, 37, 100, 'Base con un toque más tostado que la Pilsner. Ales británicas y americanas.'],
  ['pale-ale-castle', 'Château Pale Ale', 'Castle Malting', 'base', 8, 37, 100, 'Pale ale belga, notas de galleta suaves.'],
  ['pale-2row', 'Pale 2-Row', 'Briess / genérica', 'base', 3.9, 37, 100, 'Base americana neutra. APA, IPA.'],
  ['maris-otter', 'Maris Otter', 'Crisp / Simpsons', 'base', 6, 38, 100, 'Base inglesa rica, galleta y nuez. Bitters, IPA inglesa.'],
  ['golden-promise', 'Golden Promise', 'Simpsons', 'base', 5, 38, 100, 'Base escocesa, dulce y limpia.'],
  ['vienna-wey', 'Vienna', 'Weyermann', 'base', 8, 37, 100, 'Tostado ligero y dorado. Vienna Lager, Märzen.'],
  ['munich-1-wey', 'Munich Tipo I', 'Weyermann', 'base', 15, 37, 100, 'Maltoso, pan tostado. Dunkel, Bock, Märzen.'],
  ['munich-2-wey', 'Munich Tipo II', 'Weyermann', 'base', 22, 37, 100, 'Más intenso que el Tipo I, corteza de pan.'],
  ['wheat-wey', 'Trigo malteado claro', 'Weyermann', 'base', 4, 38, 70, 'Cuerpo y espuma. Weissbier, Witbier, NEIPA.'],
  ['wheat-dark-wey', 'Trigo malteado oscuro', 'Weyermann', 'base', 17, 38, 70, 'Trigo con notas de pan tostado. Dunkelweizen.'],
  ['rye-wey', 'Centeno malteado', 'Weyermann', 'base', 6, 34, 50, 'Especiado y seco. Rye IPA, Roggenbier.'],
  ['rauch-wey', 'Malta ahumada (Rauch)', 'Weyermann', 'base', 6, 37, 100, 'Ahumada con madera de haya. Rauchbier.'],
  ['abbey-castle', 'Château Abbey', 'Castle Malting', 'especial', 45, 34, 50, 'Pan tostado, frutos secos. Dubbel, belgas oscuras.'],
  // Caramelo / cristal
  ['carafoam', 'Carafoam / Carapils', 'Weyermann', 'caramelo', 4, 33, 40, 'Mejora espuma y cuerpo sin aportar color.'],
  ['carahell', 'Carahell', 'Weyermann', 'caramelo', 25, 34, 15, 'Caramelo claro, dulzor de miel.'],
  ['carared', 'Carared', 'Weyermann', 'caramelo', 50, 34, 25, 'Color rojizo y caramelo suave. Irish Red, Amber.'],
  ['caraamber', 'Caraamber', 'Weyermann', 'caramelo', 70, 34, 20, 'Caramelo y pan tostado, tono ámbar.'],
  ['caramunich-1', 'Caramunich Tipo I', 'Weyermann', 'caramelo', 90, 34, 15, 'Caramelo medio, ámbar.'],
  ['caramunich-2', 'Caramunich Tipo II', 'Weyermann', 'caramelo', 120, 34, 15, 'Caramelo intenso, cobrizo.'],
  ['caramunich-3', 'Caramunich Tipo III', 'Weyermann', 'caramelo', 150, 34, 10, 'Caramelo oscuro, pasas.'],
  ['carawheat', 'Carawheat', 'Weyermann', 'caramelo', 120, 34, 15, 'Trigo caramelizado. Dunkelweizen, Weizenbock.'],
  ['caraaroma', 'Caraaroma', 'Weyermann', 'caramelo', 400, 33, 10, 'Caramelo muy oscuro, ciruela y pasas.'],
  ['crystal-60', 'Crystal 60 L', 'Briess / genérica', 'caramelo', 118, 34, 15, 'Caramelo medio americano. APA, Amber.'],
  ['crystal-120', 'Crystal 120 L', 'Briess / genérica', 'caramelo', 236, 33, 10, 'Caramelo oscuro, frutos secos, ciruela.'],
  ['special-b', 'Special B', 'Castle Malting', 'caramelo', 300, 32, 10, 'Pasas, ciruela, caramelo quemado. Dubbel, Dark Strong.'],
  // Especiales / horneadas
  ['melanoidin', 'Melanoidina', 'Weyermann', 'especial', 70, 34, 20, 'Sabor a malta intensa y miel; imita la decocción.'],
  ['aromatic-castle', 'Château Aromatic', 'Castle Malting', 'especial', 50, 35, 20, 'Aroma de malta muy intenso.'],
  ['biscuit-castle', 'Château Biscuit', 'Castle Malting', 'especial', 50, 35, 15, 'Galleta y pan horneado.'],
  ['brown-malt', 'Brown Malt', 'Crisp', 'especial', 150, 32, 15, 'Tostado seco, café suave. Porter inglesa.'],
  ['honey-malt', 'Honey Malt', 'Gambrinus', 'especial', 50, 34, 10, 'Dulzor de miel intenso.'],
  // Tostadas
  ['chocolate', 'Chocolate', 'Castle Malting', 'tostada', 900, 28, 10, 'Chocolate amargo, café. Porter, Stout.'],
  ['chocolate-wheat', 'Trigo chocolate', 'Weyermann', 'tostada', 1000, 30, 10, 'Tostado suave a chocolate.'],
  ['carafa-1', 'Carafa Special Tipo I', 'Weyermann', 'tostada', 900, 29, 5, 'Desamargada: color sin astringencia. Schwarzbier.'],
  ['carafa-2', 'Carafa Special Tipo II', 'Weyermann', 'tostada', 1150, 29, 5, 'Desamargada, más color.'],
  ['carafa-3', 'Carafa Special Tipo III', 'Weyermann', 'tostada', 1400, 29, 5, 'Desamargada, color negro con tostado mínimo.'],
  ['roasted-barley', 'Cebada tostada', 'Castle Malting', 'tostada', 1200, 25, 10, 'Café seco y tostado. Irish Stout.'],
  ['black-malt', 'Black Patent', 'Briess / genérica', 'tostada', 1300, 25, 5, 'Tostado acre, mucho color.'],
  // Adjuntos
  ['oats-flaked', 'Avena en hojuelas', 'Genérica', 'adjunto', 2, 33, 30, 'Cuerpo sedoso. Oatmeal Stout, NEIPA. Requiere macerado.'],
  ['oats-malted', 'Avena malteada', 'Simpsons / Thomas Fawcett', 'adjunto', 5, 32, 20, 'Cremosa con notas de nuez.'],
  ['barley-flaked', 'Cebada en hojuelas', 'Genérica', 'adjunto', 3, 32, 30, 'Cremosidad y espuma. Irish Stout.'],
  ['wheat-flaked','Trigo en hojuelas', 'Genérica', 'adjunto', 3, 34, 40, 'Turbidez y cuerpo. Witbier.'],
  ['wheat-raw', 'Trigo crudo', 'Genérica', 'adjunto', 3, 34, 50, 'Tradicional en Witbier y Lambic.'],
  ['corn-flaked', 'Maíz en hojuelas', 'Genérica', 'adjunto', 2, 37, 40, 'Aligera el cuerpo. Cream Ale, American Lager.'],
  ['rice-flaked', 'Arroz en hojuelas', 'Genérica', 'adjunto', 1, 38, 40, 'Muy seco y limpio. Lagers ligeras.'],
  ['acidulated', 'Malta acidulada', 'Weyermann', 'acida', 4, 27, 10, 'Baja el pH del macerado (~0,1 por cada 1 %).'],
  // Azúcares
  ['sucrose', 'Azúcar blanca', 'Genérica', 'azucar', 0, 46, 20, 'Seca la cerveza. Belgas fuertes, DIPA.'],
  ['dextrose', 'Dextrosa', 'Genérica', 'azucar', 0, 42, 20, 'Azúcar de maíz. Seca sin aportar sabor.'],
  ['panela', 'Panela', 'Colombiana', 'azucar', 30, 40, 20, 'Notas de melaza y caramelo. Aporta algo de color.'],
  ['honey', 'Miel', 'Genérica', 'azucar', 3, 35, 30, 'Añádela al final del hervor o en fermentador para conservar aroma.'],
  ['candi-clear', 'Azúcar candi clara', 'Belga', 'azucar', 1, 46, 20, 'Tripel, Golden Strong.'],
  ['candi-dark', 'Jarabe candi oscuro', 'Belga', 'azucar', 350, 32, 20, 'Pasas, toffee, ciruela. Dubbel, Quad.'],
  ['lactose', 'Lactosa', 'Genérica', 'no-fermentable', 0, 43, 15, 'No fermentable: dulzor y cuerpo. Milk Stout.'],
  ['maltodextrin', 'Maltodextrina', 'Genérica', 'no-fermentable', 0, 40, 10, 'Cuerpo sin dulzor.'],
  // Extractos
  ['dme-light', 'Extracto seco claro (DME)', 'Genérica', 'extracto', 8, 44, 100, 'Para corregir densidad o recetas de extracto.'],
  ['lme-light', 'Extracto líquido claro (LME)', 'Genérica', 'extracto', 8, 36, 100, 'Extracto líquido claro.'],
];

export const FERMENTABLES: Fermentable[] = rows.map(([id, name, maker, type, colorEBC, ppg, maxPct, description]) => ({
  id,
  name,
  maker,
  type,
  colorEBC,
  ppg,
  maxPct,
  description,
  needsMash: type !== 'azucar' && type !== 'extracto' && type !== 'no-fermentable',
  source: 'referencia' as const,
  sourceNote: maker === 'Genérica' || maker === 'Colombiana' ? 'Valor típico de literatura' : `Valor típico de la ficha técnica de ${maker}; cada lote varía`,
}));

export const FERMENTABLE_TYPE_LABEL: Record<FermentableType, string> = {
  base: 'Base',
  caramelo: 'Caramelo / cristal',
  tostada: 'Tostada',
  especial: 'Especial',
  adjunto: 'Adjunto',
  azucar: 'Azúcar',
  extracto: 'Extracto',
  'no-fermentable': 'No fermentable',
  acida: 'Acidulada',
};
