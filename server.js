const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Server } = require('socket.io');

const db = require('./db');
const { scrapeOtomotoListing, scrapeOtomotoInventory } = require('./scraper');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const safe = file.originalname.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\/(jpeg|png|webp|gif|svg)/.test(file.mimetype))
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.redirect('/admin/login');
}

function parseImages(car) {
  try { car.imageList = JSON.parse(car.images || '[]'); }
  catch { car.imageList = []; }
  if (!car.imageList.length) car.imageList = ['/img/no-photo.svg'];
  return car;
}

const fmtPrice = (n, cur = 'PLN') => n ? `${Number(n).toLocaleString('pl-PL')} ${cur === 'PLN' ? 'zł' : cur}` : 'Cena: zapytaj';
const fmtKm = (n) => n ? `${Number(n).toLocaleString('pl-PL')} km` : '—';
app.locals.fmtPrice = fmtPrice;
app.locals.fmtKm = fmtKm;
app.locals.siteName = 'Level Auto';
app.locals.contactEmail = process.env.CONTACT_EMAIL || 'contact@sellora.store';
app.locals.contactPhone = process.env.CONTACT_PHONE || '+48 600 000 000';
app.locals.contactAddress = process.env.CONTACT_ADDRESS || 'ul. Przykładowa 12, 05-152 Czosnów';

// =====================================================================
// Strony publiczne
// =====================================================================

app.get('/', (req, res) => {
  const featured = db.prepare(`SELECT * FROM cars WHERE status != 'sprzedany' ORDER BY featured DESC, created_at DESC LIMIT 6`)
    .all().map(parseImages);
  res.render('index', { featured, page: 'home' });
});

app.get('/auta', (req, res) => {
  const { brand, fuel, sort, q } = req.query;
  let sql = `SELECT * FROM cars WHERE status != 'sprzedany'`;
  const params = [];
  if (brand) { sql += ' AND brand = ?'; params.push(brand); }
  if (fuel) { sql += ' AND fuel = ?'; params.push(fuel); }
  if (q) { sql += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  if (sort === 'price_asc') sql += ' ORDER BY price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
  else if (sort === 'year_desc') sql += ' ORDER BY year DESC';
  else sql += ' ORDER BY created_at DESC';

  const cars = db.prepare(sql).all(...params).map(parseImages);
  const brands = db.prepare(`SELECT DISTINCT brand FROM cars WHERE brand IS NOT NULL AND status != 'sprzedany' ORDER BY brand`).all().map(r => r.brand);
  const fuels = db.prepare(`SELECT DISTINCT fuel FROM cars WHERE fuel IS NOT NULL AND status != 'sprzedany' ORDER BY fuel`).all().map(r => r.fuel);
  res.render('cars', { cars, brands, fuels, filters: { brand, fuel, sort, q }, page: 'cars' });
});

app.get('/auta/:id', (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.status(404).render('404', { page: null });
  parseImages(car);
  const similar = db.prepare(`SELECT * FROM cars WHERE id != ? AND status != 'sprzedany' ORDER BY (brand = ?) DESC, created_at DESC LIMIT 3`)
    .all(car.id, car.brand).map(parseImages);
  res.render('car-detail', { car, similar, page: 'cars', sent: req.query.sent === '1' });
});

app.post('/kontakt', (req, res) => {
  const { name, email, phone, message, car_id, redirect } = req.body;
  if (!name || !message) {
    return res.redirect((redirect || '/') + '?error=1#kontakt');
  }
  db.prepare('INSERT INTO contact_messages (name, email, phone, message, car_id) VALUES (?, ?, ?, ?, ?)')
    .run(name.slice(0, 120), (email || '').slice(0, 160), (phone || '').slice(0, 40), message.slice(0, 4000), car_id || null);
  io.to('admins').emit('admin:new-contact');
  res.redirect((redirect || '/') + '?sent=1#kontakt');
});

// =====================================================================
// Panel administratora
// =====================================================================

app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.render('admin/login', { error: 'Nieprawidłowy login lub hasło' });
  }
  req.session.adminId = user.id;
  req.session.adminName = user.username;
  res.redirect('/admin');
});

app.post('/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

app.get('/admin', requireAdmin, (req, res) => {
  const cars = db.prepare('SELECT * FROM cars ORDER BY created_at DESC').all().map(parseImages);
  const stats = {
    cars: cars.length,
    available: cars.filter(c => c.status === 'dostepny').length,
    messages: db.prepare('SELECT COUNT(*) AS c FROM contact_messages WHERE is_read = 0').get().c,
    chats: db.prepare(`SELECT COUNT(DISTINCT session_id) AS c FROM chat_messages WHERE sender = 'visitor' AND is_read = 0`).get().c
  };
  res.render('admin/dashboard', { cars, stats, adminName: req.session.adminName });
});

app.get('/admin/auta/nowe', requireAdmin, (req, res) => {
  res.render('admin/car-form', { car: null, adminName: req.session.adminName, error: null });
});

app.get('/admin/auta/:id/edytuj', requireAdmin, (req, res) => {
  const car = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!car) return res.redirect('/admin');
  parseImages(car);
  res.render('admin/car-form', { car, adminName: req.session.adminName, error: null });
});

