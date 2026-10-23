export const LB_PER_KG = 2.20462;
export const L_PER_GAL = 3.78541;

export const cToF = (c: number) => c * 9 / 5 + 32;
export const fToC = (f: number) => (f - 32) * 5 / 9;

export const ebcToSrm = (ebc: number) => ebc * 0.508;
export const srmToEbc = (srm: number) => srm * 1.97;
/** Lovibond a partir de SRM (inversa de SRM = 1.3546·L − 0.76). */
export const srmToLovibond = (srm: number) => (srm + 0.76) / 1.3546;
export const ebcToLovibond = (ebc: number) => srmToLovibond(ebcToSrm(ebc));

export const sgToPlato = (sg: number) =>
  -616.868 + 1111.14 * sg - 630.272 * sg ** 2 + 135.997 * sg ** 3;

export const platoToSg = (p: number) => 1 + p / (258.6 - (p / 258.2) * 227.1);

export const psiToBar = (psi: number) => psi * 0.0689476;
export const barToPsi = (bar: number) => bar / 0.0689476;

export const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const fmtSg = (sg: number) => (Number.isFinite(sg) ? sg.toFixed(3) : '—');

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
