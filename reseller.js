const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  token: sessionStorage.getItem('ilink_reseller_token') || localStorage.getItem('ilink_reseller_token') || '',
  view: 'dashboard',
  me: null,
  reseller: null,
  bot: null,
  runtime: null,
  products: [],
  pendingPricing: {},
  orders: [],
  withdrawals: []
};

const titles = {
  dashboard: ['Dashboard Reseller', 'Ringkasan performa toko dan komisi profit Anda'],
  bot: ['Bot Toko', 'Kelola token bot, nama toko, banner, dan pengaturan layanan'],
  pricing: ['Atur Margin & Varian', 'Sesuaikan keuntungan harga jual per produk dan per varian'],
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

// Sidebar Drawer Control
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
// VIEW 1: DASHBOARD
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

  const recentRows = (state.orders.slice(0, 5) || []).map(o => `
    <tr>
      <td><b>#${esc(o.order_ref || String(o.id))}</b><br><small>${date(o.created_at)}</small></td>
      <td><b>${esc(o.product_name)}</b><br><small>${esc(o.variant_name || '-')}</small></td>
      <td><strong>${money(o.total_price)}</strong></td>
      <td><span class="badge ok">+${money(o.reseller_profit)}</span></td>
      <td>${badge(o.status)}</td>
    </tr>
  `).join('');

  $('#content').innerHTML = `
    <div class="dashboard-kpis">
      <div class="stat-card">
        <div class="stat-icon purple">👛</div>
        <div>
          <small>Saldo Komisi Profit</small>
          <strong>${money(stats.profit_balance)}</strong>
          <em>Sudah ditarik: ${money(stats.withdrawn_total)}</em>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon yellow">💰</div>
        <div>
          <small>Total Penjualan</small>
          <strong>${money(stats.revenue_total)}</strong>
          <em>Omzet toko Anda</em>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green">📦</div>
        <div>
          <small>Total Pesanan</small>
          <strong>${Number(stats.orders_count || 0)}</strong>
          <em>Pesanan berhasil</em>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">👥</div>
        <div>
          <small>Pelanggan Bot</small>
          <strong>${Number(stats.customers_count || 0)} User</strong>
          <em>Total pembeli terdaftar</em>
        </div>
      </div>
    </div>

    <div class="neo-card" style="margin-top:16px;padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:24px">🤖</span>
            <div>
              <h3 style="margin:0;font-size:18px">${esc(b.branding?.store_name || b.bot_name || 'Bot Toko Belum Diatur')}</h3>
              <p style="margin:2px 0 0;font-size:13px;color:var(--muted)">Username: <b>${b.bot_username ? '@' + b.bot_username : '-'}</b></p>
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${botStatusBadge}
          <button type="button" class="neo-btn purple small" id="dashGoBotBtn">⚙️ Atur Bot</button>
        </div>
      </div>
    </div>

    <div class="neo-card" style="margin-top:16px;padding:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div>
          <h3 style="margin:0;font-size:18px">🛒 5 Transaksi Pembeli Terakhir</h3>
          <p style="margin:3px 0 0;font-size:12px;color:var(--muted)">Pesanan yang masuk melalui bot toko Anda</p>
        </div>
        <button type="button" class="neo-btn white small" id="dashGoOrdersBtn">Lihat Semua →</button>
      </div>
      ${state.orders.length ? `
        <div style="overflow-x:auto">
          <table class="neo-table" style="width:100%">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Produk</th>
                <th>Harga Jual</th>
                <th>Profitmu</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>
      ` : '<div class="empty-product">Belum ada transaksi pembeli di bot toko Anda.</div>'}
    </div>
  `;

  $('#dashGoBotBtn').onclick = () => navigate('bot');
  $('#dashGoOrdersBtn').onclick = () => navigate('orders');
}

// ---------------------------------------------------------------------
// VIEW 2: BOT TOKO
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
    <div class="neo-card" style="padding:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="margin:0;font-size:20px">🤖 Pengaturan Bot Toko Reseller</h2>
          <p style="margin:4px 0 0;font-size:13px;color:var(--muted)">Hubungkan bot Telegram Anda dari @BotFather dan kelola branding toko.</p>
        </div>
        <div>
          ${rt.running ? '<span class="badge ok">🟢 Online</span>' : b.bot_token ? '<span class="badge warn">🟡 Stopped</span>' : '<span class="badge">Belum Setup</span>'}
        </div>
      </div>

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

        <div class="full" style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
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
// VIEW 3: ATUR MARGIN & VARIAN PRODUK
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

