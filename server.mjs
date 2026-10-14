import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const root = path.dirname(fileURLToPath(import.meta.url));
const data = process.env.DATA_DIR || path.join(root, '.data');
await mkdir(data, { recursive: true });
const db = new DatabaseSync(path.join(data, 'fleet.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, expires INTEGER);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, owner TEXT NOT NULL, created TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vehicles (plate TEXT PRIMARY KEY, kind TEXT NOT NULL);`);
let codes;
try { codes = JSON.parse(await readFile(path.join(data, 'access-codes.json'), 'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  codes = { driver: randomBytes(9).toString('base64url'), admin: randomBytes(12).toString('base64url') };
  await writeFile(path.join(data, 'access-codes.json'), JSON.stringify(codes, null, 2), { mode: 0o600 });
}
codes = { driver: process.env.DRIVER_ACCESS_CODE || codes.driver, admin: process.env.ADMIN_ACCESS_CODE || codes.admin };
if (codes.driver === codes.admin || Object.values(codes).some(code => typeof code !== 'string' || code.length < 8)) throw new Error('Codurile trebuie să fie diferite și să aibă minimum 8 caractere.');
const salt = randomBytes(16);
const hashes = Object.fromEntries(Object.entries(codes).map(([role, code]) => [role, scryptSync(code, salt, 32)]));
const loginAttempts = new Map();
const slots = ['cabina', 'bord', 'fata', 'spate', 'stanga', 'dreapta', 'remorcaExterior', 'remorcaInterior'];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const send = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
async function body(req) {
  let size = 0; const parts = [];
  for await (const chunk of req) { size += chunk.length; if (size > 18 * 1024 * 1024) throw Object.assign(new Error('Fotografiile sunt prea mari.'), { status: 413 }); parts.push(chunk); }
  try { return JSON.parse(Buffer.concat(parts).toString()); } catch { throw Object.assign(new Error('Date invalide.'), { status: 400 }); }
}
function session(req) {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  return db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(token || '', Date.now());
}
function validReport(r) {
  if (!r || typeof r !== 'object') return false;
  if (typeof r.id !== 'string' || !/^[a-zA-Z0-9-]{10,80}$/.test(r.id) || typeof r.uploadKey !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(r.uploadKey) || typeof r.driver !== 'string' || r.driver.trim().length < 2 || r.driver.length > 100) return false;
  if (![r.truck, r.trailer].every(v => typeof v === 'string' && /^[A-Z0-9 -]{2,20}$/.test(v))) return false;
  if (typeof r.notes !== 'string' || r.notes.length > 2000 || !['ok', 'damage'].includes(r.condition)) return false;
  if (r.condition === 'damage' && !r.notes.trim()) return false;
  if (!r.photos || !slots.every(s => typeof r.photos[s] === 'string' && r.photos[s].length <= 2 * 1024 * 1024 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(r.photos[s]))) return false;
  return slots.every(s => { const b = Buffer.from(r.photos[s].split(',')[1], 'base64'); return b.length > 10 && b[0] === 255 && b[1] === 216 && b[b.length - 2] === 255 && b[b.length - 1] === 217; });
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const now = Date.now(), address = req.socket.remoteAddress;
      for (const [key, attempt] of loginAttempts) if (now - attempt.start > 60000) loginAttempts.delete(key);
      const attempt = loginAttempts.get(address) || { start: now, count: 0 };
      attempt.count++; loginAttempts.set(address, attempt);
      if (attempt.count > 20) return send(res, 429, { error: 'Prea multe încercări. Așteaptă un minut.' });
      const { code } = await body(req);
      if (typeof code !== 'string' || code.length > 200) return send(res, 400, { error: 'Cod invalid.' });
      const candidate = scryptSync(code, salt, 32);
      const role = Object.keys(hashes).find(r => timingSafeEqual(candidate, hashes[r]));
      if (!role) return send(res, 401, { error: 'Codul de acces nu este corect.' });
      const token = randomBytes(32).toString('base64url'); const expires = Date.now() + 30 * 86400000;
      db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(token, role, expires);
      return send(res, 200, { token, role, expires });
    }
    if (url.pathname.startsWith('/api/')) {
      const user = session(req);
      if (!user) return send(res, 401, { error: 'Conectează-te pentru a sincroniza datele.' });
      if (url.pathname === '/api/logout' && req.method === 'POST') { db.prepare('DELETE FROM sessions WHERE token = ?').run(user.token); return send(res, 200, { ok: true }); }
      if (url.pathname === '/api/vehicles' && req.method === 'GET') return send(res, 200, db.prepare('SELECT * FROM vehicles ORDER BY kind, plate').all());
      if (url.pathname === '/api/vehicles' && req.method === 'POST' && user.role === 'admin') {
        const { plate, kind } = await body(req);
        if (!/^[A-Z0-9 -]{2,20}$/.test(plate || '') || !['truck', 'trailer'].includes(kind)) return send(res, 400, { error: 'Vehicul invalid.' });
        db.prepare('INSERT OR REPLACE INTO vehicles VALUES (?, ?)').run(plate, kind); return send(res, 201, { ok: true });
      }
      if (url.pathname === '/api/reports' && req.method === 'POST' && user.role === 'driver') {
        const r = await body(req);
        if (!validReport(r)) return send(res, 400, { error: 'Completează datele, cele 8 fotografii și observațiile pentru deteriorări.' });
        const owner = createHash('sha256').update(r.uploadKey).digest('hex');
        const existing = db.prepare('SELECT id, owner FROM reports WHERE id = ?').get(r.id);
        if (existing && existing.owner !== owner) return send(res, 409, { error: 'Identificator de raport deja utilizat.' });
        if (!existing) {
          const receivedAt = new Date().toISOString();
          const capturedAt = typeof r.capturedAt === 'string' && Number.isFinite(Date.parse(r.capturedAt)) ? r.capturedAt : receivedAt;
          const payload = { id: r.id, driver: r.driver.trim(), truck: r.truck, trailer: r.trailer, condition: r.condition, notes: r.notes, photos: r.photos, capturedAt, receivedAt };
          db.prepare('INSERT INTO reports VALUES (?, ?, ?, ?)').run(r.id, owner, receivedAt, JSON.stringify(payload));
        }
        return send(res, 200, { id: r.id, synced: true });
      }
      if (url.pathname === '/api/reports' && req.method === 'GET' && user.role === 'admin') {
        // Keep full-resolution photos out of the list query and Node's heap.
        // A report contains exactly eight photos, validated before insertion.
        return send(res, 200, db.prepare("SELECT json_remove(payload, '$.photos') AS summary FROM reports ORDER BY created DESC LIMIT 500").all().map(row => ({ ...JSON.parse(row.summary), photoCount: slots.length })));
      }
      if (/^\/api\/reports\/[a-zA-Z0-9-]+$/.test(url.pathname) && req.method === 'GET' && user.role === 'admin') {
        const row = db.prepare('SELECT payload FROM reports WHERE id = ?').get(url.pathname.split('/').pop());
        return row ? send(res, 200, JSON.parse(row.payload)) : send(res, 404, { error: 'Raportul nu există.' });
      }
      return send(res, 403, { error: 'Operațiune indisponibilă pentru acest cont.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Metodă invalidă.' });
    const files = { '/': 'index.html', '/index.html': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css', '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest', '/icon.svg': 'icon.svg' };
    const file = files[url.pathname]; if (!file) return send(res, 404, { error: 'Pagina nu există.' });
    const contents = await readFile(path.join(root, 'public', file));
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch (e) { if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Eroare la salvare. Raportul rămâne pe telefon; încearcă din nou.' }); else res.end(); }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Aplicația rulează pe portul ${server.address().port}. Codurile sunt în DATA_DIR/access-codes.json (implicit .data/).`));
process.on('SIGTERM', () => server.close(() => { db.close(); process.exit(0); }));
