/* Breakfast Club Photo Server
   - Asset Manager (only on this PC):   http://localhost:8787
   - Phone link (read-only, via a free Cloudflare quick tunnel while this runs)
   - Optional: publishes the phone link to your Supabase project so the phones find it by themselves
   No npm packages needed. Files live in /data (the "library" folder next to docker-compose.yml). */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');

const DATA = process.env.DATA_DIR || '/data', FILES = path.join(DATA, 'files'), TMP = path.join(DATA, 'tmp');
const MANAGER_PORT = +process.env.MANAGER_PORT || 8787, PUBLIC_PORT = +process.env.PUBLIC_PORT || 8788;
const APP_DIR = __dirname;
[DATA, FILES, TMP].forEach(d => fs.mkdirSync(d, { recursive: true }));

/* ---------------- state on disk ---------------- */
const LIB_FILE = path.join(DATA, 'library.json'), CFG_FILE = path.join(DATA, 'config.json');
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJSON = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); };
let LIB = readJSON(LIB_FILE, { version: 0, items: {} });          /* items["app|slot"] = {app,slot,hash,type,size,name,updated} */
let CFG = readJSON(CFG_FILE, {});
if (!CFG.token) { CFG.token = crypto.randomBytes(12).toString('hex'); writeJSON(CFG_FILE, CFG); }
const saveLib = () => { LIB.version = (LIB.version || 0) + 1; LIB.updated = Date.now(); writeJSON(LIB_FILE, LIB); };
const saveCfg = () => writeJSON(CFG_FILE, CFG);
const CATALOGS = fs.readdirSync(path.join(APP_DIR, 'catalog')).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(APP_DIR, 'catalog', f), null)).filter(Boolean);
const ORDER = ['dungeon-dwellers', 'index', 'loot-ledger']; CATALOGS.sort((a, b) => ORDER.indexOf(a.app) - ORDER.indexOf(b.app));

/* ---------------- helpers ---------------- */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ogv': 'video/ogg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
function send(res, code, body, headers) { res.writeHead(code, Object.assign({ 'Cache-Control': 'no-store' }, headers || {})); res.end(body); }
function json(res, code, obj, headers) { send(res, code, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json' }, headers || {})); }
function readBody(req, limit) { return new Promise((ok, no) => { const ch = []; let n = 0; req.on('data', d => { n += d.length; if (n > (limit || 2e6)) { no(new Error('too big')); req.destroy(); } else ch.push(d); }); req.on('end', () => ok(Buffer.concat(ch))); req.on('error', no); }); }
function sendFile(res, file, type, extra) {
  fs.stat(file, (err, st) => {
    if (err) return send(res, 404, 'not found');
    res.writeHead(200, Object.assign({ 'Content-Type': type || 'application/octet-stream', 'Content-Length': st.size }, extra || {}));
    fs.createReadStream(file).pipe(res);
  });
}
let HIDX = { v: -1, m: null };
function byHash(h) { if (HIDX.v !== LIB.version || !HIDX.m) { HIDX = { v: LIB.version, m: new Map() }; Object.values(LIB.items).forEach(i => HIDX.m.set(i.hash, i)); } return HIDX.m.get(h); }
const shownItems = () => { const o = {}; Object.keys(LIB.items).forEach(k => { if (!/^dd-voice/.test(k)) o[k] = LIB.items[k]; }); return o; };
const manifest = () => ({ version: LIB.version || 0, updated: LIB.updated || 0, files: Object.values(LIB.items).map(i => ({ app: i.app, slot: i.slot, hash: i.hash, type: i.type, size: i.size, meta: i.meta || {} })) });

/* ---------------- the phone link (Cloudflare quick tunnel) ---------------- */
const TUN = { status: 'starting', url: null, log: [], publish: null };
function tlog(s) { TUN.log.push(new Date().toLocaleTimeString() + ' ' + s); if (TUN.log.length > 40) TUN.log.shift(); }
function startTunnel() {
  if (process.env.NO_TUNNEL === '1') { TUN.status = 'off'; tlog('Tunnel switched off (NO_TUNNEL=1).'); return; }
  let p;
  try { p = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', 'http://127.0.0.1:' + PUBLIC_PORT], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { TUN.status = 'unavailable'; tlog('cloudflared is not installed: ' + e.message); return; }
  TUN.status = 'starting'; TUN.url = null; tlog('Starting the phone link...');
  const onData = d => String(d).split(/\r?\n/).forEach(line => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(line);
    if (m && !/^https:\/\/api\./.test(m[0]) && TUN.url !== m[0]) { TUN.url = m[0]; TUN.status = 'live'; tlog('Phone link is live: ' + m[0]); publish(); }
    if (/error|failed/i.test(line) && !/no \.cloudflared|config/i.test(line)) tlog(line.replace(/^\S+\s+/, '').slice(0, 160));
  });
  p.stdout.on('data', onData); p.stderr.on('data', onData);
  p.on('error', e => { TUN.status = 'unavailable'; tlog('cloudflared could not start: ' + e.message); });
  p.on('exit', code => { if (TUN.status === 'unavailable') return; TUN.status = 'restarting'; TUN.url = null; tlog('Phone link stopped (' + code + '). Restarting in 10 seconds.'); setTimeout(startTunnel, 10000); });
}
const phoneLink = () => TUN.url ? TUN.url + '/t/' + CFG.token : null;

/* ---------------- publish the link to Supabase (optional) ---------------- */
async function publish() {
  const s = CFG.supabase; if (!s || !s.url || !s.key || !s.hh) { TUN.publish = { ok: false, msg: 'Supabase is not set up (optional).' }; return; }
  const link = phoneLink(); if (!link) { TUN.publish = { ok: false, msg: 'Waiting for the phone link.' }; return; }
  try {
    const h = { apikey: s.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }; if (/^eyJ/.test(s.key)) h.Authorization = 'Bearer ' + s.key;
    const r = await fetch(s.url.replace(/\/+$/, '') + '/rest/v1/club_kv?on_conflict=household,key', { method: 'POST', headers: h, body: JSON.stringify([{ household: s.hh, key: 'bc_asset_server', value: JSON.stringify({ url: link, ts: Date.now(), version: LIB.version }), updated_at: Date.now(), updated_by: 'photo-server' }]) });
    if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 160));
    TUN.publish = { ok: true, msg: 'Phones can find this PC by themselves.', t: Date.now() }; tlog('Shared the phone link through Supabase.');
  } catch (e) { TUN.publish = { ok: false, msg: 'Could not reach Supabase: ' + e.message }; tlog(TUN.publish.msg); }
}

