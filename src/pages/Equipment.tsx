import { useState } from 'react';
import { Field, NumberInput } from '../components/ui';
import { EQUIPMENT_TYPE_HELP, EQUIPMENT_TYPE_LABEL } from '../data/equipment';
import { db, updateSettings } from '../db';
import { uid } from '../domain/calc/units';
import type { Equipment, EquipmentType } from '../domain/types';
import { useEquipment, useSettings } from '../hooks';

const NUM_FIELDS: [keyof Equipment, string, string, number, string?][] = [
  ['batchSizeL', 'Volumen al fermentador', 'L', 1],
  ['kettleVolumeL', 'Capacidad de la olla', 'L', 0],
  ['boilTimeMin', 'Tiempo de hervor', 'min', 0],
  ['boilOffLph', 'Evaporación', 'L/h', 1, 'Mide cuánto baja el nivel en una hora de hervor.'],
  ['efficiencyPct', 'Eficiencia de sala', '%', 0, 'Puntos de densidad que llegan al fermentador. BIAB típico 65–75 %.'],
  ['grainAbsorptionLpkg', 'Absorción del grano', 'L/kg', 2, 'BIAB exprimido 0,5–0,6 · sin exprimir 0,8 · tres ollas ~1,0.'],
  ['kettleLossL', 'Pérdida en la olla', 'L', 1, 'Trub y lo que queda bajo la llave.'],
  ['fermenterLossL', 'Pérdida en el fermentador', 'L', 1],
  ['hopAbsorptionLp100g', 'Absorción de lúpulo', 'L/100 g', 2],
  ['coolingShrinkPct', 'Contracción al enfriar', '%', 0],
  ['mashTunDeadspaceL', 'Espacio muerto del macerador', 'L', 1],
  ['mashRatioLpkg', 'Relación agua/grano', 'L/kg', 1, 'Para tres ollas y todo en uno.'],
  ['spargeL', 'Litros de lavado (BIAB con lavado)', 'L', 1],
];

export default function EquipmentPage() {
  const equipment = useEquipment();
  const settings = useSettings();
  const [selected, setSelected] = useState<string | null>(null);
  const eq = equipment.find((e) => e.id === (selected ?? settings.defaultEquipmentId)) ?? equipment[0];
  const set = (patch: Partial<Equipment>) => eq && db.equipment.update(eq.id, patch);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Equipos</h1>
          <p className="muted">Los volúmenes y la eficiencia de cada receta salen de aquí. Mide tu equipo una vez y las recetas serán exactas.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={async () => {
            const base = eq ?? equipment[0];
            const copy = { ...base, id: uid(), name: `${base.name} (copia)` };
            await db.equipment.add(copy);
            setSelected(copy.id);
          }}
        >
          + Nuevo equipo
        </button>
      </div>
      <div className="editor-layout split">
        <div className="card">
          {equipment.map((e) => (
            <div
              key={e.id}
              className="pick-item"
              style={e.id === eq?.id ? { background: 'var(--accent-soft)' } : undefined}
              onClick={() => setSelected(e.id)}
            >
              <div className="pick-main">
                <div className="pick-title">
                  {e.name} {settings.defaultEquipmentId === e.id && <span className="chip chip-accent">predeterminado</span>}
                </div>
                <div className="pick-sub">{EQUIPMENT_TYPE_LABEL[e.type]}</div>
              </div>
            </div>
          ))}
        </div>
        {eq && (
          <div className="card" style={{ marginTop: 0 }}>
            <div className="grid grid-2">
              <Field label="Nombre">
                <input className="input" value={eq.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Tipo de proceso">
                <select className="input" value={eq.type} onChange={(e) => set({ type: e.target.value as EquipmentType })}>
                  {Object.entries(EQUIPMENT_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="callout" style={{ margin: '0.75rem 0', fontSize: '0.88rem' }}>
              {EQUIPMENT_TYPE_HELP[eq.type]}
            </p>
            <div className="grid grid-3">
              {NUM_FIELDS.filter(([k]) => {
                if (k === 'spargeL') return eq.type === 'biab-lavado';
                if (k === 'mashRatioLpkg' || k === 'mashTunDeadspaceL') return eq.type === 'tres-ollas' || eq.type === 'todo-en-uno';
                return true;
              }).map(([k, label, unit, d, hint]) => (
                <Field key={k} label={label} hint={hint}>
                  <NumberInput value={eq[k] as number} decimals={d} onChange={(n) => set({ [k]: n })} unit={unit} />
                </Field>
              ))}
            </div>
            <Field label="Notas">
              <textarea className="input" value={eq.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
            <div className="row" style={{ marginTop: '1rem' }}>
              {settings.defaultEquipmentId !== eq.id && (
                <button className="btn" onClick={() => updateSettings({ defaultEquipmentId: eq.id })}>
                  Usar como predeterminado
                </button>
              )}
              <span className="spacer" />
              {equipment.length > 1 && (
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (!confirm(`¿Eliminar ${eq.name}? Las recetas guardan su propia copia de los datos.`)) return;
                    await db.equipment.delete(eq.id);
                    setSelected(null);
                  }}
                >
                  Eliminar
                </button>
              )}
            </div>
            <p className="faint" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
              Los cambios aplican a recetas nuevas. Para actualizar una receta existente, vuelve a elegir el equipo en su encabezado.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
