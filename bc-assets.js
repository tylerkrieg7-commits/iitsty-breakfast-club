/* =====================================================================
   Breakfast Club photo & video store (shared by index, Dungeon Dwellers and Loot & Ledger)
   Files come from the Photo Manager on your PC (tap "Sync from my PC") or from a .bcpack
   bundle file. They are saved inside the app's own storage (IndexedDB), never in the
   phone's gallery, and they keep working with the PC switched off.
   ===================================================================== */
(function () {
  "use strict";
  if (window.BCAssets) return;
  var DBN = "bc-assets", LINK_KEY = "bc_asset_link", META_KEY = "bc_assets_meta";
  var recs = new Map();          // key -> record   (synced: "app|slot", on-phone uploads: "local|app|slot")
  var urls = new Map();          // key -> { hash, url }
  var dbp = null, ready = null, busy = false;
  var subs = [];

  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, no) {
      try {
        var r = indexedDB.open(DBN, 1);
        r.onupgradeneeded = function () { var d = r.result; if (!d.objectStoreNames.contains("files")) d.createObjectStore("files", { keyPath: "k" }); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = r.onblocked = function () { no(r.error || new Error("storage blocked")); };
      } catch (e) { no(e); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return idb().then(function (d) {
      return new Promise(function (ok, no) {
        var t = d.transaction("files", mode), os = t.objectStore("files"), out = fn(os);
        t.oncomplete = function () { ok(out); }; t.onerror = t.onabort = function () { no(t.error || new Error("write failed")); };
      });
    });
  }
  var putRec = function (r) { return tx("readwrite", function (os) { os.put(r); }).then(function () { recs.set(r.k, r); }); };
  var delRec = function (k) { return tx("readwrite", function (os) { os.delete(k); }).then(function () { recs.delete(k); dropUrl(k); }); };
  function dropUrl(k) { var u = urls.get(k); if (u) { urls.delete(k); setTimeout(function () { try { URL.revokeObjectURL(u.url); } catch (e) {} }, 8000); } }

  function load() {
    if (ready) return ready;
    ready = tx("readonly", function (os) {
      var got = []; var c = os.openCursor();
      c.onsuccess = function () { var cur = c.result; if (cur) { got.push(cur.value); cur.continue(); } };
      return got;
    }).then(function (list) { list.forEach(function (r) { recs.set(r.k, r); }); emit("ready"); return true; })
      .catch(function (e) { console.warn("[BCAssets] storage unavailable", e); return false; });
    return ready;
  }

  /* ---------- reading ---------- */
  function rec(app, slot) { return recs.get(app + "|" + slot) || recs.get("local|" + app + "|" + slot) || null; }
  function url(app, slot) {
    var r = rec(app, slot); if (!r || !r.blob) return null;
    var u = urls.get(r.k);
    if (u && u.hash === r.hash) return u.url;
    if (u) dropUrl(r.k);
    var nu = URL.createObjectURL(r.blob); urls.set(r.k, { hash: r.hash, url: nu }); return nu;
  }
  function all(app) {
    var out = {}, seen = {};
    recs.forEach(function (r) { if (r.app !== app) return; if (seen[r.slot] && r.local) return; seen[r.slot] = 1; out[r.slot] = { slot: r.slot, type: r.type, size: r.size, local: !!r.local, meta: r.meta || {} }; });
    return Object.keys(out).map(function (k) { var o = out[k]; o.url = url(app, o.slot); return o; });
  }
  function isVideo(app, slot) { var r = rec(app, slot); return !!(r && /^video\//.test(r.type || "")); }
  function stats() {
    var n = 0, b = 0, apps = {};
    recs.forEach(function (r) { if (r.local) return; n++; b += r.size || 0; apps[r.app] = (apps[r.app] || 0) + 1; });
    return { count: n, bytes: b, apps: apps, meta: meta() };
  }
  function meta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch (e) { return {}; } }
  function setMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(Object.assign(meta(), m))); } catch (e) {} }

  /* ---------- events ---------- */
  function emit(type, extra) {
    var d = Object.assign({ type: type }, extra || {});
    subs.forEach(function (f) { try { f(d); } catch (e) { console.warn(e); } });
    try { window.dispatchEvent(new CustomEvent("bcassets", { detail: d })); } catch (e) {}
  }
  function onChange(f) { subs.push(f); }

  /* ---------- finding the PC ---------- */
  function cleanLink(s) {
    s = String(s || "").trim(); if (!s) return "";
    var m = /https?:\/\/[^\s"'<>]+\/t\/[a-f0-9]{8,64}/i.exec(s);
    return m ? m[0].replace(/\/+$/, "") + "/" : "";
  }
  function setLink(s) { var l = cleanLink(s); if (l) localStorage.setItem(LINK_KEY, l); else localStorage.removeItem(LINK_KEY); return l; }
  function supaCfg() { try { var c = JSON.parse(localStorage.getItem("fx_sync_cfg") || "null"); return c && c.url && c.key && c.hh ? c : null; } catch (e) { return null; } }
  function fromSupabase() {
    var c = supaCfg(); if (!c) return Promise.resolve(null);
    var h = { apikey: c.key }; if (/^eyJ/.test(c.key)) h.Authorization = "Bearer " + c.key;
    return fetch(c.url.replace(/\/+$/, "") + "/rest/v1/club_kv?select=value&household=eq." + encodeURIComponent(c.hh) + "&key=eq.bc_asset_server", { headers: h, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { try { var v = rows && rows[0] && JSON.parse(rows[0].value); return v && cleanLink(v.url) || null; } catch (e) { return null; } })
      .catch(function () { return null; });
  }
  function devId() { try { var d = localStorage.getItem("bc_dev"); if (!d) { d = Math.random().toString(36).slice(2, 10); localStorage.setItem("bc_dev", d); } return d; } catch (e) { return "x"; } }
  /* the cloud copy (Supabase Storage) needs the project key; the PC link needs nothing */
  function hdrFor(link) { var h = {}; if (/\/storage\/v1\//.test(link)) { var c = supaCfg(); if (c) { h.apikey = c.key; if (/^eyJ/.test(c.key)) h.Authorization = "Bearer " + c.key; } } return h; }
  function cloudLink() { var c = supaCfg(); return c ? c.url.replace(/\/+$/, "") + "/storage/v1/object/club-library/" + c.hh + "/" : null; }
  function q(link) { return /\/storage\/v1\//.test(link) ? "" : "?d=" + devId(); }
  function getManifest(link) {
    return fetch(link + "manifest.json" + q(link), { cache: "no-store", headers: hdrFor(link) }).then(function (r) { if (!r.ok) throw new Error("bad link"); return r.json(); })
      .then(function (m) { if (!m || !Array.isArray(m.files)) throw new Error("bad link"); return m; });
  }
  /* tries the link shared through Supabase first (it is always the newest), then the one you pasted */
  function discover() {
    return fromSupabase().then(function (sl) {
      var tries = [], pasted = cleanLink(localStorage.getItem(LINK_KEY));
      if (sl) tries.push(sl); if (pasted && pasted !== sl) tries.push(pasted);
      var cl = cloudLink(); if (cl) tries.push(cl);
      if (!tries.length) throw new Error(supaCfg() ? "Your PC hasn't shared a link yet. Start the Photo Manager on the PC (or paste its link here)." : "Paste the phone link from the Photo Manager on your PC first.");
      var i = 0;
      function next() {
        if (i >= tries.length) return Promise.reject(new Error("Can't reach your PC. Make sure the Photo Manager is running on it (the link changes when the PC restarts)."));
        var l = tries[i++]; return getManifest(l).then(function (m) { return { link: l, manifest: m }; }, next);
      }
      return next();
    });
  }

  /* details typed in the Photo Manager (boss HP, recipe text, prices...) */
  function sameMeta(a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }
  function updMeta(list) {
    return list.reduce(function (p, f) { return p.then(function () { var r = recs.get(f.app + "|" + f.slot); if (!r) return; return putRec(Object.assign({}, r, { meta: f.meta || {} })); }); }, Promise.resolve());
  }
  function itemMeta(app, slot) { var r = rec(app, slot); return (r && r.meta) || {}; }

  /* ---------- lines for the PC to record (Dungeon Dwellers voices) ---------- */
  var lastLink = { l: null, at: 0 };
  function postVoice(lines) {
    var go = function (link) {
      return fetch(link + "voice", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ lines: lines }) })
        .then(function (r) { if (!r.ok) throw new Error("Your PC said no (" + r.status + ")"); return r.json(); });
    };
    if (lastLink.l && Date.now() - lastLink.at < 600000) return go(lastLink.l).catch(function () { lastLink.l = null; return postVoice(lines); });
    return discover().then(function (f) { lastLink = { l: f.link, at: Date.now() }; return go(f.link); });
  }

  /* ---------- sync from the PC ---------- */
  function persist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {} }
  function room(need) {
    try { if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(true); } catch (e) { return Promise.resolve(true); }
    return navigator.storage.estimate().then(function (e) { return !e.quota || (e.quota - (e.usage || 0)) > need * 1.05; }, function () { return true; });
  }
  function sync(onProg) {
    if (busy) return Promise.reject(new Error("Already syncing"));
    busy = true; onProg = onProg || function () {};
    onProg({ phase: "find", text: "Looking for your PC…" });
    return load().then(discover).then(function (found) {
      var files = found.manifest.files, want = {}, todo = [], need = 0;
      var metaOnly = [];
      files.forEach(function (f) { var k = f.app + "|" + f.slot; want[k] = f; var r = recs.get(k); if (!r || r.hash !== f.hash) { todo.push(f); need += f.size || 0; } else if (sameMeta(r.meta, f.meta) === false) metaOnly.push(f); });
      var gone = []; recs.forEach(function (r) { if (!r.local && !want[r.k]) gone.push(r.k); });
      return room(need).then(function (ok) {
        if (!ok) throw new Error("Not enough free space on this phone for " + mb(need) + ".");
        persist();
        var done = 0, doneB = 0, failed = 0, idx = 0;
        function report() { onProg({ phase: "get", done: done, total: todo.length, bytes: doneB, totalBytes: need, text: "Downloading " + done + " of " + todo.length + " · " + mb(doneB) + " of " + mb(need) }); }
        report();
        function one(f, tries) {
          var pk = "part|" + f.hash, part = recs.get(pk), have = part && part.blob ? part.blob.size : 0;
          if (f.size && have >= f.size) { have = 0; part = null; }
          var hd = Object.assign({}, hdrFor(found.link)); if (have > 0) hd.Range = "bytes=" + have + "-";
          var chunks = [], got = 0, resumed = false;
          return fetch(found.link + "f/" + f.hash + q(found.link), { cache: "no-store", headers: hd }).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            resumed = have > 0 && r.status === 206; if (!resumed) have = 0;
            if (resumed) chunks.push(part.blob);
            if (!r.body || !r.body.getReader) return r.blob().then(function (b) { chunks.push(b); });
            var rd = r.body.getReader();
            function pump() { return rd.read().then(function (x) { if (x.done) return; chunks.push(new Blob([x.value])); got += x.value.length; return pump(); }); }
            return pump();
          }).catch(function (e) {
            /* keep what arrived so the next try (or next sync) carries on from there */
            var sz = chunks.reduce(function (a, c) { return a + c.size; }, 0);
            if (sz > 1024 * 64) return putRec({ k: pk, app: "_part", slot: f.hash, hash: f.hash, local: true, type: f.type, size: sz, blob: new Blob(chunks, { type: f.type }), t: Date.now(), meta: {} }).then(function () { throw e; }, function () { throw e; });
            throw e;
          }).then(function () {
            var b = new Blob(chunks, { type: f.type });
            if (f.size && b.size !== f.size) { return delRec(pk).then(function () { throw new Error("incomplete"); }); }
            return putRec({ k: f.app + "|" + f.slot, app: f.app, slot: f.slot, hash: f.hash, meta: f.meta || {}, type: f.type || b.type, size: b.size, blob: b, t: Date.now() }).then(function () { return recs.has(pk) ? delRec(pk) : null; });
          }).then(function () { done++; doneB += f.size || 0; report(); },
              function (e) { if (tries < 4) return new Promise(function (ok) { setTimeout(ok, 600 * (tries + 1)); }).then(function () { return one(f, tries + 1); }); failed++; done++; report(); });
        }
        function worker() { if (idx >= todo.length) return Promise.resolve(); return one(todo[idx++], 0).then(worker); }
        return Promise.all([worker(), worker(), worker()]).then(function () {
          return gone.reduce(function (p, k) { return p.then(function () { return delRec(k); }); }, Promise.resolve()).then(function () { return updMeta(metaOnly); });
        }).then(function () {
          setMeta({ synced: Date.now(), version: found.manifest.version, via: "pc" });
          var res = { added: todo.length - failed + metaOnly.length, removed: gone.length, failed: failed, total: files.length };
          emit("change", res); return res;
        });
      });
    }).then(function (r) { busy = false; return r; }, function (e) { busy = false; throw e; });
  }

  /* ---------- import a .bcpack bundle file ---------- */
  function readText(blob) { return blob.text ? blob.text() : new Response(blob).text(); }
  function readBuf(blob) { return blob.arrayBuffer ? blob.arrayBuffer() : new Response(blob).arrayBuffer(); }
  function importBundle(file, onProg) {
    if (busy) return Promise.reject(new Error("Already syncing"));
    busy = true; onProg = onProg || function () {};
    return load().then(function () { return readBuf(file.slice(0, 12)); }).then(function (buf) {
      var head = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
      if (head !== "BCPACK01") throw new Error("That isn't a Photo Manager bundle file (.bcpack).");
      var n = new DataView(buf).getUint32(8, true);
      return readText(file.slice(12, 12 + n)).then(function (t) { return { h: JSON.parse(t), off: 12 + n }; });
    }).then(function (o) {
      var files = o.h.files || [], off = o.off, want = {}, plan = [], need = 0;
      var metaOnly = [];
      files.forEach(function (f) { var k = f.app + "|" + f.slot; want[k] = 1; var r = recs.get(k); if (!r || r.hash !== f.hash) { plan.push({ f: f, at: off }); need += f.size; } else if (sameMeta(r.meta, f.meta) === false) metaOnly.push(f); off += f.size; });
      if (off > file.size) throw new Error("The bundle file is incomplete. Download it again.");
      return room(need).then(function (ok) {
        if (!ok) throw new Error("Not enough free space on this phone for " + mb(need) + ".");
        persist();
        var i = 0, doneB = 0;
        function step() {
          if (i >= plan.length) return Promise.resolve();
          var p = plan[i++], f = p.f;
          return putRec({ k: f.app + "|" + f.slot, app: f.app, slot: f.slot, hash: f.hash, meta: f.meta || {}, type: f.type, size: f.size, blob: new Blob([file.slice(p.at, p.at + f.size)], { type: f.type }), t: Date.now() })
            .then(function () { doneB += f.size; onProg({ phase: "get", done: i, total: plan.length, text: "Saving " + i + " of " + plan.length + " · " + mb(doneB) + " of " + mb(need) }); return step(); });
        }
        onProg({ phase: "get", done: 0, total: plan.length, text: "Saving 0 of " + plan.length });
        return step().then(function () {
          var gone = []; recs.forEach(function (r) { if (!r.local && !want[r.k]) gone.push(r.k); });
          return gone.reduce(function (p, k) { return p.then(function () { return delRec(k); }); }, Promise.resolve()).then(function () { return updMeta(metaOnly); }).then(function () {
            setMeta({ synced: Date.now(), version: o.h.version, via: "bundle" });
            var res = { added: plan.length + metaOnly.length, removed: gone.length, failed: 0, total: files.length };
            emit("change", res); return res;
          });
        });
      });
    }).then(function (r) { busy = false; return r; }, function (e) { busy = false; throw e; });
  }

  /* ---------- pictures/videos added on the phone itself (synced copies win over these) ---------- */
  function putLocal(app, slot, blob) {
    return load().then(function () { return putRec({ k: "local|" + app + "|" + slot, local: 1, app: app, slot: slot, hash: "l" + Date.now().toString(36), type: blob.type, size: blob.size, blob: blob, t: Date.now() }); })
      .then(function () { persist(); emit("change", { local: 1 }); });
  }
  function removeLocal(app, slot) { return delRec("local|" + app + "|" + slot).then(function () { emit("change", { local: 1 }); }); }
  function hasSynced(app, slot) { return recs.has(app + "|" + slot); }
  function clearSynced() {
    var ks = []; recs.forEach(function (r) { if (!r.local) ks.push(r.k); });
    return ks.reduce(function (p, k) { return p.then(function () { return delRec(k); }); }, Promise.resolve())
      .then(function () { setMeta({ synced: 0, version: 0 }); emit("change", { cleared: ks.length }); return ks.length; });
  }

  /* ---------- the settings card every app shows ---------- */
  function mb(n) { n = n || 0; return n > 1e9 ? (n / 1e9).toFixed(2) + " GB" : n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(n ? 1 : 0, Math.round(n / 1e3)) + " KB"; }
  function ago(t) { if (!t) return "never"; var s = (Date.now() - t) / 1000; return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; }
  var CSS = ".bca{border-radius:16px;padding:14px;margin:10px 0;background:rgba(124,92,255,.10);border:1.5px solid rgba(124,92,255,.45);color:inherit;font:inherit;text-align:left}" +
    ".bca h4{margin:0 0 4px;font-size:15px;font-weight:900;display:flex;gap:6px;align-items:center}.bca p{margin:4px 0;font-size:12.5px;opacity:.85;line-height:1.4}" +
    ".bca .bca-b{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.bca button{font:inherit;font-size:13px;font-weight:800;border:0;border-radius:12px;padding:11px 8px;cursor:pointer;background:rgba(255,255,255,.12);color:inherit;box-shadow:inset 0 0 0 1.5px rgba(124,92,255,.5)}" +
    ".bca button.bca-p{grid-column:1/-1;background:linear-gradient(90deg,#6d4dff,#a855f7);color:#fff;box-shadow:0 3px 0 rgba(0,0,0,.25);font-size:14.5px;padding:13px}.bca button:disabled{opacity:.5}" +
    ".bca .bca-bar{height:8px;border-radius:6px;background:rgba(127,127,127,.25);overflow:hidden;margin-top:10px;display:none}.bca .bca-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#ff4d6d,#ffd23f,#4cc9f0,#7b61ff);transition:width .25s}" +
    ".bca .bca-m{font-size:12.5px;font-weight:700;margin-top:8px;min-height:1em}.bca .bca-m.bad{color:#ff6b6b}.bca .bca-m.ok{color:#34d399}.bca .bca-s{font-size:12.5px;font-weight:800}" +
    ".bca .bca-l{display:none;gap:6px;margin-top:8px}.bca .bca-l input{flex:1;min-width:0;font:inherit;font-size:13px;padding:9px;border-radius:10px;border:1.5px solid rgba(124,92,255,.5);background:rgba(0,0,0,.15);color:inherit}.bca .bca-l button{flex:0 0 auto;padding:9px 12px}";
  function panel(opts) {
    opts = opts || {};
    if (!document.getElementById("bca-css")) { var st = document.createElement("style"); st.id = "bca-css"; st.textContent = CSS; document.head.appendChild(st); }
    var el = document.createElement("div"); el.className = "bca"; if (opts.style) el.setAttribute("style", opts.style);
    el.innerHTML = '<h4>📸 Photos, videos & sounds from your PC</h4><p>Saved inside the app, not in your gallery. They keep working when the PC is off.</p><div class="bca-s"></div>' +
      '<div class="bca-b"><button class="bca-p" data-a="sync">🔄 Sync from my PC</button><button data-a="pack">📦 Import bundle file</button><button data-a="link">🔗 Paste PC link</button><button data-a="push" style="grid-column:1/-1;display:none">⬆ Send my phone\'s own pictures to the PC</button><button data-a="clear" style="grid-column:1/-1">🗑 Remove synced files</button></div>' +
      '<div class="bca-l"><input placeholder="https://….trycloudflare.com/t/…" inputmode="url"><button data-a="save">Save</button></div>' +
      '<input type="file" accept=".bcpack,application/octet-stream" hidden><div class="bca-bar"><i></i></div><div class="bca-m"></div>';
    var q = function (s) { return el.querySelector(s); }, msg = q(".bca-m"), bar = q(".bca-bar"), fi = q('input[type=file]');
    function say(t, cls) { msg.textContent = t || ""; msg.className = "bca-m" + (cls ? " " + cls : ""); }
    function prog(p) { bar.style.display = "block"; bar.firstChild.style.width = (p.total ? Math.round(p.done / p.total * 100) : 4) + "%"; say(p.text); }
    function lock(on) { el.querySelectorAll("button").forEach(function (b) { b.disabled = on; }); }
    function status() {
      var s = stats(), m = s.meta, mine = opts.app ? (s.apps[opts.app] || 0) : null;
      q(".bca-s").textContent = s.count ? s.count + " files · " + mb(s.bytes) + " on this phone" + (mine != null ? " · " + mine + " for this game" : "") + " · synced " + ago(m.synced) : "Nothing synced yet."; q(".bca-s").textContent += " · build 18";
      q('[data-a=clear]').style.display = s.count ? "" : "none";
      q('[data-a=push]').style.display = typeof window.BCPushLocal === "function" ? "" : "none";
    }
    function done(r) {
      bar.style.display = "none"; lock(false); status();
      say("✅ Done: " + r.added + " new or updated" + (r.removed ? ", " + r.removed + " removed" : "") + (r.failed ? ", " + r.failed + " failed (tap Sync again)" : "") + ". " + r.total + " in total.", r.failed ? "bad" : "ok");
    }
    function fail(e) { bar.style.display = "none"; lock(false); say("⚠ " + (e && e.message || e), "bad"); }
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-a]"); if (!b) return; var a = b.dataset.a;
      if (a === "sync") { lock(true); sync(prog).then(done, fail); }
      if (a === "push") { lock(true); say("Sending your phone's pictures to the PC…"); window.BCPushLocal(true).then(function (r) { lock(false); say((r.sent ? "✅ Sent " + r.sent + " new picture" + (r.sent === 1 ? "" : "s") + " to your PC" + (r.already ? " (" + r.already + " were already there)" : "") + "." : r.already ? "✅ Your PC already has all " + r.already + " of them." : "Nothing new to send.") + (r.skipped ? " " + r.skipped + " couldn't be sent. " + (r.why || []).join(" · ") : ""), r.skipped ? "bad" : "ok"); }, fail); }
      if (a === "pack") fi.click();
      if (a === "link") { var l = q(".bca-l"); l.style.display = l.style.display === "flex" ? "none" : "flex"; q(".bca-l input").value = localStorage.getItem(LINK_KEY) || ""; q(".bca-l input").focus(); }
      if (a === "save") { var v = setLink(q(".bca-l input").value); q(".bca-l").style.display = "none"; say(v ? "Link saved. Tap Sync from my PC." : "That doesn't look like the phone link. Copy it from the Photo Manager.", v ? "ok" : "bad"); }
      if (a === "clear") { if (!confirm("Remove every synced photo and video from this phone? Your own uploads stay. You can sync again any time.")) return; lock(true); clearSynced().then(function (n) { lock(false); status(); say("Removed " + n + " files.", "ok"); }, fail); }
    });
    fi.addEventListener("change", function () { var f = fi.files[0]; fi.value = ""; if (!f) return; lock(true); importBundle(f, prog).then(done, fail); });
    load().then(status); onChange(function () { status(); });
    return el;
  }

  /* a picture added on this phone, sent to the PC (the PC only ever ADDS it; it never replaces what the PC already has) */
  function postPhoto(app, slot, blob, meta, name) {
    var go = function (link) {
      var u = link + "photo?app=" + encodeURIComponent(app) + "&slot=" + encodeURIComponent(slot) + "&name=" + encodeURIComponent(name || "") + (meta && Object.keys(meta).length ? "&meta=" + encodeURIComponent(JSON.stringify(meta)) : "");
      return fetch(u, { method: "POST", headers: { "Content-Type": blob.type || "image/jpeg" }, body: blob })
        .then(function (r) { if (r.status === 404) throw new Error("Your PC's Photo Manager is the old version. Replace it with the newest zip, start it again, then try again."); if (!r.ok) throw new Error("Your PC said no (" + r.status + ")"); return r.json(); });
    };
    if (lastLink.l && Date.now() - lastLink.at < 600000) return go(lastLink.l).catch(function (e) { if (/PC said no|old version/.test(e.message)) throw e; lastLink.l = null; return postPhoto(app, slot, blob, meta, name); });
    return discover().then(function (f) { lastLink = { l: f.link, at: Date.now() }; return go(f.link); });
  }
  window.BCAssets = { postPhoto: postPhoto, postVoice: postVoice, load: load, url: url, all: all, rec: rec, meta: itemMeta, isVideo: isVideo, hasSynced: hasSynced, stats: stats, sync: sync, importBundle: importBundle,
    discover: discover, setLink: setLink, putLocal: putLocal, removeLocal: removeLocal, clearSynced: clearSynced, onChange: onChange, panel: panel, mb: mb };
  load();
})();
