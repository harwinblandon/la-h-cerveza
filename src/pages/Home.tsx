import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { LogoLaH, NetCanvas, Signature } from '../components/Brand';
import { db } from '../db';
import { fermentationSchedule } from '../domain/batch';
import { BatchRow } from './Batches';
import { fmtDate } from '../components/ui';
import { batchLabel } from '../components/Historical';

export default function Home() {
  const batches = useLiveQuery(() => db.batches.orderBy('number').reverse().toArray(), []) ?? [];
  const recipes = useLiveQuery(() => db.recipes.orderBy('updatedAt').reverse().filter((r) => !r.archived).limit(5).toArray(), []) ?? [];
  const active = batches.filter((b) => b.status !== 'terminado' && b.status !== 'envasado' && b.status !== 'historico');
  const now = Date.now();
  const upcoming = active
    .flatMap((b) => fermentationSchedule(b).map((s) => ({ ...s, batch: b })))
    .filter((s) => s.at > now - 86_400_000 && s.at < now + 7 * 86_400_000)
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);

  return (
    <>
      <section className="hero">
        <NetCanvas />
        <div className="hero-inner">
          <LogoLaH className="hero-logo" />
          <Signature size="lg" />
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn btn-primary" to="/recetas?nueva">
              Nueva receta
            </Link>
            <Link className="btn" to="/estilos">
              Estilos
            </Link>
            <Link className="btn" to="/herramientas">
              Calculadoras
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Lotes en curso</h2>
            <Link to="/lotes">Ver todos</Link>
          </div>
          {active.length === 0 ? <p className="muted">No hay lotes activos.</p> : active.map((b) => <BatchRow key={b.id} batch={b} />)}
        </div>
        <div className="card">
          <h2>Próximos 7 días</h2>
          {upcoming.length === 0 ? (
            <p className="muted">Sin tareas pendientes.</p>
          ) : (
            upcoming.map((u) => (
              <Link key={u.batch.id + u.title + u.at} to={`/lotes/${u.batch.id}`} className="list-item">
                <span className="chip">{fmtDate(u.at)}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.title}</div>
                  <div className="faint" style={{ fontSize: '0.8rem' }}>
                    {batchLabel(u.batch)} · {u.batch.name}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Recetas recientes</h2>
            <Link to="/recetas">Ver todas</Link>
          </div>
          {recipes.length === 0 ? (
            <p className="muted">Aún no hay recetas.</p>
          ) : (
            recipes.map((r) => (
              <Link key={r.id} to={`/recetas/${r.id}`} className="list-item">
                {r.name}
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