function renderPricingView(searchFilter = '', statusFilter = 'all') {
  const q = (searchFilter || $('#productSearch')?.value || '').toLowerCase().trim();
  const stFilter = statusFilter !== 'all' ? statusFilter : ($('#statusFilter')?.value || 'all');

  const filtered = state.products.filter(p => {
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q) || (p.variants || []).some(v => v.name.toLowerCase().includes(q));
    const pEnabled = state.pendingPricing[p.code]?.enabled !== undefined ? state.pendingPricing[p.code].enabled : p.enabled;
    if (!matchSearch) return false;
    if (stFilter === 'enabled') return pEnabled;
    if (stFilter === 'disabled') return !pEnabled;
    return true;
  });

  $('#content').innerHTML = `
    <div class="pricing-toolbar neo-card">
      <div class="searchbox">
        <input id="productSearch" placeholder="🔍 Cari nama produk / varian..." value="${esc(q)}" />
      </div>
      <select id="statusFilter">
        <option value="all" ${stFilter === 'all' ? 'selected' : ''}>Semua Status</option>
        <option value="enabled" ${stFilter === 'enabled' ? 'selected' : ''}>Hanya Aktif</option>
        <option value="disabled" ${stFilter === 'disabled' ? 'selected' : ''}>Hanya Nonaktif</option>
      </select>
      <button type="button" id="btnOpenBulkModal" class="neo-btn purple">⚡ Markup Massal</button>
    </div>

    <div class="pricing-list" id="pricingCardsList">
      ${filtered.length ? filtered.map(renderProductPricingCard).join('') : '<div class="empty-product">Tidak ada produk yang cocok dengan pencarian.</div>'}
    </div>
  `;

  // Attach search listeners
  $('#productSearch').oninput = (e) => renderPricingView(e.target.value, $('#statusFilter').value);
  $('#statusFilter').onchange = (e) => renderPricingView($('#productSearch').value, e.target.value);
  $('#btnOpenBulkModal').onclick = showBulkMarkupModal;

  bindPricingCardEvents();
}

