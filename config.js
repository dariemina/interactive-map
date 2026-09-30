/*
 * ===================== CONFIGURACIÓN DEL RASTREADOR =====================
 * Edita estos valores con cualquier editor de texto (TextEdit en modo texto
 * plano, VS Code, etc.). Guarda y recarga la fuente de navegador en OBS
 * (botón "Actualizar la caché de la página actual" en Propiedades).
 *
 * Prioridad: config.js  <  ajustes guardados en el panel (tecla S)  <  parámetros de URL
 */
window.TRACKER_CONFIG = {
  // --- Misión ---
  missionName: 'Starship · Vuelo 14',
  missionSubtitle: 'Primer vuelo orbital · Starlink Grupo 31-1',
  liftoff: '2026-09-28T12:15:00Z',        // Hora de despegue en UTC (termina en Z). Cámbiala si hay retraso.

  // --- Modo: 'estimated' (TRAYECTORIA ESTIMADA) u 'official' (DATOS ORBITALES OFICIALES) ---
  mode: 'estimated',

  // --- Parámetros de la trayectoria estimada ---
  inclination: 32,      // grados. NASASpaceflight (27/09/2026): "32-degree inclination". SpaceX no lo publica.
  altitude: 275,        // km. SpaceX: "altitude approximately 275 km".
  launchSite: { name: 'Starbase', lat: 25.997, lon: -97.155 },
  launchDirection: 'descending',   // 'descending' = hacia el sureste (entre Cuba y Jamaica); 'ascending' = hacia el noreste

  // Modelo de ascenso (supuestos, solo para el modo estimado)
  secoSeconds: 491,          // T+08:11 apagado de motores de la nave (cronograma oficial de SpaceX)
  secoDownrangeKm: 1800,     // SUPUESTO: distancia recorrida sobre el suelo al SECO
  secoAltKm: 185,            // SUPUESTO: altitud al SECO
  secoSpeed: 7.45,           // SUPUESTO: km/s al SECO (trayectoria suborbital)
  stageSeconds: 142,         // T+02:22 separación en caliente (oficial)
  stageAltKm: 68, stageDownrangeKm: 80, stageSpeed: 1.55,   // SUPUESTOS
  entryAltKm: 100,           // SUPUESTO: altitud al inicio de la reentrada

  // Hitos oficiales (segundos desde el despegue) usados por el modo estimado
  insertionStart: 1517,      // T+00:25:17
  insertionEnd: 1536,        // T+00:25:36
  deorbitStart: 31957,       // T+08:52:37
  entryStart: 34136,         // T+09:28:56
  landing: 35430,            // T+09:50:30

  // --- Amerizaje (aprox.) y zona de peligro publicada ---
  splashdown: { name: 'Amerizaje previsto', sub: 'Pacífico · oeste de Chile (aprox.)', lat: -27.5, lon: -85.5 },
  // Aviso a navegantes HYDROPAC 2686/26 (NGA), "HAZARDOUS OPERATIONS, SPACE DEBRIS", 22-28 SEP, 2107Z-0108Z
  hazardArea: {
    label: 'Zona de peligro HYDROPAC 2686/26',
    points: [[-19.85,-149.00],[-19.383,-148.817],[-24.967,-133.167],[-26.167,-129.15],[-27.567,-123.05],[-28.183,-118.55],
             [-28.75,-112.65],[-28.30,-111.00],[-28.433,-103.433],[-26.917,-101.65],[-26.533,-99.20],[-25.283,-91.933],
             [-23.90,-83.783],[-27.283,-82.817],[-30.35,-82.783],[-31.033,-85.567],[-30.633,-87.567],[-30.967,-93.10],
             [-31.517,-102.10],[-31.25,-106.883],[-30.60,-113.017],[-29.317,-119.30],[-28.10,-125.10],[-26.183,-132.833]]
  },

  // --- Datos oficiales (modo 'official') ---
  official: {
    tle1: '', tle2: '',          // Pega aquí las 2 líneas del TLE (o usa el panel de ajustes / la URL)
    catnr: '',                   // Número de catálogo NORAD (p. ej. '100900') para descarga automática desde CelesTrak
    intdes: '',                  // Designador internacional del lanzamiento (p. ej. '2026-230')
    objectName: '',              // Búsqueda por nombre (p. ej. 'STARSHIP')
    supplemental: false,         // true = usar datos suplementarios SupGP de CelesTrak
    refreshMinutes: 120,         // Política de CelesTrak: los datos GP se actualizan cada 2 h; no consultar más a menudo
    celestrakBase: '/api/celestrak'
  },

  // --- Traza en el mapa ---
  pastOrbits: 1,          // órbitas recorridas que se dibujan
  futureOrbits: 1.5,      // órbitas futuras que se dibujan

  // --- Apariencia ---
  showTimeline: true,
  transparent: false,     // true = fondo transparente (los paneles mantienen su fondo)
  wordmark: 'EXPLORANDO EL ESPACIO',

  // --- Cronograma oficial (SpaceX, página del Vuelo 14). s = segundos desde el despegue ---
  timeline: [
    { s: 0,     t: 'Despegue', key: true },
    { s: 58,    t: 'Max Q' },
    { s: 140,   t: 'MECO del Super Heavy' },
    { s: 142,   t: 'Separación en caliente' },
    { s: 147,   t: 'Encendido de retorno del propulsor' },
    { s: 187,   t: 'Fin del encendido de retorno' },
    { s: 396,   t: 'Encendido de aterrizaje del propulsor' },
    { s: 421,   t: 'Fin del aterrizaje del propulsor (Golfo)' },
    { s: 491,   t: 'SECO · apagado de la nave', key: true, short: 'SECO' },
    { s: 1517,  t: 'Encendido de inserción orbital' },
    { s: 1536,  t: 'Fin de la inserción orbital', key: true, short: 'Órbita' },
    { s: 2047,  t: 'Inicio del despliegue de Starlink', key: true, short: 'Starlink' },
    { s: 3879,  t: 'Despliegue de Starlink completo' },
    { s: 31957, t: 'Encendido de desórbita', key: true, short: 'Desórbita' },
    { s: 31968, t: 'Fin del encendido de desórbita' },
    { s: 34136, t: 'Reentrada', key: true, short: 'Reentrada' },
    { s: 35249, t: 'Velocidad transónica' },
    { s: 35287, t: 'Velocidad subsónica' },
    { s: 35411, t: 'Encendido de aterrizaje' },
    { s: 35413, t: 'Giro de aterrizaje (flip)' },
    { s: 35430, t: 'Amerizaje', key: true, short: 'Amerizaje' }
  ]
};