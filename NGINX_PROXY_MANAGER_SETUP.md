# Nginx Proxy Manager Setup voor Jukobot Subdomains

Je gebruikt Nginx Proxy Manager (web interface). Hier is hoe je de subdomains configureert:

## Huidige Situatie

Je hebt al:
- `jukobot.nl` → `http://45.9.191.219:3000` ✅

## Stap 1: Voeg `app.jukobot.nl` Proxy Host toe

1. **Ga naar Nginx Proxy Manager interface**
2. **Klik op "Add Proxy Host"**
3. **Vul in:**

### Details Tab:
- **Domain Names:** `app.jukobot.nl`
- **Scheme:** `http`
- **Forward Hostname/IP:** `45.9.191.219` (of gebruik de container naam als die beschikbaar is)
- **Forward Port:** `3000`
- **Cache Assets:** ✅ (optioneel)
- **Block Common Exploits:** ✅
- **Websockets Support:** ✅ (belangrijk voor Next.js)

### SSL Tab:
- **SSL Certificate:** Selecteer "Request a new SSL Certificate"
- **Force SSL:** ✅
- **HTTP/2 Support:** ✅
- **HSTS Enabled:** ✅ (optioneel maar aanbevolen)
- **HSTS Subdomains:** ✅ (als je meerdere subdomains hebt)

4. **Klik "Save"**

## Stap 2: Update `jukobot.nl` Proxy Host

1. **Klik op de bestaande `jukobot.nl` entry**
2. **Klik "Edit"**
3. **Zorg dat deze instellingen correct zijn:**
   - **Domain Names:** `jukobot.nl, www.jukobot.nl`
   - **Forward Hostname/IP:** `45.9.191.219`
   - **Forward Port:** `3000`
   - **Websockets Support:** ✅

4. **SSL Tab:**
   - Zorg dat SSL certificaat actief is
   - **Force SSL:** ✅

5. **Klik "Save"**

## Stap 3: Verifieer Middleware

Zorg dat `src/middleware.ts` op je server staat en actief is. Deze zorgt voor:
- Redirect van `jukobot.nl/dashboard` → `app.jukobot.nl/dashboard`
- Redirect van `app.jukobot.nl/` → `jukobot.nl`

## Stap 4: Test de Configuratie

1. **Landing page:** `https://jukobot.nl` → Moet landing page tonen
2. **Dashboard redirect:** `https://jukobot.nl/dashboard` → Moet redirecten naar `https://app.jukobot.nl/dashboard`
3. **App subdomain:** `https://app.jukobot.nl/dashboard` → Moet dashboard tonen
4. **Homepage redirect:** `https://app.jukobot.nl/` → Moet redirecten naar `https://jukobot.nl`

## Belangrijke Opmerkingen

- **Beide subdomains wijzen naar dezelfde Next.js container** (poort 3000)
- **De middleware in Next.js** handelt de routing en redirects af
- **SSL certificaten** worden automatisch aangevraagd via Let's Encrypt in Nginx Proxy Manager

## Troubleshooting

### Redirects werken niet
- Check of `middleware.ts` correct is geüpload naar de server
- Check browser console voor errors
- Verify dat beide proxy hosts actief zijn (Status: Online)

### SSL certificaat problemen
- In Nginx Proxy Manager: SSL Tab → "Request a new SSL Certificate"
- Wacht even tot Let's Encrypt het certificaat heeft uitgegeven
- Check logs in Nginx Proxy Manager voor SSL errors

### Container naam gebruiken (optioneel)
Als je Docker containers gebruikt, kun je in plaats van IP adres ook de container naam gebruiken:
- **Forward Hostname/IP:** `docubot-nextjs` (of je container naam)
- Dit werkt alleen als Nginx Proxy Manager in hetzelfde Docker network zit

## Environment Variables

Update je `.env` bestand op de server:

```env
NEXT_PUBLIC_SITE_URL=https://jukobot.nl
ALLOWED_ORIGINS=https://jukobot.nl,https://www.jukobot.nl,https://app.jukobot.nl
```

Herstart daarna de Next.js container:
```bash
docker compose restart nextjs-frontend
```