function carFromBody(body) {
  const num = (v) => {
    const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    title: (body.title || '').trim(),
    brand: (body.brand || '').trim() || null,
    model: (body.model || '').trim() || null,
    year: num(body.year),
    price: num(body.price),
    currency: body.currency === 'EUR' ? 'EUR' : 'PLN',
    mileage: num(body.mileage),
    fuel: (body.fuel || '').trim() || null,
    transmission: (body.transmission || '').trim() || null,
    power: num(body.power),
    engine_capacity: num(body.engine_capacity),
    body_type: (body.body_type || '').trim() || null,
    color: (body.color || '').trim() || null,
    vin: (body.vin || '').trim() || null,
    description: (body.description || '').trim(),
    status: ['dostepny', 'zarezerwowany', 'sprzedany'].includes(body.status) ? body.status : 'dostepny',
    featured: body.featured ? 1 : 0,
    source_url: (body.source_url || '').trim() || null
  };
}

app.post('/admin/auta/nowe', requireAdmin, upload.array('photos', 15), (req, res) => {
  const car = carFromBody(req.body);
  if (!car.title) return res.render('admin/car-form', { car: null, adminName: req.session.adminName, error: 'Tytuł ogłoszenia jest wymagany' });
  const uploaded = (req.files || []).map(f => `/uploads/${f.filename}`);
  const urlImages = (req.body.image_urls || '').split(/\n+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  car.images = JSON.stringify([...uploaded, ...urlImages]);
  db.prepare(`INSERT INTO cars (title, brand, model, year, price, currency, mileage, fuel, transmission, power, engine_capacity, body_type, color, vin, description, status, featured, source_url, images)
    VALUES (@title, @brand, @model, @year, @price, @currency, @mileage, @fuel, @transmission, @power, @engine_capacity, @body_type, @color, @vin, @description, @status, @featured, @source_url, @images)`).run(car);
  res.redirect('/admin');
});

app.post('/admin/auta/:id/edytuj', requireAdmin, upload.array('photos', 15), (req, res) => {
  const existing = db.prepare('SELECT * FROM cars WHERE id = ?').get(req.params.id);
  if (!existing) return res.redirect('/admin');
  const car = carFromBody(req.body);
  if (!car.title) car.title = existing.title;

  let images = [];
  try { images = JSON.parse(existing.images || '[]'); } catch { images = []; }
  const keep = [].concat(req.body.keep_images || []);
  images = images.filter(img => keep.includes(img));
  const uploaded = (req.files || []).map(f => `/uploads/${f.filename}`);
  const urlImages = (req.body.image_urls || '').split(/\n+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  car.images = JSON.stringify([...images, ...uploaded, ...urlImages]);
  car.id = existing.id;

  db.prepare(`UPDATE cars SET title=@title, brand=@brand, model=@model, year=@year, price=@price, currency=@currency,
    mileage=@mileage, fuel=@fuel, transmission=@transmission, power=@power, engine_capacity=@engine_capacity,
    body_type=@body_type, color=@color, vin=@vin, description=@description, status=@status, featured=@featured,
    source_url=@source_url, images=@images, updated_at=datetime('now') WHERE id=@id`).run(car);
  res.redirect('/admin');
});

app.post('/admin/auta/:id/usun', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM cars WHERE id = ?').run(req.params.id);
  res.redirect('/admin');
});

// --- Import z Otomoto ---
app.get('/admin/import', requireAdmin, (req, res) => {
  res.render('admin/import', { adminName: req.session.adminName, result: null, error: null });
});

app.post('/admin/import', requireAdmin, async (req, res) => {
  const url = (req.body.url || '').trim();
  const render = (data) => res.render('admin/import', { adminName: req.session.adminName, result: null, error: null, ...data });
  if (!/^https?:\/\/([a-z0-9-]+\.)*otomoto\.pl\//i.test(url)) {
    return render({ error: 'Podaj poprawny adres z domeny otomoto.pl' });
  }
  try {
    const isListing = /\/oferta\//.test(url);
    if (isListing) {
      const car = await scrapeOtomotoListing(url);
      const inserted = db.prepare(`INSERT INTO cars (title, brand, model, year, price, currency, mileage, fuel, transmission, power, engine_capacity, body_type, color, vin, description, source_url, images)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(car.title, car.brand || null, car.model || null, car.year || null, car.price || null, car.currency,
          car.mileage || null, car.fuel || null, car.transmission || null, car.power || null, car.engine_capacity || null,
          car.body_type || null, car.color || null, car.vin || null, car.description || '', url, JSON.stringify(car.images || []));
      return render({ result: { type: 'listing', car, id: inserted.lastInsertRowid } });
    }
    const links = await scrapeOtomotoInventory(url);
    if (!links.length) return render({ error: 'Nie znaleziono ogłoszeń na tej stronie. Podaj bezpośredni link do ogłoszenia lub profilu dealera na Otomoto.' });
    const results = { imported: [], failed: [] };
    for (const link of links.slice(0, 20)) {
      if (db.prepare('SELECT id FROM cars WHERE source_url = ?').get(link)) continue;
      try {
        const car = await scrapeOtomotoListing(link);
        db.prepare(`INSERT INTO cars (title, brand, model, year, price, currency, mileage, fuel, transmission, power, engine_capacity, body_type, color, vin, description, source_url, images)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(car.title, car.brand || null, car.model || null, car.year || null, car.price || null, car.currency,
            car.mileage || null, car.fuel || null, car.transmission || null, car.power || null, car.engine_capacity || null,
            car.body_type || null, car.color || null, car.vin || null, car.description || '', link, JSON.stringify(car.images || []));
        results.imported.push(car.title);
      } catch (e) {
        results.failed.push(link);
      }
    }
    return render({ result: { type: 'inventory', ...results, total: links.length } });
  } catch (e) {
    return render({ error: `Import nie powiódł się: ${e.message}` });
  }
});

// --- Wiadomości z formularza kontaktowego ---
app.get('/admin/wiadomosci', requireAdmin, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, c.title AS car_title FROM contact_messages m
    LEFT JOIN cars c ON c.id = m.car_id
    ORDER BY m.created_at DESC`).all();
  db.prepare('UPDATE contact_messages SET is_read = 1').run();
  res.render('admin/messages', { messages, adminName: req.session.adminName });
});

app.post('/admin/wiadomosci/:id/usun', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
  res.redirect('/admin/wiadomosci');
});

// --- Live chat (konsola admina) ---
app.get('/admin/chat', requireAdmin, (req, res) => {
  const sessions = db.prepare(`
    SELECT s.*,
      (SELECT body FROM chat_messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id AND sender = 'visitor' AND is_read = 0) AS unread
    FROM chat_sessions s ORDER BY s.last_activity DESC`).all();
  res.render('admin/chat', { sessions, adminName: req.session.adminName });
});

app.get('/admin/chat/:sessionId/messages', requireAdmin, (req, res) => {
  const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').all(req.params.sessionId);
  db.prepare(`UPDATE chat_messages SET is_read = 1 WHERE session_id = ? AND sender = 'visitor'`).run(req.params.sessionId);
  res.json(messages);
});

// =====================================================================
// Live chat — Socket.io
// =====================================================================

io.on('connection', (socket) => {
  const sess = socket.request.session;
  const isAdmin = !!(sess && sess.adminId);

  if (isAdmin) socket.join('admins');

  socket.on('chat:join', ({ sessionId, name }) => {
    let id = sessionId;
    const exists = id && db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id);
    if (!exists) {
      id = crypto.randomUUID();
      db.prepare('INSERT INTO chat_sessions (id, visitor_name) VALUES (?, ?)').run(id, (name || 'Gość').slice(0, 60));
    }
    socket.join(`chat:${id}`);
    socket.data.chatSessionId = id;
    const history = db.prepare('SELECT sender, body, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 100').all(id);
    socket.emit('chat:joined', { sessionId: id, history });
  });

  socket.on('chat:message', ({ sessionId, body }) => {
    body = String(body || '').trim().slice(0, 2000);
    if (!body) return;
    const id = isAdmin ? sessionId : socket.data.chatSessionId;
    if (!id || !db.prepare('SELECT id FROM chat_sessions WHERE id = ?').get(id)) return;
    const sender = isAdmin ? 'admin' : 'visitor';
    db.prepare('INSERT INTO chat_messages (session_id, sender, body, is_read) VALUES (?, ?, ?, ?)').run(id, sender, body, isAdmin ? 1 : 0);
    db.prepare(`UPDATE chat_sessions SET last_activity = datetime('now') WHERE id = ?`).run(id);
    const payload = { sessionId: id, sender, body, created_at: new Date().toISOString() };
    io.to(`chat:${id}`).emit('chat:message', payload);
    io.to('admins').emit('admin:chat-activity', payload);
  });

  socket.on('admin:watch', ({ sessionId }) => {
    if (!isAdmin) return;
    socket.join(`chat:${sessionId}`);
  });
});

// =====================================================================

app.use((req, res) => res.status(404).render('404', { page: null }));

server.listen(PORT, () => {
  console.log(`Level Auto działa na http://localhost:${PORT}`);
  console.log(`Panel administratora: http://localhost:${PORT}/admin`);
});
