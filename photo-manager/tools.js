/* Photo Manager tools: thumbnails, duplicate finder, scheduled backups, optional cloud copy, phone activity.
   No npm packages. Used by server.js. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');

module.exports = function (ctx) {
  const { DATA, FILES, lib, saveLib, cfg, saveCfg, byHash, manifest, gc, send, json, sendFile, readBody, onChanged } = ctx;
  const THUMBS = path.join(DATA, 'thumbs'); fs.mkdirSync(THUMBS, { recursive: true });
  let BK_DIR = process.env.BACKUP_DIR || '/backups';
  try { fs.mkdirSync(BK_DIR, { recursive: true }); fs.accessSync(BK_DIR, fs.constants.W_OK); } catch (e) { BK_DIR = path.join(DATA, 'backups'); fs.mkdirSync(BK_DIR, { recursive: true }); }

  /* ---------- who is using the phone link ---------- */
  const PHONES = {};
  function seen(req, what) {
    try {
      const q = new URL(req.url, 'http://x').searchParams, ua = String(req.headers['user-agent'] || '');
      const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';
      const id = q.get('d') ? 'd' + String(q.get('d')).replace(/[^a-z0-9]/gi, '').slice(0, 20) : 'u' + crypto.createHash('sha1').update(ua + ip).digest('hex').slice(0, 8);
      const p = PHONES[id] = PHONES[id] || { id, first: Date.now(), n: 0, files: 0, kind: /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android phone' : /Windows|Macintosh|Linux/.test(ua) ? 'Computer' : 'Device' };
      p.last = Date.now(); p.n++; if (what === 'file') { p.files++; p.lastFile = Date.now(); } if (what === 'manifest') p.lastSync = Date.now(); if (what === 'photo') p.lastPhoto = Date.now();
    } catch (e) { }
  }
  function phones() {
    const now = Date.now(), list = Object.values(PHONES).sort((a, b) => b.last - a.last);
    return { active: list.filter(p => now - p.last < 10 * 60e3).length, today: list.filter(p => now - p.last < 864e5).length, busy: list.filter(p => p.lastFile && now - p.lastFile < 20e3).length,
      list: list.slice(0, 8).map(p => ({ id: p.id, kind: p.kind, last: p.last, lastSync: p.lastSync || 0, files: p.files })) };
  }

  /* ---------- thumbnails (ffmpeg), two at a time ---------- */
  let running = 0; const waitQ = [];
  const slot = fn => new Promise((ok, no) => { const go = () => { running++; fn().then(ok, no).finally(() => { running--; const n = waitQ.shift(); if (n) n(); }); }; running < 2 ? go() : waitQ.push(go); });
  const ff = (args, opt) => new Promise((ok, no) => { const p = spawn('ffmpeg', ['-v', 'error', '-nostdin', ...args], opt || {}); const out = []; let err = ''; p.stdout && p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err += d); p.on('error', no); p.on('close', c => c === 0 ? ok(Buffer.concat(out)) : no(new Error(err.slice(0, 200) || 'ffmpeg ' + c))); });
  async function thumb(res, req, hash, w) {
    const it = byHash(hash); if (!it || /^audio\//.test(it.type)) return send(res, 404, 'no thumbnail');
    w = [96, 160, 240, 400, 800].includes(w) ? w : 240;
    const out = path.join(THUMBS, hash + '_' + w + '.webp'), src = path.join(FILES, hash);
    if (!fs.existsSync(out)) {
      try {
        const vf = `scale='min(${w},iw)':-2`, tmp = out + '.' + process.pid + '.tmp.webp';
        await slot(() => ff(['-y', ...(/^video\//.test(it.type) ? ['-ss', '0.5'] : []), '-i', src, '-frames:v', '1', '-vf', vf, '-c:v', 'libwebp', '-quality', '70', tmp]));
        fs.renameSync(tmp, out);
      } catch (e) { return sendFile(res, src, it.type, { 'Cache-Control': 'no-store', 'X-Thumb': 'fallback' }, req); }
    }
    sendFile(res, out, 'image/webp', { 'Cache-Control': 'max-age=31536000, immutable' }, req);
  }

  /* ---------- duplicate finder: same file, and pictures that look the same ---------- */
  const AH_FILE = path.join(DATA, 'ahash.json'); let AH = {}; try { AH = JSON.parse(fs.readFileSync(AH_FILE, 'utf8')); } catch (e) { }
  const DUPE = { state: 'idle', done: 0, total: 0, result: null, at: 0 };
  async function aHash(hash) {
    if (AH[hash]) return AH[hash];
    const buf = await slot(() => ff(['-i', path.join(FILES, hash), '-frames:v', '1', '-vf', 'scale=8:8:flags=area,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']));
    if (buf.length < 64) throw new Error('short');
    let m = 0; for (let i = 0; i < 64; i++) m += buf[i]; m /= 64; let bits = ''; for (let i = 0; i < 64; i++) bits += buf[i] >= m ? '1' : '0';
    return (AH[hash] = bits);
  }
  const ham = (a, b) => { let d = 0; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) d++; return d; };
  async function scanDupes() {
    if (DUPE.state === 'scanning') return; DUPE.state = 'scanning'; DUPE.done = 0; DUPE.result = null;
    try {
      const items = Object.values(lib().items).filter(i => !/^dd-voice/.test(i.slot) && /^image\//.test(i.type));
      const by = {}; items.forEach(i => (by[i.hash] = by[i.hash] || []).push(i));
      const brief = i => ({ app: i.app, slot: i.slot, name: i.name, hash: i.hash, size: i.size });
      const same = Object.values(by).filter(g => g.length > 1).map(g => ({ kind: 'same', items: g.map(brief) }));
      const hashes = Object.keys(by); DUPE.total = hashes.length;
      const H = {}; for (const h of hashes) { try { H[h] = await aHash(h); } catch (e) { } DUPE.done++; }
      try { fs.writeFileSync(AH_FILE, JSON.stringify(AH)); } catch (e) { }
      const ks = Object.keys(H), par = {}; const f = x => par[x] === x ? x : (par[x] = f(par[x])); ks.forEach(k => par[k] = k);
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) if (ham(H[ks[i]], H[ks[j]]) <= 3) par[f(ks[i])] = f(ks[j]);
      const groups = {}; ks.forEach(k => (groups[f(k)] = groups[f(k)] || []).push(k));
      const similar = Object.values(groups).filter(g => g.length > 1).map(g => ({ kind: 'similar', items: g.flatMap(h => by[h].map(brief)) }));
      DUPE.result = { same, similar, scanned: items.length }; DUPE.state = 'done'; DUPE.at = Date.now();
    } catch (e) { DUPE.state = 'error'; DUPE.err = e.message; }
  }

  /* ---------- backups (.bcpack, the same file the phones can import) ---------- */
  const stamp = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  const BK = { state: 'idle', msg: '', last: 0 };
  function listBackups() { try { return fs.readdirSync(BK_DIR).filter(f => /^breakfast-club-photos-.*\.bcpack$/.test(f)).map(f => { const s = fs.statSync(path.join(BK_DIR, f)); return { name: f, size: s.size, t: s.mtimeMs }; }).sort((a, b) => b.t - a.t); } catch (e) { return []; } }
  async function backupNow(kind) {
    if (BK.state === 'running') return; BK.state = 'running'; BK.msg = 'Backing up…';
    const name = 'breakfast-club-photos-' + stamp(new Date()) + '.bcpack', file = path.join(BK_DIR, name), tmp = file + '.part';
    try {
      const m = manifest(), files = m.files.filter(f => fs.existsSync(path.join(FILES, f.hash)));
      const header = Buffer.from(JSON.stringify({ version: m.version, created: Date.now(), files }), 'utf8'), lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(header.length, 0);
      await new Promise((ok, no) => {
        const out = fs.createWriteStream(tmp); out.on('error', no); out.on('finish', ok);
        out.write(Buffer.from('BCPACK01', 'ascii')); out.write(lenBuf); out.write(header);
        let i = 0; const next = () => { if (i >= files.length) return out.end(); const s = fs.createReadStream(path.join(FILES, files[i++].hash)); s.on('error', no); s.on('end', next); s.pipe(out, { end: false }); }; next();
      });
      fs.renameSync(tmp, file);
      const c = cfg(); c.backup = Object.assign({ every: 'off', keep: 7 }, c.backup || {}); c.backup.last = Date.now(); saveCfg();
      const keep = Math.max(1, +c.backup.keep || 7); listBackups().slice(keep).forEach(b => { try { fs.unlinkSync(path.join(BK_DIR, b.name)); } catch (e) { } });
      BK.state = 'idle'; BK.last = Date.now(); BK.msg = (kind === 'auto' ? 'Automatic backup' : 'Backup') + ' saved: ' + name;
    } catch (e) { try { fs.unlinkSync(tmp); } catch (x) { } BK.state = 'error'; BK.msg = 'Backup failed: ' + e.message; }
  }
  function restoreBackup(name) {
    const file = path.join(BK_DIR, path.basename(name)); if (!/\.bcpack$/.test(file) || !fs.existsSync(file)) throw new Error('backup not found');
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(12); fs.readSync(fd, head, 0, 12, 0); if (head.toString('ascii', 0, 8) !== 'BCPACK01') throw new Error('not a backup file');
      const n = head.readUInt32LE(8), hb = Buffer.alloc(n); fs.readSync(fd, hb, 0, n, 12); const hd = JSON.parse(hb.toString('utf8'));
      let off = 12 + n, added = 0, kept = 0; const L = lib();
      for (const f of hd.files) {
        const dest = path.join(FILES, f.hash);
        if (!fs.existsSync(dest)) { const tmp = dest + '.restore'; const o = fs.openSync(tmp, 'w'), buf = Buffer.alloc(1 << 20); let left = f.size, pos = off, h = crypto.createHash('sha1'); while (left > 0) { const r = fs.readSync(fd, buf, 0, Math.min(buf.length, left), pos); if (!r) break; h.update(buf.subarray(0, r)); fs.writeSync(o, buf, 0, r); pos += r; left -= r; } fs.closeSync(o); if (h.digest('hex') !== f.hash || left) { fs.unlinkSync(tmp); off += f.size; continue; } fs.renameSync(tmp, dest); }
        off += f.size; const k = f.app + '|' + f.slot;
        if (!L.items[k]) { L.items[k] = { app: f.app, slot: f.slot, hash: f.hash, type: f.type, size: f.size, name: f.slot, meta: f.meta || {}, updated: Date.now(), from: 'restore' }; added++; } else kept++;
      }
      saveLib(); return { added, kept };
    } finally { fs.closeSync(fd); }
  }
  setInterval(() => {
    const b = cfg().backup; if (!b || b.every === 'off' || BK.state === 'running') return;
    const gap = b.every === 'weekly' ? 7 * 864e5 : 864e5; if (Date.now() - (b.last || 0) < gap - 5 * 60e3) return;
    if (new Date().getHours() < (+b.hour || 0)) return; backupNow('auto');
  }, 5 * 60e3);

  /* ---------- optional cloud copy (Supabase Storage, a private bucket named club-library) ---------- */
  const CL = { state: 'idle', msg: '', done: 0, total: 0, last: 0, skipped: 0 };
  const sb = () => { const s = cfg().supabase; return s && s.url && s.key && s.hh ? s : null; };
  const sbh = (s, extra) => Object.assign({ apikey: s.key }, /^eyJ/.test(s.key) ? { Authorization: 'Bearer ' + s.key } : {}, extra || {});
  const obj = (s, p) => s.url.replace(/\/+$/, '') + '/storage/v1/object/club-library/' + encodeURIComponent(s.hh) + '/' + p;
  async function cloudList(s) {
    const have = new Set(); let off = 0;
    for (;;) {
      const r = await fetch(s.url.replace(/\/+$/, '') + '/storage/v1/object/list/club-library', { method: 'POST', headers: sbh(s, { 'Content-Type': 'application/json' }), body: JSON.stringify({ prefix: s.hh + '/f', limit: 1000, offset: off }) });
      if (!r.ok) throw new Error((await r.text()).slice(0, 160)); const L = await r.json(); L.forEach(o => have.add(o.name)); if (L.length < 1000) break; off += 1000;
    }
    return have;
  }
  async function cloudPush() {
    const s = sb(); if (!s) { CL.state = 'error'; CL.msg = 'Fill in the Supabase details first (Auto-find on phones).'; return; }
    if (CL.state === 'running') return; CL.state = 'running'; CL.msg = 'Checking what is already in the cloud…'; CL.done = 0; CL.skipped = 0;
    try {
      const have = await cloudList(s), m = manifest(), need = [...new Set(m.files.map(f => f.hash))].filter(h => !have.has(h) && fs.existsSync(path.join(FILES, h)));
      const MAXB = 45 * 1024 * 1024, big = new Set(); CL.total = need.length;
      for (const h of need) {
        const st = fs.statSync(path.join(FILES, h)); if (st.size > MAXB) { big.add(h); CL.skipped++; CL.done++; continue; }
        const r = await fetch(obj(s, 'f/' + h), { method: 'POST', headers: sbh(s, { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' }), body: fs.readFileSync(path.join(FILES, h)) });
        if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 160)); CL.done++; CL.msg = 'Uploading ' + CL.done + ' of ' + CL.total + '…';
      }
      const bigAll = new Set(m.files.filter(f => f.size > MAXB).map(f => f.hash));
      const cm = Object.assign({}, m, { files: m.files.filter(f => !bigAll.has(f.hash)), cloud: true });
      const r = await fetch(obj(s, 'manifest.json'), { method: 'POST', headers: sbh(s, { 'Content-Type': 'application/json', 'x-upsert': 'true' }), body: JSON.stringify(cm) });
      if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 160));
      CL.state = 'idle'; CL.last = Date.now(); const c = cfg(); c.cloud = Object.assign({ on: false }, c.cloud || {}, { last: CL.last }); saveCfg();
      CL.msg = 'Cloud copy is up to date (' + cm.files.length + ' files)' + (CL.skipped ? '. ' + CL.skipped + ' file(s) over 45 MB were left out.' : '.');
    } catch (e) { CL.state = 'error'; CL.msg = 'Cloud copy failed: ' + e.message; }
  }
  async function cloudRestore() {
    const s = sb(); if (!s) throw new Error('Fill in the Supabase details first.');
    const r = await fetch(obj(s, 'manifest.json'), { headers: sbh(s) }); if (!r.ok) throw new Error('no cloud copy found (' + r.status + ')');
    const m = await r.json(), L = lib(); let added = 0, got = 0;
    for (const f of m.files) {
      const dest = path.join(FILES, f.hash);
      if (!fs.existsSync(dest)) { const rr = await fetch(obj(s, 'f/' + f.hash), { headers: sbh(s) }); if (!rr.ok) continue; const buf = Buffer.from(await rr.arrayBuffer()); if (crypto.createHash('sha1').update(buf).digest('hex') !== f.hash) continue; fs.writeFileSync(dest, buf); got++; }
      const k = f.app + '|' + f.slot; if (!L.items[k]) { L.items[k] = { app: f.app, slot: f.slot, hash: f.hash, type: f.type, size: f.size, name: f.slot, meta: f.meta || {}, updated: Date.now(), from: 'cloud' }; added++; }
    }
    saveLib(); return { added, files: got };
  }
  let cloudT = 0;
  onChanged(() => { const c = cfg().cloud; if (c && c.on && sb()) { clearTimeout(cloudT); cloudT = setTimeout(cloudPush, 120000); } });

  const status = () => ({ phones: phones(), backup: { every: (cfg().backup || {}).every || 'off', last: (cfg().backup || {}).last || 0, state: BK.state }, cloud: { on: !!(cfg().cloud || {}).on, state: CL.state, last: CL.last } });

  /* ---------- manager (this PC only) routes ---------- */
  async function manager(req, res, u) {
    const p = u.pathname;
    if (p.startsWith('/thumb/')) { await thumb(res, req, p.slice(7).replace(/[^a-f0-9]/g, ''), +u.searchParams.get('w') || 240); return true; }
    if (p === '/api/status') { json(res, 200, Object.assign(status(), { files: Object.keys(lib().items).length, link: ctx.phoneLink ? ctx.phoneLink() : null })); return true; }
    if (p === '/api/dupes') { json(res, 200, { state: DUPE.state, done: DUPE.done, total: DUPE.total, result: DUPE.result, at: DUPE.at, err: DUPE.err }); return true; }
    if (p === '/api/dupes/scan' && req.method === 'POST') { scanDupes(); json(res, 200, { ok: true }); return true; }
    if (p === '/api/backups') { const c = cfg().backup || { every: 'off', keep: 7, hour: 3 }; json(res, 200, { dir: BK_DIR, list: listBackups(), cfg: Object.assign({ every: 'off', keep: 7, hour: 3 }, c), state: BK.state, msg: BK.msg, last: BK.last }); return true; }
    if (p === '/api/backups/config' && req.method === 'POST') { const b = JSON.parse((await readBody(req, 5000)).toString() || '{}'); const c = cfg(); c.backup = Object.assign({ every: 'off', keep: 7, hour: 3 }, c.backup || {}, { every: ['off', 'daily', 'weekly'].includes(b.every) ? b.every : 'off', keep: Math.min(60, Math.max(1, +b.keep || 7)), hour: Math.min(23, Math.max(0, +b.hour || 0)) }); saveCfg(); json(res, 200, { ok: true }); return true; }
    if (p === '/api/backups/now' && req.method === 'POST') { backupNow('manual'); json(res, 200, { ok: true }); return true; }
    if (p === '/api/backups/restore' && req.method === 'POST') { try { json(res, 200, restoreBackup(u.searchParams.get('name'))); } catch (e) { json(res, 400, { error: e.message }); } return true; }
    if (p.startsWith('/api/backups/file/')) { const f = path.basename(decodeURIComponent(p.slice(18))); if (!/^breakfast-club-photos-.*\.bcpack$/.test(f)) { send(res, 404, 'not found'); return true; } sendFile(res, path.join(BK_DIR, f), 'application/octet-stream', { 'Content-Disposition': 'attachment; filename="' + f + '"' }, req); return true; }
    if (p === '/api/cloud') { const c = cfg().cloud || {}; json(res, 200, { on: !!c.on, state: CL.state, msg: CL.msg, done: CL.done, total: CL.total, last: CL.last || c.last || 0, hasSupabase: !!sb() }); return true; }
    if (p === '/api/cloud/config' && req.method === 'POST') { const b = JSON.parse((await readBody(req, 2000)).toString() || '{}'); const c = cfg(); c.cloud = Object.assign({}, c.cloud || {}, { on: !!b.on }); saveCfg(); json(res, 200, { ok: true }); return true; }
    if (p === '/api/cloud/push' && req.method === 'POST') { cloudPush(); json(res, 200, { ok: true }); return true; }
    if (p === '/api/cloud/restore' && req.method === 'POST') { try { json(res, 200, await cloudRestore()); } catch (e) { json(res, 400, { error: e.message }); } return true; }
    return false;
  }
  return { manager, seen, phones, status };
};
