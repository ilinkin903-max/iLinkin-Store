const path = require('path');
const { int, bool } = require('./env');

const allocationPort = int('SERVER_PORT', int('PORT', 2195));

const config = {
  nodeEnv: process.env.NODE_ENV || 'production',
  host: process.env.HOST || '0.0.0.0',
  port: allocationPort,
  dataDir: path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data')),
  dbFile: path.resolve(process.env.DB_FILE || path.join(process.cwd(), 'data', 'ilink-admin.sqlite')),
  backupDir: path.resolve(process.env.BACKUP_DIR || path.join(process.cwd(), 'data', 'backups')),

  vpsProxySecret: String(process.env.VPS_PROXY_SECRET || ''),
  adminUsername: String(process.env.ADMIN_USERNAME || 'admin'),
  adminPassword: String(process.env.ADMIN_PASSWORD || ''),
  sessionSecret: String(process.env.SESSION_SECRET || ''),
  sessionHours: Math.max(1, int('SESSION_HOURS', 12)),

  botToken: String(process.env.BOT_TOKEN || ''),
  botUsername: String(process.env.BOT_USERNAME || '').replace(/^@/, ''),
  botName: String(process.env.BOT_NAME || 'iLink Auto Order'),
  ownerId: String(process.env.OWNER_ID || ''),
  ownerIds: String(process.env.OWNER_IDS || '').split(',').map(x => x.trim()).filter(Boolean),
  botPollingTimeout: Math.min(50, Math.max(5, int('BOT_POLLING_TIMEOUT', 25))),
  telegramRequestTimeoutMs: Math.min(30000, Math.max(4000, int('TELEGRAM_REQUEST_TIMEOUT_MS', 10000))),
  telegramForceIpv4: bool('TELEGRAM_FORCE_IPV4', true),
  telegramApiBaseUrl: String(process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org').replace(/\/+$/, ''),
  adminDashboardUrl: String(process.env.ADMIN_DASHBOARD_URL || ''),

  backupIntervalHours: Math.max(1, int('BACKUP_INTERVAL_HOURS', 6)),
  backupRetention: Math.max(1, int('BACKUP_RETENTION', 30)),
  autoBackup: bool('AUTO_BACKUP_ENABLED', true),

  autogopayApiKey: String(process.env.AUTOGOPAY_API_KEY || ''),
  autogopayBaseUrl: String(process.env.AUTOGOPAY_BASE_URL || 'https://v1-gateway.autogopay.site').replace(/\/+$/, ''),
  paymentPollIntervalSeconds: Math.max(15, int('PAYMENT_POLL_INTERVAL_SECONDS', 30)),

  prodsellerApiKey: String(process.env.PRODSELLER_API_KEY || ''),
  prodsellerBaseUrl: String(process.env.PRODSELLER_BASE_URL || 'https://prodseller.com/v1').replace(/\/+$/, ''),
  aiverseHubApiKey: String(process.env.AIVERSEHUB_API_KEY || ''),
  aiverseHubBaseUrl: String(process.env.AIVERSEHUB_BASE_URL || 'https://aiversehub.store/api/v1').replace(/\/+$/, ''),

  jaspayApiKey: String(process.env.JASPAY_API_KEY || ''),
  jaspayBaseUrl: String(process.env.JASPAY_BASE_URL || 'https://api.jaspay.site/v1').replace(/\/+$/, ''),
  jaspayPollIntervalSeconds: Math.max(5, int('JASPAY_POLL_INTERVAL_SECONDS', 15)),
};

function isOwner(id) {
  const value = String(id || '');
  return value && (value === config.ownerId || config.ownerIds.includes(value));
}

function validateConfig() {
  const missing = [];
  if (!config.vpsProxySecret || config.vpsProxySecret.length < 24) missing.push('VPS_PROXY_SECRET (minimal 24 karakter)');
  if (!config.adminPassword || config.adminPassword.length < 10) missing.push('ADMIN_PASSWORD (minimal 10 karakter)');
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push('SESSION_SECRET (minimal 32 karakter)');
  if (missing.length) throw new Error(`Konfigurasi wajib belum lengkap: ${missing.join(', ')}`);
}

module.exports = { config, validateConfig, isOwner };
