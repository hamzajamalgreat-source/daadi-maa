// sql-asm.js Ã¢â‚¬â€ pure JavaScript SQLite, no native deps, no .wasm file.
const sqlInit = require('sql.js/dist/sql-asm.js');
const bcrypt  = require('bcryptjs');
const path    = require('path');
const fs      = require('fs');

const DB_PATH = process.env.VERCEL
  ? '/tmp/daadi_maa.db'
  : path.join(__dirname, '..', 'daadi_maa.db');

let db = null;

async function initDb() {
  if (db) return db;
  const SQL = await sqlInit();
  if (fs.existsSync(DB_PATH)) {
    try { const buf = fs.readFileSync(DB_PATH); db = new SQL.Database(buf); }
    catch { db = new SQL.Database(); }
  } else { db = new SQL.Database(); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, slug TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT, price REAL NOT NULL, image_url TEXT, category_id INTEGER, in_stock INTEGER DEFAULT 1, badge TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (category_id) REFERENCES categories(id));
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_address TEXT NOT NULL, customer_email TEXT, total_amount REAL NOT NULL, status TEXT DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT NOT NULL, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, FOREIGN KEY (order_id) REFERENCES orders(id), FOREIGN KEY (product_id) REFERENCES products(id));
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      product_id INTEGER,
      product_name TEXT,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT,
      customer_email TEXT,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      replied_by TEXT,
      reply TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ););
  `);
  
    );
  try { db.exec("ALTER TABLE admins ADD COLUMN role TEXT DEFAULT 'admin'"); } catch { /* column already exists */ }
  // Ensure admin has admin role
  db.run("UPDATE admins SET role = 'admin' WHERE username = 'admin' AND (role IS NULL OR role = '')");
  // SECURITY: Set ADMIN_PASSWORD env var on Vercel Ã¢â‚¬â€ do not rely on fallback in production.
  if (!process.env.ADMIN_PASSWORD) console.warn('Ã¢Å¡Â Ã¯Â¸Â  ADMIN_PASSWORD env var not set. Using insecure default.');
  const adminCheck = db.exec("SELECT id FROM admins WHERE username='admin'");
  if (!adminCheck.length || !adminCheck[0].values.length) {
    const hashed = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
    db.run('INSERT INTO admins (username,password) VALUES (?,?)', ['admin', hashed]);
  }
  const cats = [
    ['Recipe Mixes','recipe-mixes'],['Spice Powders','spice-powders'],['Salts','salts'],['Whole Spices','whole-spices'],
    ['Chilli Products','chilli-products'],['Biryani & Pulao','biryani-pulao'],['BBQ & Grill','bbq-grill'],
    ['Blended Masalas','blended-masalas'],['Curry Bases','curry-bases'],['Gift Packs','gift-packs'],
  ];
  cats.forEach(([name, slug]) => db.run('INSERT OR IGNORE INTO categories (name,slug) VALUES (?,?)', [name, slug]));
  // FIX M4: was string interpolation `WHERE slug='${slug}'` Ã¢â‚¬â€ now parameterized
  const getC = slug => {
    const stmt = db.prepare('SELECT id FROM categories WHERE slug = ?');
    stmt.bind([slug]);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row ? row.id : null;
  };
  const rId = getC('recipe-mixes'); const sId = getC('spice-powders'); const aId = getC('salts');
  const products = [
    ['Quorma Mix','quorma-mix','Authentic Quorma recipe mix with premium whole spices.',30,'/images/quorma-mix.jpg',rId,'Bestseller'],
    ['Achar Gosht Masala','achar-gosht-masala','Tangy pickling spice blend for Achar Gosht.',30,'/images/achar-gosht.jpg',rId,null],
    ['Kabuli Pulao Masala','kabuli-pulao-masala','Fragrant masala for the classic Kabuli Pulao.',30,'/images/kabuli-pulao.jpg',rId,null],
    ['Bombay Biryani Masala','bombay-biryani-masala','Signature Bombay-style biryani spice blend.',30,'/images/bombay-biryani.jpg',rId,'Popular'],
    ['Tikka Boti Powder','tikka-boti-powder','Perfect marinade powder for grilled tikka and boti.',20,'/images/tikka-boti.jpg',sId,null],
    ['Fish Masala Powder','fish-masala-powder','Zesty blend balanced for fish and seafood.',30,'/images/fish-masala.jpg',sId,null],
    ['Peshawari Chatpatta Masala','peshawari-chatpatta-masala','Iconic tangy chaat masala from Peshawar.',10,'/images/chatpatta-masala.jpg',sId,'Regional Special'],
    ['Curry Powder','curry-powder','Versatile curry powder for everyday cooking.',20,'/images/curry-powder.jpg',sId,null],
    ['Garam Masala Powder','garam-masala-powder','Warming blend of whole spices ground to perfection.',20,'/images/garam-masala.jpg',sId,null],
    ['Black Pepper Powder','black-pepper-powder','Finely ground premium black pepper.',20,'/images/black-pepper.jpg',sId,null],
    ['Red Chilli Powder','red-chilli-powder','Vibrant red chilli powder with bold heat.',20,'/images/red-chilli-powder.jpg',sId,null],
    ['Red Chilli Flakes','red-chilli-flakes','Coarsely crushed red chilli flakes.',20,'/images/red-chilli-flakes.jpg',sId,null],
    ['Coriander Powder','coriander-powder','Freshly milled coriander seed powder.',20,'/images/coriander-powder.jpg',sId,null],
    ['Turmeric Powder','turmeric-powder','Pure turmeric powder with high curcumin content.',20,'/images/turmeric-powder.jpg',sId,null],
    ['Iodized Salt','iodized-salt','Himalayan iodized salt with essential minerals.',20,'/images/iodized-salt.jpg',aId,null],
    ['Pure Refined Salt','pure-refined-salt','Fine-grain pure refined Himalayan salt.',20,'/images/pure-refined-salt.jpg',aId,null],
    ['Himalayan Pink Salt','himalayan-pink-salt','Naturally mined Himalayan pink salt.',20,'/images/himalayan-pink-salt.jpg',aId,'Premium'],
  ];
  products.forEach(p => db.run('INSERT OR IGNORE INTO products (name,slug,description,price,image_url,category_id,badge) VALUES (?,?,?,?,?,?,?)', p));
  // FIX C1: Price migration only runs here in initDb() Ã¢â‚¬â€ NOT in runSql().
  // Previously it ran on every runSql() call, silently reverting any admin price edit.
  db.run("UPDATE products SET price = 30 WHERE slug IN ('quorma-mix','achar-gosht-masala','kabuli-pulao-masala','bombay-biryani-masala','fish-masala-powder')");
  db.run("UPDATE products SET price = 10 WHERE slug = 'peshawari-chatpatta-masala'");
  db.run("UPDATE products SET price = 20 WHERE slug NOT IN ('quorma-mix','achar-gosht-masala','kabuli-pulao-masala','bombay-biryani-masala','fish-masala-powder','peshawari-chatpatta-masala')");
  saveDb();
  console.log('Ã¢Å“â€¦ DB ready at', DB_PATH);
  return db;
}

function saveDb() {
  if (!db) return;
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }
  catch (e) { console.error('DB save error:', e.message); }
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) { return queryAll(sql, params)[0] || null; }

// FIX C1: Price migration removed Ã¢â‚¬â€ no longer runs on every write.
// Admin price changes now persist correctly.
function runSql(sql, params = []) {
  db.run(sql, params);
  saveDb();
  return {
    lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0],
    changes:         db.getRowsModified(),
  };
}

module.exports = { initDb, queryAll, queryOne, runSql, saveDb, getDb: () => db };
