window.TRACKER_CONFIG = {
  missionName: 'NASA · SpaceX Crew-13',
  missionSubtitle: 'Dragon Grace · Rumbo a la Estación Espacial Internacional',
  vehicleName: 'DRAGON GRACE',
  liftoff: '2026-10-01T15:10:00Z',
  mode: 'estimated',

  inclination: 51.6,
  altitude: 420,
  launchSite: { name: 'SLC-40', sub: 'Cape Canaveral · Florida', lat: 28.562, lon: -80.577 },
  launchDirection: 'ascending',

  secoSeconds: 527,
  secoDownrangeKm: 2050,
  secoAltKm: 200,
  secoSpeed: 7.65,
  stageSeconds: 147,
  stageAltKm: 70,
  stageDownrangeKm: 90,
  stageSpeed: 1.8,
  entryAltKm: 100,

  insertionStart: 515,
  insertionEnd: 527,

  // Mantiene la trayectoria orbital activa durante el encuentro con la ISS.
  // Estos hitos de reentrada quedan fuera de la ventana de Crew-13.
  deorbitStart: 604800,
  entryStart: 608400,
  landing: 612000,

  splashdown: null,
  hazardArea: null,

  official: {
    tle1: '', tle2: '',
    catnr: '',
    intdes: '',
    objectName: 'CREW DRAGON',
    supplemental: false,
    refreshMinutes: 120,
    celestrakBase: '/api/celestrak'
  },

  pastOrbits: 1,
  futureOrbits: 1.5,
  showTimeline: true,
  transparent: false,
  wordmark: 'EXPLORANDO EL ESPACIO',

  timeline: [
    { s: 0,     t: 'Despegue', key: true },
    { s: 72,    t: 'Max Q' },
    { s: 144,   t: 'MECO · apagado primera etapa' },
    { s: 147,   t: 'Separación de etapas', key: true, short: 'Etapas' },
    { s: 155,   t: 'Encendido segunda etapa' },
    { s: 161,   t: 'Inicio boostback del propulsor' },
    { s: 207,   t: 'Fin boostback del propulsor' },
    { s: 380,   t: 'Inicio encendido de entrada del propulsor' },
    { s: 392,   t: 'Fin encendido de entrada del propulsor' },
    { s: 444,   t: 'Encendido de aterrizaje del propulsor' },
    { s: 461,   t: 'Aterrizaje de la primera etapa', key: true, short: 'Booster' },
    { s: 527,   t: 'SECO-1 · apagado segunda etapa', key: true, short: 'Órbita' },
    { s: 579,   t: 'Separación de Dragon', key: true, short: 'Dragon' },
    { s: 625,   t: 'Apertura del cono frontal de Dragon' },
    { s: 31800, t: 'Acoplamiento previsto con la ISS', key: true, short: 'ISS' }
  ]
};