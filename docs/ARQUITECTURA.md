# Arquitectura de La H

Principio: **los motores técnicos calculan, los datos mandan, la IA interpreta, el cervecero decide.**

## Capas

| Capa | Dónde | Qué hace |
|---|---|---|
| Motor matemático | `src/domain/calc/` | Cálculos determinísticos: densidad, IBU, color, agua, pH, volúmenes, carbonatación. Sin interfaz, con pruebas. |
| Motor de reglas | `src/domain/suggest/`, `src/domain/versioning.ts` (consecuencias) | Relaciones cerveceras conocidas: sugerencias, sustitutos, efectos de cada cambio. |
| Motor de estilos | `src/data/styles.ts` | Rangos BJCP 2021 + receta guía propia de La H por estilo. |
| Persistencia | `src/db.ts` | IndexedDB (Dexie), local al navegador. Sin servidor. |
| Interfaz | `src/pages/`, `src/components/` | React. |

## Decisiones de la fase 1

### El lote es la memoria de lo ocurrido
- La **receta** es lo planeado; el **lote** es lo que pasó.
- Al cocinar, el lote guarda una copia congelada de la receta y la referencia a la **versión** exacta (`recipeVersionId`).
- Todo lo que ocurre en el lote tiene hora: pasos marcados (`brewDay.done[id] = timestamp`), mediciones (`brewDay.measuredAt`), eventos manuales (`events`: nota, medición, adición, corrección, estado) y lecturas de fermentación (con presión y pH).
- `plannedVsActual()` compara plan y medición con una tolerancia por parámetro. Un desvío es información, no un error.

### Versiones inmutables
- Tabla `recipeVersions`: cada versión es una foto (`snapshot`) que **nunca se edita ni se borra**.
- La receta es un borrador editable; `hasUnversionedChanges()` compara su contenido técnico con la última versión.
- Se crea versión al guardar manualmente, al cocinar (si hay cambios), al importar y antes de restaurar otra versión (respaldo automático).
- Restaurar una versión no borra nada: el borrador pasa a ser una copia de esa versión.
- Las recetas no se eliminan, se **archivan**.
- Migración v1 → v2: cada receta existente recibió su V1.

### Procedencia de cada dato
- Tipo `Provenance`: `bjcp`, `fabricante`, `referencia`, `calculo`, `estimacion`, `regla`, `medicion`, `usuario`, `inventario`, `importacion`, `historial`, `ia`.
- Catálogo integrado: maltas y lúpulos = `referencia` (valor típico), levaduras = `fabricante`, perfiles de agua = `referencia` o `regla`.
- Al editar un valor clave (color, % AA, atenuación) la fila pasa a `usuario`. Si un lúpulo está en el inventario con su % AA, se usa ese valor como `inventario`.
- La interfaz muestra la procedencia con `SourceTag`.

### Consecuencias antes de aplicar
- `diffRecipes(a, b)` lista cambios técnicos; `consequences()` asigna efectos (+, −, ⚠) por regla cervecera; `statDeltas()` calcula el efecto numérico.
- Se usa en: sugerencias del asistente, escalado, cambio de equipo, regeneración desde el estilo, restaurar versiones y comparar versiones.

