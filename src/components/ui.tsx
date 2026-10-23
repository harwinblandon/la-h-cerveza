import { useEffect, useState, type ReactNode } from 'react';
import { srmToHex } from '../domain/calc/color';
import { Icon } from './Icons';
import type { FitLevel } from '../domain/suggest/analysis';
import { fit } from '../domain/suggest/analysis';

// ---------- Formato (decimales con coma, densidad con punto como es costumbre) ----------

export const fmt = (n: number | undefined, d = 1) =>
  n === undefined || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtKg = (kg: number) => (kg < 1 ? `${fmt(kg * 1000, 0)} g` : `${fmt(kg, 2)} kg`);
export const fmtDate = (t: number) => new Date(t).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const parseNum = (s: string) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

// ---------- Entradas ----------

interface NumberInputProps {
  value: number | undefined;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;
  className?: string;
  placeholder?: string;
  unit?: string;
  ariaLabel?: string;
}

/** Campo numérico que acepta coma o punto decimal sin pelear con el cursor. */
export function NumberInput({ value, onChange, decimals = 2, className = '', placeholder, unit, ariaLabel, min, max }: NumberInputProps) {
  // Las densidades (1.050) se escriben con punto, como en todo el mundo cervecero;
  // el resto usa coma decimal. Al escribir se aceptan ambos.
  const toText = (v: number | undefined) => {
    if (v === undefined || !Number.isFinite(v)) return '';
    const t = String(Math.round(v * 10 ** decimals) / 10 ** decimals);
    const isGravity = decimals === 3 && v > 0.95 && v < 1.2;
    return isGravity ? Number(t).toFixed(3) : t.replace('.', ',');
  };
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const input = (
    <input
      className={`input input-num ${className}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        let n = parseNum(e.target.value);
        if (n === undefined) return;
        if (min !== undefined) n = Math.max(min, n);
        if (max !== undefined) n = Math.min(max, n);
        onChange(n);
      }}
    />
  );
  if (!unit) return input;
  return (
    <span className="input-group">
      {input}
      <span className="unit">{unit}</span>
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="faint">{hint}</small>}
    </label>
  );
}

// ---------- Contenedores ----------

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={wide ? { width: 'min(960px, 100%)' } : undefined}>
        <div className="modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" className={`tab ${value === id ? 'active' : ''}`} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={34} />
      </div>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

// ---------- Indicadores ----------

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Swatch({ srm, size = 1 }: { srm: number; size?: number }) {
  return <span className="swatch" style={{ background: srmToHex(srm), width: 26 * size, height: 34 * size }} title={`${fmt(srm)} SRM`} />;
}

interface RangeBarProps {
  label: string;
  value: number;
  range: [number, number];
  /** Límites visibles de la barra. */
  scale: [number, number];
  tolerance: number;
  format: (n: number) => string;
}

export function RangeBar({ label, value, range, scale, tolerance, format }: RangeBarProps) {
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - scale[0]) / (scale[1] - scale[0])) * 100))}%`;
  const level: FitLevel = fit(value, range, tolerance);
  return (
    <div className="range" title={`Estilo: ${format(range[0])} – ${format(range[1])}`}>
      <span className="range-label">{label}</span>
      <div className="range-track">
        <div className="range-zone" style={{ left: pos(range[0]), width: `calc(${pos(range[1])} - ${pos(range[0])})` }} />
        <div className={`range-marker ${level}`} style={{ left: pos(value) }} />
      </div>
      <span className="range-value">{format(value)}</span>
    </div>
  );
}

export function SeverityBadge({ s }: { s: 'problema' | 'aviso' | 'idea' }) {
  const cls = s === 'problema' ? 'badge-bad' : s === 'aviso' ? 'badge-warn' : 'badge-idea';
  return <span className={`badge ${cls}`}>{s}</span>;
}

export function download(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
