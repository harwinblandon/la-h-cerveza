import { useState, type ReactNode } from 'react';
import { Field, NumberInput, Swatch, fmt } from '../components/ui';
import { abv, apparentAttenuation } from '../domain/calc/gravity';
import {
  PRIMING_SUGARS,
  brixToSg,
  dilutionVolume,
  dmeForGravity,
  hydrometerCorrection,
  kegPsi,
  pitchRate,
  primingSugarGrams,
  refractometerFg,
} from '../domain/calc/tools';
import { cToF, ebcToSrm, psiToBar, sgToPlato } from '../domain/calc/units';
import { strikeTemp } from '../domain/calc/volumes';
import type { PrimingSugarId } from '../domain/types';

function Tool({ title, children, result }: { title: string; children: ReactNode; result: ReactNode }) {
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <h3>{title}</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem' }}>
        {children}
      </div>
      <div className="callout" style={{ marginTop: '0.75rem' }}>
        {result}
      </div>
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>{children}</div>;

export default function Tools() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Herramientas</h1>
        </div>
      </div>
      <div className="grid grid-2">
        <AbvTool />
        <RefractometerTool />
        <HydrometerTool />
        <GravityFixTool />
        <PrimingTool />
        <KegTool />
        <StrikeTool />
        <PitchTool />
        <ConverterTool />
      </div>
    </>
  );
}

function AbvTool() {
  const [og, setOg] = useState(1.05);
  const [fg, setFg] = useState(1.01);
  return (
    <Tool
      title="Alcohol (ABV)"
      result={
        <>
          <Big>{fmt(abv(og, fg))} % ABV</Big>
          Atenuación aparente {fmt(apparentAttenuation(og, fg), 0)} % · fórmula simple {fmt((og - fg) * 131.25)} %
        </>
      }
    >
      <Field label="OG">
        <NumberInput value={og} decimals={3} onChange={setOg} />
      </Field>
      <Field label="FG">
        <NumberInput value={fg} decimals={3} onChange={setFg} />
      </Field>
    </Tool>
  );
}

function RefractometerTool() {
  const [ob, setOb] = useState(12.5);
  const [fb, setFb] = useState<number>();
  const [wcf, setWcf] = useState(1.04);
  const og = brixToSg(ob, wcf);
  const fg = fb !== undefined ? refractometerFg(ob, fb, wcf) : undefined;
  return (
    <Tool
      title="Refractómetro"
      result={
        <>
          <Big>OG {og.toFixed(3)}</Big>
          {fg !== undefined ? (
            <>
              Densidad actual corregida por alcohol: <strong>{fg.toFixed(3)}</strong> · {fmt(abv(og, fg))} % ABV
            </>
          ) : (
            'Agrega los Brix actuales para corregir la lectura durante la fermentación.'
          )}
        </>
      }
    >
      <Field label="Brix original">
        <NumberInput value={ob} decimals={1} onChange={setOb} />
      </Field>
      <Field label="Brix actual">
        <NumberInput value={fb} decimals={1} onChange={setFb} placeholder="opcional" />
      </Field>
      <Field label="Factor de corrección" hint="Típico 1,02–1,06">
        <NumberInput value={wcf} decimals={2} onChange={setWcf} />
      </Field>
    </Tool>
  );
}

function HydrometerTool() {
  const [sg, setSg] = useState(1.05);
  const [t, setT] = useState(30);
  const [cal, setCal] = useState(20);
  return (
    <Tool title="Corrección del densímetro por temperatura" result={<Big>{hydrometerCorrection(sg, t, cal).toFixed(3)}</Big>}>
      <Field label="Lectura">
        <NumberInput value={sg} decimals={3} onChange={setSg} />
      </Field>
      <Field label="Temp. muestra">
        <NumberInput value={t} decimals={1} onChange={setT} unit="°C" />
      </Field>
      <Field label="Calibración">
        <NumberInput value={cal} decimals={0} onChange={setCal} unit="°C" />
      </Field>
    </Tool>
  );
}

function GravityFixTool() {
  const [sg, setSg] = useState(1.058);
  const [vol, setVol] = useState(22);
  const [target, setTarget] = useState(1.05);
  const finalVol = dilutionVolume(sg, vol, target);
  const diff = finalVol - vol;
  return (
    <Tool
      title="Corregir densidad"
      result={
        diff >= 0 ? (
          <>
            <Big>Agrega {fmt(diff)} L de agua</Big>
            Terminarás con {fmt(finalVol)} L a {target.toFixed(3)}.
          </>
        ) : (
          <>
            <Big>Agrega {fmt(dmeForGravity(sg, target, vol), 0)} g de DME</Big>O evapora {fmt(-diff)} L más (quedarías con {fmt(finalVol)} L).
          </>
        )
      }
    >
      <Field label="Densidad actual">
        <NumberInput value={sg} decimals={3} onChange={setSg} />
      </Field>
      <Field label="Volumen actual">
        <NumberInput value={vol} decimals={1} onChange={setVol} unit="L" />
      </Field>
      <Field label="Densidad objetivo">
        <NumberInput value={target} decimals={3} onChange={setTarget} />
      </Field>
    </Tool>
  );
}

