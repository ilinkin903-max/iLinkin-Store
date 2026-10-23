const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const state = {
  token: sessionStorage.getItem('ilink_reseller_token') || localStorage.getItem('ilink_reseller_token') || '',
  view: 'dashboard',
  mainProductTab: 'store',
  productTab: 'regular',
  reseller: null,
  bot: null,
  runtime: null,
  products: [],
  freshProducts: [],
  customProducts: [],
  canAddProducts: false,
  pendingPricing: {},
  orders: [],
  users: [],
  withdrawals: [],
  report: {}
};

const titles = {
  dashboard: ['Dashboard', 'Ringkasan performa toko dan komisi profit Anda'],
  pricing: ['Produk', 'Kelola produk reseller Anda sendiri dan katalog produk toko'],
  orders: ['Pesanan', 'Daftar riwayat transaksi pembeli yang masuk melalui bot Anda'],
  reports: ['Laporan', 'Omzet, profit, dan performa penjualan bot toko Anda'],
  broadcast: ['Broadcast Pelanggan', 'Kirim pesan massal promosi, info diskon, atau pengumuman ke pembeli bot Anda'],
  users: ['User', 'Data pelanggan bot Telegram, saldo, dan aktivitas'],
  withdraw: ['Tarik Saldo', 'Pencairan saldo komisi profit ke rekening bank atau e-wallet'],
  bot: ['Pengaturan', 'Kelola token bot, nama toko, banner, dan pengaturan layanan']
};

function firstLetter(v) {
  return esc(String(v || '?').trim().charAt(0).toUpperCase() || '?');
}

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

function mediaSrc(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('vps://')) return `/api/media?name=${encodeURIComponent(raw.slice(6))}&v=268`;
  return raw;
}

function freshProductEmoji(key = '') {
  const k = String(key || '').toLowerCase();
  if (k.includes('zoom')) return '📹';
  if (k.includes('canva')) return '🎨';
  if (k.includes('picsart')) return '🖌️';
  if (k.includes('meitu')) return '📸';
  if (k.includes('wink')) return '✨';
  if (k.includes('outlook') || k.includes('hotmail')) return '✉️';
  if (k.includes('apple') || k.includes('music')) return '🎵';
  if (k.includes('vpn') || k.includes('express')) return '🛡️';
  if (k.includes('hma')) return '🔒';
  if (k.includes('scribd')) return '📚';
  if (k.includes('remini')) return '🪄';
  if (k.includes('adspower')) return '🌐';
  return '⚡';
}

function productStockState(p = {}) {
  const all = Array.isArray(p.variants) ? p.variants : [];
  const vars = all.filter(v => v.active);
  if (all.length) {
    if (vars.some(v => v.delivery_mode !== 'preorder' && Number(v.stock || 0) > 0)) return 'ready';
    if (vars.some(v => v.delivery_mode === 'preorder')) return 'preorder';
    return 'empty';
  }
  if (p.delivery_mode === 'preorder' && Number(p.stock || 0) < 1) return 'preorder';
  return Number(p.sale_stock ?? p.stock ?? 0) > 0 ? 'ready' : 'empty';
}

function stockStateLabel(state, stock = 0) {
  return state === 'ready' ? `READY · ${Number(stock || 0)}` : state === 'preorder' ? 'PRE-ORDER' : 'HABIS';
}

function variantChip(v = {}) {
  const st = v.delivery_mode === 'preorder' ? 'preorder' : Number(v.stock || 0) > 0 ? 'ready' : 'empty';
  const label = st === 'ready' ? `Ready ${Number(v.stock || 0)}` : st === 'preorder' ? 'PO' : 'Habis';
  return `<span class="variant-chip stock-${st}" title="${esc(v.name)} · ${label}">${esc(v.name)} · ${label}</span>`;
}

function bulkTiers(value) {
  let rows = value;
  if (typeof rows === 'string') {
    try { rows = JSON.parse(rows); } catch { rows = []; }
  }
  if (!Array.isArray(rows)) rows = [];
  const byQty = new Map();
  for (const row of rows) {
    const min = Math.max(2, Math.floor(Number(row?.min_qty ?? row?.minQty ?? row?.qty ?? 0) || 0));
    const price = Math.max(0, Math.floor(Number(row?.price ?? row?.unit_price ?? 0) || 0));
    if (min >= 2 && price > 0) byQty.set(min, { min_qty: min, price });
  }
  return [...byQty.values()].sort((a, b) => a.min_qty - b.min_qty);
}

function bulkUnitPrice(base, tiers, qty = 1) {
  let price = Math.max(0, Number(base || 0)), q = Math.max(1, Number(qty || 1));
  for (const t of bulkTiers(tiers)) {
    if (q >= t.min_qty) price = t.price;
    else break;
  }
  return price;
}

function bulkEditorHtml(prefix, tiers = []) {
  const rows = bulkTiers(tiers);
  return `<div class="full bulk-editor"><div class="bulk-editor-head"><div><b>Harga Bulk / Grosir</b><small>Harga per pcs otomatis berubah saat jumlah pesanan mencapai minimal tier.</small></div><button type="button" id="${prefix}Add" class="neo-btn purple small">＋ Tambah Tier</button></div><div id="${prefix}Rows" class="bulk-tier-list"></div><input type="hidden" name="bulk_prices" id="${prefix}Value" value="${esc(JSON.stringify(rows))}"><div class="bulk-help">Contoh: mulai 2 pcs Rp 845/pcs, mulai 50 pcs Rp 200/pcs. Tier diurutkan otomatis dari jumlah terkecil.</div></div>`;
}

function bindBulkEditor(prefix, initial = []) {
  let rows = bulkTiers(initial);
  const host = $(`#${prefix}Rows`), value = $(`#${prefix}Value`), add = $(`#${prefix}Add`);
  const sync = () => { if (value) value.value = JSON.stringify(bulkTiers(rows)); };
  const render = () => {
    if (!host) return;
    host.innerHTML = rows.length ? rows.map((t, i) => `
      <div class="bulk-tier-row">
        <label>Mulai Qty<input type="number" min="2" value="${Number(t.min_qty)}" data-bulk-qty="${i}"></label>
        <label>Harga / pcs<input type="number" min="1" value="${Number(t.price)}" data-bulk-price="${i}"></label>
        <button type="button" class="neo-btn red small" data-bulk-remove="${i}">Hapus</button>
      </div>
    `).join('') : '<div class="empty compact">Belum ada harga bulk. Harga normal berlaku untuk semua jumlah.</div>';
    sync();
    $$('[data-bulk-qty]').forEach(el => el.oninput = () => {
      rows[Number(el.dataset.bulkQty)].min_qty = Math.max(2, Number(el.value || 2));
      sync();
    });
    $$('[data-bulk-price]').forEach(el => el.oninput = () => {
      rows[Number(el.dataset.bulkPrice)].price = Math.max(1, Number(el.value || 1));
      sync();
    });
    $$('[data-bulk-remove]').forEach(el => el.onclick = () => {
      rows.splice(Number(el.dataset.bulkRemove), 1);
      render();
    });
  };
  if (add) add.onclick = () => {
    const normalized = bulkTiers(rows), last = normalized.at(-1);
    rows = normalized;
    rows.push({ min_qty: last ? last.min_qty + 1 : 2, price: last ? last.price : 1 });
    render();
  };
  render();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',').pop() || '');
    r.onerror = () => reject(new Error('Gagal membaca file.'));
    r.readAsDataURL(file);
  });
}

