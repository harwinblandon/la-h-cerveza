import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AWARD_LABEL, AwardChip, LINK_LABEL, batchLabel } from '../components/Historical';
import { Empty, Field, Modal } from '../components/ui';
import { db } from '../db';
import { uid } from '../domain/calc/units';
import type { Award, AwardResult } from '../domain/types';

const ORDER: AwardResult[] = ['oro', 'primer-puesto', 'plata', 'segundo-puesto', 'bronce', 'tercer-puesto', 'mencion', 'inscrita'];

export default function Palmares() {
  const awards = useLiveQuery(() => db.awards.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];
  const versions = useLiveQuery(() => db.recipeVersions.toArray(), []) ?? [];
  const batches = useLiveQuery(() => db.batches.toArray(), []) ?? [];
  const [editing, setEditing] = useState<Award | null>(null);

  const sorted = [...(awards ?? [])].sort((a, b) => ORDER.indexOf(a.result) - ORDER.indexOf(b.result) || (b.year ?? 0) - (a.year ?? 0));
  const medals = sorted.filter((a) => a.result !== 'inscrita');
  const pending = sorted.filter((a) => a.link === 'por-confirmar').length;

  const recipeName = (id?: string) => recipes.find((r) => r.id === id)?.name;
  const versionName = (id?: string) => {
    const v = versions.find((x) => x.id === id);
    return v ? `V${v.number}${v.label && v.label !== `V${v.number}` ? ` · ${v.label}` : ''}` : undefined;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Palmarés</h1>
          <p className="muted">Resultados en competencias. Un premio solo queda vinculado a una receta, versión o lote cuando tú lo confirmas.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ id: `premio-${uid()}`, beerName: '', result: 'oro', link: 'sin-receta', source: 'usuario', createdAt: Date.now() })}>
          Registrar resultado
        </button>
      </div>
      {awards && awards.length > 0 && (
        <div className="grid grid-4" style={{ marginBottom: '1rem' }}>
          {(['oro', 'plata', 'bronce'] as const).map((r) => (
            <div key={r} className="card stat">
              <div className="stat-label">{AWARD_LABEL[r]}</div>
              <div className="stat-value">{medals.filter((a) => a.result === r).length}</div>
            </div>
          ))}
          <div className="card stat">
            <div className="stat-label">Otros puestos</div>
            <div className="stat-value">{medals.filter((a) => !['oro', 'plata', 'bronce'].includes(a.result)).length}</div>
            {pending > 0 && <div className="faint" style={{ fontSize: '0.8rem' }}>{pending} vínculos por confirmar</div>}
          </div>
        </div>
      )}
      <div className="card">
        {awards && awards.length === 0 && (
          <Empty icon="palmares" title="Sin resultados registrados">
            <p>Registra tus medallas y participaciones. Si tienes un historial, impórtalo desde Ajustes → Restaurar copia.</p>
          </Empty>
        )}
        {sorted.map((a) => (
          <div key={a.id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <AwardChip award={a} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 650 }}>{a.beerName}</div>
              <div className="muted" style={{ fontSize: '0.85rem' }}>
                {[a.competition ?? 'Competencia no recuperada', a.location, a.year, a.category].filter(Boolean).join(' · ')}
                {a.enteredAs ? ` · inscrita como ${a.enteredAs}` : ''}
                {a.prize ? ` · premio: ${a.prize}` : ''}
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                <span className={`badge ${a.link === 'confirmado' ? 'badge-ok' : a.link === 'por-confirmar' ? 'badge-warn' : 'badge-idea'}`}>{LINK_LABEL[a.link]}</span>{' '}
                {a.recipeId && <Link to={`/recetas/${a.recipeId}`}>{recipeName(a.recipeId) ?? 'receta'}</Link>}
                {a.versionId && <span className="faint"> · {versionName(a.versionId)}</span>}
                {a.batchId && (
                  <>
                    {' · '}
                    <Link to={`/lotes/${a.batchId}`}>lote {(() => { const b = batches.find((x) => x.id === a.batchId); return b ? batchLabel(b) : ''; })()}</Link>
                  </>
                )}
              </div>
              {a.notes && <div className="faint" style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>{a.notes}</div>}
            </div>
            <button className="btn btn-sm" onClick={() => setEditing(a)}>
              {a.link === 'por-confirmar' ? 'Confirmar vínculo' : 'Editar'}
            </button>
          </div>
        ))}
      </div>
      {editing && <AwardEditor award={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AwardEditor({ award, onClose }: { award: Award; onClose: () => void }) {
  const [a, setA] = useState<Award>(award);
  const recipes = useLiveQuery(() => db.recipes.orderBy('name').toArray(), []) ?? [];
  const versions = useLiveQuery(() => (a.recipeId ? db.recipeVersions.where('recipeId').equals(a.recipeId).sortBy('number') : []), [a.recipeId]) ?? [];
  const batches = useLiveQuery(() => (a.recipeId ? db.batches.where('recipeId').equals(a.recipeId).toArray() : []), [a.recipeId]) ?? [];
  const set = (patch: Partial<Award>) => setA((x) => ({ ...x, ...patch }));
  const candidates = new Set(award.candidates ?? []);
  const isNew = !award.beerName;

  const save = async () => {
    const link: Award['link'] = !a.recipeId ? 'sin-receta' : a.link === 'sin-receta' ? 'confirmado' : a.link;
    await db.awards.put({ ...a, link });
    onClose();
  };

  return (
    <Modal title={isNew ? 'Registrar resultado' : 'Resultado de competencia'} onClose={onClose}>
      <div className="grid grid-2">
        <Field label="Cerveza">
          <input className="input" value={a.beerName} onChange={(e) => set({ beerName: e.target.value })} />
        </Field>
        <Field label="Resultado">
          <select className="input" value={a.result} onChange={(e) => set({ result: e.target.value as AwardResult })}>
            {ORDER.map((r) => (
              <option key={r} value={r}>
                {AWARD_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Competencia">
          <input className="input" value={a.competition ?? ''} onChange={(e) => set({ competition: e.target.value || undefined })} />
        </Field>
        <Field label="Lugar">
          <input className="input" value={a.location ?? ''} onChange={(e) => set({ location: e.target.value || undefined })} />
        </Field>
        <Field label="Año">
          <input className="input" inputMode="numeric" value={a.year ?? ''} onChange={(e) => set({ year: Number(e.target.value) || undefined })} />
        </Field>
        <Field label="Inscrita como (estilo/categoría)">
          <input className="input" value={a.enteredAs ?? ''} onChange={(e) => set({ enteredAs: e.target.value || undefined })} />
        </Field>
      </div>
      <h3 style={{ marginTop: '1rem' }}>Vínculo con tu receta</h3>
      <p className="faint" style={{ fontSize: '0.85rem' }}>
        Elige solo lo que sabes con certeza. Si no sabes qué versión o lote ganó, deja el vínculo "por confirmar".
      </p>
      <div className="grid grid-2">
        <Field label="Receta">
          <select className="input" value={a.recipeId ?? ''} onChange={(e) => set({ recipeId: e.target.value || undefined, versionId: undefined, batchId: undefined })}>
            <option value="">— Receta no recuperada —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {candidates.has(r.id) ? ' (candidata)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Versión">
          <select className="input" value={a.versionId ?? ''} disabled={!a.recipeId} onChange={(e) => set({ versionId: e.target.value || undefined })}>
            <option value="">— Sin confirmar —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                V{v.number} · {v.label}
                {candidates.has(v.id) ? ' (candidata)' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lote">
          <select className="input" value={a.batchId ?? ''} disabled={!a.recipeId} onChange={(e) => set({ batchId: e.target.value || undefined })}>
            <option value="">— Sin confirmar —</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {batchLabel(b)} · {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estado del vínculo">
          <select className="input" value={a.recipeId ? (a.link === 'sin-receta' ? 'confirmado' : a.link) : 'sin-receta'} disabled={!a.recipeId} onChange={(e) => set({ link: e.target.value as Award['link'] })}>
            <option value="confirmado">Confirmado por mí</option>
            <option value="por-confirmar">Por confirmar</option>
            {!a.recipeId && <option value="sin-receta">Receta no recuperada</option>}
          </select>
        </Field>
      </div>
      <Field label="Notas">
        <textarea className="input" value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} />
      </Field>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: '1rem' }}>
        {!isNew ? (
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (!confirm('¿Eliminar este resultado?')) return;
              await db.awards.delete(a.id);
              onClose();
            }}
          >
            Eliminar
          </button>
        ) : (
          <span />
        )}
        <div className="row">
          <button className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!a.beerName.trim()} onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
