import { useState } from 'react';
import { fmt } from '../ui';

export interface ChartPoint {
  day: number;
  sg?: number;
  tempC?: number;
}

const W = 640;
const PAD = { l: 48, r: 14, t: 10, b: 24 };

interface PanelProps {
  points: { day: number; v: number }[];
  maxDay: number;
  height: number;
  domain: [number, number];
  ticks: number[];
  format: (v: number) => string;
  color: string;
  reference?: { v: number; label: string };
  hoverDay?: number;
  onHover: (day?: number) => void;
  label: string;
  showX: boolean;
}

function Panel({ points, maxDay, height, domain, ticks, format, color, reference, hoverDay, onHover, label, showX }: PanelProps) {
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const x = (d: number) => PAD.l + (d / maxDay) * iw;
  const y = (v: number) => PAD.t + (1 - (v - domain[0]) / (domain[1] - domain[0])) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const hover = hoverDay === undefined ? undefined : points.reduce<{ day: number; v: number } | undefined>((best, p) => (!best || Math.abs(p.day - hoverDay) < Math.abs(best.day - hoverDay) ? p : best), undefined);
  const xTicks = Array.from({ length: Math.min(8, Math.floor(maxDay) + 1) }, (_, i) => Math.round((i * maxDay) / Math.min(7, Math.max(1, Math.floor(maxDay)))));

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={label}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - rect.left) / rect.width) * W;
        onHover(Math.max(0, Math.min(maxDay, ((px - PAD.l) / iw) * maxDay)));
      }}
      onMouseLeave={() => onHover(undefined)}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {showX &&
        [...new Set(xTicks)].map((d) => (
          <text key={d} x={x(d)} y={height - 6} textAnchor="middle">
            día {d}
          </text>
        ))}
      {reference && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(reference.v)} y2={y(reference.v)} stroke="var(--text-3)" strokeDasharray="4 4" strokeWidth={1} />
          <text x={W - PAD.r} y={y(reference.v) - 4} textAnchor="end">
            {reference.label}
          </text>
        </g>
      )}
      {points.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(p.day)} cy={y(p.v)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
      ))}
      {hover && (
        <g pointerEvents="none">
          <line x1={x(hover.day)} x2={x(hover.day)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--text-3)" strokeWidth={1} />
          <circle cx={x(hover.day)} cy={y(hover.v)} r={6} fill={color} stroke="var(--surface)" strokeWidth={2} />
          <g transform={`translate(${Math.min(x(hover.day) + 8, W - 130)}, ${PAD.t + 4})`}>
            <rect width={118} height={36} rx={6} fill="var(--surface)" stroke="var(--border)" />
            <text x={8} y={15} style={{ fill: 'var(--text-2)' }}>
              Día {fmt(hover.day, 1)}
            </text>
            <text x={8} y={30} style={{ fill: 'var(--text)', fontWeight: 700 }}>
              {format(hover.v)}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** Densidad y temperatura en dos gráficos apilados que comparten el eje de días. */
export function FermentationChart({ points, og, expectedFg }: { points: ChartPoint[]; og: number; expectedFg: number }) {
  const [hoverDay, setHoverDay] = useState<number>();
  const sg = [{ day: 0, v: og }, ...points.filter((p) => p.sg !== undefined).map((p) => ({ day: p.day, v: p.sg! }))].sort((a, b) => a.day - b.day);
  const temp = points.filter((p) => p.tempC !== undefined).map((p) => ({ day: p.day, v: p.tempC! }));
  const maxDay = Math.max(7, ...points.map((p) => p.day)) * 1.05;

  const lo = Math.floor((Math.min(expectedFg, ...sg.map((p) => p.v)) - 0.004) * 200) / 200;
  const hi = Math.ceil((og + 0.002) * 200) / 200;
  const sgTicks: number[] = [];
  const step = hi - lo > 0.05 ? 0.01 : 0.005;
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) sgTicks.push(Math.round(v * 1000) / 1000);

  const tLo = Math.floor(Math.min(...temp.map((p) => p.v), 15) / 5) * 5;
  const tHi = Math.ceil(Math.max(...temp.map((p) => p.v), 22) / 5) * 5;
  const tTicks: number[] = [];
  for (let v = tLo; v <= tHi; v += 5) tTicks.push(v);

  return (
    <div>
      <div className="stat-label" style={{ marginBottom: 4 }}>
        Densidad
      </div>
      <Panel
        points={sg}
        maxDay={maxDay}
        height={210}
        domain={[lo, hi]}
        ticks={sgTicks}
        format={(v) => v.toFixed(3)}
        color="var(--accent)"
        reference={{ v: expectedFg, label: `FG esperada ${expectedFg.toFixed(3)}` }}
        hoverDay={hoverDay}
        onHover={setHoverDay}
        label="Densidad a lo largo de la fermentación"
        showX={temp.length === 0}
      />
      {temp.length > 0 && (
        <>
          <div className="stat-label" style={{ margin: '10px 0 4px' }}>
            Temperatura
          </div>
          <Panel
            points={temp}
            maxDay={maxDay}
            height={130}
            domain={[tLo, tHi]}
            ticks={tTicks}
            format={(v) => `${fmt(v, 1)} °C`}
            color="var(--idea)"
            hoverDay={hoverDay}
            onHover={setHoverDay}
            label="Temperatura a lo largo de la fermentación"
            showX
          />
        </>
      )}
    </div>
  );
}
