/* Build 130: household header for per-household database rules (RLS).
   Adds "x-household: <code>" to every Supabase REST call so the database can check it.
   If the header is ever refused by the browser/gateway, it quietly retries without it
   (and remembers for an hour) so syncing never breaks. A tiny heartbeat row records which
   phone is on this build and whether the header works. */
(function () {
  if (window.__bcHH || !window.fetch) return; window.__bcHH = 1;
  var of = window.fetch.bind(window);
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function cfg() { try { var c = JSON.parse(ls("fx_sync_cfg") || "null"); return c && c.url && c.key && c.hh ? c : null; } catch (e) { return null; } }
  function heartbeat(ok, c) {
    try {
      var last = +ls("bc_hh_hb" + (ok ? "1" : "0")) || 0; if (Date.now() - last < 3600000) return; lset("bc_hh_hb" + (ok ? "1" : "0"), String(Date.now()));
      var me = ls("fx_me") === "p2" ? "p2" : "p1";
      var h = { apikey: c.key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }; if (/^eyJ/.test(c.key)) h.Authorization = "Bearer " + c.key; if (ok) h["x-household"] = c.hh;
      var body = JSON.stringify([{ household: c.hh, key: "hh_hdr_" + me, value: JSON.stringify({ ok: ok, ts: Date.now(), build: 130, ua: (navigator.userAgent || "").slice(0, 60) }), updated_at: Date.now(), updated_by: me }]);
      of(c.url.replace(/\/+$/, "") + "/rest/v1/club_kv?on_conflict=household,key", { method: "POST", headers: h, body: body }).catch(function () { });
    } catch (e) { }
  }
  window.fetch = function (input, init) {
    var c = null, url = "";
    try { c = cfg(); url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) { }
    if (!c || url.indexOf(c.url.replace(/\/+$/, "") + "/rest/v1/") !== 0 || (+ls("bc_hh_off") || 0) > Date.now() - 3600000) return of(input, init);
    var hd; try { hd = new Headers((init && init.headers) || (typeof input !== "string" && input && input.headers) || {}); hd.set("x-household", c.hh); } catch (e) { return of(input, init); }
    var i2 = {}; for (var k in (init || {})) i2[k] = init[k]; i2.headers = hd;
    return of(input, i2).then(function (r) { if (r && r.ok && url.indexOf("hh_hdr_") < 0) heartbeat(true, c); return r; }, function (err) {
      if (err && err.name === "TypeError") {
        return of(input, init).then(function (r2) { lset("bc_hh_off", String(Date.now())); heartbeat(false, c); return r2; }, function () { throw err; });
      }
      throw err;
    });
  };
})();
