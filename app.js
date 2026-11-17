/* The Egg Man Farms — screens. Every form goes to a PREVIEW first; nothing is saved until "Confirm". */
(function () {
  'use strict';
  var E = window.EggCore, S = E.Store, C = window.Calc;
  var $main = document.getElementById('main');
  var $modal = document.getElementById('modal');
  var FORMS = {}, LIVE = {}, ACT = {}, pendingConfirm = null, pendingDone = '', isForm = false;
  // The logo is built into index.html, so it shows even if the icons folder is missing.
  var LOGO = (document.getElementById('brandLogo') || {}).src || 'icon-192.png';

  // ================================================================ helpers
  function esc(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function st() { return S.state; }
  // "View as": the owner can look at the manager's, salesperson's or farm hand's screens (look only, no saving).
  function me() { return S.viewAs ? S.viewAs : (S.session && S.session.user); }
  function realRole() { return S.session ? S.session.user.role : ''; }
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
  // ⓘ "How is this worked out?" — plain words under a figure.
  var INFO = {
    lay: 'Lay rate = eggs collected in the day ÷ birds alive that morning × 100. If you collect 2 or 3 times, the collections are added first. Example: 700 eggs from 1,000 birds = 70%.',
    feedkg: 'Type the kg of feed you gave this coop. The app counts how many bags that is (1 bag = 50 kg) and how many grams each bird ate. A laying hen eats about 110–130 g a day.',
    coop: 'Eggs so far = all collections since the flock came. Feed per bird = kg of feed ÷ birds ÷ days. Birds now = birds at the start − deaths − culls − hens sold.',
    store: 'Egg store = eggs at the start + eggs collected − eggs given to salespeople + eggs they bring back − eggs sold at the farm ± corrections by the owner.',
    crates: 'Eggs with a salesperson = eggs taken out − eggs sold − eggs brought back − broken eggs. When they bring the rest back, it should end at 0.',
    feedcost: 'Cost per kg is an average: when you buy more at a new price, it mixes with the price of what is already in the store. Mixed feed costs what its ingredients cost. Each coop pays for the kg it eats.',
    profit: 'Profit of a coop = money from its eggs and hens − its own feed, medicine and costs − its share of farm costs. Farm costs (labour, light, water…) are shared by the number of birds in each coop.',
    debt: 'What a customer owes = old debt at the start + everything bought − everything paid. Part payments make the debt go down little by little.',
    parts: 'Parts are like a ratio. Maize 50 and Soya 20 means 50 kg of maize for every 20 kg of soya — for any amount. The app turns parts into kg when you mix.',
    med: 'Medicine that expires first is used first. Its cost goes to the coop that used it.',
    colour: 'Each flock lays white or brown eggs. When a coop has both (after moving birds), the daily record asks for white and brown apart. Eggs, the store, crates and sales are then counted by colour. Entries from before colours count as the main colour (Settings › Farm details).'
  };
  // white / brown eggs — the app shows colour choices only when the farm has both colours
  function colours() { return C.coloursInUse(st()); }
  function twoColours() { return colours().length > 1; }
  function colWord(c) { return c === 'white' ? 'White' : 'Brown'; }
  function colChip(c) { return '<span class="chip ' + (c === 'white' ? 'egg-w' : 'egg-b') + '">' + colWord(c) + '</span>'; }
  function colourSelect(name, sel) { return '<select name="' + name + '">' + opt('brown', 'Brown-egg layers', sel || C.defaultColour(st())) + opt('white', 'White-egg layers', sel || C.defaultColour(st())) + '</select>'; }
  // each egg product once per colour in use (e.g. "Crate · White" and "Crate · Brown")
  function eggVariants() {
    var cs = colours(), two = cs.length > 1;
    var out = [];
    eggProducts().forEach(function (p) { cs.forEach(function (c) { out.push({ key: p.id + '__' + c, p: p, colour: c, label: p.name + (two ? ' · ' + colWord(c) : '') }); }); });
    return out;
  }
  function lineName(it) { var p = prod(it.productId) || { name: it.productId }; return p.name + (twoColours() && (p.kind === 'good' || p.kind === 'cracked') ? ' · ' + colWord(C.lineColour(st(), it)) : ''); }
  function info(key) { return INFO[key] ? '<details class="info"><summary>ⓘ How is this worked out?</summary><p>' + esc(INFO[key]) + '</p></details>' : ''; }
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
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4L2 7M19 4l3 3"/>',
    waiting: '<path d="M5 4h14M5 20h14M7 4c0 5 10 5 10 8s-10 3-10 8M17 4c0 5-10 5-10 8"/>',
    summary: '<path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[n] || '') + '</svg>'; }

  // ================================================================ who can see what
  var NAV = {
    owner: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['sale-new', 'New sale', 'sale'], ['customers', 'Customers', 'customers'], ['waiting', 'Waiting list', 'waiting'],
      ['crates', 'Crates out', 'crates'], ['feed', 'Feed', 'feed'], ['store', 'Medicine', 'store'], ['expenses', 'Expenses', 'expenses'], ['profit', 'Profit', 'profit'], ['report', 'Monthly report', 'report'], ['summary', 'Daily summary', 'summary'], ['history', 'History', 'history'], ['alarms', 'Alarms', 'alarm'], ['settings', 'Settings', 'settings']],
    manager: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['crates', 'Crates out', 'crates'], ['waiting', 'Waiting list', 'waiting'], ['feed', 'Feed', 'feed'], ['store', 'Medicine', 'store'], ['summary', 'Daily summary', 'summary'], ['history', 'History', 'history'], ['alarms', 'Alarms', 'alarm'], ['settings', 'Settings', 'settings']],
    sales: [['home', 'Home', 'home'], ['sale-new', 'New sale', 'sale'], ['customers', 'Customers', 'customers'], ['crates', 'My eggs', 'crates'], ['waiting', 'Waiting list', 'waiting'], ['tasks', 'Emergency', 'tasks'], ['history', 'My history', 'history'], ['alarms', 'Alarms', 'alarm'], ['settings', 'Settings', 'settings']],
    farmhand: [['home', 'Home', 'home'], ['coops', 'Coops', 'coops'], ['tasks', 'Tasks', 'tasks'], ['summary', 'Daily summary', 'summary'], ['history', 'History', 'history'], ['alarms', 'Alarms', 'alarm'], ['settings', 'Settings', 'settings']]
  };
  var ALLOW = {
    'flock-new': ['owner', 'manager'], 'move-birds': ['owner', 'manager'], 'flock-close': ['owner'], daily: ['owner', 'manager', 'farmhand'], 'daily-edit': ['owner'],
    'sale-new': ['owner', 'sales'], receipt: ['owner', 'sales'], customers: ['owner', 'sales'], customer: ['owner', 'sales'],
    bin: ['owner'], reset: ['owner'],
    'customer-new': ['owner', 'sales'], 'customer-edit': ['owner'], 'payment-new': ['owner', 'sales'], preceipt: ['owner', 'sales'],
    crates: ['owner', 'manager', 'sales'], 'crates-out': ['owner', 'manager'], 'crates-return': ['owner', 'manager'], 'crates-adjust': ['owner'],
    feed: ['owner', 'manager'], 'feed-buy': ['owner', 'manager'], 'feed-mix': ['owner', 'manager'], recipes: ['owner', 'manager'], 'recipe-edit': ['owner'],
    store: ['owner', 'manager'], 'med-in': ['owner', 'manager'], 'med-use': ['owner', 'manager'],
    history: ['owner', 'manager', 'sales', 'farmhand'], summary: ['owner', 'manager', 'farmhand'],
    waiting: ['owner', 'manager', 'sales'], 'waiting-new': ['owner', 'manager', 'sales'], 'waiting-item': ['owner', 'manager', 'sales'],
    expenses: ['owner'], 'expense-new': ['owner'], profit: ['owner'], report: ['owner'], set: ['owner'], 'flock-edit': ['owner'], 'start-fresh': ['owner']
  };
  function seesMoney() { return isRole('owner', 'sales'); }

  // ================================================================ preview / confirm
  function preview(o) {
    var errs = o.errors || [], warns = o.warnings || [];
    pendingConfirm = errs.length ? null : o.onConfirm;
    pendingDone = o.doneMessage || 'Saved on this phone ✓ — syncing';
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
    if (S.viewAs) { toast('You are only viewing ' + S.viewAs.name + '\u2019s screens. Tap "Back to owner" to save things.'); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    var fn = pendingConfirm; pendingConfirm = null;
    var doneMsg = pendingDone;
    try { var next = await fn(); ACT.closeModal(); toast(doneMsg); if (next) go(next); else render(); }
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
    if (S.viewAs) html = '<div class="alert warn row between no-print" style="margin-bottom:12px"><span>👁 Viewing as <b>' + esc(S.viewAs.name) + '</b> (' + esc(S.viewAs.role) + ') — look only, nothing is saved.</span><button class="btn sm" type="button" data-act="viewAsOff">Back to owner</button></div>' + html;
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
    return '<div class="login"><div class="logo"><img src="' + LOGO + '" alt=""><h1>' + esc(farmName()) + '</h1><p class="muted small">Farm, sales and debts — works without internet</p></div>' +
      (cfg ? '' : '<div class="alert err">This app is not connected to your Google Sheet yet. Open <b>config.js</b> and paste the web app URL and farm key (see SETUP.md).</div>') +
      '<form class="card" data-form="login" autocomplete="off"><label>Your name<input name="name" required autocomplete="username"></label>' +
      '<label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" required autocomplete="current-password"></label>' +
      '<button class="btn gold block" type="submit">Enter</button><div id="loginMsg" class="small red" role="alert"></div></form>' +
      '<p class="tiny muted" style="text-align:center">First login on a new phone needs internet. After that it works offline.</p></div>';
  }
  FORMS.login = async function (f) {
    var msg = document.getElementById('loginMsg'); msg.textContent = 'Checking…';
    try { var r = await E.login(val(f, 'name'), val(f, 'pin')); if (!r.ok) { msg.textContent = r.error; return; } go('home'); render(); pushNative(); }
    catch (e) { msg.textContent = 'Could not reach Google. Check the internet and config.js.'; }
  };

  // ================================================================ HOME
  routes.home = function (mode, v) {
    var t = today(), s = st(), u = me();
    var hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if (role() === 'sales') { var dd = C.dashboard(s, t); return head(hi + ', ' + u.name, dLong(t) + ' · ' + esc(u.role)) + salesHome(t, dd); }
    mode = mode === 'month' || mode === 'year' || mode === 'week' ? mode : 'day';
    var day = mode === 'day' && v && v <= t ? v : t, month = mode === 'month' && v ? v : C.monthOf(t), year = mode === 'year' && v ? v : t.slice(0, 4);
    var wk = C.weekStart(mode === 'week' && v ? v : t);
    var title = mode === 'day' ? (day === t ? hi + ', ' + u.name : dLong(day)) : mode === 'week' ? 'Week of ' + dShort(wk) + ' – ' + dShort(C.addDays(wk, 6)) + ' ' + C.addDays(wk, 6).slice(0, 4) : mode === 'month' ? monthName(month) : 'Year ' + year;
    var out = head(title, (mode === 'day' && day === t ? dLong(t) + ' · ' : '') + esc(u.role), nextCollection());
    out += periodBar(mode, day, month, year, wk);
    if (mode === 'week') return out + weekHome(wk);
    if (mode === 'month') return out + monthHome(month);
    if (mode === 'year') return out + yearHome(year);
    return out + dayHome(day);
  };
  function nextCollection() {
    var times = String(setting('collectionTimes', '')).split(/[,;\s]+/).filter(function (x) { return /^\d{1,2}[:.]\d{2}$/.test(x); });
    if (!times.length || role() === 'sales') return '';
    var now = new Date(), mins = now.getHours() * 60 + now.getMinutes();
    var next = times.map(function (x) { var p = x.split(/[:.]/); return { t: pad(+p[0]) + ':' + p[1], m: +p[0] * 60 + +p[1] }; }).sort(function (a, b) { return a.m - b.m; }).filter(function (x) { return x.m >= mins; })[0];
    return '<span class="chip yellow" style="font-size:12px;padding:6px 10px">🥚 Next egg collection: ' + (next ? next.t : 'tomorrow ' + times[0]) + '</span>';
  }
  function periodBar(mode, day, month, year, wk) {
    // years: 5 ahead of this year, back to 2024 (and back to the first record if older)
    var t = today(), first = +(firstRecordDate() || t).slice(0, 4), years = [];
    for (var y = +t.slice(0, 4) + 5; y >= Math.min(2024, first); y--) years.push(String(y));
    if (years.indexOf(String(year)) < 0) years.unshift(String(year));
    var pill = function (m, l, href) { return '<a class="pill ' + (mode === m ? 'on' : '') + '" href="#' + href + '" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">' + l + '</a>'; };
    var pick = mode === 'day' ? '<input type="date" value="' + day + '" max="' + t + '" data-act-change="homePick" data-mode="day" aria-label="Choose a day" style="min-height:40px;width:auto">'
      : mode === 'week' ? '<a class="btn light sm" href="#home/week/' + C.addDays(wk, -7) + '" aria-label="Week before">‹</a><input type="date" value="' + wk + '" data-act-change="homePick" data-mode="week" aria-label="Choose any day in the week" style="min-height:40px;width:auto"><a class="btn light sm" href="#home/week/' + C.addDays(wk, 7) + '" aria-label="Next week">›</a>'
      : mode === 'month' ? '<input type="month" value="' + month + '" min="2024-01" max="' + (+t.slice(0, 4) + 5) + '-12" data-act-change="homePick" data-mode="month" aria-label="Choose a month" style="min-height:40px;width:auto">'
      : '<select data-act-change="homePick" data-mode="year" aria-label="Choose a year" style="min-height:40px;width:auto">' + years.map(function (y) { return opt(y, y, year); }).join('') + '</select>';
    return '<div class="row" style="margin-bottom:12px;gap:8px">' + pill('day', 'Day', 'home') + pill('week', 'Week', 'home/week/' + C.weekStart(t)) + pill('month', 'Month', 'home/month/' + C.monthOf(t)) + pill('year', 'Year', 'home/year/' + t.slice(0, 4)) + pick +
      (mode === 'day' && day !== t ? '<a class="btn light sm" href="#home">Back to today</a>' : '') + '</div>';
  }
  ACT.homePick = function (el) { if (el.value) go('home/' + el.dataset.mode + '/' + (el.dataset.mode === 'week' ? C.weekStart(el.value) : el.value)); };
  function firstRecordDate() {
    var s = st(), min = '';
    ['daily', 'sales', 'payments', 'feed', 'med', 'expenses', 'stock'].forEach(function (k) { live(s[k]).forEach(function (x) { if (x.date && (!min || x.date < min)) min = x.date; }); });
    return min;
  }
  function weekHome(wk) {
    var s = st(), t = today(), end = C.addDays(wk, 6);
    if (wk > t) return '<div class="empty">This week has not come yet. Records will show here when the days come.</div>';
    var p = C.periodSummary(s, wk, end > t ? t : end), T = p.total, money = seesMoney();
    var k = [kpiBox('Eggs collected', crates(T.eggs), T.layRate + '% average lay', 'dark'), kpiBox('Deaths & culls', String(T.deaths), T.records + ' daily records')];
    if (money) { k.push(kpiBox('Sales', cur(T.salesCents), T.sales + ' sales', 'gold')); k.push(kpiBox('Money received', cur(T.receivedCents), cur(T.debtPaidCents) + ' from old debts')); }
    if (isRole('owner')) k.push(kpiBox('Expenses', cur(T.expensesCents), ''));
    var out = '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    out += '<div class="row" style="gap:8px;margin-top:12px"><a class="btn light sm" href="#history/week/' + wk + '">Every entry made this week →</a>' + (isRole('owner', 'manager', 'farmhand') ? '<a class="btn light sm" href="#summary/week/' + wk + '">📋 Weekly summary</a>' : '') + '</div>';
    return out + historyTable(p, 'Day by day', false);
  }
  function dayHome(t) {
    var s = st(), d = C.dashboard(s, t), isToday = t === today();
    var out = isToday ? alertsBlock(t, d) : '';
    var word = isToday ? 'today' : 'that day';
    var k = [];
    k.push(kpiBox('Eggs ' + word, crates(d.eggsToday.total), (twoColours() ? 'white ' + crates(d.eggsToday.white.good + d.eggsToday.white.cracked) + ' · brown ' + crates(d.eggsToday.brown.good + d.eggsToday.brown.cracked) + ' · ' : '') + d.layRate + '% lay · ' + d.coopsRecorded + '/' + d.coopsActive + ' coops recorded', 'dark'));
    if (seesMoney()) k.push(kpiBox('Sales ' + word, cur(d.salesTodayCents), cur(d.cashTodayCents) + ' received', 'gold'));
    k.push(kpiBox('Eggs in store', crates(d.store.good), crates(d.store.cracked) + ' cracked' + (isToday ? '' : ' · end of day')));
    if (seesMoney()) k.push(kpiBox('Customers owe', cur(d.debtCents), d.debtors + ' customers' + (isToday ? '' : ' · now'), '', d.debtCents > 0 ? 'red' : ''));
    k.push(kpiBox('Birds alive', d.birds.toLocaleString(), d.deaths + ' died ' + word));
    if (isToday) k.push(kpiBox('Tasks', d.tasks.overdue + ' overdue', d.tasks.today + ' today · ' + d.tasks.soon + ' soon', '', d.tasks.overdue ? 'red' : ''));
    out += '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    if (isRole('owner', 'manager')) out += salesEggsCard(t);
    var bars = coops().map(function (c) {
      var f = C.flockInCoop(s, c, t), dt = f ? C.dayTotal(s, f.id, t) : null, rec = dt && dt.count ? dt : null;
      return { c: c, v: rec ? rec.total : 0, f: f, rec: rec };
    });
    var max = Math.max.apply(null, bars.map(function (b) { return b.v; }).concat([1]));
    out += '<div class="card stack" style="margin-top:12px"><div class="row between"><h2>Eggs per coop ' + word + '</h2><span class="tiny muted">crates</span></div><div class="bars">' +
      bars.map(function (b) {
        var h = b.v ? Math.max(4, Math.round(b.v / max * 90)) : 4;
        return '<a class="b" href="#' + (b.f ? 'coop/' + b.f.id : 'coops') + '" style="text-decoration:none;color:inherit"><span class="tiny">' + (b.rec ? Math.floor(b.v / C.settingsOf(s).eggsPerCrate) : (b.f ? '—' : '')) + '</span><i class="' + (b.rec ? '' : 'y') + '" style="height:' + h + 'px"></i><b>C' + b.c + '</b></a>';
      }).join('') + '</div><div class="tiny muted">Yellow = no record ' + word + '</div></div>';
    if (isRole('owner')) {
      var sellers = Object.keys(d.bySeller);
      out += '<div class="card" style="margin-top:12px"><h2>Sales by salesperson ' + word + '</h2>' +
        (sellers.length ? sellers.map(function (id) { return kv(userName(id), cur(d.bySeller[id])); }).join('') : '<div class="empty">No sales ' + word + '</div>') + '</div>';
    }
    if (isToday && isRole('owner', 'manager')) out += callCard(t);
    if (isRole('manager', 'farmhand', 'owner')) out += '<a class="btn light sm" style="margin-top:12px" href="#summary/day/' + t + '">📋 Full daily summary — share on WhatsApp / print</a>';
    if (isToday && isRole('manager', 'farmhand', 'owner')) out += tasksPreviewBlock(t);
    if (isToday) out += historyTable(C.periodSummary(s, C.addDays(t, -13), t), 'Last 14 days', true);
    return out;
  }
  function monthHome(m) {
    var s = st(), t = today(), end = C.lastDayOfMonth(m); if (end > t) end = t;
    var p = C.periodSummary(s, m + '-01', end), T = p.total, money = seesMoney();
    var k = [kpiBox('Eggs collected', crates(T.eggs), T.layRate + '% average lay', 'dark'), kpiBox('Deaths & culls', String(T.deaths), T.records + ' daily records')];
    if (money) {
      k.push(kpiBox('Sales', cur(T.salesCents), T.sales + ' sales', 'gold'));
      k.push(kpiBox('Money received', cur(T.receivedCents), cur(T.debtPaidCents) + ' from old debts'));
      if (isRole('owner')) { var pr = C.profit(s, m).total; k.push(kpiBox('Expenses', cur(T.expensesCents), 'labour, power, repairs…')); k.push(kpiBox('Profit', cur(pr.profitCents), 'income ' + cur(pr.incomeCents), '', pr.profitCents < 0 ? 'red' : '')); }
    }
    var out = '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    if (isRole('owner')) out += '<a class="btn light sm" style="margin-top:12px" href="#report/' + m + '">Full monthly report (print / PDF)</a>';
    return out + historyTable(p, 'Day by day', false);
  }
  function historyTable(p, title, short) {
    var money = seesMoney(), rows = p.days.slice().reverse();
    return '<div class="card" style="margin-top:12px"><h2>' + esc(title) + '</h2>' + (rows.length ? '<div class="scroll"><table><thead><tr><th>Day</th><th class="right">Eggs</th><th class="right">Lay %</th><th class="right">Died</th>' +
      (money ? '<th class="right">Sales</th><th class="right">Received</th>' : '') + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td style="white-space:nowrap"><a href="#home/day/' + r.date + '">' + (short ? '' : DAY[dObj(r.date).getUTCDay()] + ' ') + dShort(r.date) + '</a></td><td class="right">' + (r.records ? crates(r.eggs) : '—') + '</td><td class="right">' + (r.records ? r.layRate + '%' : '—') + '</td><td class="right ' + (r.deaths ? 'red' : '') + '">' + r.deaths + '</td>' +
          (money ? '<td class="right">' + cur(r.salesCents) + '</td><td class="right">' + cur(r.receivedCents) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">Nothing recorded</div>') + '</div>';
  }
  function yearHome(y) {
    var s = st(), Y = C.yearSummary(s, y, today()), money = seesMoney(), T = Y.total;
    var k = [kpiBox('Eggs collected', crates(T.eggs), T.layRate + '% average lay', 'dark'), kpiBox('Deaths & culls', String(T.deaths), '')];
    if (money) { k.push(kpiBox('Sales', cur(T.salesCents), '', 'gold')); k.push(kpiBox('Money received', cur(T.receivedCents), '')); }
    var out = '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    out += '<div class="card" style="margin-top:12px"><h2>Month by month</h2>' + (Y.months.length ? '<div class="scroll"><table><thead><tr><th>Month</th><th class="right">Eggs</th><th class="right">Lay %</th><th class="right">Died</th>' +
      (money ? '<th class="right">Sales</th><th class="right">Received</th>' : '') + (isRole('owner') ? '<th class="right">Expenses</th><th class="right">Profit</th>' : '') + '</tr></thead><tbody>' +
      Y.months.map(function (mo) {
        var P = mo.total, pr = isRole('owner') ? C.profit(s, mo.month).total : null;
        return '<tr><td><a href="#home/month/' + mo.month + '">' + monthName(mo.month) + '</a></td><td class="right">' + crates(P.eggs) + '</td><td class="right">' + P.layRate + '%</td><td class="right">' + P.deaths + '</td>' +
          (money ? '<td class="right">' + cur(P.salesCents) + '</td><td class="right">' + cur(P.receivedCents) + '</td>' : '') +
          (pr ? '<td class="right">' + cur(P.expensesCents) + '</td><td class="right bold ' + (pr.profitCents < 0 ? 'red' : 'greenx') + '">' + cur(pr.profitCents) + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">Nothing recorded this year</div>') + '</div>';
    return out;
  }
  function kpiBox(l, v, s, cls, vcls) { return '<div class="kpi ' + (cls || '') + '"><div class="l">' + esc(l) + '</div><div class="v ' + (vcls || '') + '">' + esc(v) + '</div><div class="s">' + esc(s || '') + '</div></div>'; }
  function alertsBlock(t, d) {
    var s = st(), a = [];
    if (isRole('owner')) {
      var seen = {}, bad = [];
      live(s.products).forEach(function (p) {
        if ((p.kind === 'good' || p.kind === 'cracked') && p.active !== false && !(C.int(p.eggsPerUnit) > 0)) bad.push(p.name + ' has no “Eggs in one”');
        if (seen[p.id]) bad.push(p.name + ' is in the list twice'); seen[p.id] = 1;
      });
      if (bad.length) a.push('<a class="alert warn" style="display:block;text-decoration:none" href="#set/Products"><b>Check your products:</b> ' + esc(bad.join('; ')) + '. Tap to fix in Settings › Products.</a>');
    }
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
  function callCard(t) {
    var WL = C.waitingList(st(), me(), t);
    return WL.callNow.length ? '<a class="alert warn" style="display:block;margin-top:12px;text-decoration:none;color:inherit" href="#waiting"><b>📞 ' + WL.callNow.length + ' customer' + (WL.callNow.length === 1 ? '' : 's') + ' to call today</b> — they asked to buy and are still waiting. Tap to see who.</a>' : '';
  }
  // Home: eggs given to each salesperson that day — given (with time), sold, returned, still with them
  function salesEggsCard(t) {
    var s = st(), word = t === today() ? 'today' : 'that day', tot = { out: 0, cracked: 0, left: 0 }, money = isRole('owner');
    var lines = salesUsers().map(function (u) {
      var c = C.carry(s, u.id, t);
      var moves = C.sortChrono(live(s.stock).filter(function (m) { return m.salesUserId === u.id && m.date === t && m.kind === 'out'; }));
      if (!moves.length && !c.opening.good && !c.opening.cracked && !c.sold.good) return '';
      tot.out += c.out.good; tot.cracked += c.out.cracked; tot.left += c.remaining.good;
      var times = moves.map(function (m) { var d = m.createdAt ? new Date(m.createdAt) : null; return d && !isNaN(d) ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : ''; }).filter(Boolean);
      var status = c.returnRecorded ? (c.balanced ? '<span class="chip green">Balanced ✓</span>' : '<span class="chip red">' + crates(c.remaining.good) + ' missing</span>') : '';
      var hand = money ? handIn(u.id, t) : null;
      return '<a href="#crates/' + t + '" style="display:block;text-decoration:none;color:inherit;padding:10px 0;border-bottom:1px solid #F0ECE1">' +
        '<div class="row between"><b>' + esc(u.name) + '</b>' + status + '</div>' +
        '<div class="small">Given <b>' + crates(c.out.good) + '</b>' + (c.out.cracked ? ' + ' + crates(c.out.cracked) + ' cracked' : '') + (times.length ? ' <span class="muted">at ' + times.join(', ') + '</span>' : '') +
        (c.opening.good ? ' · had ' + crates(c.opening.good) + ' from before' : '') + ' · sold ' + crates(c.sold.good) +
        (c.returnRecorded ? ' · returned ' + crates(c.returned.good) : '') + ' · <b>still with ' + esc(u.name) + ': ' + crates(c.remaining.good) + '</b></div>' +
        (hand && hand.total ? '<div class="tiny muted">Money to hand in: ' + cur(hand.total) + ' (cash ' + cur(hand.Cash) + ' · MoMo ' + cur(hand.MoMo) + ')</div>' : '') + '</a>';
    }).filter(Boolean);
    return '<div class="card" style="margin-top:12px"><div class="row between"><h2>Eggs with salespeople ' + word + '</h2><a class="small" href="#crates/' + t + '">Crates →</a></div>' +
      (lines.length ? '<div class="small" style="margin:4px 0 2px">Given out ' + word + ': <b>' + crates(tot.out) + '</b>' + (tot.cracked ? ' + ' + crates(tot.cracked) + ' cracked' : '') + ' · still with salespeople: <b>' + crates(tot.left) + '</b></div>' + lines.join('')
        : '<div class="empty">No eggs given out ' + word + '.' + (t === today() && isRole('owner', 'manager') ? ' <a href="#crates">Give out eggs →</a>' : '') + '</div>') + '</div>';
  }
  function salesHome(t, d) {
    var s = st(), u = me(), c = C.carry(s, u.id, t);
    var mine = live(s.sales).filter(function (x) { return x.by === u.id && x.date === t; });
    var total = 0, cash = { Cash: 0, MoMo: 0, Bank: 0 };
    mine.forEach(function (x) { total += C.saleTotals(x).totalCents; (x.payments || []).forEach(function (p) { cash[p.method] = (cash[p.method] || 0) + C.cents(p.amount); }); });
    live(s.payments).filter(function (p) { return p.by === u.id && p.date === t; }).forEach(function (p) { cash[p.method] = (cash[p.method] || 0) + C.cents(p.amount); });
    var out = '<div class="grid g2">' + kpiBox('Eggs with you now', crates(c.remaining.good), crates(c.remaining.cracked) + ' cracked', 'dark') +
      kpiBox('My sales today', cur(total), mine.length + ' sales', 'gold') + '</div>';
    out += '<div class="grid g2" style="margin-top:12px"><a class="btn gold" href="#sale-new">+ New sale</a><a class="btn ghost" href="#customers">Customers</a></div>';
    var myMoves = C.sortChrono(live(s.stock).filter(function (m) { return m.salesUserId === u.id && m.date === t && m.kind === 'out'; }));
    var times = myMoves.map(function (m) { var dt = m.createdAt ? new Date(m.createdAt) : null; return dt && !isNaN(dt) ? pad(dt.getHours()) + ':' + pad(dt.getMinutes()) : ''; }).filter(Boolean);
    out += '<div class="card" style="margin-top:12px"><h2>My eggs today</h2>' +
      (c.opening.good || c.opening.cracked ? kv('Had from before', crates(c.opening.good)) : '') +
      kv('Given to me' + (times.length ? ' <span class="tiny muted">at ' + times.join(', ') + '</span>' : ''), crates(c.out.good) + (c.out.cracked ? ' + ' + crates(c.out.cracked) + ' cracked' : '')) +
      kv('Sold', crates(c.sold.good) + (c.sold.cracked ? ' + ' + crates(c.sold.cracked) + ' cracked' : '')) +
      (c.returnRecorded ? kv('Returned', crates(c.returned.good)) : '') +
      kv('With me now', crates(c.remaining.good) + (c.remaining.cracked ? ' + ' + crates(c.remaining.cracked) + ' cracked' : ''), 'bold') + '</div>';
    out += callCard(t);
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
      var a = C.flockAge(s, f, t), dt = C.dayTotal(s, f.id, t), rec = dt.count ? dt : null;
      var next = openTasks().filter(function (x) { return x.flockId === f.id || (x.coops || []).indexOf(c) >= 0; })[0];
      var nk = next ? C.taskStatus(next, t) : '';
      return '<a class="card stack" style="text-decoration:none;color:inherit;gap:6px" href="#coop/' + f.id + '"><div class="row between"><h2>Coop ' + c + '</h2>' + stageChip(a.stage) + '</div>' +
        '<div class="small muted">' + C.birdsAlive(s, f, t).toLocaleString() + ' birds · week ' + a.week + (twoColours() ? ' · ' + C.flockColours(s, f, t).map(colWord).join(' + ').toLowerCase() + ' eggs' : '') + '</div>' +
        '<div class="row between small"><span class="muted">Today</span><b class="' + (rec ? '' : 'red') + '">' + (rec ? crates(rec.total) + (rec.count > 1 ? ' · ' + rec.count + ' collections' : '') : 'No record') + '</b></div>' +
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
    var feedKg = recs.reduce(function (z, x) { return z + C.feedKgOf(s, x); }, 0);
    var set = C.settingsOf(s), w = a.week;
    var sub = f.startedAsExisting ? esc(f.breed || '') + ' · added at week ' + f.addedAtWeek + ' with ' + C.int(f.chicks).toLocaleString() + ' birds on ' + dLong(f.addedOn)
      : esc(f.breed || '') + ' · ' + C.int(f.chicks).toLocaleString() + ' day-old chicks · arrived ' + dLong(f.arrival);
    var out = back('coops', 'All coops') + head('Coop ' + f.coop + ' · Week ' + a.week, sub,
      '<div class="row">' + (isRole('owner') ? '<a class="btn light sm" href="#flock-edit/' + f.id + '">Edit age / stage / colour</a>' : '') +
      (f.status === 'active' && isRole('owner', 'manager') ? '<a class="btn light sm" href="#move-birds/' + f.id + '">Move birds</a>' : '') +
      (f.status === 'active' && isRole('owner', 'manager', 'farmhand') ? '<a class="btn gold" href="#daily/' + f.id + '">' + (C.dayTotal(s, f.id, t).count ? '+ Another collection today' : 'Today’s record') + '</a>' : '') + '</div>');
    out += '<div class="card stack" style="gap:6px"><div class="stagebar"><span class="on"></span><span class="' + (w > set.broodingToWeek ? 'on' : '') + '"></span><span class="' + (w > set.growerToWeek ? 'on' : '') + '"></span><span class="' + (w > set.preLayToWeek ? 'on' : '') + '"></span></div>' +
      '<div class="stagebar tiny muted"><div>Brood</div><div>Growing (wk ' + (set.broodingToWeek + 1) + '–' + set.growerToWeek + ')</div><div>Pre-lay</div><div class="bold">Laying</div></div><div>' + stageChip(a.stage) + ' <span class="small muted">day ' + a.day + '</span></div></div>';
    out += '<div class="small" style="margin-top:8px">' + C.flockColours(s, f, t).map(colChip).join(' ') + ' <span class="muted">egg layers</span></div>' + (twoColours() ? info('colour') : '');
    out += '<div class="grid g2 g4-md" style="margin-top:12px">' + kpiBox('Alive', birds.toLocaleString(), '') +
      kpiBox('Died / culled', deaths.toLocaleString(), (f.chicks ? (Math.round(deaths / f.chicks * 1000) / 10) : 0) + '% of chicks') +
      kpiBox('Feed eaten', Math.round(feedKg).toLocaleString() + ' kg', Math.round(feedKg / set.kgPerBag) + ' bags') +
      kpiBox('Eggs so far', crates(eggs), recs.length + ' records') + '</div>' + info('coop');
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
      (f.startedAsExisting ? tlRow('Wk ' + f.addedAtWeek, 'Added to the app · ' + C.int(f.chicks).toLocaleString() + ' birds', 'done', '✓', dShort(f.addedOn)) : tlRow('Day 1', 'Arrived · ' + C.int(f.chicks).toLocaleString() + ' chicks', 'done', '✓', dShort(f.arrival))) +
      shown.map(function (x) {
        var k = C.taskStatus(x, t), day = C.dayDiff(f.arrival, x.date) + 1;
        var lbl = day <= 49 ? 'Day ' + day : 'Wk ' + Math.ceil(day / 7);
        var stt = k === 'done' ? '✓ Done' : k === 'overdue' ? 'Overdue' : k === 'today' ? 'Today' : dShort(x.date);
        return tlRow(lbl, '<a href="#task/' + x.id + '" style="color:inherit;text-decoration:none">' + esc(x.title) + '</a>', k === 'done' ? 'done' : k === 'overdue' ? 'over' : '', stt, '', k === 'overdue' ? 'red' : k === 'done' ? 'greenx' : 'muted');
      }).join('') + '</div>' +
      (isRole('owner', 'manager') ? '<a class="btn light sm" href="#task-new/coop/' + f.coop + '">+ Add task for Coop ' + f.coop + '</a>' : '') + '</div>';
    out += coopActivity(s, f, all);
    // records
    var last = recs.slice(-14).reverse();
    out += '<div class="card" style="margin-top:12px"><h2>Recent daily records</h2>' + (last.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th>Eggs</th><th>Cracked</th><th>Lay %</th><th>Died</th><th>Feed</th>' + (isRole('owner') ? '<th></th>' : '') + '</tr></thead><tbody>' +
      last.map(function (x) {
        var e = C.dailyEggs(s, x);
        return '<tr><td>' + dShort(x.date) + '</td><td>' + crates(e.good) + '</td><td>' + e.cracked + '</td><td>' + C.layRate(s, x) + '%</td><td>' + (C.int(x.deaths) + C.int(x.culls)) + '</td><td>' + (Math.round(C.feedKgOf(s, x) * 10) / 10) + ' kg</td>' +
          (isRole('owner') ? '<td><a href="#daily-edit/' + x.id + '">Edit</a></td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">No records yet</div>') + '</div>';
    if (isRole('owner') && f.status === 'active') out += '<a class="btn light block" style="margin-top:12px" href="#flock-close/' + f.id + '">Close this flock (all birds sold)</a>';
    return out;
  };
  // Everything that happened in this coop, day by day: eggs, deaths, feed, tasks done, medicine, hens sold.
  function coopActivity(s, f, all) {
    var days = {};
    function d(date) { return days[date] || (days[date] = []); }
    live(s.daily).forEach(function (x) {
      if (x.flockId !== f.id) return;
      var e = C.dailyEggs(s, x), bits = ['<b>' + crates(e.good) + '</b> good eggs', e.cracked + ' cracked', C.layRate(s, x) + '% lay (whole day)'];
      if (C.int(x.deaths)) bits.push('<span class="red">' + x.deaths + ' died</span>');
      if (C.int(x.culls)) bits.push(x.culls + ' culled');
      if (C.feedKgOf(s, x)) bits.push((Math.round(C.feedKgOf(s, x) * 10) / 10) + ' kg ' + esc((item(x.feedItemId) || {}).name || 'feed'));
      if (num(x.water)) bits.push(num(x.water) + ' L water');
      var sameDay = C.dayRecords(s, f.id, x.date), nth = C.sortChrono(sameDay).map(function (y) { return y.id; }).indexOf(x.id) + 1;
      d(x.date).push([sameDay.length > 1 ? 'Collection ' + nth : 'Daily record', bits.join(' · ') + (x.notes ? '<div class="tiny muted">“' + esc(x.notes) + '” — ' + esc(userName(x.by)) + '</div>' : '<span class="tiny muted"> — ' + esc(userName(x.by)) + '</span>')]);
    });
    live(s.tasks).forEach(function (x) {
      if (x.status === 'open' || !x.doneAt || x.doneNote === 'Before the app was used') return;
      if (x.flockId !== f.id && (x.coops || []).indexOf(C.int(f.coop)) < 0 && (x.coops || []).length) return;
      if (x.doneAt < f.arrival) return;
      d(x.doneAt).push([x.kind === 'Emergency' ? 'Emergency' : 'Task done', chipFor(x.kind) + ' ' + esc(x.title) + ' <span class="tiny muted">— ' + esc(userName(x.doneBy)) + (x.doneNote ? ': ' + esc(x.doneNote) : '') + '</span>']);
    });
    live(s.tasks).forEach(function (x) {
      if (x.kind !== 'Emergency' || (x.coops || []).indexOf(C.int(f.coop)) < 0 || x.date < f.arrival) return;
      d(x.date).push(['Emergency reported', '<span class="red">' + esc(x.title) + '</span> <span class="tiny muted">— ' + esc(userName(x.by)) + '</span>']);
    });
    live(s.med).forEach(function (m) {
      if (m.kind !== 'use' || m.flockId !== f.id) return;
      var it = item(m.itemId) || {};
      d(m.date).push(['Medicine', num(m.qty) + ' ' + esc(it.unit || '') + ' ' + esc(it.name || '') + (m.note ? ' <span class="tiny muted">' + esc(m.note) + '</span>' : '')]);
    });
    live(s.sales).forEach(function (x) {
      (x.items || []).forEach(function (it) { if (it.flockId === f.id) d(x.date).push(['Hens sold', it.qty + ' spent hens to ' + esc((cust(x.customerId) || {}).name || '')]); });
    });
    var dates = Object.keys(days).sort().reverse(), shown = all ? dates : dates.slice(0, 10);
    return '<div class="card" style="margin-top:12px"><div class="row between"><h2>Daily activities</h2>' + (dates.length > 10 && !all ? '<a class="small" href="#coop/' + f.id + '/all">Show all ' + dates.length + ' days</a>' : '') + '</div>' +
      (shown.length ? shown.map(function (date) {
        return '<div style="padding:10px 0;border-bottom:1px solid #F0ECE1"><div class="bold small">' + dLong(date) + '</div>' + days[date].map(function (e) {
          return '<div class="small" style="margin-top:4px"><span class="chip" style="margin-right:6px">' + esc(e[0]) + '</span>' + e[1] + '</div>';
        }).join('') + '</div>';
      }).join('') : '<div class="empty">Nothing recorded yet for this coop.</div>') + '</div>';
  }
  function tlRow(w, text, dot, status, sub, cls) {
    return '<div class="tl"><div class="w">' + esc(w) + '</div><div class="dot"><i class="' + dot + '"></i></div><div class="x">' + text + (sub ? ' <span class="tiny muted">' + esc(sub) + '</span>' : '') + '</div><div class="st ' + (cls || 'greenx') + '">' + esc(status) + '</div></div>';
  }

  // ---------- new flock (day-old chicks, or birds already on the farm at any week)
  var STAGES = ['Brooding', 'Growing', 'Pre-lay', 'Laying', 'Old lay'];
  function stageSelect(name, v) {
    return '<label>Stage<select name="' + name + '">' + opt('', 'Work it out from the age (recommended)', v || '') + STAGES.map(function (x) { return opt(x, x, v); }).join('') + '</select></label>';
  }
  routes['flock-new'] = function (coop) {
    var s = st(), t = today();
    var free = coops().filter(function (c) { return !C.flockInCoop(s, c, t); });
    if (!free.length) return back('coops', 'Coops') + '<div class="empty">All ' + coops().length + ' coops have a flock. Close a flock first, or add more coops in Settings › Farm details.</div>';
    return back('coops', 'Coops') + head('Add a flock', 'The vaccination, deworming and debeaking schedule is created from its age.') +
      '<form class="card" data-form="flock"><label>Coop<select name="coop" required>' + free.map(function (c) { return opt(c, 'Coop ' + c, coop); }).join('') + '</select></label>' +
      '<label>These birds are<select name="mode">' + opt('new', 'New day-old chicks arriving') + opt('existing', 'Already on the farm (I know their age)') + '</select></label>' +
      '<div id="fNew" class="stack" style="gap:14px"><div class="grid g2"><label>Day-old chicks received<input name="chicks" type="number" inputmode="numeric" min="1"></label>' +
        '<label>Arrival date<input name="arrival" type="date" value="' + t + '"></label></div></div>' +
      '<div id="fOld" class="stack" style="gap:14px" hidden><div class="grid g2"><label>Birds in the coop now<input name="birdsNow" type="number" inputmode="numeric" min="1"></label>' +
        '<label>Age today (weeks)<input name="weeksNow" type="number" inputmode="numeric" min="1" max="120" placeholder="e.g. 30"></label></div>' +
        '<label>Day of that week (1–7, optional)<input name="dayOfWeek" type="number" inputmode="numeric" min="1" max="7" value="1"></label></div>' +
      stageSelect('stageOverride', '') +
      '<div id="flockLive" class="alert ok small"></div>' +
      '<label>Egg colour<br>' + colourSelect('colour') + '</label>' +
      '<div class="grid g2"><label>Breed<input name="breed" placeholder="e.g. Isa Brown"></label><label>Cost per bird (GH₵)<input name="costPerChick" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<label>Supplier<input name="supplier"></label><button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  function readFlock(f) {
    var t = today(), mode = val(f, 'mode'), existing = mode === 'existing';
    var rec = { type: 'flocks', coop: C.int(val(f, 'coop')), breed: val(f, 'breed').trim(), costPerChick: num(val(f, 'costPerChick')),
      supplier: val(f, 'supplier').trim(), status: 'active', stageOverride: val(f, 'stageOverride'), colour: val(f, 'colour') || C.defaultColour(st()) };
    if (existing) {
      var w = C.int(val(f, 'weeksNow')), d = Math.min(7, Math.max(1, C.int(val(f, 'dayOfWeek')) || 1));
      rec.chicks = C.int(val(f, 'birdsNow'));
      rec.arrival = w > 0 ? C.addDays(t, -((w - 1) * 7 + d - 1)) : '';
      rec.addedOn = t; rec.addedAtWeek = w; rec.startedAsExisting = true;
    } else { rec.chicks = C.int(val(f, 'chicks')); rec.arrival = val(f, 'arrival'); }
    return rec;
  }
  LIVE.flock = function (f) {
    var existing = val(f, 'mode') === 'existing';
    document.getElementById('fNew').hidden = existing; document.getElementById('fOld').hidden = !existing;
    var r = readFlock(f), box = document.getElementById('flockLive');
    if (!r.arrival) { box.textContent = existing ? 'Type how many weeks old the birds are today.' : ''; return; }
    var a = C.flockAge(st(), r, today());
    box.innerHTML = 'Today they are <b>week ' + a.week + '</b> (day ' + a.day + ') — stage <b>' + esc(a.stage) + '</b>' + (existing ? '. Counted as if they arrived on ' + dLong(r.arrival) + '.' : '.');
  };
  FORMS.flock = function (f) {
    var s = st(), t = today(), rec = readFlock(f);
    rec.id = E.uid();
    var errors = [], warnings = [];
    if (!rec.coop) errors.push('Choose a coop.');
    if (!rec.arrival) errors.push(rec.startedAsExisting ? 'Type the age in weeks.' : 'Choose the arrival date.');
    else if (C.flockInCoop(s, rec.coop, t)) errors.push('Coop ' + rec.coop + ' already has an active flock.');
    if (!(rec.chicks > 0)) errors.push(rec.startedAsExisting ? 'Type how many birds are in the coop now.' : 'Enter the number of chicks.');
    if (!rec.startedAsExisting && rec.arrival > t) warnings.push('Arrival date is in the future.');
    if (!rec.costPerChick) warnings.push('No cost per bird — the flock’s whole-life profit will not include what the birds cost.');
    var tasks = rec.arrival ? C.generateFlockTasks(rec, s.template, E.uid) : [];
    var past = tasks.filter(function (x) { return x.date < t; });
    var future = tasks.filter(function (x) { return x.date >= t; }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (!s.template.length) warnings.push('Your vaccination schedule is empty, so no health tasks will be created.');
    if (past.length) warnings.push(past.length + ' schedule steps are already in the past. They will be marked "done before the app" — check with your manager they were really done.');
    var a = rec.arrival ? C.flockAge(s, rec, t) : { week: '', stage: '' };
    preview({ title: 'New flock in Coop ' + rec.coop, rows: [[rec.startedAsExisting ? 'Birds now' : 'Chicks', (rec.chicks || 0).toLocaleString()],
      [rec.startedAsExisting ? 'Counted from' : 'Arrival', rec.arrival ? dLong(rec.arrival) : '—'], ['Age today', 'week ' + a.week], ['Stage', esc(a.stage) + (rec.stageOverride ? ' (set by hand)' : '')], ['Breed', esc(rec.breed || '—')],
      ['Cost of birds', rec.costPerChick ? cur(Math.round(rec.chicks * rec.costPerChick * 100)) : '—'], ['Health tasks ahead', future.length]],
      extra: '<div class="card small">' + future.slice(0, 6).map(function (x) { return kv(dShort(x.date), esc(x.title)); }).join('') + (future.length > 6 ? '<div class="tiny muted">…and ' + (future.length - 6) + ' more</div>' : '') + '</div>',
      errors: errors, warnings: warnings,
      onConfirm: async function () {
        tasks.forEach(function (x) { x.type = 'tasks'; if (x.date < t) { x.status = 'done'; x.doneNote = 'Before the app was used'; x.doneAt = t; } });
        await E.save([rec].concat(tasks)); return 'coop/' + rec.id;
      } });
  };
  // ---------- owner: change a flock's age, stage, numbers
  routes['flock-edit'] = function (id) {
    var f = flock(id), t = today(); if (!f) return '';
    var a = C.flockAge(st(), f, t);
    return back('coop/' + id, 'Coop ' + f.coop) + head('Edit Coop ' + f.coop + ' flock', 'Today: week ' + a.week + ', day ' + a.day) +
      '<form class="card" data-form="flockedit" data-id="' + esc(id) + '"><div class="grid g2"><label>Age today (weeks)<input name="weeksNow" type="number" min="1" max="120" inputmode="numeric" value="' + a.week + '"></label>' +
      '<label>Day of that week (1–7)<input name="dayOfWeek" type="number" min="1" max="7" inputmode="numeric" value="' + (((a.day - 1) % 7) + 1) + '"></label></div>' +
      stageSelect('stageOverride', f.stageOverride || '') +
      '<div class="grid g2"><label>' + (f.startedAsExisting ? 'Birds when added' : 'Day-old chicks received') + '<input name="chicks" type="number" min="1" inputmode="numeric" value="' + esc(f.chicks) + '"></label>' +
      '<label>Cost per bird (GH₵)<input name="costPerChick" type="number" step="0.01" min="0" inputmode="decimal" value="' + esc(f.costPerChick || '') + '"></label></div>' +
      '<label>Egg colour<br>' + colourSelect('colour', C.flockColour(st(), f)) + '</label>' +
      '<div class="grid g2"><label>Breed<input name="breed" value="' + esc(f.breed || '') + '"></label><label>Supplier<input name="supplier" value="' + esc(f.supplier || '') + '"></label></div>' +
      '<p class="tiny muted">Deaths and hens sold are subtracted from the starting number automatically. Tasks already made keep their dates.</p>' +
      '<button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.flockedit = function (f) {
    var old = flock(f.dataset.id), t = today(), w = C.int(val(f, 'weeksNow')), d = Math.min(7, Math.max(1, C.int(val(f, 'dayOfWeek')) || 1));
    var up = Object.assign({}, old, { arrival: w > 0 ? C.addDays(t, -((w - 1) * 7 + d - 1)) : old.arrival, stageOverride: val(f, 'stageOverride'),
      chicks: C.int(val(f, 'chicks')), costPerChick: num(val(f, 'costPerChick')), breed: val(f, 'breed').trim(), supplier: val(f, 'supplier').trim(), colour: val(f, 'colour') || C.flockColour(st(), old) });
    var a = C.flockAge(st(), up, t), birds = C.birdsAlive(st(), up, t), errors = [];
    if (!(w > 0)) errors.push('Type the age in weeks.');
    if (!(up.chicks > 0) && !(birds > 0)) errors.push('Type the number of birds.');
    if (birds < 0) errors.push('Deaths and sales already recorded are more than ' + up.chicks + ' birds.');
    preview({ title: 'Update Coop ' + old.coop + ' flock', errors: errors,
      rows: [['Age today', 'week ' + a.week + ' (was week ' + C.flockAge(st(), old, t).week + ')'], ['Stage', esc(a.stage) + (up.stageOverride ? ' (set by hand)' : ' (from age)')],
        ['Birds alive now', birds.toLocaleString()], ['Breed', esc(up.breed || '—')]],
      onConfirm: async function () { await E.save(up); return 'coop/' + up.id; } });
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
    var r = rec ? Object.assign({}, rec) : { date: t, feedItemId: lastFeed ? lastFeed.feedItemId : '' };
    if (rec && (rec.feedKg === undefined || rec.feedKg === '') && num(rec.feedBags)) r.feedKg = C.feedKgOf(s, rec);   // old record in bags
    var fl0 = flock(fid), split = rec ? !!rec.split : (fl0 ? C.flockColours(s, fl0, t).length > 1 : false);
    var feeds = live(s.items).filter(function (i) { return i.category === 'feed' && i.active !== false; });
    function n(name, label, mode, step) { return '<label>' + label + '<input name="' + name + '" type="number" min="0" step="' + (step || 1) + '" inputmode="' + (mode || 'numeric') + '" value="' + esc(r[name] === undefined ? '' : r[name]) + '"></label>'; }
    return back(fid ? 'coop/' + fid : 'coops', 'Coop') + head(rec ? 'Edit daily record' : 'Daily record', 'Step 1 of 2 · fill in, then preview') +
      '<form class="card" data-form="daily"' + (rec ? ' data-id="' + esc(rec.id) + '"' : '') + '>' +
      '<div class="grid g2"><label>Coop<select name="flockId"' + (rec ? '' : ' data-act-change="dailyCoop"') + '>' + flocks.map(function (f) { return opt(f.id, 'Coop ' + f.coop + ' · ' + C.flockAge(s, f, t).stage, fid); }).join('') + '</select></label>' +
      '<label>Date<input type="date" name="date" value="' + esc(r.date) + '" max="' + t + '" required></label></div>' +
      (split ? '<h3>White eggs</h3><div class="grid g3">' + n('whiteCrates', 'Good · crates') + n('whitePieces', '+ loose pieces') + n('whiteCracked', 'Cracked (pieces)') + '</div>' +
        '<h3>Brown eggs</h3><div class="grid g3">' + n('brownCrates', 'Good · crates') + n('brownPieces', '+ loose pieces') + n('brownCracked', 'Cracked (pieces)') + '</div><input type="hidden" name="split" value="1">'
        : '<h3>Eggs collected' + (twoColours() ? ' · ' + colWord(C.flockColour(s, flock(fid))).toLowerCase() : '') + '</h3><div class="grid g3">' + n('goodCrates', 'Good · crates') + n('goodPieces', '+ loose pieces') + n('cracked', 'Cracked (pieces)') + '</div>') +
      '<div class="alert warn small" id="dailyBefore" hidden></div><div class="alert ok small" id="dailyLive">Lay rate will show here</div>' + info('lay') +
      '<h3>Birds</h3><div class="grid g2">' + n('deaths', 'Dead birds') + n('culls', 'Culled / removed') + '</div>' +
      '<h3>Feed &amp; water</h3><div class="grid g2"><label>Feed type' + feedSelect('feedItemId', feeds, r.feedItemId) + '</label>' +
      n('feedKg', 'Feed used (kg)', 'decimal', 'any') + '</div><div class="tiny muted" id="feedLive" style="margin:-4px 0 8px">Type the kg of feed given to this coop.</div>' + info('feedkg') + n('water', 'Water (litres)', 'decimal', 'any') +
      '<label>Notes (sick birds, drugs given…)<textarea name="notes">' + esc(r.notes || '') + '</textarea></label>' +
      '<div class="sticky-actions"><button class="btn block" type="submit">Next: preview →</button></div></form>';
  }
  ACT.dailyCoop = function (el) { go('daily/' + el.value); };
  function readDaily(f) {
    var fl = flock(val(f, 'flockId')), split = val(f, 'split') === '1', epc = C.settingsOf(st()).eggsPerCrate;
    var sp = {};
    if (split) {
      ['whiteCrates', 'whitePieces', 'whiteCracked', 'brownCrates', 'brownPieces', 'brownCracked'].forEach(function (k) { sp[k] = C.int(val(f, k)); });
      var good = (sp.whiteCrates + sp.brownCrates) * epc + sp.whitePieces + sp.brownPieces;   // totals kept too, for the Sheet
      sp.split = true; sp.goodCrates = Math.floor(good / epc); sp.goodPieces = good % epc; sp.cracked = sp.whiteCracked + sp.brownCracked;
    }
    return Object.assign({ id: f.dataset.id || undefined, type: 'daily', flockId: val(f, 'flockId'), coop: fl ? fl.coop : '', date: val(f, 'date'), today: today(),
      goodCrates: C.int(val(f, 'goodCrates')), goodPieces: C.int(val(f, 'goodPieces')), cracked: C.int(val(f, 'cracked')),
      deaths: C.int(val(f, 'deaths')), culls: C.int(val(f, 'culls')), feedItemId: val(f, 'feedItemId'), feedKg: num(val(f, 'feedKg')),
      water: num(val(f, 'water')), notes: val(f, 'notes').trim() }, sp);
  }
  LIVE.daily = function (f) {
    var d = readDaily(f), fl = flock(d.flockId), box = document.getElementById('dailyLive'); if (!box || !fl) return;
    var birds = C.birdsAtStartOf(st(), fl, d.date), e = C.dailyEggs(st(), d), before = C.dayTotal(st(), d.flockId, d.date, d.id), bx = document.getElementById('dailyBefore');
    if (bx) { bx.hidden = !before.count; bx.textContent = before.count ? 'Coop ' + fl.coop + ' already has ' + before.count + ' collection(s) on this day: ' + crates(before.total) + '. This one will be collection ' + (before.count + 1) + ' and is added to the day.' : ''; }
    var all = before.total + e.total;
    box.textContent = e.total ? ((before.count ? 'Day total ' : 'Total ') + crates(all) + ' (' + all + ' eggs) from ' + birds.toLocaleString() + ' birds = ' + (birds ? Math.round(all / birds * 1000) / 10 : 0) + '% lay rate') : 'Lay rate will show here';
    var fl2 = document.getElementById('feedLive'), kg = d.feedKg, bagKg = C.settingsOf(st()).kgPerBag;
    if (fl2) fl2.textContent = kg > 0 ? kg + ' kg = ' + (Math.round(kg / bagKg * 100) / 100) + ' bags of ' + bagKg + ' kg' + (birds ? ' · ' + Math.round((before.feedKg + kg) / birds * 1000) + ' g per bird' + (before.count ? ' today' : '') : '') : 'Type the kg of feed given to this coop.';
  };
  // Feed type list: our own mixes (recipes) first, then bought feed.
  function feedSelect(name, feeds, selected) {
    var s = st(), own = feeds.filter(function (i) { return C.isOwnMix(s, i.id); }), bought = feeds.filter(function (i) { return !C.isOwnMix(s, i.id); });
    var g = function (label, list) { return list.length ? '<optgroup label="' + label + '">' + list.map(function (i) { return opt(i.id, i.name, selected); }).join('') + '</optgroup>' : ''; };
    return '<select name="' + name + '"><option value="">— choose —</option>' + g('Our mixes (recipes)', own) + g('Bought feed', bought) + '</select>';
  }
  FORMS.daily = function (f) {
    var d = readDaily(f), v = C.validateDaily(st(), d), fl = flock(d.flockId);
    if (d.feedItemId && d.feedKg > 0 && !d.id) {
      var fsx = C.feedState(st()).items[d.feedItemId];
      if (fsx && fsx.tracked && d.feedKg > fsx.kg + 1e-9) v.warnings.push('The feed store shows only ' + fsx.kg + ' kg of ' + item(d.feedItemId).name + '. Record the feed bought or mixed first, so its cost is counted correctly.');
    }
    var feedTxt = d.feedKg ? d.feedKg + ' kg · ' + esc((item(d.feedItemId) || {}).name || '') + (v.gramsPerBird ? ' (' + v.gramsPerBird + ' g per bird' + (v.round > 1 ? ' today' : '') + ')' : '') : '—';
    preview({ title: 'Coop ' + (fl ? fl.coop : '') + ' · ' + dLong(d.date) + (v.round > 1 ? ' · collection ' + v.round : ''), errors: v.errors, warnings: v.warnings,
      rows: (d.split ? [['White eggs', d.whiteCrates + ' crates + ' + d.whitePieces + ' pieces · ' + d.whiteCracked + ' cracked'], ['Brown eggs', d.brownCrates + ' crates + ' + d.brownPieces + ' pieces · ' + d.brownCracked + ' cracked']]
        : [['Good eggs' + (twoColours() && fl ? ' (' + C.flockColour(st(), fl) + ')' : ''), d.goodCrates + ' crates + ' + d.goodPieces + ' pieces'], ['Cracked eggs', d.cracked + ' pieces']]).concat([['Total', crates(v.eggs ? v.eggs.total : 0)]])
        .concat(v.round > 1 ? [['Day total (all collections)', crates(v.dayEggs)]] : []).concat([
        ['Lay rate' + (v.round > 1 ? ' (whole day)' : ''), (v.layRate || 0) + '%'], ['Dead / culled', d.deaths + ' / ' + d.culls + (v.birdsAfter !== undefined ? ' (birds now ' + v.birdsAfter + ')' : '')],
        ['Feed', feedTxt], ['Water', d.water ? d.water + ' L' : '—'], ['Notes', esc(d.notes || '—')]]),
      extra: '<p class="tiny muted">After saving, only the owner can change this record. Every change is logged.</p>',
      onConfirm: async function () {
        delete d.today;
        if (d.id) { var old = byId(st().daily, d.id); d = Object.assign({}, old, d); delete d.feedBags; } else delete d.id;
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
      '<div class="sub">' + esc(whereText(x)) + (x.time ? ' · ⏰ ' + esc(x.time) : '') + (x.assignee ? ' · ' + esc(userName(x.assignee)) : '') + (x.repeat && x.repeat !== 'once' ? ' · repeats' : '') + '</div></div></a>';
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
      (x.assignee ? kv('Assigned to', esc(userName(x.assignee))) : '') + (x.repeat && x.repeat !== 'once' ? kv('Repeats', esc(C.repeatText(x.repeat))) : '') + (x.seriesId ? kv('Series', esc(x.seriesRule || '') + ' · task ' + x.seriesNo + ' of ' + x.seriesOf) : '') +
      (x.kind !== 'Emergency' ? kv('Alarm', esc(x.time || pad(C.alarmSettings(st()).hour) + ':00') + alarmBeforeText()) : '') +
      kv('Added by', esc(userName(x.by) || 'Schedule')) + (x.notes ? kv('Notes', esc(x.notes)) : '') +
      (x.status !== 'open' ? kv('Done', esc(dShort(x.doneAt)) + ' by ' + esc(userName(x.doneBy))) + (x.doneNote ? kv('Note', esc(x.doneNote)) : '') : '') + '</div>';
    if (x.kind === 'Emergency' && x.status === 'open') {
      var owp = setting('ownerWhatsapp', '');
      var text = 'EMERGENCY at ' + farmName() + ' (' + whereText(x) + '): ' + x.title + (x.notes ? '\n' + x.notes : '') + '\nReported by ' + userName(x.by);
      if (owp && !isRole('owner')) out += '<a class="btn wa block" style="margin-top:12px" target="_blank" rel="noopener" href="' + esc(waLink(owp, text)) + '">Send WhatsApp alert to the owner</a>';
      out += '<p class="tiny muted">The owner also gets an email and a phone alarm as soon as this phone syncs.</p>';
    }
    var ownerTicks = String(setting('tasksDoneBy', 'all')).toLowerCase() === 'owner';
    if (x.status === 'open' && ownerTicks && !isRole('owner')) out += '<div class="alert ok small" style="margin-top:12px">When this is done, tell the owner — only the owner ticks tasks done on this farm.</div>';
    if (x.status === 'open' && (!ownerTicks || isRole('owner')) && (x.kind !== 'Emergency' || isRole('owner', 'manager'))) {
      var health = GROUPS.health.indexOf(x.kind) >= 0 || x.kind === 'Disinfection';
      var meds = live(st().items).filter(function (i) { return i.category === 'medicine' && i.active !== false; });
      out += '<form class="card" data-form="taskdone" data-id="' + esc(x.id) + '" style="margin-top:12px"><h2>' + (x.kind === 'Emergency' ? 'Mark as handled' : 'Mark as done') + '</h2>' +
        (health && isRole('owner', 'manager', 'farmhand') ? '<div class="grid g2"><label>Medicine / vaccine used<select name="medItemId"><option value="">— none —</option>' + meds.map(function (i) { return opt(i.id, i.name); }).join('') + '</select></label>' +
          '<label>Quantity used<input name="medQty" type="number" min="0" step="any" inputmode="decimal"></label></div>' : '') +
        '<label>Date done<input type="date" name="doneAt" value="' + t + '" max="' + t + '"></label><label>Note<input name="note" placeholder="optional"></label>' +
        '<button class="btn" type="submit">Next: preview →</button></form>';
    }
    if (x.status === 'open' && x.kind !== 'Emergency' && isRole('owner', 'manager'))
      out += '<form class="card row" data-form="tasktime" data-id="' + esc(x.id) + '" style="margin-top:12px;gap:8px;align-items:flex-end"><label class="grow">⏰ Change alarm time<input type="time" name="time" value="' + esc(x.time || pad(C.alarmSettings(st()).hour) + ':00') + '"></label><button class="btn light" type="submit">Save time</button></form>';
    if (isRole('owner') && x.seriesId && x.status === 'open') out += '<button class="btn light block" style="margin-top:12px" type="button" data-act="stopSeries" data-id="' + esc(x.id) + '">Stop the rest of this series (from ' + dShort(x.date) + ')</button>';
    if (isRole('owner')) out += '<button class="btn light block" style="margin-top:12px" type="button" data-act="deleteTask" data-id="' + esc(x.id) + '">Delete this task</button>';
    return out;
  };
  FORMS.tasktime = function (f) {
    var x = byId(st().tasks, f.dataset.id), tm = val(f, 'time');
    preview({ title: 'Alarm time · ' + x.title, errors: /^\d{2}:\d{2}$/.test(tm) ? [] : ['Choose a time.'],
      rows: [['Task', esc(x.title)], ['Date', dLong(x.date)], ['Alarm', esc(tm) + alarmBeforeText()]],
      onConfirm: async function () { await E.save(Object.assign({}, x, { time: tm })); return 'task/' + x.id; } });
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
        if (nxt) recs.push({ type: 'tasks', kind: x.kind, title: x.title, coops: x.coops || [], flockId: x.flockId, date: nxt, repeat: x.repeat, assignee: x.assignee || '', notes: x.notes || '', status: 'open', time: x.time || '' });
        await E.save(recs); return 'tasks';
      } });
  };
  ACT.deleteTask = function (b) {
    var x = byId(st().tasks, b.dataset.id);
    preview({ title: 'Delete task', rows: [['Task', esc(x.title)], ['Date', dLong(x.date)]], confirm: 'Delete', warnings: ['This removes the task and its calendar alarm.'],
      onConfirm: async function () { await E.save(Object.assign({}, x, { deleted: true, deletedAt: Date.now(), deletedBy: me().id })); return 'tasks'; } });
  };
  // a series made ahead (e.g. vitamins every day for 5 days): stop this one and all later open ones
  ACT.stopSeries = function (b) {
    var x = byId(st().tasks, b.dataset.id);
    var rest = live(st().tasks).filter(function (t) { return t.seriesId === x.seriesId && t.status === 'open' && t.date >= x.date; }).sort(function (a, c) { return a.date < c.date ? -1 : 1; });
    preview({ title: 'Stop the rest of this series', confirm: 'Stop ' + rest.length + ' task' + (rest.length === 1 ? '' : 's'), doneMessage: 'Stopped ✓ — the tasks are in the Bin for 30 days',
      warnings: ['Tasks already done stay in the records. You can bring the stopped ones back from Settings › Bin.'],
      rows: [['Task', esc(x.title)], ['Series', esc(x.seriesRule || '')], ['Will be stopped', rest.length + ' task' + (rest.length === 1 ? '' : 's') + ': ' + datesChips(rest.map(function (t) { return t.date; }), 20)]],
      onConfirm: async function () { var now = Date.now(); await E.save(rest.map(function (t) { return Object.assign({}, t, { deleted: true, deletedAt: now, deletedBy: me().id }); })); return 'tasks'; } });
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
      '<div class="grid g2"><label>Start date<input type="date" name="date" value="' + t + '" required></label><label>Alarm time<input type="time" name="time" value="' + pad(C.alarmSettings(s).hour) + ':00"></label></div>' +
      '<label>How often?<select name="how">' + opt('once', 'Once', 'once') + opt('repeat', 'Repeat every … days / weeks / months', 'once') + opt('dates', 'Pick my own dates', 'once') + '</select></label>' +
      '<div class="grid g2" data-show="repeat" hidden><label>Every<input name="everyN" type="number" step="1" inputmode="numeric" value="1"></label>' +
        '<label>&nbsp;<select name="unit">' + opt('days', 'day(s)', 'days') + opt('weeks', 'week(s)', 'days') + opt('months', 'month(s)', 'days') + '</select></label></div>' +
      '<div data-show="repeat" hidden><label>Ends<select name="endMode">' + opt('times', 'After a number of times', 'times') + opt('until', 'On a date', 'times') + opt('never', 'Never (next one appears when this is done)', 'times') + '</select></label>' +
        '<label data-show="times">How many times? <span class="tiny muted">(every day for 5 days = 5)</span><input name="endTimes" type="number" step="1" inputmode="numeric" value="5"></label>' +
        '<label data-show="until" hidden>Last date<input type="date" name="endDate"></label></div>' +
      '<div data-show="dates" hidden><div class="row" style="gap:8px;align-items:flex-end"><label class="grow">Add a date<input type="date" name="pickDate"></label><button class="btn light" type="button" data-act="addTaskDate">+ Add date</button></div>' +
        '<input type="hidden" name="dates" value=""><div class="pills" id="pickedDates" style="margin-top:6px"></div></div>' +
      '<div class="alert ok small" id="taskDates" aria-live="polite">One task on the start date.</div>' +
      '<label>Assign to<select name="assignee"><option value="">— anyone —</option>' + people.map(function (u) { return opt(u.id, u.name + ' (' + u.role + ')'); }).join('') + '</select></label>' +
      '<label>Notes<textarea name="notes"></textarea></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  // which dates the task form will create
  function taskPlan(f) {
    var how = val(f, 'how') || 'once', start = val(f, 'date');
    if (how === 'dates') {
      var ds = val(f, 'dates').split(',').filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).sort();
      return { how: how, dates: ds.filter(function (d, i) { return ds.indexOf(d) === i; }), repeat: 'once', text: 'On dates I picked' };
    }
    if (how !== 'repeat') return { how: 'once', dates: start ? [start] : [], repeat: 'once', text: 'Once' };
    var code = C.repeatCode(val(f, 'everyN'), val(f, 'unit')), mode = val(f, 'endMode');
    if (mode === 'never') return { how: how, dates: start ? [start] : [], repeat: code, text: C.repeatText(code) + ', no end', never: true };
    var end = mode === 'until' ? { until: val(f, 'endDate') } : { times: C.int(val(f, 'endTimes')) };
    return { how: how, dates: C.seriesDates(start, code, end, 120), repeat: code, mode: mode,
      text: C.repeatText(code) + (mode === 'until' ? ' until ' + (end.until ? dShort(end.until) + ' ' + end.until.slice(0, 4) : '…') : ', ' + (end.times || 0) + ' time' + (end.times === 1 ? '' : 's')) };
  }
  function datesChips(ds, max) {
    max = max || 14;
    return ds.slice(0, max).map(function (d) { return '<span class="pill" style="min-height:0;padding:4px 10px">' + dShort(d) + (d.slice(0, 4) !== today().slice(0, 4) ? ' ' + d.slice(0, 4) : '') + '</span>'; }).join(' ') + (ds.length > max ? ' <span class="small muted">… ' + ds.length + ' in all</span>' : '');
  }
  LIVE.task = function (f) {
    if (f.dataset.emergency === '1') return;
    var how = val(f, 'how') || 'once', mode = val(f, 'endMode');
    f.querySelectorAll('[data-show]').forEach(function (el) {
      var k = el.dataset.show;
      el.hidden = k === 'repeat' ? how !== 'repeat' : k === 'dates' ? how !== 'dates' : k === 'times' ? mode !== 'times' : k === 'until' ? mode !== 'until' : false;
    });
    var p = taskPlan(f), box = document.getElementById('taskDates'); if (!box) return;
    var chips = document.getElementById('pickedDates');
    if (chips) chips.innerHTML = val(f, 'dates').split(',').filter(Boolean).sort().map(function (d) { return '<span class="pill" style="min-height:0;padding:4px 10px">' + dShort(d) + ' <button type="button" data-act="removeTaskDate" data-d="' + d + '" aria-label="Remove ' + d + '" style="border:0;background:none;font-weight:800;cursor:pointer">✕</button></span>'; }).join(' ');
    if (p.never) { box.className = 'alert ok small'; box.innerHTML = '<b>' + esc(p.text) + '.</b> One task on ' + (p.dates[0] ? dShort(p.dates[0]) : 'the start date') + '; when it is ticked done, the next one appears ' + esc(C.repeatText(p.repeat).toLowerCase()) + ' later.'; return; }
    if (p.dates.length > 120) { box.className = 'alert err small'; box.innerHTML = '<b>Too many: more than 120 tasks.</b> Choose fewer times or an earlier last date, or choose “Never” to make one at a time.'; return; }
    box.className = 'alert ' + (p.dates.length ? 'ok' : 'warn') + ' small';
    box.innerHTML = p.dates.length ? '<b>This makes ' + p.dates.length + ' task' + (p.dates.length === 1 ? '' : 's') + ':</b><div style="margin-top:6px">' + datesChips(p.dates) + '</div>' + (p.dates.length > 1 ? '<div style="margin-top:6px">Each one has its own alarm and is ticked on its own day.</div>' : '') : 'No dates yet.';
  };
  ACT.addTaskDate = function (b) {
    var f = b.closest('form'), d = val(f, 'pickDate');
    if (!d) return toast('Choose a date first');
    var l = val(f, 'dates').split(',').filter(Boolean); if (l.indexOf(d) < 0) l.push(d);
    f.elements.dates.value = l.sort().join(','); f.elements.pickDate.value = ''; LIVE.task(f);
  };
  ACT.removeTaskDate = function (b) {
    var f = b.closest('form'); f.elements.dates.value = val(f, 'dates').split(',').filter(function (x) { return x && x !== b.dataset.d; }).join(','); LIVE.task(f);
  };
  FORMS.task = function (f) {
    var emergency = f.dataset.emergency === '1', t = today();
    var plan = emergency ? null : taskPlan(f);
    var sel = val(f, 'all') ? [] : coops().filter(function (c) { return val(f, 'c' + c); });
    var rec = { type: 'tasks', kind: emergency ? 'Emergency' : val(f, 'kind'), title: val(f, 'title').trim(), coops: sel, date: emergency ? t : val(f, 'date'),
      repeat: emergency ? 'once' : plan.repeat, assignee: emergency ? '' : val(f, 'assignee'), notes: val(f, 'notes').trim(), status: 'open' };
    if (!emergency && plan.dates.length) rec.date = plan.dates[0];
    if (!emergency && /^\d{2}:\d{2}$/.test(val(f, 'time'))) rec.time = val(f, 'time');
    if (sel.length === 1) { var fl = C.flockInCoop(st(), sel[0], rec.date); if (fl) rec.flockId = fl.id; }
    var errors = [], warnings = [];
    if (!rec.title) errors.push('Write what the task is.');
    if (!emergency && !rec.date) errors.push('Choose a date.');
    if (!emergency && rec.date < t) warnings.push('This date has already passed.');
    if (!val(f, 'all') && !sel.length) errors.push('Tick "Whole farm" or at least one coop.');
    var many = !emergency && !plan.never && plan.dates.length > 1;
    if (!emergency) {
      if (!plan.dates.length) errors.push(plan.how === 'dates' ? 'Add at least one date.' : plan.mode === 'until' ? 'Choose the last date (on or after the start date).' : 'Choose a start date.');
      if (plan.dates.length > 120) errors.push('More than 120 tasks. Choose fewer times or an earlier last date, or choose “Never”.');
      if (plan.how === 'dates' && plan.dates.some(function (d) { return d < t; })) warnings.push('Some dates have already passed.');
    }
    var recs = [rec];
    if (many) {
      var sid = 'ser-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      recs = plan.dates.map(function (d, i) {
        var r = Object.assign({}, rec, { date: d, repeat: 'once', seriesId: sid, seriesNo: i + 1, seriesOf: plan.dates.length, seriesRule: plan.text });
        if (r.coops.length === 1) { var fl2 = C.flockInCoop(st(), r.coops[0], d); if (fl2) r.flockId = fl2.id; else delete r.flockId; }
        return r;
      });
    }
    preview({ title: emergency ? 'Emergency report' : many ? 'New tasks (' + recs.length + ')' : 'New task', gold: false, errors: errors, warnings: warnings, confirm: emergency ? 'Send emergency' : 'Confirm & save',
      rows: [['Type', esc(rec.kind)], ['What', esc(rec.title)], ['Where', esc(whereText(rec))]].concat(emergency ? [] : [[many ? 'Dates' : 'Date', many ? datesChips(plan.dates, 30) : dLong(rec.date)], ['Alarm', esc(rec.time || pad(C.alarmSettings(st()).hour) + ':00') + alarmBeforeText()], ['How often', esc(plan.text)], ['Assigned to', esc(userName(rec.assignee) || 'Anyone')]]).concat(rec.notes ? [['Notes', esc(rec.notes)]] : []),
      onConfirm: async function () { var r = await E.save(recs); return many ? 'tasks' : 'task/' + r[0].id; } });
  };

  // ================================================================ SALES
  function custBalance(id) { return C.customerBalance(st(), id); }
  function sortedCustomers() { return live(st().customers).slice().sort(function (a, b) { return a.name.localeCompare(b.name); }); }
  routes['sale-new'] = function (customerId) {
    var s = st(), list = sortedCustomers();
    var pre = customerId || (list.filter(function (c) { return /walk/i.test(c.name); })[0] || {}).id || '';
    var prods = saleVariants();
    var flocks = C.activeFlocks(s, today());
    var out = back('home', 'Home') + head('New sale', 'Step 1 of 2 · then preview, then receipt');
    if (!list.length) return out + '<div class="card stack"><p>Add your first customer to start selling (you can add one called "Walk-in" for people who pay cash).</p><a class="btn gold" href="#customer-new">+ New customer</a></div>';
    out += '<form class="stack" data-form="sale">' +
      '<div class="card stack"><div class="row between"><h2>Customer</h2><a class="small" href="#customer-new">+ New customer</a></div><select name="customerId" aria-label="Customer">' +
      list.map(function (c) { var b = custBalance(c.id); return opt(c.id, c.name + (c.priceType === 'wholesale' ? ' · wholesale' : '') + (b > 0 ? ' · owes ' + cur(b) : ''), pre); }).join('') + '</select><div id="custInfo" class="small muted"></div></div>' +
      '<div class="card"><h2>Products</h2>' + prods.map(function (v) {
        var editable = isRole('owner'), p = v.p, k = v.key;
        return '<div class="prod" data-pid="' + esc(k) + '"><div><div class="bold">' + esc(p.name) + (v.colour && twoColours() ? ' ' + colChip(v.colour) : '') + '</div>' +
          (editable ? '<label class="tiny" style="flex-direction:row;align-items:center;gap:6px">GH₵<input name="price_' + esc(k) + '" type="number" step="0.01" min="0" inputmode="decimal" style="min-height:36px;max-width:110px"></label>'
            : '<div class="small muted">GH₵ <span data-price="' + esc(k) + '"></span> each</div><input type="hidden" name="price_' + esc(k) + '">') +
          (p.kind === 'hen' ? '<label class="tiny">From coop<select name="flock_' + esc(k) + '" style="min-height:36px">' + flocks.map(function (f) { return opt(f.id, 'Coop ' + f.coop + ' (' + C.birdsAlive(s, f, today()) + ' birds)'); }).join('') + '</select></label>' : '') +
          '</div><div class="qty"><button type="button" data-act="qty" data-d="-1" aria-label="Less ' + esc(v.label) + '">−</button><input name="qty_' + esc(k) + '" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="Quantity of ' + esc(v.label) + '"><button type="button" class="plus" data-act="qty" data-d="1" aria-label="More ' + esc(v.label) + '">+</button></div></div>';
      }).join('') + '</div>' +
      '<div class="card stack"><h2>Payment</h2><div class="grid g2"><label>Cash (GH₵)<input name="pay_Cash" type="number" step="0.01" min="0" inputmode="decimal"></label><label>MoMo (GH₵)<input name="pay_MoMo" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<div class="grid g2"><label>MoMo reference<input name="ref_MoMo" inputmode="numeric"></label><label>Bank transfer (GH₵)<input name="pay_Bank" type="number" step="0.01" min="0" inputmode="decimal"></label></div>' +
      '<div class="row"><button type="button" class="btn light sm" data-act="payAll" data-m="Cash">Paid all in cash</button><button type="button" class="btn light sm" data-act="payAll" data-m="MoMo">Paid all by MoMo</button></div>' +
      '<label>Note<input name="note"></label></div>' +
      '<div class="card totals" id="saleTotals"></div>' +
      '<div class="sticky-actions"><button class="btn gold block" type="submit">Next: preview sale →</button></div></form>';
    return out;
  };
  // products to sell: egg products once per colour in use, the rest once
  function saleVariants() {
    var cs = colours(), two = cs.length > 1, out = [];
    live(st().products).filter(function (p) { return p.active !== false; }).forEach(function (p) {
      if (p.kind === 'good' || p.kind === 'cracked') cs.forEach(function (c) { out.push({ key: p.id + '__' + c, p: p, colour: c, label: p.name + (two ? ' · ' + colWord(c) : '') }); });
      else out.push({ key: p.id, p: p, colour: '', label: p.name });
    });
    return out;
  }
  function readSale(f) {
    var s = st(), c = cust(val(f, 'customerId'));
    var items = [];
    saleVariants().forEach(function (v) {
      var p = v.p, q = C.int(val(f, 'qty_' + v.key)); if (!q) return;
      var price = val(f, 'price_' + v.key);
      var line = { productId: p.id, qty: q, price: price === '' ? C.priceFor(p, c, v.colour) : num(price) };
      if (v.colour) line.colour = v.colour;
      if (p.kind === 'hen') line.flockId = val(f, 'flock_' + v.key);
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
      saleVariants().forEach(function (v) {
        var inp = f.elements['price_' + v.key]; if (!inp) return;
        var pr = C.priceFor(v.p, c, v.colour); inp.value = pr ? pr.toFixed(2) : '';
        var span = f.querySelector('[data-price="' + v.key + '"]'); if (span) span.textContent = pr ? pr.toFixed(2) : 'not set';
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
      var fl = it.flockId ? flock(it.flockId) : null;
      return [it.qty + ' × ' + esc(lineName(it)) + (fl ? ' (Coop ' + fl.coop + ')' : '') + ' @ ' + num(it.price).toFixed(2), cur(Math.round(it.qty * it.price * 100))];
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
    return '<div class="hd"><img src="' + LOGO + '" alt=""><h2>' + esc(farmName()) + '</h2><div class="tiny muted">' + esc([setting('location', ''), setting('phone', '')].filter(Boolean).join(' · ')) + '</div></div>';
  }
  function ledgerPoint(customerId, id) {
    var L = C.customerLedger(st(), customerId), row = L.rows.filter(function (r) { return r.id === id; })[0];
    if (!row) return { before: 0, after: 0 };
    return { before: row.balanceCents - row.debit + row.credit, after: row.balanceCents };
  }
  routes.receipt = function (id) {
    var s = st(), x = byId(s.sales, id); if (!x) return '<div class="empty">Receipt not found.</div>';
    var c = cust(x.customerId) || {}, tt = C.saleTotals(x), lp = ledgerPoint(x.customerId, x.id);
    var lines = x.items.map(function (it) { return [it.qty + ' × ' + lineName(it) + ' @ ' + num(it.price).toFixed(2), cur(Math.round(it.qty * it.price * 100))]; });
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
    var tm = x.createdAt ? new Date(x.createdAt) : null;
    S.receiptDoc = { kind: 'sale', title: 'RECEIPT', no: x.receiptNo, date: x.date, time: tm && !isNaN(tm) ? pad(tm.getHours()) + ':' + pad(tm.getMinutes()) : '',
      customer: c.name || '', phone: c.phone || '', by: userName(x.by), byLabel: 'Served by',
      items: x.items.map(function (it) { return { name: lineName(it), qty: C.int(it.qty), price: Math.round(num(it.price) * 100), amount: Math.round(it.qty * it.price * 100) }; }),
      totals: [['This sale', tt.totalCents], ['Balance brought forward', lp.before], ['Total due', lp.before + tt.totalCents]].concat((x.payments || []).map(function (p) { return ['Paid · ' + p.method + (p.ref ? ' (' + p.ref + ')' : ''), C.cents(p.amount)]; })),
      balanceLabel: 'Balance carried forward', balance: lp.after, paidNow: tt.paidCents, due: lp.before + tt.totalCents };
    S.receiptDoc.sms = smsText(S.receiptDoc);
    return '<div class="no-print">' + back('home', 'Home') + '</div>' + html + receiptButtons(c, text, 'sale-new');
  };
  function receiptButtons(c, text, again) {
    var d = S.receiptDoc || {};
    return '<div class="stack no-print" style="max-width:420px;margin:14px auto 0">' +
      '<div class="small bold" style="margin-top:4px">Send to ' + esc(c.name || 'the customer') + (c.phone ? ' · ' + esc(c.phone) : '') + '</div>' +
      '<div class="grid g2"><button class="btn gold" type="button" data-act="receiptFile" data-as="pdf">📄 Send PDF</button><button class="btn gold" type="button" data-act="receiptFile" data-as="png">🖼 Send picture</button></div>' +
      (c.phone ? '<div class="grid g2"><a class="btn wa" target="_blank" rel="noopener" href="' + esc(waLink(c.phone, text)) + '">WhatsApp text</a><a class="btn light" href="' + esc(smsLink(c.phone, d.sms || '')) + '">💬 SMS</a></div>'
        : '<div class="alert warn small">No phone number for this customer — add one on their page to send WhatsApp text or SMS. PDF and picture still work.</div>') +
      '<p class="tiny muted" style="margin:0">PDF / picture: choose WhatsApp, then the customer’s chat. WhatsApp text and SMS go straight to their number.</p>' +
      '<div class="grid g2"><button class="btn light" type="button" data-act="print">Print</button><button class="btn light" type="button" data-act="share" data-text="' + esc(text) + '">Share text…</button></div>' +
      '<a class="btn gold block" href="#' + again + '">' + (again === 'sale-new' ? '+ Next sale' : 'Done') + '</a></div>';
  }
  // ---------------- receipt as a picture / PDF (drawn here, so it works offline) ----------------
  function smsLink(phone, body) { var n = String(phone || '').replace(/[^\d+]/g, ''); return 'sms:' + n + '?body=' + encodeURIComponent(body); }
  function smsText(d) {
    var money = function (c) { return 'GHS' + (c / 100).toFixed(2); };
    var t = farmName() + ': ' + (d.kind === 'payment' ? 'Payment ' : 'Receipt ') + d.no + ', ' + dShort(d.date) + '. ';
    if (d.kind === 'sale') t += d.items.map(function (i) { return i.qty + ' ' + i.name; }).join(', ') + ' = ' + money(d.totals[0][1]) + '. ';
    t += 'Paid ' + money(d.paidNow) + '. ' + (d.balance > 0 ? 'Balance ' + money(d.balance) + '.' : 'Fully paid.');
    var momo = setting('momoPay', ''); if (momo && d.balance > 0) t += ' MoMo: ' + momo + '.';
    return t + ' Thank you!';
  }
  var logoImg = null;
  function loadLogo() {
    return new Promise(function (ok) {
      if (logoImg) return ok(logoImg);
      var im = new Image(); im.onload = function () { logoImg = im; ok(im); }; im.onerror = function () { ok(null); }; im.src = LOGO;
    });
  }
  function wrapText(ctx, text, maxW) {
    var words = String(text).split(' '), lines = [], cur2 = '';
    words.forEach(function (w) { var tryL = cur2 ? cur2 + ' ' + w : w; if (ctx.measureText(tryL).width > maxW && cur2) { lines.push(cur2); cur2 = w; } else cur2 = tryL; });
    if (cur2) lines.push(cur2);
    return lines;
  }
  async function drawReceipt(d) {
    var W = 1080, P = 64, F = '"Inter", "Segoe UI", Arial, sans-serif', FD = '"Archivo", "Inter", Arial, sans-serif';
    try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
    var logo = await loadLogo();
    var money = function (c) { return 'GH₵ ' + (c / 100).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    // measure first, then draw at the right height
    var meas = document.createElement('canvas').getContext('2d');
    meas.font = '500 30px ' + F;
    var itemLines = d.items.map(function (it) { return wrapText(meas, it.name, 470); });
    var H = 300 + 230 + (d.items.length ? 80 + itemLines.reduce(function (a, l) { return a + 34 + l.length * 38; }, 0) : 0) + d.totals.length * 52 + 150 + 220;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    // header band
    g.fillStyle = '#1F4D2C'; g.fillRect(0, 0, W, 250);
    g.fillStyle = '#F2B705'; g.fillRect(0, 250, W, 10);
    if (logo) { g.save(); g.fillStyle = '#FFFFFF'; roundRect(g, P, 50, 150, 150, 28); g.fill(); g.drawImage(logo, P + 10, 60, 130, 130); g.restore(); }
    var tx = logo ? P + 180 : P;
    g.fillStyle = '#FFFFFF'; g.font = '800 46px ' + FD; g.textBaseline = 'alphabetic';
    wrapText(g, farmName(), W - tx - P - 10).slice(0, 2).forEach(function (l, i) { g.fillText(l, tx, 105 + i * 52); });
    g.font = '400 26px ' + F; g.fillStyle = '#DDEBDF';
    var sub = [setting('location', ''), setting('phone', '')].filter(Boolean).join('  ·  ');
    if (sub) g.fillText(sub, tx, 205);
    // title
    var y = 330;
    g.fillStyle = '#1B1B1B'; g.font = '800 40px ' + FD; g.fillText(d.title, P, y);
    g.textAlign = 'right'; g.font = '700 30px ' + F; g.fillStyle = '#1F4D2C'; g.fillText('No. ' + d.no, W - P, y); g.textAlign = 'left';
    // info grid
    y += 50;
    var info = [['Date', dLong(d.date) + (d.time ? ' · ' + d.time : '')], ['Customer', d.customer + (d.phone ? ' · ' + d.phone : '')], [d.byLabel, d.by]];
    info.forEach(function (r) {
      g.font = '500 24px ' + F; g.fillStyle = '#7A776C'; g.fillText(r[0], P, y + 26);
      g.font = '600 28px ' + F; g.fillStyle = '#1B1B1B'; g.fillText(wrapText(g, r[1], W - P * 2 - 220)[0] || '', P + 220, y + 26);
      y += 50;
    });
    y += 10;
    // items table
    if (d.items.length) {
      g.fillStyle = '#F5F2EA'; roundRect(g, P - 16, y, W - P * 2 + 32, 60, 12); g.fill();
      g.font = '700 24px ' + F; g.fillStyle = '#5C5A52';
      g.fillText('ITEM', P, y + 39); g.textAlign = 'right'; g.fillText('QTY', 640, y + 39); g.fillText('PRICE', 820, y + 39); g.fillText('AMOUNT', W - P, y + 39); g.textAlign = 'left';
      y += 80;
      d.items.forEach(function (it, i) {
        var ls = itemLines[i];
        g.font = '500 30px ' + F; g.fillStyle = '#1B1B1B';
        ls.forEach(function (l, k) { g.fillText(l, P, y + 30 + k * 38); });
        g.textAlign = 'right'; g.font = '600 30px ' + F;
        g.fillText(String(it.qty), 640, y + 30); g.font = '400 28px ' + F; g.fillText((it.price / 100).toFixed(2), 820, y + 30);
        g.font = '700 30px ' + F; g.fillText((it.amount / 100).toFixed(2), W - P, y + 30); g.textAlign = 'left';
        y += ls.length * 38 + 16;
        g.strokeStyle = '#EDE7D6'; g.lineWidth = 2; g.beginPath(); g.moveTo(P, y); g.lineTo(W - P, y); g.stroke();
        y += 18;
      });
    }
    // totals
    y += 6;
    d.totals.forEach(function (r) {
      g.font = '500 28px ' + F; g.fillStyle = '#5C5A52'; g.fillText(r[0], 470, y + 30);
      g.textAlign = 'right'; g.font = '700 30px ' + F; g.fillStyle = '#1B1B1B'; g.fillText(money(r[1]), W - P, y + 30); g.textAlign = 'left';
      y += 52;
    });
    // balance box
    y += 14;
    g.fillStyle = '#FFF4CC'; roundRect(g, P - 16, y, W - P * 2 + 32, 96, 16); g.fill();
    g.font = '800 32px ' + FD; g.fillStyle = '#1B1B1B'; g.fillText(d.balanceLabel, P + 8, y + 60);
    g.textAlign = 'right'; g.font = '800 40px ' + FD; g.fillStyle = d.balance > 0 ? '#B3261E' : '#1F4D2C'; g.fillText(money(d.balance), W - P - 8, y + 62); g.textAlign = 'left';
    y += 130;
    // stamp
    var paid = d.balance <= 0;
    g.save(); g.translate(P + 150, y + 10); g.rotate(-0.08);
    g.strokeStyle = paid ? '#1F4D2C' : '#B3261E'; g.lineWidth = 5; roundRect(g, -140, -40, 280, 80, 14); g.stroke();
    g.font = '800 34px ' + FD; g.fillStyle = paid ? '#1F4D2C' : '#B3261E'; g.textAlign = 'center'; g.fillText(paid ? 'PAID IN FULL' : 'BALANCE DUE', 0, 12); g.restore();
    // footer
    g.textAlign = 'center'; g.fillStyle = '#5C5A52'; g.font = '500 26px ' + F;
    var fy = y + 100;
    var momo = setting('momoPay', '');
    if (momo) { g.font = '700 26px ' + F; g.fillStyle = '#1B1B1B'; g.fillText('Pay by MoMo: ' + momo, W / 2, fy); fy += 42; }
    g.font = '500 26px ' + F; g.fillStyle = '#5C5A52';
    wrapText(g, setting('receiptFooter', 'Thank you!'), W - P * 2).slice(0, 2).forEach(function (l) { g.fillText(l, W / 2, fy); fy += 36; });
    g.font = '400 20px ' + F; g.fillStyle = '#A29E92'; g.fillText('Printed ' + dShort(today()) + ' · The Egg Man Farms app', W / 2, fy + 10);
    g.textAlign = 'left';
    // trim to the real height
    var outH = Math.min(H, fy + 50), out2 = document.createElement('canvas'); out2.width = W; out2.height = outH;
    out2.getContext('2d').drawImage(cv, 0, 0);
    return out2;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function dataUrlBytes(u) { var b = atob(u.split(',')[1]), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  // one-page PDF holding the receipt picture (no library needed)
  function canvasToPdf(cv, title) {
    var jpg = dataUrlBytes(cv.toDataURL('image/jpeg', 0.92)), pw = 420, ph = Math.round(cv.height / cv.width * pw);
    var enc = function (str) { var a = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 255; return a; };
    var safe = String(title || 'Receipt').replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '');
    var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
    var parts = [], offs = [], len = 0;
    var push = function (x) { var b = typeof x === 'string' ? enc(x) : x; parts.push(b); len += b.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var obj = function (n, body) { offs[n] = len; push(n + ' 0 obj\n'); body.forEach(push); push('\nendobj\n'); };
    obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
    obj(3, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>']);
    obj(4, ['<< /Type /XObject /Subtype /Image /Width ' + cv.width + ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n', jpg, '\nendstream']);
    obj(5, ['<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream']);
    obj(6, ['<< /Title (' + safe + ') /Producer (The Egg Man Farms app) >>']);
    var xref = len, x = 'xref\n0 7\n0000000000 65535 f \n';
    for (var i = 1; i <= 6; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(len), p2 = 0; parts.forEach(function (b) { out.set(b, p2); p2 += b.length; });
    return new Blob([out], { type: 'application/pdf' });
  }
  function blobToBase64(blob) { return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = bad; r.readAsDataURL(blob); }); }
  async function shareFile(blob, name, text) {
    if (NATIVE && NATIVE.shareFile) { NATIVE.shareFile(await blobToBase64(blob), blob.type, name, text || ''); return 'shared'; }
    var file = null; try { file = new File([blob], name, { type: blob.type }); } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast('Saved to your downloads — attach it in WhatsApp'); return 'downloaded';
  }
  ACT.receiptFile = async function (b) {
    var d = S.receiptDoc; if (!d) return;
    b.disabled = true; var old = b.textContent; b.textContent = 'Making it…';
    try {
      var cv = await drawReceipt(d), base = (d.kind === 'payment' ? 'Payment-' : 'Receipt-') + d.no + '-' + (d.customer || 'customer').replace(/[^A-Za-z0-9]+/g, '-');
      var blob = b.dataset.as === 'pdf' ? canvasToPdf(cv, farmName() + ' ' + d.title + ' ' + d.no) : await new Promise(function (ok) { cv.toBlob(ok, 'image/png'); });
      S.lastReceiptBlob = blob;
      await shareFile(blob, base + (b.dataset.as === 'pdf' ? '.pdf' : '.png'), farmName() + ' — ' + d.title.toLowerCase() + ' ' + d.no);
    } catch (e) { console.warn(e); toast('Could not make the file: ' + (e.message || e)); }
    b.disabled = false; b.textContent = old;
  };
  ACT.print = function () { if (NATIVE && NATIVE.print) { try { NATIVE.print(); return; } catch (e) {} } window.print(); };
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
    out += info('debt') + debtSummaryBlock();
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
  function debtSummaryBlock() {
    var d = C.debtSummary(st(), today()), max = Math.max.apply(null, d.buckets.map(function (b) { return b.cents; }).concat([1]));
    if (!d.count && !d.collectedThisMonthCents) return '';
    return '<div class="card stack" style="margin-bottom:12px"><div class="row between"><h2>Debt summary</h2><span class="tiny muted">' + dLong(today()) + '</span></div>' +
      '<div class="grid g2 g4-md">' + kpiBox('Total owed', cur(d.totalCents), d.count + ' customers', 'gold') +
      kpiBox('Collected this month', cur(d.collectedThisMonthCents), 'debt payments') + kpiBox('New debt this month', cur(d.newDebtThisMonthCents), 'sales not paid in full') +
      kpiBox('Over credit limit', String(d.overLimit), d.overLimit ? 'customers — stop credit' : 'none', '', d.overLimit ? 'red' : '') + '</div>' +
      '<div><div class="small bold" style="margin-bottom:6px">How old the debts are</div>' + d.buckets.map(function (b, i) {
        return '<div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:nowrap"><span class="small" style="width:96px;flex-shrink:0">' + b.label + '</span>' +
          '<span style="flex:1;background:#F0ECE1;border-radius:6px;height:14px;overflow:hidden"><i style="display:block;height:100%;width:' + Math.round(b.cents / max * 100) + '%;background:' + ['#1F4D2C', '#E0A800', '#D9731A', '#B3361A'][i] + '"></i></span>' +
          '<span class="small bold right" style="width:118px;flex-shrink:0">' + cur(b.cents) + ' <span class="muted">(' + b.count + ')</span></span></div>';
      }).join('') + '</div>' +
      (d.customers.length ? '<div><div class="small bold" style="margin-bottom:4px">Biggest debts</div>' + d.customers.slice(0, 5).map(function (c) {
        return '<a class="kv" style="text-decoration:none;color:inherit" href="#customer/' + c.id + '"><span>' + esc(c.name) + ' <span class="tiny ' + (c.days > 30 ? 'red bold' : 'muted') + '">· ' + c.days + ' days</span>' + (c.overLimit ? ' <span class="chip red">over limit</span>' : '') + '</span><b class="red">' + cur(c.cents) + '</b></a>';
      }).join('') + '</div>' : '') + '</div>';
  }
  function initials(n) { var w = String(n).trim().split(/\s+/); return (w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
  function oldestUnpaid(id) { return C.oldestUnpaidDate(st(), id, today()); }
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
    var owner = isRole('owner'); c = c || { priceType: 'retail', credit: setting('newCustomerCredit', 'no') === 'yes', limit: setting('newCustomerCredit', 'no') === 'yes' ? num(setting('newCustomerLimit', 0)) : 0, opening: 0 };
    return back(c.id ? 'customer/' + c.id : 'customers', c.id ? c.name : 'Customers') + head(c.id ? 'Edit customer' : 'New customer', owner ? '' : 'The owner decides credit and wholesale prices for each customer.') +
      '<form class="card" data-form="customer"' + (c.id ? ' data-id="' + esc(c.id) + '"' : '') + '><label>Name<input name="name" required value="' + esc(c.name || '') + '"></label>' +
      '<label>Phone (for WhatsApp receipts)<input name="phone" type="tel" inputmode="tel" value="' + esc(c.phone || '') + '" placeholder="024 123 4567"></label>' +
      (owner ? '<div class="grid g2"><label>Prices<select name="priceType">' + opt('retail', 'Retail', c.priceType) + opt('wholesale', 'Wholesale', c.priceType) + '</select></label>' +
        '<label>Payment<select name="credit">' + opt('no', 'Cash only (must pay in full)', c.credit ? 'yes' : 'no') + opt('yes', 'Part payment / credit allowed', c.credit ? 'yes' : 'no') + '</select></label></div>' +
        '<div class="grid g2"><label>Credit limit (GH₵, 0 = no limit)<input name="limit" type="number" min="0" step="0.01" inputmode="decimal" value="' + esc(c.limit || 0) + '"></label>' +
        '<label>Opening balance owed (GH₵)<input name="opening" type="number" step="0.01" inputmode="decimal" value="' + esc(c.opening || 0) + '"></label></div>' : '') +
      '<label>Notes<input name="notes" value="' + esc(c.notes || '') + '" placeholder="e.g. shop at Madina market"></label><button class="btn" type="submit">Next: preview →</button></form>';
  }
  FORMS.customer = function (f) {
    var owner = isRole('owner'), old = f.dataset.id ? cust(f.dataset.id) : null;
    var rec = Object.assign({}, old || {}, { type: 'customers', name: val(f, 'name').trim(), phone: val(f, 'phone').trim(), notes: val(f, 'notes').trim() });
    if (owner) { rec.priceType = val(f, 'priceType'); rec.credit = val(f, 'credit') === 'yes'; rec.limit = num(val(f, 'limit')); rec.opening = num(val(f, 'opening')); }
    else if (!old) { rec.priceType = 'retail'; rec.credit = setting('newCustomerCredit', 'no') === 'yes'; rec.limit = rec.credit ? num(setting('newCustomerLimit', 0)) : 0; rec.opening = 0; }
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
    var tm = p.createdAt ? new Date(p.createdAt) : null;
    S.receiptDoc = { kind: 'payment', title: 'PAYMENT RECEIPT', no: p.receiptNo, date: p.date, time: tm && !isNaN(tm) ? pad(tm.getHours()) + ':' + pad(tm.getMinutes()) : '',
      customer: c.name || '', phone: c.phone || '', by: userName(p.by), byLabel: 'Received by', items: [],
      totals: [['Balance before', lp.before], ['Paid · ' + p.method + (p.ref ? ' (' + p.ref + ')' : ''), C.cents(p.amount)]],
      balanceLabel: 'Balance now', balance: lp.after, paidNow: C.cents(p.amount), due: lp.before };
    S.receiptDoc.sms = smsText(S.receiptDoc);
    return '<div class="no-print">' + back('customer/' + p.customerId, c.name) + '</div>' + html + receiptButtons(c, text, 'customer/' + p.customerId);
  };

  // ================================================================ CRATES OUT / RETURNS
  function eggProducts() { return live(st().products).filter(function (p) { return (p.kind === 'good' || p.kind === 'cracked') && p.active !== false; }); }
  routes.crates = function (date) {
    var s = st(), t = date || today();
    var people = role() === 'sales' ? [me()] : salesUsers();
    var out = head(role() === 'sales' ? 'My eggs' : 'Crates out & returns', dLong(t) + ' · eggs taken to shops and markets',
      '<label class="small" style="flex-direction:row;align-items:center;gap:6px">Day<input type="date" value="' + t + '" max="' + today() + '" data-act-change="crateDate" style="min-height:40px"></label>') + info('crates');
    if (role() !== 'sales') {
      var store = C.eggStore(s, t);
      out += '<div class="grid g2" style="margin-bottom:12px">' + kpiBox('Good eggs in store', crates(store.good), twoColours() ? 'white ' + crates(store.white.good) + ' · brown ' + crates(store.brown.good) : 'end of ' + dShort(t), 'dark') + kpiBox('Cracked in store', crates(store.cracked), twoColours() ? 'white ' + crates(store.white.cracked) + ' · brown ' + crates(store.brown.cracked) : '') + '</div>';
      out += info('store');
      if (isRole('owner')) out += '<a class="btn light sm" href="#crates-adjust" style="margin-bottom:12px">Correct store count</a>';
    }
    out += '<div class="list">' + people.map(function (u) {
      var c = C.carry(s, u.id, t);
      var stTxt = c.returnRecorded ? (c.balanced ? '<span class="chip green">Balanced ✓</span>' : '<span class="chip red">' + crates(c.remaining.good) + ' not accounted for</span>') : (c.out.good || c.opening.good ? '<span class="chip yellow">Still out</span>' : '<span class="chip">Nothing taken</span>');
      var money = handIn(u.id, t);
      return '<div class="card stack"><div class="row between"><h2>' + esc(u.name) + '</h2>' + stTxt + '</div>' +
        '<div class="grid g3 small">' + mini('Had from before', crates(c.opening.good)) + mini('Took today', crates(c.out.good) + (c.out.cracked ? ' + ' + crates(c.out.cracked) + ' cracked' : '')) + mini('Sold', crates(c.sold.good)) +
        mini('Returned', crates(c.returned.good)) + mini('Broken', c.broken.good + ' pcs') + mini('Still with them', crates(c.remaining.good), c.returnRecorded && c.remaining.good ? 'red' : '') + '</div>' +
        (c.out.cracked || c.sold.cracked || c.remaining.cracked ? '<div class="tiny muted">Cracked: took ' + crates(c.out.cracked) + ', sold ' + crates(c.sold.cracked) + ', returned ' + crates(c.returned.cracked) + ', still with them ' + crates(c.remaining.cracked) + '</div>' : '') +
        movesToday(u.id, t) +
        '<div class="small">Money to hand in: <b>' + cur(money.total) + '</b> <span class="muted">(cash ' + cur(money.Cash) + ' · MoMo ' + cur(money.MoMo) + (money.Bank ? ' · bank ' + cur(money.Bank) : '') + ')</span></div>' +
        (isRole('owner', 'manager') && t === today() ? '<div class="grid g2"><a class="btn gold sm" href="#crates-out/' + u.id + '">Give out eggs</a><a class="btn ghost sm" href="#crates-return/' + u.id + '">Record return</a></div>' : '') + '</div>';
    }).join('') + '</div>';
    if (!people.length) out += '<div class="empty">No active salespeople yet. The owner adds them in Settings › People &amp; PINs (job: Salesperson).</div>';
    return out;
  };
  ACT.crateDate = function (el) { go('crates/' + el.value); };
  // every give-out and return of the day, with time, so you can see exactly what was entered
  function movesToday(uid, t) {
    var l = C.sortChrono(live(st().stock).filter(function (m) { return m.salesUserId === uid && m.date === t && (m.kind === 'out' || m.kind === 'return'); }));
    if (!l.length) return '';
    return '<div class="small" style="background:#F5F2EA;border-radius:8px;padding:8px 10px">' + l.map(function (m) {
      var parts = { brown: { good: 0, cracked: 0 }, white: { good: 0, cracked: 0 } };
      (m.lines || []).forEach(function (x) { var e = C.lineEggs(st(), x), col = x.colour === 'white' ? 'white' : 'brown'; parts[col].good += e.good; parts[col].cracked += e.cracked; });
      var txt = ['brown', 'white'].filter(function (c) { return parts[c].good || parts[c].cracked; }).map(function (c) {
        return (twoColours() ? c + ': ' : '') + crates(parts[c].good) + ' good' + (parts[c].cracked ? ', ' + crates(parts[c].cracked) + ' cracked' : '');
      }).join(' · ') || 'nothing';
      if (m.kind === 'return' && (C.int(m.brokenGood) || C.int(m.brokenCracked))) txt += ' · broken ' + (C.int(m.brokenGood) + C.int(m.brokenCracked)) + ' pcs';
      var tm = m.createdAt ? new Date(m.createdAt) : null;
      return '<div>' + (tm && !isNaN(tm) ? '<span class="muted">' + pad(tm.getHours()) + ':' + pad(tm.getMinutes()) + '</span> ' : '') + (m.kind === 'out' ? '⬆ <b>Given</b> ' : '⬇ <b>Returned</b> ') + txt + (m.by ? ' <span class="tiny muted">— ' + esc(userName(m.by)) + '</span>' : '') + '</div>';
    }).join('') + '</div>';
  }
  // running total on the give-out / return forms, shown at the top while you type
  function eggLinesLive(f) {
    var box = f.querySelector('.lines-live'); if (!box) return;
    var prefix = f.dataset.form === 'crateout' ? 'out_' : 'ret_', lines = readLines(f, prefix), pcs = linesPieces(lines);
    var store = C.eggStore(st(), today()), cols = { brown: 0, white: 0 };
    lines.forEach(function (l) { var e = C.lineEggs(st(), l); cols[l.colour === 'white' ? 'white' : 'brown'] += e.good + e.cracked; });
    var what = f.dataset.form === 'crateout' ? 'Giving now' : 'Bringing back';
    if (!lines.length) { box.innerHTML = '<b>' + what + ':</b> nothing yet — type the numbers below or tap +'; box.className = 'lines-live alert small'; return; }
    var after = f.dataset.form === 'crateout' ? store.good - pcs.good : store.good + pcs.good;
    var short = f.dataset.form === 'crateout' && (pcs.good > store.good || pcs.cracked > store.cracked);
    box.className = 'lines-live alert small ' + (short ? 'warn' : 'ok');
    box.innerHTML = '<b>' + what + ': ' + crates(pcs.good) + ' good' + (pcs.cracked ? ' + ' + crates(pcs.cracked) + ' cracked' : '') + '</b>' +
      (twoColours() ? '<br>brown ' + crates(cols.brown) + ' · white ' + crates(cols.white) : '') +
      (after < 0 ? '<br><b>More than the store has — short by ' + crates(-after) + ' good.</b> Are today’s daily records entered?' : '<br>Store after: ' + crates(after) + ' good' + (short ? ' — <b>more cracked eggs than the store has</b>' : ''));
  }
  LIVE.crateout = eggLinesLive;
  LIVE.crateret = eggLinesLive;
  // keep the box you are typing in above the phone keyboard
  document.addEventListener('focusin', function (e) {
    if (e.target && e.target.matches && e.target.matches('.qty input, form[data-form] input[type=number]')) setTimeout(function () { try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {} }, 350);
  });
  function mini(l, v, cls) { return '<div style="background:#F5F2EA;border-radius:8px;padding:6px 8px"><div class="tiny muted">' + esc(l) + '</div><div class="bold ' + (cls || '') + '">' + esc(v) + '</div></div>'; }
  function handIn(uid, t) {
    var m = { Cash: 0, MoMo: 0, Bank: 0, total: 0 };
    live(st().sales).filter(function (x) { return x.by === uid && x.date === t; }).forEach(function (x) { (x.payments || []).forEach(function (p) { m[p.method] = (m[p.method] || 0) + C.cents(p.amount); }); });
    live(st().payments).filter(function (x) { return x.by === uid && x.date === t; }).forEach(function (p) { m[p.method] = (m[p.method] || 0) + C.cents(p.amount); });
    m.total = m.Cash + m.MoMo + m.Bank; return m;
  }
  function eggLinesForm(prefix) {
    return eggVariants().map(function (v) {
      return '<div class="prod"><div class="bold">' + esc(v.label) + '</div><div class="qty"><button type="button" data-act="qty" data-d="-1" aria-label="Less">−</button><input name="' + prefix + v.key + '" type="number" min="0" step="1" inputmode="numeric" value="0" aria-label="' + esc(v.label) + '"><button type="button" class="plus" data-act="qty" data-d="1" aria-label="More">+</button></div></div>';
    }).join('');
  }
  function readLines(f, prefix) {
    return eggVariants().map(function (v) { return { productId: v.p.id, qty: C.int(val(f, prefix + v.key)), colour: v.colour }; }).filter(function (l) { return l.qty > 0; });
  }
  function storeText(st2) { return crates(st2.good) + ' good, ' + crates(st2.cracked) + ' cracked' + (twoColours() ? ' (white ' + crates(st2.white.good) + ' · brown ' + crates(st2.brown.good) + ')' : ''); }
  function linesPieces(lines) { var g = 0, c = 0; lines.forEach(function (l) { var e = C.lineEggs(st(), l); g += e.good; c += e.cracked; }); return { good: g, cracked: c }; }
  routes['crates-out'] = function (uid) {
    var store = C.eggStore(st(), today());
    return back('crates', 'Crates') + head('Give out eggs to ' + userName(uid), 'Store has ' + storeText(store)) +
      '<form class="card" data-form="crateout" data-uid="' + esc(uid) + '"><div class="lines-live alert small" aria-live="polite"><b>Giving now:</b> nothing yet — type the numbers below or tap +</div>' + eggLinesForm('out_') + '<button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.crateout = function (f) {
    var uid = f.dataset.uid, lines = readLines(f, 'out_'), pcs = linesPieces(lines), store = C.eggStore(st(), today());
    var errors = [], warnings = [];
    if (!lines.length) errors.push('Enter how many crates are given out.');
    (twoColours() ? ['brown', 'white'] : ['all']).forEach(function (c) {
      var need = { good: 0, cracked: 0 }; lines.filter(function (l) { return c === 'all' || l.colour === c; }).forEach(function (l) { var e = C.lineEggs(st(), l); need.good += e.good; need.cracked += e.cracked; });
      if (!need.good && !need.cracked) return;
      if (c === 'all') { store.all = { good: store.good, cracked: store.cracked }; }
      var w = twoColours() ? c + ' ' : '';
      var strict = String(setting('giveOutStrict', 'no')).toLowerCase() === 'yes', list = strict ? errors : warnings;
      var hint = strict ? ' Enter today’s daily records first, or ask the owner to correct the store count.' : ' Check today’s daily records are entered.';
      if (need.good > store[c].good) list.push('The store shows only ' + crates(Math.max(0, store[c].good)) + ' good ' + w + 'eggs.' + hint);
      if (need.cracked > store[c].cracked) list.push('The store shows only ' + crates(Math.max(0, store[c].cracked)) + ' cracked ' + w + 'eggs.' + hint);
    });
    preview({ title: 'Eggs to ' + userName(uid), errors: errors, warnings: warnings, gold: true, doneMessage: 'Given to ' + userName(uid) + ': ' + crates(pcs.good) + (pcs.cracked ? ' + ' + crates(pcs.cracked) + ' cracked' : '') + ' ✓',
      rows: lines.map(function (l) { return [lineName(l), l.qty]; }).concat([['Good eggs', crates(pcs.good)], ['Cracked eggs', crates(pcs.cracked)], ['Store after', crates(store.good - pcs.good) + ' good']]),
      onConfirm: async function () { await E.save({ type: 'stock', kind: 'out', date: today(), salesUserId: uid, lines: lines }); return 'crates'; } });
  };
  routes['crates-return'] = function (uid) {
    var c = C.carry(st(), uid, today());
    return back('crates', 'Crates') + head('Return from ' + userName(uid), 'With them now: ' + storeText(c.remaining)) +
      '<form class="card" data-form="crateret" data-uid="' + esc(uid) + '"><h3>Eggs brought back</h3><div class="lines-live alert small" aria-live="polite"><b>Bringing back:</b> nothing yet — type the numbers below or tap +</div>' + eggLinesForm('ret_') +
      brokenFields() +
      '<div id="retLive" class="alert ok small"></div><button class="btn" type="submit">Next: preview →</button></form>';
  };
  // broken eggs: main colour in brokenGood / brokenCracked; the other colour in brokenWhite… or brokenBrown…
  function brokenFields() {
    var main = C.defaultColour(st()), other = main === 'white' ? 'brown' : 'white', two = twoColours(), cap = colWord(other);
    return '<div class="grid g2"><label>Broken good ' + (two ? colWord(main).toLowerCase() + ' ' : '') + 'eggs (pieces)<input name="brokenGood" type="number" min="0" inputmode="numeric" value="0"></label><label>Broken cracked ' + (two ? colWord(main).toLowerCase() + ' ' : '') + 'eggs (pieces)<input name="brokenCracked" type="number" min="0" inputmode="numeric" value="0"></label></div>' +
      (two ? '<div class="grid g2"><label>Broken good ' + other + ' eggs (pieces)<input name="broken' + cap + 'Good" type="number" min="0" inputmode="numeric" value="0"></label><label>Broken cracked ' + other + ' eggs (pieces)<input name="broken' + cap + 'Cracked" type="number" min="0" inputmode="numeric" value="0"></label></div>' : '');
  }
  function retCalc(f) {
    var uid = f.dataset.uid, c = C.carry(st(), uid, today()), lines = readLines(f, 'ret_'), pcs = linesPieces(lines);
    var main = C.defaultColour(st()), other = main === 'white' ? 'brown' : 'white', cap = colWord(other);
    var bg = C.int(val(f, 'brokenGood')), bc = C.int(val(f, 'brokenCracked')), og = C.int(val(f, 'broken' + cap + 'Good')), oc = C.int(val(f, 'broken' + cap + 'Cracked'));
    var left = { good: c.remaining.good - pcs.good - bg - og, cracked: c.remaining.cracked - pcs.cracked - bc - oc };
    var extra = {}; if (og || oc) { extra['broken' + cap + 'Good'] = og; extra['broken' + cap + 'Cracked'] = oc; }
    var byCol = {};
    ['white', 'brown'].forEach(function (k) {
      var back2 = { good: 0, cracked: 0 }; lines.filter(function (l) { return l.colour === k; }).forEach(function (l) { var e = C.lineEggs(st(), l); back2.good += e.good; back2.cracked += e.cracked; });
      var br = k === main ? { good: bg, cracked: bc } : { good: og, cracked: oc };
      byCol[k] = { good: c.remaining[k].good - back2.good - br.good, cracked: c.remaining[k].cracked - back2.cracked - br.cracked };
    });
    return { c: c, lines: lines, pcs: pcs, bg: bg + og, bc: bc + oc, rawBg: bg, rawBc: bc, extra: extra, left: left, byCol: byCol };
  }
  LIVE.crateret = function (f) {
    var r = retCalc(f), box = document.getElementById('retLive'); if (!box) return;
    var ok = r.left.good === 0 && r.left.cracked === 0;
    box.className = 'alert small ' + (ok ? 'ok' : 'warn');
    if (ok && twoColours() && (r.byCol.white.good || r.byCol.white.cracked)) ok = false;
    box.className = 'alert small ' + (ok ? 'ok' : 'warn');
    box.textContent = ok ? '✓ Balanced: everything taken is sold, returned or broken.' : 'Not accounted for: ' + crates(r.left.good) + ' good, ' + crates(r.left.cracked) + ' cracked' + (twoColours() ? ' (white ' + crates(r.byCol.white.good) + ' · brown ' + crates(r.byCol.brown.good) + ')' : '') + ' — negative means more sold than taken.';
  };
  FORMS.crateret = function (f) {
    var r = retCalc(f), uid = f.dataset.uid, warnings = [];
    if (!r.left.good && !r.left.cracked && twoColours() && (r.byCol.white.good || r.byCol.white.cracked)) warnings.push('The totals match, but white and brown do not: white ' + crates(r.byCol.white.good) + ', brown ' + crates(r.byCol.brown.good) + ' not accounted for. Check the colours.');
    if (r.left.good || r.left.cracked) warnings.push(crates(r.left.good) + ' good and ' + crates(r.left.cracked) + ' cracked eggs are not accounted for. Check the sales on ' + userName(uid) + '’s phone are synced, or record them as broken.');
    preview({ title: 'Return from ' + userName(uid), warnings: warnings,
      rows: [['Took today + from before', crates(r.c.opening.good + r.c.out.good)], ['Sold (recorded)', crates(r.c.sold.good)], ['Brought back', crates(r.pcs.good)], ['Broken', r.bg + ' pieces'],
        ['Not accounted for', crates(r.left.good), r.left.good ? 'red' : 'greenx'], ['Cracked brought back', crates(r.pcs.cracked)]],
      onConfirm: async function () { await E.save(Object.assign({ type: 'stock', kind: 'return', date: today(), salesUserId: uid, lines: r.lines, brokenGood: r.rawBg, brokenCracked: r.rawBc }, r.extra)); return 'crates'; } });
  };
  routes['crates-adjust'] = function () {
    var store = C.eggStore(st(), today());
    return back('crates', 'Crates') + head('Correct store count', 'Store shows ' + storeText(store)) +
      '<form class="card" data-form="crateadj"><div class="grid g2"><label>Eggs<select name="eggKind">' + opt('good', 'Good') + opt('cracked', 'Cracked') + '</select></label>' +
      (twoColours() ? '<label>Colour<select name="colour">' + opt('brown', 'Brown') + opt('white', 'White') + '</select></label>' : '') +
      '</div><div class="small bold" style="margin-top:4px">What you counted in the store room now</div><div class="grid g2"><label>Full crates<input name="countedCrates" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 200"></label>' +
      '<label>Loose eggs (pieces)<input name="countedPieces" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 12"></label></div>' +
      '<div class="alert ok small" id="adjLive" aria-live="polite">Type what you counted.</div><label>Reason<input name="reason" required placeholder="e.g. stock count, eggs used at home, broken in store"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  function adjCounted(f) { return C.int(val(f, 'countedCrates')) * C.settingsOf(st()).eggsPerCrate + C.int(val(f, 'countedPieces')); }
  LIVE.crateadj = function (f) {
    var box = document.getElementById('adjLive'); if (!box) return;
    var store0 = C.eggStore(st(), today()), kind = val(f, 'eggKind'), col = val(f, 'colour') || colours()[0], store = twoColours() ? store0[col] : store0;
    if (val(f, 'countedCrates') === '' && val(f, 'countedPieces') === '') { box.textContent = 'Type what you counted.'; return; }
    var counted = adjCounted(f), diff = counted - store[kind];
    box.innerHTML = 'App shows <b>' + crates(store[kind]) + '</b> · you counted <b>' + crates(counted) + '</b> → the app will ' + (diff === 0 ? 'not change' : (diff > 0 ? 'add ' : 'take off ') + '<b>' + crates(Math.abs(diff)) + '</b>');
  };
  FORMS.crateadj = function (f) {
    var store0 = C.eggStore(st(), today()), kind = val(f, 'eggKind'), col = val(f, 'colour') || colours()[0], store = twoColours() ? store0[col] : store0, counted = adjCounted(f), diff = counted - store[kind];
    var errs = []; if (!val(f, 'reason').trim()) errs.push('Give a reason.'); if (val(f, 'countedCrates') === '' && val(f, 'countedPieces') === '') errs.push('Type the crates (and loose eggs) you counted.');
    preview({ title: 'Correct ' + (twoColours() ? col + ' ' : '') + kind + ' egg count', errors: errs, warnings: diff ? [] : ['The count is the same as the app — nothing to change.'],
      rows: [['App shows', crates(store[kind])], ['You counted', crates(counted)], ['Change', (diff > 0 ? '+ ' : '− ') + crates(Math.abs(diff)), diff < 0 ? 'red' : '']],
      onConfirm: async function () { await E.save({ type: 'stock', kind: 'adjust', date: today(), eggKind: kind, colour: col, pieces: diff, reason: val(f, 'reason').trim() }); return 'crates'; } });
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
    var out = head('Feed', 'Bought feed, your own mixes and ingredients', '<div class="row"><a class="btn gold sm" href="#feed-mix">Mix feed</a><a class="btn sm" href="#feed-buy">Buy feed / ingredient</a><a class="btn light sm" href="#recipes">Recipes</a></div>');
    if (owner) out += info('feedcost');
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
      '<div class="grid g2"><label>Quantity<input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label><label>Unit<select name="qtyUnit">' + opt('bag', 'Bags') + opt('kg', 'Kg') + opt('litre', 'Litres (oil)') + '</select></label></div>' +
      '<div class="grid g2"><label>Total cost (GH₵)<input name="cost" type="number" min="0" step="0.01" inputmode="decimal" required></label><label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>' +
      '<label>Supplier<input name="supplier"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  FORMS.feedbuy = function (f) {
    var it = item(val(f, 'itemId')), rec = { type: 'feed', kind: 'buy', itemId: it.id, qty: num(val(f, 'qty')), qtyUnit: val(f, 'qtyUnit'), cost: num(val(f, 'cost')), date: val(f, 'date'), supplier: val(f, 'supplier').trim() };
    var kg = C.itemKg(st(), it, rec.qty, rec.qtyUnit), errors = [];
    if (!(rec.qty > 0)) errors.push('Enter the quantity.');
    if (!(rec.cost >= 0)) errors.push('Enter the cost.');
    preview({ title: 'Bought ' + it.name, errors: errors, rows: [['Quantity', rec.qty + ' ' + rec.qtyUnit + (rec.qtyUnit !== 'kg' ? ' (' + (Math.round(kg * 100) / 100) + ' kg)' : '')], ['Total cost', curN(rec.cost)], ['Cost per kg', kg ? 'GH₵ ' + (rec.cost / kg).toFixed(2) : '—'], ['Date', dLong(rec.date)]],
      onConfirm: async function () { await E.save(rec); return 'feed'; } });
  };
  // MIX FEED — pick a recipe, type how much to make (kg or bags); the app works out every ingredient.
  routes['feed-mix'] = function (recipeId, batch, unit) {
    var s = st(), feeds = live(s.items).filter(function (i) { return i.category === 'feed'; }), ings = live(s.items).filter(function (i) { return i.category === 'ingredient' && i.active !== false; });
    var rec = byId(s.recipes, recipeId), bagKg = C.settingsOf(s).kgPerBag;
    unit = unit === 'kg' ? 'kg' : 'bag'; batch = num(batch) || (rec ? 10 : 0);
    var batchKg = unit === 'bag' ? batch * bagKg : batch;
    var lines = rec && batchKg ? C.recipeBatch(s, rec, batchKg).lines.map(function (l) { return { itemId: l.itemId, kg: l.kg }; }) : [];
    var want = Math.max(rec ? lines.length + 1 : 10, lines.length + 1); while (lines.length < want) lines.push({ itemId: '', kg: '' });
    var out = back('feed', 'Feed') + head('Mix feed', rec ? 'Recipe: ' + esc(rec.name) : 'Choose a recipe, then how much to make');
    out += '<form class="card stack" data-form="feedmix">';
    out += '<label>1. Which recipe?<select data-act-change="pickRecipe"><option value="">— no recipe: type the ingredients —</option>' + s.recipes.map(function (r) { return opt(r.id, r.name, recipeId); }).join('') + '</select></label>';
    if (rec) out += '<div class="grid g2"><label>2. How much to make?<input id="mixBatch" type="number" min="0" step="any" inputmode="decimal" value="' + batch + '"></label><label>Unit<select id="mixUnit">' + opt('bag', 'Bags (' + bagKg + ' kg)', unit) + opt('kg', 'Kg', unit) + '</select></label></div>' +
      '<button class="btn light sm" type="button" data-act="mixBatch" data-id="' + esc(rec.id) + '">Work out the ingredients</button>';
    out += '<div class="grid g2"><label>' + (rec ? '3. ' : '') + 'Makes (feed type)<select name="outputItemId">' + feeds.map(function (i) { return opt(i.id, i.name, rec ? rec.outputItemId : 'i-ownmix'); }).join('') + '</select></label><label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label></div>';
    out += '<div class="small bold">' + (rec ? 'Ingredients for ' + batchKg + ' kg (you can change a number)' : 'Ingredients and kg') + '</div><div class="stack" style="gap:8px">' + lines.map(function (l, i) {
      var it = item(l.itemId) || {}, oil = it.unit === 'litre' && num(l.kg) ? ' ≈ ' + (Math.round(num(l.kg) / (num(it.kgPerBag) || 0.92) * 10) / 10) + ' L' : '';
      return '<div class="grid" style="grid-template-columns:1fr 100px 52px;align-items:center"><select name="ing_' + i + '" aria-label="Ingredient ' + (i + 1) + '"><option value="">— ingredient —</option>' + ings.map(function (x) { return opt(x.id, x.name, l.itemId); }).join('') + '</select><input name="kg_' + i + '" type="number" min="0" step="any" inputmode="decimal" placeholder="kg" value="' + esc(l.kg) + '" aria-label="Kg"><span class="tiny muted">kg' + oil + '</span></div>';
    }).join('') + '</div><input type="hidden" name="rows" value="' + lines.length + '"><input type="hidden" name="recipeId" value="' + esc(recipeId || '') + '">' +
      '<div id="mixLive" class="card" style="background:var(--green-soft);border:0"></div><button class="btn gold" type="submit">Next: preview →</button></form>';
    if (!s.recipes.length) out += '<div class="alert ok small" style="margin-top:12px">Save your recipes once in <a href="#recipes">Recipes</a>. Then you only choose the recipe and how much to make.</div>';
    return out;
  };
  ACT.pickRecipe = function (el) { go('feed-mix/' + el.value); };
  ACT.mixBatch = function (b) { var n = document.getElementById('mixBatch'), u = document.getElementById('mixUnit'); go('feed-mix/' + b.dataset.id + '/' + (num(n && n.value) || 0) + '/' + (u ? u.value : 'bag')); };
  function readMix(f) {
    var lines = [], n = C.int(val(f, 'rows'));
    for (var i = 0; i < n; i++) { var id = val(f, 'ing_' + i), kg = num(val(f, 'kg_' + i)); if (id && kg > 0) lines.push({ itemId: id, kg: kg }); }
    return { type: 'feed', kind: 'mix', outputItemId: val(f, 'outputItemId'), date: val(f, 'date'), recipeId: val(f, 'recipeId'), lines: lines };
  }
  LIVE.feedmix = function (f) {
    var m = readMix(f), p = C.mixPreview(st(), m), box = document.getElementById('mixLive'); if (!box) return;
    var bags = p.kg / C.settingsOf(st()).kgPerBag;
    box.innerHTML = kv('Total', (Math.round(p.kg * 100) / 100) + ' kg = ' + (Math.round(bags * 10) / 10) + ' bags') + (isRole('owner') ? kv('Ingredient cost', cur(p.totalCents)) + kv('Cost per bag', cur(p.perBagCents)) + kv('Cost per kg', cur(p.kg ? Math.round(p.totalCents / p.kg) : 0)) : '');
  };

  // RECIPES — written once in PARTS. "Maize 50, Soya 20 …" works for any batch size.
  routes.recipes = function () {
    var s = st(), owner = isRole('owner'), bagKg = C.settingsOf(s).kgPerBag;
    var out = back('feed', 'Feed') + head('Feed recipes', 'Each recipe is written in parts. Mixing works out the kg for any amount.', owner ? '<a class="btn gold sm" href="#recipe-edit/new">+ New recipe</a>' : '') + info('parts');
    if (!s.recipes.length) return out + '<div class="empty">No recipes yet.' + (owner ? ' Tap “+ New recipe”.' : ' The owner adds them.') + '</div>';
    return out + s.recipes.map(function (r) {
      var b = C.recipeBatch(s, r, bagKg);
      return '<div class="card" style="margin-bottom:12px"><div class="row between"><h2>' + esc(r.name) + '</h2><span class="tiny muted">makes ' + esc((item(r.outputItemId) || {}).name || '') + '</span></div>' +
        '<div class="scroll"><table><thead><tr><th>Ingredient</th><th class="right">Parts</th><th class="right">%</th><th class="right">In 1 bag (' + bagKg + ' kg)</th></tr></thead><tbody>' +
        b.lines.map(function (l) { return '<tr><td>' + esc((item(l.itemId) || {}).name || l.itemId) + '</td><td class="right">' + l.parts + '</td><td class="right">' + l.pct + '%</td><td class="right">' + l.kg + ' kg' + (l.litres !== null ? ' (' + l.litres + ' L)' : '') + '</td></tr>'; }).join('') +
        '<tr class="bold"><td>Total</td><td class="right">' + Math.round(b.parts * 100) / 100 + '</td><td class="right">100%</td><td class="right">' + bagKg + ' kg</td></tr></tbody></table></div>' +
        '<div class="row" style="gap:8px;margin-top:8px"><a class="btn gold sm" href="#feed-mix/' + esc(r.id) + '">Mix this</a>' + (owner ? '<a class="btn light sm" href="#recipe-edit/' + esc(r.id) + '">Change</a>' : '') + '</div></div>';
    }).join('');
  };
  routes['recipe-edit'] = function (id) {
    if (!isRole('owner')) return '<div class="empty">Only the owner can change recipes.</div>';
    var s = st(), r = id && id !== 'new' ? byId(s.recipes, id) : null, feeds = live(s.items).filter(function (i) { return i.category === 'feed'; });
    var ings = live(s.items).filter(function (i) { return i.category === 'ingredient' && i.active !== false; });
    var lines = r ? r.lines.slice() : [], want = Math.max(14, lines.length + 2); while (lines.length < want) lines.push({ itemId: '', kg: '' });
    return back('recipes', 'Recipes') + head(r ? 'Change recipe' : 'New recipe', 'Write each ingredient in parts — like a ratio. They do not have to add up to 100.') +
      '<form class="card stack" data-form="recipe" data-id="' + esc(r ? r.id : '') + '">' +
      '<label>Recipe name<input name="name" value="' + esc(r ? r.name : '') + '" placeholder="e.g. Layer mix A" required></label>' +
      '<label>Makes (feed type)<select name="outputItemId">' + (r ? '' : '<option value="__new__" selected>A new feed type with this recipe’s name (best)</option>') + feeds.map(function (i) { return opt(i.id, i.name, r ? r.outputItemId : ''); }).join('') + '</select></label>' +
      info('parts') + '<div class="small bold">Ingredients (parts)</div><div class="stack" style="gap:6px">' + lines.map(function (l, i) {
        return '<div class="grid" style="grid-template-columns:1fr 90px 60px;align-items:center"><select name="ing_' + i + '"><option value="">— ingredient —</option>' + ings.map(function (x) { return opt(x.id, x.name, l.itemId); }).join('') + '</select><input name="part_' + i + '" type="number" min="0" step="any" inputmode="decimal" placeholder="parts" value="' + esc(l.kg) + '"><span class="tiny muted" id="pct_' + i + '"></span></div>';
      }).join('') + '</div><input type="hidden" name="rows" value="' + lines.length + '">' +
      '<div id="recipeLive" class="card" style="background:var(--green-soft);border:0"></div>' +
      '<p class="tiny muted" style="margin:0">Missing an ingredient? Add it in Settings › Feed &amp; medicine items (category “ingredient”).</p>' +
      '<button class="btn gold" type="submit">Next: preview →</button>' + (r ? '<button class="btn light" type="button" data-act="recipeDelete" data-id="' + esc(r.id) + '">Delete this recipe</button>' : '') + '</form>';
  };
  function readRecipe(f) {
    var lines = [], n = C.int(val(f, 'rows'));
    for (var i = 0; i < n; i++) { var id = val(f, 'ing_' + i), p = num(val(f, 'part_' + i)); if (id && p > 0) lines.push({ itemId: id, kg: p, i: i }); }
    return { id: f.dataset.id || '', name: val(f, 'name').trim(), outputItemId: val(f, 'outputItemId'), lines: lines };
  }
  LIVE.recipe = function (f) {
    var r = readRecipe(f), total = C.recipeParts(r), bagKg = C.settingsOf(st()).kgPerBag, box = document.getElementById('recipeLive');
    for (var i = 0; i < C.int(val(f, 'rows')); i++) { var el = document.getElementById('pct_' + i); if (el) el.textContent = ''; }
    r.lines.forEach(function (l) { var el = document.getElementById('pct_' + l.i); if (el) el.textContent = total ? Math.round(l.kg / total * 1000) / 10 + '%' : ''; });
    if (box) box.innerHTML = kv('Total parts', String(Math.round(total * 100) / 100)) + kv('In 1 bag (' + bagKg + ' kg)', r.lines.map(function (l) { return (item(l.itemId) || {}).name + ' ' + (total ? Math.round(bagKg * l.kg / total * 100) / 100 : 0) + ' kg'; }).join(' · ') || '—');
  };
  function recipeRows(list) { var out = []; list.forEach(function (r) { r.lines.forEach(function (l) { out.push({ recipeId: r.id, recipeName: r.name, outputItemId: r.outputItemId, ingredientItemId: l.itemId, kg: l.kg }); }); }); return out; }
  function itemRows(list) { return list.map(function (i) { return { id: i.id, name: i.name, category: i.category, unit: i.unit, kgPerBag: i.kgPerBag, lowLevel: i.lowLevel, active: i.active !== false }; }); }
  FORMS.recipe = function (f) {
    var s = st(), r = readRecipe(f), errors = [], total = C.recipeParts(r), bagKg = C.settingsOf(s).kgPerBag;
    if (!r.name) errors.push('Write the recipe name.');
    if (r.lines.length < 2) errors.push('Add at least two ingredients with parts.');
    var seen = {}; r.lines.forEach(function (l) { if (seen[l.itemId]) errors.push((item(l.itemId) || {}).name + ' is listed twice.'); seen[l.itemId] = 1; });
    if (s.recipes.some(function (x) { return x.id !== r.id && x.name.toLowerCase() === r.name.toLowerCase(); })) errors.push('Another recipe already has this name.');
    var isNew = r.outputItemId === '__new__', newItem = null;
    if (!r.id) r.id = 'r-' + slug(r.name) + '-' + Date.now().toString(36).slice(-4);
    if (isNew) { newItem = { id: 'i-' + slug(r.name) + '-' + Date.now().toString(36).slice(-3), name: r.name, category: 'feed', unit: 'bag', kgPerBag: bagKg, lowLevel: 0, active: true }; r.outputItemId = newItem.id; }
    var rows = r.lines.map(function (l) { return [esc((item(l.itemId) || {}).name), l.kg + ' parts = ' + Math.round(l.kg / total * 1000) / 10 + '% → ' + Math.round(bagKg * l.kg / total * 100) / 100 + ' kg per bag']; });
    rows.unshift(['Makes', isNew ? 'new feed type “' + esc(r.name) + '”' : esc((item(r.outputItemId) || {}).name)]);
    preview({ title: 'Recipe · ' + esc(r.name), errors: errors, rows: rows, confirm: 'Save recipe', gold: true, doneMessage: 'Recipe saved ✓',
      onConfirm: async function () {
        if (newItem) await E.saveMaster('Items', itemRows(live(st().items)).concat([newItem]));
        var list = st().recipes.filter(function (x) { return x.id !== r.id; }).concat([{ id: r.id, name: r.name, outputItemId: r.outputItemId, lines: r.lines.map(function (l) { return { itemId: l.itemId, kg: l.kg }; }) }]);
        await E.saveMaster('Recipes', recipeRows(list)); return 'recipes';
      } });
  };
  ACT.recipeDelete = function (b) {
    var r = byId(st().recipes, b.dataset.id);
    preview({ title: 'Delete recipe · ' + esc(r.name) + '?', rows: [['Recipe', esc(r.name)], ['Feed already mixed', 'stays in the store']], confirm: 'Delete recipe',
      onConfirm: async function () { await E.saveMaster('Recipes', recipeRows(st().recipes.filter(function (x) { return x.id !== r.id; }))); return 'recipes'; } });
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
    var out = info('med') + head('Medicine store', 'Vaccines · dewormers · vitamins · disinfectants', '<div class="row"><a class="btn gold sm" href="#med-in">+ Stock in</a><a class="btn sm" href="#med-use">Record use</a></div>');
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
    var s = st(), meds = live(s.items).filter(function (i) { return i.category === 'medicine' && i.active !== false; }), fl = C.activeFlocks(s, today()).sort(function (a, b) { return a.coop - b.coop; });
    return back('store', 'Medicine store') + head('Record medicine used', 'For treatments that are not a task. Tick every coop that got it.') + '<form class="card" data-form="meduse"><label>Medicine / vaccine<select name="itemId">' + meds.map(function (i) { return opt(i.id, i.name + ' (' + i.unit + ')'); }).join('') + '</select></label>' +
      '<div><div class="small bold" style="margin-bottom:6px">Which coops?</div><div class="pills">' +
      '<label class="pill" style="display:inline-flex;align-items:center;gap:6px;flex-direction:row"><input type="checkbox" name="allcoops" style="width:auto;min-height:0"> All coops</label>' +
      fl.map(function (x) { return '<label class="pill" style="display:inline-flex;align-items:center;gap:6px;flex-direction:row"><input type="checkbox" name="mf_' + esc(x.id) + '" style="width:auto;min-height:0"> Coop ' + x.coop + '</label>'; }).join('') + '</div></div>' +
      '<div class="grid g2"><label>Amount<select name="split">' + opt('each', 'for EACH coop') + opt('total', 'in TOTAL (shared by birds)') + '</select></label>' +
      '<label>Quantity<input name="qty" type="number" min="0" step="any" inputmode="decimal" required></label></div>' +
      '<div id="medLive" class="alert ok small"></div>' +
      '<label>Date<input type="date" name="date" value="' + today() + '" max="' + today() + '"></label><label>Note<input name="note" placeholder="e.g. 2 birds sneezing"></label><button class="btn" type="submit">Next: preview →</button></form>';
  };
  function readMedUse(f) {
    var s = st(), it = item(val(f, 'itemId')), all = val(f, 'allcoops'), date = val(f, 'date');
    var fl = C.activeFlocks(s, date).filter(function (x) { return all || val(f, 'mf_' + x.id); }).sort(function (a, b) { return a.coop - b.coop; });
    var qty = num(val(f, 'qty')), each = val(f, 'split') === 'each', lines = [];
    if (each) fl.forEach(function (x) { lines.push({ flock: x, qty: qty }); });
    else {
      var w = fl.map(function (x) { return Math.max(0, C.birdsAlive(s, x, date)); }), sumW = w.reduce(function (a, b) { return a + b; }, 0);
      fl.forEach(function (x, i) { lines.push({ flock: x, qty: sumW ? Math.round(qty * w[i] / sumW * 1000) / 1000 : Math.round(qty / fl.length * 1000) / 1000 }); });
    }
    var total = lines.reduce(function (a, l) { return a + l.qty; }, 0);
    return { it: it, lines: lines, total: Math.round(total * 1000) / 1000, date: date, note: val(f, 'note').trim() };
  }
  LIVE.meduse = function (f) {
    if (f.elements.allcoops && f.elements.allcoops.checked) C.activeFlocks(st(), today()).forEach(function (x) { var el = f.elements['mf_' + x.id]; if (el) el.checked = true; });
    var r = readMedUse(f), box = document.getElementById('medLive'); if (!box) return;
    box.textContent = r.lines.length ? r.lines.map(function (l) { return 'Coop ' + l.flock.coop + ': ' + l.qty; }).join(' · ') + ' = ' + r.total + ' ' + (r.it ? r.it.unit : '') + ' in total' : 'Tick at least one coop.';
  };
  FORMS.meduse = function (f) {
    var r = readMedUse(f), ms = C.medState(st(), today()).items[r.it.id] || { qty: 0 }, errors = [], warnings = [];
    if (!r.lines.length) errors.push('Tick at least one coop.');
    if (!(r.total > 0)) errors.push('Enter the quantity.');
    if (r.total > ms.qty) warnings.push('Store shows only ' + ms.qty + ' ' + r.it.unit + ' of ' + r.it.name + '. Record the stock that came in first.');
    preview({ title: 'Medicine used · ' + r.it.name, errors: errors, warnings: warnings,
      rows: r.lines.map(function (l) { return ['Coop ' + l.flock.coop, l.qty + ' ' + esc(r.it.unit)]; }).concat([['Total', r.total + ' ' + esc(r.it.unit)], ['Left in store', (Math.round((ms.qty - r.total) * 100) / 100) + ' ' + esc(r.it.unit)], ['Date', dLong(r.date)]]),
      onConfirm: async function () {
        await E.save(r.lines.map(function (l) { return { type: 'med', kind: 'use', itemId: r.it.id, qty: l.qty, flockId: l.flock.id, coop: l.flock.coop, date: r.date, note: r.note }; }));
        return 'store';
      } });
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
    var out = head('Profit', 'Per coop, added up for the whole farm') + info('profit') + monthNav('profit', m);
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

  // ================================================================ HISTORY — every entry, by day / week / month, by person
  var HCATS = [['all', 'Everything'], ['eggs', 'Eggs & birds'], ['tasks', 'Tasks & emergencies'], ['feed', 'Feed'], ['med', 'Medicine'], ['crates', 'Crates out / returns'],
    ['sales', 'Sales'], ['payments', 'Debt payments'], ['customers', 'Customers'], ['waiting', 'Waiting list'], ['expenses', 'Expenses'], ['flocks', 'Coops / flocks']];
  function histCats() {
    var r = role();
    if (r === 'owner') return HCATS;
    if (r === 'sales') return HCATS.filter(function (c) { return ['all', 'sales', 'payments', 'customers', 'waiting', 'crates', 'tasks'].indexOf(c[0]) >= 0; });
    var ok = r === 'manager' ? ['all', 'eggs', 'tasks', 'feed', 'med', 'crates', 'waiting', 'flocks'] : ['all', 'eggs', 'tasks', 'feed', 'med', 'flocks'];
    return HCATS.filter(function (c) { return ok.indexOf(c[0]) >= 0; });
  }
  function timeOf(iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function allEntries() {
    var s = st(), out = [], money = seesMoney(), owner = isRole('owner');
    function add(cat, date, by, at, text, href, rec, coops) {
      var edited = rec && rec.createdAt && rec.updatedAt && (rec.updatedAt - Date.parse(rec.createdAt) > 60000) && !rec._dirty;
      out.push({ cat: cat, date: date, by: by || '', at: at || '', text: text, href: href || '', edited: !!edited, coops: (coops || []).map(C.int).filter(Boolean), rec: rec && rec.type && rec.id ? rec : null });
    }
    live(s.daily).forEach(function (x) {
      var e = C.dailyEggs(s, x), fl = flock(x.flockId) || {}, n = C.dayRecords(s, x.flockId, x.date).length;
      var bits = [crates(e.good) + ' good', e.cracked + ' cracked'];
      if (C.int(x.deaths)) bits.push(x.deaths + ' died'); if (C.int(x.culls)) bits.push(x.culls + ' culled');
      if (C.feedKgOf(s, x)) bits.push((Math.round(C.feedKgOf(s, x) * 10) / 10) + ' kg feed');
      add('eggs', x.date, x.by, x.createdAt, '<b>Coop ' + esc(fl.coop || x.coop) + '</b> ' + (n > 1 ? 'collection' : 'daily record') + ': ' + bits.join(' · ') + (x.notes ? ' <span class="tiny muted">“' + esc(x.notes) + '”</span>' : ''), (fl.id ? 'coop/' + fl.id : ''), x, [fl.coop || x.coop]);
    });
    live(s.tasks).forEach(function (x) {
      if (x.kind === 'Emergency') add('tasks', x.date, x.by, x.createdAt, '<span class="red bold">Emergency reported</span> · ' + esc(whereText(x)) + ': ' + esc(x.title), 'task/' + x.id, x, x.coops);
      else if (!x.auto && x.by) add('tasks', String(x.createdAt || '').slice(0, 10) || x.date, x.by, x.createdAt, 'New task added: ' + esc(x.kind) + ' · ' + esc(x.title) + ' · due ' + dShort(x.date), 'task/' + x.id, null, x.coops);
      if (x.status !== 'open' && x.doneAt && x.doneBy && x.doneNote !== 'Before the app was used')
        add('tasks', x.doneAt, x.doneBy, '', (x.kind === 'Emergency' ? 'Emergency handled' : 'Task done') + ': ' + chipFor(x.kind) + ' ' + esc(x.title) + ' · ' + esc(whereText(x)) + (x.doneNote ? ' <span class="tiny muted">“' + esc(x.doneNote) + '”</span>' : ''), 'task/' + x.id, null, x.coops);
    });
    live(s.feed).forEach(function (x) {
      if (x.kind === 'buy') add('feed', x.date, x.by, x.createdAt, 'Feed bought: ' + num(x.qty) + ' ' + esc(x.qtyUnit) + ' ' + esc((item(x.itemId) || {}).name || '') + (owner || money ? ' · ' + curN(x.cost) : '') + (x.supplier ? ' · ' + esc(x.supplier) : ''), 'feed', x);
      else if (x.kind === 'mix') add('feed', x.date, x.by, x.createdAt, 'Feed mixed: ' + (x.lines || []).reduce(function (a, l) { return a + num(l.kg); }, 0) + ' kg of ' + esc((item(x.outputItemId) || {}).name || ''), 'feed', x);
      else add('feed', x.date, x.by, x.createdAt, 'Feed stock change: ' + esc((item(x.itemId) || {}).name || ''), 'feed', x);
    });
    live(s.med).forEach(function (x) {
      var it = item(x.itemId) || {};
      if (x.kind === 'in') add('med', x.date, x.by, x.createdAt, 'Medicine bought: ' + num(x.qty) + ' ' + esc(it.unit || '') + ' ' + esc(it.name || '') + (owner ? ' · ' + curN(x.cost) : '') + (x.expiry ? ' · expires ' + dShort(x.expiry) : ''), 'store', x);
      else if (x.kind === 'use') add('med', x.date, x.by, x.createdAt, 'Medicine used: ' + num(x.qty) + ' ' + esc(it.unit || '') + ' ' + esc(it.name || '') + (x.coop ? ' · Coop ' + esc(x.coop) : '') + (x.note ? ' <span class="tiny muted">“' + esc(x.note) + '”</span>' : ''), 'store', x, [x.coop || (flock(x.flockId) || {}).coop]);
      else add('med', x.date, x.by, x.createdAt, 'Medicine stock change: ' + esc(it.name || ''), 'store', x);
    });
    live(s.stock).forEach(function (x) {
      var who = x.salesUserId ? userName(x.salesUserId) : '';
      var txt = x.kind === 'out' ? 'Eggs given to ' + esc(who) : x.kind === 'return' ? 'Eggs returned by ' + esc(who) : 'Egg store corrected: ' + (x.pieces > 0 ? '+' : '') + C.int(x.pieces) + ' ' + esc(x.eggKind || '') + (x.reason ? ' · ' + esc(x.reason) : '');
      if (x.kind === 'out' || x.kind === 'return') txt += ': ' + stockLinesText(x) + (C.int(x.brokenGood) || C.int(x.brokenCracked) ? ' · broken ' + (C.int(x.brokenGood) + C.int(x.brokenCracked)) : '');
      add('crates', x.date, x.by, x.createdAt, txt, 'crates', x);
      out[out.length - 1].forUser = x.salesUserId || '';
    });
    live(s.sales).forEach(function (x) {
      var tt = C.saleTotals(x), c = cust(x.customerId) || {};
      add('sales', x.date, x.by, x.createdAt, 'Sale ' + esc(x.receiptNo || '') + ' to <b>' + esc(c.name || '') + '</b> · ' + cur(tt.totalCents) + ' · paid ' + cur(tt.paidCents) + (tt.totalCents > tt.paidCents ? ' · <span class="red">owes ' + cur(tt.totalCents - tt.paidCents) + '</span>' : ''), 'receipt/' + x.id, x);
    });
    live(s.payments).forEach(function (x) {
      add('payments', x.date, x.by, x.createdAt, 'Debt payment from <b>' + esc((cust(x.customerId) || {}).name || '') + '</b> · ' + curN(x.amount) + ' ' + esc(x.method || ''), 'preceipt/' + x.id, x);
    });
    live(s.customers).forEach(function (x) {
      add('customers', String(x.createdAt || '').slice(0, 10), x.by, x.createdAt, 'New customer: <b>' + esc(x.name) + '</b>' + (x.phone ? ' · ' + esc(x.phone) : '') + ' · ' + (x.credit ? 'part payment allowed' : 'cash only'), 'customer/' + x.id, x);
    });
    live(s.moves).forEach(function (x) {
      var a1 = flock(x.fromFlockId) || {}, b1 = flock(x.toFlockId) || {};
      add('flocks', x.date, x.by, x.createdAt, 'Moved <b>' + C.int(x.birds) + ' ' + esc(x.colour || '') + ' birds</b> from Coop ' + esc(a1.coop) + ' to Coop ' + esc(b1.coop) + (x.note ? ' <span class="tiny muted">“' + esc(x.note) + '”</span>' : ''), 'coop/' + x.toFlockId, x, [a1.coop, b1.coop]);
    });
    live(s.waiting).forEach(function (x) {
      add('waiting', x.date, x.by, x.createdAt, 'Added to waiting list: <b>' + esc(x.name) + '</b> wants ' + esc(C.waitWants(s, x)), 'waiting-item/' + x.id);
      (x.calls || []).forEach(function (c) { add('waiting', c.date, c.by, '', 'Called <b>' + esc(x.name) + '</b>: ' + ({ waiting: 'still waiting', bought: 'bought ✓', not: 'not interested' }[c.result] || c.result) + (c.note ? ' <span class="tiny muted">“' + esc(c.note) + '”</span>' : ''), 'waiting-item/' + x.id); });
    });
    live(s.expenses).forEach(function (x) {
      add('expenses', x.date, x.by, x.createdAt, 'Expense: ' + esc(x.category || '') + ' · ' + curN(x.amount) + (C.int(x.coop) ? ' · Coop ' + x.coop : ' · whole farm') + (x.note ? ' <span class="tiny muted">“' + esc(x.note) + '”</span>' : ''), 'expenses/' + String(x.date).slice(0, 7), x, [x.coop]);
    });
    live(s.flocks).forEach(function (x) {
      add('flocks', String(x.createdAt || '').slice(0, 10) || x.arrival, x.by, x.createdAt, 'Flock started in <b>Coop ' + esc(x.coop) + '</b>: ' + C.int(x.chicks).toLocaleString() + ' birds' + (x.breed ? ' · ' + esc(x.breed) : ''), 'coop/' + x.id, x, [x.coop]);
      if (x.status === 'closed' && x.closedOn) add('flocks', x.closedOn, x.closedBy || x.by, '', 'Flock closed in Coop ' + esc(x.coop), 'coop/' + x.id, null, [x.coop]);
    });
    var cats = histCats().map(function (c) { return c[0]; }), r = role(), uid = me().id;
    return out.filter(function (e) {
      if (!e.date || cats.indexOf(e.cat) < 0) return false;
      if (r === 'sales') return e.by === uid || e.forUser === uid;
      if (e.cat === 'waiting' && r === 'farmhand') return false;
      return true;
    });
  }
  function stockLinesText(x) {
    var p = 0, cr = 0;
    (x.lines || []).forEach(function (l) { var e = C.lineEggs(st(), l); p += C.int(e.good); cr += C.int(e.cracked); });
    return crates(p) + ' good' + (cr ? ' + ' + cr + ' cracked' : '');
  }
  // HISTORY — every entry for a day, a week (default), a month, any range From–To, or all time; filter by person, type and coop.
  function histLink(m, d, who, cat, coop) { return '#history/' + m + '/' + d + '/' + (who || 'all') + '/' + (cat || 'all') + '/' + (coop || 'all'); }
  routes.history = function (mode, date, who, cat, coop) {
    var t = today(), r = role(), uid = me().id, s = st();
    mode = ['day', 'week', 'month', 'range', 'all'].indexOf(mode) >= 0 ? mode : 'week';
    var from, to;
    if (mode === 'range') {
      var m2 = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(date || '');
      from = m2 ? m2[1] : C.addDays(t, -29); to = m2 ? m2[2] : t;
      if (from > to) { var x0 = from; from = to; to = x0; }
      date = from + '_' + to;
    } else {
      date = /^\d{4}-\d{2}(-\d{2})?$/.test(date || '') ? date : t;
      if (mode === 'month') date = date.slice(0, 7); else if (date.length === 7) date = date + '-01';
      if (mode === 'week') date = C.weekStart(date);
      from = mode === 'day' || mode === 'week' ? date : mode === 'month' ? date + '-01' : '';
      to = mode === 'day' ? date : mode === 'week' ? C.addDays(date, 6) : mode === 'month' ? C.lastDayOfMonth(date) : '';
    }
    who = r === 'sales' ? 'me' : (who || 'all'); cat = cat || 'all'; coop = coop && coop !== 'all' ? String(C.int(coop)) : 'all';
    var all = allEntries();
    if (mode === 'all') { from = all.reduce(function (a, e) { return !a || e.date < a ? e.date : a; }, '') || t; to = t; }
    var base = all.filter(function (e) {
      var u = who === 'me' ? uid : who;
      if (who !== 'all' && e.by !== u) return false;
      if (coop !== 'all' && e.coops.indexOf(+coop) < 0) return false;
      return cat === 'all' || e.cat === cat;
    });
    var list = base.filter(function (e) { return e.date >= from && e.date <= to; });
    list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.at < b.at ? 1 : a.at > b.at ? -1 : 0); });
    var link = function (m, d, w, c, k) { return histLink(m, d, w || who, c || cat, k || coop); };
    var pill = function (m, l, d) { return '<a class="pill ' + (mode === m ? 'on' : '') + '" href="' + link(m, d) + '" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">' + l + '</a>'; };
    var anchor = mode === 'range' ? to : mode === 'month' ? date + '-01' : mode === 'all' ? t : date, prev, next;
    if (mode === 'month') { prev = C.monthOf(C.addMonths(date + '-01', -1)); next = C.monthOf(C.addMonths(date + '-01', 1)); }
    else if (mode === 'day' || mode === 'week') { prev = C.addDays(date, mode === 'day' ? -1 : -7); next = C.addDays(date, mode === 'day' ? 1 : 7); }
    var title = mode === 'day' ? dLong(from) : mode === 'week' ? 'Week ' + dShort(from) + ' – ' + dShort(to) + ' ' + to.slice(0, 4) : mode === 'month' ? monthName(date)
      : mode === 'range' ? dShort(from) + ' ' + from.slice(0, 4) + ' – ' + dShort(to) + ' ' + to.slice(0, 4) : 'All time';
    var out = head(r === 'sales' ? 'My history' : 'History', 'Every entry, who made it and when' + (seesMoney() ? '' : ' · money is not shown'));
    out += '<div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap">' + pill('day', 'Day', anchor) + pill('week', 'Week', anchor) + pill('month', 'Month', anchor.slice(0, 7)) + pill('range', 'From – To', C.addDays(to > t || mode === 'all' ? t : to, -29) + '_' + (to > t || mode === 'all' ? t : to)) + pill('all', 'All', t) + '</div>';
    if (mode === 'range') out += '<div class="grid g2" style="margin-bottom:8px;align-items:end"><label class="small">From<input type="date" id="histFrom" value="' + from + '"></label><label class="small">To<input type="date" id="histTo" value="' + to + '"></label></div><button class="btn light sm" type="button" data-act="histRange" style="margin-bottom:8px">Show this range</button>';
    else if (mode !== 'all') out += '<div class="row" style="gap:8px;margin-bottom:8px"><a class="btn light sm" href="' + link(mode, prev) + '" aria-label="Before">‹</a>' +
      (mode === 'month' ? '<input type="month" value="' + date + '" data-act-change="histPick" data-mode="month" aria-label="Choose a month" style="min-height:40px;width:auto">'
        : '<input type="date" value="' + from + '" data-act-change="histPick" data-mode="' + mode + '" aria-label="Choose a day" style="min-height:40px;width:auto">') +
      '<a class="btn light sm" href="' + link(mode, next) + '" aria-label="After">›</a>' + (mode === 'day' && date !== t ? '<a class="btn light sm" href="' + link('day', t) + '">Today</a>' : mode === 'week' && date !== C.weekStart(t) ? '<a class="btn light sm" href="' + link('week', t) + '">This week</a>' : '') + '</div>';
    var people = live(s.users).filter(function (u) { return u.role !== 'owner' || r === 'owner'; });
    var coops = {}; live(s.flocks).forEach(function (f) { coops[C.int(f.coop)] = 1; });
    out += '<div class="grid g3" style="margin-bottom:12px">' + (r === 'sales' ? '' : '<label class="small">Who<select data-act-change="histWho">' + opt('all', 'Everyone', who) + opt('me', 'Only my entries', who) +
      (r === 'owner' ? people.filter(function (u) { return u.id !== uid; }).map(function (u) { return opt(u.id, u.name + ' · ' + u.role, who); }).join('') : '') + '</select></label>') +
      '<label class="small">Type<select data-act-change="histCat">' + histCats().map(function (c) { return opt(c[0], c[1], cat); }).join('') + '</select></label>' +
      (r === 'sales' ? '' : '<label class="small">Coop<select data-act-change="histCoop">' + opt('all', 'All coops', coop) + Object.keys(coops).sort(function (a, b) { return a - b; }).map(function (k) { return opt(k, 'Coop ' + k, coop); }).join('') + '</select></label>') + '</div>';
    if (r !== 'sales') out += histCoopSummary(from, to, coop, title);
    out += '<div class="card" style="margin-top:12px"><div class="row between"><h2>Entries · ' + esc(title) + '</h2><span class="tiny muted">' + list.length + ' entr' + (list.length === 1 ? 'y' : 'ies') + '</span></div>';
    if (!list.length) out += '<div class="empty">No entries ' + (mode === 'day' ? 'on this day' : 'in this period') + (who !== 'all' ? ' by ' + esc(who === 'me' ? 'you' : userName(who)) : '') + (coop !== 'all' ? ' for Coop ' + coop : '') + '.</div>';
    var lastDate = '', shown = list.slice(0, 400), canDelete = realRole() === 'owner' && !S.viewAs;
    if (canDelete) out += '<p class="tiny muted" style="margin:0 0 4px">Owner: tap 🗑 to delete a wrong entry. It goes to the <a href="#bin">Bin</a> for 30 days.</p>';
    shown.forEach(function (e) {
      if (e.date !== lastDate && mode !== 'day') { out += '<div class="bold small" style="margin-top:12px;padding-top:8px;border-top:1px solid #F0ECE1"><a href="' + link('day', e.date) + '" style="color:inherit">' + dLong(e.date) + '</a></div>'; lastDate = e.date; }
      out += '<div class="small" style="padding:7px 0;border-bottom:1px solid #F6F3EA;display:flex;gap:8px;align-items:flex-start">' +
        '<span class="tiny muted" style="min-width:38px">' + (timeOf(e.at) || '') + '</span><div class="grow">' + (e.href ? '<a href="#' + e.href + '" style="color:inherit;text-decoration:none">' + e.text + '</a>' : e.text) +
        '<div class="tiny muted">by ' + esc(userName(e.by) || '—') + (e.edited ? ' · <span class="red">edited later</span>' : '') + '</div></div>' +
        (canDelete && e.rec ? '<button class="btn light sm" style="min-height:32px;padding:4px 10px" type="button" data-act="delRec" data-type="' + esc(e.rec.type) + '" data-id="' + esc(e.rec.id) + '" data-back="history" aria-label="Delete this entry">🗑</button>' : '') + '</div>';
    });
    if (list.length > shown.length) out += '<div class="tiny muted" style="margin-top:8px">Showing the newest 400. Choose a shorter period to see the rest.</div>';
    out += '</div>';
    var days = {}; base.forEach(function (e) { days[e.date] = (days[e.date] || 0) + 1; });
    var dl = Object.keys(days).sort().reverse();
    out += '<div class="card" style="margin-top:12px"><h2>' + (who === 'me' ? 'Days you made entries' : who !== 'all' ? 'Days ' + esc(userName(who)) + ' made entries' : 'Days with entries') + '</h2>' +
      (dl.length ? '<div class="pills" style="margin-top:6px">' + dl.slice(0, 120).map(function (d) { return '<a class="pill' + (mode === 'day' && d === date ? ' on' : '') + '" style="text-decoration:none;color:inherit;min-height:0;padding:6px 12px" href="' + link('day', d) + '">' + dShort(d) + (d.slice(0, 4) !== t.slice(0, 4) ? ' ' + d.slice(0, 4) : '') + ' · ' + days[d] + '</a>'; }).join('') + '</div>' +
        (dl.length > 120 ? '<div class="tiny muted">Newest 120 days shown — use Month or From – To to go further back.</div>' : '') : '<div class="empty">No entries yet.</div>') + '</div>';
    return out;
  };
  // Summary per coop for the chosen period (no money — see Profit for money per coop).
  function histCoopSummary(from, to, coop, title) {
    var cs = C.coopSummary(st(), from, to), rows = coop === 'all' ? cs.rows : cs.rows.filter(function (x) { return x.coop === +coop; });
    if (!rows.length) return '<div class="card"><h2>Coop summary</h2><div class="empty">No coop had birds in this period.</div></div>';
    if (coop !== 'all') {
      var x = rows[0];
      return '<div class="card"><div class="row between"><h2>Coop ' + x.coop + ' · ' + esc(title) + '</h2><span class="chip">' + esc(x.stage) + ' · week ' + x.week + '</span></div>' +
        kv('Birds', x.birdsStart.toLocaleString() + ' at the start → ' + x.birdsEnd.toLocaleString() + ' at the end') +
        kv('Eggs collected', crates(x.eggs) + ' (' + x.cracked + ' cracked) · ' + x.records + ' collections', 'bold') +
        (twoColours() ? kv('… by colour', 'white ' + crates(x.white.good + x.white.cracked) + ' · brown ' + crates(x.brown.good + x.brown.cracked)) : '') + kv('Lay rate', x.layRate + '%') +
        kv('Died / culled', x.deaths + ' / ' + x.culls, x.deaths ? 'red' : '') + kv('Feed used', x.feedKg + ' kg' + (x.gramsPerBird ? ' · ' + x.gramsPerBird + ' g per bird a day' : '')) +
        kv('Medicine used', x.med.length ? x.med.map(function (m) { return m.qty + ' ' + esc(m.unit) + ' ' + esc(m.item); }).join(', ') : 'none') +
        kv('Tasks done', String(x.tasksDone)) + (x.overdue ? kv('Tasks overdue now', '<span class="red bold">' + x.overdue + '</span>') : '') +
        (isRole('owner') ? '<a class="btn light sm" style="margin-top:8px" href="#profit">Money for this coop → Profit</a>' : '') + '</div>';
    }
    var T = rows.reduce(function (a, x) { ['eggs', 'cracked', 'deaths', 'culls', 'feedKg', 'tasksDone', 'birdsEnd'].forEach(function (k) { a[k] += x[k]; }); return a; }, { eggs: 0, cracked: 0, deaths: 0, culls: 0, feedKg: 0, tasksDone: 0, birdsEnd: 0 });
    return '<div class="card"><h2>Summary per coop · ' + esc(title) + '</h2><p class="tiny muted" style="margin:0 0 6px">Tap a coop to see only that coop.</p><div class="scroll"><table><thead><tr><th>Coop</th><th class="right">Eggs</th><th class="right">Lay %</th><th class="right">Died</th><th class="right">Feed</th><th class="right">Medicine</th><th class="right">Tasks</th><th class="right">Birds</th></tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr><td><a href="' + histLink('range', from + '_' + to, 'all', 'all', x.coop) + '"><b>Coop ' + x.coop + '</b></a><div class="tiny muted">' + esc(x.stage) + (twoColours() ? ' · ' + x.colours.map(colWord).join('+').toLowerCase() : '') + '</div></td><td class="right">' + crates(x.eggs) + '<div class="tiny muted">' + x.cracked + ' cracked</div></td><td class="right">' + x.layRate + '%</td><td class="right ' + (x.deaths ? 'red' : '') + '">' + (x.deaths + x.culls) + '</td><td class="right">' + x.feedKg + ' kg</td><td class="right">' + (x.med.length || '—') + '</td><td class="right">' + x.tasksDone + (x.overdue ? ' <span class="red">(' + x.overdue + ' late)</span>' : '') + '</td><td class="right">' + x.birdsEnd.toLocaleString() + '</td></tr>';
      }).join('') + '<tr class="bold"><td>All</td><td class="right">' + crates(T.eggs) + '</td><td class="right">' + cs.total.layRate + '%</td><td class="right">' + (T.deaths + T.culls) + '</td><td class="right">' + Math.round(T.feedKg * 10) / 10 + ' kg</td><td></td><td class="right">' + T.tasksDone + '</td><td class="right">' + T.birdsEnd.toLocaleString() + '</td></tr></tbody></table></div></div>';
  }
  function histParts() { var p = location.hash.slice(1).split('/'); return { mode: p[1] || 'week', date: p[2] || today(), who: p[3] || 'all', cat: p[4] || 'all', coop: p[5] || 'all' }; }
  ACT.histPick = function (el) { if (!el.value) return; var p = histParts(); go(histLink(el.dataset.mode, el.value, p.who, p.cat, p.coop).slice(1)); };
  ACT.histWho = function (el) { var p = histParts(); go(histLink(p.mode, p.date, el.value, p.cat, p.coop).slice(1)); };
  ACT.histCat = function (el) { var p = histParts(); go(histLink(p.mode, p.date, p.who, el.value, p.coop).slice(1)); };
  ACT.histCoop = function (el) { var p = histParts(); go(histLink(p.mode, p.date, p.who, p.cat, el.value).slice(1)); };
  ACT.histRange = function () { var p = histParts(), f = document.getElementById('histFrom').value, t2 = document.getElementById('histTo').value; if (!f || !t2) return toast('Choose both dates.'); go(histLink('range', f + '_' + t2, p.who, p.cat, p.coop).slice(1)); };

  // ================================================================ MOVE BIRDS between coops
  routes['move-birds'] = function (fromId) {
    var s = st(), t = today(), from = flock(fromId);
    if (!from || from.status !== 'active') return back('coops', 'Coops') + '<div class="empty">Choose a coop with birds first.</div>';
    var alive = C.birdsAlive(s, from, t), col = C.flockColour(s, from);
    return back('coop/' + from.id, 'Coop ' + from.coop) + head('Move birds from Coop ' + from.coop, alive.toLocaleString() + ' ' + col + '-egg birds there now') +
      '<form class="card stack" data-form="move" data-from="' + esc(from.id) + '">' +
      '<div class="grid g2"><label>How many birds<input name="birds" type="number" min="1" step="1" inputmode="numeric" required></label><label>To coop<select name="toCoop">' +
      coops().filter(function (c) { return c !== C.int(from.coop); }).map(function (c) { var f = C.flockInCoop(s, c, t); return opt(c, 'Coop ' + c + (f ? ' · ' + C.birdsAlive(s, f, t) + ' ' + C.flockColour(s, f) + '-egg birds' : ' · empty')); }).join('') + '</select></label></div>' +
      '<div class="grid g2"><label>Date<input type="date" name="date" value="' + t + '" max="' + t + '"></label><label>Why (note)<input name="note" placeholder="e.g. too crowded, sorting by colour"></label></div>' +
      '<button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.move = function (f) {
    var s = st(), t = today(), from = flock(f.dataset.from), n = C.int(val(f, 'birds')), toCoop = C.int(val(f, 'toCoop')), date = val(f, 'date') || t;
    var to = C.flockInCoop(s, toCoop, date), alive = C.birdsAlive(s, from, date), col = C.flockColour(s, from), errors = [], warnings = [];
    if (!(n > 0)) errors.push('Type how many birds.');
    if (n > alive) errors.push('Coop ' + from.coop + ' has only ' + alive + ' birds.');
    if (to && C.flockColour(s, to) !== col) warnings.push('Coop ' + toCoop + ' has ' + C.flockColour(s, to) + '-egg layers. After the move it will have white AND brown layers — its daily record will ask for white and brown eggs apart.');
    if (to && C.flockAge(s, to, date).week !== C.flockAge(s, from, date).week) warnings.push('The birds are a different age from Coop ' + toCoop + '’s birds (week ' + C.flockAge(s, from, date).week + ' vs week ' + C.flockAge(s, to, date).week + '). Coop ' + toCoop + ' keeps its own age.');
    preview({ title: 'Move ' + n + ' birds', errors: errors, warnings: warnings, gold: true,
      rows: [['From', 'Coop ' + from.coop + ' (' + alive + ' → ' + (alive - n) + ' birds)'], ['To', 'Coop ' + toCoop + (to ? ' (' + C.birdsAlive(s, to, date) + ' → ' + (C.birdsAlive(s, to, date) + n) + ' birds)' : ' — empty now: a new flock starts there with the same age and colour')], ['Birds', n + ' ' + col + '-egg layers'], ['Date', dLong(date)]],
      onConfirm: async function () {
        var recs = [], target = to;
        if (!target) { target = { type: 'flocks', id: E.uid(), coop: toCoop, breed: from.breed || '', arrival: from.arrival, chicks: 0, costPerChick: 0, status: 'active', colour: col, movedFrom: from.id, note: 'Birds moved from Coop ' + from.coop }; recs.push(target); }
        recs.push({ type: 'moves', date: date, fromFlockId: from.id, toFlockId: target.id, fromCoop: C.int(from.coop), toCoop: toCoop, birds: n, colour: col, note: val(f, 'note').trim() });
        await E.save(recs); return 'coop/' + target.id;
      } });
  };

  // ================================================================ WAITING LIST — people who want to buy before it is ready
  var WAIT_RESULT = { waiting: 'Still waiting — call again later', bought: 'Bought ✓', not: 'Not interested any more' };
  routes.waiting = function (filter) {
    var s = st(), t = today(), L = C.waitingList(s, me(), t), prods = live(s.products).filter(function (p) { return p.active !== false; });
    filter = filter || 'all';
    var match = function (x) { return filter === 'all' || x.w.productId === filter || (filter === 'other' && !x.w.productId); };
    var row = function (x) {
      var w = x.w, late = w.nextCall && w.nextCall < t;
      return '<a class="item" href="#waiting-item/' + esc(w.id) + '"><div class="grow"><div class="t">' + esc(w.name) + ' <span class="tiny muted">' + esc(w.phone || '') + '</span></div>' +
        '<div class="sub">wants <b>' + esc(x.wants) + '</b> · asked ' + x.days + ' day' + (x.days === 1 ? '' : 's') + ' ago' + (isRole('owner', 'manager') ? ' · by ' + esc(userName(w.by)) : '') + '</div>' +
        (w.status === 'waiting' ? '<div class="sub ' + (late ? 'red bold' : '') + '">' + (w.nextCall <= t ? '📞 Call ' + (late ? 'now — was due ' + dShort(w.nextCall) : 'today') : 'Next call ' + dShort(w.nextCall)) + '</div>' : '<div class="sub">' + esc(WAIT_RESULT[w.status] || w.status) + ' · ' + dShort(w.closedOn || '') + '</div>') + '</div>›</a>';
    };
    var used = {}; live(s.waiting).forEach(function (w) { if (w.status === 'waiting') used[w.productId || 'other'] = (used[w.productId || 'other'] || 0) + 1; });
    var out = head('Waiting list', 'People who want to buy before it is ready. The app reminds you to call them.', '<a class="btn gold sm" href="#waiting-new">+ Add person</a>');
    out += '<label class="small" style="margin-bottom:10px">Show people waiting for<select data-act-change="waitFilter">' + opt('all', 'Everything (' + L.open + ')', filter) +
      prods.filter(function (p) { return used[p.id]; }).map(function (p) { return opt(p.id, p.name + ' (' + used[p.id] + ')', filter); }).join('') + (used.other ? opt('other', 'Other things (' + used.other + ')', filter) : '') + '</select></label>';
    var now = L.callNow.filter(match), later = L.later.filter(match), closed = L.closed.filter(match).slice(0, 30);
    out += '<div class="card"><h2>📞 Call now (' + now.length + ')</h2>' + (now.length ? '<div class="list">' + now.map(row).join('') + '</div>' : '<div class="empty">Nobody to call today.</div>') + '</div>';
    out += '<div class="card" style="margin-top:12px"><h2>Waiting (' + later.length + ')</h2>' + (later.length ? '<div class="list">' + later.map(row).join('') + '</div>' : '<div class="empty">Nobody else is waiting.</div>') + '</div>';
    if (filter !== 'all' && (now.length + later.length)) {
      var msg = 'Hello, this is ' + farmName() + '. The ' + ((byId(s.products, filter) || {}).name || 'item') + ' you asked for is now ready. Please call us or reply to this message. Thank you!';
      out += '<div class="card" style="margin-top:12px"><h2>It’s ready? Tell them</h2><p class="tiny muted" style="margin:0 0 8px">Oldest request first. Tap each name to send the WhatsApp message.</p>' +
        now.concat(later).sort(function (a, b) { return a.w.date < b.w.date ? -1 : 1; }).map(function (x) { return x.w.phone ? '<a class="btn wa sm" style="margin:0 6px 6px 0" target="_blank" rel="noopener" href="' + waLink(x.w.phone, 'Hello ' + x.w.name + '. ' + msg) + '">' + esc(x.w.name) + '</a>' : ''; }).join('') + '</div>';
    }
    if (closed.length) out += '<details class="card" style="margin-top:12px"><summary class="bold">Finished (' + closed.length + ')</summary><div class="list">' + closed.map(row).join('') + '</div></details>';
    return out;
  };
  ACT.waitFilter = function (el) { go('waiting/' + el.value); };
  routes['waiting-new'] = function () {
    var s = st(), A = C.alarmSettings(s), prods = live(s.products).filter(function (p) { return p.active !== false; });
    return back('waiting', 'Waiting list') + head('Add to waiting list', 'Write who wants what. The app reminds you to call them.') +
      '<form class="card stack" data-form="waitnew"><div class="grid g2"><label>Name<input name="name" required></label><label>Phone<input name="phone" type="tel" inputmode="tel" required></label></div>' +
      '<div class="grid g2"><label>Wants<select name="productId">' + prods.map(function (p) { return opt(p.id, p.name); }).join('') + opt('', 'Something else (write it)') + '</select></label><label>How many<input name="qty" type="number" min="0" step="any" inputmode="decimal"></label></div>' +
      '<label>Something else — what?<input name="wants" placeholder="e.g. point-of-lay birds, manure"></label>' +
      '<div class="grid g2"><label>Needed by (if they said)<input type="date" name="neededBy"></label><label>Remind me to call after<select name="followDays">' + [7, 14, 21, 30, 45, 60].map(function (d) { return opt(d, d + ' days' + (d === A.followDays ? ' (usual)' : ''), A.followDays); }).join('') + '</select></label></div>' +
      '<label>Notes<textarea name="notes" placeholder="e.g. wants brown eggs, Kasoa market"></textarea></label><button class="btn gold" type="submit">Next: preview →</button></form>';
  };
  FORMS.waitnew = function (f) {
    var t = today(), rec = { type: 'waiting', date: t, name: val(f, 'name').trim(), phone: val(f, 'phone').trim(), productId: val(f, 'productId'), wants: val(f, 'productId') ? '' : val(f, 'wants').trim(),
      qty: num(val(f, 'qty')), neededBy: val(f, 'neededBy'), followDays: C.int(val(f, 'followDays')), notes: val(f, 'notes').trim(), status: 'waiting', calls: [] };
    rec.nextCall = C.addDays(t, rec.followDays || 21);
    var errors = [];
    if (!rec.name) errors.push('Write the name.');
    if (String(rec.phone).replace(/\D/g, '').length < 9) errors.push('Write a full phone number.');
    if (!rec.productId && !rec.wants) errors.push('Write what they want.');
    var same = live(st().waiting).filter(function (w) { return w.status === 'waiting' && String(w.phone).replace(/\D/g, '').slice(-9) === String(rec.phone).replace(/\D/g, '').slice(-9); });
    preview({ title: 'Waiting list · ' + esc(rec.name), errors: errors, warnings: same.length ? ['This phone number is already waiting for ' + esc(C.waitWants(st(), same[0])) + '.'] : [],
      rows: [['Name', esc(rec.name)], ['Phone', esc(rec.phone)], ['Wants', esc(C.waitWants(st(), rec))], ['Needed by', rec.neededBy ? dLong(rec.neededBy) : '—'], ['First reminder to call', dLong(rec.nextCall) + ' (' + rec.followDays + ' days)'], ['Notes', esc(rec.notes || '—')]],
      onConfirm: async function () { await E.save(rec); return 'waiting'; } });
  };
  routes['waiting-item'] = function (id) {
    var s = st(), w = byId(s.waiting, id); if (!w) return back('waiting', 'Waiting list') + '<div class="empty">Not found.</div>';
    var t = today(), mine = isRole('owner', 'manager') || w.by === me().id, A = C.alarmSettings(s);
    var out = back('waiting', 'Waiting list') + head(esc(w.name), 'wants ' + esc(C.waitWants(s, w)) + ' · asked ' + dLong(w.date));
    out += '<div class="grid g2" style="margin-bottom:12px"><a class="btn light" href="tel:' + esc(w.phone) + '">📞 Call ' + esc(w.phone) + '</a><a class="btn wa" target="_blank" rel="noopener" href="' + waLink(w.phone, 'Hello ' + w.name + ', this is ' + farmName() + '. ') + '">WhatsApp</a></div>';
    out += '<div class="card">' + kv('Status', w.status === 'waiting' ? 'Waiting · next call ' + dLong(w.nextCall) : esc(WAIT_RESULT[w.status] || w.status)) + kv('Waiting for', (C.dayDiff(w.date, t)) + ' days') +
      (w.neededBy ? kv('Needed by', dLong(w.neededBy)) : '') + kv('Taken by', esc(userName(w.by))) + (w.notes ? kv('Notes', esc(w.notes)) : '') + '</div>';
    out += '<div class="card" style="margin-top:12px"><h2>Calls</h2>' + ((w.calls || []).length ? w.calls.slice().reverse().map(function (c) { return kv(dShort(c.date) + ' · ' + esc(userName(c.by)), esc(WAIT_RESULT[c.result] || c.result) + (c.note ? '<br><span class="tiny muted">' + esc(c.note) + '</span>' : '')); }).join('') : '<div class="empty">No calls yet.</div>') + '</div>';
    if (w.status === 'waiting' && mine) out += '<form class="card stack" data-form="waitcall" data-id="' + esc(w.id) + '" style="margin-top:12px"><h2>I called them</h2>' +
      '<label>What did they say?<select name="result">' + Object.keys(WAIT_RESULT).map(function (k) { return opt(k, WAIT_RESULT[k]); }).join('') + '</select></label>' +
      '<label>Call again after (if still waiting)<select name="days">' + [3, 7, 14, 21, 30].map(function (d) { return opt(d, d + ' days', w.followDays || A.followDays); }).join('') + '</select></label>' +
      '<label>Note<input name="note" placeholder="e.g. will come on Friday"></label><button class="btn gold" type="submit">Next: preview →</button></form>';
    if (w.status === 'bought' && isRole('owner', 'sales')) out += '<a class="btn light block" style="margin-top:12px" href="#sale-new">Record the sale →</a>';
    return out;
  };
  FORMS.waitcall = function (f) {
    var w = byId(st().waiting, f.dataset.id), result = val(f, 'result'), t = today();
    var rec = C.waitAfterCall(st(), w, result, t, val(f, 'note').trim(), me().id, val(f, 'days'));
    preview({ title: 'Call · ' + esc(w.name), rows: [['Result', esc(WAIT_RESULT[result])], ['Next', result === 'waiting' ? 'reminder to call on ' + dLong(rec.nextCall) : 'taken off the waiting list']].concat(val(f, 'note') ? [['Note', esc(val(f, 'note'))]] : []),
      onConfirm: async function () { await E.save(rec); return result === 'bought' && isRole('owner', 'sales') ? 'sale-new' : 'waiting-item/' + w.id; } });
  };

  // ================================================================ ALARMS inside the app
  // Rings while the app is open (screen on, or open in the background for a short while).
  // When the phone is locked or the app is closed, the Google Calendar reminders ring instead.
  var SOUNDS = [['chime', 'Morning chime', 'soft bells, bright'], ['marimba', 'Marimba', 'friendly wooden tune'], ['rise', 'Soft rise', 'warm and calm'], ['bell', 'Farm bell', 'deep, slow bell']];
  var AL = { ringing: null, audio: null, preview: null, previewName: '', again: null, wake: null };
  // Inside the Android app, window.EggAndroid sets REAL phone alarms that ring with the screen off.
  var NATIVE = (function () { try { return window.EggAndroid && typeof window.EggAndroid.setAlarms === 'function' ? window.EggAndroid : null; } catch (e) { return null; } })();
  function nativeAlarmList() {
    if (!S.session || S.viewAs || !alarmsOnHere()) return [];
    var t = today(), now = Date.now(), seen = {}, out = [], snd = C.alarmSettings(st()).sound;
    for (var i = 0; i < 7; i++) {
      C.alarmsFor(st(), me(), C.addDays(t, i)).forEach(function (a) {
        if (seen[a.key]) return; seen[a.key] = 1;
        var at = atMs(a.date, a.time); if (at <= now) return;
        out.push({ at: at, title: (a.kind === 'collect' ? '🥚 ' : a.kind === 'waiting' ? '📞 ' : '⏰ ') + a.title, sub: a.sub || '', sound: snd });
      });
    }
    return out.sort(function (x, y) { return x.at - y.at; }).slice(0, 80);
  }
  function pushNative(now) {
    if (!NATIVE) return;
    clearTimeout(pushNative._t);
    var go2 = function () { try { S.nativeCount = NATIVE.setAlarms(JSON.stringify(nativeAlarmList())); } catch (e) { console.warn(e); } };
    if (now) go2(); else pushNative._t = setTimeout(go2, 800);
  }
  function nativeStatus() { try { return JSON.parse(NATIVE.status() || '{}'); } catch (e) { return {}; } }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function alarmsOnHere() { return lsGet('eggman.alarmsOn', true) !== false; }
  function alarmBeforeText() { var b = C.alarmSettings(st()).before; return b ? ' <span class="tiny muted">(rings ' + b + ' min before)</span>' : ''; }
  function atMs(date, time) { var p = date.split('-'), q = time.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1], 0).getTime(); }
  function myAlarms(date) {
    if (!S.session) return [];
    var u = me(), list = C.alarmsFor(st(), u, date);
    if (isRole('owner', 'manager')) live(st().tasks).forEach(function (x) {
      if (x.kind !== 'Emergency' || x.status !== 'open' || x.by === u.id || !x.createdAt) return;
      var c = new Date(x.createdAt), d = today();
      if (Date.now() - c.getTime() > 3 * 3600000 || date !== d) return;
      list.push({ key: 'em|' + x.id, kind: 'emergency', taskId: x.id, date: d, time: pad(c.getHours()) + ':' + pad(c.getMinutes()), title: 'EMERGENCY: ' + x.title, sub: whereText(x) + ' · reported by ' + userName(x.by) });
    });
    return list;
  }
  function firedMap() {
    var m = lsGet('eggman.fired', {}), cut = Date.now() - 3 * 86400000, out = {};
    Object.keys(m).forEach(function (k) { if (m[k] > cut) out[k] = m[k]; });
    return out;
  }
  function markFired(key) { var m = firedMap(); m[key] = Date.now(); lsSet('eggman.fired', m); }
  function checkAlarms() {
    if (!S.session || S.viewAs || !alarmsOnHere() || AL.ringing) return;
    var now = Date.now(), fired = firedMap();
    var snoozes = lsGet('eggman.snooze', []), dueSnooze = snoozes.filter(function (z) { return z.at <= now; })[0];
    if (dueSnooze && !NATIVE) { lsSet('eggman.snooze', snoozes.filter(function (z) { return z !== dueSnooze && z.at !== dueSnooze.at; })); ring(dueSnooze.alarm, true); return; }
    var due = myAlarms(today()).filter(function (a) {
      if (NATIVE && a.kind !== 'emergency') return false;
      var at = atMs(a.date, a.time);
      return !fired[a.key] && now >= at && now - at < (a.kind === 'emergency' ? 3 * 3600000 : 20 * 60000);
    })[0];
    if (due) ring(due);
  }
  function soundUrl(name) { return 'alarm-' + (name || C.alarmSettings(st()).sound) + '.mp3'; }
  function ring(a, again) {
    stopPreview();
    if (NATIVE) {
      if (a.kind !== 'test') markFired(a.key);
      var ic = a.kind === 'emergency' ? '🚨' : a.kind === 'collect' ? '🥚' : a.kind === 'waiting' ? '📞' : '⏰';
      try { NATIVE.ringNow(ic + ' ' + a.title, a.sub || '', C.alarmSettings(st()).sound); } catch (e) { console.warn(e); }
      return;
    }
    AL.ringing = a; if (a.kind !== 'test') markFired(a.key);
    var box = document.getElementById('alarmBox');
    if (!box) { box = document.createElement('div'); box.id = 'alarmBox'; document.body.appendChild(box); }
    var icon = a.kind === 'emergency' ? '🚨' : a.kind === 'collect' ? '🥚' : a.kind === 'waiting' ? '📞' : '⏰';
    box.className = 'alarm-box' + (a.kind === 'emergency' ? ' em' : '');
    box.innerHTML = '<div class="alarm-card" role="alertdialog" aria-labelledby="alTitle"><div class="alarm-ico">' + icon + '</div><div class="alarm-time">' + esc(a.time || '') + '</div>' +
      '<h2 id="alTitle">' + esc(a.title) + '</h2><p>' + esc(a.sub || '') + '</p>' +
      '<button class="btn gold block" type="button" data-act="alarmStop">Stop</button>' +
      (a.kind === 'test' ? '' : '<button class="btn ghost block" type="button" data-act="alarmSnooze">Snooze 5 minutes</button>') +
      (a.waitId ? '<button class="btn light block" type="button" data-act="alarmOpen">Open: who to call</button>' : '') +
      (a.taskId ? '<button class="btn light block" type="button" data-act="alarmOpen">' + (a.kind === 'emergency' ? 'Open the emergency' : 'Open the task') + '</button>' : '') +
      (a.kind === 'collect' ? '<button class="btn light block" type="button" data-act="alarmOpen">Enter the eggs</button>' : '') +
      '<p class="tiny" id="alHint" hidden>Tap anywhere to hear the alarm sound.</p></div>';
    box.hidden = false;
    AL.audio = new Audio(soundUrl()); AL.audio.volume = 1;
    var p = AL.audio.play(); if (p && p.catch) p.catch(function () { var h = document.getElementById('alHint'); if (h) h.hidden = false; });
    AL.audio.onended = function () {
      if (navigator.vibrate) navigator.vibrate(0);
      if (!again && a.kind !== 'test' && AL.ringing === a) AL.again = setTimeout(function () { if (AL.ringing === a) { stopRinging(true); ring(a, true); } }, 5 * 60000); // nobody pressed Stop: ring once more
    };
    if (navigator.vibrate) navigator.vibrate([800, 400, 800, 400, 800, 400, 800]);
    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker && a.kind !== 'test')
      navigator.serviceWorker.ready.then(function (r) { r.showNotification(icon + ' ' + a.title, { body: a.sub || '', tag: a.key, renotify: true, requireInteraction: true, icon: 'icon-192.png', vibrate: [800, 400, 800] }); }).catch(function () {});
  }
  function stopRinging(keepBox) {
    clearTimeout(AL.again);
    if (AL.audio) { try { AL.audio.pause(); } catch (e) {} AL.audio = null; }
    if (navigator.vibrate) navigator.vibrate(0);
    var a = AL.ringing;
    if (a && navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) { if (r && r.getNotifications) r.getNotifications({ tag: a.key }).then(function (l) { l.forEach(function (n) { n.close(); }); }); }).catch(function () {});
    if (!keepBox) { var box = document.getElementById('alarmBox'); if (box) { box.hidden = true; box.innerHTML = ''; } AL.ringing = null; }
  }
  ACT.alarmStop = function () { stopRinging(); setTimeout(checkAlarms, 500); if (location.hash.indexOf('#alarms') === 0) render(); };
  ACT.alarmSnooze = function () {
    var a = AL.ringing; stopRinging();
    var z = lsGet('eggman.snooze', []); var at = Date.now() + 5 * 60000, d = new Date(at);
    z.push({ at: at, alarm: Object.assign({}, a, { time: pad(d.getHours()) + ':' + pad(d.getMinutes()), sub: (a.sub || '') + ' · snoozed' }) }); lsSet('eggman.snooze', z);
    toast('Snoozed — it rings again at ' + pad(d.getHours()) + ':' + pad(d.getMinutes()));
  };
  ACT.alarmOpen = function () { var a = AL.ringing; stopRinging(); go(a && a.taskId ? 'task/' + a.taskId : a && a.waitId ? 'waiting-item/' + a.waitId : 'coops'); };
  document.addEventListener('click', function () { // first tap after a silent ring plays the sound
    if (AL.ringing && AL.audio && AL.audio.paused && AL.audio.currentTime === 0) { var p = AL.audio.play(); if (p && p.catch) p.catch(function () {}); var h = document.getElementById('alHint'); if (h) h.hidden = true; }
  }, true);
  function stopPreview() { if (AL.preview) { try { AL.preview.pause(); } catch (e) {} AL.preview = null; } var was = AL.previewName; AL.previewName = ''; return was; }
  ACT.playSound = function (b) {
    var name = b.dataset.sound, was = stopPreview();
    document.querySelectorAll('[data-act="playSound"]').forEach(function (x) { x.textContent = '▶ Listen'; });
    if (was === name) return;
    AL.preview = new Audio(soundUrl(name)); AL.previewName = name; b.textContent = '■ Stop';
    AL.preview.onended = function () { AL.previewName = ''; b.textContent = '▶ Listen'; };
    AL.preview.play().catch(function () { toast('Could not play the sound. Turn the volume up and try again.'); });
  };
  ACT.testAlarm = function () { var d = new Date(); ring({ key: 'test|' + Date.now(), kind: 'test', time: pad(d.getHours()) + ':' + pad(d.getMinutes()), title: 'Test alarm', sub: 'This is how alarms sound on this phone. Press Stop.' }); };
  ACT.alarmsToggle = function () { lsSet('eggman.alarmsOn', !alarmsOnHere()); pushNative(true); toast(alarmsOnHere() ? 'Alarms ON for this phone' : 'Alarms OFF for this phone'); render(); };
  ACT.nativeSettings = function (b) { try { NATIVE.openSettings(b.dataset.which); } catch (e) {} };
  ACT.allowNotif = function () {
    if (!('Notification' in window)) return toast('This browser cannot show notifications.');
    Notification.requestPermission().then(function () { render(); });
  };
  function applyWake() {
    if (!lsGet('eggman.keepAwake', false) || !('wakeLock' in navigator) || document.visibilityState !== 'visible' || AL.wake) return;
    navigator.wakeLock.request('screen').then(function (w) { AL.wake = w; w.addEventListener('release', function () { AL.wake = null; }); }).catch(function () {});
  }
  ACT.keepAwake = function () {
    var on = !lsGet('eggman.keepAwake', false); lsSet('eggman.keepAwake', on);
    if (!on && AL.wake) { AL.wake.release(); AL.wake = null; } else applyWake();
    toast(on ? 'Screen stays on while the app is open' : 'Screen can switch off again'); render();
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { applyWake(); checkAlarms(); } });
  setInterval(checkAlarms, 15000);

  routes.alarms = function () {
    var s = st(), A = C.alarmSettings(s), t = today(), fired = firedMap(), now = Date.now(), on = alarmsOnHere();
    var notif = 'Notification' in window ? Notification.permission : 'unsupported', wakeOk = 'wakeLock' in navigator, awake = lsGet('eggman.keepAwake', false);
    var out = head('Alarms', 'Egg collection, vaccinations and every task ring here, with your chosen sound');
    out += '<div class="card stack"><div class="row between"><h2>This phone</h2><span class="chip ' + (on ? 'green' : 'red') + '">' + (on ? 'Alarms ON' : 'Alarms OFF') + '</span></div>' +
      '<div class="grid g2"><button class="btn gold" type="button" data-act="testAlarm">🔔 Test alarm now</button><button class="btn light" type="button" data-act="alarmsToggle">' + (on ? 'Turn OFF on this phone' : 'Turn ON on this phone') + '</button></div>' +
      (NATIVE ? '' : wakeOk ? '<button class="btn light" type="button" data-act="keepAwake">' + (awake ? '✓ Screen stays on (tap to stop)' : '☀ Keep screen on — for the farm phone') + '</button>' : '') +
      (NATIVE ? '' : notif === 'default' ? '<button class="btn light" type="button" data-act="allowNotif">Allow notifications (alarm shows at the top of the phone too)</button>' : notif === 'denied' ? '<div class="alert warn small">Notifications are blocked for this app. You can allow them in the phone’s Chrome settings › Site settings › Notifications.</div>' : '') +
      (NATIVE ? nativeCard() : androidDownloadCard() + '<div class="alert ok small"><b>When does it ring?</b> When the app is open — on the screen, or just switched away from. Keep the farm phone <b>on charge</b>, with this app open and <b>Keep screen on</b>. When a phone is locked or the app is closed, the <b>Google Calendar</b> reminders ring instead, so nothing is missed.</div>') + '</div>';
    function list(date, label) {
      var l = myAlarms(date);
      return '<div class="card" style="margin-top:12px"><h2>' + label + '</h2>' + (l.length ? l.map(function (a) {
        var at = atMs(a.date, a.time), st2 = NATIVE ? (at <= now ? '<span class="tiny muted">passed</span>' : '<span class="tiny greenx bold">set on phone ✓</span>') : fired[a.key] ? '<span class="greenx tiny bold">rang ✓</span>' : at < now - 20 * 60000 ? '<span class="tiny muted">missed (app was closed)</span>' : at <= now ? '<span class="tiny bold">ringing…</span>' : '<span class="tiny muted">coming</span>';
        return '<div class="kv"><span><b>' + esc(a.time) + '</b> · ' + esc(a.title) + '<br><span class="tiny muted">' + esc(a.sub || '') + '</span></span>' + st2 + '</div>';
      }).join('') : '<div class="empty">No alarms for you ' + (date === t ? 'today' : 'tomorrow') + '.</div>') + '</div>';
    }
    out += list(t, 'Today') + list(C.addDays(t, 1), 'Tomorrow');
    var who = function (l) { return l.map(function (r) { return { owner: 'Owner', manager: 'Farm manager', farmhand: 'Farm hands', sales: 'Salespeople' }[r] || r; }).join(', ') || 'nobody'; };
    if (realRole() === 'owner' && !S.viewAs) {
      var box = function (name, r, l) { return '<label class="pill" style="display:inline-flex;align-items:center;gap:6px;flex-direction:row"><input type="checkbox" name="' + name + '_' + r + '" style="width:auto;min-height:0"' + (l.indexOf(r) >= 0 ? ' checked' : '') + '> ' + { owner: 'Owner', manager: 'Farm manager', farmhand: 'Farm hands', sales: 'Salespeople' }[r] + '</label>'; };
      var roles = ['owner', 'manager', 'farmhand', 'sales'];
      out += '<form class="card stack" data-form="alarmset" style="margin-top:12px"><h2>Alarm settings (owner)</h2><p class="small muted" style="margin:0">These go to every phone at its next sync.</p>' +
        '<div class="small bold">Alarm sound (30 seconds)</div><div class="stack" style="gap:6px">' + SOUNDS.map(function (x) {
          return '<div class="row between" style="gap:8px;border:1px solid #EDE7D6;border-radius:12px;padding:8px 10px"><label class="row" style="flex-direction:row;align-items:center;gap:8px;margin:0"><input type="radio" name="appAlarmSound" value="' + x[0] + '" style="width:auto;min-height:0"' + (A.sound === x[0] ? ' checked' : '') + '> <span><b>' + esc(x[1]) + '</b><br><span class="tiny muted">' + esc(x[2]) + '</span></span></label>' +
            '<button class="btn light sm" type="button" data-act="playSound" data-sound="' + x[0] + '">▶ Listen</button></div>';
        }).join('') + '</div>' +
        '<div class="grid g2"><label>Ring before the time<select name="appAlarmBefore">' + [[0, 'On time'], [5, '5 min before'], [10, '10 min before'], [15, '15 min before'], [30, '30 min before'], [60, '1 hour before']].map(function (x) { return opt(x[0], x[1], A.before); }).join('') + '</select></label>' +
        '<label>Task alarm time (when a task has no time)<input type="time" name="alarmHourTime" value="' + pad(A.hour) + ':00"></label></div>' +
        '<div class="grid g2"><label>Waiting list: first call after<select name="waitFollowDays">' + [7, 14, 21, 30, 45, 60].map(function (d) { return opt(d, d + ' days', A.followDays); }).join('') + '</select></label><label>Call reminders ring at<input type="time" name="followUpTime" value="' + esc(A.followTime) + '"></label></div>' +
        '<label>Egg collection times<input name="collectionTimes" value="' + esc(setting('collectionTimes', '')) + '" placeholder="08:00, 12:00, 16:00"></label>' +
        '<div><div class="small bold" style="margin-bottom:6px">Who hears egg collection alarms</div><div class="pills">' + roles.map(function (r) { return box('col', r, A.collect); }).join('') + '</div></div>' +
        '<div><div class="small bold" style="margin-bottom:6px">Who hears task alarms (vaccination, cleaning…)</div><div class="pills">' + roles.map(function (r) { return box('task', r, A.tasks); }).join('') + '</div><p class="tiny muted" style="margin:4px 0 0">A task given to one person rings only on that person’s phone (and the owner’s).</p></div>' +
        '<div class="grid g2"><label>Daily summary email to the owner<select name="dailySummaryEmail">' + opt('yes', 'Yes', setting('dailySummaryEmail', 'yes')) + opt('no', 'No', setting('dailySummaryEmail', 'yes')) + '</select></label>' +
        '<label>Send it at<input type="time" name="dailySummaryTime" value="' + pad(C.int(setting('dailySummaryHour', 19))) + ':00"></label></div>' +
        '<button class="btn gold" type="submit">Next: preview →</button></form>';
    } else {
      out += '<div class="card" style="margin-top:12px"><h2>Set by the owner</h2>' + kv('Sound', esc((SOUNDS.filter(function (x) { return x[0] === A.sound; })[0] || SOUNDS[0])[1]) + ' <button class="btn light sm" type="button" data-act="playSound" data-sound="' + A.sound + '">▶ Listen</button>') +
        kv('Rings', A.before ? A.before + ' minutes before' : 'at the exact time') + kv('Egg collection', esc(A.times.join(', ') || 'not set') + ' · ' + esc(who(A.collect))) + kv('Tasks', esc(who(A.tasks))) + '</div>';
    }
    return out;
  };
  function nativeCard() {
    pushNative(true);
    var x = nativeStatus(), ok = function (v) { return v ? '<span class="greenx bold">✓ OK</span>' : '<span class="red bold">✗ needs fixing</span>'; };
    var fix = function (w, v) { return v ? '' : ' <button class="btn light sm" type="button" data-act="nativeSettings" data-which="' + w + '">Fix</button>'; };
    return '<div class="alert ok small"><b>📱 Android app — real alarms.</b> They ring with the screen off and the phone locked, like the Clock app. Open the app at least once a day so new tasks get their alarms.</div>' +
      '<div class="card" style="margin:0">' + kv('Alarms set on this phone', String(S.nativeCount === undefined ? (x.scheduled || 0) : S.nativeCount) + ' in the next 7 days') +
      kv('Exact alarm times', ok(x.exact) + fix('exact', x.exact)) + kv('Notifications', ok(x.notifications) + fix('notifications', x.notifications)) +
      kv('Alarm over the lock screen', ok(x.fullScreen) + fix('fullscreen', x.fullScreen)) +
      kv('Battery: unrestricted', (x.battery ? '<span class="greenx bold">✓ OK</span>' : '<span class="muted">recommended</span>') + fix('battery', x.battery)) + '</div>';
  }
  function releaseApkUrl() {
    var h = location.hostname, m = /^([a-z0-9-]+)\.github\.io$/i.exec(h), repo = location.pathname.split('/')[1];
    return m && repo ? 'https://github.com/' + m[1] + '/' + repo + '/releases/download/android/EggManFarms.apk' : '';
  }
  function androidDownloadCard() {
    var u = releaseApkUrl();
    if (!u || !/Android/i.test(navigator.userAgent)) return '';
    return '<div class="alert warn small"><b>Alarms with the screen off?</b> Install the Egg Man Farms Android app: same app, same records, but its alarms ring even when the phone is locked. <a class="btn gold sm" style="margin-top:8px" href="' + esc(u) + '">⬇ Download the Android app</a></div>';
  }
  function settingsRowsWith(over) {
    var cur = st().settings, rows = [], keys = Object.keys(cur);
    Object.keys(over).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    keys.forEach(function (k) { rows.push({ key: k, value: over.hasOwnProperty(k) ? over[k] : cur[k] }); });
    return rows;
  }
  FORMS.alarmset = function (f) {
    stopPreview();
    var roles = ['owner', 'manager', 'farmhand', 'sales'], pick = function (n) { return roles.filter(function (r) { return f.elements[n + '_' + r] && f.elements[n + '_' + r].checked; }).join(','); };
    var snd = (f.querySelector('input[name=appAlarmSound]:checked') || {}).value || 'chime';
    var hr = val(f, 'alarmHourTime'), dt = val(f, 'dailySummaryTime'), times = val(f, 'collectionTimes').trim(), errors = [], warnings = [];
    var over = { appAlarmSound: snd, appAlarmBefore: val(f, 'appAlarmBefore'), appAlarmCollect: pick('col') || 'none', appAlarmTasks: pick('task') || 'none',
      collectionTimes: times, alarmHour: hr ? String(+hr.split(':')[0]) : '6', dailySummaryEmail: val(f, 'dailySummaryEmail'), dailySummaryHour: dt ? String(+dt.split(':')[0]) : '19',
      waitFollowDays: val(f, 'waitFollowDays') || '21', followUpTime: val(f, 'followUpTime') || '09:00' };
    if (times && !times.split(/[,;\s]+/).filter(Boolean).every(function (x) { return /^([01]?\d|2[0-3])[:.][0-5]\d$/.test(x); })) errors.push('Egg collection times must look like 08:00, 12:00, 16:00');
    if (hr && hr.split(':')[1] !== '00') warnings.push('Task alarms use whole hours — ' + hr + ' becomes ' + hr.split(':')[0] + ':00. You can give any task its own exact time on the task page.');
    var nm = (SOUNDS.filter(function (x) { return x[0] === snd; })[0] || [])[1];
    var who = function (l) { return l === 'none' ? 'nobody' : l.split(',').map(function (r) { return { owner: 'Owner', manager: 'Farm manager', farmhand: 'Farm hands', sales: 'Salespeople' }[r]; }).join(', '); };
    preview({ title: 'Alarm settings', errors: errors, warnings: warnings, confirm: 'Save to Google Sheet', gold: true, doneMessage: 'Saved ✓ — every phone gets it at its next sync',
      rows: [['Sound', esc(nm)], ['Rings', over.appAlarmBefore === '0' ? 'at the exact time' : over.appAlarmBefore + ' minutes before'], ['Egg collection', esc(times || 'none')], ['Collection alarms for', esc(who(over.appAlarmCollect))],
        ['Task alarms for', esc(who(over.appAlarmTasks))], ['Task alarm time', pad(+over.alarmHour) + ':00 (when a task has no time)'], ['Daily summary email', over.dailySummaryEmail === 'yes' ? 'every day at ' + pad(+over.dailySummaryHour) + ':00' : 'off'], ['Waiting list', 'first call after ' + over.waitFollowDays + ' days · reminder at ' + esc(over.followUpTime)]],
      onConfirm: async function () { await E.saveMaster('Settings', settingsRowsWith(over)); pushNative(true); return 'alarms'; } });
  };

  // ================================================================ DAILY / WEEKLY SUMMARY of everything
  routes.summary = function (mode, date) {
    var t = today(); mode = mode === 'week' ? 'week' : 'day';
    date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : t;
    var from = mode === 'week' ? C.weekStart(date) : date, to = mode === 'week' ? C.addDays(from, 6) : date;
    if (to > t) to = t;
    if (from > t) return head('Summary') + '<div class="empty">That day has not come yet.</div>';
    var s = st(), m = C.summary(s, from, to), money = isRole('owner'), epc = C.settingsOf(s).eggsPerCrate;
    var title = mode === 'day' ? dLong(from) : 'Week ' + dShort(from) + ' – ' + dShort(C.addDays(from, 6)) + ' ' + from.slice(0, 4);
    var prev = C.addDays(from, mode === 'day' ? -1 : -7), next = C.addDays(from, mode === 'day' ? 1 : 7);
    var text = C.summaryText(s, m, farmName(), money);
    var out = '<div class="no-print">' + head(mode === 'day' ? 'Daily summary' : 'Weekly summary', esc(title)) +
      '<div class="row" style="gap:8px;margin-bottom:8px"><a class="pill' + (mode === 'day' ? ' on' : '') + '" href="#summary/day/' + (mode === 'day' ? date : to) + '" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">Day</a><a class="pill' + (mode === 'week' ? ' on' : '') + '" href="#summary/week/' + from + '" style="display:inline-flex;align-items:center;text-decoration:none;color:inherit">Week</a>' +
      '<a class="btn light sm" href="#summary/' + mode + '/' + prev + '" aria-label="Before">‹</a><input type="date" value="' + from + '" max="' + t + '" data-act-change="sumPick" data-mode="' + mode + '" style="min-height:40px;width:auto" aria-label="Choose a day">' + (next > t ? '' : '<a class="btn light sm" href="#summary/' + mode + '/' + next + '" aria-label="After">›</a>') + '</div>' +
      '<div class="grid g2" style="margin-bottom:12px"><a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(text) + '">Share on WhatsApp</a><button class="btn light" type="button" data-act="print">Print / Save PDF</button></div></div>';
    out += '<div class="print-only"><h1 style="margin:0">' + esc(farmName()) + '</h1><p>' + (mode === 'day' ? 'Daily summary · ' : 'Weekly summary · ') + esc(title) + '</p></div>';
    var k = [kpiBox('Eggs collected', crates(m.eggs.total), (twoColours() ? 'white ' + crates(m.eggs.white.good + m.eggs.white.cracked) + ' · brown ' + crates(m.eggs.brown.good + m.eggs.brown.cracked) + ' · ' : '') + m.eggs.cracked + ' cracked · ' + m.eggs.layRate + '% lay', 'dark'), kpiBox('Birds alive', m.birds.toLocaleString(), (m.eggs.deaths + m.eggs.culls) + ' died / culled', '', m.eggs.deaths ? 'red' : ''),
      kpiBox('Egg store', crates(m.store.close.good), m.store.close.cracked + ' cracked · end of ' + (mode === 'day' ? 'day' : 'week')), kpiBox('Feed used', m.eggs.feedKg + ' kg', m.eggs.gramsPerBird ? m.eggs.gramsPerBird + ' g per bird a day' : (Object.keys(m.feed.used).join(', ') || '—'))];
    if (money) { k.push(kpiBox('Sales', cur(m.sales.totalCents), m.sales.count + (m.sales.count === 1 ? ' sale · ' : ' sales · ') + crates(m.sales.eggsGood), 'gold')); k.push(kpiBox('Money received', cur(m.received.total), 'Cash ' + cur(m.received.Cash) + ' · MoMo ' + cur(m.received.MoMo))); k.push(kpiBox('New debts', cur(m.sales.debtAddedCents), 'old debts paid ' + cur(m.debtPaid.totalCents), '', m.sales.debtAddedCents ? 'red' : '')); k.push(kpiBox('Expenses', cur(m.expenses.totalCents), m.expenses.list.length + ' items')); }
    out += '<div class="grid g2 g4-md">' + k.join('') + '</div>';
    if (m.missing.length) out += '<div class="alert warn" style="margin-top:12px">No egg record for Coop ' + m.missing.join(', ') + ' on this day.</div>';
    // eggs by coop and collection
    out += '<div class="card" style="margin-top:12px"><h2>Eggs by coop' + (mode === 'day' ? ' and collection' : '') + '</h2>' + (m.coops.length ? '<div class="scroll"><table><thead><tr><th>Coop</th><th class="right">Eggs</th><th class="right">Cracked</th><th class="right">Lay %</th><th class="right">Died</th><th class="right">Feed</th></tr></thead><tbody>' +
      m.coops.map(function (c) {
        var two = twoColours(), wb = function (x) { return two ? ' [white ' + crates(x.white.good + x.white.cracked) + ' · brown ' + crates(x.brown.good + x.brown.cracked) + ']' : ''; };
        var col = mode === 'day' ? c.collections.map(function (x, i) { return (i + 1) + '. ' + (x.time || '—') + ' · ' + crates(x.total) + (x.cracked ? ' (' + x.cracked + ' cracked)' : '') + wb(x) + ' — ' + esc(x.by); }).join('<br>') : c.collections.length + ' record' + (c.collections.length === 1 ? '' : 's') + wb(c);
        return '<tr><td><b>Coop ' + c.coop + '</b></td><td class="right">' + crates(c.total) + '</td><td class="right">' + c.cracked + '</td><td class="right">' + c.layRate + '%</td><td class="right ' + (c.deaths ? 'red' : '') + '">' + (c.deaths + c.culls) + '</td><td class="right">' + c.feedKg + ' kg</td></tr>' +
          '<tr><td colspan="6" class="tiny muted" style="padding-top:0;white-space:normal">' + col + '</td></tr>';
      }).join('') + '<tr class="bold"><td>All</td><td class="right">' + crates(m.eggs.total) + '</td><td class="right">' + m.eggs.cracked + '</td><td class="right">' + m.eggs.layRate + '%</td><td class="right">' + (m.eggs.deaths + m.eggs.culls) + '</td><td class="right">' + m.eggs.feedKg + ' kg</td></tr></tbody></table></div>' : '<div class="empty">No eggs recorded.</div>') + '</div>';
    // egg store
    out += '<div class="card" style="margin-top:12px"><h2>Egg store</h2>' + kv('At the start', crates(m.store.open.good) + ' good · ' + m.store.open.cracked + ' cracked') + kv('Collected', crates(m.eggs.good) + ' good · ' + m.eggs.cracked + ' cracked') +
      (m.store.moves.outGood || m.store.moves.outCracked ? kv('Given to salespeople', '− ' + crates(m.store.moves.outGood) + (m.store.moves.outCracked ? ' · ' + m.store.moves.outCracked + ' cracked' : '')) : '') +
      (m.store.moves.backGood || m.store.moves.backCracked ? kv('Returned by salespeople', '+ ' + crates(m.store.moves.backGood) + (m.store.moves.backCracked ? ' · ' + m.store.moves.backCracked + ' cracked' : '')) : '') +
      (m.store.moves.soldGood || m.store.moves.soldCracked ? kv('Sold at the farm', '− ' + crates(m.store.moves.soldGood) + (m.store.moves.soldCracked ? ' · ' + m.store.moves.soldCracked + ' cracked' : '')) : '') + m.adjusts.map(function (a) { return kv('Corrected by ' + esc(a.by), (a.pieces > 0 ? '+' : '') + a.pieces + ' ' + esc(a.eggKind) + (a.reason ? ' · ' + esc(a.reason) : '')); }).join('') +
      kv('At the end', crates(m.store.close.good) + ' good · ' + m.store.close.cracked + ' cracked', 'bold') +
      (twoColours() ? kv('… white', crates(m.store.close.white.good) + ' good · ' + m.store.close.white.cracked + ' cracked') + kv('… brown', crates(m.store.close.brown.good) + ' good · ' + m.store.close.brown.cracked + ' cracked') : '') + '</div>';
    if (m.crates.length) out += '<div class="card" style="margin-top:12px"><h2>Crates with salespeople</h2>' + m.crates.map(function (c) {
      return kv(esc(c.name), 'took ' + crates(c.outGood) + ' · returned ' + crates(c.backGood) + (c.broken ? ' · broken ' + c.broken : '') + (c.returnRecorded === undefined ? '' : c.returnRecorded ? (c.balanced ? ' · <span class="greenx">balanced ✓</span>' : ' · <span class="red">not balanced</span>') : ' · <span class="muted">return not recorded yet</span>'));
    }).join('') + '</div>';
    if (money) {
      out += '<div class="card" style="margin-top:12px"><h2>Sales &amp; money</h2>' + Object.keys(m.sales.bySeller).map(function (id) { var x = m.sales.bySeller[id]; return kv(esc(x.name), cur(x.totalCents) + ' · ' + x.count + (x.count === 1 ? ' sale' : ' sales') + ' · paid ' + cur(x.paidCents)); }).join('') +
        kv('Cash', cur(m.received.Cash)) + kv('MoMo', cur(m.received.MoMo)) + kv('Bank', cur(m.received.Bank)) + kv('Total received', cur(m.received.total), 'bold') +
        (m.sales.hens ? kv('Spent hens sold', m.sales.hens) : '') + kv('New debts', cur(m.sales.debtAddedCents), m.sales.debtAddedCents ? 'red' : '') + kv('Old debts paid', cur(m.debtPaid.totalCents), 'greenx') +
        (mode === 'day' && m.sales.list.length ? '<details style="margin-top:8px"><summary class="small">All ' + m.sales.list.length + ' sales</summary>' + m.sales.list.map(function (x) { return kv(esc(x.time + ' ' + x.receiptNo + ' · ' + x.customer), cur(x.totalCents) + (x.totalCents > x.paidCents ? ' <span class="red">owes ' + cur(x.totalCents - x.paidCents) + '</span>' : '')); }).join('') + '</details>' : '') + '</div>';
    }
    // feed & medicine
    var fm = [];
    Object.keys(m.feed.used).forEach(function (n) { fm.push(kv('Used: ' + esc(n), m.feed.used[n] + ' kg')); });
    m.feed.bought.forEach(function (b) { fm.push(kv('Bought: ' + esc(b.item), b.qty + ' ' + esc(b.unit) + (money ? ' · ' + cur(b.costCents) : ''))); });
    m.feed.mixed.forEach(function (b) { fm.push(kv('Mixed: ' + esc(b.item), b.kg + ' kg')); });
    m.med.used.forEach(function (x) { fm.push(kv('Medicine used: ' + esc(x.item), x.qty + ' ' + esc(x.unit) + (x.coop ? ' · Coop ' + esc(x.coop) : ''))); });
    m.med.bought.forEach(function (x) { fm.push(kv('Medicine bought: ' + esc(x.item), x.qty + ' ' + esc(x.unit) + (money ? ' · ' + cur(x.costCents) : ''))); });
    out += '<div class="card" style="margin-top:12px"><h2>Feed &amp; medicine</h2>' + (fm.join('') || '<div class="empty">Nothing recorded.</div>') + '</div>';
    // tasks
    var tk = [];
    m.tasks.emergencies.forEach(function (x) { tk.push('<div class="small" style="padding:4px 0"><span class="chip red">Emergency</span> ' + esc(x.title) + ' · ' + esc(x.where) + ' <span class="tiny muted">reported by ' + esc(x.by) + '</span>' + (x.open ? ' <b class="red">STILL OPEN</b>' : ' <span class="greenx">handled' + (x.handledBy ? ' by ' + esc(x.handledBy) : '') + (x.note ? ': ' + esc(x.note) : '') + '</span>') + '</div>'); });
    m.tasks.done.forEach(function (x) { tk.push('<div class="small" style="padding:4px 0">✅ ' + chipFor(x.kind) + ' ' + esc(x.title) + ' · ' + esc(x.where) + ' <span class="tiny muted">— ' + esc(x.by) + '</span></div>'); });
    m.tasks.overdue.forEach(function (x) { tk.push('<div class="small red" style="padding:4px 0">⏰ Overdue since ' + dShort(x.date) + ': ' + esc(x.title) + ' · ' + esc(x.where) + '</div>'); });
    m.tasks.due.forEach(function (x) { tk.push('<div class="small muted" style="padding:4px 0">📅 ' + dShort(x.date) + (x.time ? ' ' + esc(x.time) : '') + ': ' + esc(x.title) + ' · ' + esc(x.where) + '</div>'); });
    out += '<div class="card" style="margin-top:12px"><h2>Tasks</h2>' + (tk.join('') || '<div class="empty">No tasks.</div>') + '</div>';
    if (money && m.expenses.list.length) out += '<div class="card" style="margin-top:12px"><h2>Expenses</h2>' + m.expenses.list.map(function (e) { return kv(esc(e.category) + (e.coop ? ' · Coop ' + e.coop : '') + (e.note ? ' · ' + esc(e.note) : ''), cur(e.amountCents)); }).join('') + kv('Total', cur(m.expenses.totalCents), 'bold') + '</div>';
    out += '<details class="card no-print" style="margin-top:12px"><summary class="small bold">WhatsApp text</summary><pre style="white-space:pre-wrap;font-size:12px">' + esc(text) + '</pre></details>';
    return out;
  };
  ACT.sumPick = function (el) { if (el.value) go('summary/' + el.dataset.mode + '/' + (el.dataset.mode === 'week' ? C.weekStart(el.value) : el.value)); };

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
  // ---------------- laptop view on a phone (per phone) ----------------
  var VIEWPORT_PHONE = 'width=device-width, initial-scale=1, viewport-fit=cover';
  function laptopOn() { if (NATIVE && NATIVE.isDesktopMode) { try { return !!NATIVE.isDesktopMode(); } catch (e) {} } return lsGet('eggman.laptop', false) === true; }
  function applyLaptop() {
    var m = document.querySelector('meta[name=viewport]'); if (!m) return;
    m.setAttribute('content', laptopOn() ? 'width=1280' : VIEWPORT_PHONE);
    document.documentElement.classList.toggle('laptop-view', laptopOn());
  }
  ACT.laptopToggle = function () {
    var on = !laptopOn(); lsSet('eggman.laptop', on);
    if (NATIVE && NATIVE.setDesktopMode) { try { NATIVE.setDesktopMode(on); return; } catch (e) {} }
    applyLaptop(); toast(on ? 'Laptop view ON — pinch with two fingers to zoom' : 'Phone view ON'); render();
  };
  applyLaptop();
  routes.settings = function () {
    var s = st(), p = E.pending().length;
    var out = head('Settings', esc(me().name) + ' · ' + esc(role()));
    out += '<div class="card stack" style="margin-bottom:12px"><div class="row between"><h2>This phone</h2><span class="chip ' + (laptopOn() ? 'green' : '') + '">' + (laptopOn() ? 'Laptop view' : 'Phone view') + '</span></div>' +
      '<p class="small muted" style="margin:0">Laptop view shows the wide screen (menu on the side, big tables) shrunk to fit. Pinch with two fingers to zoom. Good for reports; phone view is easier for entering records.</p>' +
      '<button class="btn light" type="button" data-act="laptopToggle">' + (laptopOn() ? '📱 Back to phone view' : '💻 Switch to laptop view') + '</button></div>';
    out += '<div class="card"><h2>Sync with Google Sheets</h2>' + kv('Internet', navigator.onLine ? 'Online' : 'Offline') + kv('Waiting to send', p) +
      kv('Last sync', S.meta.lastSync ? new Date(S.meta.lastSync).toLocaleString() : 'never') + (S.meta.lastError ? kv('Problem', esc(S.meta.lastError), 'red') : '') +
      '<div class="grid g2" style="margin-top:10px"><button class="btn" type="button" data-act="syncNow">Sync now</button><button class="btn light" type="button" data-act="fullRefresh">Reload all from Sheet</button></div></div>';
    if (realRole() === 'owner' && !S.viewAs) {
      var pr = live(s.products).filter(function (x) { return x.active !== false; });
      var unpriced = pr.filter(function (x) { return !(num(x.retail) > 0); }).length;
      var links = [
        ['Settings', 'Farm details, receipts & alarms', esc(setting('phone', 'no phone yet')) + ' · egg collection ' + esc(setting('collectionTimes', 'not set'))],
        ['Products', 'Prices & products', pr.length + ' products' + (unpriced ? ' · <span class="red bold">' + unpriced + ' without a price</span>' : '')],
        ['Users', 'People & PINs', live(s.users).filter(function (u) { return u.active; }).length + ' people can log in'],
        ['Items', 'Feed & medicine items', live(s.items).length + ' items'],
        ['Schedule', 'Vaccination & health schedule', s.template.length + ' steps for each new flock'],
        ['Recipes', 'Feed recipes', s.recipes.length + ' recipes']];
      out += '<h2 style="margin:18px 0 8px">Owner settings</h2><div class="list">' + links.map(function (l) {
        return '<a class="item" href="#' + (l[0] === 'Recipes' ? 'recipes' : 'set/' + l[0]) + '"><div class="grow"><div class="t">' + l[1] + '</div><div class="sub">' + l[2] + '</div></div>›</a>';
      }).join('') + '</div><p class="tiny muted">Changes are saved to your Google Sheet and reach every phone at its next sync. Saving settings needs internet.</p>';
      var people = live(s.users).filter(function (u) { return u.active && u.role !== 'owner'; });
      var roles = [['manager', 'Farm manager'], ['sales', 'Salesperson'], ['farmhand', 'Farm hand']];
      out += '<div class="card stack" style="margin-top:12px"><h2>See the app as…</h2><p class="small muted" style="margin:0">Look at the screens your staff see. Nothing can be saved while viewing.</p><div class="pills">' +
        (people.length ? people.map(function (u) { return '<button class="pill" type="button" data-act="viewAs" data-id="' + esc(u.id) + '">' + esc(u.name) + ' · ' + esc(u.role) + '</button>'; }).join('')
          : roles.map(function (r) { return '<button class="pill" type="button" data-act="viewAs" data-role="' + r[0] + '">' + r[1] + '</button>'; }).join('')) + '</div></div>';
    }
    if (realRole() === 'owner' && !S.viewAs) {
      out += '<h2 style="margin:18px 0 8px">Fix mistakes</h2><div class="list">' +
        '<a class="item" href="#history"><div class="grow"><div class="t">Delete one wrong entry</div><div class="sub">Open History, find the entry, tap 🗑</div></div>›</a>' +
        '<a class="item" href="#bin"><div class="grow"><div class="t">Bin — recently deleted</div><div class="sub">Bring back anything deleted in the last 30 days</div></div>›</a>' +
        '<a class="item" href="#reset"><div class="grow"><div class="t">Reset one section</div><div class="sub">Remove e.g. all test sales from 1–31 Oct. Backup first, PIN needed.</div></div>›</a></div>';
    }
    if (realRole() === 'owner' && !S.viewAs && startFreshOn()) {
      out += '<div class="card stack" style="margin-top:12px;border-color:#E7A08D"><h2>Start fresh</h2><p class="small muted" style="margin:0">Delete ALL records — coops, daily records, tasks, sales, payments, customers, crates, feed, medicine and expenses — on the Sheet and on every phone. Your settings, people, prices, items and schedule are kept. A backup copy of the Sheet is saved in Google Drive first.</p>' +
        '<a class="btn red" href="#start-fresh">Start fresh…</a><p class="tiny muted" style="margin:0">This button switches itself off again after it is used.</p></div>';
    }
    out += '<button class="btn red block" style="margin-top:12px" type="button" data-act="logout">Log out</button><p class="tiny muted" style="margin-top:10px">The Egg Man Farms app v2.5' + (NATIVE ? ' (Android app)' : '') + ' · data is kept on this device and in your Google Sheet.</p>';
    return out;
  };
  function startFreshOn() { return String(setting('allowStartFresh', 'no')).trim().toLowerCase() === 'yes'; }
  routes['start-fresh'] = function () {
    if (realRole() !== 'owner' || S.viewAs) return '<div class="empty">Only the owner can do this.</div>';
    if (!startFreshOn()) return back('settings', 'Settings') + '<div class="empty">Start fresh is switched off. To use it, set “Allow Start fresh button” to yes in Settings › Farm details.</div>';
    var s = st(), n = function (t) { return live(s[t]).length; };
    return back('settings', 'Settings') + head('Start fresh', 'Use this once, after testing, before real work begins.') +
      '<div class="card">' + kv('Coops / flocks', n('flocks')) + kv('Daily records', n('daily')) + kv('Tasks', n('tasks')) + kv('Sales', n('sales')) + kv('Payments', n('payments')) +
      kv('Customers', n('customers')) + kv('Crates out / returns', n('stock')) + kv('Feed records', n('feed')) + kv('Medicine records', n('med')) + kv('Expenses', n('expenses')) + '</div>' +
      '<div class="alert err" style="margin-top:12px">All of the above will be <b>deleted for good</b> — in the Google Sheet and on every phone. Task alarms made by the app are removed from the calendar. <b>Kept:</b> farm details, people &amp; PINs, prices, feed &amp; medicine items, vaccination schedule, recipes, egg-collection alarms.</div>' +
      '<div class="alert ok" style="margin-top:12px">🛟 Before deleting, a full copy of your Google Sheet is saved in Google Drive › <b>Egg Man Farms backups</b>. If the copy cannot be made, nothing is deleted.</div>' +
      '<form class="card" data-form="startfresh" style="margin-top:12px"><label>Type DELETE to confirm<input name="confirm" autocomplete="off" autocapitalize="characters"></label>' +
      '<label>Your owner PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off"></label><button class="btn red" type="submit">Next: preview →</button></form>';
  };
  FORMS.startfresh = function (f) {
    var txt = val(f, 'confirm').trim().toUpperCase(), pin = val(f, 'pin').trim(), errs = [];
    if (txt !== 'DELETE') errs.push('Type the word DELETE in the box to confirm.');
    if (!/^[0-9]{4,8}$/.test(pin)) errs.push('Type your owner PIN.');
    preview({ title: 'Delete all records?', confirm: 'Yes, delete everything', doneMessage: 'Started fresh ✓ — backup saved in Drive, all records deleted',
      errors: errs,
      warnings: E.pending().length ? [E.pending().length + ' record(s) on this device are not synced yet — they will be deleted too.'] : [],
      rows: [['Backup first', 'Drive › Egg Man Farms backups'], ['Deleted', 'all records, on the Sheet and every phone'], ['Kept', 'settings, people, prices, items, schedule'], ['After', 'the Start fresh button switches off']],
      onConfirm: async function () { await E.startFresh('DELETE', pin); return 'home'; } });
  };
  ACT.viewAs = function (b) {
    var u = b.dataset.id ? byId(st().users, b.dataset.id) : null;
    var r = u ? u.role : b.dataset.role;
    S.viewAs = { id: u ? u.id : 'view-' + r, name: u ? u.name : { manager: 'Farm manager', sales: 'Salesperson', farmhand: 'Farm hand' }[r], role: r };
    go('home'); render();
  };
  ACT.viewAsOff = function () { S.viewAs = null; go('settings'); render(); };

  // ---------- owner editors (each one replaces a tab in the Google Sheet)
  var UNITS = ['bag', 'kg', 'vial', 'bottle', 'sachet', 'pack', 'litre', 'dose', 'piece'];
  var SETTING_FIELDS = [
    ['farmName', 'Farm name (on receipts)'], ['phone', 'Farm phone (on receipts)'], ['location', 'Location (on receipts)'],
    ['receiptFooter', 'Last line on receipts'], ['momoPay', 'MoMo number for payments, on receipts (e.g. 024 123 4567 – The Egg Man Farms)'], ['ownerWhatsapp', 'Owner WhatsApp, e.g. 233241234567'], ['ownerEmail', 'Owner email (alerts & monthly report)'],
    ['reportEmails', 'Other emails for the monthly report (comma between)'],
    ['collectionTimes', 'Egg collection alarm times, e.g. 08:00, 12:00, 16:00'], ['alarmHour', 'Task alarm hour on the day (0–23)'], ['alarmEveningBefore', 'Reminder hour the evening before (0–23)'],
    ['defaultEggColour', 'Main egg colour (brown / white) — for coops and old entries with no colour'], ['tasksDoneBy', 'Who can tick tasks done (all / owner)'], ['giveOutStrict', 'Stop giving out more eggs than the store has (yes / no)'], ['allowStartFresh', 'Allow Start fresh button (yes / no) — keep it “no”'], ['newCustomerCredit', 'New customers can pay part (yes / no)'], ['newCustomerLimit', 'Debt limit for new customers, GH₵ (0 = no limit)'],
    ['coops', 'Number of coops'], ['eggsPerCrate', 'Eggs in a crate'], ['kgPerBag', 'Kg in a feed bag']];
  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'x'; }
  function editorDef(table) {
    var s = st(), feeds = live(s.items).filter(function (i) { return i.category === 'feed'; }), ings = live(s.items).filter(function (i) { return i.category === 'ingredient'; });
    return {
      Products: { title: 'Prices & products', help: 'Retail price is for ordinary customers, wholesale for wholesale customers (0 = they pay retail). White prices are for white eggs (0 = same as brown). Switch a product off to hide it.',
        rows: function () { return s.products; }, idPrefix: 'p-', keep: true,
        cols: [['name', 'Name', 'text'], ['kind', 'Type', ['good', 'cracked', 'hen', 'other'], { good: 'Good eggs', cracked: 'Cracked eggs', hen: 'Spent hens', other: 'Other' }],
          ['eggsPerUnit', 'Eggs in one', 'num'], ['retail', 'Retail GH₵ (brown)', 'money'], ['wholesale', 'Wholesale GH₵ (brown)', 'money'],
          ['retailWhite', 'White retail GH₵', 'money'], ['wholesaleWhite', 'White wholesale GH₵', 'money'], ['active', 'On sale', 'check']] },
      Users: { title: 'People & PINs', help: 'Leave the PIN empty to keep the old one. PINs are 4–8 numbers. Switch a person off when they leave — their records stay.',
        rows: function () { return s.users; }, idPrefix: 'u-', keep: true,
        cols: [['name', 'Name (they type this to log in)', 'text'], ['role', 'Job', ['owner', 'manager', 'sales', 'farmhand'], { owner: 'Owner', manager: 'Farm manager', sales: 'Salesperson', farmhand: 'Farm hand' }],
          ['pin', 'New PIN', 'pin'], ['phone', 'Phone', 'text'], ['email', 'Gmail (gets alarms in their calendar)', 'text'], ['active', 'Can log in', 'check']] },
      Items: { title: 'Feed & medicine items', help: '"Warn at" is when the app says stock is low: bags for feed, kg for ingredients, the unit for medicines.',
        rows: function () { return s.items; }, idPrefix: 'i-', keep: true,
        cols: [['name', 'Name', 'text'], ['category', 'Type', ['feed', 'ingredient', 'medicine'], { feed: 'Feed', ingredient: 'Ingredient', medicine: 'Medicine / vaccine' }],
          ['unit', 'Unit', UNITS], ['kgPerBag', 'Kg per bag', 'num'], ['lowLevel', 'Warn at', 'num'], ['active', 'In use', 'check']] },
      Schedule: { title: 'Vaccination & health schedule', help: 'Works by bird age: day 1 = the day chicks arrive, so it fits every new flock by itself. For something done several days in a row, put “Repeat every” 1 and the last day. Each row is shown in plain words under it. Ask your vet to check it. Changes apply to flocks you add after saving.',
        rows: function () { return s.template; }, removable: true,
        cols: [['day', 'Start on bird age (day)', 'num'], ['type', 'Type', KINDS], ['title', 'What to do', 'text'], ['everyDays', 'Repeat every … days (empty = once)', 'num'], ['untilDay', 'Last day (bird age)', 'num'], ['notes', 'Notes', 'text']] },
      Recipes: { title: 'Feed recipes', help: 'One row per ingredient. Rows with the same recipe name make one recipe.', removable: true,
        rows: function () { var out = []; s.recipes.forEach(function (r) { r.lines.forEach(function (l) { out.push({ recipeName: r.name, outputItemId: r.outputItemId, ingredientItemId: l.itemId, kg: l.kg }); }); }); return out; },
        cols: [['recipeName', 'Recipe name', 'text'], ['outputItemId', 'Makes', feeds.map(function (i) { return i.id; }), C.byId(feeds)],
          ['ingredientItemId', 'Ingredient', ings.map(function (i) { return i.id; }), C.byId(ings)], ['kg', 'Kg', 'num']] }
    }[table];
  }
  function priceHistoryCard() {
    var h = st().priceHistory || [];
    return '<div class="card" style="margin-top:12px"><h2>Price changes</h2>' + (h.length ? h.slice(0, 40).map(function (x) {
      return kv(new Date(x.when).toLocaleDateString() + ' · ' + x.product + ' · ' + x.price, 'GH₵ ' + num(x.old).toFixed(2) + ' → <b>GH₵ ' + num(x.now).toFixed(2) + '</b> <span class="tiny muted">' + esc(x.by) + '</span>');
    }).join('') : '<div class="empty">No price changes yet. When you change a price here, it is listed with the date.</div>') + '<p class="tiny muted" style="margin:6px 0 0">Old sales always keep the price they were sold at.</p></div>';
  }
  routes.set = function (table) {
    if (realRole() !== 'owner' || S.viewAs) return '<div class="empty">Only the owner can change settings.</div>';
    var s = st();
    if (table === 'Settings') {
      return back('settings', 'Settings') + head('Farm details, receipts & alarms', 'Saved to the Settings tab of your Google Sheet') +
        '<form class="card" data-form="setsettings">' + SETTING_FIELDS.map(function (f) {
          return '<label>' + esc(f[1]) + '<input name="' + f[0] + '" value="' + esc(s.settings[f[0]] === undefined ? '' : s.settings[f[0]]) + '"' + (/coops|eggsPerCrate|kgPerBag|alarm|Limit/.test(f[0]) ? ' inputmode="numeric"' : '') + (f[0] === 'newCustomerCredit' || f[0] === 'allowStartFresh' ? ' placeholder="no"' : f[0] === 'tasksDoneBy' ? ' placeholder="all"' : f[0] === 'defaultEggColour' ? ' placeholder="brown"' : '') + '></label>';
        }).join('') + '<div class="alert ok small">Part payment: “yes” lets salespeople add customers who can pay part and owe the rest. You can still change each customer on their page.</div><div class="alert ok small">Egg collection times make a phone alarm every day at each time. The farm manager and farm hands with a Gmail in People get them too.</div>' +
        '<button class="btn gold" type="submit">Next: preview →</button></form>';
    }
    var d = editorDef(table); if (!d) return '<div class="empty">Unknown setting.</div>';
    S.draft = S.draft || {};
    var rows = S.draft[table] || d.rows().map(function (r) { var x = Object.assign({}, r); if (table === 'Users') x.pin = ''; return x; });
    S.draft[table] = rows;
    function cell(r, i, c) {
      var name = 'r' + i + '_' + c[0], v = r[c[0]];
      if (c[2] === 'check') return '<label class="small" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="' + name + '" style="width:auto;min-height:0"' + (v !== false && v !== 'FALSE' ? ' checked' : '') + '> ' + esc(c[1]) + '</label>';
      if (Array.isArray(c[2])) return '<label class="small">' + esc(c[1]) + '<select name="' + name + '"><option value=""></option>' + c[2].map(function (o) { var lbl = c[3] ? (typeof c[3][o] === 'object' ? c[3][o].name : c[3][o]) : o; return opt(o, lbl || o, v); }).join('') + '</select></label>';
      var type = c[2] === 'text' ? 'text' : 'number', extra = c[2] === 'money' ? ' step="0.01" min="0" inputmode="decimal"' : c[2] === 'num' ? ' step="any" inputmode="decimal"' : c[2] === 'pin' ? ' inputmode="numeric" autocomplete="off" placeholder="' + (r.id && !r._new ? 'keep old PIN' : '4–8 numbers') + '"' : '';
      if (c[2] === 'pin') type = 'text';
      return '<label class="small">' + esc(c[1]) + '<input type="' + type + '" name="' + name + '" value="' + esc(v === undefined || v === null ? '' : v) + '"' + extra + '></label>';
    }
    return back('settings', 'Settings') + head(d.title, d.help) +
      '<form class="stack" data-form="seteditor" data-table="' + table + '"><input type="hidden" name="count" value="' + rows.length + '">' +
      rows.map(function (r, i) {
        return '<div class="card stack" style="gap:8px"><div class="row between"><b>' + esc(r.name || r.title || r.recipeName || (table === 'Schedule' ? 'Day ' + (r.day || '?') : 'New')) + '</b>' +
          ((d.removable || r._new) ? '<button class="btn light sm" type="button" data-act="edRemove" data-i="' + i + '">Remove</button>' : '') + '</div>' +
          '<input type="hidden" name="r' + i + '_id" value="' + esc(r.id || '') + '"><input type="hidden" name="r' + i + '_new" value="' + (r._new ? '1' : '') + '">' +
          '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">' + d.cols.map(function (c) { return cell(r, i, c); }).join('') + '</div>' +
          (table === 'Schedule' ? '<div class="alert ok small sched-sentence" data-i="' + i + '">' + esc(schedSentence(r)) + '</div>' : '') + '</div>';
      }).join('') +
      '<div class="grid g2"><button class="btn ghost" type="button" data-act="edAdd">+ Add a row</button><button class="btn light" type="button" data-act="edReset">Undo my changes</button></div>' +
      '<div class="sticky-actions"><button class="btn gold block" type="submit">Next: preview →</button></div></form>' + (table === 'Products' ? priceHistoryCard() : '');
  };
  // one schedule row in plain words, e.g. "From day 1 to day 5, every day: Vitamins"
  function schedSentence(r) {
    var day = C.int(r.day), every = C.int(r.everyDays), until = C.int(r.untilDay), what = (r.title || '…') + (r.type ? ' (' + r.type + ')' : '');
    if (!day) return 'Write the bird age (day) to start.';
    if (!every) return 'Once, on day ' + day + ' (week ' + Math.ceil(day / 7) + '): ' + what;
    if (!until || until <= day) return 'From day ' + day + ', every ' + (every === 1 ? 'day' : every + ' days') + ' — put a last day, or it is done only once: ' + what;
    var times = Math.floor((until - day) / every) + 1;
    return 'From day ' + day + ' to day ' + until + ', every ' + (every === 1 ? 'day' : every + ' days') + ' (' + times + ' times): ' + what;
  }
  LIVE.seteditor = function (f) {
    if (f.dataset.table !== 'Schedule') return;
    f.querySelectorAll('.sched-sentence').forEach(function (box) {
      var i = box.dataset.i, g = function (k) { return f.elements['r' + i + '_' + k] ? f.elements['r' + i + '_' + k].value : ''; };
      box.textContent = schedSentence({ day: g('day'), type: g('type'), title: g('title'), everyDays: g('everyDays'), untilDay: g('untilDay') });
    });
  };
  function readEditor(f) {
    var table = f.dataset.table, d = editorDef(table), n = C.int(val(f, 'count')), rows = [];
    for (var i = 0; i < n; i++) {
      if (!f.elements['r' + i + '_id']) continue;
      var r = { id: val(f, 'r' + i + '_id') }; if (val(f, 'r' + i + '_new')) r._new = true;
      d.cols.forEach(function (c) {
        var v = val(f, 'r' + i + '_' + c[0]);
        if (c[2] === 'num' || c[2] === 'money') v = v === '' ? '' : num(v);
        r[c[0]] = v;
      });
      rows.push(r);
    }
    return rows;
  }
  ACT.edAdd = function (b) {
    var f = b.closest('form'), table = f.dataset.table, rows = readEditor(f);
    var blank = { _new: true };
    if (table === 'Products') Object.assign(blank, { kind: 'good', eggsPerUnit: 30, retail: '', wholesale: '', active: true });
    if (table === 'Users') Object.assign(blank, { role: 'sales', active: true });
    if (table === 'Items') Object.assign(blank, { category: 'medicine', unit: 'pack', active: true });
    if (table === 'Schedule') Object.assign(blank, { type: 'Vaccination' });
    rows.push(blank); S.draft[table] = rows; render();
    setTimeout(function () { var cards = $main.querySelectorAll('form .card'); if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'center' }); }, 30);
  };
  ACT.edRemove = function (b) { var f = b.closest('form'), rows = readEditor(f); rows.splice(C.int(b.dataset.i), 1); S.draft[f.dataset.table] = rows; render(); };
  ACT.edReset = function (b) { delete S.draft[b.closest('form').dataset.table]; render(); };
  function finishRows(table, rows) {
    var used = {};
    (editorDef(table).rows() || []).forEach(function (r) { if (r.id) used[r.id] = 1; });
    return rows.map(function (r) {
      var x = Object.assign({}, r); delete x._new;
      if (table === 'Products' || table === 'Users' || table === 'Items') {
        if (!x.id) {
          var pre = table === 'Users' ? 'u-' : table === 'Products' ? 'p-' : (x.category === 'medicine' ? 'm-' : 'i-');
          var id = pre + slug(x.name), k = 2; while (used[id]) id = pre + slug(x.name) + '-' + (k++);
          x.id = id; used[id] = 1;
        }
        x.active = x.active === true || x.active === 'on' || x.active === 'true';
      }
      if (table === 'Recipes') x.recipeId = 'r-' + slug(x.recipeName);
      return x;
    });
  }
  FORMS.seteditor = function (f) {
    var table = f.dataset.table, d = editorDef(table), rows = finishRows(table, readEditor(f));
    var old = C.byId(table === 'Recipes' || table === 'Schedule' ? [] : d.rows()), errors = [], warnings = [], changes = [];
    var label = function (c) { return c[1]; };
    rows.forEach(function (r, i) {
      var nm = r.name || r.title || r.recipeName || ('Row ' + (i + 1));
      if (table !== 'Schedule' && table !== 'Recipes' && !String(r.name || '').trim()) errors.push('Row ' + (i + 1) + ': write a name.');
      if (table === 'Users') {
        if (r.pin && !/^[0-9]{4,8}$/.test(r.pin)) errors.push(nm + ': PIN must be 4 to 8 numbers.');
        if (!old[r.id] && !r.pin) errors.push(nm + ': a new person needs a PIN.');
        if (r.pin && r.pin[0] === '0') warnings.push(nm + '’s PIN starts with 0 — that is fine, it is saved as text.');
        if (!r.role) errors.push(nm + ': choose a job.');
      }
      if (table === 'Products' && r.active && !(num(r.retail) > 0)) warnings.push(nm + ' has no retail price — it cannot be sold until it has one.');
      if (table === 'Products' && (r.kind === 'good' || r.kind === 'cracked') && !(C.int(r.eggsPerUnit) > 0)) errors.push(nm + ': write how many eggs are in one (e.g. 30 for a crate, 1 for a single egg).');
      if ((table === 'Products' || table === 'Users' || table === 'Items') && r.id && rows.some(function (o, j) { return j !== i && o.id === r.id; })) errors.push(nm + ': the same code (' + r.id + ') is used twice. Delete the extra row.');
      if (table === 'Schedule' && !(num(r.day) >= 1)) errors.push('Row ' + (i + 1) + ': day must be 1 or more.');
      if (table === 'Schedule' && !String(r.title || '').trim()) errors.push('Row ' + (i + 1) + ': write what to do.');
      if (table === 'Recipes' && (!r.recipeName || !r.ingredientItemId || !(num(r.kg) > 0))) errors.push('Row ' + (i + 1) + ': needs a recipe name, an ingredient and kg.');
      var o = old[r.id];
      if (!o) { changes.push('New: ' + nm); return; }
      d.cols.forEach(function (c) {
        if (c[2] === 'pin') { if (r.pin) changes.push(nm + ': new PIN'); return; }
        var a = o[c[0]], b = r[c[0]];
        if (c[2] === 'check') { a = a !== false; b = !!b; }
        if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) changes.push(nm + ': ' + label(c) + ' ' + (a === '' || a === undefined ? '—' : a) + ' → ' + (b === '' || b === undefined ? '—' : b));
      });
    });
    if (table === 'Users' && !rows.some(function (r) { return r.role === 'owner' && r.active; })) errors.push('At least one owner must be able to log in.');
    if (table === 'Users') { var names = {}; rows.forEach(function (r) { var k = String(r.name).trim().toLowerCase(); if (names[k]) errors.push('Two people are called ' + r.name + '.'); names[k] = 1; }); }
    if (table === 'Schedule' || table === 'Recipes') changes = [rows.length + ' rows will replace the old ' + d.rows().length + '.'];
    var mine = table === 'Users' ? rows.filter(function (r) { return r.id === S.session.user.id && r.pin; })[0] : null;
    preview({ title: d.title, errors: errors, warnings: warnings, confirm: 'Save to Google Sheet', gold: true, doneMessage: 'Saved to your Google Sheet ✓',
      rows: [['Rows', rows.length], ['Changes', changes.length ? '' : 'none']].concat(changes.slice(0, 15).map(function (c) { return ['•', esc(c)]; })).concat(changes.length > 15 ? [['…', (changes.length - 15) + ' more']] : []),
      onConfirm: async function () {
        await E.saveMaster(table, rows);
        if (mine) await E.useNewPin(mine.pin);
        delete S.draft[table];
        return 'settings';
      } });
  };
  FORMS.setsettings = function (f) {
    var cur = st().settings, rows = [], changes = [], errors = [];
    var keys = Object.keys(cur); SETTING_FIELDS.forEach(function (x) { if (keys.indexOf(x[0]) < 0) keys.push(x[0]); });
    keys.forEach(function (k) {
      var field = f.elements[k], v = field ? field.value.trim() : cur[k];
      if ((k === 'newCustomerCredit' || k === 'allowStartFresh' || k === 'tasksDoneBy' || k === 'defaultEggColour' || k === 'giveOutStrict') && v) v = v.toLowerCase();
      rows.push({ key: k, value: v });
      if (field && String(cur[k] === undefined ? '' : cur[k]) !== v) changes.push([k, esc(String(cur[k] === undefined ? '' : cur[k]) || '—') + ' → <b>' + esc(v || '—') + '</b>']);
    });
    var times = val(f, 'collectionTimes').trim();
    if (times && !times.split(/[,;\s]+/).filter(Boolean).every(function (t) { return /^([01]?\d|2[0-3])[:.][0-5]\d$/.test(t); })) errors.push('Egg collection times must look like 08:00, 12:00, 16:00');
    ['coops', 'eggsPerCrate', 'kgPerBag'].forEach(function (k) { if (!(num(val(f, k)) > 0)) errors.push(k + ' must be a number above 0.'); });
    var nc = val(f, 'newCustomerCredit').trim().toLowerCase();
    if (nc && nc !== 'yes' && nc !== 'no') errors.push('"New customers can pay part" must be yes or no.');
    var dc = val(f, 'defaultEggColour').trim().toLowerCase();
    if (dc && dc !== 'brown' && dc !== 'white') errors.push('"Main egg colour" must be brown or white.');
    var gs = val(f, 'giveOutStrict').trim().toLowerCase();
    if (gs && gs !== 'yes' && gs !== 'no') errors.push('"Stop giving out more eggs than the store has" must be yes or no.');
    var td = val(f, 'tasksDoneBy').trim().toLowerCase();
    if (td && td !== 'all' && td !== 'owner') errors.push('"Who can tick tasks done" must be all or owner.');
    var sf = val(f, 'allowStartFresh').trim().toLowerCase();
    if (sf && sf !== 'yes' && sf !== 'no') errors.push('"Allow Start fresh button" must be yes or no.');
    if (f.elements.newCustomerCredit) f.elements.newCustomerCredit.value = nc;
    if (val(f, 'newCustomerLimit') !== '' && !(num(val(f, 'newCustomerLimit')) >= 0)) errors.push('Debt limit must be a number (0 = no limit).');
    ['alarmHour', 'alarmEveningBefore'].forEach(function (k) { var h = num(val(f, k)); if (val(f, k) !== '' && (h < 0 || h > 23)) errors.push(k + ' must be an hour from 0 to 23.'); });
    var wa = val(f, 'ownerWhatsapp').replace(/\D/g, '');
    var warnings = wa && wa.indexOf('233') !== 0 ? ['WhatsApp number should start with 233 (Ghana), e.g. 233241234567.'] : [];
    var labels = {}; SETTING_FIELDS.forEach(function (x) { labels[x[0]] = x[1]; });
    preview({ title: 'Farm details & alarms', errors: errors, warnings: warnings, confirm: 'Save to Google Sheet', gold: true, doneMessage: 'Saved ✓ — alarms update within a minute',
      rows: changes.length ? changes.map(function (c) { return [labels[c[0]] || c[0], c[1]]; }) : [['Changes', 'none']],
      onConfirm: async function () { await E.saveMaster('Settings', rows); return 'settings'; } });
  };
  ACT.fullRefresh = function () { if (!navigator.onLine) return toast('Needs internet.'); E.fullRefresh().then(function () { toast('Reloaded from the Sheet'); }); };
  ACT.logout = async function () {
    if (E.pending().length && !navigator.onLine) { if (!confirm(E.pending().length + ' record(s) are not synced yet. They stay safe on this phone. Log out anyway?')) return; }
    if (NATIVE) { try { NATIVE.setAlarms('[]'); } catch (e) {} }
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
  E.onChange(function () { setTimeout(checkAlarms, 300); pushNative(); if (isForm && S.session) { badge(); return; } render(); });

  // ================================================================ DELETE · BIN · RESET A SECTION (owner)
  var TYPE_WORD = { daily: 'Daily record', sales: 'Sale', payments: 'Debt payment', stock: 'Crates / egg store', feed: 'Feed', med: 'Medicine', expenses: 'Expense', customers: 'Customer', flocks: 'Flock', tasks: 'Task', waiting: 'Waiting list', moves: 'Birds moved' };
  function recLabel(r) {
    var s = st();
    try {
      if (r.type === 'daily') return 'Coop ' + ((flock(r.flockId) || {}).coop || r.coop) + ' · ' + crates(C.dailyEggs(s, r).total) + ' eggs';
      if (r.type === 'sales') return (r.receiptNo || 'Sale') + ' · ' + esc((cust(r.customerId) || {}).name || '') + ' · ' + cur(C.saleTotals(r).totalCents);
      if (r.type === 'payments') return esc((cust(r.customerId) || {}).name || '') + ' · ' + curN(r.amount);
      if (r.type === 'stock') return (r.kind === 'out' ? 'Eggs out to ' : r.kind === 'return' ? 'Eggs back from ' : 'Store correction ') + esc(userName(r.salesUserId) || '');
      if (r.type === 'feed') return (r.kind === 'buy' ? 'Bought ' : r.kind === 'mix' ? 'Mixed ' : 'Adjusted ') + esc((item(r.itemId || r.outputItemId) || {}).name || '');
      if (r.type === 'med') return (r.kind === 'use' ? 'Used ' : 'Bought ') + esc((item(r.itemId) || {}).name || '');
      if (r.type === 'expenses') return esc(r.category || '') + ' · ' + curN(r.amount);
      if (r.type === 'customers') return esc(r.name || '');
      if (r.type === 'flocks') return 'Coop ' + r.coop + ' · ' + C.int(r.chicks) + ' birds';
      if (r.type === 'tasks') return esc(r.kind + ': ' + r.title);
      if (r.type === 'waiting') return esc(r.name) + ' · ' + esc(C.waitWants(s, r));
      if (r.type === 'moves') return C.int(r.birds) + ' birds · Coop ' + esc(r.fromCoop) + ' → Coop ' + esc(r.toCoop);
    } catch (e) {}
    return r.type;
  }
  function delBtn(type, id, backTo) {
    return '<div class="no-print" style="margin-top:16px"><button class="btn light block" type="button" data-act="delRec" data-type="' + esc(type) + '" data-id="' + esc(id) + '" data-back="' + esc(backTo || '') + '">🗑 Delete this entry</button></div>';
  }
  ACT.delRec = function (b) {
    if (realRole() !== 'owner' || S.viewAs) return toast('Only the owner can delete.');
    var type = b.dataset.type, r = byId(st()[type] || [], b.dataset.id); if (!r) return;
    var rec = Object.assign({ type: type }, r), imp = C.deleteImpact(st(), rec);
    preview({ title: 'Delete · ' + (TYPE_WORD[type] || type) + '?', errors: imp.blocked ? [imp.blocked] : [], confirm: 'Yes, delete',
      rows: [['Entry', recLabel(rec)], ['Date', rec.date ? dLong(rec.date) : '—'], ['Entered by', esc(userName(rec.by) || '—')]], warnings: imp.lines, doneMessage: 'Deleted — it is in the Bin for 30 days',
      onConfirm: async function () { await E.save(Object.assign({}, r, { type: type, deleted: true, deletedAt: Date.now(), deletedBy: me().id })); return b.dataset.back || 'history'; } });
  };
  function binList() {
    var s = st(), cut = Date.now() - 30 * 86400000, out = [];
    E.TYPES.forEach(function (ty) { (s[ty] || []).forEach(function (r) { if (r.deleted && (r.deletedAt || 0) > cut) out.push(Object.assign({ type: ty }, r)); }); });
    return out.sort(function (a, b) { return (b.deletedAt || 0) - (a.deletedAt || 0); });
  }
  routes.bin = function () {
    var list = binList(), groups = {}, singles = [];
    list.forEach(function (r) { if (r.resetId) (groups[r.resetId] = groups[r.resetId] || []).push(r); else singles.push(r); });
    var out = head('Bin', 'Entries deleted in the last 30 days. Tap “Bring back” to restore one.');
    Object.keys(groups).forEach(function (g) {
      var rs = groups[g], r0 = rs[0];
      out += '<div class="card" style="margin-bottom:12px"><div class="row between"><h2>Section reset</h2><span class="tiny muted">' + new Date(r0.deletedAt).toLocaleString() + '</span></div><p class="small" style="margin:0 0 8px">' + esc(r0.resetLabel || '') + ' · ' + rs.length + ' entries</p>' +
        '<button class="btn gold sm" type="button" data-act="restoreGroup" data-id="' + esc(g) + '">Bring back all ' + rs.length + '</button></div>';
    });
    out += '<div class="card"><h2>Deleted entries</h2>' + (singles.length ? singles.map(function (r) {
      return '<div class="kv"><span><b>' + esc(TYPE_WORD[r.type] || r.type) + '</b> · ' + recLabel(r) + '<br><span class="tiny muted">' + (r.date ? dShort(r.date) + ' · ' : '') + 'deleted ' + new Date(r.deletedAt).toLocaleDateString() + '</span></span><button class="btn light sm" type="button" data-act="restoreRec" data-type="' + esc(r.type) + '" data-id="' + esc(r.id) + '">Bring back</button></div>';
    }).join('') : '<div class="empty">The Bin is empty.</div>') + '</div>';
    return out;
  };
  ACT.restoreRec = function (b) {
    var r = byId(st()[b.dataset.type] || [], b.dataset.id); if (!r) return;
    preview({ title: 'Bring back?', rows: [['Entry', recLabel(Object.assign({ type: b.dataset.type }, r))], ['Date', r.date ? dLong(r.date) : '—']], confirm: 'Bring it back', gold: true, doneMessage: 'Brought back ✓',
      onConfirm: async function () { var x = Object.assign({}, r); delete x.deleted; delete x.deletedAt; delete x.deletedBy; delete x.resetId; delete x.resetLabel; x.deleted = false; await E.save(x); return 'bin'; } });
  };
  ACT.restoreGroup = function (b) {
    var rs = binList().filter(function (r) { return r.resetId === b.dataset.id; });
    preview({ title: 'Bring back ' + rs.length + ' entries?', rows: [['Section', esc(rs[0] ? rs[0].resetLabel : '')], ['Entries', String(rs.length)]], confirm: 'Bring them back', gold: true, doneMessage: 'Brought back ✓',
      onConfirm: async function () { await E.save(rs.map(function (r) { var x = byId(st()[r.type], r.id); x = Object.assign({}, x); delete x.deletedAt; delete x.deletedBy; delete x.resetId; delete x.resetLabel; x.deleted = false; return x; })); return 'bin'; } });
  };
  routes.reset = function () {
    var t = today(), G = C.RESET_GROUPS;
    return back('settings', 'Settings') + head('Reset one section', 'Remove the entries of ONE section between two dates — e.g. test sales. Everything else stays.') +
      '<div class="alert ok small">Safe: a backup copy of the Google Sheet is made first, and the entries go to the <a href="#bin">Bin</a> — you can bring them all back for 30 days.</div>' +
      '<form class="card stack" data-form="resetsec" style="margin-top:12px"><label>Section<select name="group">' + Object.keys(G).map(function (k) { return opt(k, G[k].label); }).join('') + '</select></label>' +
      '<div class="grid g2"><label>From<input type="date" name="from" value="' + C.monthOf(t) + '-01" required></label><label>To<input type="date" name="to" value="' + t + '" required></label></div>' +
      '<div id="resetLive" class="card" style="background:var(--green-soft);border:0"></div>' +
      '<label>Your owner PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off"></label><button class="btn red" type="submit">Next: preview →</button></form>' +
      '<p class="tiny muted">Settings, people, prices, items, recipes and the schedule are never touched here.</p>';
  };
  LIVE.resetsec = function (f) {
    var p = C.resetPlan(st(), val(f, 'group'), val(f, 'from'), val(f, 'to')), box = document.getElementById('resetLive'); if (!box || !p) return;
    box.innerHTML = kv('Entries that will be removed', '<b>' + p.records.length + '</b>') + Object.keys(p.count).map(function (k) { return kv(TYPE_WORD[k] || k, String(p.count[k])); }).join('');
  };
  FORMS.resetsec = function (f) {
    var p = C.resetPlan(st(), val(f, 'group'), val(f, 'from'), val(f, 'to')), pin = val(f, 'pin').trim(), errors = [];
    if (!p) return;
    if (val(f, 'from') > val(f, 'to')) errors.push('“From” must be before “To”.');
    if (!p.records.length) errors.push('There are no entries in this section between these dates.');
    if (!/^[0-9]{4,8}$/.test(pin)) errors.push('Type your owner PIN.');
    preview({ title: 'Reset: ' + esc(p.label) + '?', errors: errors, warnings: p.notes, confirm: 'Back up, then remove ' + p.records.length,
      rows: [['Section', esc(p.label)], ['Dates', dLong(p.from) + ' – ' + dLong(p.to)], ['Entries', String(p.records.length)], ['First', 'a backup copy of the Sheet is made in Google Drive'], ['Undo', 'Bin › Bring back all (30 days)']],
      doneMessage: 'Done — backup made, entries are in the Bin',
      onConfirm: async function () {
        await E.backupNow(pin, 'before reset ' + p.group);
        var id = 'reset-' + Date.now().toString(36), label = p.label.split(' — ')[0] + ' · ' + dShort(p.from) + ' – ' + dShort(p.to) + ' ' + p.to.slice(0, 4), now = Date.now();
        await E.save(p.records.map(function (r) { return Object.assign({}, r, { deleted: true, deletedAt: now, deletedBy: me().id, resetId: id, resetLabel: label }); }));
        return 'bin';
      } });
  };
  // the owner's 🗑 button at the bottom of these pages
  [['receipt', 'sales', 'customers'], ['preceipt', 'payments', 'customers'], ['customer', 'customers', 'customers'], ['daily-edit', 'daily', 'coops'], ['waiting-item', 'waiting', 'waiting']].forEach(function (p) {
    var orig = routes[p[0]];
    routes[p[0]] = function (id) {
      var html = orig.apply(null, arguments), r = byId(st()[p[1]] || [], id);
      return html + (r && !r.deleted && realRole() === 'owner' && !S.viewAs ? delBtn(p[1], id, p[2]) : '');
    };
  });

  E.init().then(function () { render(); E.sync(); applyWake(); setTimeout(checkAlarms, 1500); pushNative(); });
  window.EggApp = { render: render, checkAlarms: checkAlarms, receiptDoc: function () { return S.receiptDoc; }, onResume: function () { pushNative(); checkAlarms(); }, nativeAlarmList: nativeAlarmList, alarmState: function () { return { ringing: AL.ringing, src: AL.audio ? AL.audio.src : '' }; } };
})();
