import { describe, expect, it } from 'vitest';
import { blend, fromReport, ionBalance } from './waterReport';

describe('informe de agua en cualquier formato', () => {
  it('formato de acueducto (EPA Armenia): calcio como CaCO₃, dureza y alcalinidad', () => {
    // Promedio de septiembre 2026: Ca 17,3 como CaCO₃, dureza 62,2, alcalinidad 52,0, Cl 5,1, SO₄ 17,1
    const r = fromReport({ ca: 17.3, caUnit: 'caco3', hardness: 62.2, alkalinity: 52.0, cl: 5.1, so4: 17.1 }, true);
    expect(r.ions.ca).toBeCloseTo(6.9, 1);
    expect(r.ions.mg).toBeCloseTo(10.9, 1);
    expect(r.ions.hco3).toBeCloseTo(63.4, 1);
    expect(r.ions.na).toBeGreaterThan(5);
    expect(r.ions.na).toBeLessThan(10);
    expect(r.derived.join(' ')).toMatch(/deducido de la dureza/);
    // Con el sodio estimado, el balance cierra.
    expect(Math.abs(r.balance.errorPct)).toBeLessThan(1);
  });

  it('formato de etiqueta (iones en mg/L) no se convierte', () => {
    const r = fromReport({ ca: 20, mg: 5, na: 10, hco3: 80, so4: 10, cl: 8 });
    expect(r.ions).toEqual({ ca: 20, mg: 5, na: 10, so4: 10, cl: 8, hco3: 80 });
    expect(r.derived).toEqual([]);
  });

  it('el balance iónico detecta un dato mal digitado', () => {
    const ok = ionBalance({ ca: 40, mg: 10, na: 27, so4: 40, cl: 25, hco3: 150 });
    expect(ok.quality).toBe('bueno');
    const typo = ionBalance({ ca: 400, mg: 10, na: 15, so4: 40, cl: 25, hco3: 150 });
    expect(typo.quality).toBe('revisar');
    expect(typo.errorPct).toBeGreaterThan(10);
  });

  it('agua de ósmosis o destilada no se marca como error', () => {
    expect(ionBalance({ ca: 1, mg: 0.3, na: 2, so4: 1, cl: 2, hco3: 5 }).quality).not.toBe('revisar');
    expect(ionBalance({ ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0 }).quality).toBe('sin-datos');
  });

  it('mezcla de ósmosis con grifo', () => {
    const grifo = { ca: 60, mg: 12, na: 20, so4: 40, cl: 30, hco3: 180 };
    const ro = { ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0 };
    const m = blend(ro, grifo, 0.7);
    expect(m.ca).toBeCloseTo(18);
    expect(m.hco3).toBeCloseTo(54);
  });
});
