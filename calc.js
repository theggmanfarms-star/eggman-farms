/*
 * The Egg Man Farms — calculation engine.
 * The SAME file runs in three places:
 *   1. the phone/laptop app (browser)
 *   2. Google Apps Script (copy it into Calc.gs) for the summary tabs
 *   3. Node.js for the automatic tests
 * Every number the farm sees comes from here, so the app and the Google Sheet always agree.
 * Money is handled in pesewas (whole numbers) so totals never drift by 0.01.
 */
var Calc = (function () {
  'use strict';

  // ---------- small helpers ----------
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function int(v) { return Math.round(num(v)); }
  function cents(v) { return Math.round(num(v) * 100); }
  function fromCents(c) { return Math.round(c) / 100; }
  function live(list) { return (list || []).filter(function (r) { return r && !r.deleted; }); }
  function byId(list) { var m = {}; (list || []).forEach(function (r) { m[r.id] = r; }); return m; }
  function sortChrono(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      var ca = a.createdAt || '', cb = b.createdAt || '';
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    });
  }

  // ---------- dates (always 'YYYY-MM-DD' strings, no time-zone surprises) ----------
  function parseDay(s) { var p = String(s).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmtDay(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function addDays(s, n) { return fmtDay(parseDay(s) + n * 86400000); }
  function dayDiff(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function monthOf(s) { return String(s).slice(0, 7); }
  function addMonths(s, n) {
    var p = String(s).split('-'), y = +p[0], m = +p[1] - 1 + n, d = +p[2];
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return y + '-' + pad(m + 1) + '-' + pad(Math.min(d, last));
  }

  function settingsOf(state) {
    var s = state.settings || {};
    return {
      eggsPerCrate: num(s.eggsPerCrate) || 30,
      kgPerBag: num(s.kgPerBag) || 50,
      coops: int(s.coops) || 8,
      broodingToWeek: int(s.broodingToWeek) || 4,
      growerToWeek: int(s.growerToWeek) || 17,
      preLayToWeek: int(s.preLayToWeek) || 20,
      oldLayFromWeek: int(s.oldLayFromWeek) || 72
    };
  }

  // Split a whole number of pesewas by weights so the parts add up EXACTLY to the total.
  function allocate(totalCents, weights) {
    var sumW = weights.reduce(function (a, w) { return a + Math.max(0, w); }, 0);
    var out = weights.map(function () { return 0; });
    if (!sumW || !totalCents) return out;
    var rema = [], used = 0;
    weights.forEach(function (w, i) {
      var exact = totalCents * Math.max(0, w) / sumW;
      var base = totalCents >= 0 ? Math.floor(exact) : Math.ceil(exact);
      out[i] = base; used += base; rema.push({ i: i, r: Math.abs(exact - base) });
    });
    var left = totalCents - used, step = left > 0 ? 1 : -1;
    rema.sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (var k = 0; k < Math.abs(left); k++) out[rema[k % rema.length].i] += step;
    return out;
  }

  // ---------- flocks / birds ----------
  function flockAge(state, flock, date) {
    var s = settingsOf(state);
    var day = dayDiff(flock.arrival, date) + 1;
    var week = Math.max(1, Math.ceil(day / 7));
    var stage;
    if (flock.status === 'closed') stage = 'Closed';
    else if (day < 1) stage = 'Not arrived';
    else if (flock.stageOverride) stage = flock.stageOverride; // set by hand in the app
    else if (week <= s.broodingToWeek) stage = 'Brooding';
    else if (week <= s.growerToWeek) stage = 'Growing';
    else if (week <= s.preLayToWeek) stage = 'Pre-lay';
    else if (week < s.oldLayFromWeek) stage = 'Laying';
    else stage = 'Old lay';
    return { day: day, week: week, stage: stage };
  }

  // If the same product code is in the list twice, the active egg product wins (never a blank copy).
  function productMap(state) {
    var m = {};
    (state.products || []).forEach(function (p) {
      if (!p || p.id === undefined) return;
      var old = m[p.id];
      if (!old) { m[p.id] = p; return; }
      var score = function (x) { return (x.active !== false ? 2 : 0) + (int(x.eggsPerUnit) > 0 ? 1 : 0); };
      if (score(p) > score(old)) m[p.id] = p;
    });
    return m;
  }
  // eggs in one unit; an egg product left at 0/blank falls back to the number in its name "(30)", then to eggs per crate
  function eggsIn(state, p) {
    var n = int(p && p.eggsPerUnit);
    if (n > 0 || !p || (p.kind !== 'good' && p.kind !== 'cracked')) return n;
    var m = /\((\d+)\)/.exec(String(p.name || ''));
    return m ? int(m[1]) : (settingsOf(state).eggsPerCrate || 30);
  }
  function userMap(state) { return byId(state.users); }

  // Birds that left the flock: deaths + culls from daily records, and spent hens sold.
  function birdsAlive(state, flock, uptoDate) {
    var gone = 0;
    live(state.daily).forEach(function (d) {
      if (d.flockId === flock.id && (!uptoDate || d.date <= uptoDate)) gone += int(d.deaths) + int(d.culls);
    });
    var pm = productMap(state);
    live(state.sales).forEach(function (sale) {
      if (uptoDate && sale.date > uptoDate) return;
      (sale.items || []).forEach(function (it) {
        var p = pm[it.productId];
        if (p && p.kind === 'hen' && it.flockId === flock.id) gone += int(it.qty);
      });
    });
    live(state.moves).forEach(function (m) {
      if (uptoDate && m.date > uptoDate) return;
      if (m.fromFlockId === flock.id) gone += int(m.birds);
      if (m.toFlockId === flock.id) gone -= int(m.birds);
    });
    return int(flock.chicks) - gone;
  }
  // ---------- WHITE and BROWN eggs ----------
  // Entries made before colours existed count as the farm's main colour (Settings › defaultEggColour, brown at first).
  function defaultColour(state) { return String((state.settings || {}).defaultEggColour || '').toLowerCase() === 'white' ? 'white' : 'brown'; }
  function flockColour(state, f) { var c = f && String(f.colour || '').toLowerCase(); return c === 'white' || c === 'brown' ? c : defaultColour(state); }
  function lineColour(state, l) { var c = l && String(l.colour || '').toLowerCase(); return c === 'white' || c === 'brown' ? c : defaultColour(state); }
  // colours of the birds in a coop on a day (its own + birds moved in that are a different colour)
  function flockColours(state, f, date) {
    var set = {}; set[flockColour(state, f)] = 1;
    live(state.moves).forEach(function (m) { if (m.toFlockId === f.id && (!date || m.date <= date)) set[m.colour === 'white' ? 'white' : 'brown'] = 1; });
    return Object.keys(set).sort();
  }
  // colours the farm uses — when only one, the app shows no colour choices at all
  function coloursInUse(state) {
    var set = {}; set[defaultColour(state)] = 1;
    live(state.flocks).forEach(function (f) { set[flockColour(state, f)] = 1; });
    live(state.moves).forEach(function (m) { set[m.colour === 'white' ? 'white' : 'brown'] = 1; });
    return ['brown', 'white'].filter(function (c) { return set[c]; });
  }
  function cz() { return { good: 0, cracked: 0, white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } }; }
  function cadd(t, e, sign, col) {
    sign = sign === undefined ? 1 : sign;
    t.good += sign * e.good; t.cracked += sign * e.cracked;
    if (e.white) { t.white.good += sign * e.white.good; t.white.cracked += sign * e.white.cracked; t.brown.good += sign * e.brown.good; t.brown.cracked += sign * e.brown.cracked; }
    else { var c = col || e.colour || 'brown'; t[c].good += sign * e.good; t[c].cracked += sign * e.cracked; }
    return t;
  }
  function birdsAtStartOf(state, flock, date) { return birdsAlive(state, flock, addDays(date, -1)); }

  function activeFlocks(state, date) {
    return live(state.flocks).filter(function (f) {
      if (date && f.arrival > date) return false;
      if (f.status === 'closed') return date ? (f.closedOn && f.closedOn >= date) : false;
      return true;
    });
  }
  function flockInCoop(state, coop, date) {
    var list = activeFlocks(state, date).filter(function (f) { return int(f.coop) === int(coop); });
    return list.length ? list[list.length - 1] : null;
  }

  // ---------- eggs ----------
  // A coop can have several collections in one day; this adds them up.
  // Feed used in a daily record, in kg. Records made before v2 stored bags: those are converted.
  function feedKgOf(state, d, items) {
    if (!d) return 0;
    if (d.feedKg !== undefined && d.feedKg !== null && d.feedKg !== '') return num(d.feedKg);
    if (num(d.feedBags) > 0) return itemKg(state, (items || byId(state.items))[d.feedItemId], d.feedBags, 'bag');
    return 0;
  }
  function kg1(x) { return Math.round(x * 10) / 10; }
  function dayRecords(state, flockId, date, excludeId) {
    return live(state.daily).filter(function (x) { return x.flockId === flockId && x.date === date && x.id !== excludeId; });
  }
  function dayTotal(state, flockId, date, excludeId) {
    var t = { good: 0, cracked: 0, total: 0, deaths: 0, culls: 0, feedKg: 0, count: 0, white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } }, items = byId(state.items);
    dayRecords(state, flockId, date, excludeId).forEach(function (x) {
      var e = dailyEggs(state, x); cadd(t, e, 1); t.total += e.total;
      t.deaths += int(x.deaths); t.culls += int(x.culls); t.feedKg += feedKgOf(state, x, items); t.count++;
    });
    return t;
  }
  function weekStart(date) { var d = new Date(parseDay(date)).getUTCDay(); return addDays(date, -((d + 6) % 7)); } // Monday
  function dailyEggs(state, d) {
    var epc = settingsOf(state).eggsPerCrate, w = { good: 0, cracked: 0 }, b = { good: 0, cracked: 0 };
    if (d.split) {   // a coop with white AND brown layers: counted apart
      w = { good: int(d.whiteCrates) * epc + int(d.whitePieces), cracked: int(d.whiteCracked) };
      b = { good: int(d.brownCrates) * epc + int(d.brownPieces), cracked: int(d.brownCracked) };
    } else {
      var f = (state.flocks || []).filter(function (x) { return x.id === d.flockId; })[0];
      var one = { good: int(d.goodCrates) * epc + int(d.goodPieces), cracked: int(d.cracked) };
      if (flockColour(state, f) === 'white') w = one; else b = one;
    }
    var good = w.good + b.good, cracked = w.cracked + b.cracked;
    return { good: good, cracked: cracked, total: good + cracked, white: w, brown: b };
  }
  function layRate(state, d) {
    var flock = byId(state.flocks)[d.flockId];
    if (!flock) return 0;
    var birds = birdsAtStartOf(state, flock, d.date);
    if (birds <= 0) return 0;
    return Math.round(dayTotal(state, d.flockId, d.date).total / birds * 1000) / 10; // whole day, all collections; one decimal
  }
  function toCrates(state, pieces) {
    var epc = settingsOf(state).eggsPerCrate, sign = pieces < 0 ? -1 : 1, p = Math.abs(int(pieces));
    return { sign: sign, crates: Math.floor(p / epc), pieces: p % epc };
  }
  function cratesText(state, pieces) {
    var c = toCrates(state, pieces);
    var t = c.crates + ' cr' + (c.pieces ? ' + ' + c.pieces : '');
    return (c.sign < 0 && (c.crates || c.pieces) ? '−' : '') + t;
  }

  // Egg pieces a sale/stock line moves, split into good and cracked.
  function lineEggs(state, line) {
    var p = productMap(state)[line.productId];
    if (!p) return { good: 0, cracked: 0 };
    var pcs = int(line.qty) * eggsIn(state, p);
    var col = lineColour(state, line);
    if (p.kind === 'good') return { good: pcs, cracked: 0, colour: col };
    if (p.kind === 'cracked') return { good: 0, cracked: pcs, colour: col };
    return { good: 0, cracked: 0, colour: col };
  }
  function isCarrySale(state, sale) {
    var u = userMap(state)[sale.by];
    return !!(u && u.role === 'sales');
  }

  // Eggs sitting in the farm store (not with salespeople).
  function eggStore(state, uptoDate) {
    var t = cz();
    live(state.daily).forEach(function (d) {
      if (uptoDate && d.date > uptoDate) return;
      cadd(t, dailyEggs(state, d), 1);
    });
    live(state.stock).forEach(function (m) {
      if (uptoDate && m.date > uptoDate) return;
      if (m.kind === 'adjust') {
        var k = m.eggKind === 'cracked' ? 'cracked' : 'good', e = { good: 0, cracked: 0 }; e[k] = int(m.pieces);
        cadd(t, e, 1, lineColour(state, m));
        return;
      }
      var sign = m.kind === 'out' ? -1 : m.kind === 'return' ? 1 : 0;
      (m.lines || []).forEach(function (l) { cadd(t, lineEggs(state, l), sign); });
    });
    live(state.sales).forEach(function (s) {
      if (uptoDate && s.date > uptoDate) return;
      if (isCarrySale(state, s)) return;
      (s.items || []).forEach(function (l) { cadd(t, lineEggs(state, l), -1); });
    });
    return t;
  }

  // A salesperson's eggs for one day: opening + taken − sold − returned − broken = still with them.
  function carry(state, userId, date) {
    var zero = cz;
    var opening = zero(), out = zero(), sold = zero(), back = zero(), broken = zero(), returned = false;
    function add(t, e, sign, col) { cadd(t, e, sign, col); }
    live(state.stock).forEach(function (m) {
      if (m.salesUserId !== userId || m.date > date || m.kind === 'adjust') return;
      var today = m.date === date;
      (m.lines || []).forEach(function (l) {
        var e = lineEggs(state, l);
        if (m.kind === 'out') add(today ? out : opening, e, today ? 1 : 1);
        if (m.kind === 'return') add(today ? back : opening, e, today ? 1 : -1);
      });
      if (m.kind === 'return') {
        // broken eggs: the main fields are the main colour; brokenWhite… / brokenBrown… when both colours are used
        var main = defaultColour(state), other = main === 'white' ? 'brown' : 'white', cap = function (c) { return c === 'white' ? 'White' : 'Brown'; };
        var bm = { good: int(m.brokenGood), cracked: int(m.brokenCracked) }, bo = { good: int(m['broken' + cap(other) + 'Good']), cracked: int(m['broken' + cap(other) + 'Cracked']) };
        add(today ? broken : opening, bm, today ? 1 : -1, main);
        add(today ? broken : opening, bo, today ? 1 : -1, other);
        if (today) returned = true;
      }
    });
    live(state.sales).forEach(function (s) {
      if (s.by !== userId || s.date > date || !isCarrySale(state, s)) return;
      var today = s.date === date;
      (s.items || []).forEach(function (l) { add(today ? sold : opening, lineEggs(state, l), today ? 1 : -1); });
    });
    var rem = function (k) { return { good: opening[k].good + out[k].good - sold[k].good - back[k].good - broken[k].good, cracked: opening[k].cracked + out[k].cracked - sold[k].cracked - back[k].cracked - broken[k].cracked }; };
    var remaining = {
      good: opening.good + out.good - sold.good - back.good - broken.good,
      cracked: opening.cracked + out.cracked - sold.cracked - back.cracked - broken.cracked,
      white: rem('white'), brown: rem('brown')
    };
    return { opening: opening, out: out, sold: sold, returned: back, broken: broken, remaining: remaining, returnRecorded: returned,
      balanced: returned && remaining.good === 0 && remaining.cracked === 0 && remaining.white.good === 0 && remaining.white.cracked === 0 };
  }

  // ---------- money: sales, customers ----------
  function saleTotals(sale) {
    var total = 0, paid = 0;
    (sale.items || []).forEach(function (it) { total += Math.round(num(it.qty) * num(it.price) * 100); });
    (sale.payments || []).forEach(function (p) { paid += cents(p.amount); });
    return { totalCents: total, paidCents: paid, total: fromCents(total), paid: fromCents(paid) };
  }
  function customerLedger(state, customerId, excludeId) {
    var c = byId(state.customers)[customerId];
    var rows = [];
    live(state.sales).forEach(function (s) {
      if (s.customerId !== customerId || s.id === excludeId) return;
      var t = saleTotals(s);
      rows.push({ id: s.id, date: s.date, createdAt: s.createdAt, kind: 'sale', ref: s.receiptNo, debit: t.totalCents, credit: t.paidCents });
    });
    live(state.payments).forEach(function (p) {
      if (p.customerId !== customerId || p.id === excludeId) return;
      rows.push({ id: p.id, date: p.date, createdAt: p.createdAt, kind: 'payment', ref: p.receiptNo, debit: 0, credit: cents(p.amount) });
    });
    rows = sortChrono(rows);
    var bal = c ? cents(c.opening) : 0;
    rows.forEach(function (r) { bal += r.debit - r.credit; r.balanceCents = bal; r.balance = fromCents(bal); });
    return { openingCents: c ? cents(c.opening) : 0, rows: rows, balanceCents: bal, balance: fromCents(bal) };
  }
  function customerBalance(state, customerId, excludeId) { return customerLedger(state, customerId, excludeId).balanceCents; }
  // White eggs use the white prices when the owner has set them (more than 0); otherwise the normal price.
  function priceFor(product, customer, colour) {
    if (!product) return 0;
    var white = colour === 'white' && num(product.retailWhite) > 0;
    var r = white ? num(product.retailWhite) : num(product.retail), w = white ? num(product.wholesaleWhite) : num(product.wholesale);
    var wholesale = customer && customer.priceType === 'wholesale' && w > 0;
    return wholesale ? w : r;
  }

  function validateSale(state, sale, user) {
    var errors = [], warnings = [];
    var cust = byId(state.customers)[sale.customerId];
    var pm = productMap(state);
    if (!cust) errors.push('Choose a customer.');
    var items = (sale.items || []).filter(function (i) { return num(i.qty) !== 0; });
    if (!items.length) errors.push('Add at least one product.');
    items.forEach(function (it) {
      var p = pm[it.productId];
      if (!p) { errors.push('Unknown product.'); return; }
      if (num(it.qty) < 0 || Math.round(num(it.qty)) !== num(it.qty)) errors.push(p.name + ': quantity must be a whole number.');
      if (num(it.price) <= 0) errors.push(p.name + ': price must be more than 0.');
      if (p.kind === 'hen') {
        var fl = byId(state.flocks)[it.flockId];
        if (!fl) errors.push(p.name + ': choose which coop the hens come from.');
        else if (int(it.qty) > birdsAlive(state, fl, sale.date)) errors.push(p.name + ': Coop ' + fl.coop + ' has only ' + birdsAlive(state, fl, sale.date) + ' birds.');
      }
    });
    (sale.payments || []).forEach(function (p) {
      if (num(p.amount) < 0) errors.push('Payment amounts cannot be negative.');
      if (p.method === 'MoMo' && num(p.amount) > 0 && !String(p.ref || '').trim()) warnings.push('MoMo payment has no reference number.');
    });
    var t = saleTotals(sale);
    var prev = cust ? customerBalance(state, cust.id, sale.id) : 0;
    var next = prev + t.totalCents - t.paidCents;
    if (cust) {
      if (!cust.credit && t.paidCents < t.totalCents) errors.push(cust.name + ' is a cash-only customer: they must pay the full GH₵ ' + fromCents(t.totalCents).toFixed(2) + '.');
      if (cust.credit && num(cust.limit) > 0 && next > cents(cust.limit) && next > prev) {
        var msg = 'New debt GH₵ ' + fromCents(next).toFixed(2) + ' is above ' + cust.name + '’s credit limit of GH₵ ' + num(cust.limit).toFixed(2) + '.';
        if (user && user.role === 'owner') warnings.push(msg + ' (Owner can still confirm.)'); else errors.push(msg);
      }
      if (next < 0) warnings.push('Customer paid more than owed: they will have GH₵ ' + fromCents(-next).toFixed(2) + ' credit.');
    }
    // stock checks (warnings only: another phone may not have synced yet)
    var need = cz();
    items.forEach(function (it) { cadd(need, lineEggs(state, it), 1); });
    if (need.good || need.cracked) {
      var have, two = coloursInUse(state).length > 1;
      var other = Object.assign({}, state, { sales: live(state.sales).filter(function (s) { return s.id !== sale.id; }) });
      if (user && user.role === 'sales') have = carry(other, user.id, sale.date).remaining;
      else have = eggStore(other, sale.date);
      var where = user && user.role === 'sales' ? 'recorded with you' : 'in the store';
      ['brown', 'white'].forEach(function (c) {
        var lab = two ? c + ' ' : '';
        if (need[c].good > have[c].good) warnings.push('Only ' + cratesText(state, Math.max(0, have[c].good)) + ' good ' + lab + 'eggs ' + where + '.');
        if (need[c].cracked > have[c].cracked) warnings.push('Only ' + cratesText(state, Math.max(0, have[c].cracked)) + ' cracked ' + lab + 'eggs available.');
      });
    }
    return { errors: errors, warnings: warnings, totals: t, prevCents: prev, newCents: next };
  }

  // ---------- daily record checks ----------
  function validateDaily(state, d) {
    var errors = [], warnings = [];
    var flock = byId(state.flocks)[d.flockId];
    if (!flock) { errors.push('Choose a coop.'); return { errors: errors, warnings: warnings }; }
    if (!d.date) errors.push('Choose the date.');
    if (d.date < flock.arrival) errors.push('Date is before this flock arrived (' + flock.arrival + ').');
    if (d.today && d.date > d.today) errors.push('Date cannot be in the future.');
    ['goodCrates', 'goodPieces', 'cracked', 'deaths', 'culls', 'feedKg', 'feedBags', 'water'].forEach(function (k) {
      if (num(d[k]) < 0) errors.push('Numbers cannot be negative.');
    });
    ['goodCrates', 'goodPieces', 'cracked', 'deaths', 'culls', 'whiteCrates', 'whitePieces', 'whiteCracked', 'brownCrates', 'brownPieces', 'brownCracked'].forEach(function (k) {
      if (num(d[k]) < 0) errors.push('Numbers cannot be negative.');
      if (Math.round(num(d[k])) !== num(d[k])) errors.push('Eggs and birds must be whole numbers.');
    });
    var others = dayTotal(state, d.flockId, d.date, d.id), round = others.count + 1;
    var epc = settingsOf(state).eggsPerCrate;
    if (int(d.goodPieces) >= epc) warnings.push(int(d.goodPieces) + ' loose pieces is a full crate or more — did you mean crates?');
    var birds = birdsAtStartOf(state, flock, d.date);
    var e = dailyEggs(state, d), dayEggs = others.total + e.total;
    if (round > 1) warnings.push('This is collection ' + round + ' for Coop ' + flock.coop + ' on ' + d.date + '. Its eggs are added to the day: ' + cratesText(state, dayEggs) + ' in total.');
    if (dayEggs > birds) errors.push((round > 1 ? 'With this collection the day has ' : '') + dayEggs + ' eggs — more than the ' + birds + ' birds in Coop ' + flock.coop + '.');
    if (others.deaths + others.culls + int(d.deaths) + int(d.culls) > birds) errors.push('Deaths are more than the birds left.');
    var thisKg = feedKgOf(state, d);
    if (thisKg > 0 && !d.feedItemId) errors.push('Choose the type of feed used.');
    if (thisKg > 0 && birds > 0 && thisKg / birds > 0.4) warnings.push(kg1(thisKg) + ' kg of feed is ' + Math.round(thisKg / birds * 1000) + ' g per bird — a laying hen eats about 110–130 g a day. Check the number.');
    // compare with this coop's last 7 records
    // compare with this coop's last 7 days (whole-day totals)
    var pastDates = {};
    live(state.daily).forEach(function (x) { if (x.flockId === d.flockId && x.date < d.date) pastDates[x.date] = 1; });
    var past = Object.keys(pastDates).sort().slice(-7).map(function (dt) { return dayTotal(state, d.flockId, dt); });
    if (past.length >= 3) {
      var avg = function (f) { return past.reduce(function (a, x) { return a + f(x); }, 0) / past.length; };
      var aEggs = avg(function (x) { return x.total; }), aCr = avg(function (x) { return x.cracked; }), aFeed = avg(function (x) { return x.feedKg; });
      var dayCr = others.cracked + int(d.cracked), dayFeed = others.feedKg + thisKg;
      if (round === 1 && aEggs > 0 && dayEggs < aEggs * 0.85) warnings.push('Eggs are ' + Math.round((1 - dayEggs / aEggs) * 100) + '% lower than this coop’s recent average (' + cratesText(state, Math.round(aEggs)) + ' a day). If you collect again later, add it as another collection.');
      if (aEggs > 0 && dayEggs > aEggs * 1.15) warnings.push('Eggs for the day are ' + Math.round((dayEggs / aEggs - 1) * 100) + '% higher than the recent average (' + cratesText(state, Math.round(aEggs)) + ').');
      if (dayCr >= 5 && dayCr > aCr * 2) warnings.push(dayCr + ' cracked eggs today is higher than usual (average ' + Math.round(aCr) + ').');
      if (round === 1 && aFeed > 0 && Math.abs(dayFeed - aFeed) > aFeed * 0.25) warnings.push('Feed used (' + kg1(dayFeed) + ' kg) is different from usual (' + kg1(aFeed) + ' kg a day).');
    }
    var deadLimit = Math.max(3, Math.ceil(birds * 0.005));
    if (int(d.deaths) >= deadLimit) warnings.push(int(d.deaths) + ' deaths in one day is high — consider reporting an emergency and calling the vet.');
    return { errors: errors, warnings: warnings, eggs: e, round: round, dayEggs: dayEggs, birdsBefore: birds, feedKg: thisKg,
      gramsPerBird: birds > 0 ? Math.round((others.feedKg + thisKg) / birds * 1000) : 0,
      birdsAfter: birds - others.deaths - others.culls - int(d.deaths) - int(d.culls),
      layRate: birds > 0 ? Math.round(dayEggs / birds * 1000) / 10 : 0 };
  }

  // ---------- feed: stock, average cost, cost per coop ----------
  // Everything in the feed store is counted in kg. A bag = kgPerBag (50); a litre of oil = kgPerBag of that item (0.92).
  function itemKg(state, item, qty, unit) {
    var u = unit || (item && item.unit);
    if (u === 'bag') return num(qty) * (num(item && item.kgPerBag) || settingsOf(state).kgPerBag);
    if (u === 'litre' || u === 'l') return num(qty) * (num(item && item.kgPerBag) || 0.92);
    return num(qty);
  }
  // Recipes are written in PARTS (e.g. maize 50, soya 20 …). For a batch of N kg each ingredient gets N × part ÷ all parts.
  function recipeParts(recipe) { return (recipe && recipe.lines || []).reduce(function (a, l) { return a + num(l.kg); }, 0); }
  function recipeBatch(state, recipe, batchKg) {
    var total = recipeParts(recipe), items = byId(state.items), done = 0;
    var lines = (recipe && recipe.lines || []).filter(function (l) { return num(l.kg) > 0; }).map(function (l) {
      var kg = total ? Math.round(batchKg * num(l.kg) / total * 100) / 100 : 0;
      done += kg;
      var it = items[l.itemId] || {};
      return { itemId: l.itemId, parts: num(l.kg), pct: total ? Math.round(num(l.kg) / total * 1000) / 10 : 0, kg: kg,
        litres: it.unit === 'litre' ? Math.round(kg / (num(it.kgPerBag) || 0.92) * 100) / 100 : null };
    });
    // put any rounding difference on the biggest ingredient so the batch adds up exactly
    var diff = Math.round((batchKg - done) * 100) / 100;
    if (lines.length && diff) { var big = lines.reduce(function (a, b) { return b.kg > a.kg ? b : a; }); big.kg = Math.round((big.kg + diff) * 100) / 100; }
    return { lines: lines, parts: total, kg: batchKg };
  }
  // Feed types made on the farm (from a recipe or mixed before) — the rest are bought ready-made.
  function isOwnMix(state, itemId) {
    if (itemId === 'i-ownmix') return true;
    return (state.recipes || []).some(function (r) { return r.outputItemId === itemId; }) || live(state.feed).some(function (m) { return m.kind === 'mix' && m.outputItemId === itemId; });
  }
  function feedState(state) {
    var items = byId(state.items);
    var stock = {}; // itemId -> {kg, valueCents, lastAvg}
    function st(id) { return stock[id] || (stock[id] = { kg: 0, value: 0, lastAvg: 0, touched: false }); }
    function take(id, kg) {
      var s = st(id);
      var avg = s.kg > 0 ? s.value / s.kg : s.lastAvg;
      var cost = kg * avg;
      s.kg -= kg; s.value -= cost;
      if (s.kg <= 1e-9) { s.value = 0; if (s.kg > -1e-9) s.kg = 0; }
      s.lastAvg = avg;
      return cost;
    }
    function put(id, kg, valueCents) {
      var s = st(id);
      s.touched = true;
      if (s.kg < 0) s.value = 0;
      s.kg += kg; s.value += valueCents;
      if (s.kg > 0) s.lastAvg = s.value / s.kg;
    }
    var events = [];
    live(state.feed).forEach(function (m) { events.push({ date: m.date, createdAt: m.createdAt, m: m }); });
    live(state.daily).forEach(function (d) { if (d.feedItemId && feedKgOf(state, d, items) > 0) events.push({ date: d.date, createdAt: d.createdAt, d: d }); });
    var used = {}; // flockId|month -> cents
    var mixCost = {};
    sortChrono(events).forEach(function (ev) {
      if (ev.m) {
        var m = ev.m, it = items[m.itemId];
        if (m.kind === 'buy') put(m.itemId, itemKg(state, it, m.qty, m.qtyUnit), cents(m.cost));
        else if (m.kind === 'adjust') {
          var kg = itemKg(state, it, m.qty, m.qtyUnit);
          if (kg < 0) take(m.itemId, -kg); else put(m.itemId, kg, kg * (st(m.itemId).lastAvg || 0));
        } else if (m.kind === 'mix') {
          var total = 0, kgOut = 0;
          (m.lines || []).forEach(function (l) { total += take(l.itemId, num(l.kg)); kgOut += num(l.kg); });
          put(m.outputItemId, kgOut, total);
          mixCost[m.id] = { kg: kgOut, cents: Math.round(total), perKg: kgOut ? total / kgOut / 100 : 0 };
        }
      } else {
        var d = ev.d, kgUsed = feedKgOf(state, d, items);
        var c = take(d.feedItemId, kgUsed);
        var key = d.flockId + '|' + monthOf(d.date);
        used[key] = (used[key] || 0) + c;
      }
    });
    var out = {};
    live(state.items).forEach(function (it) {
      if (it.category !== 'feed' && it.category !== 'ingredient') return;
      var s = st(it.id), kgBag = num(it.kgPerBag) || settingsOf(state).kgPerBag;
      var avg = s.kg > 0 ? s.value / s.kg : s.lastAvg;
      var litre = it.unit === 'litre', shown = it.unit === 'bag' ? s.kg / kgBag : litre ? s.kg / (num(it.kgPerBag) || 0.92) : s.kg;
      kgBag = settingsOf(state).kgPerBag;
      out[it.id] = { kg: Math.round(s.kg * 100) / 100, bags: Math.round(s.kg / kgBag * 10) / 10, shown: Math.round(shown * 10) / 10,
        unit: it.unit === 'bag' ? 'bags' : litre ? 'litres' : 'kg', avgPerKg: Math.round(avg) / 100, valueCents: Math.round(Math.max(0, s.value)),
        low: s.touched && num(it.lowLevel) > 0 && shown <= num(it.lowLevel), tracked: s.touched, negative: s.kg < -1e-9 };
    });
    Object.keys(used).forEach(function (k) { used[k] = Math.round(used[k]); });
    return { items: out, usedCents: used, mixCost: mixCost };
  }
  function mixPreview(state, mix) {
    var fs = feedState(state), total = 0, kg = 0, lines = [];
    (mix.lines || []).forEach(function (l) {
      var s = fs.items[l.itemId] || { avgPerKg: 0, kg: 0 };
      var c = Math.round(num(l.kg) * s.avgPerKg * 100);
      total += c; kg += num(l.kg);
      lines.push({ itemId: l.itemId, kg: num(l.kg), costCents: c, short: num(l.kg) > s.kg });
    });
    var kgBag = settingsOf(state).kgPerBag;
    return { lines: lines, kg: kg, totalCents: total, perBagCents: kg ? Math.round(total / kg * kgBag) : 0 };
  }

  // ---------- medicine store: first-to-expire goes out first ----------
  function medState(state, today) {
    var items = live(state.items).filter(function (i) { return i.category === 'medicine'; });
    var batches = {}, lastUnit = {}, used = {};
    var ev = sortChrono(live(state.med));
    ev.forEach(function (m) {
      var b = batches[m.itemId] || (batches[m.itemId] = []);
      if (m.kind === 'in') {
        var unit = num(m.qty) ? cents(m.cost) / num(m.qty) : 0;
        b.push({ qty: num(m.qty), unit: unit, expiry: m.expiry || '9999-12-31' });
        lastUnit[m.itemId] = unit;
        b.sort(function (x, y) { return x.expiry < y.expiry ? -1 : x.expiry > y.expiry ? 1 : 0; });
      } else if (m.kind === 'use' || m.kind === 'adjust') {
        var need = Math.abs(num(m.qty)), cost = 0;
        for (var i = 0; i < b.length && need > 1e-9; i++) {
          var t = Math.min(b[i].qty, need); b[i].qty -= t; need -= t; cost += t * b[i].unit;
        }
        if (need > 1e-9) { cost += need * (lastUnit[m.itemId] || 0); b.push({ qty: -need, unit: lastUnit[m.itemId] || 0, expiry: '9999-12-31' }); }
        if (m.kind === 'use' && m.flockId) {
          var key = m.flockId + '|' + monthOf(m.date);
          used[key] = (used[key] || 0) + cost;
        }
      }
    });
    var out = {};
    items.forEach(function (it) {
      var b = (batches[it.id] || []);
      var qty = b.reduce(function (a, x) { return a + x.qty; }, 0);
      var valid = b.filter(function (x) { return x.qty > 1e-9; });
      var expired = valid.filter(function (x) { return today && x.expiry < today; }).reduce(function (a, x) { return a + x.qty; }, 0);
      var next = valid.filter(function (x) { return x.expiry !== '9999-12-31' && (!today || x.expiry >= today); });
      var earliest = next.length ? next[0].expiry : '';
      out[it.id] = { qty: Math.round(qty * 100) / 100, expiredQty: Math.round(expired * 100) / 100, earliestExpiry: earliest,
        daysToExpiry: earliest && today ? dayDiff(today, earliest) : null,
        low: b.length > 0 && qty <= num(it.lowLevel), tracked: b.length > 0, expiringSoon: !!(earliest && today && dayDiff(today, earliest) <= 30) };
    });
    Object.keys(used).forEach(function (k) { used[k] = Math.round(used[k]); });
    return { items: out, usedCents: used };
  }

  // ---------- profit per coop, added up for the farm ----------
  // Income: egg sales are shared by how many eggs each coop laid that month;
  //         spent hens go to the coop they came from; other income (e.g. manure) by number of birds.
  // Costs:  feed and medicine go to the coop that used them; expenses for one coop go there;
  //         shared expenses (labour, power, transport) are split by number of birds on that date.
  function profit(state, month) {
    var s = settingsOf(state), pm = productMap(state);
    var flocks = live(state.flocks);
    var fs = feedState(state), ms = medState(state);
    var rows = {}, unassigned = { incomeCents: 0, costCents: 0 };
    function row(f) {
      return rows[f.id] || (rows[f.id] = { flockId: f.id, coop: int(f.coop), eggs: 0, eggIncome: 0, henIncome: 0, otherIncome: 0,
        feed: 0, med: 0, direct: 0, shared: 0 });
    }
    function splitByBirds(date, totalC, field) {
      var act = activeFlocks(state, date);
      var w = act.map(function (f) { return Math.max(0, birdsAlive(state, f, date)); });
      if (!act.length || !w.some(function (x) { return x > 0; })) return false;
      allocate(totalC, w).forEach(function (c, i) { row(act[i])[field] += c; });
      return true;
    }
    // eggs laid this month
    live(state.daily).forEach(function (d) {
      if (monthOf(d.date) !== month) return;
      var f = byId(flocks)[d.flockId]; if (!f) return;
      row(f).eggs += dailyEggs(state, d).total;
    });
    // income
    var eggPool = 0;
    live(state.sales).forEach(function (sale) {
      if (monthOf(sale.date) !== month) return;
      (sale.items || []).forEach(function (it) {
        var p = pm[it.productId], c = Math.round(num(it.qty) * num(it.price) * 100);
        if (!p) { unassigned.incomeCents += c; return; }
        if (p.kind === 'good' || p.kind === 'cracked') eggPool += c;
        else if (p.kind === 'hen') {
          var f = byId(flocks)[it.flockId];
          if (f) row(f).henIncome += c; else unassigned.incomeCents += c;
        } else if (!splitByBirds(sale.date, c, 'otherIncome')) unassigned.incomeCents += c;
      });
    });
    var eggRows = Object.keys(rows).map(function (k) { return rows[k]; }).filter(function (r) { return r.eggs > 0; });
    if (eggRows.length) allocate(eggPool, eggRows.map(function (r) { return r.eggs; })).forEach(function (c, i) { eggRows[i].eggIncome += c; });
    else unassigned.incomeCents += eggPool;
    // feed + medicine used
    [[fs.usedCents, 'feed'], [ms.usedCents, 'med']].forEach(function (pair) {
      Object.keys(pair[0]).forEach(function (k) {
        var parts = k.split('|'); if (parts[1] !== month) return;
        var f = byId(flocks)[parts[0]];
        if (f) row(f)[pair[1]] += pair[0][k]; else unassigned.costCents += pair[0][k];
      });
    });
    // expenses
    live(state.expenses).forEach(function (e) {
      if (monthOf(e.date) !== month) return;
      var c = cents(e.amount);
      if (int(e.coop) > 0) {
        var f = flockInCoop(state, e.coop, e.date);
        if (f) row(f).direct += c; else unassigned.costCents += c;
      } else if (!splitByBirds(e.date, c, 'shared')) unassigned.costCents += c;
    });
    var list = Object.keys(rows).map(function (k) {
      var r = rows[k];
      r.incomeCents = r.eggIncome + r.henIncome + r.otherIncome;
      r.costCents = r.feed + r.med + r.direct + r.shared;
      r.profitCents = r.incomeCents - r.costCents;
      return r;
    }).sort(function (a, b) { return a.coop - b.coop; });
    var tot = { eggs: 0, incomeCents: unassigned.incomeCents, costCents: unassigned.costCents };
    list.forEach(function (r) { tot.eggs += r.eggs; tot.incomeCents += r.incomeCents; tot.costCents += r.costCents; });
    tot.profitCents = tot.incomeCents - tot.costCents;
    return { month: month, rows: list, unassigned: unassigned, total: tot, coops: s.coops };
  }

  // Whole life of one flock, including what the chicks cost.
  function flockLifetime(state, flock, today) {
    var months = {};
    var end = flock.status === 'closed' && flock.closedOn ? flock.closedOn : today;
    for (var m = monthOf(flock.arrival); m <= monthOf(end); m = monthOf(addMonths(m + '-01', 1))) months[m] = 1;
    var inc = 0, cost = 0, eggs = 0;
    Object.keys(months).forEach(function (m) {
      var p = profit(state, m);
      p.rows.forEach(function (r) { if (r.flockId === flock.id) { inc += r.incomeCents; cost += r.costCents; eggs += r.eggs; } });
    });
    var chick = Math.round(int(flock.chicks) * num(flock.costPerChick) * 100);
    return { incomeCents: inc, runningCostCents: cost, chickCostCents: chick, profitCents: inc - cost - chick, eggs: eggs };
  }

  // ---------- tasks ----------
  function generateFlockTasks(flock, template, makeId) {
    var out = [];
    (template || []).forEach(function (t) {
      var first = int(t.day); if (first < 1) return;
      var every = int(t.everyDays), until = int(t.untilDay) || first;
      for (var d = first; d <= (every > 0 ? until : first); d += (every > 0 ? every : 1)) {
        out.push({ id: makeId(), date: addDays(flock.arrival, d - 1), kind: t.type || 'Other', title: t.title,
          notes: t.notes || '', coops: [int(flock.coop)], flockId: flock.id, repeat: 'once', status: 'open', auto: true, flockDay: d });
        if (every <= 0) break;
      }
    });
    return out;
  }
  // Repeat codes: once, daily, weekly, 2weeks, monthly, and any "every N": d:N (days), w:N (weeks), m:N (months)
  function repeatCode(every, unit) {
    var n = Math.max(1, int(every) || 1);
    if (unit === 'weeks') return n === 1 ? 'weekly' : n === 2 ? '2weeks' : 'w:' + n;
    if (unit === 'months') return n === 1 ? 'monthly' : 'm:' + n;
    return n === 1 ? 'daily' : 'd:' + n;
  }
  function repeatParts(repeat) {
    if (repeat === 'daily') return { n: 1, unit: 'days' };
    if (repeat === 'weekly') return { n: 1, unit: 'weeks' };
    if (repeat === '2weeks') return { n: 2, unit: 'weeks' };
    if (repeat === 'monthly') return { n: 1, unit: 'months' };
    var m = /^([dwm]):(\d+)$/.exec(String(repeat || ''));
    if (m) return { n: Math.max(1, int(m[2])), unit: m[1] === 'd' ? 'days' : m[1] === 'w' ? 'weeks' : 'months' };
    return null;
  }
  function repeatText(repeat) {
    var r = repeatParts(repeat);
    if (!r) return 'Once';
    var one = { days: 'day', weeks: 'week', months: 'month' }[r.unit];
    return r.n === 1 ? 'Every ' + one : 'Every ' + r.n + ' ' + r.unit;
  }
  // the i-th date of a repeat, counted from the start (so monthly from the 31st stays on the last day, it never drifts)
  function repeatDate(start, repeat, i) {
    var r = repeatParts(repeat);
    if (!r) return i === 0 ? start : null;
    if (r.unit === 'days') return addDays(start, i * r.n);
    if (r.unit === 'weeks') return addDays(start, i * 7 * r.n);
    return addMonths(start, i * r.n);
  }
  /** All dates of a series. end = { times: N } or { until: 'YYYY-MM-DD' }. Never more than max (120). */
  function seriesDates(start, repeat, end, max) {
    max = max || 120;
    var out = [], times = end && int(end.times), until = end && end.until;
    if (!start || (!times && !until)) return out;
    for (var i = 0; i < max + 1; i++) {
      var d = repeatDate(start, repeat, i);
      if (!d) break;
      if (until && d > until) break;
      if (times && out.length >= times) break;
      out.push(d);
    }
    return out;
  }
  function nextDate(date, repeat) {
    var r = repeatParts(repeat);
    if (r && /^[dwm]:/.test(repeat)) return r.unit === 'days' ? addDays(date, r.n) : r.unit === 'weeks' ? addDays(date, 7 * r.n) : addMonths(date, r.n);
    if (repeat === 'daily') return addDays(date, 1);
    if (repeat === 'weekly') return addDays(date, 7);
    if (repeat === '2weeks') return addDays(date, 14);
    if (repeat === 'monthly') return addMonths(date, 1);
    return null;
  }
  function taskStatus(task, today) {
    if (task.status === 'done' || task.status === 'handled') return 'done';
    if (task.kind === 'Emergency') return 'emergency';
    var d = dayDiff(today, task.date);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    if (d <= 2) return 'soon';
    return 'later';
  }

  // ---------- dashboard ----------
  function dashboard(state, today) {
    var flocks = activeFlocks(state, today);
    var eggsToday = { good: 0, cracked: 0, total: 0, white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } }, deaths = 0, birdsBefore = 0, recorded = 0, seenFlock = {};
    live(state.daily).forEach(function (d) {
      if (d.date !== today) return;
      var e = dailyEggs(state, d); cadd(eggsToday, e, 1); eggsToday.total += e.total;
      deaths += int(d.deaths) + int(d.culls);
      if (seenFlock[d.flockId]) return;
      seenFlock[d.flockId] = 1; recorded++;
      var f = byId(state.flocks)[d.flockId]; if (f) birdsBefore += birdsAtStartOf(state, f, today);
    });
    var birds = flocks.reduce(function (a, f) { return a + birdsAlive(state, f, today); }, 0);
    var salesToday = 0, bySeller = {};
    live(state.sales).forEach(function (s) {
      if (s.date !== today) return;
      var t = saleTotals(s).totalCents; salesToday += t; bySeller[s.by] = (bySeller[s.by] || 0) + t;
    });
    var cashToday = 0;
    live(state.sales).forEach(function (s) { if (s.date === today) cashToday += saleTotals(s).paidCents; });
    live(state.payments).forEach(function (p) { if (p.date === today) cashToday += cents(p.amount); });
    var debt = 0, debtors = 0;
    live(state.customers).forEach(function (c) { var b = customerBalance(state, c.id); if (b > 0) { debt += b; debtors++; } });
    var tasks = { overdue: 0, today: 0, soon: 0, emergency: 0 };
    live(state.tasks).forEach(function (t) { var st = taskStatus(t, today); if (tasks[st] !== undefined) tasks[st]++; });
    var layingFlocks = flocks.filter(function (f) { var a = flockAge(state, f, today); return a.stage === 'Laying' || a.stage === 'Old lay'; });
    return { eggsToday: eggsToday, layRate: birdsBefore ? Math.round(eggsToday.total / birdsBefore * 1000) / 10 : 0,
      coopsRecorded: recorded, coopsActive: flocks.length, layingCoops: layingFlocks.length,
      deaths: deaths, birds: birds, salesTodayCents: salesToday, cashTodayCents: cashToday, bySeller: bySeller,
      store: eggStore(state, today), debtCents: debt, debtors: debtors, tasks: tasks };
  }

  // ---------- DEBTS: how much, how old, who ----------
  // Age of a debt = days since the oldest sale that is not yet paid off (payments clear the oldest first).
  function oldestUnpaidDate(state, customerId, today) {
    var L = customerLedger(state, customerId);
    var paid = L.rows.reduce(function (a, r) { return a + r.credit; }, 0) + Math.max(0, -L.openingCents);
    var owed = Math.max(0, L.openingCents);
    var c = byId(state.customers)[customerId];
    var start = c && c.createdAt ? String(c.createdAt).slice(0, 10) : (L.rows[0] ? L.rows[0].date : today);
    if (paid < owed) return start;
    paid -= owed;
    for (var i = 0; i < L.rows.length; i++) { if (paid < L.rows[i].debit) return L.rows[i].date; paid -= L.rows[i].debit; }
    return today;
  }
  function debtSummary(state, today) {
    var month = monthOf(today), buckets = [
      { label: '0–7 days', from: 0, to: 7, cents: 0, count: 0 }, { label: '8–30 days', from: 8, to: 30, cents: 0, count: 0 },
      { label: '31–60 days', from: 31, to: 60, cents: 0, count: 0 }, { label: 'Over 60 days', from: 61, to: 1e9, cents: 0, count: 0 }];
    var list = [], total = 0, credit = 0;
    live(state.customers).forEach(function (c) {
      var b = customerBalance(state, c.id);
      if (b < 0) credit += -b;
      if (b <= 0) return;
      var since = oldestUnpaidDate(state, c.id, today), days = Math.max(0, dayDiff(since, today));
      total += b;
      list.push({ id: c.id, name: c.name, phone: c.phone || '', cents: b, since: since, days: days, overLimit: !!(c.credit && num(c.limit) > 0 && b > cents(c.limit)) });
      for (var i = 0; i < buckets.length; i++) if (days >= buckets[i].from && days <= buckets[i].to) { buckets[i].cents += b; buckets[i].count++; break; }
    });
    list.sort(function (a, b) { return b.cents - a.cents; });
    var collected = 0, newDebt = 0;
    live(state.payments).forEach(function (p) { if (monthOf(p.date) === month) collected += cents(p.amount); });
    live(state.sales).forEach(function (s) { if (monthOf(s.date) !== month) return; var t = saleTotals(s); if (t.totalCents > t.paidCents) newDebt += t.totalCents - t.paidCents; });
    return { totalCents: total, count: list.length, buckets: buckets, customers: list, collectedThisMonthCents: collected, newDebtThisMonthCents: newDebt,
      overLimit: list.filter(function (x) { return x.overLimit; }).length, creditHeldCents: credit };
  }

  // ---------- HISTORY: any day, month or year ----------
  function periodSummary(state, from, to) {
    var days = {}, tot = { eggs: 0, good: 0, cracked: 0, birdDays: 0, deaths: 0, salesCents: 0, receivedCents: 0, debtPaidCents: 0, expensesCents: 0, records: 0, sales: 0 };
    function day(d) { return days[d] || (days[d] = { date: d, eggs: 0, birdDays: 0, deaths: 0, salesCents: 0, receivedCents: 0, records: 0, sales: 0 }); }
    var fl = byId(state.flocks), seenFD = {};
    live(state.daily).forEach(function (d) {
      if (d.date < from || d.date > to) return;
      var key = d.flockId + '|' + d.date, first = !seenFD[key]; seenFD[key] = 1;
      var e = dailyEggs(state, d), f = fl[d.flockId], bd = f && first ? birdsAtStartOf(state, f, d.date) : 0, x = day(d.date);
      x.eggs += e.total; x.birdDays += bd; x.deaths += int(d.deaths) + int(d.culls); x.records++;
      tot.eggs += e.total; tot.good += e.good; tot.cracked += e.cracked; tot.birdDays += bd; tot.deaths += int(d.deaths) + int(d.culls); tot.records++;
    });
    live(state.sales).forEach(function (s) {
      if (s.date < from || s.date > to) return;
      var t = saleTotals(s), x = day(s.date);
      x.salesCents += t.totalCents; x.receivedCents += t.paidCents; x.sales++;
      tot.salesCents += t.totalCents; tot.receivedCents += t.paidCents; tot.sales++;
    });
    live(state.payments).forEach(function (p) {
      if (p.date < from || p.date > to) return;
      day(p.date).receivedCents += cents(p.amount); tot.receivedCents += cents(p.amount); tot.debtPaidCents += cents(p.amount);
    });
    live(state.expenses).forEach(function (e) { if (e.date >= from && e.date <= to) tot.expensesCents += cents(e.amount); });
    var rows = Object.keys(days).sort().map(function (k) { var x = days[k]; x.layRate = x.birdDays ? Math.round(x.eggs / x.birdDays * 1000) / 10 : 0; return x; });
    tot.layRate = tot.birdDays ? Math.round(tot.eggs / tot.birdDays * 1000) / 10 : 0;
    return { from: from, to: to, total: tot, days: rows };
  }
  function yearSummary(state, year, today) {
    var months = [];
    for (var m = 1; m <= 12; m++) {
      var mm = year + '-' + pad(m), start = mm + '-01', end = lastDayOfMonth(mm);
      if (today && start > today) break;
      var p = periodSummary(state, start, today && end > today ? today : end);
      p.month = mm; months.push(p);
    }
    var tot = { eggs: 0, deaths: 0, salesCents: 0, receivedCents: 0, expensesCents: 0, birdDays: 0 };
    months.forEach(function (p) { Object.keys(tot).forEach(function (k) { tot[k] += p.total[k]; }); });
    tot.layRate = tot.birdDays ? Math.round(tot.eggs / tot.birdDays * 1000) / 10 : 0;
    return { year: year, months: months, total: tot };
  }

  // ---------- ALARMS inside the app ----------
  // Owner settings: appAlarmSound, appAlarmBefore (minutes), appAlarmCollect / appAlarmTasks (roles, comma between),
  // collectionTimes, alarmHour. Returns the alarms one person should hear on one day, earliest first.
  function alarmSettings(state) {
    var s = state.settings || {};
    var roles = function (v, d) { return String(v === undefined || v === '' ? d : v).toLowerCase().split(/[,;\s]+/).filter(Boolean); };
    var before = int(s.appAlarmBefore); if ([0, 5, 10, 15, 30, 60].indexOf(before) < 0) before = 0;
    var sound = String(s.appAlarmSound || 'chime').toLowerCase(); if (['chime', 'marimba', 'rise', 'bell'].indexOf(sound) < 0) sound = 'chime';
    var ft = parseTimes(s.followUpTime)[0] || '09:00', fd = int(s.waitFollowDays) > 0 ? int(s.waitFollowDays) : 21;
    return { sound: sound, before: before, collect: roles(s.appAlarmCollect, 'owner,manager,farmhand'), tasks: roles(s.appAlarmTasks, 'owner,manager,farmhand'), followTime: ft, followDays: fd,
      times: parseTimes(s.collectionTimes), hour: s.alarmHour === undefined || s.alarmHour === '' ? 6 : int(s.alarmHour) };
  }
  function parseTimes(text) {
    var out = [];
    String(text || '').split(/[,;\s]+/).forEach(function (t) {
      var m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(t.trim());
      if (m) out.push(pad(int(m[1])) + ':' + m[2]);
    });
    return out.sort();
  }
  function hm(t) { var p = String(t || '').split(/[:.]/); return int(p[0]) * 60 + int(p[1]); }
  function hmText(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  // ring time = event time minus "minutes before" (may move to the day before)
  function shiftBack(date, time, before) {
    var m = hm(time) - before, d = date;
    while (m < 0) { m += 1440; d = addDays(d, -1); }
    return { date: d, time: hmText(m) };
  }
  function alarmsFor(state, user, date) {
    if (!user) return [];
    var A = alarmSettings(state), out = [], role = String(user.role || '');
    // look at today and tomorrow, so "30 minutes before 00:10" is not missed
    [date, addDays(date, 1)].forEach(function (d) {
      if (A.collect.indexOf(role) >= 0) A.times.forEach(function (t) {
        var r = shiftBack(d, t, A.before);
        out.push({ key: 'col|' + d + '|' + t, kind: 'collect', date: r.date, time: r.time, eventTime: t, eventDate: d,
          title: 'Egg collection ' + t, sub: 'Collect eggs from all coops' + (A.before ? ' · in ' + A.before + ' minutes' : ' · now') });
      });
      if (A.tasks.indexOf(role) >= 0) live(state.tasks).forEach(function (x) {
        if (x.status !== 'open' || x.kind === 'Emergency' || x.date !== d) return;
        if (x.assignee && x.assignee !== user.id && role !== 'owner') return;
        var t = /^\d{1,2}:\d{2}$/.test(x.time || '') ? pad(hm(x.time) / 60 | 0) + ':' + pad(hm(x.time) % 60) : pad(A.hour) + ':00';
        var r = shiftBack(d, t, A.before);
        var where = (x.coops && x.coops.length) ? 'Coop ' + x.coops.join(', ') : 'Whole farm';
        out.push({ key: 'task|' + x.id + '|' + d + '|' + t, kind: 'task', taskId: x.id, date: r.date, time: r.time, eventTime: t, eventDate: d,
          title: x.kind + ': ' + x.title, sub: where + ' · ' + t + (A.before ? ' (in ' + A.before + ' minutes)' : '') });
      });
    });
    // waiting-list follow-ups: the person who took the request, and the owner
    [date, addDays(date, 1)].forEach(function (d) {
      live(state.waiting).forEach(function (w) {
        if (w.status !== 'waiting' || w.nextCall !== d) return;
        if (!(role === 'owner' || w.by === user.id)) return;
        var r = shiftBack(d, A.followTime, A.before);
        out.push({ key: 'wait|' + w.id + '|' + d, kind: 'waiting', waitId: w.id, date: r.date, time: r.time, eventTime: A.followTime, eventDate: d,
          title: 'Call ' + (w.name || 'customer'), sub: (w.phone || '') + ' · wants ' + waitWants(state, w) + ' · waiting ' + dayDiff(w.date, d) + ' days' });
      });
    });
    return out.filter(function (a) { return a.date === date; }).sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
  }

  // ---------- WAITING LIST: people who want to buy before the product is ready ----------
  function waitWants(state, w) {
    var p = productMap(state)[w.productId];
    return (num(w.qty) ? num(w.qty) + ' × ' : '') + (p ? p.name : (w.wants || 'something'));
  }
  function waitingList(state, user, today) {
    var list = live(state.waiting).filter(function (w) { return !user || user.role === 'owner' || user.role === 'manager' || w.by === user.id; });
    var callNow = [], later = [], closed = [];
    list.forEach(function (w) {
      var x = { w: w, days: dayDiff(w.date, today), lastCall: (w.calls || []).slice(-1)[0] || null, wants: waitWants(state, w) };
      if (w.status !== 'waiting') closed.push(x);
      else if (w.nextCall && w.nextCall <= today) callNow.push(x);
      else later.push(x);
    });
    var byDate = function (a, b) { return a.w.date < b.w.date ? -1 : a.w.date > b.w.date ? 1 : 0; };
    callNow.sort(byDate); later.sort(function (a, b) { return a.w.nextCall < b.w.nextCall ? -1 : 1; });
    closed.sort(function (a, b) { return b.w.updatedAt - a.w.updatedAt; });
    return { callNow: callNow, later: later, closed: closed, open: callNow.length + later.length };
  }
  // Record a phone call: still waiting → next call in N days; bought / not interested → closed.
  function waitAfterCall(state, w, result, date, note, by, days) {
    var A = alarmSettings(state), n = int(days) > 0 ? int(days) : (int(w.followDays) || A.followDays);
    var out = JSON.parse(JSON.stringify(w));
    out.calls = (out.calls || []).concat([{ date: date, by: by, result: result, note: note || '' }]);
    if (result === 'waiting') { out.status = 'waiting'; out.nextCall = addDays(date, n); }
    else { out.status = result === 'bought' ? 'bought' : 'not'; out.nextCall = ''; out.closedOn = date; }
    return out;
  }

  // ---------- DELETE one entry / RESET one section (owner) ----------
  // What else changes if this entry is deleted — in plain words. blocked = it may not be deleted alone.
  function deleteImpact(state, r) {
    var L = [], blocked = '', S = settingsOf(state), cu = byId(state.customers), us = userMap(state), fl = byId(state.flocks), items = byId(state.items);
    var cr = function (p) { return cratesText(state, p); };
    var nm = function (id) { return (us[id] || {}).name || 'the salesperson'; };
    if (r.type === 'sales') {
      var t = saleTotals(r), owe = t.totalCents - t.paidCents, c = cu[r.customerId] || {}, eg = { good: 0, cracked: 0 }, hens = 0, pm = productMap(state);
      (r.items || []).forEach(function (l) { var e = lineEggs(state, l); eg.good += e.good; eg.cracked += e.cracked; if ((pm[l.productId] || {}).kind === 'hen') hens += int(l.qty); });
      L.push('Receipt ' + (r.receiptNo || '') + ' (' + money(t.totalCents) + ') is removed from sales, profit and reports.');
      if (owe > 0) L.push((c.name || 'The customer') + '’s debt goes DOWN by ' + money(owe) + '.');
      if (t.paidCents) L.push('Money received goes down by ' + money(t.paidCents) + '.');
      if (eg.good + eg.cracked) L.push(cr(eg.good) + (eg.cracked ? ' + ' + eg.cracked + ' cracked' : '') + ' go back to ' + (isCarrySale(state, r) ? nm(r.by) + '’s eggs' : 'the egg store') + '.');
      if (hens) L.push(hens + ' spent hens count back as birds in their coop.');
    } else if (r.type === 'payments') {
      L.push(((cu[r.customerId] || {}).name || 'The customer') + '’s debt goes UP by ' + money(cents(r.amount)) + '.');
    } else if (r.type === 'daily') {
      var e = dailyEggs(state, r), f = fl[r.flockId] || {}, kg = feedKgOf(state, r, items);
      L.push('Coop ' + (f.coop || r.coop) + ' loses this record of ' + date_(r.date) + ': ' + cr(e.total) + ' eggs come out of the egg store and the lay %.');
      if (int(r.deaths) + int(r.culls)) L.push(int(r.deaths) + int(r.culls) + ' dead / culled birds count as alive again.');
      if (kg) L.push(Math.round(kg * 10) / 10 + ' kg of feed goes back to the feed store, and its cost leaves the coop.');
    } else if (r.type === 'stock') {
      var g = 0, k = 0; (r.lines || []).forEach(function (l) { var x = lineEggs(state, l); g += x.good; k += x.cracked; });
      if (r.kind === 'out') L.push(cr(g) + ' go back to the egg store; ' + nm(r.salesUserId) + ' has them no more.');
      else if (r.kind === 'return') L.push(cr(g) + ' come out of the store and count as still with ' + nm(r.salesUserId) + '.');
      else L.push('The egg store correction of ' + int(r.pieces) + ' ' + (r.eggKind || 'good') + ' eggs is undone.');
    } else if (r.type === 'feed') {
      var it = items[r.itemId || r.outputItemId] || {};
      if (r.kind === 'buy') { L.push(Math.round(itemKg(state, it, r.qty, r.qtyUnit) * 10) / 10 + ' kg of ' + (it.name || 'feed') + ' leaves the feed store.'); L.push('Feed cost per kg is worked out again — coop feed costs may change.'); }
      else if (r.kind === 'mix') { L.push('The mixed ' + (it.name || 'feed') + ' leaves the store and its ingredients go back.'); L.push('Coop feed costs may change.'); }
      else L.push('The feed stock correction is undone.');
    } else if (r.type === 'med') {
      var mi = items[r.itemId] || {};
      L.push(r.kind === 'use' ? num(r.qty) + ' ' + (mi.unit || '') + ' of ' + (mi.name || 'medicine') + ' go back to the store; the coop’s medicine cost goes down.' : num(r.qty) + ' ' + (mi.unit || '') + ' of ' + (mi.name || 'medicine') + ' leave the store.');
    } else if (r.type === 'expenses') {
      L.push('Expenses go down by ' + money(cents(r.amount)) + ' — profit goes up by the same.');
    } else if (r.type === 'customers') {
      var n = live(state.sales).filter(function (x) { return x.customerId === r.id; }).length + live(state.payments).filter(function (x) { return x.customerId === r.id; }).length;
      if (n) blocked = (r.name || 'This customer') + ' has ' + n + ' sale(s) or payment(s). Delete those first — or keep the customer.';
      else L.push((r.name || 'The customer') + ' is removed from the customer list.');
    } else if (r.type === 'flocks') {
      var d = live(state.daily).filter(function (x) { return x.flockId === r.id; }).length;
      if (d) blocked = 'This flock has ' + d + ' daily record(s). Use “Close flock”, or Reset a section for the eggs first.';
      else L.push('Coop ' + r.coop + ' flock is removed with its open tasks.');
    } else if (r.type === 'tasks') {
      L.push('The task and its alarms are removed.');
    } else if (r.type === 'moves') {
      var fa = fl[r.fromFlockId] || {}, fb = fl[r.toFlockId] || {};
      L.push(int(r.birds) + ' birds go back from Coop ' + (fb.coop || r.toCoop) + ' to Coop ' + (fa.coop || r.fromCoop) + '.');
    } else if (r.type === 'waiting') {
      L.push((r.name || 'The person') + ' is taken off the waiting list; no more call reminders.');
    }
    L.push('You can bring it back from the Bin for 30 days.');
    return { lines: L, blocked: blocked };
  }
  function date_(d) { var x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); return x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()]; }
  var RESET_GROUPS = {
    eggs: { label: 'Eggs & birds (daily records)', types: ['daily'] },
    sales: { label: 'Sales & money — sales, debt payments, crates out / returns, egg store corrections (together)', types: ['sales', 'payments', 'stock'] },
    feed: { label: 'Feed — bought and mixed', types: ['feed'] },
    med: { label: 'Medicine — bought and used', types: ['med'] },
    tasks: { label: 'Tasks & emergencies', types: ['tasks'] },
    expenses: { label: 'Expenses', types: ['expenses'] },
    waiting: { label: 'Waiting list', types: ['waiting'] }
  };
  function resetPlan(state, group, from, to) {
    var g = RESET_GROUPS[group]; if (!g) return null;
    var recs = [], count = {}, notes = [];
    g.types.forEach(function (ty) {
      live(state[ty]).forEach(function (r) { if (r.date >= from && r.date <= to) { recs.push(r); count[ty] = (count[ty] || 0) + 1; } });
    });
    if (group === 'feed' && live(state.daily).some(function (d) { return d.date >= from && d.date <= to && feedKgOf(state, d) > 0; }))
      notes.push('Daily records keep their kg of feed. Their feed cost will use the price of the feed still in the store.');
    if (group === 'sales') notes.push('Customers stay. Their debts are worked out again without these sales and payments.');
    if (group === 'eggs') notes.push('The egg store and lay % are worked out again. Birds that died in these records count as alive again.');
    return { group: group, label: g.label, types: g.types, from: from, to: to, records: recs, count: count, notes: notes };
  }

  // ---------- SUMMARY of everything for one day or a range of days ----------
  function summary(state, from, to) {
    to = to || from;
    var S = settingsOf(state), fl = byId(state.flocks), items = byId(state.items), users = userMap(state), prods = productMap(state);
    var inR = function (d) { return d >= from && d <= to; };
    var timeOf = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    var name = function (id) { var u = users[id]; return u ? u.name : (id || ''); };
    // eggs per coop, per collection
    var coops = {}, T = { good: 0, cracked: 0, total: 0, deaths: 0, culls: 0, feedKg: 0, birdDays: 0, records: 0, white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } };
    sortChrono(live(state.daily).filter(function (d) { return inR(d.date); })).forEach(function (d) {
      var f = fl[d.flockId] || {}, c = int(f.coop || d.coop), e = dailyEggs(state, d);
      var r = coops[c] || (coops[c] = { coop: c, flockId: d.flockId, collections: [], good: 0, cracked: 0, total: 0, deaths: 0, culls: 0, feedKg: 0, birdDays: 0, seen: {}, white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } });
      r.collections.push({ id: d.id, date: d.date, time: timeOf(d.createdAt), good: e.good, cracked: e.cracked, total: e.total, white: e.white, brown: e.brown, by: name(d.by), notes: d.notes || '' });
      ['white', 'brown'].forEach(function (k) { r[k].good += e[k].good; r[k].cracked += e[k].cracked; T[k].good += e[k].good; T[k].cracked += e[k].cracked; });
      r.good += e.good; r.cracked += e.cracked; r.total += e.total; r.deaths += int(d.deaths); r.culls += int(d.culls); r.feedKg += feedKgOf(state, d, items);
      if (!r.seen[d.date] && fl[d.flockId]) { r.seen[d.date] = 1; r.birdDays += birdsAtStartOf(state, fl[d.flockId], d.date); }
    });
    var coopRows = Object.keys(coops).map(function (k) {
      var r = coops[k]; delete r.seen;
      r.layRate = r.birdDays ? Math.round(r.total / r.birdDays * 1000) / 10 : 0;
      r.birdsEnd = fl[r.flockId] ? birdsAlive(state, fl[r.flockId], to) : 0;
      ['good', 'cracked', 'total', 'deaths', 'culls', 'feedKg', 'birdDays'].forEach(function (x) { T[x] += r[x]; });
      T.records += r.collections.length;
      r.feedKg = kg1(r.feedKg); r.gramsPerBird = r.birdDays ? Math.round(r.feedKg / r.birdDays * 1000) : 0;
      return r;
    }).sort(function (a, b) { return a.coop - b.coop; });
    T.feedKg = kg1(T.feedKg); T.gramsPerBird = T.birdDays ? Math.round(T.feedKg / T.birdDays * 1000) : 0;
    T.layRate = T.birdDays ? Math.round(T.total / T.birdDays * 1000) / 10 : 0;
    var missing = activeFlocks(state, to).filter(function (f) { return from === to && !coops[int(f.coop)]; }).map(function (f) { return int(f.coop); });
    var birds = activeFlocks(state, to).reduce(function (a, f) { return a + birdsAlive(state, f, to); }, 0);
    // egg store
    var open = eggStore(state, addDays(from, -1)), close = eggStore(state, to);
    var moves = { outGood: 0, outCracked: 0, backGood: 0, backCracked: 0, soldGood: 0, soldCracked: 0, adjustGood: 0, adjustCracked: 0 };
    live(state.stock).forEach(function (m) {
      if (!inR(m.date)) return;
      if (m.kind === 'adjust') { if (m.eggKind === 'cracked') moves.adjustCracked += int(m.pieces); else moves.adjustGood += int(m.pieces); return; }
      (m.lines || []).forEach(function (l) { var e = lineEggs(state, l); if (m.kind === 'out') { moves.outGood += e.good; moves.outCracked += e.cracked; } else if (m.kind === 'return') { moves.backGood += e.good; moves.backCracked += e.cracked; } });
    });
    live(state.sales).forEach(function (x) {
      if (!inR(x.date) || isCarrySale(state, x)) return;
      (x.items || []).forEach(function (l) { var e = lineEggs(state, l); moves.soldGood += e.good; moves.soldCracked += e.cracked; });
    });
    // sales & money
    var sales = { count: 0, totalCents: 0, paidCents: 0, debtAddedCents: 0, byMethod: { Cash: 0, MoMo: 0, Bank: 0 }, eggsGood: 0, eggsCracked: 0, eggsWhite: 0, eggsBrown: 0, hens: 0, bySeller: {}, list: [] };
    live(state.sales).forEach(function (x) {
      if (!inR(x.date)) return;
      var t = saleTotals(x); sales.count++; sales.totalCents += t.totalCents; sales.paidCents += t.paidCents;
      if (t.totalCents > t.paidCents) sales.debtAddedCents += t.totalCents - t.paidCents;
      (x.payments || []).forEach(function (p) { sales.byMethod[p.method] = (sales.byMethod[p.method] || 0) + cents(p.amount); });
      (x.items || []).forEach(function (l) { var e = lineEggs(state, l); sales.eggsGood += e.good; sales.eggsCracked += e.cracked; if (e.colour === 'white') sales.eggsWhite += e.good + e.cracked; else sales.eggsBrown += e.good + e.cracked; var p = prods[l.productId]; if (p && p.kind === 'hen') sales.hens += int(l.qty); });
      var s1 = sales.bySeller[x.by] || (sales.bySeller[x.by] = { name: name(x.by), count: 0, totalCents: 0, paidCents: 0 });
      s1.count++; s1.totalCents += t.totalCents; s1.paidCents += t.paidCents;
      var cu = byId(state.customers)[x.customerId] || {};
      sales.list.push({ id: x.id, date: x.date, time: timeOf(x.createdAt), receiptNo: x.receiptNo || '', customer: cu.name || '', totalCents: t.totalCents, paidCents: t.paidCents, by: name(x.by) });
    });
    var debtPaid = { totalCents: 0, byMethod: { Cash: 0, MoMo: 0, Bank: 0 }, list: [] };
    live(state.payments).forEach(function (p) {
      if (!inR(p.date)) return;
      debtPaid.totalCents += cents(p.amount); debtPaid.byMethod[p.method] = (debtPaid.byMethod[p.method] || 0) + cents(p.amount);
      debtPaid.list.push({ customer: (byId(state.customers)[p.customerId] || {}).name || '', amountCents: cents(p.amount), method: p.method, by: name(p.by) });
    });
    var received = { Cash: sales.byMethod.Cash + debtPaid.byMethod.Cash, MoMo: sales.byMethod.MoMo + debtPaid.byMethod.MoMo, Bank: sales.byMethod.Bank + debtPaid.byMethod.Bank };
    received.total = received.Cash + received.MoMo + received.Bank;
    // crates with salespeople
    var crates = {};
    live(state.stock).forEach(function (m) {
      if (!inR(m.date) || m.kind === 'adjust' || !m.salesUserId) return;
      var r = crates[m.salesUserId] || (crates[m.salesUserId] = { name: name(m.salesUserId), outGood: 0, outCracked: 0, backGood: 0, backCracked: 0, broken: 0 });
      (m.lines || []).forEach(function (l) { var e = lineEggs(state, l); if (m.kind === 'out') { r.outGood += e.good; r.outCracked += e.cracked; } else { r.backGood += e.good; r.backCracked += e.cracked; } });
      r.broken += int(m.brokenGood) + int(m.brokenCracked);
    });
    var crateRows = Object.keys(crates).map(function (k) { var r = crates[k]; if (from === to) { var c = carry(state, k, to); r.stillWithThem = c.remaining.good; r.balanced = c.balanced; r.returnRecorded = c.returnRecorded; } return r; });
    var adjusts = live(state.stock).filter(function (m) { return inR(m.date) && m.kind === 'adjust'; }).map(function (m) { return { pieces: int(m.pieces), eggKind: m.eggKind || 'good', reason: m.reason || '', by: name(m.by) }; });
    // feed
    var feed = { bought: [], mixed: [], used: {}, boughtCents: 0 };
    live(state.feed).forEach(function (x) {
      if (!inR(x.date)) return;
      if (x.kind === 'buy') { feed.bought.push({ item: (items[x.itemId] || {}).name || x.itemId, qty: num(x.qty), unit: x.qtyUnit || '', costCents: cents(x.cost), by: name(x.by) }); feed.boughtCents += cents(x.cost); }
      else if (x.kind === 'mix') feed.mixed.push({ item: (items[x.outputItemId] || {}).name || '', kg: (x.lines || []).reduce(function (a, l) { return a + num(l.kg); }, 0), by: name(x.by) });
    });
    live(state.daily).forEach(function (d) { var k = feedKgOf(state, d, items); if (inR(d.date) && k && d.feedItemId) { var n = (items[d.feedItemId] || {}).name || d.feedItemId; feed.used[n] = kg1((feed.used[n] || 0) + k); } });
    // medicine
    var med = { bought: [], used: [], boughtCents: 0 };
    live(state.med).forEach(function (x) {
      if (!inR(x.date)) return;
      var it = items[x.itemId] || {};
      if (x.kind === 'in') { med.bought.push({ item: it.name || '', qty: num(x.qty), unit: it.unit || '', costCents: cents(x.cost), expiry: x.expiry || '' }); med.boughtCents += cents(x.cost); }
      else if (x.kind === 'use') med.used.push({ item: it.name || '', qty: num(x.qty), unit: it.unit || '', coop: x.coop || '', note: x.note || '', by: name(x.by) });
    });
    // tasks
    var tasks = { done: [], overdue: [], emergencies: [], due: [] };
    live(state.tasks).forEach(function (x) {
      var where = (x.coops && x.coops.length) ? 'Coop ' + x.coops.join(', ') : 'Whole farm';
      if (x.status !== 'open' && x.kind !== 'Emergency' && x.doneAt && inR(x.doneAt) && x.doneNote !== 'Before the app was used') tasks.done.push({ kind: x.kind, title: x.title, where: where, by: name(x.doneBy), note: x.doneNote || '' });
      if (x.kind === 'Emergency' && inR(x.date)) tasks.emergencies.push({ title: x.title, where: where, by: name(x.by), open: x.status === 'open', handledBy: x.status !== 'open' ? name(x.doneBy) : '', note: x.doneNote || '' });
      if (x.status === 'open' && x.kind !== 'Emergency' && x.date < to && x.date >= addDays(to, -60)) tasks.overdue.push({ kind: x.kind, title: x.title, where: where, date: x.date });
      if (x.status === 'open' && x.kind !== 'Emergency' && x.date > to && x.date <= addDays(to, 3)) tasks.due.push({ kind: x.kind, title: x.title, where: where, date: x.date, time: x.time || '' });
    });
    tasks.due.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    // expenses
    var expenses = { totalCents: 0, list: [] };
    live(state.expenses).forEach(function (e) { if (inR(e.date)) { expenses.totalCents += cents(e.amount); expenses.list.push({ category: e.category || '', amountCents: cents(e.amount), coop: int(e.coop), note: e.note || '' }); } });
    return { from: from, to: to, eggsPerCrate: S.eggsPerCrate, coops: coopRows, colours: coloursInUse(state), eggs: T, missing: missing, birds: birds, store: { open: open, close: close, moves: moves },
      sales: sales, debtPaid: debtPaid, received: received, crates: crateRows, adjusts: adjusts, feed: feed, med: med, tasks: tasks, expenses: expenses };
  }
  // ---------- summary PER COOP for any range of days (History) ----------
  function coopSummary(state, from, to) {
    var sm = summary(state, from, to), items = byId(state.items), byCoop = {};
    sm.coops.forEach(function (c) { byCoop[c.coop] = c; });
    var flocks = live(state.flocks).filter(function (f) { return f.arrival <= to && !(f.status === 'closed' && f.closedOn && f.closedOn < from); })
      .sort(function (a, b) { return int(a.coop) - int(b.coop); });
    var rows = flocks.map(function (f) {
      var c = int(f.coop), e = byCoop[c] || { good: 0, cracked: 0, total: 0, deaths: 0, culls: 0, feedKg: 0, layRate: 0, gramsPerBird: 0, collections: [], white: { good: 0, cracked: 0 }, brown: { good: 0, cracked: 0 } };
      var med = {};
      live(state.med).forEach(function (m) {
        if (m.kind !== 'use' || m.date < from || m.date > to) return;
        if (m.flockId ? m.flockId !== f.id : int(m.coop) !== c) return;
        var it = items[m.itemId] || {}, k = it.name || m.itemId;
        med[k] = med[k] || { item: k, qty: 0, unit: it.unit || '' }; med[k].qty = Math.round((med[k].qty + num(m.qty)) * 100) / 100;
      });
      var done = 0, overdue = 0;
      live(state.tasks).forEach(function (x) {
        if (x.kind === 'Emergency' || (x.coops || []).map(int).indexOf(c) < 0) return;
        if (x.status !== 'open' && x.doneAt && x.doneAt >= from && x.doneAt <= to && x.doneNote !== 'Before the app was used') done++;
        if (x.status === 'open' && x.date < to) overdue++;
      });
      var age = flockAge(state, f, to > f.arrival ? to : f.arrival);
      return { coop: c, flockId: f.id, breed: f.breed || '', colours: flockColours(state, f, to), white: e.white, brown: e.brown, stage: age.stage, week: age.week, birdsStart: birdsAtStartOf(state, f, from > f.arrival ? from : f.arrival),
        birdsEnd: birdsAlive(state, f, to), good: e.good, cracked: e.cracked, eggs: e.total, layRate: e.layRate, deaths: e.deaths, culls: e.culls,
        feedKg: e.feedKg, gramsPerBird: e.gramsPerBird, records: e.collections.length, med: Object.keys(med).map(function (k) { return med[k]; }), tasksDone: done, overdue: overdue };
    });
    return { from: from, to: to, rows: rows, total: sm.eggs, colours: sm.colours };
  }

  // Plain text for WhatsApp / email. money=false hides all GH₵ figures.
  function summaryText(state, sm, farm, money) {
    var L = [], cr = function (p) { return cratesText(state, p); };
    var dt = function (d) { var x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][x.getUTCMonth()] + ' ' + x.getUTCFullYear(); };
    L.push('*' + (farm || 'The Egg Man Farms') + '*');
    L.push('*' + (sm.from === sm.to ? 'Daily summary · ' + dt(sm.from) : 'Summary · ' + dt(sm.from) + ' – ' + dt(sm.to)) + '*');
    L.push('');
    var two = (sm.colours || []).length > 1;
    L.push('🥚 *Eggs:* ' + cr(sm.eggs.total) + ' (' + sm.eggs.cracked + ' cracked) · lay ' + sm.eggs.layRate + '%');
    if (two) L.push('  White ' + cr(sm.eggs.white.good + sm.eggs.white.cracked) + ' · Brown ' + cr(sm.eggs.brown.good + sm.eggs.brown.cracked));
    sm.coops.forEach(function (c) {
      L.push('  Coop ' + c.coop + ': ' + cr(c.total) + (c.collections.length > 1 ? ' in ' + c.collections.length + ' collections' : '') + ' · ' + c.layRate + '%' + (c.deaths + c.culls ? ' · ' + (c.deaths + c.culls) + ' died/culled' : ''));
    });
    if (sm.missing.length) L.push('  ⚠ No record: Coop ' + sm.missing.join(', '));
    L.push('🐔 *Birds:* ' + sm.birds.toLocaleString() + ' alive · ' + (sm.eggs.deaths + sm.eggs.culls) + ' died/culled');
    L.push('🌾 *Feed used:* ' + (Object.keys(sm.feed.used).map(function (k) { return sm.feed.used[k] + ' kg ' + k; }).join(', ') || 'none recorded'));
    if (sm.feed.bought.length) L.push('  Bought: ' + sm.feed.bought.map(function (b) { return b.qty + ' ' + b.unit + ' ' + b.item + (money ? ' (' + money_(b.costCents) + ')' : ''); }).join(', '));
    if (sm.feed.mixed.length) L.push('  Mixed: ' + sm.feed.mixed.map(function (b) { return b.kg + ' kg ' + b.item; }).join(', '));
    if (sm.med.used.length) L.push('💉 *Medicine used:* ' + sm.med.used.map(function (m) { return m.qty + ' ' + m.unit + ' ' + m.item + (m.coop ? ' (Coop ' + m.coop + ')' : ''); }).join(', '));
    if (sm.tasks.done.length) L.push('✅ *Done:* ' + sm.tasks.done.map(function (t) { return t.title + ' · ' + t.where; }).join('; '));
    if (sm.tasks.emergencies.length) L.push('🚨 *Emergencies:* ' + sm.tasks.emergencies.map(function (t) { return t.title + ' · ' + t.where + (t.open ? ' (OPEN)' : ' (handled)'); }).join('; '));
    if (sm.tasks.overdue.length) L.push('⏰ *Overdue:* ' + sm.tasks.overdue.slice(0, 8).map(function (t) { return t.title + ' · ' + t.where; }).join('; '));
    if (sm.tasks.due.length) L.push('📅 *Coming up:* ' + sm.tasks.due.slice(0, 6).map(function (t) { return t.title + ' · ' + t.where + ' · ' + t.date.slice(8) + '/' + t.date.slice(5, 7); }).join('; '));
    sm.crates.forEach(function (c) { L.push('🧺 ' + c.name + ': took ' + cr(c.outGood) + ', returned ' + cr(c.backGood) + (c.broken ? ', broken ' + c.broken : '') + (c.returnRecorded && !c.balanced ? ' ⚠ not balanced' : '')); });
    L.push('🏠 *Egg store:* ' + cr(sm.store.close.good) + ' good, ' + sm.store.close.cracked + ' cracked' + (two ? ' (white ' + cr(sm.store.close.white.good) + ' · brown ' + cr(sm.store.close.brown.good) + ' good)' : ''));
    if (money) {
      L.push('');
      L.push('💰 *Sales:* ' + money_(sm.sales.totalCents) + ' (' + sm.sales.count + ' sales, ' + cr(sm.sales.eggsGood) + ')');
      L.push('  Received: ' + money_(sm.received.total) + ' — Cash ' + money_(sm.received.Cash) + ' · MoMo ' + money_(sm.received.MoMo) + ' · Bank ' + money_(sm.received.Bank));
      if (sm.sales.debtAddedCents) L.push('  New debts: ' + money_(sm.sales.debtAddedCents));
      if (sm.debtPaid.totalCents) L.push('  Old debts paid: ' + money_(sm.debtPaid.totalCents));
      Object.keys(sm.sales.bySeller).forEach(function (k) { var s1 = sm.sales.bySeller[k]; L.push('  ' + s1.name + ': ' + money_(s1.totalCents) + ' (' + s1.count + ' sales)'); });
      if (sm.expenses.totalCents) L.push('🧾 *Expenses:* ' + money_(sm.expenses.totalCents));
    }
    return L.join('\n');
  }
  function money_(c) { return money(c); }

  // ---------- MONTHLY REPORT: every activity on the farm for one month ----------
  function lastDayOfMonth(month) { return addDays(addMonths(month + '-01', 1), -1); }
  function balanceAt(state, customerId, date) {
    var L = customerLedger(state, customerId), bal = L.openingCents;
    L.rows.forEach(function (r) { if (r.date <= date) bal = r.balanceCents; });
    return bal;
  }
  function monthlyReport(state, month, today) {
    var s = settingsOf(state), start = month + '-01', end = lastDayOfMonth(month);
    var partial = !!(today && end > today); if (partial) end = today;
    var pm = productMap(state), um = userMap(state), im = byId(state.items), fm = byId(state.flocks);
    function inM(d) { return d >= start && d <= end; }
    var dayBefore = addDays(start, -1);
    var prof = profit(state, month), pRow = {};
    prof.rows.forEach(function (r) { pRow[r.flockId] = r; });

    // --- coops
    var flocks = live(state.flocks).filter(function (f) {
      return f.arrival <= end && !(f.status === 'closed' && f.closedOn && f.closedOn < start);
    }).sort(function (a, b) { return int(a.coop) - int(b.coop); });
    var farm = { startBirds: 0, endBirds: 0, deaths: 0, culls: 0, hensSold: 0, eggs: 0, good: 0, cracked: 0, birdDays: 0, feedBags: 0, feedKg: 0, arrived: 0, white: 0, brown: 0 };
    var coopRows = flocks.map(function (f) {
      var r = { coop: int(f.coop), flockId: f.id, breed: f.breed || '', eggs: 0, good: 0, cracked: 0, deaths: 0, culls: 0, hensSold: 0, feedBags: 0, feedKg: 0, birdDays: 0, days: 0, seen: {} };
      live(state.daily).forEach(function (d) {
        if (d.flockId !== f.id || !inM(d.date)) return;
        var e = dailyEggs(state, d);
        r.eggs += e.total; r.good += e.good; r.cracked += e.cracked; r.deaths += int(d.deaths); r.culls += int(d.culls);
        farm.white += e.white.good + e.white.cracked; farm.brown += e.brown.good + e.brown.cracked;
        r.feedKg += feedKgOf(state, d, im); r.feedBags = r.feedKg / s.kgPerBag;
        if (!r.seen[d.date]) { r.seen[d.date] = 1; r.birdDays += birdsAtStartOf(state, f, d.date); r.days++; }
      });
      live(state.sales).forEach(function (sale) {
        if (!inM(sale.date)) return;
        (sale.items || []).forEach(function (it) { var p = pm[it.productId]; if (p && p.kind === 'hen' && it.flockId === f.id) r.hensSold += int(it.qty); });
      });
      var newFlock = f.arrival >= start;
      r.startBirds = newFlock ? 0 : birdsAlive(state, f, dayBefore);
      r.arrived = newFlock ? int(f.chicks) : 0;
      r.endBirds = birdsAlive(state, f, end);
      var age = flockAge(state, f, end); r.week = age.week; r.stage = age.stage;
      r.layRate = r.birdDays ? Math.round(r.eggs / r.birdDays * 1000) / 10 : 0;
      var p = pRow[f.id] || { incomeCents: 0, costCents: 0, profitCents: 0, feed: 0, med: 0, direct: 0, shared: 0 };
      r.incomeCents = p.incomeCents; r.costCents = p.costCents; r.profitCents = p.profitCents; r.feedCents = p.feed; r.medCents = p.med; r.otherCostCents = p.direct + p.shared;
      ['startBirds', 'endBirds', 'deaths', 'culls', 'hensSold', 'eggs', 'good', 'cracked', 'birdDays', 'feedBags', 'feedKg', 'arrived'].forEach(function (k) { farm[k] += r[k]; });
      r.feedBags = Math.round(r.feedBags * 100) / 100; r.feedKg = Math.round(r.feedKg * 10) / 10; delete r.seen;
      return r;
    });
    farm.layRate = farm.birdDays ? Math.round(farm.eggs / farm.birdDays * 1000) / 10 : 0;
    farm.feedBags = Math.round(farm.feedBags * 100) / 100; farm.feedKg = Math.round(farm.feedKg * 10) / 10;
    farm.mortality = (farm.startBirds + farm.arrived) ? Math.round((farm.deaths + farm.culls) / (farm.startBirds + farm.arrived) * 1000) / 10 : 0;
    var laying = coopRows.filter(function (r) { return r.eggs > 0; }).sort(function (a, b) { return b.layRate - a.layRate; });

    // --- sales and money
    var products = {}, sellers = {}, methods = { Cash: 0, MoMo: 0, Bank: 0 };
    var salesCents = 0, paidAtSale = 0, debtPaid = 0, saleCount = 0;
    live(state.sales).forEach(function (sale) {
      if (!inM(sale.date)) return;
      var t = saleTotals(sale); salesCents += t.totalCents; paidAtSale += t.paidCents; saleCount++;
      var sl = sellers[sale.by] || (sellers[sale.by] = { name: (um[sale.by] || {}).name || sale.by || '?', count: 0, cents: 0, paid: 0 });
      sl.count++; sl.cents += t.totalCents; sl.paid += t.paidCents;
      (sale.items || []).forEach(function (it) {
        var p = pm[it.productId] || { name: it.productId };
        var x = products[it.productId] || (products[it.productId] = { name: p.name, qty: 0, cents: 0 });
        x.qty += num(it.qty); x.cents += Math.round(num(it.qty) * num(it.price) * 100);
      });
      (sale.payments || []).forEach(function (p) { methods[p.method] = (methods[p.method] || 0) + cents(p.amount); });
    });
    live(state.payments).forEach(function (p) {
      if (!inM(p.date)) return;
      debtPaid += cents(p.amount); methods[p.method] = (methods[p.method] || 0) + cents(p.amount);
      var sl = sellers[p.by] || (sellers[p.by] = { name: (um[p.by] || {}).name || p.by || '?', count: 0, cents: 0, paid: 0 });
      sl.paid += cents(p.amount);
    });
    var owing = live(state.customers).map(function (c) { return { name: c.name, phone: c.phone || '', cents: balanceAt(state, c.id, end), start: balanceAt(state, c.id, dayBefore) }; })
      .filter(function (x) { return x.cents > 0; }).sort(function (a, b) { return b.cents - a.cents; });
    var debtStart = live(state.customers).reduce(function (a, c) { return a + Math.max(0, balanceAt(state, c.id, dayBefore)); }, 0);
    var newCustomers = live(state.customers).filter(function (c) { return c.createdAt && inM(String(c.createdAt).slice(0, 10)); }).length;

    // --- crates out & returns per salesperson
    var crateRows = live(state.users).filter(function (u) { return u.role === 'sales'; }).map(function (u) {
      var r = { name: u.name, out: 0, sold: 0, returned: 0, broken: 0 };
      live(state.stock).forEach(function (m) {
        if (m.salesUserId !== u.id || !inM(m.date)) return;
        (m.lines || []).forEach(function (l) { var e = lineEggs(state, l); if (m.kind === 'out') r.out += e.good; if (m.kind === 'return') r.returned += e.good; });
        if (m.kind === 'return') r.broken += int(m.brokenGood);
      });
      live(state.sales).forEach(function (sale) {
        if (sale.by !== u.id || !inM(sale.date) || !isCarrySale(state, sale)) return;
        (sale.items || []).forEach(function (l) { r.sold += lineEggs(state, l).good; });
      });
      r.stillOut = carry(state, u.id, end).remaining.good;
      return r;
    }).filter(function (r) { return r.out || r.sold || r.returned || r.broken || r.stillOut; });
    var adjust = live(state.stock).filter(function (m) { return m.kind === 'adjust' && inM(m.date); })
      .map(function (m) { return { date: m.date, eggKind: m.eggKind, pieces: int(m.pieces), reason: m.reason || '' }; });

    // --- feed
    var bought = {}, mixes = { count: 0, kg: 0, cents: 0 }, feedUsed = {};
    var fsAll = feedState(state);
    live(state.feed).forEach(function (m) {
      if (!inM(m.date)) return;
      if (m.kind === 'buy') {
        var b = bought[m.itemId] || (bought[m.itemId] = { name: (im[m.itemId] || {}).name || m.itemId, kg: 0, cents: 0 });
        b.kg += itemKg(state, im[m.itemId], m.qty, m.qtyUnit); b.cents += cents(m.cost);
      } else if (m.kind === 'mix') {
        var mc = fsAll.mixCost[m.id] || { kg: 0, cents: 0 }; mixes.count++; mixes.kg += mc.kg; mixes.cents += mc.cents;
      }
    });
    live(state.daily).forEach(function (d) {
      if (!inM(d.date) || !d.feedItemId || !(feedKgOf(state, d, im) > 0)) return;
      var u = feedUsed[d.feedItemId] || (feedUsed[d.feedItemId] = { name: (im[d.feedItemId] || {}).name || d.feedItemId, kg: 0 });
      u.kg += feedKgOf(state, d, im);
    });
    var feedStock = live(state.items).filter(function (i) { return (i.category === 'feed' || i.category === 'ingredient') && fsAll.items[i.id] && fsAll.items[i.id].tracked; })
      .map(function (i) { var x = fsAll.items[i.id]; return { name: i.name, shown: x.shown, unit: x.unit, low: x.low }; });

    // --- medicine
    var medIn = {}, medUsed = {};
    live(state.med).forEach(function (m) {
      if (!inM(m.date)) return;
      var nm = (im[m.itemId] || {}).name || m.itemId, unit = (im[m.itemId] || {}).unit || '';
      if (m.kind === 'in') { var a = medIn[m.itemId] || (medIn[m.itemId] = { name: nm, unit: unit, qty: 0, cents: 0 }); a.qty += num(m.qty); a.cents += cents(m.cost); }
      if (m.kind === 'use') { var b = medUsed[m.itemId] || (medUsed[m.itemId] = { name: nm, unit: unit, qty: 0, coops: {} }); b.qty += num(m.qty); if (m.coop) b.coops[m.coop] = 1; }
    });
    var msNow = medState(state, today || end);
    var medWarn = live(state.items).filter(function (i) { var x = msNow.items[i.id]; return x && x.tracked && (x.low || x.expiringSoon || x.expiredQty); })
      .map(function (i) { var x = msNow.items[i.id]; return { name: i.name, qty: x.qty, unit: i.unit, low: x.low, expiry: x.expiringSoon ? x.earliestExpiry : '', expired: x.expiredQty }; });

    // --- tasks
    var doneByKind = {}, done = 0, missed = [], emergencies = [];
    live(state.tasks).forEach(function (t) {
      if (t.kind === 'Emergency') { if (inM(t.date)) emergencies.push({ date: t.date, title: t.title, where: (t.coops && t.coops.length) ? 'Coop ' + t.coops.join(', ') : 'Farm', by: (um[t.by] || {}).name || '', status: t.status === 'open' ? 'OPEN' : 'Handled ' + (t.doneAt || ''), note: t.doneNote || '' }); return; }
      if (t.status !== 'open' && t.doneAt && inM(t.doneAt) && t.doneNote !== 'Flock closed' && t.doneNote !== 'Before the app was used') { done++; doneByKind[t.kind] = (doneByKind[t.kind] || 0) + 1; }
      if (t.status === 'open' && inM(t.date) && t.date < (today || addDays(end, 1))) missed.push({ date: t.date, kind: t.kind, title: t.title, where: (t.coops && t.coops.length) ? 'Coop ' + t.coops.join(', ') : 'Farm' });
    });
    missed.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    emergencies.sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    // --- expenses
    var expCats = {}, expTotal = 0;
    live(state.expenses).forEach(function (e) { if (!inM(e.date)) return; expCats[e.category] = (expCats[e.category] || 0) + cents(e.amount); expTotal += cents(e.amount); });

    function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
    return {
      month: month, start: start, end: end, partial: partial, eggsPerCrate: s.eggsPerCrate,
      farm: farm, coops: coopRows, bestCoop: laying[0] || null, worstCoop: laying.length > 1 ? laying[laying.length - 1] : null,
      sales: { count: saleCount, cents: salesCents, paidAtSaleCents: paidAtSale, debtPaidCents: debtPaid, receivedCents: paidAtSale + debtPaid,
        products: vals(products).sort(function (a, b) { return b.cents - a.cents; }), sellers: vals(sellers).sort(function (a, b) { return b.cents - a.cents; }), methods: methods },
      debt: { startCents: debtStart, endCents: owing.reduce(function (a, x) { return a + x.cents; }, 0), customers: owing, newCustomers: newCustomers },
      crates: crateRows, adjust: adjust,
      feed: { bought: vals(bought), mixes: mixes, used: vals(feedUsed), stock: feedStock },
      med: { stockIn: vals(medIn), used: vals(medUsed).map(function (x) { x.coops = Object.keys(x.coops).sort().join(', '); return x; }), warnings: medWarn },
      tasks: { done: done, byKind: doneByKind, missed: missed, emergencies: emergencies },
      expenses: { totalCents: expTotal, byCategory: Object.keys(expCats).map(function (k) { return { category: k, cents: expCats[k] }; }).sort(function (a, b) { return b.cents - a.cents; }) },
      profit: prof
    };
  }

  // One printable page (used by the app's Print button AND the PDF that Google emails each month).
  function htmlEsc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) {
    var neg = c < 0, v = Math.abs(Math.round(c)), whole = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), dec = ('0' + (v % 100)).slice(-2);
    return (neg ? '−' : '') + 'GH₵ ' + whole + '.' + dec;
  }
  function reportHtml(state, month, today, farmName) {
    var R = monthlyReport(state, month, today), epc = R.eggsPerCrate;
    var MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var title = MON[+month.slice(5, 7) - 1] + ' ' + month.slice(0, 4);
    function cr(p) { return cratesText(state, p); }
    function n(x) { return String(Math.round(x * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
    function sec(t) { return '<h2 style="font-size:15px;margin:22px 0 8px;padding:6px 10px;background:#1F4D2C;color:#fff;border-radius:6px">' + htmlEsc(t) + '</h2>'; }
    function table(head, rows, foot) {
      var th = 'style="text-align:left;font-size:10px;color:#56655A;padding:4px 4px;border-bottom:1px solid #CFC9B8;font-weight:700"';
      var td = 'style="padding:4px 4px;border-bottom:1px solid #EEE9DC;font-size:11px;vertical-align:top"';
      var tf = 'style="padding:5px 4px;font-size:11px;font-weight:700;border-top:2px solid #1F4D2C"';
      if (!rows.length) return '<p style="font-size:12px;color:#56655A;margin:4px 0">Nothing recorded this month.</p>';
      return '<table style="width:100%;border-collapse:collapse;margin-bottom:6px"><thead><tr>' + head.map(function (h) { return '<th ' + th + '>' + htmlEsc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td ' + td + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody>' +
        (foot ? '<tfoot><tr>' + foot.map(function (c) { return '<td ' + tf + '>' + c + '</td>'; }).join('') + '</tr></tfoot>' : '') + '</table>';
    }
    function box(l, v, sub) { return '<td style="width:25%;padding:8px 10px;background:#FBF8F0;border:1px solid #E6E1D3;border-radius:8px;vertical-align:top"><div style="font-size:11px;color:#56655A">' + htmlEsc(l) + '</div><div style="font-size:17px;font-weight:800">' + v + '</div><div style="font-size:11px;color:#56655A">' + (sub || '') + '</div></td>'; }
    var F = R.farm, P = R.profit.total, h = [];
    h.push('<div style="font-family:Arial,Helvetica,sans-serif;color:#1A2A1E;max-width:900px;margin:0 auto">');
    h.push('<div style="border-bottom:4px solid #F2B705;padding-bottom:8px;margin-bottom:12px"><div style="font-size:22px;font-weight:800;color:#1F4D2C">' + htmlEsc(farmName || 'The Egg Man Farms') + '</div>' +
      '<div style="font-size:16px;font-weight:700">Monthly farm report · ' + title + '</div><div style="font-size:11px;color:#56655A">' + R.start + ' to ' + R.end + (R.partial ? ' (month not finished yet)' : '') + ' · made ' + (today || R.end) + '</div></div>');
    h.push('<table style="width:100%;border-collapse:separate;border-spacing:6px"><tr>' + box('Eggs collected', cr(F.eggs), (coloursInUse(state).length > 1 ? 'white ' + cr(F.white) + ' · brown ' + cr(F.brown) : n(F.eggs) + ' eggs') + ' · ' + F.layRate + '% lay') + box('Sales', money(R.sales.cents), R.sales.count + ' sales') +
      box('Money received', money(R.sales.receivedCents), 'incl. ' + money(R.sales.debtPaidCents) + ' old debts') + box('Profit', money(P.profitCents), 'income ' + money(P.incomeCents)) + '</tr><tr>' +
      box('Birds at end', n(F.endBirds), 'started ' + n(F.startBirds) + (F.arrived ? ' + ' + n(F.arrived) + ' chicks' : '')) + box('Deaths & culls', n(F.deaths + F.culls), F.mortality + '% of birds') +
      box('Feed eaten', n(F.feedKg) + ' kg', (F.endBirds ? Math.round(F.feedKg / Math.max(1, F.birdDays) * 1000) + ' g per bird a day' : '')) + box('Customers owe', money(R.debt.endCents), 'was ' + money(R.debt.startCents) + ' at start') + '</tr></table>');
    if (R.bestCoop) h.push('<p style="font-size:12px;margin:6px 0">Best laying coop: <b>Coop ' + R.bestCoop.coop + '</b> (' + R.bestCoop.layRate + '%)' + (R.worstCoop ? ' · lowest: <b>Coop ' + R.worstCoop.coop + '</b> (' + R.worstCoop.layRate + '%)' : '') + '.</p>');

    h.push(sec('1. Coops — birds and eggs'));
    h.push(table(['Coop', 'Stage', 'Start', 'Chicks in', 'Died', 'Culled', 'Hens sold', 'End', 'Good eggs', 'Cracked', 'Lay %', 'Days', 'Feed'],
      R.coops.map(function (r) { return ['<b>' + r.coop + '</b>', htmlEsc(r.stage) + '<br>wk ' + r.week, n(r.startBirds), r.arrived ? n(r.arrived) : '', n(r.deaths), n(r.culls), n(r.hensSold), n(r.endBirds), cr(r.good), n(r.cracked), r.layRate + '%', r.days, n(r.feedKg) + ' kg']; }),
      ['Farm', '', n(F.startBirds), F.arrived ? n(F.arrived) : '', n(F.deaths), n(F.culls), n(F.hensSold), n(F.endBirds), cr(F.good), n(F.cracked), F.layRate + '%', '', n(F.feedKg) + ' kg']));

    h.push(sec('2. Profit per coop'));
    h.push(table(['Coop', 'Income', 'Feed', 'Medicine', 'Other costs', 'Total costs', 'Profit'],
      R.coops.map(function (r) { return ['<b>' + r.coop + '</b>', money(r.incomeCents), money(r.feedCents), money(r.medCents), money(r.otherCostCents), money(r.costCents), '<b style="color:' + (r.profitCents < 0 ? '#B3361A' : '#1F4D2C') + '">' + money(r.profitCents) + '</b>']; }),
      ['Whole farm', money(P.incomeCents), '', '', '', money(P.costCents), money(P.profitCents)]));
    if (R.profit.unassigned.incomeCents || R.profit.unassigned.costCents) h.push('<p style="font-size:11px;color:#56655A">Not linked to a coop (included in farm total): income ' + money(R.profit.unassigned.incomeCents) + ', costs ' + money(R.profit.unassigned.costCents) + '.</p>');

    h.push(sec('3. Sales'));
    h.push(table(['Product', 'Quantity', 'Amount'], R.sales.products.map(function (p) { return [htmlEsc(p.name), n(p.qty), money(p.cents)]; }), ['Total', '', money(R.sales.cents)]));
    h.push(table(['Salesperson', 'Sales', 'Sold', 'Money received'], R.sales.sellers.map(function (p) { return [htmlEsc(p.name), p.count, money(p.cents), money(p.paid)]; })));
    h.push('<p style="font-size:12px">Received: Cash <b>' + money(R.sales.methods.Cash || 0) + '</b> · MoMo <b>' + money(R.sales.methods.MoMo || 0) + '</b> · Bank <b>' + money(R.sales.methods.Bank || 0) + '</b> · of which old debts paid <b>' + money(R.sales.debtPaidCents) + '</b>.</p>');

    h.push(sec('4. Customers who owe at month end'));
    h.push(table(['Customer', 'Phone', 'Owed at start', 'Owed at end'], R.debt.customers.map(function (c) { return [htmlEsc(c.name), htmlEsc(c.phone), money(Math.max(0, c.start)), '<b>' + money(c.cents) + '</b>']; }), ['Total', '', money(R.debt.startCents), money(R.debt.endCents)]));
    if (R.debt.newCustomers) h.push('<p style="font-size:12px">New customers this month: ' + R.debt.newCustomers + '.</p>');

    h.push(sec('5. Crates out to salespeople (good eggs)'));
    h.push(table(['Salesperson', 'Taken', 'Sold', 'Returned', 'Broken', 'Still out / missing at month end'],
      R.crates.map(function (r) { return [htmlEsc(r.name), cr(r.out), cr(r.sold), cr(r.returned), n(r.broken) + ' pcs', r.stillOut ? '<b style="color:#B3361A">' + cr(r.stillOut) + '</b>' : '0']; })));
    if (R.adjust.length) h.push(table(['Date', 'Store count corrected', 'Pieces', 'Reason'], R.adjust.map(function (a) { return [a.date, a.eggKind, (a.pieces > 0 ? '+' : '') + a.pieces, htmlEsc(a.reason)]; })));

    h.push(sec('6. Feed'));
    h.push(table(['Bought', 'Kg', 'Cost'], R.feed.bought.map(function (b) { return [htmlEsc(b.name), n(b.kg), money(b.cents)]; })));
    if (R.feed.mixes.count) h.push('<p style="font-size:12px">Mixed ' + R.feed.mixes.count + ' time(s): ' + n(R.feed.mixes.kg) + ' kg for ' + money(R.feed.mixes.cents) + ' (' + money(R.feed.mixes.kg ? R.feed.mixes.cents / R.feed.mixes.kg * settingsOf(state).kgPerBag : 0) + ' per ' + settingsOf(state).kgPerBag + ' kg bag).</p>');
    h.push(table(['Feed eaten', 'Kg'], R.feed.used.map(function (u) { return [htmlEsc(u.name), n(u.kg)]; })));
    h.push(table(['In store now', 'Quantity', ''], R.feed.stock.map(function (x) { return [htmlEsc(x.name), n(x.shown) + ' ' + x.unit, x.low ? '<b style="color:#B3361A">LOW</b>' : '']; })));

    h.push(sec('7. Medicine & vaccines'));
    h.push(table(['Bought', 'Quantity', 'Cost'], R.med.stockIn.map(function (x) { return [htmlEsc(x.name), n(x.qty) + ' ' + htmlEsc(x.unit), money(x.cents)]; })));
    h.push(table(['Used', 'Quantity', 'Coops'], R.med.used.map(function (x) { return [htmlEsc(x.name), n(x.qty) + ' ' + htmlEsc(x.unit), htmlEsc(x.coops)]; })));
    if (R.med.warnings.length) h.push(table(['Needs attention', 'In store', 'Problem'], R.med.warnings.map(function (x) { return [htmlEsc(x.name), n(x.qty) + ' ' + htmlEsc(x.unit), [x.low ? 'low' : '', x.expiry ? 'expires ' + x.expiry : '', x.expired ? x.expired + ' expired' : ''].filter(Boolean).join(', ')]; })));

    h.push(sec('8. Farm tasks'));
    h.push('<p style="font-size:12px">Tasks done: <b>' + R.tasks.done + '</b>' + (Object.keys(R.tasks.byKind).length ? ' (' + Object.keys(R.tasks.byKind).map(function (k) { return htmlEsc(k) + ' ' + R.tasks.byKind[k]; }).join(', ') + ')' : '') + '.</p>');
    h.push(table(['Not done (missed)', 'Type', 'Task', 'Where'], R.tasks.missed.map(function (t) { return [t.date, htmlEsc(t.kind), htmlEsc(t.title), htmlEsc(t.where)]; })));
    h.push(table(['Emergency', 'What', 'Where', 'Reported by', 'Status'], R.tasks.emergencies.map(function (t) { return [t.date, htmlEsc(t.title), htmlEsc(t.where), htmlEsc(t.by), htmlEsc(t.status) + (t.note ? ' — ' + htmlEsc(t.note) : '')]; })));

    h.push(sec('9. Expenses'));
    h.push(table(['Category', 'Amount'], R.expenses.byCategory.map(function (e) { return [htmlEsc(e.category), money(e.cents)]; }), ['Total', money(R.expenses.totalCents)]));
    h.push('<p style="font-size:10px;color:#56655A;margin-top:18px;border-top:1px solid #E6E1D3;padding-top:6px">How profit is shared: egg sales by eggs each coop laid; spent hens to their coop; feed and medicine to the coop that used them; shared expenses split by number of birds. Feed and medicine bought are costs when used, not when bought. Chick cost is not in monthly profit (see each coop’s whole-life profit in the app).</p>');
    h.push('</div>');
    return h.join('');
  }

  return {
    num: num, int: int, cents: cents, fromCents: fromCents, live: live, byId: byId, sortChrono: sortChrono,
    addDays: addDays, dayDiff: dayDiff, monthOf: monthOf, addMonths: addMonths, settingsOf: settingsOf, allocate: allocate,
    flockAge: flockAge, birdsAlive: birdsAlive, birdsAtStartOf: birdsAtStartOf, activeFlocks: activeFlocks, flockInCoop: flockInCoop,
    dailyEggs: dailyEggs, layRate: layRate, toCrates: toCrates, cratesText: cratesText, lineEggs: lineEggs, isCarrySale: isCarrySale,
    eggStore: eggStore, carry: carry, saleTotals: saleTotals, customerLedger: customerLedger, customerBalance: customerBalance,
    priceFor: priceFor, validateSale: validateSale, validateDaily: validateDaily, itemKg: itemKg, feedState: feedState,
    feedKgOf: feedKgOf, recipeParts: recipeParts, recipeBatch: recipeBatch, isOwnMix: isOwnMix,
    mixPreview: mixPreview, medState: medState, profit: profit, flockLifetime: flockLifetime,
    generateFlockTasks: generateFlockTasks, nextDate: nextDate, taskStatus: taskStatus, dashboard: dashboard,
    lastDayOfMonth: lastDayOfMonth, balanceAt: balanceAt, monthlyReport: monthlyReport, reportHtml: reportHtml, money: money,
    oldestUnpaidDate: oldestUnpaidDate, debtSummary: debtSummary, periodSummary: periodSummary, yearSummary: yearSummary,
    dayRecords: dayRecords, dayTotal: dayTotal, weekStart: weekStart, eggsIn: eggsIn,
    repeatCode: repeatCode, repeatParts: repeatParts, repeatText: repeatText, repeatDate: repeatDate, seriesDates: seriesDates,
    deleteImpact: deleteImpact, resetPlan: resetPlan, RESET_GROUPS: RESET_GROUPS,
    alarmSettings: alarmSettings, alarmsFor: alarmsFor, coopSummary: coopSummary,
    defaultColour: defaultColour, flockColour: flockColour, lineColour: lineColour, flockColours: flockColours, coloursInUse: coloursInUse, waitingList: waitingList, waitAfterCall: waitAfterCall, waitWants: waitWants, parseTimes: parseTimes, shiftBack: shiftBack, summary: summary, summaryText: summaryText
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
