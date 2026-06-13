const { Telegraf, Markup, session } = require('telegraf');
const { config } = require('./config');
const { getCities, getDistricts, getCategories, getProducts, reserveProduct } = require('./services/catalog');
const { getOrCreateTelegramUser } = require('./services/users');
const { createTopupIntent, createLtcInvoice } = require('./services/payments');
const { query } = require('./db');

function botKeyboardMain() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏙️ Miasta', 'menu:cities')],
    [Markup.button.callback('👛 Portfel', 'menu:wallet'), Markup.button.callback('🧾 Zamówienia', 'menu:orders')],
    [Markup.button.callback('💸 Doładuj', 'menu:topup'), Markup.button.callback('ℹ️ Pomoc', 'menu:help')],
  ]);
}

function formatProduct(p) {
  const tagLine = (p.tags || []).map(t => `#${t}`).join(' ');
  return `*${p.title}*\n${p.description || ''}\nCena: *${Number(p.price).toFixed(2)} PLN*\nStatus: ${p.status}\n${tagLine}`;
}

async function buildCitiesMessage() {
  const cities = await getCities();
  return {
    text: 'Wybierz miasto:',
    keyboard: Markup.inlineKeyboard(
      cities.map(c => [Markup.button.callback(c.name, `city:${c.id}`)])
    )
  };
}

function buildBackKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback('⬅️ Wstecz', 'menu:home')], [Markup.button.callback('🏠 Start', 'menu:home')]]);
}

