import type { RecipeFermentable } from '../types';
import { L_PER_GAL, LB_PER_KG, ebcToLovibond, srmToEbc } from './units';

/** Color por la ecuación de Morey. Devuelve SRM. */
export function recipeSrm(fermentables: RecipeFermentable[], volumeL: number): number {
  if (volumeL <= 0) return 0;
  const gal = volumeL / L_PER_GAL;
  const mcu = fermentables.reduce(
    (sum, f) => sum + (f.amountKg * LB_PER_KG * ebcToLovibond(f.colorEBC)) / gal,
    0,
  );
  return mcu <= 0 ? 0 : 1.4922 * mcu ** 0.6859;
}

export const recipeEbc = (fermentables: RecipeFermentable[], volumeL: number) =>
  srmToEbc(recipeSrm(fermentables, volumeL));

// Tabla aproximada SRM -> color de la cerveza en un vaso.
const SRM_HEX = [
  '#FFE699', '#FFD878', '#FFCA5A', '#FFBF42', '#FBB123', '#F8A600', '#F39C00', '#EA8F00',
  '#E58500', '#DE7C00', '#D77200', '#CF6900', '#CB6200', '#C35900', '#BB5100', '#B54C00',
  '#B04500', '#A63E00', '#A13700', '#9B3200', '#952D00', '#8E2900', '#882300', '#821E00',
  '#7B1A00', '#771900', '#701400', '#6A0E00', '#660D00', '#5E0B00', '#5A0A02', '#600903',
  '#520907', '#4C0505', '#470606', '#440607', '#3F0708', '#3B0607', '#3A070B', '#36080A',
];

export function srmToHex(srm: number): string {
  const i = Math.min(SRM_HEX.length - 1, Math.max(0, Math.round(srm) - 1));
  return srm >= 40 ? '#1d0505' : SRM_HEX[i];
}
