import type { Provenance } from './types';

export const PROVENANCE: Record<Provenance, { label: string; short: string; help: string }> = {
  bjcp: { label: 'BJCP 2021', short: 'BJCP', help: 'Rango oficial de la guía de estilos BJCP 2021.' },
  fabricante: { label: 'Fabricante', short: 'Fab.', help: 'Dato publicado por el fabricante o laboratorio (valor típico).' },
  referencia: { label: 'Referencia', short: 'Ref.', help: 'Valor típico de literatura o fichas técnicas; cada lote comercial varía.' },
  calculo: { label: 'Cálculo', short: 'Calc.', help: 'Resultado de una fórmula a partir de los datos de la receta.' },
  estimacion: { label: 'Estimación', short: 'Est.', help: 'Modelo aproximado con incertidumbre; confírmalo midiendo.' },
  regla: { label: 'Regla técnica', short: 'Regla', help: 'Relación cervecera conocida aplicada por La H (no es un cálculo exacto).' },
  medicion: { label: 'Medición', short: 'Med.', help: 'Medido por ti durante el proceso.' },
  usuario: { label: 'Tu dato', short: 'Tuyo', help: 'Valor que ingresaste o ajustaste manualmente.' },
  inventario: { label: 'Tu compra', short: 'Inv.', help: 'Tomado del inventario (dato de tu bolsa o lote comprado).' },
  importacion: { label: 'Importado', short: 'Imp.', help: 'Venía en el archivo importado.' },
  historial: { label: 'Tu historial', short: 'Hist.', help: 'Derivado de tus lotes anteriores.' },
  ia: { label: 'IA', short: 'IA', help: 'Interpretación generada por inteligencia artificial.' },
  registro: { label: 'Registro histórico', short: 'Reg.', help: 'Tomado de tu historial de lotes y recetas (ver la nota de cada dato).' },
};