async function uploadMedia(file, kind = 'media', onProgress = null) {
  if (!file) throw new Error('Pilih file terlebih dahulu.');
  const isVideo = String(file.type || '').startsWith('video/') || /\.(mp4|webm)$/i.test(String(file.name || ''));
  const max = isVideo ? 40 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > max) throw new Error(`Ukuran ${isVideo ? 'video' : 'gambar'} maksimal ${Math.round(max / 1024 / 1024)} MB.`);
  const init = await api('/api/reseller/media/upload/init', { method: 'POST', body: { name: file.name, mime: file.type, size: file.size, kind } });
  const uploadId = init.upload_id;
  const chunkSize = Math.min(Number(init.chunk_bytes || 512 * 1024), 512 * 1024);
  let offset = 0;
  try {
    while (offset < file.size) {
      const blob = file.slice(offset, Math.min(file.size, offset + chunkSize));
      const data = await fileToBase64(blob);
      const r = await api('/api/reseller/media/upload/chunk', { method: 'POST', body: { upload_id: uploadId, offset, data_base64: data } });
      offset = Number(r.received || offset + blob.size);
      if (onProgress) onProgress(Math.min(100, Math.round(offset / file.size * 100)));
    }
    return await api('/api/reseller/media/upload/complete', { method: 'POST', body: { upload_id: uploadId } });
  } catch (e) {
    try { await api('/api/reseller/media/upload/cancel', { method: 'POST', body: { upload_id: uploadId } }); } catch {}
    throw e;
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
  $('#modalTitle').innerHTML = title;
  $('#modalBody').innerHTML = html;
  if (alertBox) { alertBox.className = 'modal-alert hidden'; alertBox.textContent = ''; }
  submitBtn.textContent = options.submit || 'Simpan';
  submitBtn.disabled = false;
  submitBtn.classList.toggle('hidden', options.noSubmit === true || options.hideSubmit === true);
  const cancelBtn = $('#modalCancel');
  if (cancelBtn) {
    cancelBtn.textContent = options.cancelText || (options.noSubmit === true || options.hideSubmit === true ? 'Tutup' : 'Batal');
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (options.noSubmit === true || options.hideSubmit === true) return;
    if (!onSubmit) return m.close();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Menyimpan...';
    try {
      const fd = new FormData(form);
      const data = Object.fromEntries(fd.entries());
      const res = await onSubmit(data);
      if (res !== false && m.open) m.close();
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
  const handleCancel = async (e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    let shouldClose = true;
    if (typeof options.onCancel === 'function') {
      try {
        const res = await options.onCancel();
        if (res === false) shouldClose = false;
      } catch (err) {
        console.error('Modal onCancel error:', err);
      }
    }
    if (shouldClose && m.open) {
      m.close();
    }
  };
  $('#modalClose').onclick = handleCancel;
  if (cancelBtn) cancelBtn.onclick = handleCancel;
  m.oncancel = async (e) => {
    if (typeof options.onCancel === 'function') {
      try {
        const res = await options.onCancel();
        if (res === false && typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
      } catch (err) {
        console.error('Modal oncancel error:', err);
      }
    }
  };
  if (!m.open) m.showModal();
}

const modalEl = $('#modal');
if (modalEl) {
  modalEl.addEventListener('close', () => {
    const t = $('#toast');
    if (t && t.parentElement !== document.body) document.body.appendChild(t);
    const alertBox = $('#modalAlert');
    if (alertBox) { alertBox.className = 'modal-alert hidden'; alertBox.textContent = ''; }
  });
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) {
      $('#modalCancel')?.click();
    }
  });
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
  if (res.status === 401 || (res.status === 403 && (data.error === 'RESELLER_INACTIVE' || data.error === 'UNAUTHORIZED' || String(data.message || '').includes('tidak ditemukan') || String(data.message || '').includes('belum aktif')))) {
    sessionStorage.removeItem('ilink_reseller_token');
    localStorage.removeItem('ilink_reseller_token');
    state.token = '';
    if (res.status === 401) {
      throw new Error('Sesi kedaluwarsa. Silakan buka kembali dari bot Telegram.');
    }
  }
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function remove(url, confirmText, callback) {
  if (confirmText && !confirm(confirmText)) return;
  try {
    await api(url, { method: 'DELETE' });
    toast('Berhasil dihapus');
    if (typeof callback === 'function') await callback();
  } catch (err) {
    toast(err.message || 'Gagal menghapus', true);
  }
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
  if (state.broadcastPollTimer) {
    clearInterval(state.broadcastPollTimer);
    state.broadcastPollTimer = null;
  }
  state.view = view;
  setHeader(view);
  if (!silent) {
    $('#content').innerHTML = '<div class="loader-card"><div class="loader-spinner"></div><p>Memuat data...</p></div>';
  }
  try {
    await ({
      dashboard: loadDashboard,
      pricing: loadPricing,
      orders: loadOrders,
      reports: loadReports,
      broadcast: loadBroadcast,
      users: loadUsers,
      withdraw: loadWithdraw,
      bot: loadBot
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
  const stats = data.stats || {};

  // 7-day chart data
  const daily = Array.isArray(data.last7) && data.last7.length ? data.last7 : (() => {
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      arr.push({ day: d.toISOString().slice(0, 10), revenue: 0, orders: 0, profit: 0 });
    }
    return arr;
  })();

  const max = Math.max(1, ...daily.map(x => Number(x.revenue || 0)));
  const total7Revenue = daily.reduce((sum, x) => sum + Number(x.revenue || 0), 0);
  const total7Profit = daily.reduce((sum, x) => sum + Number(x.profit || 0), 0);
  const total7Orders = daily.reduce((sum, x) => sum + Number(x.orders || 0), 0);

  const chartBars = daily.map(x => {
    const rev = Number(x.revenue || 0);
    const prof = Number(x.profit || 0);
    const ords = Number(x.orders || 0);
    const h = rev > 0 ? Math.max(8, Math.round((rev / max) * 100)) : 4;
    let lbl = x.day;
    try {
      lbl = new Date(x.day + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    } catch {}
    const tip = `${money(rev)} (${ords} pesanan · profit ${money(prof)})`;
    return `
      <div class="day-col">
        <div class="day-value" title="${esc(tip)}">${rev > 0 ? money(rev) : 'Rp 0'}</div>
        <div class="day-track">
          <div class="day-bar" style="height:${h}%" title="${esc(tip)}"></div>
        </div>
        <div class="day-label">${esc(lbl)}</div>
      </div>
    `;
  }).join('');

  const topProducts = Array.isArray(data.top_products) && data.top_products.length ? data.top_products : [];
  const topProductsHtml = topProducts.length ? topProducts.map((p, i) => `
    <div class="top-item">
      <span class="rank">${i + 1}</span>
      <div style="min-width:0;flex:1">
        <b style="display:block;font-size:13px;overflow-wrap:anywhere">${esc(p.product_name || '-')}${p.variant_name ? ` <span style="font-weight:normal;color:var(--muted)">(${esc(p.variant_name)})</span>` : ''}</b>
        <small style="color:var(--muted);font-size:11px">${p.qty || 0} terjual · ${p.orders || 0} order · profit ${money(p.profit || 0)}</small>
      </div>
      <strong style="font-size:13px;white-space:nowrap">${money(p.revenue)}</strong>
    </div>
  `).join('') : '<div class="empty compact">Belum ada data produk terjual di bot toko Anda.</div>';

  $('#content').innerHTML = `
    <div class="dashboard-kpis">
      ${stat('💵', 'green', 'Saldo Komisi Profit', money(r.profit_balance ?? stats.profit_balance), 'Siap dicairkan')}
      ${stat('📈', 'pink', 'Total Omset Toko', money(stats.total_revenue ?? stats.revenue_total), 'Penjualan toko Anda')}
      ${stat('🛒', 'purple', 'Total Order', (stats.total_orders ?? stats.orders_count) || 0, 'Pesanan selesai')}
      ${stat('👥', 'blue', 'Pelanggan Bot', `${(stats.total_users ?? stats.customers_count) || 0} User`, 'Pembeli terdaftar')}
    </div>

    <section class="report-card chart-card reseller-chart-card">
      <div class="card-heading">
        <div>
          <h3>📊 Grafik 7 Hari Terakhir</h3>
        </div>
      </div>
      <div class="seven-chart">
        ${chartBars}
      </div>
    </section>

    <section class="report-card top-products-card reseller-top-products-card" style="margin-top:16px">
      <div class="card-heading">
        <div>
          <h3>🔥 Produk Terlaris di Bot Anda</h3>
          <p>Daftar produk dengan penjualan terbanyak yang dipesan pelanggan di bot toko Anda</p>
        </div>
      </div>
      <div class="top-list">
        ${topProductsHtml}
      </div>
    </section>
  `;
}

// ---------------------------------------------------------------------
// VIEW 2: PENGATURAN (Toko & Bot)
// ---------------------------------------------------------------------
async function loadBot(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
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
        <h2>⚙️ Pengaturan Toko & Bot</h2>
        <p>Hubungkan token bot dari @BotFather dan kelola branding toko Anda.</p>
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
      await loadBot(true);
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
        await loadBot(true);
      } catch (err) { toast(err.message, true); }
    };
  }

  if ($('#btnStopBot')) {
    $('#btnStopBot').onclick = async () => {
      try {
        await api('/api/reseller/bot/action', { method: 'POST', body: { action: 'stop' } });
        toast('Bot dihentikan.');
        await loadBot(true);
      } catch (err) { toast(err.message, true); }
    };
  }

  if ($('#btnStartBot')) {
    $('#btnStartBot').onclick = async () => {
      try {
        await api('/api/reseller/bot/action', { method: 'POST', body: { action: 'start' } });
        toast('Bot dijalankan!');
        await loadBot(true);
      } catch (err) { toast(err.message, true); }
    };
  }

  if (preserveScroll) {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
}

// ---------------------------------------------------------------------
// VIEW 3: KATALOG PRODUK & ATUR MARGIN (Identik dengan Dashboard Owner)
// ---------------------------------------------------------------------
async function loadPricing(preserveScroll = false, targetKey = null) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const [res, freshRes, customRes] = await Promise.all([
    api('/api/reseller/products'),
    api('/api/reseller/fresh-products').catch(() => ({ items: [] })),
    api('/api/reseller/custom-products').catch(() => ({ items: [] }))
  ]);
  state.products = res.items || [];
  state.freshProducts = freshRes.items || [];
  state.customProducts = customRes.items || [];
  state.canAddProducts = customRes.can_add_products !== undefined ? Boolean(customRes.can_add_products) : false;
  state.pendingPricing = {};
  updateSaveBar();

  renderPricingView();

  if (preserveScroll) {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
    if (targetKey) {
      setTimeout(() => {
        const el = $(`[data-product-card="${targetKey}"], [data-fresh-card="${targetKey}"], [data-custom-product-card="${targetKey}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
  }
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
  state.mainProductTab = state.mainProductTab || 'store';
  if (state.mainProductTab === 'store') {
    renderCustomProductView(searchFilter, statusFilter, categoryFilter);
  } else {
    renderProductCatalogView(searchFilter, statusFilter, categoryFilter);
  }
}

function renderCustomProductView(searchFilter = '', statusFilter = 'all', categoryFilter = '') {
  const q = (searchFilter !== '' ? searchFilter : ($('#customProductSearch')?.value || '')).toLowerCase().trim();
  const stFilter = statusFilter !== 'all' ? statusFilter : ($('#customProductStatus')?.value || 'all');
  const catFilter = categoryFilter !== '' ? categoryFilter : ($('#customProductCategory')?.value || '');

  const filtered = (state.customProducts || []).filter(p => {
    const matchSearch = !q || [p.name, p.code, p.display_code, p.category, p.tag].some(x => String(x || '').toLowerCase().includes(q)) || (p.variants || []).some(v => String(v.name || '').toLowerCase().includes(q));
    const matchCat = !catFilter || p.category === catFilter;
    if (!matchSearch || !matchCat) return false;
    if (stFilter === '1' || stFilter === 'enabled') return p.active !== 0;
    if (stFilter === '0' || stFilter === 'disabled') return p.active === 0;
    return true;
  });

  const toolbarHtml = `
    <div class="toolbar product-toolbar">
      <div class="searchbox"><input id="customProductSearch" placeholder="Cari nama produk toko, kode, atau varian..." value="${esc(q)}" /></div>
      <select id="customProductCategory">
        <option value="">Semua Kategori</option>
        ${categories(state.customProducts || [])}
      </select>
      <select id="customProductStatus">
        <option value="all" ${stFilter === 'all' ? 'selected' : ''}>Semua Status</option>
        <option value="1" ${stFilter === '1' || stFilter === 'enabled' ? 'selected' : ''}>Hanya Aktif</option>
        <option value="0" ${stFilter === '0' || stFilter === 'disabled' ? 'selected' : ''}>Hanya Nonaktif</option>
      </select>
    </div>
  `;

  const emptyNote = state.canAddProducts
    ? 'Anda dapat menambahkan produk digital sendiri dengan menekan tombol <b>＋ Tambah Produk</b> di atas.'
    : 'Fitur penambahan produk toko sendiri saat ini belum diaktifkan oleh Owner.';

  const gridHtml = filtered.length
    ? filtered.map((p, idx) => customProductCard(p, idx)).join('')
    : `<div class="empty-product">
        <h3>${(state.customProducts || []).length ? 'Tidak ada produk yang cocok' : 'Belum Ada Produk Toko'}</h3>
        <p>${(state.customProducts || []).length ? 'Coba ubah kata kunci pencarian atau filter status.' : emptyNote}</p>
      </div>`;

  const existingGrid = $('#customProductGrid');
  const renderedMainView = $('#content')?.dataset?.mainProductView;
  if (existingGrid && renderedMainView === 'store') {
    existingGrid.innerHTML = gridHtml;
    bindCustomProductActions();
    return;
  }

  const contentEl = $('#content');
  if (contentEl) {
    contentEl.dataset.mainProductView = 'store';
    delete contentEl.dataset.activeProductTab;
  }

  const addBtnHtml = state.canAddProducts
    ? '<button id="addCustomProduct" class="neo-btn purple">＋ Tambah Produk</button>'
    : '<button id="addCustomProductDisabled" class="neo-btn white small" style="opacity:0.6;cursor:not-allowed;" title="Fitur tambah produk dinonaktifkan oleh Owner">🔒 Tambah Produk Nonaktif</button>';

  const disabledBannerHtml = !state.canAddProducts ? `
    <div class="info-note" style="margin-bottom:14px;background:#fff1f2;border-color:#f43f5e;color:#881337;">
      <b>🔒 Fitur Tambah Produk Toko Nonaktif:</b> Owner belum mengaktifkan izin bagi reseller untuk menambahkan produk toko sendiri. Hubungi Owner jika Anda membutuhkan penambahan produk baru. Anda tetap dapat mengaktifkan & menjual produk dari katalog owner pada tab <b>📦 Produk Reseller</b>.
    </div>
  ` : '';

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>🏬 Produk Toko</h2>
        <p>Tambah dan kelola produk digital toko Anda sendiri, varian, harga jual, SNK, dan stok penjualan bot Anda.</p>
      </div>
      <span>
        ${addBtnHtml}
      </span>
    </div>

    <div class="tabs main-product-tabs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <button class="tab-btn active" data-main-product-tab="store" style="width:100%;text-align:center;padding:12px 10px;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;">🏬 Produk Toko (${(state.customProducts || []).length})</button>
      <button class="tab-btn" data-main-product-tab="reseller" style="width:100%;text-align:center;padding:12px 10px;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;">📦 Produk Reseller (${(state.products || []).length + (state.freshProducts || []).length})</button>
    </div>

    ${disabledBannerHtml}

    ${toolbarHtml}

    <div id="customProductGrid" class="product-grid">
      ${gridHtml}
    </div>
  `;

  if (catFilter && $('#customProductCategory')) {
    $('#customProductCategory').value = catFilter;
  }

  const onFilter = () => renderCustomProductView();
  if ($('#customProductSearch')) $('#customProductSearch').oninput = onFilter;
  if ($('#customProductCategory')) $('#customProductCategory').onchange = onFilter;
  if ($('#customProductStatus')) $('#customProductStatus').onchange = onFilter;
  if ($('#addCustomProduct')) $('#addCustomProduct').onclick = () => openCustomProduct();
  if ($('#addCustomProductDisabled')) $('#addCustomProductDisabled').onclick = () => toast('Fitur tambah produk toko sendiri sedang dinonaktifkan oleh Owner.', true);

  $$('[data-main-product-tab]').forEach(btn => {
    btn.onclick = () => {
      state.mainProductTab = btn.dataset.mainProductTab;
      renderPricingView();
    };
  });

  bindCustomProductActions();
}

function customProductCard(p, idx = 0) {
  const vars = (p.variants || []).filter(v => v.active);
  const chips = vars.slice(0, 3).map(variantChip).join('') + (vars.length > 3 ? `<span class="variant-chip muted">+${vars.length - 3} VARIAN</span>` : '');
  const allVariants = Array.isArray(p.variants) ? p.variants : [];
  const price = allVariants.length && !vars.length ? 'Tidak ada varian aktif' : p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)} - ${money(p.price_max)}`;
  const icon = ['💎', '🤖', '🎨', '🎬', '🛍️'][idx % 5];
  const thumb = `<span class="thumb-fallback">${icon}</span>${p.image_url ? `<img src="${esc(mediaSrc(p.image_url))}" alt="${esc(p.name || 'Produk')}" loading="lazy" onerror="this.remove()">` : ''}`;
  const stockState = productStockState(p);
  const stockNumber = Number(p.sale_stock ?? p.stock ?? 0);
  const stockText = stockStateLabel(stockState, stockNumber);
  const defaultChipLabel = `DEFAULT · ${stockState === 'ready' ? `Ready ${stockNumber}` : stockState === 'preorder' ? 'PO' : 'Habis'}`;
  const variantSummary = allVariants.length ? (chips || '<span class="variant-chip muted">Tidak ada varian aktif</span>') : `<span class="variant-chip stock-${stockState}">${esc(defaultChipLabel)}</span>`;

  return `
    <article class="product-card stock-${stockState}" data-custom-product-card="${p.id}">
      <span class="product-index">${String(idx + 1).padStart(2, '0')}</span>
      <div class="product-thumb">${thumb}</div>
      <div class="product-body">
        <div class="product-head">
          <div class="product-title">
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.subtitle || p.category || 'Produk Digital')}</p>
            ${p.tag ? `<span class="tag-chip"># ${esc(String(p.tag).replace(/^#/, '').toUpperCase())}</span>` : ''}
            <span class="tag-chip" style="background:rgba(123,227,20,0.15);color:#7be314;border-color:#7be314"># PRODUK TOKO</span>
          </div>
          <div class="product-head-actions">
            <span class="stock-state-pill ${stockState}">${stockText}</span>
            <button class="toggle ${p.active ? '' : 'off'}" data-toggle-custom-product="${p.id}" data-active="${p.active ? 1 : 0}">
              ${p.active ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div class="product-info">
          <div class="info-box stock-box ${stockState}">
            <small>📦 Stok</small>
            <strong>${stockState === 'preorder' ? 'PO' : stockNumber}</strong>
            <em>${stockState === 'ready' ? 'Ready stok' : stockState === 'preorder' ? 'Pre-order' : 'Stok habis'}</em>
          </div>
          <div class="info-box price">
            <small>🏷 Harga</small>
            <strong>${price}</strong>
            ${bulkTiers(p.bulk_prices).length ? `<em>Bulk mulai ${bulkTiers(p.bulk_prices)[0].min_qty} pcs</em>` : (Number(p.cost || 0) > 0 ? `<em>Modal: ${money(p.cost)}</em>` : '')}
          </div>
        </div>
        <div class="variant-row">${variantSummary}</div>
        <div class="product-actions">
          <button class="neo-btn blue small" data-edit-custom-product="${p.id}">✎ EDIT</button>
          <button class="neo-btn green small" data-stock-custom-product="${p.id}">📦 STOK</button>
          <button class="neo-btn yellow small" data-manage-custom-product="${p.id}">⚙ KELOLA</button>
          <button class="neo-btn red small" data-delete-custom-product="${p.id}">🗑 HAPUS</button>
        </div>
      </div>
    </article>
  `;
}

function bindCustomProductActions() {
  $$('[data-edit-custom-product]').forEach(b => {
    b.onclick = () => openCustomProduct(findCustomProduct(b.dataset.editCustomProduct));
  });
  $$('[data-stock-custom-product]').forEach(b => {
    b.onclick = () => openCustomStock(findCustomProduct(b.dataset.stockCustomProduct));
  });
  $$('[data-manage-custom-product]').forEach(b => {
    b.onclick = () => openCustomManageProduct(findCustomProduct(b.dataset.manageCustomProduct));
  });
  $$('[data-delete-custom-product]').forEach(b => {
    b.onclick = () => remove(
      `/api/reseller/custom-products/${b.dataset.deleteCustomProduct}`,
      'Hapus produk toko beserta varian dan stoknya?',
      () => reloadCustomProducts()
    );
  });
  $$('[data-toggle-custom-product]').forEach(b => {
    b.onclick = async () => {
      try {
        await api(`/api/reseller/custom-products/${b.dataset.toggleCustomProduct}/toggle`, {
          method: 'POST',
          body: { active: b.dataset.active !== '1' }
        });
        toast('Status produk diperbarui');
        await reloadCustomProducts(b.dataset.toggleCustomProduct);
      } catch (e) {
        toast(e.message, true);
      }
    };
  });
}

function findCustomProduct(id) {
  return (state.customProducts || []).find(x => String(x.id) === String(id)) || {};
}

async function reloadCustomProducts(targetProductId = null) {
  const scrollY = window.scrollY;
  const searchVal = $('#customProductSearch')?.value || '';
  const catVal = $('#customProductCategory')?.value || '';
  const statusVal = $('#customProductStatus')?.value || '';
  const r = await api('/api/reseller/custom-products');
  state.customProducts = r.items || [];
  if (r.can_add_products !== undefined) {
    state.canAddProducts = Boolean(r.can_add_products);
  }
  if (state.view === 'pricing' && state.mainProductTab === 'store') {
    renderCustomProductView(searchVal, statusVal, catVal);
    if (targetProductId) {
      const targetCard = $(`[data-custom-product-card="${targetProductId}"]`);
      if (targetCard) targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      else window.scrollTo({ top: scrollY, behavior: 'instant' });
    } else {
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    }
  }
}

function customVariantEditorHtml(item) {
  if (!item.id) {
    return `<div class="variant-editor"><div class="variant-editor-head"><div><h3>Varian Produk</h3><p>Simpan produk terlebih dahulu, lalu buka Edit untuk menambahkan varian.</p></div></div></div>`;
  }
  const rows = (item.variants || []).map(v => {
    const st = v.delivery_mode === 'preorder' ? 'preorder' : Number(v.stock || 0) > 0 ? 'ready' : 'empty';
    const label = st === 'ready' ? `READY · ${Number(v.stock || 0)}` : st === 'preorder' ? 'PRE-ORDER' : 'HABIS';
    return `
      <div class="variant-edit-card stock-${st}">
        <div>
          <div class="variant-edit-title"><b>${esc(v.name)}</b><span class="stock-state-pill ${st}">${label}</span></div>
          <small>${money(v.price)}${Number(v.cost || 0) > 0 ? ` · modal ${money(v.cost)}` : ''} · stok ${v.stock}${bulkTiers(v.bulk_prices).length ? ` · ${bulkTiers(v.bulk_prices).length} tier bulk` : ''}</small>
          <p>${esc(v.description || 'Tanpa deskripsi varian')}</p>
        </div>
        <div class="actions">
          <button type="button" class="neo-btn yellow small" data-edit-custom-variant="${v.id}">Edit</button>
          <button type="button" class="neo-btn red small" data-delete-custom-variant="${v.id}">Hapus</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty compact">Belum ada varian. Produk memakai data default.</div>';

  return `
    <div class="variant-editor">
      <div class="variant-editor-head">
        <div>
          <h3>Varian Produk</h3>
          <p>Setiap varian dapat memiliki harga jual, modal, harga bulk, deskripsi, dan SNK sendiri.</p>
        </div>
        <button type="button" id="addCustomVariant" class="neo-btn purple small">＋ Tambah Varian</button>
      </div>
      <div class="variant-edit-list">${rows}</div>
    </div>
  `;
}

function openCustomProduct(item = {}) {
  const edit = !!item.id;
  if (!edit && !state.canAddProducts) {
    return toast('Fitur tambah produk toko sendiri sedang dinonaktifkan oleh Owner.', true);
  }
  const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
  const defaultSettings = hasVariants ?
    `<div class="full info-note variant-default-hidden-note"><b>Produk memakai varian.</b><br>Harga, modal, harga bulk, mode pengiriman, dan stok Default disembunyikan. Atur seluruh nilai jual melalui masing-masing varian agar tidak ada dua sumber konfigurasi.</div>` :
    `<label>Harga Jual Default<input name="price" type="number" min="0" value="${Number(item.price || 0)}" required></label>
     <label>Modal Default (Opsional)<input name="cost" type="number" min="0" value="${Number(item.cost || 0)}"><small class="muted">Untuk perhitungan profit bersih Anda</small></label>
     ${bulkEditorHtml('customProductBulk', item.bulk_prices || [])}
     <label>Mode Pengiriman<select name="delivery_mode">
       <option value="auto" ${item.delivery_mode !== 'preorder' ? 'selected' : ''}>AUTO (Ambil dari stok)</option>
       <option value="preorder" ${item.delivery_mode === 'preorder' ? 'selected' : ''}>PRE-ORDER</option>
     </select></label>`;

  modal(edit ? 'Edit Produk Toko' : 'Tambah Produk Toko', `
    <div class="form-grid product-form">
      <label>Kode Produk<input name="code" required value="${esc(item.display_code || item.code || '')}" placeholder="Contoh: VIP1"></label>
      <label>Nama Produk<input name="name" required value="${esc(item.name || '')}" placeholder="Contoh: Akun Canva Pro"></label>
      <label>Kategori<input name="category" value="${esc(item.category || '')}" placeholder="Contoh: Desain"></label>
      <label>Subtitle<input name="subtitle" value="${esc(item.subtitle || '')}" placeholder="Contoh: Private Akun"></label>
      <label>Tag<input name="tag" value="${esc(item.tag || '')}" placeholder="Contoh: BESTSELLER"></label>
      <label class="full">Gambar Produk (disimpan di VPS)
        <div class="media-uploader">
          <input id="customProductImageFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
          <button type="button" id="uploadCustomProductImage" class="neo-btn blue small">Upload Gambar</button>
          <button type="button" id="clearCustomProductImage" class="neo-btn white small">Hapus</button>
        </div>
        <input type="hidden" name="image_url" id="customProductImageValue" value="${esc(item.image_url || '')}">
        <div id="customProductImagePreview" class="media-preview">${item.image_url ? `<img src="${esc(mediaSrc(item.image_url))}" alt="Preview">` : 'Belum ada gambar.'}</div>
      </label>
      ${defaultSettings}
      <label>Status Toko<select name="active">
        <option value="true" ${item.active !== 0 ? 'selected' : ''}>Aktif</option>
        <option value="false" ${item.active === 0 ? 'selected' : ''}>Nonaktif</option>
      </select></label>
      <label class="full">Deskripsi Produk<textarea name="description" rows="5" placeholder="Deskripsi lengkap produk...">${esc(item.description || '')}</textarea></label>
      <label class="full">Syarat & Ketentuan (SNK)<textarea name="terms" rows="5" placeholder="Syarat garansi, aturan klaim, dsb...">${esc(item.terms || '')}</textarea></label>
    </div>
    ${customVariantEditorHtml(item)}
  `, async b => {
    if (!hasVariants) {
      ['price', 'cost'].forEach(k => b[k] = Number(b[k] || 0));
      b.bulk_prices = bulkTiers(b.bulk_prices);
    } else {
      delete b.price;
      delete b.cost;
      delete b.bulk_prices;
      delete b.delivery_mode;
    }
    b.active = b.active === 'true';
    const saved = await api(edit ? `/api/reseller/custom-products/${item.id}` : '/api/reseller/custom-products', {
      method: edit ? 'PATCH' : 'POST',
      body: b
    });
    toast(edit ? 'Produk diperbarui' : 'Produk dibuat. Buka Edit untuk menambahkan varian.');
    const pid = edit ? item.id : (saved?.item?.id || saved?.id);
    await reloadCustomProducts(pid);
  });

  if (!hasVariants) bindBulkEditor('customProductBulk', item.bulk_prices || []);

  const uploadImgBtn = $('#uploadCustomProductImage');
  if (uploadImgBtn) {
    uploadImgBtn.onclick = async () => {
      try {
        const file = $('#customProductImageFile').files?.[0];
        if (!file) return toast('Pilih file gambar terlebih dahulu.', true);
        uploadImgBtn.disabled = true;
        uploadImgBtn.textContent = 'Mengupload...';
        const r = await uploadMedia(file, 'product');
        $('#customProductImageValue').value = r.item.key;
        $('#customProductImagePreview').innerHTML = `<img src="${esc(mediaSrc(r.item.key))}" alt="Preview"><small>${esc(r.item.filename || 'Tersimpan di VPS')}</small>`;
        if (edit) {
          await api(`/api/reseller/custom-products/${item.id}`, { method: 'PATCH', body: { image_url: r.item.key } });
          item.image_url = r.item.key;
          const cached = findCustomProduct(item.id);
          if (cached) cached.image_url = r.item.key;
          toast('Gambar tersimpan dan langsung dipasang ke produk');
        } else {
          toast('Gambar tersimpan. Tekan Simpan untuk memasang ke produk baru.');
        }
      } catch (e) {
        toast(e.message, true);
      } finally {
        uploadImgBtn.disabled = false;
        uploadImgBtn.textContent = 'Upload Gambar';
      }
    };
  }

  const clearImgBtn = $('#clearCustomProductImage');
  if (clearImgBtn) {
    clearImgBtn.onclick = async () => {
      try {
        $('#customProductImageValue').value = '';
        $('#customProductImagePreview').textContent = 'Belum ada gambar.';
        if (edit) {
          await api(`/api/reseller/custom-products/${item.id}`, { method: 'PATCH', body: { image_url: '' } });
          item.image_url = '';
          const cached = findCustomProduct(item.id);
          if (cached) cached.image_url = '';
          toast('Gambar produk dihapus');
        }
      } catch (e) {
        toast(e.message, true);
      }
    };
  }

  if (edit) {
    const current = findCustomProduct(item.id) || item;
    const add = $('#addCustomVariant');
    if (add) add.onclick = () => openCustomVariant(findCustomProduct(item.id) || current);
    $$('[data-edit-custom-variant]').forEach(b => b.onclick = () => {
      const curProd = findCustomProduct(item.id) || current;
      const targetVar = (curProd.variants || []).find(v => String(v.id) === b.dataset.editCustomVariant);
      openCustomVariant(curProd, targetVar);
    });
    $$('[data-delete-custom-variant]').forEach(b => b.onclick = async () => {
      if (!confirm('Hapus varian ini?')) return;
      try {
        await api(`/api/reseller/custom-variants/${b.dataset.deleteCustomVariant}`, { method: 'DELETE' });
        toast('Varian dihapus');
        await reloadCustomProducts(item.id);
        openCustomProduct(findCustomProduct(item.id) || item);
      } catch (e) {
        toast(e.message, true);
      }
    });
  }
}

function openCustomVariant(p, v = {}) {
  const edit = !!v.id;
  const parentId = p.id;
  const titleHtml = `<button type="button" class="back-modal-btn" id="backToCustomProductModal" title="Kembali ke Produk">←</button> ${(edit ? 'Edit' : 'Tambah') + ' Varian · ' + esc(p.name)}`;
  modal(titleHtml, `
    <div class="form-grid">
      <label>Nama Varian<input name="name" required value="${esc(v.name || '')}" placeholder="Contoh: 1 Bulan"></label>
      <label>Key / SKU<input name="variant_key" value="${esc(v.variant_key || '')}" placeholder="Contoh: 1M"></label>
      <label>Harga Jual<input name="price" type="number" min="0" value="${Number(v.price ?? p.price ?? 0)}" required></label>
      <label>Modal (Opsional)<input name="cost" type="number" min="0" value="${Number(v.cost ?? p.cost ?? 0)}"></label>
      ${bulkEditorHtml('customVariantBulk', v.bulk_prices || [])}
      <label>Mode Pengiriman<select name="delivery_mode">
        <option value="auto" ${v.delivery_mode !== 'preorder' ? 'selected' : ''}>AUTO (Ambil dari stok)</option>
        <option value="preorder" ${v.delivery_mode === 'preorder' ? 'selected' : ''}>PRE-ORDER</option>
      </select></label>
      <label>Status Toko<select name="active">
        <option value="true" ${v.active !== 0 ? 'selected' : ''}>Aktif</option>
        <option value="false" ${v.active === 0 ? 'selected' : ''}>Nonaktif</option>
      </select></label>
      <label class="full">Deskripsi Varian<textarea name="description" rows="4" placeholder="Deskripsi varian...">${esc(v.description || '')}</textarea></label>
      <label class="full">SNK Varian<textarea name="terms" rows="4" placeholder="SNK varian...">${esc(v.terms || '')}</textarea></label>
    </div>
  `, async b => {
    ['price', 'cost'].forEach(k => b[k] = Number(b[k] || 0));
    b.bulk_prices = bulkTiers(b.bulk_prices);
    b.active = b.active === 'true';
    await api(edit ? `/api/reseller/custom-variants/${v.id}` : `/api/reseller/custom-products/${parentId}/variants`, {
      method: edit ? 'PATCH' : 'POST',
      body: b
    });
    toast(edit ? 'Varian berhasil diperbarui' : 'Varian baru ditambahkan');
    await reloadCustomProducts(parentId);
    openCustomProduct(findCustomProduct(parentId) || p);
    return false;
  }, {
    submit: edit ? 'Simpan Varian' : '＋ Tambah Varian',
    onCancel: () => { openCustomProduct(findCustomProduct(parentId) || p); return false; }
  });

  const backBtn = $('#backToCustomProductModal');
  if (backBtn) backBtn.onclick = () => openCustomProduct(findCustomProduct(parentId) || p);
  bindBulkEditor('customVariantBulk', v.bulk_prices || []);
}

function openCustomStock(p) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const targets = variants.length
    ? variants.map(v => ({ id: String(v.id), name: v.name, stock: Number(v.stock || 0) }))
    : [{ id: '', name: 'Stok Default', stock: Number(p.stock || 0) }];
  const variantOpts = targets.map(t => `<option value="${esc(t.id)}">${esc(t.name)} · ${t.stock} ready</option>`).join('');
  const cards = targets.map(t => `<div class="stock-target-card"><span>📦</span><div><b>${esc(t.name)}</b><small>${t.stock} stok ready</small></div></div>`).join('');

  modal('Tambah Stok · ' + p.name, `
    <div class="stock-add-layout">
      <div class="stock-target-grid">${cards}</div>
      <div class="form-grid">
        <label class="full">Target Stok<select name="variant_id" id="addCustomStockVariant">${variantOpts}</select></label>
        <label class="full">Data Stok<textarea name="text" id="addCustomStockText" rows="13" placeholder="Satu akun / kode / data produk per baris"></textarea></label>
        <div class="full stock-input-summary">
          <span>Item yang akan ditambahkan</span>
          <b id="addCustomStockCount">0</b>
        </div>
      </div>
      <div class="info-note">${variants.length ? 'Produk ini memakai varian, sehingga stok Default tidak digunakan. ' : ''}Baris kosong otomatis diabaikan. Setiap baris mewakili 1 item stok yang akan dikirim otomatis ke pembeli.</div>
    </div>
  `, async b => {
    const lines = String(b.text || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Masukkan minimal 1 data stok.');
    await api(`/api/reseller/custom-products/${p.id}/stock`, {
      method: 'POST',
      body: { variant_id: b.variant_id ? Number(b.variant_id) : null, mode: 'add', items: lines }
    });
    toast(`${lines.length} stok ditambahkan`);
    await reloadCustomProducts(p.id);
  }, { submit: '＋ Tambah Stok' });

  const ta = $('#addCustomStockText'), count = $('#addCustomStockCount');
  const recount = () => {
    if (count) count.textContent = String(ta ? String(ta.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean).length : 0);
  };
  if (ta) ta.oninput = recount;
  recount();
}

async function openCustomManageProduct(p) {
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const targets = variants.length ? variants : [{ id: '', name: 'Stok Default' }];
  const options = targets.map(v => `<option value="${esc(v.id || '')}">${esc(v.name)}</option>`).join('');

  modal('Kelola Stok · ' + p.name, `
    <div class="stock-manager">
      <div class="stock-manager-controls">
        <label>Target Stok<select id="manageCustomStockVariant">${options}</select></label>
        <label>Status<select id="manageCustomStockStatus"><option value="available">Ready</option><option value="sold">Terjual</option><option value="">Semua</option></select></label>
      </div>
      <div id="customStockManagerSummary" class="stock-summary"></div>
      <div id="customStockManagerList" class="stock-manager-list"><div class="empty compact">Memuat stok...</div></div>
    </div>
  `, async () => {}, { hideSubmit: true, noSubmit: true, cancelText: 'Tutup', onCancel: () => reloadCustomProducts(p.id) });

  const load = async () => {
    const vid = $('#manageCustomStockVariant').value;
    const status = $('#manageCustomStockStatus').value;
    try {
      const r = await api(`/api/reseller/custom-products/${p.id}/stock?variant_id=${encodeURIComponent(vid)}&status=${encodeURIComponent(status)}&limit=2000`);
      $('#customStockManagerSummary').innerHTML = `<b>${r.items.length}</b> item ditampilkan · <b>${r.count}</b> stok ready`;
      $('#customStockManagerList').innerHTML = r.items.length ? r.items.map((x, i) => `
        <div class="stock-item-card">
          <div class="stock-item-head"><span>#${i + 1} · ID ${x.id}</span>${badge(x.status)}</div>
          <textarea data-stock-value="${x.id}" ${x.status !== 'available' ? 'disabled' : ''}>${esc(x.value)}</textarea>
          <div class="stock-item-meta"><span>${esc(date(x.created_at))}</span>${x.order_ref ? `<span>Order ${esc(x.order_ref)}</span>` : ''}</div>
          ${x.status === 'available' ? `<div class="actions"><button type="button" class="neo-btn blue small" data-save-stock="${x.id}">Simpan Edit</button><button type="button" class="neo-btn red small" data-delete-stock="${x.id}">Hapus</button></div>` : ''}
        </div>
      `).join('') : '<div class="empty compact">Tidak ada stok pada target ini.</div>';

      $$('[data-save-stock]').forEach(b => b.onclick = async () => {
        try {
          const val = $(`[data-stock-value="${b.dataset.saveStock}"]`).value;
          await api(`/api/reseller/custom-stock/${b.dataset.saveStock}`, { method: 'PATCH', body: { value: val } });
          toast('Stok diperbarui');
          await load();
          await reloadCustomProducts(p.id);
        } catch (e) {
          toast(e.message, true);
        }
      });
      $$('[data-delete-stock]').forEach(b => b.onclick = async () => {
        if (!confirm('Hapus stok ini?')) return;
        try {
          await api(`/api/reseller/custom-stock/${b.dataset.deleteStock}`, { method: 'DELETE' });
          toast('Stok dihapus');
          await load();
          await reloadCustomProducts(p.id);
        } catch (e) {
          toast(e.message, true);
        }
      });
    } catch (e) {
      $('#customStockManagerList').innerHTML = `<div class="empty compact">${esc(e.message)}</div>`;
    }
  };

  $('#manageCustomStockVariant').onchange = load;
  $('#manageCustomStockStatus').onchange = load;
  await load();
}

function renderProductCatalogView(searchFilter = '', statusFilter = 'all', categoryFilter = '') {
  const activeTab = state.productTab || 'regular';
  const existingGrid = $('#productGrid');
  const renderedMainView = $('#content')?.dataset?.mainProductView;
  const renderedTab = $('#content')?.dataset?.activeProductTab;

  const q = (searchFilter !== '' ? searchFilter : ($('#productSearch')?.value || '')).toLowerCase().trim();
  const stFilter = statusFilter !== 'all' ? statusFilter : ($('#productStatus')?.value || 'all');
  const catFilter = categoryFilter !== '' ? categoryFilter : ($('#productCategory')?.value || '');

  let toolbarHtml = '';
  let gridHtml = '';

  if (activeTab === 'regular') {
    const filtered = state.products.filter(p => {
      const matchSearch = !q || [p.name, p.code, p.category, p.tag].some(x => String(x || '').toLowerCase().includes(q)) || (p.variants || []).some(v => v.name.toLowerCase().includes(q));
      const matchCat = !catFilter || p.category === catFilter;
      const isEnabled = state.pendingPricing[p.code]?.enabled !== undefined ? state.pendingPricing[p.code].enabled : p.enabled;
      if (!matchSearch || !matchCat) return false;
      if (stFilter === 'enabled' || stFilter === '1') return isEnabled;
      if (stFilter === 'disabled' || stFilter === '0') return !isEnabled;
      return true;
    });

    toolbarHtml = `
      <div class="toolbar product-toolbar">
        <div class="searchbox"><input id="productSearch" placeholder="Cari nama produk, kode, atau varian..." value="${esc(q)}" /></div>
        <select id="productCategory">
          <option value="">Semua Kategori</option>
          ${categories(state.products)}
        </select>
        <select id="productStatus">
          <option value="all" ${stFilter === 'all' ? 'selected' : ''}>Semua Status</option>
          <option value="enabled" ${stFilter === 'enabled' || stFilter === '1' ? 'selected' : ''}>Hanya Aktif</option>
          <option value="disabled" ${stFilter === 'disabled' || stFilter === '0' ? 'selected' : ''}>Hanya Nonaktif</option>
        </select>
      </div>
    `;

    gridHtml = filtered.length
      ? filtered.map((p, idx) => renderRegularProductCard(p, idx)).join('')
      : '<div class="empty-product"><h3>Belum ada produk reguler</h3><p>Tidak ada produk yang cocok dengan pencarian.</p></div>';
  } else {
    const filtered = state.freshProducts.filter(r => {
      const matchSearch = !q || [r.name, r.product_key].some(x => String(x || '').toLowerCase().includes(q));
      const isEnabled = state.pendingPricing[`FRESH:${r.product_key}`]?.enabled !== undefined ? state.pendingPricing[`FRESH:${r.product_key}`].enabled : r.enabled;
      if (!matchSearch) return false;
      if (stFilter === 'enabled' || stFilter === '1') return isEnabled;
      if (stFilter === 'disabled' || stFilter === '0') return !isEnabled;
      return true;
    });

    toolbarHtml = `
      <div class="toolbar product-toolbar">
        <div class="searchbox"><input id="productSearch" placeholder="Cari nama atau key produk fresh..." value="${esc(q)}" /></div>
        <select id="productStatus">
          <option value="all" ${stFilter === 'all' ? 'selected' : ''}>Semua Status</option>
          <option value="enabled" ${stFilter === 'enabled' || stFilter === '1' ? 'selected' : ''}>Hanya Aktif</option>
          <option value="disabled" ${stFilter === 'disabled' || stFilter === '0' ? 'selected' : ''}>Hanya Nonaktif</option>
        </select>
      </div>
    `;

    gridHtml = filtered.length
      ? filtered.map((r, idx) => renderFreshProductCard(r, idx)).join('')
      : '<div class="empty-product"><h3>Belum ada produk fresh</h3><p>Tidak ada produk fresh yang cocok dengan pencarian.</p></div>';
  }

  // In-place update if shell and active tab already exist
  if (existingGrid && renderedMainView === 'reseller' && renderedTab === activeTab) {
    existingGrid.innerHTML = gridHtml;
    bindCatalogActions();
    return;
  }

  const contentEl = $('#content');
  if (contentEl) {
    contentEl.dataset.mainProductView = 'reseller';
    contentEl.dataset.activeProductTab = activeTab;
  }
  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>📦 Produk Reseller</h2>
        <p>Katalog produk dari toko owner. Sesuaikan margin keuntungan dan aktifkan produk yang ingin dijual di bot Anda.</p>
      </div>
      <span></span>
    </div>

    <div class="tabs main-product-tabs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <button class="tab-btn" data-main-product-tab="store" style="width:100%;text-align:center;padding:12px 10px;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;">🏬 Produk Toko (${(state.customProducts || []).length})</button>
      <button class="tab-btn active" data-main-product-tab="reseller" style="width:100%;text-align:center;padding:12px 10px;font-size:14px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px;">📦 Produk Reseller (${(state.products || []).length + (state.freshProducts || []).length})</button>
    </div>

    <div class="tabs product-tabs" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">
      <button class="tab-btn ${activeTab === 'regular' ? 'active' : ''}" data-product-tab="regular" style="width:100%;text-align:center;padding:10px 8px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">📦 Daftar Produk (${state.products.length})</button>
      <button class="tab-btn ${activeTab === 'fresh' ? 'active' : ''}" data-product-tab="fresh" style="width:100%;text-align:center;padding:10px 8px;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">⚡ Produk Fresh (${state.freshProducts.length})</button>
    </div>

    ${toolbarHtml}

    <div id="productGrid" class="product-grid">
      ${gridHtml}
    </div>
  `;

  if (activeTab === 'regular' && catFilter && $('#productCategory')) {
    $('#productCategory').value = catFilter;
  }

  // Filter events
  const onFilter = () => renderProductCatalogView();
  if ($('#productSearch')) $('#productSearch').oninput = onFilter;
  if ($('#productCategory')) $('#productCategory').onchange = onFilter;
  if ($('#productStatus')) $('#productStatus').onchange = onFilter;

  // Sub-tabs
  $$('[data-product-tab]').forEach(btn => {
    btn.onclick = () => {
      state.productTab = btn.dataset.productTab;
      renderProductCatalogView();
    };
  });

  // Main tabs
  $$('[data-main-product-tab]').forEach(btn => {
    btn.onclick = () => {
      state.mainProductTab = btn.dataset.mainProductTab;
      renderPricingView();
    };
  });

  bindCatalogActions();
}

function renderRegularProductCard(p, idx = 0) {
  const vars = (p.variants || []).filter(v => v.active);
  const chips = vars.slice(0, 3).map(variantChip).join('') + (vars.length > 3 ? `<span class="variant-chip muted">+${vars.length - 3} VARIAN</span>` : '');
  const allVariants = Array.isArray(p.variants) ? p.variants : [];
  
  const price = allVariants.length && !vars.length ? 'Tidak ada varian aktif' : p.price_min === p.price_max ? money(p.price_min) : `${money(p.price_min)} - ${money(p.price_max)}`;
  const ownerPrice = allVariants.length && !vars.length ? '-' : p.owner_price_min === p.owner_price_max ? money(p.owner_price_min) : `${money(p.owner_price_min)} - ${money(p.owner_price_max)}`;
  
  const icon = ['📦', '⚡', '📱', '🎮', '💎'][idx % 5];
  const thumb = `<span class="thumb-fallback">${icon}</span>${p.image_url ? `<img src="${esc(mediaSrc(p.image_url))}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">` : ''}`;
  const stockState = productStockState(p);
  const stockNumber = Number(p.sale_stock ?? p.stock ?? 0);
  const stockText = stockStateLabel(stockState, stockNumber);
  const variantSummary = allVariants.length ? (chips || '<span class="variant-chip muted">Tidak ada varian aktif</span>') : `<span class="variant-chip stock-${stockState}">DEFAULT · ${stockText}</span>`;

  const isEnabled = state.pendingPricing[p.code]?.enabled !== undefined ? state.pendingPricing[p.code].enabled : p.enabled;

  return `
    <article class="product-card stock-${stockState} ${isEnabled ? '' : 'stock-empty'}" data-product-card="${esc(p.code)}">
      <span class="product-index">${String(idx + 1).padStart(2, '0')}</span>
      <div class="product-thumb">${thumb}</div>
      <div class="product-body">
        <div class="product-head">
          <div class="product-title">
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.subtitle || p.category || 'Produk Digital')}</p>
            ${p.tag ? `<span class="tag-chip"># ${esc(String(p.tag).replace(/^#/, '').toUpperCase())}</span>` : ''}
          </div>
          <div class="product-head-actions">
            <span class="stock-state-pill ${stockState}">${stockText}</span>
            <button class="toggle ${isEnabled ? '' : 'off'}" data-toggle-product="${esc(p.code)}" data-active="${isEnabled ? 1 : 0}">
              ${isEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div class="product-info">
          <div class="info-box stock-box ${stockState}">
            <small>📦 Stok</small>
            <strong>${stockState === 'preorder' ? 'PO' : stockNumber}</strong>
            <em>${stockState === 'ready' ? 'Ready stok' : stockState === 'preorder' ? 'Pre-order' : 'Stok habis'}</em>
          </div>
          <div class="info-box price">
            <small>🏷 Harga Jual</small>
            <strong>${price}</strong>
            <em>Modal Owner: ${ownerPrice}</em>
          </div>
        </div>
        <div class="variant-row">${variantSummary}</div>
        <div class="product-actions">
          <button class="neo-btn blue small" data-edit-product="${esc(p.code)}">✎ EDIT</button>
        </div>
      </div>
    </article>
  `;
}

function renderFreshProductCard(r, idx = 0) {
  const p = r.presentation || {};
  const isEnabled = state.pendingPricing[`FRESH:${r.product_key}`]?.enabled !== undefined ? state.pendingPricing[`FRESH:${r.product_key}`].enabled : r.enabled;
  const readyCount = Math.max(0, Number(r.ready_stock_count || 0));
  const cardState = readyCount > 0 ? 'ready' : (isEnabled ? 'preorder' : 'empty');
  const cardStatePill = readyCount > 0 ? `Ready ${readyCount}` : (isEnabled ? 'GEN ON' : (!r.available ? 'API OFF' : 'NONAKTIF'));

  const emoji = p.emoji || freshProductEmoji(r.product_key);
  const thumb = `<span class="thumb-fallback">${emoji}</span>${p.image_url ? `<img src="${esc(mediaSrc(p.image_url))}" alt="${esc(r.name || r.product_key)}" loading="lazy" onerror="this.remove()">` : ''}`;

  const sellRange = r.reseller_price_min === r.reseller_price_max ? money(r.reseller_price_min) : `${money(r.reseller_price_min)} – ${money(r.reseller_price_max)}`;
  const ownerRange = r.owner_price_min === r.owner_price_max ? money(r.owner_price_min) : `${money(r.owner_price_min)} – ${money(r.owner_price_max)}`;

  const priceRows = Array.isArray(r.price_options) ? r.price_options : [];
  const modes = Array.isArray(r.options?.mode?.pilihan) ? r.options.mode.pilihan.map(String) : [];

  const chips = [];
  if (modes.length) {
    chips.push(...modes.slice(0, 3).map(m => `<span class="variant-chip">${esc(p.mode_labels?.[m] || m)}</span>`));
    if (modes.length > 3) chips.push(`<span class="variant-chip muted">+${modes.length - 3} Mode</span>`);
  }
  if (priceRows.length > 1) {
    chips.push(`<span class="variant-chip stock-ready">${priceRows.length} Opsi Harga</span>`);
  }
  if (readyCount > 0) {
    chips.push(`<span class="variant-chip stock-ready">Ready Toko: ${readyCount}</span>`);
  }

  return `
    <article class="product-card stock-${cardState} ${isEnabled ? '' : 'stock-empty'}" data-fresh-card="${esc(r.product_key)}">
      <span class="product-index">${String(idx + 1).padStart(2, '0')}</span>
      <div class="product-thumb">${thumb}</div>
      <div class="product-body">
        <div class="product-head">
          <div class="product-title">
            <h3>${esc(r.name || r.product_key)}</h3>
            <p>Key: <code>${esc(r.product_key)}</code> · ${priceRows.length || 1} Opsi Harga</p>
            <span class="tag-chip"># FRESH BOT</span>
          </div>
          <div class="product-head-actions">
            <span class="stock-state-pill ${cardState}">${cardStatePill}</span>
            <button class="toggle ${isEnabled ? '' : 'off'}" data-toggle-fresh="${esc(r.product_key)}" data-active="${isEnabled ? 1 : 0}">
              ${isEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
        <div class="product-info">
          <div class="info-box stock-box ${cardState}">
            <small>📦 Stok</small>
            <strong>${readyCount > 0 ? readyCount : 'GEN'}</strong>
            <em>${readyCount > 0 ? 'Ready toko' : 'Generate API'}</em>
          </div>
          <div class="info-box price">
            <small>🏷 Harga Jual</small>
            <strong>${sellRange}</strong>
            <em>Modal Owner: ${ownerRange}</em>
          </div>
        </div>
        <div class="variant-row">${chips.length ? chips.join('') : '<span class="variant-chip muted">Auto Generate</span>'}</div>
        <div class="product-actions">
          <button class="neo-btn blue small" data-edit-fresh="${esc(r.product_key)}">✎ EDIT</button>
        </div>
      </div>
    </article>
  `;
}

function bindCatalogActions() {
  // Toggle regular product active/inactive
  $$('[data-toggle-product]').forEach(btn => {
    btn.onclick = async () => {
      const code = btn.dataset.toggleProduct;
      const cur = btn.dataset.active === '1';
      const next = !cur;
      btn.dataset.active = next ? '1' : '0';
      btn.textContent = next ? 'ON' : 'OFF';
      btn.classList.toggle('off', !next);
      const card = btn.closest('.product-card');
      card?.classList.toggle('stock-empty', !next);

      try {
        await api('/api/reseller/products/pricing', {
          method: 'POST',
          body: {
            key: code,
            override: { enabled: next }
          }
        });
        const p = state.products.find(x => x.code === code);
        if (p) p.enabled = next;
        toast(`Status produk ${code} diubah ke ${next ? 'Aktif' : 'Nonaktif'}`);
      } catch (err) {
        toast(err.message, true);
        renderProductCatalogView();
      }
    };
  });

  // Toggle fresh product active/inactive
  $$('[data-toggle-fresh]').forEach(btn => {
    btn.onclick = async () => {
      const key = btn.dataset.toggleFresh;
      const cur = btn.dataset.active === '1';
      const next = !cur;
      btn.dataset.active = next ? '1' : '0';
      btn.textContent = next ? 'ON' : 'OFF';
      btn.classList.toggle('off', !next);
      const card = btn.closest('.product-card');
      card?.classList.toggle('stock-empty', !next);

      try {
        await api('/api/reseller/products/pricing', {
          method: 'POST',
          body: {
            key: `FRESH:${key}`,
            override: { enabled: next }
          }
        });
        const r = state.freshProducts.find(x => x.product_key === key);
        if (r) r.enabled = next;
        toast(`Status produk fresh ${key} diubah ke ${next ? 'Aktif' : 'Nonaktif'}`);
      } catch (err) {
        toast(err.message, true);
        renderProductCatalogView();
      }
    };
  });

  // Edit Regular Product
  $$('[data-edit-product]').forEach(btn => {
    btn.onclick = () => {
      const code = btn.dataset.editProduct;
      const p = state.products.find(x => x.code === code);
      if (p) openProductEditModal(p);
    };
  });

  // Edit Fresh Product
  $$('[data-edit-fresh]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.editFresh;
      const r = state.freshProducts.find(x => x.product_key === key);
      if (r) openFreshProductModal(r);
    };
  });
}

// Modal Edit Produk Reguler (Persis Dashboard Owner)
// Modal Edit Produk Reguler (Persis Dashboard Owner)
function openProductEditModal(p) {
  const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
  const prodDefDesc = p.default_description || p.description || '';
  const prodDefTerms = p.default_terms || p.terms || '';
  const prodCurDesc = p.custom_description || prodDefDesc;
  const prodCurTerms = p.custom_terms || prodDefTerms;

  let bodyHtml = '';

  if (hasVariants) {
    bodyHtml = `
      <div class="form-grid product-form">
        <label>Kode Produk<input value="${esc(p.code)}" disabled></label>
        <label>Nama Produk<input value="${esc(p.name)}" disabled></label>
        <label>Kategori<input value="${esc(p.category || 'Digital')}" disabled></label>
        <label>Subtitle<input value="${esc(p.subtitle || '-')}" disabled></label>
        <label>Tag<input value="${esc(p.tag || '-')}" disabled></label>
        <label>Status di Bot Anda
          <select name="enabled">
            <option value="true" ${p.enabled ? 'selected' : ''}>Aktif (ON)</option>
            <option value="false" ${!p.enabled ? 'selected' : ''}>Nonaktif (OFF)</option>
          </select>
        </label>
        <div class="full info-note variant-default-hidden-note">
          <b>Produk memakai varian (${p.variants.length} Varian).</b><br>
          Deskripsi, SNK, modal, dan margin keuntungan diatur langsung per masing-masing varian di bawah ini.
        </div>
      </div>

      <div class="variant-editor full" style="margin-top:16px;padding-top:14px;border-top:2px solid var(--ink, #0c0c0f)">
        <div class="variant-editor-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
          <div>
            <h3 style="margin:0;font-size:16px">📦 Atur Varian Produk (${p.variants.length})</h3>
            <p style="margin:4px 0 0;font-size:12px;color:var(--muted)">Tentukan margin keuntungan, status aktif, deskripsi, dan SNK untuk setiap varian.</p>
          </div>
          <button type="button" class="neo-btn white small" id="btnModalSyncVariants">⚡ Samakan Semua Margin</button>
        </div>

        <div class="variant-edit-list" style="display:flex;flex-direction:column;gap:12px;max-height:460px;overflow-y:auto;padding-right:4px">
          ${p.variants.map((v, i) => {
            const vStock = v.delivery_mode === 'preorder' ? 'PO' : (Number(v.stock || 0) > 0 ? `Ready ${v.stock}` : 'Habis');
            const vStockState = v.delivery_mode === 'preorder' ? 'preorder' : (Number(v.stock || 0) > 0 ? 'ready' : 'empty');
            const vDefDesc = v.default_description || prodDefDesc || '';
            const vDefTerms = v.default_terms || prodDefTerms || '';
            const vCurDesc = v.custom_description || vDefDesc;
            const vCurTerms = v.custom_terms || vDefTerms;

            return `
              <div class="variant-edit-card" style="padding:12px;border:2px solid var(--ink, #0c0c0f);border-radius:10px;background:#faf7ff;display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <b style="font-size:14px">${esc(v.name)}</b>
                    <span class="stock-state-pill ${vStockState}" style="font-size:10px;padding:2px 6px">${vStock}</span>
                  </div>
                  <label style="margin:0;font-size:11px;display:inline-flex;align-items:center;gap:4px">
                    Status di Bot:
                    <select class="modal-var-enabled" data-key="${esc(v.key)}" style="padding:3px 8px;font-size:11px;border-radius:4px;border:1px solid #000">
                      <option value="true" ${v.enabled ? 'selected' : ''}>Aktif</option>
                      <option value="false" ${!v.enabled ? 'selected' : ''}>Nonaktif</option>
                    </select>
                  </label>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                  <div style="background:#f5f5f7;border:1px solid #ccc;border-radius:6px;padding:6px 8px">
                    <small style="display:block;font-size:10px;color:var(--muted);font-weight:700">Modal Owner</small>
                    <b style="font-size:13px">${money(v.owner_price)}</b>
                  </div>
                  <div style="background:#edffdc;border:1px solid #82d847;border-radius:6px;padding:6px 8px">
                    <small style="display:block;font-size:10px;color:#1a5e00;font-weight:700">Margin Profit (+)</small>
                    <input type="number" class="modal-var-margin" data-key="${esc(v.key)}" data-base="${v.owner_price}" value="${v.margin || 0}" min="0" step="500" style="width:100%;font-size:13px;font-weight:700;padding:2px 4px;border:1px solid #000;border-radius:4px" />
                  </div>
                  <div style="background:#fffbd4;border:1px solid #ffd91a;border-radius:6px;padding:6px 8px">
                    <small style="display:block;font-size:10px;color:#705300;font-weight:700">Harga Jual</small>
                    <b class="modal-var-sell" style="font-size:13px">${money(v.reseller_price)}</b>
                  </div>
                </div>

                <!-- Deskripsi Varian -->
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-size:11px;font-weight:700">📝 Deskripsi Varian</span>
                    <button type="button" class="btn-reset-v-desc" data-target="vdesc_${v.id}" data-default="${esc(vDefDesc)}" style="background:none;border:none;color:#4361ee;font-size:11px;cursor:pointer;text-decoration:underline">↺ Default Owner</button>
                  </div>
                  <textarea id="vdesc_${v.id}" class="modal-var-desc" data-key="${esc(v.key)}" rows="2" placeholder="Deskripsi varian..." style="width:100%;font-size:12px;border:1px solid #ccc;border-radius:6px;padding:6px;box-sizing:border-box">${esc(vCurDesc)}</textarea>
                </div>

                <!-- SNK Varian -->
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="font-size:11px;font-weight:700">⚖️ Syarat & Ketentuan (SNK)</span>
                    <button type="button" class="btn-reset-v-terms" data-target="vterms_${v.id}" data-default="${esc(vDefTerms)}" style="background:none;border:none;color:#4361ee;font-size:11px;cursor:pointer;text-decoration:underline">↺ Default Owner</button>
                  </div>
                  <textarea id="vterms_${v.id}" class="modal-var-terms" data-key="${esc(v.key)}" rows="2" placeholder="Ketentuan garansi/klaim varian..." style="width:100%;font-size:12px;border:1px solid #ccc;border-radius:6px;padding:6px;box-sizing:border-box">${esc(vCurTerms)}</textarea>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  } else {
    // Produk tanpa varian (Single)
    bodyHtml = `
      <div class="form-grid product-form">
        <label>Kode Produk<input value="${esc(p.code)}" disabled></label>
        <label>Nama Produk<input value="${esc(p.name)}" disabled></label>
        <label>Kategori<input value="${esc(p.category || 'Digital')}" disabled></label>
        <label>Subtitle<input value="${esc(p.subtitle || '-')}" disabled></label>
        <label>Tag<input value="${esc(p.tag || '-')}" disabled></label>
        <label>Status di Bot Anda
          <select name="enabled">
            <option value="true" ${p.enabled ? 'selected' : ''}>Aktif (ON)</option>
            <option value="false" ${!p.enabled ? 'selected' : ''}>Nonaktif (OFF)</option>
          </select>
        </label>

        <div class="full" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:6px">
          <div style="background:#f5f5f7;border:1px solid #ccc;border-radius:6px;padding:6px 10px">
            <small style="display:block;font-size:11px;color:var(--muted);font-weight:700">Modal Owner</small>
            <b style="font-size:13px">${money(p.owner_price)}</b>
          </div>
          <div style="background:#edffdc;border:1px solid #82d847;border-radius:6px;padding:6px 10px">
            <small style="display:block;font-size:11px;color:#1a5e00;font-weight:700">Margin Profit (+)</small>
            <input type="number" name="margin" id="modalProductMargin" data-base="${p.owner_price}" value="${p.margin || 0}" min="0" step="500" style="width:100%;font-size:13px;font-weight:700;padding:4px;border:1px solid #000;border-radius:4px" />
          </div>
          <div style="background:#fffbd4;border:1px solid #ffd91a;border-radius:6px;padding:6px 10px">
            <small style="display:block;font-size:11px;color:#705300;font-weight:700">Harga Jual Pembeli</small>
            <b id="modalProductSell" style="font-size:13px">${money(p.reseller_price)}</b>
          </div>
        </div>

        <label class="full">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span>Deskripsi Produk (Kustom Bot Anda)</span>
            <button type="button" id="btnResetProdDesc" style="background:none;border:none;color:#4361ee;font-size:11px;cursor:pointer;text-decoration:underline">↺ Default Owner</button>
          </div>
          <textarea name="description" id="modalProdDesc" rows="4" placeholder="Teks deskripsi produk...">${esc(prodCurDesc)}</textarea>
          <small class="muted">Teks deskripsi yang akan dibaca pembeli saat memilih produk di Bot Anda.</small>
        </label>
        <label class="full">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span>Syarat & Ketentuan / SNK (Kustom Bot Anda)</span>
            <button type="button" id="btnResetProdTerms" style="background:none;border:none;color:#4361ee;font-size:11px;cursor:pointer;text-decoration:underline">↺ Default Owner</button>
          </div>
          <textarea name="terms" id="modalProdTerms" rows="4" placeholder="Ketentuan garansi / klaim produk...">${esc(prodCurTerms)}</textarea>
          <small class="muted">Ketentuan garansi / klaim untuk pembeli bot Anda.</small>
        </label>
      </div>
    `;
  }

  modal(`Edit Produk · ${p.name}`, bodyHtml, async (fd) => {
    const patch = {};

    // Base product override
    patch[p.code] = {
      ...(state.bot?.pricing_overrides?.[p.code] || {}),
      enabled: fd.enabled === 'true'
    };

    if (!hasVariants) {
      const marginVal = Math.max(0, Number(fd.margin || 0));
      patch[p.code].margin = marginVal;
      patch[p.code].sell_price = p.owner_price + marginVal;
      patch[p.code].description = String(fd.description || '').trim();
      patch[p.code].terms = String(fd.terms || '').trim();
    } else {
      $$('.modal-var-margin').forEach(inp => {
        const key = inp.dataset.key;
        const base = Number(inp.dataset.base || 0);
        const marginVal = Math.max(0, Number(inp.value || 0));
        const enabledSelect = document.querySelector(`.modal-var-enabled[data-key="${key}"]`);
        const isEn = enabledSelect ? enabledSelect.value === 'true' : true;
        const descEl = document.querySelector(`.modal-var-desc[data-key="${key}"]`);
        const termsEl = document.querySelector(`.modal-var-terms[data-key="${key}"]`);

        patch[key] = {
          ...(state.bot?.pricing_overrides?.[key] || {}),
          enabled: isEn,
          margin: marginVal,
          sell_price: base + marginVal,
          description: descEl ? String(descEl.value || '').trim() : '',
          terms: termsEl ? String(termsEl.value || '').trim() : ''
        };
      });
    }

    await api('/api/reseller/products/pricing', {
      method: 'POST',
      body: { pricing_overrides: patch }
    });

    toast(`Produk ${p.name} berhasil diperbarui!`);
    await loadPricing(true, p.code);
  }, { submit: 'Simpan Perubahan' });

  // Reset helpers for single product
  const resetDesc = $('#btnResetProdDesc');
  if (resetDesc) {
    resetDesc.onclick = () => {
      const el = $('#modalProdDesc');
      if (el) el.value = prodDefDesc;
    };
  }
  const resetTerms = $('#btnResetProdTerms');
  if (resetTerms) {
    resetTerms.onclick = () => {
      const el = $('#modalProdTerms');
      if (el) el.value = prodDefTerms;
    };
  }

  // Reset helpers for variants
  $$('.btn-reset-v-desc').forEach(btn => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.value = btn.dataset.default || '';
    };
  });
  $$('.btn-reset-v-terms').forEach(btn => {
    btn.onclick = () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.value = btn.dataset.default || '';
    };
  });

  // Live price calculation in modal
  if (!hasVariants) {
    const inp = $('#modalProductMargin');
    const sell = $('#modalProductSell');
    if (inp && sell) {
      inp.oninput = () => {
        const base = Number(inp.dataset.base || 0);
        const m = Math.max(0, Number(inp.value || 0));
        sell.textContent = money(base + m);
      };
    }
  } else {
    $$('.modal-var-margin').forEach(inp => {
      inp.oninput = () => {
        const base = Number(inp.dataset.base || 0);
        const m = Math.max(0, Number(inp.value || 0));
        const card = inp.closest('.variant-edit-card');
        const sell = card?.querySelector('.modal-var-sell');
        if (sell) sell.textContent = money(base + m);
      };
    });

    const syncBtn = $('#btnModalSyncVariants');
    if (syncBtn) {
      syncBtn.onclick = () => {
        const val = prompt('Tentukan margin (Rp) untuk seluruh varian produk ini:', '2000');
        if (val === null) return;
        const num = Math.max(0, Number(val.replace(/[^0-9]/g, '')) || 0);
        $$('.modal-var-margin').forEach(inp => {
          inp.value = num;
          const base = Number(inp.dataset.base || 0);
          const card = inp.closest('.variant-edit-card');
          const sell = card?.querySelector('.modal-var-sell');
          if (sell) sell.textContent = money(base + num);
        });
        toast(`Margin ${money(num)} disamakan ke seluruh varian.`);
      };
    }
  }
}

// Modal Edit Produk Fresh (Persis Dashboard Owner)
function openFreshProductModal(r) {
  const priceOptions = Array.isArray(r.price_options) ? r.price_options : [];
  const hasOptions = priceOptions.length > 1;

  const optionsHtml = hasOptions ? `
    <div class="full" style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;margin-bottom:6px">
      <b>⚡ Opsi Paket / Durasi (${priceOptions.length})</b>
      <button type="button" class="neo-btn white tiny" id="btnModalSyncFresh">⚡ Samakan Semua Margin</button>
    </div>
    <div class="full" style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-right:4px">
      ${priceOptions.map((opt, i) => {
        const optLabel = Object.entries(opt.options || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || `Opsi #${opt.id}`;
        return `
          <div class="variant-edit-card" style="padding:10px;border:2px solid var(--ink, #0c0c0f);border-radius:10px;background:#fdfdfd">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <div><b>${esc(optLabel)}</b></div>
              <label style="margin:0;font-size:11px;display:flex;align-items:center;gap:4px">
                Status di Bot:
                <select class="modal-fresh-enabled" data-key="${esc(opt.key)}" style="padding:2px 6px;font-size:11px">
                  <option value="true" ${opt.enabled ? 'selected' : ''}>Aktif</option>
                  <option value="false" ${!opt.enabled ? 'selected' : ''}>Nonaktif</option>
                </select>
              </label>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
              <div style="background:#f5f5f7;border:1px solid #ccc;border-radius:6px;padding:4px 8px">
                <small style="display:block;font-size:10px;color:var(--muted)">Modal Owner</small>
                <b style="font-size:12px">${money(opt.owner_price)}</b>
              </div>
              <div style="background:#edffdc;border:1px solid #82d847;border-radius:6px;padding:4px 8px">
                <small style="display:block;font-size:10px;color:#1a5e00">Margin Profit (+)</small>
                <input type="number" class="modal-fresh-margin" data-key="${esc(opt.key)}" data-base="${opt.owner_price}" value="${opt.margin || 0}" min="0" step="500" style="width:100%;font-size:12px;font-weight:700;padding:2px;border:1px solid #000;border-radius:4px" />
              </div>
              <div style="background:#fffbd4;border:1px solid #ffd91a;border-radius:6px;padding:4px 8px">
                <small style="display:block;font-size:10px;color:#705300">Harga Jual</small>
                <b class="modal-fresh-sell" style="font-size:12px">${money(opt.reseller_price)}</b>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : `
    <div class="full" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px">
      <div style="background:#f5f5f7;border:1px solid #ccc;border-radius:6px;padding:6px 10px">
        <small style="display:block;font-size:11px;color:var(--muted)">Modal Owner</small>
        <b style="font-size:13px">${money(r.owner_price)}</b>
      </div>
      <div style="background:#edffdc;border:1px solid #82d847;border-radius:6px;padding:6px 10px">
        <small style="display:block;font-size:11px;color:#1a5e00">Margin Profit (+)</small>
        <input type="number" name="margin" id="modalFreshSingleMargin" data-base="${r.owner_price}" value="${r.margin || 0}" min="0" step="500" style="width:100%;font-size:13px;font-weight:700;padding:4px;border:1px solid #000;border-radius:4px" />
      </div>
      <div style="background:#fffbd4;border:1px solid #ffd91a;border-radius:6px;padding:6px 10px">
        <small style="display:block;font-size:11px;color:#705300">Harga Jual Pembeli</small>
        <b id="modalFreshSingleSell" style="font-size:13px">${money(r.reseller_price)}</b>
      </div>
    </div>
  `;

  const html = `
    <div class="form-grid product-form">
      <label>Key Produk<input value="${esc(r.product_key)}" disabled></label>
      <label>Nama Produk<input value="${esc(r.name)}" disabled></label>
      <label class="full">Status di Bot Anda
        <select name="enabled">
          <option value="true" ${r.enabled ? 'selected' : ''}>Aktif (ON)</option>
          <option value="false" ${!r.enabled ? 'selected' : ''}>Nonaktif (OFF)</option>
        </select>
      </label>
      <label class="full">
        Deskripsi Produk Fresh (Kustom Bot Anda)
        <textarea name="description" rows="4" placeholder="Kosongkan jika ingin memakai deskripsi default dari Owner">${esc(r.custom_description || '')}</textarea>
        <small class="muted">Teks deskripsi akun fresh yang akan dibaca pembeli saat memilih produk di Bot Anda.</small>
      </label>
      <label class="full">
        Syarat & Ketentuan / SNK (Kustom Bot Anda)
        <textarea name="terms" rows="4" placeholder="Kosongkan jika ingin memakai SNK default dari Owner">${esc(r.custom_terms || '')}</textarea>
        <small class="muted">Ketentuan garansi / durasi akun bagi pembeli bot Anda.</small>
      </label>
      <div class="full info-note">
        💡 <b>Harga Modal Reseller:</b> Mengikuti harga jual yang ditentukan oleh Owner Toko Utama. Anda bebas menentukan margin profit tambahan di atas harga modal tersebut.
      </div>
      ${optionsHtml}
    </div>
  `;

  modal(`Edit Produk Fresh · ${r.name}`, html, async (fd) => {
    const itemKey = `FRESH:${r.product_key}`;
    const patch = {};

    patch[itemKey] = {
      ...(state.bot?.pricing_overrides?.[itemKey] || {}),
      enabled: fd.enabled === 'true',
      description: String(fd.description || '').trim(),
      terms: String(fd.terms || '').trim()
    };

    if (!hasOptions) {
      const marginVal = Math.max(0, Number(fd.margin || 0));
      patch[itemKey].margin = marginVal;
      patch[itemKey].sell_price = r.owner_price + marginVal;
    } else {
      $$('.modal-fresh-margin').forEach(inp => {
        const key = inp.dataset.key;
        const base = Number(inp.dataset.base || 0);
        const marginVal = Math.max(0, Number(inp.value || 0));
        const enabledSelect = document.querySelector(`.modal-fresh-enabled[data-key="${key}"]`);
        const isEn = enabledSelect ? enabledSelect.value === 'true' : true;
        patch[key] = {
          ...(state.bot?.pricing_overrides?.[key] || {}),
          enabled: isEn,
          margin: marginVal,
          sell_price: base + marginVal
        };
      });
    }

    await api('/api/reseller/products/pricing', {
      method: 'POST',
      body: { pricing_overrides: patch }
    });

    toast(`Produk Fresh ${r.name} berhasil diperbarui!`);
    await loadPricing(true, r.product_key);
  }, { submit: 'Simpan Perubahan' });

  // Live price calculation in fresh modal
  if (!hasOptions) {
    const inp = $('#modalFreshSingleMargin');
    const sell = $('#modalFreshSingleSell');
    if (inp && sell) {
      inp.oninput = () => {
        const base = Number(inp.dataset.base || 0);
        const m = Math.max(0, Number(inp.value || 0));
        sell.textContent = money(base + m);
      };
    }
  } else {
    $$('.modal-fresh-margin').forEach(inp => {
      inp.oninput = () => {
        const base = Number(inp.dataset.base || 0);
        const m = Math.max(0, Number(inp.value || 0));
        const card = inp.closest('.variant-edit-card');
        const sell = card?.querySelector('.modal-fresh-sell');
        if (sell) sell.textContent = money(base + m);
      };
    });

    const syncBtn = $('#btnModalSyncFresh');
    if (syncBtn) {
      syncBtn.onclick = () => {
        const val = prompt('Tentukan margin (Rp) untuk seluruh opsi produk fresh ini:', '3000');
        if (val === null) return;
        const num = Math.max(0, Number(val.replace(/[^0-9]/g, '')) || 0);
        $$('.modal-fresh-margin').forEach(inp => {
          inp.value = num;
          const base = Number(inp.dataset.base || 0);
          const card = inp.closest('.variant-edit-card');
          const sell = card?.querySelector('.modal-fresh-sell');
          if (sell) sell.textContent = money(base + num);
        });
        toast(`Margin ${money(num)} disamakan ke seluruh opsi.`);
      };
    }
  }
}

// ---------------------------------------------------------------------
// VIEW 4: TARIK SALDO
// ---------------------------------------------------------------------
async function loadWithdraw(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
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
          <b class="mono">${esc(w.bank_name)} · ${esc(w.account_number || w.bank_account_number)} (${esc(w.account_name || w.bank_account_name)})</b>
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

    <!-- Syarat & Ketentuan Penarikan Dana -->
    <section class="report-card" style="margin-top:16px;background:#fffdfa;border:2px solid var(--ink, #0c0c0f);border-radius:12px;padding:16px">
      <div class="card-heading" style="margin-bottom:10px">
        <div>
          <h3 style="margin:0;font-size:16px">⚖️ Syarat &amp; Ketentuan Penarikan Dana</h3>
          <p style="margin:4px 0 0;font-size:12px;color:var(--muted)">Harap baca dan perhatikan ketentuan penarikan saldo komisi berikut sebelum mengajukan:</p>
        </div>
      </div>
      <div style="font-size:13px;line-height:1.7;color:#222;display:flex;flex-direction:column;gap:6px">
        <div>• <b>Batas Minimal Penarikan:</b> Minimal nominal pencairan saldo komisi adalah <b>Rp 10.000</b> per transaksi.</div>
        <div>• <b>Pilihan Metode:</b> Mendukung <b>Transfer Bank</b> (BCA, BRI, Mandiri, BNI, SeaBank, Bank Jago, dll.) dan <b>E-Wallet</b> (DANA, GoPay, OVO, ShopeePay, LinkAja).</div>
        <div>• <b>Input Data Manual:</b> Setiap kali penarikan, masukkan manual: nominal, metode, nama bank/e-wallet, nomor rekening/HP, serta nama pemilik rekening yang sesuai.</div>
        <div>• <b>Kebenaran Rekening:</b> Pastikan nomor rekening / nomor e-wallet dan nama pemilik rekening terdaftar sesuai dan aktif. Kesalahan penulisan data rekening menjadi tanggung jawab reseller sepenuhnya.</div>
        <div>• <b>Waktu Proses &amp; Verifikasi:</b> Pengajuan penarikan dana diverifikasi dan ditransfer secara manual oleh Owner Toko Utama.</div>
        <div>• <b>Bukti Transfer:</b> Setelah diproses transfer oleh Owner, foto bukti transfer resmi dapat dicek langsung pada riwayat penarikan di bawah ini.</div>
        <div>• <b>Pemotongan Saldo:</b> Saldo komisi akan dipotong sementara saat pengajuan dibuat. Jika pengajuan ditolak, saldo otomatis dikembalikan utuh ke akun Anda.</div>
      </div>
    </section>

    <div class="section-title product-section-title" style="margin-top:20px">
      <div>
        <h2>💸 Formulir Pengajuan Penarikan</h2>
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

  if (preserveScroll) {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
}

function showWithdrawModal() {
  const r = state.reseller || {};
  const maxWd = Math.max(0, Number(r.profit_balance || 0));

  if (maxWd < 10000) {
    return toast('Saldo komisi belum mencukupi. Minimal penarikan Rp 10.000', true);
  }

  const html = `
    <div class="form-grid">
      <label class="full">
        Nominal Penarikan (Rp)
        <input name="amount" id="wdAmount" type="number" min="10000" max="${maxWd}" value="${maxWd}" required />
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
          <small>Saldo tersedia: <b>${money(maxWd)}</b></small>
        </div>
        <div class="quick-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          <button type="button" class="neo-btn white tiny btn-wd-quick" data-val="10000">10k</button>
          <button type="button" class="neo-btn white tiny btn-wd-quick" data-val="50000">50k</button>
          <button type="button" class="neo-btn white tiny btn-wd-quick" data-val="100000">100k</button>
          <button type="button" class="neo-btn white tiny btn-wd-quick" data-val="250000">250k</button>
          <button type="button" class="neo-btn white tiny btn-wd-quick" data-val="${maxWd}">Semua Saldo</button>
        </div>
      </label>

      <label>
        Metode Pencairan
        <select name="method" id="wdMethod" required>
          <option value="bank" selected>🏦 Transfer Bank</option>
          <option value="ewallet">📱 E-Wallet (DANA, GoPay, OVO, ShopeePay)</option>
        </select>
      </label>

      <label>
        <span id="wdBankLabel">Nama Bank</span>
        <select id="wdBankSelect" style="width:100%">
          <option value="BCA">BCA</option>
          <option value="BRI">BRI</option>
          <option value="BNI">BNI</option>
          <option value="MANDIRI">Mandiri</option>
          <option value="SEABANK">SeaBank</option>
          <option value="JAGO">Bank Jago</option>
          <option value="CIMB">CIMB Niaga</option>
          <option value="PERMATA">Permata</option>
          <option value="BSI">BSI (Bank Syariah Indonesia)</option>
          <option value="NEO">Bank Neo Commerce</option>
          <option value="CUSTOM">Lainnya (Ketik Manual)</option>
        </select>
        <input name="custom_bank_name" id="wdBankCustom" placeholder="Ketik nama bank/e-wallet..." style="display:none;margin-top:6px;width:100%" />
      </label>

      <label>
        <span id="wdNumberLabel">Nomor Rekening Bank</span>
        <input name="bank_account_number" id="wdAccountNumber" placeholder="Masukkan nomor rekening tujuan..." value="${esc(r.bank_account_number || '')}" required />
      </label>

      <label>
        <span id="wdNameLabel">Atas Nama Pemilik Rekening</span>
        <input name="bank_account_name" id="wdAccountName" placeholder="Nama sesuai di rekening / e-wallet..." value="${esc(r.bank_account_name || '')}" required />
      </label>

      <label class="full">
        Catatan untuk Owner (Opsional)
        <input name="note" placeholder="Catatan opsional..." />
      </label>

      <div class="full info-note" style="margin-top:6px;font-size:12px">
        ⚖️ <b>Syarat &amp; Ketentuan:</b> Minimal penarikan Rp 10.000. Pastikan nomor rekening dan nama pemilik rekening sudah benar. Transfer dana akan diproses manual oleh Owner ke rekening tujuan.
      </div>
    </div>
  `;

  modal('💸 Formulir Penarikan Saldo', html, async (data) => {
    const amt = Number(data.amount || 0);
    if (amt < 10000) {
      throw new Error('Minimal penarikan saldo adalah Rp 10.000');
    }
    if (amt > maxWd) {
      throw new Error(`Saldo profit tidak mencukupi (Tersedia: ${money(maxWd)})`);
    }

    const method = $('#wdMethod')?.value || 'bank';
    const selectBank = $('#wdBankSelect')?.value || '';
    const customBank = $('#wdBankCustom')?.value?.trim() || '';
    const finalBank = (selectBank === 'CUSTOM' ? customBank : selectBank) || customBank;

    if (!finalBank) {
      throw new Error('Nama bank atau e-wallet wajib diisi');
    }
    const accNum = String(data.bank_account_number || '').trim();
    if (!accNum) {
      throw new Error('Nomor rekening atau nomor e-wallet wajib diisi');
    }
    const accName = String(data.bank_account_name || '').trim();
    if (!accName) {
      throw new Error('Nama pemilik rekening / atas nama wajib diisi');
    }

    const payload = {
      amount: amt,
      method: method,
      bank_name: finalBank,
      bank_account_number: accNum,
      bank_account_name: accName,
      note: String(data.note || '').trim()
    };

    await api('/api/reseller/withdrawals', { method: 'POST', body: payload });
    toast('Pengajuan penarikan berhasil dikirim ke Owner!');
    await loadWithdraw(true);
  }, { submit: 'Kirim Pengajuan' });

  // Event handlers inside modal
  const methodSelect = $('#wdMethod');
  const bankSelect = $('#wdBankSelect');
  const bankCustom = $('#wdBankCustom');
  const bankLabel = $('#wdBankLabel');
  const numberLabel = $('#wdNumberLabel');
  const nameLabel = $('#wdNameLabel');
  const accNumInp = $('#wdAccountNumber');

  const bankOptions = [
    { val: 'BCA', text: 'BCA' },
    { val: 'BRI', text: 'BRI' },
    { val: 'BNI', text: 'BNI' },
    { val: 'MANDIRI', text: 'Mandiri' },
    { val: 'SEABANK', text: 'SeaBank' },
    { val: 'JAGO', text: 'Bank Jago' },
    { val: 'CIMB', text: 'CIMB Niaga' },
    { val: 'PERMATA', text: 'Permata' },
    { val: 'BSI', text: 'BSI (Bank Syariah Indonesia)' },
    { val: 'NEO', text: 'Bank Neo Commerce' },
    { val: 'CUSTOM', text: 'Lainnya (Ketik Manual)' }
  ];

  const ewalletOptions = [
    { val: 'DANA', text: 'DANA' },
    { val: 'GOPAY', text: 'GoPay' },
    { val: 'OVO', text: 'OVO' },
    { val: 'SHOPEEPAY', text: 'ShopeePay' },
    { val: 'LINKAJA', text: 'LinkAja' },
    { val: 'ASTRAPAY', text: 'AstraPay' },
    { val: 'CUSTOM', text: 'Lainnya (Ketik Manual)' }
  ];

  const updateMethodUI = () => {
    const isEw = methodSelect.value === 'ewallet';
    bankLabel.textContent = isEw ? 'Nama E-Wallet' : 'Nama Bank';
    numberLabel.textContent = isEw ? 'Nomor HP E-Wallet' : 'Nomor Rekening Bank';
    nameLabel.textContent = isEw ? 'Atas Nama Akun E-Wallet' : 'Atas Nama Pemilik Rekening';
    accNumInp.placeholder = isEw ? 'Contoh: 08123456789' : 'Contoh: 1234567890';

    const opts = isEw ? ewalletOptions : bankOptions;
    bankSelect.innerHTML = opts.map(o => `<option value="${o.val}">${o.text}</option>`).join('');
    bankCustom.style.display = 'none';
    bankCustom.value = '';
  };

  if (methodSelect) methodSelect.onchange = updateMethodUI;

  if (bankSelect) {
    bankSelect.onchange = () => {
      const isCustom = bankSelect.value === 'CUSTOM';
      bankCustom.style.display = isCustom ? 'block' : 'none';
      if (isCustom) bankCustom.focus();
    };
  }

  $$('.btn-wd-quick').forEach(b => {
    b.onclick = () => {
      const val = Number(b.dataset.val || 0);
      const inp = $('#wdAmount');
      if (inp) inp.value = Math.min(val, maxWd);
    };
  });
}

// ---------------------------------------------------------------------
// VIEW 5: PESANAN PEMBELI (Identical to Owner loadOrders())
// ---------------------------------------------------------------------
async function loadOrders(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const res = await api('/api/reseller/orders');
  state.orders = res.items || [];
  updateShellUI();

  renderOrdersView();
  if (preserveScroll) {
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
}

function renderOrdersView(filterStatus = '', search = '') {
  const q = (search !== '' ? search : ($('#orderSearch')?.value || '')).toLowerCase().trim();
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

  const listEl = $('#orderList');
  if (listEl) {
    listEl.innerHTML = rows.length ? ordersHtml : '<div class="empty-product">Belum ada transaksi pesanan yang sesuai filter.</div>';
    return;
  }

  $('#content').innerHTML = `
    <div class="section-title product-section-title">
      <div>
        <h2>🛒 Riwayat Pesanan</h2>
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

    <div class="order-list" id="orderList">
      ${rows.length ? ordersHtml : '<div class="empty-product">Belum ada transaksi pesanan yang sesuai filter.</div>'}
    </div>
  `;

  $('#orderSearch').oninput = () => renderOrdersView();
  $('#orderStatus').onchange = () => renderOrdersView();
}

// ---------------------------------------------------------------------
// VIEW 6: LAPORAN (Persis Dashboard Owner)
// ---------------------------------------------------------------------
async function loadReports() {
  const d = new Date(), r = state.report || {};
  if (!r.date) r.date = d.toISOString().slice(0, 10);
  if (!r.month) r.month = d.toISOString().slice(0, 7);
  if (!r.year) r.year = String(d.getFullYear());
  state.report = r;

  $('#content').innerHTML = `
    <section class="report-filter panel">
      <div class="section-head">
        <div>
          <h3>📊 Pilih Laporan</h3>
          <p>Sesuaikan tipe dan periode laporan performa bot toko Anda.</p>
        </div>
      </div>
      <div class="report-filter-grid">
        <label>
          Tipe Laporan
          <select id="reportType">
            <option value="daily" ${r.type === 'daily' ? 'selected' : ''}>Harian</option>
            <option value="monthly" ${r.type === 'monthly' || !r.type ? 'selected' : ''}>Bulanan</option>
            <option value="yearly" ${r.type === 'yearly' ? 'selected' : ''}>Tahunan</option>
          </select>
        </label>
        <label id="reportPeriodWrap"></label>
        <button id="applyReport" class="neo-btn purple">Tampilkan Laporan</button>
      </div>
    </section>
    <div id="reportResult"><div class="empty-product">Memuat laporan...</div></div>
  `;

  const renderPeriod = () => {
    const t = $('#reportType').value;
    $('#reportPeriodWrap').innerHTML = t === 'daily'
      ? `Periode<input id="reportPeriod" type="date" value="${esc(r.date)}">`
      : t === 'monthly'
        ? `Periode<input id="reportPeriod" type="month" value="${esc(r.month)}">`
        : `Tahun<input id="reportPeriod" type="number" min="2020" max="2100" value="${esc(r.year)}">`;
  };
  renderPeriod();
  $('#reportType').onchange = renderPeriod;

  $('#applyReport').onclick = async () => {
    const type = $('#reportType').value, val = $('#reportPeriod').value;
    state.report.type = type;
    if (type === 'daily') state.report.date = val;
    if (type === 'monthly') state.report.month = val;
    if (type === 'yearly') state.report.year = val;
    await fetchReport();
  };
  await fetchReport();
}

async function fetchReport() {
  const r = state.report, t = r.type || 'monthly';
  let qs = `type=${encodeURIComponent(t)}`;
  let periodLabel = '';
  if (t === 'daily') {
    qs += `&date=${encodeURIComponent(r.date)}`;
    periodLabel = new Date(r.date + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'long' });
  } else if (t === 'monthly') {
    const [y, m] = (r.month || '').split('-');
    qs += `&month=${encodeURIComponent(m || '')}&year=${encodeURIComponent(y || '')}`;
    periodLabel = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  } else {
    qs += `&year=${encodeURIComponent(r.year)}`;
    periodLabel = 'Tahun ' + r.year;
  }

  const res = await api('/api/reseller/reports?' + qs);
  const x = res.data || {};
  const sum = x.summary || {};
  const series = x.series || [];
  const max = Math.max(1, ...series.map(v => Number(v.revenue || 0)));

  $('#reportResult').innerHTML = `
    <div class="stats-row">
      ${stat('🛒', 'purple', 'Pesanan', sum.total_orders || 0, periodLabel)}
      ${stat('📈', 'pink', 'Omzet', money(sum.revenue), 'Total transaksi pembeli')}
      ${stat('💵', 'green', 'Profit Komisi', money(sum.profit), 'Keuntungan bersih Anda')}
      ${stat('⏳', 'yellow', 'Pending', sum.pending || 0, 'Menunggu pembayaran')}
    </div>
    <div class="grid-2">
      <section class="report-card">
        <div class="card-heading">
          <div>
            <h3>📊 ${t === 'daily' ? 'Omzet per Jam' : t === 'monthly' ? 'Omzet Harian' : 'Omzet Bulanan'}</h3>
            <p>${esc(periodLabel)}</p>
          </div>
        </div>
        <div class="report-series">
          ${series.length ? series.map(v => `
            <div class="series-row">
              <span>${esc(v.bucket)}</span>
              <div class="series-track"><i style="width:${Math.max(2, Math.round(Number(v.revenue || 0) / max * 100))}%"></i></div>
              <b>${money(v.revenue)}</b>
            </div>
          `).join('') : '<div class="empty compact">Belum ada transaksi pada periode ini.</div>'}
        </div>
      </section>
      <section class="report-card">
        <div class="card-heading">
          <div>
            <h3>🏆 Produk Terlaris</h3>
            <p>${esc(periodLabel)}</p>
          </div>
        </div>
        <div class="top-list">
          ${(x.top_products || []).length ? (x.top_products || []).map((p, i) => `
            <div class="top-item">
              <span class="rank">${i + 1}</span>
              <div>
                <b>${esc(p.product_name || '-')}</b>
                <small>${p.qty || 0} item terjual · ${p.orders || 0} transaksi</small>
              </div>
              <strong>${money(p.revenue)}</strong>
            </div>
          `).join('') : '<div class="empty compact">Belum ada data penjualan produk.</div>'}
        </div>
      </section>
    </div>
  `;
}

// ---------------------------------------------------------------------
// VIEW 7: BROADCAST (Reseller Broadcast to Bot Customers)
// ---------------------------------------------------------------------
async function loadBroadcast() {
  if (state.broadcastPollTimer) {
    clearInterval(state.broadcastPollTimer);
    state.broadcastPollTimer = null;
  }

  const data = await api('/api/reseller/broadcasts?limit=50').catch(() => ({ items: [], total_users: 0, active_job: null, bot_username: '' }));
  const activeJob = data.active_job;
  const totalUsers = data.total_users || 0;
  const botUsername = data.bot_username || state.bot?.bot_username || '';

  const renderActiveCard = (j) => {
    if (!j || j.status === 'completed') return '';
    const pct = j.total ? Math.min(100, Math.round(((j.sent + j.failed) / j.total) * 100)) : 0;
    return `
      <div class="broadcast-monitor-card" id="rbcMonitor">
        <div class="broadcast-monitor-head">
          <div>
            <b>📡 Broadcast Sedang Dikirim...</b>
            <small>Job: <code>${esc(j.id)}</code></small>
          </div>
          ${badge(j.status || 'running')}
        </div>
        <div class="broadcast-monitor-stats">
          <div class="broadcast-monitor-stat"><small>Target</small><b>${j.total || 0}</b></div>
          <div class="broadcast-monitor-stat ok"><small>Terkirim</small><b>${j.sent || 0}</b></div>
          <div class="broadcast-monitor-stat bad"><small>Gagal</small><b>${j.failed || 0}</b></div>
        </div>
        <div class="broadcast-progress-bar"><div class="broadcast-progress-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  };

  const renderLogCard = (x) => {
    const btnInfo = x.button_text
      ? `<div class="log-button-info">🔘 <b>${esc(x.button_text)}</b> ${x.button_action === 'url' ? `(${esc(x.button_url || '-')})` : '(Aksi: /start)'}</div>`
      : '';
    return `
      <article class="broadcast-log-card">
        <div>
          <b>${esc(x.type === 'photo' ? '📷 Foto + Teks' : '📝 Teks')}</b>
          <small>${date(x.created_at)}</small>
        </div>
        <p>${esc(x.message || '-').slice(0, 200)}</p>
        ${btnInfo}
        <div>
          <span>Target <b>${x.total}</b></span>
          <span style="color:#15803d;background:#ecfdf5">Terkirim <b>${x.sent}</b></span>
          <span style="color:#b91c1c;background:#fef2f2">Gagal <b>${x.failed}</b></span>
        </div>
      </article>
    `;
  };

  $('#content').innerHTML = `
    <div class="broadcast-page">
      <div class="section-title product-section-title">
        <div>
          <h2>📢 Broadcast Pelanggan Toko</h2>
          <p>Kirim pesan massal, info produk baru, atau promo diskon ke semua pengguna bot Anda.</p>
        </div>
        <span>
          <span class="badge ok">👥 ${totalUsers} Pelanggan Bot</span>
        </span>
      </div>

      <div id="rbcMonitorWrap">${renderActiveCard(activeJob)}</div>

      <section class="settings-section">
        <div class="section-head">
          <div>
            <h3>✍️ Tulis Pesan Broadcast</h3>
            <p>Pesan akan dikirim otomatis oleh bot toko Anda ${botUsername ? `(@${esc(botUsername)})` : ''} ke seluruh pengguna.</p>
          </div>
        </div>
        <div class="broadcast-compose">
          <form id="rbcForm" class="form-grid">
            <label>Tipe Broadcast
              <select name="type" id="rbcType">
                <option value="text">Teks Saja</option>
                <option value="photo">Foto + Teks Caption</option>
              </select>
            </label>

            <label id="rbcMediaWrap" class="full hidden">Tautan Gambar / URL Foto
              <input type="url" name="media_url" id="rbcMediaUrl" placeholder="https://... atau direct link foto" />
              <small>Gunakan tautan gambar langsung (JPG, PNG, atau WEBP).</small>
            </label>

            <label class="full">Isi Pesan / Caption
              <textarea name="message" id="rbcMessage" rows="6" placeholder="Ketik pesan broadcast Anda di sini..."></textarea>
              <small>Mendukung format HTML: <code>&lt;b&gt;tebal&lt;/b&gt;</code>, <code>&lt;i&gt;miring&lt;/i&gt;</code>, <code>&lt;code&gt;kode&lt;/code&gt;</code>, <code>&lt;a href="..."&gt;link&lt;/a&gt;</code></small>
            </label>

            <div class="full broadcast-button-card">
              <div class="broadcast-button-head">
                <label class="inline-checkbox">
                  <input type="checkbox" id="rbcBtnToggle" name="button_enabled" />
                  <b>🔘 Sertakan Tombol Interaktif di Bawah Pesan</b>
                </label>
              </div>
              <div id="rbcBtnFields" class="form-grid hidden" style="margin-top:10px">
                <label>Aksi Tombol
                  <select id="rbcBtnAction" name="button_type">
                    <option value="start">🚀 Buka Menu Toko (/start)</option>
                    <option value="url">🔗 Buka Tautan Link (URL)</option>
                  </select>
                </label>
                <label>Label Tombol
                  <input type="text" id="rbcBtnText" name="button_text" value="🚀 Mulai Belanja" placeholder="Contoh: Mulai Belanja, Cek Promo..." />
                </label>
                <label id="rbcBtnUrlWrap" class="full hidden">URL Tujuan
                  <input type="url" id="rbcBtnUrl" name="button_url" placeholder="https://t.me/... atau https://..." />
                </label>
              </div>
            </div>

            <div class="full form-actions" style="display:flex;gap:10px;flex-wrap:wrap">
              <button type="button" class="neo-btn blue" id="rbcTestBtn">🧪 Uji Coba (Kirim ke Saya)</button>
              <button type="submit" class="neo-btn purple" id="rbcSubmitBtn">📢 Kirim ke ${totalUsers} Pelanggan</button>
            </div>
          </form>

          <div>
            <h4>Pratinjau Pesan Telegram</h4>
            <div id="rbcPreview" class="broadcast-preview">
              <div class="broadcast-preview-text" id="rbcPreviewText">Pesan broadcast akan tampil di sini.</div>
              <div class="broadcast-preview-btn-wrap hidden" id="rbcPreviewBtnWrap">
                <button type="button" class="telegram-preview-button" id="rbcPreviewBtn">🚀 Mulai Belanja</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-head">
          <div>
            <h3>🧾 Riwayat Broadcast Bot Anda</h3>
            <p>Daftar pengiriman pesan massal sebelumnya beserta status terkirim dan gagal.</p>
          </div>
          <button type="button" class="neo-btn white small" id="rbcRefreshLogs">↻ Refresh</button>
        </div>
        <div class="broadcast-log-list" id="rbcLogList">
          ${(data.items || []).length ? data.items.map(renderLogCard).join('') : '<div class="empty compact">Belum ada riwayat broadcast.</div>'}
        </div>
      </section>
    </div>
  `;

  // UI Interactive Handlers
  const syncPreview = () => {
    const msg = $('#rbcMessage')?.value || '';
    if ($('#rbcPreviewText')) {
      $('#rbcPreviewText').textContent = msg || 'Pesan broadcast akan tampil di sini.';
    }
    const btnOn = $('#rbcBtnToggle')?.checked;
    $('#rbcPreviewBtnWrap')?.classList.toggle('hidden', !btnOn);
    if (btnOn && $('#rbcPreviewBtn')) {
      $('#rbcPreviewBtn').textContent = $('#rbcBtnText')?.value || '🚀 Tombol';
    }
  };

  $('#rbcType').onchange = () => {
    const isPhoto = $('#rbcType').value === 'photo';
    $('#rbcMediaWrap').classList.toggle('hidden', !isPhoto);
  };

  $('#rbcMessage').oninput = syncPreview;
  $('#rbcBtnText').oninput = syncPreview;

  $('#rbcBtnToggle').onchange = () => {
    const on = $('#rbcBtnToggle').checked;
    $('#rbcBtnFields').classList.toggle('hidden', !on);
    syncPreview();
  };

  $('#rbcBtnAction').onchange = () => {
    const isUrl = $('#rbcBtnAction').value === 'url';
    $('#rbcBtnUrlWrap').classList.toggle('hidden', !isUrl);
    if (isUrl && !$('#rbcBtnText').value.trim()) $('#rbcBtnText').value = '🔗 Buka Link';
    else if (!isUrl && !$('#rbcBtnText').value.trim()) $('#rbcBtnText').value = '🚀 Mulai Belanja';
    syncPreview();
  };

  if ($('#rbcRefreshLogs')) $('#rbcRefreshLogs').onclick = loadBroadcast;

  const startPollingJob = (jobId) => {
    if (state.broadcastPollTimer) clearInterval(state.broadcastPollTimer);
    state.broadcastPollTimer = setInterval(async () => {
      try {
        const st = await api(`/api/reseller/broadcast/status?id=${encodeURIComponent(jobId)}`);
        const j = st.job;
        if (!j) return;
        const wrap = $('#rbcMonitorWrap');
        if (wrap) wrap.innerHTML = renderActiveCard(j);
        if (j.status === 'completed' || j.status === 'failed') {
          clearInterval(state.broadcastPollTimer);
          state.broadcastPollTimer = null;
          toast(j.status === 'completed' ? `Broadcast selesai: ${j.sent || 0} terkirim, ${j.failed || 0} gagal` : `Broadcast gagal: ${j.error || 'Terjadi kesalahan'}`);
          const refreshed = await api('/api/reseller/broadcasts?limit=50').catch(() => null);
          if (refreshed && $('#rbcLogList')) {
            $('#rbcLogList').innerHTML = (refreshed.items || []).length ? refreshed.items.map(renderLogCard).join('') : '<div class="empty compact">Belum ada riwayat broadcast.</div>';
          }
        }
      } catch {
        clearInterval(state.broadcastPollTimer);
        state.broadcastPollTimer = null;
      }
    }, 1500);
  };

  if (activeJob && activeJob.status === 'running') {
    startPollingJob(activeJob.id);
  }

  // Test button
  $('#rbcTestBtn').onclick = async () => {
    const msg = String($('#rbcMessage').value || '').trim();
    if (!msg) {
      toast('Tulis pesan broadcast terlebih dahulu.', true);
      return;
    }
    const type = $('#rbcType').value;
    const media_url = String($('#rbcMediaUrl')?.value || '').trim();
    if (type === 'photo' && !media_url) {
      toast('Tautan URL gambar wajib diisi untuk tipe foto.', true);
      return;
    }
    const btnEnabled = $('#rbcBtnToggle').checked;
    const btnType = $('#rbcBtnAction').value;
    const btnText = ($('#rbcBtnText').value || '').trim();
    const btnUrl = ($('#rbcBtnUrl').value || '').trim();

    if (btnEnabled && !btnText) {
      toast('Label tombol harus diisi.', true);
      return;
    }
    if (btnEnabled && btnType === 'url' && !btnUrl) {
      toast('URL tombol harus diisi.', true);
      return;
    }

    const payload = {
      type,
      message: msg,
      media_url,
      button: {
        enabled: btnEnabled,
        type: btnType,
        text: btnText,
        url: btnUrl
      }
    };

    const btn = $('#rbcTestBtn');
    btn.disabled = true;
    btn.textContent = 'Mengirim uji coba...';
    try {
      const res = await api('/api/reseller/broadcast/test', {
        method: 'POST',
        body: payload
      });
      toast(res.message || 'Pesan uji coba berhasil dikirim ke Telegram Anda!');
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = '🧪 Uji Coba (Kirim ke Saya)';
    }
  };

  // Submit Broadcast to all customers
  $('#rbcForm').onsubmit = async (e) => {
    e.preventDefault();
    const msg = String($('#rbcMessage').value || '').trim();
    if (!msg) {
      toast('Tulis pesan broadcast terlebih dahulu.', true);
      return;
    }
    const type = $('#rbcType').value;
    const media_url = String($('#rbcMediaUrl')?.value || '').trim();
    if (type === 'photo' && !media_url) {
      toast('Tautan URL gambar wajib diisi untuk tipe foto.', true);
      return;
    }
    const btnEnabled = $('#rbcBtnToggle').checked;
    const btnType = $('#rbcBtnAction').value;
    const btnText = ($('#rbcBtnText').value || '').trim();
    const btnUrl = ($('#rbcBtnUrl').value || '').trim();

    if (btnEnabled && !btnText) {
      toast('Label tombol harus diisi.', true);
      return;
    }
    if (btnEnabled && btnType === 'url' && !btnUrl) {
      toast('URL tombol harus diisi.', true);
      return;
    }

    if (totalUsers <= 0) {
      toast('Belum ada pelanggan terdaftar di bot toko Anda.', true);
      return;
    }

    if (!confirm(`Konfirmasi Kirim Broadcast?\n\nPesan ini akan dikirimkan kepada ${totalUsers} pelanggan bot toko Anda.`)) {
      return;
    }

    const payload = {
      type,
      message: msg,
      media_url,
      button: {
        enabled: btnEnabled,
        type: btnType,
        text: btnText,
        url: btnUrl
      }
    };

    const submitBtn = $('#rbcSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Memulai broadcast...';
    try {
      const res = await api('/api/reseller/broadcast', {
        method: 'POST',
        body: payload
      });
      toast('Broadcast berhasil dimulai!');
      if (res.job?.id) {
        startPollingJob(res.job.id);
      }
    } catch (err) {
      toast(err.message, true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = `📢 Kirim ke ${totalUsers} Pelanggan`;
    }
  };
}

// ---------------------------------------------------------------------
// VIEW: USER (PELANGGAN BOT RESELLER)
// ---------------------------------------------------------------------
function userCards(rows) {
  return rows.length ? rows.map(u => `
    <article class="user-card">
      <div class="user-avatar">${firstLetter(u.first_name || u.username || u.telegram_id)}</div>
      <div class="user-main">
        <h3>${esc([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || u.telegram_id)}</h3>
        <p>${u.username ? '@' + esc(u.username) + ' · ' : ''}<span class="mono">${esc(u.telegram_id)}</span></p>
        <div class="user-meta">
          <span>Saldo <b>${money(u.balance_main ?? u.balance ?? 0)}</b></span>
          <span>Status ${badge(u.status)}</span>
          <span>Terakhir Aktif <b>${esc(date(u.last_seen_at))}</b></span>
          <span>Bergabung <b>${esc(date(u.first_seen_at))}</b></span>
        </div>
      </div>
      <div class="user-actions">
        ${u.status === 'blocked' ? `<button class="neo-btn green small" data-unblock-user="${esc(u.telegram_id)}">Aktifkan</button>` : ''}
        <button class="neo-btn yellow small" data-wallet-user="${esc(u.telegram_id)}">Saldo</button>
        <button class="neo-btn blue small" data-chat-user="${esc(u.telegram_id)}">Chat</button>
        <button class="neo-btn red small" data-delete-user="${esc(u.telegram_id)}">Hapus</button>
      </div>
    </article>
  `).join('') : '<div class="empty-product">Belum ada user Telegram. Pelanggan akan muncul otomatis setelah berinteraksi dengan bot toko Anda.</div>';
}

function filterUsers() {
  const q = ($('#userSearch')?.value || '').toLowerCase().trim();
  const st = $('#userStatus')?.value || '';
  const rows = (state.users || []).filter(u =>
    (!q || [u.telegram_id, u.username, u.first_name, u.last_name].some(x => String(x || '').toLowerCase().includes(q))) &&
    (!st || u.status === st)
  );
  const cardsEl = $('#userCards');
  if (cardsEl) cardsEl.innerHTML = userCards(rows);
  const total = (state.users || []).length;
  if ($('#userCount')) {
    const act = (state.users || []).filter(u => u.status === 'active').length;
    const blk = (state.users || []).filter(u => u.status === 'blocked').length;
    $('#userCount').textContent = rows.length === total ? `${total} user (${act} aktif, ${blk} blocked)` : `${rows.length} / ${total} user`;
  }
  bindUserActions();
}

function bindUserToolbarActions() {
  if ($('#unblockAllUsers')) {
    $('#unblockAllUsers').onclick = async () => {
      if (!confirm('Aktifkan kembali semua user yang berstatus blocked menjadi active di bot Anda?')) return;
      const btn = $('#unblockAllUsers');
      btn.disabled = true;
      btn.textContent = 'Memproses...';
      try {
        const res = await api('/api/reseller/users/activate-all', { method: 'POST', body: {} });
        toast(`${res.changes || 0} user berhasil diaktifkan`);
        await loadUsers(true);
      } catch (e) {
        toast(e.message, true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⚡ Aktifkan Semua Blocked'; }
      }
    };
  }
}

function bindUserActions() {
  $$('[data-unblock-user]').forEach(b => b.onclick = async () => {
    try {
      await api(`/api/reseller/users/${encodeURIComponent(b.dataset.unblockUser)}`, { method: 'PATCH', body: { status: 'active' } });
      toast('User diaktifkan');
      loadUsers(true);
    } catch (e) {
      toast(e.message, true);
    }
  });

  $$('[data-wallet-user]').forEach(b => b.onclick = () => {
    const u = (state.users || []).find(x => String(x.telegram_id) === b.dataset.walletUser);
    openWallet(u);
  });

  $$('[data-chat-user]').forEach(b => b.onclick = () => openSendMessage(b.dataset.chatUser));

  $$('[data-delete-user]').forEach(b => b.onclick = () => remove(`/api/reseller/users/${encodeURIComponent(b.dataset.deleteUser)}`, 'Hapus pengguna ini dari database bot Anda?', () => loadUsers(true)));
}

function openWallet(u) {
  if (!u) return;
  modal('Atur Saldo · ' + (u.first_name || u.username || u.telegram_id), `
    <div class="form-grid">
      <label class="full">Saldo Pengguna
        <input name="balance_main" type="number" min="0" value="${Number(u.balance_main ?? u.balance ?? 0)}" required />
      </label>
      <label class="full">Telegram ID
        <input value="${esc(u.telegram_id)}" disabled />
      </label>
    </div>
  `, async b => {
    b.balance_main = Number(b.balance_main || 0);
    await api(`/api/reseller/users/${encodeURIComponent(u.telegram_id)}/wallet`, { method: 'POST', body: b });
    toast('Saldo pengguna diperbarui');
    loadUsers(true);
  });
}

function openSendMessage(id) {
  modal('Kirim Pesan ke User via Bot Anda', `
    <label class="field" style="display:grid;gap:6px;margin-bottom:12px">Telegram ID
      <input value="${esc(id)}" disabled />
    </label>
    <label class="field" style="display:grid;gap:6px">Pesan
      <textarea name="message" required rows="6" placeholder="Ketik pesan yang akan dikirimkan langsung dari bot toko Anda ke user ini..."></textarea>
    </label>
  `, async b => {
    await api(`/api/reseller/users/${encodeURIComponent(id)}/message`, { method: 'POST', body: { message: b.message } });
    toast('Pesan berhasil terkirim via bot toko');
  }, { submit: 'Kirim Pesan' });
}

async function loadUsers(preserveScroll = false) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const currentSearch = $('#userSearch')?.value || '';
  const currentStatus = $('#userStatus')?.value || '';
  const existingCards = $('#userCards');
  const r = await api('/api/reseller/users?limit=50000');
  state.users = Array.isArray(r.items) ? r.items : [];
  const actCount = state.users.filter(u => u.status === 'active').length;
  const blkCount = state.users.filter(u => u.status === 'blocked').length;

  if (!existingCards) {
    $('#content').innerHTML = `
      <div class="section-title product-section-title">
        <div>
          <h2>👥 Manajemen User Pelanggan</h2>
          <p>Daftar seluruh pengguna yang berinteraksi atau berbelanja di bot toko Telegram Anda.</p>
        </div>
        <span>
          <span class="badge ok">Total ${state.users.length} User</span>
        </span>
      </div>

      <div class="toolbar user-toolbar">
        <div class="searchbox"><input id="userSearch" placeholder="Cari ID, username, nama..." /></div>
        <select id="userStatus">
          <option value="">Semua Status</option>
          <option value="active">Aktif</option>
          <option value="blocked">Blocked</option>
        </select>
        <button type="button" id="unblockAllUsers" class="neo-btn green small">⚡ Aktifkan Semua Blocked</button>
        <div class="toolbar-count" id="userCount">${state.users.length} user (${actCount} aktif, ${blkCount} blocked)</div>
      </div>
      <div id="userCards" class="user-list">${userCards(state.users)}</div>
    `;
    $('#userSearch').oninput = filterUsers;
    $('#userStatus').onchange = filterUsers;
    bindUserToolbarActions();
  } else {
    if (currentSearch && $('#userSearch')) $('#userSearch').value = currentSearch;
    if (currentStatus && $('#userStatus')) $('#userStatus').value = currentStatus;
    if ($('#userCount')) $('#userCount').textContent = `${state.users.length} user (${actCount} aktif, ${blkCount} blocked)`;
  }
  filterUsers();
  if (preserveScroll) window.scrollTo({ top: scrollY, behavior: 'instant' });
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

  const p = new URLSearchParams(window.location.search);
  const paramResellerId = p.get('id') || p.get('reseller_id');
  const paramTgId = p.get('tg_id');

  let initData = tg?.initData || '';
  let tgUser = tg?.initDataUnsafe?.user || null;

  if (!initData && !tgUser && (paramTgId || paramResellerId)) {
    tgUser = {
      id: paramTgId || paramResellerId,
      first_name: p.get('name') || 'Mitra Reseller',
      username: p.get('username') || ''
    };
  }

  // If opened with Telegram credentials, ALWAYS authenticate to get fresh session & profile
  if (initData || tgUser) {
    try {
      const res = await api('/api/reseller/auth', {
        method: 'POST',
        body: { initData, telegram_user: tgUser, reseller_id: paramResellerId }
      });
      state.token = res.token;
      sessionStorage.setItem('ilink_reseller_token', res.token);
      localStorage.setItem('ilink_reseller_token', res.token);
      state.reseller = res.reseller;
      state.bot = res.bot;
      state.runtime = res.runtime;
    } catch (err) {
      console.warn('[reseller:auth_init]', err.message);
      sessionStorage.removeItem('ilink_reseller_token');
      localStorage.removeItem('ilink_reseller_token');
      state.token = '';
      throw err;
    }
  } else if (!state.token) {
    throw new Error('Data otentikasi Telegram tidak ditemukan. Silakan buka Dashboard dari bot Telegram Anda.');
  }

  updateShellUI();
  await navigate('dashboard');
}

(async () => {
  try {
    await initialize();
  } catch (err) {
    const msg = String(err.message || '');
    let title = 'Gagal Membuka Dashboard';
    let icon = '⚠️';
    let hint = msg;
    if (msg.includes('menunggu persetujuan')) {
      title = 'Permohonan Menunggu Persetujuan';
      icon = '⏳';
      hint = 'Pendaftaran kemitraan reseller Anda sedang dalam antrean verifikasi Owner. Begitu disetujui, dashboard ini akan otomatis terbuka.';
    } else if (msg.includes('belum terdaftar') || msg.includes('bukan mitra')) {
      title = 'Belum Terdaftar Sebagai Reseller';
      icon = '🤝';
      hint = 'Mini App ini khusus untuk mitra reseller toko. Silakan buka Bot Utama kami untuk mendaftar kemitraan reseller.';
    } else if (msg.includes('ditolak')) {
      title = 'Pendaftaran Belum Disetujui';
      icon = '❌';
      hint = 'Mohon maaf, permohonan kemitraan reseller Anda ditolak oleh Owner. Silakan hubungi Owner atau ajukan ulang melalui Bot Utama.';
    } else if (msg.includes('dinonaktifkan') || msg.includes('sementara')) {
      title = 'Akun Kemitraan Ditangguhkan';
      icon = '⛔';
      hint = 'Akun kemitraan reseller Anda saat ini ditangguhkan oleh Owner. Silakan hubungi Customer Service.';
    } else if (msg.includes('tidak ditemukan atau belum aktif')) {
      title = 'Akun Reseller Belum Aktif';
      icon = '🤖';
      hint = 'Akun bot reseller Anda belum terhubung atau belum aktif. Silakan buka bot utama untuk memasukkan token bot Telegram Anda dari @BotFather.';
    }
    $('#content').innerHTML = `
      <div class="empty-product" style="padding:40px 20px;text-align:center">
        <div style="font-size:48px;margin-bottom:14px">${icon}</div>
        <h3 style="font-size:18px;font-weight:800;margin-bottom:8px">${esc(title)}</h3>
        <p style="margin:0 auto 20px;max-width:380px;color:var(--muted);font-size:13px;line-height:1.5">${esc(hint)}</p>
        <button type="button" class="neo-btn purple" onclick="sessionStorage.removeItem('ilink_reseller_token');localStorage.removeItem('ilink_reseller_token');window.location.reload()">🔄 Coba Lagi</button>
      </div>
    `;
  }
})();
