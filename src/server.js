const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
const pgSession = require('connect-pg-simple')(session);
const { config } = require('./config');
const { pool } = require('./db');
const { createBot } = require('./bot');
const { buildWebhookRouter } = require('./routes/webhooks');
const { adminRouter } = require('./routes/admin');
const { expireReservations } = require('./services/catalog');
const cron = require('node-cron');

async function main() {
  const app = express();
  const bot = createBot();

  app.use(helmet());
  app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
  app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    store: new pgSession({
      pool,
      tableName: 'session'
    }),
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax', secure: false, httpOnly: true }
  }));

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.get('/health', async (_req, res) => {
    res.json({ ok: true, service: 'sales-bot', time: new Date().toISOString() });
  });

  app.get('/', (_req, res) => {
    res.render('home', { title: 'Sales Bot', admin: null });
  });

  app.use('/admin', adminRouter());
  app.use('/webhooks', buildWebhookRouter(bot));

  app.use((req, res, next) => {
    if (req.path.startsWith('/admin') || req.path.startsWith('/webhooks') || req.path === '/health' || req.path === '/') return next();
    res.status(404).json({ ok: false, error: 'Not found' });
  });

  const server = app.listen(config.port, async () => {
    console.log(`Server listening on ${config.port}`);

    if (config.botToken && config.publicUrl) {
      try {
        await bot.telegram.setWebhook(`${config.publicUrl.replace(/\/$/, '')}/webhooks/telegram`, {
          secret_token: config.botWebhookSecret
        });
        console.log('Telegram webhook configured.');
      } catch (err) {
        console.error('Webhook setup failed:', err.message);
      }
    } else if (config.botToken) {
      await bot.launch();
      console.log('Telegram bot launched in polling mode.');
    }

    cron.schedule('*/5 * * * *', async () => {
      try {
        const expired = await expireReservations();
        if (expired) console.log(`Expired reservations: ${expired}`);
      } catch (err) {
        console.error('Reservation cleanup failed:', err.message);
      }
    }, { timezone: 'UTC' });
  });

  const shutdown = async () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
