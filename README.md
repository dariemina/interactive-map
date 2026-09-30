# Rastreador orbital · Explorando el Espacio

Mapa en directo para OBS (1920×1080) con la posición de Starship, la traza terrestre, el terminador día/noche, el tiempo de misión y los datos de vuelo en español. Funciona sin internet en el modo estimado. Solo el modo oficial por CATNR/INTDES necesita conexión.

## 1. Abrirlo en OBS (Mac)
1. Descomprime `starship-tracker.zip` en una carpeta fija (por ejemplo `Documentos/starship-tracker`).
2. En OBS: **Fuentes → + → Navegador**.
3. Marca **Archivo local** y elige `index.html`.
4. **Ancho 1920**, **Alto 1080**. Deja la FPS en 30.
5. Recomendado: desmarca «Apagar la fuente cuando no esté visible».
6. Para recargar después de un cambio: Propiedades → **Actualizar la caché de la página actual**.

Para abrir el **panel de ajustes**: clic derecho en la fuente → **Interactuar** → haz clic dentro de la ventana → pulsa la tecla **S**. Otra opción es hacer doble clic en la esquina superior izquierda. Los cambios se guardan y siguen ahí aunque recargues la fuente.

## 2. Cambiar la hora de despegue (retraso, pausa o nuevo día)
- **Durante el directo (lo más rápido):** abre el panel (S) y pulsa **«Despegue = ahora»** justo en el momento del despegue. Así el T+ queda sincronizado al segundo. También tienes botones de −1 min, +1 min y +10 min. Si no, escribe la hora (UTC, por ejemplo `2026-09-28T12:47:00Z`) y pulsa **Aplicar y guardar**.
- **Antes del directo:** edita `config.js`, línea `liftoff: '2026-09-28T12:15:00Z'`. Usa un editor de texto plano. En TextEdit: Formato → Convertir a texto normal y desactiva las comillas tipográficas.
- Antes del despegue se ve la cuenta atrás **T-** y la trayectoria prevista. **Restablecer** borra los ajustes del panel y vuelve a usar `config.js`.

## 3. Pasar a datos oficiales cuando haya elementos orbitales
El modo aparece siempre en la esquina superior izquierda: **TRAYECTORIA ESTIMADA** (naranja) o **DATOS ORBITALES OFICIALES** (rojo). Si falla la descarga de datos oficiales, el mapa vuelve solo a la trayectoria estimada y muestra un aviso.

**Dónde aparecerán:** en CelesTrak, cuando la Fuerza Espacial de EE. UU. catalogue los objetos del lanzamiento. Puede tardar horas, y durante una misión de unas 10 h puede que no lleguen a tiempo.
- Lista de lanzamientos recientes: https://celestrak.org/NORAD/elements/table.php?GROUP=last-30-days
- Al principio los objetos aparecen con el nombre de su designador (p. ej. `2026-2xxA`, `…B`) y más tarde se renombran.
- **Importante:** desde julio de 2026 los objetos nuevos tienen número NORAD de **6 cifras (100000+)** y CelesTrak **ya no los publica en formato TLE**, solo en JSON/CSV/XML. El rastreador lee directamente el JSON (OMM) de CelesTrak.
- Hoy CelesTrak no tiene datos suplementarios (SupGP) de Starship. Sí suele publicar SupGP de los satélites Starlink a partir de las efemérides de SpaceX. Recién desplegados (grupo 31-1) vuelan junto a la nave y sirven de aproximación, pero el panel mostrará su nombre.

**Cómo activarlo (panel S → «Datos oficiales»):**
- **Opción A: número NORAD.** Escribe el número (CATNR) del objeto Starship, elige el modo «DATOS ORBITALES OFICIALES» y pulsa **Aplicar y guardar**. Se descarga de CelesTrak y se actualiza cada 2 h, que es la política de CelesTrak (no pidas los datos más a menudo). El botón «Descargar ahora» fuerza una descarga.
- **Opción B: designador del lanzamiento (INTDES)**, p. ej. `2026-230`. Elige el objeto cuyo nombre contenga «STARSHIP» y, si no hay ninguno, la pieza A. Marca «SupGP» para usar los datos suplementarios.
- **Opción C: pegar el TLE (2 o 3 líneas) o el JSON/CSV de CelesTrak** en el cuadro de texto. Funciona también sin conexión.
- En `config.js` (sección `official`) puedes dejar `tle1`/`tle2`, `catnr` o `intdes` y poner `mode: 'official'`.