### Importación / exportación
- BeerXML 1.0 (Brewfather, BeerSmith, Brewer's Friend). Analizador XML propio, sin dependencias.
- Los ingredientes se emparejan con el catálogo por similitud de nombre y alias en inglés; los que no coinciden conservan los datos del archivo y se informan.
- Exportación La H (`.json`) incluye todas las versiones.

## Decisiones de la fase 2

### Motor sensorial (`src/domain/sensory.ts`)
- 11 variables 0–10: dulzor, cuerpo, maltosidad, tostado, amargor percibido, lúpulo, ésteres, fenoles, acidez, alcohol percibido, carbonatación.
- Cada variable combina varias causas técnicas (FG, % de caramelo, índice de tostado por concentración, BU:GU, sulfato/cloruro, familia de levadura, temperatura de fermentación, dextrinas, carbonatación…) y devuelve sus **contribuciones** (`drivers`) e **incertidumbre**. Nunca una regla única del tipo "cuerpo 8 = 69 °C".
- Dulzor, cuerpo y tostado tienen rendimiento decreciente (no se saturan linealmente en cervezas densas).
- Procedencia: `estimacion`. Los pesos son heurísticos y se calibrarán con las catas (fase 4).

### Intención (`src/domain/intent.ts`)
- `parseIntent()`: intérprete **determinístico** de palabras clave en español (no IA). Devuelve estilo, modo, objetivo, topes ("sin ser empalagosa", "bebible"), aromas, restricciones (ABV, IBU, color) y la lista de frases que entendió. Lo que aún no modela (Smoothie Sour, adjuntos) se informa.
- `designRoutes()`: búsqueda por coordenadas sobre las perillas del generador (`Tuning`: OG, FG, IBU, maltas de carácter, lúpulo de aroma, levadura, agua, carbonatación, cambios de lúpulo). Minimiza la distancia al objetivo más una penalización de estilo que depende de la ruta y del modo.
  - **A · Fiel**: dentro del estilo, agua del estilo, levaduras típicas.
  - **B · Expresiva**: favorece ésteres y maltosidad donde el objetivo no fija valor.
  - **C · Moderna**: lúpulos del nuevo mundo y aguas modernas; acepta desviaciones (quedan listadas).
  - Diseño libre: cada ruta parte de un estilo base distinto (`closestStyles`).
- Topes relativos al estilo: "bebible" en una Tripel significa alcohol escondido para su categoría, no 4 %.
- `alternativeStyles()`: si ninguna ruta llega al objetivo (< 92 %), sugiere estilos que encajan mejor.

### Modos como política de desviación
- `competencia` endurece la severidad; `tradicional` es la base; `moderna` convierte desvíos del estilo en información; `libre` no evalúa el estilo.
- Cada sugerencia tiene una clave estable. El cervecero puede marcarla como **desviación intencional** con su motivo (`recipe.deviations`); se muestra aparte, nunca como problema.

### Índices separados
- Compatibilidad con el estilo: 100 − hasta 20 puntos por cada parámetro (OG, FG, ABV, IBU, SRM) fuera de rango, proporcional a cuánto se sale.
- Compatibilidad sensorial: 100 − 20 × media de (|diferencia| − 0,5)^1,5 sobre las variables definidas.
- Siempre se muestran por separado, con su desglose y una frase interpretativa.

### Objetivo · Predicción · Resultado
- Objetivo: `recipe.intent.target`. Predicción: motor sensorial. Resultado: `batch.evaluation.sensory` (pestaña Cata, misma escala).

### Guardado del lote
- Todo cambio que depende del valor anterior usa `mutate()` (Dexie `modify` dentro de la transacción), no la copia en pantalla: escribir rápido en varios campos no pierde datos.

## Contexto local y marca

### Agua de Armenia (`src/data/water.ts`)
- Perfiles `armenia-epa` (sept. 2026) y `armenia-epa-jul` (jul. 2026), promedios de los reportes IRCA fisicoquímicos de Empresas Públicas de Armenia (laboratorio acreditado).
- Conversiones: Ca = calcio como CaCO₃ × 0,4004; Mg = (dureza total − cálcica) × 0,2428; HCO₃ = alcalinidad × 1,22. El sodio no se reporta: se estima por balance de cargas (procedencia indicada).
- Es el agua de origen por defecto (migración v3 de la base: solo si seguía en "destilada").
- Para actualizarla: nuevos reportes en https://www.epa.gov.co/institucional/otras-publicaciones/calidad-de-agua.

### Distrines (`src/data/distrines.ts`)
- Generado a partir de las fichas de distrines.com: maltas BestMalz, Castle y Fuglsang (con % máximo de uso y sabor), lúpulos (rango de alfa y perfil), levaduras Fermentis (temperatura y atenuación). Cada ingrediente lleva `stores: [{ store, url, note }]`.
- Distrines no publica el EBC de las maltas: se usa el típico de cada maltería, marcado como `referencia`.
- `DISTRINES_EQUIVALENTS`: tabla de equivalencias con criterio cervecero (carácter, no solo color) para que la receta guía use insumos de la tienda. Lo que no tiene equivalente real (azúcares genéricos, lactosa, Carafa Special desamargada) se deja como está.
- El % máximo de la maltería es recomendación: superarlo es `idea`; duplicarlo, `aviso`.

### Preferencias de elaboración (`useBrewPrefs`)
- Tienda preferida, sales disponibles (el optimizador solo usa esas) y % AA real de los lúpulos del inventario.
- Al cambiar el % AA de una adición de amargor, los gramos se recalculan para conservar sus IBU; las adiciones de aroma conservan los gramos.
- La receta de sales se presenta en gramos por agua (macerado y lavado) y mg/L.

### Marca (Red HB)
- Paleta monocroma de redhb.com (#0e0e0e / #f2f0eb), IBM Plex Mono para etiquetas y cifras, IBM Plex Sans para texto. Tema oscuro por defecto; claro o según el sistema en Ajustes (guardado por dispositivo).
- Logos del cervecero en `src/assets/` (SVG con `currentColor`), firma "by H" enlazada a redhb.com, red animada de fondo en la portada.

## Perfiles locales (`src/profiles.ts`)
- Registro aparte (`la-h-perfiles`) con usuario, nombre, base de datos del perfil y huella de clave opcional (PBKDF2-SHA256, 150 000 iteraciones, sal aleatoria). Nunca se guarda la clave.
- Cada perfil tiene su propia base IndexedDB (`la-h-cerveceria-<id>`): recetas, versiones, lotes, inventario, agua, equipos y ajustes separados.
- La base anterior a los perfiles (`la-h-cerveceria`) pasa intacta al primer perfil que se cree, si el cervecero lo marca.
- La sesión se guarda en `localStorage` ("recordarme") o `sessionStorage`; cambiar de perfil recarga la app para abrir su base.
- Limitación conocida: la clave protege el acceso desde la app, no cifra los datos del navegador.
- Valores por defecto neutrales para perfiles nuevos (agua destilada, sin tienda); el asistente de creación pregunta agua, tienda y equipo.

## Agua de cualquier origen (`src/domain/waterReport.ts`)
- Acepta el informe tal como venga: calcio y magnesio como ion o "como CaCO₃", dureza total (deduce el magnesio), alcalinidad como CaCO₃ o bicarbonato, sodio opcional (estimable por balance de cargas).
- Balance iónico (cationes vs aniones en meq/L) para detectar unidades equivocadas o datos mal digitados; tolerante con aguas muy blandas.
- Perfiles de partida: ósmosis inversa típica, destilada, Armenia (EPA); mezcla de dos aguas en proporción.

## Próximas fases

3. Adjuntos: frutas, café, cacao, vainilla, lactosa, madera; riesgos de dry hop; estilos modernos.
4. Evaluación sensorial, defectos, competencias y aprendizaje del historial (siempre con número de lotes y confianza).
5. Nube e IA (pendiente de decisión: hoy sin servidor ni servicios pagos).
