/* bc-extras.js (build 21): shared across every app on this site.
   - Sound mixer (master / effects / music), applied to Web Audio and <audio>/<video>
   - Per-app background music playlists
   - Achievement publishing + Easter eggs
   - Club tab cards (index.html only): Trophy Road, Achievement Hall, Easter eggs, Mixer, App playlists, Backup & Restore */
(function () {
    "use strict";
    if (window.BCX) return;
    var FILE = (location.pathname.split("/").pop() || "").toLowerCase();
    var APP = { "": "club", "index.html": "club", "arcade.html": "arcade", "duo.html": "duo", "pocketfarm.html": "farm", "color-art.html": "color", "loot-ledger.html": "loot", "dungeon-dwellers.html": "dd" }[FILE] || "other";
    var APPS = [["club", "🏆", "Club"], ["arcade", "🕹️", "Arcade"], ["duo", "💞", "Together Arcade"], ["farm", "🌾", "Pocket Farm"], ["dd", "⚔️", "Dungeon Dwellers"], ["color", "🎨", "Pixel Art"], ["loot", "💰", "Loot Ledger"]];
    var ls = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
    var lset = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
    var jget = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
    var jset = function (k, v) { lset(k, JSON.stringify(v)); };
    var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
    var num = function (v, d) { v = parseFloat(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : d; };
    var BCX = window.BCX = { app: APP, apps: APPS };

    /* ================= sound mixer ================= */
    function mixGet() { var m = jget("bc_mix", {}); return { master: num(m.master, 1), sfx: num(m.sfx, 1), music: num(m.music, 1) }; }
    var MIX = mixGet(), CTXS = [], ELS = [];
    var AC = window.AudioContext || window.webkitAudioContext;
    function applyCtx(c) { var b = c.__bcx; if (!b) return; try { b.m.gain.value = MIX.master; b.s.gain.value = MIX.sfx; b.u.gain.value = MIX.music; } catch (e) {} }
    function elVol(el) { var raw = el.__bcRaw == null ? 1 : el.__bcRaw; return Math.max(0, Math.min(1, raw * MIX.master * MIX.music)); }
    function applyEl(el) { try { vd.set.call(el, elVol(el)); } catch (e) {} }
    function applyAll() { CTXS.forEach(applyCtx); ELS = ELS.filter(function (r) { var e = r.deref ? r.deref() : r; if (e) applyEl(e); return !!e; }); }
    var vd = null;
    if (AC && window.AudioNode) {
        var NC = AudioNode.prototype.connect;
        var bus = function (ctx) {
            if (ctx.__bcx) return ctx.__bcx;
            var m = ctx.createGain(), s = ctx.createGain(), u = ctx.createGain();
            NC.call(s, m); NC.call(u, m); NC.call(m, ctx.destination);
            ctx.__bcx = { m: m, s: s, u: u }; CTXS.push(ctx); applyCtx(ctx); return ctx.__bcx;
        };
        var isMusic = function (n) {
            if (n.__bcm) return true;
            try {
                if (window.MediaElementAudioSourceNode && n instanceof MediaElementAudioSourceNode) return true;
                if (window.AudioBufferSourceNode && n instanceof AudioBufferSourceNode && n.buffer && n.buffer.duration > 8) return true;
            } catch (e) {}
            return false;
        };
        AudioNode.prototype.connect = function (dst) {
            try {
                var mus = isMusic(this); if (mus) this.__bcm = true;
                if (dst && window.AudioDestinationNode && dst instanceof AudioDestinationNode && this.context instanceof AC) {
                    var b = bus(this.context), a = [].slice.call(arguments, 1);
                    NC.apply(this, [mus ? b.u : b.s].concat(a)); return dst;
                }
                if (mus && dst && dst instanceof AudioNode) dst.__bcm = true;
            } catch (e) {}
            return NC.apply(this, arguments);
        };
    }
    if (window.HTMLMediaElement) {
        vd = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
        if (vd && vd.set) {
            var track = function (el) { if (el.__bcT) return; el.__bcT = 1; ELS.push(window.WeakRef ? new WeakRef(el) : el); };
            Object.defineProperty(HTMLMediaElement.prototype, "volume", {
                configurable: true, enumerable: vd.enumerable,
                get: function () { return this.__bcRaw == null ? vd.get.call(this) : this.__bcRaw; },
                set: function (v) { this.__bcRaw = +v; track(this); vd.set.call(this, elVol(this)); }
            });
            var P0 = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function () { try { track(this); if (this.__bcRaw == null) this.__bcRaw = vd.get.call(this); applyEl(this); } catch (e) {} return P0.apply(this, arguments); };
        }
    }
    BCX.mix = {
        get: function () { return { master: MIX.master, sfx: MIX.sfx, music: MIX.music }; },
        set: function (k, v) { MIX[k] = num(v, 1); jset("bc_mix", MIX); applyAll(); }
    };
    window.addEventListener("storage", function (e) { if (e.key === "bc_mix") { MIX = mixGet(); applyAll(); } });

    /* ================= toast ================= */
    function toast(msg) {
        try {
            var d = document.createElement("div");
            d.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483000;background:#1e1b3a;color:#fff;border:2px solid #ffd54f;border-radius:14px;padding:10px 16px;font:700 14px system-ui,sans-serif;box-shadow:0 6px 24px #000a;max-width:86vw;text-align:center";
            d.textContent = msg; (document.body || document.documentElement).appendChild(d);
            setTimeout(function () { d.style.transition = "opacity .5s"; d.style.opacity = 0; setTimeout(function () { d.remove(); }, 600); }, 2600);
        } catch (e) {}
    }
    BCX.toast = toast;
    function queuePoints(game, pts) {
        try { var q = jget("clubGameQueue", []); q.push({ game: game, pts: pts, ts: Date.now() }); jset("clubGameQueue", q.slice(-50)) } catch (e) {}
    }

    /* ================= achievements (published by each app) ================= */
    BCX.publish = function (app, items) {
        try {
            var s = JSON.stringify(items), k = "bc_hall_" + app;
            if (localStorage.getItem(k) !== s) localStorage.setItem(k, s);
        } catch (e) {}
    };
    /* item = [id, icon, name, description, gotBool] */

    /* ================= easter eggs ================= */
    var EGGS = [
        ["arcade", "🕹️", "Arcade", "The neon sign at the top of the arcade flickers like it wants something. Tap it seven times."],
        ["farm", "🌾", "Pocket Farm", "The sky icon is more than a weather report. Poke the sun, again and again."],
        ["dd", "⚔️", "Dungeon Dwellers", "Torchlight in the top-left corner of the dungeon draws a curious crowd. Knock five times."],
        ["color", "🎨", "Pixel Art", "Every canvas has a lower-right corner where the artist signs. Sign it five times."],
        ["loot", "💰", "Loot Ledger", "The treasurer keeps a secret in the top-right corner of the ledger. Count five."],
        ["duo", "💞", "Together Arcade", "Two players, bottom-left corner of the board. Five quick taps says hello."]
    ];
    BCX.eggList = EGGS;
    BCX.eggsFound = function () { return jget("bc_eggs", {}); };
    BCX.egg = function (app) {
        var f = jget("bc_eggs", {}); if (f[app]) return false;
        f[app] = Date.now(); jset("bc_eggs", f);
        var meta = EGGS.filter(function (e) { return e[0] === app; })[0] || [app, "🥚", app];
        var n = Object.keys(f).length;
        toast("🥚 Easter egg found in " + meta[2] + "! (" + n + "/" + EGGS.length + ")");
        queuePoints("Easter egg", 25);
        if (n >= EGGS.length) { setTimeout(function () { toast("🥚🏆 All six eggs found! Check the Club tab."); queuePoints("Egg hunter", 50); }, 3000); }
        return true;
    };
    (function () {
        var hit = { n: 0, t: 0 };
        function count(need) { var t = Date.now(); hit.n = (t - hit.t < 2500) ? hit.n + 1 : 1; hit.t = t; if (hit.n >= need) { hit.n = 0; BCX.egg(APP); } }
        var corner = { dd: "tl", color: "br", loot: "tr", duo: "bl" }[APP];
        if (corner) {
            window.addEventListener("pointerdown", function (e) {
                var W = window.innerWidth, H = window.innerHeight, S = 64, x = e.clientX, y = e.clientY;
                var ok = corner === "tl" ? x < S && y < S : corner === "tr" ? x > W - S && y < S : corner === "bl" ? x < S && y > H - S : x > W - S && y > H - S;
                if (ok) count(5);
            }, true);
        }
        if (APP === "arcade") document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#marquee")) count(7); }, true);
        if (APP === "farm") document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("#wx")) count(7); }, true);
    })();

    /* ================= per-app background music ================= */
    var DBP = null;
    function idb() { return DBP || (DBP = new Promise(function (ok, no) { var r = indexedDB.open("bcx_music", 1); r.onupgradeneeded = function () { r.result.createObjectStore("songs", { keyPath: "id" }); }; r.onsuccess = function () { ok(r.result); }; r.onerror = function () { no(r.error); }; })); }
    function allSongs() { return idb().then(function (d) { return new Promise(function (ok) { var rq = d.transaction("songs", "readonly").objectStore("songs").getAll(); rq.onsuccess = function () { ok(rq.result || []); }; rq.onerror = function () { ok([]); }; }); }, function () { return []; }); }
    function pcSongs() { try { return BCAssets.all("index").filter(function (x) { return x.slot.indexOf("music:") === 0 && x.url && /^audio/.test(x.type); }).map(function (x) { return { id: "pc:" + x.slot, name: x.slot.slice(6), url: x.url }; }); } catch (e) { return []; } }
    BCX.songList = function () { return allSongs().then(function (L) { return pcSongs().concat(L.map(function (x) { return { id: "loc:" + x.id, name: x.name }; })); }); };
    BCX.playlists = function () { var P = jget("bcx_pl", []); return Array.isArray(P) ? P : []; };
    BCX.appMusic = {
        get: function () { return jget("bc_appmusic", {}); },
        set: function (app, c) { var m = jget("bc_appmusic", {}); m[app] = Object.assign({}, m[app] || {}, c); jset("bc_appmusic", m); if (app === APP) { c.pl !== undefined || c.on !== undefined ? restart() : setVol(); } }
    };
    var au = null, Q = [], qi = 0, curUrl = null, armed = false, wasOn = false;
    function appCfg() { var c = jget("bc_appmusic", {})[APP]; return c && c.pl && c.on !== 0 ? c : null; }
    function setVol() { if (au) { var c = jget("bc_appmusic", {})[APP] || {}; au.volume = c.vol == null ? 0.5 : Math.max(0, Math.min(1, +c.vol)); } }
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function playAt(i) {
        if (!Q.length) return;
        qi = (i + Q.length) % Q.length; var t = Q[qi];
        var go = function (u) { if (curUrl && curUrl !== u && /^blob:/.test(curUrl)) URL.revokeObjectURL(curUrl); curUrl = u; au.src = u; setVol(); var p = au.play(); if (p && p.catch) p.catch(function () { armed = false; arm(); }); };
        if (t.url) return go(t.url);
        idb().then(function (d) { var rq = d.transaction("songs", "readonly").objectStore("songs").get(t.id.slice(4)); rq.onsuccess = function () { if (rq.result) go(URL.createObjectURL(rq.result.blob)); else playAt(qi + 1); }; });
    }
    function start() {
        var c = appCfg(); if (!c) return;
        if (APP === "club" && window.BCMusic) { try { if (BCMusic.state().playing) return; BCMusic.play(c.pl, "app"); } catch (e) {} return; }
        BCX.songList().then(function (all) {
            var ids = c.pl === "all" ? all.map(function (s) { return s.id; }) : ((BCX.playlists().filter(function (p) { return p.id === c.pl; })[0] || { ids: [] }).ids);
            var by = {}; all.forEach(function (s) { by[s.id] = s; });
            Q = shuffle(ids.map(function (i) { return by[i]; }).filter(Boolean)); if (!Q.length) return;
            if (!au) { au = new Audio(); au.preload = "auto"; au.addEventListener("ended", function () { playAt(qi + 1); }); }
            playAt(0); wasOn = true;
        });
    }
    function restart() { try { if (au) { au.pause(); } } catch (e) {} wasOn = false; if (appCfg()) { start(); } else if (APP === "club" && window.BCMusic) { try { BCMusic.stop("app"); } catch (e) {} } }
    function arm() {
        if (armed || !appCfg()) return; armed = true;
        var go = function () { ["pointerdown", "keydown", "touchend"].forEach(function (ev) { window.removeEventListener(ev, go, true); }); armed = false; if (!wasOn || (au && au.paused)) start(); };
        ["pointerdown", "keydown", "touchend"].forEach(function (ev) { window.addEventListener(ev, go, true); });
    }
    document.addEventListener("visibilitychange", function () { if (!au) return; if (document.hidden) { wasOn = !au.paused; au.pause(); } else if (wasOn) { var p = au.play(); if (p && p.catch) p.catch(function () {}); } });
    if (APP !== "other") arm();

    /* ================= Club tab UI ================= */
    if (APP !== "club") return;
    function items(app) { var L = jget("bc_hall_" + app, []); return Array.isArray(L) ? L : []; }
    function hall() {
        var out = [], found = BCX.eggsFound();
        APPS.forEach(function (a) { var L = items(a[0]); out.push({ id: a[0], icon: a[1], name: a[2], list: L.map(function (x) { return { id: x[0], i: x[1], n: x[2], d: x[3], got: !!x[4] }; }) }); });
        out.push({ id: "eggs", icon: "🥚", name: "Easter eggs", list: EGGS.map(function (e) { return { id: e[0], i: e[1], n: found[e[0]] ? "Egg: " + e[2] : "Hidden egg", d: found[e[0]] ? "Found!" : "A secret hides in one of the apps.", got: !!found[e[0]] }; }) });
        return out;
    }
    var STOPS = [5, 10, 20, 35, 50, 70, 90, 115, 140, 170, 200, 240];
    var hallApp = "arcade";
    function roadHTML(H) {
        var tot = 0, got = 0; H.forEach(function (a) { tot += a.list.length; a.list.forEach(function (x) { if (x.got) got++; }); });
        var road = jget("bc_road", {}), pts = function (i) { return Math.min(50, 10 + i * 4); }, next = STOPS.filter(function (s) { return s > got; })[0];
        var h = '<div class="card-desc">Every trophy in every app moves your traveller along the road. <b>' + got + '</b> / ' + tot + ' collected' + (next ? " · next stop at " + next + " (" + (next - got) + " to go)" : " · you reached the end! 🌅") + '</div>';
        h += '<div style="position:relative;margin:12px 0 4px;padding:4px 0">';
        STOPS.forEach(function (s, i) {
            var reached = got >= s, claimed = !!road[s], left = i % 2 === 0, here = reached && (i === STOPS.length - 1 || got < STOPS[i + 1]);
            h += '<div style="display:flex;justify-content:' + (left ? "flex-start" : "flex-end") + ';margin:0 0 -4px;padding:0 6px"><div style="display:flex;align-items:center;gap:8px;' + (left ? "" : "flex-direction:row-reverse;") + 'max-width:78%">' +
                '<div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:22px;flex:0 0 auto;border:3px solid ' + (claimed ? "#4ade80" : reached ? "#ffd54f" : "#555") + ';background:' + (reached ? "#2a2250" : "#1a1730") + ';' + (here ? "box-shadow:0 0 14px #ffd54f" : "") + '">' + (here ? "🧳" : reached ? (i === STOPS.length - 1 ? "🏆" : "⭐") : "🔒") + '</div>' +
                '<div style="font-size:.78rem;line-height:1.25"><b>' + s + ' trophies</b><br>' + (claimed ? "✅ claimed" : reached ? '<button class="btn-action" data-bcx="roadclaim" data-s="' + s + '" data-i="' + i + '" style="padding:3px 10px;margin-top:2px">Claim +' + pts(i) + ' pts</button>' : "+" + pts(i) + " pts") + '</div></div></div>' +
                (i < STOPS.length - 1 ? '<div style="height:16px;margin:0 ' + (left ? "40px 0 auto" : "auto 0 40px") + ';width:3px;background:repeating-linear-gradient(#ffd54f66 0 4px,transparent 4px 8px);' + (left ? "margin-left:28px" : "margin-left:auto;margin-right:28px") + '"></div>' : "");
        });
        h += "</div>";
        h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + H.map(function (a) { var g = a.list.filter(function (x) { return x.got; }).length; return '<span class="fx-mini" style="cursor:default">' + a.icon + " " + g + "/" + a.list.length + "</span>"; }).join("") + "</div>";
        return h;
    }
    function hallHTML(H) {
        var cur = H.filter(function (a) { return a.id === hallApp; })[0] || H[0];
        var h = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">' + H.map(function (a) { var g = a.list.filter(function (x) { return x.got; }).length; return '<button class="fx-mini" data-bcx="hallapp" data-a="' + a.id + '" style="' + (a.id === cur.id ? "outline:2px solid #ffd54f" : "") + '">' + a.icon + " " + g + "/" + a.list.length + "</button>"; }).join("") + "</div>";
        if (!cur.list.length) return h + '<div class="card-desc">Open ' + esc(cur.name) + ' once and its trophies will appear here.</div>';
        h += '<div class="fx-achgrid">' + cur.list.map(function (x, k) { return '<button class="fx-ach' + (x.got ? " got" : "") + '" data-bcx="hallinfo" data-k="' + k + '"><span>' + (x.got ? esc(x.i) : "🔒") + "</span><small>" + esc(x.got || cur.id !== "dd" ? x.n : "???") + "</small></button>"; }).join("") + '</div><div id="bcx-hallinfo" class="card-desc" style="margin-top:8px">Tap a badge for details.</div>';
        return h;
    }
    function eggsHTML() {
        var f = BCX.eggsFound(), n = Object.keys(f).length;
        return '<div class="card-desc">Six apps each hide one secret. Find them all! <b>' + n + "/" + EGGS.length + "</b> found. Each egg is worth 25 pts, all six are worth a bonus.</div>" +
            EGGS.map(function (e) { return '<div class="fx-row" style="padding:6px 0;border-top:1px solid #ffffff14"><span>' + (f[e[0]] ? e[1] + " <b>" + esc(e[2]) + "</b> ✅" : "🥚 <i style='opacity:.85'>" + esc(e[3]) + "</i>") + "</span></div>"; }).join("");
    }
    function mixHTML() {
        var m = BCX.mix.get(), row = function (k, l) { return '<div class="form-group"><label>' + l + ': <b id="bcx-mx-' + k + '">' + Math.round(m[k] * 100) + '%</b></label><input type="range" min="0" max="100" value="' + Math.round(m[k] * 100) + '" data-bcx="mix" data-k="' + k + '"></div>'; };
        return '<div class="card-desc">Applies to every app on this phone: farm, arcade, dungeon and more.</div>' + row("master", "🔊 Master") + row("sfx", "💥 Effects & game sounds") + row("music", "🎵 Music") + '<button class="fx-mini" data-bcx="mixtest">Test beep</button>';
    }
    var SONGS = [];
    function plHTML() {
        var pls = BCX.playlists(), cfg = BCX.appMusic.get();
        var opts = function (sel) { return '<option value="">Off</option><option value="all"' + (sel === "all" ? " selected" : "") + ">All my songs</option>" + pls.map(function (p) { return '<option value="' + esc(p.id) + '"' + (sel === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join(""); };
        var h = '<div class="card-desc">Pick background music for each app. It starts on your first tap. Add songs and make playlists in <b>Workout → 🎧 Workout music</b>. ' + (SONGS.length ? "You have " + SONGS.length + " song" + (SONGS.length > 1 ? "s" : "") + "." : "No songs added yet.") + "</div>";
        APPS.forEach(function (a) {
            var c = cfg[a[0]] || {};
            h += '<div class="form-row" style="margin-top:8px;align-items:center;gap:8px"><div class="form-group" style="flex:1"><label>' + a[1] + " " + a[2] + '</label><select data-bcx="appsel" data-app="' + a[0] + '">' + opts(c.on === 0 ? "" : c.pl) + "</select></div>" +
                '<div class="form-group" style="width:90px"><label>Volume</label><input type="range" min="0" max="100" value="' + Math.round((c.vol == null ? 0.5 : c.vol) * 100) + '" data-bcx="appvol" data-app="' + a[0] + '"></div></div>';
        });
        return h;
    }
    function backupHTML() {
        return '<div class="card-desc">One file with <b>everything</b> from every app on this phone: farm, arcade, dungeon, art, ledger, club and settings. Restore it on a new phone to pick up where you left off. (Your Photo Manager library on the PC is the master for pictures, so they are not duplicated here.)</div>' +
            '<label style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" id="bcx-bk-songs"> Include my songs (bigger file)</label>' +
            '<div class="fx-btnrow"><button class="btn-action" data-bcx="bkexport">💾 Save everything</button><button class="btn-action" data-bcx="bkimport" style="background:#7c4dff">📂 Restore from file</button></div><input type="file" id="bcx-bk-file" accept="application/json,.json" style="display:none"><div id="bcx-bk-msg" class="card-desc" style="margin-top:8px"></div>';
    }
    function section(id, title, body, open) { return '<details class="card" data-bcx-sec="' + id + '"' + (open ? " open" : "") + '><summary style="cursor:pointer;font-weight:800;font-size:1.02rem">' + title + '</summary><div style="margin-top:10px" id="bcx-b-' + id + '">' + body + "</div></details>"; }
    function wrapEl() {
        var H = hall(), op = jget("bc_club_open", { road: 1 });
        var d = document.createElement("div"); d.id = "bcx-club";
        d.innerHTML = section("road", "🗺️ Trophy Road", roadHTML(H), op.road) + section("hall", "🏅 Achievement Hall (all apps)", hallHTML(H), op.hall) + section("eggs", "🥚 Easter egg hunt", eggsHTML(), op.eggs) +
            section("mix", "🎚️ Sound mixer", mixHTML(), op.mix) + section("pl", "🎵 Music for each app", plHTML(), op.pl) + section("bk", "💾 Backup & restore", backupHTML(), op.bk);
        return d;
    }
    function inject() {
        var v = document.getElementById("view-club"); if (!v || !v.classList.contains("active")) return;
        if (v.querySelector("#bcx-club")) return;
        var wr = wrapEl(), first = v.firstElementChild;
        if (first && first.nextElementSibling) first.insertAdjacentElement("afterend", wr); else v.appendChild(wr);
        BCX.songList().then(function (L) { SONGS = L; var b = document.getElementById("bcx-b-pl"); if (b) b.innerHTML = plHTML(); });
    }
    function refresh(sec) { var H = hall(), b = document.getElementById("bcx-b-" + sec); if (!b) return; b.innerHTML = sec === "road" ? roadHTML(H) : sec === "hall" ? hallHTML(H) : sec === "eggs" ? eggsHTML() : sec === "pl" ? plHTML() : sec === "mix" ? mixHTML() : backupHTML(); }
    setInterval(function () { try { inject(); var e = document.getElementById("bcx-b-eggs"); if (e && e.parentNode.open && !document.hidden) refresh("eggs"); } catch (x) {} }, 1500);
    function refreshTrophies() { try { ["road", "hall", "eggs"].forEach(refresh); } catch (x) {} }
    window.addEventListener("storage", function (e) { if (e.key && /^bc_(hall_|eggs)/.test(e.key)) refreshTrophies(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshTrophies(); });
    window.addEventListener("pageshow", refreshTrophies);
    document.addEventListener("toggle", function (e) { var t = e.target; if (t && t.dataset && t.dataset.bcxSec) { var o = jget("bc_club_open", { road: 1 }); o[t.dataset.bcxSec] = t.open ? 1 : 0; jset("bc_club_open", o); } }, true);

    function exportAll() {
        var msg = document.getElementById("bcx-bk-msg"), withSongs = document.getElementById("bcx-bk-songs").checked;
        var data = { kind: "bc-everything", v: 1, ts: Date.now(), ls: {}, songs: [] };
        try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); data.ls[k] = localStorage.getItem(k); } } catch (e) {}
        var fin = function () {
            var blob = new Blob([JSON.stringify(data)], { type: "application/json" }), a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = "breakfast_club_everything_" + new Date().toISOString().slice(0, 10) + ".json"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
            msg.textContent = "Saved " + Object.keys(data.ls).length + " settings" + (data.songs.length ? " and " + data.songs.length + " songs" : "") + ". Keep the file somewhere safe."; toast("💾 Backup saved");
        };
        if (!withSongs) return fin();
        msg.textContent = "Packing songs…";
        idb().then(function (d) {
            var rq = d.transaction("songs", "readonly").objectStore("songs").getAll();
            rq.onsuccess = function () {
                var L = rq.result || [], p = Promise.resolve();
                L.forEach(function (s) { p = p.then(function () { return new Promise(function (ok) { var fr = new FileReader(); fr.onload = function () { data.songs.push({ id: s.id, name: s.name, size: s.size, type: s.type, data: fr.result }); ok(); }; fr.onerror = function () { ok(); }; fr.readAsDataURL(s.blob); }); }); });
                p.then(fin);
            };
        }, fin);
    }
    function importAll(file) {
        var msg = document.getElementById("bcx-bk-msg"), fr = new FileReader();
        fr.onload = function () {
            var data; try { data = JSON.parse(fr.result); } catch (e) { msg.textContent = "That file could not be read."; return; }
            var L = data && (data.kind === "bc-everything" ? data.ls : (data && typeof data === "object" && !data.kind ? data : null));
            if (!L) { msg.textContent = "That does not look like a Breakfast Club backup."; return; }
            var keys = Object.keys(L);
            if (!confirm("Restore " + keys.length + " saved items" + (data.songs && data.songs.length ? " and " + data.songs.length + " songs" : "") + "?\n\nThis replaces matching data on this phone with the file's version.")) return;
            var n = 0; keys.forEach(function (k) { try { localStorage.setItem(k, typeof L[k] === "string" ? L[k] : JSON.stringify(L[k])); n++; } catch (e) {} });
            var done = function () { msg.textContent = "Restored " + n + " items. Reloading…"; setTimeout(function () { location.reload(); }, 900); };
            if (data.songs && data.songs.length) {
                idb().then(function (d) {
                    var t = d.transaction("songs", "readwrite"), s = t.objectStore("songs");
                    data.songs.forEach(function (x) { try { var b = atob(x.data.split(",")[1] || ""), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); s.put({ id: x.id, name: x.name, size: x.size, type: x.type, blob: new Blob([u], { type: x.type || "audio/mpeg" }) }); } catch (e) {} });
                    t.oncomplete = done; t.onerror = done;
                }, done);
            } else done();
        };
        fr.readAsText(file);
    }
    document.addEventListener("click", function (e) {
        var b = e.target.closest && e.target.closest("[data-bcx]"); if (!b || !document.getElementById("bcx-club") || !document.getElementById("bcx-club").contains(b)) return;
        var a = b.dataset.bcx;
        if (a === "hallapp") { hallApp = b.dataset.a; refresh("hall"); }
        else if (a === "hallinfo") { var cur = hall().filter(function (x) { return x.id === hallApp; })[0], it = cur && cur.list[+b.dataset.k], box = document.getElementById("bcx-hallinfo"); if (it && box) box.innerHTML = "<b>" + (it.got ? esc(it.i) : "🔒") + " " + esc(it.got || cur.id !== "dd" ? it.n : "Locked") + "</b> — " + esc(it.d || "") + (it.got ? ' <span style="color:#4ade80">Unlocked ✅</span>' : ""); }
        else if (a === "roadclaim") {
            var road = jget("bc_road", {}), s = b.dataset.s, i = +b.dataset.i; if (road[s]) return; road[s] = Date.now(); jset("bc_road", road);
            var p = Math.min(50, 10 + i * 4); try { window.awardClubPoints ? window.awardClubPoints("Trophy Road", p) : queuePoints("Trophy Road", p); } catch (x) {}
            toast("🏆 Trophy Road reward +" + p + " pts"); refresh("road");
        }
        else if (a === "mixtest") { try { var c = new AC(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 660; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); setTimeout(function () { try { c.close(); } catch (x) {} }, 500); } catch (x) {} }
        else if (a === "bkexport") exportAll();
        else if (a === "bkimport") document.getElementById("bcx-bk-file").click();
    });
    document.addEventListener("input", function (e) {
        var t = e.target; if (!t.dataset || !document.getElementById("bcx-club") || !document.getElementById("bcx-club").contains(t)) return;
        if (t.dataset.bcx === "mix") { BCX.mix.set(t.dataset.k, t.value / 100); var l = document.getElementById("bcx-mx-" + t.dataset.k); if (l) l.textContent = t.value + "%"; }
        else if (t.dataset.bcx === "appvol") BCX.appMusic.set(t.dataset.app, { vol: t.value / 100 });
    });
    document.addEventListener("change", function (e) {
        var t = e.target; if (!t.dataset || !document.getElementById("bcx-club") || !document.getElementById("bcx-club").contains(t)) { if (t.id === "bcx-bk-file" && t.files[0]) importAll(t.files[0]); return; }
        if (t.dataset.bcx === "appsel") { var v = t.value; BCX.appMusic.set(t.dataset.app, v ? { pl: v, on: 1 } : { on: 0 }); if (v) toast("🎵 " + (APPS.filter(function (a) { return a[0] === t.dataset.app; })[0] || [0, 0, ""])[2] + " music set"); }
        else if (t.id === "bcx-bk-file" && t.files[0]) importAll(t.files[0]);
    });
})();