function renderProductPricingCard(p) {
  const pendingP = state.pendingPricing[p.code] || {};
  const isPEnabled = pendingP.enabled !== undefined ? pendingP.enabled : p.enabled;
  const currentPMargin = pendingP.margin !== undefined ? pendingP.margin : p.current_margin;
  const pBaseCost = p.base_cost;
  const pSellPrice = pBaseCost + Number(currentPMargin || 0);

  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;

  const variantsHtml = hasVariants ? `
    <div class="variants-container">
      <div class="variants-container-head">
        <h4>Varian Produk (${p.variants.length})</h4>
        <button type="button" class="neo-btn white tiny btn-sync-variants" data-code="${esc(p.code)}" data-margin="${currentPMargin}">
          ⚡ Samakan Margin ke Semua Varian
        </button>
      </div>
      <div class="variant-list">
        ${p.variants.map(v => {
          const vKey = `${p.code}:v${v.id}`;
          const pendingV = state.pendingPricing[vKey] || {};
          const isVEnabled = pendingV.enabled !== undefined ? pendingV.enabled : v.enabled;
          const currentVMargin = pendingV.margin !== undefined ? pendingV.margin : v.current_margin;
          const vBaseCost = v.base_cost;
          const vSellPrice = vBaseCost + Number(currentVMargin || 0);
          const stockLabel = v.delivery_mode === 'preorder' ? 'PO' : Number(v.stock || 0) > 0 ? `Ready ${v.stock}` : 'Habis';

          return `
            <div class="variant-card-item ${isVEnabled ? '' : 'disabled'}" data-key="${esc(vKey)}">
              <div class="variant-head-row">
                <div class="variant-title-info">
                  <b>${esc(v.name)}</b>
                  <span class="badge ${Number(v.stock || 0) > 0 ? 'ok' : 'warn'}">${stockLabel}</span>
                </div>
                <div class="toggle-switch-group">
                  <button type="button" class="toggle-btn toggle-variant-btn ${isVEnabled ? '' : 'off'}" data-key="${esc(vKey)}" data-enabled="${isVEnabled ? 1 : 0}">
                    ${isVEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div class="calc-boxes-grid">
                <div class="calc-box">
                  <small>Modal Owner</small>
                  <strong>${money(vBaseCost)}</strong>
                </div>
                <div class="calc-box profit">
                  <small>Margin Profit (Rp)</small>
                  <input type="number" class="margin-input input-variant-margin" data-key="${esc(vKey)}" data-base="${vBaseCost}" value="${currentVMargin}" min="0" step="500" />
                </div>
                <div class="calc-box highlight">
                  <small>Harga Jual Pembeli</small>
                  <strong class="label-sell-price">${money(vSellPrice)}</strong>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : `
    <div class="calc-boxes-grid" style="margin-top:12px">
      <div class="calc-box">
        <small>Modal Owner</small>
        <strong>${money(pBaseCost)}</strong>
      </div>
      <div class="calc-box profit">
        <small>Margin Profit (Rp)</small>
        <input type="number" class="margin-input input-product-margin" data-code="${esc(p.code)}" data-base="${pBaseCost}" value="${currentPMargin}" min="0" step="500" />
      </div>
      <div class="calc-box highlight">
        <small>Harga Jual Pembeli</small>
        <strong class="label-sell-price">${money(pSellPrice)}</strong>
      </div>
    </div>
  `;

  return `
    <div class="price-product-card ${isPEnabled ? '' : 'disabled'}" data-code="${esc(p.code)}">
      <div class="product-head-row">
        <div class="product-main-meta">
          <div class="product-icon-box">📦</div>
          <div class="product-title-block">
            <h3>${esc(p.name)}</h3>
            <p>Kode: <code>${esc(p.code)}</code> · Kategori: ${esc(p.category || 'Digital')}</p>
          </div>
        </div>
        <div class="toggle-switch-group">
          <button type="button" class="toggle-btn toggle-product-btn ${isPEnabled ? '' : 'off'}" data-code="${esc(p.code)}" data-enabled="${isPEnabled ? 1 : 0}">
            ${isPEnabled ? 'PRODUK AKTIF' : 'PRODUK OFF'}
          </button>
        </div>
      </div>

      ${variantsHtml}
    </div>
  `;
}

function bindPricingCardEvents() {
  // Product level margin input
  $$('.input-product-margin').forEach(input => {
    input.oninput = (e) => {
      const code = e.target.dataset.code;
      const base = Number(e.target.dataset.base || 0);
      const val = Math.max(0, Number(e.target.value) || 0);
      const card = e.target.closest('.price-product-card');

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

  // Variant level margin input
  $$('.input-variant-margin').forEach(input => {
    input.oninput = (e) => {
      const key = e.target.dataset.key;
      const base = Number(e.target.dataset.base || 0);
      const val = Math.max(0, Number(e.target.value) || 0);
      const card = e.target.closest('.variant-card-item');

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

  // Product toggle
  $$('.toggle-product-btn').forEach(btn => {
    btn.onclick = (e) => {
      const code = e.target.dataset.code;
      const cur = Number(e.target.dataset.enabled) === 1;
      const next = !cur;
      e.target.dataset.enabled = next ? 1 : 0;
      e.target.textContent = next ? 'PRODUK AKTIF' : 'PRODUK OFF';
      e.target.classList.toggle('off', !next);
      e.target.closest('.price-product-card').classList.toggle('disabled', !next);

      state.pendingPricing[code] = {
        ...(state.pendingPricing[code] || {}),
        enabled: next
      };
      updateSaveBar();
    };
  });

  // Variant toggle
  $$('.toggle-variant-btn').forEach(btn => {
    btn.onclick = (e) => {
      const key = e.target.dataset.key;
      const cur = Number(e.target.dataset.enabled) === 1;
      const next = !cur;
      e.target.dataset.enabled = next ? 1 : 0;
      e.target.textContent = next ? 'ON' : 'OFF';
      e.target.classList.toggle('off', !next);
      e.target.closest('.variant-card-item').classList.toggle('disabled', !next);

      state.pendingPricing[key] = {
        ...(state.pendingPricing[key] || {}),
        enabled: next
      };
      updateSaveBar();
    };
  });

  // Sync margin to all variants of a product
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
      renderPricingView($('#productSearch')?.value, $('#statusFilter')?.value);
      updateSaveBar();
    };
  });
}

// Floating Bar Action Buttons
$('#btnDiscardPricing').onclick = () => {
  state.pendingPricing = {};
  updateSaveBar();
  renderPricingView($('#productSearch')?.value, $('#statusFilter')?.value);
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
    renderPricingView($('#productSearch')?.value, $('#statusFilter')?.value);
    updateSaveBar();
  }, { submit: 'Terapkan ke Semua' });
}

// ---------------------------------------------------------------------
// VIEW 4: TARIK SALDO
// ---------------------------------------------------------------------
async function loadWithdraw() {
  const me = await api('/api/reseller/me');
  state.reseller = me.reseller;
  state.withdrawals = await api('/api/reseller/withdrawals');
  updateShellUI();

  const r = state.reseller || {};
  const list = Array.isArray(state.withdrawals.items) ? state.withdrawals.items : [];

  const rowsHtml = list.map(w => `
    <div class="order-card" style="margin-bottom:12px">
      <div class="order-head">
        <div>
          <small>PENARIKAN #${w.id}</small>
          <b>${esc(w.bank_name)} · ${esc(w.bank_account_number)} (${esc(w.bank_account_name)})</b>
        </div>
        ${badge(w.status)}
      </div>
      <div class="order-grid">
        <div><small>Nominal</small><strong>${money(w.amount)}</strong></div>
        <div><small>Tanggal</small><strong>${date(w.created_at)}</strong></div>
        <div><small>Catatan Owner</small><span>${esc(w.admin_note || '-')}</span></div>
      </div>
      ${w.proof_file ? `
        <div style="margin-top:10px">
          <button type="button" class="neo-btn blue small btn-view-proof" data-url="/api/media?name=${encodeURIComponent(w.proof_file.replace(/^vps:\/\//, ''))}&v=250">
            👁️ Lihat Bukti Transfer
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');

  $('#content').innerHTML = `
    <div class="dashboard-kpis" style="margin-bottom:16px">
      <div class="stat-card">
        <div class="stat-icon green">👛</div>
        <div>
          <small>Saldo Komisi Siap Ditarik</small>
          <strong>${money(r.profit_balance)}</strong>
          <em>Minimal penarikan Rp 10.000</em>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple">💸</div>
        <div>
          <small>Akumulasi Dana Ditarik</small>
          <strong>${money(r.withdrawn_total)}</strong>
          <em>Total komisi yang telah cair</em>
        </div>
      </div>
    </div>

    <div class="neo-card" style="padding:18px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div>
          <h3 style="margin:0;font-size:18px">💸 Ajukan Penarikan Saldo Profit</h3>
          <p style="margin:2px 0 0;font-size:12px;color:var(--muted)">Transfer otomatis diproses oleh Owner ke rekening/e-wallet Anda.</p>
        </div>
        <button type="button" id="btnOpenWdModal" class="neo-btn green">＋ Tarik Saldo Sekarang</button>
      </div>
      <div class="info-note">
        💡 Pastikan data bank atau e-wallet Anda sudah benar. Anda akan menerima notifikasi Telegram seketika penarikan disetujui beserta bukti transfer.
      </div>
    </div>

    <div class="neo-card" style="padding:18px">
      <h3 style="margin:0 0 14px;font-size:18px">📋 Riwayat Penarikan Saldo</h3>
      ${list.length ? rowsHtml : '<div class="empty-product">Belum ada riwayat penarikan saldo.</div>'}
    </div>
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
// VIEW 5: PESANAN PEMBELI
// ---------------------------------------------------------------------
async function loadOrders() {
  const res = await api('/api/reseller/orders');
  state.orders = res.items || [];
  updateShellUI();

  const orders = state.orders;

  const ordersHtml = orders.map(o => `
    <div class="order-card" style="margin-bottom:12px">
      <div class="order-head">
        <div>
          <small>REF: #${esc(o.order_ref || String(o.id))}</small>
          <b>${esc(o.product_name)}</b>
          ${o.variant_name ? `<span style="display:inline-block;margin-top:2px;font-size:12px;color:var(--muted)">Varian: <b>${esc(o.variant_name)}</b></span>` : ''}
        </div>
        ${badge(o.status)}
      </div>
      <div class="order-grid">
        <div><small>Harga Jual</small><strong>${money(o.total_price)}</strong></div>
        <div><small>Modal Owner</small><strong>${money(o.cost_amount)}</strong></div>
        <div style="background:#edffdc"><small>Profit Masuk</small><strong style="color:#1a5e00">+${money(o.reseller_profit)}</strong></div>
        <div class="wide"><small>Waktu Pembelian</small><span>${date(o.created_at)}</span></div>
      </div>
    </div>
  `).join('');

  $('#content').innerHTML = `
    <div class="neo-card" style="padding:16px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div>
          <h2 style="margin:0;font-size:20px">🛒 Riwayat Pesanan Pembeli</h2>
          <p style="margin:3px 0 0;font-size:13px;color:var(--muted)">Seluruh pesanan otomatis dilayani dan komisi profit masuk ke saldo Anda.</p>
        </div>
        <div>
          <span class="badge ok">Total ${orders.length} Pesanan</span>
        </div>
      </div>
    </div>

    ${orders.length ? ordersHtml : '<div class="empty-product">Belum ada pesanan pembeli yang masuk melalui bot Anda.</div>'}
  `;
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

  // Attempt auto-authentication with Telegram initData
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