Aviso: tras el encendido de desórbita (T+08:52:37), los elementos orbitales dejan de representar la trayectoria real.

## 4. Otras misiones
En `config.js` cambia `missionName`, `missionSubtitle`, `liftoff`, `inclination`, `altitude`, `launchSite`, `splashdown`, `hazardArea` (o bórralo) y `timeline` (hitos en segundos desde el despegue). Para una misión con elementos oficiales (p. ej. la ISS, NORAD 25544) basta con el modo oficial + CATNR.

## 5. Parámetros de URL (avanzado)
Si usas la casilla URL de OBS en vez de «Archivo local», con una dirección `file:///ruta/index.html?...`:
`liftoff=2026-09-28T12:15:00Z` · `mode=official|estimated` · `name=...` · `inc=32` · `alt=275` · `catnr=100900` · `intdes=2026-230` · `objname=STARSHIP` · `sup=1` · `tle1=...&tle2=...` (codificados) · `transparent=1` · `timeline=0` · `settings=1` · `nocache=1` (ignora los ajustes guardados)
Para pruebas: `simtime=T%2B30m` (o `T-10m`, `T%2B01:30:00`, o una fecha ISO) y `rate=60` (acelera el reloj). Mientras haya simulación verás un aviso «SIMULACIÓN»: **quítalo antes del directo**.

## 6. Fuentes y supuestos del modo estimado
- **Oficial (SpaceX, página del Vuelo 14):** unos 275 km de altitud, unas 6 órbitas, vuelo de casi 10 h, amerizaje en el Pacífico al oeste de Chile, cronograma T+ (SECO T+08:11, inserción orbital T+25:17–25:36, Starlink T+34:07–1:04:39, desórbita T+08:52:37, reentrada T+09:28:56, amerizaje T+09:50:30). Ventana de 75 min desde las 12:15 UTC.
- **Inclinación 32°:** NASASpaceflight (27/09/2026). **SpaceX no la publica.** Otra fuente (BigGo, agosto de 2026) hablaba de unos 26,5°, pero la zona de peligro publicada llega hasta unos 31°S, lo que es coherente con 32° e incompatible con 26,5°.
- **Zona de amerizaje:** polígono del aviso a navegantes HYDROPAC 2686/26 (NGA, citado en SeeSat-L). El marcador «Amerizaje previsto» (27,5°S 85,5°O) es aproximado; SpaceX no publica un punto exacto.
- **Supuestos propios (etiquetados como estimados):** órbita circular; ascenso con SECO a unos 1800 km de Starbase, 185 km de altitud y 7,45 km/s; perfiles de altitud y velocidad en el ascenso y la reentrada; la traza pasa por Starbase rumbo sureste. En pruebas, la traza pasa por el canal de Yucatán y cerca de Jamaica y cruza la zona HYDROPAC durante la reentrada.

## Créditos
satellite.js 7.1.0 (MIT) · NASA Blue Marble y Black Marble 2016 (dominio público, NASA Earth Observatory) · Natural Earth (dominio público) · Inter (SIL OFL 1.1).

## 7. Publicarlo con GitHub + Railway
Este proyecto está preparado para ejecutarse directamente en Railway con Node.js.

- Railway ejecuta `npm start` y sirve el mapa desde `server.js`.
- La ruta `/health` devuelve `ok` y puede usarse como health check.
- Las consultas de CelesTrak pasan por `/api/celestrak/...`, evitando problemas CORS en navegadores públicos.
- `config.js` sigue siendo el lugar principal para editar misión, despegue, trayectoria y cronograma.

Flujo recomendado para cambios: editar → commit en GitHub → Railway redeploy automático.