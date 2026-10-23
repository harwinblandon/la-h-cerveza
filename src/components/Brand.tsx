import { useEffect, useRef } from 'react';
import hPersonal from '../assets/h-personal.svg?raw';
import lahCerveza from '../assets/lah-cerveza.svg?raw';

// Los SVG usan currentColor: toman el color del tema (negro o blanco hueso).
const inline = (svg: string, label: string) => svg.replace('<svg ', `<svg aria-label="${label}" focusable="false" `);

export function LogoLaH({ className = 'brand-logo' }: { className?: string }) {
  return <span className={className} role="img" aria-label="La H · Cerveza artesanal" dangerouslySetInnerHTML={{ __html: inline(lahCerveza, 'La H · Cerveza artesanal') }} />;
}

export function HMark({ className }: { className?: string }) {
  return <span className={className} aria-hidden dangerouslySetInnerHTML={{ __html: hPersonal }} />;
}

/** Firma personal: "by H", enlazada a Red HB. */
export function Signature() {
  return (
    <a className="signature" href="https://redhb.com" target="_blank" rel="noreferrer" title="Red HB">
      by <HMark />
    </a>
  );
}

/** Red de puntos que derivan y se enlazan (como en redhb.com). Respeta "reducir movimiento". */
export function NetCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const LINK = 140;
    let w = 0;
    let h = 0;
    let raf = 0;
    let points: { x: number; y: number; vx: number; vy: number }[] = [];
    const ink = () => getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#f2f0eb';
    const rgb = (hex: string) => {
      const m = hex.replace('#', '').match(/.{2}/g);
      return m ? m.map((x) => parseInt(x, 16)).join(', ') : '242, 240, 235';
    };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(55, (w * h) / 9000));
      points = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12 }));
    };
    const draw = () => {
      const c = rgb(ink());
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            ctx.strokeStyle = `rgba(${c}, ${0.08 * (1 - d / LINK)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = `rgba(${c}, 0.18)`;
        ctx.fillRect(a.x - 1, a.y - 1, 2, 2);
      }
    };
    const step = () => {
      for (const p of points) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20) p.x = w + 20;
        else if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        else if (p.y > h + 20) p.y = -20;
      }
      draw();
      if (!document.hidden) raf = requestAnimationFrame(step);
    };
    const onVisible = () => {
      if (!document.hidden && !reduce) raf = requestAnimationFrame(step);
    };
    const onResize = () => {
      resize();
      if (reduce) draw();
    };
    resize();
    if (reduce) draw();
    else raf = requestAnimationFrame(step);
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return <canvas ref={ref} className="net" aria-hidden />;
}
