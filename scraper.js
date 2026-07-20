const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9' },
    redirect: 'follow'
  });
  if (!res.ok) throw new Error(`Otomoto zwróciło status ${res.status}`);
  return res.text();
}

function deepFind(obj, predicate, depth = 0) {
  if (depth > 12 || obj === null || typeof obj !== 'object') return null;
  if (predicate(obj)) return obj;
  for (const key of Object.keys(obj)) {
    const found = deepFind(obj[key], predicate, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseNumber(val) {
  if (val === undefined || val === null) return null;
  const n = parseInt(String(val).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parsuje pojedyncze ogłoszenie Otomoto (https://www.otomoto.pl/osobowe/oferta/...).
 * Najpierw próbuje danych __NEXT_DATA__ / JSON-LD, potem meta tagów OpenGraph.
 */
async function scrapeOtomotoListing(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const car = { source_url: url, images: [], currency: 'PLN' };

  // 1) __NEXT_DATA__ (Otomoto jest aplikacją Next.js)
  const nextData = $('#__NEXT_DATA__').html();
  if (nextData) {
    try {
      const json = JSON.parse(nextData);
      const advert = deepFind(json, (o) => o && o.title && (o.price || o.parametersDict || o.images));
      if (advert) {
        car.title = advert.title || car.title;
        car.description = (advert.description || '').replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim() || car.description;
        const price = advert.price;
        if (price) {
          car.price = parseNumber(price.value ?? price.amount ?? price);
          car.currency = price.currency || car.currency;
        }
        const imgs = advert.images || advert.photos;
        if (Array.isArray(imgs)) {
          car.images = imgs.map(i => i.url || i.large || i.medium || i.x || (typeof i === 'string' ? i : null)).filter(Boolean).slice(0, 15);
        }
        const params = advert.parametersDict || advert.details || {};
        const getParam = (key) => {
          const p = deepFind(params, (o) => o && (o.key === key || o.id === key));
          if (!p) return null;
          const v = p.value ?? p.values;
          if (Array.isArray(v)) return v[0] && (v[0].label ?? v[0].value ?? v[0]);
          return v && (v.label ?? v.value ?? v);
        };
        car.brand = getParam('make') || car.brand;
        car.model = getParam('model') || car.model;
        car.year = parseNumber(getParam('year')) || car.year;
        car.mileage = parseNumber(getParam('mileage')) || car.mileage;
        car.fuel = getParam('fuel_type') || car.fuel;
        car.transmission = getParam('gearbox') || car.transmission;
        car.power = parseNumber(getParam('engine_power')) || car.power;
        car.engine_capacity = parseNumber(getParam('engine_capacity')) || car.engine_capacity;
        car.body_type = getParam('body_type') || car.body_type;
        car.color = getParam('color') || car.color;
        car.vin = getParam('vin') || car.vin;
      }
    } catch (_) { /* przechodzimy do fallbacków */ }
  }

  // 2) JSON-LD
  if (!car.title || !car.price) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Car' || item['@type'] === 'Vehicle' || item['@type'] === 'Product') {
            car.title = car.title || item.name;
            car.description = car.description || item.description;
            if (item.offers) car.price = car.price || parseNumber(item.offers.price);
            if (item.image) {
              const imgs = Array.isArray(item.image) ? item.image : [item.image];
              if (!car.images.length) car.images = imgs.slice(0, 15);
            }
            car.brand = car.brand || (item.brand && (item.brand.name || item.brand));
            car.year = car.year || parseNumber(item.vehicleModelDate || item.productionDate);
            if (item.mileageFromOdometer) car.mileage = car.mileage || parseNumber(item.mileageFromOdometer.value);
          }
        }
      } catch (_) { /* ignoruj błędny blok */ }
    });
  }

  // 3) Meta tagi OpenGraph
  car.title = car.title || $('meta[property="og:title"]').attr('content') || $('title').text().trim();
  car.description = car.description || $('meta[property="og:description"]').attr('content') || '';
  if (!car.images.length) {
    const og = $('meta[property="og:image"]').attr('content');
    if (og) car.images = [og];
  }
  if (!car.price) {
    const m = html.match(/(\d[\d\s.,]{3,12})\s*(?:PLN|zł)/i);
    if (m) car.price = parseNumber(m[1]);
  }

  if (!car.title) throw new Error('Nie udało się odczytać danych ogłoszenia — sprawdź adres URL');
  return car;
}

/**
 * Parsuje stronę z listą ogłoszeń (profil dealera na Otomoto lub wyniki wyszukiwania)
 * i zwraca listę adresów URL pojedynczych ogłoszeń.
 */
async function scrapeOtomotoInventory(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const links = new Set();
  $('a[href*="/oferta/"]').each((_, el) => {
    let href = $(el).attr('href');
    if (!href) return;
    if (href.startsWith('/')) href = new URL(href, url).toString();
    if (/otomoto\.pl\/.*\/oferta\//.test(href) || /otomoto\.pl\/oferta\//.test(href)) {
      links.add(href.split('?')[0].split('#')[0]);
    }
  });
  return [...links];
}

module.exports = { scrapeOtomotoListing, scrapeOtomotoInventory };
