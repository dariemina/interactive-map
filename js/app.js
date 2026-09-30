/*
 * Rastreador orbital · Explorando el Espacio
 * Mapa equirectangular + terminador día/noche + traza SGP4 (satellite.js)
 * Modos: TRAYECTORIA ESTIMADA (elementos sintéticos) y DATOS ORBITALES OFICIALES (TLE/OMM)
 */
(function () {
  'use strict';
  var C = window.OrbitCore, S = window.satellite;
  var W = 1440, H = 720;
  var LS_SETTINGS = 'eeTracker.settings.v1';

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  function group(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  // Formato español: coma decimal, punto de miles
  function fmt(x, dec) {
    if (x === null || x === undefined || isNaN(x)) return '--';
    var neg = x < 0; var s = Math.abs(x).toFixed(dec || 0); var p = s.split('.');
    return (neg ? '−' : '') + group(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtLat(l) { return fmt(Math.abs(l), 2) + '° ' + (l >= 0 ? 'N' : 'S'); }
  function fmtLon(l) { return fmt(Math.abs(l), 2) + '° ' + (l >= 0 ? 'E' : 'O'); }
  function hms(sec) {
    sec = Math.floor(Math.abs(sec));
    var d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }
  function tplus(sec) { return (sec < 0 ? 'T-' : 'T+') + hms(sec); }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function parseDate(s) {
    if (!s) return null; s = String(s).trim();
    if (/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s)) s += 'Z'; // sin zona => UTC
    var d = new Date(s); return isNaN(d) ? null : d;
  }
  // Parámetros de URL conservando '+' (TLE y "T+30m" lo necesitan)
  function rawParams() {
    var out = {}, q = location.search.replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (kv) {
      if (!kv) return; var i = kv.indexOf('='); var k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '1' : kv.slice(i + 1);
      try { out[decodeURIComponent(k).toLowerCase()] = decodeURIComponent(v); } catch (e) { out[k.toLowerCase()] = v; }
    });
    return out;
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }

  /* ------------------------------------------------------------------ */
  /* Configuración efectiva: config.js < ajustes guardados < URL          */
  /* ------------------------------------------------------------------ */
  var P = rawParams();
  var BASE = deepCopy(window.TRACKER_CONFIG || {});
  var cfg;
  function buildConfig() {
    cfg = deepCopy(BASE);
    cfg.official = cfg.official || {};
    cfg.official.tleText = [cfg.official.tle1, cfg.official.tle2].filter(Boolean).join('\n');
    var st = P.nocache ? null : lsGet(LS_SETTINGS);
    if (st) {
      ['mode', 'liftoff', 'missionName', 'inclination', 'altitude'].forEach(function (k) { if (st[k] !== undefined && st[k] !== '') cfg[k] = st[k]; });
      if (st.official) ['tleText', 'catnr', 'intdes', 'objectName', 'supplemental'].forEach(function (k) {
        if (st.official[k] !== undefined) cfg.official[k] = st.official[k];
      });
      cfg._fromStorage = true;
    }
    var m = P.mode || P.modo;
    if (m) cfg.mode = /^(off|ofi)/i.test(m) ? 'official' : 'estimated';
    if (P.liftoff || P.despegue || P.t0) cfg.liftoff = P.liftoff || P.despegue || P.t0;
    if (P.name || P.mision) cfg.missionName = P.name || P.mision;
    if (P.sub) cfg.missionSubtitle = P.sub;
    if (P.inc) cfg.inclination = parseFloat(String(P.inc).replace(',', '.'));
    if (P.alt) cfg.altitude = parseFloat(String(P.alt).replace(',', '.'));
    if (P.tle1 && P.tle2) { cfg.official.tleText = P.tle1 + '\n' + P.tle2; if (!m) cfg.mode = 'official'; }
    if (P.tle) { cfg.official.tleText = P.tle; if (!m) cfg.mode = 'official'; }
    if (P.catnr) { cfg.official.catnr = P.catnr; cfg.official.tleText = P.tle1 ? cfg.official.tleText : ''; if (!m) cfg.mode = 'official'; }
    if (P.intdes) { cfg.official.intdes = P.intdes; if (!m) cfg.mode = 'official'; }
    if (P.objname) { cfg.official.objectName = P.objname; if (!m) cfg.mode = 'official'; }
    if (P.sup) cfg.official.supplemental = P.sup !== '0';
    if (P.refresh) cfg.official.refreshMinutes = Math.max(30, parseFloat(P.refresh));
    if (P.transparent) cfg.transparent = P.transparent !== '0';
    if (P.timeline) cfg.showTimeline = P.timeline !== '0';
    cfg.liftoffDate = parseDate(cfg.liftoff) || new Date('2026-09-28T12:15:00Z');
  }

  /* ------------------------------------------------------------------ */
  /* Reloj (con simulación opcional ?simtime=...&rate=...)               */
  /* ------------------------------------------------------------------ */
  var sim = null;
  function setupSim() {
    var st = P.simtime || P.sim;
    if (!st) return;
    var base = null;
    var m = /^T\s*([+\- ])?\s*(.*)$/i.exec(st);
    if (m) { // relativo al despegue: T+30m, T-10m, T+01:30:00, T+5400
      var sign = m[1] === '-' ? -1 : 1, body = m[2].trim(), sec = 0;
      if (/^\d+:\d+(:\d+)?$/.test(body)) { var a = body.split(':').map(Number); sec = a.length === 3 ? a[0] * 3600 + a[1] * 60 + a[2] : a[0] * 60 + a[1]; }
      else { var re = /(\d+(?:\.\d+)?)\s*([dhms]?)/g, mm; while ((mm = re.exec(body))) { var v = parseFloat(mm[1]); sec += v * ({ d: 86400, h: 3600, m: 60, s: 1, '': 1 })[mm[2]]; } }
      sim = { rel: sign * sec };
    } else { base = parseDate(st); if (base) sim = { abs: base }; }
    if (sim) { sim.rate = parseFloat(P.rate || '1') || 1; sim.real0 = Date.now(); }
  }
  function now() {
    if (!sim) return new Date();
    var base = sim.abs ? sim.abs.getTime() : cfg.liftoffDate.getTime() + sim.rel * 1000;
    return new Date(base + (Date.now() - sim.real0) * sim.rate);
  }

  /* ------------------------------------------------------------------ */
  /* Proveedores de posición                                             */
  /* ------------------------------------------------------------------ */
  function EstimatedProvider() {
    var L = cfg.liftoffDate, Ts = cfg.secoSeconds, D = cfg.secoDownrangeKm;
    var syn = C.buildSynthetic({ liftoff: L, incDeg: cfg.inclination, altKm: cfg.altitude, siteLat: cfg.launchSite.lat,
      siteLon: cfg.launchSite.lon, direction: cfg.launchDirection, secoS: Ts, secoDownrangeKm: D });
    var satrec = syn.satrec, Pmin = syn.periodMin;
    var asc = { secoS: Ts, secoDownrangeKm: D, secoAltKm: cfg.secoAltKm, secoSpeed: cfg.secoSpeed, secoGroundSpeed: 7.0,
      stageS: cfg.stageSeconds, stageDownrangeKm: cfg.stageDownrangeKm, stageAltKm: cfg.stageAltKm, stageSpeed: cfg.stageSpeed };
    var tIns = cfg.insertionEnd, tDeo = cfg.deorbitStart, tEnt = cfg.entryStart, tLand = cfg.landing;
    function at(s) { return C.propagateGeo(satrec, new Date(L.getTime() + s * 1000)); }
    // Reentrada: la posición avanza sobre la traza con desaceleración hasta el punto más cercano a la zona de amerizaje
    var entryDur = tLand - tEnt, virtDur = 0.62 * entryDur, best = null, sp = cfg.splashdown;
    if (sp) {
      for (var s = 0; s <= 2400; s += 10) {
        var g = at(tEnt + s); if (!g) continue;
        var d = C.gcDist(g.lat, g.lon, sp.lat, sp.lon);
        if (!best || d < best.d) best = { s: s, d: d };
      }
      if (best && best.d < 1500 && best.s > 60) virtDur = best.s;
    }
    function vShape(x) { return 1 / (1 + Math.exp((x - 0.6) / 0.08)); }
    var N = 200, cum = [0];
    for (var i = 1; i <= N; i++) cum[i] = cum[i - 1] + vShape((i - 0.5) / N);
    function F(x) { var k = Math.min(N - 1, Math.floor(x * N)); var f = x * N - k; return (cum[k] + (cum[k + 1] - cum[k]) * f) / cum[N]; }
    var gEnt = at(tEnt), vEnt = gEnt ? gEnt.speed : 7.6;

    this.kind = 'estimated';
    this.periodMin = Pmin;
    this.warnings = syn.warnings;
    this.inc = syn.inc;
    this.name = cfg.vehicleName || 'CREW DRAGON';
    this.stateAt = function (date) {
      var t = (date - L) / 1000, g;
      if (t < 0) return { lat: cfg.launchSite.lat, lon: cfg.launchSite.lon, alt: 0, speed: 0, t: t, pre: true };
      if (t < Ts) {
        var a = C.ascentModel(t, asc);
        var tv = syn.tStar.getTime() + (L.getTime() + Ts * 1000 - syn.tStar.getTime()) * (a.s / D);
        g = C.propagateGeo(satrec, new Date(tv));
        return { lat: g.lat, lon: g.lon, alt: a.alt, speed: a.speed, t: t };
      }
      if (t >= tLand) { g = at(tEnt + virtDur); return { lat: g.lat, lon: g.lon, alt: 0, speed: 0, t: t, landed: true }; }
      if (t >= tEnt) {
        var x = (t - tEnt) / entryDur;
        g = at(tEnt + virtDur * F(x));
        var v = vEnt * vShape(x); if (x > 0.985) v *= Math.max(0, (1 - x) / 0.015);
        return { lat: g.lat, lon: g.lon, alt: cfg.entryAltKm * Math.pow(1 - x, 0.9), speed: v, t: t };
      }
      g = C.propagateGeo(satrec, date);
      var alt = g.alt, spd = g.speed;
      if (t < tIns) { var e = C.ease((t - Ts) / (tIns - Ts)); alt = cfg.secoAltKm + (g.alt - cfg.secoAltKm) * e; spd = cfg.secoSpeed + (g.speed - cfg.secoSpeed) * e; }
      else if (t >= tDeo) { var e2 = C.ease((t - tDeo) / (tEnt - tDeo)); alt = g.alt + (cfg.entryAltKm - g.alt) * e2; spd = g.speed + (vEnt - g.speed) * e2 * 0.2; }
      return { lat: g.lat, lon: g.lon, alt: alt, speed: spd, t: t };
    };
    this.trackRange = function (date) {
      var t = (date - L) / 1000, Ps = Pmin * 60;
      if (t < 0) return [0, Math.min(tLand, (cfg.futureOrbits + 0.5) * Ps), 0];
      var t0 = Math.max(0, t - cfg.pastOrbits * Ps), t1 = Math.min(tLand, t + cfg.futureOrbits * Ps);
      if (t >= tLand) { t0 = Math.max(0, tDeo - 1800); t1 = tLand; t = tLand; }
      return [t0, t1, t];
    };
    this.sampleTime = function (s) { return new Date(L.getTime() + s * 1000); };
    this.orbitLabel = function (date) {
      var t = (date - L) / 1000;
      if (t < 0) return '—';
      if (t < Ts) return 'Ascenso';
      if (t < tIns) return 'Suborbital';
      var n = Math.floor(Math.min(t, tDeo) / (Pmin * 60)) + 1;
      return String(n);
    };
    this.sourceHtml = function () {
      return '<b>Trayectoria estimada · no oficial.</b> Elementos sintéticos SGP4: i = ' + fmt(syn.inc, 1) + '°, ' + fmt(cfg.altitude, 0) +
        ' km circular, desde ' + cfg.launchSite.name + ' con despegue ' + L.toISOString().slice(11, 19) + ' UTC. Parámetros: SpaceX (275 km) y NASASpaceflight (32°).';
    };
  }

  function OfficialProvider(entry, origin) {
    var satrec = entry.satrec, Pmin = C.periodMin(satrec), L = cfg.liftoffDate;
    this.kind = 'official';
    this.entry = entry;
    this.periodMin = Pmin;
    this.name = entry.name;
    this.stateAt = function (date) {
      var g = C.propagateGeo(satrec, date);
      if (!g) return null;
      g.t = (date - L) / 1000; return g;
    };
    function missionActive(date) { var t = (date - L) / 1000; return t >= 0 && t < 3 * 86400; }
    this.trackRange = function (date) {
      var Ps = Pmin * 60, t = (date - L) / 1000;
      var t0 = t - cfg.pastOrbits * Ps; if (missionActive(date)) t0 = Math.max(0, t0);
      return [t0, t + cfg.futureOrbits * Ps, t];
    };
    this.sampleTime = function (s) { return new Date(L.getTime() + s * 1000); };
    this.orbitLabel = function (date) {
      if (missionActive(date)) return String(Math.floor((date - L) / 60000 / Pmin) + 1);
      if (entry.rev0 !== null && !isNaN(entry.rev0)) return 'nº ' + group(String(Math.floor(entry.rev0 + (date - entry.epoch) / 60000 / Pmin)));
      return '—';
    };
    this.sourceHtml = function (date) {
      var ageH = (date - entry.epoch) / 3600000;
      var age = Math.abs(ageH) < 48 ? fmt(ageH, 1) + ' h' : fmt(ageH / 24, 1) + ' días';
      return '<b>' + origin + '</b> · ' + escapeHtml(entry.name) + (entry.catnr && entry.catnr !== '0' && !/^NORAD /.test(entry.name) ? ' (NORAD ' + escapeHtml(entry.catnr) + ')' : '') +
        (entry.intdes ? ' · ' + escapeHtml(entry.intdes) : '') + '<br>Época ' + entry.epoch.toISOString().slice(0, 16).replace('T', ' ') +
        ' UTC (hace ' + age + ') · SGP4';
    };
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ------------------------------------------------------------------ */
  /* Datos oficiales: TLE pegado / URL / descarga de CelesTrak            */
  /* ------------------------------------------------------------------ */
  var official = { provider: null, status: '', error: '', timer: null, lastQuery: null };
  function officialQuery() {
    var o = cfg.official;
    if (o.catnr) return { k: 'CATNR', v: String(o.catnr).trim(), sup: !!o.supplemental };
    if (o.intdes) return { k: 'INTDES', v: String(o.intdes).trim(), sup: !!o.supplemental };
    if (o.objectName) return { k: 'NAME', v: String(o.objectName).trim(), sup: !!o.supplemental };
    return null;
  }
  function pickEntry(list) {
    var byName = list.filter(function (e) { return /STARSHIP/i.test(e.name); });
    if (byName.length) return byName[0];
    var pieceA = list.filter(function (e) { return /-\d{3}A$/.test(e.intdes); });
    return pieceA[0] || list[0];
  }
  function setOfficialFromText(text, origin) {
    var list = C.parseElements(text);
    var e = pickEntry(list);
    official.provider = new OfficialProvider(e, origin);
    official.error = '';
    return e;
  }
  function initOfficial(force) {
    clearTimeout(official.timer);
    official.provider = null; official.error = '';
    if (cfg.mode !== 'official') return Promise.resolve();
    var txt = (cfg.official.tleText || '').trim();
    if (txt) {
      try { setOfficialFromText(txt, 'TLE/OMM introducido manualmente'); }
      catch (e) { official.error = 'Elementos oficiales inválidos: ' + e.message; }
      return Promise.resolve();
    }
    var q = officialQuery();
    if (!q) { official.error = 'Modo oficial sin datos: pega un TLE o indica un número NORAD (CATNR).'; return Promise.resolve(); }
    return fetchOfficial(q, force);
  }
  function fetchOfficial(q, force) {
    var key = 'eeTracker.gp.' + q.k + '=' + q.v + (q.sup ? '.sup' : '');
    var refreshMs = Math.max(30, cfg.official.refreshMinutes || 120) * 60000;
    var label = 'CelesTrak ' + (q.sup ? 'SupGP' : 'GP') + ' (' + q.k + '=' + q.v + ')';
    var cached = lsGet(key);
    if (cached && cached.text) {
      try { setOfficialFromText(cached.text, label); } catch (e) { cached = null; }
    }
    if (!force && cached && Date.now() - cached.at < refreshMs) {
      schedule(refreshMs - (Date.now() - cached.at) + 5000);
      return Promise.resolve();
    }
    var url = (cfg.official.celestrakBase || 'https://celestrak.org') + (q.sup ? '/NORAD/elements/supplemental/sup-gp.php' : '/NORAD/elements/gp.php') +
      '?' + q.k + '=' + encodeURIComponent(q.v) + '&FORMAT=JSON';
    var ctrl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    official.status = 'Descargando ' + label + '…';
    return fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.text().then(function (t) { if (!r.ok) throw new Error('HTTP ' + r.status); return t; }); })
      .then(function (text) {
        clearTimeout(to);
        var t = text.trim();
        if (t[0] !== '[' && t[0] !== '{') throw new Error(t.slice(0, 100) || 'respuesta vacía');
        var e = setOfficialFromText(t, label);
        lsSet(key, { at: Date.now(), text: t });
        official.status = 'Datos descargados: ' + e.name;
        schedule(refreshMs);
        fullRedraw();
      })
      .catch(function (err) {
        clearTimeout(to);
        var msg = (err && err.name === 'AbortError') ? 'tiempo de espera agotado' : (err && err.message) || String(err);
        official.error = official.provider ? '' : 'No se pudieron obtener datos oficiales (' + msg + ').';
        official.status = 'Error de descarga: ' + msg + (official.provider ? ' · usando últimos datos guardados' : '');
        schedule(15 * 60000);
        fullRedraw();
      });
  }
  function schedule(ms) { clearTimeout(official.timer); official.timer = setTimeout(function () { var q = officialQuery(); if (q && cfg.mode === 'official' && !(cfg.official.tleText || '').trim()) fetchOfficial(q, true); }, ms); }

  /* ------------------------------------------------------------------ */
  /* Proveedor activo                                                     */
  /* ------------------------------------------------------------------ */
  var estimated = null;
  function activeProvider() {
    if (cfg.mode === 'official' && official.provider) return official.provider;
    return estimated;
  }

  /* ------------------------------------------------------------------ */
  /* Geografía: ¿sobre qué país u océano?                                */
  /* ------------------------------------------------------------------ */
  var GEO = window.GEO_DATA || { countries: [], marine: [] };
  function prepGeo(list) {
    list.forEach(function (f) {
      f.bb = f.g.map(function (poly) {
        var r = poly[0], a = [180, 90, -180, -90];
        r.forEach(function (p) { a[0] = Math.min(a[0], p[0]); a[1] = Math.min(a[1], p[1]); a[2] = Math.max(a[2], p[0]); a[3] = Math.max(a[3], p[1]); });
        return a;
      });
    });
  }
  prepGeo(GEO.countries); prepGeo(GEO.marine);
  function inRing(x, y, r) {
    var inside = false;
    for (var i = 0, j = r.length - 1; i < r.length; j = i++) {
      var xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inFeature(f, lon, lat) {
    for (var k = 0; k < f.g.length; k++) {
      var b = f.bb[k]; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      var poly = f.g[k]; if (!inRing(lon, lat, poly[0])) continue;
      var hole = false; for (var h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break; }
      if (!hole) return true;
    }
    return false;
  }
  function whereIs(lat, lon) {
    for (var i = 0; i < GEO.countries.length; i++) if (inFeature(GEO.countries[i], lon, lat)) return GEO.countries[i].n;
    for (var j = 0; j < GEO.marine.length; j++) if (inFeature(GEO.marine[j], lon, lat)) return GEO.marine[j].n;
    if (lat < -60) return 'Océano Antártico';
    if (lat > 66) return 'Océano Ártico';
    if (lon >= 20 && lon < 120 && lat < 30) return 'Océano Índico';
    if (lon >= 120 && lon < 147 && lat < -10 && lat > -45) return 'Océano Índico';
    if ((lon >= -70 && lon < 20 && lat < 10) || (lon >= -100 && lon < 0 && lat >= 10)) return 'Océano Atlántico';
    return 'Océano Pacífico';
  }

  /* ------------------------------------------------------------------ */
  /* Sol y terminador                                                    */
  /* ------------------------------------------------------------------ */
  function sunSub(date) {
    var jd = date.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0, d2r = Math.PI / 180;
    var Lm = (280.460 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * d2r;
    var lam = (Lm + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * d2r, eps = (23.439 - 0.0000004 * n) * d2r;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    var lon = (ra - S.gstime(date)) / d2r;
    return { lat: dec / d2r, lon: C.wrapLon(lon) };
  }

  /* ------------------------------------------------------------------ */
  /* Dibujo                                                              */
  /* ------------------------------------------------------------------ */
  var imgDay = new Image(), imgNight = new Image(), imgsReady = 0;
  var baseCtx, trackCtx, maskCanvas, nightCanvas;
  function X(lon) { return (lon + 180) / 360 * W; }
  function Y(lat) { return (90 - lat) / 180 * H; }

  function drawBase() {
    var ctx = baseCtx, date = now();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1016'; ctx.fillRect(0, 0, W, H);
    if (imgDay.complete && imgDay.naturalWidth) ctx.drawImage(imgDay, 0, 0, W, H);
    // Máscara de noche (360x180, suavizada al escalar)
    var sun = sunSub(date), mw = 360, mh = 180, mctx = maskCanvas.getContext('2d');
    var id = mctx.createImageData(mw, mh), d = id.data, d2r = Math.PI / 180;
    var sd = Math.sin(sun.lat * d2r), cd = Math.cos(sun.lat * d2r);
    for (var j = 0; j < mh; j++) {
      var lat = (90 - (j + 0.5) * 180 / mh) * d2r, sl = Math.sin(lat), cl = Math.cos(lat);
      for (var i = 0; i < mw; i++) {
        var lon = (-180 + (i + 0.5) * 360 / mw) * d2r;
        var el = Math.asin(sl * sd + cl * cd * Math.cos(lon - sun.lon * d2r)) / d2r;
        var a = C.clamp((0.8 - el) / 12.8, 0, 1); a = a * a * (3 - 2 * a);
        var k = (j * mw + i) * 4; d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = Math.round(a * 235);
      }
    }
    mctx.putImageData(id, 0, 0);
    var nctx = nightCanvas.getContext('2d');
    nctx.globalCompositeOperation = 'source-over';
    nctx.clearRect(0, 0, W, H);
    nctx.fillStyle = '#04060b'; nctx.fillRect(0, 0, W, H);
    if (imgNight.complete && imgNight.naturalWidth) { nctx.globalAlpha = 0.95; nctx.drawImage(imgNight, 0, 0, W, H); nctx.globalAlpha = 1; }
    nctx.globalCompositeOperation = 'destination-in';
    nctx.imageSmoothingEnabled = true; nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(maskCanvas, 0, 0, W, H);
    ctx.drawImage(nightCanvas, 0, 0);
    // Retícula
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    for (var lo = -150; lo <= 150; lo += 30) { ctx.beginPath(); ctx.moveTo(X(lo) + .5, 0); ctx.lineTo(X(lo) + .5, H); ctx.stroke(); }
    for (var la = -60; la <= 60; la += 30) { ctx.beginPath(); ctx.moveTo(0, Y(la) + .5); ctx.lineTo(W, Y(la) + .5); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'; ctx.beginPath(); ctx.moveTo(0, Y(0) + .5); ctx.lineTo(W, Y(0) + .5); ctx.stroke();
    // Fronteras
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8;
    GEO.countries.forEach(function (f) {
      f.g.forEach(function (poly) {
        var r = poly[0]; ctx.beginPath();
        for (var q = 0; q < r.length; q++) { var x = X(r[q][0]), y = Y(r[q][1]); if (q === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke();
      });
    });
    // Línea del terminador
    ctx.strokeStyle = 'rgba(245,166,35,0.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([2, 5]); ctx.beginPath();
    var tanDec = Math.tan(sun.lat * d2r); if (Math.abs(tanDec) < 1e-6) tanDec = 1e-6;
    for (var lx = -180; lx <= 180; lx += 1) {
      var tl = Math.atan(-Math.cos((lx - sun.lon) * d2r) / tanDec) / d2r;
      if (lx === -180) ctx.moveTo(X(lx), Y(tl)); else ctx.lineTo(X(lx), Y(tl));
    }
    ctx.stroke(); ctx.setLineDash([]);
    // Sol
    var sx = X(sun.lon), sy = Y(sun.lat);
    var grd = ctx.createRadialGradient(sx, sy, 2, sx, sy, 26);
    grd.addColorStop(0, 'rgba(255,230,150,0.95)'); grd.addColorStop(0.35, 'rgba(245,166,35,0.55)'); grd.addColorStop(1, 'rgba(245,166,35,0)');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx, sy, 26, 0, 2 * Math.PI); ctx.fill();
    // Zona de peligro / amerizaje
    if (cfg.hazardArea && cfg.hazardArea.points) {
      var pts = cfg.hazardArea.points;
      ctx.beginPath();
      pts.forEach(function (p, idx) { var x = X(p[1]), y = Y(p[0]); if (idx === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,166,35,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,210,122,0.95)'; ctx.lineWidth = 2; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawTrack() {
    var ctx = trackCtx, prov = activeProvider();
    ctx.clearRect(0, 0, W, H);
    if (!prov) return;
    var date = now(), r = prov.trackRange(date), t0 = r[0], t1 = r[1], tc = r[2];
    function sample(a, b, step) {
      var out = [];
      if (b <= a) return out;
      for (var s = a; s < b; s += step) { var st = prov.stateAt(prov.sampleTime(s)); if (st) out.push([st.lon, st.lat, s]); }
      var e = prov.stateAt(prov.sampleTime(b)); if (e) out.push([e.lon, e.lat, b]);
      return out;
    }
    // paso más fino durante el ascenso
    function sampleSmart(a, b) {
      if (prov.kind === 'estimated' && a < cfg.secoSeconds && b > 0) {
        var mid = Math.min(b, cfg.secoSeconds);
        return sample(Math.max(0, a), mid, 5).concat(sample(mid, b, 20).slice(1));
      }
      return sample(a, b, 20);
    }
    var past = sampleSmart(t0, tc), fut = sampleSmart(tc, t1);
    strokePath(ctx, fut, 'rgba(0,0,0,0.55)', 6, [12, 10]);
    strokePath(ctx, fut, '#f5a623', 3, [12, 10]);
    strokePath(ctx, past, 'rgba(0,0,0,0.6)', 8, null);
    strokePath(ctx, past, '#f47320', 4.5, null);
  }
  function strokePath(ctx, pts, color, width, dash) {
    if (pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dl = b[0] - a[0];
      if (Math.abs(dl) > 180) { // cruce del antimeridiano: dibujar hasta el borde y continuar desde el otro lado
        var b2 = dl > 0 ? b[0] - 360 : b[0] + 360, edge = dl > 0 ? -180 : 180;
        var f = (edge - a[0]) / (b2 - a[0]), latE = a[1] + (b[1] - a[1]) * f;
        ctx.lineTo(X(edge), Y(latE)); ctx.moveTo(X(-edge), Y(latE));
      }
      ctx.lineTo(X(b[0]), Y(b[1]));
    }
    ctx.stroke(); ctx.restore();
  }

  function placeStaticMarkers() {
    var ov = $('map-overlay'); ov.innerHTML = '';
    var site = cfg.launchSite;
    var m1 = document.createElement('div'); m1.className = 'mk';
    m1.style.left = X(site.lon) + 'px'; m1.style.top = Y(site.lat) + 'px';
    m1.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 2 L20 19 L2 19 Z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>' +
      '<div class="mk-label" style="left:-12px;top:-34px;transform:translateX(-100%);text-align:right">' + escapeHtml(site.name) + '<small>' + escapeHtml(site.sub || '') + '</small></div>';
    ov.appendChild(m1);
    var sp = cfg.splashdown;
    if (sp) {
      var m2 = document.createElement('div'); m2.className = 'mk';
      m2.style.left = X(sp.lon) + 'px'; m2.style.top = Y(sp.lat) + 'px';
      m2.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="12" fill="none" stroke="#f5a623" stroke-width="3"/>' +
        '<circle cx="17" cy="17" r="4" fill="#f5a623"/><path d="M17 0v8M17 26v8M0 17h8M26 17h8" stroke="#f5a623" stroke-width="3"/></svg>' +
        '<div class="mk-label" id="splash-label" style="left:40px;top:6px;transition:opacity .4s">' + escapeHtml(sp.name) + '<small>' + escapeHtml(sp.sub || '') + '</small></div>';
      ov.appendChild(m2);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Cronograma                                                          */
  /* ------------------------------------------------------------------ */
  var keyEvents = [];
  function buildTimeline() {
    var tl = $('timeline'); tl.innerHTML = '';
    keyEvents = (cfg.timeline || []).filter(function (e) { return e.key; });
    var n = keyEvents.length; if (n < 2) return;
    tl.insertAdjacentHTML('beforeend', '<div class="tl-track"></div><div class="tl-fill" id="tl-fill" style="width:0"></div>');
    keyEvents.forEach(function (e, i) {
      var pct = i / (n - 1) * 100;
      var cls = i === 0 ? ' first' : (i === n - 1 ? ' last' : '');
      tl.insertAdjacentHTML('beforeend', '<div class="tl-node" id="tln' + i + '" style="left:' + pct + '%"></div>' +
        '<div class="tl-name' + cls + '" id="tlt' + i + '" style="left:' + pct + '%">' + escapeHtml(e.short || e.t) + '<small>' + tplus(e.s).replace('T+00:', 'T+') + '</small></div>');
    });
  }
  function updateTimeline(t) {
    var n = keyEvents.length; if (n < 2) return;
    var pos = 0;
    if (t >= keyEvents[n - 1].s) pos = n - 1;
    else if (t > 0) for (var i = 0; i < n - 1; i++) if (t >= keyEvents[i].s && t < keyEvents[i + 1].s) { pos = i + (t - keyEvents[i].s) / (keyEvents[i + 1].s - keyEvents[i].s); break; }
    $('tl-fill').style.width = (pos / (n - 1) * 100) + '%';
    keyEvents.forEach(function (e, i) {
      var done = t >= e.s;
      $('tln' + i).className = 'tl-node' + (done ? ' done' : '') + (done && (i === n - 1 || t < keyEvents[i + 1].s) ? ' cur' : '');
      $('tlt' + i).classList.toggle('done', done);
    });
    var next = null;
    for (var k = 0; k < cfg.timeline.length; k++) if (cfg.timeline[k].s > t) { next = cfg.timeline[k]; break; }
    if (next) { $('next-name').textContent = next.t + ' · ' + tplus(next.s); $('next-time').textContent = 'en ' + hms(next.s - t); }
    else { $('next-name').textContent = 'Misión completada según el plan'; $('next-time').textContent = ''; }
  }
  function phaseName(t) {
    if (t < 0) return 'CUENTA REGRESIVA';
    if (t < 142) return 'ASCENSO · SUPER HEAVY';
    if (t < cfg.secoSeconds) return 'ASCENSO · NAVE';
    if (t < cfg.insertionStart) return 'COSTA SUBORBITAL · EVALUACIÓN';
    if (t < cfg.insertionEnd) return 'ENCENDIDO DE INSERCIÓN ORBITAL';
    if (t < 2047) return 'EN ÓRBITA';
    if (t < 3879) return 'EN ÓRBITA · DESPLIEGUE STARLINK';
    if (t < cfg.deorbitStart) return 'EN ÓRBITA · CRUCERO';
    if (t < cfg.deorbitStart + 11) return 'ENCENDIDO DE DESÓRBITA';
    if (t < cfg.entryStart) return 'DESCENSO TRAS LA DESÓRBITA';
    if (t < 35411) return 'REENTRADA';
    if (t < cfg.landing) return 'ATERRIZAJE';
    return 'AMERIZAJE · FIN DE MISIÓN';
  }

  /* ------------------------------------------------------------------ */
  /* Actualización de pantalla                                           */
  /* ------------------------------------------------------------------ */
  var lastSec = null, lastTrack = 0, lastBase = 0, lastMode = null;
  function updateUI(force) {
    var date = now(), sec = Math.floor(date.getTime() / 1000);
    var prov = activeProvider();
    var isOff = prov && prov.kind === 'official';
    // Posición del vehículo (4 Hz)
    var st = prov ? prov.stateAt(date) : null;
    var veh = $('vehicle');
    if (st) {
      veh.style.display = '';
      veh.style.transform = 'translate(' + X(st.lon).toFixed(1) + 'px,' + Y(st.lat).toFixed(1) + 'px)';
      veh.classList.toggle('flip', X(st.lon) > W - 240);
      var spl = document.getElementById('splash-label');
      if (spl && cfg.splashdown) { var dx = X(st.lon) - X(cfg.splashdown.lon), dy = Y(st.lat) - Y(cfg.splashdown.lat); spl.style.opacity = (dx * dx + dy * dy < 200 * 200) ? '0' : '1'; }
    } else veh.style.display = 'none';
    if (!force && sec === lastSec) return;
    lastSec = sec;
    var t = (date - cfg.liftoffDate) / 1000;
    // Modo
    var modeKey = isOff ? 'off' : 'est';
    if (modeKey !== lastMode) {
      lastMode = modeKey;
      $('mode-badge').className = isOff ? 'mode-off' : 'mode-est';
      $('mode-title').textContent = isOff ? 'DATOS ORBITALES OFICIALES' : 'TRAYECTORIA ESTIMADA';
      $('vlabel').textContent = prov.name || cfg.vehicleName || 'CREW DRAGON';
    }
    $('mode-sub').textContent = isOff ? ('Elementos orbitales reales · ' + prov.name) : 'No oficial · según parámetros anunciados';
    // Reloj
    var met = $('met');
    met.textContent = tplus(t); met.classList.toggle('pre', t < 0);
    // Ajusta automáticamente el reloj para que nunca desborde el panel.
    met.style.fontSize = '42px';
    var metMax = met.parentElement ? met.parentElement.clientWidth : 360;
    var metSize = 42;
    while (met.scrollWidth > metMax && metSize > 28) {
      metSize -= 1;
      met.style.fontSize = metSize + 'px';
    }
    $('utc').textContent = pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
    $('date').textContent = date.getUTCDate() + ' ' + MESES[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
    $('phase').textContent = phaseName(t);
    if (st) {
      $('lat').textContent = fmtLat(st.lat);
      $('lon').textContent = fmtLon(st.lon);
      $('alt').textContent = fmt(st.alt, 0);
      $('spd-kms').textContent = fmt(st.speed, 2);
      $('spd-kmh').textContent = fmt(Math.round(st.speed * 3600 / 10) * 10, 0);
      $('over').textContent = (st.pre && !isOff) ? (cfg.launchSite.name + ' · Texas') : whereIs(st.lat, st.lon);
    } else {
      ['lat', 'lon', 'alt', 'spd-kms', 'spd-kmh', 'over'].forEach(function (k) { $(k).textContent = '--'; });
    }
    $('orbit').textContent = prov ? prov.orbitLabel(date) : '--';
    $('period').textContent = prov ? fmt(prov.periodMin, 1) + ' min' : '--';
    $('source').innerHTML = prov ? prov.sourceHtml(date) : '--';
    if (cfg.showTimeline) updateTimeline(t);
    // Avisos
    var notes = [], cls = '';
    if (sim) notes.push('SIMULACIÓN · reloj ' + (sim.abs ? 'fijado' : tplus(sim.rel)) + (sim.rate !== 1 ? ' ×' + sim.rate : '') + ' (quita ?simtime de la URL para el directo)');
    if (cfg.mode === 'official' && !official.provider) notes.push((official.error || 'Esperando datos oficiales…') + ' Mostrando trayectoria estimada.');
    if (isOff) {
      var ageH = (date - prov.entry.epoch) / 3600000;
      if (Math.abs(ageH) > 24) notes.push('Datos oficiales con ' + fmt(ageH, 0) + ' h de antigüedad: la posición puede ser imprecisa.');
      if (t > cfg.deorbitStart && t < 3 * 86400) notes.push('Tras la desórbita los elementos orbitales ya no representan la trayectoria real.');
    }
    if (!isOff && estimated && estimated.warnings.length) notes = notes.concat(estimated.warnings);
    var nb = $('notice');
    if (notes.length) { nb.innerHTML = notes.map(escapeHtml).join('<br>'); nb.classList.remove('hidden'); nb.className = (cfg.mode === 'official' && !official.provider) ? '' : 'info'; }
    else nb.classList.add('hidden');
    // Redibujos periódicos
    var ms = Date.now();
    if (force || ms - lastTrack > 15000) { lastTrack = ms; drawTrack(); }
    if (force || ms - lastBase > 60000) { lastBase = ms; drawBase(); }
  }
  function fullRedraw() { lastMode = null; drawBase(); drawTrack(); updateUI(true); }

  /* ------------------------------------------------------------------ */
  /* Ajustes                                                             */
  /* ------------------------------------------------------------------ */
  function openSettings(show) {
    var el = $('settings');
    if (show === undefined) show = el.classList.contains('hidden');
    if (!show) { el.classList.add('hidden'); return; }
    $('set-mode').value = cfg.mode;
    $('set-liftoff').value = cfg.liftoffDate.toISOString().replace('.000Z', 'Z');
    $('set-name').value = cfg.missionName;
    $('set-inc').value = cfg.inclination; $('set-alt').value = cfg.altitude;
    $('set-tle').value = cfg.official.tleText || '';
    $('set-catnr').value = cfg.official.catnr || ''; $('set-intdes').value = cfg.official.intdes || '';
    $('set-objname').value = cfg.official.objectName || ''; $('set-sup').checked = !!cfg.official.supplemental;
    $('set-status').textContent = official.status || '';
    el.classList.remove('hidden');
  }
  function readSettingsForm() {
    return {
      mode: $('set-mode').value, liftoff: $('set-liftoff').value.trim(), missionName: $('set-name').value.trim(),
      inclination: parseFloat(String($('set-inc').value).replace(',', '.')), altitude: parseFloat(String($('set-alt').value).replace(',', '.')),
      official: { tleText: $('set-tle').value.trim(), catnr: $('set-catnr').value.trim(), intdes: $('set-intdes').value.trim(),
        objectName: $('set-objname').value.trim(), supplemental: $('set-sup').checked }
    };
  }
  function applySettings(fetchNow) {
    var s = readSettingsForm();
    if (!parseDate(s.liftoff)) { $('set-status').textContent = 'Hora de despegue no válida. Usa formato 2026-09-28T12:15:00Z'; return; }
    if (s.official.tleText) { try { C.parseElements(s.official.tleText); } catch (e) { $('set-status').textContent = 'TLE/OMM no válido: ' + e.message; return; } }
    lsSet(LS_SETTINGS, s);
    // Los parámetros de URL de estos campos dejarían de tener efecto visible: se ignoran tras guardar
    ['mode', 'modo', 'liftoff', 'despegue', 't0', 'name', 'mision', 'inc', 'alt', 'tle1', 'tle2', 'tle', 'catnr', 'intdes', 'objname', 'sup'].forEach(function (k) { delete P[k]; });
    init(!!fetchNow);
    $('set-status').textContent = 'Guardado. ' + (official.status || '');
  }
  function nudgeLiftoff(deltaSec, setNow) {
    var d = setNow ? new Date(Math.round(now().getTime() / 1000) * 1000) : new Date((parseDate($('set-liftoff').value) || cfg.liftoffDate).getTime() + deltaSec * 1000);
    $('set-liftoff').value = d.toISOString().replace('.000Z', 'Z');
    applySettings(false);
  }
  function bindSettings() {
    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { if (e.key === 'Escape') openSettings(false); return; }
      if (e.key === 's' || e.key === 'S') openSettings();
      if (e.key === 'Escape') openSettings(false);
    });
    $('hotspot').addEventListener('dblclick', function () { openSettings(); });
    $('btn-close').onclick = function () { openSettings(false); };
    $('btn-apply').onclick = function () { applySettings(true); };
    $('btn-fetch').onclick = function () { applySettings(true); };
    $('btn-reset').onclick = function () { lsDel(LS_SETTINGS); init(false); openSettings(true); $('set-status').textContent = 'Ajustes guardados borrados: se usa config.js (+ URL).'; };
    $('btn-now').onclick = function () { nudgeLiftoff(0, true); };
    $('btn-m1').onclick = function () { nudgeLiftoff(-60); };
    $('btn-p1').onclick = function () { nudgeLiftoff(60); };
    $('btn-p10').onclick = function () { nudgeLiftoff(600); };
  }

  /* ------------------------------------------------------------------ */
  /* Inicio                                                              */
  /* ------------------------------------------------------------------ */
  function fitStage() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var st = $('stage');
    if (Math.abs(s - 1) < 0.002) { st.style.transform = ''; st.style.left = '0px'; st.style.top = '0px'; return; }
    st.style.transform = 'scale(' + s + ')';
    st.style.left = ((window.innerWidth - 1920 * s) / 2) + 'px'; st.style.top = ((window.innerHeight - 1080 * s) / 2) + 'px';
  }
  function init(forceFetch) {
    buildConfig();
    document.body.classList.toggle('transparent', !!cfg.transparent);
    document.documentElement.classList.toggle('transparent', !!cfg.transparent);
    document.body.classList.toggle('no-timeline', !cfg.showTimeline);
    $('mission-name').textContent = cfg.missionName;
    $('mission-sub').textContent = cfg.missionSubtitle || '';
    $('wordmark').innerHTML = escapeHtml(cfg.wordmark || 'EXPLORANDO EL ESPACIO').replace(/^(\S+)\s+(.*)$/, '$1 <b>$2</b>');
    try { estimated = new EstimatedProvider(); }
    catch (e) { estimated = null; console.error(e); $('notice').textContent = 'Error en la trayectoria estimada: ' + e.message; $('notice').classList.remove('hidden'); }
    buildTimeline();
    placeStaticMarkers();
    var p = initOfficial(forceFetch);
    fullRedraw();
    return p;
  }
  function start() {
    baseCtx = $('map-base').getContext('2d');
    trackCtx = $('map-track').getContext('2d');
    maskCanvas = document.createElement('canvas'); maskCanvas.width = 360; maskCanvas.height = 180;
    nightCanvas = document.createElement('canvas'); nightCanvas.width = W; nightCanvas.height = H;
    if (P.settings) setTimeout(function () { openSettings(true); }, 300);
    setupSimLater = true;
    buildConfig(); setupSim();
    bindSettings();
    fitStage(); window.addEventListener('resize', fitStage);
    imgDay.onload = imgNight.onload = function () { imgsReady++; drawBase(); };
    imgDay.src = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg'; imgNight.src = 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg';
    var p = init(false);
    setInterval(function () { updateUI(false); }, 250);
    window.__tracker = { cfg: function () { return cfg; }, provider: activeProvider, now: now, ready: p, official: official };
  }
  var setupSimLater = false;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();