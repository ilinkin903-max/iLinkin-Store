const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  token: sessionStorage.getItem('ilink_reseller_token') || localStorage.getItem('ilink_reseller_token') || '',
  view: 'dashboard',
  reseller: null,
  bot: null,
  runtime: null,
  products: [],
  pendingPricing: {},
  orders: [],
  withdrawals: []
};

const titles = {
  dashboard: ['Dashboard', 'Ringkasan performa toko dan komisi profit Anda'],
  bot: ['Bot Toko', 'Kelola token bot, nama toko, banner, dan pengaturan layanan'],
  pricing: ['Katalog & Margin Varian', 'Sesuaikan keuntungan harga jual per produk dan per varian'],
  withdraw: ['Tarik Saldo', 'Pencairan saldo komisi profit ke rekening bank atau e-wallet'],
  orders: ['Pesanan Pembeli', 'Daftar riwayat transaksi pembeli yang masuk melalui bot Anda']
};

function esc(v = '') {
  return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function money(v) {
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

function date(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return String(v);
  }
}

function stat(icon, color, label, value, small) {
  return `<div class="stat-card"><div class="stat-icon ${color}">${icon}</div><div><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(small)}</em></div></div>`;
}

function toast(msg, bad = false) {
  const t = $('#toast');
  if (!t) return;
  const m = $('#modal');
  if (m && m.open) {
    if (t.parentElement !== m) m.appendChild(t);
  } else {
    if (t.parentElement !== document.body) document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => {
    t.className = 'toast';
    if (!m || !m.open) {
      if (t.parentElement !== document.body) document.body.appendChild(t);
    }
  }, 2800);
}

function badge(status) {
  const s = String(status || '').toLowerCase();
  const cls = ['completed', 'paid', 'success', 'active', 'running', 'approved'].includes(s) ? 'ok' :
              ['pending', 'waiting'].includes(s) ? 'warn' :
              ['failed', 'rejected', 'canceled', 'cancelled', 'stopped'].includes(s) ? 'bad' : 'purple';
  return `<span class="badge ${cls}">${esc(status || '-')}</span>`;
}

function modal(title, html, onSubmit, options = {}) {
  const m = $('#modal'), form = $('#modalForm'), alertBox = $('#modalAlert'), submitBtn = $('#modalSubmit');
  if (!m || !form) return;
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  if (alertBox) { alertBox.className = 'modal-alert hidden'; alertBox.textContent = ''; }
  submitBtn.textContent = options.submit || 'Simpan';
  submitBtn.disabled = false;
  submitBtn.classList.toggle('hidden', options.noSubmit === true);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit) return m.close();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';
    try {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      await onSubmit(data);
      m.close();
    } catch (err) {
      if (alertBox) {
        alertBox.textContent = err.message || 'Terjadi kesalahan.';
        alertBox.className = 'modal-alert';
        alertBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        toast(err.message, true);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = options.submit || 'Simpan';
    }
  };
  $('#modalClose').onclick = () => m.close();
  $('#modalCancel').onclick = () => m.close();
  m.showModal();
}

