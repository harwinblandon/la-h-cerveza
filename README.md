# La H · Cervecería Artesanal

Aplicación web en español para planificar recetas de cerveza y acompañar cada lote: diseño por estilo, sustitución de ingredientes, química del agua, día de cocción, fermentación y envasado.

**Usarla en línea:** https://cerveza.redhb.com

## Cómo usarla

```bash
npm install
npm run dev      # abre http://localhost:5173
npm test         # pruebas del motor de cálculos
npm run build    # versión para publicar (carpeta dist/)
```

Los datos (recetas, lotes, equipos, inventario) se guardan en el navegador (IndexedDB). En **Ajustes → Copia de seguridad** puedes descargarlos y restaurarlos en otro equipo.

Publicada (`npm run build` y subir `dist/` a cualquier hosting estático), se puede **instalar en el celular** y funciona sin internet.

## Qué hace

- **Recetas por estilo**: 69 estilos de la guía BJCP 2021, incluido el provisional Catharina Sour (X4). Elige estilo, equipo y litros y se genera una receta base con maltas, lúpulos, levadura, macerado, plan de fermentación y sales del agua, dentro de los rangos del estilo.
- **Equipos**: BIAB, BIAB con mini lavado, todo en uno, tres ollas y extracto. Volúmenes de agua, temperatura de empaste, pérdidas y avisos de capacidad de la olla.
- **Asistente**: revisa OG, FG, IBU, color, levadura, cantidad de células, temperatura, proporciones de malta, pH y agua, y propone correcciones que se aplican con un clic (con deshacer).
- **Sustitutos ("no tengo…")**: maltas por tipo y color, lúpulos por perfil aromático (manteniendo el IBU en amargor), levaduras por familia de cepa. Prioriza lo que hay en el inventario.
- **Agua**: perfil propio desde el informe del acueducto, perfiles objetivo por tipo de cerveza, cálculo automático de sales y ácido láctico, estimación del pH de macerado.
- **Lotes**: checklist del día de cocción con temporizadores y alertas de adiciones de lúpulo, correcciones con la densidad pre-hervor (hervir más, agregar DME o agua), eficiencia real, registro de fermentación (densímetro o refractómetro) con gráfico, calendario de dry hop / cold crash y cálculo de priming o presión de barril.
- **Perfiles**: varios cerveceros en el mismo navegador, cada uno con usuario, clave opcional y sus propios datos e historial.
- **Cualquier agua**: llave de tu ciudad, embotellada, ósmosis, pozo o mezcla; el informe se carga como venga (iones o "como CaCO₃") y se verifica con balance iónico.
- **Insumos de Distrines y agua de Armenia**: catálogo de maltas, lúpulos y levaduras de Distrines con enlace a cada ficha; agua de Armenia (EPA) como origen. Las sales se calculan solo con las que tienes y se entregan en gramos; los gramos de lúpulo se ajustan al % AA real de tu bolsa para mantener los IBU.
- **Diseño desde una intención**: escribe lo que quieres ("Tripel seca, compleja y bebible para competencia"); La H lo traduce a un perfil sensorial de 11 variables, propone tres rutas (fiel, expresiva, moderna) con su compatibilidad con el estilo y con tu objetivo, y explica sus decisiones técnicas. Si el objetivo no cabe en el estilo, sugiere otro.
- **Objetivo · Predicción · Resultado**: el perfil que buscas, lo que la receta debería dar (con sus causas e incertidumbre) y lo que evaluaste en la cata.
- **Modos de diseño**: competencia, tradicional, moderna o libre; cambian cómo se tratan las desviaciones. Puedes marcar una desviación como intencional con su motivo.
- **Versiones**: cada receta guarda versiones inmutables (V1, V2, "Competencia 2027"…). Al cocinar se congela la versión exacta; puedes comparar versiones, ver qué cambió y restaurar sin perder nada. Las recetas se archivan, no se borran.
- **Consecuencias antes de aplicar**: cada cambio propuesto muestra su efecto en OG, FG, IBU, color, pH… y sus consecuencias sensoriales (más cuerpo, riesgo de hop burn, etc.).
- **Procedencia de los datos**: cada valor indica si viene del BJCP, del fabricante, de un cálculo, de una estimación, de tu medición, de tu inventario o de un archivo importado.
- **Línea de tiempo y plan vs real**: pasos, mediciones, correcciones, adiciones y lecturas con su hora; tabla que compara lo planeado con lo medido.
- **Historial y palmarés**: recetas y lotes históricos con la procedencia de cada dato (confirmado, medición, ejecución, planificado, estimación) y lo que no se recuperó marcado como `dato_no_recuperado`, sin completarlo. Los premios solo quedan vinculados a una receta, versión o lote cuando el cervecero lo confirma. El historial inicial de La H se genera con `npx vite-node scripts/historial-la-h.ts` y se importa desde Ajustes → Restaurar copia.
- **BeerXML**: importa y exporta recetas de Brewfather, BeerSmith y otras herramientas.
- **Herramientas**: ABV, refractómetro, corrección del densímetro por temperatura, dilución, priming (incluye panela), barril, empaste, levadura y conversiones.

## Fórmulas

IBU por Tinseth (whirlpool con factor de temperatura de Malowicki), color por Morey, ABV de alta precisión, refractómetro por Terrill, CO₂ residual y presión de barril estándar, alcalinidad residual de Kolbach y pH de macerado por balance de cargas (±0,1).

## Estructura

Ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) para las decisiones de diseño.


- `src/domain/` — motor de cálculos, generador de recetas, sugerencias y sustitutos (sin dependencias de interfaz, con pruebas).
- `src/data/` — catálogos: estilos, maltas, lúpulos, levaduras, perfiles de agua, equipos.
- `src/pages/` y `src/components/` — interfaz en React.
