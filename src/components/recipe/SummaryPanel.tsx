import { WaterSummary } from './WaterPlan';
import type { RecipeStats } from '../../domain/calc/recipeStats';
import { fmtSg, srmToEbc } from '../../domain/calc/units';
import type { Suggestion } from '../../domain/suggest/analysis';
import type { Recipe, Style } from '../../domain/types';
import { guidelineOf } from '../../domain/catalog';
import { SourceTag } from '../Provenance';
import { RangeBar, SeverityBadge, Stat, Swatch, fmt } from '../ui';

export function SummaryPanel({ recipe, stats, style, colorUnit, indices }: { recipe: Recipe; stats: RecipeStats; style?: Style; colorUnit: 'EBC' | 'SRM'; indices?: { style?: number; sensory?: number } }) {
  const color = colorUnit === 'EBC' ? stats.ebc : stats.srm;
  const ref = (k: keyof Style['ranges']) => (style?.openRanges?.includes(k) ? ' (ref.)' : '');
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <Swatch srm={stats.srm} size={1.3} />
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{style ? `${style.code} · ${style.name}` : 'Sin estilo'}</div>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            {fmt(stats.calories, 0)} kcal por 355 mL · BU:GU {fmt(stats.buGu, 2)}
          </div>
          {indices && (indices.style !== undefined || indices.sensory !== undefined) && (
            <div className="row" style={{ marginTop: 4, gap: 4 }}>
              {indices.style !== undefined && <span className={`badge ${indices.style >= 90 ? 'badge-ok' : 'badge-warn'}`}>estilo {indices.style} %</span>}
              {indices.sensory !== undefined && <span className={`badge ${indices.sensory >= 85 ? 'badge-ok' : 'badge-warn'}`}>sensorial {indices.sensory} %</span>}
            </div>
          )}
        </div>
      </div>
      <div className="stats">
        <Stat label={`OG${ref('og')}`} value={fmtSg(stats.og)} sub={`pre-hervor ${fmtSg(stats.preBoilSg)}`} />
        <Stat label={`FG${ref('fg')}`} value={fmtSg(stats.fg)} sub={<>atenuación {fmt(stats.attenuation, 0)} % <SourceTag source="estimacion" note="Atenuación de la levadura corregida por la temperatura de macerado" compact /></>} />
        <Stat label={`ABV${ref('abv')}`} value={`${fmt(stats.abv)} %`} />
        <Stat label={`IBU${ref('ibu')}`} value={fmt(stats.ibu, 0)} />
        <Stat label="Color" value={`${fmt(color, 0)}`} sub={colorUnit} />
        <Stat label="pH macerado" value={stats.mashPh ? fmt(stats.mashPh, 2) : '—'} sub={<SourceTag source="estimacion" note="Balance de cargas por tipo y color de malta; precisión ±0,1" compact />} />
      </div>
      <WaterSummary recipe={recipe} stats={stats} />
      <div className="faint" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
        <SourceTag source="calculo" compact /> OG por extracto y eficiencia · IBU Tinseth · color Morey · ABV de alta precisión
      </div>
      {style && (
        <div style={{ marginTop: '1rem' }}>
          <div className="faint" style={{ fontSize: '0.75rem', marginBottom: '0.4rem' }}>
            Zonas verdes: <SourceTag source={guidelineOf(style)} compact /> rangos del estilo{style.openRanges?.length ? ' · (ref.): la guía no lo fija' : ''}
          </div>
          <RangeBar label="OG" value={stats.og} range={style.ranges.og} scale={[1.02, 1.12]} tolerance={0.004} format={fmtSg} />
          <RangeBar label="FG" value={stats.fg} range={style.ranges.fg} scale={[0.996, 1.04]} tolerance={0.002} format={fmtSg} />
          <RangeBar label="ABV" value={stats.abv} range={style.ranges.abv} scale={[2, 12]} tolerance={0.4} format={(n) => `${fmt(n)} %`} />
          <RangeBar label="IBU" value={stats.ibu} range={style.ranges.ibu} scale={[0, 100]} tolerance={5} format={(n) => fmt(n, 0)} />
          {colorUnit === 'EBC' ? (
            <RangeBar
              label={`EBC${ref('srm')}`}
              value={stats.ebc}
              range={[srmToEbc(style.ranges.srm[0]), srmToEbc(style.ranges.srm[1])]}
              scale={[0, 80]}
              tolerance={4}
              format={(n) => fmt(n, 0)}
            />
          ) : (
            <RangeBar label={`SRM${ref('srm')}`} value={stats.srm} range={style.ranges.srm} scale={[0, 40]} tolerance={2} format={(n) => fmt(n, 1)} />
          )}
        </div>
      )}
    </div>
  );
}

export function SuggestionsPanel({
  suggestions,
  onApply,
  compact,
  onIntentional,
  onReconsider,
}: {
  suggestions: Suggestion[];
  onApply: (s: Suggestion, i: number) => void;
  compact?: boolean;
  onIntentional?: (s: Suggestion) => void;
  onReconsider?: (s: Suggestion) => void;
}) {
  const pending = suggestions.filter((s) => !s.intentional);
  const shown = compact ? pending.slice(0, 4) : suggestions;
  if (pending.length === 0 && (compact || suggestions.length === 0)) {
    return (
      <div className="card">
        <h3>Asistente</h3>
        <p className="muted" style={{ margin: 0 }}>
          ✓ Todo en orden: la receta está dentro del estilo y sin alertas.
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          Asistente <SourceTag source="regla" note="Sugerencias basadas en reglas cerveceras y en los rangos del estilo; tú decides" compact />
        </h3>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {pending.length} sugerencia{pending.length === 1 ? '' : 's'}
          {suggestions.length > pending.length ? ` · ${suggestions.length - pending.length} intencional${suggestions.length - pending.length === 1 ? '' : 'es'}` : ''}
        </span>
      </div>
      {shown.map((s) => (
        <div key={s.id} className={`sug sug-${s.severity}`} style={s.intentional ? { opacity: 0.75 } : undefined}>
          <div className="row-between">
            <div className="sug-title">{s.title}</div>
            {s.intentional ? <span className="badge badge-idea">intencional</span> : <SeverityBadge s={s.severity} />}
          </div>
          <div className="sug-detail">{s.intentional ? <>Decidiste mantenerlo: “{s.intentional}”</> : s.detail}</div>
          <div className="sug-actions">
            {!s.intentional &&
              s.actions?.map((a, i) => (
                <button key={i} className="btn btn-sm" onClick={() => onApply(s, i)}>
                  {a.label}
                </button>
              ))}
            {!s.intentional && s.fromStyle && onIntentional && (
              <button className="btn btn-sm btn-ghost" title="Me aparto del estilo a propósito" onClick={() => onIntentional(s)}>
                Es intencional
              </button>
            )}
            {s.intentional && onReconsider && (
              <button className="btn btn-sm btn-ghost" onClick={() => onReconsider(s)}>
                Reconsiderar
              </button>
            )}
          </div>
        </div>
      ))}
      {compact && pending.length > shown.length && (
        <p className="faint" style={{ fontSize: '0.82rem', margin: '0.5rem 0 0' }}>
          + {pending.length - shown.length} más en la pestaña Asistente.
        </p>
      )}
    </div>
  );
}
