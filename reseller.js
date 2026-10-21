// Reseller Mini App Controller
(function() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#ffffff');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#f6f6f2');
    } catch (e) {
      console.warn('[telegram:init]', e);
    }
  }

  const state = {
    token: localStorage.getItem('ilink_reseller_token') || '',
    reseller: null,
    bot: null,
    runtime: null,
    products: [],
    pricingOverrides: {},
    pendingPricing: {},
    orders: [],
    withdrawals: [],
    activeTab: 'tabOverview',
    isLoading: false
  };

  // Helper functions
  function money(v) {
    return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
  }

  function formatWIB(val) {
    if (!val) return '-';
    try {
      return new Date(val).toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return String(val);
    }
  }

  function showToast(message, type = 'good', duration = 3000) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show ' + (type === 'bad' ? 'bad' : 'good');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.className = 'toast';
    }, duration);
  }

  async function api(path, options = {}) {
    const url = '/api/gateway?path=' + encodeURIComponent(path);
    const headers = { ...(options.headers || {}) };
    if (state.token) {
      headers['authorization'] = 'Bearer ' + state.token;
    }
    if (options.body && typeof options.body !== 'string' && !(options.body instanceof Blob)) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { ...options, headers });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : { ok: res.ok, message: await res.text() };

    if (res.status === 401) {
      localStorage.removeItem('ilink_reseller_token');
      state.token = '';
      throw new Error(data.message || 'Sesi berakhir. Silakan buka kembali dari bot Telegram.');
    }
    if (!res.ok || data.ok === false) {
      throw new Error(data.message || data.error || 'Terjadi kesalahan sistem.');
    }
    return data;
  }

  // Authentication & Initialization
  async function initAuth() {
    const loadingView = document.getElementById('loadingView');
    const errorView = document.getElementById('errorView');
    const mainContainer = document.getElementById('mainContainer');

    loadingView.classList.remove('hidden');
    errorView.classList.add('hidden');

    try {
      let initData = tg?.initData || '';
      let tgUser = tg?.initDataUnsafe?.user || null;

      // Browser test fallback if opened outside Telegram directly
      if (!initData && !tgUser) {
        const urlParams = new URLSearchParams(window.location.search);
        const testId = urlParams.get('id') || urlParams.get('tg_id');
        if (testId) {
          tgUser = {
            id: testId,
            first_name: urlParams.get('name') || 'Reseller Demo',
            username: urlParams.get('username') || 'reseller_demo'
          };
        } else {
          // If already has token, test verify
          if (state.token) {
            try {
              const me = await api('/api/reseller/me');
              state.reseller = me.reseller;
              state.bot = me.bot;
              state.runtime = me.runtime;
              onAuthSuccess();
              return;
            } catch {}
          }
          // Default test mock user for demonstration / testing in browser
          tgUser = {
            id: '99887766',
            first_name: 'Reseller Demo',
            username: 'reseller_demo'
          };
        }
      }

      // Authenticate / auto-register reseller
      const payload = {};
      if (initData) payload.initData = initData;
      if (tgUser) payload.telegram_user = tgUser;

      const authRes = await api('/api/reseller/auth', {
        method: 'POST',
        body: payload
      });

      state.token = authRes.token;
      localStorage.setItem('ilink_reseller_token', state.token);
      state.reseller = authRes.reseller;
      state.bot = authRes.bot;
      state.runtime = authRes.runtime;

      onAuthSuccess();
    } catch (e) {
      console.error('[auth:failed]', e);
      loadingView.classList.add('hidden');
      errorView.classList.remove('hidden');
      document.getElementById('errorMessage').textContent = 'Otentikasi Gagal';
      document.getElementById('errorDetail').textContent = e.message || 'Gagal memverifikasi sesi Telegram Anda.';
    }
  }

  function onAuthSuccess() {
    document.getElementById('loadingView').classList.add('hidden');
    document.getElementById('errorView').classList.add('hidden');

    updateHeaderUI();
    switchTab('tabOverview');
    loadOverviewData();
  }

  function updateHeaderUI() {
    const r = state.reseller || {};
    const b = state.bot || {};
    const rt = state.runtime || {};

    const storeName = b.branding?.store_name || b.bot_name || r.name || 'Toko Reseller';
    document.getElementById('headerStoreName').textContent = storeName;
    document.getElementById('headerTgId').textContent = r.telegram_id || '-';
    document.getElementById('headerUsername').textContent = r.username ? `@${r.username}` : (r.name || 'Reseller');

    const badge = document.getElementById('botStatusBadge');
    if (!b || !b.bot_token) {
      badge.textContent = '⚪ Belum Aktif';
      badge.className = 'bot-badge';
    } else if (rt.running) {
      badge.textContent = '🟢 Online';
      badge.className = 'bot-badge online';
    } else if (b.status === 'error') {
      badge.textContent = '🔴 Error';
      badge.className = 'bot-badge error';
    } else {
      badge.textContent = '🟡 Stopped';
      badge.className = 'bot-badge stopped';
    }
  }

  // Tab Navigation
  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (tabId === 'tabOverview') loadOverviewData();
    else if (tabId === 'tabBot') renderBotForm();
    else if (tabId === 'tabPricing') loadPricingData();
    else if (tabId === 'tabWithdraw') loadWithdrawalData();
    else if (tabId === 'tabOrders') loadOrdersData();
  }

  // Tab 1: Overview
  async function loadOverviewData() {
    try {
      const data = await api('/api/reseller/overview');
      state.reseller = data.reseller;
      state.bot = data.bot;
      state.runtime = data.runtime;

      updateHeaderUI();

      // Update Hero
      document.getElementById('overviewProfitBalance').textContent = money(data.stats.profit_balance);
      document.getElementById('overviewWithdrawn').textContent = money(data.stats.withdrawn_total);
      const modeStr = data.reseller.markup_mode === 'percent'
        ? `+${data.reseller.markup_value}%`
        : `+${money(data.reseller.markup_value)}`;
      document.getElementById('overviewMarkupMode').textContent = modeStr;

      // Update Bot Banner
      const b = data.bot;
      const rt = data.runtime || {};
      const bannerTitle = document.getElementById('botBannerTitle');
      const bannerStatus = document.getElementById('botBannerStatus');
      const bannerDesc = document.getElementById('botBannerDesc');
      const bannerIcon = document.getElementById('botStatusBannerIcon');

      if (!b || !b.bot_token) {
        bannerTitle.textContent = 'Bot Toko: Belum Diatur';
        bannerStatus.textContent = 'Setup';
        bannerStatus.className = 'badge';
        bannerDesc.textContent = 'Hubungkan token BotFather agar pelanggan bisa langsung belanja di bot Anda.';
        bannerIcon.textContent = '🤖';
      } else if (rt.running) {
        bannerTitle.textContent = `@${b.bot_username || 'bot'} (Aktif)`;
        bannerStatus.textContent = 'Online';
        bannerStatus.className = 'badge green';
        bannerDesc.textContent = `Bot toko aktif melayani pesanan 24 jam dengan CS otomatis ke akun Anda.`;
        bannerIcon.textContent = '🟢';
      } else {
        bannerTitle.textContent = `@${b.bot_username || 'bot'} (Berhenti)`;
        bannerStatus.textContent = 'Stopped';
        bannerStatus.className = 'badge yellow';
        bannerDesc.textContent = b.last_error ? `Kendala: ${b.last_error}` : 'Bot sedang dihentikan sementara.';
        bannerIcon.textContent = '⏸️';
      }

      // Update KPIs
      document.getElementById('overviewTotalRevenue').textContent = money(data.stats.total_revenue);
      document.getElementById('overviewTotalProfit').textContent = money(data.stats.total_profit_earned);
      document.getElementById('overviewTotalOrders').textContent = `${data.stats.total_orders} Pesanan`;
      document.getElementById('overviewTotalUsers').textContent = `${data.stats.total_users} Pelanggan`;

      // Update Recent Orders
      const recentList = document.getElementById('recentOrdersList');
      if (!data.recent_orders || !data.recent_orders.length) {
        recentList.innerHTML = '<div class="empty-state-mini">Belum ada transaksi di bot Anda.</div>';
      } else {
        recentList.innerHTML = data.recent_orders.map(o => `
          <div class="compact-order-item">
            <div class="order-item-left">
              <b>${escapeHtml(o.product_name)}</b>
              <small>${escapeHtml(o.order_ref)} · ${formatWIB(o.created_at)}</small>
            </div>
            <div class="order-item-right">
              <span class="order-profit-badge">+${money(o.reseller_profit)}</span>
            </div>
          </div>
        `).join('');
      }
    } catch (e) {
      console.warn('[overview:load]', e);
    }
  }

  // Tab 2: Bot Configuration
  function renderBotForm() {
    const b = state.bot || {};
    const r = state.reseller || {};
    const br = b.branding || {};

    document.getElementById('inputBotToken').value = b.bot_token || '';
    document.getElementById('inputBotUsername').value = (b.bot_username || '').replace(/^@+/, '');
    document.getElementById('inputStoreName').value = br.store_name || b.bot_name || r.name || '';

    // CS is automatically pre-filled to reseller's telegram account if empty!
    const defaultCs = r.username ? `https://t.me/${r.username}` : (r.telegram_id ? `tg://user?id=${r.telegram_id}` : '');
    document.getElementById('inputBotCs').value = br.cs_contact || defaultCs;

    document.getElementById('inputStartMedia').value = br.start_media_url || '';
    document.getElementById('inputStartMessage').value = br.start_message || '';
    document.getElementById('inputChannelUrl').value = br.channel_url || '';
    document.getElementById('inputNokosLink').value = br.nokos_link || '';

    const badge = document.getElementById('botConfigStateBadge');
    if (!b.bot_token) {
      badge.textContent = 'Belum Setup';
      badge.className = 'badge';
    } else if (state.runtime?.running) {
      badge.textContent = '🟢 Online';
      badge.className = 'badge green';
    } else {
      badge.textContent = '🟡 Stopped';
      badge.className = 'badge yellow';
    }
  }

  async function handleVerifyToken() {
    const token = document.getElementById('inputBotToken').value.trim();
    const resultDiv = document.getElementById('tokenVerifyResult');
    if (!token) {
      showToast('Masukkan token bot terlebih dahulu', 'bad');
      return;
    }

    resultDiv.classList.remove('hidden');
    resultDiv.className = 'verify-feedback';
    resultDiv.textContent = 'Sedang memverifikasi token ke Telegram...';

    try {
      const res = await api('/api/reseller/bot/verify-token', {
        method: 'POST',
        body: { bot_token: token }
      });
      resultDiv.className = 'verify-feedback ok';
      resultDiv.innerHTML = `✅ Token valid! Bot: <b>@${res.bot.username}</b> (${res.bot.first_name})`;
      document.getElementById('inputBotUsername').value = res.bot.username;
      if (!document.getElementById('inputStoreName').value) {
        document.getElementById('inputStoreName').value = res.bot.first_name;
      }
      showToast('Token bot berhasil diverifikasi!', 'good');
    } catch (e) {
      resultDiv.className = 'verify-feedback bad';
      resultDiv.textContent = `❌ ${e.message || 'Token tidak valid'}`;
      showToast(e.message || 'Verifikasi gagal', 'bad');
    }
  }

  async function handleSaveBot(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveBot');
    btn.disabled = true;
    btn.textContent = 'Menyimpan & Menjalankan...';

    const token = document.getElementById('inputBotToken').value.trim();
    const username = document.getElementById('inputBotUsername').value.trim().replace(/^@+/, '');
    const storeName = document.getElementById('inputStoreName').value.trim();
    const csContact = document.getElementById('inputBotCs').value.trim();
    const startMedia = document.getElementById('inputStartMedia').value.trim();
    const startMsg = document.getElementById('inputStartMessage').value.trim();
    const channelUrl = document.getElementById('inputChannelUrl').value.trim();
    const nokosLink = document.getElementById('inputNokosLink').value.trim();

    try {
      const res = await api('/api/reseller/bot/setup', {
        method: 'POST',
        body: {
          bot_token: token,
          bot_username: username,
          bot_name: storeName,
          store_name: storeName,
          cs_contact: csContact,
          start_media_url: startMedia,
          start_message: startMsg,
          channel_url: channelUrl,
          nokos_link: nokosLink
        }
      });

      state.bot = res.bot;
      state.runtime = res.runtime;
      updateHeaderUI();
      renderBotForm();
      showToast('🎉 Bot toko berhasil disimpan dan dijalankan!', 'good');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan bot toko', 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Simpan & Jalankan Bot';
    }
  }

  async function handleBotAction(action) {
    if (!state.bot) {
      showToast('Bot belum dibuat. Simpan bot terlebih dahulu.', 'bad');
      return;
    }
    try {
      showToast(`Memproses ${action} bot...`, 'good');
      const res = await api('/api/reseller/bot/action', {
        method: 'POST',
        body: { action }
      });
      state.bot = res.bot;
      state.runtime = res.runtime;
      updateHeaderUI();
      renderBotForm();
      showToast(`Bot berhasil di-${action}!`, 'good');
    } catch (e) {
      showToast(e.message || `Gagal ${action} bot`, 'bad');
    }
  }

  // Tab 3: Pricing & Margins
  async function loadPricingData() {
    const container = document.getElementById('productPricingList');
    container.innerHTML = '<div class="loader-card"><div class="loader-spinner"></div><p>Memuat daftar produk...</p></div>';

    try {
      const res = await api('/api/reseller/products');
      state.products = res.items || [];
      state.pricingOverrides = (state.bot?.pricing_overrides) || {};
      state.pendingPricing = {};
      updateFloatingSaveBar();

      // Pre-fill global markup inputs
      const gm = res.global_markup || {};
      document.getElementById('selectGlobalMarkupMode').value = gm.mode || 'fixed';
      document.getElementById('inputGlobalMarkupValue').value = gm.value || 2000;

      renderPricingList();
    } catch (e) {
      container.innerHTML = `<div class="empty">Gagal memuat produk: ${escapeHtml(e.message)}</div>`;
    }
  }

  function renderPricingList(searchFilter = '', statusFilter = 'all') {
    const container = document.getElementById('productPricingList');
    const q = (searchFilter || document.getElementById('inputSearchProduct').value || '').toLowerCase().trim();

    const filtered = state.products.filter(p => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q);
      const isEnabled = state.pendingPricing[p.code]?.enabled !== undefined
        ? state.pendingPricing[p.code].enabled
        : p.enabled;

      if (!matchSearch) return false;
      if (statusFilter === 'enabled') return isEnabled;
      if (statusFilter === 'disabled') return !isEnabled;
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = '<div class="empty">Tidak ada produk yang cocok dengan pencarian.</div>';
      return;
    }

    container.innerHTML = filtered.map(p => {
      const pending = state.pendingPricing[p.code] || {};
      const isEnabled = pending.enabled !== undefined ? pending.enabled : p.enabled;
      const currentMargin = pending.margin !== undefined ? pending.margin : p.current_margin;
      const calculatedSell = p.base_cost + Number(currentMargin || 0);

      return `
        <div class="product-price-card ${isEnabled ? '' : 'disabled'}" data-code="${escapeHtml(p.code)}">
          <div class="price-card-head">
            <div class="price-card-title">
              <h4>${escapeHtml(p.name)}</h4>
              <small>Kode: <code>${escapeHtml(p.code)}</code> · Kategori: ${escapeHtml(p.category || 'Digital')}</small>
            </div>
            <label class="switch-label" title="Aktifkan/Nonaktifkan di bot tokomu">
              <input type="checkbox" class="toggle-product-enabled" data-code="${escapeHtml(p.code)}" ${isEnabled ? 'checked' : ''}>
              <span class="switch-slider"></span>
              <span class="switch-text">${isEnabled ? 'Aktif' : 'Off'}</span>
            </label>
          </div>

          <div class="price-calc-row">
            <div class="price-box">
              <small>MODAL OWNER</small>
              <strong>${money(p.base_cost)}</strong>
            </div>
            <div class="price-box highlight">
              <small>PROFITMU (+)</small>
              <strong class="label-profit">+${money(currentMargin)}</strong>
            </div>
            <div class="price-box">
              <small>HARGA JUAL PEMBELI</small>
              <strong class="label-sell">${money(calculatedSell)}</strong>
            </div>
          </div>

          <div class="margin-input-row">
            <label>Margin Profit (Rp):</label>
            <input type="number" class="input-margin-val" data-code="${escapeHtml(p.code)}"
                   value="${currentMargin}" min="0" step="500" placeholder="Contoh: 2000">
          </div>
        </div>
      `;
    }).join('');

    // Attach listeners
    container.querySelectorAll('.input-margin-val').forEach(input => {
      input.addEventListener('input', onMarginInputChange);
    });
    container.querySelectorAll('.toggle-product-enabled').forEach(chk => {
      chk.addEventListener('change', onToggleEnabledChange);
    });
  }

  function onMarginInputChange(e) {
    const code = e.target.dataset.code;
    const margin = Math.max(0, Number(e.target.value) || 0);
    const card = e.target.closest('.product-price-card');
    const p = state.products.find(x => x.code === code);
    if (!p) return;

    if (!state.pendingPricing[code]) {
      state.pendingPricing[code] = {
        margin: p.current_margin,
        sell_price: p.current_sell_price,
        enabled: p.enabled
      };
    }
    state.pendingPricing[code].margin = margin;
    state.pendingPricing[code].sell_price = p.base_cost + margin;

    // Update live labels in card
    card.querySelector('.label-profit').textContent = `+${money(margin)}`;
    card.querySelector('.label-sell').textContent = money(p.base_cost + margin);

    updateFloatingSaveBar();
  }

  function onToggleEnabledChange(e) {
    const code = e.target.dataset.code;
    const isChecked = e.target.checked;
    const card = e.target.closest('.product-price-card');
    const p = state.products.find(x => x.code === code);
    if (!p) return;

    if (!state.pendingPricing[code]) {
      state.pendingPricing[code] = {
        margin: p.current_margin,
        sell_price: p.current_sell_price,
        enabled: p.enabled
      };
    }
    state.pendingPricing[code].enabled = isChecked;
    card.classList.toggle('disabled', !isChecked);
    card.querySelector('.switch-text').textContent = isChecked ? 'Aktif' : 'Off';

    updateFloatingSaveBar();
  }

  function updateFloatingSaveBar() {
    const bar = document.getElementById('floatingSaveBar');
    const count = Object.keys(state.pendingPricing).length;
    if (count > 0) {
      document.getElementById('pendingChangesCount').textContent = `${count} perubahan harga belum disimpan`;
      bar.classList.add('show');
    } else {
      bar.classList.remove('show');
    }
  }

  async function handleSavePricingChanges() {
    if (!state.bot) {
      showToast('Bot belum dibuat. Harap atur bot terlebih dahulu.', 'bad');
      return;
    }
    const btn = document.getElementById('btnSavePricingChanges');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';

    try {
      const mergedOverrides = { ...(state.bot.pricing_overrides || {}), ...state.pendingPricing };
      const res = await api('/api/reseller/products/pricing', {
        method: 'POST',
        body: { pricing_overrides: mergedOverrides }
      });

      state.bot.pricing_overrides = res.pricing_overrides;
      state.pendingPricing = {};
      updateFloatingSaveBar();
      showToast('✅ Pengaturan harga berhasil disimpan!', 'good');
      loadPricingData();
    } catch (e) {
      showToast(e.message || 'Gagal menyimpan harga', 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Simpan Perubahan Harga';
    }
  }

  function handleApplyGlobalMarkup() {
    const mode = document.getElementById('selectGlobalMarkupMode').value;
    const val = Number(document.getElementById('inputGlobalMarkupValue').value || 0);

    state.products.forEach(p => {
      let margin = 0;
      if (mode === 'percent') {
        margin = Math.round(p.base_cost * (val / 100));
      } else {
        margin = Math.round(val);
      }
      if (!state.pendingPricing[p.code]) {
        state.pendingPricing[p.code] = {
          margin: p.current_margin,
          sell_price: p.current_sell_price,
          enabled: p.enabled
        };
      }
      state.pendingPricing[p.code].margin = margin;
      state.pendingPricing[p.code].sell_price = p.base_cost + margin;
    });

    renderPricingList();
    updateFloatingSaveBar();
    showToast(`Margin diterapkan ke ${state.products.length} produk. Jangan lupa tekan Simpan!`, 'good');
  }

  // Tab 4: Withdrawals
  async function loadWithdrawalData() {
    try {
      const [resellerData, wdData] = await Promise.all([
        api('/api/reseller/overview'),
        api('/api/reseller/withdrawals')
      ]);

      state.reseller = resellerData.reseller;
      document.getElementById('withdrawAvailableBalance').textContent = money(state.reseller.profit_balance);

      // Pre-fill bank info if already stored
      if (state.reseller.bank_name) {
        document.getElementById('selectWdBank').value = state.reseller.bank_name;
      }
      if (state.reseller.bank_account_number) {
        document.getElementById('inputWdAccNo').value = state.reseller.bank_account_number;
      }
      if (state.reseller.bank_account_name) {
        document.getElementById('inputWdAccName').value = state.reseller.bank_account_name;
      }

      // Render withdrawal list
      state.withdrawals = wdData.items || [];
      document.getElementById('wdTotalCount').textContent = `${state.withdrawals.length} Transaksi`;

      const listContainer = document.getElementById('withdrawalHistoryList');
      if (!state.withdrawals.length) {
        listContainer.innerHTML = '<div class="empty">Belum ada riwayat penarikan saldo.</div>';
      } else {
        listContainer.innerHTML = state.withdrawals.map(w => {
          let badgeClass = 'yellow';
          let badgeText = 'Menunggu';
          if (w.status === 'approved') {
            badgeClass = 'green';
            badgeText = 'Disetujui';
          } else if (w.status === 'rejected') {
            badgeClass = 'red';
            badgeText = 'Ditolak';
          }

          return `
            <div class="withdraw-item">
              <div class="withdraw-meta">
                <b>${money(w.amount)}</b>
                <small>${escapeHtml(w.withdrawal_ref)} · ${formatWIB(w.created_at)}</small>
                <small>Tujuan: ${escapeHtml(w.bank_name)} - ${escapeHtml(w.account_number)} (${escapeHtml(w.account_name)})</small>
                ${w.admin_note ? `<small style="color:#d9534f">Catatan: ${escapeHtml(w.admin_note)}</small>` : ''}
              </div>
              <div class="withdraw-status">
                <span class="badge ${badgeClass}">${badgeText}</span>
                ${w.proof_image ? `<button type="button" class="neo-btn small blue btn-view-proof" data-img="${escapeHtml(w.proof_image)}" style="margin-top:6px">Bukti</button>` : ''}
              </div>
            </div>
          `;
        }).join('');

        listContainer.querySelectorAll('.btn-view-proof').forEach(b => {
          b.addEventListener('click', () => {
            const imgUrl = b.dataset.img;
            document.getElementById('proofModalImg').src = imgUrl;
            document.getElementById('proofModal').classList.remove('hidden');
          });
        });
      }
    } catch (e) {
      console.warn('[withdraw:load]', e);
    }
  }

  async function handleWithdrawalSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitWithdrawal');
    btn.disabled = true;
    btn.textContent = 'Memproses...';

    const amount = Number(document.getElementById('inputWdAmount').value);
    const bankName = document.getElementById('selectWdBank').value;
    const accNo = document.getElementById('inputWdAccNo').value.trim();
    const accName = document.getElementById('inputWdAccName').value.trim();

    if (amount < 10000) {
      showToast('Minimal penarikan adalah Rp 10.000', 'bad');
      btn.disabled = false;
      btn.textContent = 'Kirim Permintaan Penarikan';
      return;
    }

    try {
      await api('/api/reseller/withdrawals', {
        method: 'POST',
        body: {
          amount,
          bank_name: bankName,
          account_number: accNo,
          account_name: accName
        }
      });

      showToast('Permintaan penarikan berhasil dikirim! Menunggu transfer dari Owner.', 'good', 4000);
      document.getElementById('inputWdAmount').value = '';
      loadWithdrawalData();
    } catch (err) {
      showToast(err.message || 'Gagal mengajukan penarikan', 'bad');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Kirim Permintaan Penarikan';
    }
  }

  // Tab 5: Orders
  async function loadOrdersData() {
    const container = document.getElementById('ordersFullList');
    container.innerHTML = '<div class="loader-card"><div class="loader-spinner"></div><p>Memuat riwayat penjualan...</p></div>';

    try {
      const res = await api('/api/reseller/orders');
      state.orders = res.items || [];
      document.getElementById('ordersCountBadge').textContent = `${state.orders.length} Pesanan`;

      if (!state.orders.length) {
        container.innerHTML = '<div class="empty">Belum ada pesanan masuk dari pembeli di bot Anda.</div>';
        return;
      }

      container.innerHTML = state.orders.map(o => {
        let statusBadge = 'green';
        if (o.status === 'pending_payment') statusBadge = 'yellow';
        else if (o.status === 'failed' || o.status === 'canceled') statusBadge = 'red';

        return `
          <div class="order-full-item">
            <div class="order-item-head">
              <div>
                <strong>${escapeHtml(o.product_name)}</strong>
                ${o.variant_name ? `<br><small>${escapeHtml(o.variant_name)}</small>` : ''}
                <small>Invoice: <code>${escapeHtml(o.order_ref)}</code> · ${formatWIB(o.created_at)}</small>
              </div>
              <span class="badge ${statusBadge}">${escapeHtml(o.status || 'completed').toUpperCase()}</span>
            </div>

            <div class="order-item-grid">
              <div>
                <small>JUMLAH</small>
                <b>${o.quantity} pcs</b>
              </div>
              <div>
                <small>TOTAL BAYAR</small>
                <b>${money(o.total_price)}</b>
              </div>
              <div>
                <small>KOMISIMU</small>
                <b style="color:#0f8526">+${money(o.reseller_profit)}</b>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div class="empty">Gagal memuat pesanan: ${escapeHtml(e.message)}</div>`;
    }
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Setup Event Listeners
  function setupEvents() {
    // Nav Bottom Bar
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Quick Action shortcuts
    document.querySelectorAll('.quick-nav-btn[data-target]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        if (target === 'bot') switchTab('tabBot');
        else if (target === 'pricing') switchTab('tabPricing');
        else if (target === 'orders') switchTab('tabOrders');
      });
    });

    document.querySelectorAll('.neo-link[data-target="orders"]').forEach(b => {
      b.addEventListener('click', () => switchTab('tabOrders'));
    });

    document.getElementById('btnQuickWithdraw')?.addEventListener('click', () => switchTab('tabWithdraw'));
    document.getElementById('btnGoToBotTab')?.addEventListener('click', () => switchTab('tabBot'));

    document.getElementById('btnOpenBotTelegram')?.addEventListener('click', () => {
      if (state.bot?.bot_username) {
        const url = `https://t.me/${state.bot.bot_username.replace(/^@+/, '')}`;
        if (tg?.openTelegramLink) tg.openTelegramLink(url);
        else window.open(url, '_blank');
      } else {
        showToast('Atur dan jalankan bot terlebih dahulu di tab Bot Toko', 'bad');
      }
    });

    // Refresh button
    document.getElementById('btnRefresh')?.addEventListener('click', () => {
      switchTab(state.activeTab);
      showToast('Memperbarui data...', 'good', 1200);
    });

    // Retry on error
    document.getElementById('btnRetry')?.addEventListener('click', initAuth);

    // Bot Config Form
    document.getElementById('btnVerifyToken')?.addEventListener('click', handleVerifyToken);
    document.getElementById('formBotConfig')?.addEventListener('submit', handleSaveBot);
    document.getElementById('btnRestartBot')?.addEventListener('click', () => handleBotAction('restart'));
    document.getElementById('btnStopBot')?.addEventListener('click', () => handleBotAction('stop'));

    // Pricing Filter & Save
    document.getElementById('inputSearchProduct')?.addEventListener('input', (e) => {
      renderPricingList(e.target.value);
    });
    document.getElementById('btnFilterAll')?.addEventListener('click', () => renderPricingList('', 'all'));
    document.getElementById('btnFilterEnabled')?.addEventListener('click', () => renderPricingList('', 'enabled'));
    document.getElementById('btnFilterDisabled')?.addEventListener('click', () => renderPricingList('', 'disabled'));
    document.getElementById('btnApplyGlobalMarkup')?.addEventListener('click', handleApplyGlobalMarkup);
    document.getElementById('btnSavePricingChanges')?.addEventListener('click', handleSavePricingChanges);

    // Withdrawal Form
    document.getElementById('formWithdrawal')?.addEventListener('submit', handleWithdrawalSubmit);
    document.querySelectorAll('.amount-chip[data-amount]').forEach(c => {
      c.addEventListener('click', () => {
        document.getElementById('inputWdAmount').value = c.dataset.amount;
      });
    });
    document.getElementById('btnWdAll')?.addEventListener('click', () => {
      if (state.reseller) {
        document.getElementById('inputWdAmount').value = state.reseller.profit_balance || 0;
      }
    });

    // Proof Modal
    document.getElementById('btnCloseProofModal')?.addEventListener('click', () => {
      document.getElementById('proofModal').classList.add('hidden');
    });
    document.getElementById('proofModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'proofModal') {
        document.getElementById('proofModal').classList.add('hidden');
      }
    });
  }

  // Start app
  setupEvents();
  initAuth();
})();
