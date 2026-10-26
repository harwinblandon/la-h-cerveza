import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Swatch } from '../components/ui';
import { AROMA_LABEL } from '../data/hops';
import { YEAST_FAMILY_LABEL } from '../data/yeasts';
import { byId } from '../domain/catalog';
import { fmtSg } from '../domain/calc/units';
import { hopsForStyle, yeastsForStyle } from '../domain/suggest/substitutes';
import { useCatalog } from '../hooks';

export default function Styles() {
  const catalog = useCatalog();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [cat, setCat] = useState('');
  const categories = [...new Set(catalog.styles.map((s) => s.category))];
  const list = catalog.styles.filter(
    (s) => (!cat || s.category === cat) && `${s.code} ${s.name} ${s.nameEn} ${s.description}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Estilos</h1>
        </div>
      </div>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Buscar estilo…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-2">
        {list.map((s) => {
          const R = s.ranges;
          const expanded = open === s.id;
          return (
            <div key={s.id} className="card" style={{ marginTop: 0 }}>
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <Swatch srm={(R.srm[0] + R.srm[1]) / 2} />
                <div style={{ flex: 1 }}>
                  <div className="faint" style={{ fontSize: '0.78rem' }}>
                    {s.code} · {s.category}
                  </div>
                  <h3 style={{ margin: 0 }}>{s.name}</h3>
                  {s.name !== s.nameEn && <div className="faint" style={{ fontSize: '0.8rem' }}>{s.nameEn}</div>}
                </div>
              </div>
              <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>{s.description}</p>
              <div className="row" style={{ fontSize: '0.8rem' }}>
                <span className="chip">
                  OG {fmtSg(R.og[0])}–{fmtSg(R.og[1])}
                </span>
                <span className="chip">
                  {R.ibu[0]}–{R.ibu[1]} IBU
                </span>
                <span className="chip">
                  {R.srm[0]}–{R.srm[1]} SRM
                </span>
                <span className="chip">
                  {R.abv[0]}–{R.abv[1]} %
                </span>
              </div>
              {expanded && <StyleDetail id={s.id} />}
              <div className="row" style={{ marginTop: '0.75rem' }}>
                <Link className="btn btn-sm btn-primary" to={`/recetas?nueva&estilo=${s.id}`}>
                  Crear receta
                </Link>
                <button className="btn btn-sm" onClick={() => setOpen(expanded ? null : s.id)}>
                  {expanded ? 'Menos' : 'Ingredientes típicos'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function StyleDetail({ id }: { id: string }) {
  const catalog = useCatalog();
  const s = byId(catalog.styles, id)!;
  return (
    <div style={{ fontSize: '0.88rem', marginTop: '0.75rem' }} className="stack">
      <div>
        <strong>Grano:</strong>{' '}
        {s.guide.grains.map((g) => `${byId(catalog.fermentables, g.ingredientId)?.name} ${g.pct} %`).join(' · ')}
      </div>
      <div>
        <strong>Lúpulos:</strong>{' '}
        {hopsForStyle(s, catalog, 6)
          .map((h) => `${h.name} (${h.aroma.slice(0, 2).map((a) => AROMA_LABEL[a]).join(', ')})`)
          .join(' · ')}
      </div>
      <div>
        <strong>Levaduras:</strong> {yeastsForStyle(s, catalog, 5).map((y) => y.name).join(' · ')}{' '}
        <span className="faint">({s.guide.yeastFamilies.map((f) => YEAST_FAMILY_LABEL[f]).join(', ')})</span>
      </div>
      <div>
        <strong>Agua:</strong> {byId(catalog.waters, s.guide.waterProfileId)?.name} · <strong>Macerado:</strong> {s.guide.mashTempC} °C · <strong>Fermentación:</strong>{' '}
        {s.guide.fermentTempC} °C · <strong>CO₂:</strong> {s.guide.carbonation} vol
      </div>
    </div>
  );
}