function PrimingTool() {
  const [vol, setVol] = useState(19);
  const [co2, setCo2] = useState(2.4);
  const [t, setT] = useState(20);
  const [sugar, setSugar] = useState<PrimingSugarId>('sacarosa');
  const g = primingSugarGrams(co2, t, vol, sugar);
  return (
    <Tool
      title="Azúcar para embotellar"
      result={
        <>
          <Big>
            {fmt(g, 0)} g de {PRIMING_SUGARS[sugar].name.toLowerCase()}
          </Big>
          {fmt(g / vol, 1)} g/L · ≈ {fmt((g / vol) * 0.33, 1)} g por botella de 330 mL
        </>
      }
    >
      <Field label="Litros">
        <NumberInput value={vol} decimals={1} onChange={setVol} unit="L" />
      </Field>
      <Field label="Volúmenes CO₂">
        <NumberInput value={co2} decimals={1} onChange={setCo2} />
      </Field>
      <Field label="Temp. máx. cerveza">
        <NumberInput value={t} decimals={1} onChange={setT} unit="°C" />
      </Field>
      <Field label="Azúcar">
        <select className="input" value={sugar} onChange={(e) => setSugar(e.target.value as PrimingSugarId)}>
          {Object.entries(PRIMING_SUGARS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>
    </Tool>
  );
}

function KegTool() {
  const [co2, setCo2] = useState(2.5);
  const [t, setT] = useState(4);
  const psi = kegPsi(co2, t);
  return (
    <Tool
      title="Carbonatación en barril"
      result={
        <Big>
          {fmt(psi, 1)} PSI · {fmt(psiToBar(psi), 2)} bar
        </Big>
      }
    >
      <Field label="Volúmenes CO₂">
        <NumberInput value={co2} decimals={1} onChange={setCo2} />
      </Field>
      <Field label="Temp. cerveza">
        <NumberInput value={t} decimals={1} onChange={setT} unit="°C" />
      </Field>
    </Tool>
  );
}

function StrikeTool() {
  const [target, setTarget] = useState(66);
  const [grainT, setGrainT] = useState(20);
  const [kg, setKg] = useState(5);
  const [water, setWater] = useState(30);
  const ratio = kg > 0 ? water / kg : 0;
  return (
    <Tool
      title="Temperatura del agua de empaste"
      result={
        <>
          <Big>{fmt(strikeTemp(target, grainT, ratio))} °C</Big>
          Relación {fmt(ratio, 1)} L/kg. Si tu olla no está precalentada, suma 1–2 °C.
        </>
      }
    >
      <Field label="Macerado a">
        <NumberInput value={target} decimals={1} onChange={setTarget} unit="°C" />
      </Field>
      <Field label="Temp. grano">
        <NumberInput value={grainT} decimals={0} onChange={setGrainT} unit="°C" />
      </Field>
      <Field label="Grano">
        <NumberInput value={kg} decimals={2} onChange={setKg} unit="kg" />
      </Field>
      <Field label="Agua">
        <NumberInput value={water} decimals={1} onChange={setWater} unit="L" />
      </Field>
    </Tool>
  );
}

function PitchTool() {
  const [og, setOg] = useState(1.05);
  const [vol, setVol] = useState(20);
  const [kind, setKind] = useState<'ale' | 'lager'>('ale');
  const [form, setForm] = useState<'seca' | 'liquida'>('seca');
  const [age, setAge] = useState(30);
  const p = pitchRate(og, vol, kind, form, age);
  return (
    <Tool
      title="Cantidad de levadura"
      result={
        <>
          <Big>
            {p.packs} {form === 'seca' ? 'sobre(s) de 11,5 g' : 'paquete(s)'}
          </Big>
          Necesitas ~{fmt(p.cellsNeededB, 0)} mil millones de células
          {form === 'liquida' ? ` · viabilidad estimada ${fmt(p.viabilityPct, 0)} %. Un starter de 1–2 L reduce paquetes.` : '.'}
        </>
      }
    >
      <Field label="OG">
        <NumberInput value={og} decimals={3} onChange={setOg} />
      </Field>
      <Field label="Litros">
        <NumberInput value={vol} decimals={1} onChange={setVol} unit="L" />
      </Field>
      <Field label="Tipo">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'ale')}>
          <option value="ale">Ale</option>
          <option value="lager">Lager</option>
        </select>
      </Field>
      <Field label="Formato">
        <select className="input" value={form} onChange={(e) => setForm(e.target.value as 'seca')}>
          <option value="seca">Seca</option>
          <option value="liquida">Líquida</option>
        </select>
      </Field>
      {form === 'liquida' && (
        <Field label="Días desde fabricación">
          <NumberInput value={age} decimals={0} onChange={setAge} />
        </Field>
      )}
    </Tool>
  );
}

function ConverterTool() {
  const [sg, setSg] = useState(1.048);
  const [c, setC] = useState(20);
  const [ebc, setEbc] = useState(20);
  return (
    <Tool
      title="Conversiones"
      result={
        <div className="kv" style={{ gridTemplateColumns: 'auto auto' }}>
          <dt>Plato / Brix</dt>
          <dd>{fmt(sgToPlato(sg), 1)} °P</dd>
          <dt>Fahrenheit</dt>
          <dd>{fmt(cToF(c), 1)} °F</dd>
          <dt>SRM</dt>
          <dd className="row" style={{ justifyContent: 'flex-end' }}>
            {fmt(ebcToSrm(ebc), 1)} <Swatch srm={ebcToSrm(ebc)} size={0.6} />
          </dd>
        </div>
      }
    >
      <Field label="Densidad (SG)">
        <NumberInput value={sg} decimals={3} onChange={setSg} />
      </Field>
      <Field label="°C">
        <NumberInput value={c} decimals={1} onChange={setC} />
      </Field>
      <Field label="EBC">
        <NumberInput value={ebc} decimals={0} onChange={setEbc} />
      </Field>
    </Tool>
  );
}

