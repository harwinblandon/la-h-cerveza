// Íconos de línea, monocromos (trazo = currentColor), en el estilo de redhb.com.
const P: Record<string, string> = {
  inicio: 'M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z',
  recetas: 'M6 3.5h9l3 3V20.5H6zM15 3.5v3h3M9 10h6M9 13.5h6M9 17h4',
  lotes: 'M7 4h10l-1 16H8zM7.4 9h9.2M10 12.5v4M14 12.5v4',
  estilos: 'M12 3.5l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.2l5.4-.8z',
  herramientas: 'M6 3.5h12v17H6zM9 7h6M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15M9 18h1.5M13.5 18H15',
  ingredientes: 'M12 20.5V9M12 9c0-3 2-5 4.5-5.5C16.5 6.5 14.5 9 12 9zM12 13c0-3-2-5-4.5-5.5C7.5 10.5 9.5 13 12 13zM12 16.5c0-3 2-5 4.5-5.5 0 3-2 5.5-4.5 5.5z',
  inventario: 'M4 8l8-4.5L20 8v9l-8 4.5L4 17zM4 8l8 4.5L20 8M12 12.5v9',
  agua: 'M12 3.5c3.5 4.5 6 7.7 6 10.7a6 6 0 0 1-12 0c0-3 2.5-6.2 6-10.7z',
  equipos: 'M5 9.5h14V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19zM3.5 9.5h17M8 9.5V6.5h8v3M9 13.5h6',
  palmares: 'M8 3.5h8l-1.5 6h-5zM12 9.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM12 12.5l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2-1.45-1.4 2-.3z',
  ajustes: 'M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M8 15v4',
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="square" aria-hidden>
      <path d={P[name] ?? P.inicio} />
    </svg>
  );
}
