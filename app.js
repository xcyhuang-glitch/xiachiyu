(function () {
  'use strict';
  var CFG = window.SHOP;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  var money = function (n) { return '$' + Number(n).toLocaleString('en-US'); };

  var state = { products: [], settings: {}, cat: '冷凍', cart: {} };
  var CACHE_P = 'xcy_products_v1', CACHE_S = 'xcy_settings_v1', CART = 'xcy_cart_v1';

  /* 品名 → 照片（只用「已上浮水印」的照片；沒有照片的品項用預設底圖） */
  var IMAGE_RULES = [
    ['手剝蝦仁', 'shrimp-meat.jpg'], ['白蝦', 'shrimp.jpg'],
    ['虱目魚肚（大）', 'milkfish-belly-l.jpg'], ['虱目魚肚', 'milkfish-belly-m.jpg'], ['虱目魚', 'milkfish.jpg'],
    ['午仔魚', 'threadfin.jpg'], ['吳郭魚', 'tilapia.jpg'], ['龍虎石斑', 'grouper.jpg'],
    ['金鯧魚', 'pompano.jpg'], ['鱸魚', 'seabass.jpg'], ['透抽', 'squid.jpg'], ['帆立貝柱', 'scallop.jpg'],
    ['烏魚子', 'mullet-roe.jpg'], ['蒲燒鰻', 'eel.jpg'], ['鮭魚', 'salmon.jpg'], ['扁鱈', 'cod.jpg']
  ];
  function imageFor(p) {
    if (p.image) return p.image.indexOf('http') === 0 ? p.image : '' + p.image;
    for (var i = 0; i < IMAGE_RULES.length; i++) if (p.name.indexOf(IMAGE_RULES[i][0]) >= 0) return '' + IMAGE_RULES[i][1];
    return null;
  }

  /* ---------- 載入資料（失敗時顯示前次快取） ---------- */
  function load(action, cacheKey) {
    return fetch(CFG.api + '?action=' + action)
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
      .then(function (d) { try { localStorage.setItem(cacheKey, JSON.stringify(d)); } catch (e) {} return d; })
      .catch(function () {
        try { var c = localStorage.getItem(cacheKey); if (c) return JSON.parse(c); } catch (e) {}
        return null;
      });
  }

  function init() {
    $('#lineTop').href = CFG.lineUrl;
    [].forEach.call(document.querySelectorAll('.lineLink'), function (a) { a.href = CFG.lineUrl; });
    $('#lineId').textContent = CFG.lineId;
    try { state.cart = JSON.parse(localStorage.getItem(CART)) || {}; } catch (e) { state.cart = {}; }

    Promise.all([load('products', CACHE_P), load('settings', CACHE_S)]).then(function (res) {
      var p = res[0], s = res[1];
      if (s) { state.settings = s; renderSettings(); }
      if (p && p.products) {
        state.products = p.products;
        pruneCart();
        renderTabs();
        renderCatalog();
        renderCart();
      } else {
        var box = $('#catalog');
        box.textContent = '';
        var m = el('p', 'empty', '商品暫時載入不了，請直接到官方 LINE 詢問。');
        box.appendChild(m);
      }
    });
  }

  /* ---------- 設定（出車、物流、關於） ---------- */
  function renderSettings() {
    var s = state.settings;
    if (s.trip_schedule) $('#tripSchedule').textContent = s.trip_schedule;
    $('#tripPlace').textContent = s.trip_place || '';
    $('#tripNote').textContent = s.trip_note || '';
    if (s.trip_schedule && s.trip_place) $('#faqTrip').textContent = s.trip_schedule + '，地點在' + s.trip_place + '。';

    var cards = $('#shipCards');
    cards.textContent = '';
    [['7-11 賣貨便冷凍店到店', s.ship_711, '少量'],
     ['黑貓冷凍宅急便', s.ship_tcat, '大量'],
     ['在地外送', s.ship_local, ''],
     ['現場購買', (s.trip_schedule || '') + (s.trip_place ? '，' + s.trip_place : '') + '；活體僅限現場購買。', '']
    ].forEach(function (x) {
      if (!x[1]) return;
      var c = el('div', 'info');
      c.appendChild(el('h3', null, x[0] + (x[2] ? '（' + x[2] + '）' : '')));
      c.appendChild(el('p', null, x[1]));
      cards.appendChild(c);
    });
    if (s.ship_split && s.ship_split !== '待提供') {
      var c2 = el('div', 'info');
      c2.appendChild(el('h3', null, '賣貨便或黑貓？'));
      c2.appendChild(el('p', null, s.ship_split));
      cards.appendChild(c2);
    }
    if (s.about_text && s.about_text !== '待店主確認') {
      var a = $('#aboutText'); a.textContent = '';
      s.about_text.split(/\n+/).forEach(function (t) { a.appendChild(el('p', null, t)); });
      document.querySelector('#about .tag').hidden = true;
    }
  }

  /* ---------- 商品 ---------- */
  function renderTabs() {
    var tabs = $('#tabs'); tabs.textContent = '';
    var cats = []; state.products.forEach(function (p) { if (cats.indexOf(p.category) < 0) cats.push(p.category); });
    cats.sort(function (a, b) { return (a === '冷凍' ? 0 : 1) - (b === '冷凍' ? 0 : 1); });
    if (cats.indexOf(state.cat) < 0) state.cat = cats[0];
    cats.forEach(function (c) {
      var b = el('button', 'tab', c === '活體' ? '活體（現場販售）' : c === '冷凍' ? '冷凍與加工' : c);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', c === state.cat ? 'true' : 'false');
      b.onclick = function () { state.cat = c; renderTabs(); renderCatalog(); };
      tabs.appendChild(b);
    });
  }

  function renderCatalog() {
    var box = $('#catalog'); box.textContent = '';
    var groups = [], map = {};
    state.products.filter(function (p) { return p.category === state.cat; }).forEach(function (p) {
      if (!map[p.group]) { map[p.group] = []; groups.push(p.group); }
      map[p.group].push(p);
    });
    if (state.cat === '活體') {
      box.appendChild(el('p', 'sub', '活體商品僅限出車現場購買，這裡只供參考，無法線上購買或物流配送。'));
    }
    groups.forEach(function (g) {
      var sec = el('div', 'group');
      if (state.cat !== '活體') sec.appendChild(el('h3', null, g));
      var grid = el('div', 'grid');
      map[g].forEach(function (p) { grid.appendChild(card(p)); });
      sec.appendChild(grid);
      box.appendChild(sec);
    });
  }

  function priceLabel(p) { return p.price == null ? '待提供' : money(p.price); }

  function card(p) {
    var c = el('article', 'card');
    var im = imageFor(p), wrap = el('div', 'card__img' + (im ? '' : ' card__img--none'));
    if (im) {
      var img = el('img'); img.src = im; img.alt = p.name; img.loading = 'lazy'; img.width = 400; img.height = 300;
      img.onerror = function () { wrap.className = 'card__img card__img--none'; wrap.textContent = '圖片準備中'; };
      wrap.appendChild(img);
    } else wrap.textContent = '圖片準備中';
    c.appendChild(wrap);

    var b = el('div', 'card__body');
    b.appendChild(el('h4', 'card__name', p.name));
    b.appendChild(el('p', 'card__spec', p.spec));
    var pr = el('p', 'card__price', priceLabel(p));
    if (p.priceType === '每斤時價' && p.price != null) pr.appendChild(el('small', null, '／斤'));
    b.appendChild(pr);

    if (p.category === '活體') {
      b.appendChild(el('span', 'badge', '現場販售'));
    } else if (!p.orderable) {
      b.appendChild(el('span', 'badge', '暫無供應'));
      c.className += ' card--off';
    } else {
      var act = el('div', 'card__act');
      var cp = el('button', 'copy', '複製');
      cp.setAttribute('aria-label', '複製 ' + p.name + ' 品名與售價');
      cp.onclick = function () {
        copyText(p.name + ' ' + p.spec + ' ' + money(p.price)).then(function (ok) {
          if (ok) { cp.textContent = '已複製'; cp.classList.add('done'); setTimeout(function () { cp.textContent = '複製'; cp.classList.remove('done'); }, 1500); }
          else toast('無法自動複製，請長按文字手動複製');
        });
      };
      var q = el('div', 'qty');
      var minus = el('button', null, '−'), n = el('span', null, String(state.cart[p.id] || 0)), plus = el('button', null, '+');
      minus.setAttribute('aria-label', '減少 ' + p.name); plus.setAttribute('aria-label', '增加 ' + p.name);
      minus.disabled = !state.cart[p.id];
      minus.onclick = function () { setQty(p.id, (state.cart[p.id] || 0) - 1); n.textContent = state.cart[p.id] || 0; minus.disabled = !state.cart[p.id]; };
      plus.onclick = function () { setQty(p.id, (state.cart[p.id] || 0) + 1); n.textContent = state.cart[p.id]; minus.disabled = false; };
      q.appendChild(minus); q.appendChild(n); q.appendChild(plus);
      act.appendChild(cp); act.appendChild(q);
      b.appendChild(act);
    }
    c.appendChild(b);
    return c;
  }

  /* ---------- 清單 ---------- */
  function byId(id) { for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i]; }
  function pruneCart() {
    Object.keys(state.cart).forEach(function (id) { var p = byId(id); if (!p || !p.orderable) delete state.cart[id]; });
    saveCart();
  }
  function saveCart() { try { localStorage.setItem(CART, JSON.stringify(state.cart)); } catch (e) {} }
  function setQty(id, n) {
    n = Math.max(0, Math.min(99, n));
    if (n) state.cart[id] = n; else delete state.cart[id];
    saveCart(); renderCart();
  }
  function cartItems() {
    return Object.keys(state.cart).map(function (id) { var p = byId(id); return p && { p: p, q: state.cart[id] }; }).filter(Boolean);
  }
  function cartTotal() { return cartItems().reduce(function (s, x) { return s + x.p.price * x.q; }, 0); }
  function listText() {
    var lines = ['【瞎吃魚 訂購清單】'];
    cartItems().forEach(function (x) { lines.push(x.p.name + ' ' + x.p.spec + ' x' + x.q + ' = ' + money(x.p.price * x.q)); });
    lines.push('合計：' + money(cartTotal()) + '（不含運費）');
    return lines.join('\n');
  }

  function renderCart() {
    var items = cartItems(), count = items.reduce(function (s, x) { return s + x.q; }, 0);
    $('#cartN').textContent = count;
    $('#cartFab').classList.toggle('show', count > 0);
    $('#cartTotal').textContent = money(cartTotal());
    var box = $('#cartList'); box.textContent = '';
    if (!items.length) { box.appendChild(el('p', 'empty', '還沒有品項，回商品區按「+」加入。')); $('#copyGo').disabled = true; }
    else $('#copyGo').disabled = false;
    items.forEach(function (x) {
      var row = el('div', 'line');
      var l = el('div');
      l.appendChild(el('div', 'line__name', x.p.name));
      l.appendChild(el('div', 'line__spec', x.p.spec + '　' + money(x.p.price) + ' × ' + x.q));
      var r = el('div', 'line__sum', money(x.p.price * x.q));
      var q = el('div', 'qty');
      var m = el('button', null, '−'), n = el('span', null, String(x.q)), pl = el('button', null, '+');
      m.setAttribute('aria-label', '減少 ' + x.p.name); pl.setAttribute('aria-label', '增加 ' + x.p.name);
      m.onclick = function () { setQty(x.p.id, x.q - 1); renderCatalog(); };
      pl.onclick = function () { setQty(x.p.id, x.q + 1); renderCatalog(); };
      q.appendChild(m); q.appendChild(n); q.appendChild(pl);
      row.appendChild(l); row.appendChild(r); row.appendChild(q);
      box.appendChild(row);
    });
    if (!items.length && !$('#drawer').hidden) closeDrawer();
  }

  var lastFocus;
  function openDrawer() { lastFocus = document.activeElement; $('#drawer').hidden = false; $('#overlay').hidden = false; $('#manualBox').hidden = true; $('#drawerClose').focus(); }
  function closeDrawer() { $('#drawer').hidden = true; $('#overlay').hidden = true; if (lastFocus) lastFocus.focus(); }
  $('#cartFab').onclick = openDrawer;
  $('#drawerClose').onclick = closeDrawer;
  $('#overlay').onclick = closeDrawer;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });
  $('#clearCart').onclick = function () { state.cart = {}; saveCart(); renderCart(); renderCatalog(); };

  $('#copyGo').onclick = function () {
    var text = listText();
    copyText(text).then(function (ok) {
      if (ok) {
        toast('已複製清單，正在開啟 LINE');
        setTimeout(function () { window.location.href = CFG.lineUrl; }, 400);
      } else {
        var t = $('#manualText'); t.value = text; $('#manualBox').hidden = false; t.focus(); t.select();
      }
    });
  };

  /* ---------- 複製與提示 ---------- */
  function copyText(text) {
    function fallback() {
      try {
        var t = document.createElement('textarea');
        t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(t); t.select(); t.setSelectionRange(0, text.length);
        var ok = document.execCommand('copy'); document.body.removeChild(t); return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return fallback(); });
    }
    return Promise.resolve(fallback());
  }
  var tt;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  init();
})();
