const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'levelauto.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  year INTEGER,
  price INTEGER,
  currency TEXT DEFAULT 'PLN',
  mileage INTEGER,
  fuel TEXT,
  transmission TEXT,
  power INTEGER,
  engine_capacity INTEGER,
  body_type TEXT,
  color TEXT,
  vin TEXT,
  description TEXT,
  images TEXT DEFAULT '[]',
  status TEXT DEFAULT 'dostepny',
  featured INTEGER DEFAULT 0,
  source_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT NOT NULL,
  car_id INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  visitor_name TEXT DEFAULT 'Gość',
  created_at TEXT DEFAULT (datetime('now')),
  last_activity TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);
`);

// --- Seed admin user ---
const adminExists = db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
if (!adminExists) {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, bcrypt.hashSync(password, 10));
  console.log(`[db] Utworzono konto administratora: ${username} (zmień hasło przez zmienne ADMIN_USER/ADMIN_PASSWORD przy pierwszym uruchomieniu)`);
}

// --- Seed sample cars with generated SVG placeholders ---
const carsCount = db.prepare('SELECT COUNT(*) AS c FROM cars').get().c;
if (carsCount === 0) {
  const imgDir = path.join(__dirname, 'public', 'uploads');
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

  const placeholder = (name, accent) => {
    const file = `seed-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#15151a"/><stop offset="1" stop-color="#26262e"/></linearGradient></defs>
<rect width="800" height="500" fill="url(#g)"/>
<path d="M140 330 c30 -60 70 -90 150 -95 l60 -40 c60 -30 200 -30 250 5 l50 35 c60 10 90 40 95 90 l-20 10 h-585 z" fill="${accent}" opacity="0.85"/>
<circle cx="255" cy="345" r="38" fill="#0c0c10" stroke="#3a3a44" stroke-width="10"/>
<circle cx="565" cy="345" r="38" fill="#0c0c10" stroke="#3a3a44" stroke-width="10"/>
<text x="400" y="440" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="bold" fill="#ffffff">${name}</text>
<text x="400" y="472" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#9a9aa5">LEVEL AUTO</text>
</svg>`;
    fs.writeFileSync(path.join(imgDir, file), svg);
    return `/uploads/${file}`;
  };

  const seed = [
    {
      title: 'Ford Mustang GT 5.0 V8', brand: 'Ford', model: 'Mustang GT', year: 2021, price: 189900,
      mileage: 42000, fuel: 'Benzyna', transmission: 'Automatyczna', power: 450, engine_capacity: 5000,
      body_type: 'Coupe', color: 'Czerwony', featured: 1, accent: '#e11d2e',
      description: 'Ford Mustang GT sprowadzony z USA. Silnik 5.0 V8, pełna dokumentacja aukcyjna, auto po opłatach, zarejestrowane w Polsce. Bogate wyposażenie: skórzana tapicerka, kamera cofania, tryby jazdy.'
    },
    {
      title: 'Dodge Challenger R/T 5.7 HEMI', brand: 'Dodge', model: 'Challenger R/T', year: 2020, price: 159900,
      mileage: 58000, fuel: 'Benzyna', transmission: 'Automatyczna', power: 381, engine_capacity: 5700,
      body_type: 'Coupe', color: 'Czarny', featured: 1, accent: '#d97706',
      description: 'Legendarny amerykański muscle car. Dodge Challenger R/T z silnikiem 5.7 HEMI V8. Import z USA z pełną historią, bezwypadkowy przód, auto gotowe do rejestracji.'
    },
    {
      title: 'Jeep Grand Cherokee Limited 3.6', brand: 'Jeep', model: 'Grand Cherokee', year: 2022, price: 174500,
      mileage: 31000, fuel: 'Benzyna+LPG', transmission: 'Automatyczna', power: 286, engine_capacity: 3600,
      body_type: 'SUV', color: 'Granatowy', featured: 1, accent: '#2563eb',
      description: 'Jeep Grand Cherokee Limited z instalacją LPG. Napęd 4x4, skóra, panorama, hak. Sprowadzony z Kanady, serwisowany, faktura VAT marża.'
    },
    {
      title: 'Tesla Model 3 Long Range AWD', brand: 'Tesla', model: 'Model 3', year: 2022, price: 139900,
      mileage: 27000, fuel: 'Elektryczny', transmission: 'Automatyczna', power: 440, engine_capacity: 0,
      body_type: 'Sedan', color: 'Biały', featured: 0, accent: '#e5e7eb',
      description: 'Tesla Model 3 Long Range z napędem AWD. Zasięg do 560 km, autopilot, aktualizacje OTA. Auto z rynku amerykańskiego, sprawdzone, po przeglądzie.'
    },
    {
      title: 'Chevrolet Camaro SS 6.2 V8', brand: 'Chevrolet', model: 'Camaro SS', year: 2019, price: 144900,
      mileage: 64000, fuel: 'Benzyna', transmission: 'Manualna', power: 453, engine_capacity: 6200,
      body_type: 'Coupe', color: 'Żółty', featured: 0, accent: '#eab308',
      description: 'Chevrolet Camaro SS z manualną skrzynią biegów. Silnik 6.2 V8, sportowy wydech, świetny stan techniczny i wizualny. Import USA, opłacony.'
    },
    {
      title: 'RAM 1500 Laramie 5.7 HEMI 4x4', brand: 'RAM', model: '1500 Laramie', year: 2021, price: 219900,
      mileage: 47000, fuel: 'Benzyna+LPG', transmission: 'Automatyczna', power: 401, engine_capacity: 5700,
      body_type: 'Pickup', color: 'Srebrny', featured: 0, accent: '#94a3b8',
      description: 'RAM 1500 Laramie — król amerykańskich pickupów. HEMI 5.7 z LPG, napęd 4x4, skóra, podgrzewane fotele. Idealny do pracy i na co dzień. VAT-1 możliwy.'
    }
  ];

  const insert = db.prepare(`INSERT INTO cars
    (title, brand, model, year, price, mileage, fuel, transmission, power, engine_capacity, body_type, color, description, images, featured)
    VALUES (@title, @brand, @model, @year, @price, @mileage, @fuel, @transmission, @power, @engine_capacity, @body_type, @color, @description, @images, @featured)`);

  for (const c of seed) {
    const img = placeholder(`${c.brand} ${c.model}`, c.accent);
    insert.run({ ...c, images: JSON.stringify([img]) });
  }
  console.log('[db] Dodano przykładowe ogłoszenia (możesz je usunąć w panelu admina)');
}

module.exports = db;
