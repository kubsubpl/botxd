const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

function slugify(str) {
  return String(str).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureUser(client, { email, username, password, role, telegram_id }) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const hash = await bcrypt.hash(password, 10);
  const ins = await client.query(
    `INSERT INTO users (email, username, password_hash, role, telegram_id)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [email, username, hash, role, telegram_id || null]
  );
  await client.query(`INSERT INTO wallets (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [ins.rows[0].id, process.env.DEFAULT_WALLET_BALANCE || 0]);
  return ins.rows[0].id;
}

async function main() {
  if (!process.env.DATABASE_URL) return;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const adminUsername = process.env.ADMIN_USERNAME || 'Admin';
  await ensureUser(client, { email: adminEmail, username: adminUsername, password: adminPassword, role: 'admin' });

  const userId = await ensureUser(client, { email: 'client@example.com', username: 'Client', password: 'Client123!', role: 'user' });

  const cities = [
    { name: 'Warszawa', districts: ['Śródmieście', 'Mokotów', 'Praga-Południe'] },
    { name: 'Kraków', districts: ['Stare Miasto', 'Podgórze', 'Krowodrza'] },
    { name: 'Katowice', districts: ['Śródmieście', 'Ligota', 'Załęże'] }
  ];

  for (const city of cities) {
    const cityRes = await client.query(
      `INSERT INTO cities (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [city.name, slugify(city.name)]
    );
    const cityId = cityRes.rows[0].id;
    for (const districtName of city.districts) {
      const districtRes = await client.query(
        `INSERT INTO districts (city_id, name, slug)
         VALUES ($1, $2, $3)
         ON CONFLICT (city_id, slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cityId, districtName, slugify(districtName)]
      );
      const districtId = districtRes.rows[0].id;
      const catNames = ['Elektronika', 'Dom', 'Premium'];
      for (const catName of catNames) {
        const catRes = await client.query(
          `INSERT INTO categories (district_id, name, slug)
           VALUES ($1, $2, $3)
           ON CONFLICT (district_id, slug) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`,
          [districtId, catName, slugify(catName)]
        );
        const categoryId = catRes.rows[0].id;
        for (let i = 1; i <= 2; i++) {
          await client.query(
            `INSERT INTO products (city_id, district_id, category_id, title, description, price, status, is_unique, tags)
             VALUES ($1,$2,$3,$4,$5,$6,'available',true,$7)
             ON CONFLICT DO NOTHING`,
            [cityId, districtId, categoryId, `${catName} ${i} - ${city.name} ${districtName}`, `Unikalny produkt demo ${i} dla ${districtName}.`, (49.99 + i).toFixed(2), ['premium', 'polecany']]
          );
        }
      }
    }
  }

  // Demo unique product for client
  await client.query(
    `INSERT INTO products (title, description, price, status, is_unique, tags)
     VALUES ($1,$2,$3,'available',true,$4)
     ON CONFLICT DO NOTHING`,
    ['Produkt Demo Specjalny', 'Unikalny produkt demo bez ujawniania ilości sztuk.', 199.99, ['vip', 'unikalny']]
  );

  console.log('Seed completed');
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
