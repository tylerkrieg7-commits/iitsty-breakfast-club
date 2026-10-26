/* Dungeon Dwellers voices, recorded on this PC with Piper.
   Phones send the lines they speak (or the whole script); this records each one once with the same
   voice and speaker the phone uses, saves it as a small .ogg in the library, and the phones get it
   at their next sync, so those lines play instantly with no work on the phone. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process'), { Readable } = require('stream');

/* the same key the game uses (cyrb53 of "model|speaker|speed|text") */
function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
const normT = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
const keyOf = (m, s, t, ls) => cyrb53(m + '|' + s + '|' + ls + '|' + normT(t));

module.exports = function (ctx) {
  /* ctx: { DATA, FILES, TMP, lib(), saveLib(), changed(), cfg(), saveCfg() } */
  const VDIR = path.join(ctx.DATA, 'voices'), MDIR = path.join(VDIR, 'models'), QFILE = path.join(VDIR, 'queue.json'), WDIR = path.join(ctx.TMP, 'voice');
  [VDIR, MDIR, WDIR].forEach(d => fs.mkdirSync(d, { recursive: true }));
  const PIPER = process.env.PIPER_BIN || '/opt/piper/piper', FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';
  const HF = process.env.PIPER_VOICES_URL || 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
  let Q = []; try { Q = JSON.parse(fs.readFileSync(QFILE, 'utf8')); } catch (e) { }
  const inQ = new Set(Q.map(x => x.k));
  const S = { state: 'idle', msg: '', model: {}, done: 0, lastBatch: null, err: '' };
  const vcfg = () => { const c = ctx.cfg(); c.voice = c.voice || { paused: false, share: true }; return c.voice; };
  const saveQ = () => { const t = QFILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(Q)); fs.renameSync(t, QFILE); };
  const have = k => !!ctx.lib().items['dd-voice|' + k];
  const okModel = m => typeof m === 'string' && /^[A-Za-z0-9_.-]{3,80}$/.test(m);
  const mFile = m => path.join(MDIR, m + '.onnx');
  const hfPath = m => { const p = m.split('-'); return HF + p[0].split('_')[0] + '/' + p.join('/') + '/' + m; };

  /* ---------- lines from the phones ---------- */
  function want(lines) {
    let added = 0, already = 0, bad = 0;
    (Array.isArray(lines) ? lines : []).slice(0, 2000).forEach(l => {
      try {
        const m = String(l.m || ''), s = Math.floor(+l.s), ls = +l.ls, t = normT(l.t);
        if (!okModel(m) || !(s >= 0 && s < 5000) || !(ls >= 0.5 && ls <= 2) || !t || t.length > 600) { bad++; return; }
        const k = keyOf(m, s, t, ls); if (l.k && l.k !== k) { bad++; return; }
        if (have(k) || inQ.has(k)) { already++; return; }
        Q.push({ k, m, s, ls, t, w: String(l.w || '').slice(0, 60), at: Date.now() }); inQ.add(k); added++;
      } catch (e) { bad++; }
    });
    if (Q.length > 30000) { Q.splice(0, Q.length - 30000).forEach(x => inQ.delete(x.k)); }
    if (added) { saveQ(); kick(); }
    return { added, already, bad, waiting: Q.length };
  }

  /* ---------- the voice file ---------- */
  const dl = {};
  async function ensureModel(m) {
    if (fs.existsSync(mFile(m)) && fs.existsSync(mFile(m) + '.json')) { share(m); return mFile(m); }
    if (dl[m]) return dl[m];
    dl[m] = (async () => {
      S.model = { name: m, state: 'download', got: 0, total: 0 };
      for (const ext of ['.onnx.json', '.onnx']) {
        const r = await fetch(hfPath(m) + ext); if (!r.ok) throw new Error('Could not download the voice (' + r.status + ')');
        S.model.total = +r.headers.get('content-length') || S.model.total;
        const tmp = mFile(m) + ext.replace('.onnx', '') + '.part', out = fs.createWriteStream(tmp);
        await new Promise((ok, no) => { const rd = Readable.fromWeb(r.body); rd.on('data', d => { S.model.got += d.length; }); rd.on('error', no); out.on('error', no); out.on('finish', ok); rd.pipe(out); });
        fs.renameSync(tmp, mFile(m) + ext.replace('.onnx', ''));
      }
      S.model = { name: m, state: 'ready' }; share(m); return mFile(m);
    })();
    dl[m].catch(e => { S.model = { name: m, state: 'error', err: e.message }; }).finally(() => { delete dl[m]; });
    return dl[m];
  }
  /* the voice file also goes to the phones with the normal sync, so they never need to download it */
  function share(m) {
    const L = ctx.lib(), on = vcfg().share !== false;
    let changed = false;
    for (const ext of ['.onnx', '.onnx.json']) {
      const key = 'dd-voice-model|' + m + ext, f = mFile(m) + ext.replace('.onnx', '');
      if (!on) { if (L.items[key]) { delete L.items[key]; changed = true; } continue; }
      if (L.items[key] || !fs.existsSync(f)) continue;
      const h = crypto.createHash('sha1'); h.update(fs.readFileSync(f)); const hash = h.digest('hex'), dest = path.join(ctx.FILES, hash);
      if (!fs.existsSync(dest)) fs.copyFileSync(f, dest);
      L.items[key] = { app: 'dd-voice-model', slot: m + ext, hash, type: ext === '.onnx' ? 'application/octet-stream' : 'application/json', size: fs.statSync(dest).size, name: m + ext, meta: {}, updated: Date.now() };
      changed = true;
    }
    if (changed) { ctx.saveLib(); ctx.changed(); }
  }

  /* the Piper program for the phones (so they never need the internet for it) */
  const WEB = process.env.PIPER_WEB_DIR || '/opt/piper-web';
  const ENGINE = [['worker/PhonemizeWebWorker.js', 'text/javascript'], ['worker/OnnxWebWorker.js', 'text/javascript'], ['onnx/ort-wasm-simd-threaded.wasm', 'application/wasm'], ['piper/piper_phonemize.wasm', 'application/wasm'], ['piper/piper_phonemize.data', 'application/octet-stream']];
  function shareEngine() {
    const L = ctx.lib(), on = vcfg().share !== false; let changed = false;
    for (const [rel, type] of ENGINE) {
      const key = 'dd-piper-engine|' + rel, f = path.join(WEB, rel);
      if (!on) { if (L.items[key]) { delete L.items[key]; changed = true; } continue; }
      if (L.items[key] || !fs.existsSync(f)) continue;
      const buf = fs.readFileSync(f), hash = crypto.createHash('sha1').update(buf).digest('hex'), dest = path.join(ctx.FILES, hash);
      if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
      L.items[key] = { app: 'dd-piper-engine', slot: rel, hash, type, size: buf.length, name: rel.split('/').pop(), meta: {}, updated: Date.now() }; changed = true;
    }
    if (changed) { ctx.saveLib(); ctx.changed(); }
  }

  /* ---------- recording ---------- */
  function run(cmd, args, input) {
    return new Promise((ok, no) => {
      const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] }); let err = '';
      p.stderr.on('data', d => { err = (err + d).slice(-2000); });
      p.on('error', no); p.on('close', c => c === 0 ? ok() : no(new Error(cmd.split('/').pop() + ' stopped (' + c + '): ' + err.split('\n').filter(Boolean).slice(-2).join(' '))));
      if (input) p.stdin.end(input); else p.stdin.end();
    });
  }
  let busy = false, timer = null;
  function kick(ms) { clearTimeout(timer); timer = setTimeout(work, ms || 300); }
  async function work() {
    if (busy) return;
    if (vcfg().paused) { S.state = 'paused'; return; }
    while (Q.length && have(Q[0].k)) { inQ.delete(Q.shift().k); }
    if (!Q.length) { S.state = 'idle'; S.msg = ''; return; }
    busy = true;
    try {
      const head = Q[0]; S.state = 'model'; S.msg = 'Getting the voice ' + head.m + '…';
      const model = await ensureModel(head.m);
      const batch = Q.filter(x => x.m === head.m && x.ls === head.ls && !have(x.k)).slice(0, 40);
      S.state = 'recording'; S.msg = 'Recording ' + batch.length + ' lines…';
      const t0 = Date.now();
      const input = batch.map(x => JSON.stringify({ text: x.t, speaker_id: x.s, output_file: path.join(WDIR, x.k + '.wav') })).join('\n') + '\n';
      await run(PIPER, ['--model', model, '--json-input', '--length_scale', String(head.ls), '--sentence_silence', '0.1'], input);
      const L = ctx.lib();
      for (const x of batch) {
        const wav = path.join(WDIR, x.k + '.wav'), ogg = path.join(WDIR, x.k + '.ogg');
        if (!fs.existsSync(wav)) continue;
        try {
          await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'libopus', '-b:a', '32k', '-application', 'voip', ogg]);
          const buf = fs.readFileSync(ogg), hash = crypto.createHash('sha1').update(buf).digest('hex'), dest = path.join(ctx.FILES, hash);
          if (!fs.existsSync(dest)) fs.writeFileSync(dest, buf);
          L.items['dd-voice|' + x.k] = { app: 'dd-voice', slot: x.k, hash, type: 'audio/ogg', size: buf.length, name: (x.w || 'line') + '.ogg', meta: { w: x.w, s: x.s, t: x.t.slice(0, 160) }, updated: Date.now() };
        } catch (e) { S.err = e.message; }
        fs.unlink(wav, () => { }); fs.unlink(ogg, () => { });
      }
      const ks = new Set(batch.map(x => x.k)); Q = Q.filter(x => !ks.has(x.k)); ks.forEach(k => inQ.delete(k)); saveQ();
      ctx.saveLib(); ctx.changed();
      S.lastBatch = { n: batch.length, ms: Date.now() - t0, at: Date.now() }; S.err = '';
      busy = false; kick(50);
    } catch (e) {
      busy = false; S.state = 'error'; S.err = e.message; S.msg = ''; kick(5 * 60 * 1000);   /* try again in 5 minutes */
    }
  }

  /* a quick listen on the PC: any line in any voice */
  async function test(m, s, t) {
    m = typeof m === 'string' && okModel(m) ? m : (S.model && S.model.name) || 'en_US-libritts_r-medium';
    const model = await ensureModel(m), out = path.join(WDIR, 'test-' + Date.now() + '.wav');
    await run(PIPER, ['--model', model, '--speaker', String(Math.max(0, Math.floor(+s) || 0)), '--output_file', out], normT(t || 'The torch gutters. Somewhere below, something has already heard you.') + '\n');
    const b = fs.readFileSync(out); fs.unlink(out, () => { }); return b;
  }

  function status() {
    const items = Object.values(ctx.lib().items).filter(i => i.app === 'dd-voice');
    return { state: S.state, msg: S.msg, err: S.err, model: S.model, done: items.length, bytes: items.reduce((a, i) => a + i.size, 0), waiting: Q.length, last: S.lastBatch, paused: !!vcfg().paused, share: vcfg().share !== false,
      piper: fs.existsSync(PIPER), recent: items.sort((a, b) => b.updated - a.updated).slice(0, 8).map(i => ({ w: i.meta && i.meta.w, t: i.meta && i.meta.t, hash: i.hash })) };
  }
  function action(a) {
    const v = vcfg();
    if (a === 'pause') { v.paused = true; ctx.saveCfg(); }
    if (a === 'resume') { v.paused = false; ctx.saveCfg(); kick(); }
    if (a === 'clear') { Q = []; inQ.clear(); saveQ(); }
    if (a === 'share-on' || a === 'share-off') { v.share = a === 'share-on'; ctx.saveCfg(); fs.readdirSync(MDIR).filter(f => f.endsWith('.onnx')).forEach(f => share(f.slice(0, -5))); shareEngine(); }
    if (a === 'forget') { const L = ctx.lib(); Object.keys(L.items).forEach(k => { if (k.startsWith('dd-voice|')) delete L.items[k]; }); ctx.saveLib(); ctx.changed(); }
    if (a === 'retry') { S.err = ''; kick(); }
    return status();
  }
  fs.readdirSync(MDIR).filter(f => f.endsWith('.onnx')).forEach(f => { S.model = { name: f.slice(0, -5), state: 'ready' }; share(f.slice(0, -5)); });
  shareEngine();
  kick(2000);
  return { want, status, action, test, keyOf };
};
