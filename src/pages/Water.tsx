import { useMemo, useState } from 'react';
import { Info } from '../components/Info';
import { SourceTag } from '../components/Provenance';
import { Field, Modal, NumberInput, fmt } from '../components/ui';
import { db, updateSettings } from '../db';
import { byId } from '../domain/catalog';
import { uid } from '../domain/calc/units';
import { ION_KEYS, ION_LABELS, balanceLabel, residualAlkalinity, sulfateChlorideRatio } from '../domain/calc/water';
import type { WaterIons, WaterProfile } from '../domain/types';
import { blend, fromReport, ionBalance, type AsUnit, type IonBalance, type WaterReport } from '../domain/waterReport';
import { useCatalog, useSettings } from '../hooks';

const KINDS: [string, string, string][] = [
  ['grifo', 'Agua de la llave', 'Informe de tu acueducto. En Colombia suelen publicar los reportes del IRCA con alcalinidad, dureza y calcio "como CaCO₃".'],
  ['embotellada', 'Embotellada / botellón', 'La etiqueta trae los minerales en mg/L (iones).'],
  ['osmosis', 'Ósmosis inversa propia', 'Si tienes análisis o medidor, carga los valores; si no, usa el perfil típico de ósmosis.'],
  ['pozo', 'Pozo o nacimiento', 'Lo ideal es un análisis de laboratorio: puede variar mucho.'],
  ['laboratorio', 'Análisis de laboratorio', 'Carga los valores tal como vienen en el informe.'],
];

