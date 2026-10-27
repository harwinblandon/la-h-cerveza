import { fmtSg } from '../domain/calc/units';
import { GUIDELINES, GUIDELINE_LABEL, guidelineOf } from '../domain/catalog';
import { useState } from 'react';
import type { Style, StyleGuideline } from '../domain/types';

/** Opciones de un <select> de estilos, agrupadas por guía (BJCP, Brewers Association). */
export function StyleOptions({ styles }: { styles: Style[] }) {
  return (
    <>
      {GUIDELINES.map((g) => (
        <optgroup key={g} label={GUIDELINE_LABEL[g]}>
          {styles
            .filter((s) => guidelineOf(s) === g)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.name}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}

const RANGE_NAME: Record<keyof Style['ranges'], string> = { og: 'OG', fg: 'FG', ibu: 'IBU', srm: 'color', abv: 'ABV' };

/** Chips con los rangos del estilo; lo que la guía no fija se marca como referencia del estilo base. */
export function StyleRangeChips({ style, fg }: { style: Style; fg?: boolean }) {
  const R = style.ranges;
  const ref = (k: keyof Style['ranges']) => (style.openRanges?.includes(k) ? ' (ref.)' : '');
  return (
    <>
      <span className="chip">
        OG {fmtSg(R.og[0])}–{fmtSg(R.og[1])}
        {ref('og')}
      </span>
      {fg && (
        <span className="chip">
          FG {fmtSg(R.fg[0])}–{fmtSg(R.fg[1])}
          {ref('fg')}
        </span>
      )}
      <span className="chip">
        {R.ibu[0]}–{R.ibu[1]} IBU{ref('ibu')}
      </span>
      <span className="chip">
        {R.srm[0]}–{R.srm[1]} SRM{ref('srm')}
      </span>
      <span className="chip">
        {R.abv[0]}–{R.abv[1]} % ABV{ref('abv')}
      </span>
    </>
  );
}

/** Aviso cuando la guía no fija algunos rangos ("varía con el estilo"). */
export function OpenRangesNote({ style, base }: { style: Style; base?: Style }) {
  if (!style.openRanges?.length) return null;
  return (
    <p className="faint" style={{ fontSize: '0.8rem', margin: '0.4rem 0 0' }}>
      La guía no fija {style.openRanges.map((k) => RANGE_NAME[k]).join(', ')}: dependen del estilo base. Como referencia se usan los de {base ? base.name : 'un estilo cercano'}.
    </p>
  );
}

const GUIDE_KEY = 'la-h-guia-estilos';

/** Guía de estilos elegida en las listas (se recuerda en este navegador). */
export function useGuideline(): [StyleGuideline, (g: StyleGuideline) => void] {
  const [g, setG] = useState<StyleGuideline>(() => {
    try {
      return localStorage.getItem(GUIDE_KEY) === 'ba' ? 'ba' : 'bjcp';
    } catch {
      return 'bjcp';
    }
  });
  const set = (v: StyleGuideline) => {
    setG(v);
    try {
      localStorage.setItem(GUIDE_KEY, v);
    } catch {
      /* sin almacenamiento */
    }
  };
  return [g, set];
}

export function GuidelineSelect({ value, onChange }: { value: StyleGuideline; onChange: (g: StyleGuideline) => void }) {
  return (
    <select className="input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value as StyleGuideline)} aria-label="Guía de estilos">
      {GUIDELINES.map((g) => (
        <option key={g} value={g}>
          {GUIDELINE_LABEL[g]}
        </option>
      ))}
    </select>
  );
}
