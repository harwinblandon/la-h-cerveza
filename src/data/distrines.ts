// Catálogo de Distrines (https://distrines.com), leído de sus fichas de producto.
// Lo que publica la tienda (enlace, % máximo de uso, sabor, rango de alfa, temperatura y
// atenuación de levaduras) va en la oferta de la tienda. El color EBC de las maltas no lo
// publica Distrines: se usa el valor típico de la ficha de cada maltería (procedencia "referencia").
import type { Fermentable, Hop, StoreOffer, Yeast } from '../domain/types';

export const DISTRINES = 'Distrines';
export const DISTRINES_URL = 'https://distrines.com';

const offer = (url: string, note?: string): StoreOffer => ({ store: DISTRINES, url, note });

export const DISTRINES_FERMENTABLES: Fermentable[] = [
  { id: "best-pilsen", name: "Pilsen", maker: "BestMalz", type: "base", colorEBC: 4, ppg: 37, maxPct: 100, description: "Cereal “CRISPY”. Malta base para todas las cervezas, cervezas Premium-Pilsener, Pilsener, Export, Kölsch, Lager, cervezas claras y light", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/23/malta-pilsen-bestmalz", "Sabor: Cereal “CRISPY”; uso hasta 100 %")] },
  { id: "best-pale-ale", name: "Pale Ale", maker: "BestMalz", type: "base", colorEBC: 6.5, ppg: 37, maxPct: 100, description: "Cereal y malta. Para las cervezas Pale Ale, Kölsch y Pilsener, así como para otras especialidades de cerveza", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/24/malta-pale-ale-bestmalz", "Sabor: Cereal y malta; uso hasta 100 %")] },
  { id: "best-vienna", name: "Vienna", maker: "BestMalz", type: "base", colorEBC: 8, ppg: 37, maxPct: 100, description: "Malta y miel. Para las cervezas Export, Märzen y Porter, así como para otras especialidades de cerveza", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/25/malta-vienna-bestmalz", "Sabor: Malta y miel; uso hasta 100 %")] },
  { id: "best-munich", name: "Munich", maker: "BestMalz", type: "base", colorEBC: 15, ppg: 37, maxPct: 100, description: "Malta y pan. Malta base para todas las cervezas oscuras, Export, Märzen, Alt, Bock, cerveza de trigo y cerveza fuerte", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/26/malta-munich-bestmalz", "Sabor: Malta y pan; uso hasta 100 %")] },
  { id: "best-munich-oscura", name: "Munich oscura", maker: "BestMalz", type: "base", colorEBC: 22, ppg: 36, maxPct: 100, description: "Malta y miel. Malta base para todas las cervezas oscuras, Märzen, Alt, Bock y cervezas fuertes, así como para todas las demás especialidades de cervezas oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/27/malta-munich-oscura-bestmalz", "Sabor: Malta y miel; uso hasta 100 %")] },
  { id: "best-trigo", name: "Trigo", maker: "BestMalz", type: "base", colorEBC: 4, ppg: 38, maxPct: 60, description: "Maracuyá y clavo. Malta básica para todas las cervezas de trigo, las cervezas de alta fermentación, Kölsch, cervezas bajas en alcohol o sin alcohol, y muchas otras variedades", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/28/malta-trigo-bestmalz", "Sabor: Maracuyá y clavo; uso hasta 60 %")] },
  { id: "best-trigo-oscuro", name: "Trigo oscuro", maker: "BestMalz", type: "base", colorEBC: 16, ppg: 37, maxPct: 60, description: "Limón y clavo. Para cervezas de trigo oscuras, cervezas oscuras de alta fermentación, cervezas oscuras bajas en alcohol, así como cervezas sin alcohol y otras variedades", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/29/malta-trigo-oscuro-bestmalz", "Sabor: Limón y clavo; uso hasta 60 %")] },
  { id: "best-red-x", name: "Red X®", maker: "BestMalz", type: "base", colorEBC: 25, ppg: 36, maxPct: 100, description: "Maracuyá y jerez. Malta base para todas las cervezas rojas y rojizas, cervezas ámbar, cervezas de trigo rojas, cerveza Alt roja y Ale roja, cerveza oscura de notas rojizas y muchas otras variedades", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/31/malta-red-x-bestmalz", "Sabor: Maracuyá y jerez; uso hasta 100 %")] },
  { id: "best-centeno", name: "Centeno", maker: "BestMalz", type: "base", colorEBC: 6, ppg: 34, maxPct: 50, description: "Pan. cervezas de centeno, centeno IPA / Rye-IPA, cervezas de semillas y cervezas de alta fermentación", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/40/malta-de-centeno-bestmalz", "Sabor: Pan; uso hasta 50 %")] },
  { id: "best-ahumada", name: "Ahumada", maker: "BestMalz", type: "base", colorEBC: 5, ppg: 37, maxPct: 100, description: "Humo y Jamón. Malta básica para todas las cervezas con notas ahumadas, así como para la cerveza Export, cervezas de trigo, Porter y Bock, y también para destilados (Whisky)", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/45/malta-ahumada-bestmalz", "Sabor: Humo y Jamón; uso hasta 100 %")] },
  { id: "best-avena", name: "Avena malteada", maker: "BestMalz", type: "adjunto", colorEBC: 5, ppg: 32, maxPct: 50, description: "Avellana y copos de avena. Para cervezas de avena, IPA de avena / Oatmeal-IPA, Oatmeal Stout, cervezas oscuras y cervezas de invierno", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/48/malta-de-avena-bestmalz", "Sabor: Avellana y copos de avena; uso hasta 50 %")] },
  { id: "best-caramel-pils", name: "Caramel® Pils", maker: "BestMalz", type: "caramelo", colorEBC: 5, ppg: 33, maxPct: 50, description: "Miel y Higo. Para cervezas Pilsener, claras, Lager, Kölsch, Export, cerveza de trigo, cerveza light o cerveza baja en alcohol, así como para todas las especialidades de cerveza clara", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/30/malta-caramel-pils-bestmalz", "Sabor: Miel y Higo; uso hasta 50 %")] },
  { id: "best-caramel-hell", name: "Caramel® Hell", maker: "BestMalz", type: "caramelo", colorEBC: 30, ppg: 34, maxPct: 50, description: "Miel y caramelo toffee. Para las cervezas claras, Märzen, de trigo, suaves (light), bajas en alcohol o sin alcohol, así como para todas las especialidades de cervezas doradas y de color tostado", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/34/malta-caramel-hell-bestmalz", "Sabor: Miel y caramelo toffee; uso hasta 50 %")] },
  { id: "best-caramel-amber", name: "Caramel® Amber", maker: "BestMalz", type: "caramelo", colorEBC: 65, ppg: 34, maxPct: 50, description: "Datil y galleta. Para Märzen, cervezas de trigo, Bock, Amber Ale y Amber Lager, así como para las cervezas oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/33/malta-caramel-amber-bestmalz", "Sabor: Datil y galleta; uso hasta 50 %")] },
  { id: "best-caramel-munich-1", name: "Caramel® Munich I", maker: "BestMalz", type: "caramelo", colorEBC: 90, ppg: 34, maxPct: 50, description: "Datil y almendra. Para las cervezas Alt, Märzen, cervezas de trigo y Bock, así como para todas las especialidades de cervezas oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/36/malta-caramel-munich-i-bestmalz", "Sabor: Datil y almendra; uso hasta 50 %")] },
  { id: "best-caramel-aromatic", name: "Caramel® Aromatic", maker: "BestMalz", type: "caramelo", colorEBC: 115, ppg: 34, maxPct: 50, description: "Caramelo tofe y galleta. Para cerveza de trigo, Bock, Alt, Porter y de color ámbar, así como para especialidades de cervezas oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/35/malta-caramel-aromatic-bestmalz", "Sabor: Caramelo tofe y galleta; uso hasta 50 %")] },
  { id: "best-caramel-munich-2", name: "Caramel® Munich II", maker: "BestMalz", type: "caramelo", colorEBC: 120, ppg: 34, maxPct: 50, description: "Almendra tostada y mazapán. Para Märzen, cervezas de trigo y Bock, así como para cervezas especiales oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/37/malta-caramel-munich-ii-bestmalz", "Sabor: Almendra tostada y mazapán; uso hasta 50 %")] },
  { id: "best-caramel-munich-3", name: "Caramel® Munich III", maker: "BestMalz", type: "caramelo", colorEBC: 150, ppg: 33, maxPct: 40, description: "Almendra tostada y paloduz. Para Märzen, cervezas de trigo y Bock, así como para cervezas especiales oscuras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/38/malta-caramel-munich-iii-bestmalz", "Sabor: Almendra tostada y paloduz; uso hasta 40 %")] },
  { id: "best-melano", name: "Melano", maker: "BestMalz", type: "especial", colorEBC: 70, ppg: 34, maxPct: 50, description: "Mora y cereza. Para las cervezas oscuras y rojo-tostadas, Alt, Märzen, Bock y cervezas de trigo, así como para otras especialidades de cerveza", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/32/malta-melano-bestmalz", "Sabor: Mora y cereza; uso hasta 50 %")] },
  { id: "best-biscuit", name: "Biscuit", maker: "BestMalz", type: "especial", colorEBC: 50, ppg: 34, maxPct: 50, description: "Pan recien horneado y galletas. Para todos los estilos de cerveza especiales, cervezas inglesas Ales, Brown Ale, Porter, Belgian Abbey", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/41/malta-biscuit-bestmalz", "Sabor: Pan recien horneado y galletas; uso hasta 50 %")] },
  { id: "best-special-x", name: "Special X®", maker: "BestMalz", type: "caramelo", colorEBC: 400, ppg: 32, maxPct: 20, description: "Frutos secos y chocolate. Para cervezas Alt, Bock, cervezas negras, cervezas de malta, cervezas belgas como Abbey y Trappist, cervezas inglesas como Amber, Dark Ale, Porter y Stouts, así como para todas las cervezas artesanales", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/39/malta-special-x-bestmalz", "Sabor: Frutos secos y chocolate; uso hasta 20 %")] },
  { id: "best-chocolate", name: "Chocolate", maker: "BestMalz", type: "tostada", colorEBC: 900, ppg: 28, maxPct: 10, description: "Chocolate. Para todas las cervezas de color intenso, cervezas negras, Bock, Alt, cervezas fuertes, Porter, cervezas Brown, Stouts y Brown Ale", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/42/malta-chocolate-bestmalz", "Sabor: Chocolate; uso hasta 10 %")] },
  { id: "best-negra-extra", name: "Negra Extra", maker: "BestMalz", type: "tostada", colorEBC: 1400, ppg: 27, maxPct: 5, description: "Pan y café. Para todas las cervezas de colores intensos, las cervezas oscuras, Bock, Alt, cervezas fuertes y Porter", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/43/malta-negra-extra-bestmalz", "Sabor: Pan y café; uso hasta 5 %")] },
  { id: "best-cebada-tostada", name: "Cebada tostada", maker: "BestMalz", type: "tostada", colorEBC: 1100, ppg: 25, maxPct: 5, description: "Café. Imprescindible para las típicas cervezas oscuras y ácidas (irlan­desas o escocesas), así como para la intensificación de colores y aromas de las cervezas negras, oscuras, Alt, cervezas fuertes, Ale oscura, Porter y muchas otras", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/46/cebada-tostada-bestmalz", "Sabor: Café; uso hasta 5 %")] },
  { id: "best-acida", name: "Ácida", maker: "BestMalz", type: "acida", colorEBC: 5, ppg: 27, maxPct: 5, description: "Uva espina y Limón. Para todas las cervezas por su efecto de optimización del valor pH en el proceso de mezclado", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de BestMalz; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-bestmalz/44/malta-acida-bestmalz", "Sabor: Uva espina y Limón; uso hasta 5 %")] },
  { id: "castle-pilsen", name: "Château Pilsen", maker: "Castle Malting", type: "base", colorEBC: 3.5, ppg: 37, maxPct: 100, description: "Malta fuerte y dulce. Malta base para todas las cervezas, principalmente utilizada como malta base en la elaboración de cervezas tipo Pilsner", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/8/malta-pilsen-castle-malting", "Sabor: Malta fuerte y dulce; uso hasta 100 %")] },
  { id: "castle-pale-ale", name: "Château Pale Ale", maker: "Castle Malting", type: "base", colorEBC: 8.5, ppg: 37, maxPct: 100, description: "Cereal, Malta dulce. Cervezas amargas y pale ale, además de la mayoría de estilos tradicionales de cerveza inglés", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/9/malta-pale-ale-castle-malting", "Sabor: Cereal, Malta dulce; uso hasta 100 %")] },
  { id: "castle-maris-otter", name: "Maris Otter", maker: "Castle Malting", type: "base", colorEBC: 6, ppg: 38, maxPct: 100, description: "Malta, nuez. Ideal como malta base en cervezas de estilo inglés, como Brown Ales, Porters, y Bitters, así como en cualquier cerveza donde se desee realzar el carácter maltoso y la profundidad de sabor", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/10/malta-maris-otter-castle-malting", "Sabor: Malta, nuez; uso hasta 100 %")] },
  { id: "castle-munich", name: "Château Munich", maker: "Castle Malting", type: "base", colorEBC: 25, ppg: 36, maxPct: 60, description: "Pale ale, ámbar, oscura, cervezas fuertes y negras, bocks", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/11/malta-munich-castle-malting", "uso hasta 60 %")] },
  { id: "castle-cara-belgium", name: "Château Cara Belgium", maker: "Castle Malting", type: "caramelo", colorEBC: 20, ppg: 34, maxPct: 30, description: "Caramelo. Adecuado para cervezas especiales belgas: “rubia”, “bruin”, Amber, Dubbel o Tripel", needsMash: true, source: 'referencia', sourceNote: "EBC aproximado (no confirmado): revisa la ficha del saco.", stores: [offer("https://distrines.com/maltas-castle-malting/12/malta-cara-belgium-castle-malting", "Sabor: Caramelo; uso hasta 30 %")] },
  { id: "castle-cara-ruby", name: "Château Cara Ruby", maker: "Castle Malting", type: "caramelo", colorEBC: 50, ppg: 34, maxPct: 25, description: "Caramelo, toffee. Adecuado para cervezas especiales belgas: Ales oscuras, bock, ales escocesas", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/13/malta-cara-ruby-castle-malting", "Sabor: Caramelo, toffee; uso hasta 25 %")] },
  { id: "castle-cara-gold", name: "Château Cara Gold", maker: "Castle Malting", type: "caramelo", colorEBC: 120, ppg: 34, maxPct: 20, description: "Caramelo, toffee. cervezas ámbar, oscuras, belgas", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/15/malta-cara-gold-castle-malting", "Sabor: Caramelo, toffee; uso hasta 20 %")] },
  { id: "castle-crystal", name: "Château Crystal", maker: "Castle Malting", type: "caramelo", colorEBC: 150, ppg: 33, maxPct: 15, description: "Caramelo, malta, galleta. cervezas ámbar, oscuras, belgas", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/16/malta-crystal-castle-malting", "Sabor: Caramelo, malta, galleta; uso hasta 15 %")] },
  { id: "castle-cafe-light", name: "Château Café Light", maker: "Castle Malting", type: "tostada", colorEBC: 250, ppg: 30, maxPct: 15, description: "Nuez, cafe. Stouts, porters, ale escocesa, cerveza negra belga", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/17/malta-cafe-light-castle-malting", "Sabor: Nuez, cafe; uso hasta 15 %")] },
  { id: "castle-special-b", name: "Château Special Belgium (Special B)", maker: "Castle Malting", type: "caramelo", colorEBC: 300, ppg: 32, maxPct: 10, description: "Malta, nuez, ciruela. Ales abadía, dubbel, porter, ales oscuras, doppelbock", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/18/malta-special-belgium-castle-malting", "Sabor: Malta, nuez, ciruela; uso hasta 10 %")] },
  { id: "castle-chocolate", name: "Château Chocolate", maker: "Castle Malting", type: "tostada", colorEBC: 900, ppg: 28, maxPct: 7, description: "chocolate, nuez. porter, stout, Brown ale", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/19/malta-chocolate-castle-malting", "Sabor: chocolate, nuez; uso hasta 7 %")] },
  { id: "castle-negra", name: "Château Black", maker: "Castle Malting", type: "tostada", colorEBC: 1400, ppg: 25, maxPct: 6, description: "café, chocolate amargo, quemado, ahumado. porter, stout", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Castle Malting; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-castle-malting/20/malta-negra-castle-malting", "Sabor: café, chocolate amargo, quemado, ahumado; uso hasta 6 %")] },
  { id: "fuglsang-pilsen", name: "Pilsen", maker: "Fuglsang", type: "base", colorEBC: 3.5, ppg: 37, maxPct: 100, description: "Cereal “CRISPY”. Malta base para todas las cervezas, principalmente utilizada como malta base en la elaboración de cervezas tipo Pilsner", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Fuglsang; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-fuglsang/4/malta-pilsen-fuglsang", "Sabor: Cereal “CRISPY”; uso hasta 100 %")] },
  { id: "fuglsang-pale-ale", name: "Pale Ale", maker: "Fuglsang", type: "base", colorEBC: 6.5, ppg: 37, maxPct: 100, description: "Cereal, Malta. Pale Ale, IPA, Amber Ale y otras cervezas con cuerpo medio y rico", needsMash: true, source: 'referencia', sourceNote: "EBC típico de la ficha de Fuglsang; Distrines no lo publica. Confírmalo en el saco.", stores: [offer("https://distrines.com/maltas-fuglsang/5/malta-pale-ale-fuglsang", "Sabor: Cereal, Malta; uso hasta 100 %")] },
];

/** Lúpulos que vende Distrines: id del catálogo → oferta con el rango de alfa publicado. */
export const DISTRINES_HOP_OFFERS: Record<string, StoreOffer> = {
  "amarillo": offer("https://distrines.com/lupulos/49/lupulo-amarillo", "AA 8–11 % según Distrines; perfil: Floral, cítrico, fruta dulce"),
  "bravo": offer("https://distrines.com/lupulos/50/lupulo-bravo", "AA 14–17 % según Distrines; perfil: Afrutado, floral"),
  "cascade": offer("https://distrines.com/lupulos/51/lupulo-cascade", "AA 5–9 % según Distrines; perfil: Cítrico, floral"),
  "centennial": offer("https://distrines.com/lupulos/52/lupulo-centennial", "AA 7–12 % según Distrines; perfil: Cítrico, floral, amaderado"),
  "chinook": offer("https://distrines.com/lupulos/53/lupulo-chinook", "AA 12–14 % según Distrines; perfil: Cítrico, especiado, herbal"),
  "citra": offer("https://distrines.com/lupulos/54/lupulo-citra", "AA 10–15 % según Distrines; perfil: Cítrico, fruta dulce, floral"),
  "columbus": offer("https://distrines.com/lupulos/55/lupulo-ctz", "AA 14–16 % según Distrines; perfil: Especiado, cítrico, amaderado"),
  "el-dorado": offer("https://distrines.com/lupulos/56/lupulo-el-dorado", "AA 13–17 % según Distrines; perfil: Fruta dulce, fruta verde"),
  "ekg": offer("https://distrines.com/lupulos/57/lupulo-east-kent-golding", "AA 4–6 % según Distrines; perfil: maderoso, cítrico, especiado"),
  "elani": offer("https://distrines.com/lupulos/288/lupulo-elani", "AA 4–8 % según Distrines; perfil: cítrico, floral"),
  "fuggle": offer("https://distrines.com/lupulos/58/lupulo-fuggle", "AA 3–7 % según Distrines; perfil: Maderoso, floral, mentolado"),
  "galaxy": offer("https://distrines.com/lupulos/59/lupulo-galaxy", "AA 13–18 % según Distrines; perfil: Fruta dulce, cítrico"),
  "tradition": offer("https://distrines.com/lupulos/61/lupulo-hallertau-tradition", "AA 4–7 % según Distrines; perfil: Herbal, terroso, frutal"),
  "herkules": offer("https://distrines.com/lupulos/289/lupulo-herkules", "Distrines publica 4–8 % AA, pero Herkules suele tener 12–17 %: confirma el valor de tu bolsa; perfil: cítrico, floral"),
  "idaho-7": offer("https://distrines.com/lupulos/62/lupulo-idaho-7", "AA 9–14 % según Distrines; perfil: Frutal, cítrico, herbal"),
  "magnum": offer("https://distrines.com/lupulos/64/lupulo-magnum", "AA 11–16 % según Distrines; perfil: Herbal, cítrico, mentolado"),
  "mandarina-bavaria": offer("https://distrines.com/lupulos/65/lupulo-mandarina-bavaria", "AA 7–10 % según Distrines; perfil: Cítrico, fruta dulce"),
  "mosaic": offer("https://distrines.com/lupulos/66/lupulo-mosaic", "AA 11–13 % según Distrines; perfil: Cítrico, fruta dulce"),
  "nelson-sauvin": offer("https://distrines.com/lupulos/318/lupulo-nelson-sauvin", "AA 10–13 % según Distrines; perfil: Uva blanca, grosella, frutas tropicales, vino blanco"),
  "northern-brewer": offer("https://distrines.com/lupulos/67/lupulo-northern-brewer", "AA 6–10 % según Distrines; perfil: Amaderado, mentolado"),
  "nugget": offer("https://distrines.com/lupulos/68/lupulo-nugget", "AA 11–14 % según Distrines; perfil: Herbal, citrico, amaderado"),
  "motueka": offer("https://distrines.com/lupulos/317/lupulo-motuek", "AA 5.5–10 % según Distrines; perfil: Lima, limón, frutas tropicales, floral"),
  "perle": offer("https://distrines.com/lupulos/69/lupulo-perle", "AA 4–9 % según Distrines; perfil: Herbal, mentolado, fruta verde"),
  "rakau": offer("https://distrines.com/lupulos/319/lupulo-nelson-sauvin", "AA 10–13 % según Distrines; perfil: Durazno, albaricoque, higo, cítricos, frutas de hueso"),
  "saaz": offer("https://distrines.com/lupulos/70/lupulo-saaz", "AA 2–6 % según Distrines; perfil: Herbal, floral, especiado"),
  "sabro": offer("https://distrines.com/lupulos/71/lupulo-sabro", "AA 12–17 % según Distrines; perfil: Fruta dulce, cítrico"),
  "simcoe": offer("https://distrines.com/lupulos/72/lupulo-simcoe", "AA 12–14 % según Distrines; perfil: Fruta dulce, amaderado, cítrico"),
  "willamette": offer("https://distrines.com/lupulos/74/lupulo-willamette", "AA 4–6 % según Distrines; perfil: Herbal, amaderado, especiado"),
  "warrior": offer("https://distrines.com/lupulos/320/lupulo-warrior", "AA 15.5–18 % según Distrines; perfil: Cítrico, resinoso, herbal, especiado"),
};

export const DISTRINES_HOPS: Hop[] = [
  { id: "bravo", name: "Bravo", origin: "EE. UU.", alpha: 15.5, alphaRange: [14, 17], purpose: "doble", aroma: ["frutos-rojos", "floral", "naranja"], substitutes: ["warrior", "columbus", "magnum"], description: "Alfa alto con notas frutales y florales.", source: 'fabricante', sourceNote: 'Rango de alfa publicado por Distrines', stores: [offer("https://distrines.com/lupulos/50/lupulo-bravo", "AA 14–17 % según Distrines")] },
  { id: "elani", name: "Elani", origin: "EE. UU.", alpha: 6, alphaRange: [4, 8], purpose: "doble", aroma: ["citrico", "floral", "frutas-hueso"], substitutes: ["cascade", "amarillo"], description: "Variedad reciente: cítrico y floral.", source: 'fabricante', sourceNote: 'Rango de alfa publicado por Distrines', stores: [offer("https://distrines.com/lupulos/288/lupulo-elani", "AA 4–8 % según Distrines")] },
  { id: "rakau", name: "Rakau", origin: "Nueva Zelanda", alpha: 11.5, alphaRange: [10, 13], purpose: "doble", aroma: ["frutas-hueso", "tropical", "citrico"], substitutes: ["nectaron", "galaxy", "idaho-7"], description: "Durazno, albaricoque e higo.", source: 'fabricante', sourceNote: 'Rango de alfa publicado por Distrines', stores: [offer("https://distrines.com/lupulos/319/lupulo-nelson-sauvin", "AA 10–13 % según Distrines")] },
];

/** Levaduras de Distrines ya presentes en el catálogo: oferta con temperatura y atenuación publicadas. */
export const DISTRINES_YEAST_OFFERS: Record<string, StoreOffer & { tempRange?: [number, number]; attenuationRange?: [number, number] }> = {
  "s-04": { ...offer("https://distrines.com/levaduras/75/levadura-safale-s04", "Según Distrines: 18–26 °C, atenuación 74–82 %"), tempRange: [18, 26], attenuationRange: [74, 82] },
  "us-05": { ...offer("https://distrines.com/levaduras/76/levadura-safale-us05", "Según Distrines: 18–28 °C, atenuación 81–83 %"), tempRange: [18, 28], attenuationRange: [81, 83] },
  "k-97": { ...offer("https://distrines.com/levaduras/77/levadura-safale-k97", "Según Distrines: 18–26 °C, atenuación 80–84 %"), tempRange: [18, 26], attenuationRange: [80, 84] },
  "be-134": { ...offer("https://distrines.com/levaduras/78/levadura-safale-be134", "Según Distrines: 18–26 °C, atenuación 89–93 %"), tempRange: [18, 26], attenuationRange: [89, 93] },
  "be-256": { ...offer("https://distrines.com/levaduras/79/levadura-safale-be256", "Según Distrines: 18–26 °C, atenuación 82–86 %"), tempRange: [18, 26], attenuationRange: [82, 86] },
  "wb-06": { ...offer("https://distrines.com/levaduras/80/levadura-safale-wb06", "Según Distrines: 18–26 °C, atenuación 86–90 %"), tempRange: [18, 26], attenuationRange: [86, 90] },
  "s-33": { ...offer("https://distrines.com/levaduras/82/levadura-safale-s33", "Según Distrines: 18–26 °C, atenuación 68–72 %"), tempRange: [18, 26], attenuationRange: [68, 72] },
  "t-58": { ...offer("https://distrines.com/levaduras/83/levadura-safale-t58", "Según Distrines: 18–26 °C, atenuación 72–78 %"), tempRange: [18, 26], attenuationRange: [72, 78] },
  "s-189": { ...offer("https://distrines.com/levaduras/85/levadura-saflager-s189", "Según Distrines: 12–18 °C, atenuación 80–84 %"), tempRange: [12, 18], attenuationRange: [80, 84] },
  "w-34-70": { ...offer("https://distrines.com/levaduras/86/levadura-saflager-w3470", "Según Distrines: 12–18 °C, atenuación 80–84 %"), tempRange: [12, 18], attenuationRange: [80, 84] },
  "s-23": { ...offer("https://distrines.com/levaduras/87/levadura-saflager-s23", "Según Distrines: 12–18 °C, atenuación 80–84 %"), tempRange: [12, 18], attenuationRange: [80, 84] },
};

export const DISTRINES_YEASTS: Yeast[] = [
  { id: "w-68", name: "SafAle W-68", lab: 'Fermentis', code: "W-68", type: "trigo", form: 'seca', attenuation: 80, tempRange: [18, 26], flocculation: "baja", family: "weizen", sta1: false, description: "Weihenstephan: banano y clavo para trigo alemán.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/81/levadura-safale-w-68")] },
  { id: "bw-20", name: "SafAle BW-20", lab: 'Fermentis', code: "BW-20", type: "trigo", form: 'seca', attenuation: 78, tempRange: [18, 26], flocculation: "media", family: "wit", sta1: false, description: "Para Witbier y trigo belga.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/278/levadura-safale-bw20")] },
  { id: "f-2", name: "SafAle F-2", lab: 'Fermentis', code: "F-2", type: "ale", form: 'seca', attenuation: 0, tempRange: [15, 25], flocculation: "baja", family: "refermentacion", sta1: false, description: "Para refermentar en botella o barril; no para la fermentación principal.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/84/levadura-safale-f2")] },
  { id: "sh-45", name: "SafLager SH-45", lab: 'Fermentis', code: "SH-45", type: "lager", form: 'seca', attenuation: 80, tempRange: [12, 18], flocculation: "alta", family: "lager-alemana", sta1: false, description: "Lager; la tienda no publica temperatura ni atenuación: verifica la ficha de Fermentis.", source: "referencia", sourceNote: "La tienda no publica datos técnicos: valores aproximados", stores: [offer("https://distrines.com/levaduras/310/saflager-sh45")] },
  { id: "ld-20", name: "SafBrew LD-20", lab: 'Fermentis', code: "LD-20", type: "ale", form: 'seca', attenuation: 100, attenuationRange: [98, 102], tempRange: [12, 20], flocculation: "media", family: "diastatica", sta1: true, description: "Diastática (incluye enzima): seca por completo. Para cervezas muy secas.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/88/levadura-safbrew-ld20")] },
  { id: "lp-652", name: "SafSour LP 652", lab: 'Fermentis', code: "LP 652", type: "acida", form: 'seca', attenuation: 0, tempRange: [30, 40], flocculation: "baja", family: "bacteria", sta1: false, description: "Bacteria Lactobacillus plantarum para agriar en olla (kettle sour). No es levadura.", source: "referencia", sourceNote: "La tienda no publica datos técnicos: valores aproximados", stores: [offer("https://distrines.com/levaduras/89/bacteria-safsour-lp-652")] },
  { id: "br-8", name: "SafBrew BR-8", lab: 'Fermentis', code: "BR-8", type: "belga", form: 'seca', attenuation: 85, tempRange: [15, 25], flocculation: "baja", family: "brett", sta1: false, description: "Brettanomyces: carácter funky y frutal; usar en secundaria.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/90/levadura-safbrew-br8")] },
  { id: "ha-18", name: "SafBrew HA-18", lab: 'Fermentis', code: "HA-18", type: "ale", form: 'seca', attenuation: 100, attenuationRange: [98, 102], tempRange: [25, 35], flocculation: "media", family: "diastatica", sta1: true, description: "Diastática para alto alcohol (con enzima).", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/91/levadura-safbrew-ha18")] },
  { id: "da-16", name: "SafBrew DA-16", lab: 'Fermentis', code: "DA-16", type: "ale", form: 'seca', attenuation: 100, attenuationRange: [98, 102], tempRange: [20, 32], flocculation: "media", family: "diastatica", sta1: true, description: "Diastática: perfil frutal y final muy seco (con enzima).", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/92/levadura-safbrew-da16")] },
  { id: "la-01", name: "SafBrew LA-01", lab: 'Fermentis', code: "LA-01", type: "ale", form: 'seca', attenuation: 15, tempRange: [15, 25], flocculation: "media", family: "sin-alcohol", sta1: false, description: "No fermenta maltosa: para cervezas sin o bajas en alcohol.", source: "fabricante", sourceNote: "Datos publicados por Distrines (Fermentis)", stores: [offer("https://distrines.com/levaduras/93/levadura-safbrew-la01")] },
];

/** Azúcares y adjuntos de Distrines que ya están en el catálogo. */
export const DISTRINES_FERMENTABLE_OFFERS: Record<string, StoreOffer> = {
  "candi-clear": offer("https://distrines.com/adjuntos/99/azucar-candy-clara"),
  "dextrose": offer("https://distrines.com/adjuntos/111/dextrosa"),
  "maltodextrin": offer("https://distrines.com/adjuntos/112/maltodextrina"),
};

/** Otros insumos (adjuntos, sales, enzimas, clarificantes, nutrientes) con enlace a la tienda. */
export const DISTRINES_OTHERS: { kind: string; name: string; url: string }[] = [
  { kind: "adjuntos", name: "Cáscaras de Naranja Amarga", url: "https://distrines.com/adjuntos/101/cascaras-de-naranja-amarga" },
  { kind: "adjuntos", name: "Cáscaras de Naranja Dulce", url: "https://distrines.com/adjuntos/102/cascaras-de-naranja-dulce" },
  { kind: "adjuntos", name: "Nibs de Cacao", url: "https://distrines.com/adjuntos/105/nibs-de-cacao" },
  { kind: "adjuntos", name: "Chips de Coco", url: "https://distrines.com/adjuntos/103/chips-de-coco" },
  { kind: "adjuntos", name: "Saborizante de Cereza", url: "https://distrines.com/adjuntos/107/saborizante-de-cereza" },
  { kind: "adjuntos", name: "Saborizante de Mango", url: "https://distrines.com/adjuntos/108/saborizante-de-mango" },
  { kind: "adjuntos", name: "Saborizante de Vainilla", url: "https://distrines.com/adjuntos/109/saborizante-de-vainilla" },
  { kind: "adjuntos", name: "Chips de Roble", url: "https://distrines.com/adjuntos/104/chips-de-roble" },
  { kind: "adjuntos", name: "Semillas de Cilantro - Coriandro", url: "https://distrines.com/adjuntos/110/semillas-de-cilantro-coriandro" },
  { kind: "adjuntos", name: "Jarabe de Alta Maltosa MOR-SWEET", url: "https://distrines.com/adjuntos/113/jarabe-de-alta-maltosa-mor-sweet" },
  { kind: "adjuntos", name: "Pastillas Carbonatadoras", url: "https://distrines.com/adjuntos/106/pastillas-carbonatadoras" },
  { kind: "sales", name: "Sulfato de Magnesio", url: "https://distrines.com/sales/117/sulfato-de-magnesio" },
  { kind: "sales", name: "Carbonato de Calcio", url: "https://distrines.com/sales/114/carbonato-de-calcio" },
  { kind: "sales", name: "Sulfato de Calcio", url: "https://distrines.com/sales/116/sulfato-de-calcio" },
  { kind: "enzimas", name: "Enzima Maltezyn HT", url: "https://distrines.com/enzimas/125/enzima-maltezyn-ht" },
  { kind: "enzimas", name: "Enzima MatuFast", url: "https://distrines.com/enzimas/126/enzima-matufast" },
  { kind: "enzimas", name: "Enzima Isomax® EEA", url: "https://distrines.com/enzimas/127/enzima-isomax-eea" },
  { kind: "enzimas", name: "Enzima AttenuMax® 102", url: "https://distrines.com/enzimas/128/enzima-attenumax-102" },
  { kind: "clarificantes", name: "Clarificante en Maduración - Biofine Clear A3", url: "https://distrines.com/clarificantes/118/clarificante-en-maduracion-biofine-clear-a3" },
  { kind: "clarificantes", name: "Clarificante en Hervido - Polyclar Brewbrite", url: "https://distrines.com/clarificantes/120/clarificante-en-hervido-polyclar-brewbrite" },
  { kind: "clarificantes", name: "Clarificante en Hervido - Whirlfloc", url: "https://distrines.com/clarificantes/121/clarificante-en-hervido-whirlfloc" },
  { kind: "clarificantes", name: "Clarificante En Hervido - CraftSol", url: "https://distrines.com/clarificantes/316/clarificante-en-hervido-craftsol" },
  { kind: "nutrientes", name: "SpringFerm™ Enologico", url: "https://distrines.com/nutrientes-para-levaduras/286/springferm-enologico" },
  { kind: "nutrientes", name: "Fosfato Diamónico (DAP)", url: "https://distrines.com/nutrientes-para-levaduras/290/fosfato-diamonico-dap" },
];

/** Sales que vende Distrines (las demás se consiguen en otras tiendas o droguerías). */
export const DISTRINES_SALTS = ['yeso', 'epsom', 'carbonatoCalcio'] as const;

/**
 * Equivalencias con criterio cervecero (carácter, no solo color) entre el catálogo general
 * y lo que vende Distrines. Lo que no está aquí se deja como está: azúcares y adjuntos
 * genéricos (se consiguen en cualquier lado), lactosa, y maltas sin equivalente real
 * (p. ej. Carafa Special desamargada: una malta negra común endurecería el tostado).
 */
export const DISTRINES_EQUIVALENTS: Record<string, string> = {
  // Bases
  'pilsner-wey': 'best-pilsen',
  'pilsner-best': 'best-pilsen',
  'pilsner-castle': 'castle-pilsen',
  'pale-2row': 'best-pale-ale',
  'pale-ale-wey': 'best-pale-ale',
  'pale-ale-castle': 'castle-pale-ale',
  'maris-otter': 'castle-maris-otter',
  'golden-promise': 'castle-maris-otter',
  'vienna-wey': 'best-vienna',
  'munich-1-wey': 'best-munich',
  'munich-2-wey': 'best-munich-oscura',
  'wheat-wey': 'best-trigo',
  'wheat-dark-wey': 'best-trigo-oscuro',
  'rye-wey': 'best-centeno',
  'rauch-wey': 'best-ahumada',
  'oats-malted': 'best-avena',
  // Caramelo
  carafoam: 'best-caramel-pils',
  carahell: 'best-caramel-hell',
  carared: 'castle-cara-ruby',
  caraamber: 'best-caramel-amber',
  'caramunich-1': 'best-caramel-munich-1',
  'caramunich-2': 'best-caramel-munich-2',
  'caramunich-3': 'best-caramel-munich-3',
  carawheat: 'best-caramel-munich-2',
  caraaroma: 'best-special-x',
  'crystal-60': 'castle-cara-gold',
  'crystal-120': 'castle-special-b',
  'special-b': 'castle-special-b',
  // Especiales
  melanoidin: 'best-melano',
  'aromatic-castle': 'best-melano',
  'biscuit-castle': 'best-biscuit',
  'abbey-castle': 'best-biscuit',
  'brown-malt': 'castle-cafe-light',
  // Tostadas
  chocolate: 'castle-chocolate',
  'chocolate-wheat': 'best-chocolate',
  'roasted-barley': 'best-cebada-tostada',
  'black-malt': 'castle-negra',
  acidulated: 'best-acida',
  // Lúpulos: los nobles alemanes que no vende se cubren con Hallertau Tradition o Saaz.
  'hallertau-mittelfruh': 'tradition',
  hersbrucker: 'tradition',
  liberty: 'tradition',
  'mount-hood': 'tradition',
  tettnanger: 'saaz',
  spalt: 'saaz',
  sterling: 'saaz',
  'styrian-golding': 'fuggle',
  challenger: 'northern-brewer',
  target: 'magnum',
  cluster: 'northern-brewer',
  galena: 'nugget',
  summit: 'warrior',
  ahtanum: 'cascade',
  talus: 'citra',
  ekuanot: 'el-dorado',
  azacca: 'mosaic',
  strata: 'mosaic',
  'vic-secret': 'galaxy',
  nectaron: 'rakau',
  riwaka: 'motueka',
  wakatu: 'motueka',
  'huell-melon': 'mandarina-bavaria',
  'hallertau-blanc': 'nelson-sauvin',
  cashmere: 'cascade',
  polaris: 'herkules',
  'sorachi-ace': 'sabro',
};

/** Equivalencias por tienda (hoy solo Distrines). */
export const STORE_EQUIVALENTS: Record<string, Record<string, string>> = { [DISTRINES]: DISTRINES_EQUIVALENTS };