/* ---------------- bundle (.bcpack): magic + header length + JSON header + files ---------------- */
function sendBundle(res) {
  const m = manifest(), files = m.files.filter(f => fs.existsSync(path.join(FILES, f.hash)));
  const header = Buffer.from(JSON.stringify({ version: m.version, created: Date.now(), files }), 'utf8'), lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(header.length, 0);
  const total = 8 + 4 + header.length + files.reduce((a, f) => a + f.size, 0), d = new Date();
  const name = 'breakfast-club-photos-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.bcpack';
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': total, 'Content-Disposition': 'attachment; filename="' + name + '"' });
  res.write(Buffer.from('BCPACK01', 'ascii')); res.write(lenBuf); res.write(header);
  let i = 0; (function next() { if (i >= files.length) return res.end(); const s = fs.createReadStream(path.join(FILES, files[i++].hash)); s.on('end', next); s.on('error', () => res.destroy()); s.pipe(res, { end: false }); })();
}

/* ---------------- upload a file into a slot ---------------- */
function slotKind(app, slot) {
  const c = CATALOGS.find(x => x.app === app); if (!c) return 'image';
  for (const g of c.groups) { const s = g.slots.find(x => x.id === slot); if (s) return s.kind || g.kind || 'image'; }
  const g = c.groups.find(x => x.free && slot.startsWith(x.free)); return (g && g.kind) || 'image';
}
const PHONE_OK = { index: ['recipe:', 'exercise:', 'companion:', 'accessory:', 'toy:', 'friend:'] };
function parseMeta(v) { if (!v) return null; try { const o = JSON.parse(v); return o && typeof o === 'object' && !Array.isArray(o) && v.length < 60000 ? o : null; } catch (e) { return null; } }
function upload(req, res, q) {
  const app = q.get('app'), slot = q.get('slot'), name = q.get('name') || 'file', meta = parseMeta(q.get('meta')), type = (req.headers['content-type'] || 'application/octet-stream').split(';')[0];
  if (!app || !slot) return json(res, 400, { error: 'app and slot are needed' });
  if (!/^(image|video|audio)\//.test(type)) return json(res, 400, { error: 'Only pictures, GIFs, videos and sounds can be added.' });
  const sk = slotKind(app, slot), fk = type.split('/')[0];
  if (fk === 'audio' ? sk !== 'audio' : fk === 'video' ? sk !== 'video' : sk === 'audio') return json(res, 400, { error: fk === 'audio' ? 'Sounds only go in sound spots.' : fk === 'video' ? 'Videos only go in Cutscene spots.' : 'Pictures can\'t go in sound spots.' });
  const tmp = path.join(TMP, crypto.randomBytes(8).toString('hex')), out = fs.createWriteStream(tmp), h = crypto.createHash('sha1'); let size = 0;
  req.on('data', d => { h.update(d); size += d.length; });
  req.pipe(out);
  out.on('finish', () => {
    if (!size) { fs.unlink(tmp, () => { }); return json(res, 400, { error: 'empty file' }); }
    const hash = h.digest('hex'), dest = path.join(FILES, hash);
    if (fs.existsSync(dest)) fs.unlink(tmp, () => { }); else fs.renameSync(tmp, dest);
    const prev = LIB.items[app + '|' + slot]; LIB.items[app + '|' + slot] = { app, slot, hash, type, size, name, meta: meta || (prev && prev.meta) || {}, updated: Date.now() }; saveLib(); gc();
    json(res, 200, { ok: true, item: LIB.items[app + '|' + slot] });
    if (TUN.url) publish();
  });
  out.on('error', e => json(res, 500, { error: e.message }));
}
function gc() { const used = new Set(Object.values(LIB.items).map(i => i.hash)); fs.readdir(FILES, (e, list) => (list || []).forEach(f => { if (!used.has(f)) fs.unlink(path.join(FILES, f), () => { }); })); }

/* ---------------- Dungeon Dwellers voices (Piper on this PC) ---------------- */
let pubT = 0;
const VOICE = require('./voice.js')({ DATA, FILES, TMP, lib: () => LIB, saveLib, cfg: () => CFG, saveCfg, changed: () => { clearTimeout(pubT); pubT = setTimeout(() => { if (TUN.url) publish(); }, 20000); } });

/* ---------------- manager (this PC only) ---------------- */
http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), p = u.pathname;
    if (p === '/' || p === '/index.html') return sendFile(res, path.join(APP_DIR, 'manager.html'), MIME['.html']);
    if (p === '/api/state') return json(res, 200, { catalogs: CATALOGS, items: shownItems(), version: LIB.version, tunnel: { status: TUN.status, link: phoneLink(), log: TUN.log.slice(-12), publish: TUN.publish }, voice: VOICE.status(), supabase: CFG.supabase ? { url: CFG.supabase.url, hh: CFG.supabase.hh, hasKey: !!CFG.supabase.key } : null, bytes: Object.values(LIB.items).reduce((a, i) => a + i.size, 0) });
    if (p === '/api/file' && req.method === 'PUT') return upload(req, res, u.searchParams);
    if (p === '/api/file' && req.method === 'DELETE') { delete LIB.items[u.searchParams.get('app') + '|' + u.searchParams.get('slot')]; saveLib(); gc(); if (TUN.url) publish(); return json(res, 200, { ok: true }); }
    if (p.startsWith('/files/')) { const h = p.slice(7).replace(/[^a-f0-9]/g, ''), it = byHash(h); return sendFile(res, path.join(FILES, h), it ? it.type : undefined, { 'Cache-Control': 'max-age=31536000' }); }
    if (p === '/api/bundle') return sendBundle(res);
    if (p === '/api/voice' && req.method === 'POST') { const b = JSON.parse((await readBody(req, 1e6)).toString() || '{}'); if (b.lines) return json(res, 200, VOICE.want(b.lines)); return json(res, 200, VOICE.action(b.action)); }
    if (p === '/api/voice/test') { try { const wav = await VOICE.test(u.searchParams.get('m'), u.searchParams.get('s'), u.searchParams.get('t')); return send(res, 200, wav, { 'Content-Type': 'audio/wav' }); } catch (e) { return json(res, 500, { error: e.message }); } }
    if (p === '/api/meta' && req.method === 'POST') {   /* change the details of an item without uploading it again */
      const it = LIB.items[u.searchParams.get('app') + '|' + u.searchParams.get('slot')]; if (!it) return json(res, 404, { error: 'not found' });
      const m = parseMeta((await readBody(req, 60000)).toString()); if (!m) return json(res, 400, { error: 'bad details' });
      it.meta = m; it.updated = Date.now(); saveLib(); if (TUN.url) publish(); return json(res, 200, { ok: true, item: it });
    }
    if (p === '/api/supabase' && req.method === 'POST') { const b = JSON.parse((await readBody(req)).toString() || '{}'); CFG.supabase = b.clear ? null : { url: String(b.url || '').trim(), key: String(b.key || '').trim() || (CFG.supabase && CFG.supabase.key) || '', hh: String(b.hh || '').trim() }; saveCfg(); await publish(); return json(res, 200, { ok: true, publish: TUN.publish }); }
    if (p === '/api/newlink' && req.method === 'POST') { CFG.token = crypto.randomBytes(12).toString('hex'); saveCfg(); await publish(); return json(res, 200, { ok: true }); }
    send(res, 404, 'not found');
  } catch (e) { json(res, 500, { error: e.message }); }
}).listen(MANAGER_PORT, '0.0.0.0', () => console.log('Asset Manager: http://localhost:' + MANAGER_PORT));

