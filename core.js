/* The Egg Man Farms — storage on the phone (works offline) and fast sync with Google Sheets. */
(function () {
  'use strict';
  var TYPES = ['flocks', 'daily', 'tasks', 'sales', 'payments', 'customers', 'stock', 'feed', 'med', 'expenses'];

  // ---------- SHA-256 (works even where the browser's crypto is not available) ----------
  var sha256 = (function () {
    var K = [], H0 = [], n = 2, c = 0;
    function frac(x) { return ((x - Math.floor(x)) * 4294967296) | 0; }
    while (c < 64) {
      var prime = true;
      for (var f = 2; f * f <= n; f++) if (n % f === 0) { prime = false; break; }
      if (prime) { if (c < 8) H0[c] = frac(Math.pow(n, 1 / 2)); K[c] = frac(Math.pow(n, 1 / 3)); c++; }
      n++;
    }
    function rotr(x, s) { return (x >>> s) | (x << (32 - s)); }
    return function (str) {
      var bytes = new TextEncoder().encode(str), l = bytes.length;
      var nWords = (((l + 8) >> 6) + 1) * 16, w = new Array(nWords).fill(0);
      for (var i = 0; i < l; i++) w[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
      w[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
      w[nWords - 1] = (l * 8) >>> 0;
      w[nWords - 2] = Math.floor(l / 536870912);
      var h = H0.slice(), W = new Array(64);
      for (var j = 0; j < nWords; j += 16) {
        for (var t = 0; t < 64; t++) {
          if (t < 16) W[t] = w[j + t] | 0;
          else {
            var a = W[t - 15], b = W[t - 2];
            W[t] = (W[t - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + W[t - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) | 0;
          }
        }
        var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], G = h[6], Hh = h[7];
        for (t = 0; t < 64; t++) {
          var t1 = (Hh + (rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25)) + ((E & F) ^ (~E & G)) + K[t] + W[t]) | 0;
          var t2 = ((rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
          Hh = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
        }
        h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
        h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + G) | 0; h[7] = (h[7] + Hh) | 0;
      }
      return h.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
    };
  })();

  // ---------- IndexedDB (falls back to memory if the browser blocks it) ----------
  var db = null;
  function openDb() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req = indexedDB.open('eggman-farms', 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }
  function tx(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      if (!db) return resolve(null);
      var t = db.transaction(store, mode), s = t.objectStore(store), out = fn(s);
      t.oncomplete = function () { resolve(out && typeof IDBRequest !== 'undefined' && out instanceof IDBRequest ? out.result : undefined); };
      t.onerror = function () { reject(t.error); };
    });
  }
  function kvGet(k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); }
  function kvSet(k, v) { return tx('kv', 'readwrite', function (s) { s.put(v, k); }); }
  function putRecords(list) { if (!list.length) return Promise.resolve(); return tx('records', 'readwrite', function (s) { list.forEach(function (r) { s.put(r); }); }); }
  function deleteRecords(ids) { if (!ids.length) return Promise.resolve(); return tx('records', 'readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); }); }
  function allRecords() { return tx('records', 'readonly', function (s) { return s.getAll(); }); }

  // ---------- the farm data held in memory ----------
  var Store = {
    state: { settings: {}, users: [], products: [], items: [], recipes: [], template: [] },
    index: {},
    meta: { since: 0, masterHash: '', lastSync: 0, lastError: '' },
    session: null,
    syncing: false,
    listeners: [],
    notices: []
  };
  TYPES.forEach(function (t) { Store.state[t] = []; });

  function placeInMemory(rec) {
    var list = Store.state[rec.type]; if (!list) return;
    var old = Store.index[rec.id];
    if (old) { var i = list.indexOf(old); if (i >= 0) list[i] = rec; else list.push(rec); }
    else list.push(rec);
    Store.index[rec.id] = rec;
  }
  function removeFromMemory(id) {
    var old = Store.index[id]; if (!old) return;
    var list = Store.state[old.type]; var i = list.indexOf(old); if (i >= 0) list.splice(i, 1);
    delete Store.index[id];
  }
  function emit() { Store.listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }

  function uid() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  async function init() {
    db = await openDb();
    var recs = (await allRecords()) || [];
    recs.forEach(placeInMemory);
    var master = await kvGet('master'); if (master) applyMaster(master);
    var meta = await kvGet('meta'); if (meta) Store.meta = Object.assign(Store.meta, meta);
    Store.session = (await kvGet('session')) || null;
    window.addEventListener('online', function () { emit(); sync(); });
    window.addEventListener('offline', emit);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
    setInterval(function () { sync(); }, 60000);
  }
  function applyMaster(m) {
    ['settings', 'users', 'products', 'items', 'recipes', 'template'].forEach(function (k) { if (m[k]) Store.state[k] = m[k]; });
  }

  // Save one or more records on the phone straight away, then sync in the background.
  async function save(records) {
    if (!Array.isArray(records)) records = [records];
    var now = Date.now(), stamp = new Date().toISOString();
    records.forEach(function (r, i) {
      if (!r.id) r.id = uid();
      if (!r.createdAt) r.createdAt = stamp;
      if (!r.by && Store.session) r.by = Store.session.user.id;
      r.updatedAt = now + i;
      r._dirty = true;
      placeInMemory(r);
    });
    await putRecords(records);
    emit();
    clearTimeout(save._t); save._t = setTimeout(sync, 600);
    return records;
  }
  function pending() { return Object.keys(Store.index).map(function (k) { return Store.index[k]; }).filter(function (r) { return r._dirty; }); }

  function config() { return window.EGGMAN_CONFIG || {}; }
  function configured() { var c = config(); return c.API_URL && c.API_URL.indexOf('http') === 0 && c.FARM_KEY && c.FARM_KEY.indexOf('PASTE') < 0; }
  async function api(body, timeoutMs) {
    var c = config();
    body.key = c.FARM_KEY;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 45000) : null;
    try {
      var res = await fetch(c.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl && ctrl.signal, redirect: 'follow' });
      var text = await res.text();
      try { return JSON.parse(text); } catch (e) { return { ok: false, error: 'The Google script did not answer correctly. Check the web app URL and that access is "Anyone".' }; }
    } finally { if (timer) clearTimeout(timer); }
  }

  // ---------- login (online or offline) ----------
  async function login(name, pin) {
    name = String(name || '').trim(); pin = String(pin || '').trim();
    var key = config().FARM_KEY;
    var local = Store.state.users.filter(function (u) { return u.active && u.name.trim().toLowerCase() === name.toLowerCase(); })[0];
    if (local && local.pinHash === sha256(local.id + ':' + pin)) {
      Store.session = { user: { id: local.id, name: local.name, role: local.role }, token: sha256(key + ':' + local.id + ':' + pin) };
      await kvSet('session', Store.session); emit(); sync(); return { ok: true };
    }
    if (!navigator.onLine) return { ok: false, error: local ? 'PIN is not correct.' : 'You are offline. The first login on this phone needs internet.' };
    var r = await api({ action: 'login', name: name, pin: pin });
    if (!r.ok) return r;
    Store.session = { user: r.user, token: r.token };
    await kvSet('session', Store.session);
    await sync(true);
    emit();
    return { ok: true };
  }
  async function logout() {
    if (pending().length) await sync(true);
    Store.session = null; await kvSet('session', null); emit();
  }

  // ---------- sync: ONE request sends everything new and brings back everything changed ----------
  async function sync(force) {
    if (Store.syncing || !Store.session || !configured()) return;
    if (!navigator.onLine) { emit(); return; }
    Store.syncing = true; emit();
    var again = false;
    var sent = pending();
    var sentAt = {}; sent.forEach(function (r) { sentAt[r.id] = r.updatedAt; });
    try {
      var res = await api({ action: 'sync', userId: Store.session.user.id, token: Store.session.token, since: Store.meta.since,
        masterHash: Store.meta.masterHash, epoch: Store.meta.epoch || '', records: sent.map(function (r) { var c = Object.assign({}, r); delete c._dirty; return c; }) });
      if (!res.ok) {
        Store.meta.lastError = res.error || 'Sync failed';
        if (res.code === 'AUTH') { Store.session = null; await kvSet('session', null); Store.notices.push(res.error); }
        return;
      }
      // The owner pressed "Start fresh": throw away this device's copy and reload from the Sheet.
      if (res.epoch && Store.meta.epoch && res.epoch !== Store.meta.epoch) {
        await wipeLocal(res.epoch);
        Store.notices.push('The owner started fresh: old records were removed from this device.');
        again = true; return;
      }
      if (res.epoch && !Store.meta.epoch) Store.meta.epoch = res.epoch;
      var changed = [];
      (res.accepted || []).forEach(function (id) {
        var r = Store.index[id];
        if (r && r._dirty && r.updatedAt === sentAt[id]) { delete r._dirty; changed.push(r); }
      });
      var removed = [];
      (res.rejected || []).forEach(function (x) {
        var r = Store.index[x.id];
        Store.notices.push('Not saved: ' + x.reason + '.');
        if (r) { removeFromMemory(x.id); removed.push(x.id); }
      });
      if (removed.length) Store.meta.since = 0; // bring back the saved copy from the Sheet
      (res.records || []).forEach(function (r) {
        var mine = Store.index[r.id];
        if (mine && mine._dirty && mine.updatedAt > r.updatedAt) return; // my newer change wins; it goes up next time
        delete r.serverAt; placeInMemory(r); changed.push(r);
      });
      if (res.master) { applyMaster(res.master); await kvSet('master', res.master); Store.meta.masterHash = res.masterHash; }
      if (!removed.length) Store.meta.since = res.serverTime;
      Store.meta.lastSync = Date.now(); Store.meta.lastError = '';
      await putRecords(changed); await deleteRecords(removed);
      await kvSet('meta', Store.meta);
      again = removed.length > 0;
    } catch (e) {
      Store.meta.lastError = (e && e.name === 'AbortError') ? 'Sync took too long — will try again.' : 'Could not reach Google — will try again.';
    } finally {
      Store.syncing = false; emit();
    }
    if (again) return sync(true);
  }
  async function wipeLocal(epoch) {
    Object.keys(Store.index).forEach(function (id) { delete Store.index[id]; });
    TYPES.forEach(function (t) { Store.state[t] = []; });
    await tx('records', 'readwrite', function (s) { s.clear(); });
    Store.meta.since = 0; Store.meta.epoch = epoch; Store.meta.lastError = '';
    await kvSet('meta', Store.meta);
    emit();
  }
  // Owner only: delete every record everywhere (settings are kept).
  async function startFresh(confirmText, pin) {
    if (!navigator.onLine) throw new Error('Starting fresh needs internet.');
    var res = await api({ action: 'reset', userId: Store.session.user.id, token: Store.session.token, confirm: confirmText, pin: String(pin || '') });
    if (!res.ok) throw new Error(res.error || 'Could not start fresh.');
    await wipeLocal(res.epoch);
    await sync(true);
    return res;
  }
  // Owner only, needs internet: replace one settings tab (Products, Users, Settings, Items, Schedule, Recipes).
  async function saveMaster(table, rows) {
    if (!navigator.onLine) throw new Error('Saving settings needs internet. Your other records still work offline.');
    var res = await api({ action: 'master', userId: Store.session.user.id, token: Store.session.token, table: table, rows: rows });
    if (!res.ok) throw new Error(res.error || 'Could not save.');
    applyMaster(res.master); await kvSet('master', res.master);
    Store.meta.masterHash = res.masterHash; await kvSet('meta', Store.meta);
    emit();
    return res;
  }
  // After the owner changes their own PIN, keep them logged in with the new one.
  async function useNewPin(pin) {
    var key = config().FARM_KEY;
    Store.session.token = sha256(key + ':' + Store.session.user.id + ':' + String(pin));
    await kvSet('session', Store.session);
  }
  async function fullRefresh() { Store.meta.since = 0; Store.meta.masterHash = ''; await kvSet('meta', Store.meta); return sync(true); }

  window.EggCore = { TYPES: TYPES, Store: Store, init: init, save: save, sync: sync, login: login, logout: logout, pending: pending,
    configured: configured, fullRefresh: fullRefresh, saveMaster: saveMaster, useNewPin: useNewPin, startFresh: startFresh, uid: uid, sha256: sha256, kvGet: kvGet, kvSet: kvSet,
    onChange: function (f) { Store.listeners.push(f); } };
})();
