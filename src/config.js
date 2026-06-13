require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 3000),
  publicUrl: process.env.PUBLIC_URL || '',
  databaseUrl: process.env.DATABASE_URL || '',
  sessionSecret: process.env.SESSION_SECRET || 'change-me',
  botToken: process.env.BOT_TOKEN || '',
  botWebhookSecret: process.env.BOT_WEBHOOK_SECRET || 'change-me',
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'change-me',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD || 'ChangeMe123!',
  adminUsername: process.env.ADMIN_USERNAME || 'Admin',
  reservationTtlMinutes: Number(process.env.RESERVATION_TTL_MINUTES || 30),
  defaultWalletBalance: Number(process.env.DEFAULT_WALLET_BALANCE || 0),
  btcpayUrl: process.env.BTCPAY_URL || '',
  btcpayApiKey: process.env.BTCPAY_API_KEY || '',
  btcpayStoreId: process.env.BTCPAY_STORE_ID || '',
  btcpayWebhookSecret: process.env.BTCPAY_WEBHOOK_SECRET || ''
};

module.exports = { config };
