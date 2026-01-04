# Nginx Subdomain Setup voor Jukobot

Deze guide helpt je om subdomains te configureren:
- `jukobot.nl` → Landing page
- `app.jukobot.nl` → Dashboard/App

## Stap 1: DNS Configuratie

Zorg dat beide subdomains naar je server IP wijzen:

```
A Record: jukobot.nl → YOUR_SERVER_IP
A Record: app.jukobot.nl → YOUR_SERVER_IP
```

## Stap 2: Nginx Installatie

```bash
sudo apt update
sudo apt install nginx -y
```

## Stap 3: Nginx Configuratie

Kopieer de `nginx.conf` naar je server:

```bash
# Op je server
sudo nano /etc/nginx/sites-available/jukobot
```

Plak de inhoud van `nginx.conf` in dit bestand.

**BELANGRIJK:** Pas de volgende regels aan als je poorten anders zijn:
- `proxy_pass http://localhost:3000;` - Next.js poort
- `proxy_pass http://localhost:8000;` - Python API poort

## Stap 4: Activeer Configuratie

```bash
# Verwijder default config (optioneel)
sudo rm /etc/nginx/sites-enabled/default

# Activeer jukobot config
sudo ln -s /etc/nginx/sites-available/jukobot /etc/nginx/sites-enabled/

# Test configuratie
sudo nginx -t

# Herstart Nginx
sudo systemctl restart nginx
```

## Stap 5: SSL Certificaat (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL voor beide subdomains
sudo certbot --nginx -d jukobot.nl -d www.jukobot.nl -d app.jukobot.nl

# Auto-renewal is automatisch geconfigureerd
```

Na SSL setup, uncomment de HTTPS server blocks in de nginx.conf.

## Stap 6: Environment Variables Aanpassen

Update je `.env` bestand:

```env
# Site URL - gebruik het juiste subdomain
NEXT_PUBLIC_SITE_URL=https://jukobot.nl

# CORS - voeg beide subdomains toe
ALLOWED_ORIGINS=https://jukobot.nl,https://www.jukobot.nl,https://app.jukobot.nl
```

## Stap 7: Herstart Containers

```bash
cd /var/www/docubot-assistant
docker compose restart nextjs-frontend
```

## Testen

1. **Landing page:** `http://jukobot.nl` → Moet landing page tonen
2. **Dashboard redirect:** `http://jukobot.nl/dashboard` → Moet redirecten naar `http://app.jukobot.nl/dashboard`
3. **App subdomain:** `http://app.jukobot.nl/dashboard` → Moet dashboard tonen
4. **Homepage redirect:** `http://app.jukobot.nl/` → Moet redirecten naar `http://jukobot.nl`

## Troubleshooting

### Nginx test faalt
```bash
# Check syntax
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log
```

### Redirects werken niet
- Check of middleware.ts correct is geüpload
- Check browser console voor errors
- Verify dat beide subdomains naar dezelfde server wijzen

### SSL certificaat problemen
```bash
# Renew certificaat
sudo certbot renew

# Check certificaat status
sudo certbot certificates
```

## Firewall

Zorg dat poorten open zijn:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

