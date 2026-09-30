const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || '/data';
const CONFIG_FILE = path.join(DATA_DIR, 'tracker-config.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function ensureDataDir() { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {} }
function readConfig() { try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (_) { return {}; } }
function writeConfig(cfg) { ensureDataDir(); fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
function authorized(req) {
  const supplied = String(req.headers['x-admin-password'] || '');
  return !!ADMIN_PASSWORD && supplied === ADMIN_PASSWORD;
}
function readBody(req, cb) {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1048576) req.destroy(); });
  req.on('end', () => cb(body));
}
function handleConfig(req, res) {
  if (req.method === 'GET') return send(res, 200, JSON.stringify({config: readConfig()}), 'application/json; charset=utf-8');
  if (!authorized(req)) return send(res, 401, JSON.stringify({error:'No autorizado'}), 'application/json; charset=utf-8');
  if (req.method === 'DELETE') {
    try { fs.unlinkSync(CONFIG_FILE); } catch (_) {}
    return send(res, 200, JSON.stringify({ok:true,config:{}}), 'application/json; charset=utf-8');
  }
  if (req.method !== 'PUT') return send(res, 405, JSON.stringify({error:'Método no permitido'}), 'application/json; charset=utf-8');
  readBody(req, body => {
    try {
      const payload = JSON.parse(body || '{}');
      const cfg = payload.config || payload;
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Configuración inválida');
      writeConfig(cfg);
      send(res, 200, JSON.stringify({ok:true,config:cfg}), 'application/json; charset=utf-8');
    } catch (e) {
      send(res, 400, JSON.stringify({error:e.message}), 'application/json; charset=utf-8');
    }
  });
}

function proxyCelestrak(req, res, parsed) {
  const prefix = '/api/celestrak';
  const upstreamPath = parsed.pathname.slice(prefix.length) || '/';

  // Only proxy the CelesTrak endpoints used by this tracker.
  if (!upstreamPath.startsWith('/NORAD/elements/')) {
    return send(res, 403, 'Endpoint not allowed');
  }

  const options = {
    hostname: 'celestrak.org',
    port: 443,
    path: upstreamPath + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'ExplorandoElEspacio-StarshipTracker/1.0',
      'Accept': 'application/json,text/plain,*/*'
    }
  };

  const upstream = https.request(options, r => {
    const headers = {
      'Content-Type': r.headers['content-type'] || 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(r.statusCode || 502, headers);
    r.pipe(res);
  });

  upstream.setTimeout(15000, () => upstream.destroy(new Error('CelesTrak timeout')));
  upstream.on('error', err => send(res, 502, `CelesTrak proxy error: ${err.message}`));
  upstream.end();
}

function serveStatic(req, res, parsed) {
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const requested = path.normalize(path.join(ROOT, pathname));
  if (!requested.startsWith(ROOT)) return send(res, 403, 'Forbidden');

  fs.stat(requested, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    const ext = path.extname(requested).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || ext === '.js' ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(requested).pipe(res);
  });
}

http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (parsed.pathname === '/health') return send(res, 200, 'ok');
  if (parsed.pathname === '/api/config') return handleConfig(req, res);
  if (parsed.pathname.startsWith('/api/celestrak/')) return proxyCelestrak(req, res, parsed);
  return serveStatic(req, res, parsed);
}).listen(PORT, '0.0.0.0', () => {
  ensureDataDir();
  console.log(`Starship Tracker listening on port ${PORT}`);
});