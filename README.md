# Sales Bot Railway

Monorepo-ready, but packaged as a single Railway service for fast deployment.

## Features
- Telegram bot menu with cities, districts, categories, products
- Unique products without exposing stock counts
- Reservation system with automatic expiry
- Wallet and top-up intents
- BLIK gateway adapter flow (via licensed provider webhook)
- LTC auto-pay flow via BTCPay adapter
- Admin web panel
- Audit logs, notifications, cron cleanup

## Railway deploy
1. Create a Railway project.
2. Add a PostgreSQL database.
3. Set environment variables from `.env.example`.
4. Deploy this repo.
5. Railway will use the `Dockerfile`.

## Local run
```bash
npm install
cp .env.example .env
npm run db:bootstrap
npm run seed
npm start
```

## Notes
- This template uses lawful payment-provider webhooks rather than direct peer-to-peer BLIK forwarding.
- The bot auto-configures webhook mode when `PUBLIC_URL` is set.
