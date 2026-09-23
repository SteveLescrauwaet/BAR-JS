(() => {
  'use strict';

  const cfg = window.JSD_BAR_CONFIG || {};
  const CONFIG_READY = /^https:\/\/.+\.supabase\.co$/i.test(cfg.supabaseUrl || '') &&
    typeof cfg.supabasePublishableKey === 'string' &&
    cfg.supabasePublishableKey.length > 20 &&
    !cfg.supabasePublishableKey.includes('REMPLACE_MOI');

  let db = null;
  const state = {
    session: null,
    user: null,
    profile: null,
    categories: [],
    products: [],
    cart: new Map(),
    cashoutsToday: [],
    frontTab: 'sales',
    adminTab: 'dashboard',
    historyDate: localDateKey(new Date()),
    realtimeChannel: null,
    realtimeTimer: null,
    installPrompt: null,
    busySale: false,
    cartHome: null,
  };

  const currencyFmt = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });
  const byId = (id) => document.getElementById(id);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v = '') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const money = (v) => currencyFmt.format(Number(v || 0));
  const num = (v) => Number(v || 0);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function dayRange(dateKey) {
    const start = new Date(`${dateKey}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return [start.toISOString(), end.toISOString()];
  }

  function dateTime(v) {
    const d = new Date(v);
    return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'short', timeStyle: 'short' }).format(d);
  }

  function timeOnly(v) {
    const d = new Date(v);
    return new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' }).format(d);
  }

  function initials(name = '') {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(p => p[0]).join('') || '?').toUpperCase();
  }

  function normalizeProductKey(name = '') {
    return String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  const LOCAL_PRODUCT_IMAGE_MAP = {
    coca_cola: 'coca_cola.png',
    coca_cola_zero: 'coca_zero.png',
    fanta: 'fanta.png',
    sprite: 'sprite.png',
    fuze_tea_peche: 'fuze_tea.png',
    jus_de_fruit: 'looza.png',
    oasis: 'oasis.png',
    aquarius: 'aquarius.png',
    eau_plate: 'spa_plate.png',
    eau_petillante: 'spa_petillante.png',

    jupiler: 'jupiler.png',
    stella: 'stella.png',
    jupiler_zero: 'jupiler_zero.png',
    carlsberg_zero: 'carlsberg_zero.png',
    hoegaarden_rosee: 'hoegaarden_rosee.png',
    liefmans: 'liefmans.png',
    desperados: 'desperados.png',

    paix_dieu: 'paix_dieu.png',
    orval: 'orval.png',
    duvel: 'duvel.png',
    omer: 'omer.png',
    kasteel_rouge: 'kasteel_rouge.png',
    badou: 'badou.png',
    autres: 'badou.png',

    cava: 'freixenet.png',
    vin_blanc: 'vin_blanc.png',
    vin_rouge: 'vin_rouge.png',
    vin_rose: 'vin_rose.png',
    porto: 'porto.png',
    martini_rouge: 'martini.png',
    martini_blanc: 'martini.png',

    cafe: 'cafe.png',
    the: 'the.png',
    chocolat_chaud: 'chocolat_chaud.png',
    soupe: 'soupe.png',

    chips: 'croky.png',
    croque: 'croque.png',
    hamburger_mexicanos: 'hamburger_mexicanos.png',
    hamburger: 'hamburger.png',
    gaufre_nature: 'gaufre.png',
    gaufre_nutella: 'gaufre.png'
  };

  function localProductImageUrl(p) {
    const key = normalizeProductKey(p?.name || '');
    const file = LOCAL_PRODUCT_IMAGE_MAP[key];
    return file ? `./assets/product-images/${file}` : '';
  }

  function productImageUrl(p) {
    if (p?.image_path && db) {
      const { data } = db.storage.from('product-images').getPublicUrl(p.image_path);
      if (data?.publicUrl) return data.publicUrl;
    }
    return localProductImageUrl(p);
  }

  function toast(message, type = 'ok') {
    const root = byId('toastRoot');
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}`;
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  function setOnlineUi() {
    const online = navigator.onLine;
    byId('offlineBanner')?.classList.toggle('hidden', online);
    const s = byId('syncStatus');
    if (s) {
      s.textContent = online ? '● connecté' : '● hors ligne';
      s.classList.toggle('warn', !online);
    }
  }

  function showOnly(screenId) {
    ['setupScreen', 'authScreen', 'appShell'].forEach(id => byId(id)?.classList.toggle('hidden', id !== screenId));
    if (screenId !== 'appShell') byId('adminPanel')?.classList.add('hidden');
  }

  function modalShell(title, html, { wide = false } = {}) {
    const root = byId('modalRoot');
    root.innerHTML = `
      <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-modal-close>✕</button></div>
        <div class="modal-body">${html}</div>
        <div class="modal-actions" id="modalActions"></div>
      </div>`;
    root.classList.remove('hidden');
    const close = () => { root.classList.add('hidden'); root.innerHTML = ''; };
    root.querySelector('[data-modal-close]')?.addEventListener('click', close);
    root.addEventListener('click', e => { if (e.target === root) close(); }, { once: true });
    return { root, close, actions: byId('modalActions') };
  }

  function addModalButtons(actionsEl, buttons) {
    actionsEl.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn ${b.className || 'secondary'}`;
      btn.textContent = b.label;
      btn.disabled = !!b.disabled;
      btn.addEventListener('click', b.onClick);
      actionsEl.appendChild(btn);
    });
  }

  function confirmDialog(title, message, confirmLabel = 'Confirmer', danger = false) {
    return new Promise(resolve => {
      const m = modalShell(title, `<p style="line-height:1.55;margin:0">${esc(message)}</p>`);
      addModalButtons(m.actions, [
        { label: 'Annuler', onClick: () => { m.close(); resolve(false); } },
        { label: confirmLabel, className: danger ? 'danger' : 'primary', onClick: () => { m.close(); resolve(true); } }
      ]);
    });
  }

  async function boot() {
    setOnlineUi();
    window.addEventListener('online', setOnlineUi);
    window.addEventListener('offline', setOnlineUi);
    registerServiceWorker();
    setupInstallPrompt();
    bindStaticEvents();

    if (!CONFIG_READY) {
      showOnly('setupScreen');
      return;
    }

    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data: { session } } = await db.auth.getSession();
    if (session) await onSignedIn(session);
    else showOnly('authScreen');

    db.auth.onAuthStateChange(async (event, session2) => {
      if (event === 'SIGNED_OUT' || !session2) {
        cleanupRealtime();
        state.session = state.user = state.profile = null;
        state.cart.clear();
        showOnly('authScreen');
      } else if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        if (!state.user || state.user.id !== session2.user.id) await onSignedIn(session2);
      }
    });
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      try { await navigator.serviceWorker.register('./service-worker.js', { scope: './' }); }
      catch (err) { console.warn('Service worker:', err); }
    }
  }

  function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.installPrompt = e;
      byId('installBtn')?.classList.remove('hidden');
    });
    window.addEventListener('appinstalled', () => {
      state.installPrompt = null;
      byId('installBtn')?.classList.add('hidden');
      toast('Application installée.');
    });
  }

  function bindStaticEvents() {
    byId('loginForm')?.addEventListener('submit', login);
    byId('logoutBtn')?.addEventListener('click', async () => { if (db) await db.auth.signOut(); });
    byId('installBtn')?.addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      byId('installBtn').classList.add('hidden');
    });
    byId('deviceBtn')?.addEventListener('click', editDeviceLabel);
    byId('adminBtn')?.addEventListener('click', openAdmin);
    byId('closeAdminBtn')?.addEventListener('click', closeAdmin);
    byId('clearCartBtn')?.addEventListener('click', () => { state.cart.clear(); renderCart(); });
    byId('cashPayBtn')?.addEventListener('click', cashPayment);
    byId('cardPayBtn')?.addEventListener('click', cardPayment);
    byId('offerBtn')?.addEventListener('click', offeredPayment);
    byId('refereeConsumptionBtn')?.addEventListener('click', refereeConsumption);
    byId('mobileCartBtn')?.addEventListener('click', openCartDrawer);
    byId('cartDrawerBackdrop')?.addEventListener('click', closeCartDrawer);

    qsa('.front-tab').forEach(btn => btn.addEventListener('click', () => setFrontTab(btn.dataset.frontTab)));
    qsa('.cashout-type-card').forEach(btn => btn.addEventListener('click', () => cashOutForm(btn.dataset.cashoutType)));
    qsa('.admin-tab').forEach(btn => btn.addEventListener('click', () => setAdminTab(btn.dataset.adminTab)));
  }

  async function login(e) {
    e.preventDefault();
    const errBox = byId('loginError');
    errBox.classList.add('hidden');
    const email = byId('loginEmail').value.trim();
    const password = byId('loginPassword').value;
    const submit = e.submitter;
    submit.disabled = true;
    try {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (err) {
      errBox.textContent = 'Connexion impossible : ' + (err.message || err);
      errBox.classList.remove('hidden');
    } finally { submit.disabled = false; }
  }

  async function onSignedIn(session) {
    state.session = session;
    state.user = session.user;
    await loadProfile();
    showOnly('appShell');
    setDeviceLabelUi();
    byId('adminBtn').classList.toggle('hidden', state.profile?.role !== 'admin');
    await Promise.all([loadCatalog(), loadCashoutsToday()]);
    renderCatalog();
    renderCart();
    renderCashoutsToday();
    subscribeRealtime();
  }

  async function loadProfile() {
    let { data, error } = await db.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if (error) throw error;
    if (!data) {
      await new Promise(r => setTimeout(r, 500));
      ({ data, error } = await db.from('profiles').select('*').eq('id', state.user.id).maybeSingle());
      if (error) throw error;
    }
    state.profile = data || { id: state.user.id, email: state.user.email, role: 'cashier', display_name: state.user.email };
  }

  function deviceLabel() {
    let label = localStorage.getItem('jsd_bar_device_label');
    if (!label) {
      label = `Appareil-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      localStorage.setItem('jsd_bar_device_label', label);
    }
    return label;
  }

  function setDeviceLabelUi() { if (byId('deviceLabel')) byId('deviceLabel').textContent = deviceLabel(); }

  function editDeviceLabel() {
    const m = modalShell('Nom de cet appareil', `
      <label>Nom affiché dans l’historique
        <input id="deviceNameInput" value="${esc(deviceLabel())}" maxlength="50" placeholder="Ex. Tablette bar 1" />
      </label>
      <p class="muted small">Ce nom permet de savoir depuis quel PC ou quelle tablette une opération a été encodée.</p>`);
    addModalButtons(m.actions, [
      { label: 'Annuler', onClick: m.close },
      { label: 'Enregistrer', className: 'primary', onClick: () => {
        const v = byId('deviceNameInput').value.trim();
        if (!v) return;
        localStorage.setItem('jsd_bar_device_label', v);
        setDeviceLabelUi(); m.close(); toast('Nom de l’appareil enregistré.');
      }}
    ]);
  }

  async function loadCatalog() {
    const [{ data: cats, error: catErr }, { data: products, error: prodErr }] = await Promise.all([
      db.from('categories').select('*').order('sort_order', { ascending: true }).order('name'),
      db.from('products').select('*').eq('active', true).order('category').order('sort_order', { ascending: true }).order('name')
    ]);
    if (catErr) throw catErr;
    if (prodErr) throw prodErr;
    state.categories = cats || [];
    state.products = (products || []).map(p => ({ ...p, imageUrl: productImageUrl(p) }));
    sanitizeCart();
  }

  function sanitizeCart() {
    for (const [id, qty] of [...state.cart.entries()]) {
      const p = state.products.find(x => x.id === id);
      if (!p) state.cart.delete(id);
      else if (p.stock_tracked && qty > p.stock) {
        if (p.stock <= 0) state.cart.delete(id); else state.cart.set(id, p.stock);
      }
    }
    renderCart();
  }

  function categoriesWithProducts() {
    const existing = new Set(state.products.map(p => p.category));
    const ordered = state.categories.filter(c => existing.has(c.name));
    const missing = [...existing].filter(name => !ordered.some(c => c.name === name)).sort().map((name, i) => ({ name, sort_order: 9990 + i }));
    return [...ordered, ...missing];
  }

  function renderCatalog() {
    const cats = categoriesWithProducts();
    byId('categoryChips').innerHTML = cats.map((c, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-category="${esc(c.name)}">${esc(c.name)}</button>`).join('');
    byId('catalog').innerHTML = cats.map(c => {
      const products = state.products.filter(p => p.category === c.name).sort((a,b) => a.sort_order-b.sort_order || a.name.localeCompare(b.name));
      return `<section class="category-section" id="cat-${slug(c.name)}">
        <div class="category-title">${esc(c.name)}</div>
        <div class="product-grid">${products.map(productCardHtml).join('')}</div>
      </section>`;
    }).join('') || `<div class="empty-state">Aucun produit actif.</div>`;

    qsa('.chip', byId('categoryChips')).forEach(chip => chip.addEventListener('click', () => {
      qsa('.chip', byId('categoryChips')).forEach(x => x.classList.remove('active'));
      chip.classList.add('active');
      document.getElementById(`cat-${slug(chip.dataset.category)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    qsa('.product-card', byId('catalog')).forEach(card => card.addEventListener('click', () => addToCart(card.dataset.productId)));
  }

  function slug(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase(); }

  function productCardHtml(p) {
    const low = p.stock_tracked && p.starting_stock > 0 && p.stock <= p.starting_stock * .10;
    const out = p.stock_tracked && p.stock <= 0;
    const photo = p.imageUrl
      ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" />`
      : `<div class="product-fallback">${esc(initials(p.name))}</div>`;
    return `<button class="product-card ${out ? 'out' : ''}" data-product-id="${p.id}" ${out ? 'disabled' : ''}>
      ${p.stock_tracked ? `<span class="stock-badge ${low ? 'low' : ''}">${p.stock}</span>` : ''}
      <div class="product-photo">${photo}</div>
      <div class="product-name">${esc(p.name)}</div>
      <div class="product-price">${money(p.sale_price)}</div>
    </button>`;
  }

  function addToCart(id) {
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const current = state.cart.get(id) || 0;
    if (p.stock_tracked && current >= p.stock) {
      toast(`${p.name} : stock insuffisant (${p.stock} disponible${p.stock > 1 ? 's' : ''}).`, 'warn');
      return;
    }
    state.cart.set(id, current + 1);
    renderCart();
  }

  function changeQty(id, delta) {
    const current = state.cart.get(id) || 0;
    const p = state.products.find(x => x.id === id);
    if (!p) return;
    const next = current + delta;
    if (next <= 0) state.cart.delete(id);
    else if (p.stock_tracked && next > p.stock) toast(`Stock maximum atteint pour ${p.name}.`, 'warn');
    else state.cart.set(id, next);
    renderCart();
  }

  function cartTotal() {
    let t = 0;
    for (const [id, qty] of state.cart) {
      const p = state.products.find(x => x.id === id);
      if (p) t += num(p.sale_price) * qty;
    }
    return t;
  }

  function cartCost() {
    let t = 0;
    for (const [id, qty] of state.cart) {
      const p = state.products.find(x => x.id === id);
      if (p) t += num(p.cost_price) * qty;
    }
    return t;
  }

  function cartCount() { return [...state.cart.values()].reduce((a,b) => a+b, 0); }

  function renderCart() {
    const lines = byId('cartLines');
    if (!lines) return;
    const entries = [...state.cart.entries()];
    lines.innerHTML = entries.length ? entries.map(([id, qty]) => {
      const p = state.products.find(x => x.id === id);
      if (!p) return '';
      const thumb = p.imageUrl
        ? `<img class="cart-line-thumb-img" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" />`
        : `<div class="cart-line-thumb-fallback">${esc(initials(p.name))}</div>`;
      return `<div class="cart-line">
        <div class="cart-line-main">
          <div class="cart-line-thumb">${thumb}</div>
          <div class="cart-line-text">
            <div class="cart-line-name">${esc(p.name)}</div>
            <div class="muted small">${money(p.sale_price)} / unité</div>
          </div>
        </div>
        <div class="cart-line-actions">
          <button class="qty-btn" data-cart-delta="-1" data-product-id="${id}">−</button>
          <strong>${qty}</strong>
          <button class="qty-btn" data-cart-delta="1" data-product-id="${id}">+</button>
          <span class="line-total">${money(num(p.sale_price)*qty)}</span>
        </div>
      </div>`;
    }).join('') : `<div class="empty-state">Touchez un produit pour commencer</div>`;
    qsa('[data-cart-delta]', lines).forEach(btn => btn.addEventListener('click', () => changeQty(btn.dataset.productId, Number(btn.dataset.cartDelta))));

    const total = cartTotal(), count = cartCount(), empty = count === 0;
    byId('cartTotal').textContent = money(total);
    byId('mobileCartTotal').textContent = money(total);
    byId('mobileCartLabel').textContent = empty ? 'COMMANDE' : `COMMANDE • ${count} article${count > 1 ? 's' : ''}`;
    byId('mobileCartBtn').classList.toggle('has-items', !empty);
    ['cashPayBtn','cardPayBtn','offerBtn','refereeConsumptionBtn','clearCartBtn'].forEach(id => { if (byId(id)) byId(id).disabled = empty; });
  }

  function openCartDrawer() {
    if (window.innerWidth > 800) return;
    const panel = byId('cartPanel');
    if (!state.cartHome) state.cartHome = panel.parentElement;
    byId('cartDrawer').appendChild(panel);
    byId('cartDrawer').classList.remove('hidden');
    byId('cartDrawerBackdrop').classList.remove('hidden');
    renderCart();
  }

  function closeCartDrawer() {
    const panel = byId('cartPanel');
    if (state.cartHome && panel.parentElement !== state.cartHome) state.cartHome.appendChild(panel);
    byId('cartDrawer').classList.add('hidden');
    byId('cartDrawerBackdrop').classList.add('hidden');
  }

  function saleLinesPayload() { return [...state.cart.entries()].map(([product_id, quantity]) => ({ product_id, quantity })); }

  async function submitSale(method, extra = {}) {
    if (!state.cart.size || state.busySale) return null;
    state.busySale = true;
    setPaymentButtonsBusy(true);
    try {
      const { data, error } = await db.rpc('create_sale', {
        p_method: method,
        p_lines: saleLinesPayload(),
        p_offered_by: extra.offeredBy || '',
        p_referee_name: extra.refereeName || '',
        p_admin_pin: extra.adminPin || null,
        p_device_label: deviceLabel()
      });
      if (error) throw error;
      state.cart.clear();
      await loadCatalog();
      renderCatalog(); renderCart();
      closeCartDrawer();
      return data;
    } catch (err) {
      toast(err.message || String(err), 'error');
      return null;
    } finally {
      state.busySale = false;
      setPaymentButtonsBusy(false);
    }
  }

  function setPaymentButtonsBusy(busy) {
    ['cashPayBtn','cardPayBtn','offerBtn','refereeConsumptionBtn'].forEach(id => { const el=byId(id); if(el) el.disabled = busy || state.cart.size===0; });
  }

  async function cashPayment() {
    if (!state.cart.size) return;
    const total = cartTotal();
    const m = modalShell('Paiement en espèces', `
      <div class="help-box" style="text-align:center;margin-bottom:12px"><div>TOTAL</div><strong style="font-size:2rem;color:#fff">${money(total)}</strong></div>
      <label>Montant reçu<input id="cashReceived" type="number" min="${total}" step="0.01" inputmode="decimal" autofocus /></label>`);
    addModalButtons(m.actions, [
      {label:'Annuler',onClick:m.close},
      {label:'Encaisser',className:'success',onClick:async()=>{
        const received=Number(byId('cashReceived').value);
        if(!Number.isFinite(received)||received<total){toast('Le montant reçu doit être au moins égal au total.','warn');return;}
        m.close();
        const result=await submitSale('Espèces');
        if(result){
          const change=received-total;
          const x=modalShell('Paiement enregistré',`<div style="text-align:center"><div class="muted">À RENDRE</div><div style="font-size:2.7rem;font-weight:900;color:#76df9d">${money(change)}</div></div>`);
          addModalButtons(x.actions,[{label:'Nouveau client',className:'primary',onClick:x.close}]);
        }
      }}
    ]);
    setTimeout(()=>byId('cashReceived')?.focus(),40);
  }

  async function cardPayment() {
    if (!state.cart.size) return;
    const total = cartTotal();
    const ok = await confirmDialog('CARTE / SUMUP', `Montant à encaisser : ${money(total)}. Confirmer lorsque le paiement SumUp est accepté.`, 'Paiement accepté');
    if (!ok) return;
    const result = await submitSale('Carte');
    if (result) toast(`Paiement SumUp enregistré : ${money(total)}.`);
  }

  function offeredPayment() {
    if (!state.cart.size) return;
    const m = modalShell('Offert par le bar', `
      <div class="warning-box" style="margin-bottom:12px">Cette commande génère 0 € de chiffre d’affaires. Les articles sortent du stock et leur coût d’achat diminue le bénéfice.</div>
      <div class="field-grid">
        <label>Code administrateur<input id="offerPin" type="password" inputmode="numeric" maxlength="8" /></label>
        <label>Offert par<input id="offeredBy" maxlength="80" value="${esc(state.profile?.display_name || '')}" placeholder="Nom de la personne" /></label>
      </div>
      <div class="help-box" style="margin-top:12px">Valeur commerciale : <strong>${money(cartTotal())}</strong></div>`);
    addModalButtons(m.actions,[
      {label:'Annuler',onClick:m.close},
      {label:'Enregistrer l’offert',className:'primary',onClick:async()=>{
        const pin=byId('offerPin').value.trim(), offeredBy=byId('offeredBy').value.trim();
        if(!pin||!offeredBy){toast('Code admin et nom sont obligatoires.','warn');return;}
        m.close();
        const result=await submitSale('Offert',{adminPin:pin,offeredBy});
        if(result) toast(`Commande offerte enregistrée • offert par ${offeredBy}.`);
      }}
    ]);
  }

  function refereeConsumption() {
    if (!state.cart.size) return;
    const m = modalShell('Conso arbitre', `
      <div class="help-box" style="margin-bottom:12px">Les articles sont retirés du stock. La commande génère 0 € de CA et son coût d’achat diminue le bénéfice.</div>
      <label>Nom de l’arbitre<input id="refereeName" maxlength="100" placeholder="Nom et prénom" /></label>
      <div class="help-box" style="margin-top:12px">Valeur des consommations : <strong>${money(cartTotal())}</strong></div>`);
    addModalButtons(m.actions,[
      {label:'Annuler',onClick:m.close},
      {label:'Enregistrer la conso',className:'primary',onClick:async()=>{
        const refereeName=byId('refereeName').value.trim();
        if(!refereeName){toast('Encode le nom de l’arbitre.','warn');return;}
        m.close();
        const result=await submitSale('Conso arbitre',{refereeName});
        if(result) toast(`Conso arbitre enregistrée pour ${refereeName}.`);
      }}
    ]);
  }

  function setFrontTab(tab) {
    state.frontTab = tab;
    qsa('.front-tab').forEach(b => b.classList.toggle('active', b.dataset.frontTab === tab));
    byId('salesView').classList.toggle('hidden', tab !== 'sales');
    byId('cashoutsView').classList.toggle('hidden', tab !== 'cashouts');
    byId('mobileCartBtn').classList.toggle('hidden', tab !== 'sales');
    if (tab === 'cashouts') loadCashoutsToday().then(renderCashoutsToday).catch(err => toast(err.message,'error'));
  }

  async function loadCashoutsToday() {
    const [from,to]=dayRange(localDateKey(new Date()));
    const { data,error }=await db.from('cash_outs').select('*').gte('created_at',from).lt('created_at',to).order('created_at',{ascending:false});
    if(error) throw error;
    state.cashoutsToday=data||[];
  }

  function renderCashoutsToday() {
    const total=state.cashoutsToday.reduce((s,x)=>s+num(x.amount),0);
    if(byId('cashoutTodayTotal')) byId('cashoutTodayTotal').textContent=money(total);
    const root=byId('cashoutTodayList'); if(!root)return;
    root.innerHTML=state.cashoutsToday.length?state.cashoutsToday.map(c=>`
      <div class="history-card">
        <div class="history-card-main"><div class="history-card-title">${esc(c.type)} • ${esc(c.person_name)}</div>
        <div class="history-card-sub">${c.type==='Prélèvement caisse trésorier'
          ? `Prélèvement trésorier • ${timeOnly(c.created_at)}${c.device_label?` • ${esc(c.device_label)}`:''}`
          : `Équipe ${esc(c.team)} • match ${esc(c.match_time)} • ${timeOnly(c.created_at)}${c.device_label?` • ${esc(c.device_label)}`:''}`}</div></div>
        <div class="history-card-amount money-negative">− ${money(c.amount)}</div>
      </div>`).join(''):`<div class="admin-card muted">Aucune sortie de caisse enregistrée aujourd’hui.</div>`;
  }

  function cashOutForm(type) {
    const official=type==='Arbitre officiel';
    const treasurer=type==='Prélèvement caisse trésorier';
    const m=modalShell(type, treasurer ? `
      <div class="field-grid">
        <label>Nom du trésorier / responsable<input id="cashoutName" maxlength="100" placeholder="Nom et prénom" /></label>
        <label>Montant prélevé<input id="cashoutAmount" type="number" min="0.01" step="0.01" inputmode="decimal" /></label>
      </div>
      <div class="help-box" style="margin-top:12px">Ce prélèvement est enregistré comme une sortie de caisse et diminue le bénéfice net ainsi que la caisse espèces théorique de la journée.</div>` : `
      <div class="field-grid">
        <label>${official?'Nom de l’arbitre':'Nom du joueur qui arbitre'}<input id="cashoutName" maxlength="100" /></label>
        <label>Montant payé<input id="cashoutAmount" type="number" min="0.01" step="0.01" inputmode="decimal" /></label>
        <label>Équipe arbitrée<input id="cashoutTeam" placeholder="Ex. U10, U12, U15…" maxlength="50" /></label>
        <label>Heure du match<input id="cashoutTime" type="time" /></label>
      </div>`);
    addModalButtons(m.actions,[
      {label:'Annuler',onClick:m.close},
      {label:'Enregistrer',className:'primary',onClick:async()=>{
        const person_name=byId('cashoutName').value.trim();
        const amount=Number(byId('cashoutAmount').value);
        const team=treasurer?'—':byId('cashoutTeam').value.trim();
        const match_time=treasurer?'—':byId('cashoutTime').value;
        if(!person_name||!Number.isFinite(amount)||amount<=0||(!treasurer&&(!team||!match_time))){toast('Complète tous les champs.','warn');return;}
        const {error}=await db.from('cash_outs').insert({type,person_name,amount,team,match_time,device_label:deviceLabel(),created_by:state.user.id});
        if(error){toast(error.message,'error');return;}
        m.close(); await loadCashoutsToday(); renderCashoutsToday(); toast(treasurer?`Prélèvement trésorier enregistré : ${money(amount)}.`:`Sortie de caisse enregistrée : ${money(amount)}.`);
      }}
    ]);
  }

  function subscribeRealtime() {
    cleanupRealtime();
    state.realtimeChannel=db.channel('jsd-bar-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'products'},()=>realtimeRefresh('catalog'))
      .on('postgres_changes',{event:'*',schema:'public',table:'categories'},()=>realtimeRefresh('catalog'))
      .on('postgres_changes',{event:'*',schema:'public',table:'cash_outs'},()=>realtimeRefresh('cashouts'))
      .on('postgres_changes',{event:'*',schema:'public',table:'sales'},()=>realtimeRefresh('admin'))
      .on('postgres_changes',{event:'*',schema:'public',table:'cash_floats'},()=>realtimeRefresh('admin'))
      .subscribe(status=>{
        const s=byId('syncStatus');
        if(!s)return;
        if(status==='SUBSCRIBED'){s.textContent='● synchronisé';s.classList.remove('warn');}
        else if(['CHANNEL_ERROR','TIMED_OUT'].includes(status)){s.textContent='● synchro à vérifier';s.classList.add('warn');}
      });
  }

  function realtimeRefresh(kind) {
    clearTimeout(state.realtimeTimer);
    state.realtimeTimer=setTimeout(async()=>{
      try{
        if(kind==='catalog'){await loadCatalog();renderCatalog();renderCart();}
        if(kind==='cashouts'){await loadCashoutsToday();renderCashoutsToday();}
        if(state.profile?.role==='admin'&&!byId('adminPanel').classList.contains('hidden')) await renderAdminTab();
      }catch(err){console.warn(err);}
    },250);
  }

  function cleanupRealtime() {
    if(state.realtimeChannel&&db){db.removeChannel(state.realtimeChannel).catch(()=>{});state.realtimeChannel=null;}
  }

  // -------------------------------------------------------------------------
  // ADMIN
  // -------------------------------------------------------------------------
  function openAdmin() {
    if(state.profile?.role!=='admin'){toast('Compte administrateur requis.','error');return;}
    byId('adminPanel').classList.remove('hidden');
    byId('adminUserLabel').textContent=`${state.profile.display_name||state.profile.email||'Administrateur'} • ${deviceLabel()}`;
    setAdminTab(state.adminTab || 'dashboard');
  }
  function closeAdmin(){byId('adminPanel').classList.add('hidden');}

  function setAdminTab(tab){
    state.adminTab=tab;
    qsa('.admin-tab').forEach(b=>b.classList.toggle('active',b.dataset.adminTab===tab));
    renderAdminTab().catch(err=>{console.error(err);toast(err.message||String(err),'error');});
  }

  async function renderAdminTab(){
    const root=byId('adminContent');
    root.innerHTML=`<div class="admin-card muted">Chargement…</div>`;
    if(state.adminTab==='dashboard') return renderDashboard(root);
    if(state.adminTab==='products') return renderProductsAdmin(root);
    if(state.adminTab==='stock') return renderStockAdmin(root);
    if(state.adminTab==='history') return renderHistoryAdmin(root);
    if(state.adminTab==='settings') return renderSettingsAdmin(root);
  }

  async function fetchDayData(dateKey){
    const [from,to]=dayRange(dateKey);
    const [{data:sales,error:sErr},{data:cashouts,error:cErr},{data:float,error:fErr}]=await Promise.all([
      db.from('sales').select('*, sale_lines(*)').gte('created_at',from).lt('created_at',to).order('created_at',{ascending:false}),
      db.from('cash_outs').select('*').gte('created_at',from).lt('created_at',to).order('created_at',{ascending:false}),
      db.from('cash_floats').select('*').eq('business_date',dateKey).maybeSingle()
    ]);
    if(sErr)throw sErr;if(cErr)throw cErr;if(fErr)throw fErr;
    return {sales:sales||[],cashouts:cashouts||[],cashFloat:float||null};
  }

  function dayStats(data){
    const sales=data.sales||[], cashouts=data.cashouts||[];
    const ca=sales.reduce((s,x)=>s+num(x.total),0);
    const cost=sales.reduce((s,x)=>s+num(x.cost),0);
    const cash=sales.filter(x=>x.method==='Espèces').reduce((s,x)=>s+num(x.total),0);
    const card=sales.filter(x=>x.method==='Carte').reduce((s,x)=>s+num(x.total),0);
    const offered=sales.filter(x=>x.method==='Offert').reduce((s,x)=>s+num(x.commercial_value),0);
    const referee=sales.filter(x=>x.method==='Conso arbitre').reduce((s,x)=>s+num(x.commercial_value),0);
    const cashOut=cashouts.reduce((s,x)=>s+num(x.amount),0);
    const profit=ca-cost-cashOut;
    const opening=num(data.cashFloat?.total);
    const theoreticalCash=opening+cash-cashOut;
    return {ca,cost,cash,card,offered,referee,cashOut,profit,opening,theoreticalCash,tickets:sales.length};
  }

  function statCard(label,value,sub=''){return `<div class="stat-card"><div class="stat-label">${esc(label)}</div><div class="stat-value">${typeof value==='number'?money(value):esc(value)}</div>${sub?`<div class="stat-sub">${esc(sub)}</div>`:''}</div>`;}

  async function renderDashboard(root){
    await loadCatalog();
    const dateKey=localDateKey(new Date());
    const data=await fetchDayData(dateKey), s=dayStats(data);
    const low=state.products.filter(p=>p.stock_tracked&&p.starting_stock>0&&p.stock<=p.starting_stock*.10);
    root.innerHTML=`
      <div class="admin-toolbar"><div><h2>Tableau de bord</h2><div class="muted small">${new Intl.DateTimeFormat('fr-BE',{dateStyle:'full'}).format(new Date())}</div></div>
        <button class="btn primary" id="dashboardFloatBtn">${s.opening>0?'Modifier':'Démarrer'} le fond de caisse</button></div>
      <div class="stats-grid">
        ${statCard('CA du jour',s.ca)}${statCard('Espèces',s.cash)}${statCard('Carte / SumUp',s.card)}${statCard('Coût marchandises',s.cost)}
        ${statCard('Sorties de caisse',s.cashOut)}${statCard('Bénéfice net',s.profit,'CA − coût marchandises − sorties de caisse')}
        ${statCard('Offerts (valeur)',s.offered)}${statCard('Conso arbitres (valeur)',s.referee)}${statCard('Fond de caisse',s.opening)}${statCard('Caisse espèces théorique',s.theoreticalCash,'Fond + espèces − sorties')}
      </div>
      ${stockAlertHtml(low)}
      <div class="admin-card"><h3>Fond de caisse</h3><p class="muted">Le fond de caisse n’entre jamais dans le calcul du bénéfice. Il sert uniquement au contrôle de la caisse physique.</p>
      <div style="font-size:1.5rem;font-weight:900">${money(s.opening)}</div></div>`;
    byId('dashboardFloatBtn').addEventListener('click',()=>cashFloatModal(dateKey));
  }

  function stockAlertHtml(low){
    if(!low.length)return `<div class="alert-panel good"><h3>✓ Stock</h3><div class="muted">Aucun produit n’est actuellement à 10 % ou moins de son stock de départ.</div></div>`;
    return `<div class="alert-panel"><h3>⚠ Alerte stock • ${low.length} produit${low.length>1?'s':''}</h3><div class="alert-chips">${low.map(p=>`<span class="alert-chip">${esc(p.name)} • ${p.stock} restant${p.stock>1?'s':''}</span>`).join('')}</div></div>`;
  }

  async function fetchAllProducts(){
    const {data,error}=await db.from('products').select('*').order('category').order('sort_order',{ascending:true}).order('name');
    if(error)throw error;
    return (data||[]).map(p=>({...p,imageUrl:productImageUrl(p)}));
  }

  async function fetchCategories(){
    const {data,error}=await db.from('categories').select('*').order('sort_order',{ascending:true}).order('name');
    if(error)throw error;return data||[];
  }

  async function renderProductsAdmin(root){
    const [products,cats]=await Promise.all([fetchAllProducts(),fetchCategories()]);
    const productCategories=[...new Set(products.map(p=>p.category))];
    const orderedCats=[...cats.map(c=>c.name),...productCategories.filter(name=>!cats.some(c=>c.name===name))];
    root.innerHTML=`
      <div class="admin-toolbar"><div><h2>Produits & tarifs</h2><div class="muted small">Réorganise les produits dans chaque catégorie avec la poignée ⠿ ou les flèches ◀ ▶. L’ordre est repris automatiquement dans la caisse.</div></div><button class="btn primary" id="addProductBtn">＋ Ajouter un produit</button></div>
      <div class="admin-category-order admin-card">
        <div><h3>Ordre des catégories</h3><p class="muted small">L'ordre des catégories reste modifiable avec les flèches.</p></div>
        <div class="admin-category-order-chips" id="categoryOrderList">${cats.map((c,i)=>`
          <div class="admin-category-order-chip"><strong>${esc(c.name)}</strong><button class="mini-btn" data-cat-up="${i}" ${i===0?'disabled':''}>↑</button><button class="mini-btn" data-cat-down="${i}" ${i===cats.length-1?'disabled':''}>↓</button></div>`).join('')}</div>
      </div>
      <div class="admin-catalog" id="adminProductCatalog">
        ${orderedCats.map(category=>{
          const group=products.filter(p=>p.category===category).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
          if(!group.length)return '';
          return `<section class="admin-category-section">
            <div class="admin-category-heading"><div class="category-title">${esc(category)}</div><span class="muted small">${group.length} produit${group.length>1?'s':''}</span></div>
            <div class="admin-product-grid" data-admin-product-grid data-category="${esc(category)}">${group.map((p,i)=>adminProductCardHtml(p,i,group.length)).join('')}</div>
          </section>`;
        }).join('')}
      </div>`;

    byId('addProductBtn').addEventListener('click',()=>productModal(null,cats,products));
    qsa('[data-edit-product]',root).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();productModal(products.find(p=>p.id===b.dataset.editProduct),cats,products);}));
    qsa('[data-toggle-product]',root).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();toggleProduct(products.find(p=>p.id===b.dataset.toggleProduct));}));
    qsa('[data-product-left]',root).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();moveProduct(products,b.dataset.productLeft,-1);}));
    qsa('[data-product-right]',root).forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();moveProduct(products,b.dataset.productRight,1);}));
    qsa('[data-cat-up]',root).forEach(b=>b.addEventListener('click',()=>moveCategory(cats,Number(b.dataset.catUp),-1)));
    qsa('[data-cat-down]',root).forEach(b=>b.addEventListener('click',()=>moveCategory(cats,Number(b.dataset.catDown),1)));
    initAdminProductReorder(root);
  }

  function adminProductCardHtml(p,index,total){
    const low=p.stock_tracked&&p.starting_stock>0&&p.stock<=p.starting_stock*.10;
    const photo=p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy" />`:`<div class="product-fallback">${esc(initials(p.name))}</div>`;
    return `<article class="admin-product-card ${p.active?'':'inactive'}" data-admin-product-card data-product-id="${p.id}">
      <button type="button" class="admin-drag-handle" title="Maintenir et glisser pour déplacer" aria-label="Déplacer ${esc(p.name)}">⠿</button>
      ${p.stock_tracked?`<span class="stock-badge ${low?'low':''}">${p.stock}</span>`:''}
      <div class="admin-product-photo">${photo}</div>
      <div class="admin-product-name">${esc(p.name)}${p.active?'':'<span class="admin-inactive-pill">Inactif</span>'}</div>
      <div class="admin-product-sale">${money(p.sale_price)}</div>
      <div class="admin-product-data"><span>Achat <strong>${money(p.cost_price)}</strong></span><span>Marge <strong>${money(num(p.sale_price)-num(p.cost_price))}</strong></span></div>
      <div class="admin-product-order-actions">
        <span>Ordre</span>
        <button type="button" class="mini-btn order-arrow" data-product-left="${p.id}" ${index===0?'disabled':''} title="Déplacer vers la gauche">◀</button>
        <button type="button" class="mini-btn order-arrow" data-product-right="${p.id}" ${index===total-1?'disabled':''} title="Déplacer vers la droite">▶</button>
      </div>
      <div class="admin-product-card-actions"><button type="button" class="mini-btn blue" data-edit-product="${p.id}">Modifier</button><button type="button" class="mini-btn ${p.active?'orange':'green'}" data-toggle-product="${p.id}">${p.active?'Désactiver':'Activer'}</button></div>
    </article>`;
  }

  function initAdminProductReorder(root){
    let drag=null;

    const cleanup=()=>{
      if(!drag)return;
      drag.card.classList.remove('dragging');
      drag.grid.classList.remove('drag-active');
      document.body.classList.remove('admin-reordering');
    };

    const finish=async()=>{
      if(!drag)return;
      const current=drag;
      cleanup();
      drag=null;
      const ids=qsa('[data-admin-product-card]',current.grid).map(card=>card.dataset.productId);
      const changed=current.originalIds.join('|')!==ids.join('|');
      if(!changed)return;
      await saveAdminProductOrder(current.grid,ids);
    };

    qsa('.admin-drag-handle',root).forEach(handle=>{
      handle.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        const card=handle.closest('[data-admin-product-card]');
        const grid=card?.closest('[data-admin-product-grid]');
        if(!card||!grid)return;
        drag={card,grid,pointerId:e.pointerId,originalIds:qsa('[data-admin-product-card]',grid).map(x=>x.dataset.productId)};
        card.classList.add('dragging');
        grid.classList.add('drag-active');
        document.body.classList.add('admin-reordering');
        try{handle.setPointerCapture(e.pointerId);}catch(_){ }
        e.preventDefault();
      });

      handle.addEventListener('pointermove',e=>{
        if(!drag||drag.pointerId!==e.pointerId)return;
        e.preventDefault();
        const panel=byId('adminPanel');
        if(panel){
          const edge=80;
          if(e.clientY<edge)panel.scrollBy({top:-18,behavior:'auto'});
          else if(e.clientY>window.innerHeight-edge)panel.scrollBy({top:18,behavior:'auto'});
        }
        const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-admin-product-card]');
        if(!target||target===drag.card||target.closest('[data-admin-product-grid]')!==drag.grid)return;
        const r=target.getBoundingClientRect();
        const sameRow=e.clientY>=r.top&&e.clientY<=r.bottom;
        const before=sameRow?e.clientX<r.left+r.width/2:e.clientY<r.top+r.height/2;
        drag.grid.insertBefore(drag.card,before?target:target.nextSibling);
      });

      handle.addEventListener('pointerup',e=>{if(drag&&drag.pointerId===e.pointerId)finish();});
      handle.addEventListener('pointercancel',e=>{if(drag&&drag.pointerId===e.pointerId)finish();});
    });
  }

  async function saveAdminProductOrder(grid,ids){
    grid.classList.add('saving-order');
    try{
      const results=await Promise.all(ids.map((id,index)=>db.from('products').update({sort_order:(index+1)*10}).eq('id',id)));
      const failed=results.find(r=>r.error);
      if(failed?.error)throw failed.error;
      await loadCatalog();
      renderCatalog();
      toast('Ordre des produits enregistré.');
    }catch(err){
      toast('Impossible d’enregistrer l’ordre : '+(err.message||err),'error');
      renderAdminTab();
    }finally{
      grid.classList.remove('saving-order');
    }
  }

  async function ensureCategory(name,cats){
    if(cats.some(c=>c.name.toLowerCase()===name.toLowerCase()))return;
    const max=Math.max(0,...cats.map(c=>Number(c.sort_order)||0));
    const {error}=await db.from('categories').insert({name,sort_order:max+10});
    if(error)throw error;
  }

  function productModal(product,cats,allProducts){
    const isNew=!product;
    const current=product||{name:'',category:cats[0]?.name||'Softs',sale_price:0,cost_price:0,stock:20,active:true};
    const categoryNames=[...new Set([...cats.map(c=>c.name),current.category].filter(Boolean))];
    const categoryOptions=categoryNames.map(name=>`<option value="${esc(name)}" ${name===current.category?'selected':''}>${esc(name)}</option>`).join('');
    const m=modalShell(isNew?'Ajouter un produit':`Modifier • ${current.name}`,`
      <div class="field-grid">
        <label>Nom du produit<input id="prodName" value="${esc(current.name)}" maxlength="100" /></label>
        <label>Catégorie
          <select id="prodCategory">
            ${categoryOptions}
            <option value="__new__">＋ Nouvelle catégorie…</option>
          </select>
        </label>
        <label id="newCategoryWrap" class="hidden">Nouvelle catégorie<input id="prodNewCategory" maxlength="60" placeholder="Nom de la nouvelle catégorie" /></label>
        <label>Prix de vente<input id="prodSale" type="number" min="0" step="0.01" value="${num(current.sale_price).toFixed(2)}" /></label>
        <label>Prix d’achat / revient<input id="prodCost" type="number" min="0" step="0.01" value="${num(current.cost_price).toFixed(2)}" /></label>
        ${isNew?`<label>Stock de départ<input id="prodStock" type="number" min="0" step="1" value="20" /></label>`:''}
        <label>Photo du bouton<input id="prodPhoto" type="file" accept="image/png,image/jpeg,image/webp,image/gif" /></label>
      </div>
      <label style="margin-top:12px;display:flex;flex-direction:row;align-items:center;gap:8px"><input id="prodActive" type="checkbox" style="width:auto" ${current.active?'checked':''}/> Produit actif dans la caisse</label>
      <p class="muted small">La photo est envoyée dans Supabase Storage. Taille maximale configurée : 5 Mo.</p>`);

    const categorySelect=byId('prodCategory');
    const newCategoryWrap=byId('newCategoryWrap');
    const updateCategoryMode=()=>{
      const isNewCategory=categorySelect.value==='__new__';
      newCategoryWrap.classList.toggle('hidden',!isNewCategory);
      if(isNewCategory)setTimeout(()=>byId('prodNewCategory')?.focus(),0);
    };
    categorySelect.addEventListener('change',updateCategoryMode);
    updateCategoryMode();

    addModalButtons(m.actions,[
      {label:'Annuler',onClick:m.close},
      {label:'Enregistrer',className:'primary',onClick:async()=>{
        try{
          const name=byId('prodName').value.trim();
          const selectedCategory=byId('prodCategory').value;
          const category=(selectedCategory==='__new__'?byId('prodNewCategory').value:selectedCategory).trim();
          const sale_price=Number(byId('prodSale').value),cost_price=Number(byId('prodCost').value),active=byId('prodActive').checked;
          if(!name||!category||!Number.isFinite(sale_price)||sale_price<0||!Number.isFinite(cost_price)||cost_price<0){toast('Vérifie les champs produit.','warn');return;}
          await ensureCategory(category,cats);
          let id=product?.id;
          if(isNew){
            const stock=Number(byId('prodStock').value);
            if(!Number.isInteger(stock)||stock<0){toast('Stock de départ invalide.','warn');return;}
            const same=allProducts.filter(p=>p.category===category);const order=Math.max(0,...same.map(p=>Number(p.sort_order)||0))+10;
            const {data,error}=await db.from('products').insert({name,category,sale_price,cost_price,stock,starting_stock:stock,stock_tracked:true,active,sort_order:order}).select('id').single();
            if(error)throw error;id=data.id;
          }else{
            let sort_order=current.sort_order;
            if(category!==current.category){const same=allProducts.filter(p=>p.category===category);sort_order=Math.max(0,...same.map(p=>Number(p.sort_order)||0))+10;}
            const {error}=await db.from('products').update({name,category,sale_price,cost_price,active,sort_order}).eq('id',id);if(error)throw error;
          }
          const file=byId('prodPhoto').files?.[0];
          if(file){
            const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
            const path=`${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
            const {error:upErr}=await db.storage.from('product-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});if(upErr)throw upErr;
            const {error:uErr}=await db.from('products').update({image_path:path}).eq('id',id);if(uErr)throw uErr;
          }
          m.close();await loadCatalog();renderCatalog();await renderProductsAdmin(byId('adminContent'));toast(isNew?'Produit ajouté.':'Produit modifié.');
        }catch(err){toast(err.message||String(err),'error');}
      }}
    ]);
  }

  async function toggleProduct(p){
    const {error}=await db.from('products').update({active:!p.active}).eq('id',p.id);if(error){toast(error.message,'error');return;}
    await loadCatalog();renderCatalog();renderAdminTab();
  }

  async function moveCategory(cats,index,dir){
    const j=index+dir;if(j<0||j>=cats.length)return;
    const a=cats[index],b=cats[j];
    const ao=Number(a.sort_order),bo=Number(b.sort_order);
    const [r1,r2]=await Promise.all([db.from('categories').update({sort_order:bo}).eq('name',a.name),db.from('categories').update({sort_order:ao}).eq('name',b.name)]);
    if(r1.error||r2.error){toast((r1.error||r2.error).message,'error');return;}
    await loadCatalog();renderCatalog();renderAdminTab();
  }

  async function moveProduct(all,id,dir){
    const p=all.find(x=>x.id===id);if(!p)return;
    const same=all.filter(x=>x.category===p.category).sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
    const i=same.findIndex(x=>x.id===id),j=i+dir;if(j<0||j>=same.length)return;
    const a=same[i],b=same[j],ao=Number(a.sort_order),bo=Number(b.sort_order);
    const [r1,r2]=await Promise.all([db.from('products').update({sort_order:bo}).eq('id',a.id),db.from('products').update({sort_order:ao}).eq('id',b.id)]);
    if(r1.error||r2.error){toast((r1.error||r2.error).message,'error');return;}
    await loadCatalog();renderCatalog();renderAdminTab();
  }

  async function renderStockAdmin(root){
    const [products,{data:moves,error:mErr}]=await Promise.all([fetchAllProducts(),db.from('stock_movements').select('*').order('created_at',{ascending:false}).limit(50)]);
    if(mErr)throw mErr;
    const low=products.filter(p=>p.stock_tracked&&p.starting_stock>0&&p.stock<=p.starting_stock*.10);
    root.innerHTML=`<div class="admin-toolbar"><div><h2>Stock</h2><div class="muted small">Les ventes, offerts et consommations arbitres décrémentent le stock automatiquement.</div></div></div>
      ${stockAlertHtml(low)}
      <div id="stockList">${products.map(stockProductHtml).join('')}</div>
      <h3 class="section-title">DERNIERS MOUVEMENTS</h3>
      <div class="history-list">${(moves||[]).length?(moves||[]).map(m=>`<div class="history-card"><div class="history-card-main"><div class="history-card-title">${esc(m.product_name)} • ${esc(m.movement_type)}</div><div class="history-card-sub">${dateTime(m.created_at)} • Stock après : ${m.stock_after}${m.note?` • ${esc(m.note)}`:''}</div></div><div class="history-card-amount ${m.quantity>=0?'money-positive':'money-negative'}">${m.quantity>=0?'+':''}${m.quantity}</div></div>`).join(''):`<div class="admin-card muted">Aucun mouvement de stock.</div>`}</div>`;
    qsa('[data-stock-action]',root).forEach(b=>b.addEventListener('click',()=>stockAction(products.find(p=>p.id===b.dataset.productId),b.dataset.stockAction)));
  }

  function stockProductHtml(p){
    const ratio=p.starting_stock>0?clamp(p.stock/p.starting_stock,0,1):0,low=p.stock_tracked&&p.starting_stock>0&&p.stock<=p.starting_stock*.10;
    return `<div class="admin-card"><div class="stock-row"><div><h3>${esc(p.name)}</h3><div class="muted small">${esc(p.category)} • départ ${p.starting_stock}</div></div><div class="stock-num ${low?'money-negative':''}">${p.stock}</div><div><div class="stock-progress ${low?'low':''}"><span style="width:${Math.round(ratio*100)}%"></span></div><div class="muted small" style="margin-top:5px">${Math.round(ratio*100)} % du stock de départ</div></div><div class="admin-card-actions"><button class="mini-btn green" data-stock-action="restock" data-product-id="${p.id}">＋ Achat</button><button class="mini-btn blue" data-stock-action="correct" data-product-id="${p.id}">Corriger</button><button class="mini-btn orange" data-stock-action="reset_start" data-product-id="${p.id}">Nouveau départ</button></div></div></div>`;
  }

  function stockAction(p,mode){
    const titles={restock:`Ajouter un achat • ${p.name}`,correct:`Corriger le stock • ${p.name}`,reset_start:`Redéfinir le stock de départ • ${p.name}`};
    const labels={restock:'Quantité achetée',correct:'Stock réel actuel',reset_start:'Nouveau stock de départ'};
    const defaultVal=mode==='restock'?'':p.stock;
    const m=modalShell(titles[mode],`<p class="muted small">Stock actuel : ${p.stock} • Stock de départ : ${p.starting_stock}</p><label>${labels[mode]}<input id="stockQty" type="number" min="0" step="1" value="${defaultVal}" autofocus /></label>`);
    addModalButtons(m.actions,[{label:'Annuler',onClick:m.close},{label:'Enregistrer',className:'primary',onClick:async()=>{
      const qty=Number(byId('stockQty').value);if(!Number.isInteger(qty)||qty<0||(mode==='restock'&&qty<=0)){toast('Quantité invalide.','warn');return;}
      const {error}=await db.rpc('admin_adjust_stock',{p_product_id:p.id,p_mode:mode,p_quantity:qty});if(error){toast(error.message,'error');return;}
      m.close();await loadCatalog();renderCatalog();renderAdminTab();toast('Stock mis à jour.');
    }}]);
  }

  async function renderHistoryAdmin(root){
    const data=await fetchDayData(state.historyDate),s=dayStats(data);
    root.innerHTML=`
      <div class="admin-toolbar"><div><h2>Historique</h2><div class="muted small">Ventes, offerts, consommations arbitres et sorties de caisse.</div></div></div>
      <div class="history-day-head"><label>Date<input id="historyDateInput" type="date" value="${state.historyDate}" /></label><button class="btn primary" id="historyFloatBtn">${s.opening>0?'Modifier':'Encoder'} le fond de caisse</button></div>
      <div class="stats-grid">${statCard('CA',s.ca)}${statCard('Espèces',s.cash)}${statCard('Carte / SumUp',s.card)}${statCard('Coût marchandises',s.cost)}${statCard('Sorties caisse',s.cashOut)}${statCard('Bénéfice net',s.profit)}${statCard('Offerts (valeur)',s.offered)}${statCard('Conso arbitres',s.referee)}${statCard('Fond de caisse',s.opening)}${statCard('Caisse espèces théorique',s.theoreticalCash)}</div>
      <h3 class="section-title">TRANSACTIONS • ${data.sales.length}</h3>
      <div>${data.sales.length?data.sales.map(saleCardHtml).join(''):`<div class="admin-card muted">Aucune transaction à cette date.</div>`}</div>
      <h3 class="section-title">SORTIES DE CAISSE • ${data.cashouts.length}</h3>
      <div>${data.cashouts.length?data.cashouts.map(cashOutAdminHtml).join(''):`<div class="admin-card muted">Aucune sortie de caisse à cette date.</div>`}</div>`;
    byId('historyDateInput').addEventListener('change',e=>{state.historyDate=e.target.value;renderAdminTab();});
    byId('historyFloatBtn').addEventListener('click',()=>cashFloatModal(state.historyDate));
    qsa('[data-delete-sale]',root).forEach(b=>b.addEventListener('click',()=>deleteSale(b.dataset.deleteSale,data.sales)));
    qsa('[data-delete-cashout]',root).forEach(b=>b.addEventListener('click',()=>deleteCashOut(b.dataset.deleteCashout,data.cashouts)));
  }

  function saleCardHtml(s){
    const cls=s.method==='Espèces'?'cash':s.method==='Carte'?'card':s.method==='Offert'?'offer':'referee';
    const details=s.method==='Offert'?`Offert par : ${esc(s.offered_by||'Non renseigné')}`:s.method==='Conso arbitre'?`Arbitre : ${esc(s.referee_name||'Non renseigné')}`:'';
    return `<div class="transaction-card"><div class="transaction-top"><div><span class="transaction-badge ${cls}">${esc(s.method)}</span><strong>${timeOnly(s.created_at)}</strong><div class="muted small" style="margin-top:5px">${details}${details&&s.device_label?' • ':''}${s.device_label?esc(s.device_label):''}</div></div><div style="text-align:right"><div style="font-weight:900">${s.method==='Offert'||s.method==='Conso arbitre'?`Valeur ${money(s.commercial_value)}`:money(s.total)}</div><div class="muted small">Coût ${money(s.cost)}</div></div><button class="mini-btn red" data-delete-sale="${s.id}">Supprimer</button></div>
      <ul class="line-list">${(s.sale_lines||[]).map(l=>`<li>${l.quantity} × ${esc(l.product_name)} • ${money(l.unit_sale_price)} / unité • coût ${money(l.unit_cost_price)}</li>`).join('')||'<li>Détail indisponible</li>'}</ul></div>`;
  }

  function cashOutAdminHtml(c){const detail=c.type==='Prélèvement caisse trésorier'?`${timeOnly(c.created_at)} • prélèvement trésorier${c.device_label?` • ${esc(c.device_label)}`:''}`:`${timeOnly(c.created_at)} • équipe ${esc(c.team)} • match ${esc(c.match_time)}${c.device_label?` • ${esc(c.device_label)}`:''}`;return `<div class="transaction-card"><div class="transaction-top"><div><span class="transaction-badge referee">${esc(c.type)}</span><strong>${esc(c.person_name)}</strong><div class="muted small" style="margin-top:5px">${detail}</div></div><div class="money-negative" style="font-weight:900">− ${money(c.amount)}</div><button class="mini-btn red" data-delete-cashout="${c.id}">Supprimer</button></div></div>`;}

  async function deleteSale(id,sales){
    const s=sales.find(x=>x.id===id);if(!s)return;
    const ok=await confirmDialog('Supprimer cette transaction ?',`La transaction ${s.method} de ${money(s.method==='Offert'||s.method==='Conso arbitre'?s.commercial_value:s.total)} sera supprimée. Les articles encore liés aux produits seront automatiquement remis en stock.`,'Supprimer',true);if(!ok)return;
    const {error}=await db.rpc('admin_delete_sale',{p_sale_id:id});if(error){toast(error.message,'error');return;}
    await loadCatalog();renderCatalog();await renderAdminTab();toast('Transaction supprimée et stock restauré.');
  }

  async function deleteCashOut(id,cashouts){
    const c=cashouts.find(x=>x.id===id);if(!c)return;
    const ok=await confirmDialog('Supprimer cette sortie de caisse ?',`${c.type} • ${c.person_name} • ${money(c.amount)}.`,'Supprimer',true);if(!ok)return;
    const {error}=await db.from('cash_outs').delete().eq('id',id);if(error){toast(error.message,'error');return;}await renderAdminTab();toast('Sortie de caisse supprimée.');
  }

  async function cashFloatModal(dateKey){
    const {data:existing,error}=await db.from('cash_floats').select('*').eq('business_date',dateKey).maybeSingle();if(error){toast(error.message,'error');return;}
    const counts=existing?.counts||{};
    const denoms=[0.01,0.02,0.05,0.10,0.20,0.50,1,2,5,10,20,50,100];
    const m=modalShell(`Fond de caisse • ${dateKey}`,`<div class="help-box">Encode le nombre de pièces et billets présents au démarrage. Ce montant ne compte pas dans le bénéfice.</div><div class="float-grid">${denoms.map(d=>`<div class="denom-row"><label>${money(d)}<input class="denom-input" data-denom="${d}" type="number" min="0" step="1" value="${Number(counts[String(d)]||0)}" /></label></div>`).join('')}</div><div class="float-total">TOTAL : <span id="floatTotal">${money(existing?.total||0)}</span></div>`,{wide:true});
    const compute=()=>{let total=0;const obj={};qsa('.denom-input',m.root).forEach(i=>{const d=Number(i.dataset.denom),q=Math.max(0,Math.floor(Number(i.value)||0));obj[String(d)]=q;total+=d*q;});byId('floatTotal').textContent=money(total);return{total,counts:obj};};
    qsa('.denom-input',m.root).forEach(i=>i.addEventListener('input',compute));compute();
    addModalButtons(m.actions,[{label:'Annuler',onClick:m.close},{label:'Enregistrer',className:'primary',onClick:async()=>{const v=compute();const {error:upErr}=await db.from('cash_floats').upsert({business_date:dateKey,counts:v.counts,total:v.total,created_by:state.user.id},{onConflict:'business_date'});if(upErr){toast(upErr.message,'error');return;}m.close();await renderAdminTab();toast(`Fond de caisse enregistré : ${money(v.total)}.`);}}]);
  }

  async function renderSettingsAdmin(root){
    root.innerHTML=`<div class="admin-toolbar"><div><h2>Paramètres</h2><div class="muted small">Compte, appareil et code administrateur.</div></div></div>
      <div class="settings-grid">
        <div class="admin-card"><h3>Compte connecté</h3><p>${esc(state.profile?.display_name||'')}</p><p class="muted small">${esc(state.profile?.email||state.user?.email||'')} • rôle ${esc(state.profile?.role||'')}</p></div>
        <div class="admin-card"><h3>Cet appareil</h3><p><strong>${esc(deviceLabel())}</strong></p><button class="btn secondary" id="settingsDeviceBtn">Renommer l’appareil</button></div>
        <div class="admin-card"><h3>Code administrateur</h3><p class="muted small">Utilisé pour autoriser les commandes « Offert par le bar ». Le code est vérifié côté Supabase et n’est jamais stocké en clair dans l’application.</p><button class="btn primary" id="changePinBtn">Changer le code</button></div>
      </div>`;
    byId('settingsDeviceBtn').addEventListener('click',editDeviceLabel);
    byId('changePinBtn').addEventListener('click',changeAdminPin);
  }

  function changeAdminPin(){
    const m=modalShell('Changer le code administrateur',`<div class="field-grid"><label>Nouveau code (4 à 8 chiffres)<input id="newPin1" type="password" inputmode="numeric" maxlength="8" /></label><label>Confirmer le code<input id="newPin2" type="password" inputmode="numeric" maxlength="8" /></label></div>`);
    addModalButtons(m.actions,[{label:'Annuler',onClick:m.close},{label:'Enregistrer',className:'primary',onClick:async()=>{const a=byId('newPin1').value.trim(),b=byId('newPin2').value.trim();if(!/^\d{4,8}$/.test(a)||a!==b){toast('Les codes doivent être identiques et contenir 4 à 8 chiffres.','warn');return;}const {error}=await db.rpc('admin_set_pin',{p_new_pin:a});if(error){toast(error.message,'error');return;}m.close();toast('Code administrateur modifié.');}}]);
  }

  window.addEventListener('resize',()=>{if(window.innerWidth>800)closeCartDrawer();});
  document.addEventListener('DOMContentLoaded',boot);
})();
