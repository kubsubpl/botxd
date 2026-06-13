const express = require('express');
const { handlePaymentWebhook } = require('../services/payments');

function verifyWebhookSecret(headerValue, expected) {
  return headerValue && expected && headerValue === expected;
}

function buildWebhookRouter(bot) {
  const router = express.Router();

  router.post('/telegram', express.json(), async (req, res) => {
    const secret = req.header('x-webhook-secret');
    if (!verifyWebhookSecret(secret, process.env.BOT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    try {
      await bot.handleUpdate(req.body, res);
      return res.sendStatus(200);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ ok: false });
    }
  });

  router.post('/payments/:provider', express.json(), async (req, res) => {
    const secret = req.header('x-webhook-secret');
    if (!verifyWebhookSecret(secret, process.env.PAYMENT_WEBHOOK_SECRET)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    try {
      const out = await handlePaymentWebhook({ provider: req.params.provider, body: req.body });
      return res.json({ ok: true, ...out });
    } catch (err) {
      console.error(err);
      return res.status(400).json({ ok: false, error: err.message });
    }
  });

  return router;
}

module.exports = { buildWebhookRouter };
