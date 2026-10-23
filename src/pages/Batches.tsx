import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Empty, Swatch, fmt, fmtDate } from '../components/ui';
import { db } from '../db';
import { fermentationStatus } from '../domain/batch';
import { computeRecipeStats } from '../domain/calc/recipeStats';
import type { Batch, BatchStatus } from '../domain/types';
import { batchDate, batchLabel } from '../components/Historical';

export const STATUS_LABEL: Record<BatchStatus, string> = {
  planificado: 'Planificado',
  coccion: 'En cocción',
  fermentando: 'Fermentando',
  maduracion: 'Madurando',
  envasado: 'Envasado',
  terminado: 'Terminado',
  historico: 'Histórico',
};

export const STATUS_BADGE: Record<BatchStatus, string> = {
  planificado: 'badge-idea',
  coccion: 'badge-warn',
  fermentando: 'badge-warn',
  maduracion: 'badge-idea',
  envasado: 'badge-ok',
  terminado: 'badge-ok',
  historico: 'badge-idea',
};

export default function Batches() {
  // Los lotes históricos van al final, por su código (H-01, H-02…).
  const batches = useLiveQuery(
    async () => {
      const all = await db.batches.orderBy('number').reverse().toArray();
      return [...all.filter((b) => b.status !== 'historico'), ...all.filter((b) => b.status === 'historico').sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))];
    },
    [],
  );
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lotes</h1>
          <p className="muted">Cada cocción con su día de olla, fermentación y envasado.</p>
        </div>
      </div>
      <div className="card">
        {batches && batches.length === 0 && (
          <Empty icon="lotes" title="Sin lotes todavía">
            <p>
              Abre una receta y toca <strong>Cocinar este lote</strong> para empezar el acompañamiento.
            </p>
            <Link className="btn btn-primary" to="/recetas">
              Ir a recetas
            </Link>
          </Empty>
        )}
        {batches?.map((b) => <BatchRow key={b.id} batch={b} />)}
      </div>
    </>
  );
}

export function BatchRow({ batch }: { batch: Batch }) {
  const stats = computeRecipeStats(batch.recipe);
  const fs = fermentationStatus(batch);
  return (
    <Link to={`/lotes/${batch.id}`} className="list-item">
      <Swatch srm={stats.srm} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 650 }}>
          {batchLabel(batch)} · {batch.name}
        </div>
        <div className="muted" style={{ fontSize: '0.85rem' }}>
          {batch.brewDateUnknown ? batchDate(batch) : `Cocinado ${fmtDate(batch.brewDate)}`}
          {fs.currentSg ? ` · ${fs.currentSg.toFixed(3)} (${fmt(fs.attenuation, 0)} % aten.)` : ''}
        </div>
      </div>
      <span className={`badge ${STATUS_BADGE[batch.status]}`}>{STATUS_LABEL[batch.status]}</span>
    </Link>
  );
}
