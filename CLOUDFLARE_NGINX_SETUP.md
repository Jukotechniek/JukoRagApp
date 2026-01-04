# Cloudflare + Nginx Proxy Manager Setup

Je hebt al:
- ✅ Cloudflare DNS: `app.jukobot.nl` → `45.9.191.219` (Proxied)
- ✅ Nginx Proxy Manager: `app.jukobot.nl` → `http://45.9.191.219:3000` (Online, SSL)

## Belangrijk: Cloudflare SSL/TLS Mode

**Dit is cruciaal voor het werkend krijgen van `app.jukobot.nl`:**

1. **Ga naar Cloudflare Dashboard**
2. **Selecteer `jukobot.nl`**
3. **Ga naar SSL/TLS → Overview**
4. **Zet SSL/TLS encryption mode op: "Full" of "Full (strict)"**

   **NIET "Flexible"** - dit veroorzaakt SSL errors!

### SSL/TLS Modes uitleg:
- **Flexible:** ❌ Cloudflare → HTTP → Server (werkt niet met Nginx Proxy Manager SSL)
- **Full:** ✅ Cloudflare → HTTPS → Server (werkt, accepteert self-signed certs)
- **Full (strict):** ✅✅ Cloudflare → HTTPS → Server (best, vereist geldig certificaat)

## Nginx Proxy Manager Configuratie Check

In Nginx Proxy Manager, check de `app.jukobot.nl` proxy host:

### Details Tab:
- ✅ Domain Names: `app.jukobot.nl`
- ✅ Forward Hostname/IP: `45.9.191.219`
- ✅ Forward Port: `3000`
- ✅ **Websockets Support: AAN** (belangrijk!)

### SSL Tab:
- ✅ SSL Certificate: Let's Encrypt (moet actief zijn)
- ✅ Force SSL: AAN
- ✅ HTTP/2 Support: AAN

### Advanced Tab (optioneel):
Als je custom headers nodig hebt voor Cloudflare:

```nginx
# Custom Nginx config (optioneel)
proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
proxy_set_header CF-Ray $http_cf_ray;
```

## Test Stappen

1. **Check Cloudflare SSL mode:**
   - Moet "Full" of "Full (strict)" zijn
   - NIET "Flexible"

2. **Test de verbinding:**
   ```bash
   # Vanaf je server
   curl -I https://app.jukobot.nl
   # Moet HTTP 200 of redirect teruggeven
   ```

3. **Check browser:**
   - Ga naar `https://app.jukobot.nl/dashboard`
   - Moet dashboard tonen (niet timeout)

## Veelvoorkomende Problemen

### Probleem: ERR_CONNECTION_TIMED_OUT
**Oplossing:**
- Check Cloudflare SSL mode (moet "Full" zijn)
- Check of Nginx Proxy Manager proxy host "Online" is
- Check of Next.js container draait: `docker compose ps`

### Probleem: SSL Certificate Error
**Oplossing:**
- In Nginx Proxy Manager: SSL Tab → "Request a new SSL Certificate"
- Wacht 2-5 minuten
- Check Cloudflare SSL mode (moet "Full" of "Full (strict)" zijn)

### Probleem: Redirects werken niet
**Oplossing:**
- Zorg dat `src/middleware.ts` op de server staat
- Herstart Next.js container: `docker compose restart nextjs-frontend`
- Check browser console voor errors

## Cloudflare Settings Checklist

- [ ] SSL/TLS encryption mode: **Full** of **Full (strict)**
- [ ] Always Use HTTPS: **AAN** (optioneel maar aanbevolen)
- [ ] Automatic HTTPS Rewrites: **AAN** (optioneel)
- [ ] Minimum TLS Version: **1.2** (standaard)

## Nginx Proxy Manager Checklist

- [ ] Proxy host `app.jukobot.nl` bestaat
- [ ] Status: **Online** (groen bolletje)
- [ ] Forward naar: `45.9.191.219:3000`
- [ ] Websockets Support: **AAN**
- [ ] SSL Certificate: **Let's Encrypt** (actief)
- [ ] Force SSL: **AAN**

## Test Commands

```bash
# Test DNS (moet Cloudflare IPs teruggeven)
nslookup app.jukobot.nl

# Test directe server verbinding
curl http://45.9.191.219:3000

# Test via HTTPS
curl -I https://app.jukobot.nl

# Check container status
docker compose ps
```

## Na Configuratie

1. **Wacht 2-5 minuten** voor DNS/SSL propagatie
2. **Test in browser:** `https://app.jukobot.nl/dashboard`
3. **Check logs in Nginx Proxy Manager** als het nog niet werkt