async function api(path, options = {}) {
  const url = '/api/gateway?path=' + encodeURIComponent(path);
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.authorization = 'Bearer ' + state.token;
  if (options.body && typeof options.body !== 'string' && !(options.body instanceof Blob)) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, { ...options, headers });
  if (options.raw) {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  }
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : { ok: res.ok, message: await res.text() };
  if (res.status === 401) {
    sessionStorage.removeItem('ilink_reseller_token');
    localStorage.removeItem('ilink_reseller_token');
    state.token = '';
    throw new Error('Sesi kedaluwarsa. Silakan buka kembali dari bot Telegram.');
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Sidebar Drawer Control (Exact parity with Owner Miniapp)
function closeSidebar() {
  $('#sidebar')?.classList.remove('open');
  $('#sidebarBackdrop')?.classList.remove('show');
  $('#menuBtn')?.setAttribute('aria-expanded', 'false');
}

$('#menuBtn').onclick = (e) => {
  e.stopPropagation();
  const open = $('#sidebar').classList.toggle('open');
  $('#sidebarBackdrop')?.classList.toggle('show', open);
  $('#menuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
};

$('#sidebarBackdrop').onclick = closeSidebar;
document.addEventListener('click', (e) => {
  const side = $('#sidebar'), menu = $('#menuBtn');
  if (side?.classList.contains('open') && !side.contains(e.target) && !menu?.contains(e.target)) {
    closeSidebar();
  }
});

$('#nav').onclick = (e) => {
  const b = e.target.closest('[data-view]');
  if (b) {
    closeSidebar();
    navigate(b.dataset.view);
  }
};

$('#refreshBtn').onclick = () => navigate(state.view, true);
$('#statusBarRefresh').onclick = () => navigate(state.view, true);

function setHeader(view) {
  const [t, s] = titles[view] || [view, ''];
  $('#pageTitle').textContent = t;
  $('#pageSubtitle').textContent = s;
  $$('#nav [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

function updateShellUI() {
  const r = state.reseller || {};
  const b = state.bot || {};
  const rt = state.runtime || {};

  const storeName = b.branding?.store_name || b.bot_name || r.name || 'Toko Reseller';
  $('#brandName').innerHTML = esc(storeName).replace(/\s+/g, '<br>');
  $('#resellerName').textContent = r.name || 'Reseller';
  $('#resellerUsername').textContent = r.username ? `@${r.username}` : `ID: ${r.telegram_id || '-'}`;
  $('#profitBalance').textContent = money(r.profit_balance || 0);

  const botBtn = $('#botLinkBtn');
  if (b.bot_username) {
    botBtn.href = `https://t.me/${b.bot_username.replace(/^@+/, '')}`;
    botBtn.classList.remove('hidden');
  } else {
    botBtn.classList.add('hidden');
  }

  const safeEl = $('#systemSafe');
  if (!b || !b.bot_token) {
    safeEl.textContent = 'Bot Toko: Belum Dikonfigurasi';
  } else if (rt.running) {
    safeEl.textContent = `🟢 Bot @${b.bot_username || 'bot'} Online & Siap Menerima Pesanan`;
  } else {
    safeEl.textContent = '🟡 Bot Toko Sedang Dihentikan (Stopped)';
  }
}

async function navigate(view, silent = false) {
  state.view = view;
  setHeader(view);
  if (!silent) {
    $('#content').innerHTML = '<div class="loader-card"><div class="loader-spinner"></div><p>Memuat data...</p></div>';
  }
  try {
    await ({
      dashboard: loadDashboard,
      bot: loadBot,
      pricing: loadPricing,
      withdraw: loadWithdraw,
      orders: loadOrders
    }[view] || loadDashboard)();
    $('#lastUpdated').textContent = 'Terakhir diperbarui: ' + new Date().toLocaleTimeString('id-ID');
  } catch (e) {
    $('#content').innerHTML = `<div class="empty-product">${esc(e.message)}</div>`;
    toast(e.message, true);
  }
}

// ---------------------------------------------------------------------
// VIEW 1: DASHBOARD (Identical to Owner loadDashboard())
// ---------------------------------------------------------------------
async function loadDashboard() {
  const data = await api('/api/reseller/overview');
  state.reseller = data.reseller;
  state.bot = data.bot;
  state.runtime = data.runtime;
  state.orders = data.recent_orders || [];
  updateShellUI();

  const r = state.reseller || {};
  const b = state.bot || {};
  const rt = state.runtime || {};
  const stats = data.stats || {};

  const botStatusBadge = !b.bot_token
    ? '<span class="badge">Belum Setup</span>'
    : rt.running
    ? '<span class="badge ok">🟢 Online</span>'
    : '<span class="badge warn">🟡 Stopped</span>';

  const recentOrderCards = state.orders.slice(0, 5).map(o => `
    <article class="order-card">
      <div class="order-head">
        <div><small>Invoice</small><b class="mono">#${esc(o.order_ref || String(o.id))}</b></div>
        ${badge(o.status)}
      </div>
      <div class="order-grid">
        <div><small>Produk</small><strong>${esc(o.product_name)}</strong><span>${esc(o.variant_name || 'Default')}</span></div>
        <div><small>Qty</small><strong>${o.quantity || 1}</strong></div>
        <div><small>Harga Jual</small><strong>${money(o.total_price)}</strong></div>
        <div style="background:#edffdc"><small>Profitmu</small><strong style="color:#1a5e00">+${money(o.reseller_profit)}</strong></div>
        <div><small>Metode</small><strong>${esc(o.payment_method || 'QRIS')}</strong></div>
        <div class="wide"><small>Waktu</small><strong>${date(o.created_at)}</strong></div>
      </div>
    </article>
  `).join('');

  $('#content').innerHTML = `
    <div class="dashboard-kpis">
      ${stat('💵', 'green', 'Saldo Komisi Profit', money(stats.profit_balance), 'Siap dicairkan')}
      ${stat('📈', 'pink', 'Total Omset Toko', money(stats.revenue_total), 'Penjualan toko Anda')}
      ${stat('🛒', 'purple', 'Total Order', stats.orders_count || 0, 'Pesanan selesai')}
      ${stat('👥', 'blue', 'Pelanggan Bot', `${stats.customers_count || 0} User`, 'Pembeli terdaftar')}
    </div>

    <div class="dashboard-grid">
      <section class="report-card chart-card">
        <div class="card-heading">
          <div>
            <h3>🤖 Bot Toko White-Label</h3>
            <p>Status operasional bot reseller Anda</p>
          </div>
          ${botStatusBadge}
        </div>
        <div style="padding:16px 0">
          <p style="margin:0 0 10px;font-size:14px">Nama Toko: <b>${esc(b.branding?.store_name || b.bot_name || 'Belum Diatur')}</b></p>
          <p style="margin:0 0 16px;font-size:14px">Bot Username: <b>${b.bot_username ? '@' + b.bot_username : '-'}</b></p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" class="neo-btn purple small" id="dashGoBotBtn">⚙️ Atur Konfigurasi Bot</button>
            ${b.bot_username ? `<a class="neo-btn blue small" href="https://t.me/${b.bot_username.replace(/^@+/, '')}" target="_blank">✈ Buka Bot Telegram</a>` : ''}
          </div>
        </div>
      </section>

      <section class="report-card top-products-card">
        <div class="card-heading">
          <div>
            <h3>👛 Saldo & Penarikan</h3>
            <p>Ringkasan profit yang telah dicairkan</p>
          </div>
          <button type="button" class="neo-btn green small" id="dashGoWdBtn">💸 Tarik Saldo</button>
        </div>
        <div style="padding:16px 0">
          <p style="margin:0 0 10px;font-size:14px">Total Sudah Ditarik: <b>${money(stats.withdrawn_total)}</b></p>
          <p style="margin:0 0 16px;font-size:14px">Mode Markup Global: <b>${r.markup_mode === 'percent' ? `+${r.markup_value}%` : `+${money(r.markup_value)}`}</b></p>
          <button type="button" class="neo-btn white small" id="dashGoPricingBtn">🏷️ Sesuaikan Margin Produk →</button>
        </div>
      </section>
    </div>

    <div class="section-title product-section-title" style="margin-top:20px">
      <div>
        <h2>🛒 5 Pesanan Pembeli Terkini</h2>
        <p>Pesanan terbaru yang masuk melalui bot toko Anda</p>
      </div>
      <span>
        <button id="dashGoOrdersBtn" class="neo-btn purple">Lihat Semua Pesanan →</button>
      </span>
    </div>

    ${state.orders.length ? `<div class="order-list">${recentOrderCards}</div>` : '<div class="empty-product">Belum ada transaksi pesanan di bot toko Anda.</div>'}
  `;

  $('#dashGoBotBtn').onclick = () => navigate('bot');
  $('#dashGoWdBtn').onclick = () => navigate('withdraw');
  $('#dashGoPricingBtn').onclick = () => navigate('pricing');
  $('#dashGoOrdersBtn').onclick = () => navigate('orders');
}

// ---------------------------------------------------------------------
// VIEW 2: BOT TOKO (Identical to Owner bot settings)
// ---------------------------------------------------------------------
async function loadBot() {
  const data = await api('/api/reseller/me');
  state.reseller = data.reseller;
  state.bot = data.bot || {};
  state.runtime = data.runtime || {};
  updateShellUI();

  const b = state.bot || {};
  const br = b.branding || {};
  const rt = state.runtime || {};
  const r = state.reseller || {};

  const defaultCs = r.username ? `https://t.me/${r.username}` : (r.telegram_id ? `tg://user?id=${r.telegram_id}` : '');

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>🤖 Pengaturan Bot Toko Reseller</h2>
        <p>Hubungkan token bot dari @BotFather dan kelola branding toko white-label Anda.</p>
      </div>
      <span>
        ${rt.running ? '<span class="badge ok">🟢 Online</span>' : b.bot_token ? '<span class="badge warn">🟡 Stopped</span>' : '<span class="badge">Belum Setup</span>'}
      </span>
    </div>

    <div class="neo-card" style="padding:18px">
      <form id="botSetupForm" class="form-grid">
        <label class="full">
          Token Bot (@BotFather) *
          <div style="display:flex;gap:8px;margin-top:4px">
            <input name="bot_token" id="resellerBotToken" style="flex:1" placeholder="Contoh: 123456789:ABCdefGhIJKlmNoPQRstUVwxyZ" value="${esc(b.bot_token || '')}" required />
            <button type="button" id="btnCheckToken" class="neo-btn blue" style="flex-shrink:0">⚡ Cek Token</button>
          </div>
          <div id="tokenCheckResult" class="hidden"></div>
        </label>

        <label>
          Username Bot
          <input name="bot_username" id="resellerBotUsername" placeholder="Contoh: TokoSaya_Bot" value="${esc(b.bot_username || '')}" />
        </label>

        <label>
          Nama Toko Anda
          <input name="store_name" placeholder="Contoh: iLink VIP Store" value="${esc(br.store_name || b.bot_name || '')}" />
        </label>

        <label class="full">
          Link Customer Service (CS)
          <input name="cs_contact" placeholder="Contoh: https://t.me/username_anda" value="${esc(br.cs_contact || defaultCs)}" />
          <small>Kosongkan agar otomatis diarahkan ke akun Telegram Anda.</small>
        </label>

        <label class="full">
          Banner Media / Gambar Start (Opsional)
          <input name="start_media_url" placeholder="URL Foto / Gambar (https://...)" value="${esc(br.start_media_url || '')}" />
        </label>

        <label class="full">
          Pesan Pembuka /start (Opsional)
          <textarea name="start_message" rows="3" placeholder="Pesan sambutan khusus saat pembeli menekan /start...">${esc(br.start_message || '')}</textarea>
        </label>

        <label class="full">
          Link Channel / Grup Info (Opsional)
          <input name="channel_url" placeholder="Contoh: https://t.me/channel_anda" value="${esc(br.channel_url || '')}" />
        </label>

        <div class="full" style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
          <button type="submit" id="btnSaveBot" class="neo-btn purple wide">💾 Simpan & Jalankan Bot</button>
          ${b.bot_token ? `
            <button type="button" id="btnRestartBot" class="neo-btn yellow" style="flex:1">🔄 Restart Bot</button>
            ${rt.running ? '<button type="button" id="btnStopBot" class="neo-btn red" style="flex:1">⏹ Hentikan</button>' : '<button type="button" id="btnStartBot" class="neo-btn green" style="flex:1">▶ Mulai Bot</button>'}
          ` : ''}
        </div>
      </form>
    </div>
  `;

  $('#btnCheckToken').onclick = async () => {
    const token = $('#resellerBotToken').value.trim();
    const resultDiv = $('#tokenCheckResult');
    if (!token) return toast('Masukkan token bot terlebih dahulu', true);

    resultDiv.className = 'verify-feedback';
    resultDiv.textContent = 'Memverifikasi token ke API Telegram...';
    resultDiv.classList.remove('hidden');

    try {
      const res = await api('/api/reseller/bot/verify-token', {
        method: 'POST',
        body: { bot_token: token }
      });
      resultDiv.className = 'verify-feedback ok';
      resultDiv.innerHTML = `✅ Token valid! Bot: <b>@${res.bot.username}</b> (${res.bot.first_name})`;
      $('#resellerBotUsername').value = res.bot.username;
      toast('Token bot valid!');
    } catch (e) {
      resultDiv.className = 'verify-feedback bad';
      resultDiv.textContent = `❌ ${e.message}`;
      toast(e.message, true);
    }
  };

  $('#botSetupForm').onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('#btnSaveBot');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
    try {
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      const res = await api('/api/reseller/bot/setup', { method: 'POST', body });
      state.bot = res.bot;
      state.runtime = res.runtime;
      toast('Pengaturan bot berhasil disimpan & bot aktif!');
      await loadBot();
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Simpan & Jalankan Bot';
    }
  };

  if ($('#btnRestartBot')) {
    $('#btnRestartBot').onclick = async () => {
      try {
        await api('/api/reseller/bot/action', { method: 'POST', body: { action: 'restart' } });
        toast('Bot berhasil di-restart!');
        await loadBot();
      } catch (err) { toast(err.message, true); }
    };
  }

  if ($('#btnStopBot')) {
    $('#btnStopBot').onclick = async () => {
      try {
        await api('/api/reseller/bot/action', { method: 'POST', body: { action: 'stop' } });
        toast('Bot dihentikan.');
        await loadBot();
      } catch (err) { toast(err.message, true); }
    };
  }

  if ($('#btnStartBot')) {
    $('#btnStartBot').onclick = async () => {
      try {
        await api('/api/reseller/bot/action', { method: 'POST', body: { action: 'start' } });
        toast('Bot dijalankan!');
        await loadBot();
      } catch (err) { toast(err.message, true); }
    };
  }
}

// ---------------------------------------------------------------------
// VIEW 3: KATALOG PRODUK & ATUR MARGIN VARIAN (Identical to Owner loadProducts())
// ---------------------------------------------------------------------
async function loadPricing() {
  const res = await api('/api/reseller/products');
  state.products = res.items || [];
  state.pendingPricing = {};
  updateSaveBar();

  renderPricingView();
}

function updateSaveBar() {
  const bar = $('#floatingSaveBar');
  const count = Object.keys(state.pendingPricing).length;
  if (!bar) return;
  if (count > 0) {
    bar.classList.remove('hidden');
    $('#pendingChangesCount').textContent = `${count} perubahan margin belum disimpan`;
  } else {
    bar.classList.add('hidden');
  }
}

function categories(rows) {
  return [...new Set(rows.map(x => x.category).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('');
}

function renderPricingView(searchFilter = '', statusFilter = 'all', categoryFilter = '') {
  const q = (searchFilter || $('#productSearch')?.value || '').toLowerCase().trim();
  const stFilter = statusFilter !== 'all' ? statusFilter : ($('#productStatus')?.value || 'all');
  const catFilter = categoryFilter || ($('#productCategory')?.value || '');

  const filtered = state.products.filter(p => {
    const matchSearch = !q || [p.name, p.code, p.category].some(x => String(x || '').toLowerCase().includes(q)) || (p.variants || []).some(v => v.name.toLowerCase().includes(q));
    const matchCat = !catFilter || p.category === catFilter;
    const pEnabled = state.pendingPricing[p.code]?.enabled !== undefined ? state.pendingPricing[p.code].enabled : p.enabled;
    if (!matchSearch || !matchCat) return false;
    if (stFilter === 'enabled') return pEnabled;
    if (stFilter === 'disabled') return !pEnabled;
    return true;
  });

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>📦 Katalog Produk & Atur Margin Varian</h2>
        <p>Sesuaikan margin keuntungan per produk dan varian untuk bot toko Anda.</p>
      </div>
      <span>
        <button id="btnOpenBulkModal" class="neo-btn purple">⚡ Markup Massal</button>
      </span>
    </div>

    <div class="toolbar product-toolbar">
      <div class="searchbox"><input id="productSearch" placeholder="Cari nama produk atau varian..." value="${esc(q)}" /></div>
      <select id="productCategory">
        <option value="">Semua Kategori</option>
        ${categories(state.products)}
      </select>
      <select id="productStatus">
        <option value="all" ${stFilter === 'all' ? 'selected' : ''}>Semua Status</option>
        <option value="enabled" ${stFilter === 'enabled' ? 'selected' : ''}>Hanya Aktif</option>
        <option value="disabled" ${stFilter === 'disabled' ? 'selected' : ''}>Hanya Nonaktif</option>
      </select>
    </div>

    <div id="productGrid" class="product-grid">
      ${filtered.length ? filtered.map((p, idx) => renderProductCard(p, idx)).join('') : '<div class="empty-product"><h3>Belum ada produk</h3><p>Tidak ada produk yang cocok dengan pencarian.</p></div>'}
    </div>
  `;

  if (catFilter) $('#productCategory').value = catFilter;

  // Filter events
  const onFilter = () => renderPricingView($('#productSearch').value, $('#productStatus').value, $('#productCategory').value);
  $('#productSearch').oninput = onFilter;
  $('#productCategory').onchange = onFilter;
  $('#productStatus').onchange = onFilter;
  $('#btnOpenBulkModal').onclick = showBulkMarkupModal;

  bindPricingCardEvents();
}

function renderProductCard(p, idx = 0) {
  const pendingP = state.pendingPricing[p.code] || {};
  const isPEnabled = pendingP.enabled !== undefined ? pendingP.enabled : p.enabled;
  const currentPMargin = pendingP.margin !== undefined ? pendingP.margin : p.current_margin;
  const pBaseCost = p.base_cost;
  const pSellPrice = pBaseCost + Number(currentPMargin || 0);

  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  const icon = ['📦', '⚡', '📱', '🎮', '💎'][idx % 5];

  const variantsListHtml = hasVariants ? `
    <div class="variant-editor" style="margin-top:14px">
      <div class="variant-editor-head">
        <div>
          <h3>Varian Produk (${p.variants.length})</h3>
          <p>Atur margin keuntungan & aktifkan/nonaktifkan varian individual untuk bot Anda.</p>
        </div>
        <button type="button" class="neo-btn white small btn-sync-variants" data-code="${esc(p.code)}">⚡ Samakan Semua</button>
      </div>
      <div class="variant-edit-list">
        ${p.variants.map(v => {
          const vKey = `${p.code}:v${v.id}`;
          const pendingV = state.pendingPricing[vKey] || {};
          const isVEnabled = pendingV.enabled !== undefined ? pendingV.enabled : v.enabled;
          const currentVMargin = pendingV.margin !== undefined ? pendingV.margin : v.current_margin;
          const vBaseCost = v.base_cost;
          const vSellPrice = vBaseCost + Number(currentVMargin || 0);
          const stockLabel = v.delivery_mode === 'preorder' ? 'PO' : Number(v.stock || 0) > 0 ? `Ready ${v.stock}` : 'Habis';

          return `
            <div class="variant-edit-card" data-key="${esc(vKey)}" style="${isVEnabled ? '' : 'opacity:0.6;background:#f5f5f5'}">
              <div>
                <div style="display:flex;align-items:center;gap:8px">
                  <b>${esc(v.name)}</b>
                  <span class="stock-state-pill ${Number(v.stock || 0) > 0 ? 'ready' : 'empty'}" style="font-size:10px">${stockLabel}</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">
                  <div style="background:#fff;border:1px solid #ccc;border-radius:6px;padding:4px 8px">
                    <small style="display:block;font-size:10px;color:var(--muted)">Modal Owner</small>
                    <b style="font-size:12px">${money(vBaseCost)}</b>
                  </div>
                  <div style="background:#edffdc;border:1px solid #82d847;border-radius:6px;padding:4px 8px">
                    <small style="display:block;font-size:10px;color:#1a5e00">Margin Profit (+)</small>
                    <input type="number" class="input-variant-margin" data-key="${esc(vKey)}" data-base="${vBaseCost}" value="${currentVMargin}" min="0" step="500" style="width:100%;font-size:12px;font-weight:700;padding:2px;border:1px solid #000;border-radius:4px" />
                  </div>
                  <div style="background:#fffbd4;border:1px solid #ffd91a;border-radius:6px;padding:4px 8px">
                    <small style="display:block;font-size:10px;color:#705300">Harga Jual</small>
                    <b class="label-sell-price" style="font-size:12px">${money(vSellPrice)}</b>
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center">
                <button type="button" class="toggle toggle-variant-btn ${isVEnabled ? '' : 'off'}" data-key="${esc(vKey)}" data-enabled="${isVEnabled ? 1 : 0}">
                  ${isVEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : `
    <div class="product-info" style="margin-top:10px">
      <div class="info-box">
        <small>Modal Owner</small>
        <strong>${money(pBaseCost)}</strong>
        <em>Harga dasar</em>
      </div>
      <div class="info-box price">
        <small>Harga Jual Pembeli</small>
        <strong class="label-sell-price">${money(pSellPrice)}</strong>
        <em>Profit +${money(currentPMargin)}</em>
      </div>
    </div>
    <div style="margin-top:10px">
      <label style="font-size:12px;font-weight:700">Margin Profit Toko Anda (Rp):
        <input type="number" class="input-product-margin" data-code="${esc(p.code)}" data-base="${pBaseCost}" value="${currentPMargin}" min="0" step="500" style="margin-top:4px;width:100%" />
      </label>
    </div>
  `;

  return `
    <article class="product-card ${isPEnabled ? '' : 'stock-empty'}" data-product-card="${esc(p.code)}">
      <span class="product-index">${String(idx + 1).padStart(2, '0')}</span>
      <div class="product-thumb">
        <span class="thumb-fallback">${icon}</span>
        ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ''}
      </div>
      <div class="product-body">
        <div class="product-head">
          <div class="product-title">
            <h3>${esc(p.name)}</h3>
            <p>Kode: <code>${esc(p.code)}</code> · ${esc(p.category || 'Produk Digital')}</p>
          </div>
          <div class="product-head-actions">
            <span class="stock-state-pill ${isPEnabled ? 'ready' : 'empty'}">${isPEnabled ? 'AKTIF' : 'OFF'}</span>
            <button class="toggle toggle-product-btn ${isPEnabled ? '' : 'off'}" data-code="${esc(p.code)}" data-enabled="${isPEnabled ? 1 : 0}">
              ${isPEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        ${variantsListHtml}
      </div>
    </article>
  `;
}

function bindPricingCardEvents() {
  $$('.input-product-margin').forEach(input => {
    input.oninput = (e) => {
      const code = e.target.dataset.code;
      const base = Number(e.target.dataset.base || 0);
      const val = Math.max(0, Number(e.target.value) || 0);
      const card = e.target.closest('.product-card');

      state.pendingPricing[code] = {
        ...(state.pendingPricing[code] || {}),
        margin: val,
        sell_price: base + val
      };

      const sellLabel = card.querySelector('.label-sell-price');
      if (sellLabel) sellLabel.textContent = money(base + val);
      updateSaveBar();
    };
  });

  $$('.input-variant-margin').forEach(input => {
    input.oninput = (e) => {
      const key = e.target.dataset.key;
      const base = Number(e.target.dataset.base || 0);
      const val = Math.max(0, Number(e.target.value) || 0);
      const card = e.target.closest('.variant-edit-card');

      state.pendingPricing[key] = {
        ...(state.pendingPricing[key] || {}),
        margin: val,
        sell_price: base + val
      };

      const sellLabel = card.querySelector('.label-sell-price');
      if (sellLabel) sellLabel.textContent = money(base + val);
      updateSaveBar();
    };
  });

  $$('.toggle-product-btn').forEach(btn => {
    btn.onclick = (e) => {
      const code = e.target.dataset.code;
      const cur = Number(e.target.dataset.enabled) === 1;
      const next = !cur;
      e.target.dataset.enabled = next ? 1 : 0;
      e.target.textContent = next ? 'ON' : 'OFF';
      e.target.classList.toggle('off', !next);
      const card = e.target.closest('.product-card');
      card.classList.toggle('stock-empty', !next);
      const pill = card.querySelector('.product-head-actions .stock-state-pill');
      if (pill) {
        pill.className = `stock-state-pill ${next ? 'ready' : 'empty'}`;
        pill.textContent = next ? 'AKTIF' : 'OFF';
      }

      state.pendingPricing[code] = {
        ...(state.pendingPricing[code] || {}),
        enabled: next
      };
      updateSaveBar();
    };
  });

  $$('.toggle-variant-btn').forEach(btn => {
    btn.onclick = (e) => {
      const key = e.target.dataset.key;
      const cur = Number(e.target.dataset.enabled) === 1;
      const next = !cur;
      e.target.dataset.enabled = next ? 1 : 0;
      e.target.textContent = next ? 'ON' : 'OFF';
      e.target.classList.toggle('off', !next);
      const card = e.target.closest('.variant-edit-card');
      card.style.opacity = next ? '1' : '0.6';
      card.style.background = next ? '#faf7ff' : '#f5f5f5';

      state.pendingPricing[key] = {
        ...(state.pendingPricing[key] || {}),
        enabled: next
      };
      updateSaveBar();
    };
  });

  $$('.btn-sync-variants').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.code;
      const p = state.products.find(x => x.code === code);
      if (!p || !p.variants) return;

      const promptMargin = prompt(`Tentukan margin profit (Rp) untuk seluruh varian ${p.name}:`, '2000');
      if (promptMargin === null) return;
      const marginVal = Math.max(0, Number(promptMargin.replace(/[^0-9]/g, '')) || 0);

      p.variants.forEach(v => {
        const vKey = `${p.code}:v${v.id}`;
        state.pendingPricing[vKey] = {
          ...(state.pendingPricing[vKey] || {}),
          margin: marginVal,
          sell_price: v.base_cost + marginVal
        };
      });

      toast(`Margin ${money(marginVal)} diterapkan ke semua varian ${p.name}`);
      renderPricingView($('#productSearch')?.value, $('#productStatus')?.value, $('#productCategory')?.value);
      updateSaveBar();
    };
  });
}

$('#btnDiscardPricing').onclick = () => {
  state.pendingPricing = {};
  updateSaveBar();
  renderPricingView($('#productSearch')?.value, $('#productStatus')?.value, $('#productCategory')?.value);
  toast('Perubahan dibatalkan');
};

$('#btnSavePricingFloating').onclick = async () => {
  const btn = $('#btnSavePricingFloating');
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';

  try {
    const existing = state.bot?.pricing_overrides || {};
    const merged = { ...existing };

    for (const [key, patch] of Object.entries(state.pendingPricing)) {
      merged[key] = {
        ...(typeof merged[key] === 'object' && merged[key] !== null ? merged[key] : {}),
        ...patch
      };
    }

    const res = await api('/api/reseller/products/pricing', {
      method: 'POST',
      body: { pricing_overrides: merged }
    });

    state.bot.pricing_overrides = res.pricing_overrides || merged;
    state.pendingPricing = {};
    updateSaveBar();
    toast('Semua margin & status varian berhasil disimpan!');
    await loadPricing();
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Simpan Perubahan';
  }
};

function showBulkMarkupModal() {
  const html = `
    <div class="form-grid">
      <label>
        Terapkan Margin Cepat
        <select name="bulk_mode" id="bulkMarkupMode">
          <option value="fixed">Tambah Nominal Tetap (Rp)</option>
          <option value="percent">Tambah Persentase (%)</option>
        </select>
      </label>
      <label>
        Nilai Tambahan Margin
        <input name="bulk_value" id="bulkMarkupVal" type="number" min="0" value="2000" placeholder="Contoh: 2000" required />
      </label>
      <div class="full info-note">
        Fitur ini akan menghitung margin baru untuk <b>seluruh produk dan varian</b> yang ada di katalog. Anda tetap bisa memeriksa dan menyimpannya setelah menekan tombol Terapkan.
      </div>
    </div>
  `;

  modal('⚡ Markup Margin Massal', html, async (data) => {
    const mode = data.bulk_mode;
    const val = Number(data.bulk_value || 0);

    state.products.forEach(p => {
      if (Array.isArray(p.variants) && p.variants.length) {
        p.variants.forEach(v => {
          const vKey = `${p.code}:v${v.id}`;
          const margin = mode === 'percent' ? Math.round(v.base_cost * val / 100) : val;
          state.pendingPricing[vKey] = {
            ...(state.pendingPricing[vKey] || {}),
            margin,
            sell_price: v.base_cost + margin
          };
        });
      } else {
        const margin = mode === 'percent' ? Math.round(p.base_cost * val / 100) : val;
        state.pendingPricing[p.code] = {
          ...(state.pendingPricing[p.code] || {}),
          margin,
          sell_price: p.base_cost + margin
        };
      }
    });

    toast(`Markup massal diterapkan ke seluruh produk & varian!`);
    renderPricingView($('#productSearch')?.value, $('#productStatus')?.value, $('#productCategory')?.value);
    updateSaveBar();
  }, { submit: 'Terapkan ke Semua' });
}

// ---------------------------------------------------------------------
// VIEW 4: TARIK SALDO (Identical to Owner layout)
// ---------------------------------------------------------------------
async function loadWithdraw() {
  const me = await api('/api/reseller/me');
  state.reseller = me.reseller;
  state.withdrawals = await api('/api/reseller/withdrawals');
  updateShellUI();

  const r = state.reseller || {};
  const list = Array.isArray(state.withdrawals.items) ? state.withdrawals.items : [];

  const rowsHtml = list.map(w => `
    <article class="order-card" style="margin-bottom:12px">
      <div class="order-head">
        <div>
          <small>PENARIKAN #${w.id}</small>
          <b class="mono">${esc(w.bank_name)} · ${esc(w.bank_account_number)} (${esc(w.bank_account_name)})</b>
        </div>
        ${badge(w.status)}
      </div>
      <div class="order-grid">
        <div><small>Nominal</small><strong>${money(w.amount)}</strong></div>
        <div><small>Tanggal Pengajuan</small><strong>${date(w.created_at)}</strong></div>
        <div><small>Catatan Owner</small><span>${esc(w.admin_note || '-')}</span></div>
      </div>
      ${w.proof_file ? `
        <div class="order-actions" style="margin-top:10px">
          <button type="button" class="neo-btn blue small btn-view-proof" data-url="/api/media?name=${encodeURIComponent(w.proof_file.replace(/^vps:\/\//, ''))}&v=250">
            👁️ Lihat Bukti Transfer
          </button>
        </div>
      ` : ''}
    </article>
  `).join('');

  $('#content').innerHTML = `
    <div class="dashboard-kpis">
      ${stat('💵', 'green', 'Saldo Komisi Siap Ditarik', money(r.profit_balance), 'Minimal penarikan Rp 10.000')}
      ${stat('💸', 'purple', 'Akumulasi Dana Ditarik', money(r.withdrawn_total), 'Total komisi yang telah cair')}
    </div>

    <div class="section-title product-section-title" style="margin-top:20px">
      <div>
        <h2>💸 Pengajuan Penarikan Saldo Profit</h2>
        <p>Transfer pencairan dana diproses oleh Owner ke rekening bank atau e-wallet Anda.</p>
      </div>
      <span>
        <button type="button" id="btnOpenWdModal" class="neo-btn green">＋ Tarik Saldo Sekarang</button>
      </span>
    </div>

    <div class="section-title product-section-title" style="margin-top:20px">
      <div>
        <h2>📋 Riwayat Penarikan Saldo</h2>
        <p>Pantau status pengajuan pencairan dana dan bukti transfer dari owner.</p>
      </div>
    </div>

    ${list.length ? `<div class="order-list">${rowsHtml}</div>` : '<div class="empty-product">Belum ada riwayat penarikan saldo.</div>'}
  `;

  $('#btnOpenWdModal').onclick = showWithdrawModal;

  $$('.btn-view-proof').forEach(btn => {
    btn.onclick = () => {
      const src = btn.dataset.url;
      modal('Bukti Transfer Owner', `<div style="text-align:center"><img src="${esc(src)}" style="max-width:100%;border-radius:10px;border:2px solid #000" alt="Bukti Transfer" /></div>`, null, { noSubmit: true });
    };
  });
}

function showWithdrawModal() {
  const r = state.reseller || {};
  const maxWd = Math.max(0, Number(r.profit_balance || 0));

  if (maxWd < 10000) {
    return toast('Saldo komisi belum mencukupi. Minimal penarikan Rp 10.000', true);
  }

  const html = `
    <div class="form-grid">
      <label>
        Pilih Bank / E-Wallet
        <select name="bank_name" required>
          <option value="DANA">DANA</option>
          <option value="GOPAY">GoPay</option>
          <option value="OVO">OVO</option>
          <option value="SHOPEEPAY">ShopeePay</option>
          <option value="BCA">BCA</option>
          <option value="BNI">BNI</option>
          <option value="BRI">BRI</option>
          <option value="MANDIRI">MANDIRI</option>
          <option value="SEABANK">SeaBank</option>
          <option value="JAGO">Bank Jago</option>
        </select>
      </label>
      <label>
        Nomor Rekening / No. E-Wallet
        <input name="bank_account_number" placeholder="Contoh: 081234567890" value="${esc(r.bank_account_number || '')}" required />
      </label>
      <label class="full">
        Nama Pemilik Rekening
        <input name="bank_account_name" placeholder="Sesuai nama di buku tabungan / e-wallet" value="${esc(r.bank_account_name || '')}" required />
      </label>
      <label class="full">
        Nominal Penarikan (Rp)
        <input name="amount" type="number" min="10000" max="${maxWd}" value="${maxWd}" required />
        <small>Tersedia: <b>${money(maxWd)}</b></small>
      </label>
    </div>
  `;

  modal('💸 Formulir Penarikan Saldo', html, async (data) => {
    data.amount = Number(data.amount || 0);
    await api('/api/reseller/withdrawals', { method: 'POST', body: data });
    toast('Pengajuan penarikan berhasil dikirim ke Owner!');
    await loadWithdraw();
  }, { submit: 'Kirim Pengajuan' });
}

// ---------------------------------------------------------------------
// VIEW 5: PESANAN PEMBELI (Identical to Owner loadOrders())
// ---------------------------------------------------------------------
async function loadOrders() {
  const res = await api('/api/reseller/orders');
  state.orders = res.items || [];
  updateShellUI();

  renderOrdersView();
}

function renderOrdersView(filterStatus = '', search = '') {
  const q = (search || $('#orderSearch')?.value || '').toLowerCase().trim();
  const st = filterStatus || ($('#orderStatus')?.value || '');

  const rows = state.orders.filter(o => {
    const matchQ = !q || [o.order_ref, o.product_name, o.variant_name].some(x => String(x || '').toLowerCase().includes(q));
    const matchSt = !st || o.status === st;
    return matchQ && matchSt;
  });

  const ordersHtml = rows.map(o => `
    <article class="order-card">
      <div class="order-head">
        <div>
          <small>Invoice</small>
          <b class="mono">#${esc(o.order_ref || String(o.id))}</b>
        </div>
        ${badge(o.status)}
      </div>
      <div class="order-grid">
        <div><small>Produk</small><strong>${esc(o.product_name)}</strong><span>${esc(o.variant_name || 'Default')}</span></div>
        <div><small>Qty</small><strong>${o.quantity || 1}</strong></div>
        <div><small>Harga Jual</small><strong>${money(o.total_price)}</strong></div>
        <div><small>Modal Owner</small><strong>${money(o.cost_amount)}</strong></div>
        <div style="background:#edffdc"><small>Profit Masuk</small><strong style="color:#1a5e00">+${money(o.reseller_profit)}</strong></div>
        <div><small>Metode Bayar</small><strong>${esc(o.payment_method || 'QRIS')}</strong></div>
        <div class="wide"><small>Waktu Transaksi</small><strong>${date(o.created_at)}</strong></div>
      </div>
    </article>
  `).join('');

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>🛒 Riwayat Pesanan Pembeli</h2>
        <p>Seluruh pesanan otomatis dilayani dan komisi profit langsung masuk ke saldo Anda.</p>
      </div>
      <span>
        <span class="badge ok">Total ${state.orders.length} Pesanan</span>
      </span>
    </div>

    <div class="toolbar order-toolbar">
      <div class="searchbox"><input id="orderSearch" placeholder="Cari nomor invoice atau produk..." value="${esc(q)}" /></div>
      <select id="orderStatus">
        <option value="">Semua Status</option>
        <option value="completed" ${st === 'completed' ? 'selected' : ''}>Completed</option>
        <option value="paid" ${st === 'paid' ? 'selected' : ''}>Paid</option>
        <option value="pending" ${st === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="failed" ${st === 'failed' ? 'selected' : ''}>Failed</option>
      </select>
    </div>

    <div class="order-list">
      ${rows.length ? ordersHtml : '<div class="empty-product">Belum ada transaksi pesanan yang sesuai filter.</div>'}
    </div>
  `;

  $('#orderSearch').oninput = () => renderOrdersView($('#orderStatus').value, $('#orderSearch').value);
  $('#orderStatus').onchange = () => renderOrdersView($('#orderStatus').value, $('#orderSearch').value);
}

// ---------------------------------------------------------------------
// INITIALIZATION & TELEGRAM AUTH
// ---------------------------------------------------------------------
async function initialize() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand?.();
      if (tg.setHeaderColor) tg.setHeaderColor('#ffffff');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#f6f6f2');
    } catch {}
  }

  // Auto-authentication with Telegram initData
  if (!state.token) {
    let initData = tg?.initData || '';
    let tgUser = tg?.initDataUnsafe?.user || null;

    if (!initData && !tgUser) {
      const p = new URLSearchParams(window.location.search);
      const testId = p.get('id') || p.get('tg_id');
      if (testId) {
        tgUser = { id: testId, first_name: p.get('name') || 'Reseller Demo', username: p.get('username') || '' };
      }
    }

    try {
      const res = await api('/api/reseller/auth', {
        method: 'POST',
        body: { initData, telegram_user: tgUser }
      });
      state.token = res.token;
      sessionStorage.setItem('ilink_reseller_token', res.token);
      localStorage.setItem('ilink_reseller_token', res.token);
      state.reseller = res.reseller;
      state.bot = res.bot;
      state.runtime = res.runtime;
    } catch (err) {
      console.warn('[reseller:auth_init]', err.message);
    }
  }

  updateShellUI();
  await navigate('dashboard');
}

(async () => {
  try {
    await initialize();
  } catch (err) {
    $('#content').innerHTML = `
      <div class="empty-product" style="padding:30px">
        <div style="font-size:36px;margin-bottom:12px">⚠️</div>
        <h3>Gagal Menghubungkan ke Bot</h3>
        <p style="margin:6px 0 16px;color:var(--muted)">${esc(err.message)}</p>
        <button type="button" class="neo-btn purple" onclick="window.location.reload()">Coba Lagi</button>
      </div>
    `;
  }
})();