/* ---------------- phone link: read only, needs the secret token ---------------- */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*', 'Access-Control-Max-Age': '86400' };
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '', CORS);
  const vm = /^\/t\/([a-f0-9]+)\/voice$/.exec(new URL(req.url, 'http://x').pathname);
  if (vm && req.method === 'POST') {   /* lines a phone wants recorded */
    if (vm[1] !== CFG.token) return send(res, 404, 'not found', CORS);
    try { const b = JSON.parse((await readBody(req, 2e6)).toString() || '{}'); return json(res, 200, VOICE.want(b.lines), CORS); } catch (e) { return json(res, 400, { error: 'bad request' }, CORS); }
  }
  const pm = /^\/t\/([a-f0-9]+)\/photo$/.exec(new URL(req.url, 'http://x').pathname);
  if (pm && req.method === 'POST') {   /* a picture the phone added itself: only ever ADDED, never replaces what is already here */
    if (pm[1] !== CFG.token) return send(res, 404, 'not found', CORS);
    try {
      const q = new URL(req.url, 'http://x').searchParams, app = q.get('app') || 'index', slot = q.get('slot') || '', type = (req.headers['content-type'] || '').split(';')[0];
      const ok = (PHONE_OK[app] || []).some(pre => slot.startsWith(pre) && slot.length > pre.length);
      if (!ok || slot.length > 200 || /[\u0000-\u001f]/.test(slot)) return json(res, 400, { error: 'that spot can\'t be filled from a phone' }, CORS);
      if (!/^image\/(jpe?g|png|webp|gif|avif|bmp)$/.test(type)) return json(res, 400, { error: 'pictures only' }, CORS);
      const key = app + '|' + slot; const ctype = type === 'image/jpg' ? 'image/jpeg' : type;
      if (LIB.items[key]) { req.resume(); return json(res, 200, { ok: true, status: 'exists' }, CORS); }
      const body = await readBody(req, 12e6); if (!body.length) return json(res, 400, { error: 'empty' }, CORS);
      const hash = crypto.createHash('sha1').update(body).digest('hex'), dest = path.join(FILES, hash);
      if (LIB.items[key]) return json(res, 200, { ok: true, status: 'exists' }, CORS);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, body);
      LIB.items[key] = { app, slot, hash, type: ctype, size: body.length, name: String(q.get('name') || slot.replace(/^[a-z]+:/, '')).slice(0, 120), meta: parseMeta(q.get('meta')) || {}, updated: Date.now(), from: 'phone' };
      saveLib(); if (TUN.url) publish();
      return json(res, 200, { ok: true, status: 'added' }, CORS);
    } catch (e) { return json(res, 400, { error: 'bad request' }, CORS); }
  }
  const m = /^\/t\/([a-f0-9]+)\/(manifest\.json|f\/([a-f0-9]{40}))$/.exec(new URL(req.url, 'http://x').pathname);
  if (!m || m[1] !== CFG.token) return send(res, 404, 'not found', CORS);
  if (m[2] === 'manifest.json') return json(res, 200, manifest(), CORS);
  const it = byHash(m[3]); if (!it) return send(res, 404, 'not found', CORS);
  sendFile(res, path.join(FILES, m[3]), it.type, Object.assign({ 'Cache-Control': 'max-age=31536000, immutable' }, CORS));
}).listen(PUBLIC_PORT, '0.0.0.0', () => console.log('Phone link server on ' + PUBLIC_PORT));

startTunnel();
setInterval(() => { if (TUN.url) publish(); }, 30 * 60 * 1000);
