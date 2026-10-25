/* The Egg Man Farms — screens. Every form goes to a PREVIEW first; nothing is saved until "Confirm". */
(function () {
  'use strict';
  var E = window.EggCore, S = E.Store, C = window.Calc;
  var $main = document.getElementById('main');
  var $modal = document.getElementById('modal');
  var FORMS = {}, LIVE = {}, ACT = {}, pendingConfirm = null, isForm = false;

  // ================================================================ helpers
  function esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function st() { return S.state; }
  function me() { return S.session && S.session.user; }
  function role() { return me() ? me().role : ''; }
  function isRole() { var r = role(); return Array.prototype.slice.call(arguments).indexOf(r) >= 0; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dObj(s) { var p = String(s).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function dShort(s) { if (!s) return ''; var d = dObj(s); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; }
  function dLong(s) { if (!s) return ''; var d = dObj(s); return DAY[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
  function monthName(m) { var p = m.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; }
  function cur(c) { var n = Math.abs(c) / 100; return (c < 0 ? '−' : '') + 'GH₵ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function curN(v) { return cur(C.cents(v)); }
  function num(v) { return C.num(v); }
  function crates(p) { return C.cratesText(st(), p); }
  function byId(list, id) { return C.byId(list)[id]; }
  function userName(id) { var u = byId(st().users, id); return u ? u.name : (id || ''); }
  function cust(id) { return byId(st().customers, id); }
  function prod(id) { return byId(st().products, id); }
  function item(id) { return byId(st().items, id); }
  function flock(id) { return byId(st().flocks, id); }
  function live(list) { return C.live(list); }
  function coops() { var n = C.settingsOf(st()).coops, a = []; for (var i = 1; i <= n; i++) a.push(i); return a; }
  function setting(k, d) { var v = st().settings[k]; return v === undefined || v === '' ? d : v; }
  function farmName() { return setting('farmName', 'The Egg Man Farms'); }
  function val(form, name) { var el = form.elements[name]; return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }
  function toast(msg) { var t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, 3500); }
  function go(h) { if (location.hash === '#' + h) render(); else location.hash = h; }
  function phoneIntl(p) {
    var d = String(p || '').replace(/\D/g, '');
    if (d.length === 10 && d[0] === '0') return '233' + d.slice(1);
    if (d.length === 9) return '233' + d;
    return d;
  }
  function waLink(phone, text) { return 'https://wa.me/' + phoneIntl(phone) + '?text=' + encodeURIComponent(text); }
  function opt(value, label, selected) { return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function kv(k, v, cls) { return '<div class="kv"><span>' + esc(k) + '</span><b class="' + (cls || '') + '">' + v + '</b></div>'; }
  function back(h, label) { return '<a class="back" href="#' + h + '">← ' + esc(label) + '</a>'; }
  function head(title, sub, right) { return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>'; }
  function chipFor(kind) {
    var c = { Vaccination: 'green', Deworming: 'green', Debeaking: 'green', Medication: 'green', Disinfection: 'teal', 'Net clearing': 'teal', Maintenance: '', Emergency: 'solid-red', Other: '' }[kind];
    return '<span class="chip ' + (c || '') + '">' + esc(kind) + '</span>';
  }
  function stageChip(stage) {
    var c = { Laying: 'green', 'Old lay': 'red', Growing: 'yellow', Brooding: 'yellow', 'Pre-lay': 'yellow' }[stage] || '';
    return '<span class="chip ' + c + '">' + esc(stage) + '</span>';
  }
  var ICON = {
    home: '<path d="M3 11l9-7 9 7v9h-6v-6H9v6H3z"/>', coops: '<path d="M12 3c4 0 7 6 7 11a7 7 0 01-14 0c0-5 3-11 7-11z"/>',
    tasks: '<path d="M9 4h6v3H9zM6 6h12v15H6zM9 13l2 2 4-4"/>', sale: '<path d="M4 6h16l-2 9H6zM9 20h.01M17 20h.01"/>',
    customers: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.8 3.4-6 6.5-6s5.7 2.2 6.5 6M16 4.5a3.5 3.5 0 010 7M18 14c2 .8 3.2 2.8 3.5 6"/>',
    crates: '<path d="M3 7h18v13H3zM3 7l3-4h12l3 4M8 11h8"/>', feed: '<path d="M6 3h12l-1 18H7zM6 8h12"/>',
    store: '<path d="M10 3h4v4h4v4h-4v4h-4v-4H6V7h4z"/>', expenses: '<path d="M4 5h16v14H4zM4 9h16M8 14h4"/>',
    profit: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    report: '<path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h7M9 16h7M9 8h3"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>'; }

  // ================================================================ who can see what
  var NAV = {
    owner: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['sale-new', 'New sale', 'sale'], ['customers', 'Customers', 'customers'],
      ['crates', 'Crates out', 'crates'], ['feed', 'Feed', 'feed'], ['store', 'Medicine', 'store'], ['expenses', 'Expenses', 'expenses'], ['profit', 'Profit', 'profit'], ['report', 'Monthly report', 'report'], ['settings', 'Settings', 'settings']],
    manager: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['crates', 'Crates out', 'crates'], ['feed', 'Feed', 'feed'], ['store', 'Medicine', 'store'], ['settings', 'Settings', 'settings']],
    sales: [['home', 'Home', 'home'], ['sale-new', 'New sale', 'sale'], ['customers', 'Customers', 'customers'], ['crates', 'My eggs', 'crates'], ['tasks', 'Emergency', 'tasks'], ['settings', 'Settings', 'settings']],
    farmhand: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['settings', 'Settings', 'settings']]
  };
  var ALLOW = {
    'flock-new': ['owner', 'manager'], 'flock-close': ['owner'], daily: ['owner', 'manager', 'farmhand'], 'daily-edit': ['owner'],
    'sale-new': ['owner', 'sales'], receipt: ['owner', 'sales'], customers: ['owner', 'sales'], customer: ['owner', 'sales'],
    'customer-new': ['owner', 'sales'], 'customer-edit': ['owner'], 'payment-new': ['owner', 'sales'], preceipt: ['owner', 'sales'],
    crates: ['owner', 'manager', 'sales'], 'crates-out': ['owner', 'manager'], 'crates-return': ['owner', 'manager'], 'crates-adjust': ['owner'],
    feed: ['owner', 'manager'], 'feed-buy': ['owner', 'manager'], 'feed-mix': ['owner', 'manager'],
    store: ['owner', 'manager'], 'med-in': ['owner', 'manager'], 'med-use': ['owner', 'manager'],
    expenses: ['owner'], 'expense-new': ['owner'], profit: ['owner'], report: ['owner']
  };
  function seesMoney() { return isRole('owner', 'sales'); }

  // ================================================================ preview / confirm
  function preview(o) {
    var errs = o.errors || [], warns = o.warnings || [];
    pendingConfirm = errs.length ? null : o.onConfirm;
    $modal.innerHTML = '<div class="sheet stack" role="dialog" aria-modal="true" aria-labelledby="pvTitle">' +
      '<div class="tag">PREVIEW · NOT SAVED YET</div><h2 id="pvTitle">' + esc(o.title) + '</h2>' +
      '<div class="card">' + (o.rows || []).map(function (r) { return kv(r[0], r[1], r[2]); }).join('') + '</div>' +
      (o.extra || '') +
      errs.map(function (e) { return '<div class="alert err"><b>Fix this first:</b> ' + esc(e) + '</div>'; }).join('') +
      (warns.length ? '<div class="bold small">Please check:</div>' + warns.map(function (w) { return '<div class="alert warn">' + esc(w) + '</div>'; }).join('') : '') +
      (!errs.length && !warns.length ? '<div class="alert ok">✓ The app checked the numbers — everything looks normal.</div>' : '') +
      '<div class="grid g2"><button class="btn ghost" type="button" data-act="closeModal">← Go back &amp; edit</button>' +
      '<button class="btn' + (o.gold ? ' gold' : '') + '" type="button" data-act="confirm"' + (errs.length ? ' disabled' : '') + '>' + esc(o.confirm || 'Confirm & save') + '</button></div></div>';
    $modal.hidden = false;
    var b = $modal.querySelector('[data-act="confirm"]'); if (b && !b.disabled) b.focus(); else $modal.querySelector('button').focus();
  }
  ACT.closeModal = function () { $modal.hidden = true; $modal.innerHTML = ''; pendingConfirm = null; };
  ACT.confirm = async function (btn) {
    if (!pendingConfirm) return;
    btn.disabled = true; btn.textContent = 'Saving…';
    var fn = pendingConfirm; pendingConfirm = null;
    try { var next = await fn(); ACT.closeModal(); toast('Saved on this phone ✓ — syncing'); if (next) go(next); else render(); }
    catch (e) { console.error(e); btn.disabled = false; btn.textContent = 'Try again'; toast('Could not save: ' + e.message); }
  };
  $modal.addEventListener('click', function (e) { if (e.target === $modal) ACT.closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$modal.hidden) ACT.closeModal(); });

  // ================================================================ router
  var routes = {};
  function render() {
    if (!S.session) { isForm = false; $main.innerHTML = loginView(); renderNav(''); badge(); return; }
    var h = (location.hash || '#home').slice(1), parts = h.split('/'), name = parts[0];
    if (!routes[name]) name = 'home';
    if (ALLOW[name] && ALLOW[name].indexOf(role()) < 0) name = 'home';
    var html;
    try { html = routes[name].apply(null, parts.slice(1)); }
    catch (e) { console.error(e); html = '<div class="alert err">Something went wrong on this screen: ' + esc(e.message) + '</div>'; }
    var y = window.scrollY, same = render._last === h;
    $main.innerHTML = html;
    isForm = !!$main.querySelector('form[data-form]');
    renderNav(name); badge();
    if (same) window.scrollTo(0, y); else { window.scrollTo(0, 0); render._last = h; }
    $main.querySelectorAll('form[data-form]').forEach(function (f) { if (LIVE[f.dataset.form]) LIVE[f.dataset.form](f); });
    while (S.notices.length) toast(S.notices.shift());
  }
  function renderNav(active) {
    var items = NAV[role()] || [];
    var side = items.map(function (n) { return '<a href="#' + n[0] + '" class="' + (n[0] === active ? 'on' : '') + '">' + icon(n[2]) + esc(n[1]) + '</a>'; }).join('');
    document.getElementById('sideNav').innerHTML = side;
    var bottom = items.length > 5 ? items.slice(0, 4).concat([['more', 'More', 'more']]) : items;
    document.getElementById('bottomNav').innerHTML = S.session ? bottom.map(function (n) {
      var on = n[0] === active || (n[0] === 'more' && !items.slice(0, 4).some(function (x) { return x[0] === active; }) && active !== '');
      return '<a href="#' + n[0] + '" class="' + (on ? 'on' : '') + '">' + icon(n[2]) + esc(n[1]) + '</a>';
    }).join('') : '';
  }
  function badge() {
    var b = document.getElementById('syncBadge'), p = E.pending().length;
    var cls = '', txt;
    if (!E.configured()) { txt = 'Not connected'; cls = 'err'; }
    else if (!S.session) { txt = navigator.onLine ? 'Online' : 'Offline'; cls = navigator.onLine ? '' : 'off'; }
    else if (S.syncing) txt = 'Syncing…';
    else if (!navigator.onLine) { txt = 'Offline' + (p ? ' · ' + p + ' waiting' : ''); cls = 'off'; }
    else if (S.meta.lastError) { txt = 'Sync problem'; cls = 'warn'; }
    else if (p) { txt = p + ' to send'; cls = 'warn'; }
    else txt = 'Synced ✓';
    b.textContent = txt; b.className = 'sync ' + cls;
    b.title = S.meta.lastError || (S.meta.lastSync ? 'Last sync ' + new Date(S.meta.lastSync).toLocaleTimeString() : '');
  }
  ACT.syncNow = function () {
    if (!E.configured()) { toast('Edit config.js first (see SETUP.md).'); return; }
    if (!navigator.onLine) { toast('No internet. Your records are safe on this phone and will sync later.'); return; }
    if (S.meta.lastError) toast(S.meta.lastError);
    E.sync(true);
  };

  // ================================================================ login
  function loginView() {
    var cfg = E.configured();
    return '<div class="login"><div class="logo"><img src="icons/icon-512.png" alt=""><h1>' + esc(farmName()) + '</h1><p class="muted small">Farm, sales and debts — works without internet</p></div>' +
      (cfg ? '' : '<div class="alert err">This app is not connected to your Google Sheet yet. Open <b>config.js</b> and paste the web app URL and farm key (see SETUP.md).</div>') +
      '<form class="card" data-form="login" autocomplete="off"><label>Your name<input name="name" required autocomplete="username"></label>' +
      '<label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" required autocomplete="current-password"></label>' +
      '<button class="btn gold block" type="submit">Enter</button><div id="loginMsg" class="small red" role="alert"></div></form>' +
      '<p class="tiny muted" style="text-align:center">First login on a new phone needs internet. After that it works offline.</p></div>';
  }
  FORMS.login = async function (f) {
    var msg = document.getElementById('loginMsg'); msg.textContent = 'Checking…';
    try { var r = await E.login(val(f, 'name'), val(f, 'pin')); if (!r.ok) { msg.textContent = r.error; return; } go('home'); render(); }
    catch (e) { msg.textContent = 'Could not reach Google. Check the internet and config.js.'; }
  };

  // ================================================================ HOME
  routes.home = function () {
    var t = today(), s = st(), d = C.dashboard(s, t), u = me();
    var hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    var out = head(hi + ', ' + u.name, dLong(t) + ' · ' + esc(u.role));
    if (role() === 'sales') return out + salesHome(t, d);
    out += alertsBlock(t, d);
    var k = [];
    k.push(kpiBox('Eggs today', crates(d.eggsToday.total), d.layRate + '% lay · ' + d.coopsRecorded + '/' + d.coopsActive + ' coops recorded', 'dark'));
    if (seesMoney()) k.push(kpiBox('Sales today', cur(d.salesTodayCents), cur(d.cashTodayCents) + ' received', 'gold'));
    k.push(kpiBox('Eggs in store', crates(d.store.good), crates(d.store.cracked) + ' cracked'));
    if (seesMoney()) k.push(kpiBox('Customers owe', cur(d.debtCents), d.debtors + ' customers', '', d.debtCents > 0 ? 'red' : ''));
    k.push(kpiBox('Birds alive', d.birds.toLocaleString(), d.deaths + ' died today'));
    k.push(kpiBox('Tasks', d.tasks.overdue + ' overdue', d.tasks.today + ' today · ' + d.tasks.soon + ' soon', '', d.tasks.overdue ? 'red' : ''));
    out += '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    // eggs per coop
    var bars = coops().map(function (c) {
      var f = C.flockInCoop(s, c, t), rec = f && live(s.daily).filter(function (x) { return x.flockId === f.id && x.date === t; })[0];
      return { c: c, v: rec ? C.dailyEggs(s, rec).total : 0, f: f, rec: rec };
    });
    var max = Math.max.apply(null, bars.map(function (b) { return b.v; }).concat([1]));
    out += '<div class="card stack" style="margin-top:12px"><div class="row between"><h2>Eggs per coop today</h2><span class="tiny muted">crates</span></div><div class="bars">' +
      bars.map(function (b) {
        var h = b.v ? Math.max(4, Math.round(b.v / max * 90)) : 4;
        return '<a class="b" href="#' + (b.f ? 'coop/' + b.f.id : 'coops') + '" style="text-decoration:none;color:inherit"><span class="tiny">' + (b.rec ? Math.floor(b.v / C.settingsOf(s).eggsPerCrate) : (b.f ? '—' : '')) + '</span><i class="' + (b.rec ? '' : 'y') + '" style="height:' + h + 'px"></i><b>C' + b.c + '</b></a>';
      }).join('') + '</div><div class="tiny muted">Yellow = no record yet today</div></div>';
    if (isRole('owner')) {
      var sellers = Object.keys(d.bySeller);
      out += '<div class="card" style="margin-top:12px"><h2>Sales by salesperson today</h2>' +
        (sellers.length ? sellers.map(function (id) { return kv(userName(id), cur(d.bySeller[id])); }).join('') : '<div class="empty">No sales yet today</div>') + '</div>';
    }
    if (isRole('manager', 'farmhand', 'owner')) out += tasksPreviewBlock(t);
    return out;
  };
  function kpiBox(l, v, s, cls, vcls) { return '<div class="kpi ' + (cls || '') + '"><div class="l">' + esc(l) + '</div><div class="v ' + (vcls || '') + '">' + esc(v) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }
  function alertsBlock(t, d) {
    var s = st(), a = [];
    live(s.tasks).filter(function (x) { return x.kind === 'Emergency' && x.status === 'open'; }).forEach(function (x) {
      a.push('<a class="alert err" style="display:block;text-decoration:none" href="#task/' + x.id + '"><b>EMERGENCY · ' + esc(whereText(x)) + ':</b> ' + esc(x.title) + ' — reported by ' + esc(userName(x.by)) + '</a>');
    });
    if (d.tasks.overdue) a.push('<a class="alert err" style="display:block;text-decoration:none" href="#tasks">' + d.tasks.overdue + ' task(s) overdue — tap to see</a>');
    var missing = C.activeFlocks(s, t).filter(function (f) { return !live(s.daily).some(function (x) { return x.flockId === f.id && x.date === t; }); });
    if (missing.length && new Date().getHours() >= 12 && isRole('owner', 'manager', 'farmhand'))
      a.push('<a class="alert warn" style="display:block;text-decoration:none" href="#coops">No record yet today for ' + missing.map(function (f) { return 'Coop ' + f.coop; }).join(', ') + '</a>');
    if (isRole('owner', 'manager')) {
      var fs = C.feedState(s), ms = C.medState(s, t), low = [];
      Object.keys(fs.items).forEach(function (k) { if (fs.items[k].low) low.push(item(k).name); });
      Object.keys(ms.items).forEach(function (k) { if (ms.items[k].low) low.push(item(k).name); if (ms.items[k].expiringSoon) low.push(item(k).name + ' (expires ' + dShort(ms.items[k].earliestExpiry) + ')'); });
      if (low.length) a.push('<a class="alert warn" style="display:block;text-decoration:none" href="#' + (role() === 'owner' ? 'feed' : 'feed') + '">Running low: ' + esc(low.slice(0, 6).join(', ')) + (low.length > 6 ? '…' : '') + '</a>');
      salesUsers().forEach(function (u) {
        var c = C.carry(s, u.id, t);
        if (c.returnRecorded && !c.balanced) a.push('<a class="alert err" style="display:block;text-decoration:none" href="#crates">' + esc(u.name) + ': ' + crates(c.remaining.good) + ' good eggs not accounted for today</a>');
      });
    }
    var noPrice = live(s.products).filter(function (p) { return p.active && !(num(p.retail) > 0); });
    if (noPrice.length && isRole('owner')) a.push('<div class="alert warn">Prices not set yet for: ' + esc(noPrice.map(function (p) { return p.name; }).join(', ')) + '. Put them in the <b>Products</b> tab of your Google Sheet.</div>');
    return a.length ? '<div class="stack" style="margin-bottom:12px">' + a.join('') + '</div>' : '';
  }
  function salesUsers() { return live(st().users).filter(function (u) { return u.active && u.role === 'sales'; }); }
  function salesHome(t, d) {
    var s = st(), u = me(), c = C.carry(s, u.id, t);
    var mine = live(s.sales).filter(function (x) { return x.by === u.id && x.date === t; });
    var total = 0, cash = { Cash: 0, MoMo: 0, Bank: 0 };
    mine.forEach(function (x) { total += C.saleTotals(x).totalCents; (x.payments || []).forEach(function (p) { cash[p.method] = (cash[p.method] || 0) + C.cents(p.amount); }); });
    live(s.payments).filter(function (p) { return p.by === u.id && p.date === t; }).forEach(function (p) { cash[p.method] = (cash[p.method] || 0) + C.cents(p.amount); });
    var out = '<div class="grid g2">' + kpiBox('Eggs with you now', crates(c.remaining.good), crates(c.remaining.cracked) + ' cracked', 'dark') +
      kpiBox('My sales today', cur(total), mine.length + ' sales', 'gold') + '</div>';
    out += '<div class="grid g2" style="margin-top:12px"><a class="btn gold" href="#sale-new">+ New sale</a><a class="btn ghost" href="#customers">Customers</a></div>';
    out += '<div class="card" style="margin-top:12px"><h2>Money to hand in today</h2>' + kv('Cash', cur(cash.Cash || 0)) + kv('MoMo', cur(cash.MoMo || 0)) + kv('Bank', cur(cash.Bank || 0)) +
      kv('Total received', cur((cash.Cash || 0) + (cash.MoMo || 0) + (cash.Bank || 0))) + '</div>';
    out += '<div class="card" style="margin-top:12px"><h2>Today’s sales</h2>' + (mine.length ? mine.slice().reverse().map(function (x) {
      var tt = C.saleTotals(x); return '<a class="kv" style="text-decoration:none;color:inherit" href="#receipt/' + x.id + '"><span>' + esc(x.receiptNo) + ' · ' + esc((cust(x.customerId) || {}).name) + '</span><b>' + cur(tt.totalCents) + '</b></a>';
    }).join('') : '<div class="empty">No sales yet</div>') + '</div>';
    out += '<a class="btn red block" style="margin-top:12px" href="#task-new/emergency">Report an emergency</a>';
    return out;
  }
  function tasksPreviewBlock(t) {
    var list = openTasks().filter(function (x) { var k = C.taskStatus(x, t); return k === 'overdue' || k === 'today' || k === 'soon' || k === 'emergency'; }).slice(0, 6);
    return '<div class="card stack" style="margin-top:12px"><div class="row between"><h2>Tasks needing attention</h2><a class="small" href="#tasks">All tasks</a></div>' +
      (list.length ? '<div class="list">' + list.map(taskItem).join('') + '</div>' : '<div class="empty">Nothing due in the next 2 days ✓</div>') + '</div>';
  }

  // ================================================================ COOPS
  routes.coops = function () {
    var s = st(), t = today();
    var out = head('Coops', C.activeFlocks(s, t).reduce(function (a, f) { return a + C.birdsAlive(s, f, t); }, 0).toLocaleString() + ' birds alive');
    out += '<div class="grid g2 g4-md">' + coops().map(function (c) {
      var f = C.flockInCoop(s, c, t);
      if (!f) return '<a class="card" style="text-decoration:none;color:inherit" href="#' + (isRole('owner', 'manager') ? 'flock-new/' + c : 'coops') + '"><h2>Coop ' + c + '</h2><p class="small muted">Empty</p>' + (isRole('owner', 'manager') ? '<span class="btn sm gold">Start new flock</span>' : '') + '</a>';
      var a = C.flockAge(s, f, t), rec = live(s.daily).filter(function (x) { return x.flockId === f.id && x.date === t; })[0];
      var next = openTasks().filter(function (x) { return x.flockId === f.id || (x.coops || []).indexOf(c) >= 0; })[0];
      var nk = next ? C.taskStatus(next, t) : '';
      return '<a class="card stack" style="text-decoration:none;color:inherit;gap:6px" href="#coop/' + f.id + '"><div class="row between"><h2>Coop ' + c + '</h2>' + stageChip(a.stage) + '</div>' +
        '<div class="small muted">' + C.birdsAlive(s, f, t).toLocaleString() + ' birds · week ' + a.week + '</div>' +
        '<div class="row between small"><span class="muted">Today</span><b class="' + (rec ? '' : 'red') + '">' + (rec ? crates(C.dailyEggs(s, rec).total) : 'No record') + '</b></div>' +
        (next ? '<div class="tiny ' + (nk === 'overdue' ? 'red bold' : 'muted') + '">' + (nk === 'overdue' ? 'OVERDUE: ' : 'Next: ') + esc(next.title) + ' · ' + dShort(next.date) + '</div>' : '') + '</a>';
    }).join('') + '</div>';
    return out;
  };
  function openTasks() { return C.sortChrono(live(st().tasks).filter(function (x) { return x.status === 'open'; })); }

  routes.coop = function (id, all) {
    var s = st(), f = flock(id), t = today();
    if (!f) return back('coops', 'Coops') + '<div class="empty">Flock not found.</div>';
    var a = C.flockAge(s, f, t), birds = C.birdsAlive(s, f, t);
    var recs = C.sortChrono(live(s.daily).filter(function (x) { return x.flockId === f.id; }));
    var deaths = recs.reduce(function (z, x) { return z + C.int(x.deaths) + C.int(x.culls); }, 0);
    var eggs = recs.reduce(function (z, x) { return z + C.dailyEggs(s, x).total; }, 0);
    var feedKg = recs.reduce(function (z, x) { return z + (x.feedItemId ? C.itemKg(s, item(x.feedItemId), x.feedBags, 'bag') : 0); }, 0);
    var set = C.settingsOf(s), w = a.week;
    var out = back('coops', 'All coops') + head('Coop ' + f.coop + ' · Week ' + a.week, esc(f.breed || '') + ' · ' + C.int(f.chicks).toLocaleString() + ' day-old chicks · arrived ' + dLong(f.arrival),
      f.status === 'active' && isRole('owner', 'manager', 'farmhand') ? '<a class="btn gold" href="#daily/' + f.id + '">Today’s record</a>' : '');
    out += '<div class="card stack" style="gap:6px"><div class="stagebar"><span class="on"></span><span class="' + (w > set.broodingToWeek ? 'on' : '') + '"></span><span class="' + (w > set.growerToWeek ? 'on' : '') + '"></span><span class="' + (w > set.preLayToWeek ? 'on' : '') + '"></span></div>' +
      '<div class="stagebar tiny muted"><div>Brood</div><div>Growing (wk ' + (set.broodingToWeek + 1) + '–' + set.growerToWeek + ')</div><div>Pre-lay</div><div class="bold">Laying</div></div><div>' + stageChip(a.stage) + ' <span class="small muted">day ' + a.day + '</span></div></div>';
    out += '<div class="grid g2 g4-md" style="margin-top:12px">' + kpiBox('Alive', birds.toLocaleString(), '') +
      kpiBox('Died / culled', deaths.toLocaleString(), (f.chicks ? (Math.round(deaths / f.chicks * 1000) / 10) : 0) + '% of chicks') +
      kpiBox('Feed eaten', Math.round(feedKg).toLocaleString() + ' kg', Math.round(feedKg / set.kgPerBag) + ' bags') +
      kpiBox('Eggs so far', crates(eggs), recs.length + ' daily records') + '</div>';
    if (isRole('owner')) {
      var L = C.flockLifetime(s, f, t);
      out += '<div class="card" style="margin-top:12px"><h2>Money for this flock (whole life)</h2>' + kv('Income', cur(L.incomeCents)) + kv('Running costs (feed, medicine, expenses)', cur(L.runningCostCents)) +
        kv('Chicks cost', cur(L.chickCostCents)) + kv('Profit so far', cur(L.profitCents), L.profitCents < 0 ? 'red' : 'greenx') + '</div>';
    }
    // timeline
    var tl = C.sortChrono(live(s.tasks).filter(function (x) { return x.flockId === f.id || ((x.coops || []).indexOf(C.int(f.coop)) >= 0 && x.date >= f.arrival); }));
    var upcoming = tl.filter(function (x) { return x.status === 'open' && x.date >= t; });
    var shown = all ? tl : tl.filter(function (x) { return x.status !== 'open' || x.date < t; }).concat(upcoming.slice(0, 5));
    out += '<div class="card" style="margin-top:12px"><div class="row between"><h2>From day-old to laying</h2>' + (all ? '' : '<a class="small" href="#coop/' + f.id + '/all">Show all ' + tl.length + '</a>') + '</div><div class="timeline" style="margin-top:6px">' +
      tlRow('Day 1', 'Arrived · ' + C.int(f.chicks).toLocaleString() + ' chicks', 'done', '✓', dShort(f.arrival)) +
      shown.map(function (x) {
        var k = C.taskStatus(x, t), day = C.dayDiff(f.arrival, x.date) + 1;
        var lbl = day <= 49 ? 'Day ' + day : 'Wk ' + Math.ceil(day / 7);
        var stt = k === 'done' ? '✓ Done' : k === 'overdue' ? 'Overdue' : k === 'today' ? 'Today' : dShort(x.date);
        return tlRow(lbl, '<a href="#task/' + x.id + '" style="color:inherit;text-decoration:none">' + esc(x.title) + '</a>', k === 'done' ? 'done' : k === 'overdue' ? 'over' : '', stt, '', k === 'overdue' ? 'red' : k === 'done' ? 'greenx' : 'muted');
      }).join('') + '</div>' +
      (isRole('owner', 'manager') ? '<a class="btn light sm" href="#task-new/coop/' + f.coop + '">+ Add task for Coop ' + f.coop + '</a>' : '') + '</div>';
    // records
    var last = recs.slice(-14).reverse();
    out += '<div class="card" style="margin-top:12px"><h2>Recent daily records</h2>' + (last.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th>Eggs</th><th>Cracked</th><th>Lay %</th><th>Died</th><th>Feed</th>' + (isRole('owner') ? '<th></th>' : '') + '</tr></thead><tbody>' +
      last.map(function (x) {
        var e = C.dailyEggs(s, x);
        return '<tr><td>' + dShort(x.date) + '</td><td>' + crates(e.good) + '</td><td>' + e.cracked + '</td><td>' + C.layRate(s, x) + '%</td><td>' + (C.int(x.deaths) + C.int(x.culls)) + '</td><td>' + (num(x.feedBags) || 0) + ' bg</td>' +
          (isRole('owner') ? '<td><a href="#daily-edit/' + x.id + '">Edit</a></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">No records yet</div>') + '</div>';
    if (isRole('owner') && f.status === 'active') out += '<a class="btn light block" style="margin-top:12px" href="#flock-close/' + f.id + '">Close this flock (all birds sold)</a>';
    return out;
  };
  function tlRow(w, text, dot, status, sub, cls) {
    return '<div class="tl"><div class="w">' + esc(w) + '</div><div class="dot"><i class="' + dot + '"></i></div><div class="x">' + text + (sub ? ' <span class="tiny muted">' + esc(sub) + '</span>' : '') + '</div><div class="st ' + (cls || 'greenx') + '">' + esc(status) + '</div></div>';
  }

  // ---------- new flock
  routes['flock-new'] = function (coop) {
    var s = st(), t = today();
    var free = coops().filter(function (c) { return !C.flockInCoop(s, c, t); });
    return back('coops', 'Coops') + head('Start a new flock', 'The vaccination, deworming and debeaking schedule is created automatically.') +
      '<form class="card" data-form="flock"><label>Coop<select name="coop" required>' + free.map(function (c) { return opt(c, 'Coop ' + c, coop); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>Day-old chicks received<input name="chicks" type="number" inputmode="numeric" min="1" required></label><label>Arrival date<input name="arrival" type="date" value="' + t + '" required></label></div>' +
      '<div class="grid g2"><label>Breed<input name="breed" placeholder="e.g. Isa Brown"></label><label>Cost per chick (GH₵)<input name="costPerChick" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<label>Supplier<input name="supplier"></label><button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.flock = function (f) {
    var s = st(), t = today();
    var rec = { type: 'flocks', coop: C.int(val(f, 'coop')), chicks: C.int(val(f, 'chicks')), arrival: val(f, 'arrival'), breed: val(f, 'breed').trim(),
      costPerChick: num(val(f, 'costPerChick')), supplier: val(f, 'supplier').trim(), status: 'active' };
    rec.id = E.uid();
    var errors = [], warnings = [];
    if (!rec.coop) errors.push('Choose a coop.');
    if (C.flockInCoop(s, rec.coop, rec.arrival)) errors.push('Coop ' + rec.coop + ' already has an active flock.');
    if (rec.chicks <= 0) errors.push('Enter the number of chicks.');
    if (rec.arrival > t) warnings.push('Arrival date is in the future.');
    if (!rec.costPerChick) warnings.push('No cost per chick — flock profit will not include the chick cost.');
    var tasks = C.generateFlockTasks(rec, s.template, E.uid);
    var future = tasks.filter(function (x) { return x.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!s.template.length) warnings.push('Your Schedule tab is empty, so no health tasks will be created.');
    preview({ title: 'New flock in Coop ' + rec.coop, rows: [['Chicks', rec.chicks.toLocaleString()], ['Arrival', dLong(rec.arrival)], ['Breed', esc(rec.breed || '—')],
      ['Chick cost', rec.costPerChick ? cur(Math.round(rec.chicks * rec.costPerChick * 100)) : '—'], ['Health tasks to create', tasks.length + ' (' + future.length + ' still ahead)']],
      extra: '<div class="card small">' + future.slice(0, 6).map(function (x) { return kv(dShort(x.date), esc(x.title)); }).join('') + (future.length > 6 ? '<div class="tiny muted">…and ' + (future.length - 6) + ' more</div>' : '') + '</div>',
      errors: errors, warnings: warnings,
      onConfirm: async function () {
        tasks.forEach(function (x) { x.type = 'tasks'; if (x.date < t) { x.status = 'done'; x.doneNote = 'Before the app was used'; x.doneAt = t; } });
        await E.save([rec].concat(tasks)); return 'coop/' + rec.id;
      } });
  };
  routes['flock-close'] = function (id) {
    var f = flock(id); if (!f) return '';
    return back('coop/' + id, 'Coop ' + f.coop) + head('Close flock in Coop ' + f.coop, 'Do this when all birds have been sold or removed. Open tasks for this flock will be closed.') +
      '<form class="card" data-form="flockclose" data-id="' + esc(id) + '"><label>Date<input type="date" name="date" value="' + today() + '" required></label><label>Note<input name="note" placeholder="e.g. sold as spent hens"></label><button class="btn red" type="submit">Next: preview →</button></form>';
  };
  FORMS.flockclose = function (f) {
    var fl = flock(f.dataset.id), s = st(), date = val(f, 'date');
    var birds = C.birdsAlive(s, fl, date);
    var open = live(s.tasks).filter(function (x) { return x.flockId === fl.id && x.status === 'open'; });
    preview({ title: 'Close Coop ' + fl.coop + ' flock', rows: [['Closing date', dLong(date)], ['Birds still recorded', birds], ['Open tasks to close', open.length]],
      warnings: birds > 0 ? [birds + ' birds are still recorded. Sell them as spent hens first, or record deaths, so the numbers are right.'] : [],
      onConfirm: async function () {
        var up = Object.assign({}, fl, { status: 'closed', closedOn: date, closeNote: val(f, 'note') });
        var ts = open.map(function (x) { return Object.assign({}, x, { status: 'done', doneAt: date, doneBy: me().id, doneNote: 'Flock closed' }); });
        await E.save([up].concat(ts)); return 'coops';
      } });
  };

  // ---------- daily record
  routes.daily = function (flockId) { return dailyForm(null, flockId); };
  routes['daily-edit'] = function (id) { var r = byId(st().daily, id); return r ? dailyForm(r, r.flockId) : ''; };
  function dailyForm(rec, flockId) {
    var s = st(), t = today();
    var flocks = C.activeFlocks(s, t);
    if (rec && !flocks.some(function (x) { return x.id === rec.flockId; })) flocks.push(flock(rec.flockId));
    var fid = flockId || (flocks[0] && flocks[0].id);
    var lastFeed = C.sortChrono(live(s.daily).filter(function (x) { return x.flockId === fid && x.feedItemId; })).slice(-1)[0];
    var r = rec || { date: t, feedItemId: lastFeed ? lastFeed.feedItemId : '' };
    var feeds = live(s.items).filter(function (i) { return i.category === 'feed' && i.active !== false; });
    function n(name, label, mode, step) { return '<label>' + label + '<input name="' + name + '" type="number" min="0" step="' + (step || 1) + '" inputmode="' + (mode || 'numeric') + '" value="' + esc(r[name] === undefined ? '' : r[name]) + '"></label>'; }
    return back(fid ? 'coop/' + fid : 'coops', 'Coop') + head(rec ? 'Edit daily record' : 'Daily record', 'Step 1 of 2 · fill in, then preview') +
      '<form class="card" data-form="daily"' + (rec ? ' data-id="' + esc(rec.id) + '"' : '') + '>' +
      '<div class="grid g2"><label>Coop<select name="flockId">' + flocks.map(function (f) { return opt(f.id, 'Coop ' + f.coop + ' · ' + C.flockAge(s, f, t).stage, fid); }).join('') + '</select></label>' +
      '<label>Date<input type="date" name="date" value="' + esc(r.date) + '" max="' + t + '" required></label></div>' +
      '<h3>Eggs collected</h3><div class="grid g3">' + n('goodCrates', 'Good · crates') + n('goodPieces', '+ loose pieces') + n('cracked', 'Cracked (pieces)') + '</div>' +
      '<div class="alert ok small" id="dailyLive">Lay rate will show here</div>' +
      '<h3>Birds</h3><div class="grid g2">' + n('deaths', 'Dead birds') + n('culls', 'Culled / removed') + '</div>' +
      '<h3>Feed &amp; water</h3><div class="grid g2"><label>Feed type<select name="feedItemId"><option value="">—</option>' + feeds.map(function (i) { return opt(i.id, i.name, r.feedItemId); }).join('') + '</select></label>' +
      n('feedBags', 'Feed used (bags)', 'decimal', '0.25') + '</div>' + n('water', 'Water (litres)', 'decimal', 'any') +
      '<label>Notes (sick birds, drugs given…)<textarea name="notes">' + esc(r.notes || '') + '</textarea></label>' +
      '<div class="sticky-actions"><button class="btn block" type="submit">Next: preview →</button></div></form>';
  }
  function readDaily(f) {
    var fl = flock(val(f, 'flockId'));
    return { id: f.dataset.id || undefined, type: 'daily', flockId: val(f, 'flockId'), coop: fl ? fl.coop : '', date: val(f, 'date'), today: today(),
      goodCrates: C.int(val(f, 'goodCrates')), goodPieces: C.int(val(f, 'goodPieces')), cracked: C.int(val(f, 'cracked')),
      deaths: C.int(val(f, 'deaths')), culls: C.int(val(f, 'culls')), feedItemId: val(f, 'feedItemId'), feedBags: num(val(f, 'feedBags')),
      water: num(val(f, 'water')), notes: val(f, 'notes').trim() };
  }
  LIVE.daily = function (f) {
    var d = readDaily(f), fl = flock(d.flockId), box = document.getElementById('dailyLive'); if (!box || !fl) return;
    var birds = C.birdsAtStartOf(st(), fl, d.date), e = C.dailyEggs(st(), d);
    box.textContent = e.total ? ('Total ' + crates(e.total) + ' (' + e.total + ' eggs) from ' + birds.toLocaleString() + ' birds = ' + (birds ? Math.round(e.total / birds * 1000) / 10 : 0) + '% lay rate') : 'Lay rate will show here';
  };
  FORMS.daily = function (f) {
    var d = readDaily(f), v = C.validateDaily(st(), d), fl = flock(d.flockId);
    if (d.feedItemId && d.feedBags > 0 && !d.id) {
      var fsx = C.feedState(st()).items[d.feedItemId], need = C.itemKg(st(), item(d.feedItemId), d.feedBags, 'bag');
      if (fsx && fsx.tracked && need > fsx.kg + 1e-9) v.warnings.push('The feed store shows only ' + fsx.bags + ' bags of ' + item(d.feedItemId).name + '. Record the feed bought or mixed first, so its cost is counted correctly.');
    }
    var feedTxt = d.feedBags ? d.feedBags + ' bags · ' + esc((item(d.feedItemId) || {}).name || '') : '—';
    preview({ title: 'Coop ' + (fl ? fl.coop : '') + ' · ' + dLong(d.date), errors: v.errors, warnings: v.warnings,
      rows: [['Good eggs', d.goodCrates + ' crates + ' + d.goodPieces + ' pieces'], ['Cracked eggs', d.cracked + ' pieces'], ['Total', crates(v.eggs ? v.eggs.total : 0)],
        ['Lay rate', (v.layRate || 0) + '%'], ['Dead / culled', d.deaths + ' / ' + d.culls + (v.birdsAfter !== undefined ? ' (birds now ' + v.birdsAfter + ')' : '')],
        ['Feed', feedTxt], ['Water', d.water ? d.water + ' L' : '—'], ['Notes', esc(d.notes || '—')]],
      extra: '<p class="tiny muted">After saving, only the owner can change this record. Every change is logged.</p>',
      onConfirm: async function () {
        delete d.today;
        if (d.id) { var old = byId(st().daily, d.id); d = Object.assign({}, old, d); } else delete d.id;
        await E.save(d); return 'coop/' + d.flockId;
      } });
  };

  // ================================================================ TASKS
  var KINDS = ['Vaccination', 'Deworming', 'Debeaking', 'Medication', 'Disinfection', 'Net clearing', 'Maintenance', 'Other'];
  var GROUPS = { health: ['Vaccination', 'Deworming', 'Debeaking', 'Medication'], cleaning: ['Disinfection', 'Net clearing'], maintenance: ['Maintenance', 'Other'], emergency: ['Emergency'] };
  function whereText(x) { return (x.coops && x.coops.length) ? 'Coop ' + x.coops.join(', ') : 'Whole farm'; }
  function taskItem(x) {
    var t = today(), k = C.taskStatus(x, t), d = dObj(x.date);
    var badgeCls = { overdue: 'red', emergency: 'red', today: 'yellow', soon: 'yellow', done: 'green' }[k] || '';
    var stTxt = { overdue: 'Overdue ' + (-C.dayDiff(t, x.date)) + ' day(s)', today: 'Today', soon: 'In ' + C.dayDiff(t, x.date) + ' day(s)', later: 'In ' + C.dayDiff(t, x.date) + ' days', done: 'Done' + (x.doneBy ? ' by ' + userName(x.doneBy) : ''), emergency: 'Open emergency' }[k];
    return '<a class="item" href="#task/' + x.id + '" style="' + (k === 'emergency' ? 'background:var(--red-soft);border-color:#E7A08D' : '') + '"><div class="date-badge ' + badgeCls + '"><b>' + d.getUTCDate() + '</b>' + MON[d.getUTCMonth()].toUpperCase() + '</div>' +
      '<div class="grow"><div class="row" style="gap:6px">' + chipFor(x.kind) + '<span class="tiny bold ' + (k === 'overdue' || k === 'emergency' ? 'red' : 'muted') + '">' + esc(stTxt) + '</span></div><div class="t">' + esc(x.title) + '</div>' +
      '<div class="sub">' + esc(whereText(x)) + (x.assignee ? ' · ' + esc(userName(x.assignee)) : '') + (x.repeat && x.repeat !== 'once' ? ' · repeats' : '') + '</div></div></a>';
  }
  routes.tasks = function (filter) {
    filter = filter || 'all';
    var t = today(), all = live(st().tasks);
    if (role() === 'sales') all = all.filter(function (x) { return x.kind === 'Emergency'; });
    var list = all.filter(function (x) {
      if (filter === 'done') return x.status !== 'open';
      if (x.status !== 'open') return false;
      return filter === 'all' || (GROUPS[filter] || []).indexOf(x.kind) >= 0;
    });
    list = filter === 'done' ? C.sortChrono(list).reverse().slice(0, 60) : C.sortChrono(list);
    var right = '<div class="row">' + (role() !== 'sales' ? '<a class="btn gold sm" href="#task-new">+ Add task</a>' : '') + '</div>';
    var out = head(role() === 'sales' ? 'Emergencies' : 'Farm tasks', role() === 'sales' ? 'Report a problem at the farm or with deliveries' : 'Health · cleaning · maintenance · emergencies', right);
    out += '<a class="btn red block" href="#task-new/emergency" style="margin-bottom:12px">Report an emergency</a>';
    if (role() !== 'sales') {
      out += '<div class="pills" style="margin-bottom:12px">' + [['all', 'All open'], ['health', 'Health'], ['cleaning', 'Cleaning'], ['maintenance', 'Maintenance'], ['emergency', 'Emergency'], ['done', 'Done']].map(function (p) {
        return '<a class="pill ' + (filter === p[0] ? 'on' : '') + '" href="#tasks/' + p[0] + '" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">' + p[1] + '</a>';
      }).join('') + '</div>';
    }
    if (filter === 'done') return out + (list.length ? '<div class="list">' + list.map(taskItem).join('') + '</div>' : '<div class="empty">Nothing yet</div>');
    var groups = [['Emergencies', function (k) { return k === 'emergency'; }], ['Overdue', function (k) { return k === 'overdue'; }], ['Today', function (k) { return k === 'today'; }],
      ['Next 2 days', function (k) { return k === 'soon'; }], ['Coming up', function (k) { return k === 'later'; }]];
    var any = false;
    groups.forEach(function (g) {
      var items = list.filter(function (x) { return g[1](C.taskStatus(x, t)); });
      if (g[0] === 'Coming up') items = items.slice(0, 30);
      if (!items.length) return; any = true;
      out += '<h2 style="margin:14px 0 8px">' + g[0] + '</h2><div class="list">' + items.map(taskItem).join('') + '</div>';
    });
    if (!any) out += '<div class="empty">No open tasks here ✓</div>';
    out += '<p class="tiny muted" style="margin-top:14px">Every task with a date goes into the owner’s Google Calendar: the phone alarm rings the evening before and on the morning of the task.</p>';
    return out;
  };
  routes.task = function (id) {
    var x = byId(st().tasks, id); if (!x) return back('tasks', 'Tasks') + '<div class="empty">Task not found.</div>';
    var t = today(), k = C.taskStatus(x, t);
    var out = back('tasks', 'Tasks') + head(x.title, chipFor(x.kind) + ' ' + esc(whereText(x)) + ' · ' + dLong(x.date));
    out += '<div class="card">' + kv('Status', esc(k === 'done' ? 'Done' : k === 'emergency' ? 'Open emergency' : k[0].toUpperCase() + k.slice(1)), k === 'overdue' || k === 'emergency' ? 'red' : '') +
      (x.assignee ? kv('Assigned to', esc(userName(x.assignee))) : '') + (x.repeat && x.repeat !== 'once' ? kv('Repeats', esc(REPEAT[x.repeat])) : '') +
      kv('Added by', esc(userName(x.by) || 'Schedule')) + (x.notes ? kv('Notes', esc(x.notes)) : '') +
      (x.status !== 'open' ? kv('Done', esc(dShort(x.doneAt)) + ' by ' + esc(userName(x.doneBy))) + (x.doneNote ? kv('Note', esc(x.doneNote)) : '') : '') + '</div>';
    if (x.kind === 'Emergency' && x.status === 'open') {
      var owp = setting('ownerWhatsapp', '');
      var text = 'EMERGENCY at ' + farmName() + ' (' + whereText(x) + '): ' + x.title + (x.notes ? '\n' + x.notes : '') + '\nReported by ' + userName(x.by);
      if (owp && !isRole('owner')) out += '<a class="btn wa block" style="margin-top:12px" target="_blank" rel="noopener" href="' + esc(waLink(owp, text)) + '">Send WhatsApp alert to the owner</a>';
      out += '<p class="tiny muted">The owner also gets an email and a phone alarm as soon as this phone syncs.</p>';
    }
    if (x.status === 'open' && (x.kind !== 'Emergency' || isRole('owner', 'manager'))) {
      var health = GROUPS.health.indexOf(x.kind) >= 0 || x.kind === 'Disinfection';
      var meds = live(st().items).filter(function (i) { return i.category === 'medicine' && i.active !== false; });
      out += '<form class="card" data-form="taskdone" data-id="' + esc(x.id) + '" style="margin-top:12px"><h2>' + (x.kind === 'Emergency' ? 'Mark as handled' : 'Mark as done') + '</h2>' +
        (health && isRole('owner', 'manager', 'farmhand') ? '<div class="grid g2"><label>Medicine / vaccine used<select name="medItemId"><option value="">— none —</option>' + meds.map(function (i) { return opt(i.id, i.name); }).join('') + '</select></label>' +
          '<label>Quantity used<input name="medQty" type="number" min="0" step="any" inputmode="decimal"></label></div>' : '') +
        '<label>Date done<input type="date" name="doneAt" value="' + t + '" max="' + t + '"></label><label>Note<input name="note" placeholder="optional"></label>' +
        '<button class="btn" type="submit">Next: preview →</button></form>';
    }
    if (isRole('owner')) out += '<button class="btn light block" style="margin-top:12px" type="button" data-act="deleteTask" data-id="' + esc(x.id) + '">Delete this task</button>';
    return out;
  };
  FORMS.taskdone = function (f) {
    var x = byId(st().tasks, f.dataset.id), s = st();
    var medId = val(f, 'medItemId'), qty = num(val(f, 'medQty')), doneAt = val(f, 'doneAt') || today();
    var errors = [], warnings = [];
    if (medId && !(qty > 0)) errors.push('Enter how much medicine was used.');
    var nxt = C.nextDate(x.date, x.repeat);
    var ms = medId ? C.medState(s, today()).items[medId] : null;
    if (ms && qty > ms.qty) warnings.push('The store shows only ' + ms.qty + ' ' + (item(medId).unit || '') + ' of ' + item(medId).name + '.');
    var rows = [['Task', esc(x.title)], ['Where', esc(whereText(x))], ['Done on', dLong(doneAt)]];
    if (medId) rows.push(['Medicine used', qty + ' ' + esc(item(medId).unit || '') + ' ' + esc(item(medId).name)]);
    if (nxt) rows.push(['Next time', dLong(nxt) + ' (new task will be added)']);
    preview({ title: x.kind === 'Emergency' ? 'Emergency handled' : 'Task done', rows: rows, errors: errors, warnings: warnings,
      onConfirm: async function () {
        var recs = [Object.assign({}, x, { status: x.kind === 'Emergency' ? 'handled' : 'done', doneAt: doneAt, doneBy: me().id, doneNote: val(f, 'note').trim() })];
        if (medId && qty > 0) {
          var targets = x.flockId ? [flock(x.flockId)] : (x.coops && x.coops.length ? x.coops : coops()).map(function (c) { return C.flockInCoop(s, c, doneAt); }).filter(Boolean);
          if (!targets.length) recs.push({ type: 'med', kind: 'use', date: doneAt, itemId: medId, qty: qty, taskId: x.id });
          targets.forEach(function (fl) { recs.push({ type: 'med', kind: 'use', date: doneAt, itemId: medId, qty: Math.round(qty / targets.length * 1000) / 1000, flockId: fl.id, coop: fl.coop, taskId: x.id }); });
        }
        if (nxt) recs.push({ type: 'tasks', kind: x.kind, title: x.title, coops: x.coops || [], flockId: x.flockId, date: nxt, repeat: x.repeat, assignee: x.assignee || '', notes: x.notes || '', status: 'open' });
        await E.save(recs); return 'tasks';
      } });
  };
  ACT.deleteTask = function (b) {
    var x = byId(st().tasks, b.dataset.id);
    preview({ title: 'Delete task', rows: [['Task', esc(x.title)], ['Date', dLong(x.date)]], confirm: 'Delete', warnings: ['This removes the task and its calendar alarm.'],
      onConfirm: async function () { await E.save(Object.assign({}, x, { deleted: true })); return 'tasks'; } });
  };
  var REPEAT = { once: 'Once', daily: 'Every day', weekly: 'Every week', '2weeks': 'Every 2 weeks', monthly: 'Every month' };
  routes['task-new'] = function (mode, coop) {
    var emergency = mode === 'emergency' || role() === 'sales', s = st(), t = today();
    var people = live(s.users).filter(function (u) { return u.active && u.role !== 'sales'; });
    var checks = '<div class="pills">' + '<label class="pill" style="display:inline-flex;align-items:center;gap:6px;flex-direction:row"><input type="checkbox" name="all" style="width:auto;min-height:0"' + (coop ? '' : ' checked') + '> Whole farm</label>' +
      coops().map(function (c) { return '<label class="pill" style="display:inline-flex;align-items:center;gap:6px;flex-direction:row"><input type="checkbox" name="c' + c + '" style="width:auto;min-height:0"' + (String(c) === String(coop) ? ' checked' : '') + '> ' + c + '</label>'; }).join('') + '</div>';
    if (emergency) {
      return back('tasks', 'Tasks') + head('Report an emergency', 'Sick or dying birds, no water, fire, theft, flood, power cut, accident…') +
        '<form class="card" data-form="task" data-emergency="1"><label>What is happening?<input name="title" required placeholder="e.g. Water pipe burst — birds without water"></label>' +
        '<div><div class="small bold" style="margin-bottom:6px">Where?</div>' + checks + '</div>' +
        '<label>More details<textarea name="notes"></textarea></label>' +
        '<div class="alert err small">The owner gets an email and a phone alarm straight away when this phone has internet. You can also send a WhatsApp alert after saving.</div>' +
        '<button class="btn red" type="submit">Next: preview →</button></form>';
    }
    return back('tasks', 'Tasks') + head('Add a task', 'Disinfection, net clearing, maintenance, vaccination…') +
      '<form class="card" data-form="task"><label>Type of task<select name="kind">' + KINDS.map(function (k) { return opt(k, k, 'Disinfection'); }).join('') + '</select></label>' +
      '<label>What to do<input name="title" required placeholder="e.g. Clear nets and cobwebs"></label>' +
      '<div><div class="small bold" style="margin-bottom:6px">Which coop(s)?</div>' + checks + '</div>' +
      '<div class="grid g2"><label>Date<input type="date" name="date" value="' + t + '" required></label><label>Repeat<select name="repeat">' + Object.keys(REPEAT).map(function (k) { return opt(k, REPEAT[k], 'once'); }).join('') + '</select></label></div>' +
      '<label>Assign to<select name="assignee"><option value="">— anyone —</option>' + people.map(function (u) { return opt(u.id, u.name + ' (' + u.role + ')'); }).join('') + '</select></label>' +
      '<label>Notes<textarea name="notes"></textarea></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.task = function (f) {
    var emergency = f.dataset.emergency === '1', t = today();
    var sel = val(f, 'all') ? [] : coops().filter(function (c) { return val(f, 'c' + c); });
    var rec = { type: 'tasks', kind: emergency ? 'Emergency' : val(f, 'kind'), title: val(f, 'title').trim(), coops: sel, date: emergency ? t : val(f, 'date'),
      repeat: emergency ? 'once' : val(f, 'repeat'), assignee: emergency ? '' : val(f, 'assignee'), notes: val(f, 'notes').trim(), status: 'open' };
    if (sel.length === 1) { var fl = C.flockInCoop(st(), sel[0], rec.date); if (fl) rec.flockId = fl.id; }
    var errors = [], warnings = [];
    if (!rec.title) errors.push('Write what the task is.');
    if (!emergency && !rec.date) errors.push('Choose a date.');
    if (!emergency && rec.date < t) warnings.push('This date has already passed.');
    if (!val(f, 'all') && !sel.length) errors.push('Tick "Whole farm" or at least one coop.');
    preview({ title: emergency ? 'Emergency report' : 'New task', gold: false, errors: errors, warnings: warnings, confirm: emergency ? 'Send emergency' : 'Confirm & save',
      rows: [['Type', esc(rec.kind)], ['What', esc(rec.title)], ['Where', esc(whereText(rec))]].concat(emergency ? [] : [['Date', dLong(rec.date)], ['Repeat', esc(REPEAT[rec.repeat])], ['Assigned to', esc(userName(rec.assignee) || 'Anyone')]]).concat(rec.notes ? [['Notes', esc(rec.notes)]] : []),
      onConfirm: async function () { var r = (await E.save(rec))[0]; return 'task/' + r.id; } });
  };

  // ================================================================ SALES
  function custBalance(id) { return C.customerBalance(st(), id); }
  function sortedCustomers() { return live(st().customers).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  routes['sale-new'] = function (customerId) {
    var s = st(), list = sortedCustomers();
    var pre = customerId || (list.filter(function (c) { return /walk/i.test(c.name); })[0] || {}).id || '';
    var prods = live(s.products).filter(function (p) { return p.active !== false; });
    var flocks = C.activeFlocks(s, today());
    var out = back('home', 'Home') + head('New sale', 'Step 1 of 2 · then preview, then receipt');
    if (!list.length) return out + '<div class="card stack"><p>Add your first customer to start selling (you can add one called "Walk-in" for people who pay cash).</p><a class="btn gold" href="#customer-new">+ New customer</a></div>';
    out += '<form class="stack" data-form="sale">' +
      '<div class="card stack"><div class="row between"><h2>Customer</h2><a class="small" href="#customer-new">+ New customer</a></div><select name="customerId" aria-label="Customer">' +
      list.map(function (c) { var b = custBalance(c.id); return opt(c.id, c.name + (c.priceType === 'wholesale' ? ' · wholesale' : '') + (b > 0 ? ' · owes ' + cur(b) : ''), pre); }).join('') + '</select><div id="custInfo" class="small muted"></div></div>' +
      '<div class="card"><h2>Products</h2>' + prods.map(function (p) {
        var editable = isRole('owner');
        return '<div class="prod" data-pid="' + esc(p.id) + '"><div><div class="bold">' + esc(p.name) + '</div>' +
          (editable ? '<label class="tiny" style="flex-direction:row;align-items:center;gap:6px">GH₵<input name="price_' + esc(p.id) + '" type="number" step="0.01" min="0" inputmode="decimal" style="min-height:36px;max-width:110px"></label>'
            : '<div class="small muted">GH₵ <span data-price="' + esc(p.id) + '"></span> each</div><input type="hidden" name="price_' + esc(p.id) + '">') +
          (p.kind === 'hen' ? '<label class="tiny">From coop<select name="flock_' + esc(p.id) + '" style="min-height:36px">' + flocks.map(function (f) { return opt(f.id, 'Coop ' + f.coop + ' (' + C.birdsAlive(s, f, today()) + ' birds)'); }).join('') + '</select></label>' : '') +
          '</div><div class="qty"><button type="button" data-act="qty" data-d="-1" aria-label="Less ' + esc(p.name) + '">−</button><input name="qty_' + esc(p.id) + '" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Quantity of ' + esc(p.name) + '"><button type="button" class="plus" data-act="qty" data-d="1" aria-label="More ' + esc(p.name) + '">+</button></div></div>';
      }).join('') + '</div>' +
      '<div class="card stack"><h2>Payment</h2><div class="grid g2"><label>Cash (GH₵)<input name="pay_Cash" type="number" step="0.01" min="0" inputmode="decimal"></label><label>MoMo (GH₵)<input name="pay_MoMo" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<div class="grid g2"><label>MoMo reference<input name="ref_MoMo" inputmode="numeric"></label><label>Bank transfer (GH₵)<input name="pay_Bank" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<div class="row"><button type="button" class="btn light sm" data-act="payAll" data-m="Cash">Paid all in cash</button><button type="button" class="btn light sm" data-act="payAll" data-m="MoMo">Paid all by MoMo</button></div>' +
      '<label>Note<input name="note"></label></div>' +
      '<div class="card totals" id="saleTotals"></div>' +
      '<div class="sticky-actions"><button class="btn gold block" type="submit">Next: preview sale →</button></div></form>';
    return out;
  };
  function readSale(f) {
    var s = st(), c = cust(val(f, 'customerId'));
    var items = [];
    live(s.products).filter(function (p) { return p.active !== false; }).forEach(function (p) {
      var q = C.int(val(f, 'qty_' + p.id)); if (!q) return;
      var price = val(f, 'price_' + p.id);
      var line = { productId: p.id, qty: q, price: price === '' ? C.priceFor(p, c) : num(price) };
      if (p.kind === 'hen') line.flockId = val(f, 'flock_' + p.id);
      items.push(line);
    });
    var payments = ['Cash', 'MoMo', 'Bank'].map(function (m) { return { method: m, amount: num(val(f, 'pay_' + m)), ref: m === 'MoMo' ? val(f, 'ref_MoMo').trim() : '' }; }).filter(function (p) { return p.amount > 0; });
    return { type: 'sales', date: today(), customerId: val(f, 'customerId'), items: items, payments: payments, note: val(f, 'note').trim() };
  }
  var lastCust = null;
  LIVE.sale = function (f) {
    var s = st(), c = cust(val(f, 'customerId'));
    if (c && c.id !== lastCust) { // customer changed: put in their prices
      lastCust = c.id;
      live(s.products).forEach(function (p) {
        var inp = f.elements['price_' + p.id]; if (!inp) return;
        var pr = C.priceFor(p, c); inp.value = pr ? pr.toFixed(2) : '';
        var span = f.querySelector('[data-price="' + p.id + '"]'); if (span) span.textContent = pr ? pr.toFixed(2) : 'not set';
      });
    }
    var info = document.getElementById('custInfo');
    if (info && c) info.textContent = (c.priceType === 'wholesale' ? 'Wholesale prices' : 'Retail prices') + ' · ' + (c.credit ? 'credit allowed' + (num(c.limit) ? ' up to ' + curN(c.limit) : '') : 'cash only') + (c.phone ? ' · ' + c.phone : '');
    var sale = readSale(f), tt = C.saleTotals(sale), prev = c ? custBalance(c.id) : 0, next = prev + tt.totalCents - tt.paidCents;
    var box = document.getElementById('saleTotals'); if (!box) return;
    box.innerHTML = kv('This sale', cur(tt.totalCents)) + (prev ? kv('Old balance', cur(prev), prev > 0 ? 'red' : '') : '') + kv('Total due', cur(prev + tt.totalCents)) + kv('Paid now', cur(tt.paidCents)) +
      kv(next >= 0 ? 'New balance (debt)' : 'Customer credit', cur(Math.abs(next)), next > 0 ? 'red' : 'greenx');
  };
  ACT.qty = function (b) {
    var inp = b.parentNode.querySelector('input'); inp.value = Math.max(0, C.int(inp.value) + C.int(b.dataset.d));
    var f = b.closest('form'); if (LIVE[f.dataset.form]) LIVE[f.dataset.form](f);
  };
  ACT.payAll = function (b) {
    var f = b.closest('form'), sale = readSale(f), tt = C.saleTotals(sale);
    ['Cash', 'MoMo', 'Bank'].forEach(function (m) { f.elements['pay_' + m].value = ''; });
    f.elements['pay_' + b.dataset.m].value = (tt.totalCents / 100).toFixed(2);
    LIVE.sale(f);
  };
  function receiptPrefix() {
    var users = live(st().users), u = me();
    function ini(name, n) { var w = String(name).trim().split(/\s+/); return (w.length > 1 && n === 2 ? w[0][0] + w[1][0] : String(name).replace(/\s+/g, '').slice(0, n)).toUpperCase(); }
    for (var n = 2; n <= 4; n++) {
      var p = ini(u.name, n);
      if (!users.some(function (x) { return x.id !== u.id && ini(x.name, n) === p; })) return p;
    }
    return ini(u.name, 3) + users.findIndex(function (x) { return x.id === u.id; });
  }
  function nextReceiptNo() {
    var p = receiptPrefix() + '-', max = 0;
    live(st().sales).concat(live(st().payments)).forEach(function (r) {
      if (r.receiptNo && r.receiptNo.indexOf(p) === 0) max = Math.max(max, C.int(r.receiptNo.slice(p.length)));
    });
    return p + ('000' + (max + 1)).slice(-4);
  }
  FORMS.sale = function (f) {
    var s = st(), sale = readSale(f), c = cust(sale.customerId), v = C.validateSale(s, sale, me());
    var rows = sale.items.map(function (it) {
      var p = prod(it.productId), fl = it.flockId ? flock(it.flockId) : null;
      return [it.qty + ' × ' + p.name + (fl ? ' (Coop ' + fl.coop + ')' : '') + ' @ ' + num(it.price).toFixed(2), cur(Math.round(it.qty * it.price * 100))];
    });
    rows.push(['This sale', cur(v.totals.totalCents)]);
    if (v.prevCents) rows.push(['Old balance', cur(v.prevCents), v.prevCents > 0 ? 'red' : '']);
    rows.push(['Total due', cur(v.prevCents + v.totals.totalCents)]);
    sale.payments.forEach(function (p) { rows.push(['Paid · ' + p.method + (p.ref ? ' (ref ' + esc(p.ref) + ')' : ''), curN(p.amount)]); });
    if (!sale.payments.length) rows.push(['Paid now', cur(0)]);
    rows.push([v.newCents >= 0 ? 'New balance (debt)' : 'Customer credit', cur(Math.abs(v.newCents)), v.newCents > 0 ? 'red' : 'greenx']);
    preview({ title: 'Sale to ' + (c ? c.name : '?'), rows: rows, errors: v.errors, warnings: v.warnings, confirm: 'Confirm sale', gold: true,
      extra: c ? '<div class="small muted">' + (c.priceType === 'wholesale' ? 'Wholesale' : 'Retail') + ' customer · ' + (c.credit ? 'credit allowed' + (num(c.limit) ? ', limit ' + curN(c.limit) : '') : 'cash only') + '</div>' : '',
      onConfirm: async function () { sale.receiptNo = nextReceiptNo(); var r = (await E.save(sale))[0]; return 'receipt/' + r.id; } });
  };

  // ---------- receipts
  function receiptHeader() {
    return '<div class="hd"><img src="icons/icon-192.png" alt=""><h2>' + esc(farmName()) + '</h2><div class="tiny muted">' + esc([setting('location', ''), setting('phone', '')].filter(Boolean).join(' · ')) + '</div></div>';
  }
  function ledgerPoint(customerId, id) {
    var L = C.customerLedger(st(), customerId), row = L.rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return { before: 0, after: 0 };
    return { before: row.balanceCents - row.debit + row.credit, after: row.balanceCents };
  }
  routes.receipt = function (id) {
    var s = st(), x = byId(s.sales, id); if (!x) return '<div class="empty">Receipt not found.</div>';
    var c = cust(x.customerId) || {}, tt = C.saleTotals(x), lp = ledgerPoint(x.customerId, x.id);
    var lines = x.items.map(function (it) { var p = prod(it.productId) || { name: it.productId }; return [it.qty + ' × ' + p.name + ' @ ' + num(it.price).toFixed(2), cur(Math.round(it.qty * it.price * 100))]; });
    var html = '<div class="receipt" id="receiptBox">' + receiptHeader() + '<div class="line"></div>' +
      kv('Receipt no.', esc(x.receiptNo)) + kv('Date', dLong(x.date)) + kv('Customer', esc(c.name)) + kv('Served by', esc(userName(x.by))) + '<div class="line"></div>' +
      lines.map(function (l) { return kv(l[0], l[1]); }).join('') + '<div class="line"></div>' +
      kv('This sale', cur(tt.totalCents)) + kv('Balance brought forward', cur(lp.before)) + kv('Total due', cur(lp.before + tt.totalCents)) +
      (x.payments || []).map(function (p) { return kv('Paid · ' + p.method, curN(p.amount)); }).join('') +
      '<div class="kv" style="background:var(--yellow-soft);border-radius:8px;padding:8px 10px"><span class="bold" style="color:var(--ink)">Balance carried forward</span><b class="' + (lp.after > 0 ? 'red' : '') + '">' + cur(lp.after) + '</b></div>' +
      '<p class="tiny muted" style="text-align:center">' + esc(setting('receiptFooter', 'Thank you!')) + '</p></div>';
    var text = '*' + farmName().toUpperCase() + '*\nReceipt ' + x.receiptNo + ' · ' + dLong(x.date) + '\nCustomer: ' + c.name + '\n\n' +
      lines.map(function (l) { return l[0] + ' = ' + l[1]; }).join('\n') + '\n\nThis sale: ' + cur(tt.totalCents) + '\nBalance brought forward: ' + cur(lp.before) + '\nTotal due: ' + cur(lp.before + tt.totalCents) +
      '\n' + (x.payments || []).map(function (p) { return 'Paid (' + p.method + '): ' + curN(p.amount); }).join('\n') + '\n*Balance carried forward: ' + cur(lp.after) + '*\n\nServed by ' + userName(x.by) + '\n' + setting('receiptFooter', '');
    return '<div class="no-print">' + back('home', 'Home') + '</div>' + html + receiptButtons(c, text, 'sale-new');
  };
  function receiptButtons(c, text, again) {
    return '<div class="stack no-print" style="max-width:420px;margin:14px auto 0">' +
      (c.phone ? '<a class="btn wa block" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, text)) + '">Send on WhatsApp</a>' : '<div class="alert warn small">No phone number for this customer — add one to send receipts on WhatsApp.</div>') +
      '<div class="grid g2"><button class="btn light" type="button" data-act="print">Print / Save PDF</button><button class="btn light" type="button" data-act="share" data-text="' + esc(text) + '">Share…</button></div>' +
      '<a class="btn gold block" href="#' + again + '">' + (again === 'sale-new' ? '+ Next sale' : 'Done') + '</a></div>';
  }
  ACT.print = function () { window.print(); };
  ACT.share = function (b) {
    var text = b.dataset.text;
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('Receipt copied — paste it anywhere.'); });
  };

  // ================================================================ CUSTOMERS
  routes.customers = function (filter) {
    var list = sortedCustomers().map(function (c) { return { c: c, b: custBalance(c.id) }; });
    if (filter === 'owing') list = list.filter(function (x) { return x.b > 0; }).sort(function (a, b) { return b.b - a.b; });
    var owed = list.reduce(function (a, x) { return a + Math.max(0, x.b); }, 0);
    var out = head('Customers', list.length + ' customers' + (filter === 'owing' ? ' owing ' + cur(owed) : ''), '<a class="btn gold sm" href="#customer-new">+ New customer</a>');
    out += '<div class="stack"><label class="small">Search<input type="search" data-search=".cust-row" placeholder="Name or phone"></label>' +
      '<div class="pills"><a class="pill ' + (filter !== 'owing' ? 'on' : '') + '" href="#customers" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">All</a><a class="pill ' + (filter === 'owing' ? 'on' : '') + '" href="#customers/owing" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">Owing</a></div>' +
      '<div class="list">' + (list.length ? list.map(function (x) {
        var last = C.customerLedger(st(), x.c.id).rows.slice(-1)[0];
        var age = x.b > 0 && last ? C.dayDiff(oldestUnpaid(x.c.id), today()) : 0;
        return '<a class="item cust-row" data-s="' + esc((x.c.name + ' ' + (x.c.phone || '')).toLowerCase()) + '" href="#customer/' + x.c.id + '"><div class="date-badge">' + esc(initials(x.c.name)) + '</div><div class="grow"><div class="t">' + esc(x.c.name) + '</div><div class="sub">' +
          esc(x.c.priceType === 'wholesale' ? 'Wholesale' : 'Retail') + ' · ' + (x.c.credit ? 'credit' : 'cash only') + (x.b > 0 ? ' · <span class="' + (age > 30 ? 'red bold' : '') + '">owing ' + age + ' days</span>' : '') + '</div></div>' +
          '<b class="' + (x.b > 0 ? 'red' : '') + '">' + cur(x.b) + '</b></a>';
      }).join('') : '<div class="empty">No customers</div>') + '</div></div>';
    return out;
  };
  function initials(n) { var w = String(n).trim().split(/\s+/); return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
  function oldestUnpaid(id) {
    // date of the oldest sale that is not yet covered by payments (first-in, first-out)
    var L = C.customerLedger(st(), id), paid = L.rows.reduce(function (a, r) { return a + r.credit; }, 0) - Math.max(0, -L.openingCents);
    var owed = Math.max(0, L.openingCents), start = L.rows[0] ? L.rows[0].date : today();
    if (paid < owed) return start;
    paid -= owed;
    for (var i = 0; i < L.rows.length; i++) { if (paid < L.rows[i].debit) return L.rows[i].date; paid -= L.rows[i].debit; }
    return today();
  }
  routes.customer = function (id) {
    var c = cust(id); if (!c) return back('customers', 'Customers') + '<div class="empty">Not found</div>';
    var L = C.customerLedger(st(), id);
    var out = back('customers', 'Customers') + head(c.name, esc(c.phone || 'no phone') + ' · ' + (c.priceType === 'wholesale' ? 'wholesale' : 'retail') + ' · ' + (c.credit ? 'credit allowed' + (num(c.limit) ? ' up to ' + curN(c.limit) : '') : 'cash only'),
      isRole('owner') ? '<a class="btn light sm" href="#customer-edit/' + id + '">Edit</a>' : '');
    out += '<div class="grid g2">' + kpiBox(L.balanceCents >= 0 ? 'Owes' : 'Has credit', cur(Math.abs(L.balanceCents)), L.balanceCents > 0 ? 'since ' + dShort(oldestUnpaid(id)) : '', L.balanceCents > 0 ? 'gold' : 'dark') +
      kpiBox('Bought in total', cur(L.rows.reduce(function (a, r) { return a + r.debit; }, 0)), L.rows.filter(function (r) { return r.kind === 'sale'; }).length + ' sales') + '</div>';
    out += '<div class="grid g2" style="margin-top:12px"><a class="btn gold" href="#sale-new/' + id + '">+ New sale</a><a class="btn" href="#payment-new/' + id + '">Receive payment</a></div>';
    if (L.balanceCents > 0 && c.phone) {
      var text = 'Hello ' + c.name + ', this is ' + farmName() + '. Your balance with us is ' + cur(L.balanceCents) + '. Thank you for your business — kindly pay by MoMo or cash at your convenience.';
      out += '<a class="btn wa block" style="margin-top:10px" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, text)) + '">Send polite WhatsApp reminder</a>';
    }
    out += '<div class="card" style="margin-top:12px"><h2>Account</h2><div class="scroll"><table><thead><tr><th>Date</th><th>Receipt</th><th class="right">Bought</th><th class="right">Paid</th><th class="right">Balance</th></tr></thead><tbody>' +
      '<tr><td colspan="4" class="muted">Opening balance</td><td class="right">' + cur(L.openingCents) + '</td></tr>' +
      L.rows.map(function (r) {
        return '<tr><td>' + dShort(r.date) + '</td><td><a href="#' + (r.kind === 'sale' ? 'receipt/' : 'preceipt/') + r.id + '">' + esc(r.ref || r.kind) + '</a></td><td class="right">' + (r.debit ? cur(r.debit) : '') + '</td><td class="right">' + (r.credit ? cur(r.credit) : '') + '</td><td class="right bold">' + cur(r.balanceCents) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    return out;
  };
  routes['customer-new'] = function () { return customerForm(null); };
  routes['customer-edit'] = function (id) { return customerForm(cust(id)); };
  function customerForm(c) {
    var owner = isRole('owner'); c = c || { priceType: 'retail', credit: false, limit: 0, opening: 0 };
    return back(c.id ? 'customer/' + c.id : 'customers', c.id ? c.name : 'Customers') + head(c.id ? 'Edit customer' : 'New customer', owner ? '' : 'The owner decides credit and wholesale prices for each customer.') +
      '<form class="card" data-form="customer"' + (c.id ? ' data-id="' + esc(c.id) + '"' : '') + '><label>Name<input name="name" required value="' + esc(c.name || '') + '"></label>' +
      '<label>Phone (for WhatsApp receipts)<input name="phone" type="tel" inputmode="tel" value="' + esc(c.phone || '') + '" placeholder="024 123 4567"></label>' +
      (owner ? '<div class="grid g2"><label>Prices<select name="priceType">' + opt('retail', 'Retail', c.priceType) + opt('wholesale', 'Wholesale', c.priceType) + '</select></label>' +
        '<label>Payment<select name="credit">' + opt('no', 'Cash only', c.credit ? 'yes' : 'no') + opt('yes', 'Credit allowed', c.credit ? 'yes' : 'no') + '</select></label></div>' +
        '<div class="grid g2"><label>Credit limit (GH₵, 0 = no limit)<input name="limit" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(c.limit || 0) + '"></label>' +
        '<label>Opening balance owed (GH₵)<input name="opening" type="number" step="0.01" inputmode="decimal" value="' + esc(c.opening || 0) + '"></label></div>' : '') +
      '<label>Notes<input name="notes" value="' + esc(c.notes || '') + '" placeholder="e.g. shop at Madina market"></label><button class="btn" type="submit">Next: preview →</button></form>';
  }
  FORMS.customer = function (f) {
    var owner = isRole('owner'), old = f.dataset.id ? cust(f.dataset.id) : null;
    var rec = Object.assign({}, old || {}, { type: 'customers', name: val(f, 'name').trim(), phone: val(f, 'phone').trim(), notes: val(f, 'notes').trim() });
    if (owner) { rec.priceType = val(f, 'priceType'); rec.credit = val(f, 'credit') === 'yes'; rec.limit = num(val(f, 'limit')); rec.opening = num(val(f, 'opening')); }
    else if (!old) { rec.priceType = 'retail'; rec.credit = false; rec.limit = 0; rec.opening = 0; }
    var errors = [], warnings = [];
    if (!rec.name) errors.push('Enter the customer’s name.');
    var digits = rec.phone.replace(/\D/g, '');
    if (rec.phone && digits.length < 9) errors.push('Phone number looks too short.');
    live(st().customers).forEach(function (x) {
      if (x.id === rec.id) return;
      if (x.name.trim().toLowerCase() === rec.name.toLowerCase()) warnings.push('There is already a customer called ' + x.name + '.');
      if (digits && String(x.phone || '').replace(/\D/g, '').slice(-9) === digits.slice(-9)) warnings.push(x.name + ' already has this phone number.');
    });
    preview({ title: old ? 'Update customer' : 'New customer', errors: errors, warnings: warnings,
      rows: [['Name', esc(rec.name)], ['Phone', esc(rec.phone || '—')], ['Prices', rec.priceType === 'wholesale' ? 'Wholesale' : 'Retail'], ['Payment', rec.credit ? 'Credit allowed' + (rec.limit ? ' up to ' + curN(rec.limit) : ' (no limit)') : 'Cash only'], ['Opening balance', curN(rec.opening || 0)]],
      onConfirm: async function () { var r = (await E.save(rec))[0]; return 'customer/' + r.id; } });
  };
  routes['payment-new'] = function (id) {
    var c = cust(id); if (!c) return '';
    var b = custBalance(id);
    return back('customer/' + id, c.name) + head('Receive payment', esc(c.name) + ' owes ' + cur(b)) +
      '<form class="card" data-form="payment" data-id="' + esc(id) + '"><label>Amount (GH₵)<input name="amount" type="number" step="0.01" min="0.01" inputmode="decimal" required value="' + (b > 0 ? (b / 100).toFixed(2) : '') + '"></label>' +
      '<div class="grid g2"><label>Paid with<select name="method">' + opt('Cash', 'Cash') + opt('MoMo', 'MoMo') + opt('Bank', 'Bank transfer') + '</select></label><label>Reference<input name="ref"></label></div>' +
      '<button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.payment = function (f) {
    var c = cust(f.dataset.id), b = custBalance(c.id), amt = num(val(f, 'amount'));
    var rec = { type: 'payments', date: today(), customerId: c.id, amount: amt, method: val(f, 'method'), ref: val(f, 'ref').trim() };
    var errors = [], warnings = [];
    if (!(amt > 0)) errors.push('Enter the amount paid.');
    if (C.cents(amt) > b) warnings.push('This is more than the customer owes. They will have ' + cur(C.cents(amt) - b) + ' credit.');
    if (rec.method === 'MoMo' && !rec.ref) warnings.push('MoMo payment has no reference number.');
    preview({ title: 'Payment from ' + c.name, errors: errors, warnings: warnings, gold: true,
      rows: [['Owed before', cur(b)], ['Paid now · ' + rec.method, curN(amt)], ['Owes after', cur(b - C.cents(amt)), b - C.cents(amt) > 0 ? 'red' : 'greenx']],
      onConfirm: async function () { rec.receiptNo = nextReceiptNo(); var r = (await E.save(rec))[0]; return 'preceipt/' + r.id; } });
  };
  routes.preceipt = function (id) {
    var p = byId(st().payments, id); if (!p) return '';
    var c = cust(p.customerId) || {}, lp = ledgerPoint(p.customerId, p.id);
    var html = '<div class="receipt">' + receiptHeader() + '<div class="line"></div><h3 style="text-align:center">PAYMENT RECEIPT</h3>' + kv('Receipt no.', esc(p.receiptNo)) + kv('Date', dLong(p.date)) + kv('Customer', esc(c.name)) +
      kv('Received by', esc(userName(p.by))) + '<div class="line"></div>' + kv('Balance before', cur(lp.before)) + kv('Paid · ' + p.method + (p.ref ? ' (' + esc(p.ref) + ')' : ''), curN(p.amount)) +
      '<div class="kv" style="background:var(--yellow-soft);border-radius:8px;padding:8px 10px"><span class="bold" style="color:var(--ink)">Balance now</span><b>' + cur(lp.after) + '</b></div><p class="tiny muted" style="text-align:center">' + esc(setting('receiptFooter', '')) + '</p></div>';
    var text = '*' + farmName().toUpperCase() + '*\nPayment receipt ' + p.receiptNo + ' · ' + dLong(p.date) + '\nCustomer: ' + c.name + '\nBalance before: ' + cur(lp.before) + '\nPaid (' + p.method + '): ' + curN(p.amount) + '\n*Balance now: ' + cur(lp.after) + '*\nReceived by ' + userName(p.by) + '\n' + setting('receiptFooter', '');
    return '<div class="no-print">' + back('customer/' + p.customerId, c.name) + '</div>' + html + receiptButtons(c, text, 'customer/' + p.customerId);
  };

  // ================================================================ CRATES OUT / RETURNS
  function eggProducts() { return live(st().products).filter(function (p) { return (p.kind === 'good' || p.kind === 'cracked') && p.active !== false; }); }
  routes.crates = function (date) {
    var s = st(), t = date || today();
    var people = role() === 'sales' ? [me()] : salesUsers();
    var out = head(role() === 'sales' ? 'My eggs' : 'Crates out & returns', dLong(t) + ' · eggs taken to shops and markets',
      '<label class="small" style="flex-direction:row;align-items:center;gap:6px">Day<input type="date" value="' + t + '" max="' + today() + '" data-act-change="crateDate" style="min-height:40px"></label>');
    if (role() !== 'sales') {
      var store = C.eggStore(s, t);
      out += '<div class="grid g2" style="margin-bottom:12px">' + kpiBox('Good eggs in store', crates(store.good), 'end of ' + dShort(t), 'dark') + kpiBox('Cracked in store', crates(store.cracked), '') + '</div>';
      if (isRole('owner')) out += '<a class="btn light sm" href="#crates-adjust" style="margin-bottom:12px">Correct store count</a>';
    }
    out += '<div class="list">' + people.map(function (u) {
      var c = C.carry(s, u.id, t);
      var stTxt = c.returnRecorded ? (c.balanced ? '<span class="chip green">Balanced ✓</span>' : '<span class="chip red">' + crates(c.remaining.good) + ' not accounted for</span>') : (c.out.good || c.opening.good ? '<span class="chip yellow">Still out</span>' : '<span class="chip">Nothing taken</span>');
      var money = handIn(u.id, t);
      return '<div class="card stack"><div class="row between"><h2>' + esc(u.name) + '</h2>' + stTxt + '</div>' +
        '<div class="grid g3 small">' + mini('Had from before', crates(c.opening.good)) + mini('Took today', crates(c.out.good)) + mini('Sold', crates(c.sold.good)) +
        mini('Returned', crates(c.returned.good)) + mini('Broken', c.broken.good + ' pcs') + mini('Still with them', crates(c.remaining.good), c.returnRecorded && c.remaining.good ? 'red' : '') + '</div>' +
        (c.out.cracked || c.sold.cracked || c.remaining.cracked ? '<div class="tiny muted">Cracked: took ' + crates(c.out.cracked) + ', sold ' + crates(c.sold.cracked) + ', returned ' + crates(c.returned.cracked) + ', still with them ' + crates(c.remaining.cracked) + '</div>' : '') +
        '<div class="small">Money to hand in: <b>' + cur(money.total) + '</b> <span class="muted">(cash ' + cur(money.Cash) + ' · MoMo ' + cur(money.MoMo) + (money.Bank ? ' · bank ' + cur(money.Bank) : '') + ')</span></div>' +
        (isRole('owner', 'manager') && t === today() ? '<div class="grid g2"><a class="btn gold sm" href="#crates-out/' + u.id + '">Give out eggs</a><a class="btn ghost sm" href="#crates-return/' + u.id + '">Record return</a></div>' : '') + '</div>';
    }).join('') + '</div>';
    if (!people.length) out += '<div class="empty">No active salespeople. Add them in the Users tab of your Google Sheet.</div>';
    return out;
  };
  ACT.crateDate = function (el) { go('crates/' + el.value); };
  function mini(l, v, cls) { return '<div style="background:#F5F2EA;border-radius:8px;padding:6px 8px"><div class="tiny muted">' + esc(l) + '</div><div class="bold ' + (cls || '') + '">' + esc(v) + '</div></div>'; }
  function handIn(uid, t) {
    var m = { Cash: 0, MoMo: 0, Bank: 0, total: 0 };
    live(st().sales).filter(function (x) { return x.by === uid && x.date === t; }).forEach(function (x) { (x.payments || []).forEach(function (p) { m[p.method] = (m[p.method] || 0) + C.cents(p.amount); }); });
    live(st().payments).filter(function (x) { return x.by === uid && x.date === t; }).forEach(function (p) { m[p.method] = (m[p.method] || 0) + C.cents(p.amount); });
    m.total = m.Cash + m.MoMo + m.Bank; return m;
  }
  function eggLinesForm(prefix) {
    return eggProducts().map(function (p) {
      return '<div class="prod"><div class="bold">' + esc(p.name) + '</div><div class="qty"><button type="button" data-act="qty" data-d="-1" aria-label="Less">−</button><input name="' + prefix + p.id + '" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="' + esc(p.name) + '"><button type="button" class="plus" data-act="qty" data-d="1" aria-label="More">+</button></div></div>';
    }).join('');
  }
  function readLines(f, prefix) {
    return eggProducts().map(function (p) { return { productId: p.id, qty: C.int(val(f, prefix + p.id)) }; }).filter(function (l) { return l.qty > 0; });
  }
  function linesPieces(lines) { var g = 0, c = 0; lines.forEach(function (l) { var e = C.lineEggs(st(), l); g += e.good; c += e.cracked; }); return { good: g, cracked: c }; }
  routes['crates-out'] = function (uid) {
    var store = C.eggStore(st(), today());
    return back('crates', 'Crates') + head('Give out eggs to ' + userName(uid), 'Store has ' + crates(store.good) + ' good and ' + crates(store.cracked) + ' cracked') +
      '<form class="card" data-form="crateout" data-uid="' + esc(uid) + '">' + eggLinesForm('out_') + '<button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.crateout = function (f) {
    var uid = f.dataset.uid, lines = readLines(f, 'out_'), pcs = linesPieces(lines), store = C.eggStore(st(), today());
    var errors = [], warnings = [];
    if (!lines.length) errors.push('Enter how many crates are given out.');
    if (pcs.good > store.good) warnings.push('The store shows only ' + crates(store.good) + ' good eggs. Check today’s daily records are entered.');
    if (pcs.cracked > store.cracked) warnings.push('The store shows only ' + crates(store.cracked) + ' cracked eggs.');
    preview({ title: 'Eggs to ' + userName(uid), errors: errors, warnings: warnings, gold: true,
      rows: lines.map(function (l) { return [prod(l.productId).name, l.qty]; }).concat([['Good eggs', crates(pcs.good)], ['Cracked eggs', crates(pcs.cracked)], ['Store after', crates(store.good - pcs.good) + ' good']]),
      onConfirm: async function () { await E.save({ type: 'stock', kind: 'out', date: today(), salesUserId: uid, lines: lines }); return 'crates'; } });
  };
  routes['crates-return'] = function (uid) {
    var c = C.carry(st(), uid, today());
    return back('crates', 'Crates') + head('Return from ' + userName(uid), 'With them now: ' + crates(c.remaining.good) + ' good, ' + crates(c.remaining.cracked) + ' cracked') +
      '<form class="card" data-form="crateret" data-uid="' + esc(uid) + '"><h3>Eggs brought back</h3>' + eggLinesForm('ret_') +
      '<div class="grid g2"><label>Broken good eggs (pieces)<input name="brokenGood" type="number" min="0" inputmode="numeric" value="0"></label><label>Broken cracked eggs (pieces)<input name="brokenCracked" type="number" min="0" inputmode="numeric" value="0"></label></div>' +
      '<div id="retLive" class="alert ok small"></div><button class="btn" type="submit">Next: preview →</button></form>';
  };
  function retCalc(f) {
    var uid = f.dataset.uid, c = C.carry(st(), uid, today()), lines = readLines(f, 'ret_'), pcs = linesPieces(lines);
    var bg = C.int(val(f, 'brokenGood')), bc = C.int(val(f, 'brokenCracked'));
    return { c: c, lines: lines, pcs: pcs, bg: bg, bc: bc, left: { good: c.remaining.good - pcs.good - bg, cracked: c.remaining.cracked - pcs.cracked - bc } };
  }
  LIVE.crateret = function (f) {
    var r = retCalc(f), box = document.getElementById('retLive'); if (!box) return;
    var ok = r.left.good === 0 && r.left.cracked === 0;
    box.className = 'alert small ' + (ok ? 'ok' : 'warn');
    box.textContent = ok ? '✓ Balanced: everything taken is sold, returned or broken.' : 'Not accounted for: ' + crates(r.left.good) + ' good, ' + crates(r.left.cracked) + ' cracked (negative means more sold than taken).';
  };
  FORMS.crateret = function (f) {
    var r = retCalc(f), uid = f.dataset.uid, warnings = [];
    if (r.left.good || r.left.cracked) warnings.push(crates(r.left.good) + ' good and ' + crates(r.left.cracked) + ' cracked eggs are not accounted for. Check the sales on ' + userName(uid) + '’s phone are synced, or record them as broken.');
    preview({ title: 'Return from ' + userName(uid), warnings: warnings,
      rows: [['Took today + from before', crates(r.c.opening.good + r.c.out.good)], ['Sold (recorded)', crates(r.c.sold.good)], ['Brought back', crates(r.pcs.good)], ['Broken', r.bg + ' pieces'],
        ['Not accounted for', crates(r.left.good), r.left.good ? 'red' : 'greenx'], ['Cracked brought back', crates(r.pcs.cracked)]],
      onConfirm: async function () { await E.save({ type: 'stock', kind: 'return', date: today(), salesUserId: uid, lines: r.lines, brokenGood: r.bg, brokenCracked: r.bc }); return 'crates'; } });
  };
  routes['crates-adjust'] = function () {
    var store = C.eggStore(st(), today());
    return back('crates', 'Crates') + head('Correct store count', 'Store shows ' + crates(store.good) + ' good, ' + crates(store.cracked) + ' cracked') +
      '<form class="card" data-form="crateadj"><div class="grid g2"><label>Eggs<select name="eggKind">' + opt('good', 'Good') + opt('cracked', 'Cracked') + '</select></label>' +
      '<label>Counted now (pieces)<input name="counted" type="number" min="0" inputmode="numeric" required></label></div><label>Reason<input name="reason" required placeholder="e.g. stock count, eggs used at home, broken in store"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.crateadj = function (f) {
    var store = C.eggStore(st(), today()), kind = val(f, 'eggKind'), counted = C.int(val(f, 'counted')), diff = counted - store[kind];
    preview({ title: 'Correct ' + kind + ' egg count', errors: val(f, 'reason').trim() ? [] : ['Give a reason.'], warnings: diff ? [] : ['The count is the same as the app — nothing to change.'],
      rows: [['App shows', crates(store[kind])], ['Counted', crates(counted)], ['Change', (diff > 0 ? '+' : '') + diff + ' pieces', diff < 0 ? 'red' : '']],
      onConfirm: async function () { await E.save({ type: 'stock', kind: 'adjust', date: today(), eggKind: kind, pieces: diff, reason: val(f, 'reason').trim() }); return 'crates'; } });
  };

  // ================================================================ FEED
  routes.feed = function () {
    var s = st(), fs = C.feedState(s), owner = isRole('owner');
    var feeds = live(s.items).filter(function (i) { return i.category === 'feed'; }), ings = live(s.items).filter(function (i) { return i.category === 'ingredient'; });
    function rows(list) {
      return list.map(function (i) {
        var x = fs.items[i.id] || {};
        return '<tr><td>' + esc(i.name) + '</td><td class="right bold ' + (x.low || x.negative ? 'red' : '') + '">' + (x.shown || 0) + ' ' + esc(x.unit || '') + '</td>' + (owner ? '<td class="right">' + (x.avgPerKg ? 'GH₵ ' + x.avgPerKg.toFixed(2) + '/kg' : '') + '</td>' : '') + '<td>' + (x.low ? '<span class="chip red">LOW</span>' : '') + (x.negative ? '<span class="chip red">check stock</span>' : '') + '</td></tr>';
      }).join('');
    }
    var out = head('Feed', 'Bought feed, your own mixes and ingredients', '<div class="row"><a class="btn gold sm" href="#feed-mix">Mix feed</a><a class="btn sm" href="#feed-buy">Buy feed / ingredient</a></div>');
    out += '<div class="card"><h2>Feed in store</h2><div class="scroll"><table><tbody>' + rows(feeds) + '</tbody></table></div></div>';
    out += '<div class="card" style="margin-top:12px"><h2>Ingredients</h2><div class="scroll"><table><tbody>' + rows(ings) + '</tbody></table></div></div>';
    var recent = C.sortChrono(live(s.feed)).reverse().slice(0, 15);
    out += '<div class="card" style="margin-top:12px"><h2>Recent</h2>' + (recent.length ? recent.map(function (m) {
      if (m.kind === 'mix') { var mc = fs.mixCost[m.id] || {}; return kv(dShort(m.date) + ' · Mixed ' + (item(m.outputItemId) || {}).name, (mc.kg || 0) + ' kg' + (owner && mc.kg ? ' · GH₵ ' + (mc.cents / mc.kg * C.settingsOf(s).kgPerBag / 100).toFixed(2) + '/bag' : '')); }
      return kv(dShort(m.date) + ' · ' + (m.kind === 'buy' ? 'Bought ' : 'Adjusted ') + ((item(m.itemId) || {}).name || ''), m.qty + ' ' + esc(m.qtyUnit || '') + (owner && m.cost ? ' · ' + curN(m.cost) : ''));
    }).join('') : '<div class="empty">Nothing recorded yet</div>') + '</div>';
    return out;
  };
  routes['feed-buy'] = function () {
    var list = live(st().items).filter(function (i) { return (i.category === 'feed' || i.category === 'ingredient') && i.active !== false; });
    return back('feed', 'Feed') + head('Buy feed or ingredient') + '<form class="card" data-form="feedbuy"><label>What<select name="itemId">' + list.map(function (i) { return opt(i.id, i.name + ' (' + i.category + ')'); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>Quantity<input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label><label>Unit<select name="qtyUnit">' + opt('bag', 'Bags') + opt('kg', 'Kg') + '</select></label></div>' +
      '<div class="grid g2"><label>Total cost (GH₵)<input name="cost" type="number" min="0" step="0.01" inputmode="decimal" required></label><label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>' +
      '<label>Supplier<input name="supplier"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.feedbuy = function (f) {
    var it = item(val(f, 'itemId')), rec = { type: 'feed', kind: 'buy', itemId: it.id, qty: num(val(f, 'qty')), qtyUnit: val(f, 'qtyUnit'), cost: num(val(f, 'cost')), date: val(f, 'date'), supplier: val(f, 'supplier').trim() };
    var kg = C.itemKg(st(), it, rec.qty, rec.qtyUnit), errors = [];
    if (!(rec.qty > 0)) errors.push('Enter the quantity.');
    if (!(rec.cost >= 0)) errors.push('Enter the cost.');
    preview({ title: 'Bought ' + it.name, errors: errors, rows: [['Quantity', rec.qty + ' ' + rec.qtyUnit + (rec.qtyUnit === 'bag' ? ' (' + kg + ' kg)' : '')], ['Total cost', curN(rec.cost)], ['Cost per kg', kg ? 'GH₵ ' + (rec.cost / kg).toFixed(2) : '—'], ['Date', dLong(rec.date)]],
      onConfirm: async function () { await E.save(rec); return 'feed'; } });
  };
  routes['feed-mix'] = function (recipeId) {
    var s = st(), feeds = live(s.items).filter(function (i) { return i.category === 'feed'; }), ings = live(s.items).filter(function (i) { return i.category === 'ingredient'; });
    var rec = byId(s.recipes, recipeId), lines = rec ? rec.lines.slice() : [];
    var want = Math.max(8, lines.length + 2); while (lines.length < want) lines.push({ itemId: '', kg: '' });
    return back('feed', 'Feed') + head('Mix feed', 'Pick a saved recipe or type the ingredients') +
      '<form class="card" data-form="feedmix">' + (s.recipes.length ? '<label>Saved recipe<select data-act-change="pickRecipe"><option value="">— type it yourself —</option>' + s.recipes.map(function (r) { return opt(r.id, r.name, recipeId); }).join('') + '</select></label>' : '<div class="tiny muted">Tip: save your recipes in the Recipes tab of the Google Sheet to fill this in with one tap.</div>') +
      '<div class="grid g2"><label>Makes<select name="outputItemId">' + feeds.map(function (i) { return opt(i.id, i.name, rec ? rec.outputItemId : 'i-ownmix'); }).join('') + '</select></label><label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>' +
      '<div class="stack" style="gap:8px">' + lines.map(function (l, i) {
        return '<div class="grid" style="grid-template-columns:1fr 110px"><select name="ing_' + i + '" aria-label="Ingredient ' + (i + 1) + '"><option value="">— ingredient —</option>' + ings.map(function (x) { return opt(x.id, x.name, l.itemId); }).join('') + '</select><input name="kg_' + i + '" type="number" min="0" step="any" inputmode="decimal" placeholder="kg" value="' + esc(l.kg) + '" aria-label="Kg"></div>';
      }).join('') + '</div><input type="hidden" name="rows" value="' + lines.length + '"><input type="hidden" name="recipeId" value="' + esc(recipeId || '') + '">' +
      '<div id="mixLive" class="card" style="background:var(--green-soft);border:0"></div><button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  ACT.pickRecipe = function (el) { go('feed-mix/' + el.value); };
  function readMix(f) {
    var lines = [], n = C.int(val(f, 'rows'));
    for (var i = 0; i < n; i++) { var id = val(f, 'ing_' + i), kg = num(val(f, 'kg_' + i)); if (id && kg > 0) lines.push({ itemId: id, kg: kg }); }
    return { type: 'feed', kind: 'mix', outputItemId: val(f, 'outputItemId'), date: val(f, 'date'), recipeId: val(f, 'recipeId'), lines: lines };
  }
  LIVE.feedmix = function (f) {
    var m = readMix(f), p = C.mixPreview(st(), m), box = document.getElementById('mixLive'); if (!box) return;
    var bags = p.kg / C.settingsOf(st()).kgPerBag;
    box.innerHTML = kv('Total', p.kg + ' kg = ' + (Math.round(bags * 10) / 10) + ' bags') + (isRole('owner') ? kv('Ingredient cost', cur(p.totalCents)) + kv('Cost per bag', cur(p.perBagCents)) : '');
  };
  FORMS.feedmix = function (f) {
    var m = readMix(f), p = C.mixPreview(st(), m), errors = [], warnings = [];
    if (!m.lines.length) errors.push('Enter at least one ingredient with kg.');
    p.lines.forEach(function (l) { if (l.short) warnings.push('Not enough ' + item(l.itemId).name + ' in stock (' + (C.feedState(st()).items[l.itemId] || {}).kg + ' kg). Record the purchase first, or the cost will be wrong.'); });
    var rows = m.lines.map(function (l) { return [item(l.itemId).name, l.kg + ' kg']; });
    rows.push(['Total made', p.kg + ' kg (' + (Math.round(p.kg / C.settingsOf(st()).kgPerBag * 10) / 10) + ' bags of ' + (item(m.outputItemId) || {}).name + ')']);
    if (isRole('owner')) { rows.push(['Cost', cur(p.totalCents)]); rows.push(['Cost per bag', cur(p.perBagCents)]); }
    preview({ title: 'Feed mix', rows: rows, errors: errors, warnings: warnings, onConfirm: async function () { await E.save(m); return 'feed'; } });
  };

  // ================================================================ MEDICINE STORE
  routes.store = function () {
    var s = st(), ms = C.medState(s, today()), owner = isRole('owner');
    var meds = live(s.items).filter(function (i) { return i.category === 'medicine'; });
    var warn = meds.filter(function (i) { var x = ms.items[i.id]; return x && (x.low || x.expiringSoon || x.expiredQty); });
    var out = head('Medicine store', 'Vaccines · dewormers · vitamins · disinfectants', '<div class="row"><a class="btn gold sm" href="#med-in">+ Stock in</a><a class="btn sm" href="#med-use">Record use</a></div>');
    if (warn.length) out += '<div class="alert err" style="margin-bottom:12px"><b>' + warn.length + ' warning(s):</b> ' + warn.map(function (i) { var x = ms.items[i.id]; return esc(i.name) + (x.low ? ' is low' : '') + (x.expiringSoon ? ' expires ' + dShort(x.earliestExpiry) : '') + (x.expiredQty ? ' has ' + x.expiredQty + ' expired' : ''); }).join('; ') + '</div>';
    out += '<div class="list">' + meds.map(function (i) {
      var x = ms.items[i.id] || { qty: 0 };
      return '<div class="item"><div class="grow"><div class="t">' + esc(i.name) + '</div><div class="sub ' + (x.expiringSoon ? 'red bold' : '') + '">' + (x.earliestExpiry ? 'Expires ' + dLong(x.earliestExpiry) : 'No expiry recorded') + (x.expiredQty ? ' · ' + x.expiredQty + ' expired — throw away' : '') + '</div></div>' +
        '<div class="right"><div class="bold ' + (x.low ? 'red' : '') + '" style="font-size:18px">' + x.qty + '</div><div class="tiny muted">' + esc(i.unit) + '</div></div></div>';
    }).join('') + '</div><p class="tiny muted" style="margin-top:12px">When a health task is ticked done with the medicine used, it comes out of the store automatically.</p>';
    if (owner) out += '';
    return out;
  };
  routes['med-in'] = function () {
    var meds = live(st().items).filter(function (i) { return i.category === 'medicine' && i.active !== false; });
    return back('store', 'Medicine store') + head('Stock in') + '<form class="card" data-form="medin"><label>Item<select name="itemId">' + meds.map(function (i) { return opt(i.id, i.name + ' (' + i.unit + ')'); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>Quantity<input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label><label>Total cost (GH₵)<input name="cost" type="number" min="0" step="0.01" inputmode="decimal"></label></div>' +
      '<div class="grid g2"><label>Expiry date<input type="date" name="expiry"></label><label>Date bought<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>' +
      '<label>Supplier<input name="supplier"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.medin = function (f) {
    var it = item(val(f, 'itemId')), rec = { type: 'med', kind: 'in', itemId: it.id, qty: num(val(f, 'qty')), cost: num(val(f, 'cost')), expiry: val(f, 'expiry'), date: val(f, 'date'), supplier: val(f, 'supplier').trim() };
    var errors = [], warnings = [];
    if (!(rec.qty > 0)) errors.push('Enter the quantity.');
    if (!rec.expiry) warnings.push('No expiry date — the app cannot warn you before it expires.');
    else if (rec.expiry < today()) errors.push('This expiry date has already passed.');
    if (!rec.cost) warnings.push('No cost entered — medicine cost per coop will be missing.');
    preview({ title: 'Stock in: ' + it.name, errors: errors, warnings: warnings, rows: [['Quantity', rec.qty + ' ' + esc(it.unit)], ['Cost', curN(rec.cost)], ['Expiry', rec.expiry ? dLong(rec.expiry) : '—']],
      onConfirm: async function () { await E.save(rec); return 'store'; } });
  };
  routes['med-use'] = function () {
    var s = st(), meds = live(s.items).filter(function (i) { return i.category === 'medicine' && i.active !== false; }), fl = C.activeFlocks(s, today());
    return back('store', 'Medicine store') + head('Record medicine used', 'For treatments that are not a task') + '<form class="card" data-form="meduse"><label>Item<select name="itemId">' + meds.map(function (i) { return opt(i.id, i.name + ' (' + i.unit + ')'); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>Quantity<input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label><label>Coop<select name="flockId">' + fl.map(function (x) { return opt(x.id, 'Coop ' + x.coop); }).join('') + '</select></label></div>' +
      '<label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label><label>Note<input name="note"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.meduse = function (f) {
    var it = item(val(f, 'itemId')), fl = flock(val(f, 'flockId')), qty = num(val(f, 'qty')), ms = C.medState(st(), today()).items[it.id] || { qty: 0 };
    var rec = { type: 'med', kind: 'use', itemId: it.id, qty: qty, flockId: fl ? fl.id : '', coop: fl ? fl.coop : '', date: val(f, 'date'), note: val(f, 'note').trim() };
    preview({ title: 'Medicine used', errors: qty > 0 ? [] : ['Enter the quantity.'], warnings: qty > ms.qty ? ['Store shows only ' + ms.qty + ' ' + it.unit + '.'] : [],
      rows: [['Item', esc(it.name)], ['Quantity', qty + ' ' + esc(it.unit)], ['Coop', fl ? 'Coop ' + fl.coop : '—'], ['Left in store', (Math.round((ms.qty - qty) * 100) / 100) + ' ' + esc(it.unit)]],
      onConfirm: async function () { await E.save(rec); return 'store'; } });
  };

  // ================================================================ EXPENSES & PROFIT (owner)
  var CATS = ['Labour / wages', 'Electricity', 'Water', 'Transport / fuel', 'Repairs & maintenance', 'Equipment', 'Vet services', 'Crates & packaging', 'Rent / land', 'Other'];
  function monthNav(route, m) {
    var prev = C.monthOf(C.addMonths(m + '-01', -1)), next = C.monthOf(C.addMonths(m + '-01', 1));
    return '<div class="row"><a class="btn light sm" href="#' + route + '/' + prev + '" aria-label="Previous month">‹</a><b>' + monthName(m) + '</b>' +
      (next <= C.monthOf(today()) ? '<a class="btn light sm" href="#' + route + '/' + next + '" aria-label="Next month">›</a>' : '') + '</div>';
  }
  routes.expenses = function (m) {
    m = m || C.monthOf(today());
    var list = C.sortChrono(live(st().expenses).filter(function (e) { return C.monthOf(e.date) === m; })).reverse();
    var byCat = {}, total = 0;
    list.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + C.cents(e.amount); total += C.cents(e.amount); });
    var out = head('Expenses', 'Feed and medicine are recorded in their own pages', '<a class="btn gold sm" href="#expense-new">+ Add expense</a>') + monthNav('expenses', m);
    out += '<div class="card" style="margin-top:12px"><h2>Total ' + cur(total) + '</h2>' + Object.keys(byCat).map(function (k) { return kv(k, cur(byCat[k])); }).join('') + '</div>';
    out += '<div class="list" style="margin-top:12px">' + (list.length ? list.map(function (e) {
      return '<div class="item"><div class="grow"><div class="t">' + esc(e.category) + '</div><div class="sub">' + dShort(e.date) + ' · ' + (C.int(e.coop) ? 'Coop ' + e.coop : 'Shared by all coops') + (e.note ? ' · ' + esc(e.note) : '') + '</div></div><b>' + curN(e.amount) + '</b></div>';
    }).join('') : '<div class="empty">No expenses this month</div>') + '</div>';
    return out;
  };
  routes['expense-new'] = function () {
    return back('expenses', 'Expenses') + head('Add expense') + '<form class="card" data-form="expense"><label>Category<select name="category">' + CATS.map(function (c) { return opt(c, c); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>Amount (GH₵)<input name="amount" type="number" min="0" step="0.01" inputmode="decimal" required></label><label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>' +
      '<label>For<select name="coop">' + opt(0, 'Shared by all coops (split by number of birds)') + coops().map(function (c) { return opt(c, 'Coop ' + c + ' only'); }).join('') + '</select></label>' +
      '<label>Note<input name="note"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.expense = function (f) {
    var s = st(), rec = { type: 'expenses', category: val(f, 'category'), amount: num(val(f, 'amount')), date: val(f, 'date'), coop: C.int(val(f, 'coop')), note: val(f, 'note').trim() };
    var errors = rec.amount > 0 ? [] : ['Enter the amount.'], rows = [['Category', esc(rec.category)], ['Amount', curN(rec.amount)], ['Date', dLong(rec.date)]], warnings = [];
    if (rec.coop) { rows.push(['For', 'Coop ' + rec.coop]); if (!C.flockInCoop(s, rec.coop, rec.date)) warnings.push('Coop ' + rec.coop + ' has no flock on this date, so this cost will not show under a coop.'); }
    else {
      var act = C.activeFlocks(s, rec.date), w = act.map(function (x) { return C.birdsAlive(s, x, rec.date); });
      var parts = C.allocate(C.cents(rec.amount), w);
      act.forEach(function (x, i) { rows.push(['Coop ' + x.coop + ' (' + w[i] + ' birds)', cur(parts[i])]); });
      if (!act.length) warnings.push('No active flocks on this date, so this cost will not be shared to any coop.');
    }
    preview({ title: 'New expense', rows: rows, errors: errors, warnings: warnings, onConfirm: async function () { await E.save(rec); return 'expenses/' + C.monthOf(rec.date); } });
  };
  routes.profit = function (m) {
    m = m || C.monthOf(today());
    var s = st(), p = C.profit(s, m);
    var out = head('Profit', 'Per coop, added up for the whole farm') + monthNav('profit', m);
    out += '<div class="grid g3" style="margin-top:12px">' + kpiBox('Income', cur(p.total.incomeCents), '', 'dark') + kpiBox('Costs', cur(p.total.costCents), '', 'dark') + kpiBox('Farm profit', cur(p.total.profitCents), '', 'gold', p.total.profitCents < 0 ? 'red' : '') + '</div>';
    var byCoop = {}; p.rows.forEach(function (r) { (byCoop[r.coop] = byCoop[r.coop] || []).push(r); });
    out += '<div class="card" style="margin-top:12px"><div class="scroll"><table><thead><tr><th>Coop</th><th class="right">Eggs</th><th class="right">Income</th><th class="right">Feed</th><th class="right">Medicine</th><th class="right">Own costs</th><th class="right">Shared</th><th class="right">Profit</th></tr></thead><tbody>' +
      coops().map(function (c) {
        var rs = byCoop[c] || [];
        if (!rs.length) return '<tr><td>Coop ' + c + '</td><td colspan="7" class="muted">no flock this month</td></tr>';
        return rs.map(function (r) {
          return '<tr><td class="bold">Coop ' + c + '</td><td class="right">' + crates(r.eggs) + '</td><td class="right">' + cur(r.incomeCents) + '</td><td class="right">' + cur(r.feed) + '</td><td class="right">' + cur(r.med) + '</td><td class="right">' + cur(r.direct) + '</td><td class="right">' + cur(r.shared) + '</td><td class="right bold ' + (r.profitCents < 0 ? 'red' : 'greenx') + '">' + cur(r.profitCents) + '</td></tr>';
        }).join('');
      }).join('') +
      (p.unassigned.incomeCents || p.unassigned.costCents ? '<tr><td class="muted">Not linked to a coop</td><td></td><td class="right">' + cur(p.unassigned.incomeCents) + '</td><td colspan="4" class="right">' + cur(p.unassigned.costCents) + '</td><td class="right">' + cur(p.unassigned.incomeCents - p.unassigned.costCents) + '</td></tr>' : '') +
      '<tr><td class="bold">WHOLE FARM</td><td class="right bold">' + crates(p.total.eggs) + '</td><td class="right bold">' + cur(p.total.incomeCents) + '</td><td colspan="4" class="right bold">' + cur(p.total.costCents) + '</td><td class="right bold">' + cur(p.total.profitCents) + '</td></tr></tbody></table></div></div>';
    out += '<div class="card small muted" style="margin-top:12px"><b style="color:var(--ink)">How it is worked out</b><br>Egg sales are shared between coops by how many eggs each coop laid this month. Spent hens go to the coop they came from. Feed and medicine go to the coop that used them. Expenses for one coop go to that coop; shared expenses (labour, electricity, transport) are split by the number of birds. Chick cost is shown in each coop’s page (whole-life profit).</div>';
    return out;
  };

  // ================================================================ MONTHLY REPORT (owner) — same page Google emails as PDF on the 1st
  routes.report = function (m) {
    m = m || C.monthOf(today());
    return '<div class="no-print">' + head('Monthly report', 'Everything that happened on the farm this month. Google also emails it to you as a PDF on the 1st of every month.') +
      '<div class="row between" style="margin-bottom:12px">' + monthNav('report', m) + '<button class="btn gold" type="button" data-act="print">Print / Save PDF</button></div></div>' +
      '<div class="card report-print" style="padding:18px">' + C.reportHtml(st(), m, today(), farmName()) + '</div>';
  };

  // ================================================================ SETTINGS / MORE
  routes.more = function () {
    return head('More') + '<div class="list">' + (NAV[role()] || []).map(function (n) { return '<a class="item" href="#' + n[0] + '">' + icon(n[2]) + '<div class="grow t">' + esc(n[1]) + '</div>›</a>'; }).join('') + '</div>';
  };
  routes.settings = function () {
    var s = st(), p = E.pending().length;
    var out = head('Settings', esc(me().name) + ' · ' + esc(role()));
    out += '<div class="card"><h2>Sync with Google Sheets</h2>' + kv('Internet', navigator.onLine ? 'Online' : 'Offline') + kv('Waiting to send', p) +
      kv('Last sync', S.meta.lastSync ? new Date(S.meta.lastSync).toLocaleString() : 'never') + (S.meta.lastError ? kv('Problem', esc(S.meta.lastError), 'red') : '') +
      '<div class="grid g2" style="margin-top:10px"><button class="btn" type="button" data-act="syncNow">Sync now</button><button class="btn light" type="button" data-act="fullRefresh">Reload all from Sheet</button></div></div>';
    if (isRole('owner')) {
      out += '<div class="card" style="margin-top:12px"><h2>Prices</h2>' + live(s.products).map(function (x) { return kv(x.name + (x.active === false ? ' (off)' : ''), 'retail ' + curN(x.retail) + ' · wholesale ' + curN(x.wholesale)); }).join('') + '</div>';
      out += '<div class="card" style="margin-top:12px"><h2>People</h2>' + live(s.users).map(function (u) { return kv(u.name, esc(u.role) + (u.active ? '' : ' · not active')); }).join('') + '</div>';
      out += '<div class="card" style="margin-top:12px"><h2>Farm details</h2>' + ['farmName', 'phone', 'location', 'ownerWhatsapp', 'ownerEmail'].map(function (k) { return kv(k, esc(setting(k, '—'))); }).join('') + '</div>';
      out += '<div class="alert warn" style="margin-top:12px">Change prices, people, PINs, farm details, feed items and the vaccination schedule in the tabs of your <b>Google Sheet</b>. Phones pick up the change at their next sync.</div>';
    }
    out += '<button class="btn red block" style="margin-top:12px" type="button" data-act="logout">Log out</button><p class="tiny muted" style="margin-top:10px">The Egg Man Farms app v1.0 · data is kept on this device and in your Google Sheet.</p>';
    return out;
  };
  ACT.fullRefresh = function () { if (!navigator.onLine) return toast('Needs internet.'); E.fullRefresh().then(function () { toast('Reloaded from the Sheet'); }); };
  ACT.logout = async function () {
    if (E.pending().length && !navigator.onLine) { if (!confirm(E.pending().length + ' record(s) are not synced yet. They stay safe on this phone. Log out anyway?')) return; }
    await E.logout(); go('home'); render();
  };

  // ================================================================ events
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a, e); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    if (FORMS[f.dataset.form]) FORMS[f.dataset.form](f);
  });
  document.addEventListener('input', function (e) {
    var s = e.target.closest('[data-search]');
    if (s) { var q = s.value.trim().toLowerCase(); document.querySelectorAll(s.dataset.search).forEach(function (el) { el.style.display = !q || el.dataset.s.indexOf(q) >= 0 ? '' : 'none'; }); return; }
    var f = e.target.closest('form[data-form]'); if (f && LIVE[f.dataset.form]) LIVE[f.dataset.form](f);
  });
  document.addEventListener('change', function (e) {
    var a = e.target.closest('[data-act-change]'); if (a && ACT[a.dataset.actChange]) { ACT[a.dataset.actChange](a); return; }
    var f = e.target.closest('form[data-form]');
    if (f && f.dataset.form === 'task' && e.target.type === 'checkbox') { // "Whole farm" and single coops exclude each other
      if (e.target.name === 'all' && e.target.checked) coops().forEach(function (c) { f.elements['c' + c].checked = false; });
      else if (e.target.name !== 'all' && e.target.checked) f.elements.all.checked = false;
    }
    if (f && LIVE[f.dataset.form]) LIVE[f.dataset.form](f);
  });
  window.addEventListener('hashchange', function () { lastCust = null; render(); });
  E.onChange(function () { if (isForm && S.session) { badge(); return; } render(); });

  E.init().then(function () { render(); E.sync(); });
  window.EggApp = { render: render };
})();
