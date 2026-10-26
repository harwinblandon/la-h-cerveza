import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSyncStatus } from '../components/AccountForm';
import { Stat, fmtDate, fmtDateTime } from '../components/ui';
import { useProfile } from '../hooks';
import type { Member, UsageDay } from '../sync/engine';
import { usageDay } from '../sync/usage';

const engine = () => import('../sync/engine');
const DAY = 86_400_000;

/** Panel del administrador: uso de la app y cuentas registradas, con suspensión de cuentas. */
export default function Admin() {
  const profile = useProfile();
  const status = useSyncStatus(!!profile?.uid);
  const [members, setMembers] = useState<Member[]>();
  const [usage, setUsage] = useState<UsageDay[]>();
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    setError('');
    try {
      const m = await engine();
      const [ms, us] = await Promise.all([m.listMembers(), m.usageStats()]);
      setMembers(ms.sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)));
      setUsage(us);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar.');
    }
  };
  useEffect(() => {
    if (status?.isAdmin) void load();
  }, [status?.isAdmin]);

  const kpi = useMemo(() => {
    const now = Date.now();
    const since = (days: number) => usageDay(new Date(now - (days - 1) * DAY));
    const sum = (days: number) => (usage ?? []).filter((d) => d.day >= since(days)).reduce((s, d) => s + d.opens, 0);
    const active = (days: number) => (members ?? []).filter((m) => (m.lastSeenAt ?? 0) >= now - days * DAY).length;
    const today = (usage ?? []).find((d) => d.day === usageDay());
    return { opensToday: today?.opens ?? 0, devicesToday: today?.devices ?? 0, opens7: sum(7), opens30: sum(30), active7: active(7), active30: active(30) };
  }, [usage, members]);

  if (profile && !profile.uid) return <Navigate to="/" replace />;
  if (status && status.isAdmin === false) return <p className="muted">Esta cuenta no tiene permisos de administración.</p>;
  if (!status?.isAdmin) return <p className="muted">Comprobando permisos…</p>;

  const shown = (members ?? []).filter((m) => m.email.toLowerCase().includes(q.toLowerCase()));
  const toggle = async (m: Member) => {
    if (!confirm(m.blocked ? `¿Reactivar la cuenta ${m.email}?` : `¿Suspender la cuenta ${m.email}? No podrá subir cambios hasta que la reactives.`)) return;
    try {
      await (await engine()).setBlocked(m.uid, !m.blocked);
      setMembers((list) => list?.map((x) => (x.uid === m.uid ? { ...x, blocked: !m.blocked } : x)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo cambiar.');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administración</h1>
        </div>
        <button className="btn" onClick={load}>
          Actualizar
        </button>
      </div>
      {error && <p className="callout callout-warn">{error}</p>}
      <div className="card">
        <div className="stats">
          <Stat label="Cuentas registradas" value={members?.length ?? '—'} sub={`${kpi.active7} activas en 7 días · ${kpi.active30} en 30`} />
          <Stat label="Aperturas hoy" value={kpi.opensToday} sub={`${kpi.devicesToday} equipos distintos`} />
          <Stat label="Aperturas 7 días" value={kpi.opens7} />
          <Stat label="Aperturas 30 días" value={kpi.opens30} />
        </div>
      </div>
      <div className="card">
        <h2>Aperturas por día</h2>
        <UsageChart days={(usage ?? []).slice(-30)} />
        <details style={{ marginTop: '0.6rem' }}>
          <summary className="faint" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
            Ver tabla
          </summary>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Día</th>
                  <th className="r">Aperturas</th>
                  <th className="r">Equipos</th>
                  <th className="r">Con cuenta</th>
                  <th className="r">Perfil local</th>
                  <th className="r">Sin registro</th>
                </tr>
              </thead>
              <tbody>
                {[...(usage ?? [])].reverse().map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td className="r num">{d.opens}</td>
                    <td className="r num">{d.devices ?? '—'}</td>
                    <td className="r num">{d.cuenta}</td>
                    <td className="r num">{d.local}</td>
                    <td className="r num">{d.sinRegistro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>Cuentas</h2>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar correo" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Registro</th>
                <th>Última vez</th>
                <th className="r">Aperturas</th>
                <th className="r">Recetas</th>
                <th className="r">Lotes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.uid}>
                  <td>
                    {m.email}
                    {m.blocked && <span className="badge badge-bad" style={{ marginLeft: 6 }}>Suspendida</span>}
                  </td>
                  <td className="faint">{m.createdAt ? fmtDate(Date.parse(m.createdAt)) : '—'}</td>
                  <td className="faint">{m.lastSeenAt ? fmtDateTime(m.lastSeenAt) : '—'}</td>
                  <td className="r num">{m.opens}</td>
                  <td className="r num">{m.recipes}</td>
                  <td className="r num">{m.batches}</td>
                  <td className="r">
                    {m.uid !== profile?.uid && (
                      <button className={`btn btn-sm ${m.blocked ? '' : 'btn-ghost btn-danger'}`} onClick={() => toggle(m)}>
                        {m.blocked ? 'Reactivar' : 'Suspender'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {members && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="faint">
                    Sin cuentas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Barras de aperturas por día (una sola serie; el día y la cifra al pasar el cursor). */
function UsageChart({ days }: { days: UsageDay[] }) {
  const [hover, setHover] = useState<number>();
  if (!days.length) return <p className="faint">Todavía no hay registros de uso.</p>;
  const max = Math.max(1, ...days.map((d) => d.opens));
  const W = 640;
  const H = 160;
  const gap = 2;
  const bw = Math.max(3, (W - gap * (days.length - 1)) / days.length);
  const peak = days.reduce((a, b, i) => (b.opens > days[a].opens ? i : a), 0);
  const h = hover !== undefined ? days[hover] : undefined;
  return (
    <div className="usage-chart">
      <div className="faint" style={{ fontSize: '0.8rem', minHeight: '1.2rem' }}>
        {h ? `${h.day}: ${h.opens} aperturas${h.devices !== undefined ? ` · ${h.devices} equipos` : ''}` : `Últimos ${days.length} días · máximo ${days[peak].opens} el ${days[peak].day}`}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Aperturas por día" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={0} x2={W} y1={H} y2={H} className="usage-axis" />
        {days.map((d, i) => {
          const bh = Math.max(d.opens > 0 ? 2 : 0, (d.opens / max) * (H - 8));
          const x = i * (bw + gap);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(undefined)}>
              <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
              <rect x={x} y={H - bh} width={bw} height={bh} rx={Math.min(3, bw / 2)} className={`usage-bar${hover === i ? ' on' : ''}`} />
            </g>
          );
        })}
        <text x={0} y={H + 14} className="usage-tick">
          {days[0].day}
        </text>
        <text x={W} y={H + 14} textAnchor="end" className="usage-tick">
          {days[days.length - 1].day}
        </text>
      </svg>
    </div>
  );
}
