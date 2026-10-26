import { useState, type ReactNode } from 'react';

/** Explicación técnica plegada detrás de un pequeño botón "Info". */
export function Info({ children, label = 'Info' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="info">
      <button type="button" className="info-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden>ⓘ</span> {label}
      </button>
      {open && <div className="info-body">{children}</div>}
    </div>
  );
}
