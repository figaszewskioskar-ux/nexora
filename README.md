# Level Auto — strona dealera z importem aut z USA i Kanady

Kompletna strona firmowa wzorowana na serwisach importerów aut zza oceanu:
landing page, zakładka **Auta na sprzedaż**, import ogłoszeń z **Otomoto**,
**panel administratora** z logowaniem, **live chat** oraz **formularz kontaktowy**.

## Uruchomienie

```bash
npm install
npm start
```

- Strona: http://localhost:3000
- Panel administratora: http://localhost:3000/admin

### Dane logowania administratora

Konto tworzone jest przy pierwszym uruchomieniu:

- login: `admin`, hasło: `admin123`

**Zmień je przed wdrożeniem produkcyjnym** — ustaw zmienne środowiskowe przy
pierwszym starcie (zanim powstanie plik bazy `data/levelauto.db`):

```bash
ADMIN_USER=twojlogin ADMIN_PASSWORD=silne-haslo npm start
```

### Zmienne środowiskowe

| Zmienna | Opis | Domyślnie |
|---|---|---|
| `PORT` | Port serwera | `3000` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | Konto admina (tylko pierwszy start) | `admin` / `admin123` |
| `SESSION_SECRET` | Sekret sesji (ustaw na produkcji!) | losowy przy starcie |
| `CONTACT_EMAIL` | E-mail w stopce i sekcji kontakt | `contact@sellora.store` |
| `CONTACT_PHONE` | Telefon kontaktowy | `+48 22 103 12 46` |
| `CONTACT_ADDRESS` | Adres placu z autami | `ul. Puławska 504, Warszawa` |

## Funkcje

### Strona publiczna
- Strona główna: hero, „Jak działamy" (aukcje Copart/IAAI → licytacja → transport → odbiór), baner „auta od ręki", „Dlaczego my", opinie, wyróżnione auta, kontakt.
- `/auta` — **Auta na sprzedaż** (oferta importowa) z wyszukiwarką, filtrami (marka, paliwo) i sortowaniem.
- `/gotowe` — **Auta od ręki** — osobna zakładka z autami już sprowadzonymi, gotowymi do odbioru (oznaczone zielonym znaczkiem „Od ręki").
- `/auta/:id` — karta auta: galeria zdjęć, dane techniczne, opis, link do Otomoto, formularz zapytania o konkretne auto.
- Formularz kontaktowy — wiadomości trafiają do panelu admina (zakładka „Wiadomości").
- Live chat (Socket.io) — pływający widget na każdej stronie; rozmowa zapisywana w bazie, historia utrzymywana w `localStorage`.

### Panel administratora (`/admin`)
- Logowanie (hasła hashowane bcrypt, sesje po stronie serwera).
- Ogłoszenia: dodawanie, edycja, usuwanie, statusy (dostępny / zarezerwowany / sprzedany), wyróżnianie na stronie głównej.
- Dwie kategorie ogłoszeń: **Auta od ręki** (już sprowadzone) i **Auta na sprzedaż** (oferta importowa) — osobna zakładka „Dodaj gotowe auto" w menu panelu; kategorię można też zmienić przy edycji i wybrać przy imporcie z Otomoto.
- Zdjęcia: upload plików lub adresy URL; zarządzanie zdjęciami przy edycji.
- **Import z Otomoto**: wklej link do pojedynczego ogłoszenia (`/oferta/...`) albo profilu dealera — pobierane są tytuł, cena, opis, zdjęcia i dane techniczne (`__NEXT_DATA__` → JSON-LD → meta tagi). Duplikaty (ten sam URL) są pomijane.
- Wiadomości z formularza kontaktowego (z powiązaniem z autem, którego dotyczą).
- Konsola live chatu: lista rozmów, liczniki nieprzeczytanych, odpowiadanie w czasie rzeczywistym.

## Stos techniczny

Node.js + Express, EJS (szablony), better-sqlite3 (baza w pliku `data/levelauto.db`),
Socket.io (live chat), cheerio (parser Otomoto), multer (upload zdjęć),
bcryptjs + express-session (logowanie).

## Uwagi

- Przy pierwszym starcie baza jest zasiewana 6 przykładowymi ogłoszeniami (z placeholderowymi grafikami SVG) — usuń je w panelu admina i dodaj własne lub zaimportuj z Otomoto.
- Otomoto potrafi blokować automatyczne pobieranie (zabezpieczenia anty-bot). Import jest realizowany "best effort" — gdy się nie powiedzie, dodaj ogłoszenie ręcznie (możesz wkleić adresy zdjęć).
