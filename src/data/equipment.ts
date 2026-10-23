import type { Equipment, EquipmentType } from '../domain/types';

export const EQUIPMENT_TYPE_LABEL: Record<EquipmentType, string> = {
  biab: 'BIAB (bolsa, volumen completo)',
  'biab-lavado': 'BIAB con mini lavado',
  'todo-en-uno': 'Todo en uno (Grainfather, Brewzilla…)',
  'tres-ollas': 'Tres ollas (HLT, macerador, hervidor)',
  extracto: 'Extracto / parcial',
};

export const EQUIPMENT_TYPE_HELP: Record<EquipmentType, string> = {
  biab: 'Todo el agua va al macerado; se retira la bolsa y se exprime. Simple y eficiente.',
  'biab-lavado':
    'Maceras con parte del agua y lavas la bolsa con el resto (en un balde o regándola). Gana 3–5 puntos de eficiencia y libera espacio en la olla.',
  'todo-en-uno': 'Macerado con malta en canasta, recirculación y lavado sobre la misma olla.',
  'tres-ollas': 'Olla de agua caliente, macerador con falso fondo y hervidor. Lavado continuo o por tandas.',
  extracto: 'Extracto de malta y, opcionalmente, maltas especiales infusionadas.',
};

const base: Omit<Equipment, 'id' | 'name' | 'type'> = {
  batchSizeL: 20,
  boilTimeMin: 60,
  kettleVolumeL: 40,
  boilOffLph: 3.5,
  kettleLossL: 2,
  fermenterLossL: 1,
  mashTunDeadspaceL: 0,
  grainAbsorptionLpkg: 0.6,
  hopAbsorptionLp100g: 0.7,
  coolingShrinkPct: 4,
  efficiencyPct: 70,
  mashRatioLpkg: 3,
  spargeL: 0,
};

export const DEFAULT_EQUIPMENT: Equipment[] = [
  { ...base, id: 'eq-biab', name: 'BIAB 40 L', type: 'biab' },
  { ...base, id: 'eq-biab-lavado', name: 'BIAB 40 L con mini lavado', type: 'biab-lavado', spargeL: 8, efficiencyPct: 73 },
  {
    ...base,
    id: 'eq-aio',
    name: 'Todo en uno 35 L',
    type: 'todo-en-uno',
    kettleVolumeL: 35,
    grainAbsorptionLpkg: 0.8,
    mashTunDeadspaceL: 3,
    mashRatioLpkg: 3,
    kettleLossL: 2.5,
    efficiencyPct: 72,
  },
  {
    ...base,
    id: 'eq-3v',
    name: 'Tres ollas 50 L',
    type: 'tres-ollas',
    kettleVolumeL: 50,
    grainAbsorptionLpkg: 1.0,
    mashTunDeadspaceL: 1.5,
    mashRatioLpkg: 3,
    kettleLossL: 2,
    efficiencyPct: 72,
  },
];
