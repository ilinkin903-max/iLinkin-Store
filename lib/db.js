const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { config } = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.backupDir, { recursive: true });

let db = new DatabaseSync(config.dbFile);
function configureDb(){
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec('PRAGMA synchronous=NORMAL;');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec('PRAGMA busy_timeout=5000;');
}
configureDb();

function now() { return new Date().toISOString(); }
function n(value, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? Math.trunc(x) : fallback; }
function cleanText(value, max = 500) { return String(value == null ? '' : value).trim().slice(0, max); }
function boolInt(value) { return value === true || value === 1 || ['1','true','yes','on','aktif'].includes(String(value || '').toLowerCase()) ? 1 : 0; }
function safeJsonParse(value, fallback = null) { try { return JSON.parse(value); } catch { return fallback; } }
function normalizeBulkPrices(value) {
  let rows=value;
  if(typeof rows==='string')rows=safeJsonParse(rows,[]);
  if(!Array.isArray(rows))rows=[];
  const byQty=new Map();
  for(const row of rows){
    const minQty=Math.max(2,n(row?.min_qty??row?.minQty??row?.qty??row?.min,0));
    const price=Math.max(0,n(row?.price??row?.unit_price??row?.unitPrice,0));
    if(minQty>=2&&price>0)byQty.set(minQty,{min_qty:minQty,price});
  }
  return [...byQty.values()].sort((a,b)=>a.min_qty-b.min_qty);
}
function bulkPriceForQuantity(basePrice,bulkPrices,quantity=1) {
  const qty=Math.max(1,n(quantity,1));let price=Math.max(0,n(basePrice));
  for(const tier of normalizeBulkPrices(bulkPrices)){if(qty>=tier.min_qty)price=tier.price;else break;}
  return price;
}
function randomCode(prefix = '', bytes = 6) { return `${prefix}${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`; }
function makeRef(prefix='ORD') { return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

function tableColumns(table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name));
}
function ensureColumn(table, name, sqlTypeAndDefault) {
  const cols = tableColumns(table);
  if (!cols.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sqlTypeAndDefault}`);
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      balance INTEGER NOT NULL DEFAULT 0,
      balance_main INTEGER NOT NULL DEFAULT 0,
      balance_referral INTEGER NOT NULL DEFAULT 0,
      referral_code TEXT NOT NULL DEFAULT '',
      referred_by TEXT NOT NULL DEFAULT '',
      referral_rewarded INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      subtitle TEXT NOT NULL DEFAULT '',
      tag TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      terms TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      cost INTEGER NOT NULL DEFAULT 0,
      bulk_prices_json TEXT NOT NULL DEFAULT '[]',
      sold_count INTEGER NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0,
      delivery_mode TEXT NOT NULL DEFAULT 'auto',
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      terms TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      cost INTEGER NOT NULL DEFAULT 0,
      bulk_prices_json TEXT NOT NULL DEFAULT '[]',
      sold_count INTEGER NOT NULL DEFAULT 0,
      delivery_mode TEXT NOT NULL DEFAULT 'auto',
      supplier_source TEXT NOT NULL DEFAULT '',
      supplier_product_id TEXT NOT NULL DEFAULT '',
      supplier_price REAL NOT NULL DEFAULT 0,
      supplier_public_price REAL NOT NULL DEFAULT 0,
      supplier_stock INTEGER,
      supplier_synced_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(product_id, variant_key),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      order_ref TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      sold_at TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      telegram_id TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL DEFAULT '',
      product_id INTEGER,
      variant_id INTEGER,
      product_code TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      variant_name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      total_price INTEGER NOT NULL DEFAULT 0,
      cost_amount INTEGER NOT NULL DEFAULT 0,
      profit_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_method TEXT NOT NULL DEFAULT '',
      delivery_mode TEXT NOT NULL DEFAULT 'auto',
      delivery_text TEXT NOT NULL DEFAULT '',
      coupon_code TEXT NOT NULL DEFAULT '',
      supplier_source TEXT NOT NULL DEFAULT '',
      supplier_order_id TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      paid_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_ref TEXT NOT NULL UNIQUE,
      telegram_id TEXT NOT NULL DEFAULT '',
      buyer_name TEXT NOT NULL DEFAULT '',
      product_code TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 1,
      amount INTEGER NOT NULL DEFAULT 0,
      cost INTEGER NOT NULL DEFAULT 0,
      profit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'order',
      order_ref TEXT NOT NULL DEFAULT '',
      telegram_id TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT 'autogopay',
      channel TEXT NOT NULL DEFAULT 'gopay',
      transaction_id TEXT NOT NULL DEFAULT '',
      provider_reference TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      qr_string TEXT NOT NULL DEFAULT '',
      qr_url TEXT NOT NULL DEFAULT '',
      qr_chat_id TEXT NOT NULL DEFAULT '',
      qr_message_id INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      last_checked_at TEXT,
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL DEFAULT 'fixed',
      discount_value INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER NOT NULL DEFAULT 0,
      min_purchase INTEGER NOT NULL DEFAULT 0,
      usage_limit INTEGER NOT NULL DEFAULT 0,
      used_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      starts_at TEXT,
      expires_at TEXT,
      product_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redeem_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'balance',
      value INTEGER NOT NULL DEFAULT 0,
      product_id INTEGER,
      variant_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      claimed_by TEXT NOT NULL DEFAULT '',
      claimed_at TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      wallet_type TEXT NOT NULL DEFAULT 'main',
      direction TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      reference TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcast_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'text',
      message TEXT NOT NULL,
      media TEXT NOT NULL DEFAULT '',
      total INTEGER NOT NULL DEFAULT 0,
      sent INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      key TEXT PRIMARY KEY,
      level TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      target_view TEXT NOT NULL DEFAULT 'dashboard',
      entity_type TEXT NOT NULL DEFAULT '',
      entity_id TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      read_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jaspay_products (
      product_key TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      pricing_mode TEXT NOT NULL DEFAULT 'markup_fixed',
      pricing_value REAL NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      presentation_json TEXT NOT NULL DEFAULT '{}',
      api_unit_price INTEGER NOT NULL DEFAULT 0,
      qty_max INTEGER NOT NULL DEFAULT 1,
      options_json TEXT NOT NULL DEFAULT '{}',
      available INTEGER NOT NULL DEFAULT 1,
      unavailable_code TEXT NOT NULL DEFAULT '',
      unavailable_message TEXT NOT NULL DEFAULT '',
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jaspay_orders (
      order_ref TEXT PRIMARY KEY,
      api_order_id TEXT NOT NULL DEFAULT '',
      product_key TEXT NOT NULL DEFAULT '',
      product_name TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL DEFAULT '{}',
      qty INTEGER NOT NULL DEFAULT 1,
      sell_unit_price INTEGER NOT NULL DEFAULT 0,
      api_unit_price INTEGER NOT NULL DEFAULT 0,
      api_total_price INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'local_pending',
      phase TEXT,
      queue_position INTEGER,
      progress_success INTEGER NOT NULL DEFAULT 0,
      progress_processed INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER NOT NULL DEFAULT 0,
      api_refunded_total REAL NOT NULL DEFAULT 0,
      customer_refund_amount INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '[]',
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      customer_notified_at TEXT
    );

  `);

  // Migrate databases created by v1.0.x without deleting data.
  ensureColumn('users', 'balance_main', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'balance_referral', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'referral_code', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'referred_by', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('users', 'referral_rewarded', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'subtitle', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('products', 'tag', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('products', 'terms', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('products', 'image_url', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('products', 'delivery_mode', "TEXT NOT NULL DEFAULT 'auto'");
  ensureColumn('products', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'bulk_prices_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('products', 'sold_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'description', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('product_variants', 'terms', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('product_variants', 'supplier_price', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'supplier_public_price', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('product_variants', 'supplier_stock', 'INTEGER');
  ensureColumn('product_variants', 'supplier_synced_at', 'TEXT');
  ensureColumn('product_variants', 'bulk_prices_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('product_variants', 'sold_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('redeem_codes', 'product_id', 'INTEGER');
  ensureColumn('redeem_codes', 'variant_id', 'INTEGER');
  ensureColumn('broadcast_logs', 'type', "TEXT NOT NULL DEFAULT 'text'");
  ensureColumn('broadcast_logs', 'media', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('payments', 'qr_chat_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('payments', 'qr_message_id', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('jaspay_products', 'presentation_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('jaspay_orders', 'customer_notified_at', 'TEXT');

  // Create indexes only after legacy columns have been added.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code) WHERE referral_code <> '';
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active, sort_order, name);
    CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id, active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_stock_available ON stock_items(product_id, variant_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(telegram_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(active, code);
    CREATE INDEX IF NOT EXISTS idx_redeem_active ON redeem_codes(active, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_ledger(telegram_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_admin_notifications_active ON admin_notifications(active, read_at, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jaspay_products_enabled ON jaspay_products(enabled, available, name);
    CREATE INDEX IF NOT EXISTS idx_jaspay_orders_status ON jaspay_orders(status, updated_at);
  `);

  // Move legacy balance to main wallet once.
  db.exec(`UPDATE users SET balance_main=balance WHERE balance_main=0 AND balance>0;`);
  // Give users migrated from v1 a stable referral code.
  for (const row of db.prepare("SELECT telegram_id FROM users WHERE referral_code='' OR referral_code IS NULL").all()) {
    let code = referralCodeFor(row.telegram_id);
    let suffix = 0;
    while (db.prepare('SELECT 1 FROM users WHERE referral_code=? AND telegram_id<>?').get(code, String(row.telegram_id))) {
      suffix += 1; code = `${referralCodeFor(row.telegram_id).slice(0,8)}${suffix}`;
    }
    db.prepare('UPDATE users SET referral_code=?,updated_at=? WHERE telegram_id=?').run(code, now(), String(row.telegram_id));
  }

  // Carry v1.0.x manual transactions into the new orders table once.
  // INSERT OR IGNORE keeps this idempotent across restarts.
  try {
    db.exec(`
      INSERT OR IGNORE INTO orders(
        order_ref,telegram_id,buyer_name,product_code,product_name,quantity,unit_price,subtotal,
        discount_amount,total_price,cost_amount,profit_amount,status,payment_method,delivery_mode,
        delivery_text,coupon_code,supplier_source,supplier_order_id,note,created_at,paid_at,completed_at,updated_at
      )
      SELECT
        order_ref,telegram_id,buyer_name,product_code,product_name,MAX(1,qty),
        CASE WHEN MAX(1,qty)>0 THEN CAST(amount/MAX(1,qty) AS INTEGER) ELSE amount END,
        amount,0,amount,cost,profit,
        CASE WHEN status IN ('paid','completed','success') THEN 'completed'
             WHEN status='pending' THEN 'pending_payment' ELSE status END,
        'legacy','auto','','','','',note,created_at,
        CASE WHEN status IN ('paid','completed','success') THEN created_at ELSE NULL END,
        CASE WHEN status IN ('paid','completed','success') THEN created_at ELSE NULL END,
        updated_at
      FROM transactions;
    `);
  } catch (error) {
    console.warn('[db:migration] legacy transactions tidak dapat dimigrasikan:', error.message);
  }

  // Normalisasi ejaan status order lama.
  try { db.exec("UPDATE orders SET status='canceled' WHERE status='cancelled'"); } catch {}

  // Backfill user dari histori order agar menu User tetap menampilkan pelanggan lama.
  try {
    db.exec(`
      INSERT OR IGNORE INTO users(telegram_id,username,first_name,last_name,balance,balance_main,balance_referral,referral_code,referred_by,referral_rewarded,status,first_seen_at,last_seen_at,updated_at)
      SELECT telegram_id,'',MAX(COALESCE(NULLIF(buyer_name,''),telegram_id)),'',0,0,0,'','',0,'active',MIN(created_at),MAX(created_at),MAX(updated_at)
      FROM orders WHERE telegram_id<>'' GROUP BY telegram_id;
    `);
  } catch (error) {
    console.warn('[db:migration] order user backfill gagal:', error.message);
  }

  const defaults = {
    store_name: 'iLink Auto Order',
    store_tagline: 'Digital Store',
    store_balance: 0,
    store_balance_metric: 'month_profit',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    bot_enabled: true,
    bot_maintenance_message: '',
    show_total_users: true,
    start_media_type: 'none',
    start_media_value: '',
    start_media_caption: '',
    customer_service_link: '',
    group_link: '',
    nokos_link: '',
    required_channel_id: '',
    required_channel_link: '',
    referral_enabled: true,
    referral_reward_amount: 1000,
    topup_enabled: true,
    wallet_payment_enabled: true,
    topup_min_amount: 1000,
    topup_max_amount: 5000000,
    autogopay_payment_method: 'gopay',
    qris_rotation_next: 'gopay',
    transaction_channel_id: '',
    transaction_notifications_enabled: true,
    transaction_notify_orders: true,
    transaction_notify_topups: true,
    jaspay_enabled: false,
    jaspay_partial_mode: 'refund_wallet',
    jaspay_menu_label: '⚡ Produk Fresh',
    dashboard_note: 'Marketplace web belum diaktifkan. Auto order berjalan melalui bot Telegram.',
    owner_display_name: 'Owner',
    owner_username: 'owneradmin',
    auto_backup_enabled: config.autoBackup,
    backup_interval_hours: config.backupIntervalHours,
    backup_retention: config.backupRetention
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO settings(key,value_json,updated_at) VALUES(?,?,?)');
  for (const [key, value] of Object.entries(defaults)) stmt.run(key, JSON.stringify(value), now());
}

function getSettings() {
  const rows = db.prepare('SELECT key,value_json FROM settings ORDER BY key').all();
  const out = {};
  for (const row of rows) out[row.key] = safeJsonParse(row.value_json, row.value_json);
  return out;
}
function saveSettings(input = {}) {
  const stmt = db.prepare(`INSERT INTO settings(key,value_json,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`);
  const t = now();
  for (const [key, value] of Object.entries(input || {})) {
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(key)) continue;
    stmt.run(key, JSON.stringify(value), t);
  }
  return getSettings();
}

function normalizeHistoricalStats(value={}) {
  let raw=value;
  if(typeof raw==='string')raw=safeJsonParse(raw,{});
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  return {
    orders_total:Math.max(0,n(raw.orders_total??raw.orders??raw.total_transactions,0)),
    quantity_sold:Math.max(0,n(raw.quantity_sold??raw.total_quantity??raw.items_sold,0)),
    revenue_total:Math.max(0,n(raw.revenue_total??raw.omzet_total??raw.total_revenue,0)),
    cost_total:Math.max(0,n(raw.cost_total??raw.modal_total,0)),
    profit_total:n(raw.profit_total??raw.laba_total,0),
    source_generated_at:cleanText(raw.source_generated_at??raw.generated_at,80),
    anchor_live_orders:Math.max(0,n(raw.anchor_live_orders,0)),
    anchor_live_quantity:Math.max(0,n(raw.anchor_live_quantity,0)),
    anchor_live_revenue:Math.max(0,n(raw.anchor_live_revenue,0)),
    anchor_live_cost:Math.max(0,n(raw.anchor_live_cost,0)),
    anchor_live_profit:n(raw.anchor_live_profit,0),
    updated_at:raw.updated_at||null,
    source:cleanText(raw.source||'',80)
  };
}
function salesRowsWhere(extraWhere='',args=[]) {
  return db.prepare(`SELECT COUNT(*) orders_total,COALESCE(SUM(quantity),0) quantity_sold,COALESCE(SUM(total_price),0) revenue_total,COALESCE(SUM(cost_amount),0) cost_total,COALESCE(SUM(profit_amount),0) profit_total FROM orders WHERE status IN ('completed','waiting_delivery') ${extraWhere}`).get(...args);
}
function liveSalesStats(){return normalizeHistoricalStats(salesRowsWhere());}
function salesStatsAfter(iso){const t=cleanText(iso,80);if(!t)return normalizeHistoricalStats();return normalizeHistoricalStats(salesRowsWhere('AND datetime(created_at)>datetime(?)',[t]));}
function getHistoricalStats(){return normalizeHistoricalStats(getSettings().historical_stats||{});}
function getEffectiveHistoricalStats(){
  const live=liveSalesStats(),hist=getHistoricalStats();
  if(!hist.orders_total&&!hist.quantity_sold&&!hist.revenue_total)return {...live,mode:'live'};
  let delta;
  if(hist.source_generated_at&&Number.isFinite(Date.parse(hist.source_generated_at)))delta=salesStatsAfter(hist.source_generated_at);
  else delta={orders_total:Math.max(0,live.orders_total-hist.anchor_live_orders),quantity_sold:Math.max(0,live.quantity_sold-hist.anchor_live_quantity),revenue_total:Math.max(0,live.revenue_total-hist.anchor_live_revenue),cost_total:Math.max(0,live.cost_total-hist.anchor_live_cost),profit_total:live.profit_total-hist.anchor_live_profit};
  return {orders_total:Math.max(live.orders_total,hist.orders_total+Math.max(0,n(delta.orders_total))),quantity_sold:Math.max(live.quantity_sold,hist.quantity_sold+Math.max(0,n(delta.quantity_sold))),revenue_total:Math.max(live.revenue_total,hist.revenue_total+Math.max(0,n(delta.revenue_total))),cost_total:Math.max(live.cost_total,hist.cost_total+Math.max(0,n(delta.cost_total))),profit_total:hist.profit_total+n(delta.profit_total),mode:hist.source_generated_at?'historical+post-backup':'historical+anchor',source_generated_at:hist.source_generated_at,source:hist.source};
}
function getSalesCounterStatus(){return{historical:getHistoricalStats(),live:liveSalesStats(),effective:getEffectiveHistoricalStats()};}
function setHistoricalStatsBaseline(input={},meta={}) {
  const live=liveSalesStats();
  const next=normalizeHistoricalStats({...input,source_generated_at:meta.source_generated_at??input.source_generated_at??'',anchor_live_orders:live.orders_total,anchor_live_quantity:live.quantity_sold,anchor_live_revenue:live.revenue_total,anchor_live_cost:live.cost_total,anchor_live_profit:live.profit_total,updated_at:now(),source:meta.source??input.source??'manual'});
  next.orders_total=Math.max(next.orders_total,live.orders_total);next.quantity_sold=Math.max(next.quantity_sold,live.quantity_sold);next.revenue_total=Math.max(next.revenue_total,live.revenue_total);
  saveSettings({historical_stats:next});return getSalesCounterStatus();
}
function mergeHistoricalStatsCandidate(candidate={},meta={}) {
  const incoming=normalizeHistoricalStats(candidate),current=getHistoricalStats(),live=liveSalesStats();
  const useIncoming=(incoming.orders_total>current.orders_total)||(incoming.quantity_sold>current.quantity_sold)||(incoming.revenue_total>current.revenue_total);
  const base={orders_total:Math.max(current.orders_total,incoming.orders_total,live.orders_total),quantity_sold:Math.max(current.quantity_sold,incoming.quantity_sold,live.quantity_sold),revenue_total:Math.max(current.revenue_total,incoming.revenue_total,live.revenue_total),cost_total:Math.max(current.cost_total,incoming.cost_total,live.cost_total),profit_total:incoming.profit_total||current.profit_total||live.profit_total,source_generated_at:useIncoming?(meta.source_generated_at||incoming.source_generated_at||''):(current.source_generated_at||meta.source_generated_at||''),anchor_live_orders:live.orders_total,anchor_live_quantity:live.quantity_sold,anchor_live_revenue:live.revenue_total,anchor_live_cost:live.cost_total,anchor_live_profit:live.profit_total,updated_at:now(),source:meta.source||incoming.source||current.source||'legacy-json'};
  saveSettings({historical_stats:base});return getSalesCounterStatus();
}

function referralCodeFor(id) {
  const base = Buffer.from(String(id)).toString('base64url').replace(/[^A-Za-z0-9]/g,'').slice(-7).toUpperCase();
  return `IL${base || crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
function upsertUser(user = {}) {
  const telegramId = cleanText(user.telegram_id || user.id, 40);
  if (!telegramId) throw new Error('telegram_id wajib diisi');
  const t = now();
  const existing = getUser(telegramId);
  const referralCode = existing?.referral_code || referralCodeFor(telegramId);
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,balance,balance_main,balance_referral,referral_code,referred_by,referral_rewarded,status,first_seen_at,last_seen_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,last_name=excluded.last_name,last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`)
    .run(telegramId, cleanText(user.username,100), cleanText(user.first_name,120), cleanText(user.last_name,120), n(user.balance,0), n(user.balance_main,user.balance || 0), n(user.balance_referral,0), referralCode, cleanText(user.referred_by,40), boolInt(user.referral_rewarded), cleanText(user.status || 'active',30), existing?.first_seen_at || t, t, t);
  return getUser(telegramId);
}
function getUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(id));
  return row ? normalizeUser(row) : null;
}
function getUserByReferral(code) {
  const row = db.prepare('SELECT * FROM users WHERE referral_code=?').get(cleanText(code,40).toUpperCase());
  return row ? normalizeUser(row) : null;
}
function normalizeUser(row) {
  if (!row) return null;
  const main = n(row.balance_main, n(row.balance,0));
  const ref = n(row.balance_referral,0);
  return { ...row, balance_main: main, balance_referral: ref, balance: main + ref, balance_total: main + ref };
}
function listUsers({ limit=200, offset=0, search='', status='' }={}) {
  limit=Math.min(1000,Math.max(1,n(limit,200))); offset=Math.max(0,n(offset,0));
  const q=cleanText(search,120); const st=cleanText(status,30);
  const args=[]; const where=[];
  if(q){const like=`%${q}%`;where.push('(telegram_id LIKE ? OR username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR referral_code LIKE ?)');args.push(like,like,like,like,like);}
  if(st){where.push('status=?');args.push(st);}
  args.push(limit,offset);
  return db.prepare(`SELECT * FROM users ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY last_seen_at DESC LIMIT ? OFFSET ?`).all(...args).map(normalizeUser);
}
function updateUser(id, patch={}) {
  const cur=getUser(id); if(!cur)return null;
  const main=patch.balance_main!=null?n(patch.balance_main):patch.balance!=null?n(patch.balance):cur.balance_main;
  const ref=patch.balance_referral!=null?n(patch.balance_referral):cur.balance_referral;
  db.prepare('UPDATE users SET username=?,first_name=?,last_name=?,balance=?,balance_main=?,balance_referral=?,status=?,updated_at=? WHERE telegram_id=?')
    .run(patch.username==null?cur.username:cleanText(patch.username,100),patch.first_name==null?cur.first_name:cleanText(patch.first_name,120),patch.last_name==null?cur.last_name:cleanText(patch.last_name,120),main+ref,main,ref,patch.status==null?cur.status:cleanText(patch.status,30),now(),String(id));
  return getUser(id);
}
function deleteUser(id){return db.prepare('DELETE FROM users WHERE telegram_id=?').run(String(id)).changes>0;}

function walletSummary(id, limit=8) {
  const user=getUser(id); if(!user)return null;
  const ledger=db.prepare('SELECT * FROM wallet_ledger WHERE telegram_id=? ORDER BY id DESC LIMIT ?').all(String(id),Math.min(50,Math.max(1,n(limit,8))));
  const invited=db.prepare('SELECT COUNT(*) c FROM users WHERE referred_by=?').get(String(id)).c;
  return {...user, ledger, invited_total:Number(invited||0)};
}
function adjustWallet(id, {mainDelta=0, referralDelta=0, reason='', reference=''}={}) {
  const user=getUser(id) || upsertUser({telegram_id:id});
  const nextMain=user.balance_main+n(mainDelta); const nextRef=user.balance_referral+n(referralDelta);
  if(nextMain<0||nextRef<0)throw new Error('Saldo tidak mencukupi.');
  db.exec('BEGIN IMMEDIATE');
  try{
    db.prepare('UPDATE users SET balance=?,balance_main=?,balance_referral=?,updated_at=? WHERE telegram_id=?').run(nextMain+nextRef,nextMain,nextRef,now(),String(id));
    const ins=db.prepare('INSERT INTO wallet_ledger(telegram_id,wallet_type,direction,amount,balance_after,reason,reference,created_at) VALUES(?,?,?,?,?,?,?,?)');
    if(mainDelta)ins.run(String(id),'main',mainDelta>0?'credit':'debit',Math.abs(n(mainDelta)),nextMain,cleanText(reason,300),cleanText(reference,120),now());
    if(referralDelta)ins.run(String(id),'referral',referralDelta>0?'credit':'debit',Math.abs(n(referralDelta)),nextRef,cleanText(reason,300),cleanText(reference,120),now());
    db.exec('COMMIT');
  }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
  return walletSummary(id);
}
function debitWalletTotal(id, amount, reason='', reference='') {
  amount=Math.max(0,n(amount)); const user=getUser(id); if(!user||user.balance_total<amount)throw new Error('Saldo tidak mencukupi.');
  const mainUse=Math.min(user.balance_main,amount); const refUse=amount-mainUse;
  return adjustWallet(id,{mainDelta:-mainUse,referralDelta:-refUse,reason,reference});
}

function registerReferral(inviteeId, code) {
  const invitee=getUser(inviteeId); if(!invitee||invitee.referred_by)return {ok:false,reason:'already_or_missing'};
  const referrer=getUserByReferral(code); if(!referrer||String(referrer.telegram_id)===String(inviteeId))return {ok:false,reason:'invalid'};
  db.prepare('UPDATE users SET referred_by=?,updated_at=? WHERE telegram_id=?').run(String(referrer.telegram_id),now(),String(inviteeId));
  const settings=getSettings();
  if(settings.referral_enabled!==false){
    const reward=Math.max(0,n(settings.referral_reward_amount,0));
    if(reward>0){adjustWallet(referrer.telegram_id,{referralDelta:reward,reason:'Bonus referral pendaftaran',reference:String(inviteeId)});}
  }
  return {ok:true,referrer:getUser(referrer.telegram_id)};
}

function productSoldTotal(productId,variantId=null,baseValue=0){
  const base=Math.max(0,n(baseValue,0)),hist=getHistoricalStats();const args=[n(productId)];let variantSql='';
  if(variantId){variantSql=' AND variant_id=?';args.push(n(variantId));}
  const live=Number(db.prepare(`SELECT COALESCE(SUM(quantity),0) q FROM orders WHERE status IN ('completed','waiting_delivery') AND product_id=?${variantSql}`).get(...args).q||0);
  if(hist.source_generated_at&&Number.isFinite(Date.parse(hist.source_generated_at))){const postArgs=[n(productId)];if(variantId)postArgs.push(n(variantId));postArgs.push(hist.source_generated_at);const post=Number(db.prepare(`SELECT COALESCE(SUM(quantity),0) q FROM orders WHERE status IN ('completed','waiting_delivery') AND product_id=?${variantSql} AND datetime(created_at)>datetime(?)`).get(...postArgs).q||0);return Math.max(live,base+post);}
  return Math.max(live,base);
}
function normalizeVariant(row){if(!row)return null;return {...row,bulk_prices:normalizeBulkPrices(row.bulk_prices_json),sold_total:productSoldTotal(row.product_id,row.id,row.sold_count)};}
function productVariants(productId, {includeInactive=true}={}) {
  return db.prepare(`SELECT * FROM product_variants WHERE product_id=? ${includeInactive?'':'AND active=1'} ORDER BY name COLLATE NOCASE ASC,id ASC`).all(n(productId)).map(normalizeVariant);
}
function stockCount(productId, variantId=null) {
  if(variantId) return Number(db.prepare("SELECT COUNT(*) c FROM stock_items WHERE product_id=? AND variant_id=? AND status='available'").get(n(productId),n(variantId)).c||0);
  return Number(db.prepare("SELECT COUNT(*) c FROM stock_items WHERE product_id=? AND variant_id IS NULL AND status='available'").get(n(productId)).c||0);
}
function normalizeProduct(row) {
  if(!row)return null;
  const variants=productVariants(row.id).map(v=>{
    const localStock=stockCount(row.id,v.id);
    const effectiveStock=v.supplier_source?Math.max(0,n(v.supplier_stock,0)):localStock;
    return {...v,local_stock:localStock,stock:effectiveStock,stock_status:v.delivery_mode==='preorder'?'preorder':effectiveStock>0?'ready':'empty'};
  });
  const ownStock=stockCount(row.id,null);
  const stock=variants.length?variants.reduce((sum,v)=>sum+Math.max(0,n(v.stock,0)),0):(ownStock||n(row.stock));
  const activeVariants=variants.filter(v=>v.active);
  const saleStock=activeVariants.length?activeVariants.reduce((sum,v)=>sum+Math.max(0,n(v.stock,0)),0):stock;
  const hasPreorder=(row.delivery_mode==='preorder')||activeVariants.some(v=>v.delivery_mode==='preorder');
  const stockStatus=saleStock>0?'ready':hasPreorder?'preorder':'empty';
  const prices=activeVariants.map(v=>n(v.price)).filter(x=>x>=0);
  const costs=activeVariants.map(v=>n(v.cost)).filter(x=>x>=0);
  return {...row,bulk_prices:normalizeBulkPrices(row.bulk_prices_json),variants,stock,sale_stock:saleStock,stock_status:stockStatus,sold_total:productSoldTotal(row.id,null,row.sold_count),price_min:prices.length?Math.min(...prices):n(row.price),price_max:prices.length?Math.max(...prices):n(row.price),cost_min:costs.length?Math.min(...costs):n(row.cost),cost_max:costs.length?Math.max(...costs):n(row.cost)};
}
function listProducts({limit=500,search='',active=null}={}) {
  limit=Math.min(1000,Math.max(1,n(limit,500)));const q=cleanText(search,120);const args=[];const where=[];
  if(q){const like=`%${q}%`;where.push('(code LIKE ? OR name LIKE ? OR category LIKE ? OR tag LIKE ?)');args.push(like,like,like,like);}
  if(active!==null&&active!==''&&active!==undefined){where.push('active=?');args.push(boolInt(active));}
  args.push(limit);
  return db.prepare(`SELECT * FROM products ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY name COLLATE NOCASE ASC,id ASC LIMIT ?`).all(...args).map(normalizeProduct);
}
function getProduct(idOrCode) {
  const raw=String(idOrCode||'');
  const row=/^\d+$/.test(raw)?db.prepare('SELECT * FROM products WHERE id=?').get(n(raw)):db.prepare('SELECT * FROM products WHERE code=?').get(raw.toUpperCase());
  return normalizeProduct(row);
}
function createProduct(input={}) {
  const code=cleanText(input.code,80).toUpperCase();const name=cleanText(input.name,180);if(!code||!name)throw new Error('Kode dan nama produk wajib diisi');const t=now();
  const bulkJson=JSON.stringify(normalizeBulkPrices(input.bulk_prices??input.bulk_prices_json));
  const r=db.prepare('INSERT INTO products(code,name,category,subtitle,tag,description,terms,image_url,price,cost,bulk_prices_json,stock,delivery_mode,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code,name,cleanText(input.category,100),cleanText(input.subtitle,160),cleanText(input.tag,80),cleanText(input.description,4000),cleanText(input.terms,4000),cleanText(input.image_url,1000),Math.max(0,n(input.price)),Math.max(0,n(input.cost)),bulkJson,Math.max(0,n(input.stock)),['auto','preorder'].includes(String(input.delivery_mode))?String(input.delivery_mode):'auto',input.active==null?1:boolInt(input.active),n(input.sort_order),t,t);
  return getProduct(r.lastInsertRowid);
}
function updateProduct(id,patch={}) {
  const cur=getProduct(id);if(!cur)return null;
  const vals={code:patch.code==null?cur.code:cleanText(patch.code,80).toUpperCase(),name:patch.name==null?cur.name:cleanText(patch.name,180),category:patch.category==null?cur.category:cleanText(patch.category,100),subtitle:patch.subtitle==null?cur.subtitle:cleanText(patch.subtitle,160),tag:patch.tag==null?cur.tag:cleanText(patch.tag,80),description:patch.description==null?cur.description:cleanText(patch.description,4000),terms:patch.terms==null?cur.terms:cleanText(patch.terms,4000),image_url:patch.image_url==null?cur.image_url:cleanText(patch.image_url,1000),price:patch.price==null?cur.price:Math.max(0,n(patch.price)),cost:patch.cost==null?cur.cost:Math.max(0,n(patch.cost)),bulk_prices_json:(patch.bulk_prices===undefined&&patch.bulk_prices_json===undefined)?cur.bulk_prices_json:JSON.stringify(normalizeBulkPrices(patch.bulk_prices??patch.bulk_prices_json)),delivery_mode:patch.delivery_mode==null?cur.delivery_mode:(String(patch.delivery_mode)==='preorder'?'preorder':'auto'),active:patch.active==null?cur.active:boolInt(patch.active),sort_order:patch.sort_order==null?cur.sort_order:n(patch.sort_order)};
  db.prepare('UPDATE products SET code=?,name=?,category=?,subtitle=?,tag=?,description=?,terms=?,image_url=?,price=?,cost=?,bulk_prices_json=?,delivery_mode=?,active=?,sort_order=?,updated_at=? WHERE id=?')
    .run(vals.code,vals.name,vals.category,vals.subtitle,vals.tag,vals.description,vals.terms,vals.image_url,vals.price,vals.cost,vals.bulk_prices_json,vals.delivery_mode,vals.active,vals.sort_order,now(),n(id));
  return getProduct(id);
}
function deleteProduct(id){return db.prepare('DELETE FROM products WHERE id=?').run(n(id)).changes>0;}
function toggleProduct(id,active){return updateProduct(id,{active});}

function getVariant(id){return normalizeVariant(db.prepare('SELECT * FROM product_variants WHERE id=?').get(n(id))||null);}
function createVariant(productId,input={}){
  const p=getProduct(productId);if(!p)throw new Error('Produk tidak ditemukan');const name=cleanText(input.name,160);if(!name)throw new Error('Nama varian wajib diisi');const key=cleanText(input.variant_key||input.key||name,80).toUpperCase().replace(/\s+/g,'-');const t=now();
  const supplierStock=input.supplier_stock===null||input.supplier_stock===''||input.supplier_stock===undefined?null:Math.max(0,n(input.supplier_stock));
  const bulkJson=JSON.stringify(normalizeBulkPrices(input.bulk_prices??input.bulk_prices_json));
  const r=db.prepare('INSERT INTO product_variants(product_id,variant_key,name,description,terms,price,cost,bulk_prices_json,delivery_mode,supplier_source,supplier_product_id,supplier_price,supplier_public_price,supplier_stock,supplier_synced_at,active,sort_order,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(n(productId),key,name,cleanText(input.description,4000),cleanText(input.terms,4000),Math.max(0,n(input.price)),Math.max(0,n(input.cost)),bulkJson,String(input.delivery_mode)==='preorder'?'preorder':'auto',cleanText(input.supplier_source,30).toLowerCase(),cleanText(input.supplier_product_id,120),Math.max(0,Number(input.supplier_price||0)),Math.max(0,Number(input.supplier_public_price||0)),supplierStock,input.supplier_synced_at||null,input.active==null?1:boolInt(input.active),n(input.sort_order),t,t);
  return getVariant(r.lastInsertRowid);
}
function updateVariant(id,patch={}){
  const cur=getVariant(id);if(!cur)return null;
  const name=patch.name==null?cur.name:cleanText(patch.name,160);const key=patch.variant_key==null?cur.variant_key:cleanText(patch.variant_key,80).toUpperCase().replace(/\s+/g,'-');
  const supplierStock=patch.supplier_stock===undefined?cur.supplier_stock:(patch.supplier_stock===null||patch.supplier_stock===''?null:Math.max(0,n(patch.supplier_stock)));
  const bulkJson=(patch.bulk_prices===undefined&&patch.bulk_prices_json===undefined)?cur.bulk_prices_json:JSON.stringify(normalizeBulkPrices(patch.bulk_prices??patch.bulk_prices_json));
  db.prepare('UPDATE product_variants SET variant_key=?,name=?,description=?,terms=?,price=?,cost=?,bulk_prices_json=?,delivery_mode=?,supplier_source=?,supplier_product_id=?,supplier_price=?,supplier_public_price=?,supplier_stock=?,supplier_synced_at=?,active=?,sort_order=?,updated_at=? WHERE id=?')
    .run(key,name,patch.description==null?cur.description:cleanText(patch.description,4000),patch.terms==null?cur.terms:cleanText(patch.terms,4000),patch.price==null?cur.price:Math.max(0,n(patch.price)),patch.cost==null?cur.cost:Math.max(0,n(patch.cost)),bulkJson,patch.delivery_mode==null?cur.delivery_mode:(String(patch.delivery_mode)==='preorder'?'preorder':'auto'),patch.supplier_source==null?cur.supplier_source:cleanText(patch.supplier_source,30).toLowerCase(),patch.supplier_product_id==null?cur.supplier_product_id:cleanText(patch.supplier_product_id,120),patch.supplier_price===undefined?Number(cur.supplier_price||0):Math.max(0,Number(patch.supplier_price||0)),patch.supplier_public_price===undefined?Number(cur.supplier_public_price||0):Math.max(0,Number(patch.supplier_public_price||0)),supplierStock,patch.supplier_synced_at===undefined?cur.supplier_synced_at:(patch.supplier_synced_at||null),patch.active==null?cur.active:boolInt(patch.active),patch.sort_order==null?cur.sort_order:n(patch.sort_order),now(),n(id));
  return getVariant(id);
}
function deleteVariant(id){return db.prepare('DELETE FROM product_variants WHERE id=?').run(n(id)).changes>0;}
function listStock(productId,variantId=null,{limit=1000,status=''}={}){
  const args=[n(productId)];let where='product_id=?';
  if(variantId){where+=' AND variant_id=?';args.push(n(variantId));}else where+=' AND variant_id IS NULL';
  if(status){where+=' AND status=?';args.push(cleanText(status,20));}
  args.push(Math.min(5000,Math.max(1,n(limit,1000))));return db.prepare(`SELECT * FROM stock_items WHERE ${where} ORDER BY id DESC LIMIT ?`).all(...args);
}
function addStock(productId,variantId,items=[]){
  const p=getProduct(productId);if(!p)throw new Error('Produk tidak ditemukan');if(variantId&&!getVariant(variantId))throw new Error('Varian tidak ditemukan');
  const values=(Array.isArray(items)?items:String(items||'').split(/\r?\n/)).map(x=>cleanText(x,4000)).filter(Boolean);if(!values.length)throw new Error('Data stok kosong');const stmt=db.prepare('INSERT INTO stock_items(product_id,variant_id,value,status,order_ref,created_at) VALUES(?,?,?,\'available\',\'\',?)');
  db.exec('BEGIN IMMEDIATE');try{for(const value of values)stmt.run(n(productId),variantId?n(variantId):null,value,now());db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
  return {added:values.length,stock:stockCount(productId,variantId)};
}
function replaceAvailableStock(productId,variantId,items=[]){
  const values=(Array.isArray(items)?items:String(items||'').split(/\r?\n/)).map(x=>cleanText(x,4000)).filter(Boolean);db.exec('BEGIN IMMEDIATE');try{if(variantId)db.prepare("DELETE FROM stock_items WHERE product_id=? AND variant_id=? AND status='available'").run(n(productId),n(variantId));else db.prepare("DELETE FROM stock_items WHERE product_id=? AND variant_id IS NULL AND status='available'").run(n(productId));const stmt=db.prepare('INSERT INTO stock_items(product_id,variant_id,value,status,order_ref,created_at) VALUES(?,?,?,\'available\',\'\',?)');for(const value of values)stmt.run(n(productId),variantId?n(variantId):null,value,now());db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}return {stock:stockCount(productId,variantId)};
}
function getStockItem(id){return db.prepare('SELECT * FROM stock_items WHERE id=?').get(n(id))||null;}
function updateStockItem(id,value){
  const cur=getStockItem(id);if(!cur)return null;if(cur.status!=='available')throw new Error('Stok yang sudah terjual tidak dapat diedit.');
  const next=cleanText(value,4000);if(!next)throw new Error('Isi stok tidak boleh kosong.');
  db.prepare('UPDATE stock_items SET value=? WHERE id=?').run(next,n(id));return getStockItem(id);
}
function deleteStockItem(id){
  const cur=getStockItem(id);if(!cur)return false;if(cur.status!=='available')throw new Error('Stok yang sudah terjual tidak dapat dihapus.');
  return db.prepare('DELETE FROM stock_items WHERE id=?').run(n(id)).changes>0;
}

function consumeStock(productId,variantId,qty,orderRef){
  qty=Math.max(1,n(qty,1));const rows=variantId?db.prepare("SELECT * FROM stock_items WHERE product_id=? AND variant_id=? AND status='available' ORDER BY id LIMIT ?").all(n(productId),n(variantId),qty):db.prepare("SELECT * FROM stock_items WHERE product_id=? AND variant_id IS NULL AND status='available' ORDER BY id LIMIT ?").all(n(productId),qty);
  if(rows.length<qty)throw new Error('Stok tidak mencukupi.');const stmt=db.prepare("UPDATE stock_items SET status='sold',order_ref=?,sold_at=? WHERE id=? AND status='available'");for(const row of rows){const r=stmt.run(cleanText(orderRef,120),now(),row.id);if(r.changes!==1)throw new Error('Stok berubah saat checkout. Silakan ulangi.');}return rows.map(x=>x.value);
}

function couponByCode(code){return db.prepare('SELECT * FROM coupons WHERE code=?').get(cleanText(code,80).toUpperCase())||null;}
function listCoupons({limit=500,search=''}={}){const q=cleanText(search,100);if(q){const like=`%${q}%`;return db.prepare('SELECT * FROM coupons WHERE code LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT ?').all(like,like,Math.min(1000,n(limit,500)));}return db.prepare('SELECT * FROM coupons ORDER BY id DESC LIMIT ?').all(Math.min(1000,n(limit,500)));}
function saveCoupon(input={}){const id=n(input.id);const code=cleanText(input.code,80).toUpperCase();if(!code)throw new Error('Kode kupon wajib diisi');const t=now();const values=[code,cleanText(input.name,180),String(input.discount_type)==='percent'?'percent':'fixed',Math.max(0,n(input.discount_value)),Math.max(0,n(input.max_discount)),Math.max(0,n(input.min_purchase)),Math.max(0,n(input.usage_limit)),input.active==null?1:boolInt(input.active),input.starts_at||null,input.expires_at||null,JSON.stringify(Array.isArray(input.product_ids)?input.product_ids.map(Number).filter(Boolean):safeJsonParse(input.product_ids_json,[])||[]),t];
  if(id){db.prepare('UPDATE coupons SET code=?,name=?,discount_type=?,discount_value=?,max_discount=?,min_purchase=?,usage_limit=?,active=?,starts_at=?,expires_at=?,product_ids_json=?,updated_at=? WHERE id=?').run(...values,id);return db.prepare('SELECT * FROM coupons WHERE id=?').get(id);}
  const r=db.prepare('INSERT INTO coupons(code,name,discount_type,discount_value,max_discount,min_purchase,usage_limit,used_count,active,starts_at,expires_at,product_ids_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?,?,?,?,?)').run(...values.slice(0,7),values[7],values[8],values[9],values[10],t,t);return db.prepare('SELECT * FROM coupons WHERE id=?').get(r.lastInsertRowid);
}
function deleteCoupon(id){return db.prepare('DELETE FROM coupons WHERE id=?').run(n(id)).changes>0;}
function validateCoupon(code,subtotal,productId){const c=couponByCode(code);if(!c||!c.active)return {ok:false,message:'Kupon tidak aktif atau tidak ditemukan.'};const time=Date.now();if(c.starts_at&&new Date(c.starts_at).getTime()>time)return{ok:false,message:'Kupon belum mulai.'};if(c.expires_at&&new Date(c.expires_at).getTime()<time)return{ok:false,message:'Kupon sudah berakhir.'};if(c.usage_limit>0&&c.used_count>=c.usage_limit)return{ok:false,message:'Kuota kupon sudah habis.'};if(n(subtotal)<n(c.min_purchase))return{ok:false,message:`Minimal transaksi Rp ${n(c.min_purchase).toLocaleString('id-ID')}.`};const targets=safeJsonParse(c.product_ids_json,[]);if(Array.isArray(targets)&&targets.length&&productId&&!targets.map(Number).includes(n(productId)))return{ok:false,message:'Kupon tidak berlaku untuk produk ini.'};let discount=c.discount_type==='percent'?Math.floor(n(subtotal)*Math.max(0,n(c.discount_value))/100):Math.max(0,n(c.discount_value));if(c.max_discount>0)discount=Math.min(discount,n(c.max_discount));discount=Math.min(discount,n(subtotal));return{ok:true,coupon:c,discount};}

function createOrder(input={}){const ref=cleanText(input.order_ref,120)||makeRef('ORD');const t=now();const telegramId=cleanText(input.telegram_id,40),buyerName=cleanText(input.buyer_name,180);if(telegramId&&!getUser(telegramId))upsertUser({telegram_id:telegramId,first_name:buyerName||telegramId});const r=db.prepare(`INSERT INTO orders(order_ref,telegram_id,buyer_name,product_id,variant_id,product_code,product_name,variant_name,quantity,unit_price,subtotal,discount_amount,total_price,cost_amount,profit_amount,status,payment_method,delivery_mode,delivery_text,coupon_code,supplier_source,supplier_order_id,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run(ref,telegramId,buyerName,input.product_id?n(input.product_id):null,input.variant_id?n(input.variant_id):null,cleanText(input.product_code,80),cleanText(input.product_name,180),cleanText(input.variant_name,160),Math.max(1,n(input.quantity,1)),Math.max(0,n(input.unit_price)),Math.max(0,n(input.subtotal)),Math.max(0,n(input.discount_amount)),Math.max(0,n(input.total_price)),Math.max(0,n(input.cost_amount)),n(input.profit_amount),cleanText(input.status||'pending',40),cleanText(input.payment_method,50),cleanText(input.delivery_mode||'auto',30),cleanText(input.delivery_text,8000),cleanText(input.coupon_code,80),cleanText(input.supplier_source,30),cleanText(input.supplier_order_id,160),cleanText(input.note,2000),t,t);return getOrder(r.lastInsertRowid);}
function createManualOrder(input={}){
  const product=getProduct(input.product_id);if(!product)throw new Error('Pilih produk dari katalog.');
  const variant=input.variant_id?getVariant(input.variant_id):null;if(variant&&Number(variant.product_id)!==Number(product.id))throw new Error('Varian tidak sesuai produk.');
  const qty=Math.max(1,n(input.quantity,1));const unitPrice=input.unit_price===undefined?Number(variant?.price??product.price):Math.max(0,n(input.unit_price));const unitCost=input.unit_cost===undefined?Number(variant?.cost??product.cost):Math.max(0,n(input.unit_cost));
  const total=input.total_price===undefined?unitPrice*qty:Math.max(0,n(input.total_price));const cost=input.cost_amount===undefined?unitCost*qty:Math.max(0,n(input.cost_amount));
  const status=['pending_payment','paid','completed','waiting_delivery','supplier_pending','failed','canceled','expired'].includes(String(input.status))?String(input.status):'completed';
  const created=createOrder({order_ref:input.order_ref||makeRef('MAN'),telegram_id:input.telegram_id,buyer_name:input.buyer_name,product_id:product.id,variant_id:variant?.id||null,product_code:product.code,product_name:product.name,variant_name:variant?.name||'',quantity:qty,unit_price:unitPrice,subtotal:unitPrice*qty,total_price:total,cost_amount:cost,profit_amount:total-cost,status,payment_method:cleanText(input.payment_method||'manual',50),delivery_mode:variant?.delivery_mode||product.delivery_mode,supplier_source:variant?.supplier_source||'',note:input.note||''});return updateOrder(created.id,{status});
}
function getOrder(idOrRef){const raw=String(idOrRef||'');return (/^\d+$/.test(raw)?db.prepare('SELECT * FROM orders WHERE id=?').get(n(raw)):db.prepare('SELECT * FROM orders WHERE order_ref=?').get(raw))||null;}
function listOrders({limit=300,offset=0,search='',status='',month='',year=''}={}){limit=Math.min(1000,Math.max(1,n(limit,300)));offset=Math.max(0,n(offset));const where=[];const args=[];const q=cleanText(search,120);if(q){const like=`%${q}%`;where.push('(order_ref LIKE ? OR telegram_id LIKE ? OR buyer_name LIKE ? OR product_name LIKE ?)');args.push(like,like,like,like);}if(status){where.push('status=?');args.push(cleanText(status,40));}if(month&&year){where.push("strftime('%m',created_at)=? AND strftime('%Y',created_at)=?");args.push(String(month).padStart(2,'0'),String(year));}args.push(limit,offset);return db.prepare(`SELECT o.*, (SELECT p.channel FROM payments p WHERE p.order_ref=o.order_ref ORDER BY p.id DESC LIMIT 1) payment_channel, (SELECT p.status FROM payments p WHERE p.order_ref=o.order_ref ORDER BY p.id DESC LIMIT 1) payment_status, (SELECT p.amount FROM payments p WHERE p.order_ref=o.order_ref ORDER BY p.id DESC LIMIT 1) payment_amount, (SELECT COALESCE(NULLIF(p.provider_reference,''),p.transaction_id) FROM payments p WHERE p.order_ref=o.order_ref ORDER BY p.id DESC LIMIT 1) payment_reference FROM orders o ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...args);}
function listOrdersByUser(id,limit=20){return db.prepare('SELECT * FROM orders WHERE telegram_id=? ORDER BY id DESC LIMIT ?').all(String(id),Math.min(100,Math.max(1,n(limit,20))));}
function updateOrder(idOrRef,patch={}){const cur=getOrder(idOrRef);if(!cur)return null;const fields=['buyer_name','status','payment_method','delivery_text','coupon_code','supplier_source','supplier_order_id','note','cost_amount'];const sets=[];const args=[];for(const k of fields){if(patch[k]!==undefined){sets.push(`${k}=?`);args.push(k==='cost_amount'?Math.max(0,n(patch[k])):cleanText(patch[k],k==='delivery_text'?8000:2000));}}if(patch.status==='completed'&&!cur.completed_at){sets.push('completed_at=?');args.push(now());}if(['canceled','cancelled'].includes(String(patch.status))){sets.push('completed_at=NULL');}if(['paid','completed','waiting_delivery'].includes(String(patch.status))&&!cur.paid_at){sets.push('paid_at=?');args.push(now());}if(patch.cost_amount!==undefined){const cost=Math.max(0,n(patch.cost_amount));sets.push('profit_amount=?');args.push(n(cur.total_price)-cost);}if(!sets.length)return cur;sets.push('updated_at=?');args.push(now());args.push(cur.id);db.prepare(`UPDATE orders SET ${sets.join(',')} WHERE id=?`).run(...args);return getOrder(cur.id);}
function deleteOrder(id){return db.prepare('DELETE FROM orders WHERE id=?').run(n(id)).changes>0;}
function fulfillPreorder(idOrRef,deliveryText){const order=getOrder(idOrRef);if(!order)throw new Error('Pesanan tidak ditemukan');if(order.status!=='waiting_delivery')throw new Error('Pesanan bukan PRE-ORDER yang menunggu pengiriman');return updateOrder(order.id,{status:'completed',delivery_text:cleanText(deliveryText,8000)});}

function markCouponUsed(code){if(code)db.prepare('UPDATE coupons SET used_count=used_count+1,updated_at=? WHERE code=?').run(now(),cleanText(code,80).toUpperCase());}
function completeLocalOrder(orderRef){const order=getOrder(orderRef);if(!order)throw new Error('Pesanan tidak ditemukan');if(['completed','waiting_delivery'].includes(order.status))return order;const product=getProduct(order.product_id);if(!product)throw new Error('Produk tidak ditemukan');const variant=order.variant_id?getVariant(order.variant_id):null;const mode=variant?.delivery_mode||product.delivery_mode||'auto';let delivered=[];db.exec('BEGIN IMMEDIATE');try{if(mode==='auto'){delivered=consumeStock(product.id,variant?.id||null,order.quantity,order.order_ref);}const status=mode==='preorder'?'waiting_delivery':'completed';const delivery=delivered.join('\n');const cost=(variant?variant.cost:product.cost)*order.quantity;db.prepare('UPDATE orders SET status=?,delivery_mode=?,delivery_text=?,cost_amount=?,profit_amount=?,paid_at=COALESCE(paid_at,?),completed_at=?,updated_at=? WHERE id=?').run(status,mode,delivery,cost,order.total_price-cost,now(),status==='completed'?now():null,now(),order.id);if(order.coupon_code)markCouponUsed(order.coupon_code);db.exec('COMMIT');}catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}return getOrder(order.id);}

function redeemByCode(code,userId){const row=db.prepare('SELECT * FROM redeem_codes WHERE code=?').get(cleanText(code,100).toUpperCase());if(!row)throw new Error('Kode redeem tidak ditemukan.');if(!row.active||row.claimed_by)throw new Error('Kode redeem sudah digunakan atau tidak aktif.');if(row.expires_at&&new Date(row.expires_at).getTime()<Date.now())throw new Error('Kode redeem sudah kedaluwarsa.');const claim=db.prepare("UPDATE redeem_codes SET active=0,claimed_by=?,claimed_at=?,updated_at=? WHERE id=? AND active=1 AND claimed_by=''").run(String(userId),now(),now(),row.id);if(claim.changes!==1)throw new Error('Kode redeem sudah digunakan.');try{let result={type:row.type,value:row.value};if(row.type==='balance'){adjustWallet(userId,{mainDelta:Math.max(0,n(row.value)),reason:'Redeem saldo',reference:row.code});}else if(row.type==='product'){const product=getProduct(row.product_id);const variant=row.variant_id?getVariant(row.variant_id):null;if(!product)throw new Error('Produk redeem sudah tidak tersedia.');const qty=Math.max(1,n(row.value,1));const order=createOrder({telegram_id:String(userId),product_id:product.id,variant_id:variant?.id||null,product_code:product.code,product_name:product.name,variant_name:variant?.name||'',quantity:qty,unit_price:0,subtotal:0,total_price:0,status:'paid',payment_method:'redeem',delivery_mode:variant?.delivery_mode||product.delivery_mode,coupon_code:''});result.order=completeLocalOrder(order.order_ref);}return result;}catch(e){db.prepare("UPDATE redeem_codes SET active=1,claimed_by='',claimed_at=NULL,updated_at=? WHERE id=?").run(now(),row.id);throw e;}}
function listRedeemCodes({limit=500,search=''}={}){const q=cleanText(search,100);if(q){const like=`%${q}%`;return db.prepare('SELECT * FROM redeem_codes WHERE code LIKE ? ORDER BY id DESC LIMIT ?').all(like,Math.min(1000,n(limit,500)));}return db.prepare('SELECT * FROM redeem_codes ORDER BY id DESC LIMIT ?').all(Math.min(1000,n(limit,500)));}
function createRedeemCodes(input={}){const count=Math.min(200,Math.max(1,n(input.count,1)));const type=['balance','product'].includes(String(input.type))?String(input.type):'balance';const rows=[];const stmt=db.prepare('INSERT INTO redeem_codes(code,type,value,product_id,variant_id,active,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)');for(let i=0;i<count;i++){const code=count===1&&input.code?cleanText(input.code,100).toUpperCase():randomCode('IL-',5);const t=now();stmt.run(code,type,Math.max(0,n(input.value,type==='product'?1:0)),input.product_id?n(input.product_id):null,input.variant_id?n(input.variant_id):null,input.expires_at||null,t,t);rows.push(db.prepare('SELECT * FROM redeem_codes WHERE code=?').get(code));}return rows;}
function updateRedeemCode(id,patch={}){const c=db.prepare('SELECT * FROM redeem_codes WHERE id=?').get(n(id));if(!c)return null;db.prepare('UPDATE redeem_codes SET active=?,expires_at=?,updated_at=? WHERE id=?').run(patch.active==null?c.active:boolInt(patch.active),patch.expires_at===undefined?c.expires_at:(patch.expires_at||null),now(),n(id));return db.prepare('SELECT * FROM redeem_codes WHERE id=?').get(n(id));}
function deleteRedeemCode(id){return db.prepare('DELETE FROM redeem_codes WHERE id=?').run(n(id)).changes>0;}

function createPayment(input={}){const ref=cleanText(input.ref,120)||makeRef('PAY');const t=now();db.prepare('INSERT INTO payments(ref,kind,order_ref,telegram_id,provider,channel,transaction_id,provider_reference,amount,status,qr_string,qr_url,qr_chat_id,qr_message_id,expires_at,last_checked_at,raw_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,?)')
  .run(ref,cleanText(input.kind||'order',20),cleanText(input.order_ref,120),cleanText(input.telegram_id,40),cleanText(input.provider||'autogopay',30),cleanText(input.channel||'gopay',30),cleanText(input.transaction_id,160),cleanText(input.provider_reference,160),Math.max(0,n(input.amount)),cleanText(input.status||'pending',30),cleanText(input.qr_string,8000),cleanText(input.qr_url,2000),cleanText(input.qr_chat_id,40),Math.max(0,n(input.qr_message_id)),input.expires_at||null,JSON.stringify(input.raw||{}),t,t);return getPayment(ref);}
function getPayment(ref){return db.prepare('SELECT * FROM payments WHERE ref=?').get(String(ref))||null;}
function getPaymentByOrder(orderRef){return db.prepare('SELECT * FROM payments WHERE order_ref=? ORDER BY id DESC LIMIT 1').get(String(orderRef||''))||null;}
function pendingPayments(limit=100){return db.prepare("SELECT * FROM payments WHERE status='pending' ORDER BY id LIMIT ?").all(Math.min(500,Math.max(1,n(limit,100))));}
function updatePayment(ref,patch={}){const cur=getPayment(ref);if(!cur)return null;db.prepare('UPDATE payments SET status=?,transaction_id=?,provider_reference=?,qr_chat_id=?,qr_message_id=?,last_checked_at=?,raw_json=?,updated_at=? WHERE ref=?').run(patch.status==null?cur.status:cleanText(patch.status,30),patch.transaction_id==null?cur.transaction_id:cleanText(patch.transaction_id,160),patch.provider_reference==null?cur.provider_reference:cleanText(patch.provider_reference,160),patch.qr_chat_id==null?cur.qr_chat_id:cleanText(patch.qr_chat_id,40),patch.qr_message_id==null?cur.qr_message_id:Math.max(0,n(patch.qr_message_id)),now(),patch.raw==null?cur.raw_json:JSON.stringify(patch.raw),now(),String(ref));return getPayment(ref);}

function getDashboardSummary(){
  const today=db.prepare(`SELECT COUNT(*) total_orders,
    COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN total_price ELSE 0 END),0) revenue,
    COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN profit_amount ELSE 0 END),0) profit
    FROM orders WHERE date(datetime(created_at,'+7 hours'))=date(datetime('now','+7 hours'))`).get();
  const totalStock=listProducts({limit:1000}).reduce((sum,p)=>sum+n(p.stock),0);
  const dailyRaw=db.prepare(`SELECT date(datetime(created_at,'+7 hours')) day,
    COUNT(*) orders,
    COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN total_price ELSE 0 END),0) revenue,
    COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN profit_amount ELSE 0 END),0) profit
    FROM orders
    WHERE datetime(created_at,'+7 hours') >= datetime('now','+7 hours','-6 days','start of day')
    GROUP BY date(datetime(created_at,'+7 hours')) ORDER BY day`).all();
  const byDay=new Map(dailyRaw.map(r=>[r.day,r]));
  const last7=[];
  for(let i=6;i>=0;i--){
    const d=new Date(Date.now()+7*3600000-i*86400000);
    const key=d.toISOString().slice(0,10);const r=byDay.get(key)||{};
    last7.push({day:key,orders:n(r.orders),revenue:n(r.revenue),profit:n(r.profit)});
  }
  const top=db.prepare(`SELECT product_name,COUNT(*) orders,COALESCE(SUM(quantity),0) qty,
    COALESCE(SUM(total_price),0) revenue
    FROM orders
    WHERE status IN ('completed','waiting_delivery')
      AND datetime(created_at,'+7 hours') >= datetime('now','+7 hours','-6 days','start of day')
    GROUP BY product_name ORDER BY qty DESC,revenue DESC LIMIT 5`).all();
  return {today:{orders:n(today.total_orders),revenue:n(today.revenue),profit:n(today.profit)},total_stock:totalStock,last7,top_products:top};
}

function getReports({type='monthly',date='',month='',year=''}={}){
  const nowJkt=new Date(Date.now()+7*3600000);
  const yy=String(year||nowJkt.getUTCFullYear());
  const mm=String(month||nowJkt.getUTCMonth()+1).padStart(2,'0');
  const dd=cleanText(date,10)||`${yy}-${mm}-${String(nowJkt.getUTCDate()).padStart(2,'0')}`;
  let where='',args=[],bucketSql='',bucketLabel='';
  if(type==='daily'){
    where="date(datetime(created_at,'+7 hours'))=?";args=[dd];
    bucketSql="strftime('%H:00',datetime(created_at,'+7 hours'))";bucketLabel='hour';
  }else if(type==='yearly'){
    where="strftime('%Y',datetime(created_at,'+7 hours'))=?";args=[yy];
    bucketSql="strftime('%Y-%m',datetime(created_at,'+7 hours'))";bucketLabel='month';
  }else{
    type='monthly';
    where="strftime('%m',datetime(created_at,'+7 hours'))=? AND strftime('%Y',datetime(created_at,'+7 hours'))=?";args=[mm,yy];
    bucketSql="date(datetime(created_at,'+7 hours'))";bucketLabel='day';
  }
  const summary=db.prepare(`SELECT COUNT(*) total_orders,COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN total_price ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN profit_amount ELSE 0 END),0) profit,COALESCE(SUM(CASE WHEN status='pending_payment' THEN 1 ELSE 0 END),0) pending FROM orders WHERE ${where}`).get(...args);
  const series=db.prepare(`SELECT ${bucketSql} bucket,COUNT(*) orders,COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN total_price ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN status IN ('completed','waiting_delivery') THEN profit_amount ELSE 0 END),0) profit FROM orders WHERE ${where} GROUP BY ${bucketSql} ORDER BY bucket`).all(...args);
  const top=db.prepare(`SELECT product_name,COUNT(*) orders,COALESCE(SUM(quantity),0) qty,COALESCE(SUM(total_price),0) revenue FROM orders WHERE status IN ('completed','waiting_delivery') AND ${where} GROUP BY product_name ORDER BY revenue DESC,qty DESC LIMIT 10`).all(...args);
  return{type,date:dd,month:Number(mm),year:Number(yy),bucket_label:bucketLabel,summary,series,top_products:top};
}
function getOrderDetail(idOrRef){
  const order=getOrder(idOrRef);if(!order)return null;
  const stock=db.prepare('SELECT id,value,status,created_at,sold_at FROM stock_items WHERE order_ref=? ORDER BY id').all(order.order_ref);
  const payment=db.prepare('SELECT ref,provider,channel,transaction_id,provider_reference,amount,status,expires_at,created_at,updated_at FROM payments WHERE order_ref=? ORDER BY id DESC LIMIT 1').get(order.order_ref)||null;
  const product=order.product_id?getProduct(order.product_id):null;
  const variant=order.variant_id?getVariant(order.variant_id):null;
  return{...order,purchased_items:stock,payment,product_snapshot:product?{id:product.id,code:product.code,name:product.name,description:product.description,terms:product.terms}:null,variant_snapshot:variant?{id:variant.id,name:variant.name,variant_key:variant.variant_key,description:variant.description,terms:variant.terms}:null};
}
function customerSummary({limit=200,search=''}={}){const q=cleanText(search,100);const args=[];let where='';if(q){const like=`%${q}%`;where='WHERE u.telegram_id LIKE ? OR u.username LIKE ? OR u.first_name LIKE ?';args.push(like,like,like);}args.push(Math.min(1000,Math.max(1,n(limit,200))));return db.prepare(`SELECT u.*,COALESCE(COUNT(o.id),0) order_count,COALESCE(SUM(CASE WHEN o.status IN ('completed','waiting_delivery') THEN o.total_price ELSE 0 END),0) spending FROM users u LEFT JOIN orders o ON o.telegram_id=u.telegram_id ${where} GROUP BY u.telegram_id ORDER BY spending DESC,u.last_seen_at DESC LIMIT ?`).all(...args).map(normalizeUser);}
function getOverview(){
  const settings=getSettings();
  const users=Number(db.prepare('SELECT COUNT(*) c FROM users').get().c||0),activeUsers=Number(db.prepare("SELECT COUNT(*) c FROM users WHERE status='active'").get().c||0),products=Number(db.prepare('SELECT COUNT(*) c FROM products').get().c||0),activeProducts=Number(db.prepare('SELECT COUNT(*) c FROM products WHERE active=1').get().c||0);
  const totalStock=listProducts({limit:1000}).reduce((sum,p)=>sum+n(p.stock),0),sales=getEffectiveHistoricalStats();
  const month=db.prepare(`SELECT COUNT(*) orders,COALESCE(SUM(total_price),0) revenue,COALESCE(SUM(profit_amount),0) profit FROM orders WHERE status IN ('completed','waiting_delivery') AND strftime('%Y-%m',datetime(created_at,'+7 hours'))=strftime('%Y-%m',datetime('now','+7 hours'))`).get();
  const today=db.prepare(`SELECT COUNT(*) orders,COALESCE(SUM(total_price),0) revenue,COALESCE(SUM(profit_amount),0) profit FROM orders WHERE status IN ('completed','waiting_delivery') AND date(datetime(created_at,'+7 hours'))=date(datetime('now','+7 hours'))`).get();
  const pending=Number(db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','pending_payment','supplier_pending')").get().c||0);
  return{users,active_users:activeUsers,products,active_products:activeProducts,total_stock:totalStock,total_stock_sold:n(sales.quantity_sold),orders:n(sales.orders_total),transactions:n(sales.orders_total),pending_orders:pending,revenue:n(sales.revenue_total),profit:n(sales.profit_total),today_orders:n(today.orders),today_revenue:n(today.revenue),today_profit:n(today.profit),month_orders:n(month.orders),month_revenue:n(month.revenue),month_profit:n(month.profit),store_balance:n(settings.store_balance,0),store_balance_metric:String(settings.store_balance_metric||'month_profit'),stats_mode:sales.mode||'live',db_size_bytes:fs.existsSync(config.dbFile)?fs.statSync(config.dbFile).size:0};
}

function finalizeJaspayLocalOrder(orderRef,{success_qty=0,delivery_text='',cost_amount=0,customer_refund_amount=0,status='completed',note=''}={}){
  const order=getOrder(orderRef);if(!order)throw new Error('Pesanan tidak ditemukan');const success=Math.max(0,n(success_qty));const refund=Math.max(0,n(customer_refund_amount));const gross=Math.max(0,n(order.total_price));const total=Math.max(0,gross-refund);const cost=Math.max(0,n(cost_amount));const finalStatus=success>0?'completed':(status==='canceled'?'canceled':'failed');const t=now();
  db.prepare(`UPDATE orders SET quantity=?,subtotal=?,total_price=?,cost_amount=?,profit_amount=?,status=?,delivery_text=?,note=?,completed_at=?,updated_at=? WHERE id=?`).run(success,total,total,cost,total-cost,finalStatus,cleanText(delivery_text,8000),cleanText(note||`Fresh selesai. Refund saldo ${refund}`,2000),finalStatus==='completed'?t:null,t,order.id);return getOrder(order.id);
}

function normalizeJaspayProductRow(row){
  if(!row)return null;return{...row,enabled:Boolean(row.enabled),available:Boolean(row.available),pricing_value:Number(row.pricing_value||0),api_unit_price:Number(row.api_unit_price||0),qty_max:Math.max(1,n(row.qty_max,1)),options:safeJsonParse(row.options_json,{})||{},presentation:safeJsonParse(row.presentation_json,{})||{}};
}
function upsertJaspayProductSnapshot(item={}){
  const key=cleanText(item.key||item.product_key,100).toLowerCase();if(!key)return null;const cur=db.prepare('SELECT * FROM jaspay_products WHERE product_key=?').get(key);const t=now();
  const apiPrice=item.unit_price==null&&item.api_unit_price==null?Number(cur?.api_unit_price||0):Math.max(0,n(item.unit_price??item.api_unit_price));
  const qtyMax=item.qty_max==null?Math.max(1,n(cur?.qty_max,1)):Math.max(1,n(item.qty_max,1));
  const optionsJson=item.options==null?(cur?.options_json||'{}'):JSON.stringify(item.options||{});
  db.prepare(`INSERT INTO jaspay_products(product_key,name,enabled,pricing_mode,pricing_value,description,presentation_json,api_unit_price,qty_max,options_json,available,unavailable_code,unavailable_message,synced_at,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(product_key) DO UPDATE SET name=excluded.name,api_unit_price=excluded.api_unit_price,qty_max=excluded.qty_max,options_json=excluded.options_json,available=excluded.available,unavailable_code=excluded.unavailable_code,unavailable_message=excluded.unavailable_message,synced_at=excluded.synced_at,updated_at=excluded.updated_at`)
    .run(key,cleanText(item.name||cur?.name||key,180),cur?cur.enabled:0,cur?.pricing_mode||'markup_fixed',Number(cur?.pricing_value||0),cur?.description||'',cur?.presentation_json||'{}',apiPrice,qtyMax,optionsJson,item.available===false?0:1,cleanText(item.code,100),cleanText(item.message,1000),t,cur?.created_at||t,t);
  return getJaspayProduct(key);
}
function getJaspayProduct(key){return normalizeJaspayProductRow(db.prepare('SELECT * FROM jaspay_products WHERE product_key=?').get(cleanText(key,100).toLowerCase())||null);}
function listJaspayProducts({enabled=null}={}){const args=[];let where='';if(enabled!==null){where='WHERE enabled=?';args.push(boolInt(enabled));}return db.prepare(`SELECT * FROM jaspay_products ${where} ORDER BY name COLLATE NOCASE ASC, product_key ASC`).all(...args).map(normalizeJaspayProductRow);}
function updateJaspayProduct(key,patch={}){const cur=getJaspayProduct(key);if(!cur)return null;const mode=['fixed','markup_fixed','markup_percent'].includes(String(patch.pricing_mode))?String(patch.pricing_mode):cur.pricing_mode;const presentation=patch.presentation===undefined?cur.presentation:(patch.presentation&&typeof patch.presentation==='object'?patch.presentation:{});db.prepare('UPDATE jaspay_products SET enabled=?,pricing_mode=?,pricing_value=?,description=?,presentation_json=?,updated_at=? WHERE product_key=?').run(patch.enabled==null?(cur.enabled?1:0):boolInt(patch.enabled),mode,patch.pricing_value==null?cur.pricing_value:Number(patch.pricing_value||0),patch.description==null?cur.description:cleanText(patch.description,2000),JSON.stringify(presentation||{}),now(),cur.product_key);return getJaspayProduct(cur.product_key);}
function jaspaySellPrice(itemOrKey,apiPrice=null){const row=typeof itemOrKey==='string'?getJaspayProduct(itemOrKey):itemOrKey;if(!row)return Math.max(0,n(apiPrice));const base=Math.max(0,n(apiPrice==null?row.api_unit_price:apiPrice));const val=Number(row.pricing_value||0);if(row.pricing_mode==='fixed')return Math.max(0,Math.round(val));if(row.pricing_mode==='markup_percent')return Math.max(0,Math.round(base+(base*val/100)));return Math.max(0,Math.round(base+val));}
function createJaspayOrderRecord(input={}){const ref=cleanText(input.order_ref,120);if(!ref)throw new Error('order_ref wajib diisi');const t=now();db.prepare(`INSERT INTO jaspay_orders(order_ref,api_order_id,product_key,product_name,options_json,qty,sell_unit_price,api_unit_price,api_total_price,status,phase,queue_position,progress_success,progress_processed,progress_total,api_refunded_total,customer_refund_amount,result_json,raw_json,created_at,updated_at,completed_at,customer_notified_at)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_ref) DO NOTHING`).run(ref,cleanText(input.api_order_id,160),cleanText(input.product_key,100).toLowerCase(),cleanText(input.product_name,180),JSON.stringify(input.options||{}),Math.max(1,n(input.qty,1)),Math.max(0,n(input.sell_unit_price)),Math.max(0,n(input.api_unit_price)),Math.max(0,n(input.api_total_price)),cleanText(input.status||'local_pending',40),input.phase||null,input.queue_position==null?null:n(input.queue_position),Math.max(0,n(input.progress_success)),Math.max(0,n(input.progress_processed)),Math.max(0,n(input.progress_total,input.qty||1)),Number(input.api_refunded_total||0),Math.max(0,n(input.customer_refund_amount)),JSON.stringify(input.results||[]),JSON.stringify(input.raw||{}),t,t,input.completed_at||null,input.customer_notified_at||null);return getJaspayOrder(ref);}
function getJaspayOrder(orderRef){const row=db.prepare('SELECT * FROM jaspay_orders WHERE order_ref=?').get(cleanText(orderRef,120));if(!row)return null;return{...row,options:safeJsonParse(row.options_json,{})||{},results:safeJsonParse(row.result_json,[])||[],raw:safeJsonParse(row.raw_json,{})||{}};}
function updateJaspayOrder(orderRef,patch={}){const cur=getJaspayOrder(orderRef);if(!cur)return null;const sets=[],args=[];const scalar=['api_order_id','product_key','product_name','status','phase'];for(const k of scalar)if(patch[k]!==undefined){sets.push(`${k}=?`);args.push(patch[k]==null?null:cleanText(patch[k],k==='product_name'?180:160));}const nums=['qty','sell_unit_price','api_unit_price','api_total_price','queue_position','progress_success','progress_processed','progress_total','customer_refund_amount'];for(const k of nums)if(patch[k]!==undefined){sets.push(`${k}=?`);args.push(patch[k]==null?null:n(patch[k]));}if(patch.api_refunded_total!==undefined){sets.push('api_refunded_total=?');args.push(Number(patch.api_refunded_total||0));}if(patch.options!==undefined){sets.push('options_json=?');args.push(JSON.stringify(patch.options||{}));}if(patch.results!==undefined){sets.push('result_json=?');args.push(JSON.stringify(patch.results||[]));}if(patch.raw!==undefined){sets.push('raw_json=?');args.push(JSON.stringify(patch.raw||{}));}if(patch.completed_at!==undefined){sets.push('completed_at=?');args.push(patch.completed_at||null);}if(patch.customer_notified_at!==undefined){sets.push('customer_notified_at=?');args.push(patch.customer_notified_at||null);}if(!sets.length)return cur;sets.push('updated_at=?');args.push(now());args.push(cur.order_ref);db.prepare(`UPDATE jaspay_orders SET ${sets.join(',')} WHERE order_ref=?`).run(...args);return getJaspayOrder(cur.order_ref);}
function listPendingJaspayOrders(limit=100){return db.prepare("SELECT * FROM jaspay_orders WHERE status IN ('processing','local_pending','retry','notify_pending') ORDER BY updated_at ASC LIMIT ?").all(Math.min(500,Math.max(1,n(limit,100)))).map(r=>getJaspayOrder(r.order_ref));}
function listJaspayOrders(limit=100){return db.prepare('SELECT * FROM jaspay_orders ORDER BY id DESC LIMIT ?'.replace('id DESC','created_at DESC')).all(Math.min(500,Math.max(1,n(limit,100)))).map(r=>getJaspayOrder(r.order_ref));}

function addAudit({actor='system',action,detail='',ip=''}={}){if(!action)return;db.prepare('INSERT INTO audit_logs(actor,action,detail,ip,created_at) VALUES(?,?,?,?,?)').run(cleanText(actor,100),cleanText(action,120),cleanText(typeof detail==='string'?detail:JSON.stringify(detail),3000),cleanText(ip,100),now());}
function listAudit({limit=200}={}){return db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(Math.min(1000,Math.max(1,n(limit,200))));}
function addBroadcastLog({type='text',message='',media='',total=0,sent=0,failed=0}){db.prepare('INSERT INTO broadcast_logs(type,message,media,total,sent,failed,created_at) VALUES(?,?,?,?,?,?,?)').run(cleanText(type,20),cleanText(message,4000),cleanText(media,2000),n(total),n(sent),n(failed),now());}
function listBroadcasts({limit=100}={}){return db.prepare('SELECT * FROM broadcast_logs ORDER BY id DESC LIMIT ?').all(Math.min(500,Math.max(1,n(limit,100))));}

function backupName(prefix='auto'){return `ilink-autoorder-${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;}
function currentBackupSettings(){const s=getSettings();return{enabled:s.auto_backup_enabled!==false,intervalHours:Math.min(168,Math.max(1,n(s.backup_interval_hours,config.backupIntervalHours))),retention:Math.min(365,Math.max(1,n(s.backup_retention,config.backupRetention)))}}
async function createBackup(prefix='auto'){fs.mkdirSync(config.backupDir,{recursive:true});const name=backupName(prefix);const target=path.join(config.backupDir,name);await backup(db,target);pruneBackups();const st=fs.statSync(target);return{name,size_bytes:st.size,created_at:st.mtime.toISOString()};}
function listBackups(){fs.mkdirSync(config.backupDir,{recursive:true});return fs.readdirSync(config.backupDir).filter(x=>x.endsWith('.sqlite')).map(name=>{const st=fs.statSync(path.join(config.backupDir,name));return{name,size_bytes:st.size,created_at:st.mtime.toISOString()};}).sort((a,b)=>b.created_at.localeCompare(a.created_at));}
function getBackupPath(name){const safe=path.basename(String(name||''));if(!safe.endsWith('.sqlite'))return null;const full=path.join(config.backupDir,safe);return fs.existsSync(full)?full:null;}
function deleteBackup(name){const full=getBackupPath(name);if(!full)return false;fs.unlinkSync(full);return true;}
function pruneBackups(){const rows=listBackups();const keep=currentBackupSettings().retention;for(const row of rows.slice(keep)){try{fs.unlinkSync(path.join(config.backupDir,row.name));}catch{}}}
function validateBackupFile(file){let test;try{test=new DatabaseSync(file,{readOnly:true});const row=test.prepare('PRAGMA integrity_check').get();const ok=String(Object.values(row||{})[0]||'').toLowerCase()==='ok';const tables=test.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);if(!ok||!tables.includes('settings')||!tables.includes('orders'))throw new Error('File bukan backup iLink yang valid.');return true;}finally{try{test?.close()}catch{}}}
function importBackupFile(name,buffer){fs.mkdirSync(config.backupDir,{recursive:true});const safe=(path.basename(String(name||'backup.sqlite')).replace(/[^a-zA-Z0-9._-]/g,'_')||'backup.sqlite').replace(/\.sqlite$/i,'')+'.sqlite';const target=path.join(config.backupDir,`uploaded-${Date.now()}-${safe}`);fs.writeFileSync(target,buffer);try{validateBackupFile(target);}catch(e){try{fs.unlinkSync(target)}catch{}throw e;}const st=fs.statSync(target);return{name:path.basename(target),size_bytes:st.size,created_at:st.mtime.toISOString()};}
function restoreBackup(name){const source=getBackupPath(name);if(!source)throw new Error('Backup tidak ditemukan.');validateBackupFile(source);const rollback=path.join(config.backupDir,backupName('before-restore'));try{db.exec('PRAGMA wal_checkpoint(FULL)')}catch{};fs.copyFileSync(config.dbFile,rollback);try{db.close();}catch{};fs.copyFileSync(source,config.dbFile);db=new DatabaseSync(config.dbFile);configureDb();module.exports.db=db;initDb();return{restored:path.basename(source),rollback:path.basename(rollback)};}



function legacyArray(value){return Array.isArray(value)?value:[];}
function legacyTables(payload={},filename=''){
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)&&payload.tables&&typeof payload.tables==='object')return payload.tables;
  if(payload&&typeof payload==='object'&&!Array.isArray(payload)){
    const mapped={
      bot_users:payload.bot_users||payload.users||payload.User||payload.user||[],
      products:payload.products||payload.Produk||payload.produk||[],
      transactions:payload.transactions||payload.Trx||payload.trx||[],
      vouchers:payload.vouchers||payload.Voucher||payload.voucher||[],
      shop_settings:payload.shop_settings||payload.settings||[],
      redeem_codes:payload.redeem_codes||payload.redeem||[]
    };
    if(Object.values(mapped).some(Array.isArray)&&Object.values(mapped).some(v=>Array.isArray(v)&&v.length))return mapped;
  }
  if(Array.isArray(payload)){
    const name=String(filename||'').toLowerCase();const first=payload.find(Boolean)||{};
    if(/produk|product/.test(name)||('nama' in first&&('kode' in first||'harga' in first))||('name' in first&&'code' in first&&('stock' in first||'variants' in first)))return{products:payload};
    if(/voucher|coupon/.test(name)||('potongan' in first&&'kode' in first)||('discount' in first&&'code' in first))return{vouchers:payload};
    if(/trx|trans|order/.test(name)||('jumlah' in first&&'harga' in first&&('tanggal' in first||'product_name' in first)))return{transactions:payload};
    if(/user/.test(name)||('jumlahtransaksi' in first&&'id' in first)||('telegram_id' in first&&('balance_main' in first||'spending' in first)))return{bot_users:payload};
  }
  return{};
}
function legacyVariantRows(product){const rows=legacyArray(product?.variants);return rows.map((v,i)=>({
  name:cleanText(v?.name||v?.nama||`Varian ${i+1}`,160),
  key:cleanText(v?.sku||v?.variant_key||v?.key||`VAR${i+1}`,80).toUpperCase().replace(/\s+/g,'-'),
  price:Math.max(0,n(v?.price??v?.harga)),cost:Math.max(0,n(v?.cost_price??v?.cost??v?.modal??v?.harga_modal)),
  description:cleanText(v?.description||v?.deskripsi||v?.note||v?.catatan,4000),terms:cleanText(v?.snk||v?.terms||v?.syarat,4000),
  delivery_mode:String(v?.delivery_mode||v?.deliveryMode||v?.pengiriman||'').toLowerCase()==='po'?'preorder':(String(v?.delivery_mode||'').toLowerCase()==='preorder'?'preorder':'auto'),
  active:!(v?.active===false||String(v?.active||'').toLowerCase()==='false'||String(v?.status||'').toLowerCase()==='off'),
  stock_mode:String(v?.stock_mode||v?.stockMode||v?.stock_source||'separate').toLowerCase()==='shared'?'shared':'separate',
  stock:legacyArray(v?.stock??v?.stok??v?.data).map(x=>cleanText(x,4000)).filter(Boolean),
  supplier_source:cleanText(v?.supplier_source||v?.supplierSource,30).toLowerCase(),supplier_product_id:cleanText(v?.supplier_product_id||v?.supplierProductId,120),
  supplier_price:Number(v?.supplier_price??v?.supplier_price_usdt??v?.supplierPriceUsdt??0),supplier_public_price:Number(v?.supplier_public_price??v?.supplier_public_price_usdt??v?.supplierPublicPriceUsdt??0),
  supplier_stock:(v?.supplier_stock??v?.supplierStock)==null?null:Math.max(0,n(v?.supplier_stock??v?.supplierStock)),supplier_synced_at:v?.supplier_synced_at||v?.supplierSyncedAt||null,
  sold_count:Math.max(0,n(v?.sold??v?.terjual??v?.sold_count,0))
})).filter(v=>v.name);}
function legacyHistoricalStats(payload={},tables={}){
  let saved={};
  for(const row of legacyArray(tables.shop_settings)){
    if(cleanText(row?.key,80)!=='historical_stats')continue;
    let value=row?.value??row?.value_json??row?.data??{};if(typeof value==='string')value=safeJsonParse(value,{});saved=normalizeHistoricalStats(value);break;
  }
  const products=legacyArray(tables.products),productSold=products.reduce((sum,p)=>sum+Math.max(0,n(p?.sold??p?.terjual??p?.sold_count,0)),0);
  const tx=legacyArray(tables.transactions).filter(x=>!['canceled','cancelled','failed','expired','pending','pending_payment'].includes(String(x?.status||'completed').toLowerCase()));
  const txQty=tx.reduce((sum,x)=>sum+Math.max(1,n(x?.quantity??x?.jumlah,1)),0),txRevenue=tx.reduce((sum,x)=>sum+Math.max(0,n(x?.total_price??x?.harga??x?.amount,0)),0);
  const userTx=legacyArray(tables.bot_users).reduce((sum,u)=>sum+Math.max(0,n(u?.transaction_count??u?.jumlahtransaksi??u?.orders_total,0)),0);
  return normalizeHistoricalStats({orders_total:Math.max(saved.orders_total,tx.length,userTx),quantity_sold:Math.max(saved.quantity_sold,productSold,txQty),revenue_total:Math.max(saved.revenue_total,txRevenue),cost_total:saved.cost_total,profit_total:saved.profit_total,source_generated_at:payload?.generated_at||saved.source_generated_at||'',source:'legacy-json'});
}
function analyzeLegacyBackup(payload={},filename=''){
  const tables=legacyTables(payload,filename);const products=legacyArray(tables.products);const variants=products.reduce((a,p)=>a+legacyVariantRows(p).length,0);const stock=products.reduce((a,p)=>a+legacyArray(p?.stock??p?.data).length+legacyVariantRows(p).reduce((b,v)=>b+(v.stock_mode==='shared'?0:v.stock.length),0),0);
  const format=payload?.app==='telegram-store-vercel-supabase'?'iLink/Supabase JSON backup':payload?.tables?'JSON backup bertabel':Array.isArray(payload)?'Legacy JSON tunggal':'Legacy JSON';
  const historical=legacyHistoricalStats(payload,tables);
  return{format,app:cleanText(payload?.app||'',100),version:cleanText(payload?.version||'',50),generated_at:payload?.generated_at||null,historical,counts:{users:legacyArray(tables.bot_users).length,products:products.length,variants,stock,vouchers:legacyArray(tables.vouchers).length,redeem:legacyArray(tables.redeem_codes).length,settings:legacyArray(tables.shop_settings).length,transactions:legacyArray(tables.transactions).length},supported:Object.keys(tables).filter(k=>legacyArray(tables[k]).length)};
}
function mergeAvailableStock(productId,variantId,values=[]){const incoming=legacyArray(values).map(x=>cleanText(x,4000)).filter(Boolean);if(!incoming.length)return 0;const existing=new Set(listStock(productId,variantId,{limit:5000,status:'available'}).map(x=>String(x.value)));const add=incoming.filter(x=>!existing.has(x));if(add.length)addStock(productId,variantId,add);return add.length;}
function importLegacyBackup(payload={},options={},filename=''){
  const tables=legacyTables(payload,filename);const opt={users:options.users!==false,products:options.products!==false,vouchers:options.vouchers!==false,redeem:options.redeem!==false,settings:options.settings===true,transactions:options.transactions===true,stats:options.stats!==false};
  const result={users:0,products:0,variants:0,stock:0,vouchers:0,redeem:0,settings:0,transactions:0,stats:0,skipped:[]};
  try{
    if(opt.users)for(const u of legacyArray(tables.bot_users)){
      const id=cleanText(u?.telegram_id??u?.id,40);if(!id)continue;const main=Math.max(0,n(u?.balance_main??u?.balance??0)),ref=Math.max(0,n(u?.balance_referral??0));upsertUser({telegram_id:id,username:u?.username||'',first_name:u?.first_name||u?.name||'',last_name:u?.last_name||'',balance_main:main,balance_referral:ref,status:u?.status||'active'});
      db.prepare('UPDATE users SET balance=?,balance_main=?,balance_referral=?,referred_by=?,referral_rewarded=?,updated_at=? WHERE telegram_id=?').run(main+ref,main,ref,cleanText(u?.referred_by,40),u?.referral_rewarded_at||String(u?.referral_status||'').toLowerCase()==='rewarded'?1:0,now(),id);
      const wanted=cleanText(u?.referral_code,40).toUpperCase();if(wanted){try{db.prepare('UPDATE users SET referral_code=? WHERE telegram_id=?').run(wanted,id)}catch{}}
      result.users++;
    }
    const productIdByCode=new Map();
    if(opt.products)for(const p of legacyArray(tables.products)){
      const code=cleanText(p?.code||p?.kode,80).toUpperCase(),name=cleanText(p?.name||p?.nama,180);if(!code||!name){result.skipped.push('Produk tanpa kode/nama');continue;}
      const data={code,name,category:cleanText(p?.category||p?.kategori,100),subtitle:cleanText(p?.subtitle,160),tag:cleanText(p?.tag,80),description:cleanText(p?.description||p?.deskripsi,4000),terms:cleanText(p?.terms||p?.snk,4000),image_url:cleanText(p?.image_url,2000),price:Math.max(0,n(p?.price??p?.harga)),cost:Math.max(0,n(p?.cost_price??p?.cost??p?.modal)),delivery_mode:String(p?.delivery_mode||p?.pengiriman||'').toLowerCase()==='po'?'preorder':(String(p?.delivery_mode||'').toLowerCase()==='preorder'?'preorder':'auto'),active:p?.active===false?false:true};
      let current=getProduct(code);current=current?updateProduct(current.id,data):createProduct(data);productIdByCode.set(code,current.id);result.products++;
      const legacySold=Math.max(0,n(p?.sold??p?.terjual??p?.sold_count,0));if(legacySold>0)db.prepare('UPDATE products SET sold_count=MAX(sold_count,?),updated_at=? WHERE id=?').run(legacySold,now(),current.id);
      result.stock+=mergeAvailableStock(current.id,null,legacyArray(p?.stock??p?.data));
      const existing=productVariants(current.id);for(const v of legacyVariantRows(p)){let cur=existing.find(x=>String(x.variant_key).toUpperCase()===v.key||String(x.name).toLowerCase()===String(v.name).toLowerCase());const vd={variant_key:v.key,name:v.name,description:v.description,terms:v.terms,price:v.price,cost:v.cost,delivery_mode:v.delivery_mode,active:v.active,supplier_source:v.supplier_source,supplier_product_id:v.supplier_product_id,supplier_price:v.supplier_price,supplier_public_price:v.supplier_public_price,supplier_stock:v.supplier_stock,supplier_synced_at:v.supplier_synced_at};cur=cur?updateVariant(cur.id,vd):createVariant(current.id,vd);if(v.sold_count>0)db.prepare('UPDATE product_variants SET sold_count=MAX(sold_count,?),updated_at=? WHERE id=?').run(v.sold_count,now(),cur.id);result.variants++;if(v.stock_mode!=='shared')result.stock+=mergeAvailableStock(current.id,cur.id,v.stock);}
    }
    if(opt.vouchers)for(const v of legacyArray(tables.vouchers)){
      const code=cleanText(v?.code||v?.kode,80).toUpperCase();if(!code)continue;const type=String(v?.discount_type||v?.tipe_diskon||'amount').toLowerCase()==='percent'?'percent':'fixed';const targets=legacyArray(v?.products??v?.produk).map(x=>getProduct(String(x).toUpperCase())?.id).filter(Boolean);const row=saveCoupon({code,name:v?.name||v?.description||v?.deskripsi||'',discount_type:type,discount_value:Math.max(0,n(v?.discount_value??v?.discount??v?.potongan)),min_purchase:Math.max(0,n(v?.min_spend??v?.min_purchase)),usage_limit:Math.max(0,n(v?.usage_limit??v?.limit)),active:v?.active!==false,starts_at:v?.start_at||v?.starts_at||null,expires_at:v?.expires_at||v?.end_at||null,product_ids:targets});const used=legacyArray(v?.used_by??v?.user).length;db.prepare('UPDATE coupons SET used_count=? WHERE id=?').run(used,row.id);result.vouchers++;
    }
    if(opt.redeem)for(const r of legacyArray(tables.redeem_codes)){
      const code=cleanText(r?.code,100).toUpperCase();if(!code)continue;const p=getProduct(r?.product_code||'');const vv=p?productVariants(p.id).find(x=>String(x.variant_key).toUpperCase()===String(r?.variant_key||'').toUpperCase()||String(x.name).toLowerCase()===String(r?.variant_name||'').toLowerCase()):null;const t=now();db.prepare(`INSERT INTO redeem_codes(code,type,value,product_id,variant_id,active,claimed_by,claimed_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(code) DO UPDATE SET type=excluded.type,value=excluded.value,product_id=excluded.product_id,variant_id=excluded.variant_id,active=excluded.active,claimed_by=excluded.claimed_by,claimed_at=excluded.claimed_at,expires_at=excluded.expires_at,updated_at=excluded.updated_at`).run(code,'product',Math.max(1,n(r?.quantity,1)),p?.id||null,vv?.id||null,(r?.active===false||['disabled','redeemed'].includes(String(r?.status||'').toLowerCase()))?0:1,cleanText(r?.claimed_by||r?.redeemed_by,40),r?.claimed_at||r?.redeemed_at||null,r?.expires_at||null,r?.created_at||t,t);result.redeem++;
    }
    if(opt.settings){const allowed=new Set(['store_name','store_tagline','start_media_type','start_media_value','start_media_caption','customer_service_link','group_link','nokos_link','bot_enabled','bot_maintenance_message','show_total_users','required_channel_id','required_channel_link','transaction_channel_id','transaction_notifications_enabled','transaction_notify_orders','transaction_notify_topups','referral_enabled','referral_reward_amount','topup_enabled','wallet_payment_enabled','topup_min_amount','topup_max_amount','autogopay_payment_method']);const patch={};for(const row of legacyArray(tables.shop_settings)){const key=cleanText(row?.key,80);if(!allowed.has(key))continue;let value=row?.value;if(value&&typeof value==='object'&&!Array.isArray(value))value=value.value??value.text??value.url??value;if(['bot_enabled','show_total_users','referral_enabled','topup_enabled','wallet_payment_enabled','transaction_notifications_enabled','transaction_notify_orders','transaction_notify_topups'].includes(key))value=String(value).toLowerCase()==='true'||value===true;if(['referral_reward_amount','topup_min_amount','topup_max_amount'].includes(key))value=n(value);patch[key]=value;result.settings++;}if(Object.keys(patch).length)saveSettings(patch);}
    if(opt.transactions)for(const tr of legacyArray(tables.transactions)){
      const tid=cleanText(tr?.telegram_id??tr?.id,40),pcode=cleanText(tr?.product_code||tr?.kode,80).toUpperCase(),pname=cleanText(tr?.product_name||tr?.nama,180);if(!pname&&!pcode)continue;const qty=Math.max(1,n(tr?.quantity??tr?.jumlah,1)),total=Math.max(0,n(tr?.total_price??tr?.harga)),unit=Math.max(0,n(tr?.unit_price,total?Math.floor(total/qty):0)),cost=Math.max(0,n(tr?.cost_total??tr?.cost??0)),profit=Number.isFinite(Number(tr?.profit_amount))?n(tr?.profit_amount):total-cost;const ref=cleanText(tr?.order_ref,120)||`LEGACY-${crypto.createHash('sha1').update(JSON.stringify(tr)).digest('hex').slice(0,20).toUpperCase()}`;if(getOrder(ref))continue;const product=getProduct(pcode)||null,variant=product?productVariants(product.id).find(x=>String(x.variant_key).toUpperCase()===String(tr?.variant_key||'').toUpperCase()||String(x.name).toLowerCase()===String(tr?.variant_name||'').toLowerCase()):null;const st=String(tr?.status||'completed').toLowerCase()==='canceled'?'canceled':'completed';const created=tr?.created_at||tr?.tanggal||now();db.prepare(`INSERT OR IGNORE INTO orders(order_ref,telegram_id,buyer_name,product_id,variant_id,product_code,product_name,variant_name,quantity,unit_price,subtotal,discount_amount,total_price,cost_amount,profit_amount,status,payment_method,delivery_mode,delivery_text,coupon_code,supplier_source,supplier_order_id,note,created_at,paid_at,completed_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ref,tid,cleanText(tr?.username||tr?.buyer_name,180),product?.id||null,variant?.id||null,pcode,pname,cleanText(tr?.variant_name,160),qty,unit,total,0,total,cost,profit,st,cleanText(tr?.payment_method||'legacy-json',50),'auto',cleanText(tr?.delivered_text||legacyArray(tr?.delivered_items).join('\n'),8000),'','','',cleanText(tr?.note,2000),created,st==='completed'?created:null,st==='completed'?created:null,tr?.updated_at||created);result.transactions++;
    }
    if(opt.stats){const hist=legacyHistoricalStats(payload,tables);mergeHistoricalStatsCandidate(hist,{source_generated_at:payload?.generated_at||hist.source_generated_at||'',source:'legacy-json'});result.stats=1;}
  }catch(e){throw e;}
  return{...result,preview:analyzeLegacyBackup(payload,filename)};
}


function upsertAdminNotification(key,data={}){
  const k=cleanText(key,180);if(!k)return;
  const level=['info','warn','bad','ok'].includes(String(data.level||''))?String(data.level):'info';
  const title=cleanText(data.title,180),message=cleanText(data.message,1200),target=cleanText(data.target_view||'dashboard',40),etype=cleanText(data.entity_type,60),eid=cleanText(data.entity_id,120),t=now();
  const cur=db.prepare('SELECT * FROM admin_notifications WHERE key=?').get(k);
  if(!cur){db.prepare('INSERT INTO admin_notifications(key,level,title,message,target_view,entity_type,entity_id,active,read_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,NULL,?,?)').run(k,level,title,message,target,etype,eid,t,t);return;}
  const changed=String(cur.level)!==level||String(cur.title)!==title||String(cur.message)!==message||String(cur.target_view)!==target;
  const reactivate=Number(cur.active)!==1;
  db.prepare('UPDATE admin_notifications SET level=?,title=?,message=?,target_view=?,entity_type=?,entity_id=?,active=1,read_at=?,updated_at=? WHERE key=?').run(level,title,message,target,etype,eid,(changed||reactivate)?null:cur.read_at,(changed||reactivate)?t:cur.updated_at,k);
}
function syncAdminNotifications(extra={}){
  const activeKeys=[];const push=(key,data)=>{activeKeys.push(key);upsertAdminNotification(key,data);};
  const threshold=Math.max(1,n(getSettings().low_stock_threshold,3));
  const products=listProducts({limit:1000,active:true});
  for(const p of products){
    const variants=(p.variants||[]).filter(v=>v.active);
    if(variants.length){
      for(const v of variants){
        if(v.delivery_mode==='preorder')continue;
        const st=Math.max(0,n(v.stock,0));
        const supplier=v.supplier_source?` supplier ${String(v.supplier_source).toUpperCase()}`:'';
        if(st<=0)push(`stock:variant:${v.id}`,{level:'bad',title:`${p.name} · ${v.name} habis`,message:`Stok varian${supplier} sudah 0. Tambahkan/sinkronkan stok agar produk bisa dibeli.`,target_view:'products',entity_type:'variant',entity_id:String(v.id)});
        else if(st<=threshold)push(`stock:variant:${v.id}`,{level:'warn',title:`${p.name} · ${v.name} menipis`,message:`Stok tersisa ${st}. Batas stok menipis adalah ${threshold}.`,target_view:'products',entity_type:'variant',entity_id:String(v.id)});
      }
    }else if(p.delivery_mode!=='preorder'){
      const st=Math.max(0,n(p.stock,0));
      if(st<=0)push(`stock:product:${p.id}`,{level:'bad',title:`${p.name} habis`,message:'Stok produk sudah 0. Tambahkan stok agar produk bisa dibeli.',target_view:'products',entity_type:'product',entity_id:String(p.id)});
      else if(st<=threshold)push(`stock:product:${p.id}`,{level:'warn',title:`${p.name} menipis`,message:`Stok tersisa ${st}. Batas stok menipis adalah ${threshold}.`,target_view:'products',entity_type:'product',entity_id:String(p.id)});
    }
  }
  const pending=Number(db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','pending_payment','supplier_pending','waiting_delivery','fresh_processing','fresh_attention')").get().c||0);
  if(pending>0)push('orders:pending',{level:'warn',title:`${pending} pesanan belum selesai`,message:'Ada pesanan yang masih menunggu pembayaran, proses Bot, atau pengiriman.',target_view:'orders',entity_type:'orders',entity_id:'pending'});
  const recentOrders=db.prepare("SELECT id,order_ref,buyer_name,product_name,variant_name,total_price,created_at FROM orders WHERE status='completed' AND datetime(COALESCE(completed_at,created_at))>=datetime('now','-1 day') ORDER BY id DESC LIMIT 10").all();
  for(const o of recentOrders)push(`order:completed:${o.id}`,{level:'ok',title:`Pesanan selesai · ${o.product_name||o.order_ref}`,message:`${o.buyer_name||'Pembeli'} · ${o.variant_name?o.variant_name+' · ':''}Rp ${Number(o.total_price||0).toLocaleString('id-ID')} · ${o.order_ref}`,target_view:'orders',entity_type:'order',entity_id:String(o.id)});
  const failed=Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE status IN ('failed','expired') AND datetime(created_at)>=datetime('now','-1 day')").get().c||0);
  if(failed>0)push('payments:failed-24h',{level:'bad',title:`${failed} pembayaran gagal/expired`,message:'Terdapat pembayaran gagal atau kedaluwarsa dalam 24 jam terakhir.',target_view:'orders',entity_type:'payments',entity_id:'failed'});
  if(extra.bot&&extra.bot.enabled&&extra.bot.running===false)push('bot:offline',{level:'bad',title:'Bot Telegram offline',message:'Backend dashboard aktif, tetapi polling bot Telegram sedang tidak berjalan.',target_view:'bot',entity_type:'bot',entity_id:'telegram'});
  if(extra.bot&&Number(extra.bot.network_failures||0)>=3)push('bot:network',{level:'warn',title:'Koneksi Telegram tidak stabil',message:`Terdeteksi ${Number(extra.bot.network_failures||0)} kegagalan jaringan beruntun. Cek koneksi VPS ke Telegram.`,target_view:'bot',entity_type:'bot',entity_id:'network'});
  if(activeKeys.length){const marks=activeKeys.map(()=>'?').join(',');db.prepare(`UPDATE admin_notifications SET active=0,updated_at=? WHERE active=1 AND key NOT IN (${marks})`).run(now(),...activeKeys);}else db.prepare('UPDATE admin_notifications SET active=0,updated_at=? WHERE active=1').run(now());
  return listAdminNotifications({limit:100});
}
function listAdminNotifications({limit=100,unreadOnly=false}={}){
  const lim=Math.min(500,Math.max(1,n(limit,100)));const where=unreadOnly?'active=1 AND read_at IS NULL':'active=1';
  const items=db.prepare(`SELECT * FROM admin_notifications WHERE ${where} ORDER BY CASE level WHEN 'bad' THEN 1 WHEN 'warn' THEN 2 WHEN 'info' THEN 3 ELSE 4 END, updated_at DESC LIMIT ?`).all(lim);
  const unread=Number(db.prepare('SELECT COUNT(*) c FROM admin_notifications WHERE active=1 AND read_at IS NULL').get().c||0);
  return{items,unread,total:Number(db.prepare('SELECT COUNT(*) c FROM admin_notifications WHERE active=1').get().c||0)};
}
function markAdminNotificationsRead(keys=[]){
  const t=now();const list=(Array.isArray(keys)?keys:[]).map(x=>cleanText(x,180)).filter(Boolean);
  if(!list.length){db.prepare('UPDATE admin_notifications SET read_at=? WHERE active=1 AND read_at IS NULL').run(t);return listAdminNotifications({limit:100});}
  const marks=list.map(()=>'?').join(',');db.prepare(`UPDATE admin_notifications SET read_at=? WHERE key IN (${marks})`).run(t,...list);return listAdminNotifications({limit:100});
}

module.exports={db,initDb,getSettings,saveSettings,getOverview,getDashboardSummary,upsertUser,getUser,getUserByReferral,listUsers,updateUser,deleteUser,walletSummary,adjustWallet,debitWalletTotal,registerReferral,listProducts,getProduct,createProduct,updateProduct,deleteProduct,toggleProduct,productVariants,getVariant,createVariant,updateVariant,deleteVariant,listStock,stockCount,addStock,replaceAvailableStock,getStockItem,updateStockItem,deleteStockItem,consumeStock,listOrders,listOrdersByUser,getOrder,getOrderDetail,createOrder,createManualOrder,updateOrder,deleteOrder,fulfillPreorder,completeLocalOrder,listCoupons,saveCoupon,deleteCoupon,validateCoupon,markCouponUsed,listRedeemCodes,createRedeemCodes,updateRedeemCode,deleteRedeemCode,redeemByCode,createPayment,getPayment,getPaymentByOrder,pendingPayments,updatePayment,getReports,customerSummary,addAudit,listAudit,addBroadcastLog,listBroadcasts,createBackup,listBackups,getBackupPath,deleteBackup,currentBackupSettings,importBackupFile,restoreBackup,analyzeLegacyBackup,importLegacyBackup,getHistoricalStats,getSalesCounterStatus,setHistoricalStatsBaseline,mergeHistoricalStatsCandidate,productSoldTotal,syncAdminNotifications,listAdminNotifications,markAdminNotificationsRead,upsertJaspayProductSnapshot,getJaspayProduct,listJaspayProducts,updateJaspayProduct,jaspaySellPrice,finalizeJaspayLocalOrder,createJaspayOrderRecord,getJaspayOrder,updateJaspayOrder,listPendingJaspayOrders,listJaspayOrders,makeRef,now,n,cleanText,normalizeBulkPrices,bulkPriceForQuantity};
