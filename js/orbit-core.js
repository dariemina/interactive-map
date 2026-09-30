/*
 * orbit-core.js — núcleo de cálculo del rastreador orbital (Explorando el Espacio)
 * Requiere satellite.js (window.satellite). Sin dependencias externas.
 * Funciona en navegador (window.OrbitCore) y en Node (global.OrbitCore) para pruebas.
 */
(function (root) {
  'use strict';
  var sat = root.satellite;
  var MU = 398600.4418;      // km^3/s^2
  var RE = 6378.137;         // km (radio ecuatorial WGS84)
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var OMEGA_E = 7.2921150e-5; // rad/s

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function wrapLon(l) { l = ((l + 180) % 360 + 360) % 360 - 180; return l; }
  function wrap360(a) { return ((a % 360) + 360) % 360; }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

  /* Distancia de gran círculo (km) */
  function gcDist(lat1, lon1, lat2, lon2) {
    var p1 = lat1 * D2R, p2 = lat2 * D2R, dp = p2 - p1, dl = (lon2 - lon1) * D2R;
    var a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * 6371.0 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* Propaga un satrec a una fecha y devuelve estado geodésico */
  function propagateGeo(satrec, date) {
    var pv = sat.propagate(satrec, date);
    if (!pv || !pv.position || pv.position === true || isNaN(pv.position.x)) return null;
    var gmst = sat.gstime(date);
    var g = sat.eciToGeodetic(pv.position, gmst);
    var v = pv.velocity;
    var speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); // km/s inercial (ECI)
    return { lat: g.latitude * R2D, lon: wrapLon(g.longitude * R2D), alt: g.height, speed: speed, eci: pv.position };
  }

  function periodMin(satrec) { return (2 * Math.PI) / satrec.no; } // satrec.no en rad/min

  /* ---------- Parseo de elementos (TLE / OMM JSON / OMM CSV) ---------- */
  function parseElements(text) {
    if (!text) throw new Error('Texto vacío');
    text = String(text).trim();
    if (text[0] === '[' || text[0] === '{') {
      var j = JSON.parse(text);
      if (Array.isArray(j)) { if (!j.length) throw new Error('JSON sin objetos'); return j.map(ommToEntry); }
      return [ommToEntry(j)];
    }
    var lines = text.split(/\r?\n/).map(function (l) { return l.replace(/\s+$/, ''); }).filter(function (l) { return l.trim().length; });
    if (lines.length && /OBJECT_NAME|MEAN_MOTION/.test(lines[0]) && lines[0].indexOf(',') > 0) {
      var hdr = lines[0].split(',');
      return lines.slice(1).map(function (l) {
        var vals = l.split(','), o = {};
        hdr.forEach(function (h, i) { o[h.trim()] = (vals[i] || '').trim(); });
        return ommToEntry(o);
      });
    }
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i][0] === '1' && lines[i + 1] && lines[i + 1][0] === '2') {
        var name = (i > 0 && lines[i - 1][0] !== '1' && lines[i - 1][0] !== '2') ? lines[i - 1].replace(/^0 /, '').trim() : '';
        out.push(tleToEntry(lines[i], lines[i + 1], name));
        i++;
      }
    }
    if (!out.length) throw new Error('No se reconoce el formato (TLE de 2/3 líneas u OMM JSON/CSV)');
    return out;
  }
  function tleToEntry(l1, l2, name) {
    var s = sat.twoline2satrec(l1.trim(), l2.trim());
    if (!s || s.error) throw new Error('TLE inválido (error ' + (s && s.error) + ')');
    var epoch = new Date((s.jdsatepoch - 2440587.5) * 86400000 + (s.jdsatepochF || 0) * 86400000);
    return { satrec: s, name: name || ('NORAD ' + s.satnum), catnr: String(s.satnum).trim(), epoch: epoch,
      intdes: l1.substring(9, 17).trim(), kind: 'TLE', rev0: parseInt(l2.substring(63, 68), 10) || null };
  }
  function ommToEntry(o) {
    ['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY'].forEach(function (k) {
      if (o[k] === undefined || o[k] === '') throw new Error('Falta ' + k + ' en OMM');
    });
    var oo = Object.assign({ BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0, NORAD_CAT_ID: 0 }, o);
    var s = sat.json2satrec(oo);
    if (!s || s.error) throw new Error('OMM inválido (error ' + (s && s.error) + ')');
    var ep = String(o.EPOCH); var epoch = new Date(/Z$|[+-]\d\d:?\d\d$/.test(ep) ? ep : ep + 'Z');
    return { satrec: s, name: o.OBJECT_NAME || ('NORAD ' + o.NORAD_CAT_ID), catnr: String(o.NORAD_CAT_ID), epoch: epoch,
      intdes: o.OBJECT_ID || '', kind: 'OMM', rev0: o.REV_AT_EPOCH !== undefined ? Number(o.REV_AT_EPOCH) : null };
  }

  /* ---------- Trayectoria estimada (sintética) ---------- */
  /*
   * Construye elementos medios SGP4 para una órbita casi circular cuya traza terrestre
   * pasa por el sitio de lanzamiento (dirección de lanzamiento: 'descending' = hacia el SE,
   * 'ascending' = hacia el NE) y cuyo punto subsatélite coincide con el punto estimado de SECO
   * (a secoDownrangeKm del sitio) en T+secoS.
   */
  function buildSynthetic(opt) {
    var liftoff = opt.liftoff, inc = opt.incDeg, alt = opt.altKm;
    var lat0 = opt.siteLat, lon0 = opt.siteLon;
    var desc = (opt.direction || 'descending') === 'descending';
    var Ts = opt.secoS, D = opt.secoDownrangeKm;
    var warn = [];
    if (inc < Math.abs(lat0) + 0.3) { warn.push('Inclinación menor que la latitud del sitio; se ajustó a ' + (Math.abs(lat0) + 0.3).toFixed(1) + '°'); inc = Math.abs(lat0) + 0.3; }
    var a = RE + alt;
    var nRevDay = 86400 / (2 * Math.PI * Math.sqrt(a * a * a / MU));

    function makeOmm(epoch, nodeDeg, uDeg, n) {
      return { OBJECT_NAME: 'TRAYECTORIA ESTIMADA', OBJECT_ID: 'SINTETICA', NORAD_CAT_ID: 0,
        EPOCH: epoch.toISOString().replace('Z', ''), MEAN_MOTION: n, ECCENTRICITY: 0.0001,
        INCLINATION: inc, RA_OF_ASC_NODE: wrap360(nodeDeg), ARG_OF_PERICENTER: 0, MEAN_ANOMALY: wrap360(uDeg),
        BSTAR: 0, MEAN_MOTION_DOT: 0, MEAN_MOTION_DDOT: 0, REV_AT_EPOCH: 0 };
    }
    // Resuelve (nodo, u) para que el punto subsatélite en 'epoch' sea (lat0, lon0) en el paso indicado
    function solveAt(epoch, n) {
      var si = Math.sin(inc * D2R), ci = Math.cos(inc * D2R);
      var tgtLat = lat0, tgtLon = lon0;
      var u, node;
      for (var it = 0; it < 6; it++) {
        var x = clamp(Math.sin(tgtLat * D2R) / si, -1, 1);
        u = desc ? Math.PI - Math.asin(x) : Math.asin(x);
        var ra = Math.atan2(ci * Math.sin(u), Math.cos(u));
        var gmst = sat.gstime(epoch);
        node = (tgtLon * D2R + gmst - ra) * R2D;
        var s = sat.json2satrec(makeOmm(epoch, node, u * R2D, n));
        var g = propagateGeo(s, epoch);
        if (!g) break;
        var dLat = lat0 - g.lat, dLon = wrapLon(lon0 - g.lon);
        if (Math.abs(dLat) < 1e-5 && Math.abs(dLon) < 1e-5) break;
        tgtLat += dLat; tgtLon += dLon;
      }
      return { node: node, u: u * R2D };
    }
    // Ajuste de movimiento medio para que la altitud media geodésica ≈ alt
    var n = nRevDay, tStar = new Date(liftoff.getTime() + (Ts - D / 7.4) * 1000), sol, satrec;
    for (var k = 0; k < 5; k++) {
      sol = solveAt(tStar, n);
      satrec = sat.json2satrec(makeOmm(tStar, sol.node, sol.u, n));
      // altitud media en una órbita
      var P = periodMin(satrec), sum = 0, cnt = 0;
      for (var m = 0; m < P; m += P / 60) { var g = propagateGeo(satrec, new Date(tStar.getTime() + m * 60000)); if (g) { sum += g.alt; cnt++; } }
      var meanAlt = sum / cnt;
      // distancia sobre la traza desde el sitio hasta el punto en T+Ts
      var tSeco = new Date(liftoff.getTime() + Ts * 1000);
      var dist = trackDistance(satrec, tStar, tSeco);
      var vg = dist / ((tSeco - tStar) / 1000);
      var dt = (dist - D) / vg; // s
      tStar = new Date(tStar.getTime() + dt * 1000);
      var aNew = Math.pow(MU / Math.pow(2 * Math.PI * n / 86400, 2), 1 / 3) + (alt - meanAlt);
      n = 86400 / (2 * Math.PI * Math.sqrt(aNew * aNew * aNew / MU));
      if (Math.abs(dt) < 0.05 && Math.abs(alt - meanAlt) < 0.2) break;
    }
    sol = solveAt(tStar, n);
    var omm = makeOmm(tStar, sol.node, sol.u, n);
    satrec = sat.json2satrec(omm);
    return { satrec: satrec, omm: omm, tStar: tStar, inc: inc, warnings: warn,
      periodMin: periodMin(satrec) };
  }
  function trackDistance(satrec, t0, t1) {
    var steps = 40, d = 0, prev = propagateGeo(satrec, t0);
    for (var i = 1; i <= steps; i++) {
      var g = propagateGeo(satrec, new Date(t0.getTime() + (t1 - t0) * i / steps));
      d += gcDist(prev.lat, prev.lon, g.lat, g.lon); prev = g;
    }
    return d;
  }

  /* Modelo de ascenso (estimado): distancia sobre la traza, altitud y velocidad vs tiempo */
  function ascentModel(t, p) {
    // p: {secoS, secoDownrangeKm, secoAltKm, secoSpeed, stageS, stageDownrangeKm, stageAltKm, stageSpeed}
    var Ts = p.secoS, D = p.secoDownrangeKm, t1 = p.stageS, s1 = p.stageDownrangeKm;
    var s, h, v;
    if (t <= t1) {
      var x = t / t1;
      s = s1 * Math.pow(x, 2.5);
      h = p.stageAltKm * Math.pow(x, 1.6);
      v = p.stageSpeed * Math.pow(x, 1.3);
    } else {
      var u = (t - t1) / (Ts - t1), dT = Ts - t1;
      // velocidad horizontal cuadrática: v(0)=vs1, v(1)=vT, media=(D-s1)/dT
      var v0 = 2.5 * s1 / t1, v1 = p.secoGroundSpeed, mean = (D - s1) / dT;
      var b = 6 * (mean - v0) - 2 * (v1 - v0), c = (v1 - v0) - b;
      s = s1 + dT * (v0 * u + b * u * u / 2 + c * u * u * u / 3);
      h = p.stageAltKm + (p.secoAltKm - p.stageAltKm) * (1 - Math.pow(1 - u, 1.8));
      v = p.stageSpeed + (p.secoSpeed - p.stageSpeed) * Math.pow(u, 1.15);
    }
    return { s: clamp(s, 0, D), alt: Math.max(0, h), speed: Math.max(0, v) };
  }

  root.OrbitCore = {
    RE: RE, MU: MU, D2R: D2R, R2D: R2D,
    wrapLon: wrapLon, clamp: clamp, ease: ease, gcDist: gcDist,
    propagateGeo: propagateGeo, periodMin: periodMin,
    parseElements: parseElements, buildSynthetic: buildSynthetic, ascentModel: ascentModel
  };
})(typeof window !== 'undefined' ? window : globalThis);