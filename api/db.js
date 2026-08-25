const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.VERCEL
  ? '/tmp/daadi_maa.db'
  : path.join(__dirname, '..', 'daadi_maa.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  // Load existing DB or create new one
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL mode equivalent
  db.run('PRAGMA journal_mode = WAL');

  // ─── Create Tables ─────────────────────────────────────────────────────────

  db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      image_url TEXT,
      category_id INTEGER,
      in_stock INTEGER DEFAULT 1,
      badge TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      customer_email TEXT,
      total_amount REAL NOT NULL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // ─── Seed Default Admin ──────────────────────────────────────────────────────

  const adminCheck = db.exec('SELECT id FROM admins WHERE username = \'admin\'');
  if (adminCheck.length === 0 || adminCheck[0].values.length === 0) {
    const hashed = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hashed]);
    console.log('✅ Default admin created — username: admin | password: admin123');
  }

  // ─── Seed Categories ─────────────────────────────────────────────────────────

  const categories = [
    { name: 'Recipe Mixes',      slug: 'recipe-mixes'      },
    { name: 'Spice Powders',     slug: 'spice-powders'     },
    { name: 'Salts',             slug: 'salts'             },
    { name: 'Whole Spices',      slug: 'whole-spices'      },
    { name: 'Chilli Products',   slug: 'chilli-products'   },
    { name: 'Biryani & Pulao',   slug: 'biryani-pulao'     },
    { name: 'BBQ & Grill',       slug: 'bbq-grill'         },
    { name: 'Blended Masalas',   slug: 'blended-masalas'   },
    { name: 'Curry Bases',       slug: 'curry-bases'       },
    { name: 'Gift Packs',        slug: 'gift-packs'        },
  ];

  categories.forEach(c => {
    db.run('INSERT OR IGNORE INTO categories (name, slug) VALUES (?, ?)', [c.name, c.slug]);
  });

  // ─── Seed Products ───────────────────────────────────────────────────────────

  const getCatId = (slug) => {
    const result = db.exec(`SELECT id FROM categories WHERE slug = '${slug}'`);
    return result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : null;
  };

  const recipeMixId = getCatId('recipe-mixes');
  const spicePowderId = getCatId('spice-powders');
  const saltId = getCatId('salts');

  const products = [
    // Recipe Mixes
    {
      name: 'Quorma Mix',
      slug: 'quorma-mix',
      description: 'Authentic Quorma recipe mix crafted with premium whole spices for a rich, aromatic curry. 100% organic product.',
      price: 120,
      image_url: '/images/quorma-mix.jpg',
      category_id: recipeMixId,
      badge: 'Bestseller',
    },
    {
      name: 'Achar Gosht Masala',
      slug: 'achar-gosht-masala',
      description: 'Tangy and spicy pickling spice blend for Achar Gosht. Gives your meat curry a bold, pickled flavour.',
      price: 120,
      image_url: '/images/achar-gosht.jpg',
      category_id: recipeMixId,
      badge: null,
    },
    {
      name: 'Kabuli Pulao Masala',
      slug: 'kabuli-pulao-masala',
      description: 'Fragrant masala mix for the classic Kabuli Pulao — the pride of Peshawari cuisine.',
      price: 120,
      image_url: '/images/kabuli-pulao.jpg',
      category_id: recipeMixId,
      badge: null,
    },
    {
      name: 'Bombay Biryani Masala',
      slug: 'bombay-biryani-masala',
      description: 'Signature Bombay-style biryani spice blend that delivers layers of deep, complex flavour.',
      price: 120,
      image_url: '/images/bombay-biryani.jpg',
      category_id: recipeMixId,
      badge: 'Popular',
    },
    // Spice Powders
    {
      name: 'Tikka Boti Powder',
      slug: 'tikka-boti-powder',
      description: 'Perfect marinade spice powder for grilled tikka and boti. Gives that smoky, charred flavour.',
      price: 20,
      image_url: '/images/tikka-boti.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Fish Masala Powder',
      slug: 'fish-masala-powder',
      description: 'A zesty blend of coastal spices specifically balanced for fish and seafood dishes.',
      price: 20,
      image_url: '/images/fish-masala.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Peshawari Chatpatta Masala',
      slug: 'peshawari-chatpatta-masala',
      description: 'The iconic tangy chaat masala from Peshawar. Sprinkle on fruits, salads, and snacks.',
      price: 20,
      image_url: '/images/chatpatta-masala.jpg',
      category_id: spicePowderId,
      badge: 'Regional Special',
    },
    {
      name: 'Curry Powder',
      slug: 'curry-powder',
      description: 'A versatile, balanced curry powder blend for everyday cooking. Works with meat, vegetables, and lentils.',
      price: 20,
      image_url: '/images/curry-powder.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Garam Masala Powder',
      slug: 'garam-masala-powder',
      description: 'A warming blend of whole spices ground to perfection — the finishing touch for any dish.',
      price: 20,
      image_url: '/images/garam-masala.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Black Pepper Powder',
      slug: 'black-pepper-powder',
      description: 'Finely ground premium black pepper with a sharp, pungent bite. Essential in every kitchen.',
      price: 20,
      image_url: '/images/black-pepper.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Red Chilli Powder',
      slug: 'red-chilli-powder',
      description: 'Vibrant red chilli powder from sun-dried chillis. Rich colour and bold heat.',
      price: 20,
      image_url: '/images/red-chilli-powder.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Red Chilli Flakes',
      slug: 'red-chilli-flakes',
      description: 'Coarsely crushed red chilli flakes. Great on pizza, pasta, and as a table condiment.',
      price: 20,
      image_url: '/images/red-chilli-flakes.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Coriander Powder',
      slug: 'coriander-powder',
      description: 'Freshly milled coriander seed powder with a citrusy, earthy aroma. A curry staple.',
      price: 20,
      image_url: '/images/coriander-powder.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    {
      name: 'Turmeric Powder',
      slug: 'turmeric-powder',
      description: 'Pure turmeric powder with a high curcumin content — bright colour and earthy flavour.',
      price: 20,
      image_url: '/images/turmeric-powder.jpg',
      category_id: spicePowderId,
      badge: null,
    },
    // Salts
    {
      name: 'Iodized Salt',
      slug: 'iodized-salt',
      description: 'Himalayan iodized salt with essential minerals. Clean, pure flavour for everyday use.',
      price: 20,
      image_url: '/images/iodized-salt.jpg',
      category_id: saltId,
      badge: null,
    },
    {
      name: 'Pure Refined Salt',
      slug: 'pure-refined-salt',
      description: 'Fine-grain pure refined Himalayan salt. Consistent texture, ideal for baking and cooking.',
      price: 20,
      image_url: '/images/pure-refined-salt.jpg',
      category_id: saltId,
      badge: null,
    },
    {
      name: 'Himalayan Pink Salt',
      slug: 'himalayan-pink-salt',
      description: 'Naturally mined Himalayan pink salt rich in trace minerals. A premium table salt.',
      price: 20,
      image_url: '/images/himalayan-pink-salt.jpg',
      category_id: saltId,
      badge: 'Premium',
    },
  ];

  products.forEach(p => {
    db.run(
      'INSERT OR IGNORE INTO products (name, slug, description, price, image_url, category_id, badge) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [p.name, p.slug, p.description, p.price, p.image_url, p.category_id, p.badge]
    );
  });

  saveDb();
  console.log('✅ Database seeded successfully');
  return db;
}

// ─── Helper: save DB to disk ──────────────────────────────────────────────────

function saveDb() {
  if (db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    } catch (err) {
      console.error('❌ CRITICAL: Failed to save database to disk:', err.message);
    }
  }
}

// ─── Helper: convert sql.js result to objects ─────────────────────────────────

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);

  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return {
    lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0],
    changes: db.getRowsModified(),
  };
}

module.exports = { initDb, queryAll, queryOne, runSql, saveDb, getDb: () => db };