function createBot() {
  const bot = new Telegraf(config.botToken);
  bot.use(session());

  bot.start(async (ctx) => {
    const user = await getOrCreateTelegramUser(ctx.from);
    ctx.session.userId = user.id;
    await ctx.reply(
      `Witaj, ${ctx.from.first_name || 'użytkowniku'}!\\nWybierz akcję z menu.`,
      botKeyboardMain()
    );
  });

  bot.command('menu', async (ctx) => {
    await ctx.reply('Menu główne:', botKeyboardMain());
  });

  bot.action('menu:home', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText('Menu główne:', botKeyboardMain()).catch(() => {});
  });

  bot.action('menu:cities', async (ctx) => {
    await ctx.answerCbQuery();
    const { text, keyboard } = await buildCitiesMessage();
    await ctx.editMessageText(text, keyboard).catch(() => {});
  });

  bot.action(/^city:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const cityId = ctx.match[1];
    const districts = await getDistricts(cityId);
    const kb = Markup.inlineKeyboard([
      ...districts.map(d => [Markup.button.callback(d.name, `district:${d.id}`)]),
      [Markup.button.callback('⬅️ Miasta', 'menu:cities')],
      [Markup.button.callback('🏠 Start', 'menu:home')]
    ]);
    await ctx.editMessageText('Wybierz dzielnicę:', kb).catch(() => {});
  });

  bot.action(/^district:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const districtId = ctx.match[1];
    const cats = await getCategories(districtId);
    const kb = Markup.inlineKeyboard([
      ...cats.map(c => [Markup.button.callback(c.name, `category:${c.id}`)]),
      [Markup.button.callback('⬅️ Miasta', 'menu:cities')],
      [Markup.button.callback('🏠 Start', 'menu:home')]
    ]);
    await ctx.editMessageText('Wybierz kategorię:', kb).catch(() => {});
  });

  bot.action(/^category:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const categoryId = ctx.match[1];
    const products = await getProducts({ categoryId });
    const kb = Markup.inlineKeyboard([
      ...products.slice(0, 8).map(p => [Markup.button.callback(`${p.title} — ${Number(p.price).toFixed(2)} PLN`, `product:${p.id}`)]),
      [Markup.button.callback('⬅️ Wstecz', 'menu:cities')],
      [Markup.button.callback('🏠 Start', 'menu:home')]
    ]);
    await ctx.editMessageText('Produkty:', kb).catch(() => {});
  });

  bot.action(/^product:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const productId = ctx.match[1];
    const rows = await query(`SELECT * FROM products WHERE id = $1`, [productId]);
    const product = rows.rows[0];
    if (!product) return ctx.editMessageText('Produkt nie istnieje.', buildBackKeyboard()).catch(() => {});
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🛒 Zarezerwuj', `reserve:${product.id}`)],
      [Markup.button.callback('⬅️ Wstecz', 'menu:cities')],
      [Markup.button.callback('🏠 Start', 'menu:home')]
    ]);
    await ctx.editMessageText(formatProduct(product), { parse_mode: 'Markdown', ...kb }).catch(() => {});
  });

  bot.action(/^reserve:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Rezerwuję...');
    const user = await getOrCreateTelegramUser(ctx.from);
    try {
      const result = await reserveProduct({ userId: user.id, productId: ctx.match[1], ttlMinutes: config.reservationTtlMinutes });
      await ctx.editMessageText(
        `Zarezerwowano: ${result.product.title}\\nCena: ${Number(result.product.price).toFixed(2)} PLN\\nStatus: rezerwacja aktywna`,
        Markup.inlineKeyboard([
          [Markup.button.callback('💸 Doładuj', 'menu:topup')],
          [Markup.button.callback('🧾 Moje zamówienia', 'menu:orders')],
          [Markup.button.callback('🏠 Start', 'menu:home')]
        ])
      ).catch(() => {});
    } catch (err) {
      await ctx.editMessageText(`Nie udało się zarezerwować: ${err.message}`, buildBackKeyboard()).catch(() => {});
    }
  });

  bot.action('menu:orders', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateTelegramUser(ctx.from);
    const { rows } = await query(
      `SELECT o.id, o.status, o.total, o.created_at, p.title
       FROM orders o
       LEFT JOIN reservations r ON r.id = o.reservation_id
       LEFT JOIN products p ON p.id = r.product_id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC
       LIMIT 10`,
      [user.id]
    );
    const text = rows.length
      ? rows.map(o => `• ${o.title || 'Zamówienie'} | ${o.status} | ${Number(o.total).toFixed(2)} PLN`).join('\\n')
      : 'Brak zamówień.';
    await ctx.editMessageText(`Twoje zamówienia:\\n\\n${text}`, buildBackKeyboard()).catch(() => {});
  });

  bot.action('menu:wallet', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateTelegramUser(ctx.from);
    const { rows } = await query(`SELECT balance FROM wallets WHERE user_id = $1`, [user.id]);
    await ctx.editMessageText(
      `Saldo portfela: ${Number(rows[0]?.balance || 0).toFixed(2)} PLN`,
      Markup.inlineKeyboard([
        [Markup.button.callback('💸 Doładuj BLIK', 'topup:blik')],
        [Markup.button.callback('₿ Doładuj LTC', 'topup:ltc')],
        [Markup.button.callback('🏠 Start', 'menu:home')]
      ])
    ).catch(() => {});
  });

  bot.action('menu:topup', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Wybierz metodę doładowania:',
      Markup.inlineKeyboard([
        [Markup.button.callback('BLIK', 'topup:blik')],
        [Markup.button.callback('Litecoin (LTC)', 'topup:ltc')],
        [Markup.button.callback('🏠 Start', 'menu:home')]
      ])
    ).catch(() => {});
  });

  bot.action('topup:blik', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateTelegramUser(ctx.from);
    const intent = await createTopupIntent({ userId: user.id, amount: 50, provider: 'blik', metadata: { telegramId: ctx.from.id } });
    await ctx.editMessageText(
      `Doładowanie BLIK utworzone.\\nKwota: 50.00 PLN\\nID: ${intent.id}\\n\\nPłatność zostanie zaksięgowana po webhooku operatora płatności.`,
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Start', 'menu:home')]])
    ).catch(() => {});
  });

  bot.action('topup:ltc', async (ctx) => {
    await ctx.answerCbQuery();
    const user = await getOrCreateTelegramUser(ctx.from);
    const res = await createLtcInvoice({ userId: user.id, amount: 50, metadata: { telegramId: ctx.from.id } });
    const invoiceText = res.invoice
      ? `Faktura LTC utworzona.\\nInvoice ID: ${res.invoice.id || 'brak'}\\nKwota: 50.00 PLN`
      : `Utworzono lokalny intent LTC.\\nID: ${res.intent.id}\\nBTCPay nie skonfigurowany — to oczekuje na webhook/test.`;
    await ctx.editMessageText(invoiceText, Markup.inlineKeyboard([[Markup.button.callback('🏠 Start', 'menu:home')]])).catch(() => {});
  });

  bot.action('menu:help', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      'Pomoc:\\n- Przeglądaj katalog po miastach i dzielnicach\\n- Rezerwuj unikalne produkty\\n- Doładowania: BLIK lub LTC\\n- Panel admina w przeglądarce',
      buildBackKeyboard()
    ).catch(() => {});
  });

  bot.use(async (ctx, next) => {
    if (ctx.updateType === 'message' && ctx.message?.text?.startsWith('/')) return next();
    return next();
  });

  return bot;
}

module.exports = { createBot };