export default function WaterPage() {
  const catalog = useCatalog();
  const settings = useSettings();
  const [editing, setEditing] = useState<WaterProfile | null>(null);
  const [blending, setBlending] = useState(false);
  const mine = byId(catalog.waters, settings.sourceWaterId);
  const newWater = (): WaterProfile => ({ id: `custom-${uid()}`, name: 'Mi agua', ca: 0, mg: 0, na: 0, so4: 0, cl: 0, hco3: 0, custom: true });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Agua</h1>
          <Info>Tu agua de origen y los perfiles objetivo. Cada receta calcula las sales y el ácido para llevar una a la otra, y estima el pH del macerado.</Info>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setBlending(true)}>
            Mezclar dos aguas
          </button>
          <button className="btn btn-primary" onClick={() => setEditing(newWater())}>
            + Cargar mi agua
          </button>
        </div>
      </div>

      {mine && (
        <div className="card">
          <div className="card-head">
            <h2>Mi agua</h2>
            <div className="row">
              <select className="input input-sm" style={{ width: 'auto' }} value={mine.id} onChange={(e) => updateSettings({ sourceWaterId: e.target.value })}>
                {catalog.waters
                  .filter((w) => !w.id.startsWith('obj-'))
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
              {mine.custom && (
                <button className="btn btn-sm" onClick={() => setEditing(mine)}>
                  Editar
                </button>
              )}
            </div>
          </div>
          <p style={{ margin: '0 0 0.6rem' }}>
            <strong>{mine.name}</strong> <SourceTag source={mine.source} note={mine.sourceNote} />
            {mine.description && <span className="muted"> · {mine.description}</span>}
          </p>
          <IonRow ions={mine} />
          <BalanceNote balance={ionBalance(mine)} />
        </div>
      )}

      <div className="callout callout-idea" style={{ margin: '1rem 0', fontSize: '0.9rem' }}>
        <strong>Cualquier agua sirve como punto de partida.</strong> Llave de tu ciudad, botellón, ósmosis, pozo o una mezcla: carga el informe tal como venga (iones o "como CaCO₃",
        con o sin sodio) y La H hace las conversiones y revisa que los números cuadren. Sin datos, parte de ósmosis o destilada y construye el perfil con sales.
      </div>

      <div className="card">
        <h2>Perfiles</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Perfil</th>
                {ION_KEYS.map((k) => (
                  <th key={k} className="r">
                    {ION_LABELS[k]}
                  </th>
                ))}
                <th className="r">SO₄/Cl</th>
                <th className="r">AR</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {catalog.waters.map((w) => {
                const ratio = sulfateChlorideRatio(w);
                const isSource = settings.sourceWaterId === w.id;
                return (
                  <tr key={w.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>
                        {w.name} <SourceTag source={w.source} note={w.sourceNote} compact /> {isSource && <span className="chip chip-accent">mi agua</span>}
                      </div>
                      {w.description && <div className="faint" style={{ fontSize: '0.78rem' }}>{w.description}</div>}
                    </td>
                    {ION_KEYS.map((k) => (
                      <td key={k} className="r num">
                        {fmt(w[k], 0)}
                      </td>
                    ))}
                    <td className="r" style={{ fontSize: '0.82rem' }}>
                      {Number.isFinite(ratio) ? fmt(ratio, 1) : '—'}
                      <div className="faint">{w.so4 + w.cl > 0 ? balanceLabel(ratio) : ''}</div>
                    </td>
                    <td className="r num">{fmt(residualAlkalinity(w), 0)}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      {!isSource && !w.id.startsWith('obj-') && (
                        <button className="btn btn-sm" onClick={() => updateSettings({ sourceWaterId: w.id })}>
                          Usar como mi agua
                        </button>
                      )}
                      {w.custom && (
                        <button className="btn btn-sm btn-ghost" onClick={() => setEditing(w)}>
                          ✎
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
          Valores en ppm (mg/L). AR = alcalinidad residual como CaCO₃: positiva sube el pH del macerado (buena para oscuras), negativa lo baja (claras). Los perfiles "Objetivo" son
          destinos de diseño, no aguas de origen.
        </p>
      </div>
      {editing && <WaterForm water={editing} onClose={() => setEditing(null)} />}
      {blending && <BlendForm onClose={() => setBlending(false)} />}
    </>
  );
}

function IonRow({ ions }: { ions: WaterIons }) {
  return (
    <div className="delta-grid">
      {ION_KEYS.map((k) => (
        <div key={k} className="stat">
          <div className="stat-label">{ION_LABELS[k]}</div>
          <div className="stat-value">{fmt(ions[k], 1)}</div>
        </div>
      ))}
    </div>
  );
}

function BalanceNote({ balance }: { balance: IonBalance }) {
  if (balance.quality === 'sin-datos') return null;
  const cls = balance.quality === 'revisar' ? 'badge-warn' : 'badge-ok';
  return (
    <p className="faint" style={{ fontSize: '0.82rem', margin: '0.6rem 0 0' }}>
      <span className={`badge ${cls}`}>balance {balance.quality}</span> Cationes {fmt(balance.cationsMeq, 2)} · aniones {fmt(balance.anionsMeq, 2)} meq/L · diferencia{' '}
      {fmt(balance.errorPct, 1)} %.
      {balance.quality === 'revisar' && ' Revisa unidades (¿como CaCO₃ o como ion?) o un dato mal digitado.'}
    </p>
  );
}

type ReportForm = WaterReport & { kind: string; name: string; note: string; estimateNa: boolean; alkMode: 'alk' | 'hco3' };

function WaterForm({ water, onClose }: { water: WaterProfile; onClose: () => void }) {
  const catalog = useCatalog();
  const exists = catalog.waters.some((w) => w.id === water.id);
  const saved = water.report as Partial<ReportForm> | undefined;
  const [f, setF] = useState<ReportForm>({
    kind: 'grifo',
    name: water.name,
    note: water.description ?? '',
    caUnit: 'ion',
    mgUnit: 'ion',
    alkMode: 'hco3',
    estimateNa: false,
    ...(saved ?? { ca: water.ca || undefined, mg: water.mg || undefined, na: water.na || undefined, so4: water.so4 || undefined, cl: water.cl || undefined, hco3: water.hco3 || undefined }),
  });
  const set = (patch: Partial<ReportForm>) => setF((x) => ({ ...x, ...patch }));
  const result = useMemo(
    () =>
      fromReport(
        { ...f, hco3: f.alkMode === 'hco3' ? f.hco3 : undefined, alkalinity: f.alkMode === 'alk' ? f.alkalinity : undefined },
        f.estimateNa,
      ),
    [f],
  );
  const kind = KINDS.find((k) => k[0] === f.kind);
  const UnitSel = ({ value, onChange }: { value?: AsUnit; onChange: (u: AsUnit) => void }) => (
    <select className="input input-sm" style={{ width: 'auto' }} value={value ?? 'ion'} onChange={(e) => onChange(e.target.value as AsUnit)}>
      <option value="ion">mg/L</option>
      <option value="caco3">como CaCO₃</option>
    </select>
  );

  const save = async () => {
    const ions = result.ions;
    const round = (x: number) => Math.round(x * 10) / 10;
    const profile: WaterProfile = {
      ...water,
      name: f.name.trim() || 'Mi agua',
      description: [kind?.[1], f.note.trim()].filter(Boolean).join(' · '),
      ca: round(ions.ca),
      mg: round(ions.mg),
      na: round(ions.na),
      so4: round(ions.so4),
      cl: round(ions.cl),
      hco3: round(ions.hco3),
      custom: true,
      source: 'usuario',
      sourceNote: [f.note.trim() || 'Informe ingresado por ti', ...result.derived].join('. '),
      report: f as unknown as Record<string, unknown>,
    };
    await db.waters.put(profile);
    await updateSettings({ sourceWaterId: profile.id });
    onClose();
  };

  return (
    <Modal title="Cargar agua" onClose={onClose} wide>
      <div className="grid grid-3">
        <Field label="Nombre">
          <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ej. Llave Medellín, Botellón Cristal" />
        </Field>
        <Field label="Tipo" hint={kind?.[2]}>
          <select className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>
            {KINDS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fuente y fecha">
          <input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ej. EPM, informe de mayo 2026" />
        </Field>
      </div>
      <hr className="hr" />
      <div className="grid grid-3">
        <Field label="Calcio">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <NumberInput value={f.ca} decimals={2} onChange={(n) => set({ ca: n })} />
            <UnitSel value={f.caUnit} onChange={(u) => set({ caUnit: u })} />
          </div>
        </Field>
        <Field label="Magnesio" hint="Si no viene, déjalo vacío y llena la dureza total">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <NumberInput value={f.mg} decimals={2} onChange={(n) => set({ mg: n })} />
            <UnitSel value={f.mgUnit} onChange={(u) => set({ mgUnit: u })} />
          </div>
        </Field>
        <Field label="Dureza total (como CaCO₃)" hint="Opcional: deduce el magnesio">
          <NumberInput value={f.hardness} decimals={1} onChange={(n) => set({ hardness: n })} />
        </Field>
        <Field label="Sodio (mg/L)">
          <NumberInput value={f.na} decimals={1} onChange={(n) => set({ na: n })} />
        </Field>
        <Field label="Sulfato (mg/L)">
          <NumberInput value={f.so4} decimals={1} onChange={(n) => set({ so4: n })} />
        </Field>
        <Field label="Cloruro (mg/L)">
          <NumberInput value={f.cl} decimals={1} onChange={(n) => set({ cl: n })} />
        </Field>
        <Field label="Alcalinidad">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            {f.alkMode === 'alk' ? (
              <NumberInput value={f.alkalinity} decimals={1} onChange={(n) => set({ alkalinity: n })} />
            ) : (
              <NumberInput value={f.hco3} decimals={1} onChange={(n) => set({ hco3: n })} />
            )}
            <select className="input input-sm" style={{ width: 'auto' }} value={f.alkMode} onChange={(e) => set({ alkMode: e.target.value as 'alk' | 'hco3' })}>
              <option value="hco3">bicarbonato mg/L</option>
              <option value="alk">alcalinidad como CaCO₃</option>
            </select>
          </div>
        </Field>
        <Field label="pH (opcional)">
          <NumberInput value={f.ph} decimals={2} onChange={(n) => set({ ph: n })} />
        </Field>
        <label className="row" style={{ fontSize: '0.88rem', alignSelf: 'end' }}>
          <input type="checkbox" checked={f.estimateNa} disabled={f.na !== undefined} onChange={(e) => set({ estimateNa: e.target.checked })} /> Estimar el sodio por balance (si
          no viene)
        </label>
      </div>
      <hr className="hr" />
      <div className="row-between" style={{ marginBottom: 6 }}>
        <span className="stat-label">Resultado</span>
        <SourceTag source="calculo" note="Conversión de unidades del informe a iones" />
      </div>
      <IonRow ions={result.ions} />
      {result.derived.length > 0 && (
        <ul className="faint" style={{ fontSize: '0.8rem', margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
          {result.derived.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      <BalanceNote balance={result.balance} />
      {result.balance.naToBalance > 3 && f.na === undefined && !f.estimateNa && (
        <p className="faint" style={{ fontSize: '0.8rem', margin: '0.3rem 0 0' }}>
          Faltan ~{fmt(result.balance.naToBalance, 1)} mg/L de cationes: probablemente sodio que el informe no trae.
        </p>
      )}
      <div className="row" style={{ marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={save}>
          Guardar y usar como mi agua
        </button>
        {water.custom && exists && (
          <button
            className="btn btn-danger"
            onClick={async () => {
              await db.waters.delete(water.id);
              onClose();
            }}
          >
            Eliminar
          </button>
        )}
      </div>
    </Modal>
  );
}

function BlendForm({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const sources = catalog.waters.filter((w) => !w.id.startsWith('obj-'));
  const [aId, setA] = useState('osmosis');
  const [bId, setB] = useState(sources.find((w) => w.custom)?.id ?? 'armenia-epa');
  const [pctA, setPct] = useState(50);
  const a = byId(catalog.waters, aId);
  const b = byId(catalog.waters, bId);
  const mix = a && b ? blend(a, b, pctA / 100) : undefined;
  const [name, setName] = useState('');
  const label = a && b ? `${pctA} % ${a.name} + ${100 - pctA} % ${b.name}` : '';
  return (
    <Modal title="Mezclar dos aguas" onClose={onClose} wide>
      <p className="muted" style={{ marginTop: 0 }}>
        Útil para bajar la alcalinidad o los minerales de tu agua con ósmosis o destilada. Para hacerlo en una sola receta también puedes usar "Dilución" en su pestaña Agua.
      </p>
      <div className="grid grid-3">
        <Field label="Agua A">
          <select className="input" value={aId} onChange={(e) => setA(e.target.value)}>
            {sources.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agua B">
          <select className="input" value={bId} onChange={(e) => setB(e.target.value)}>
            {sources.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Proporción: ${pctA} % A · ${100 - pctA} % B`}>
          <input type="range" min={0} max={100} step={5} value={pctA} onChange={(e) => setPct(Number(e.target.value))} style={{ accentColor: 'var(--text)' }} />
        </Field>
      </div>
      {mix && (
        <div style={{ marginTop: '0.8rem' }}>
          <IonRow ions={mix} />
          <p className="faint" style={{ fontSize: '0.82rem' }}>
            Alcalinidad residual {fmt(residualAlkalinity(mix), 0)} ppm · SO₄/Cl {Number.isFinite(sulfateChlorideRatio(mix)) ? fmt(sulfateChlorideRatio(mix), 1) : '—'}
          </p>
        </div>
      )}
      <div className="row" style={{ marginTop: '0.6rem' }}>
        <input className="input" style={{ flex: 1, minWidth: 220 }} value={name} placeholder={label} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn-primary"
          disabled={!mix}
          onClick={async () => {
            if (!mix) return;
            const id = `custom-${uid()}`;
            await db.waters.put({
              id,
              name: name.trim() || label,
              ...Object.fromEntries(ION_KEYS.map((k) => [k, Math.round(mix[k] * 10) / 10])),
              description: label,
              custom: true,
              source: 'calculo',
              sourceNote: `Mezcla: ${label}`,
            } as WaterProfile);
            await updateSettings({ sourceWaterId: id });
            onClose();
          }}
        >
          Guardar mezcla y usarla
        </button>
      </div>
    </Modal>
  );
}
